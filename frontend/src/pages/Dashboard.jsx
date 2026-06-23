import { useState, useEffect } from 'react';
import {
  Box, Grid, Card, CardContent, Typography, Chip, Select, MenuItem,
  FormControl, InputLabel, CircularProgress, LinearProgress,
} from '@mui/material';
import {
  Opacity, Thermostat, Speed, Air, LocalFireDepartment,
  Co2, Warning, Science,
} from '@mui/icons-material';
import { plantAPI, dashboardAPI, alertAPI } from '../services/api';
import { SENSOR_LABELS, SENSOR_UNITS, getHealthColor } from '../utils/constants';

const sensorIcons = {
  PH: <Opacity />, TEMPERATURE: <Thermostat />, PRESSURE: <Speed />,
  GAS_FLOW: <Air />, METHANE: <LocalFireDepartment />, CARBON_DIOXIDE: <Co2 />,
  HYDROGEN_SULFIDE: <Warning />, AMMONIA: <Science />,
};

const keySensors = ['PH', 'TEMPERATURE', 'PRESSURE', 'GAS_FLOW', 'METHANE', 'CARBON_DIOXIDE', 'HYDROGEN_SULFIDE', 'AMMONIA'];

export default function Dashboard() {
  const [plants, setPlants] = useState([]);
  const [selectedPlant, setSelectedPlant] = useState('');
  const [dashboard, setDashboard] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    plantAPI.getAll().then(({ data }) => {
      const list = data.data || [];
      setPlants(list);
      if (list.length > 0) setSelectedPlant(list[0].plantId);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedPlant) return;
    const fetchData = () => {
      dashboardAPI.getDashboard(selectedPlant).then(({ data }) => setDashboard(data.data));
      alertAPI.getAll({ plantId: selectedPlant, status: 'ACTIVE' }).then(({ data }) => setAlerts((data.data || []).slice(0, 5)));
    };
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [selectedPlant]);

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;

  const readings = dashboard?.currentReadings || {};
  const healthScore = dashboard?.healthScore || 0;
  const healthStatus = dashboard?.healthStatus || 'GOOD';

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

      <Typography variant="h6" sx={{ mb: 2 }}>Sensor Overview</Typography>
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {keySensors.map((type) => (
          <Grid item xs={6} sm={4} md={3} key={type}>
            <Card>
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Box sx={{ color: 'primary.main' }}>{sensorIcons[type]}</Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">{SENSOR_LABELS[type]}</Typography>
                  <Typography variant="h6" fontWeight={600}>
                    {readings[type] != null ? readings[type].toFixed(1) : '--'} {SENSOR_UNITS[type]}
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

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
