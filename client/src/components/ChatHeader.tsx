import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import TagIcon from '@mui/icons-material/Tag';
import { Box, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useCurrentUser } from '../auth/AuthContext';
import { useChatActions, useChatState } from '../chat/ChatContext';
import { formatRelative } from '../lib/format';
import type { Conversation } from '../types';
import { ConfirmDialog } from './ConfirmDialog';
import { UserAvatar } from './UserAvatar';

export function ChatHeader({ conversation }: { conversation: Conversation }) {
  const me = useCurrentUser();
  const { presence } = useChatState();
  const { deleteRoom } = useChatActions();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);

  const other = conversation.participants.find((p) => p.id !== me.id);
  const status = other ? (presence[other.id] ?? other) : null;

  return (
    <Box
      sx={{
        px: { xs: 2, md: 3 },
        py: 1.5,
        borderBottom: 1,
        borderColor: 'divider',
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
      }}
    >
      {conversation.type === 'room' || !other ? (
        <TagIcon color="action" />
      ) : (
        <UserAvatar id={other.id} username={other.username} online={status?.online} size={38} />
      )}

      <Stack sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="subtitle1" component="h1" noWrap sx={{ fontWeight: 700, lineHeight: 1.3 }}>
          {conversation.type === 'room' ? conversation.name : other?.username}
        </Typography>
        <Typography variant="body2" color="text.secondary" noWrap>
          {conversation.type === 'room'
            ? conversation.description || 'Public room'
            : status?.online
              ? 'Online'
              : status?.lastSeen
                ? `Last seen ${formatRelative(status.lastSeen)}`
                : 'Offline'}
        </Typography>
      </Stack>

      {conversation.type === 'room' && me.role === 'admin' && (
        <Tooltip title="Delete room">
          <IconButton onClick={() => setConfirming(true)} aria-label="Delete room">
            <DeleteOutlinedIcon />
          </IconButton>
        </Tooltip>
      )}

      <ConfirmDialog
        open={confirming}
        title={`Delete #${conversation.name}?`}
        message="The room and its entire message history will be permanently deleted for everyone."
        confirmLabel="Delete room"
        onConfirm={async () => {
          await deleteRoom(conversation.id);
          navigate('/', { replace: true });
        }}
        onClose={() => setConfirming(false)}
      />
    </Box>
  );
}
