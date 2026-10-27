import AddIcon from '@mui/icons-material/Add';
import EditSquareIcon from '@mui/icons-material/EditSquare';
import SearchIcon from '@mui/icons-material/Search';
import TagIcon from '@mui/icons-material/Tag';
import {
  Box,
  Chip,
  IconButton,
  InputAdornment,
  List,
  ListItemAvatar,
  ListItemButton,
  ListItemText,
  ListSubheader,
  Skeleton,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useCurrentUser } from '../auth/AuthContext';
import { conversationTitle, useChatState } from '../chat/ChatContext';
import { sortConversations } from '../chat/chatReducer';
import { formatShort } from '../lib/format';
import type { Conversation } from '../types';
import { CreateRoomDialog } from './CreateRoomDialog';
import { NewDirectMessageDialog } from './NewDirectMessageDialog';
import { UserAvatar } from './UserAvatar';

function preview(conversation: Conversation, myId: string): string {
  const message = conversation.lastMessage;
  if (!message) return conversation.type === 'room' ? conversation.description || 'No messages yet' : 'Say hi 👋';
  if (message.deletedAt) return 'Message removed';
  const author = message.sender.id === myId ? 'You' : conversation.type === 'room' ? message.sender.username : null;
  return author ? `${author}: ${message.body}` : message.body;
}

function ConversationItem({ conversation, selected, onSelect }: {
  conversation: Conversation;
  selected: boolean;
  onSelect: () => void;
}) {
  const me = useCurrentUser();
  const { presence, typing } = useChatState();
  const other = conversation.participants.find((p) => p.id !== me.id);
  const unread = conversation.unreadCount;
  const someoneTyping = Object.keys(typing[conversation.id] ?? {}).length > 0;

  return (
    <ListItemButton selected={selected} onClick={onSelect} sx={{ borderRadius: 2, mx: 1, mb: 0.25, py: 0.75 }}>
      <ListItemAvatar sx={{ minWidth: 48 }}>
        {conversation.type === 'room' || !other ? (
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: 2,
              display: 'grid',
              placeItems: 'center',
              bgcolor: 'action.hover',
              color: 'text.secondary',
            }}
          >
            <TagIcon fontSize="small" />
          </Box>
        ) : (
          <UserAvatar id={other.id} username={other.username} online={presence[other.id]?.online ?? other.online} />
        )}
      </ListItemAvatar>
      <ListItemText
        primary={conversationTitle(conversation, me.id).replace(/^#/, '')}
        secondary={someoneTyping ? 'typing…' : preview(conversation, me.id)}
        slotProps={{
          primary: { noWrap: true, sx: { fontWeight: unread ? 700 : 500 } },
          secondary: {
            noWrap: true,
            sx: { fontStyle: someoneTyping ? 'italic' : undefined, color: someoneTyping ? 'primary.main' : undefined },
          },
        }}
      />
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.5, ml: 1, flexShrink: 0 }}>
        {conversation.lastMessageAt && (
          <Typography variant="caption" color={unread ? 'primary' : 'text.secondary'} sx={{ whiteSpace: 'nowrap' }}>
            {formatShort(conversation.lastMessageAt)}
          </Typography>
        )}
        {unread > 0 && (
          <Chip
            label={unread > 99 ? '99+' : unread}
            color="primary"
            size="small"
            aria-label={`${unread} unread messages`}
            sx={{ height: 20, fontSize: 11, fontWeight: 700 }}
          />
        )}
      </Box>
    </ListItemButton>
  );
}

function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <ListSubheader
      sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', bgcolor: 'background.paper', lineHeight: '40px' }}
    >
      <Typography variant="overline" sx={{ fontWeight: 700, color: 'text.secondary' }}>
        {title}
      </Typography>
      {action}
    </ListSubheader>
  );
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const me = useCurrentUser();
  const { conversations, loaded } = useChatState();
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const [filter, setFilter] = useState('');
  const [dialog, setDialog] = useState<'room' | 'dm' | null>(null);

  const { rooms, directs } = sortConversations(conversations);
  const matches = (c: Conversation) =>
    conversationTitle(c, me.id).toLowerCase().includes(filter.trim().toLowerCase());

  const open = (id: string) => {
    navigate(`/c/${id}`);
    onNavigate?.();
  };

  const renderList = (list: Conversation[], empty: string) => {
    const visible = list.filter(matches);
    if (!loaded) return [0, 1, 2].map((i) => <Skeleton key={i} height={52} sx={{ mx: 2 }} />);
    if (visible.length === 0) {
      return (
        <Typography variant="body2" color="text.secondary" sx={{ px: 3, py: 1 }}>
          {filter ? 'No matches' : empty}
        </Typography>
      );
    }
    return visible.map((c) => (
      <ConversationItem key={c.id} conversation={c} selected={c.id === conversationId} onSelect={() => open(c.id)} />
    ));
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Box sx={{ p: 2, pb: 1 }}>
        <TextField
          placeholder="Search conversations"
          size="small"
          fullWidth
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
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
      </Box>

      <List component="nav" aria-label="Conversations" sx={{ flex: 1, overflowY: 'auto', pt: 0 }}>
        <SectionHeader
          title="Rooms"
          action={
            me.role === 'admin' && (
              <Tooltip title="Create room">
                <IconButton size="small" onClick={() => setDialog('room')} aria-label="Create room">
                  <AddIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )
          }
        />
        {renderList(rooms, 'No rooms yet')}

        <SectionHeader
          title="Direct messages"
          action={
            <Tooltip title="New message">
              <IconButton size="small" onClick={() => setDialog('dm')} aria-label="New direct message">
                <EditSquareIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          }
        />
        {renderList(directs, 'Start a conversation with the ✎ button')}
      </List>

      <CreateRoomDialog open={dialog === 'room'} onClose={() => setDialog(null)} />
      <NewDirectMessageDialog open={dialog === 'dm'} onClose={() => setDialog(null)} />
    </Box>
  );
}
