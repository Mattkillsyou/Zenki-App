/**
 * Curated reference data for common blood biomarkers.
 *
 * These are **fallback** reference ranges — we use them only when the lab
 * report itself doesn't include reference bounds. Real lab ranges vary slightly
 * by lab and patient demographics (age, sex, ethnicity). These are broadly
 * accepted ranges for adult males and females in the US.
 *
 * Not medical advice — always defer to values printed on the actual report.
 */

import { BiomarkerCategory } from '../types/bloodwork';

export interface BiomarkerReference {
  name: string;             // canonical (matches what the AI returns)
  displayName: string;
  unit: string;
  category: BiomarkerCategory;
  referenceLow?: number;
  referenceHigh?: number;
  /** Optional "optimal" band tighter than reference — Whoop-style "Optimal vs Sufficient". */
  optimalLow?: number;
  optimalHigh?: number;
  /** Short plain-language summary for the detail view. */
  description?: string;
}

export const BIOMARKER_REFS: Record<string, BiomarkerReference> = {
  // ─── CBC ─────────────────────────────────
  'WBC':        { name: 'WBC', displayName: 'White blood cells', unit: '10^3/µL', category: 'CBC', referenceLow: 4, referenceHigh: 11, description: 'Immune cells — infection / inflammation marker.' },
  'RBC':        { name: 'RBC', displayName: 'Red blood cells',   unit: '10^6/µL', category: 'CBC', referenceLow: 4.2, referenceHigh: 5.9 },
  'Hemoglobin': { name: 'Hemoglobin', displayName: 'Hemoglobin', unit: 'g/dL',    category: 'CBC', referenceLow: 13, referenceHigh: 17, description: 'Oxygen-carrying protein. Low = anemia risk.' },
  'Hematocrit': { name: 'Hematocrit', displayName: 'Hematocrit', unit: '%',       category: 'CBC', referenceLow: 38, referenceHigh: 50 },
  'Platelets':  { name: 'Platelets', displayName: 'Platelets',   unit: '10^3/µL', category: 'CBC', referenceLow: 150, referenceHigh: 400 },

  // ─── Lipid ───────────────────────────────
  'Total Cholesterol': { name: 'Total Cholesterol', displayName: 'Total cholesterol', unit: 'mg/dL', category: 'Lipid', referenceHigh: 200, optimalHigh: 180, description: 'Total of HDL + LDL + VLDL. Lower generally better.' },
  'HDL':          { name: 'HDL', displayName: 'HDL ("good")',  unit: 'mg/dL', category: 'Lipid', referenceLow: 40, optimalLow: 60, description: 'Protective cholesterol. Higher is better.' },
  'LDL':          { name: 'LDL', displayName: 'LDL ("bad")',   unit: 'mg/dL', category: 'Lipid', referenceHigh: 130, optimalHigh: 100, description: 'Atherogenic cholesterol. Lower is better.' },
  'Triglycerides':{ name: 'Triglycerides', displayName: 'Triglycerides', unit: 'mg/dL', category: 'Lipid', referenceHigh: 150, optimalHigh: 100 },

  // ─── Metabolic ───────────────────────────
  'Glucose':     { name: 'Glucose', displayName: 'Fasting glucose', unit: 'mg/dL', category: 'Metabolic', referenceLow: 70, referenceHigh: 99, description: 'Fasting blood sugar. >100 = prediabetic range.' },
  'HbA1c':       { name: 'HbA1c', displayName: 'HbA1c',             unit: '%',     category: 'Metabolic', referenceHigh: 5.6, optimalHigh: 5.4, description: '3-month avg blood glucose. Prediabetes 5.7–6.4%.' },
  'Creatinine':  { name: 'Creatinine', displayName: 'Creatinine',   unit: 'mg/dL', category: 'Metabolic', referenceLow: 0.6, referenceHigh: 1.3, description: 'Kidney function marker.' },
  'BUN':         { name: 'BUN', displayName: 'BUN',                 unit: 'mg/dL', category: 'Metabolic', referenceLow: 7, referenceHigh: 20 },
  'Sodium':      { name: 'Sodium', displayName: 'Sodium',           unit: 'mmol/L', category: 'Metabolic', referenceLow: 135, referenceHigh: 145 },
  'Potassium':   { name: 'Potassium', displayName: 'Potassium',     unit: 'mmol/L', category: 'Metabolic', referenceLow: 3.5, referenceHigh: 5.1 },
  'ALT':         { name: 'ALT', displayName: 'ALT',                 unit: 'U/L', category: 'Metabolic', referenceHigh: 55, description: 'Liver enzyme. Elevated = liver stress.' },
  'AST':         { name: 'AST', displayName: 'AST',                 unit: 'U/L', category: 'Metabolic', referenceHigh: 48 },

  // ─── Thyroid ─────────────────────────────
  'TSH':      { name: 'TSH', displayName: 'TSH',       unit: 'µIU/mL', category: 'Thyroid', referenceLow: 0.4, referenceHigh: 4.0, optimalLow: 1.0, optimalHigh: 2.5, description: 'Thyroid stimulating hormone. Screens thyroid function.' },
  'Free T4':  { name: 'Free T4', displayName: 'Free T4', unit: 'ng/dL',  category: 'Thyroid', referenceLow: 0.8, referenceHigh: 1.8 },
  'Free T3':  { name: 'Free T3', displayName: 'Free T3', unit: 'pg/mL',  category: 'Thyroid', referenceLow: 2.3, referenceHigh: 4.2 },

  // ─── Hormones ────────────────────────────
  'Testosterone':       { name: 'Testosterone', displayName: 'Total testosterone', unit: 'ng/dL', category: 'Hormone', referenceLow: 300, referenceHigh: 1000, optimalLow: 600 },
  'Free Testosterone':  { name: 'Free Testosterone', displayName: 'Free testosterone', unit: 'pg/mL', category: 'Hormone', referenceLow: 8.7, referenceHigh: 25 },
  'Estradiol':          { name: 'Estradiol', displayName: 'Estradiol', unit: 'pg/mL', category: 'Hormone', referenceLow: 10, referenceHigh: 40 },
  'SHBG':               { name: 'SHBG', displayName: 'SHBG', unit: 'nmol/L', category: 'Hormone', referenceLow: 10, referenceHigh: 57 },
  'Cortisol':           { name: 'Cortisol', displayName: 'Cortisol (AM)', unit: 'µg/dL', category: 'Hormone', referenceLow: 6, referenceHigh: 18 },

  // ─── Vitamins ────────────────────────────
  'Vitamin D (25-OH)':  { name: 'Vitamin D (25-OH)', displayName: 'Vitamin D (25-OH)', unit: 'ng/mL', category: 'Vitamin', referenceLow: 30, referenceHigh: 100, optimalLow: 40, optimalHigh: 80, description: 'Skeletal + immune health. Deficient <20 ng/mL.' },
  'Vitamin B12':        { name: 'Vitamin B12', displayName: 'Vitamin B12', unit: 'pg/mL', category: 'Vitamin', referenceLow: 200, referenceHigh: 900, optimalLow: 500 },
  'Folate':             { name: 'Folate', displayName: 'Folate', unit: 'ng/mL', category: 'Vitamin', referenceLow: 3, referenceHigh: 20 },
  'Ferritin':           { name: 'Ferritin', displayName: 'Ferritin', unit: 'ng/mL', category: 'Vitamin', referenceLow: 30, referenceHigh: 400, description: 'Iron storage protein.' },
  'Iron':               { name: 'Iron', displayName: 'Serum iron', unit: 'µg/dL', category: 'Vitamin', referenceLow: 60, referenceHigh: 170 },
};

export function lookupBiomarkerRef(name: string): BiomarkerReference | null {
  if (name in BIOMARKER_REFS) return BIOMARKER_REFS[name];
  // Case-insensitive fallback
  const lower = name.toLowerCase();
  const hit = Object.values(BIOMARKER_REFS).find((r) => r.name.toLowerCase() === lower);
  return hit ?? null;
}

export const CATEGORY_ORDER: BiomarkerCategory[] = [
  'Lipid',
  'Metabolic',
  'Hormone',
  'Thyroid',
  'Vitamin',
  'CBC',
  'Other',
];
