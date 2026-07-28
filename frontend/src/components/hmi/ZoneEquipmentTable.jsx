import {
  Box, Table, TableBody, TableCell, TableHead, TableRow, Typography,
} from '@mui/material';
import {
  equipmentMotorStatus, equipmentStatusColor, MOTOR_STATUS, filterEquipmentForPage,
} from '../../data/tataSteelEquipment';

export default function ZoneEquipmentTable({ equipment, activePage, onSelectTag, selectedTag }) {
  const items = filterEquipmentForPage(equipment, activePage);

  if (items.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No equipment on this page.
      </Typography>
    );
  }

  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Tag</TableCell>
            <TableCell>Equipment</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Live</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {items.map((eq) => {
            const motorStatus = MOTOR_STATUS.find((s) => s.id === equipmentMotorStatus(eq));
            const isMotor = eq.controllable;
            return (
              <TableRow
                key={eq.tagNo}
                hover
                selected={selectedTag === eq.tagNo}
                onClick={() => onSelectTag(eq.tagNo)}
                sx={{ cursor: 'pointer' }}
              >
                <TableCell sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{eq.tagNo}</TableCell>
                <TableCell>{eq.name}</TableCell>
                <TableCell>
                  {isMotor ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box
                        sx={{
                          width: 12,
                          height: 12,
                          borderRadius: '50%',
                          bgcolor: equipmentStatusColor(eq),
                          flexShrink: 0,
                        }}
                      />
                      <Typography variant="caption">{motorStatus?.label ?? 'Off'}</Typography>
                    </Box>
                  ) : (
                    <Typography variant="caption" color="text.secondary">
                      {eq.sensorValue != null ? 'Monitoring' : 'Tank / monitor'}
                    </Typography>
                  )}
                </TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  {eq.sensorValue != null
                    ? `${eq.sensorValue.toFixed(1)} ${eq.sensorUnit || ''}`
                    : '—'}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Box>
  );
}
