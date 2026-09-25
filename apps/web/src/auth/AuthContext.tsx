import type { SessionUserDto } from '@netwatch/contracts';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../api/netwatch';
import { ApiError, setUnauthorizedHandler } from '../api/client';

interface AuthState {
  user: SessionUserDto | null;
  checking: boolean;
  login: (password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUserDto | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // Toute réponse 401 d'une requête quelconque ramène à l'écran de connexion.
    setUnauthorizedHandler(() => setUser(null));
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .me()
      .then((session) => {
        if (!cancelled) setUser(session);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (password: string) => {
    try {
      setUser(await api.login(password));
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        throw new Error('Mot de passe incorrect');
      }
      throw error;
    }
  }, []);

  const logout = useCallback(async () => {
    await api.logout().catch(() => undefined);
    setUser(null);
  }, []);

  const value = useMemo<AuthState>(() => ({ user, checking, login, logout }), [user, checking, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth doit être utilisé dans AuthProvider');
  return context;
}
