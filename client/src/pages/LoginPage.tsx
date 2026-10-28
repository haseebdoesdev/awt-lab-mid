import { Alert, Box, Button, Link, Stack, TextField } from '@mui/material';
import { useActionState, useState } from 'react';
import { Link as RouterLink, useLocation } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { AuthCard } from '../components/AuthCard';
import { GoogleSignInButton } from '../components/GoogleSignInButton';
import { PasswordField } from '../components/PasswordField';
import { ApiError } from '../lib/api';

const toApiError = (error: unknown) =>
  error instanceof ApiError ? error : new ApiError(0, 'Unable to reach the server. Please try again.');

export function LoginPage() {
  const { login, notice } = useAuth();
  // Set by the reset-password page after a successful reset.
  const success = (useLocation().state as { success?: string } | null)?.success;
  const [values, setValues] = useState({ login: '', password: '' });

  // React 19 form action: pending state and errors without manual bookkeeping.
  const [error, submit, pending] = useActionState(async (_previous: ApiError | null, form: FormData) => {
    try {
      await login(String(form.get('login')), String(form.get('password')));
      return null;
    } catch (err) {
      return toApiError(err);
    }
  }, null);

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to continue chatting"
      footer={
        <>
          New here?{' '}
          <Link component={RouterLink} to="/register" sx={{ fontWeight: 600 }}>
            Create an account
          </Link>
        </>
      }
    >
      <Stack component="form" action={submit} spacing={2} noValidate>
        {success && !error && <Alert severity="success">{success}</Alert>}
        {notice && !error && <Alert severity="warning">{notice}</Alert>}
        {error && <Alert severity="error">{error.message}</Alert>}
        <TextField
          name="login"
          label="Email or username"
          value={values.login}
          onChange={(e) => setValues((v) => ({ ...v, login: e.target.value }))}
          autoComplete="username"
          autoFocus
          required
          fullWidth
        />
        <PasswordField
          name="password"
          label="Password"
          value={values.password}
          onChange={(e) => setValues((v) => ({ ...v, password: e.target.value }))}
          autoComplete="current-password"
          required
          fullWidth
        />
        <Box sx={{ textAlign: 'right', mt: '4px !important' }}>
          <Link component={RouterLink} to="/forgot-password" variant="body2">
            Forgot password?
          </Link>
        </Box>
        <Button
          type="submit"
          variant="contained"
          size="large"
          loading={pending}
          disabled={!values.login || !values.password}
        >
          Sign in
        </Button>
      </Stack>
      <GoogleSignInButton text="signin_with" />
    </AuthCard>
  );
}
