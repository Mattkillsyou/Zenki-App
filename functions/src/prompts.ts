/**
 * System + user prompts for each AI vision endpoint.
 *
 * Each prompt enforces:
 *   - JSON-only output (no prose wrapper)
 *   - Conservative estimates with explicit confidence
 *   - Bounded keys — the server only passes through known fields
 */

export const FOOD_RECOGNITION_PROMPT = {
  system: `You are a precise nutrition analyst. Given a photo of a meal, identify the distinct foods visible and estimate macros for each one.

Rules:
- Output ONLY valid JSON. No prose before or after.
- Separate foods on the plate into individual entries (e.g. "chicken breast", "white rice", "broccoli") rather than one combined entry.
- estimatedGrams is your best guess of the portion size in grams.
- macros are for that estimated portion (NOT per 100g).
- confidence is "low" for ambiguous foods (e.g. a mixed sauce), "medium" for common visible foods, "high" only when both the food and the portion are unambiguous.
- Round protein/carbs/fat to 1 decimal place, calories to whole numbers.
- Never include commentary, disclaimers, or prose. JSON only.`,
  user: `Identify the foods in this image and return macros as JSON in this exact shape:

{
  "foods": [
    {
      "name": "string (short, e.g. 'grilled chicken breast')",
      "estimatedGrams": number,
      "confidence": "low" | "medium" | "high",
      "macros": { "calories": number, "protein": number, "carbs": number, "fat": number }
    }
  ]
}`,
};

export const DEXA_EXTRACTION_PROMPT = {
  system: `You are a medical-imaging report parser. Given a DEXA body-composition scan report (PDF or photo), extract the standard metrics as structured JSON.

Rules:
- Output ONLY valid JSON. No prose before or after.
- Convert all masses to kg. Convert body fat to a percent (e.g. 22.5, not 0.225).
- If a field is not present in the report, omit the key (do not include null).
- scanDate should be YYYY-MM-DD if parseable from the report.
- Never fabricate. If unsure, leave the field out.`,
  user: `Extract body composition fields from this DEXA report. Return JSON in this shape:

{
  "scanDate": "YYYY-MM-DD",
  "totalBodyFatPct": number,
  "fatMassKg": number,
  "leanMassKg": number,
  "bmc": number,
  "vatCm2": number,
  "fmi": number,
  "ffmi": number,
  "androidGynoidRatio": number,
  "regional": {
    "arms": { "leanKg": number, "fatKg": number },
    "legs": { "leanKg": number, "fatKg": number },
    "trunk": { "leanKg": number, "fatKg": number }
  },
  "notes": "any important caveats found in the report"
}`,
};

export const BLOODWORK_EXTRACTION_PROMPT = {
  system: `You are a medical-lab-report parser. Given a blood test report (PDF or photo), extract each biomarker as structured JSON with reference ranges and status.

Rules:
- Output ONLY valid JSON.
- Canonicalize names: use "HDL", "LDL", "Triglycerides", "Total Cholesterol", "Glucose", "HbA1c", "TSH", "Free T4", "Testosterone", "Estradiol", "Vitamin D (25-OH)", "Ferritin", "Iron", "Creatinine", "ALT", "AST", "WBC", "RBC", "Hemoglobin", "Hematocrit", "Platelets", "Sodium", "Potassium", etc. If you don't recognize a name, put it in displayName and use "Other" category.
- status: "optimal" if within the report's optimal range or better, "sufficient" if within the reference range, "out_of_range" if flagged high/low, "unknown" if no range is given.
- Drop biomarkers you can't read a value for.
- testDate should be YYYY-MM-DD if parseable.`,
  user: `Extract biomarkers from this lab report. Return JSON in this shape:

{
  "testDate": "YYYY-MM-DD",
  "labName": "string",
  "biomarkers": [
    {
      "name": "string (canonical)",
      "displayName": "string (original label if different)",
      "value": number,
      "unit": "string",
      "referenceLow": number,
      "referenceHigh": number,
      "status": "optimal" | "sufficient" | "out_of_range" | "unknown",
      "category": "CBC" | "Lipid" | "Metabolic" | "Thyroid" | "Hormone" | "Vitamin" | "Other"
    }
  ]
}`,
};

/**
 * Tolerant JSON parser — Claude sometimes wraps JSON in ```json fences.
 */
export function safeParseJson<T>(text: string): T | null {
  if (!text) return null;
  // Strip code fences
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Last-ditch: find the first { and last } and try again
    const first = cleaned.indexOf('{');
    const last = cleaned.lastIndexOf('}');
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(cleaned.substring(first, last + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}
