import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Member, MEMBERS } from '../data/members';

const STORAGE_KEY = '@zenki_current_user';

interface AuthContextValue {
  user: Member | null;
  isLoading: boolean;
  signIn: (member: Member) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  signIn: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Member | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((id) => {
      if (id) {
        const member = MEMBERS.find((m) => m.id === id);
        if (member) setUser(member);
      }
      setIsLoading(false);
    });
  }, []);

  const signIn = useCallback(async (member: Member) => {
    setUser(member);
    await AsyncStorage.setItem(STORAGE_KEY, member.id);
  }, []);

  const signOut = useCallback(async () => {
    setUser(null);
    await AsyncStorage.removeItem(STORAGE_KEY);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
