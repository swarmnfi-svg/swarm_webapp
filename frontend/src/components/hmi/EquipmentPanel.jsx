import {
  Box, Button, Card, CardContent, Chip, Divider, Stack, Typography,
} from '@mui/material';
import { PlayArrow, Stop, PowerSettingsNew } from '@mui/icons-material';
import { equipmentStatusColor, equipmentMotorStatus, MOTOR_STATUS } from '../../data/tataSteelEquipment';
import { useAuth } from '../../context/AuthContext';

export default function EquipmentPanel({ equipment, plantPowered, loading, onCommand }) {
  const { canManagePlants } = useAuth();

  if (!equipment) {
    return (
      <Card sx={{ height: '100%' }}>
        <CardContent>
          <Typography color="text.secondary">
            Click a colored motor indicator on the P&ID to view details and controls.
          </Typography>
        </CardContent>
      </Card>
    );
  }

  const statusColor = equipmentStatusColor(equipment);
  const motorStatus = MOTOR_STATUS.find((s) => s.id === equipmentMotorStatus(equipment));

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 1 }}>
          <Box>
            <Typography variant="overline" color="text.secondary">{equipment.tagNo}</Typography>
            <Typography variant="h6" fontWeight={700}>{equipment.name}</Typography>
          </Box>
          <Chip
            label={motorStatus?.label ?? 'Off'}
            size="small"
            sx={{ bgcolor: statusColor, color: motorStatus?.id === 'FAULT' ? '#1a1a1a' : 'white', fontWeight: 700 }}
          />
        </Stack>

        <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 2 }}>
          <Chip label={equipment.zone.replace(/_/g, ' ')} size="small" variant="outlined" />
          <Chip label={equipment.equipmentKind} size="small" variant="outlined" />
          {equipment.inAlarm && <Chip label="ALARM" size="small" color="error" />}
        </Stack>

        <Divider sx={{ my: 1.5 }} />

        <Typography variant="subtitle2" gutterBottom>Details</Typography>
        {equipment.capacity && (
          <Typography variant="body2" color="text.secondary">Capacity: {equipment.capacity}</Typography>
        )}
        {equipment.motorHp != null && (
          <Typography variant="body2" color="text.secondary">Motor: {equipment.motorHp} HP</Typography>
        )}
        <Typography variant="body2" color="text.secondary">Mode: {equipment.mode}</Typography>

        {equipment.sensorNodeName && (
          <>
            <Divider sx={{ my: 1.5 }} />
            <Typography variant="subtitle2" gutterBottom>Live Instrument</Typography>
            <Typography variant="body2">{equipment.sensorNodeName}</Typography>
            <Typography variant="h5" fontWeight={700} color="primary.main">
              {equipment.sensorValue != null ? equipment.sensorValue.toFixed(2) : '--'}
              {' '}
              <Typography component="span" variant="body2">{equipment.sensorUnit}</Typography>
            </Typography>
          </>
        )}

        {equipment.controllable && canManagePlants && (
          <>
            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2" gutterBottom>Controls (simulated)</Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {!equipment.powered && (
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<PowerSettingsNew />}
                  disabled={loading || !plantPowered}
                  onClick={() => onCommand(equipment.tagNo, 'POWER_ON')}
                >
                  Power On
                </Button>
              )}
              {equipment.powered && !equipment.running && (
                <Button
                  size="small"
                  variant="contained"
                  color="success"
                  startIcon={<PlayArrow />}
                  disabled={loading || !plantPowered}
                  onClick={() => onCommand(equipment.tagNo, 'START')}
                >
                  Start
                </Button>
              )}
              {equipment.running && (
                <Button
                  size="small"
                  variant="outlined"
                  color="warning"
                  startIcon={<Stop />}
                  disabled={loading}
                  onClick={() => onCommand(equipment.tagNo, 'STOP')}
                >
                  Stop
                </Button>
              )}
              {equipment.powered && (
                <Button
                  size="small"
                  variant="outlined"
                  color="error"
                  disabled={loading}
                  onClick={() => onCommand(equipment.tagNo, 'POWER_OFF')}
                >
                  Power Off
                </Button>
              )}
            </Stack>
            {!plantPowered && (
              <Typography variant="caption" color="error" display="block" sx={{ mt: 1 }}>
                Turn on plant power first.
              </Typography>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
