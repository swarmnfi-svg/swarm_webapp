import { useState, useEffect } from 'react';
import {
  Box, Typography, Card, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Grid, CircularProgress,
} from '@mui/material';
import { Add, Download } from '@mui/icons-material';
import { reportAPI, plantAPI } from '../services/api';
import { formatDate } from '../utils/constants';

const REPORT_TYPES = ['DAILY', 'WEEKLY', 'MONTHLY', 'PLANT_SUMMARY', 'GAS_PRODUCTION', 'ALERTS', 'PLANT_HEALTH'];
const FORMATS = ['PDF', 'EXCEL', 'CSV'];

export default function Reports() {
  const [reports, setReports] = useState([]);
  const [plants, setPlants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ plantId: '', reportType: 'DAILY', format: 'PDF' });

  const loadReports = () => {
    reportAPI.getAll().then(({ data }) => setReports(data.data || [])).finally(() => setLoading(false));
  };

  useEffect(() => {
    loadReports();
    plantAPI.getAll().then(({ data }) => setPlants(data.data || []));
  }, []);

  const handleGenerate = async () => {
    await reportAPI.generate({ ...form, plantId: form.plantId ? Number(form.plantId) : null });
    setDialogOpen(false);
    loadReports();
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'stretch', sm: 'center' }, flexWrap: 'wrap', gap: 2, mb: 3 }}>
        <Typography variant="h5" fontWeight={700} sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>Report Management</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={() => setDialogOpen(true)} sx={{ width: { xs: '100%', sm: 'auto' } }}>Generate Report</Button>
      </Box>

      <Card>
        {loading ? <CircularProgress /> : (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Title</TableCell><TableCell>Type</TableCell><TableCell>Format</TableCell>
                  <TableCell>Generated</TableCell><TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {reports.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.title}</TableCell>
                    <TableCell>{r.reportType}</TableCell>
                    <TableCell>{r.fileFormat}</TableCell>
                    <TableCell>{formatDate(r.createdAt)}</TableCell>
                    <TableCell>
                      <Button size="small" startIcon={<Download />}>Download</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Card>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Generate Report</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField fullWidth select label="Plant (optional)" value={form.plantId} onChange={(e) => setForm({ ...form, plantId: e.target.value })}>
                <MenuItem value="">All Plants</MenuItem>
                {plants.map((p) => <MenuItem key={p.plantId} value={p.plantId}>{p.plantName}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth select label="Report Type" value={form.reportType} onChange={(e) => setForm({ ...form, reportType: e.target.value })}>
                {REPORT_TYPES.map((t) => <MenuItem key={t} value={t}>{t.replace(/_/g, ' ')}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth select label="Format" value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value })}>
                {FORMATS.map((f) => <MenuItem key={f} value={f}>{f}</MenuItem>)}
              </TextField>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleGenerate}>Generate</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
