'use client';

import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import type { User } from '@/types';

interface AuthContextValue {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    let active = true;
    const savedToken = sessionStorage.getItem('noovastack.token');
    const savedUser = sessionStorage.getItem('noovastack.user');

    localStorage.removeItem('noovastack.token');
    localStorage.removeItem('noovastack.user');

    if (savedUser) {
      try {
        JSON.parse(savedUser) as User;
      } catch {
        sessionStorage.removeItem('noovastack.user');
      }
    }

    if (!savedToken) {
      sessionStorage.removeItem('noovastack.user');
      setLoading(false);
      return () => {
        active = false;
      };
    }

    api.me(savedToken)
      .then((profile) => {
        if (!active || sessionStorage.getItem('noovastack.token') !== savedToken) return;
        sessionStorage.setItem('noovastack.user', JSON.stringify(profile));
        setToken(savedToken);
        setUser(profile);
      })
      .catch(() => {
        if (sessionStorage.getItem('noovastack.token') === savedToken) {
          sessionStorage.removeItem('noovastack.token');
          sessionStorage.removeItem('noovastack.user');
        }
        if (!active) return;
        setToken(null);
        setUser(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function login(email: string, password: string) {
    const data = await api.login(email, password);
    const profile = await api.me(data.access_token);
    sessionStorage.setItem('noovastack.token', data.access_token);
    sessionStorage.setItem('noovastack.user', JSON.stringify(profile));
    setToken(data.access_token);
    setUser(profile);
    toast.success('Signed in securely');
    router.push('/dashboard');
  }

  async function logout() {
    if (token) await api.logout(token).catch(() => undefined);
    sessionStorage.removeItem('noovastack.token');
    sessionStorage.removeItem('noovastack.user');
    localStorage.removeItem('noovastack.token');
    localStorage.removeItem('noovastack.user');
    setToken(null);
    setUser(null);
    router.push('/login');
  }

  const value = useMemo(() => ({ user, token, loading, login, logout, isAuthenticated: Boolean(user && token) }), [user, token, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
