import { useState, useEffect } from 'react';
import {
  Box, Typography, Button, Card, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, MenuItem, Grid, CircularProgress, Divider, Alert,
} from '@mui/material';
import { Add, Edit, Delete } from '@mui/icons-material';
import { plantAPI, sensorAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { PLANT_TYPES, formatPlantType, getHealthColor, SENSOR_LABELS } from '../utils/constants';

const emptyForm = { plantName: '', plantType: 'BIOGAS', location: '', capacity: '', feedstockType: '', installationDate: '', status: 'ACTIVE' };
const emptySensorForm = { plantId: '', nodeName: '', sensorType: 'TEMPERATURE', firmwareVersion: 'v2.1.0', batteryLevel: 100, signalStrength: 90, status: 'ACTIVE' };

export default function Plants() {
  const { isSuperAdmin } = useAuth();
  const [plants, setPlants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [plantSensors, setPlantSensors] = useState([]);
  const [sensorDialogOpen, setSensorDialogOpen] = useState(false);
  const [sensorEditId, setSensorEditId] = useState(null);
  const [sensorForm, setSensorForm] = useState(emptySensorForm);
  const [error, setError] = useState('');

  const loadPlants = () => {
    plantAPI.getAll().then(({ data }) => setPlants(data.data || [])).finally(() => setLoading(false));
  };

  const loadPlantSensors = async (plantId) => {
    if (!plantId) {
      setPlantSensors([]);
      return;
    }
    const { data } = await sensorAPI.getByPlant(plantId);
    setPlantSensors(data.data || []);
  };

  useEffect(() => { loadPlants(); }, []);

  const handleSave = async () => {
    setError('');
    try {
      const payload = { ...form, capacity: parseFloat(form.capacity) || null };
      if (editId) await plantAPI.update(editId, payload);
      else await plantAPI.create(payload);
      setDialogOpen(false);
      setEditId(null);
      setForm(emptyForm);
      setPlantSensors([]);
      loadPlants();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save plant');
    }
  };

  const handleEdit = async (plant) => {
    setEditId(plant.plantId);
    setForm({
      plantName: plant.plantName,
      plantType: plant.plantType,
      location: plant.location || '',
      capacity: plant.capacity || '',
      feedstockType: plant.feedstockType || '',
      installationDate: plant.installationDate || '',
      status: plant.status,
    });
    setError('');
    setDialogOpen(true);
    await loadPlantSensors(plant.plantId);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Delete this plant?')) {
      await plantAPI.delete(id);
      loadPlants();
    }
  };

  const openSensorEdit = (sensor) => {
    setSensorEditId(sensor.nodeId);
    setSensorForm({
      plantId: sensor.plantId,
      nodeName: sensor.nodeName,
      sensorType: sensor.sensorType,
      firmwareVersion: sensor.firmwareVersion || '',
      batteryLevel: sensor.batteryLevel ?? 100,
      signalStrength: sensor.signalStrength ?? 90,
      status: sensor.status || 'ACTIVE',
    });
    setSensorDialogOpen(true);
  };

  const openSensorCreate = () => {
    setSensorEditId(null);
    setSensorForm({ ...emptySensorForm, plantId: editId });
    setSensorDialogOpen(true);
  };

  const handleSensorSave = async () => {
    const payload = {
      ...sensorForm,
      plantId: Number(sensorForm.plantId),
      batteryLevel: Number(sensorForm.batteryLevel),
      signalStrength: Number(sensorForm.signalStrength),
    };
    if (sensorEditId) await sensorAPI.update(sensorEditId, payload);
    else await sensorAPI.create(payload);
    setSensorDialogOpen(false);
    await loadPlantSensors(editId);
  };

  if (loading) return <CircularProgress />;

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>Plant Management</Typography>
          <Typography variant="body2" color="text.secondary">
            Edit plant details and manage sensors installed at each site.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<Add />} onClick={() => { setEditId(null); setForm(emptyForm); setPlantSensors([]); setDialogOpen(true); }}>
          Add Plant
        </Button>
      </Box>

      <Card>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell><TableCell>Type</TableCell><TableCell>Location</TableCell>
                <TableCell>Capacity</TableCell><TableCell>Health</TableCell><TableCell>Status</TableCell><TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {plants.map((p) => (
                <TableRow key={p.plantId}>
                  <TableCell>{p.plantName}</TableCell>
                  <TableCell>{formatPlantType(p.plantType)}</TableCell>
                  <TableCell>{p.location}</TableCell>
                  <TableCell>{p.capacity} m³</TableCell>
                  <TableCell>
                    <Chip label={`${p.healthScore || 0} - ${p.healthStatus || 'N/A'}`}
                      size="small" sx={{ bgcolor: getHealthColor(p.healthStatus), color: 'white' }} />
                  </TableCell>
                  <TableCell><Chip label={p.status} size="small" color={p.status === 'ACTIVE' ? 'success' : 'default'} /></TableCell>
                  <TableCell>
                    <IconButton size="small" onClick={() => handleEdit(p)} title="Edit plant & sensors"><Edit /></IconButton>
                    {isSuperAdmin && <IconButton size="small" color="error" onClick={() => handleDelete(p.plantId)}><Delete /></IconButton>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{editId ? 'Edit Plant' : 'Add Plant'}</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}><TextField fullWidth label="Plant Name" value={form.plantName} onChange={(e) => setForm({ ...form, plantName: e.target.value })} /></Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth select label="Plant Type" value={form.plantType} onChange={(e) => setForm({ ...form, plantType: e.target.value })}>
                {PLANT_TYPES.map((t) => <MenuItem key={t} value={t}>{formatPlantType(t)}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6}><TextField fullWidth label="Capacity (m³)" type="number" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} /></Grid>
            <Grid item xs={12}><TextField fullWidth label="Location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></Grid>
            <Grid item xs={12}><TextField fullWidth label="Feedstock Type" value={form.feedstockType} onChange={(e) => setForm({ ...form, feedstockType: e.target.value })} /></Grid>
            <Grid item xs={12} sm={6}><TextField fullWidth label="Installation Date" type="date" InputLabelProps={{ shrink: true }} value={form.installationDate} onChange={(e) => setForm({ ...form, installationDate: e.target.value })} /></Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth select label="Status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'OFFLINE'].map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
              </TextField>
            </Grid>
          </Grid>

          {editId && (
            <Box sx={{ mt: 3 }}>
              <Divider sx={{ mb: 2 }} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="subtitle1" fontWeight={600}>Sensors at this plant</Typography>
                <Button size="small" startIcon={<Add />} onClick={openSensorCreate}>Add Sensor</Button>
              </Box>
              {plantSensors.length === 0 ? (
                <Typography variant="body2" color="text.secondary">No sensors registered for this plant yet.</Typography>
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Name</TableCell>
                      <TableCell>Type</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {plantSensors.map((s) => (
                      <TableRow key={s.nodeId}>
                        <TableCell>{s.nodeName}</TableCell>
                        <TableCell>{SENSOR_LABELS[s.sensorType] || s.sensorType}</TableCell>
                        <TableCell>
                          <Chip label={s.status} size="small" color={s.status === 'ACTIVE' ? 'success' : 'default'} />
                        </TableCell>
                        <TableCell align="right">
                          <IconButton size="small" onClick={() => openSensorEdit(s)}><Edit /></IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave}>Save Plant</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={sensorDialogOpen} onClose={() => setSensorDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{sensorEditId ? 'Edit Sensor' : 'Add Sensor'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}><TextField fullWidth label="Node Name" value={sensorForm.nodeName} onChange={(e) => setSensorForm({ ...sensorForm, nodeName: e.target.value })} /></Grid>
            <Grid item xs={12}>
              <TextField fullWidth select label="Sensor Type" value={sensorForm.sensorType} onChange={(e) => setSensorForm({ ...sensorForm, sensorType: e.target.value })}>
                {Object.keys(SENSOR_LABELS).map((t) => <MenuItem key={t} value={t}>{SENSOR_LABELS[t]}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={4}><TextField fullWidth label="Firmware" value={sensorForm.firmwareVersion} onChange={(e) => setSensorForm({ ...sensorForm, firmwareVersion: e.target.value })} /></Grid>
            <Grid item xs={6} sm={4}><TextField fullWidth label="Battery %" type="number" value={sensorForm.batteryLevel} onChange={(e) => setSensorForm({ ...sensorForm, batteryLevel: e.target.value })} /></Grid>
            <Grid item xs={6} sm={4}><TextField fullWidth label="Signal %" type="number" value={sensorForm.signalStrength} onChange={(e) => setSensorForm({ ...sensorForm, signalStrength: e.target.value })} /></Grid>
            <Grid item xs={12}>
              <TextField fullWidth select label="Status" value={sensorForm.status} onChange={(e) => setSensorForm({ ...sensorForm, status: e.target.value })}>
                {['ACTIVE', 'INACTIVE', 'OFFLINE'].map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
              </TextField>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSensorDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSensorSave}>Save Sensor</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
