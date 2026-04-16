// Dojo class schedule — shared between ScheduleScreen and HomeScreen.
// Edit this file to update the weekly class offering.

export type ClassType = 'jiu-jitsu' | 'muay-thai' | 'pilates' | 'open-mat';

export interface ScheduleEntry {
  name: string;
  instructor: string;
  time: string;
  duration: string;
  spotsLeft: number;
  type: ClassType;
}

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export const SCHEDULES: Record<string, ScheduleEntry[]> = {
  Mon: [
    { name: 'Group Workout',       instructor: 'Carnage',      time: '11:00 AM', duration: '60 min', spotsLeft: 8, type: 'open-mat' },
    { name: 'Jiu-Jitsu (Adults)',  instructor: 'Sensei Tim',   time: '12:00 PM', duration: '60 min', spotsLeft: 6, type: 'jiu-jitsu' },
    { name: 'Kids Jiu-Jitsu',      instructor: 'Sensei Tim',   time: '6:30 PM',  duration: '45 min', spotsLeft: 8, type: 'jiu-jitsu' },
  ],
  Tue: [
    { name: 'Muay Thai',           instructor: 'Carnage',      time: '12:00 PM', duration: '60 min', spotsLeft: 7, type: 'muay-thai' },
    { name: 'Muay Thai',           instructor: 'Justin',       time: '5:00 PM',  duration: '60 min', spotsLeft: 8, type: 'muay-thai' },
    { name: 'Open Mat',            instructor: 'Self-guided',  time: '6:30 PM',  duration: '90 min', spotsLeft: 10,type: 'open-mat' },
  ],
  Wed: [
    { name: 'Jiu-Jitsu (Adults)',  instructor: 'Sensei Tim',   time: '12:00 PM', duration: '60 min', spotsLeft: 5, type: 'jiu-jitsu' },
    { name: 'Muay Thai',           instructor: 'Carnage',      time: '5:00 PM',  duration: '60 min', spotsLeft: 6, type: 'muay-thai' },
  ],
  Thu: [
    { name: 'Muay Thai',           instructor: 'Justin',       time: '12:00 PM', duration: '60 min', spotsLeft: 7, type: 'muay-thai' },
    { name: 'Open Mat',            instructor: 'Self-guided',  time: '5:00 PM',  duration: '90 min', spotsLeft: 10,type: 'open-mat' },
  ],
  Fri: [
    { name: 'Jiu-Jitsu (Adults)',  instructor: 'Sensei Tim',   time: '12:00 PM', duration: '60 min', spotsLeft: 6, type: 'jiu-jitsu' },
  ],
  Sat: [
    { name: 'Open Mat',            instructor: 'Self-guided',  time: '10:00 AM', duration: '120 min', spotsLeft: 10,type: 'open-mat' },
  ],
  Sun: [],
};

export const PILATES_ENTRY: ScheduleEntry = {
  name: 'Mobility / Pilates',
  instructor: 'Rachel',
  time: 'By Appointment',
  duration: '50 min',
  spotsLeft: 1,
  type: 'pilates',
};

/** Returns today's classes (DAYS[0]=Mon). */
export function getTodaysSchedule(): ScheduleEntry[] {
  const dayOfWeek = new Date().getDay(); // 0=Sun
  const idx = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Convert to Mon=0
  const dayKey = DAYS[idx];
  return SCHEDULES[dayKey] || [];
}
