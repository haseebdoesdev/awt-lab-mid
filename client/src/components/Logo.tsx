import { Box, Typography } from '@mui/material';

export function Logo({ size = 32, showName = true }: { size?: number; showName?: boolean }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Box component="img" src="/favicon.svg" alt="" sx={{ width: size, height: size }} />
      {showName && (
        <Typography variant="h6" component="span" sx={{ fontWeight: 800, letterSpacing: '-0.02em' }}>
          Pulse
        </Typography>
      )}
    </Box>
  );
}
