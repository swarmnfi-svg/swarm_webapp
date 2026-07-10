import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Button, Card, CardContent, TextField, MenuItem,
  Stepper, Step, StepLabel, Alert, Chip, Grid, CircularProgress,
} from '@mui/material';
import { BluetoothConnected, CheckCircle, Error as ErrorIcon } from '@mui/icons-material';
import { deviceAPI, plantAPI, userAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

const STEPS = ['Connect to ESP', 'Check sensors', 'Pair with SWARM'];
const DASHBOARD_PLANT_KEY = 'dashboardPlantId';

function isLocalhostUrl(url) {
  const lower = (url || '').toLowerCase();
  return lower.includes('localhost') || lower.includes('127.0.0.1');
}

async function espFetch(ip, path, password) {
  if (path === '/api/status') {
    const { data } = await deviceAPI.espStatus(ip, password);
    return typeof data === 'string' ? JSON.parse(data) : data;
  }
  throw new Error(`Unsupported path: ${path}`);
}

async function espConfigure(ip, password, config) {
  const { data } = await deviceAPI.espConfigure(ip, password, config);
  return typeof data === 'string' ? JSON.parse(data) : data;
}

export default function ConnectDevice() {
  const navigate = useNavigate();
  const { canManageUsers, refreshUser } = useAuth();
  const [activeStep, setActiveStep] = useState(0);
  const [plants, setPlants] = useState([]);
  const [operators, setOperators] = useState([]);
  const [espIp, setEspIp] = useState('');
  const [devicePassword, setDevicePassword] = useState('');
  const [plantId, setPlantId] = useState('');
  const [assignToUserId, setAssignToUserId] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [swarmUrl, setSwarmUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [espInfo, setEspInfo] = useState(null);
  const [espStatus, setEspStatus] = useState(null);
  const [pairResult, setPairResult] = useState(null);

  useEffect(() => {
    plantAPI.getAll().then(({ data }) => setPlants(data.data || [])).catch(() => {});
    deviceAPI.getSwarmUrl()
      .then(({ data }) => setSwarmUrl(data.data || ''))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!canManageUsers) return;
    userAPI.getAll()
      .then(({ data }) => {
        const list = (data.data || []).filter((u) => u.role === 'OPERATOR' && u.status === 'ACTIVE');
        setOperators(list);
      })
      .catch(() => setOperators([]));
  }, [canManageUsers]);

  const operatorsForPlant = operators.filter((u) => {
    const ids = (u.plantIds || []).map(Number);
    return !ids.length || ids.includes(Number(plantId));
  });

  const handleConnect = async () => {
    setError('');
    setLoading(true);
    try {
      const normalizedIp = espIp.trim();
      const normalizedPassword = devicePassword.trim();
      const infoRes = await deviceAPI.espInfo(normalizedIp);
      const info = typeof infoRes.data === 'string' ? JSON.parse(infoRes.data) : infoRes.data;
      const status = await espFetch(normalizedIp, '/api/status', normalizedPassword);
      setEspInfo(info);
      setEspStatus(status);
      setDeviceName((prev) => prev || `ESP-Hub-${info.chipId?.slice(-4) || 'node'}`);
      setActiveStep(1);
    } catch (e) {
      const msg = e.response?.data?.message || e.message || '';
      if (msg.toLowerCase().includes('password')) {
        setError('Wrong device password. Use DEVICE_PASSWORD from Arduino code (default: 1234).');
      } else {
        setError(msg || `Cannot reach ESP at ${espIp}. Check it is powered on and on same Wi-Fi.`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePair = async () => {
    setError('');
    const normalizedSwarmUrl = swarmUrl.trim();
    if (!normalizedSwarmUrl) {
      setError('SWARM server URL is required.');
      return;
    }
    if (isLocalhostUrl(normalizedSwarmUrl)) {
      setError('ESP cannot reach localhost. Use the LAN IP shown (e.g. http://192.168.x.x:8080/api).');
      return;
    }

    setLoading(true);
    try {
      const normalizedIp = espIp.trim();
      const normalizedPassword = devicePassword.trim();
      const pairPayload = {
        plantId: Number(plantId),
        chipId: espInfo.chipId,
        deviceName,
        espIp: normalizedIp,
      };
      if (canManageUsers && assignToUserId) {
        pairPayload.assignToUserId = Number(assignToUserId);
      }

      const { data } = await deviceAPI.pair(pairPayload);
      const paired = data.data;
      setPairResult(paired);

      await espConfigure(normalizedIp, normalizedPassword, {
        swarmUrl: normalizedSwarmUrl,
        plantId: paired.plantId,
        chipId: paired.chipId,
        temperatureNodeId: paired.temperatureNodeId,
        humidityNodeId: paired.humidityNodeId,
        gasNodeId: paired.gasNodeId,
      });

      await deviceAPI.syncReadings({
        ip: normalizedIp,
        password: normalizedPassword,
        plantId: paired.plantId,
        chipId: paired.chipId,
      });

      sessionStorage.setItem(DASHBOARD_PLANT_KEY, String(paired.plantId));
      sessionStorage.setItem('espCreds', JSON.stringify({
        ip: normalizedIp,
        password: normalizedPassword,
        chipId: paired.chipId,
      }));

      await refreshUser().catch(() => {});

      setActiveStep(2);
    } catch (e) {
      setError(e.response?.data?.message || e.message || 'Pairing failed');
    } finally {
      setLoading(false);
    }
  };

  const goToDashboard = () => {
    if (pairResult?.plantId) {
      sessionStorage.setItem(DASHBOARD_PLANT_KEY, String(pairResult.plantId));
    }
    navigate('/dashboard');
  };

  const healthColor = (h) => (h === 'OK' ? 'success' : h === 'WARNING' ? 'warning' : 'error');

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
        <BluetoothConnected color="primary" />
        <Typography variant="h5" fontWeight={700}>Connect Sensor Hub</Typography>
      </Box>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Pair each ESP8266 hub to a plant. Admins and managers can assign the device to an operator during pairing.
      </Typography>

      <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
        {STEPS.map((label) => <Step key={label}><StepLabel>{label}</StepLabel></Step>)}
      </Stepper>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {activeStep === 0 && (
        <Card>
          <CardContent>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <TextField fullWidth label="ESP8266 IP address" placeholder="192.168.1.45"
                  value={espIp} onChange={(e) => setEspIp(e.target.value.trim())} />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField fullWidth type="password" label="Device password"
                  value={devicePassword} onChange={(e) => setDevicePassword(e.target.value)} />
              </Grid>
              <Grid item xs={12}>
                <Button variant="contained" onClick={handleConnect}
                  disabled={loading || !espIp || !devicePassword}>
                  {loading ? <CircularProgress size={24} /> : 'Connect'}
                </Button>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}

      {activeStep >= 1 && espStatus && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Typography variant="subtitle2" color="text.secondary">Temperature</Typography>
                <Typography variant="h4">{espStatus.dht?.ok ? `${espStatus.dht.temp.toFixed(1)}°C` : '--'}</Typography>
                <Chip size="small" label={espStatus.dht?.ok ? 'OK' : 'FAULT'} color={espStatus.dht?.ok ? 'success' : 'error'} sx={{ mt: 1 }} />
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Typography variant="subtitle2" color="text.secondary">Humidity</Typography>
                <Typography variant="h4">{espStatus.dht?.ok ? `${espStatus.dht.humidity.toFixed(1)}%` : '--'}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Typography variant="subtitle2" color="text.secondary">Gas (MQ5)</Typography>
                <Typography variant="h4">{espStatus.mq5?.ok ? espStatus.mq5.raw : '--'}</Typography>
                <Chip size="small" label={espStatus.mq5?.ok ? 'OK' : 'FAULT'} color={espStatus.mq5?.ok ? 'success' : 'error'} sx={{ mt: 1 }} />
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12}>
            <Alert severity={healthColor(espStatus.health)} icon={espStatus.health === 'OK' ? <CheckCircle /> : <ErrorIcon />}>
              Device health: <strong>{espStatus.health}</strong>
              {espStatus.issues?.length > 0 && ` — ${espStatus.issues.join(', ')}`}
            </Alert>
          </Grid>
        </Grid>
      )}

      {activeStep === 1 && (
        <Card>
          <CardContent>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <TextField fullWidth select label="Plant" value={plantId}
                  onChange={(e) => { setPlantId(e.target.value); setAssignToUserId(''); }}>
                  {plants.map((p) => <MenuItem key={p.plantId} value={p.plantId}>{p.plantName}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField fullWidth label="Device name" value={deviceName}
                  onChange={(e) => setDeviceName(e.target.value)} />
              </Grid>
              {canManageUsers && (
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    select
                    label="Assign to operator (optional)"
                    value={assignToUserId}
                    onChange={(e) => setAssignToUserId(e.target.value)}
                    helperText="Leave empty to assign to your account"
                  >
                    <MenuItem value="">My account</MenuItem>
                    {operatorsForPlant.map((u) => (
                      <MenuItem key={u.id} value={u.id}>{u.name} ({u.email})</MenuItem>
                    ))}
                  </TextField>
                </Grid>
              )}
              <Grid item xs={12}>
                <TextField fullWidth label="SWARM server URL" value={swarmUrl}
                  onChange={(e) => setSwarmUrl(e.target.value)}
                  helperText="Must be your PC's LAN IP — ESP cannot use localhost"
                  error={isLocalhostUrl(swarmUrl)} />
              </Grid>
              <Grid item xs={12}>
                <Button variant="contained" onClick={handlePair}
                  disabled={loading || !plantId || !swarmUrl || isLocalhostUrl(swarmUrl)}>
                  {loading ? <CircularProgress size={24} /> : 'Pair with SWARM'}
                </Button>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}

      {activeStep === 2 && pairResult && (
        <Alert severity="success">
          <Typography fontWeight={600}>Paired successfully!</Typography>
          <Typography variant="body2" sx={{ mt: 1 }}>
            Chip {pairResult.chipId} · Temperature node: {pairResult.temperatureNodeId} · Humidity: {pairResult.humidityNodeId} · Gas: {pairResult.gasNodeId}
          </Typography>
          <Typography variant="body2" sx={{ mt: 1 }}>
            ESP will send data every 30 seconds. Assign sensors in User Management if needed.
          </Typography>
          <Button sx={{ mt: 2 }} variant="outlined" onClick={goToDashboard}>
            Go to Dashboard
          </Button>
        </Alert>
      )}
    </Box>
  );
}
