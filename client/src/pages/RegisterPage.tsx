import { Alert, Button, Link, Stack, TextField } from '@mui/material';
import { useActionState, useState } from 'react';
import { Link as RouterLink } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { AuthCard, tapTargetLinkSx } from '../components/AuthCard';
import { GoogleSignInButton } from '../components/GoogleSignInButton';
import { PasswordField } from '../components/PasswordField';
import { ApiError } from '../lib/api';

export function RegisterPage() {
  const { register } = useAuth();
  const [values, setValues] = useState({ username: '', email: '', password: '', confirm: '' });
  const set = (field: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [field]: e.target.value }));

  const [error, submit, pending] = useActionState(async (_previous: ApiError | null, form: FormData) => {
    if (form.get('password') !== form.get('confirm')) {
      return new ApiError(400, 'Passwords do not match', [{ path: 'confirm', message: 'Passwords do not match' }]);
    }
    try {
      await register({
        username: String(form.get('username')),
        email: String(form.get('email')),
        password: String(form.get('password')),
      });
      return null;
    } catch (err) {
      return err instanceof ApiError ? err : new ApiError(0, 'Unable to reach the server. Please try again.');
    }
  }, null);

  const fieldErrors = error?.fieldErrors ?? {};
  const mismatch = values.confirm.length > 0 && values.confirm !== values.password;

  return (
    <AuthCard
      title="Create your account"
      subtitle="Join the conversation in seconds"
      footer={
        <>
          Already have an account?{' '}
          <Link component={RouterLink} to="/login" sx={tapTargetLinkSx}>
            Sign in
          </Link>
        </>
      }
    >
      <Stack component="form" action={submit} spacing={2} noValidate>
        {error && error.details.length === 0 && <Alert severity="error">{error.message}</Alert>}
        <TextField
          name="username"
          label="Username"
          value={values.username}
          onChange={set('username')}
          autoComplete="username"
          autoFocus
          required
          error={!!fieldErrors.username}
          helperText={fieldErrors.username ?? 'Letters, numbers, ".", "_" and "-"'}
          slotProps={{ htmlInput: { maxLength: 30 } }}
        />
        <TextField
          name="email"
          label="Email"
          type="email"
          value={values.email}
          onChange={set('email')}
          autoComplete="email"
          required
          error={!!fieldErrors.email}
          helperText={fieldErrors.email}
        />
        <PasswordField
          name="password"
          label="Password"
          value={values.password}
          onChange={set('password')}
          autoComplete="new-password"
          required
          error={!!fieldErrors.password}
          helperText={fieldErrors.password ?? 'At least 8 characters'}
        />
        <PasswordField
          name="confirm"
          label="Confirm password"
          value={values.confirm}
          onChange={set('confirm')}
          autoComplete="new-password"
          required
          error={mismatch || !!fieldErrors.confirm}
          helperText={mismatch ? 'Passwords do not match' : fieldErrors.confirm}
        />
        <Button
          type="submit"
          variant="contained"
          size="large"
          loading={pending}
          disabled={!values.username || !values.email || !values.password || mismatch}
        >
          Create account
        </Button>
      </Stack>
      <GoogleSignInButton text="signup_with" />
    </AuthCard>
  );
}
