import { useState, useEffect } from 'react';
import {
  Box, Typography, Card, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Chip, LinearProgress, FormControl, InputLabel, Select, MenuItem, CircularProgress,
} from '@mui/material';
import { plantAPI, maintenanceAPI } from '../services/api';
import { formatDate } from '../utils/constants';
import { pageHeaderRow, pageTitleSx, responsiveSelect } from '../utils/responsive';

export default function Maintenance() {
  const [plants, setPlants] = useState([]);
  const [selectedPlant, setSelectedPlant] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    plantAPI.getAll().then(({ data }) => {
      const list = data.data || [];
      setPlants(list);
      if (list.length > 0) setSelectedPlant(list[0].plantId);
    });
  }, []);

  useEffect(() => {
    if (!selectedPlant) return;
    setLoading(true);
    maintenanceAPI.getByPlant(selectedPlant)
      .then(({ data }) => setItems(data.data || []))
      .finally(() => setLoading(false));
  }, [selectedPlant]);

  const healthColor = (pct) => pct > 70 ? 'success' : pct > 40 ? 'warning' : 'error';

  return (
    <Box>
      <Box sx={pageHeaderRow}>
        <Typography variant="h5" sx={pageTitleSx}>Predictive Maintenance</Typography>
        <FormControl size="small" sx={responsiveSelect}>
          <InputLabel>Plant</InputLabel>
          <Select value={selectedPlant} label="Plant" onChange={(e) => setSelectedPlant(e.target.value)}>
            {plants.map((p) => <MenuItem key={p.plantId} value={p.plantId}>{p.plantName}</MenuItem>)}
          </Select>
        </FormControl>
      </Box>

      <Card>
        {loading ? <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box> : (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Equipment</TableCell><TableCell>Type</TableCell>
                  <TableCell>Remaining Life (days)</TableCell><TableCell>Est. Failure Date</TableCell>
                  <TableCell>Health</TableCell><TableCell>Notes</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.equipmentName}</TableCell>
                    <TableCell><Chip label={item.equipmentType} size="small" /></TableCell>
                    <TableCell>{item.remainingUsefulLifeDays}</TableCell>
                    <TableCell>{item.estimatedFailureDate}</TableCell>
                    <TableCell sx={{ minWidth: 150 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <LinearProgress variant="determinate" value={item.healthPercentage || 0}
                          color={healthColor(item.healthPercentage)} sx={{ flexGrow: 1, height: 8, borderRadius: 4 }} />
                        <Typography variant="caption">{(item.healthPercentage || 0).toFixed(0)}%</Typography>
                      </Box>
                    </TableCell>
                    <TableCell sx={{ maxWidth: 250 }}>{item.notes}</TableCell>
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
