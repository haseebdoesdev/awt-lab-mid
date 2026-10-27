import { Alert, Button, Link, Stack, TextField } from '@mui/material';
import { useActionState, useState } from 'react';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { AuthCard } from '../components/AuthCard';
import { PasswordField } from '../components/PasswordField';
import { ApiError, api } from '../lib/api';

const toApiError = (error: unknown) =>
  error instanceof ApiError ? error : new ApiError(0, 'Unable to reach the server. Please try again.');

const backToSignIn = (
  <Link component={RouterLink} to="/login" sx={{ fontWeight: 600 }}>
    Back to sign in
  </Link>
);

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [state, submit, pending] = useActionState(
    async (_previous: { sent?: string; error?: ApiError } | null, form: FormData) => {
      try {
        const { message } = await api.auth.forgotPassword(String(form.get('email')));
        return { sent: message };
      } catch (error) {
        return { error: toApiError(error) };
      }
    },
    null,
  );

  return (
    <AuthCard
      title="Forgot your password?"
      subtitle="Enter your email and we'll send you a reset link"
      footer={backToSignIn}
    >
      {state?.sent ? (
        <Alert severity="success">
          {state.sent} Check your inbox (and spam folder); the link works once and expires soon.
        </Alert>
      ) : (
        <Stack component="form" action={submit} spacing={2} noValidate>
          {state?.error && <Alert severity="error">{state.error.message}</Alert>}
          <TextField
            name="email"
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            autoFocus
            required
          />
          <Button type="submit" variant="contained" size="large" loading={pending} disabled={!email}>
            Send reset link
          </Button>
        </Stack>
      )}
    </AuthCard>
  );
}

export function ResetPasswordPage() {
  const token = useSearchParams()[0].get('token') ?? '';
  const navigate = useNavigate();
  const { endSession } = useAuth();
  const [values, setValues] = useState({ password: '', confirm: '' });
  const mismatch = values.confirm.length > 0 && values.confirm !== values.password;

  const [error, submit, pending] = useActionState(async (_previous: ApiError | null, form: FormData) => {
    try {
      const { message } = await api.auth.resetPassword(token, String(form.get('password')));
      // The server ended every session; forget this browser's too.
      endSession();
      navigate('/login', { replace: true, state: { success: message } });
      return null;
    } catch (err) {
      return toApiError(err);
    }
  }, null);

  if (!token) {
    return (
      <AuthCard title="Invalid reset link" subtitle="This link is missing its reset code" footer={backToSignIn}>
        <Button component={RouterLink} to="/forgot-password" variant="contained" fullWidth>
          Request a new link
        </Button>
      </AuthCard>
    );
  }

  const fieldError = error?.fieldErrors.password;

  return (
    <AuthCard title="Choose a new password" subtitle="You'll be signed out of all your devices" footer={backToSignIn}>
      <Stack component="form" action={submit} spacing={2} noValidate>
        {error && !fieldError && (
          <Alert
            severity="error"
            action={
              <Button component={RouterLink} to="/forgot-password" color="inherit" size="small">
                New link
              </Button>
            }
          >
            {error.message}
          </Alert>
        )}
        <PasswordField
          name="password"
          label="New password"
          value={values.password}
          onChange={(e) => setValues((v) => ({ ...v, password: e.target.value }))}
          autoComplete="new-password"
          autoFocus
          required
          error={!!fieldError}
          helperText={fieldError ?? 'At least 8 characters'}
        />
        <PasswordField
          name="confirm"
          label="Confirm new password"
          value={values.confirm}
          onChange={(e) => setValues((v) => ({ ...v, confirm: e.target.value }))}
          autoComplete="new-password"
          required
          error={mismatch}
          helperText={mismatch ? 'Passwords do not match' : undefined}
        />
        <Button
          type="submit"
          variant="contained"
          size="large"
          loading={pending}
          disabled={values.password.length < 8 || values.password !== values.confirm}
        >
          Set new password
        </Button>
      </Stack>
    </AuthCard>
  );
}
