/**
 * Client for the AI vision endpoints hosted as Firebase Cloud Functions.
 *
 * All three endpoints have the same contract:
 *   POST {base}/{endpoint}
 *   Headers:   Authorization: Bearer <firebase-id-token>
 *              Content-Type:  application/json
 *   Body:      { "imageBase64": "iVBORw0KG...", "mimeType": "image/png" }
 *   Response:  { ...typed payload per endpoint... }
 *
 * The function source lives in `functions/` at the project root.
 */

import { AI_FUNCTION_BASE_URL } from '../config/api';
import { FoodMacros } from '../types/food';

// ─────────────────────────────────────────────
// Shared types
// ─────────────────────────────────────────────

export interface AIError {
  code: 'no_auth' | 'no_network' | 'server_error' | 'parse_error' | 'rate_limit';
  message: string;
}

export type AIResult<T> = { ok: true; data: T } | { ok: false; error: AIError };

// ─────────────────────────────────────────────
// Photo → foods (Phase 3)
// ─────────────────────────────────────────────

export interface RecognizedFood {
  name: string;
  estimatedGrams: number;
  confidence: 'low' | 'medium' | 'high';
  macros: FoodMacros;
}

export async function recognizeFood(
  imageBase64: string,
  mimeType: 'image/jpeg' | 'image/png' = 'image/jpeg',
  idToken?: string,
): Promise<AIResult<{ foods: RecognizedFood[] }>> {
  return callFunction('recognizeFood', { imageBase64, mimeType }, idToken);
}

// ─────────────────────────────────────────────
// DEXA → body composition (Phase 4)
// ─────────────────────────────────────────────

export interface DexaExtraction {
  scanDate?: string;         // YYYY-MM-DD if present in report
  totalBodyFatPct?: number;
  fatMassKg?: number;
  leanMassKg?: number;
  bmc?: number;              // bone mineral content in kg
  vatCm2?: number;           // visceral adipose tissue in cm²
  fmi?: number;
  ffmi?: number;
  androidGynoidRatio?: number;
  regional?: {
    arms?: { leanKg?: number; fatKg?: number };
    legs?: { leanKg?: number; fatKg?: number };
    trunk?: { leanKg?: number; fatKg?: number };
  };
  notes?: string;
}

export async function extractDexa(
  imageBase64: string,
  mimeType: 'image/jpeg' | 'image/png' | 'application/pdf' = 'image/jpeg',
  idToken?: string,
): Promise<AIResult<DexaExtraction>> {
  return callFunction('extractDexa', { imageBase64, mimeType }, idToken);
}

// ─────────────────────────────────────────────
// Blood work (Phase 5)
// ─────────────────────────────────────────────

export type BiomarkerStatus = 'optimal' | 'sufficient' | 'out_of_range' | 'unknown';

export interface Biomarker {
  name: string;           // canonical name
  displayName?: string;   // as it appeared in the report
  value: number;
  unit: string;
  referenceLow?: number;
  referenceHigh?: number;
  status: BiomarkerStatus;
  category?: 'CBC' | 'Lipid' | 'Metabolic' | 'Thyroid' | 'Hormone' | 'Vitamin' | 'Other';
}

export interface BloodworkExtraction {
  testDate?: string;      // YYYY-MM-DD
  labName?: string;
  biomarkers: Biomarker[];
}

export async function parseBloodwork(
  imageBase64: string,
  mimeType: 'image/jpeg' | 'image/png' | 'application/pdf' = 'image/jpeg',
  idToken?: string,
): Promise<AIResult<BloodworkExtraction>> {
  return callFunction('parseBloodwork', { imageBase64, mimeType }, idToken);
}

// ─────────────────────────────────────────────
// Transport
// ─────────────────────────────────────────────

async function callFunction<T>(
  endpoint: string,
  body: { imageBase64: string; mimeType: string },
  idToken?: string,
): Promise<AIResult<T>> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (idToken) headers['Authorization'] = `Bearer ${idToken}`;

    const res = await fetch(`${AI_FUNCTION_BASE_URL}/${endpoint}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: { code: 'no_auth', message: 'Please sign in again.' } };
    }
    if (res.status === 429) {
      return { ok: false, error: { code: 'rate_limit', message: 'Too many requests. Try again soon.' } };
    }
    if (!res.ok) {
      return { ok: false, error: { code: 'server_error', message: `HTTP ${res.status}` } };
    }

    const json = await res.json();
    return { ok: true, data: json as T };
  } catch (e: any) {
    if (e?.message?.includes('Network') || e?.message?.includes('fetch')) {
      return { ok: false, error: { code: 'no_network', message: 'No internet connection.' } };
    }
    return { ok: false, error: { code: 'parse_error', message: e?.message ?? 'Unknown error' } };
  }
}
