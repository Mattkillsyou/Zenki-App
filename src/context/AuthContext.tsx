import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Member, MEMBERS } from '../data/members';
import { pushMemberToSheets, pushMemberToFirestore } from '../services/memberSync';

const STORAGE_KEY = '@zenki_current_user';
const CUSTOM_MEMBER_KEY = '@zenki_custom_member';

interface AuthContextValue {
  user: Member | null;
  isLoading: boolean;
  signIn: (member: Member) => Promise<void>;
  createAccount: (member: Member) => Promise<void>;
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
    AsyncStorage.getItem(STORAGE_KEY).then(async (id) => {
      if (id) {
        // Check hardcoded members first
        const member = MEMBERS.find((m) => m.id === id);
        if (member) {
          setUser(member);
        } else {
          // Check for a custom-created member
          const raw = await AsyncStorage.getItem(CUSTOM_MEMBER_KEY);
          if (raw) {
            try {
              const custom: Member = JSON.parse(raw);
              if (custom.id === id) setUser(custom);
            } catch { /* ignore */ }
          }
        }
      }
      setIsLoading(false);
    });
  }, []);

  const signIn = useCallback(async (member: Member) => {
    setUser(member);
    await AsyncStorage.setItem(STORAGE_KEY, member.id);
  }, []);

  const createAccount = useCallback(async (member: Member) => {
    await AsyncStorage.setItem(CUSTOM_MEMBER_KEY, JSON.stringify(member));
    await AsyncStorage.setItem(STORAGE_KEY, member.id);
    setUser(member);
    // Sync to Sheets + Firestore (fire-and-forget)
    pushMemberToSheets(member);
    pushMemberToFirestore(member);
  }, []);

  const signOut = useCallback(async () => {
    setUser(null);
    await AsyncStorage.removeItem(STORAGE_KEY);
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
