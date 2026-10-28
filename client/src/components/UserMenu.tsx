import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import LogoutIcon from '@mui/icons-material/Logout';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import SettingsBrightnessIcon from '@mui/icons-material/SettingsBrightness';
import {
  Box,
  Chip,
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  ListSubheader,
  Menu,
  MenuItem,
  Typography,
} from '@mui/material';
import { useColorScheme } from '@mui/material/styles';
import { useState } from 'react';
import { useAuth, useCurrentUser } from '../auth/AuthContext';
import { notificationPermission, requestNotificationPermission } from '../lib/notifications';
import { UserAvatar } from './UserAvatar';

const THEME_MODES = [
  { mode: 'light', label: 'Light', Icon: LightModeIcon },
  { mode: 'dark', label: 'Dark', Icon: DarkModeIcon },
  { mode: 'system', label: 'System', Icon: SettingsBrightnessIcon },
] as const;

export function UserMenu() {
  const me = useCurrentUser();
  const { logout } = useAuth();
  const { mode, setMode } = useColorScheme();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [permission, setPermission] = useState(notificationPermission);

  const notificationLabel =
    permission === 'granted'
      ? 'Desktop notifications on'
      : permission === 'denied'
        ? 'Notifications blocked'
        : 'Enable desktop notifications';

  return (
    <>
      <IconButton onClick={(e) => setAnchor(e.currentTarget)} aria-label="Account menu" sx={{ p: 0.5 }}>
        <UserAvatar id={me.id} username={me.username} size={34} />
      </IconButton>
      <Menu
        anchorEl={anchor}
        open={anchor !== null}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 260, mt: 1 } } }}
      >
        <Box sx={{ px: 2, py: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography sx={{ fontWeight: 700 }} noWrap>
              {me.username}
            </Typography>
            {me.role === 'admin' && <Chip label="admin" size="small" color="secondary" sx={{ height: 18, fontSize: 11 }} />}
          </Box>
          <Typography variant="body2" color="text.secondary" noWrap>
            {me.email}
          </Typography>
        </Box>
        <Divider />
        <ListSubheader sx={{ lineHeight: '32px' }}>Theme</ListSubheader>
        {THEME_MODES.map(({ mode: value, label, Icon }) => (
          <MenuItem key={value} selected={mode === value} onClick={() => setMode(value)}>
            <ListItemIcon>
              <Icon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{label}</ListItemText>
          </MenuItem>
        ))}
        <Divider />
        {permission !== 'unsupported' && (
          <MenuItem
            disabled={permission !== 'default'}
            onClick={async () => setPermission(await requestNotificationPermission())}
          >
            <ListItemIcon>
              <NotificationsActiveIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText sx={{ whiteSpace: 'normal' }}>{notificationLabel}</ListItemText>
          </MenuItem>
        )}
        <MenuItem onClick={() => void logout()}>
          <ListItemIcon>
            <LogoutIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Sign out</ListItemText>
        </MenuItem>
      </Menu>
    </>
  );
}
