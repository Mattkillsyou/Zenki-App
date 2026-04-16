// ──────────────────────────────────────────────────────────────────
// GOOGLE CALENDAR AVAILABILITY
//
// The owner creates a Google Apps Script bound to their account that
// reads their primary calendar and returns busy intervals for a given
// date. The app POSTs the date, receives busy intervals, and the
// BookScreen uses them to disable conflicting time slots.
//
// Script template: src/data/appsScripts/calendar-availability.gs
// ──────────────────────────────────────────────────────────────────

const CALENDAR_AVAILABILITY_URL = '';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface BusyInterval {
  start: string; // ISO 8601
  end: string;   // ISO 8601
  title?: string;
}

interface CacheEntry {
  intervals: BusyInterval[];
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();

/**
 * Fetch busy intervals on the owner's calendar for a given date.
 * Date format: YYYY-MM-DD.
 * Returns an empty array if the URL isn't configured (graceful fallback
 * so bookings still work in demo mode).
 */
export async function fetchBusyIntervals(date: string): Promise<BusyInterval[]> {
  if (!CALENDAR_AVAILABILITY_URL) {
    console.log('[Calendar] No URL configured — all slots treated as available');
    return [];
  }

  // Cache hit?
  const cached = cache.get(date);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.intervals;
  }

  try {
    const response = await fetch(CALENDAR_AVAILABILITY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    const intervals: BusyInterval[] = Array.isArray(json?.busy) ? json.busy : [];
    cache.set(date, { intervals, fetchedAt: Date.now() });
    return intervals;
  } catch (err) {
    console.warn('[Calendar] Fetch failed:', err);
    return [];
  }
}

/**
 * Check if a proposed booking slot overlaps any busy interval.
 */
export function isSlotBusy(
  slotStart: Date,
  durationMinutes: number,
  busy: BusyInterval[],
): BusyInterval | null {
  const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60_000);
  for (const interval of busy) {
    const bStart = new Date(interval.start);
    const bEnd = new Date(interval.end);
    // overlap = not (slot ends before busy starts OR slot starts after busy ends)
    if (slotEnd > bStart && slotStart < bEnd) {
      return interval;
    }
  }
  return null;
}

/**
 * Clear the cache for a specific date (or all dates if none given).
 * Useful after a successful booking so the slot reflects the new event.
 */
export function clearAvailabilityCache(date?: string) {
  if (date) cache.delete(date);
  else cache.clear();
}
