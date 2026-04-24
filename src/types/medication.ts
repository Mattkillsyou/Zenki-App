/**
 * Medication & peptide tracker types.
 *
 * Models prescription drugs, OTC, peptides, supplements, and vitamins
 * with full schedule + injection-site rotation support.
 */

export type MedicationCategory =
  | 'prescription'
  | 'otc'
  | 'peptide'
  | 'supplement'
  | 'vitamin';

export type FrequencyType =
  | 'daily'
  | 'twice_daily'
  | 'three_times_daily'
  | 'weekly'
  | 'biweekly'
  | 'custom';

export type RouteOfAdministration =
  | 'oral'
  | 'subcutaneous'
  | 'intramuscular'
  | 'topical'
  | 'sublingual'
  | 'intranasal';

export interface MedicationEntry {
  id: string;
  memberId: string;
  /** Name returned from the drug database search */
  name: string;
  /** Brand name if available */
  brandName?: string;
  /** External DB identifier (e.g., RxCUI from RxNorm, or local peptide id) */
  externalId?: string;
  category: MedicationCategory;
  /** Numeric/textual dose amount, e.g. "250", "10" */
  dose: string;
  /** Dose unit, e.g. "mg", "mcg", "IU", "ml" */
  doseUnit: string;
  route: RouteOfAdministration;
  frequency: FrequencyType;
  /** For 'custom' frequency: specific days of the week (0=Sun..6=Sat) */
  customDays?: number[];
  /** Times of day as HH:mm strings */
  timesOfDay: string[];
  /** ISO date string — when the user started this medication */
  startDate: string;
  /** ISO date string — optional end date for cycles/protocols */
  endDate?: string;
  /** Injection site rotation (peptides/IM/SC) */
  injectionSites?: string[];
  lastInjectionSite?: string;
  notes?: string;
  /** Whether notifications are enabled for this entry */
  notificationsEnabled: boolean;
  /** Expo notification identifiers so we can cancel them */
  scheduledNotificationIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface MedicationLog {
  id: string;
  medicationId: string;
  memberId: string;
  /** ISO timestamp of when the dose was actually taken/administered */
  takenAt: string;
  /** The scheduled time it was supposed to be taken (ISO string with HH:mm) */
  scheduledFor: string;
  dose: string;
  injectionSite?: string;
  skipped: boolean;
  notes?: string;
}

export interface DrugSearchResult {
  externalId: string;
  name: string;
  brandName?: string;
  category: MedicationCategory;
  defaultRoute?: RouteOfAdministration;
  defaultDoseUnit?: string;
}

// ─────────────────────────────────────────────────
// Display helpers
// ─────────────────────────────────────────────────

export const CATEGORY_LABELS: Record<MedicationCategory, string> = {
  prescription: 'Prescription',
  otc: 'OTC',
  peptide: 'Peptide',
  supplement: 'Supplement',
  vitamin: 'Vitamin',
};

export const CATEGORY_COLORS: Record<MedicationCategory, string> = {
  prescription: '#4A90D9',
  peptide: '#2EC4B6',
  supplement: '#FFB800',
  vitamin: '#9B59B6',
  otc: '#8E8E93',
};

export const ROUTE_LABELS: Record<RouteOfAdministration, string> = {
  oral: 'Oral',
  subcutaneous: 'Subcutaneous',
  intramuscular: 'Intramuscular',
  topical: 'Topical',
  sublingual: 'Sublingual',
  intranasal: 'Intranasal',
};

export const ROUTE_ICONS: Record<RouteOfAdministration, string> = {
  oral: '💊',
  subcutaneous: '💉',
  intramuscular: '💉',
  topical: '🧴',
  sublingual: '👅',
  intranasal: '👃',
};

export const FREQUENCY_LABELS: Record<FrequencyType, string> = {
  daily: 'Daily',
  twice_daily: 'Twice Daily',
  three_times_daily: '3× Daily',
  weekly: 'Weekly',
  biweekly: 'Every 2 Weeks',
  custom: 'Custom Days',
};

/** Common injection sites for SC/IM rotation */
export const INJECTION_SITES = [
  'Left Abdomen',
  'Right Abdomen',
  'Left Thigh',
  'Right Thigh',
  'Left Glute',
  'Right Glute',
  'Left Deltoid',
  'Right Deltoid',
] as const;

export type InjectionSite = typeof INJECTION_SITES[number];

// ─────────────────────────────────────────────────
// Schedule helpers
// ─────────────────────────────────────────────────

/**
 * Returns true if the given date falls on a scheduled day for this medication.
 * Considers frequency type, customDays, startDate, and endDate.
 */
export function isMedicationScheduledForDate(
  med: MedicationEntry,
  isoDate: string,
): boolean {
  const date = new Date(isoDate + 'T00:00:00');
  const start = new Date(med.startDate.slice(0, 10) + 'T00:00:00');
  if (date < start) return false;
  if (med.endDate) {
    const end = new Date(med.endDate.slice(0, 10) + 'T00:00:00');
    if (date > end) return false;
  }

  const dayOfWeek = date.getDay(); // 0=Sun..6=Sat
  const daysSinceStart = Math.floor((date.getTime() - start.getTime()) / 86400000);

  switch (med.frequency) {
    case 'daily':
    case 'twice_daily':
    case 'three_times_daily':
      return true;
    case 'weekly':
      return daysSinceStart % 7 === 0;
    case 'biweekly':
      return daysSinceStart % 14 === 0;
    case 'custom':
      return med.customDays?.includes(dayOfWeek) ?? false;
    default:
      return false;
  }
}

/**
 * Format a HH:mm string into a human time label, e.g. "8:00 AM".
 */
export function formatTimeLabel(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${String(m).padStart(2, '0')} ${ampm}`;
}

/**
 * Pick the next injection site by rotating through the list.
 */
export function nextInjectionSite(
  sites: string[],
  lastSite?: string,
): string | undefined {
  if (!sites || sites.length === 0) return undefined;
  if (!lastSite) return sites[0];
  const idx = sites.indexOf(lastSite);
  if (idx < 0) return sites[0];
  return sites[(idx + 1) % sites.length];
}
