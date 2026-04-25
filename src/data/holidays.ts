// ──────────────────────────────────────────────────────────────────
// FEDERAL HOLIDAYS — used for overtime/holiday pay calculation
//
// California doesn't LEGALLY require holiday pay, but Zenki has
// chosen to pay 1.5x on these days as a benefit for employees.
// ──────────────────────────────────────────────────────────────────

/** Nth weekday of a month (e.g., 3rd Monday of January). */
function nthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): Date {
  const first = new Date(year, month, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  return new Date(year, month, 1 + offset + (n - 1) * 7);
}

/** Last weekday of a month (e.g., last Monday of May). */
function lastWeekdayOfMonth(year: number, month: number, weekday: number): Date {
  const last = new Date(year, month + 1, 0);
  const offset = (last.getDay() - weekday + 7) % 7;
  return new Date(year, month, last.getDate() - offset);
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export interface HolidayInfo {
  isHoliday: boolean;
  name?: string;
}

/**
 * Check if a given date is a recognized paid holiday.
 * Returns { isHoliday, name? }.
 */
export function getHolidayInfo(dateInput: Date | string): HolidayInfo {
  const d = typeof dateInput === 'string' ? new Date(dateInput + 'T12:00:00') : dateInput;
  const y = d.getFullYear();

  const list: { date: Date; name: string }[] = [
    { date: new Date(y, 0, 1), name: "New Year's Day" },
    { date: nthWeekdayOfMonth(y, 0, 1, 3), name: 'Martin Luther King Jr. Day' }, // 3rd Monday of January
    { date: nthWeekdayOfMonth(y, 1, 1, 3), name: "Presidents' Day" },             // 3rd Monday of February
    { date: lastWeekdayOfMonth(y, 4, 1), name: 'Memorial Day' },                   // last Monday of May
    { date: new Date(y, 5, 19), name: 'Juneteenth' },
    { date: new Date(y, 6, 4), name: 'Independence Day' },
    { date: nthWeekdayOfMonth(y, 8, 1, 1), name: 'Labor Day' },                    // 1st Monday of September
    { date: nthWeekdayOfMonth(y, 10, 4, 4), name: 'Thanksgiving Day' },            // 4th Thursday of November
    { date: new Date(y, 11, 25), name: 'Christmas Day' },
  ];

  for (const h of list) {
    if (sameDay(d, h.date)) return { isHoliday: true, name: h.name };
  }
  return { isHoliday: false };
}

/** Convenience boolean check. */
export function isHoliday(dateInput: Date | string): boolean {
  return getHolidayInfo(dateInput).isHoliday;
}
