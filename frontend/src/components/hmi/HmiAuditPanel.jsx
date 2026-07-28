import {
  Box, Chip, Table, TableBody, TableCell, TableHead, TableRow, TableContainer, Typography,
} from '@mui/material';
import { loadAuditLog } from '../../data/swarmControl';
import { formatDate } from '../../utils/constants';

const ROLE_LABELS = {
  SUPER_ADMIN: 'Engineer',
  PLANT_ADMIN: 'Supervisor',
  OPERATOR: 'Operator',
};

export default function HmiAuditPanel({ plantId, user }) {
  const audit = loadAuditLog(plantId);
  const roleLabel = ROLE_LABELS[user?.role] || user?.role || '—';

  return (
    <Box>
      <Box sx={{ mb: 2, p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
        <Typography variant="subtitle2" fontWeight={700}>Current session</Typography>
        <Typography variant="body2">{user?.name} ({user?.email})</Typography>
        <Chip label={`Role: ${roleLabel}`} size="small" sx={{ mt: 0.5 }} />
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
          Operator — view and acknowledge · Supervisor — motor commands · Engineer — configuration
        </Typography>
      </Box>

      <Typography variant="subtitle2" fontWeight={700} gutterBottom>Command audit log (this session)</Typography>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
        Commands sent to swarm-control via HMI (stored locally for demo)
      </Typography>

      {audit.length === 0 ? (
        <Typography color="text.secondary">No commands recorded yet.</Typography>
      ) : (
        <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Time</TableCell>
              <TableCell>User</TableCell>
              <TableCell>Action</TableCell>
              <TableCell>Target</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {audit.map((e, i) => (
              <TableRow key={`${e.at}-${i}`}>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(e.at)}</TableCell>
                <TableCell>{e.user}</TableCell>
                <TableCell>{e.action}</TableCell>
                <TableCell>{e.target || '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </TableContainer>
      )}
    </Box>
  );
}
