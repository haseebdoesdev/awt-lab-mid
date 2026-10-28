import NearMeIcon from '@mui/icons-material/NearMe';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import type { VisibilityScope } from '../types';
import { VISIBILITY_OPTIONS } from './visibility';

/** Radio list of the four location visibility scopes. */
function VisibilityPicker({ value, onChange }: { value: VisibilityScope; onChange: (v: VisibilityScope) => void }) {
  return (
    <RadioGroup value={value} onChange={(e) => onChange(e.target.value as VisibilityScope)} aria-label="Map visibility">
      {VISIBILITY_OPTIONS.map((option) => (
        <FormControlLabel
          key={option.value}
          value={option.value}
          control={<Radio size="small" />}
          sx={{ alignItems: 'flex-start', mb: 1, '& .MuiRadio-root': { pt: 0.25 } }}
          label={
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {option.label}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {option.description}
              </Typography>
            </Box>
          }
        />
      ))}
    </RadioGroup>
  );
}

function AliasField({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: string }) {
  return (
    <TextField
      label="Alias (optional)"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      fullWidth
      size="small"
      error={!!error}
      helperText={error ?? 'Shown instead of your username in the local room and on the map'}
      slotProps={{ htmlInput: { maxLength: 30 } }}
    />
  );
}

/**
 * The opt-in screen. Joining (consent #1) and appearing on the map
 * (consent #2, the visibility choice – Hidden by default) are separate.
 */
export function NearbyConsent({
  onJoin,
}: {
  onJoin: (settings: { alias: string; visibility: VisibilityScope }) => Promise<void>;
}) {
  const [agreed, setAgreed] = useState(false);
  const [alias, setAlias] = useState('');
  const [visibility, setVisibility] = useState<VisibilityScope>('hidden');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const join = async () => {
    setBusy(true);
    setError(null);
    try {
      await onJoin({ alias, visibility });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <Box sx={{ height: '100%', overflowY: 'auto', p: { xs: 2, md: 4 } }}>
      <Card variant="outlined" sx={{ maxWidth: 640, mx: 'auto', borderRadius: 3 }}>
        <CardContent sx={{ p: { xs: 2.5, sm: 4 } }}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 2 }}>
            <NearMeIcon color="primary" />
            <Typography variant="h5" component="h1" sx={{ fontWeight: 800 }}>
              Local chat
            </Typography>
          </Stack>
          <Typography sx={{ mb: 2 }}>
            Chat with people within <strong>1 km</strong> of you. Before you join, here is exactly what happens:
          </Typography>
          <Box component="ul" sx={{ pl: 2.5, mt: 0, '& li': { mb: 1 } }}>
            <li>
              Your browser shares your location with Pulse <strong>only while this page is open</strong>. It is used
              to find people within 1 km.
            </li>
            <li>
              Your location is <strong>deleted immediately when you leave</strong>, and automatically 15 minutes after
              your last update.
            </li>
            <li>
              Local messages are pinned to where they were sent and <strong>delete themselves after 24 hours</strong>.
            </li>
            <li>
              You choose separately whether you appear on the map (below). You can change this or leave at any time.
            </li>
            <li>Administrators can see which account is behind an alias, to deal with abuse.</li>
          </Box>

          <Typography variant="subtitle2" sx={{ mt: 3, mb: 1 }}>
            Who can see you on the map?
          </Typography>
          <VisibilityPicker value={visibility} onChange={setVisibility} />

          <Box sx={{ mt: 2 }}>
            <AliasField value={alias} onChange={setAlias} />
          </Box>

          <FormControlLabel
            sx={{ mt: 2, alignItems: 'flex-start' }}
            control={<Checkbox checked={agreed} onChange={(e) => setAgreed(e.target.checked)} sx={{ pt: 0.5 }} />}
            label="I agree to share my location with Pulse to join the local chat."
          />

          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}

          <Button variant="contained" size="large" fullWidth sx={{ mt: 2 }} disabled={!agreed} loading={busy} onClick={join}>
            Join local chat
          </Button>
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1, textAlign: 'center' }}>
            Your browser will then ask for permission to use your location.
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}

export function NearbySettingsDialog({
  open,
  initial,
  onSave,
  onLeave,
  onClose,
}: {
  open: boolean;
  initial: { alias: string | null; visibility: VisibilityScope };
  onSave: (settings: { alias: string; visibility: VisibilityScope }) => Promise<void>;
  onLeave: () => Promise<void>;
  onClose: () => void;
}) {
  const [alias, setAlias] = useState(initial.alias ?? '');
  const [visibility, setVisibility] = useState(initial.visibility);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{confirmLeave ? 'Leave local chat?' : 'Local chat settings'}</DialogTitle>
      <DialogContent>
        {confirmLeave ? (
          <Typography>
            Your location is deleted right away and you disappear from everyone's map. You can join again later.
          </Typography>
        ) : (
          <Stack spacing={2} sx={{ pt: 1 }}>
            <AliasField value={alias} onChange={setAlias} />
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Who can see you on the map?
              </Typography>
              <VisibilityPicker value={visibility} onChange={setVisibility} />
            </Box>
            <Box sx={{ borderTop: 1, borderColor: 'divider', pt: 2 }}>
              <Button color="error" onClick={() => setConfirmLeave(true)}>
                Leave local chat
              </Button>
            </Box>
          </Stack>
        )}
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, flexWrap: 'wrap', gap: 1 }}>
        {confirmLeave ? (
          <>
            <Button onClick={() => setConfirmLeave(false)} disabled={busy}>
              Back
            </Button>
            <Button color="error" variant="contained" loading={busy} onClick={() => run(onLeave)}>
              Leave and delete my location
            </Button>
          </>
        ) : (
          <>
            <Button onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button variant="contained" loading={busy} onClick={() => run(() => onSave({ alias, visibility }))}>
              Save
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
