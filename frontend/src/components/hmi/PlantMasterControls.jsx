import { Box, Button, Chip, Stack, Typography, Alert } from '@mui/material';
import { PowerSettingsNew, PlayArrow, Stop, Bolt } from '@mui/icons-material';
import { useAuth } from '../../context/AuthContext';

export default function PlantMasterControls({
  state,
  loading,
  onMaster,
}) {
  const { canManagePlants } = useAuth();
  const powered = state?.plantPowered;
  const autoActive = state?.autoSequenceActive;

  return (
    <Box>
      <Alert severity="info" sx={{ mb: 2, py: 0 }}>
        Simulation mode — controls update demo state only (no real PLC).
      </Alert>
      <Stack direction="row" spacing={1} flexWrap="wrap" alignItems="center" useFlexGap>
        <Chip
          icon={<Bolt />}
          label={powered ? 'PLANT POWER ON' : 'PLANT POWER OFF'}
          color={powered ? 'success' : 'default'}
          variant={powered ? 'filled' : 'outlined'}
        />
        <Chip
          label={`Running: ${state?.runningCount ?? 0} / ${state?.controllableCount ?? 0}`}
          size="small"
          variant="outlined"
        />
        {autoActive && (
          <Chip label={`Auto sequence step ${state?.autoSequenceStep ?? 0}`} size="small" color="warning" />
        )}
        {canManagePlants && (
          <>
            <Button
              variant="contained"
              color="success"
              size="small"
              startIcon={<PowerSettingsNew />}
              disabled={loading || powered}
              onClick={() => onMaster('PLANT_POWER_ON')}
            >
              Power On
            </Button>
            <Button
              variant="outlined"
              color="error"
              size="small"
              startIcon={<Stop />}
              disabled={loading || !powered}
              onClick={() => onMaster('PLANT_POWER_OFF')}
            >
              Power Off
            </Button>
            <Button
              variant="contained"
              color="primary"
              size="small"
              startIcon={<PlayArrow />}
              disabled={loading || autoActive}
              onClick={() => onMaster('AUTO_SEQUENCE_START')}
            >
              Auto Sequence
            </Button>
            {autoActive && (
              <Button
                variant="outlined"
                size="small"
                disabled={loading}
                onClick={() => onMaster('AUTO_SEQUENCE_STOP')}
              >
                Stop Sequence
              </Button>
            )}
          </>
        )}
        {!canManagePlants && (
          <Typography variant="caption" color="text.secondary">
            View-only (operator). Plant Admin required for controls.
          </Typography>
        )}
      </Stack>
    </Box>
  );
}
