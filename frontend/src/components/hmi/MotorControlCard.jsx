import {
  Box, Button, Card, CardContent, Stack, Typography,
} from '@mui/material';
import { PlayArrow, Stop, PowerSettingsNew } from '@mui/icons-material';
import {
  equipmentMotorStatus, equipmentStatusColor, MOTOR_STATUS,
} from '../../data/swarmControl';

export default function MotorControlCard({
  equipment,
  plantPowered,
  zoneCircuitClosed,
  loading,
  onCommand,
  isDuty,
  isStandby,
}) {
  const status = equipmentMotorStatus(equipment);
  const statusMeta = MOTOR_STATUS.find((s) => s.id === status);
  const color = equipmentStatusColor(equipment);
  const canOperate = plantPowered && zoneCircuitClosed;
  const isSolenoid = equipment.equipmentKind === 'SOLENOID_VALVE';
  const startLabel = isSolenoid ? 'Open' : 'Start';
  const stopLabel = isSolenoid ? 'Close' : 'Stop';

  return (
    <Card
      variant="outlined"
      sx={{
        height: '100%',
        borderColor: equipment.running ? 'success.main' : 'divider',
        opacity: canOperate ? 1 : 0.65,
      }}
    >
      <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" sx={{ mb: 1 }}>
          <Box>
            <Typography variant="caption" color="text.secondary" fontWeight={700}>
              {equipment.tagNo}
            </Typography>
            <Typography variant="body2" fontWeight={600} lineHeight={1.2}>
              {equipment.name}
            </Typography>
          </Box>
          <Box
            title={statusMeta?.label}
            sx={{
              width: 22,
              height: 22,
              borderRadius: '50%',
              bgcolor: color,
              border: '2px solid rgba(0,0,0,0.2)',
              flexShrink: 0,
              boxShadow: status === 'RUNNING' ? `0 0 8px ${color}` : 'none',
            }}
          />
        </Stack>

        {equipment.motorHp != null && (
          <Typography variant="caption" color="text.secondary" display="block">
            {equipment.motorHp} HP
            {isDuty && ' · DUTY'}
            {isStandby && ' · STANDBY'}
          </Typography>
        )}

        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 1.5 }}>
          {!equipment.powered && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<PowerSettingsNew />}
              disabled={loading || !canOperate}
              onClick={() => onCommand(equipment.tagNo, 'POWER_ON')}
            >
              Power on
            </Button>
          )}
          {equipment.powered && !equipment.running && (
            <Button
              size="small"
              variant="contained"
              color="success"
              startIcon={<PlayArrow />}
              disabled={loading || !canOperate}
              onClick={() => onCommand(equipment.tagNo, 'START')}
            >
              {startLabel}
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
              {stopLabel}
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
              Off
            </Button>
          )}
        </Stack>

        {!plantPowered && (
          <Typography variant="caption" color="error" display="block" sx={{ mt: 1 }}>
            Master bus off
          </Typography>
        )}
        {plantPowered && !zoneCircuitClosed && (
          <Typography variant="caption" color="warning.main" display="block" sx={{ mt: 1 }}>
            Zone circuit open
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}
