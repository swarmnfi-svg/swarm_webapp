import { useState, useEffect, useMemo } from 'react';
import {
  Box, Typography, Card, CardContent, FormControl, InputLabel, Select, MenuItem,
  ToggleButtonGroup, ToggleButton, CircularProgress, Grid,
} from '@mui/material';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { plantAPI, dashboardAPI } from '../services/api';
import { SENSOR_LABELS, getSensorTypesForPlant } from '../utils/constants';
import { subHours, subDays, subWeeks, subMonths, format } from 'date-fns';

const chartColors = ['#0066CC', '#00A86B', '#DC3545', '#FFC107', '#6f42c1'];

export default function Analytics() {
  const [plants, setPlants] = useState([]);
  const [selectedPlant, setSelectedPlant] = useState('');
  const [range, setRange] = useState('day');
  const [sensorType, setSensorType] = useState('TEMPERATURE');
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    plantAPI.getAll().then(({ data }) => {
      const list = data.data || [];
      setPlants(list);
      if (list.length > 0) setSelectedPlant(list[0].plantId);
    });
  }, []);

  const sensorOptions = useMemo(
    () => getSensorTypesForPlant(plants.find((p) => p.plantId === Number(selectedPlant))),
    [plants, selectedPlant],
  );

  useEffect(() => {
    if (sensorOptions.length > 0 && !sensorOptions.includes(sensorType)) {
      setSensorType(sensorOptions[0]);
    }
  }, [sensorOptions, sensorType]);

  useEffect(() => {
    if (!selectedPlant) return;
    setLoading(true);
    const now = new Date();
    const ranges = { hour: subHours(now, 1), day: subDays(now, 1), week: subWeeks(now, 1), month: subMonths(now, 1) };
    const start = ranges[range] || subDays(now, 1);

    dashboardAPI.getAnalytics(selectedPlant, {
      sensorType,
      start: start.toISOString().slice(0, 19),
      end: now.toISOString().slice(0, 19),
    }).then(({ data }) => {
      const formatted = (data.data || []).map((r) => ({
        time: format(new Date(r.recordedAt), range === 'hour' ? 'HH:mm' : 'MMM dd HH:mm'),
        value: r.value,
      }));
      setChartData(formatted);
    }).finally(() => setLoading(false));
  }, [selectedPlant, range, sensorType]);

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>Historical Analytics</Typography>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={4}>
          <FormControl fullWidth size="small">
            <InputLabel>Plant</InputLabel>
            <Select value={selectedPlant} label="Plant" onChange={(e) => setSelectedPlant(e.target.value)}>
              {plants.map((p) => <MenuItem key={p.plantId} value={p.plantId}>{p.plantName}</MenuItem>)}
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} sm={4}>
          <FormControl fullWidth size="small">
            <InputLabel>Sensor</InputLabel>
            <Select value={sensorType} label="Sensor" onChange={(e) => setSensorType(e.target.value)}>
              {sensorOptions.map((s) => <MenuItem key={s} value={s}>{SENSOR_LABELS[s]}</MenuItem>)}
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} sm={4}>
          <ToggleButtonGroup value={range} exclusive onChange={(_, v) => v && setRange(v)} size="small" fullWidth>
            <ToggleButton value="hour">Hour</ToggleButton>
            <ToggleButton value="day">Day</ToggleButton>
            <ToggleButton value="week">Week</ToggleButton>
            <ToggleButton value="month">Month</ToggleButton>
          </ToggleButtonGroup>
        </Grid>
      </Grid>

      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>{SENSOR_LABELS[sensorType]} Trend</Typography>
          {loading ? <CircularProgress /> : (
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" tick={{ fontSize: 12 }} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="value" stroke={chartColors[0]} strokeWidth={2} dot={false} name={SENSOR_LABELS[sensorType]} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
