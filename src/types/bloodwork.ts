/**
 * Blood work / lab report storage — mirrors what Claude returns from
 * `src/services/aiVision.ts#BloodworkExtraction` plus local metadata.
 */

export type BiomarkerStatus = 'optimal' | 'sufficient' | 'out_of_range' | 'unknown';

export type BiomarkerCategory =
  | 'CBC'
  | 'Lipid'
  | 'Metabolic'
  | 'Thyroid'
  | 'Hormone'
  | 'Vitamin'
  | 'Other';

export interface StoredBiomarker {
  name: string;               // canonical (e.g. "HDL")
  displayName?: string;       // as on the report (e.g. "HDL-Cholesterol")
  value: number;
  unit: string;
  referenceLow?: number;
  referenceHigh?: number;
  status: BiomarkerStatus;
  category: BiomarkerCategory;
}

export interface BloodworkReport {
  id: string;
  memberId: string;
  testDate: string;           // YYYY-MM-DD
  addedAt: string;            // ISO
  source: 'ai' | 'manual';
  labName?: string;
  biomarkers: StoredBiomarker[];
  notes?: string;
}
