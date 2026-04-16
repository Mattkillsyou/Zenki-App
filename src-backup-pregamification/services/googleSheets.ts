import { TimeEntry } from '../types/timeclock';
import { formatTime } from '../utils/timeclock';

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
  const pay = entry.paidMinutes != null ? ((entry.paidMinutes / 60) * hourlyRate).toFixed(2) : '0';

  const payload = {
    employeeName,
    date: entry.date,
    clockIn: entry.clockIn ? formatTime(entry.clockIn) : '',
    clockOut: entry.clockOut ? formatTime(entry.clockOut) : '',
    rawHours,
    lunchTaken: entry.lunchTaken ? 'Yes' : 'No',
    breakTaken: entry.breakTaken ? 'Yes' : 'No',
    deductions: '0',
    paidHours,
    pay,
    hourlyRate: hourlyRate.toString(),
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
