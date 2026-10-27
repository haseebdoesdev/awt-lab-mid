import { createContext, type ReactNode, use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, onSessionExpired } from '../lib/api';
import type { Account } from '../types';

type AuthStatus = 'loading' | 'ready';
type ChannelMessage = 'login' | 'logout';

interface AuthContextValue {
  user: Account | null;
  status: AuthStatus;
  /** Explains why the user was signed out (expired session, ban, …). */
  notice: string | null;
  login: (login: string, password: string) => Promise<void>;
  register: (input: { username: string; email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  endSession: (reason?: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Account | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [notice, setNotice] = useState<string | null>(null);
  const userRef = useRef(user);
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  // Restore the session on first load (the refresh cookie survives reloads).
  useEffect(() => {
    api.auth
      .me()
      .then(({ user }) => setUser(user))
      .catch(() => setUser(null))
      .finally(() => setStatus('ready'));
  }, []);

  const endSession = useCallback((reason?: string) => {
    if (userRef.current && reason) setNotice(reason);
    setUser(null);
  }, []);

  useEffect(() => {
    onSessionExpired(() => endSession('Your session has expired. Please sign in again.'));
    return () => onSessionExpired(null);
  }, [endSession]);

  // Keep every open tab in sync: signing in or out in one tab applies to all.
  useEffect(() => {
    if (!('BroadcastChannel' in window)) return;
    const channel = new BroadcastChannel('pulse-auth');
    channel.onmessage = (event: MessageEvent<ChannelMessage>) => {
      if (event.data === 'logout') setUser(null);
      if (event.data === 'login') api.auth.me().then(({ user }) => setUser(user), () => undefined);
    };
    channelRef.current = channel;
    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, []);

  const broadcast = (message: ChannelMessage) => channelRef.current?.postMessage(message);

  const login = useCallback(async (loginName: string, password: string) => {
    const { user } = await api.auth.login(loginName, password);
    setNotice(null);
    setUser(user);
    broadcast('login');
  }, []);

  const register = useCallback(async (input: { username: string; email: string; password: string }) => {
    const { user } = await api.auth.register(input);
    setNotice(null);
    setUser(user);
    broadcast('login');
  }, []);

  const logout = useCallback(async () => {
    await api.auth.logout().catch(() => undefined);
    setUser(null);
    broadcast('logout');
  }, []);

  const value = useMemo(
    () => ({ user, status, notice, login, register, logout, endSession }),
    [user, status, notice, login, register, logout, endSession],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthContextValue {
  const context = use(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}

/** For components rendered behind <RequireAuth>, where a user is guaranteed. */
export function useCurrentUser(): Account {
  const { user } = useAuth();
  if (!user) throw new Error('useCurrentUser used outside an authenticated route');
  return user;
}
