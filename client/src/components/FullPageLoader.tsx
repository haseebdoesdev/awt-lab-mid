import { Box, CircularProgress } from '@mui/material';

export function FullPageLoader() {
  return (
    <Box sx={{ display: 'grid', placeItems: 'center', height: '100%', minHeight: 200 }}>
      <CircularProgress aria-label="Loading" />
    </Box>
  );
}
