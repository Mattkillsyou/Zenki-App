/**
 * Drug & peptide search service.
 *
 * Sources:
 *   - Local PEPTIDE_DATABASE (instant, prioritized)
 *   - NIH RxNorm REST API (free, no key) — prescription/OTC drugs
 *
 * Search is debounced + cached in-memory. Falls back gracefully on network
 * errors so the user always sees at least the local peptide matches.
 */

import { DrugSearchResult, MedicationCategory } from '../types/medication';
import { PEPTIDE_DATABASE, searchPeptides } from '../data/peptides';

const RXNORM_BASE = 'https://rxnav.nlm.nih.gov/REST';

// ─────────────────────────────────────────────────
// In-memory cache (keyed by lowercase query)
// Reduces API calls when the user is typing/erasing.
// ─────────────────────────────────────────────────
interface CacheEntry {
  results: DrugSearchResult[];
  timestamp: number;
}
const SEARCH_CACHE = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ─────────────────────────────────────────────────
// RxNorm response types
// ─────────────────────────────────────────────────
interface ApproxCandidate {
  rxcui: string;
  name?: string;
  score?: string;
  rank?: string;
}

interface ApproxResponse {
  approximateGroup?: {
    candidate?: ApproxCandidate[];
  };
}

interface DrugsResponse {
  drugGroup?: {
    conceptGroup?: Array<{
      tty?: string;
      conceptProperties?: Array<{
        rxcui?: string;
        name?: string;
        synonym?: string;
        tty?: string;
      }>;
    }>;
  };
}

// ─────────────────────────────────────────────────
// Heuristics: classify an RxNorm result into a MedicationCategory
// ─────────────────────────────────────────────────
function classifyDrug(name: string): MedicationCategory {
  const n = name.toLowerCase();

  // Common OTC keywords
  const otcKeywords = [
    'aspirin', 'acetaminophen', 'ibuprofen', 'naproxen', 'tylenol',
    'advil', 'aleve', 'motrin', 'benadryl', 'claritin', 'zyrtec',
    'pepto', 'tums', 'mylanta', 'pepcid', 'prilosec', 'zantac',
    'sudafed', 'mucinex', 'robitussin', 'dayquil', 'nyquil',
    'melatonin', 'caffeine',
  ];

  // Vitamin/mineral keywords
  const vitaminKeywords = [
    'vitamin', 'biotin', 'folate', 'folic acid', 'niacin',
    'thiamine', 'riboflavin', 'cyanocobalamin', 'ascorbic',
    'cholecalciferol', 'ergocalciferol', 'pyridoxine', 'tocopherol',
    'magnesium', 'calcium', 'zinc', 'iron', 'potassium', 'selenium',
    'iodine', 'chromium',
  ];

  // Supplement keywords
  const supplementKeywords = [
    'fish oil', 'omega', 'creatine', 'glucosamine', 'chondroitin',
    'turmeric', 'curcumin', 'probiotic', 'collagen', 'whey',
    'protein powder', 'coq10', 'ubiquinol', 'resveratrol',
    'ashwagandha', 'rhodiola', 'milk thistle',
  ];

  if (vitaminKeywords.some((k) => n.includes(k))) return 'vitamin';
  if (supplementKeywords.some((k) => n.includes(k))) return 'supplement';
  if (otcKeywords.some((k) => n.includes(k))) return 'otc';

  return 'prescription';
}

/**
 * Strip dosage form suffixes from RxNorm names so "Lisinopril 10 MG Oral Tablet"
 * becomes "Lisinopril 10 MG".
 */
function cleanRxNormName(raw: string): string {
  if (!raw) return raw;
  return raw
    .replace(/\s*\[.*?\]\s*$/g, '')          // strip brand bracket suffix
    .replace(/\s+Oral\s+(Tablet|Capsule|Solution|Suspension|Liquid).*$/i, '')
    .replace(/\s+(Injectable|Injection|Topical|Patch|Nasal|Spray)\s.*$/i, '')
    .trim();
}

/**
 * Approximate term search via RxNorm.
 */
async function rxnormApproxSearch(query: string): Promise<DrugSearchResult[]> {
  const url = `${RXNORM_BASE}/approximateTerm.json?term=${encodeURIComponent(query)}&maxEntries=15`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return [];
    const data: ApproxResponse = await resp.json();
    const candidates = data.approximateGroup?.candidate ?? [];

    // De-dupe by rxcui (the API returns multiple ranks for the same concept)
    const seen = new Set<string>();
    const out: DrugSearchResult[] = [];
    for (const c of candidates) {
      if (!c.rxcui || seen.has(c.rxcui)) continue;
      seen.add(c.rxcui);
      const name = cleanRxNormName(c.name ?? '');
      if (!name) continue;
      out.push({
        externalId: c.rxcui,
        name,
        category: classifyDrug(name),
        defaultRoute: 'oral',
        defaultDoseUnit: 'mg',
      });
    }
    return out;
  } catch (err) {
    console.warn('[drugSearch] RxNorm approxSearch failed:', err);
    return [];
  }
}

/**
 * Exact-name search via RxNorm /drugs.json — used as a complementary lookup.
 */
async function rxnormDrugsSearch(query: string): Promise<DrugSearchResult[]> {
  const url = `${RXNORM_BASE}/drugs.json?name=${encodeURIComponent(query)}`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return [];
    const data: DrugsResponse = await resp.json();
    const groups = data.drugGroup?.conceptGroup ?? [];

    const out: DrugSearchResult[] = [];
    const seen = new Set<string>();
    for (const g of groups) {
      // Skip ingredient-only groups
      const tty = g.tty ?? '';
      if (!['SCD', 'SBD', 'BN', 'IN'].includes(tty)) continue;
      for (const cp of g.conceptProperties ?? []) {
        if (!cp.rxcui || seen.has(cp.rxcui)) continue;
        seen.add(cp.rxcui);
        const name = cleanRxNormName(cp.name ?? '');
        if (!name) continue;
        out.push({
          externalId: cp.rxcui,
          name,
          brandName: tty === 'SBD' || tty === 'BN' ? cp.synonym : undefined,
          category: classifyDrug(name),
          defaultRoute: 'oral',
          defaultDoseUnit: 'mg',
        });
      }
    }
    return out;
  } catch (err) {
    console.warn('[drugSearch] RxNorm drugsSearch failed:', err);
    return [];
  }
}

/**
 * Search RxNorm prescription/OTC drugs only (used internally).
 */
export async function searchDrugs(query: string): Promise<DrugSearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  // Prefer approximate (fuzzy) — works well for typos
  const approx = await rxnormApproxSearch(q);
  if (approx.length > 0) return approx;

  // Fallback to exact match
  return rxnormDrugsSearch(q);
}

/**
 * Unified search: local peptides first, then RxNorm. De-duped + cached.
 *
 * @param query  user-typed term
 * @returns      ordered list — peptide matches at top
 */
export async function searchMedications(query: string): Promise<DrugSearchResult[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  // Cache check
  const cached = SEARCH_CACHE.get(q);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.results;
  }

  // Local peptides — instant
  const peptideResults = searchPeptides(q);

  // RxNorm — network
  const rxnormResults = await searchDrugs(q);

  // Merge — peptides first, then RxNorm (de-dupe by externalId + name)
  const seen = new Set<string>();
  const merged: DrugSearchResult[] = [];
  for (const r of [...peptideResults, ...rxnormResults]) {
    const key = `${r.externalId}|${r.name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(r);
  }

  // Cap at 25 results to keep the dropdown manageable
  const capped = merged.slice(0, 25);

  SEARCH_CACHE.set(q, { results: capped, timestamp: Date.now() });
  return capped;
}

/**
 * Look up additional details for an RxNorm rxcui (route, available strengths).
 * Best-effort — returns null on failure.
 */
export async function getDrugProperties(rxcui: string): Promise<{
  name?: string;
  synonym?: string;
} | null> {
  try {
    const resp = await fetch(`${RXNORM_BASE}/rxcui/${rxcui}/properties.json`);
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.properties ?? null;
  } catch {
    return null;
  }
}

/**
 * For tests / debug — flush the in-memory cache.
 */
export function clearSearchCache(): void {
  SEARCH_CACHE.clear();
}

/**
 * Quick-pick presets shown when the search box is empty.
 */
export function getPopularResults(): DrugSearchResult[] {
  // Top 8 most-searched peptides (curated)
  const ids = [
    'pep_bpc157',
    'pep_semaglutide',
    'pep_tirzepatide',
    'pep_ipamorelin',
    'pep_cjc1295',
    'pep_pt141',
    'pep_tb500',
    'pep_mk677',
  ];
  return PEPTIDE_DATABASE
    .filter((p) => ids.includes(p.externalId))
    .map((p) => ({
      externalId: p.externalId,
      name: p.name,
      category: p.category as MedicationCategory,
      defaultRoute: p.defaultRoute,
      defaultDoseUnit: p.defaultDoseUnit,
    }));
}
