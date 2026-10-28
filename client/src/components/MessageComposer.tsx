import CloseIcon from '@mui/icons-material/Close';
import ReplyIcon from '@mui/icons-material/Reply';
import SendIcon from '@mui/icons-material/Send';
import { Box, IconButton, TextField, Tooltip, Typography } from '@mui/material';
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { useChatActions } from '../chat/ChatContext';
import type { Message } from '../types';

const MAX_LENGTH = 2000;
const TYPING_IDLE_MS = 3000;

const draftKey = (conversationId: string) => `pulse:draft:${conversationId}`;

function readDraft(conversationId: string): string {
  try {
    return sessionStorage.getItem(draftKey(conversationId)) ?? '';
  } catch {
    return '';
  }
}

function writeDraft(conversationId: string, value: string) {
  try {
    if (value) sessionStorage.setItem(draftKey(conversationId), value);
    else sessionStorage.removeItem(draftKey(conversationId));
  } catch {
    // Storage unavailable (private mode) – drafts simply aren't kept.
  }
}

/**
 * Message input: Enter sends, Shift+Enter adds a new line. Emits throttled
 * typing notifications and keeps an unsent draft per conversation.
 */
interface MessageComposerProps {
  conversationId: string;
  placeholder: string;
  /** The message being replied to, shown above the input. */
  replyingTo: Message | null;
  onCancelReply: () => void;
}

export function MessageComposer({ conversationId, placeholder, replyingTo, onCancelReply }: MessageComposerProps) {
  const { sendMessage, setTyping } = useChatActions();
  const [draft, setDraft] = useState(() => readDraft(conversationId));
  const typing = useRef({ active: false, lastSentAt: 0, idleTimer: 0 });
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    writeDraft(conversationId, draft);
  }, [conversationId, draft]);

  useEffect(() => {
    const state = typing.current;
    return () => {
      window.clearTimeout(state.idleTimer);
      if (state.active) setTyping(conversationId, false);
    };
  }, [conversationId, setTyping]);

  const stopTyping = () => {
    const state = typing.current;
    window.clearTimeout(state.idleTimer);
    if (state.active) {
      state.active = false;
      setTyping(conversationId, false);
    }
  };

  const onChange = (value: string) => {
    setDraft(value);
    if (!value.trim()) {
      stopTyping();
      return;
    }
    const state = typing.current;
    const now = Date.now();
    // Re-announce at most every few seconds; receivers expire the indicator on their own.
    if (!state.active || now - state.lastSentAt > TYPING_IDLE_MS) {
      state.active = true;
      state.lastSentAt = now;
      setTyping(conversationId, true);
    }
    window.clearTimeout(state.idleTimer);
    state.idleTimer = window.setTimeout(stopTyping, TYPING_IDLE_MS);
  };

  const submit = () => {
    const body = draft.trim();
    if (!body || body.length > MAX_LENGTH) return;
    const replyTo = replyingTo
      ? { id: replyingTo.id, sender: replyingTo.sender, body: replyingTo.body, deletedAt: replyingTo.deletedAt }
      : null;
    sendMessage(conversationId, body, replyTo);
    onCancelReply();
    setDraft('');
    stopTyping();
    inputRef.current?.focus();
  };

  // Focus the input as soon as a reply is started.
  useEffect(() => {
    if (replyingTo) inputRef.current?.focus();
  }, [replyingTo]);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && replyingTo) onCancelReply();
    // Don't send while an IME composition (e.g. Japanese input) is in progress.
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  const remaining = MAX_LENGTH - draft.length;

  return (
    <>
      {replyingTo && (
        <Box
          sx={{
            mx: { xs: 1.5, md: 3 },
            mb: 0.5,
            pl: 1.5,
            pr: 0.5,
            py: 0.5,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            borderLeft: 3,
            borderColor: 'primary.main',
            bgcolor: 'action.hover',
            borderRadius: 1.5,
          }}
        >
          <ReplyIcon fontSize="small" color="primary" />
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="caption" component="div" sx={{ fontWeight: 700 }}>
              Replying to {replyingTo.sender.username}
            </Typography>
            <Typography variant="caption" component="div" color="text.secondary" noWrap>
              {replyingTo.body}
            </Typography>
          </Box>
          <Tooltip title="Cancel reply (Esc)">
            <IconButton size="small" onClick={onCancelReply} aria-label="Cancel reply">
              <CloseIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      )}
      <Box
        component="form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        sx={{ display: 'flex', alignItems: 'flex-end', gap: 1, px: { xs: 1.5, md: 3 }, pb: 2, pt: 0.5 }}
      >
        <TextField
          inputRef={inputRef}
          value={draft}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={stopTyping}
          placeholder={placeholder}
          multiline
          maxRows={6}
          fullWidth
          autoFocus
          autoComplete="off"
          error={remaining < 0}
          helperText={remaining < 200 ? `${remaining} characters left` : undefined}
          slotProps={{
            htmlInput: { 'aria-label': placeholder },
            input: { sx: { borderRadius: 3, bgcolor: 'background.paper' } },
          }}
        />
        <Tooltip title="Send (Enter)">
          <span>
            <IconButton
              type="submit"
              color="primary"
              disabled={!draft.trim() || remaining < 0}
              aria-label="Send message"
              sx={{ mb: remaining < 200 ? 3 : 0.5 }}
            >
              <SendIcon />
            </IconButton>
          </span>
        </Tooltip>
      </Box>
    </>
  );
}

export function TypingIndicator({ names }: { names: string[] }) {
  const text =
    names.length === 0
      ? ''
      : names.length === 1
        ? `${names[0]} is typing`
        : names.length === 2
          ? `${names[0]} and ${names[1]} are typing`
          : 'Several people are typing';

  return (
    <Box sx={{ height: 22, px: { xs: 2, md: 3 }, display: 'flex', alignItems: 'center', gap: 1 }} aria-live="polite">
      {text && (
        <>
          <Box
            aria-hidden
            sx={{
              display: 'flex',
              gap: '3px',
              '& span': {
                width: 5,
                height: 5,
                borderRadius: '50%',
                bgcolor: 'text.secondary',
                animation: 'pulse-typing 1.2s infinite ease-in-out',
              },
              '& span:nth-of-type(2)': { animationDelay: '0.15s' },
              '& span:nth-of-type(3)': { animationDelay: '0.3s' },
              '@keyframes pulse-typing': {
                '0%, 60%, 100%': { transform: 'translateY(0)', opacity: 0.4 },
                '30%': { transform: 'translateY(-3px)', opacity: 1 },
              },
            }}
          >
            <span />
            <span />
            <span />
          </Box>
          <Typography variant="caption" color="text.secondary">
            {text}…
          </Typography>
        </>
      )}
    </Box>
  );
}
