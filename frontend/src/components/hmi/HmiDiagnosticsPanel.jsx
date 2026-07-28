import {
  Box, Chip, Table, TableBody, TableCell, TableHead, TableRow, TableContainer, Typography,
} from '@mui/material';
import { equipmentMotorStatus } from '../../data/swarmControl';

export default function HmiDiagnosticsPanel({ equipment, state }) {
  const motors = (equipment || []).filter((eq) => eq.controllable);
  const ioChannels = 64 + 24 + 16; // per PDF section 7

  const rows = motors.map((eq) => ({
    tag: eq.tagNo,
    name: eq.name,
    comm: 'OK',
    ioQuality: eq.inAlarm ? 'BAD' : 'GOOD',
    runtime: eq.running ? 'Active' : '—',
    starts: '—',
    fault: equipmentMotorStatus(eq) === 'FAULT' ? 'YES' : 'NO',
  }));

  return (
    <Box>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
        Per swarm-io — I/O quality, communication and device fault status (Release 1 demo)
      </Typography>

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
        <Chip label={`I/O rack: ${ioChannels} channels`} size="small" variant="outlined" />
        <Chip label="EtherCAT bus: OK" size="small" color="success" variant="outlined" />
        <Chip label={`SWARM Core: ${state?.plantPowered ? 'Output enable ON' : 'Output enable OFF'}`} size="small" variant="outlined" />
        <Chip label="swarm-connect: idle (read-only)" size="small" variant="outlined" />
      </Box>

      <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Tag</TableCell>
            <TableCell>Equipment</TableCell>
            <TableCell>Comm</TableCell>
            <TableCell>I/O quality</TableCell>
            <TableCell>Run status</TableCell>
            <TableCell>Fault</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.tag}>
              <TableCell sx={{ fontWeight: 700 }}>{r.tag}</TableCell>
              <TableCell>{r.name}</TableCell>
              <TableCell>{r.comm}</TableCell>
              <TableCell>
                <Chip label={r.ioQuality} size="small" color={r.ioQuality === 'GOOD' ? 'success' : 'error'} />
              </TableCell>
              <TableCell>{r.runtime}</TableCell>
              <TableCell>{r.fault}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      </TableContainer>
    </Box>
  );
}
