import { BiweeklyPeriod } from '../types/timeclock';

// No deductions — lunch and breaks are paid. Buttons just log whether taken.

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

export function calculatePaidMinutes(clockIn: string, clockOut: string): number {
  return Math.floor((new Date(clockOut).getTime() - new Date(clockIn).getTime()) / 60000);
}

export function calculateRawMinutes(clockIn: string, clockOut: string): number {
  return Math.floor((new Date(clockOut).getTime() - new Date(clockIn).getTime()) / 60000);
}

export function getElapsedMinutes(clockIn: string): number {
  return Math.floor((Date.now() - new Date(clockIn).getTime()) / 60000);
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

export function getPeriodTotals(period: BiweeklyPeriod, hourlyRate: number) {
  let totalPaidMinutes = 0;
  // Count unique calendar days worked (from actual entry dates)
  const uniqueDays = new Set<string>();
  for (const entry of period.entries) {
    if (entry.paidMinutes != null) {
      totalPaidMinutes += entry.paidMinutes;
      uniqueDays.add(entry.date);
    }
  }
  const totalPaidHours = totalPaidMinutes / 60;
  return {
    totalPaidHours: Math.round(totalPaidHours * 100) / 100,
    totalPay: Math.round(totalPaidHours * hourlyRate * 100) / 100,
    daysWorked: uniqueDays.size,
  };
}

function toDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
