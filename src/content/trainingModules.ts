/**
 * Tutorial content for the in-app Training section.
 *
 * One entry per module shown on the Home Training grid. Keep copy tight:
 * `whatItIs` is the 1-2 sentence "what even is this" pitch, `howToUse` is
 * the numbered walkthrough. No pro tips here — content only.
 *
 * To bump the revision (so anyone who saw the old copy sees the new one on
 * next launch), bump TRAINING_CONTENT_VERSION at the bottom.
 */

import type { Ionicons } from '@expo/vector-icons';

/** Keys into the active ThemeContext `colors` object. */
export type TrainingAccentToken =
  | 'red'
  | 'gold'
  | 'success'
  | 'info'
  | 'warning'
  | 'flames';

export type TrainingModuleId =
  | 'hr'
  | 'workout'
  | 'food'
  | 'weight'
  | 'timers'
  | 'bodylab'
  | 'gps'
  | 'report';

export type TrainingModule = {
  id: TrainingModuleId;
  /** Displayed on both the home tile and the detail hero. */
  title: string;
  /** One-line description shown under the title on the home tile. */
  subtitle: string;
  /** Ionicon glyph name (@expo/vector-icons Ionicons). */
  icon: keyof typeof Ionicons.glyphMap;
  /** Token into the active theme's `colors` — screens resolve this at render. */
  accentToken: TrainingAccentToken;
  sections: {
    whatItIs: string;
    howToUse: string[];
  };
};

export const TRAINING_MODULES: TrainingModule[] = [
  {
    id: 'hr',
    title: 'HR Session',
    subtitle: 'Train by zone with a Bluetooth HR monitor',
    icon: 'heart',
    accentToken: 'red',
    sections: {
      whatItIs:
        'Connect a Bluetooth HR monitor and train by zone (Z1 to Z5) in real time. Zones personalize to your age and resting HR.',
      howToUse: [
        'Pair your HR monitor in iPhone Bluetooth settings',
        'Open HR Session → pick an Activity Type (Martial Arts, HIIT, Yoga, etc.)',
        'Wet the chest-strap electrodes, put it on, tap Start',
        'Train. Tap Stop to save. The session feeds your Weekly Report',
      ],
    },
  },
  {
    id: 'workout',
    title: 'Workout',
    subtitle: 'Log sessions, track PRs, see trends',
    icon: 'barbell',
    accentToken: 'gold',
    sections: {
      whatItIs:
        'Three tabs: Log (record sessions), PRs (new records auto-detected), Stats (trends over time).',
      howToUse: [
        'Open Workout → Log tab → Log a Workout',
        'Add exercises, sets, reps, weight → Save',
        'Check PRs for any records you just hit',
        'Check Stats weekly for volume and frequency trends',
      ],
    },
  },
  {
    id: 'food',
    title: 'Food Log',
    subtitle: 'Macros by search, barcode, or photo',
    icon: 'restaurant-outline',
    accentToken: 'success',
    sections: {
      whatItIs:
        'Daily macro tracker with a personalized calorie goal and P/C/F breakdown. Add food three ways: Search, Barcode, AI Photo.',
      howToUse: [
        'First time: Set Personalized Targets → enter your stats → confirm macros',
        'Pick a day on the calendar, tap Add Food',
        'Choose Search (whole foods), Barcode (packaged), or AI Photo (restaurant)',
        'Confirm the parsed entry',
      ],
    },
  },
  {
    id: 'weight',
    title: 'Weight',
    subtitle: 'Daily weigh-ins with trend views',
    icon: 'scale-outline',
    accentToken: 'info',
    sections: {
      whatItIs:
        'Daily weigh-in log with 7D / 14D / 30D / All trend views. Raw daily weight is noise from water and sodium. The trend line is signal.',
      howToUse: [
        'Tap Log Weight → enter weight → add an optional note → Save',
        'Switch between 7D / 14D / 30D / All to see trends',
        'Tap Set Goal to add a target',
      ],
    },
  },
  {
    id: 'timers',
    title: 'Timers',
    subtitle: 'Round, HIIT, stopwatch, meditation',
    icon: 'timer-outline',
    accentToken: 'warning',
    sections: {
      whatItIs:
        'Four modes: Round (work/rest with round count), HIIT (short bursts), Watch (stopwatch), Meditate (silent countdown).',
      howToUse: [
        'Open Timer, pick a mode tab',
        'Round: set work, rest, rounds (defaults to 3:00 / 1:00 / 5 for boxing)',
        'HIIT: set burst/rest (e.g. 30s / 15s), total rounds',
        'Tap Start. Phone vibrates on transitions',
      ],
    },
  },
  {
    id: 'bodylab',
    title: 'Body Lab',
    subtitle: 'DEXA + bloodwork + Health Score',
    icon: 'medkit-outline',
    accentToken: 'red',
    sections: {
      whatItIs:
        'Health dashboard with four tabs: Dash (Health Score + body comp), DEXA (upload scans), Blood (upload panels), Info (marker explainer).',
      howToUse: [
        'Open Body Lab → Dash for the overview',
        'DEXA tab → Upload → pick PDF or photo → AI extracts values → confirm',
        'Blood tab → Upload → review parsed markers → confirm',
        'Tap any flagged marker to see what it means',
      ],
    },
  },
  {
    id: 'gps',
    title: 'GPS',
    subtitle: 'Run, walk, bike, hike. Mapped and logged.',
    icon: 'navigate-outline',
    accentToken: 'info',
    sections: {
      whatItIs:
        'Outdoor activity tracker with a live map. Four modes: Run, Walk, Bike, Hike. Four tabs per session: Stats, Map, Data, Radio.',
      howToUse: [
        'Open GPS → pick Run / Walk / Bike / Hike',
        'Wait for GPS lock (indicator turns green)',
        'Tap Start → swipe between tabs for pace, map, or splits',
        'Tap Stop → review summary → Save',
      ],
    },
  },
  {
    id: 'report',
    title: 'Weekly Report',
    subtitle: 'Weekly summary with AI insights',
    icon: 'bar-chart-outline',
    accentToken: 'gold',
    sections: {
      whatItIs:
        'Weekly summary with totals (Activities, Time, Calories), Progress (Day Streak, Diamonds, Badges), Daily Breakdown, and AI-generated Insights.',
      howToUse: [
        'Open Report → read top totals',
        'Check Day Streak + Diamonds + Badges',
        'Scroll the Daily Breakdown bar chart',
        'Read Insights last. It suggests a focus for next week',
      ],
    },
  },
];

/** Bump to invalidate cached content if we ever gate this. */
export const TRAINING_CONTENT_VERSION = 1;
