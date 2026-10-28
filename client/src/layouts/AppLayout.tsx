import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import MenuIcon from '@mui/icons-material/Menu';
import WifiOffIcon from '@mui/icons-material/WifiOff';
import { AppBar, Box, Button, Chip, CircularProgress, Drawer, IconButton, Toolbar, Tooltip, useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useState } from 'react';
import { Outlet, Link as RouterLink, useLocation } from 'react-router';
import { useCurrentUser } from '../auth/AuthContext';
import { ChatProvider, useChatState } from '../chat/ChatContext';
import type { ConnectionStatus } from '../chat/chatReducer';
import { Logo } from '../components/Logo';
import { Sidebar } from '../components/Sidebar';
import { UserMenu } from '../components/UserMenu';

const DRAWER_WIDTH = 320;

function ConnectionChip({ status }: { status: ConnectionStatus }) {
  if (status === 'connected') return null;
  const reconnecting = status !== 'connecting';
  return (
    <Chip
      size="small"
      color={reconnecting ? 'warning' : 'default'}
      icon={reconnecting ? <WifiOffIcon /> : <CircularProgress size={12} sx={{ ml: '6px !important' }} />}
      label={status === 'connecting' ? 'Connecting…' : status === 'offline' ? 'Offline' : 'Reconnecting…'}
      role="status"
    />
  );
}

function Shell() {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const [mobileOpen, setMobileOpen] = useState(false);
  const { connection } = useChatState();
  const me = useCurrentUser();
  const onAdminPage = useLocation().pathname.startsWith('/admin');

  return (
    <Box sx={{ display: 'flex', height: '100dvh', bgcolor: 'background.default' }}>
      <AppBar
        position="fixed"
        sx={{ zIndex: theme.zIndex.drawer + 1, bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}
      >
        <Toolbar sx={{ gap: 1.5 }}>
          {!isDesktop && (
            <IconButton edge="start" onClick={() => setMobileOpen(true)} aria-label="Open conversations">
              <MenuIcon />
            </IconButton>
          )}
          <Box component={RouterLink} to="/" sx={{ color: 'inherit', textDecoration: 'none' }}>
            <Logo />
          </Box>
          <Box sx={{ flex: 1 }} />
          <ConnectionChip status={connection} />
          {me.role === 'admin' &&
            (onAdminPage ? (
              <Tooltip title="Back to chat">
                <IconButton component={RouterLink} to="/" aria-label="Back to chat">
                  <ForumOutlinedIcon />
                </IconButton>
              </Tooltip>
            ) : isDesktop ? (
              <Button component={RouterLink} to="/admin" startIcon={<AdminPanelSettingsIcon />} color="inherit">
                Admin
              </Button>
            ) : (
              <IconButton component={RouterLink} to="/admin" aria-label="Admin dashboard">
                <AdminPanelSettingsIcon />
              </IconButton>
            ))}
          <UserMenu />
        </Toolbar>
      </AppBar>

      <Drawer
        variant={isDesktop ? 'permanent' : 'temporary'}
        open={isDesktop || mobileOpen}
        onClose={() => setMobileOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{
          width: { md: DRAWER_WIDTH },
          flexShrink: 0,
          '& .MuiDrawer-paper': { width: { xs: 'min(320px, 85vw)', md: DRAWER_WIDTH }, boxSizing: 'border-box' },
        }}
      >
        <Toolbar />
        <Box sx={{ flex: 1, minHeight: 0 }}>
          <Sidebar onNavigate={() => setMobileOpen(false)} />
        </Box>
      </Drawer>

      <Box component="main" sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <Toolbar />
        <Box sx={{ flex: 1, minHeight: 0 }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}

/** Authenticated shell: app bar, conversation drawer and the live chat connection. */
export function AppLayout() {
  return (
    <ChatProvider>
      <Shell />
    </ChatProvider>
  );
}
