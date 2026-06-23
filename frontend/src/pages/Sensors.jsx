import { useState, useEffect } from 'react';
import {
  Box, Typography, Button, Card, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, MenuItem, Grid, FormControl, InputLabel, Select, CircularProgress,
} from '@mui/material';
import { Add, Edit, PowerSettingsNew } from '@mui/icons-material';
import { sensorAPI, plantAPI } from '../services/api';
import { SENSOR_TYPES, formatPlantType } from '../utils/constants';

const emptyForm = { plantId: '', nodeName: '', sensorType: 'PH', firmwareVersion: 'v2.1.0', batteryLevel: 100, signalStrength: 90, status: 'ACTIVE' };

export default function Sensors() {
  const [nodes, setNodes] = useState([]);
  const [plants, setPlants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [filterPlant, setFilterPlant] = useState('');

  const loadData = () => {
    Promise.all([sensorAPI.getAll(), plantAPI.getAll()])
      .then(([nodesRes, plantsRes]) => {
        setNodes(nodesRes.data.data || []);
        setPlants(plantsRes.data.data || []);
      }).finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  const filtered = filterPlant ? nodes.filter((n) => n.plantId === filterPlant) : nodes;

  const handleSave = async () => {
    const payload = { ...form, plantId: Number(form.plantId), batteryLevel: Number(form.batteryLevel), signalStrength: Number(form.signalStrength) };
    if (editId) await sensorAPI.update(editId, payload);
    else await sensorAPI.create(payload);
    setDialogOpen(false);
    loadData();
  };

  const handleToggle = async (id, currentStatus) => {
    await sensorAPI.toggle(id, currentStatus !== 'ACTIVE');
    loadData();
  };

  if (loading) return <CircularProgress />;

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Typography variant="h5" fontWeight={700}>Sensor Node Management</Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Filter by Plant</InputLabel>
            <Select value={filterPlant} label="Filter by Plant" onChange={(e) => setFilterPlant(e.target.value)}>
              <MenuItem value="">All Plants</MenuItem>
              {plants.map((p) => <MenuItem key={p.plantId} value={p.plantId}>{p.plantName}</MenuItem>)}
            </Select>
          </FormControl>
          <Button variant="contained" startIcon={<Add />} onClick={() => { setEditId(null); setForm(emptyForm); setDialogOpen(true); }}>
            Register Node
          </Button>
        </Box>
      </Box>

      <Card>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Node Name</TableCell><TableCell>Plant</TableCell><TableCell>Sensor Type</TableCell>
                <TableCell>Last Value</TableCell><TableCell>Battery</TableCell><TableCell>Signal</TableCell>
                <TableCell>Status</TableCell><TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map((n) => (
                <TableRow key={n.nodeId}>
                  <TableCell>{n.nodeName}</TableCell>
                  <TableCell>{n.plantName}</TableCell>
                  <TableCell>{n.sensorType}</TableCell>
                  <TableCell>{n.lastValue != null ? n.lastValue.toFixed(2) : '--'}</TableCell>
                  <TableCell>{n.batteryLevel}%</TableCell>
                  <TableCell>{n.signalStrength}%</TableCell>
                  <TableCell>
                    <Chip label={n.status} size="small"
                      color={n.status === 'ACTIVE' ? 'success' : n.status === 'OFFLINE' ? 'error' : 'default'} />
                  </TableCell>
                  <TableCell>
                    <IconButton size="small" onClick={() => handleToggle(n.nodeId, n.status)} title="Toggle">
                      <PowerSettingsNew />
                    </IconButton>
                    <IconButton size="small" onClick={() => { setEditId(n.nodeId); setForm({ ...n, plantId: n.plantId }); setDialogOpen(true); }}>
                      <Edit />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editId ? 'Edit Sensor Node' : 'Register Sensor Node'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField fullWidth select label="Plant" value={form.plantId} onChange={(e) => setForm({ ...form, plantId: e.target.value })}>
                {plants.map((p) => <MenuItem key={p.plantId} value={p.plantId}>{p.plantName}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12}><TextField fullWidth label="Node Name" value={form.nodeName} onChange={(e) => setForm({ ...form, nodeName: e.target.value })} /></Grid>
            <Grid item xs={12}>
              <TextField fullWidth select label="Sensor Type" value={form.sensorType} onChange={(e) => setForm({ ...form, sensorType: e.target.value })}>
                {SENSOR_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={6}><TextField fullWidth label="Firmware" value={form.firmwareVersion} onChange={(e) => setForm({ ...form, firmwareVersion: e.target.value })} /></Grid>
            <Grid item xs={3}><TextField fullWidth label="Battery %" type="number" value={form.batteryLevel} onChange={(e) => setForm({ ...form, batteryLevel: e.target.value })} /></Grid>
            <Grid item xs={3}><TextField fullWidth label="Signal %" type="number" value={form.signalStrength} onChange={(e) => setForm({ ...form, signalStrength: e.target.value })} /></Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave}>Save</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
