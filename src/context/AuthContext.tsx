import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Member, MEMBERS } from '../data/members';
import { pushMemberToSheets, pushMemberToFirestore, subscribeToMember } from '../services/memberSync';
import { getMemberOverride, saveMemberOverride } from '../services/memberOverrides';
import { registerForPushNotifications, savePushTokenToFirestore } from '../services/pushNotifications';
import {
  firebaseCreateAccount,
  firebaseSignOut,
  emailForMember,
} from '../services/firebaseAuth';
import { FIREBASE_CONFIGURED } from '../config/firebase';
import { seedReviewerDataIfNeeded } from '../utils/seedReviewerData';

const STORAGE_KEY = '@zenki_current_user';
const CUSTOM_MEMBER_KEY = '@zenki_custom_member';

interface AuthContextValue {
  user: Member | null;
  isLoading: boolean;
  signIn: (member: Member) => Promise<void>;
  /**
   * Create a local account. If a password is provided AND Firebase is configured,
   * also provisions a real Firebase Auth user. Otherwise local-only (dev mode).
   */
  createAccount: (member: Member, password?: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  signIn: async () => {},
  createAccount: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Member | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const id = await AsyncStorage.getItem(STORAGE_KEY);
        if (!id) return;

        // Resolve the base record (seed first, then custom-signup blob).
        let base: Member | null = MEMBERS.find((m) => m.id === id) ?? null;
        if (!base) {
          const raw = await AsyncStorage.getItem(CUSTOM_MEMBER_KEY);
          if (raw) {
            try {
              const custom: Member = JSON.parse(raw);
              if (custom.id === id) base = custom;
            } catch {
              /* ignore */
            }
          }
        }
        if (!base) return;

        // Apply admin overrides (set from AdminMembersScreen) so role / belt
        // edits persist across reloads even when offline.
        const override = await getMemberOverride(id);
        const merged: Member = override ? { ...base, ...override } : base;

        if (!cancelled) setUser(merged);
        // Run reviewer-seed on persisted-session startup too, so we cover
        // the case where the reviewer signed in yesterday, closed the app,
        // and reopens it today expecting sample data.
        seedReviewerDataIfNeeded(merged).catch(() => {});
      } catch {
        /* ignore — start signed-out */
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Live Firestore subscription on the signed-in user's member doc. Picks
  // up admin role flips (e.g. isEmployee true) made on another device and
  // mirrors them to the local override cache so they survive app reload.
  useEffect(() => {
    const id = user?.id;
    if (!id) return;
    const unsub = subscribeToMember(id, (fresh) => {
      if (!fresh) return;
      setUser((prev) => {
        const merged: Member = prev ? { ...prev, ...fresh } : fresh;
        saveMemberOverride(merged).catch(() => {});
        return merged;
      });
    });
    return unsub;
  }, [user?.id]);

  const signIn = useCallback(async (member: Member) => {
    setUser(member);
    await AsyncStorage.setItem(STORAGE_KEY, member.id);
    // Seeds sample data on first sign-in for the App Review demo account.
    // No-op for everyone else. See utils/seedReviewerData.ts.
    seedReviewerDataIfNeeded(member).catch((e) =>
      console.warn('[AuthContext] reviewer seed failed (non-fatal)', e),
    );
  }, []);

  const createAccount = useCallback(async (member: Member, password?: string) => {
    // Provision Firebase Auth first when possible — so failures surface before
    // the local state is mutated.
    if (FIREBASE_CONFIGURED && password) {
      try {
        await firebaseCreateAccount(emailForMember(member), password, member);
      } catch (e) {
        console.warn('[AuthContext] Firebase signup failed — continuing local-only', e);
      }
    }

    await AsyncStorage.setItem(CUSTOM_MEMBER_KEY, JSON.stringify(member));
    await AsyncStorage.setItem(STORAGE_KEY, member.id);
    setUser(member);

    // Sync to Sheets + Firestore members doc (fire-and-forget)
    pushMemberToSheets(member);
    pushMemberToFirestore(member);

    // Register for push notifications + save token
    registerForPushNotifications().then((token) => {
      if (token) {
        savePushTokenToFirestore(member.id, token);
        const updatedMember = { ...member, pushToken: token };
        AsyncStorage.setItem(CUSTOM_MEMBER_KEY, JSON.stringify(updatedMember)).catch(() => {});
      }
    });
  }, []);

  const signOut = useCallback(async () => {
    // Local state first so UI updates immediately
    setUser(null);

    // Clear the Firebase Auth session — critical for Apple review
    await firebaseSignOut();

    // Wipe local identity state
    await AsyncStorage.removeItem(STORAGE_KEY);
    await AsyncStorage.removeItem(CUSTOM_MEMBER_KEY);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, signIn, createAccount, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
