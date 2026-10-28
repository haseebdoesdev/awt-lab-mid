import DoneIcon from '@mui/icons-material/Done';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { Alert, Box, Button, CircularProgress, Divider, Fab, Snackbar, Typography } from '@mui/material';
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useCurrentUser } from '../auth/AuthContext';
import { useChatActions, useChatState } from '../chat/ChatContext';
import type { ClientMessage, Thread } from '../chat/chatReducer';
import { formatDay, isSameDay } from '../lib/format';
import type { Conversation, ReactionEmoji } from '../types';
import { ConfirmDialog } from './ConfirmDialog';
import { MessageItem } from './MessageItem';

const GROUP_WINDOW_MS = 5 * 60_000;
const NEAR_BOTTOM_PX = 120;

function startsGroup(previous: ClientMessage | undefined, message: ClientMessage) {
  if (!previous || previous.sender.id !== message.sender.id) return true;
  return new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() > GROUP_WINDOW_MS;
}

/** "Seen" marker under the latest message, built from read receipts. */
function SeenMarker({ conversation, last }: { conversation: Conversation; last: ClientMessage }) {
  const me = useCurrentUser();
  const { receipts } = useChatState();
  const readers = Object.values(receipts[conversation.id] ?? {}).filter(
    (r) => r.userId !== me.id && r.userId !== last.sender.id && r.lastReadAt >= last.createdAt,
  );
  const mine = last.sender.id === me.id;

  let label: string | null = null;
  if (conversation.type === 'dm') {
    if (mine) label = readers.length > 0 ? 'Seen' : 'Sent';
  } else if (readers.length > 0) {
    const names = readers.slice(0, 3).map((r) => r.username);
    label = `Seen by ${names.join(', ')}${readers.length > 3 ? ` and ${readers.length - 3} others` : ''}`;
  }
  if (!label || last.pending || last.error) return null;

  const Icon = readers.length > 0 ? DoneAllIcon : DoneIcon;
  return (
    <Typography
      variant="caption"
      color={readers.length > 0 ? 'primary' : 'text.secondary'}
      sx={{ display: 'flex', alignItems: 'center', justifyContent: mine ? 'flex-end' : 'flex-start', gap: 0.5, px: { xs: 2, md: 3 }, pl: mine ? undefined : { xs: 7, md: 8.5 }, mt: 0.5 }}
    >
      <Icon sx={{ fontSize: 14 }} />
      {label}
    </Typography>
  );
}

/**
 * Scrollable history: keeps the view pinned to the bottom for new messages,
 * loads older pages with an IntersectionObserver when the top is reached and
 * preserves the scroll position while prepending.
 */
export function MessageList({
  conversation,
  thread,
  onReply,
}: {
  conversation: Conversation;
  thread: Thread | undefined;
  onReply: (message: ClientMessage) => void;
}) {
  const me = useCurrentUser();
  const { loadOlderMessages, retryMessage, deleteMessage, openConversation, toggleReaction } = useChatActions();
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const distanceFromBottom = useRef(0);
  const nearBottom = useRef(true);
  const edges = useRef<{ first?: string; last?: string }>({});
  const [unseenBelow, setUnseenBelow] = useState(0);
  const [toDelete, setToDelete] = useState<ClientMessage | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const items = thread?.items ?? [];
  const firstId = items[0]?.id;
  const lastItem = items.at(-1);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    distanceFromBottom.current = el.scrollHeight - el.scrollTop;
    nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    if (nearBottom.current) setUnseenBelow(0);
  };

  const scrollToBottom = (behavior: ScrollBehavior) => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior });
    setUnseenBelow(0);
  };

  // Runs before paint so the user never sees the list jump.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const previous = edges.current;
    const lastId = lastItem?.id;

    if (!previous.last) {
      el.scrollTop = el.scrollHeight; // first render with messages
    } else if (firstId !== previous.first && lastId === previous.last) {
      el.scrollTop = el.scrollHeight - distanceFromBottom.current; // older page prepended
    } else if (lastId !== previous.last) {
      if (nearBottom.current || lastItem?.sender.id === me.id) {
        // Animate short hops; jump straight down when far up in the history.
        el.scrollTo({ top: el.scrollHeight, behavior: nearBottom.current ? 'smooth' : 'auto' });
      } else {
        setUnseenBelow((n) => n + 1);
      }
    }

    edges.current = { first: firstId, last: lastId };
    distanceFromBottom.current = el.scrollHeight - el.scrollTop;
  }, [firstId, lastItem, me.id]);

  // Infinite scroll upwards. Re-observing after each page re-checks whether the
  // sentinel is still visible (e.g. the first pages didn't fill the screen).
  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = scrollRef.current;
    if (!sentinel || !root || !thread?.loaded || !thread.hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadOlderMessages(conversation.id);
      },
      { root, rootMargin: '300px 0px 0px 0px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [conversation.id, loadOlderMessages, thread?.loaded, thread?.hasMore, firstId]);

  const handleDelete = useCallback((message: ClientMessage) => setToDelete(message), []);
  const handleRetry = useCallback((message: ClientMessage) => retryMessage(message), [retryMessage]);
  const handleReact = useCallback(
    (message: ClientMessage, emoji: ReactionEmoji) => {
      toggleReaction(message.id, emoji).catch((error: Error) => setNotice(error.message));
    },
    [toggleReaction],
  );

  // Scrolls to the quoted message and flashes it.
  const jumpTo = useCallback((messageId: string) => {
    const target = document.getElementById(`message-${messageId}`);
    if (!target) {
      setNotice('That message is further back – scroll up to load it');
      return;
    }
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightId(messageId);
    window.setTimeout(() => setHighlightId((current) => (current === messageId ? null : current)), 1600);
  }, []);

  const lastConfirmed = [...items].reverse().find((m) => !m.clientId && !m.deletedAt);

  return (
    <Box sx={{ position: 'relative', flex: 1, minHeight: 0 }}>
      <Box
        ref={scrollRef}
        onScroll={onScroll}
        role="log"
        aria-live="polite"
        aria-label="Messages"
        sx={{ height: '100%', overflowY: 'auto', overscrollBehavior: 'contain', py: 2 }}
      >
        <div ref={sentinelRef} />

        {thread?.loading && (
          <Box sx={{ display: 'grid', placeItems: 'center', py: 2 }}>
            <CircularProgress size={24} />
          </Box>
        )}

        {thread?.error && (
          <Alert
            severity="error"
            sx={{ mx: 3, mb: 2 }}
            action={
              <Button color="inherit" size="small" onClick={() => openConversation(conversation.id)}>
                Retry
              </Button>
            }
          >
            {thread.error}
          </Alert>
        )}

        {thread?.loaded && !thread.hasMore && (
          <Box sx={{ textAlign: 'center', px: 3, py: 4 }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {conversation.type === 'room' ? `Welcome to #${conversation.name}` : 'This is the start of your conversation'}
            </Typography>
            <Typography color="text.secondary" variant="body2">
              {conversation.type === 'room'
                ? conversation.description || 'This is the very beginning of the room.'
                : 'Messages here are only visible to the two of you.'}
            </Typography>
          </Box>
        )}

        {items.map((message, index) => {
          const previous = items[index - 1];
          const newDay = !previous || !isSameDay(previous.createdAt, message.createdAt);
          return (
            <Fragment key={message.localKey ?? message.clientId ?? message.id}>
              {newDay && (
                <Divider sx={{ my: 2, px: 3, typography: 'caption', color: 'text.secondary', fontWeight: 600 }}>
                  {formatDay(message.createdAt)}
                </Divider>
              )}
              <MessageItem
                message={message}
                mine={message.sender.id === me.id}
                grouped={!newDay && !startsGroup(previous, message)}
                showSender={conversation.type === 'room'}
                myId={me.id}
                canDelete={me.role === 'admin'}
                highlighted={highlightId === message.id}
                onReply={onReply}
                onReact={handleReact}
                onJumpTo={jumpTo}
                onDelete={handleDelete}
                onRetry={handleRetry}
              />
            </Fragment>
          );
        })}

        {lastConfirmed && lastConfirmed === lastItem && <SeenMarker conversation={conversation} last={lastConfirmed} />}
      </Box>

      {unseenBelow > 0 && (
        <Fab
          variant="extended"
          size="small"
          color="primary"
          onClick={() => scrollToBottom('smooth')}
          sx={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)' }}
        >
          <KeyboardArrowDownIcon sx={{ mr: 0.5 }} />
          {unseenBelow} new {unseenBelow === 1 ? 'message' : 'messages'}
        </Fab>
      )}

      <Snackbar
        open={notice !== null}
        autoHideDuration={4000}
        onClose={() => setNotice(null)}
        message={notice}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />

      <ConfirmDialog
        open={toDelete !== null}
        title="Remove this message?"
        message="It will be replaced with a placeholder for everyone in the conversation."
        confirmLabel="Remove"
        onConfirm={async () => {
          if (toDelete) await deleteMessage(toDelete.id);
        }}
        onClose={() => setToDelete(null)}
      />
    </Box>
  );
}
