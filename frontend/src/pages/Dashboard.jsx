import { useState, useEffect } from 'react';
import {
  Box, Grid, Card, CardContent, Typography, Chip, Select, MenuItem,
  FormControl, InputLabel, CircularProgress, LinearProgress,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  IconButton, Tooltip,
} from '@mui/material';
import {
  Opacity, Thermostat, Speed, Air, LocalFireDepartment,
  Co2, Warning, Science, BluetoothConnected, Refresh,
} from '@mui/icons-material';
import { plantAPI, dashboardAPI, alertAPI, deviceAPI } from '../services/api';
import { SENSOR_LABELS, SENSOR_UNITS, getHealthColor, formatDate } from '../utils/constants';

const sensorIcons = {
  PH: <Opacity />, TEMPERATURE: <Thermostat />, TEMPERATURE_TRANSMITTER: <Thermostat />,
  HUMIDITY: <Thermostat />, PRESSURE: <Speed />, PRESSURE_TRANSMITTER: <Speed />,
  GAS_FLOW: <Air />, FLOW_TRANSMITTER: <Air />, METHANE: <LocalFireDepartment />,
  CARBON_DIOXIDE: <Co2 />, HYDROGEN_SULFIDE: <Warning />, AMMONIA: <Science />,
  LIQUID_LEVEL: <Opacity />,
};

export default function Dashboard() {
  const [plants, setPlants] = useState([]);
  const [selectedPlant, setSelectedPlant] = useState('');
  const [dashboard, setDashboard] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncingChip, setSyncingChip] = useState('');

  const fetchData = () => {
    if (!selectedPlant) return;
    dashboardAPI.getDashboard(selectedPlant).then(({ data }) => setDashboard(data.data));
    alertAPI.getAll({ plantId: selectedPlant, status: 'ACTIVE' }).then(({ data }) => setAlerts((data.data || []).slice(0, 5)));
  };

  useEffect(() => {
    plantAPI.getAll().then(({ data }) => {
      const list = data.data || [];
      setPlants(list);
      const pairedPlant = sessionStorage.getItem('dashboardPlantId');
      if (pairedPlant && list.some((p) => p.plantId === Number(pairedPlant))) {
        setSelectedPlant(Number(pairedPlant));
        sessionStorage.removeItem('dashboardPlantId');
      } else if (list.length > 0) {
        setSelectedPlant(list[0].plantId);
      }
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedPlant) return;
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [selectedPlant]);

  const handleSyncDevice = async (device) => {
    const creds = JSON.parse(sessionStorage.getItem('espCreds') || '{}');
    const ip = device.deviceIp || creds.ip;
    const password = creds.password;
    if (!ip || !password) {
      window.alert('Re-pair the device from Connect Device to refresh readings (device password required).');
      return;
    }
    setSyncingChip(device.chipId);
    try {
      await deviceAPI.syncReadings({
        ip,
        password,
        plantId: device.plantId || selectedPlant,
        chipId: device.chipId,
      });
      fetchData();
    } catch (e) {
      window.alert(e.response?.data?.message || 'Failed to sync readings from ESP');
    } finally {
      setSyncingChip('');
    }
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;

  const readings = dashboard?.currentReadings || {};
  const pairedDevices = dashboard?.pairedDevices || [];
  const visibleSensorTypes = dashboard?.visibleSensorTypes || [];
  const healthScore = dashboard?.healthScore || 0;
  const healthStatus = dashboard?.healthStatus || 'GOOD';

  const deviceStatusColor = (status) => {
    if (status === 'ACTIVE') return 'success';
    if (status === 'OFFLINE' || status === 'FAULTY') return 'error';
    if (status === 'INACTIVE') return 'warning';
    return 'default';
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Typography variant="h5" fontWeight={700}>Live Monitoring Dashboard</Typography>
        <FormControl size="small" sx={{ minWidth: 250 }}>
          <InputLabel>Select Plant</InputLabel>
          <Select value={selectedPlant} label="Select Plant" onChange={(e) => setSelectedPlant(e.target.value)}>
            {plants.map((p) => (
              <MenuItem key={p.plantId} value={p.plantId}>{p.plantName}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}>
          <Card sx={{ bgcolor: getHealthColor(healthStatus), color: 'white' }}>
            <CardContent>
              <Typography variant="subtitle2">Plant Health Status</Typography>
              <Typography variant="h3" fontWeight={700}>{healthScore}/100</Typography>
              <Chip label={healthStatus} sx={{ mt: 1, bgcolor: 'rgba(255,255,255,0.2)', color: 'white' }} />
              <LinearProgress
                variant="determinate" value={healthScore}
                sx={{ mt: 2, bgcolor: 'rgba(255,255,255,0.3)', '& .MuiLinearProgress-bar': { bgcolor: 'white' } }}
              />
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} md={2}>
          <Card><CardContent>
            <Typography variant="caption" color="text.secondary">Active Alerts</Typography>
            <Typography variant="h4" color="error.main" fontWeight={700}>{dashboard?.activeAlerts || 0}</Typography>
          </CardContent></Card>
        </Grid>
        <Grid item xs={6} md={2}>
          <Card><CardContent>
            <Typography variant="caption" color="text.secondary">Active Nodes</Typography>
            <Typography variant="h4" color="primary.main" fontWeight={700}>
              {dashboard?.activeNodes || 0}/{dashboard?.totalNodes || 0}
            </Typography>
          </CardContent></Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card><CardContent>
            <Typography variant="caption" color="text.secondary">Gas Production</Typography>
            <Typography variant="h4" color="secondary.main" fontWeight={700}>
              {(dashboard?.gasProduction || 0).toFixed(1)} m³/h
            </Typography>
          </CardContent></Card>
        </Grid>
      </Grid>

      <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
        <BluetoothConnected fontSize="small" color="primary" />
        Paired Devices
      </Typography>
      <Card sx={{ mb: 3 }}>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Device</TableCell>
                <TableCell>Plant</TableCell>
                <TableCell>Chip ID</TableCell>
                <TableCell>Temp (°C)</TableCell>
                <TableCell>Humidity (%)</TableCell>
                <TableCell>Gas (raw)</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Last Reading</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {pairedDevices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} align="center">
                    <Typography color="text.secondary" sx={{ py: 2 }}>
                      No paired devices for this plant. Use Connect Device to pair an ESP8266 hub.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                pairedDevices.map((device) => (
                  <TableRow key={device.chipId} hover>
                    <TableCell>
                      <Typography fontWeight={600}>{device.deviceName}</Typography>
                      <Typography variant="caption" color="text.secondary">{device.deviceIp || 'IP not saved'}</Typography>
                    </TableCell>
                    <TableCell>{device.plantName || '--'}</TableCell>
                    <TableCell>
                      <Typography variant="body2" fontFamily="monospace">{device.chipId}</Typography>
                    </TableCell>
                    <TableCell>{device.temperature != null ? device.temperature.toFixed(1) : '--'}</TableCell>
                    <TableCell>{device.humidity != null ? device.humidity.toFixed(1) : '--'}</TableCell>
                    <TableCell>{device.gas != null ? device.gas.toFixed(0) : '--'}</TableCell>
                    <TableCell>
                      <Chip label={device.status} size="small" color={deviceStatusColor(device.status)} />
                    </TableCell>
                    <TableCell>{formatDate(device.lastReadingAt)}</TableCell>
                    <TableCell align="right">
                      <Tooltip title="Pull latest readings from ESP">
                        <IconButton
                          size="small"
                          onClick={() => handleSyncDevice(device)}
                          disabled={syncingChip === device.chipId}
                        >
                          {syncingChip === device.chipId ? <CircularProgress size={18} /> : <Refresh />}
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      <Typography variant="h6" sx={{ mb: 2 }}>Sensor Overview</Typography>
      {visibleSensorTypes.length === 0 ? (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography color="text.secondary">
              No sensors configured for this project yet. Super admin can enable hardware under Plants.
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {visibleSensorTypes.map((type) => (
            <Grid item xs={6} sm={4} md={3} key={type}>
              <Card>
                <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Box sx={{ color: 'primary.main' }}>{sensorIcons[type] || <Thermostat />}</Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">{SENSOR_LABELS[type] || type}</Typography>
                    <Typography variant="h6" fontWeight={600}>
                      {readings[type] != null ? readings[type].toFixed(1) : '--'} {SENSOR_UNITS[type] || ''}
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      <Typography variant="h6" sx={{ mb: 2 }}>Active Alerts</Typography>
      <Card>
        <CardContent>
          {alerts.length === 0 ? (
            <Typography color="text.secondary">No active alerts. Plant operating normally.</Typography>
          ) : (
            alerts.map((alert) => (
              <Box key={alert.id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1, borderBottom: '1px solid #eee' }}>
                <Box>
                  <Typography fontWeight={500}>{alert.title}</Typography>
                  <Typography variant="body2" color="text.secondary">{alert.message}</Typography>
                </Box>
                <Chip
                  label={alert.severity}
                  size="small"
                  color={alert.severity === 'CRITICAL' ? 'error' : alert.severity === 'WARNING' ? 'warning' : 'info'}
                />
              </Box>
            ))
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
