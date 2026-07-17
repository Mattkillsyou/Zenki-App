import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeParseJSON, safeStorageSet } from '../utils/safeStorage';
import { todayDateString as todayISO } from '../utils/dates';
import { WorkoutLog, PersonalRecord } from '../types/workout';
import { EXERCISES_BY_KEY } from '../data/exercises';
import { generateId } from '../utils/generateId';
import { useGamification } from './GamificationContext';
import { useAuth } from './AuthContext';
import { mergeById, markSyncedUnchanged, snapshotForPush } from '../services/syncCore';
import {
  pushLog, pushPR, flushLogs, flushPRs, subscribeTraining,
  migrateTrainingToFirestore, deleteLog, deletePR,
  isSyncableLog, isSyncablePR,
  type SyncedWorkoutLog, type SyncedPersonalRecord,
} from '../services/trainingSync';

const LOGS_KEY = '@zenki_workout_logs';
const PRS_KEY = '@zenki_personal_records';
/**
 * Per-uid marker that this DEVICE has uploaded its pre-existing training
 * history. Device-local on purpose (an AsyncStorage key can't know about other
 * handsets), so this runs once per device — which is safe only because every
 * write is keyed by the record's own stable `log_`/`pr_` id with merge:true.
 * Set only on success, so a failed migration retries on the next launch.
 */
const MIGRATED_KEY_PREFIX = '@zenki_training_migrated_v1';
const migratedKeyFor = (uid: string) => `${MIGRATED_KEY_PREFIX}:${uid}`;

// Diamonds for a logged workout come SOLELY from recordSession() (a logged
// workout == a training session); logWorkout no longer grants a second flat
// award on top, which previously double-counted. recordSession is also gated to
// once per day so re-logging ("Add Another") can't farm the session reward.
const POINTS_PER_PR = 50;

interface WorkoutContextValue {
  logs: WorkoutLog[];
  prs: PersonalRecord[];

  // Logs
  myLogs: (memberId: string) => WorkoutLog[];
  hasMemberLoggedToday: (memberId: string) => boolean;
  logWorkout: (log: Omit<WorkoutLog, 'id' | 'createdAt'>) => WorkoutLog;
  removeLog: (id: string) => void;

  // PRs
  myPRs: (memberId: string) => PersonalRecord[];
  prsForExercise: (memberId: string, exerciseKey: string) => PersonalRecord[];
  currentBest: (memberId: string, exerciseKey: string) => PersonalRecord | null;
  addPR: (pr: Omit<PersonalRecord, 'id' | 'createdAt'>) => PersonalRecord;
  removePR: (id: string) => void;
}

const WorkoutContext = createContext<WorkoutContextValue>({
  logs: [],
  prs: [],
  myLogs: () => [],
  hasMemberLoggedToday: () => false,
  logWorkout: () => ({} as WorkoutLog),
  removeLog: () => {},
  myPRs: () => [],
  prsForExercise: () => [],
  currentBest: () => null,
  addPR: () => ({} as PersonalRecord),
  removePR: () => {},
});


function genId(prefix: string): string {
  return generateId(prefix);
}

export function WorkoutProvider({ children }: { children: React.ReactNode }) {
  const [logs, setLogs] = useState<SyncedWorkoutLog[]>([]);
  const [prs, setPRs] = useState<SyncedPersonalRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const { awardPoints, deductPoints, recordSession } = useGamification();
  const { user } = useAuth();

  const uid = user?.firebaseUid ?? null;
  const memberId = user?.id ?? null;
  // Latest state for the sync effect to read without re-subscribing on every
  // keystroke-level change (the effect must run once per signed-in member).
  const logsRef = useRef<SyncedWorkoutLog[]>(logs);
  const prsRef = useRef<SyncedPersonalRecord[]>(prs);
  logsRef.current = logs;
  prsRef.current = prs;

  // Re-read on user change so sign-in / reviewer-seed writes are picked up.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [lRaw, pRaw] = await Promise.all([
          AsyncStorage.getItem(LOGS_KEY),
          AsyncStorage.getItem(PRS_KEY),
        ]);
        if (cancelled) return;
        const diskLogs = safeParseJSON<SyncedWorkoutLog[]>(lRaw, [], Array.isArray);
        const diskPRs = safeParseJSON<SyncedPersonalRecord[]>(pRaw, [], Array.isArray);
        // Union rather than replace, with anything already in state winning. This
        // effect re-runs on user change and races the sync effect: a wholesale
        // setLogs(disk) that resolved AFTER a server snapshot had merged would
        // overwrite those cloud rows — and since docChanges() only emits deltas,
        // they'd never be re-delivered for the session.
        const unionById = <T extends { id: string }>(disk: T[], live: T[]): T[] => {
          const byId = new Map<string, T>(disk.map((r) => [r.id, r]));
          for (const r of live) byId.set(r.id, r);
          return [...byId.values()];
        };
        setLogs((prev) => (prev.length === 0 ? diskLogs : unionById(diskLogs, prev)));
        setPRs((prev) => (prev.length === 0 ? diskPRs : unionById(diskPRs, prev)));
        // Only arm the persist effects when the hydrate actually SUCCEEDED.
        setLoaded(true);
      } catch (e) {
        // Audit 2.0.5 P2 (hydrate-wipe): flipping loaded=true after a failed
        // read armed the persist effects with EMPTY state — the next change
        // wrote [] over the stored logs/PRs, permanently destroying local
        // histories after one transient storage read failure. Leave persists
        // disabled for this session instead: new writes won't persist until
        // relaunch (rare, recoverable) but existing history is never clobbered.
        console.warn('[Workout] hydrate failed — persist disabled this session to protect stored data:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  useEffect(() => {
    if (loaded) safeStorageSet(LOGS_KEY, logs, '[Workout logs]');
  }, [logs, loaded]);

  useEffect(() => {
    if (loaded) safeStorageSet(PRS_KEY, prs, '[Workout PRs]');
  }, [prs, loaded]);

  // ── Cloud sync ──────────────────────────────────────────────────────
  // Training history used to live ONLY in AsyncStorage, so an app delete, a lost
  // phone or a new device destroyed it (LAUNCH_READINESS_REPORT.md:100 conceded
  // "lost on reinstall"). Firestore is now the source of truth; the AsyncStorage
  // arrays above stay as a cache + offline queue.
  useEffect(() => {
    if (!loaded || !uid || !memberId) return;
    let cancelled = false;

    // The legacy arrays are DEVICE-GLOBAL — they hold every member who ever
    // signed in on this handset. Only ever sync THIS member's rows, or another
    // member's history lands in this member's tree.
    const mine = <T extends { memberId: string }>(rows: T[]) => rows.filter((r) => r.memberId === memberId);
    const markSynced = <T extends { id: string }>(ids: Set<string>) => (rows: (T & { synced?: boolean })[]) =>
      ids.size ? rows.map((r) => (ids.has(r.id) ? { ...r, synced: true } : r)) : rows;

    (async () => {
      // 1. One-time upload of the history already on this device. This is the
      //    whole point: write-through only protects data created AFTER the
      //    update — everything logged before it is stranded here otherwise.
      try {
        const key = migratedKeyFor(uid);
        const already = await AsyncStorage.getItem(key);
        if (!already && !cancelled) {
          const myLogs = mine(logsRef.current);
          const myPRs = mine(prsRef.current);
          const { logIds, prIds } = await migrateTrainingToFirestore(uid, myLogs, myPRs);
          if (cancelled) return;
          setLogs(markSynced(logIds));
          setPRs(markSynced(prIds));
          // Mark done ONLY if every SYNCABLE row landed. Comparing against the
          // raw counts instead would be unsatisfiable forever whenever the member
          // owns even one permanently-unsyncable legacy row (migrate drops those
          // before writing), so the flag would never be set and the member's
          // ENTIRE history would re-upload on every cold start, for good.
          const wantLogs = myLogs.filter(isSyncableLog).length;
          const wantPRs = myPRs.filter(isSyncablePR).length;
          if (logIds.size >= wantLogs && prIds.size >= wantPRs) {
            await AsyncStorage.setItem(key, new Date().toISOString());
          } else {
            console.warn(
              `[Workout] training migration partial (${logIds.size}/${wantLogs} logs, ` +
              `${prIds.size}/${wantPRs} PRs) — retrying next launch`,
            );
          }
        }
      } catch (e) {
        console.warn('[Workout] training migration failed — retrying next launch:', e);
      }

      // 2. Flush anything still queued (failed write-throughs, prior partials).
      if (cancelled) return;
      try {
        // By-reference snapshot — a log/PR edited during the flush must stay
        // queued rather than be marked synced and dropped from the queue.
        const logsToPush = mine(logsRef.current);
        const prsToPush = mine(prsRef.current);
        const logsSnap = snapshotForPush(logsToPush);
        const prsSnap = snapshotForPush(prsToPush);
        const [okLogs, okPRs] = await Promise.all([
          flushLogs(uid, logsToPush),
          flushPRs(uid, prsToPush),
        ]);
        if (cancelled) return;
        setLogs((prev) => markSyncedUnchanged(prev, okLogs, logsSnap));
        setPRs((prev) => markSyncedUnchanged(prev, okPRs, prsSnap));
      } catch (e) {
        console.warn('[Workout] training flush failed:', e);
      }
    })();

    // 3. Live hydrate. mergeById, never wholesale replace: an empty or partial
    //    snapshot must not be able to wipe local rows, and a row that hasn't
    //    flushed yet has to survive a hydrate.
    // Reconcile deletes made on ANOTHER device while this one was closed: keep a
    // row only if it isn't this member's, or hasn't synced yet (a pending
    // upload), or still exists on the server. Anything else was deleted
    // elsewhere and docChanges() will never tell us.
    const reconcile = <T extends { id: string; memberId: string; synced?: boolean }>(serverIds: string[]) => {
      const server = new Set(serverIds);
      return (rows: T[]) => rows.filter((r) => r.memberId !== memberId || !r.synced || server.has(r.id));
    };

    const unsub = subscribeTraining(uid, (d) => {
      if (cancelled) return;
      if (d.logUpserts.length || d.logRemovedIds.length) {
        setLogs((prev) => mergeById(prev, d.logUpserts, d.logRemovedIds));
      }
      if (d.logAllIds) setLogs(reconcile<SyncedWorkoutLog>(d.logAllIds));
      if (d.prUpserts.length || d.prRemovedIds.length) {
        setPRs((prev) => mergeById(prev, d.prUpserts, d.prRemovedIds));
      }
      if (d.prAllIds) setPRs(reconcile<SyncedPersonalRecord>(d.prAllIds));
    });

    return () => { cancelled = true; unsub(); };
  }, [loaded, uid, memberId]);

  // ── Logs ────────────────────────────────────────────

  const myLogs = useCallback(
    (memberId: string) =>
      logs
        .filter((l) => l.memberId === memberId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [logs],
  );

  const hasMemberLoggedToday = useCallback(
    (memberId: string) => {
      const t = todayISO();
      return logs.some((l) => l.memberId === memberId && l.date === t);
    },
    [logs],
  );

  const logWorkout = useCallback(
    (log: Omit<WorkoutLog, 'id' | 'createdAt'>): WorkoutLog => {
      // synced:false is the queue marker, and it is set BEFORE the write is
      // attempted. An offline Firestore write hangs rather than failing, so if
      // the process dies mid-write there is nothing to catch — the record must
      // already be on disk as queued, or the workout is gone. See syncCore.
      const full: SyncedWorkoutLog = {
        ...log,
        id: genId('log'),
        createdAt: new Date().toISOString(),
        synced: false,
      };
      // Grant the session reward (Diamonds + XP + streak) at most once per
      // member per day: the FIRST log of the day counts as the session; extra
      // "Add Another" logs still save but don't re-award. recordSession is the
      // sole grantor (no separate flat awardPoints — that was double-counting).
      const alreadyLoggedToday = hasMemberLoggedToday(log.memberId);
      setLogs((prev) => [full, ...prev]);
      if (!alreadyLoggedToday) recordSession();
      if (uid) {
        pushLog(uid, full)
          .then((ok) => { if (ok) setLogs((prev) => prev.map((l) => (l.id === full.id ? { ...l, synced: true } : l))); })
          .catch(() => { /* stays queued; the launch flush retries it */ });
      }
      return full;
    },
    [hasMemberLoggedToday, recordSession, uid],
  );

  const removeLog = useCallback((id: string) => {
    setLogs((prev) => prev.filter((l) => l.id !== id));
    // Must also delete server-side: the live listener re-adds anything still on
    // the server, so a local-only delete would resurrect the log.
    if (uid) deleteLog(uid, id).catch(() => {});
  }, [uid]);

  // ── PRs ─────────────────────────────────────────────

  const myPRs = useCallback(
    (memberId: string) =>
      prs
        .filter((p) => p.memberId === memberId)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [prs],
  );

  const prsForExercise = useCallback(
    (memberId: string, exerciseKey: string) =>
      prs
        .filter((p) => p.memberId === memberId && p.exerciseKey === exerciseKey)
        .sort((a, b) => a.date.localeCompare(b.date)), // chronological for charting
    [prs],
  );

  const currentBest = useCallback(
    (memberId: string, exerciseKey: string): PersonalRecord | null => {
      const exercise = EXERCISES_BY_KEY[exerciseKey];
      if (!exercise) return null;
      const list = prs.filter((p) => p.memberId === memberId && p.exerciseKey === exerciseKey);
      if (list.length === 0) return null;
      return list.reduce((best, curr) => {
        if (exercise.lowerIsBetter) {
          return curr.value < best.value ? curr : best;
        }
        return curr.value > best.value ? curr : best;
      });
    },
    [prs],
  );

  const addPR = useCallback(
    (pr: Omit<PersonalRecord, 'id' | 'createdAt'>): PersonalRecord => {
      // synced:false BEFORE the write — see logWorkout.
      const full: SyncedPersonalRecord = {
        ...pr,
        id: genId('pr'),
        createdAt: new Date().toISOString(),
        synced: false,
      };
      setPRs((prev) => [full, ...prev]);
      awardPoints(POINTS_PER_PR, 'pr_logged');
      if (uid) {
        pushPR(uid, full)
          .then((ok) => { if (ok) setPRs((prev) => prev.map((p) => (p.id === full.id ? { ...p, synced: true } : p))); })
          .catch(() => { /* stays queued; the launch flush retries it */ });
      }
      return full;
    },
    [awardPoints, uid],
  );

  const removePR = useCallback((id: string) => {
    setPRs((prev) => {
      // Only refund (and only once) if the PR actually existed — guards against
      // a double-delete clawing back points twice. addPR always grants exactly
      // POINTS_PER_PR, so the refund is symmetric and the add+delete loop nets 0.
      if (prev.some((p) => p.id === id)) deductPoints(POINTS_PER_PR, 'pr_removed');
      return prev.filter((p) => p.id !== id);
    });
    // Server delete too, or the listener resurrects it.
    if (uid) deletePR(uid, id).catch(() => {});
  }, [deductPoints, uid]);

  return (
    <WorkoutContext.Provider
      value={{
        logs,
        prs,
        myLogs,
        hasMemberLoggedToday,
        logWorkout,
        removeLog,
        myPRs,
        prsForExercise,
        currentBest,
        addPR,
        removePR,
      }}
    >
      {children}
    </WorkoutContext.Provider>
  );
}

export function useWorkouts() {
  return useContext(WorkoutContext);
}
