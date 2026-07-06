/**
 * senpaiBond — the durable relationship "bond file" (H2/H3, fixes C3).
 *
 * A small versioned blob per account in AsyncStorage: first-met date,
 * days-together counter, best streak witnessed, milestone trophy list,
 * interaction counters, and up to 10 user-confirmed facts. This module is
 * PURE — types, math, migration, tier derivation, and formatting only. No
 * React, no AsyncStorage: ownership/persistence live in SenpaiContext (the
 * G1 debounced-writer pattern), event wiring lives in SenpaiReactionBridge,
 * and the chat summary is packed in useSenpaiChat. Everything derives from
 * this one module so the context, bridge, chat hook, and MemoryScreen can
 * never disagree about what the bond means.
 */

import { safeParseJSON } from '../utils/safeStorage';
import type { BondSlots } from '../data/senpaiDialogue';

// ── shape v1 ──────────────────────────────────────────────────────────────

export const BOND_VERSION = 1 as const;
export const BOND_KEY_BASE = '@zenki_senpai_bond'; // per-account: `${BOND_KEY_BASE}:${accountId}`
// 'guest' bucket when signed out — mirrors memoryKeyFor/historyKeyFor (F4).
export const bondKeyFor = (accountId: string) => `${BOND_KEY_BASE}:${accountId}`;

// Caps (enforced in the pure mutators): milestones ≤ 20, facts ≤ 10 × ≤ 120
// chars → the whole blob stays well under 8 KB.
export const MILESTONE_CAP = 20;
export const FACT_CAP = 10;
export const FACT_MAX_LEN = 120;
export const MILESTONE_LABEL_MAX = 60;

export type BondMilestoneType =
  | 'first_met'
  | 'first_workout'
  | 'first_pr'
  | 'best_streak'
  | 'anniversary'
  | 'bond_level'
  | 'comeback'
  | 'level'; // 'level' = user gam-level landmarks (5, 10, …)

export interface BondMilestone {
  id: string; // `${type}:${date}:${value ?? ''}` — natural key, dedupes re-fires
  type: BondMilestoneType;
  label: string; // display copy, ≤60 chars ("First PR together", "Best streak yet — 9 days")
  date: string; // YYYY-MM-DD (UTC slice, same convention as GamificationContext)
  value?: number;
}

export interface BondFact {
  id: string;
  text: string; // ≤120 chars, user-confirmed
  addedAt: string; // YYYY-MM-DD
}

export interface SenpaiBond {
  v: typeof BOND_VERSION;
  firstEnabledAt: string; // YYYY-MM-DD — "the day we met" (scalar so it survives milestone-list capping)
  activeDays: number; // distinct days with any Senpai activity
  lastDayCounted: string; // YYYY-MM-DD dedupe for activeDays (idempotent under double-invoked updaters)
  bestStreakSeen: number; // max streak witnessed (seeded from gamState.longestStreak by the bridge)
  totalChats: number; // successful user chat sends (crisis short-circuits count too — she was there)
  workoutsSeen: number; // totalSessions increments observed while enabled
  prsSeen: number;
  firstPRDate: string | null;
  reactionsWitnessed: number; // every triggerReaction while enabled
  lastTierSeen: number; // for the one-shot bond-level-up celebration (starts 1)
  milestones: BondMilestone[]; // cap 20, drop oldest on overflow
  facts: BondFact[]; // cap 10, drop oldest on overflow
}

// ── small shared helpers ─────────────────────────────────────────────────

export const todayISO = () => new Date().toISOString().slice(0, 10);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isDateString = (s: unknown): s is string => typeof s === 'string' && DATE_RE.test(s);

const clampCount = (v: unknown, min = 0): number =>
  typeof v === 'number' && Number.isFinite(v)
    ? Math.min(1_000_000, Math.max(min, Math.floor(v)))
    : min;

let nextFactId = 0;
const makeFactId = () => `fact_${Date.now()}_${nextFactId++}`;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Format a YYYY-MM-DD bond date for display ("Mar 12", or "Mar 12 2025" when
 * not the current year). Parsed by parts — `new Date('YYYY-MM-DD')` is UTC
 * midnight and shifts a day in negative offsets.
 */
export function formatBondDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  const label = `${MONTHS[Number(m[2]) - 1] ?? '?'} ${Number(m[3])}`;
  return Number(m[1]) === new Date().getFullYear() ? label : `${label} ${m[1]}`;
}

// ── init & derived math ──────────────────────────────────────────────────

/** A fresh day-1 bond: today is the day we met, and it counts. */
export function initBond(today: string = todayISO()): SenpaiBond {
  return {
    v: BOND_VERSION,
    firstEnabledAt: today,
    activeDays: 1,
    lastDayCounted: today,
    bestStreakSeen: 0,
    totalChats: 0,
    workoutsSeen: 0,
    prsSeen: 0,
    firstPRDate: null,
    reactionsWitnessed: 0,
    lastTierSeen: 1,
    milestones: [
      { id: `first_met:${today}:`, type: 'first_met', label: 'The day we met', date: today },
    ],
    facts: [],
  };
}

/** Whole days elapsed since the first-met date (UTC day math, never negative). */
export function daysSinceMet(bond: SenpaiBond, now: Date = new Date()): number {
  const met = Date.parse(`${bond.firstEnabledAt}T00:00:00Z`);
  if (Number.isNaN(met)) return 0;
  const today = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
  return Math.max(0, Math.floor((today - met) / 86_400_000));
}

// ── H3: bond tiers — derived on read, never stored ───────────────────────
// Gates use activeDays (time cannot be grinded) plus an interaction floor.

export const BOND_TIERS = [
  { tier: 1, name: 'New Save File', minActiveDays: 0, minScore: 0 },
  { tier: 2, name: 'Regular', minActiveDays: 7, minScore: 0 },
  { tier: 3, name: 'Favorite Mortal', minActiveDays: 21, minScore: 25 },
  { tier: 4, name: 'Inner Circle', minActiveDays: 60, minScore: 80 },
  { tier: 5, name: 'MINE 💕', minActiveDays: 150, minScore: 250 },
] as const;

export const bondScore = (bond: SenpaiBond): number =>
  bond.totalChats + bond.workoutsSeen * 2 + bond.prsSeen * 3;

export function tierNameFor(tier: number): string {
  return BOND_TIERS.find((t) => t.tier === tier)?.name ?? BOND_TIERS[BOND_TIERS.length - 1].name;
}

export interface BondTier {
  tier: number;
  name: string;
  /** min of the ratios toward the NEXT tier's gates, 0..1 (1 at max tier). */
  progress: number;
}

export function deriveBondTier(bond: SenpaiBond): BondTier {
  const score = bondScore(bond);
  let current: (typeof BOND_TIERS)[number] = BOND_TIERS[0];
  for (const t of BOND_TIERS) {
    if (bond.activeDays >= t.minActiveDays && score >= t.minScore) current = t;
  }
  const next = BOND_TIERS.find((t) => t.tier === current.tier + 1);
  if (!next) return { tier: current.tier, name: current.name, progress: 1 };
  const ratios = [next.minActiveDays > 0 ? bond.activeDays / next.minActiveDays : 1];
  if (next.minScore > 0) ratios.push(score / next.minScore);
  const progress = Math.max(0, Math.min(1, Math.min(...ratios)));
  return { tier: current.tier, name: current.name, progress };
}

// ── anniversaries ────────────────────────────────────────────────────────

// 7, 30, 100 days, then every 365 (365, 730, …).
const ANNIVERSARY_BASE = [7, 30, 100] as const;

/**
 * Highest anniversary threshold that daysSinceMet has crossed but hasn't been
 * acknowledged yet, or null. If several were crossed while away, only the
 * highest fires (once per threshold ever — ack stores the threshold).
 */
export function nextAnniversaryCrossed(elapsedDays: number, lastAckedDay: number): number | null {
  let best: number | null = null;
  for (const d of ANNIVERSARY_BASE) {
    if (d <= elapsedDays && d > lastAckedDay) best = d;
  }
  const years = Math.floor(elapsedDays / 365);
  if (years >= 1) {
    const y = years * 365;
    if (y > lastAckedDay && (best === null || y > best)) best = y;
  }
  return best;
}

// ── events — the only way the bond mutates ───────────────────────────────

export type BondEvent =
  | { type: 'day' } // touch activeDays (dedup by lastDayCounted)
  | { type: 'chat' } // totalChats++
  | { type: 'workout' } // workoutsSeen++ (+ 'first_workout' milestone on 0→1)
  | { type: 'pr' } // prsSeen++ (+ firstPRDate/'first_pr' milestone on first)
  | { type: 'streakSeen'; days: number; seed?: boolean } // bestStreakSeen = max(…); seed = silent history import, no milestone
  | { type: 'anniversary'; days: number } // 'anniversary' milestone
  | { type: 'comeback' } // 'comeback' milestone (rides the existing streak-break ack)
  | { type: 'level'; level: number } // gam-level landmark milestone (5, 10, …)
  | { type: 'tierSeen'; tier: number }; // lastTierSeen = max(…) + 'bond_level' milestone

/** Count today as a day together, once. Returns the SAME object when already counted. */
function touchDay(bond: SenpaiBond, today: string): SenpaiBond {
  if (bond.lastDayCounted === today) return bond;
  return { ...bond, activeDays: bond.activeDays + 1, lastDayCounted: today };
}

/** Append a milestone (dedupe by natural-key id, cap 20, drop oldest). */
function addMilestone(
  bond: SenpaiBond,
  type: BondMilestoneType,
  label: string,
  date: string,
  value?: number,
): SenpaiBond {
  const id = `${type}:${date}:${value ?? ''}`;
  if (bond.milestones.some((m) => m.id === id)) return bond;
  const milestone: BondMilestone = {
    id,
    type,
    label: label.slice(0, MILESTONE_LABEL_MAX),
    date,
    ...(value !== undefined ? { value } : {}),
  };
  const next = [...bond.milestones, milestone];
  return {
    ...bond,
    milestones: next.length > MILESTONE_CAP ? next.slice(next.length - MILESTONE_CAP) : next,
  };
}

/**
 * Pure reducer — the single write path for every bond mutation. Every event
 * also touches the day counter, so ANY interaction on a new calendar day
 * counts the day. Deterministic given (bond, event, today); returns the same
 * reference when nothing changed so setState can bail out of re-renders.
 */
export function applyBondEvent(bond: SenpaiBond, e: BondEvent, today: string = todayISO()): SenpaiBond {
  let next = touchDay(bond, today);
  switch (e.type) {
    case 'day':
      break;
    case 'chat':
      next = { ...next, totalChats: next.totalChats + 1 };
      break;
    case 'workout': {
      const first = next.workoutsSeen === 0;
      next = { ...next, workoutsSeen: next.workoutsSeen + 1 };
      if (first) next = addMilestone(next, 'first_workout', 'First workout together', today);
      break;
    }
    case 'pr': {
      next = { ...next, prsSeen: next.prsSeen + 1 };
      if (next.firstPRDate === null) {
        next = { ...next, firstPRDate: today };
        next = addMilestone(next, 'first_pr', 'First PR together', today);
      }
      break;
    }
    case 'streakSeen': {
      const days = clampCount(e.days);
      if (days > next.bestStreakSeen) {
        next = { ...next, bestStreakSeen: days };
        // Milestone only for a genuinely WITNESSED new best worth bragging
        // about — the bridge's first-run history seed imports silently.
        if (!e.seed && days >= 5) {
          next = addMilestone(next, 'best_streak', `Best streak yet — ${days} days`, today, days);
        }
      }
      break;
    }
    case 'anniversary':
      next = addMilestone(next, 'anniversary', `${e.days} days together`, today, clampCount(e.days));
      break;
    case 'comeback':
      next = addMilestone(next, 'comeback', 'Came back after a broken streak', today);
      break;
    case 'level':
      next = addMilestone(next, 'level', `Reached level ${e.level}`, today, clampCount(e.level));
      break;
    case 'tierSeen': {
      const tier = clampCount(e.tier, 1);
      if (tier > next.lastTierSeen) {
        next = { ...next, lastTierSeen: tier };
        next = addMilestone(next, 'bond_level', `Bond level ${tier} — ${tierNameFor(tier)}`, today, tier);
      }
      break;
    }
  }
  return next;
}

// ── facts (user-confirmed, cap 10 × ≤120 chars) ──────────────────────────

export function bondHasFact(bond: SenpaiBond, text: string): boolean {
  const needle = text.trim().toLowerCase();
  return bond.facts.some((f) => f.text.toLowerCase() === needle);
}

/** Append a fact (assumes the duplicate check already ran); drops the oldest at the cap. */
export function addFactToBond(bond: SenpaiBond, text: string, today: string = todayISO()): SenpaiBond {
  const fact: BondFact = { id: makeFactId(), text: text.trim().slice(0, FACT_MAX_LEN), addedAt: today };
  const next = [...bond.facts, fact];
  return { ...bond, facts: next.length > FACT_CAP ? next.slice(next.length - FACT_CAP) : next };
}

export function removeFactFromBond(bond: SenpaiBond, id: string): SenpaiBond {
  if (!bond.facts.some((f) => f.id === id)) return bond;
  return { ...bond, facts: bond.facts.filter((f) => f.id !== id) };
}

// ── versioning / migration ───────────────────────────────────────────────

const KNOWN_MILESTONE_TYPES: ReadonlySet<string> = new Set([
  'first_met',
  'first_workout',
  'first_pr',
  'best_streak',
  'anniversary',
  'bond_level',
  'comeback',
  'level',
]);

/**
 * Field-by-field v1 validation (same philosophy as isMemoryEntry): types,
 * string caps, array element shape, numbers clamped to [0, 1e6]. Returns a
 * freshly-built normalized bond, or null when the anchor (firstEnabledAt)
 * is unusable — corrupt blobs re-init rather than crash.
 */
function validateV1(parsed: Record<string, unknown>): SenpaiBond | null {
  if (!isDateString(parsed.firstEnabledAt)) return null;
  const firstEnabledAt = parsed.firstEnabledAt;

  const milestones: BondMilestone[] = (Array.isArray(parsed.milestones) ? parsed.milestones : [])
    .filter(
      (m: any): m is BondMilestone =>
        !!m &&
        typeof m === 'object' &&
        typeof m.id === 'string' &&
        typeof m.type === 'string' &&
        KNOWN_MILESTONE_TYPES.has(m.type) &&
        typeof m.label === 'string' &&
        isDateString(m.date) &&
        (m.value === undefined || typeof m.value === 'number'),
    )
    .map((m) => ({
      id: m.id,
      type: m.type,
      label: m.label.slice(0, MILESTONE_LABEL_MAX),
      date: m.date,
      ...(typeof m.value === 'number' ? { value: clampCount(m.value) } : {}),
    }))
    .slice(-MILESTONE_CAP);

  const facts: BondFact[] = (Array.isArray(parsed.facts) ? parsed.facts : [])
    .filter(
      (f: any): f is BondFact =>
        !!f &&
        typeof f === 'object' &&
        typeof f.id === 'string' &&
        typeof f.text === 'string' &&
        f.text.trim().length > 0 &&
        isDateString(f.addedAt),
    )
    .map((f) => ({ id: f.id, text: f.text.slice(0, FACT_MAX_LEN), addedAt: f.addedAt }))
    .slice(-FACT_CAP);

  return {
    v: BOND_VERSION,
    firstEnabledAt,
    activeDays: clampCount(parsed.activeDays),
    lastDayCounted: isDateString(parsed.lastDayCounted) ? parsed.lastDayCounted : firstEnabledAt,
    bestStreakSeen: clampCount(parsed.bestStreakSeen),
    totalChats: clampCount(parsed.totalChats),
    workoutsSeen: clampCount(parsed.workoutsSeen),
    prsSeen: clampCount(parsed.prsSeen),
    firstPRDate: isDateString(parsed.firstPRDate) ? parsed.firstPRDate : null,
    reactionsWitnessed: clampCount(parsed.reactionsWitnessed),
    lastTierSeen: clampCount(parsed.lastTierSeen, 1),
    milestones,
    facts,
  };
}

function migrateBond(parsed: Record<string, unknown>): SenpaiBond | null {
  const v = parsed.v;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 1) return null;
  switch (v) {
    case 1:
      return validateV1(parsed);
    default:
      // Unknown/greater version (user downgraded the app): accept it only if
      // it passes v1 validation of the fields v1 knows — forward-tolerant.
      // Future shape changes bump BOND_VERSION and add a case mapping old→new.
      return validateV1(parsed);
  }
}

/**
 * Parse + migrate a stored bond blob. Corrupt → null (re-init; the caller
 * must never persist over a blob it failed to read — same rule as the
 * diary hydrate catch).
 */
export function hydrateBondFromRaw(raw: string | null): SenpaiBond | null {
  const parsed = safeParseJSON<Record<string, unknown> | null>(
    raw,
    null,
    (value) => !!value && typeof value === 'object' && !Array.isArray(value),
  );
  if (!parsed) return null;
  return migrateBond(parsed);
}

// ── chat summary (client → cloud function, re-validated server-side) ─────

export interface SenpaiBondSummary {
  firstMetDate: string;
  daysSinceMet: number;
  activeDays: number;
  tier: number;
  tierName: string;
  bestStreakSeen: number;
  totalChats: number;
  workoutsSeen: number;
  milestones: Array<{ label: string; date: string }>; // newest 6, label ≤60
  facts: string[]; // ≤10 × ≤120 chars, oldest first (server drops oldest on overflow)
}

export function buildBondSummary(bond: SenpaiBond): SenpaiBondSummary {
  const tier = deriveBondTier(bond);
  return {
    firstMetDate: bond.firstEnabledAt,
    daysSinceMet: daysSinceMet(bond),
    activeDays: bond.activeDays,
    tier: tier.tier,
    tierName: tier.name,
    bestStreakSeen: bond.bestStreakSeen,
    totalChats: bond.totalChats,
    workoutsSeen: bond.workoutsSeen,
    milestones: bond.milestones.slice(-6).map((m) => ({ label: m.label.slice(0, MILESTONE_LABEL_MAX), date: m.date })),
    facts: bond.facts.map((f) => f.text.slice(0, FACT_MAX_LEN)),
  };
}

// ── scripted-dialogue template slots (senpaiDialogue.ts registry) ────────
// The interface lives with the registry (data/senpaiDialogue.ts) — this is
// just the builder, so the slot names can never drift from the filler.

export function buildBondSlots(bond: SenpaiBond): BondSlots {
  const tier = deriveBondTier(bond);
  const slots: BondSlots = {
    // Day-ordinal ("day 1" on the day we met) — matches the Our Story card.
    days: String(daysSinceMet(bond) + 1),
    // Elapsed count (no +1) — for "{daysElapsed} days SINCE …" copy, which
    // must agree with the "{N} days together" anniversary milestone label.
    daysElapsed: String(daysSinceMet(bond)),
    tierName: tier.name,
    firstMet: formatBondDate(bond.firstEnabledAt),
  };
  // "your best was {bestStreak} days" needs a streak worth citing.
  if (bond.bestStreakSeen >= 3) slots.bestStreak = String(bond.bestStreakSeen);
  return slots;
}
