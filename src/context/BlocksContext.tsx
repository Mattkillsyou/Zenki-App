import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db, FIREBASE_CONFIGURED } from '../config/firebase';
import {
  blockUser as blockUserRemote,
  unblockUser as unblockUserRemote,
  getBlockedUserIds,
  muteUser as muteUserRemote,
  unmuteUser as unmuteUserRemote,
  getMutedUserIds,
  getUsersWhoBlockedMe,
} from '../services/firebaseModeration';
import { useAuth } from './AuthContext';
import { useFirebaseUid } from '../hooks/useFirebaseUid';

interface BlocksContextValue {
  /** Set of user IDs the current user has blocked. */
  blockedIds: Set<string>;
  /** Set of user IDs who have blocked the current user (server /blockedBy mirror).
   *  Hidden bidirectionally so a blocked user also stops seeing the blocker. */
  blockedByIds: Set<string>;
  /** Set of user IDs the current user has muted (soft-hide, no block). */
  mutedIds: Set<string>;
  /** True if the given uid is blocked by the current user. */
  isBlocked: (uid: string) => boolean;
  /** True if the given uid is muted by the current user. */
  isMuted: (uid: string) => boolean;
  /** Block a user; no-op if already blocked. */
  blockUser: (uid: string) => Promise<void>;
  /** Unblock a user; no-op if not blocked. */
  unblockUser: (uid: string) => Promise<void>;
  /** Mute a user; no-op if already muted. */
  muteUser: (uid: string) => Promise<void>;
  /** Unmute a user; no-op if not muted. */
  unmuteUser: (uid: string) => Promise<void>;
  /** Filter an array of items by `userIdField`, excluding BLOCKED authors only. */
  filterBlocked: <T>(items: T[], userIdField: keyof T) => T[];
  /** Filter an array by `userIdField`, excluding BOTH blocked and muted authors.
   *  Use this for feed + comment display. */
  filterHidden: <T>(items: T[], userIdField: keyof T) => T[];
  /** Refresh blocked + muted sets from server. */
  refresh: () => Promise<void>;
}

const BlocksContext = createContext<BlocksContextValue>({
  blockedIds: new Set(),
  blockedByIds: new Set(),
  mutedIds: new Set(),
  isBlocked: () => false,
  isMuted: () => false,
  blockUser: async () => {},
  unblockUser: async () => {},
  muteUser: async () => {},
  unmuteUser: async () => {},
  filterBlocked: (items) => items,
  filterHidden: (items) => items,
  refresh: async () => {},
});

export function BlocksProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());
  const [blockedByIds, setBlockedByIds] = useState<Set<string>>(new Set());
  const [mutedIds, setMutedIds] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    if (!user?.id) {
      setBlockedIds(new Set());
      setMutedIds(new Set());
      setBlockedByIds(new Set());
      return;
    }
    const [blocked, muted, blockedBy] = await Promise.all([
      getBlockedUserIds(), getMutedUserIds(), getUsersWhoBlockedMe(),
    ]);
    setBlockedIds(blocked);
    setMutedIds(muted);
    setBlockedByIds(blockedBy);
  }, [user?.id]);

  // Live-subscribe to the three tiny owner-readable collections instead of a
  // one-shot fetch, so a block made (or received — /blockedBy mirror) while the
  // app is open takes effect this session, not after a force-quit. The
  // optimistic set updates in blockUser/muteUser below still apply instantly;
  // the snapshots simply confirm and pick up remote changes.
  // Audit 2.0.5 P1 (cold-start auth race): the Firebase session restores
  // ASYNCHRONOUSLY after AuthContext hydrates the local user, so sampling
  // getCurrentUid() once here left the three listeners unattached (and the
  // sets permanently empty — every block/mute filter inert) whenever the
  // effect won the race. Key the effect on the LIVE auth uid instead: it
  // re-runs the moment the session lands, and re-attaches across account
  // switches / sign-out.
  const fbUid = useFirebaseUid();
  useEffect(() => {
    if (!user?.id) {
      setBlockedIds(new Set());
      setMutedIds(new Set());
      setBlockedByIds(new Set());
      return;
    }
    if (!FIREBASE_CONFIGURED || !db) return;
    const uid = fbUid;
    if (!uid) {
      // No Firebase session yet — the effect re-runs when fbUid lands, so
      // this is only the momentary pre-restore window (sets stay empty).
      return;
    }
    const onErr = (label: string) => (e: unknown) =>
      console.warn(`[Blocks] ${label} subscribe failed:`, e);
    const unsubs = [
      onSnapshot(collection(db, 'blocks', uid, 'blocked'),
        (snap) => setBlockedIds(new Set(snap.docs.map((d) => d.id))), onErr('blocked')),
      onSnapshot(collection(db, 'mutes', uid, 'muted'),
        (snap) => setMutedIds(new Set(snap.docs.map((d) => d.id))), onErr('muted')),
      onSnapshot(collection(db, 'blockedBy', uid, 'by'),
        (snap) => setBlockedByIds(new Set(snap.docs.map((d) => d.id))), onErr('blockedBy')),
    ];
    return () => unsubs.forEach((u) => u());
  }, [user?.id, fbUid, refresh]);

  const isBlocked = useCallback((uid: string) => blockedIds.has(uid), [blockedIds]);
  const isMuted = useCallback((uid: string) => mutedIds.has(uid), [mutedIds]);

  const blockUser = useCallback(async (uid: string) => {
    const ok = await blockUserRemote(uid);
    if (ok) setBlockedIds((prev) => new Set(prev).add(uid));
  }, []);

  const unblockUser = useCallback(async (uid: string) => {
    const ok = await unblockUserRemote(uid);
    if (ok) {
      setBlockedIds((prev) => {
        const next = new Set(prev);
        next.delete(uid);
        return next;
      });
    }
  }, []);

  const muteUser = useCallback(async (uid: string) => {
    const ok = await muteUserRemote(uid);
    if (ok) setMutedIds((prev) => new Set(prev).add(uid));
  }, []);

  const unmuteUser = useCallback(async (uid: string) => {
    const ok = await unmuteUserRemote(uid);
    if (ok) {
      setMutedIds((prev) => {
        const next = new Set(prev);
        next.delete(uid);
        return next;
      });
    }
  }, []);

  // Both blocked (I blocked them) and blockedBy (they blocked me) are hidden, so
  // blocking is bidirectional — a blocked user also stops seeing the blocker.
  const filterBlocked = useCallback(<T,>(items: T[], userIdField: keyof T): T[] => {
    if (blockedIds.size === 0 && blockedByIds.size === 0) return items;
    return items.filter((item) => {
      const id = item[userIdField] as unknown as string;
      return !blockedIds.has(id) && !blockedByIds.has(id);
    });
  }, [blockedIds, blockedByIds]);

  const filterHidden = useCallback(<T,>(items: T[], userIdField: keyof T): T[] => {
    if (blockedIds.size === 0 && mutedIds.size === 0 && blockedByIds.size === 0) return items;
    return items.filter((item) => {
      const id = item[userIdField] as unknown as string;
      return !blockedIds.has(id) && !mutedIds.has(id) && !blockedByIds.has(id);
    });
  }, [blockedIds, mutedIds, blockedByIds]);

  return (
    <BlocksContext.Provider value={{
      blockedIds, blockedByIds, mutedIds, isBlocked, isMuted,
      blockUser, unblockUser, muteUser, unmuteUser,
      filterBlocked, filterHidden, refresh,
    }}>
      {children}
    </BlocksContext.Provider>
  );
}

export function useBlocks() {
  return useContext(BlocksContext);
}
