import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import SendIcon from '@mui/icons-material/Send';
import { Box, IconButton, TextField, Tooltip, Typography } from '@mui/material';
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { formatTime } from '../lib/format';
import type { NearbyMessage } from '../types';

interface NearbyChatProps {
  messages: NearbyMessage[];
  selfToken: string;
  isAdmin: boolean;
  disabled: boolean;
  onSend: (body: string) => Promise<void>;
  onRemove: (id: string) => void;
}

/** The local room's message list and composer. */
export function NearbyChat({ messages, selfToken, isAdmin, disabled, onSend, onRemove }: NearbyChatProps) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  const send = async (event?: FormEvent) => {
    event?.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setError(null);
    try {
      await onSend(body);
      setDraft('');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send();
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Box ref={listRef} role="log" aria-label="Local messages" sx={{ flex: 1, overflowY: 'auto', px: 2, py: 1.5 }}>
        {messages.length === 0 ? (
          <Typography color="text.secondary" sx={{ textAlign: 'center', mt: 4, px: 2 }}>
            No messages within 1 km in the last 24 hours. Say hi to your neighbours!
          </Typography>
        ) : (
          messages.map((message) => {
            const mine = message.senderToken === selfToken;
            return (
              <Box
                key={message.id}
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: mine ? 'flex-end' : 'flex-start',
                  mb: 1.25,
                  '&:hover .remove': { opacity: 1 },
                }}
              >
                <Typography variant="caption" color="text.secondary" sx={{ px: 1 }}>
                  {mine ? 'You' : message.senderName}
                  {/* Admins see the account behind an alias, for moderation. */}
                  {message.sender && !mine && message.sender.username !== message.senderName && ` (${message.sender.username})`} ·{' '}
                  {formatTime(message.createdAt)}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexDirection: mine ? 'row-reverse' : 'row' }}>
                  <Box
                    sx={(theme) => ({
                      px: 1.5,
                      py: 0.75,
                      borderRadius: 3,
                      maxWidth: 420,
                      whiteSpace: 'pre-wrap',
                      overflowWrap: 'anywhere',
                      bgcolor: mine ? 'primary.main' : 'background.paper',
                      color: mine ? 'primary.contrastText' : 'text.primary',
                      border: mine ? 'none' : `1px solid ${theme.vars?.palette.divider}`,
                    })}
                  >
                    <Typography variant="body2">{message.body}</Typography>
                  </Box>
                  {isAdmin && (
                    <Tooltip title="Remove">
                      <IconButton
                        className="remove"
                        size="small"
                        aria-label="Remove local message"
                        onClick={() => onRemove(message.id)}
                        sx={{ opacity: 0, '@media (hover: none)': { opacity: 1 } }}
                      >
                        <DeleteOutlinedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                </Box>
              </Box>
            );
          })
        )}
      </Box>
      <Box component="form" onSubmit={send} sx={{ display: 'flex', gap: 1, p: 1.5, borderTop: 1, borderColor: 'divider' }}>
        <TextField
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={disabled ? 'Waiting for your location…' : 'Message people within 1 km'}
          disabled={disabled}
          multiline
          maxRows={4}
          fullWidth
          size="small"
          error={!!error}
          helperText={error}
          slotProps={{ htmlInput: { 'aria-label': 'Local message', maxLength: 2000 } }}
        />
        <IconButton type="submit" color="primary" disabled={disabled || !draft.trim()} aria-label="Send local message">
          <SendIcon />
        </IconButton>
      </Box>
    </Box>
  );
}
