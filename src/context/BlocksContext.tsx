import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  blockUser as blockUserRemote,
  unblockUser as unblockUserRemote,
  getBlockedUserIds,
  muteUser as muteUserRemote,
  unmuteUser as unmuteUserRemote,
  getMutedUserIds,
} from '../services/firebaseModeration';
import { useAuth } from './AuthContext';

interface BlocksContextValue {
  /** Set of user IDs the current user has blocked. */
  blockedIds: Set<string>;
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
  const [mutedIds, setMutedIds] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    if (!user?.id) {
      setBlockedIds(new Set());
      setMutedIds(new Set());
      return;
    }
    const [blocked, muted] = await Promise.all([getBlockedUserIds(), getMutedUserIds()]);
    setBlockedIds(blocked);
    setMutedIds(muted);
  }, [user?.id]);

  useEffect(() => {
    refresh().catch((e) => console.warn('[Blocks] refresh failed:', e));
  }, [refresh]);

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

  const filterBlocked = useCallback(<T,>(items: T[], userIdField: keyof T): T[] => {
    if (blockedIds.size === 0) return items;
    return items.filter((item) => !blockedIds.has(item[userIdField] as unknown as string));
  }, [blockedIds]);

  const filterHidden = useCallback(<T,>(items: T[], userIdField: keyof T): T[] => {
    if (blockedIds.size === 0 && mutedIds.size === 0) return items;
    return items.filter((item) => {
      const id = item[userIdField] as unknown as string;
      return !blockedIds.has(id) && !mutedIds.has(id);
    });
  }, [blockedIds, mutedIds]);

  return (
    <BlocksContext.Provider value={{
      blockedIds, mutedIds, isBlocked, isMuted,
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
