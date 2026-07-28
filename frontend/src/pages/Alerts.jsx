import { useState, useEffect } from 'react';
import {
  Box, Typography, Card, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Chip, Button, Tabs, Tab, CircularProgress, FormControl, InputLabel, Select, MenuItem,
} from '@mui/material';
import { CheckCircle, DoneAll } from '@mui/icons-material';
import { alertAPI, plantAPI } from '../services/api';
import { formatDate } from '../utils/constants';
import { pageTitleSx, responsiveSelect } from '../utils/responsive';

export default function Alerts() {
  const [plants, setPlants] = useState([]);
  const [selectedPlant, setSelectedPlant] = useState('');
  const [alerts, setAlerts] = useState([]);
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(true);

  const statuses = ['ACTIVE', 'ACKNOWLEDGED', 'RESOLVED'];

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
    });
  }, []);

  const loadAlerts = () => {
    if (!selectedPlant) return;
    setLoading(true);
    alertAPI.getAll({ plantId: selectedPlant, status: statuses[tab] })
      .then(({ data }) => setAlerts(data.data || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadAlerts(); }, [tab, selectedPlant]);

  const handleAcknowledge = async (id) => {
    await alertAPI.acknowledge(id);
    loadAlerts();
  };

  const handleResolve = async (id) => {
    await alertAPI.resolve(id);
    loadAlerts();
  };

  const severityColor = (s) => s === 'CRITICAL' ? 'error' : s === 'WARNING' ? 'warning' : 'info';

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 3, ...pageTitleSx }}>Alert Management</Typography>

      <FormControl sx={{ ...responsiveSelect, mb: 2 }} size="small">
        <InputLabel>Plant</InputLabel>
        <Select
          value={selectedPlant}
          label="Plant"
          onChange={(e) => setSelectedPlant(e.target.value)}
        >
          {plants.map((p) => (
            <MenuItem key={p.plantId} value={p.plantId}>{p.plantName}</MenuItem>
          ))}
        </Select>
      </FormControl>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Active" /><Tab label="Acknowledged" /><Tab label="Resolved" />
      </Tabs>

      <Card>
        {loading ? <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box> : (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Plant</TableCell><TableCell>Title</TableCell><TableCell>Message</TableCell>
                  <TableCell>Severity</TableCell><TableCell>Time</TableCell><TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {alerts.length === 0 ? (
                  <TableRow><TableCell colSpan={6} align="center">No alerts found</TableCell></TableRow>
                ) : alerts.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>{a.plantName}</TableCell>
                    <TableCell>{a.title}</TableCell>
                    <TableCell sx={{ maxWidth: 300 }}>{a.message}</TableCell>
                    <TableCell><Chip label={a.severity} size="small" color={severityColor(a.severity)} /></TableCell>
                    <TableCell>{formatDate(a.createdAt)}</TableCell>
                    <TableCell>
                      {a.status === 'ACTIVE' && (
                        <Button size="small" startIcon={<CheckCircle />} onClick={() => handleAcknowledge(a.id)}>Acknowledge</Button>
                      )}
                      {a.status !== 'RESOLVED' && (
                        <Button size="small" startIcon={<DoneAll />} onClick={() => handleResolve(a.id)}>Resolve</Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Card>
    </Box>
  );
}
