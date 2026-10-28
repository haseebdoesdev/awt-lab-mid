import { Alert, Box, Divider, Typography } from '@mui/material';
import { useColorScheme } from '@mui/material/styles';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';

/** Minimal typings for the Google Identity Services script. */
interface GoogleAccountsId {
  initialize(options: { client_id: string; callback: (response: { credential: string }) => void }): void;
  renderButton(
    parent: HTMLElement,
    options: { theme: string; size: string; text: string; shape: string; width: number; logo_alignment: string },
  ): void;
}
declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } };
  }
}

let clientIdPromise: Promise<string | null> | null = null;
let scriptPromise: Promise<void> | null = null;

/** The client id comes from the API, so enabling Google sign-in needs no frontend rebuild. */
const loadClientId = () =>
  (clientIdPromise ??= api.auth.config().then(
    ({ googleClientId }) => googleClientId,
    () => null,
  ));

const loadScript = () =>
  (scriptPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error('Could not load Google sign-in'));
    };
    document.head.appendChild(script);
  }));

/**
 * "Sign in with Google" (Google Identity Services). Google returns a signed
 * ID token, which the API verifies before starting a normal session.
 * Renders nothing when Google sign-in isn't configured on the server.
 */
export function GoogleSignInButton({ text = 'continue_with' }: { text?: 'signin_with' | 'signup_with' | 'continue_with' }) {
  const { loginWithGoogle } = useAuth();
  const { mode, systemMode } = useColorScheme();
  const dark = (mode === 'system' ? systemMode : mode) === 'dark';
  const containerRef = useRef<HTMLDivElement>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadClientId().then(setClientId);
  }, []);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    loadScript()
      .then(() => {
        const container = containerRef.current;
        const gis = window.google?.accounts.id;
        if (cancelled || !container || !gis) return;
        gis.initialize({
          client_id: clientId,
          callback: ({ credential }) => {
            setError(null);
            loginWithGoogle(credential).catch((err: Error) => setError(err.message));
          },
        });
        container.replaceChildren();
        gis.renderButton(container, {
          theme: dark ? 'filled_black' : 'outline',
          size: 'large',
          text,
          shape: 'pill',
          width: Math.min(container.clientWidth || 360, 400),
          logo_alignment: 'center',
        });
      })
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [clientId, dark, text, loginWithGoogle]);

  if (!clientId) return null;

  return (
    <Box sx={{ mt: 2 }}>
      <Divider sx={{ mb: 2 }}>
        <Typography variant="caption" color="text.secondary">
          or
        </Typography>
      </Divider>
      {error && (
        <Alert severity="error" sx={{ mb: 1.5 }}>
          {error}
        </Alert>
      )}
      <Box ref={containerRef} sx={{ display: 'flex', justifyContent: 'center', minHeight: 44 }} />
    </Box>
  );
}
