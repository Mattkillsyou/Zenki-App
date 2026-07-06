import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeParseJSON, safeStorageSet } from '../utils/safeStorage';
import { Member, MEMBERS } from '../data/members';
import { pushMemberToSheets, pushMemberToFirestore, backfillMemberIfMissing, subscribeToMember, fetchMemberByCurrentUid } from '../services/memberSync';
import { getMemberOverride, saveMemberOverride } from '../services/memberOverrides';
import { registerForPushNotifications, savePushTokenToFirestore } from '../services/pushNotifications';
import {
  firebaseCreateAccount,
  firebaseSignInWithPassword,
  firebaseSignOut,
  emailForMember,
} from '../services/firebaseAuth';
import { FIREBASE_CONFIGURED, auth } from '../config/firebase';
import { seedReviewerDataIfNeeded } from '../utils/seedReviewerData';
import { syncOrAlert } from '../utils/syncOrAlert';

const STORAGE_KEY = '@zenki_current_user';
const CUSTOM_MEMBER_KEY = '@zenki_custom_member';
const LAST_USERNAME_KEY = '@zenki_last_username';
// Guest browsing (App Review 5.1.1(v)): a guest has no account, so `user`
// stays null. This flag — persisted so a relaunched guest stays a guest —
// lets the navigator drop a guest into Main while every account-based action
// is still gated by requireAuth(user, …). Never fabricate a user for guests.
const GUEST_KEY = '@zenki_guest_mode';

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
  /** True when browsing without an account (App Review 5.1.1(v)). */
  isGuest: boolean;
  /** Enter guest mode: user stays null, flag persists across relaunch. */
  continueAsGuest: () => Promise<void>;
  /** Leave guest mode (used on real sign-in / sign-out). */
  exitGuest: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  signIn: async () => {},
  createAccount: async () => {},
  signOut: async () => {},
  isGuest: false,
  continueAsGuest: async () => {},
  exitGuest: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Member | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const id = await AsyncStorage.getItem(STORAGE_KEY);

        // Resolve the base record (seed first, then custom-signup blob).
        let base: Member | null = null;
        if (id) {
          base = MEMBERS.find((m) => m.id === id) ?? null;
          if (!base) {
            const raw = await AsyncStorage.getItem(CUSTOM_MEMBER_KEY);
            const custom = safeParseJSON<Member | null>(raw, null, (v) =>
              typeof v === 'object' && v !== null && typeof (v as Member).id === 'string',
            );
            if (custom && custom.id === id) base = custom;
          }
        }
        // Firestore fallback: local identity state is lost (or partially
        // lost) but a live Firebase Auth session survives — rehydrate the
        // member from /users/{uid} → /members/{memberId} and re-persist it
        // locally so the next launch is fast and offline-safe. Note a truly
        // FRESH device has no Firebase session either; this recovers
        // partial-loss cases (storage cleared, custom blob corrupted or
        // unmatched) only.
        //
        // firebase v12 restores the persisted session ASYNCHRONOUSLY (with a
        // network accounts:lookup), so `auth.currentUser` is still null this
        // early in cold start — wait for the auth state to settle, raced
        // against a timeout so an offline launch can't hang the splash.
        if (!base && FIREBASE_CONFIGURED && auth) {
          await Promise.race([
            auth.authStateReady(),
            new Promise<void>((resolve) => setTimeout(resolve, 4000)),
          ]).catch(() => {});
          if (auth.currentUser) {
            const remote = await fetchMemberByCurrentUid().catch(() => null);
            if (remote) {
              base = remote;
              try {
                await AsyncStorage.setItem(CUSTOM_MEMBER_KEY, JSON.stringify(remote));
                await AsyncStorage.setItem(STORAGE_KEY, remote.id);
              } catch { /* non-fatal */ }
            }
          }
        }
        if (!base) {
          // No account resolved — but a guest who chose "Browse as Guest" and
          // relaunched should land back in Main, not the sign-in wall.
          const guest = await AsyncStorage.getItem(GUEST_KEY);
          if (guest === 'true' && !cancelled) setIsGuest(true);
          return;
        }

        // Apply admin overrides (set from AdminMembersScreen) so role / belt
        // edits persist across reloads even when offline. Keyed by base.id —
        // `id` can be null when the Firestore fallback resolved the member.
        const override = await getMemberOverride(base.id);
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
  //
  // ALSO: backfill /members on app open — but ONLY when the server doc is
  // missing (legacy OAuth signups that wrote /users but skipped /members) or
  // unstamped (stamp firebaseUid only). Pushing the full locally-cached
  // record on every open silently REVERTED admin edits (belt promotions,
  // contact fixes) made while the app was closed, because this write landed
  // before subscribeToMember below could deliver the fresh server doc.
  // Fire-and-forget — failures don't block UI.
  useEffect(() => {
    const id = user?.id;
    if (!id) return;
    if (user) {
      const stampedUid = auth?.currentUser?.uid ?? user.firebaseUid;
      if (stampedUid) {
        const memberWithUid: Member =
          user.firebaseUid === stampedUid ? user : { ...user, firebaseUid: stampedUid };
        backfillMemberIfMissing(memberWithUid).catch((err) =>
          console.warn('[AuthContext] /members backfill failed:', err),
        );
      }
      // Backfill push token on every app open (only if iOS notification
      // permission is already granted — this call won't prompt). Without
      // this, only freshly-created accounts ever got a token saved, which
      // is why broadcasts found "no recipients" even with members signed
      // in on real devices.
      registerForPushNotifications().then((token) => {
        if (token) {
          savePushTokenToFirestore(id, token).catch(() => {});
        }
      }).catch(() => {});
    }
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
    // Seed the App Review demo account's sample data BEFORE setUser, so it's on
    // disk before NutritionContext (and others) re-read on the user-id change.
    // Previously this was fire-and-forget AFTER setUser, so the re-read raced
    // ahead of the async seed writes and Body Lab + Home rendered EMPTY on the
    // reviewer's first sign-in — they only populated after an app restart
    // (App Review 2.1(a): "provide a demo account with pre-populated uploads").
    // No-op (returns immediately) for every non-reviewer account.
    await seedReviewerDataIfNeeded(member).catch((e) =>
      console.warn('[AuthContext] reviewer seed failed (non-fatal)', e),
    );

    setUser(member);
    // Signing in supersedes guest mode.
    setIsGuest(false);
    await AsyncStorage.setItem(STORAGE_KEY, member.id);
    await AsyncStorage.removeItem(GUEST_KEY);

    // Persist the full member blob for any non-seed id so the session-restore
    // path can rehydrate it. The restore logic resolves the user by
    // MEMBERS.find(id) first, then falls back to CUSTOM_MEMBER_KEY. For a
    // first-time OAuth (Apple/Google) sign-in the id is a freshly-generated
    // `mem_…` that is NOT in the seed MEMBERS array, and CUSTOM_MEMBER_KEY was
    // previously only written at the END of onboarding (inside createAccount).
    // So an OAuth user who force-quit mid-onboarding was logged out on next
    // launch despite a live Firebase Auth session, and their member record was
    // never saved. Writing it here makes the session durable from the very
    // first sign-in. createAccount later overwrites this with the firebaseUid-
    // stamped record, so this is a safe lower bound.
    const isSeedMember = MEMBERS.some((m) => m.id === member.id);
    if (!isSeedMember) {
      try {
        await AsyncStorage.setItem(CUSTOM_MEMBER_KEY, JSON.stringify(member));
      } catch (e) {
        console.warn('[AuthContext] signIn CUSTOM_MEMBER_KEY persist failed (non-fatal)', e);
      }
    }
  }, []);

  const createAccount = useCallback(async (member: Member, password?: string) => {
    // Provision Firebase Auth first when possible — so failures surface before
    // the local state is mutated. Capture the uid so we can stamp it on the
    // member record; the firestore.rules use it to authorize the user to
    // create their own /members doc (firebaseUid == request.auth.uid).
    let firebaseUid: string | undefined;
    if (FIREBASE_CONFIGURED && password) {
      try {
        firebaseUid = await firebaseCreateAccount(emailForMember(member), password, member);
      } catch (e: any) {
        if (e?.code === 'auth/email-already-in-use') {
          // A Firebase account with this email already exists (likely from an
          // earlier signup attempt that succeeded server-side but didn't
          // hydrate the local member record, or a Google/Apple OAuth signup
          // under the same email). Sign IN to it instead — same password
          // most of the time — so getCurrentIdToken() returns a real token
          // and AI photo logging / Cloud Functions work.
          try {
            await firebaseSignInWithPassword(emailForMember(member), password);
            firebaseUid = auth?.currentUser?.uid;
          } catch (signInErr: any) {
            // Email is taken AND the typed password doesn't match the
            // existing account. Surface this loudly — previously we
            // continued silently with local-only state, then the user
            // couldn't sign in later because the password they thought
            // they set wasn't the one Firebase had. Throw so the caller
            // (OnboardingScreen) can show the user the real reason.
            console.warn('[AuthContext] email-in-use + sign-in fallback failed', signInErr);
            const err = new Error(
              "An account with this email already exists, and the password you typed doesn't match it. Try signing in instead, or use Forgot Password to reset.",
            );
            (err as any).code = 'email-in-use-wrong-password';
            throw err;
          }
        } else {
          // Any OTHER Firebase Auth signup error must NOT be swallowed.
          // Continuing with local-only state was the root cause of the
          // "I created an account, but it says it doesn't exist when I
          // try to sign in" bug — the local profile looked fine, but no
          // Firebase Auth user was ever created.
          console.warn('[AuthContext] Firebase signup failed:', e?.code, e?.message);
          const code = e?.code || 'unknown';
          const friendly =
            code === 'auth/network-request-failed'
              ? "Couldn't reach the server. Check your internet and try again."
              : code === 'auth/weak-password'
              ? 'Password is too weak — Firebase needs at least 6 characters.'
              : code === 'auth/invalid-email'
              ? "That email address doesn't look right — double-check the spelling."
              : code === 'auth/operation-not-allowed'
              ? 'Email/password sign-up is disabled in Firebase Console — ask the admin to enable it.'
              : `Signup failed (${code}). Tap Back and try again, or contact the admin if it keeps happening.`;
          const err = new Error(friendly);
          (err as any).code = 'firebase-signup-failed';
          throw err;
        }
      }
    }

    // Stamp the firebaseUid onto the member so /members rules can authorize
    // the self-create. Read the uid from `auth.currentUser` (the live source
    // of truth), falling back to the value captured above. Some auth flows
    // (Apple/Google OAuth) populate currentUser asynchronously a tick after
    // the createAccount call returns — reading from the live auth here makes
    // sure we never push a member doc with a stale/missing firebaseUid.
    const stampedUid = auth?.currentUser?.uid ?? firebaseUid;
    const memberWithUid: Member = stampedUid
      ? { ...member, firebaseUid: stampedUid }
      : member;

    await AsyncStorage.setItem(CUSTOM_MEMBER_KEY, JSON.stringify(memberWithUid));
    await AsyncStorage.setItem(STORAGE_KEY, memberWithUid.id);
    setUser(memberWithUid);
    // Creating a real account supersedes guest mode.
    setIsGuest(false);
    await AsyncStorage.removeItem(GUEST_KEY);

    // Sheets sync stays fire-and-forget (best-effort).
    pushMemberToSheets(memberWithUid);

    // Firestore push is now AWAITED — without this the rule check sometimes
    // ran before auth state propagated to Firestore, the create silently
    // failed, and the new member never appeared in the admin members list.
    // upsertMemberInFirestore swallows errors internally (returns false), so
    // this await never throws — it just guarantees the network round-trip
    // happens before the function returns.
    if (stampedUid) {
      // Use syncOrAlert so the new user knows when their /members record
      // failed to land on the server — without this, signup looked
      // successful but the admin would never see them in the members list,
      // which is exactly the "people are making accounts and the list is
      // not updating" symptom.
      try {
        await syncOrAlert(pushMemberToFirestore(memberWithUid), 'Profile sync');
      } catch (err) {
        console.warn('[AuthContext] pushMemberToFirestore threw:', err);
      }
    }

    // Register for push notifications + save token
    registerForPushNotifications().then((token) => {
      if (token) {
        savePushTokenToFirestore(memberWithUid.id, token);
        const updatedMember = { ...memberWithUid, pushToken: token };
        safeStorageSet(CUSTOM_MEMBER_KEY, updatedMember, '[Auth custom member]');
      }
    });
  }, []);

  const signOut = useCallback(async () => {
    // Stash the username so SignInScreen can prefill it on next launch.
    if (user) await AsyncStorage.setItem(LAST_USERNAME_KEY, user.username?.toLowerCase() ?? user.id ?? '');

    // Local state first so UI updates immediately
    setUser(null);
    // Sign-out also leaves guest mode, so state never leaks between sessions.
    setIsGuest(false);

    // Clear the Firebase Auth session — critical for Apple review
    await firebaseSignOut();

    // Wipe local identity state
    await AsyncStorage.removeItem(STORAGE_KEY);
    await AsyncStorage.removeItem(CUSTOM_MEMBER_KEY);
    await AsyncStorage.removeItem(GUEST_KEY);
  }, [user]);

  // ── Guest browsing (App Review 5.1.1(v)) ──
  // Enter/leave guest mode. `user` stays null in both cases — guests are
  // intentionally account-less so every account-based action stays gated.
  const continueAsGuest = useCallback(async () => {
    setUser(null);
    setIsGuest(true);
    await AsyncStorage.setItem(GUEST_KEY, 'true');
  }, []);

  const exitGuest = useCallback(async () => {
    setIsGuest(false);
    await AsyncStorage.removeItem(GUEST_KEY);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, signIn, createAccount, signOut, isGuest, continueAsGuest, exitGuest }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
