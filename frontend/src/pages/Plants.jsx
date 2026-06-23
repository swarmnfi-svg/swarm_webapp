import { useState, useEffect } from 'react';
import {
  Box, Typography, Button, Card, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, MenuItem, Grid, CircularProgress,
} from '@mui/material';
import { Add, Edit, Delete } from '@mui/icons-material';
import { plantAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { PLANT_TYPES, formatPlantType, getHealthColor } from '../utils/constants';

const emptyForm = { plantName: '', plantType: 'BIOGAS', location: '', capacity: '', feedstockType: '', installationDate: '', status: 'ACTIVE' };

export default function Plants() {
  const { isSuperAdmin } = useAuth();
  const [plants, setPlants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const loadPlants = () => {
    plantAPI.getAll().then(({ data }) => setPlants(data.data || [])).finally(() => setLoading(false));
  };

  useEffect(() => { loadPlants(); }, []);

  const handleSave = async () => {
    const payload = { ...form, capacity: parseFloat(form.capacity) || null };
    if (editId) await plantAPI.update(editId, payload);
    else await plantAPI.create(payload);
    setDialogOpen(false);
    setEditId(null);
    setForm(emptyForm);
    loadPlants();
  };

  const handleEdit = (plant) => {
    setEditId(plant.plantId);
    setForm({
      plantName: plant.plantName, plantType: plant.plantType, location: plant.location || '',
      capacity: plant.capacity || '', feedstockType: plant.feedstockType || '',
      installationDate: plant.installationDate || '', status: plant.status,
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Delete this plant?')) {
      await plantAPI.delete(id);
      loadPlants();
    }
  };

  if (loading) return <CircularProgress />;

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>Plant Management</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={() => { setEditId(null); setForm(emptyForm); setDialogOpen(true); }}>
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
                    <IconButton size="small" onClick={() => handleEdit(p)}><Edit /></IconButton>
                    {isSuperAdmin && <IconButton size="small" color="error" onClick={() => handleDelete(p.plantId)}><Delete /></IconButton>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editId ? 'Edit Plant' : 'Add Plant'}</DialogTitle>
        <DialogContent>
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
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave}>Save</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
