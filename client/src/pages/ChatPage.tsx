import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import { Box, Typography } from '@mui/material';
import { useEffect } from 'react';
import { Navigate, useParams } from 'react-router';
import { useCurrentUser } from '../auth/AuthContext';
import { conversationTitle, useChatActions, useChatState } from '../chat/ChatContext';
import { sortConversations } from '../chat/chatReducer';
import { ChatHeader } from '../components/ChatHeader';
import { FullPageLoader } from '../components/FullPageLoader';
import { MessageComposer, TypingIndicator } from '../components/MessageComposer';
import { MessageList } from '../components/MessageList';

function EmptyState({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <Box sx={{ display: 'grid', placeItems: 'center', height: '100%', p: 3, textAlign: 'center' }}>
      <Box>
        <ForumOutlinedIcon sx={{ fontSize: 56, color: 'text.disabled', mb: 1 }} />
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          {title}
        </Typography>
        <Typography color="text.secondary">{subtitle}</Typography>
      </Box>
    </Box>
  );
}

export function ChatPage() {
  const { conversationId } = useParams();
  const me = useCurrentUser();
  const { conversations, threads, typing, loaded } = useChatState();
  const { setActiveConversation, openConversation } = useChatActions();
  const conversation = conversationId ? conversations[conversationId] : undefined;
  const exists = conversation !== undefined;

  useEffect(() => {
    setActiveConversation(conversationId ?? null);
    return () => setActiveConversation(null);
  }, [conversationId, setActiveConversation]);

  useEffect(() => {
    if (conversationId && exists) openConversation(conversationId).catch(() => undefined);
  }, [conversationId, exists, openConversation]);

  if (!loaded) return <FullPageLoader />;

  if (!conversationId) {
    const { rooms, directs } = sortConversations(conversations);
    const first = rooms[0] ?? directs[0];
    if (first) return <Navigate to={`/c/${first.id}`} replace />;
    return <EmptyState title="No conversations yet" subtitle="Start a direct message from the sidebar." />;
  }

  if (!conversation) {
    return <EmptyState title="Conversation not found" subtitle="It may have been deleted, or you don't have access." />;
  }

  const typingNames = Object.entries(typing[conversation.id] ?? {})
    .filter(([userId]) => userId !== me.id)
    .map(([, username]) => username);
  const title = conversationTitle(conversation, me.id);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <ChatHeader conversation={conversation} />
      {/* Keyed per conversation so scroll position and drafts reset when switching. */}
      <MessageList key={`list:${conversation.id}`} conversation={conversation} thread={threads[conversation.id]} />
      <TypingIndicator names={typingNames} />
      <MessageComposer
        key={`composer:${conversation.id}`}
        conversationId={conversation.id}
        placeholder={`Message ${conversation.type === 'room' ? title : `@${title}`}`}
      />
    </Box>
  );
}
