import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, InputAdornment, Stack, TextField } from '@mui/material';
import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router';
import { useChatActions } from '../chat/ChatContext';
import { ApiError } from '../lib/api';

export function CreateRoomDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { createRoom } = useChatActions();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  const close = () => {
    setName('');
    setDescription('');
    setError(null);
    onClose();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const id = await createRoom(name, description);
      close();
      navigate(`/c/${id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, 'Could not create the room'));
    } finally {
      setBusy(false);
    }
  };

  const fieldErrors = error?.fieldErrors ?? {};

  return (
    <Dialog open={open} onClose={close} maxWidth="xs" fullWidth>
      <form onSubmit={submit}>
        <DialogTitle>Create a room</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && !error.details.length && <Alert severity="error">{error.message}</Alert>}
            <TextField
              label="Name"
              value={name}
              onChange={(e) => setName(e.target.value.replace(/\s+/g, '-').toLowerCase())}
              required
              autoFocus
              error={!!fieldErrors.name}
              helperText={fieldErrors.name ?? 'Lowercase letters, numbers and dashes'}
              slotProps={{
                input: { startAdornment: <InputAdornment position="start">#</InputAdornment> },
                htmlInput: { maxLength: 40 },
              }}
            />
            <TextField
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              multiline
              minRows={2}
              error={!!fieldErrors.description}
              helperText={fieldErrors.description ?? 'Optional'}
              slotProps={{ htmlInput: { maxLength: 200 } }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={close}>Cancel</Button>
          <Button type="submit" variant="contained" loading={busy} disabled={name.length < 2}>
            Create room
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
