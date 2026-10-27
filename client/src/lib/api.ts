import type { Account, AdminStats, Conversation, Message, PublicUser, ReadReceipt, Role } from '../types';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details: { path: string; message: string }[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Field → message map for showing validation errors next to form inputs. */
  get fieldErrors(): Record<string, string> {
    return Object.fromEntries(this.details.map((d) => [d.path, d.message]));
  }
}

let refreshInFlight: Promise<Account | null> | null = null;
let sessionExpiredHandler: (() => void) | null = null;

export function onSessionExpired(handler: (() => void) | null) {
  sessionExpiredHandler = handler;
}

/**
 * Exchanges the refresh cookie for fresh tokens. Concurrent callers share a
 * single request, so a burst of 401s triggers only one refresh.
 */
export function refreshSession(): Promise<Account | null> {
  refreshInFlight ??= fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
    .then(async (res) => (res.ok ? ((await res.json()) as { user: Account }).user : null))
    .catch(() => null)
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

// Endpoints where a 401 means "wrong credentials", not "access token expired".
const NO_REFRESH = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'];

async function request<T>(path: string, init: { method?: string; body?: unknown } = {}, retry = true): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init.method ?? 'GET',
    credentials: 'include',
    headers: init.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });

  if (res.status === 401 && retry && !NO_REFRESH.includes(path)) {
    if (await refreshSession()) return request<T>(path, init, false);
    sessionExpiredHandler?.();
  }

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string; details?: ApiError['details'] };
    throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`, data.details);
  }

  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

/** Typed wrappers around every REST endpoint. */
export const api = {
  auth: {
    me: () => request<{ user: Account }>('/auth/me'),
    login: (login: string, password: string) =>
      request<{ user: Account }>('/auth/login', { method: 'POST', body: { login, password } }),
    register: (input: { username: string; email: string; password: string }) =>
      request<{ user: Account }>('/auth/register', { method: 'POST', body: input }),
    logout: () => request<void>('/auth/logout', { method: 'POST' }),
  },
  users: {
    list: (q?: string) =>
      request<{ users: PublicUser[] }>(`/users${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  },
  conversations: {
    list: () => request<{ conversations: Conversation[] }>('/conversations'),
    createRoom: (name: string, description: string) =>
      request<{ conversation: Conversation }>('/conversations/rooms', {
        method: 'POST',
        body: { name, description },
      }),
    remove: (id: string) => request<void>(`/conversations/${id}`, { method: 'DELETE' }),
    openDirect: (userId: string) =>
      request<{ conversation: Conversation }>('/conversations/dm', { method: 'POST', body: { userId } }),
    messages: (id: string, before?: string) =>
      request<{ messages: Message[]; hasMore: boolean }>(
        `/conversations/${id}/messages${before ? `?before=${before}` : ''}`,
      ),
    receipts: (id: string) => request<{ receipts: ReadReceipt[] }>(`/conversations/${id}/receipts`),
  },
  messages: {
    remove: (id: string) => request<void>(`/messages/${id}`, { method: 'DELETE' }),
  },
  admin: {
    stats: () => request<{ stats: AdminStats }>('/admin/stats'),
    users: () => request<{ users: Account[] }>('/admin/users'),
    updateUser: (id: string, update: { role?: Role; isBanned?: boolean }) =>
      request<{ user: Account }>(`/admin/users/${id}`, { method: 'PATCH', body: update }),
  },
};
