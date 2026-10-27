import type { Conversation, Message, ReadReceipt } from '../types';

/** A message as shown in the UI – optimistic messages carry a clientId until confirmed. */
export interface ClientMessage extends Message {
  clientId?: string;
  pending?: boolean;
  error?: string;
  /** Stable React key that survives the optimistic → confirmed swap. */
  localKey?: string;
}

export interface Thread {
  items: ClientMessage[];
  hasMore: boolean;
  loading: boolean;
  loaded: boolean;
  error: string | null;
}

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline';

export interface ChatState {
  loaded: boolean;
  connection: ConnectionStatus;
  conversations: Record<string, Conversation>;
  threads: Record<string, Thread>;
  /** conversationId → userId → username of people currently typing. */
  typing: Record<string, Record<string, string>>;
  presence: Record<string, { online: boolean; lastSeen: string | null }>;
  /** conversationId → userId → read receipt. */
  receipts: Record<string, Record<string, ReadReceipt>>;
}

export type ChatAction =
  | { type: 'conversations/loaded'; conversations: Conversation[] }
  | { type: 'conversation/upserted'; conversation: Conversation }
  | { type: 'conversation/removed'; conversationId: string }
  | { type: 'conversation/read'; conversationId: string }
  | { type: 'thread/loading'; conversationId: string }
  | {
      type: 'thread/loaded';
      conversationId: string;
      messages: Message[];
      hasMore: boolean;
      mode: 'replace' | 'prepend';
    }
  | { type: 'thread/failed'; conversationId: string; error: string }
  | { type: 'threads/invalidated' }
  | { type: 'message/received'; message: Message; countsAsUnread: boolean }
  | { type: 'message/pending'; message: ClientMessage }
  | { type: 'message/confirmed'; clientId: string; message: Message }
  | { type: 'message/failed'; conversationId: string; clientId: string; error: string }
  | { type: 'message/retrying'; conversationId: string; clientId: string }
  | { type: 'message/deleted'; conversationId: string; messageId: string }
  | { type: 'typing/set'; conversationId: string; userId: string; username: string; isTyping: boolean }
  | { type: 'presence/set'; userId: string; online: boolean; lastSeen: string | null }
  | { type: 'receipts/loaded'; conversationId: string; receipts: ReadReceipt[] }
  | { type: 'receipt/updated'; receipt: ReadReceipt; isMine: boolean }
  | { type: 'connection/set'; status: ConnectionStatus };

export const initialChatState: ChatState = {
  loaded: false,
  connection: 'connecting',
  conversations: {},
  threads: {},
  typing: {},
  presence: {},
  receipts: {},
};

const emptyThread: Thread = { items: [], hasMore: true, loading: false, loaded: false, error: null };

function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  const { [key]: _removed, ...rest } = record;
  return rest;
}

function seedPresence(presence: ChatState['presence'], conversations: Conversation[]) {
  const next = { ...presence };
  for (const conversation of conversations) {
    for (const p of conversation.participants) next[p.id] = { online: p.online, lastSeen: p.lastSeen };
  }
  return next;
}

function updateThread(state: ChatState, conversationId: string, update: (thread: Thread) => Thread): ChatState {
  const thread = state.threads[conversationId];
  if (!thread) return state;
  return { ...state, threads: { ...state.threads, [conversationId]: update(thread) } };
}

function updateConversation(
  state: ChatState,
  conversationId: string,
  update: (conversation: Conversation) => Conversation,
): ChatState {
  const conversation = state.conversations[conversationId];
  if (!conversation) return state;
  return { ...state, conversations: { ...state.conversations, [conversationId]: update(conversation) } };
}

/** Records a message as the conversation's latest, unless something newer is already there. */
function bumpLastMessage(conversation: Conversation, message: Message): Conversation {
  if (conversation.lastMessage && conversation.lastMessage.createdAt > message.createdAt) return conversation;
  return { ...conversation, lastMessage: message, lastMessageAt: message.createdAt };
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'conversations/loaded':
      return {
        ...state,
        loaded: true,
        conversations: Object.fromEntries(action.conversations.map((c) => [c.id, c])),
        presence: seedPresence(state.presence, action.conversations),
      };

    case 'conversation/upserted':
      return {
        ...state,
        conversations: { ...state.conversations, [action.conversation.id]: action.conversation },
        presence: seedPresence(state.presence, [action.conversation]),
      };

    case 'conversation/removed':
      return {
        ...state,
        conversations: withoutKey(state.conversations, action.conversationId),
        threads: withoutKey(state.threads, action.conversationId),
        typing: withoutKey(state.typing, action.conversationId),
        receipts: withoutKey(state.receipts, action.conversationId),
      };

    case 'conversation/read':
      return updateConversation(state, action.conversationId, (c) => ({ ...c, unreadCount: 0 }));

    case 'thread/loading': {
      const thread = state.threads[action.conversationId] ?? emptyThread;
      return {
        ...state,
        threads: { ...state.threads, [action.conversationId]: { ...thread, loading: true, error: null } },
      };
    }

    case 'thread/loaded':
      return updateThread(state, action.conversationId, (thread) => {
        // Keep optimistic messages that are still in flight (or failed) after a resync.
        const unsent = thread.items.filter((m) => m.clientId);
        const known = new Set(thread.items.map((m) => m.id));
        const items =
          action.mode === 'prepend'
            ? [...action.messages.filter((m) => !known.has(m.id)), ...thread.items]
            : [...action.messages, ...unsent];
        return { items, hasMore: action.hasMore, loading: false, loaded: true, error: null };
      });

    case 'thread/failed':
      return updateThread(state, action.conversationId, (thread) => ({
        ...thread,
        loading: false,
        error: action.error,
      }));

    case 'threads/invalidated':
      // After an unrecoverable disconnect cached history may be stale: reload on next open.
      return {
        ...state,
        threads: Object.fromEntries(
          Object.entries(state.threads).map(([id, thread]) => [id, { ...thread, loaded: false }]),
        ),
      };

    case 'message/received': {
      const { message } = action;
      const thread = state.threads[message.conversationId];
      const duplicate = thread?.items.some((m) => m.id === message.id) ?? false;

      let next = state;
      if (thread?.loaded && !duplicate) {
        next = updateThread(next, message.conversationId, (t) => ({ ...t, items: [...t.items, message] }));
      }
      next = updateConversation(next, message.conversationId, (c) => ({
        ...bumpLastMessage(c, message),
        unreadCount: c.unreadCount + (action.countsAsUnread && !duplicate ? 1 : 0),
      }));
      // Whoever just sent a message has stopped typing.
      const typing = next.typing[message.conversationId];
      if (typing?.[message.sender.id]) {
        next = {
          ...next,
          typing: { ...next.typing, [message.conversationId]: withoutKey(typing, message.sender.id) },
        };
      }
      return next;
    }

    case 'message/pending':
      return updateThread(state, action.message.conversationId, (t) => ({
        ...t,
        items: [...t.items, action.message],
      }));

    case 'message/confirmed': {
      const { message, clientId } = action;
      const next = updateThread(state, message.conversationId, (t) => {
        // "message:new" may have arrived before the acknowledgement.
        const alreadyThere = t.items.some((m) => m.id === message.id);
        const items = alreadyThere
          ? t.items.filter((m) => m.clientId !== clientId)
          : t.items.map((m) => (m.clientId === clientId ? { ...message, localKey: clientId } : m));
        return { ...t, items };
      });
      return updateConversation(next, message.conversationId, (c) => bumpLastMessage(c, message));
    }

    case 'message/failed':
      return updateThread(state, action.conversationId, (t) => ({
        ...t,
        items: t.items.map((m) =>
          m.clientId === action.clientId ? { ...m, pending: false, error: action.error } : m,
        ),
      }));

    case 'message/retrying':
      return updateThread(state, action.conversationId, (t) => ({
        ...t,
        items: t.items.map((m) =>
          m.clientId === action.clientId ? { ...m, pending: true, error: undefined } : m,
        ),
      }));

    case 'message/deleted': {
      const deletedAt = new Date().toISOString();
      const remove = (m: Message): Message => (m.id === action.messageId ? { ...m, body: '', deletedAt } : m);
      const next = updateThread(state, action.conversationId, (t) => ({ ...t, items: t.items.map(remove) }));
      return updateConversation(next, action.conversationId, (c) => ({
        ...c,
        lastMessage: c.lastMessage && remove(c.lastMessage),
      }));
    }

    case 'typing/set': {
      const current = state.typing[action.conversationId] ?? {};
      const updated = action.isTyping
        ? { ...current, [action.userId]: action.username }
        : withoutKey(current, action.userId);
      return { ...state, typing: { ...state.typing, [action.conversationId]: updated } };
    }

    case 'presence/set':
      return {
        ...state,
        presence: { ...state.presence, [action.userId]: { online: action.online, lastSeen: action.lastSeen } },
      };

    case 'receipts/loaded':
      return {
        ...state,
        receipts: {
          ...state.receipts,
          [action.conversationId]: Object.fromEntries(action.receipts.map((r) => [r.userId, r])),
        },
      };

    case 'receipt/updated': {
      const { receipt } = action;
      const next: ChatState = {
        ...state,
        receipts: {
          ...state.receipts,
          [receipt.conversationId]: { ...state.receipts[receipt.conversationId], [receipt.userId]: receipt },
        },
      };
      // Reading in another tab/device clears the badge here too.
      return action.isMine
        ? updateConversation(next, receipt.conversationId, (c) => ({ ...c, unreadCount: 0 }))
        : next;
    }

    case 'connection/set':
      return { ...state, connection: action.status };
  }
}

/** Rooms alphabetically, then DMs with the most recent activity first. */
export function sortConversations(conversations: Record<string, Conversation>) {
  const all = Object.values(conversations);
  const rooms = all.filter((c) => c.type === 'room').sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
  const directs = all
    .filter((c) => c.type === 'dm')
    .sort((a, b) => (b.lastMessageAt ?? b.createdAt).localeCompare(a.lastMessageAt ?? a.createdAt));
  return { rooms, directs };
}
