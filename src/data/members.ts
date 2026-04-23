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
  funFact?: string;   // Fun fact shown on profile, captured in onboarding
  nickname?: string;  // Optional nickname / title shown next to display name
  isVisibleInFeed?: boolean;   // Whether this member shows up in the community feed (default true)
  messagingEnabled?: boolean;  // Whether other members can DM them (default true)
  biologicalSex?: 'male' | 'female' | 'other';  // Used for health feature personalization
  trainingExperience?: 'beginner' | 'intermediate' | 'advanced'; // Captured at onboarding
  trainingDaysPerWeek?: number; // 1-7, planned training frequency
  injuries?: string[]; // body-part tags: 'shoulder', 'knee', 'back', etc.
}

export type BiologicalSex = 'male' | 'female' | 'other';

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
    lastName: 'Brown',
    email: 'mattbrowntheemail@gmail.com',
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
    hourlyRate: 20,
    totalSessions: 0,
    weekStreak: 0,
  },
  {
    id: '4',
    username: 'admin',
    firstName: 'Admin',
    lastName: '',
    email: 'admin@zenkidojo.com',
    belt: 'black',
    stripes: 4,
    memberSince: '2026-04-17',
    isAdmin: true,
    totalSessions: 0,
    weekStreak: 0,
  },
  {
    // App Store review demo account — documented in APP_REVIEWER.md
    id: '5',
    username: 'reviewer',
    firstName: 'App',
    lastName: 'Reviewer',
    email: 'reviewer@zenkidojo.com',
    belt: 'white',
    stripes: 0,
    memberSince: '2026-04-19',
    isAdmin: false,
    totalSessions: 8,
    weekStreak: 2,
    funFact: 'Demo account for Apple App Review',
  },
];

// Seeded test credentials — username → { password, memberId }.
//
// On the first sign-in attempt for a seeded account, SignInScreen calls
// firebaseSignInOrSeedAccount which creates the real Firebase Auth record
// using the password the user typed. Subsequent sign-ins go straight through
// Firebase. The default passwords below are only used on that first attempt,
// and only survive until the user changes their password (via
// Settings → Change Password, which calls updatePassword on Firebase).
//
// For offline / Firebase-unavailable dev, SignInScreen has a legacy
// CREDENTIALS-only path that accepts these passwords literally.
export const CREDENTIALS: Record<string, { password: string; memberId: string }> = {
  'sensei.tim': { password: 'password', memberId: '1' },
  'tim@zenkidojo.com': { password: 'password', memberId: '1' },
  'matt.b': { password: 'password', memberId: '2' },
  'mattbrowntheemail@gmail.com': { password: 'password', memberId: '2' },
  apple: { password: 'password', memberId: '3' },
  admin: { password: 'password', memberId: '4' },
  reviewer: { password: 'ZenkiTest2026!', memberId: '5' },
  'reviewer@zenkidojo.com': { password: 'ZenkiTest2026!', memberId: '5' },
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
