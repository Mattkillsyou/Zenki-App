// ─────────────────────────────────────────────────────────────────────
// Date conventions for the Zenki Dojo app.
//
// The codebase deliberately uses three formats — one per semantic type.
// Picking the wrong format for a field is a bug; using a different format
// for the same semantic type is the chaos this module exists to prevent.
//
//   ┌──────────────────────────┬──────────────────────────┬───────────────────────┐
//   │ Semantic                 │ Format                   │ Examples              │
//   ├──────────────────────────┼──────────────────────────┼───────────────────────┤
//   │ Instant (point in time)  │ ISO 8601 with T + Z      │ 2026-05-04T17:30:00Z  │
//   │  e.g. createdAt, startsAt│ → `nowTimestamp()`       │                       │
//   ├──────────────────────────┼──────────────────────────┼───────────────────────┤
//   │ Calendar day (no time)   │ YYYY-MM-DD               │ 2026-05-04            │
//   │  e.g. date, dueDate,     │ → `todayDateString()`    │                       │
//   │       scanDate           │                          │                       │
//   ├──────────────────────────┼──────────────────────────┼───────────────────────┤
//   │ ISO week                 │ YYYY-Www                 │ 2026-W18              │
//   │  e.g. lastActiveWeek     │ → `currentIsoWeek()`     │                       │
//   └──────────────────────────┴──────────────────────────┴───────────────────────┘
//
// Rule of thumb when picking:
//   - If the field describes WHEN something happened down to the minute
//     (e.g. "user clicked save"), it's an INSTANT → use a timestamp.
//   - If the field describes WHICH DAY (e.g. "the day this dose was taken"
//     or "the date on a doctor's report"), it's a CALENDAR DAY → use
//     a date string. Two events on the same calendar day in different
//     time zones still belong to the same record.
//   - If the field aggregates by week (streak counters, weekly summaries),
//     it's an ISO WEEK.
// ─────────────────────────────────────────────────────────────────────

/** ISO 8601 timestamp for "right now". Use for `createdAt`, `updatedAt`,
 *  `startsAt`, `completedAt`, etc. — anything where minute-level precision
 *  matters. */
export function nowTimestamp(): string {
  return new Date().toISOString();
}

/** YYYY-MM-DD date string for "today", matching the existing app convention.
 *  Use for `date`, `dueDate`, `testDate`, `memberSince`, etc. — anything
 *  that names a calendar day, not a moment.
 *
 *  Some screens still ship a private 3-line `function todayISO()` that
 *  inlines this same expression. They're equivalent — over time, replace
 *  per-file helpers with this import. The reverse-export of this function
 *  as `getTodayString` from `utils/location` exists so existing call sites
 *  don't churn just to get the canonical name.
 *
 *  IMPLEMENTATION NOTE: this uses UTC (the date prefix of an ISO 8601
 *  timestamp). It WILL roll over at UTC midnight (so US Pacific users at
 *  5pm local on Sunday see "Monday"). Switching to local time is a
 *  behavior change that needs a data migration for existing AsyncStorage
 *  and Firestore values keyed by these strings — track in a follow-up.
 *
 *  Exception: `MedicationTrackerContext.tsx` uses LOCAL-time date strings
 *  via its own `isoDateOf()`. That's an intentional deviation for that
 *  context and is documented inline there. */
export function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Convert a Date instance to YYYY-MM-DD (UTC, matching the convention
 *  documented on `todayDateString`). */
export function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Pull the calendar-day portion out of a full ISO timestamp. Useful when
 *  you have a `createdAt` and want the calendar day it landed on. */
export function dateStringFromTimestamp(iso: string): string {
  // Slice the YYYY-MM-DD prefix when the string already starts with one
  // (it always does for valid ISO 8601). Avoids round-tripping through
  // Date — preserves whatever time zone the original ISO string was in.
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(iso);
  if (m) return m[1];
  // Fallback: parse and re-emit. Not ideal (TZ-shifts) but defensive.
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : toDateString(d);
}

/** Days between two YYYY-MM-DD strings (b - a). Returns NaN on bad input. */
export function daysBetween(a: string, b: string): number {
  const ta = Date.parse(a + 'T00:00:00');
  const tb = Date.parse(b + 'T00:00:00');
  if (Number.isNaN(ta) || Number.isNaN(tb)) return NaN;
  return Math.round((tb - ta) / 86400000);
}

/** Add `n` days to a YYYY-MM-DD string. */
export function addDays(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return toDateString(d);
}

/** ISO week identifier for a given Date — `YYYY-Www`. Used by Gamification's
 *  weekly streak tracking. The ISO week year may differ from the calendar
 *  year (Dec 30 might be week 1 of next year), which is why we can't just
 *  derive this from `getFullYear()`. */
export function isoWeek(d: Date = new Date()): string {
  // Copy so we don't mutate the caller's Date.
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  // Set to nearest Thursday: current date + 4 - current day number
  // (with Sunday treated as 7).
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/** Same as `isoWeek(new Date())` for callsite readability. */
export function currentIsoWeek(): string {
  return isoWeek();
}

/** Best-effort parse of a date string into a Date. Accepts:
 *    - ISO 8601 timestamps (`2026-05-04T17:30:00Z`)
 *    - Calendar dates (`2026-05-04` → midnight local time)
 *  Returns `null` on unparseable input rather than `Invalid Date`. */
export function safeParseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  return new Date(t);
}
