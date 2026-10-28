import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
import { api, configureApi, request } from './api';
import { API_URL, APP_SCHEME } from './config';
import { readToken, writeToken } from './storage';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
  campus: string;
  batch: string;
  year: 1 | 2;
  role: string;
}

interface AuthState {
  ready: boolean;
  user: SessionUser | null;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  requestCode: (email: string) => Promise<{ devCode?: string }>;
  signInWithCode: (email: string, code: string) => Promise<void>;
  signInWithProvider: (provider: string) => Promise<boolean>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

interface TokenResponse {
  token: string;
  user: SessionUser;
}

/**
 * Bearer-token sessions for the native app. Sign-in goes through the same
 * rules as the web — official institute emails only — and the server
 * re-checks role and suspension on every request, so a revoked account is
 * signed out here on its next call.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);

  // What the API client calls when the server stops accepting the session.
  const signOutRef = useRef<() => void>(() => undefined);

  const adopt = useCallback(async (next: TokenResponse | null) => {
    // Hand the bearer to the API client before any screen renders with the new
    // session: child effects run before ours, so an effect here would be late.
    configureApi({ token: next?.token ?? null, onUnauthorized: () => signOutRef.current() });
    await writeToken(next?.token ?? null);
    setUser(next?.user ?? null);
  }, []);

  const signOut = useCallback(() => adopt(null), [adopt]);
  useEffect(() => {
    signOutRef.current = () => void adopt(null);
  }, [adopt]);

  // Restore a saved session, confirming it is still good.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await readToken();
      if (!saved) return;
      configureApi({ token: saved, onUnauthorized: () => undefined });
      try {
        const me = await api.get<{ user: SessionUser }>('/api/me');
        if (!cancelled) {
          configureApi({ token: saved, onUnauthorized: () => signOutRef.current() });
          setUser({ id: me.user.id, name: me.user.name, email: me.user.email, image: me.user.image || null, campus: me.user.campus, batch: me.user.batch, year: me.user.year, role: me.user.role });
        }
      } catch {
        if (!cancelled) await writeToken(null);
      }
    })().finally(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [adopt]);

  const value = useMemo<AuthState>(
    () => ({
      ready,
      user,
      signOut,
      signInWithPassword: async (email, password) =>
        adopt(await request<TokenResponse>('/api/mobile/auth/login', { method: 'POST', body: { email: email.trim().toLowerCase(), password }, auth: false })),
      requestCode: (email) => request<{ devCode?: string }>('/api/auth/otp', { method: 'POST', body: { email: email.trim().toLowerCase() }, auth: false }),
      signInWithCode: async (email, code) =>
        adopt(await request<TokenResponse>('/api/mobile/auth/login', { method: 'POST', body: { email: email.trim().toLowerCase(), code: code.trim() }, auth: false })),
      signInWithProvider: async (provider) => {
        // The web finishes the SSO flow and deep-links back with a one-time code.
        const result = await WebBrowser.openAuthSessionAsync(`${API_URL}/mobile/sso?provider=${encodeURIComponent(provider)}`, `${APP_SCHEME}://auth`);
        if (result.type !== 'success') return false;
        const code = new URL(result.url).searchParams.get('code');
        if (!code) return false;
        await adopt(await request<TokenResponse>('/api/mobile/auth/exchange', { method: 'POST', body: { code }, auth: false }));
        return true;
      },
    }),
    [ready, user, signOut, adopt]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
