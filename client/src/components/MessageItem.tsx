import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import { Box, Button, Chip, IconButton, Link, Tooltip, Typography } from '@mui/material';
import { memo } from 'react';
import type { ClientMessage } from '../chat/chatReducer';
import { formatFull, formatTime } from '../lib/format';
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

interface MessageItemProps {
  message: ClientMessage;
  mine: boolean;
  /** Follows a message from the same sender – hide avatar and name. */
  grouped: boolean;
  showSender: boolean;
  canDelete: boolean;
  onDelete: (message: ClientMessage) => void;
  onRetry: (message: ClientMessage) => void;
}

export const MessageItem = memo(function MessageItem({
  message,
  mine,
  grouped,
  showSender,
  canDelete,
  onDelete,
  onRetry,
}: MessageItemProps) {
  const removed = message.deletedAt !== null;

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: mine ? 'row-reverse' : 'row',
        alignItems: 'flex-end',
        gap: 1,
        mt: grouped ? 0.25 : 1.5,
        px: { xs: 1.5, md: 3 },
        '&:hover .message-actions, &:focus-within .message-actions': { opacity: 1 },
      }}
    >
      {!mine && (
        <Box sx={{ width: 32, flexShrink: 0 }}>
          {!grouped && <UserAvatar id={message.sender.id} username={message.sender.username} size={32} />}
        </Box>
      )}

      <Box sx={{ maxWidth: { xs: '80%', md: '65%' }, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start' }}>
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
              {message.pending ? 'Sending…' : formatTime(message.createdAt)}
            </Typography>
          </Box>
        </Tooltip>

        {message.error && (
          <Typography variant="caption" color="error" sx={{ mt: 0.5 }}>
            {message.error} ·{' '}
            <Button size="small" color="error" onClick={() => onRetry(message)} sx={{ minWidth: 0, p: 0, fontSize: 'inherit' }}>
              Retry
            </Button>
          </Typography>
        )}
      </Box>

      {canDelete && !removed && !message.clientId && (
        <IconButton
          className="message-actions"
          size="small"
          aria-label="Remove message"
          onClick={() => onDelete(message)}
          sx={{ opacity: 0, transition: 'opacity 150ms', alignSelf: 'center' }}
        >
          <DeleteOutlinedIcon fontSize="small" />
        </IconButton>
      )}
    </Box>
  );
});
