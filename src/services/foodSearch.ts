/**
 * Unified food search — queries USDA FoodData Central + Open Food Facts in
 * parallel, normalizes results into a single FoodSearchResult shape, and
 * ranks by match quality.
 *
 * Network strategy:
 *  - 5-second timeout per provider
 *  - Failure in one provider never blocks the other
 *  - Results dedupe by normalized-name + brand
 */

import { FoodSearchResult, FoodMacros } from '../types/food';
import { USDA_API_KEY, USDA_BASE_URL, OFF_BASE_URL } from '../config/api';

const TIMEOUT_MS = 5000;

// ─────────────────────────────────────────────
// Public entrypoint
// ─────────────────────────────────────────────

export async function searchFoods(query: string, limit = 20): Promise<FoodSearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const [usda, off] = await Promise.all([
    searchUSDA(q, limit).catch(() => []),
    searchOFF(q, limit).catch(() => []),
  ]);

  // Merge & dedupe
  const combined: FoodSearchResult[] = [...usda, ...off];
  const seen = new Set<string>();
  const deduped: FoodSearchResult[] = [];
  for (const r of combined) {
    const key = `${normalize(r.name)}|${normalize(r.brand ?? '')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(r);
  }

  return rankResults(q, deduped).slice(0, limit);
}

/** Look up a single product by barcode (Open Food Facts). Returns null on miss. */
export async function lookupBarcode(barcode: string): Promise<FoodSearchResult | null> {
  try {
    const url = `${OFF_BASE_URL}/api/v2/product/${encodeURIComponent(barcode)}.json?fields=product_name,brands,nutriments,serving_size,serving_quantity`;
    const res = await fetchWithTimeout(url);
    const json = await res.json();
    if (json.status !== 1 || !json.product) return null;
    return offProductToResult(barcode, json.product);
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────
// USDA FoodData Central
// https://fdc.nal.usda.gov/api-guide/
// ─────────────────────────────────────────────

async function searchUSDA(query: string, limit: number): Promise<FoodSearchResult[]> {
  const url = `${USDA_BASE_URL}/foods/search?api_key=${USDA_API_KEY}&query=${encodeURIComponent(query)}&pageSize=${limit}&dataType=Foundation,SR%20Legacy,Branded`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) return [];
  const json = await res.json();
  const foods: any[] = Array.isArray(json.foods) ? json.foods : [];
  return foods.map(usdaFoodToResult).filter(Boolean) as FoodSearchResult[];
}

function usdaFoodToResult(food: any): FoodSearchResult | null {
  const id = food.fdcId;
  if (!id) return null;

  const per100g = extractUSDAMacrosPer100g(food);
  if (!per100g) return null;

  // Branded foods include a serving; fall back to 100g for Foundation/SR Legacy.
  const servingG: number | undefined =
    food.servingSize && food.servingSizeUnit?.toLowerCase() === 'g'
      ? food.servingSize
      : undefined;

  const serving = servingG
    ? { label: `${servingG}g`, grams: servingG }
    : { label: '100g', grams: 100 };

  const macros = scale(per100g, serving.grams ?? 100);

  const brand: string | undefined = food.brandName || food.brandOwner || undefined;

  return {
    id: `usda_${id}`,
    name: food.description || 'Unknown',
    brand,
    source: 'usda',
    serving,
    macros,
    macrosPer100g: per100g,
  };
}

function extractUSDAMacrosPer100g(food: any): FoodMacros | null {
  const nutrients: any[] = food.foodNutrients ?? [];
  const get = (...ids: number[]) => {
    for (const n of nutrients) {
      const nid = n.nutrientId ?? n.nutrient?.id;
      if (nid && ids.includes(nid)) {
        const val = n.value ?? n.amount;
        if (typeof val === 'number') return val;
      }
    }
    return 0;
  };
  // Nutrient IDs per USDA:
  // 1008 energy kcal | 1003 protein | 1005 carbs | 1004 fat (total lipid)
  // Newer dataset also uses 208/203/205/204 — try both.
  const calories = get(1008, 208);
  const protein = get(1003, 203);
  const carbs = get(1005, 205);
  const fat = get(1004, 204);
  if (calories === 0 && protein === 0 && carbs === 0 && fat === 0) return null;
  return { calories, protein, carbs, fat };
}

// ─────────────────────────────────────────────
// Open Food Facts
// https://openfoodfacts.github.io/openfoodfacts-server/api/
// ─────────────────────────────────────────────

async function searchOFF(query: string, limit: number): Promise<FoodSearchResult[]> {
  const url = `${OFF_BASE_URL}/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=${limit}&fields=code,product_name,brands,nutriments,serving_size,serving_quantity`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) return [];
  const json = await res.json();
  const products: any[] = Array.isArray(json.products) ? json.products : [];
  return products
    .map((p) => offProductToResult(p.code, p))
    .filter(Boolean) as FoodSearchResult[];
}

function offProductToResult(code: string | undefined, p: any): FoodSearchResult | null {
  if (!code) return null;
  const n = p.nutriments;
  if (!n) return null;

  // OFF stores macros per-100g under *_100g
  const per100g: FoodMacros = {
    calories: numeric(n['energy-kcal_100g'] ?? n['energy-kcal'] ?? (n['energy_100g'] ? n['energy_100g'] / 4.184 : 0)),
    protein: numeric(n.proteins_100g),
    carbs: numeric(n.carbohydrates_100g),
    fat: numeric(n.fat_100g),
  };
  if (per100g.calories === 0 && per100g.protein === 0 && per100g.carbs === 0 && per100g.fat === 0) {
    return null;
  }

  const servingGrams: number | undefined = typeof p.serving_quantity === 'number'
    ? p.serving_quantity
    : typeof p.serving_quantity === 'string'
      ? parseFloat(p.serving_quantity) || undefined
      : undefined;

  const servingLabel: string =
    (typeof p.serving_size === 'string' && p.serving_size.trim()) ||
    (servingGrams ? `${servingGrams}g` : '100g');

  const serving = { label: servingLabel, grams: servingGrams ?? 100 };
  const macros = scale(per100g, serving.grams ?? 100);

  return {
    id: `off_${code}`,
    name: (p.product_name || '').trim() || 'Unknown',
    brand: (p.brands || '').split(',')[0]?.trim() || undefined,
    source: 'off',
    serving,
    macros,
    macrosPer100g: per100g,
  };
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function scale(per100g: FoodMacros, grams: number): FoodMacros {
  const r = grams / 100;
  return {
    calories: Math.round(per100g.calories * r),
    protein: Math.round(per100g.protein * r * 10) / 10,
    carbs: Math.round(per100g.carbs * r * 10) / 10,
    fat: Math.round(per100g.fat * r * 10) / 10,
  };
}

export function scaleMacrosToGrams(per100g: FoodMacros, grams: number): FoodMacros {
  return scale(per100g, grams);
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function numeric(v: any): number {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

async function fetchWithTimeout(url: string, timeoutMs = TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ranks results by how well the name starts with / contains the query,
 * then by presence of macros, then by brand completeness.
 */
function rankResults(query: string, results: FoodSearchResult[]): FoodSearchResult[] {
  const q = query.toLowerCase();
  return [...results].sort((a, b) => {
    const score = (r: FoodSearchResult) => {
      const name = r.name.toLowerCase();
      let s = 0;
      if (name.startsWith(q)) s += 10;
      else if (name.includes(q)) s += 5;
      if (r.brand) s += 1;
      if (r.macros.calories > 0) s += 2;
      // Prefer USDA Foundation for whole foods, OFF for packaged — but
      // we have no easy way to distinguish here, so slight preference to USDA
      if (r.source === 'usda') s += 0.5;
      return s;
    };
    return score(b) - score(a);
  });
}
