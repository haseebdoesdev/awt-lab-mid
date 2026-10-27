import { Box, Card, CardContent, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { Logo } from './Logo';

/** Centered card used by the sign-in and sign-up pages. */
export function AuthCard({ title, subtitle, children, footer }: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <Box
      sx={(theme) => ({
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        p: 2,
        background: `radial-gradient(circle at 15% 20%, rgb(${theme.vars?.palette.primary.mainChannel} / 0.18), transparent 45%),
                     radial-gradient(circle at 85% 80%, rgb(${theme.vars?.palette.secondary.mainChannel} / 0.16), transparent 45%)`,
        bgcolor: 'background.default',
      })}
    >
      <Card variant="outlined" sx={{ width: '100%', maxWidth: 420, borderRadius: 4 }}>
        <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
          <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}>
            <Logo size={40} />
          </Box>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 800, textAlign: 'center' }}>
            {title}
          </Typography>
          <Typography color="text.secondary" sx={{ textAlign: 'center', mb: 3 }}>
            {subtitle}
          </Typography>
          {children}
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mt: 3 }}>
            {footer}
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}
