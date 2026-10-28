import GpsFixedIcon from '@mui/icons-material/GpsFixed';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import SettingsIcon from '@mui/icons-material/Settings';
import {
  Alert,
  Badge,
  Box,
  Button,
  Chip,
  IconButton,
  Snackbar,
  Stack,
  Tab,
  Tabs,
  Tooltip,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useCurrentUser } from '../auth/AuthContext';
import { useChatSocket } from '../chat/ChatContext';
import { FullPageLoader } from '../components/FullPageLoader';
import { api } from '../lib/api';
import { NearbyChat } from '../nearby/NearbyChat';
import { NearbyConsent, NearbySettingsDialog } from '../nearby/NearbyForms';
import { NearbyMap } from '../nearby/NearbyMap';
import { type GeoStatus, useGeolocation } from '../nearby/useGeolocation';
import type { NearbyMe, NearbyMessage, NearbyPerson, VisibilityScope } from '../types';
import { VISIBILITY_OPTIONS } from '../nearby/visibility';

const PEOPLE_REFRESH_MS = 30_000;

const GEO_MESSAGES: Partial<Record<GeoStatus, { severity: 'info' | 'warning' | 'error'; text: string }>> = {
  locating: { severity: 'info', text: 'Finding your location… your browser may ask for permission.' },
  denied: {
    severity: 'error',
    text: 'Location access is blocked. Allow location for this site in your browser settings, then reload the page.',
  },
  unavailable: { severity: 'warning', text: "Your location isn't available right now. Check that location services are on." },
  unsupported: { severity: 'error', text: "This browser can't share your location (it requires a secure HTTPS connection)." },
};

/** Local chat: everyone within 1 km, with a map. Strictly opt-in. */
export default function NearbyPage() {
  const account = useCurrentUser();
  const socket = useChatSocket();
  const isAdmin = account.role === 'admin';

  const [me, setMe] = useState<NearbyMe | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [people, setPeople] = useState<{ total: number; people: NearbyPerson[] }>({ total: 0, people: [] });
  const [messages, setMessages] = useState<NearbyMessage[]>([]);
  const [demo, setDemo] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const peopleTimer = useRef<number | undefined>(undefined);
  // Phones and landscape: map and chat are tabs, each with the full screen.
  const narrow = useMediaQuery(useTheme().breakpoints.down('md'));
  const [tab, setTab] = useState<'chat' | 'map'>('chat');
  const [unseen, setUnseen] = useState(0);
  const chatHiddenRef = useRef(false);
  useEffect(() => {
    chatHiddenRef.current = narrow && tab === 'map';
    if (!chatHiddenRef.current) setUnseen(0);
  }, [tab, narrow]);

  const joined = Boolean(me?.joined);
  const located = Boolean(me?.location);

  useEffect(() => {
    api.nearby.me().then(({ me }) => setMe(me), (error: Error) => setLoadError(error.message));
  }, []);

  const refreshPeople = useCallback(async () => {
    try {
      setPeople(await api.nearby.people());
    } catch {
      // Transient – the next refresh will catch up.
    }
  }, []);

  const refreshAll = useCallback(async () => {
    const [nearby, history] = await Promise.all([api.nearby.people(), api.nearby.messages()]);
    setPeople(nearby);
    setMessages(history.messages);
  }, []);

  const sendLocation = useCallback(
    async (location: { lat: number; lng: number; accuracy?: number | null; simulated?: boolean }) => {
      const { me } = await api.nearby.updateLocation(location);
      setMe(me);
      await refreshAll();
    },
    [refreshAll],
  );

  // Real GPS while joined (paused while an admin uses a demo pin).
  const geoStatus = useGeolocation(joined && !demo, (fix) => {
    sendLocation(fix).catch((error: Error) => setToast(error.message));
  });

  // Live updates: new/removed local messages, and "something changed near you".
  useEffect(() => {
    if (!socket || !joined) return;
    const onMessage = (message: NearbyMessage) => {
      setMessages((list) => (list.some((m) => m.id === message.id) ? list : [...list, message]));
      if (chatHiddenRef.current && message.senderToken !== me?.selfToken) setUnseen((n) => n + 1);
    };
    const onDeleted = ({ id }: { id: string }) => setMessages((list) => list.filter((m) => m.id !== id));
    const onChanged = () => {
      window.clearTimeout(peopleTimer.current);
      peopleTimer.current = window.setTimeout(() => void refreshPeople(), 500);
    };
    socket.on('nearby:message', onMessage);
    socket.on('nearby:message-deleted', onDeleted);
    socket.on('nearby:changed', onChanged);
    return () => {
      socket.off('nearby:message', onMessage);
      socket.off('nearby:message-deleted', onDeleted);
      socket.off('nearby:changed', onChanged);
      window.clearTimeout(peopleTimer.current);
    };
  }, [socket, joined, refreshPeople, me?.selfToken]);

  // Distances change as people move; keep the map fresh.
  useEffect(() => {
    if (!located) return;
    const interval = window.setInterval(() => void refreshPeople(), PEOPLE_REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [located, refreshPeople]);

  const join = async (settings: { alias: string; visibility: VisibilityScope }) => {
    setMe((await api.nearby.join(settings)).me);
  };

  const saveSettings = async (settings: { alias: string; visibility: VisibilityScope }) => {
    setMe((await api.nearby.updateSettings(settings)).me);
    await refreshPeople();
    setToast('Settings saved');
  };

  const leave = async () => {
    await api.nearby.leave();
    setMe((current) => current && { ...current, joined: false, location: null, alias: null, visibility: 'hidden' });
    setPeople({ total: 0, people: [] });
    setMessages([]);
    setDemo(false);
    setToast('You left the local chat. Your location was deleted.');
  };

  const send = async (body: string) => {
    const { message } = await api.nearby.send(body);
    setMessages((list) => (list.some((m) => m.id === message.id) ? list : [...list, message]));
  };

  const remove = (id: string) => {
    api.nearby.remove(id).catch((error: Error) => setToast(error.message));
  };

  if (loadError) return <Alert severity="error" sx={{ m: 3 }}>{loadError}</Alert>;
  if (!me) return <FullPageLoader />;
  if (!me.joined) return <NearbyConsent onJoin={join} />;

  const geoMessage = demo ? null : GEO_MESSAGES[geoStatus];
  const visibilityLabel = VISIBILITY_OPTIONS.find((o) => o.value === me.visibility)?.label ?? me.visibility;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box
        sx={{
          px: { xs: 2, md: 3 },
          py: 1.25,
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          flexWrap: 'wrap',
        }}
      >
        <Box sx={{ flex: 1, minWidth: 180 }}>
          <Typography variant="subtitle1" component="h1" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
            Local chat · 1 km
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {located
              ? `${people.total} ${people.total === 1 ? 'person' : 'people'} nearby · you appear as "${me.displayName}"`
              : 'Waiting for your location'}
          </Typography>
        </Box>
        <Tooltip title="Change who can see you on the map" describeChild>
          <Chip
            size="small"
            variant="outlined"
            label={`Map: ${visibilityLabel}`}
            onClick={() => setSettingsOpen(true)}
            sx={{ '@media (pointer: coarse)': { height: 32 } }}
          />
        </Tooltip>
        {me.location && !demo && !!me.location.accuracy && (
          <Chip size="small" icon={<GpsFixedIcon />} label={`±${me.location.accuracy} m`} />
        )}
        {isAdmin && (
          <Tooltip title="Admin only: click the map to pretend you are there (for demos)" describeChild>
            <Button
              size="small"
              variant={demo ? 'contained' : 'outlined'}
              color="secondary"
              startIcon={<ScienceOutlinedIcon />}
              onClick={() => setDemo((d) => !d)}
            >
              {demo ? 'Demo location on' : 'Demo location'}
            </Button>
          </Tooltip>
        )}
        <Tooltip title="Local chat settings">
          <IconButton onClick={() => setSettingsOpen(true)} aria-label="Local chat settings">
            <SettingsIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {geoMessage && (
        <Alert severity={geoMessage.severity} sx={{ borderRadius: 0 }}>
          {geoMessage.text}
        </Alert>
      )}
      {demo && (
        <Alert severity="info" sx={{ borderRadius: 0 }}>
          Demo location: click anywhere on the map to move your position there. Turn it off to use your real location.
        </Alert>
      )}

      {narrow && (
        <Tabs value={tab} onChange={(_e, value) => setTab(value)} variant="fullWidth" sx={{ borderBottom: 1, borderColor: 'divider', minHeight: 44 }}>
          <Tab
            value="chat"
            aria-label={unseen > 0 ? `Chat, ${unseen} new ${unseen === 1 ? 'message' : 'messages'}` : 'Chat'}
            label={
              <Badge color="primary" badgeContent={unseen} max={99} sx={{ '& .MuiBadge-badge': { right: -14 } }}>
                Chat
              </Badge>
            }
            sx={{ minHeight: 44 }}
          />
          <Tab value="map" label={`Map · ${people.total} nearby`} sx={{ minHeight: 44 }} />
        </Tabs>
      )}

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.2fr) minmax(0, 1fr)' },
          gridTemplateRows: 'minmax(0, 1fr)',
        }}
      >
        {/* Both panels stay mounted on phones so the map keeps its position between tab switches. */}
        <Box sx={{ p: 1.5, minHeight: 0, display: narrow && tab !== 'map' ? 'none' : 'block' }}>
          <NearbyMap
            me={me.location}
            radiusMeters={me.radiusMeters}
            people={people.people}
            onPick={
              demo
                ? (point) => sendLocation({ ...point, simulated: true }).catch((error: Error) => setToast(error.message))
                : undefined
            }
          />
        </Box>
        <Stack sx={{ minHeight: 0, borderLeft: { md: 1 }, borderColor: 'divider', display: narrow && tab !== 'chat' ? 'none' : 'flex' }}>
          <NearbyChat
            messages={messages}
            selfToken={me.selfToken}
            isAdmin={isAdmin}
            disabled={!located}
            onSend={send}
            onRemove={remove}
          />
        </Stack>
      </Box>

      {settingsOpen && (
        <NearbySettingsDialog
          open
          initial={{ alias: me.alias, visibility: me.visibility }}
          onSave={saveSettings}
          onLeave={leave}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      <Snackbar
        open={toast !== null}
        autoHideDuration={4000}
        onClose={() => setToast(null)}
        message={toast}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
}
