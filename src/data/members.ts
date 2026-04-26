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
  /**
   * Firebase Auth uid linked to this member, when one exists. Set by the
   * admin "Create Account" flow and by self-signups; absent for seed members
   * who haven't logged in yet.
   */
  firebaseUid?: string;
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

// Seeded username → memberId map. Production keeps the username mapping (the
// sign-in flow looks up which Member a typed username points at, then asks
// Firebase to verify the password) but strips the seed passwords so they
// never ship in the App Store JS bundle.
//
// In dev, the literal passwords are kept for two reasons:
// 1. First-sign-in seeding — firebaseSignInOrSeedAccount creates the real
//    Firebase Auth record using the password the user typed. The seed
//    password is what the dev *types* on first run; subsequent sign-ins go
//    straight through Firebase.
// 2. Offline fallback — SignInScreen.legacyLocalSignIn (only fires when
//    !FIREBASE_CONFIGURED) compares cred.password literally so devs can
//    work without Firebase reachable.
//
// Firebase Auth is the source of truth in any production iOS build, so the
// stripped (empty) seed passwords are harmless: the legacy path can't fire
// (FIREBASE_CONFIGURED is true), and the empty-string check at the top of
// handleSignIn refuses empty passwords before they reach the comparison.
const SEED_USERNAMES: Record<string, string> = {
  'sensei.tim': '1',
  'tim@zenkidojo.com': '1',
  'matt.b': '2',
  'mattbrowntheemail@gmail.com': '2',
  apple: '3',
  admin: '4',
  reviewer: '5',
  'reviewer@zenkidojo.com': '5',
};

const DEV_SEED_PASSWORDS: Record<string, string> = {
  'sensei.tim': 'password',
  'tim@zenkidojo.com': 'password',
  'matt.b': 'password',
  'mattbrowntheemail@gmail.com': 'password',
  apple: 'password',
  admin: 'password',
  reviewer: 'ZenkiTest2026!',
  'reviewer@zenkidojo.com': 'ZenkiTest2026!',
};

export const CREDENTIALS: Record<string, { password: string; memberId: string }> =
  Object.fromEntries(
    Object.entries(SEED_USERNAMES).map(([username, memberId]) => [
      username,
      { password: __DEV__ ? (DEV_SEED_PASSWORDS[username] ?? '') : '', memberId },
    ]),
  );

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
