import { TimeEntry } from '../types/timeclock';
import { formatTime, calculatePayBreakdown } from '../utils/timeclock';

// ─────────────────────────────────────────────────
// Google Sheets Sync Service
//
// After deploying the Vercel proxy, paste the URL below.
// e.g. 'https://zenki-timesheet-proxy.vercel.app/api/timesheet'
// ─────────────────────────────────────────────────

const SHEETS_PROXY_URL = 'https://script.google.com/macros/s/AKfycbz1I9JhmLuJAjR16bEL1XNWRRucF4KrgYXFj-PQX7PcPetYvODd3UFsToFln2W1JDA/exec';

export async function pushTimeEntry(
  entry: TimeEntry,
  employeeName: string,
  hourlyRate: number,
  periodStart?: string,
  periodEnd?: string,
): Promise<boolean> {
  const rawHours = entry.totalMinutes != null ? (entry.totalMinutes / 60).toFixed(2) : '0';
  const paidHours = entry.paidMinutes != null ? (entry.paidMinutes / 60).toFixed(2) : '0';

  // CA labor law pay breakdown: regular / OT 1.5× / DT 2× / holiday premium
  const breakdown = entry.paidMinutes != null
    ? calculatePayBreakdown(entry.paidMinutes, entry.date, hourlyRate)
    : null;

  const payload = {
    employeeName,
    date: entry.date,
    clockIn: entry.clockIn ? formatTime(entry.clockIn) : '',
    clockOut: entry.clockOut ? formatTime(entry.clockOut) : '',
    rawHours,
    paidHours,
    hourlyRate: hourlyRate.toString(),

    // CA labor law breakdown
    mealDeductionMinutes: entry.mealDeductionMinutes ?? 0,
    regularHours: breakdown ? (breakdown.regularMinutes / 60).toFixed(2) : '0',
    overtimeHours: breakdown ? (breakdown.overtimeMinutes / 60).toFixed(2) : '0',
    doubletimeHours: breakdown ? (breakdown.doubletimeMinutes / 60).toFixed(2) : '0',
    regularPay: breakdown ? breakdown.regularPay.toFixed(2) : '0',
    overtimePay: breakdown ? breakdown.overtimePay.toFixed(2) : '0',
    doubletimePay: breakdown ? breakdown.doubletimePay.toFixed(2) : '0',
    holidayBonus: breakdown ? breakdown.holidayBonus.toFixed(2) : '0',
    totalPay: breakdown ? breakdown.totalPay.toFixed(2) : '0',
    pay: breakdown ? breakdown.totalPay.toFixed(2) : '0', // backward compat

    isHoliday: entry.isHoliday ? 'Yes' : 'No',
    holidayName: entry.holidayName ?? '',

    lunchTaken: entry.lunchTaken ? 'Yes' : 'No',
    breakTaken: entry.breakTaken ? 'Yes' : 'No',

    periodStart,
    periodEnd,
  };

  if (!SHEETS_PROXY_URL) {
    console.log('[Sheets] No proxy URL configured — entry logged locally:');
    console.log('[Sheets]', JSON.stringify(payload, null, 2));
    return true;
  }

  try {
    const response = await fetch(SHEETS_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return response.ok;
  } catch (error) {
    console.error('[Sheets] Sync failed:', error);
    return false;
  }
}
