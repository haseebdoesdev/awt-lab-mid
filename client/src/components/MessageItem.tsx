import AddReactionOutlinedIcon from '@mui/icons-material/AddReactionOutlined';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import ReplyIcon from '@mui/icons-material/Reply';
import { Box, Button, ButtonBase, Chip, IconButton, Link, Popover, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { type KeyboardEvent, memo, useState } from 'react';
import { useChatActions } from '../chat/ChatContext';
import type { ClientMessage } from '../chat/chatReducer';
import { formatFull, formatTime } from '../lib/format';
import { REACTION_EMOJIS, type ReactionEmoji, type ReplyPreview } from '../types';
import { UserAvatar } from './UserAvatar';

const URL_PATTERN = /(https?:\/\/[^\s<]+[^\s<.,:;"')\]!?])/g;

/** Renders text with http(s) URLs turned into safe external links. */
function Linkified({ text }: { text: string }) {
  return text.split(URL_PATTERN).map((part, index) =>
    index % 2 === 1 ? (
      <Link key={index} href={part} target="_blank" rel="noopener noreferrer" color="inherit" underline="always">
        {part}
      </Link>
    ) : (
      part
    ),
  );
}

/** The quoted message shown at the top of a reply. Click to jump to the original. */
function ReplyQuote({ reply, mine, onJump }: { reply: ReplyPreview; mine: boolean; onJump: (id: string) => void }) {
  return (
    <ButtonBase
      onClick={() => onJump(reply.id)}
      aria-label={`Go to the message from ${reply.sender.username}`}
      sx={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        mb: 0.75,
        px: 1,
        py: 0.5,
        borderRadius: 1.5,
        borderLeft: 3,
        borderColor: mine ? 'primary.contrastText' : 'primary.main',
        bgcolor: mine ? 'rgb(255 255 255 / 0.15)' : 'action.hover',
      }}
    >
      <Typography variant="caption" component="div" sx={{ fontWeight: 700 }}>
        {reply.sender.username}
      </Typography>
      <Typography
        variant="caption"
        component="div"
        sx={{
          opacity: 0.85,
          fontStyle: reply.deletedAt ? 'italic' : undefined,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {reply.deletedAt ? 'Message removed' : reply.body}
      </Typography>
    </ButtonBase>
  );
}

function InlineEditor({ message, onDone }: { message: ClientMessage; onDone: () => void }) {
  const { editMessage } = useChatActions();
  const [value, setValue] = useState(message.body);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const body = value.trim();
    if (!body) return setError('Message cannot be empty');
    if (body === message.body) return onDone();
    setSaving(true);
    try {
      await editMessage(message.id, body);
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') onDone();
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void save();
    }
  };

  return (
    <Box sx={{ width: { xs: '100%', sm: 420 }, maxWidth: '100%' }}>
      <TextField
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setError(null);
        }}
        onKeyDown={onKeyDown}
        multiline
        maxRows={8}
        fullWidth
        autoFocus
        size="small"
        error={!!error}
        helperText={error ?? 'Enter to save · Esc to cancel'}
        onFocus={(e) => e.target.setSelectionRange(e.target.value.length, e.target.value.length)}
        slotProps={{ htmlInput: { 'aria-label': 'Edit message', maxLength: 2000 } }}
      />
      <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end', mt: 0.5 }}>
        <Button size="small" onClick={onDone} disabled={saving}>
          Cancel
        </Button>
        <Button size="small" variant="contained" onClick={() => void save()} loading={saving}>
          Save
        </Button>
      </Stack>
    </Box>
  );
}

interface MessageItemProps {
  message: ClientMessage;
  mine: boolean;
  myId: string;
  /** Follows a message from the same sender – hide avatar and name. */
  grouped: boolean;
  showSender: boolean;
  canDelete: boolean;
  highlighted: boolean;
  onDelete: (message: ClientMessage) => void;
  onRetry: (message: ClientMessage) => void;
  onReply: (message: ClientMessage) => void;
  onReact: (message: ClientMessage, emoji: ReactionEmoji) => void;
  onJumpTo: (messageId: string) => void;
}

export const MessageItem = memo(function MessageItem({
  message,
  mine,
  myId,
  grouped,
  showSender,
  canDelete,
  highlighted,
  onDelete,
  onRetry,
  onReply,
  onReact,
  onJumpTo,
}: MessageItemProps) {
  const [editing, setEditing] = useState(false);
  const [pickerAnchor, setPickerAnchor] = useState<HTMLElement | null>(null);
  const removed = message.deletedAt !== null;
  const myReaction = message.reactions.find((r) => r.users.some((u) => u.id === myId))?.emoji;
  // Optimistic messages can't be reacted to, replied to or edited until the server confirms them.
  const interactive = !removed && !message.clientId && !editing;

  return (
    <Box
      id={`message-${message.id}`}
      sx={{
        display: 'flex',
        flexDirection: mine ? 'row-reverse' : 'row',
        alignItems: 'flex-end',
        gap: 1,
        mt: grouped ? 0.25 : 1.5,
        px: { xs: 1.5, md: 3 },
        py: 0.25,
        transition: 'background-color 600ms',
        bgcolor: highlighted ? 'action.selected' : 'transparent',
        '&:hover .message-actions, &:focus-within .message-actions': { opacity: 1 },
      }}
    >
      {!mine && (
        <Box sx={{ width: 32, flexShrink: 0 }}>
          {!grouped && <UserAvatar id={message.sender.id} username={message.sender.username} size={32} />}
        </Box>
      )}

      <Box
        sx={{
          maxWidth: { xs: '80%', md: '65%' },
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: mine ? 'flex-end' : 'flex-start',
        }}
      >
        {showSender && !grouped && !mine && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.25, ml: 1.5 }}>
            <Typography variant="caption" sx={{ fontWeight: 700 }}>
              {message.sender.username}
            </Typography>
            {message.sender.role === 'admin' && (
              <Chip label="admin" size="small" color="secondary" sx={{ height: 16, fontSize: 10, fontWeight: 700 }} />
            )}
          </Box>
        )}

        {editing ? (
          <InlineEditor message={message} onDone={() => setEditing(false)} />
        ) : (
          <Tooltip title={formatFull(message.createdAt)} placement={mine ? 'left' : 'right'} enterDelay={600}>
            <Box
              sx={(theme) => ({
                px: 1.75,
                py: 1,
                borderRadius: 3.5,
                ...(mine ? { borderBottomRightRadius: grouped ? 14 : 4 } : { borderBottomLeftRadius: grouped ? 14 : 4 }),
                bgcolor: mine ? 'primary.main' : 'background.paper',
                color: mine ? 'primary.contrastText' : 'text.primary',
                border: mine ? 'none' : `1px solid ${theme.vars?.palette.divider}`,
                opacity: message.pending ? 0.65 : 1,
                whiteSpace: 'pre-wrap',
                overflowWrap: 'anywhere',
                transition: 'opacity 150ms',
              })}
            >
              {message.replyTo && !removed && <ReplyQuote reply={message.replyTo} mine={mine} onJump={onJumpTo} />}
              {removed ? (
                <Typography variant="body2" sx={{ fontStyle: 'italic', opacity: 0.75 }}>
                  This message was removed by a moderator
                </Typography>
              ) : (
                <Typography variant="body2" component="div" sx={{ lineHeight: 1.5 }}>
                  <Linkified text={message.body} />
                </Typography>
              )}
              <Typography
                variant="caption"
                component="div"
                sx={{ textAlign: 'right', opacity: 0.7, fontSize: 11, mt: 0.25, lineHeight: 1 }}
              >
                {message.editedAt && !removed && (
                  <Tooltip title={`Edited ${formatFull(message.editedAt)}`}>
                    <span>edited · </span>
                  </Tooltip>
                )}
                {message.pending ? 'Sending…' : formatTime(message.createdAt)}
              </Typography>
            </Box>
          </Tooltip>
        )}

        {message.reactions.length > 0 && (
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.5, mt: 0.5, justifyContent: mine ? 'flex-end' : 'flex-start' }}>
            {message.reactions.map((reaction) => {
              const reacted = reaction.users.some((u) => u.id === myId);
              const names = reaction.users.map((u) => (u.id === myId ? 'You' : u.username)).join(', ');
              return (
                <Tooltip key={reaction.emoji} title={`${names} reacted with ${reaction.emoji}`} describeChild>
                  <Chip
                    size="small"
                    label={`${reaction.emoji} ${reaction.users.length}`}
                    onClick={() => onReact(message, reaction.emoji)}
                    color={reacted ? 'primary' : 'default'}
                    variant={reacted ? 'filled' : 'outlined'}
                    aria-pressed={reacted}
                    sx={{ height: 24, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}
                  />
                </Tooltip>
              );
            })}
          </Stack>
        )}

        {message.error && (
          <Typography variant="caption" color="error" sx={{ mt: 0.5 }}>
            {message.error} ·{' '}
            <Button size="small" color="error" onClick={() => onRetry(message)} sx={{ minWidth: 0, p: 0, fontSize: 'inherit' }}>
              Retry
            </Button>
          </Typography>
        )}
      </Box>

      {interactive && (
        <Stack
          className="message-actions"
          direction="row"
          sx={{
            opacity: pickerAnchor ? 1 : 0,
            transition: 'opacity 150ms',
            alignSelf: 'center',
            bgcolor: 'background.paper',
            border: 1,
            borderColor: 'divider',
            borderRadius: 2,
            '@media (hover: none)': { opacity: 1 },
          }}
        >
          <Tooltip title="React">
            <IconButton size="small" aria-label="Add reaction" onClick={(e) => setPickerAnchor(e.currentTarget)}>
              <AddReactionOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Reply">
            <IconButton size="small" aria-label="Reply" onClick={() => onReply(message)}>
              <ReplyIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          {mine && (
            <Tooltip title="Edit">
              <IconButton size="small" aria-label="Edit message" onClick={() => setEditing(true)}>
                <EditOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {canDelete && (
            <Tooltip title="Remove">
              <IconButton size="small" aria-label="Remove message" onClick={() => onDelete(message)}>
                <DeleteOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      )}

      <Popover
        open={pickerAnchor !== null}
        anchorEl={pickerAnchor}
        onClose={() => setPickerAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        slotProps={{ paper: { sx: { borderRadius: 6, p: 0.5 } } }}
      >
        <Stack direction="row" role="group" aria-label="Choose a reaction">
          {REACTION_EMOJIS.map((emoji) => (
            <IconButton
              key={emoji}
              aria-label={emoji === myReaction ? `Remove your ${emoji} reaction` : `React with ${emoji}`}
              aria-pressed={emoji === myReaction}
              onClick={() => {
                setPickerAnchor(null);
                onReact(message, emoji);
              }}
              sx={{
                fontSize: 22,
                width: 40,
                height: 40,
                transition: 'transform 120ms',
                '&:hover': { transform: 'scale(1.25)' },
                // One reaction per person: show which one is yours.
                ...(emoji === myReaction && { bgcolor: 'action.selected' }),
              }}
            >
              {emoji}
            </IconButton>
          ))}
        </Stack>
      </Popover>
    </Box>
  );
});
