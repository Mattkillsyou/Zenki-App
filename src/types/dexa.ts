/**
 * DEXA (DXA) body-composition scan storage.
 *
 * Fields mirror what the Claude Vision extractor returns (see
 * `src/services/aiVision.ts#DexaExtraction`) plus local-only metadata
 * (id, memberId, source, addedAt).
 *
 * All mass values are in kg. Body fat is in percent (22.5, not 0.225).
 */

export interface DexaRegional {
  leanKg?: number;
  fatKg?: number;
}

export interface DexaScan {
  id: string;
  memberId: string;
  /** Date of the scan itself — extracted from the report if possible, else entry date. */
  scanDate: string;            // YYYY-MM-DD
  addedAt: string;             // ISO — when the user logged it
  source: 'ai' | 'manual';

  totalBodyFatPct?: number;
  fatMassKg?: number;
  leanMassKg?: number;
  bmc?: number;                // bone mineral content in kg
  vatCm2?: number;             // visceral adipose tissue
  fmi?: number;                // fat mass index (kg/m²)
  ffmi?: number;               // fat-free mass index (kg/m²)
  androidGynoidRatio?: number;

  arms?: DexaRegional;
  legs?: DexaRegional;
  trunk?: DexaRegional;

  notes?: string;
}
