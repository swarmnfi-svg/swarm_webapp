import { useState, useEffect } from 'react';
import {
  Box, Typography, Card, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem,
  Grid, Chip, IconButton, CircularProgress,
} from '@mui/material';
import { Add, Block, CheckCircle, Delete, Edit } from '@mui/icons-material';
import { userAPI, plantAPI } from '../services/api';

const ROLES = ['SUPER_ADMIN', 'PLANT_ADMIN', 'OPERATOR'];
const emptyForm = { name: '', email: '', mobile: '', password: '', role: 'OPERATOR', plantIds: [] };

export default function Users() {
  const [users, setUsers] = useState([]);
  const [plants, setPlants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const loadUsers = () => {
    userAPI.getAll().then(({ data }) => setUsers(data.data || [])).finally(() => setLoading(false));
  };

  useEffect(() => {
    loadUsers();
    plantAPI.getAll().then(({ data }) => setPlants(data.data || []));
  }, []);

  const handleSave = async () => {
    if (editId) await userAPI.update(editId, form);
    else await userAPI.create(form);
    setDialogOpen(false);
    loadUsers();
  };

  if (loading) return <CircularProgress />;

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>User Management</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={() => { setEditId(null); setForm(emptyForm); setDialogOpen(true); }}>
          Add User
        </Button>
      </Box>

      <Card>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell><TableCell>Email</TableCell><TableCell>Role</TableCell>
                <TableCell>Status</TableCell><TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>{u.name}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell><Chip label={u.role?.replace('_', ' ')} size="small" /></TableCell>
                  <TableCell><Chip label={u.status} size="small" color={u.status === 'ACTIVE' ? 'success' : 'default'} /></TableCell>
                  <TableCell>
                    <IconButton size="small" onClick={() => { setEditId(u.id); setForm({ ...u, password: '' }); setDialogOpen(true); }}><Edit /></IconButton>
                    {u.status === 'ACTIVE' ? (
                      <IconButton size="small" color="warning" onClick={() => userAPI.disable(u.id).then(loadUsers)}><Block /></IconButton>
                    ) : (
                      <IconButton size="small" color="success" onClick={() => userAPI.enable(u.id).then(loadUsers)}><CheckCircle /></IconButton>
                    )}
                    <IconButton size="small" color="error" onClick={() => userAPI.delete(u.id).then(loadUsers)}><Delete /></IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editId ? 'Edit User' : 'Add User'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}><TextField fullWidth label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Grid>
            <Grid item xs={12}><TextField fullWidth label="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Grid>
            <Grid item xs={12}><TextField fullWidth label="Mobile" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} /></Grid>
            <Grid item xs={12}><TextField fullWidth label="Password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} helperText={editId ? 'Leave blank to keep current' : ''} /></Grid>
            <Grid item xs={12}>
              <TextField fullWidth select label="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {ROLES.map((r) => <MenuItem key={r} value={r}>{r.replace('_', ' ')}</MenuItem>)}
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
