import { Box, Button, Typography } from '@mui/material';
import { isRouteErrorResponse, Link as RouterLink, useRouteError } from 'react-router';

export function ErrorPage({ notFound = false }: { notFound?: boolean }) {
  const error = useRouteError();
  const is404 = notFound || (isRouteErrorResponse(error) && error.status === 404);
  if (error && !is404) console.error(error);

  return (
    <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', p: 3, textAlign: 'center' }}>
      <Box>
        <Typography variant="h2" sx={{ fontWeight: 800 }} color="primary">
          {is404 ? '404' : 'Oops'}
        </Typography>
        <Typography variant="h6" sx={{ mb: 1 }}>
          {is404 ? "This page doesn't exist." : 'Something went wrong.'}
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          {is404 ? 'Check the address or head back to your conversations.' : 'Try reloading the page.'}
        </Typography>
        <Button component={RouterLink} to="/" variant="contained">
          Back to chat
        </Button>
      </Box>
    </Box>
  );
}
