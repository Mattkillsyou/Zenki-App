import { BiweeklyPeriod, TimeEntry } from '../types/timeclock';
import { getHolidayInfo } from '../data/holidays';

// ──────────────────────────────────────────────────────────────────
// CALIFORNIA LABOR LAW RULES (2026)
//
// MEAL BREAKS (unpaid, auto-deducted from paid time):
//   <5 hrs          → 0 meal breaks
//   5–10 hrs        → 1 x 30-min meal break
//   10+ hrs         → 2 x 30-min meal breaks
//
// REST BREAKS (paid, 10 min each — NOT deducted):
//   <3.5 hrs        → 0
//   3.5–6 hrs       → 1
//   6–10 hrs        → 2
//   10–14 hrs       → 3
//
// DAILY OVERTIME:
//   0–8 hrs         → 1.0x (regular)
//   8–12 hrs        → 1.5x (overtime)
//   12+ hrs         → 2.0x (double time)
//
// HOLIDAY PAY (Zenki Dojo policy, not CA-required):
//   Any hour worked on a holiday gets a 1.5x multiplier applied on top
//   of the regular/OT/DT rate (so holiday OT = 1.5 × 1.5 = 2.25x).
// ──────────────────────────────────────────────────────────────────

export const CA_RULES = {
  MEAL_BREAK_MINUTES: 30,
  REST_BREAK_MINUTES: 10,
  OT_THRESHOLD_MINUTES: 8 * 60,     // after 8 hours
  DT_THRESHOLD_MINUTES: 12 * 60,    // after 12 hours
  OT_MULTIPLIER: 1.5,
  DT_MULTIPLIER: 2.0,
  HOLIDAY_MULTIPLIER: 1.5,
};

// Anchor Monday for bi-weekly calculation
const ANCHOR = new Date('2026-01-05T00:00:00');

export function getCurrentBiweeklyPeriod(date: Date = new Date()): { startDate: string; endDate: string } {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor((d.getTime() - ANCHOR.getTime()) / (1000 * 60 * 60 * 24));
  const periodIndex = Math.floor(diffDays / 14);
  const start = new Date(ANCHOR.getTime() + periodIndex * 14 * 24 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 13 * 24 * 60 * 60 * 1000);
  return {
    startDate: toDateString(start),
    endDate: toDateString(end),
  };
}

export function createEmptyPeriod(date?: Date): BiweeklyPeriod {
  const { startDate, endDate } = getCurrentBiweeklyPeriod(date);
  return { startDate, endDate, entries: [] };
}

/**
 * Automatically determine how many meal-break minutes to deduct
 * based on raw shift length, per CA labor law.
 */
export function getAutoMealDeductionMinutes(rawMinutes: number): number {
  if (rawMinutes >= 10 * 60) return CA_RULES.MEAL_BREAK_MINUTES * 2;
  if (rawMinutes >= 5 * 60)  return CA_RULES.MEAL_BREAK_MINUTES;
  return 0;
}

/**
 * How many 10-minute REST breaks the employee is entitled to (paid).
 * Used for display, not for pay calculation — rest breaks are paid time.
 */
export function getRequiredRestBreaks(rawMinutes: number): number {
  if (rawMinutes >= 14 * 60) return 4;
  if (rawMinutes >= 10 * 60) return 3;
  if (rawMinutes >= 6 * 60)  return 2;
  if (rawMinutes >= 3.5 * 60) return 1;
  return 0;
}

export function getRequiredMealBreaks(rawMinutes: number): number {
  if (rawMinutes >= 10 * 60) return 2;
  if (rawMinutes >= 5 * 60)  return 1;
  return 0;
}

export function calculateRawMinutes(clockIn: string, clockOut: string): number {
  return Math.floor((new Date(clockOut).getTime() - new Date(clockIn).getTime()) / 60000);
}

/**
 * Paid minutes = raw minutes - auto meal deductions (CA law).
 * Rest breaks are paid so not deducted.
 */
export function calculatePaidMinutes(clockIn: string, clockOut: string): number {
  const raw = calculateRawMinutes(clockIn, clockOut);
  const deduction = getAutoMealDeductionMinutes(raw);
  return Math.max(0, raw - deduction);
}

export function getElapsedMinutes(clockIn: string): number {
  return Math.floor((Date.now() - new Date(clockIn).getTime()) / 60000);
}

export interface PayBreakdown {
  regularMinutes: number;      // 0 – 8 hrs (1.0x base)
  overtimeMinutes: number;     // 8 – 12 hrs (1.5x base)
  doubletimeMinutes: number;   // 12+ hrs (2.0x base)
  isHoliday: boolean;
  holidayName?: string;
  regularPay: number;
  overtimePay: number;
  doubletimePay: number;
  holidayBonus: number;        // extra 0.5x premium on all paid hours for holidays
  totalPay: number;
  totalMultiplier: number;     // blended effective rate (for display)
}

/**
 * Given a completed entry's paid minutes and date, split into
 * regular/OT/DT and compute pay. Applies holiday premium if applicable.
 */
export function calculatePayBreakdown(
  paidMinutes: number,
  date: string,
  hourlyRate: number,
): PayBreakdown {
  const holiday = getHolidayInfo(date);
  const baseRate = hourlyRate;

  // Split hours by overtime tier
  const regularMinutes = Math.min(paidMinutes, CA_RULES.OT_THRESHOLD_MINUTES);
  const overtimeMinutes = Math.max(
    0,
    Math.min(paidMinutes - CA_RULES.OT_THRESHOLD_MINUTES, CA_RULES.DT_THRESHOLD_MINUTES - CA_RULES.OT_THRESHOLD_MINUTES),
  );
  const doubletimeMinutes = Math.max(0, paidMinutes - CA_RULES.DT_THRESHOLD_MINUTES);

  // Base pay by tier
  const regularPay = (regularMinutes / 60) * baseRate;
  const overtimePay = (overtimeMinutes / 60) * baseRate * CA_RULES.OT_MULTIPLIER;
  const doubletimePay = (doubletimeMinutes / 60) * baseRate * CA_RULES.DT_MULTIPLIER;

  // Holiday premium: +50% on TOP of regular/OT/DT rates for all paid hours worked
  // e.g. holiday regular = 1.0 + 0.5 = 1.5x base
  //       holiday OT     = 1.5 + 0.5 = 2.0x base (still stacked with OT)
  //       holiday DT     = 2.0 + 0.5 = 2.5x base
  const holidayPremiumRate = holiday.isHoliday ? 0.5 : 0;
  const holidayBonus = (paidMinutes / 60) * baseRate * holidayPremiumRate;

  const totalPay = regularPay + overtimePay + doubletimePay + holidayBonus;
  const totalHours = paidMinutes / 60;
  const totalMultiplier = totalHours > 0 ? totalPay / (totalHours * baseRate) : 1;

  return {
    regularMinutes,
    overtimeMinutes,
    doubletimeMinutes,
    isHoliday: holiday.isHoliday,
    holidayName: holiday.name,
    regularPay: round2(regularPay),
    overtimePay: round2(overtimePay),
    doubletimePay: round2(doubletimePay),
    holidayBonus: round2(holidayBonus),
    totalPay: round2(totalPay),
    totalMultiplier: Math.round(totalMultiplier * 100) / 100,
  };
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export function formatTime(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

export function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export function formatPeriodLabel(startDate: string, endDate: string): string {
  const s = new Date(startDate + 'T12:00:00');
  const e = new Date(endDate + 'T12:00:00');
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${s.toLocaleDateString('en-US', opts)} – ${e.toLocaleDateString('en-US', opts)}`;
}

export function generateEntryId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export interface PeriodTotals {
  totalPaidHours: number;
  totalPay: number;
  daysWorked: number;
  regularHours: number;
  overtimeHours: number;
  doubletimeHours: number;
  holidayHours: number;
  holidayBonus: number;
}

export function getPeriodTotals(period: BiweeklyPeriod, hourlyRate: number): PeriodTotals {
  let totalPaidMinutes = 0;
  let regularMinutes = 0;
  let overtimeMinutes = 0;
  let doubletimeMinutes = 0;
  let holidayMinutes = 0;
  let totalPay = 0;
  let holidayBonus = 0;
  const uniqueDays = new Set<string>();

  for (const entry of period.entries) {
    if (entry.paidMinutes == null) continue;
    const bd = calculatePayBreakdown(entry.paidMinutes, entry.date, hourlyRate);
    totalPaidMinutes += entry.paidMinutes;
    regularMinutes += bd.regularMinutes;
    overtimeMinutes += bd.overtimeMinutes;
    doubletimeMinutes += bd.doubletimeMinutes;
    if (bd.isHoliday) holidayMinutes += entry.paidMinutes;
    totalPay += bd.totalPay;
    holidayBonus += bd.holidayBonus;
    uniqueDays.add(entry.date);
  }

  return {
    totalPaidHours: round2(totalPaidMinutes / 60),
    totalPay: round2(totalPay),
    daysWorked: uniqueDays.size,
    regularHours: round2(regularMinutes / 60),
    overtimeHours: round2(overtimeMinutes / 60),
    doubletimeHours: round2(doubletimeMinutes / 60),
    holidayHours: round2(holidayMinutes / 60),
    holidayBonus: round2(holidayBonus),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function toDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
