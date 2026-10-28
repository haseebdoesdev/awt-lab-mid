import {
  createContext,
  type ReactNode,
  use,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router';
import { useAuth, useCurrentUser } from '../auth/AuthContext';
import { api, refreshSession } from '../lib/api';
import { setAppBadge, showNotification } from '../lib/notifications';
import { type ChatSocket, createSocket } from '../lib/socket';
import type { AckResponse, Conversation, Message, ReactionEmoji, ReplyPreview } from '../types';
import { type ChatState, type ClientMessage, chatReducer, initialChatState } from './chatReducer';

export interface ChatActions {
  /** Tells the provider which conversation is on screen (for unread + read receipts). */
  setActiveConversation: (conversationId: string | null) => void;
  openConversation: (conversationId: string) => Promise<void>;
  markRead: (conversationId: string) => void;
  loadOlderMessages: (conversationId: string) => Promise<void>;
  sendMessage: (conversationId: string, body: string, replyTo?: ReplyPreview | null) => void;
  /** Resolves when saved; rejects with a user-facing message. */
  editMessage: (messageId: string, body: string) => Promise<void>;
  toggleReaction: (messageId: string, emoji: ReactionEmoji) => Promise<void>;
  retryMessage: (message: ClientMessage) => void;
  setTyping: (conversationId: string, isTyping: boolean) => void;
  startDirectMessage: (userId: string) => Promise<string>;
  createRoom: (name: string, description: string) => Promise<string>;
  deleteRoom: (conversationId: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
}

const ChatStateContext = createContext<ChatState | null>(null);
const ChatActionsContext = createContext<ChatActions | null>(null);
/** The live socket, for features (like Nearby) that listen to their own events. */
const ChatSocketContext = createContext<ChatSocket | null>(null);

const SEND_TIMEOUT_MS = 10_000;
const TYPING_EXPIRY_MS = 6_000;
const READ_DEBOUNCE_MS = 400;

let pendingSequence = 0;

export const conversationTitle = (conversation: Conversation, myId: string) =>
  conversation.type === 'room'
    ? `#${conversation.name}`
    : (conversation.participants.find((p) => p.id !== myId)?.username ?? 'Direct message');

/**
 * Owns the Socket.IO connection and all chat state. State and actions are
 * exposed through separate contexts so components that only trigger actions
 * don't re-render on every incoming event.
 */
export function ChatProvider({ children }: { children: ReactNode }) {
  const me = useCurrentUser();
  const { endSession } = useAuth();
  const navigate = useNavigate();
  const [state, dispatch] = useReducer(chatReducer, initialChatState);
  const [liveSocket, setLiveSocket] = useState<ChatSocket | null>(null);

  const stateRef = useRef(state);
  const socketRef = useRef<ChatSocket | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const typingTimers = useRef(new Map<string, number>());
  const readTimers = useRef(new Map<string, number>());
  const olderInFlight = useRef(new Set<string>());
  const navigateRef = useRef(navigate);

  useEffect(() => {
    stateRef.current = state;
    navigateRef.current = navigate;
  });

  const actions = useMemo<ChatActions>(() => {
    const socket = () => socketRef.current;

    const loadThread = async (conversationId: string, mode: 'replace' | 'prepend') => {
      const thread = stateRef.current.threads[conversationId];
      const oldest = mode === 'prepend' ? thread?.items.find((m) => !m.clientId)?.id : undefined;
      dispatch({ type: 'thread/loading', conversationId });
      try {
        const { messages, hasMore } = await api.conversations.messages(conversationId, oldest);
        dispatch({ type: 'thread/loaded', conversationId, messages, hasMore, mode });
      } catch (error) {
        dispatch({ type: 'thread/failed', conversationId, error: (error as Error).message });
      }
    };

    const loadReceipts = async (conversationId: string) => {
      const { receipts } = await api.conversations.receipts(conversationId).catch(() => ({ receipts: [] }));
      dispatch({ type: 'receipts/loaded', conversationId, receipts });
    };

    // Clears the badge immediately; the receipt is sent debounced per conversation.
    const markRead = (conversationId: string) => {
      dispatch({ type: 'conversation/read', conversationId });
      const timers = readTimers.current;
      window.clearTimeout(timers.get(conversationId));
      timers.set(
        conversationId,
        window.setTimeout(() => {
          timers.delete(conversationId);
          socket()?.emit('conversation:read', { conversationId });
        }, READ_DEBOUNCE_MS),
      );
    };

    const deliver = async (message: ClientMessage) => {
      const clientId = message.clientId!;
      const { conversationId } = message;
      try {
        const sock = socket();
        if (!sock) throw new Error('Not connected');
        const response = await sock
          .timeout(SEND_TIMEOUT_MS)
          .emitWithAck('message:send', { conversationId, body: message.body, replyToId: message.replyTo?.id });
        if (response.ok) dispatch({ type: 'message/confirmed', clientId, message: response.data });
        else dispatch({ type: 'message/failed', conversationId, clientId, error: response.error });
      } catch {
        dispatch({ type: 'message/failed', conversationId, clientId, error: 'Not delivered – check your connection' });
      }
    };

    const connectedSocket = () => {
      const sock = socket();
      if (!sock?.connected) throw new Error('You are offline – try again when reconnected');
      return sock.timeout(SEND_TIMEOUT_MS);
    };

    /** Applies the message returned in an acknowledgement, or throws its error. */
    const applyUpdate = async (ack: Promise<AckResponse<Message>>) => {
      const response = await ack.catch(() => {
        throw new Error('The server did not respond – try again');
      });
      if (!response.ok) throw new Error(response.error);
      dispatch({ type: 'message/updated', message: response.data });
    };

    return {
      setActiveConversation(conversationId) {
        activeIdRef.current = conversationId;
      },

      async openConversation(conversationId) {
        const thread = stateRef.current.threads[conversationId];
        const work: Promise<void>[] = [loadReceipts(conversationId)];
        if (!thread?.loaded && !thread?.loading) work.push(loadThread(conversationId, 'replace'));
        markRead(conversationId);
        await Promise.all(work);
      },

      markRead,

      async loadOlderMessages(conversationId) {
        const thread = stateRef.current.threads[conversationId];
        // stateRef lags one render behind, so also guard against duplicate in-flight requests.
        const inFlight = olderInFlight.current;
        if (!thread?.loaded || thread.loading || !thread.hasMore || inFlight.has(conversationId)) return;
        inFlight.add(conversationId);
        try {
          await loadThread(conversationId, 'prepend');
        } finally {
          inFlight.delete(conversationId);
        }
      },

      sendMessage(conversationId, body, replyTo = null) {
        const clientId = `pending-${Date.now()}-${++pendingSequence}`;
        const message: ClientMessage = {
          id: clientId,
          clientId,
          conversationId,
          body,
          sender: { id: me.id, username: me.username, role: me.role },
          replyTo,
          reactions: [],
          createdAt: new Date().toISOString(),
          editedAt: null,
          deletedAt: null,
          pending: true,
        };
        dispatch({ type: 'message/pending', message });
        void deliver(message);
      },

      editMessage(messageId, body) {
        return applyUpdate(connectedSocket().emitWithAck('message:edit', { messageId, body }));
      },

      toggleReaction(messageId, emoji) {
        return applyUpdate(connectedSocket().emitWithAck('message:react', { messageId, emoji }));
      },

      retryMessage(message) {
        if (!message.clientId) return;
        dispatch({ type: 'message/retrying', conversationId: message.conversationId, clientId: message.clientId });
        void deliver(message);
      },

      setTyping(conversationId, isTyping) {
        socket()?.emit('typing', { conversationId, isTyping });
      },

      async startDirectMessage(userId) {
        const { conversation } = await api.conversations.openDirect(userId);
        if (!stateRef.current.conversations[conversation.id]) {
          dispatch({ type: 'conversation/upserted', conversation });
        }
        return conversation.id;
      },

      async createRoom(name, description) {
        const { conversation } = await api.conversations.createRoom(name, description);
        dispatch({ type: 'conversation/upserted', conversation });
        return conversation.id;
      },

      async deleteRoom(conversationId) {
        await api.conversations.remove(conversationId);
        dispatch({ type: 'conversation/removed', conversationId });
      },

      async deleteMessage(messageId) {
        await api.messages.remove(messageId);
      },
    };
  }, [me.id, me.username, me.role]);

  // Socket lifecycle: one connection per signed-in user.
  useEffect(() => {
    const socket = createSocket();
    socketRef.current = socket;
    setLiveSocket(socket);
    const timers = typingTimers.current;
    let retriedAuth = false;

    const loadConversations = async () => {
      try {
        const { conversations } = await api.conversations.list();
        dispatch({ type: 'conversations/loaded', conversations });
      } catch {
        // The connection banner already tells the user something is wrong.
      }
    };

    const clearTyping = (conversationId: string, userId: string) => {
      const key = `${conversationId}:${userId}`;
      window.clearTimeout(timers.get(key));
      timers.delete(key);
    };

    const notify = (message: Message) => {
      const conversation = stateRef.current.conversations[message.conversationId];
      if (!conversation) return;
      const title =
        conversation.type === 'room' ? `${message.sender.username} in #${conversation.name}` : message.sender.username;
      showNotification(title, message.body, message.conversationId, () =>
        navigateRef.current(`/c/${message.conversationId}`),
      );
    };

    socket.on('connect', () => {
      retriedAuth = false;
      dispatch({ type: 'connection/set', status: 'connected' });
      // Short outages are replayed by connection-state recovery; otherwise resync.
      if (!socket.recovered) {
        dispatch({ type: 'threads/invalidated' });
        void loadConversations();
        const active = activeIdRef.current;
        if (active) actions.openConversation(active).catch(() => undefined);
      }
    });

    socket.on('disconnect', (reason) => {
      dispatch({ type: 'connection/set', status: reason === 'io client disconnect' ? 'offline' : 'reconnecting' });
    });

    socket.on('connect_error', async (error) => {
      dispatch({ type: 'connection/set', status: 'reconnecting' });
      if (error.message !== 'unauthorized') return; // transport errors retry automatically
      // The access token expired: refresh it once, then reconnect manually.
      if (!retriedAuth && (await refreshSession())) {
        retriedAuth = true;
        socket.connect();
      } else {
        endSession('Your session has expired. Please sign in again.');
      }
    });

    socket.on('message:new', (message) => {
      const mine = message.sender.id === me.id;
      const onScreen = activeIdRef.current === message.conversationId && document.visibilityState === 'visible';
      clearTyping(message.conversationId, message.sender.id);
      dispatch({ type: 'message/received', message, countsAsUnread: !mine && !onScreen });
      if (mine) return;
      if (onScreen) actions.markRead(message.conversationId);
      else notify(message);
    });

    socket.on('message:updated', (message) => {
      dispatch({ type: 'message/updated', message });
    });

    socket.on('message:deleted', ({ conversationId, messageId }) => {
      dispatch({ type: 'message/deleted', conversationId, messageId });
    });

    socket.on('typing', ({ conversationId, user, isTyping }) => {
      clearTyping(conversationId, user.id);
      dispatch({ type: 'typing/set', conversationId, userId: user.id, username: user.username, isTyping });
      if (isTyping) {
        // Expire the indicator in case the "stopped typing" event never arrives.
        const timer = window.setTimeout(() => {
          timers.delete(`${conversationId}:${user.id}`);
          dispatch({ type: 'typing/set', conversationId, userId: user.id, username: user.username, isTyping: false });
        }, TYPING_EXPIRY_MS);
        timers.set(`${conversationId}:${user.id}`, timer);
      }
    });

    socket.on('presence', ({ userId, online, lastSeen }) => {
      dispatch({ type: 'presence/set', userId, online, lastSeen });
    });

    socket.on('read:update', (receipt) => {
      dispatch({ type: 'receipt/updated', receipt, isMine: receipt.userId === me.id });
    });

    socket.on('conversation:new', (conversation) => {
      dispatch({ type: 'conversation/upserted', conversation });
    });

    socket.on('conversation:deleted', ({ conversationId }) => {
      dispatch({ type: 'conversation/removed', conversationId });
      if (activeIdRef.current === conversationId) navigateRef.current('/', { replace: true });
    });

    socket.on('session:revoked', ({ reason }) => endSession(reason));

    dispatch({ type: 'connection/set', status: 'connecting' });
    socket.connect();

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      setLiveSocket(null);
      for (const timer of timers.values()) window.clearTimeout(timer);
      timers.clear();
    };
  }, [me.id, actions, endSession]);

  // When the tab becomes visible again, mark the open conversation as read.
  useEffect(() => {
    const onVisibilityChange = () => {
      const active = activeIdRef.current;
      if (document.visibilityState === 'visible' && active && stateRef.current.conversations[active]?.unreadCount) {
        actions.markRead(active);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [actions]);

  // Unread total in the tab title and on the app icon (Badging API).
  const unreadTotal = Object.values(state.conversations).reduce((sum, c) => sum + c.unreadCount, 0);
  useEffect(() => {
    document.title = unreadTotal > 0 ? `(${unreadTotal}) Pulse Chat` : 'Pulse Chat';
    setAppBadge(unreadTotal);
  }, [unreadTotal]);

  useEffect(
    () => () => {
      document.title = 'Pulse Chat';
      setAppBadge(0);
    },
    [],
  );

  return (
    <ChatActionsContext value={actions}>
      <ChatSocketContext value={liveSocket}>
        <ChatStateContext value={state}>{children}</ChatStateContext>
      </ChatSocketContext>
    </ChatActionsContext>
  );
}

export function useChatState(): ChatState {
  const context = use(ChatStateContext);
  if (!context) throw new Error('useChatState must be used inside <ChatProvider>');
  return context;
}

export function useChatSocket(): ChatSocket | null {
  return use(ChatSocketContext);
}

export function useChatActions(): ChatActions {
  const context = use(ChatActionsContext);
  if (!context) throw new Error('useChatActions must be used inside <ChatProvider>');
  return context;
}
