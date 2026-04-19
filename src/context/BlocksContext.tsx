import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  blockUser as blockUserRemote,
  unblockUser as unblockUserRemote,
  getBlockedUserIds,
} from '../services/firebaseModeration';
import { useAuth } from './AuthContext';

interface BlocksContextValue {
  /** Set of user IDs the current user has blocked. */
  blockedIds: Set<string>;
  /** True if the given uid is blocked by the current user. */
  isBlocked: (uid: string) => boolean;
  /** Block a user; no-op if already blocked. */
  blockUser: (uid: string) => Promise<void>;
  /** Unblock a user; no-op if not blocked. */
  unblockUser: (uid: string) => Promise<void>;
  /** Filter an array of items by `userIdField`, excluding blocked authors. */
  filterBlocked: <T>(items: T[], userIdField: keyof T) => T[];
  /** Refresh from server. */
  refresh: () => Promise<void>;
}

const BlocksContext = createContext<BlocksContextValue>({
  blockedIds: new Set(),
  isBlocked: () => false,
  blockUser: async () => {},
  unblockUser: async () => {},
  filterBlocked: (items) => items,
  refresh: async () => {},
});

export function BlocksProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    if (!user?.id) {
      setBlockedIds(new Set());
      return;
    }
    const ids = await getBlockedUserIds();
    setBlockedIds(ids);
  }, [user?.id]);

  useEffect(() => {
    refresh().catch((e) => console.warn('[Blocks] refresh failed:', e));
  }, [refresh]);

  const isBlocked = useCallback((uid: string) => blockedIds.has(uid), [blockedIds]);

  const blockUser = useCallback(async (uid: string) => {
    const ok = await blockUserRemote(uid);
    if (ok) {
      setBlockedIds((prev) => {
        const next = new Set(prev);
        next.add(uid);
        return next;
      });
    }
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

  const filterBlocked = useCallback(<T,>(items: T[], userIdField: keyof T): T[] => {
    if (blockedIds.size === 0) return items;
    return items.filter((item) => !blockedIds.has(item[userIdField] as unknown as string));
  }, [blockedIds]);

  return (
    <BlocksContext.Provider value={{ blockedIds, isBlocked, blockUser, unblockUser, filterBlocked, refresh }}>
      {children}
    </BlocksContext.Provider>
  );
}

export function useBlocks() {
  return useContext(BlocksContext);
}
