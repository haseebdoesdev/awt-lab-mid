import SearchIcon from '@mui/icons-material/Search';
import {
  Alert,
  Box,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  InputAdornment,
  List,
  ListItemAvatar,
  ListItemButton,
  ListItemText,
  TextField,
  Typography,
} from '@mui/material';
import { useDeferredValue, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useChatActions, useChatState } from '../chat/ChatContext';
import { api } from '../lib/api';
import { formatRelative } from '../lib/format';
import type { PublicUser } from '../types';
import { UserAvatar } from './UserAvatar';

export function NewDirectMessageDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { startDirectMessage } = useChatActions();
  const { presence } = useChatState();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  // Keeps typing responsive while the search request runs.
  const deferredQuery = useDeferredValue(query.trim());
  const [users, setUsers] = useState<PublicUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const controller = { cancelled: false };
    api.users
      .list(deferredQuery || undefined)
      .then(({ users }) => !controller.cancelled && setUsers(users))
      .catch((err: Error) => !controller.cancelled && setError(err.message));
    return () => {
      controller.cancelled = true;
    };
  }, [open, deferredQuery]);

  const close = () => {
    setQuery('');
    setError(null);
    onClose();
  };

  const select = async (user: PublicUser) => {
    try {
      const id = await startDirectMessage(user.id);
      close();
      navigate(`/c/${id}`);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <Dialog open={open} onClose={close} maxWidth="xs" fullWidth>
      <DialogTitle>New message</DialogTitle>
      <DialogContent sx={{ px: 2 }}>
        <TextField
          placeholder="Search people"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          fullWidth
          autoFocus
          size="small"
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
        {users === null ? (
          <Box sx={{ display: 'grid', placeItems: 'center', py: 4 }}>
            <CircularProgress size={28} />
          </Box>
        ) : users.length === 0 ? (
          <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
            No one found
          </Typography>
        ) : (
          <List sx={{ mt: 1, maxHeight: 360, overflowY: 'auto' }}>
            {users.map((user) => {
              const status = presence[user.id] ?? user;
              return (
                <ListItemButton key={user.id} onClick={() => select(user)} sx={{ borderRadius: 2 }}>
                  <ListItemAvatar>
                    <UserAvatar id={user.id} username={user.username} online={status.online} />
                  </ListItemAvatar>
                  <ListItemText
                    primary={user.username}
                    secondary={
                      status.online
                        ? 'Online'
                        : status.lastSeen
                          ? `Last seen ${formatRelative(status.lastSeen)}`
                          : 'Offline'
                    }
                  />
                </ListItemButton>
              );
            })}
          </List>
        )}
      </DialogContent>
    </Dialog>
  );
}
