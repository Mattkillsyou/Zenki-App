// ──────────────────────────────────────────────────────────
// MEMBER DATABASE
// As the owner, edit this file to manage members.
//
// Belt levels: 'white' | 'blue' | 'purple' | 'brown' | 'black'
// Stripes: 0-4 per belt
//
// To add a new member:
//   1. Copy any member block below
//   2. Give them a unique id and username
//   3. Set belt/stripes, isAdmin: false
//
// To promote a belt level:
//   Change belt to the next level, reset stripes to 0
//
// To add a stripe:
//   Increment stripes (max 4)
// ──────────────────────────────────────────────────────────

export type BeltLevel = 'none' | 'white' | 'blue' | 'purple' | 'brown' | 'black';

export interface Member {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  belt: BeltLevel;
  stripes: number;
  memberSince: string; // YYYY-MM-DD
  isAdmin: boolean;
  isEmployee?: boolean;
  hourlyRate?: number;
  profilePhoto?: string; // URI from device
  totalSessions: number;
  weekStreak: number;
  pushToken?: string; // Expo push token for notifications
}

export const MEMBERS: Member[] = [
  {
    id: '1',
    username: 'sensei.tim',
    firstName: 'Sensei',
    lastName: 'Tim',
    email: 'tim@zenkidojo.com',
    belt: 'black',
    stripes: 3,
    memberSince: '1997-01-01',
    isAdmin: true,
    totalSessions: 5000,
    weekStreak: 52,
  },
  {
    id: '2',
    username: 'matt.b',
    firstName: 'Matt',
    lastName: 'B',
    email: 'matt@example.com',
    belt: 'white',
    stripes: 3,
    memberSince: '2024-01-15',
    isAdmin: true,
    totalSessions: 156,
    weekStreak: 12,
  },
  {
    id: '3',
    username: 'apple',
    firstName: 'Apple',
    lastName: '',
    email: 'apple@zenkidojo.com',
    belt: 'white',
    stripes: 0,
    memberSince: '2026-04-01',
    isAdmin: false,
    isEmployee: true,
    hourlyRate: 30,
    totalSessions: 0,
    weekStreak: 0,
  },
];

// Login credentials — username → { password, memberId }
export const CREDENTIALS: Record<string, { password: string; memberId: string }> = {
  admin: { password: 'password', memberId: '2' },
  apple: { password: 'password', memberId: '3' },
};

export const BELT_ORDER: BeltLevel[] = ['none', 'white', 'blue', 'purple', 'brown', 'black'];

export const BELT_DISPLAY_COLORS: Record<BeltLevel, string> = {
  none: '#71717A',
  white: '#F5F5F5',
  blue: '#1565C0',
  purple: '#7B1FA2',
  brown: '#5D4037',
  black: '#212121',
};

export const BELT_LABELS: Record<BeltLevel, string> = {
  none: 'N/A',
  white: 'White',
  blue: 'Blue',
  purple: 'Purple',
  brown: 'Brown',
  black: 'Black',
};
