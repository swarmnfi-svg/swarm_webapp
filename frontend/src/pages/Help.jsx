import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Paper, Stack, Chip, Alert, Button, Divider,
  List, ListItem, ListItemText, Table, TableBody, TableCell,
  TableHead, TableRow, Accordion, AccordionSummary, AccordionDetails,
} from '@mui/material';
import {
  MenuBook, ExpandMore, BluetoothConnected, CheckCircle, Security,
  PrecisionManufacturing,
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';

const IMG = (name) => `/manual-screenshots/${name}`;

function Shot({ src, alt, caption }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5, my: 2, bgcolor: 'background.paper' }}>
      <Box
        component="img"
        src={src}
        alt={alt}
        sx={{
          width: '100%',
          maxHeight: 520,
          objectFit: 'contain',
          display: 'block',
          borderRadius: 1,
          bgcolor: '#f8fafc',
        }}
      />
      {caption && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          {caption}
        </Typography>
      )}
    </Paper>
  );
}

function Section({ id, title, children, defaultExpanded = false }) {
  return (
    <Accordion defaultExpanded={defaultExpanded} disableGutters sx={{ mb: 1.5, borderRadius: 2, '&:before': { display: 'none' }, border: '1px solid', borderColor: 'divider' }}>
      <AccordionSummary expandIcon={<ExpandMore />} id={id}>
        <Typography fontWeight={700}>{title}</Typography>
      </AccordionSummary>
      <AccordionDetails sx={{ pt: 0 }}>
        {children}
      </AccordionDetails>
    </Accordion>
  );
}

export default function Help() {
  const { user, isSuperAdmin, isPlantAdmin, isOperator, canManageUsers, canManagePlants } = useAuth();
  const navigate = useNavigate();

  const roleLabel = user?.role?.replace('_', ' ') || 'User';
  const showAdminFlash = isSuperAdmin || isPlantAdmin;
  const showAssignOperator = canManageUsers;

  const focusChips = useMemo(() => {
    if (isSuperAdmin) {
      return ['Plant HMI controls', 'First flash & Unique ID', 'Wi-Fi setup', 'Pair devices', 'Users & plants'];
    }
    if (isPlantAdmin) {
      return ['Plant HMI controls', 'Unique ID handoff', 'Wi-Fi setup', 'Pair & assign operators', 'Dashboard check'];
    }
    return ['Plant HMI (view)', 'Join setup hotspot', 'Change site Wi-Fi', 'Connect Device', 'Dashboard readings'];
  }, [isSuperAdmin, isPlantAdmin]);

  return (
    <Box sx={{ maxWidth: 960 }}>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1 }}>
        <MenuBook color="primary" />
        <Typography variant="h5" fontWeight={700}>User Manual</Typography>
      </Stack>

      <Typography color="text.secondary" sx={{ mb: 2 }}>
        SWARM guides for the <strong>Plant HMI</strong> (process flow diagram) and the
        <strong> SWARM MODEL Sensor Hub</strong> (Temperature, Humidity, Methane).
        Content is filtered for your role: <strong>{roleLabel}</strong>.
      </Typography>

      <Alert severity="info" sx={{ mb: 2 }}>
        Your focus areas:&nbsp;
        {focusChips.map((c) => (
          <Chip key={c} size="small" label={c} sx={{ mr: 0.5, mb: 0.5 }} />
        ))}
      </Alert>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 3 }}>
        <Button
          variant="contained"
          startIcon={<PrecisionManufacturing />}
          onClick={() => navigate('/plant-hmi')}
        >
          Open Plant HMI
        </Button>
        <Button
          variant="outlined"
          startIcon={<BluetoothConnected />}
          onClick={() => navigate('/connect-device')}
        >
          Open Connect Device
        </Button>
      </Stack>

      <Section id="overview" title="1. Overview" defaultExpanded>
        <Typography paragraph>
          The hub joins site Wi‑Fi, then SWARM pairs it to a plant. After pairing, the ESP posts
          Temperature, Humidity, and Methane about every 30 seconds.
        </Typography>
        <List dense>
          {showAdminFlash && (
            <ListItem>
              <ListItemText primary="Admin sets a Device Unique ID in firmware and flashes once." />
            </ListItem>
          )}
          <ListItem>
            <ListItemText primary="On site, connect phone to SWARM-Setup-<chipId> using the Unique ID as Wi‑Fi password." />
          </ListItem>
          <ListItem>
            <ListItemText primary="Open http://192.168.4.1/setup, enter Unique ID + site Wi‑Fi, save & restart." />
          </ListItem>
          <ListItem>
            <ListItemText primary="In SWARM → Connect Device, enter ESP LAN IP + Device Password, then pair." />
          </ListItem>
        </List>
      </Section>

      {showAdminFlash && (
        <Section id="admin-flash" title="2. Admin — first flash & Unique ID" defaultExpanded={isSuperAdmin}>
          <Alert severity="warning" icon={<Security />} sx={{ mb: 2 }}>
            Visible to Super Admin and Plant Admin only. Operators do not flash firmware.
          </Alert>
          <Typography paragraph>
            In the ESP sketch, set a unique ID per board (minimum 8 characters). This ID is the
            setup hotspot password and is required on the `/setup` form before Wi‑Fi can change.
          </Typography>
          <Paper variant="outlined" sx={{ p: 2, mb: 2, fontFamily: 'Consolas, monospace', bgcolor: '#0f172a', color: '#e2e8f0', fontSize: 13 }}>
            {`const char* DEVICE_UNIQUE_ID = "SWARM-ESP-001";  // change per device\nconst char* DEVICE_PASSWORD  = "22 22";          // used in Connect Device`}
          </Paper>
          <List dense>
            <ListItem><ListItemText primary="Flash over USB once." /></ListItem>
            <ListItem><ListItemText primary="Label the board / give the Unique ID to the field user." /></ListItem>
            <ListItem><ListItemText primary="Keep FORCE_CLEAR_SAVED_WIFI = false for normal use." /></ListItem>
          </List>
          {isSuperAdmin && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Super Admin: also ensure plants, pending sensor nodes, and SWARM server reachability
              are ready before operators pair devices.
            </Typography>
          )}
        </Section>
      )}

      <Section id="wifi-setup" title={`${showAdminFlash ? '3' : '2'}. Field Wi‑Fi setup (phone)`} defaultExpanded={isOperator}>
        <Typography fontWeight={600} sx={{ mb: 1 }}>Join the ESP hotspot</Typography>
        <List dense>
          <ListItem><ListItemText primary="Power on the ESP and turn off mobile data on the phone." /></ListItem>
          <ListItem><ListItemText primary="Connect to SWARM-Setup-<chipId> (example: SWARM-Setup-a273c8)." /></ListItem>
          <ListItem><ListItemText primary="Password = Device Unique ID from admin (not the site Wi‑Fi password)." /></ListItem>
        </List>
        <Shot
          src={IMG('07-phone-wifi-hotspot.png')}
          alt="Phone Wi-Fi join ESP hotspot"
          caption="Join SWARM-Setup-<chipId> using the Device Unique ID as the password."
        />

        <Typography fontWeight={600} sx={{ mb: 1 }}>Open setup and save site Wi‑Fi</Typography>
        <Typography paragraph>
          Browser: <strong>http://192.168.4.1/setup</strong> (use http, not https). Enter Unique ID,
          site SSID/password, and Device Password, then Save & Restart.
        </Typography>
        <Shot
          src={IMG('02-esp-wifi-setup.png')}
          alt="ESP Wi-Fi setup form"
          caption="Wrong Unique ID → Wi‑Fi is not changed."
        />

        <Typography fontWeight={600} sx={{ mb: 1 }}>Confirm the hub is online</Typography>
        <Typography paragraph>
          On a PC on the same Wi‑Fi, open <code>http://&lt;esp-lan-ip&gt;/info</code> and note the <code>ip</code> field.
        </Typography>
        <Shot
          src={IMG('01-esp-info.png')}
          alt="ESP /info JSON"
          caption="Use the ip value later in Connect Device."
        />
      </Section>

      <Section id="connect-swarm" title={`${showAdminFlash ? '4' : '3'}. Pair with SWARM web app`} defaultExpanded>
        <Typography paragraph>
          PC and ESP must be on the same Wi‑Fi. The SWARM server URL must be a LAN IP — ESP cannot use localhost.
        </Typography>

        <Typography fontWeight={600}>Step 1 — Connect to ESP</Typography>
        <List dense>
          <ListItem><ListItemText primary="Sidebar → Connect Device" /></ListItem>
          <ListItem><ListItemText primary="Enter ESP LAN IP and Device Password (from firmware/setup — not the Unique ID)." /></ListItem>
          <ListItem><ListItemText primary="Click Connect." /></ListItem>
        </List>
        <Shot src={IMG('04-connect-device-step1.png')} alt="Connect Device empty" caption="Connect Device — start here." />
        <Shot src={IMG('04-connect-device-step1-filled.png')} alt="Connect Device filled" caption="Example: IP filled and ready to connect." />
        <Shot src={IMG('04c-wrong-password-example.png')} alt="Wrong password" caption="If password is wrong, use Device Password from Arduino/setup." />

        <Typography fontWeight={600} sx={{ mt: 1 }}>Step 2 — Check sensors & pair</Typography>
        <List dense>
          <ListItem><ListItemText primary="Confirm Temperature, Humidity, and Gas readings look healthy." /></ListItem>
          <ListItem><ListItemText primary="Select Plant and Device name." /></ListItem>
          {showAssignOperator && (
            <ListItem>
              <ListItemText primary="Optional: Assign to operator (admins/managers). Leave empty to keep on your account." />
            </ListItem>
          )}
          <ListItem>
            <ListItemText primary="SWARM server URL example: http://192.168.x.x:8080/api (LAN IP only)." />
          </ListItem>
        </List>
        <Shot src={IMG('05-connect-device-step2.png')} alt="Check sensors and pair" caption="Check sensors, then Pair with SWARM." />
        <Shot src={IMG('06-connect-device-step3.png')} alt="Paired successfully" caption="Pairing complete — ESP will send data every ~30 seconds." />

        <Button
          sx={{ mt: 1 }}
          variant="outlined"
          startIcon={<BluetoothConnected />}
          onClick={() => navigate('/connect-device')}
        >
          Go to Connect Device
        </Button>
      </Section>

      <Section id="dashboard" title={`${showAdminFlash ? '5' : '4'}. Verify on Dashboard`}>
        <Typography paragraph>
          Open Dashboard, select the plant, and confirm the paired device row plus Temperature / Humidity / Methane cards.
        </Typography>
        <Shot
          src={IMG('03-swarm-dashboard.png')}
          alt="Dashboard with paired ESP"
          caption="Live readings after a successful pair."
        />
        <Button startIcon={<CheckCircle />} variant="outlined" onClick={() => navigate('/dashboard')}>
          Open Dashboard
        </Button>
      </Section>

      <Section id="plant-hmi" title={`${showAdminFlash ? '6' : '5'}. Plant HMI`} defaultExpanded={canManagePlants}>
        <Typography paragraph>
          The Plant HMI shows the biogas plant process flow diagram with live readings, animated pipelines,
          and block start/stop controls. Commands update server simulation state (not real PLCs in demo mode).
        </Typography>

        <Typography fontWeight={600} sx={{ mb: 1 }}>Open the HMI</Typography>
        <List dense>
          <ListItem><ListItemText primary="Sidebar → Plant HMI (or /plant-hmi)" /></ListItem>
          <ListItem><ListItemText primary="Select the Tata Steel / P&ID plant from the dropdown if prompted." /></ListItem>
        </List>

        <Typography fontWeight={600} sx={{ mt: 2, mb: 1 }}>Master bus (Plant Admin / Super Admin)</Typography>
        <List dense>
          <ListItem><ListItemText primary="Click Energize bus before any motor or pump can start." /></ListItem>
          <ListItem><ListItemText primary="De-energize bus stops all equipment and blocks further starts." /></ListItem>
        </List>

        <Typography fontWeight={600} sx={{ mt: 2, mb: 1 }}>Process flow diagram</Typography>
        <List dense>
          <ListItem><ListItemText primary="Block buttons: Belt Conveyor, Crusher, Pre Treatment Tank, Motor, Main Digester, Slurry Storage, Treatment Water, Equalization." /></ListItem>
          <ListItem><ListItemText primary="All On — starts all eight blocks at once (skips blocks already running)." /></ListItem>
          <ListItem><ListItemText primary="Green = running, Red = off, Yellow = fault (when bus energized)." /></ListItem>
          <ListItem><ListItemText primary="Live Readings panel — equipment tags and instruments (FIT, PIT, LIT)." /></ListItem>
          <ListItem><ListItemText primary="Maximize icon — full-screen diagram; Minimize to return." /></ListItem>
          <ListItem><ListItemText primary="Pipeline animation follows active blocks and bus state." /></ListItem>
        </List>

        <Typography fontWeight={600} sx={{ mt: 2, mb: 1 }}>Pre-treatment pumps (PS / PW)</Typography>
        <List dense>
          <ListItem><ListItemText primary="PW (P-101B) — duty pump; controlled by Pre Treatment Tank block." /></ListItem>
          <ListItem><ListItemText primary="PS (P-101A) — standby; PS → PW line is off while PW is running." /></ListItem>
          <ListItem><ListItemText primary="When PW stops and PS runs, standby path PS → PW → digester animates." /></ListItem>
        </List>

        <Typography fontWeight={600} sx={{ mt: 2, mb: 1 }}>HMI tabs</Typography>
        <List dense>
          <ListItem><ListItemText primary="Overview, Feed & Pretreatment, Digester, Gas, Slurry & ETP — zone views with diagram highlight." /></ListItem>
          <ListItem><ListItemText primary="Alarms, Trends, Diagnostics, Audit — monitoring and command history." /></ListItem>
        </List>

        {!canManagePlants && (
          <Alert severity="info" sx={{ mt: 2 }}>
            Operators can view the HMI and readings but cannot energize the bus or start/stop equipment.
          </Alert>
        )}

        <Button
          sx={{ mt: 2 }}
          variant="outlined"
          startIcon={<PrecisionManufacturing />}
          onClick={() => navigate('/plant-hmi')}
        >
          Go to Plant HMI
        </Button>
      </Section>

      <Section id="credentials" title={`${showAdminFlash ? '7' : '6'}. Credentials cheat sheet`}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Credential</TableCell>
              <TableCell>Used for</TableCell>
              <TableCell>Who sets it</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            <TableRow>
              <TableCell>Device Unique ID</TableCell>
              <TableCell>Setup hotspot password + required on /setup</TableCell>
              <TableCell>{showAdminFlash ? 'Admin (first flash)' : 'Ask your admin'}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Device password</TableCell>
              <TableCell>SWARM Connect Device</TableCell>
              <TableCell>Admin /setup form</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Site Wi‑Fi</TableCell>
              <TableCell>ESP internet / LAN</TableCell>
              <TableCell>Field user on /setup</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>SWARM server URL</TableCell>
              <TableCell>ESP POST /iot/batch</TableCell>
              <TableCell>Pairing screen (LAN IP)</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Section>

      <Section id="troubleshoot" title={`${showAdminFlash ? '8' : '7'}. Troubleshooting`}>
        <List dense>
          <ListItem>
            <ListItemText
              primary="Phone cannot open 192.168.4.1/setup"
              secondary="Turn off mobile data; forget & rejoin hotspot; use http not https."
            />
          </ListItem>
          <ListItem>
            <ListItemText
              primary="Wrong Unique ID on setup"
              secondary="Wi‑Fi will not save — ask admin for the coded ID."
            />
          </ListItem>
          <ListItem>
            <ListItemText
              primary="Connect Device / api/devices/esp/info returns 400"
              secondary="Wrong IP, device offline, or not a private LAN IP. Open http://<ip>/info in a browser first."
            />
          </ListItem>
          <ListItem>
            <ListItemText
              primary="Wrong device password"
              secondary="Use Device Password from firmware/setup — Unique ID is only for hotspot/setup form."
            />
          </ListItem>
          <ListItem>
            <ListItemText
              primary="Paired but no data"
              secondary="SWARM URL must be LAN IP, not localhost. Check plant selection on Dashboard."
            />
          </ListItem>
          <ListItem>
            <ListItemText
              primary="Plant HMI blocks greyed out"
              secondary="Energize bus first. Operators cannot control — ask Plant Admin."
            />
          </ListItem>
          <ListItem>
            <ListItemText
              primary="HMI flow lines not animating"
              secondary="Related block must be running and bus energized. Hard refresh if diagram looks stale."
            />
          </ListItem>
        </List>
        {isPlantAdmin && !isSuperAdmin && (
          <Alert severity="info" sx={{ mt: 1 }}>
            Plant Admin tip: if operators cannot pair, confirm the plant exists and pending sensor nodes
            were created under Users / sensor setup.
          </Alert>
        )}
        {isOperator && (
          <Alert severity="info" sx={{ mt: 1 }}>
            Operator tip: if you do not have the Unique ID or Device Password, contact your Plant Admin
            or Super Admin — do not reflash the board.
          </Alert>
        )}
      </Section>

      <Divider sx={{ my: 3 }} />
      <Typography variant="body2" color="text.secondary">
        Full markdown copies: <code>docs/USER_MANUAL.md</code> (complete guide) and
        <code>docs/ESP_SENSOR_HUB_MANUAL.md</code> (sensor hub detail).
        HMI technical reference: <code>docs/PLANT_HMI.md</code>.
      </Typography>
    </Box>
  );
}
