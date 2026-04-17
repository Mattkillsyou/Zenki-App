/**
 * Normalized food-search results from multiple providers.
 * Both USDA FoodData Central and Open Food Facts return very different
 * shapes — this type is the common denominator the UI consumes.
 */

export type FoodSource = 'usda' | 'off' | 'custom';

export interface FoodMacros {
  /** Values per the serving described in `serving`. */
  calories: number;
  protein: number;  // grams
  carbs: number;    // grams
  fat: number;      // grams
}

export interface FoodServing {
  /** e.g. "100g", "1 cup (240g)", "1 bar (40g)" */
  label: string;
  /** Grams represented by this serving, when known. Used for ratio scaling. */
  grams?: number;
}

export interface FoodSearchResult {
  id: string;            // stable, prefixed with source (usda_..., off_...)
  name: string;          // display name
  brand?: string;        // brand when available (OFF / branded USDA)
  source: FoodSource;
  serving: FoodServing;  // canonical serving the macros are for
  macros: FoodMacros;
  /** Per-100g macros — always populated so we can scale to any serving. */
  macrosPer100g: FoodMacros;
}
