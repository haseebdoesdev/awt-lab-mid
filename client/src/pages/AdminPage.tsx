import AddIcon from '@mui/icons-material/Add';
import BlockIcon from '@mui/icons-material/Block';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import ForumIcon from '@mui/icons-material/Forum';
import PeopleIcon from '@mui/icons-material/People';
import RefreshIcon from '@mui/icons-material/Refresh';
import ShieldIcon from '@mui/icons-material/Shield';
import TagIcon from '@mui/icons-material/Tag';
import TodayIcon from '@mui/icons-material/Today';
import WifiIcon from '@mui/icons-material/Wifi';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  IconButton,
  MenuItem,
  Paper,
  Select,
  Skeleton,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { useCurrentUser } from '../auth/AuthContext';
import { useChatActions, useChatState } from '../chat/ChatContext';
import { sortConversations } from '../chat/chatReducer';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { CreateRoomDialog } from '../components/CreateRoomDialog';
import { UserAvatar } from '../components/UserAvatar';
import { api } from '../lib/api';
import { formatRelative } from '../lib/format';
import type { Account, AdminStats, Conversation, Role } from '../types';

function StatCard({ label, value, icon }: { label: string; value: number | undefined; icon: ReactNode }) {
  return (
    <Card variant="outlined">
      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box sx={{ p: 1.25, borderRadius: 2, bgcolor: 'action.hover', color: 'primary.main', display: 'flex' }}>{icon}</Box>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
            {value ?? <Skeleton width={40} />}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {label}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
}

export default function AdminPage() {
  const me = useCurrentUser();
  const { conversations, presence } = useChatState();
  const { deleteRoom } = useChatActions();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<Account[] | null>(null);
  const [toast, setToast] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [roomToDelete, setRoomToDelete] = useState<Conversation | null>(null);

  const load = useCallback(async () => {
    try {
      const [{ stats }, { users }] = await Promise.all([api.admin.stats(), api.admin.users()]);
      setStats(stats);
      setUsers(users);
    } catch (error) {
      setToast({ message: (error as Error).message, severity: 'error' });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const updateUser = async (user: Account, update: { role?: Role; isBanned?: boolean }) => {
    try {
      const { user: updated } = await api.admin.updateUser(user.id, update);
      setUsers((list) => list?.map((u) => (u.id === updated.id ? updated : u)) ?? null);
      const action =
        update.isBanned === true ? 'banned' : update.isBanned === false ? 'unbanned' : `is now ${updated.role}`;
      setToast({ message: `${updated.username} ${action}`, severity: 'success' });
      void api.admin.stats().then(({ stats }) => setStats(stats));
    } catch (error) {
      setToast({ message: (error as Error).message, severity: 'error' });
    }
  };

  const { rooms } = sortConversations(conversations);

  return (
    <Box sx={{ height: '100%', overflowY: 'auto', p: { xs: 2, md: 4 } }}>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 800 }}>
            Admin dashboard
          </Typography>
          <Typography color="text.secondary">Manage users, rooms and moderation</Typography>
        </Box>
        <Tooltip title="Refresh">
          <IconButton onClick={() => void load()} aria-label="Refresh">
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Stack>

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', mb: 4 }}>
        <StatCard label="Users" value={stats?.users} icon={<PeopleIcon />} />
        <StatCard label="Online now" value={stats?.online} icon={<WifiIcon />} />
        <StatCard label="Rooms" value={stats?.rooms} icon={<TagIcon />} />
        <StatCard label="Messages today" value={stats?.messagesToday} icon={<TodayIcon />} />
        <StatCard label="Total messages" value={stats?.messages} icon={<ForumIcon />} />
        <StatCard label="Banned" value={stats?.banned} icon={<BlockIcon />} />
      </Box>

      <Typography variant="h6" sx={{ fontWeight: 700, mb: 1.5 }}>
        Users
      </Typography>
      <TableContainer component={Paper} variant="outlined" sx={{ mb: 4 }}>
        <Table size="small" aria-label="Users">
          <TableHead>
            <TableRow>
              <TableCell>User</TableCell>
              <TableCell>Role</TableCell>
              <TableCell>Status</TableCell>
              <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Joined</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users === null
              ? [0, 1, 2].map((i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={5}>
                      <Skeleton height={40} />
                    </TableCell>
                  </TableRow>
                ))
              : users.map((user) => {
                  const self = user.id === me.id;
                  const online = presence[user.id]?.online ?? user.online;
                  return (
                    <TableRow key={user.id} hover>
                      <TableCell>
                        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                          <UserAvatar id={user.id} username={user.username} online={online} size={32} />
                          <Box sx={{ minWidth: 0 }}>
                            <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                              {user.username} {self && '(you)'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" noWrap>
                              {user.email}
                            </Typography>
                          </Box>
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Select
                          size="small"
                          value={user.role}
                          disabled={self}
                          onChange={(e) => void updateUser(user, { role: e.target.value as Role })}
                          sx={{ minWidth: 100 }}
                          inputProps={{ 'aria-label': `Role of ${user.username}` }}
                        >
                          <MenuItem value="user">User</MenuItem>
                          <MenuItem value="admin">Admin</MenuItem>
                        </Select>
                      </TableCell>
                      <TableCell>
                        {user.isBanned ? (
                          <Chip label="Banned" color="error" size="small" />
                        ) : online ? (
                          <Chip label="Online" color="success" size="small" variant="outlined" />
                        ) : (
                          <Typography variant="body2" color="text.secondary">
                            {user.lastSeen ? `Seen ${formatRelative(user.lastSeen)}` : 'Offline'}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                        {new Date(user.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell align="right">
                        <Button
                          size="small"
                          color={user.isBanned ? 'primary' : 'error'}
                          startIcon={user.isBanned ? <ShieldIcon /> : <BlockIcon />}
                          disabled={self}
                          onClick={() => void updateUser(user, { isBanned: !user.isBanned })}
                        >
                          {user.isBanned ? 'Unban' : 'Ban'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
          </TableBody>
        </Table>
      </TableContainer>

      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          Rooms
        </Typography>
        <Button startIcon={<AddIcon />} variant="contained" onClick={() => setCreatingRoom(true)}>
          New room
        </Button>
      </Stack>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small" aria-label="Rooms">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Description</TableCell>
              <TableCell>Last activity</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rooms.map((room) => (
              <TableRow key={room.id} hover>
                <TableCell sx={{ fontWeight: 600 }}>#{room.name}</TableCell>
                <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' }, color: 'text.secondary' }}>
                  {room.description || '—'}
                </TableCell>
                <TableCell>{room.lastMessageAt ? formatRelative(room.lastMessageAt) : 'Never'}</TableCell>
                <TableCell align="right">
                  <Tooltip title={`Delete #${room.name}`}>
                    <IconButton size="small" onClick={() => setRoomToDelete(room)} aria-label={`Delete #${room.name}`}>
                      <DeleteOutlinedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <CreateRoomDialog open={creatingRoom} onClose={() => setCreatingRoom(false)} />
      <ConfirmDialog
        open={roomToDelete !== null}
        title={`Delete #${roomToDelete?.name}?`}
        message="The room and its entire message history will be permanently deleted for everyone."
        confirmLabel="Delete room"
        onConfirm={async () => {
          if (!roomToDelete) return;
          await deleteRoom(roomToDelete.id);
          setToast({ message: `#${roomToDelete.name} deleted`, severity: 'success' });
          void api.admin.stats().then(({ stats }) => setStats(stats));
        }}
        onClose={() => setRoomToDelete(null)}
      />

      <Snackbar
        open={toast !== null}
        autoHideDuration={4000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {toast ? (
          <Alert severity={toast.severity} variant="filled" onClose={() => setToast(null)}>
            {toast.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  );
}
