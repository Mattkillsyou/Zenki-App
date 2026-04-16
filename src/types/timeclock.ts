export interface TimeEntry {
  id: string;
  date: string;                  // YYYY-MM-DD
  clockIn: string;               // ISO 8601
  clockOut: string | null;
  lunchTaken: boolean;
  breakTaken: boolean;
  totalMinutes: number | null;   // Raw minutes worked (clockIn → clockOut)
  paidMinutes: number | null;    // totalMinutes - auto meal deduction (CA law)
  mealDeductionMinutes: number | null; // Minutes auto-deducted for unpaid meal breaks
  isHoliday: boolean;            // Was this shift worked on a recognized holiday?
  holidayName?: string;          // e.g. "Memorial Day"
  synced: boolean;
}

export interface BiweeklyPeriod {
  startDate: string;             // YYYY-MM-DD (Monday)
  endDate: string;               // YYYY-MM-DD (Sunday, 14 days later)
  entries: TimeEntry[];
}

export interface TimeClockState {
  currentEntry: TimeEntry | null;
  currentPeriod: BiweeklyPeriod;
  history: BiweeklyPeriod[];
}
