import { useEffect, useState } from 'react';
import {
  Box, Button, Chip, CircularProgress, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Typography,
} from '@mui/material';
import { CheckCircle, DoneAll } from '@mui/icons-material';
import { alertAPI } from '../../services/api';
import { formatDate } from '../../utils/constants';

export default function HmiAlarmSummary({ plantId }) {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    if (!plantId) return;
    setLoading(true);
    alertAPI.getAll({ plantId })
      .then(({ data }) => setAlerts((data.data || []).slice(0, 20)))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [plantId]);

  const severityColor = (s) => (s === 'CRITICAL' ? 'error' : s === 'WARNING' ? 'warning' : 'info');

  if (loading) return <CircularProgress size={28} />;

  return (
    <Box>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
        Per swarm-alarm — priority, acknowledgement and reset status
      </Typography>
      {alerts.length === 0 ? (
        <Typography color="text.secondary">No alarms for this plant.</Typography>
      ) : (
        <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Priority</TableCell>
              <TableCell>Message</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Time</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {alerts.map((a) => (
              <TableRow key={a.alertId}>
                <TableCell>
                  <Chip label={a.severity} size="small" color={severityColor(a.severity)} />
                </TableCell>
                <TableCell>{a.message}</TableCell>
                <TableCell>{a.status}</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(a.createdAt)}</TableCell>
                <TableCell align="right">
                  {a.status === 'ACTIVE' && (
                    <Button size="small" startIcon={<CheckCircle />} onClick={() => alertAPI.acknowledge(a.alertId).then(load)}>
                      Ack
                    </Button>
                  )}
                  {a.status === 'ACKNOWLEDGED' && (
                    <Button size="small" startIcon={<DoneAll />} onClick={() => alertAPI.resolve(a.alertId).then(load)}>
                      Reset
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </TableContainer>
      )}
    </Box>
  );
}
