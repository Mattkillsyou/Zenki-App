export interface TimeEntry {
  id: string;
  date: string;                  // YYYY-MM-DD
  clockIn: string;               // ISO 8601
  clockOut: string | null;
  lunchTaken: boolean;
  breakTaken: boolean;
  totalMinutes: number | null;   // Raw minutes worked
  paidMinutes: number | null;    // totalMinutes - 75 (auto-deducted), floored at 0
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
