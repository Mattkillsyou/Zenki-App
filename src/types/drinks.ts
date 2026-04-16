export interface DrinkEntry {
  id: string;
  type: DrinkType;
  price: number;
  timestamp: string; // ISO 8601
  date: string;      // YYYY-MM-DD
}

export type DrinkType = 'water' | 'protein' | 'electrolytes' | 'bcaa' | 'coffee' | 'energy';

export interface DrinkDefinition {
  type: DrinkType;
  label: string;
  icon: string; // Ionicons name
  color: string;
  price: number;
}

export interface MonthlySummary {
  month: string; // YYYY-MM
  label: string; // "April 2026"
  counts: Record<DrinkType, number>;  // quantity per type
  charges: Record<DrinkType, number>; // $ per type
  totalCount: number;
  totalCharge: number;
  dailyEntries: number; // days with at least 1 drink
}

export interface DrinkTrackerState {
  entries: DrinkEntry[];
}
