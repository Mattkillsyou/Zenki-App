export interface AttendanceVisit {
  id: string;
  memberId: string;
  memberName: string;
  date: string;        // YYYY-MM-DD (dedup key with memberId)
  checkInTime: string; // ISO 8601 timestamp
}

export interface AttendanceState {
  visits: AttendanceVisit[];
}
