import { Avatar, Badge } from '@mui/material';
import { colorFor } from '../lib/format';

interface UserAvatarProps {
  id: string;
  username: string;
  size?: number;
  /** Shows a green/grey presence dot when defined. */
  online?: boolean;
}

export function UserAvatar({ id, username, size = 36, online }: UserAvatarProps) {
  const avatar = (
    <Avatar
      alt={username}
      sx={{ width: size, height: size, fontSize: size * 0.42, fontWeight: 600, bgcolor: colorFor(id), color: '#fff' }}
    >
      {username.slice(0, 2).toUpperCase()}
    </Avatar>
  );

  if (online === undefined) return avatar;

  return (
    <Badge
      overlap="circular"
      variant="dot"
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      aria-label={online ? 'online' : 'offline'}
      sx={{
        '& .MuiBadge-badge': {
          bgcolor: online ? 'success.main' : 'grey.500',
          width: 11,
          height: 11,
          borderRadius: '50%',
          boxShadow: (theme) => `0 0 0 2px ${theme.vars?.palette.background.paper ?? '#fff'}`,
        },
      }}
    >
      {avatar}
    </Badge>
  );
}
