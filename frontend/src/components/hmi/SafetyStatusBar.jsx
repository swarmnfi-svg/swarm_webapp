import { Box, Chip, Stack, Typography } from '@mui/material';
import { Shield, Warning } from '@mui/icons-material';

export default function SafetyStatusBar({ state, plantPowered }) {
  const alarmCount = state?.alarmTags?.length ?? 0;
  const safetyOk = plantPowered && alarmCount === 0;

  return (
    <Stack direction="row" spacing={1} flexWrap="wrap" alignItems="center" useFlexGap>
      <Chip
        icon={<Shield />}
        size="small"
        label={safetyOk ? 'Safety chain: OK' : 'Safety chain: CHECK'}
        color={safetyOk ? 'success' : 'warning'}
        variant={safetyOk ? 'filled' : 'outlined'}
      />
      <Chip
        size="small"
        label={plantPowered ? 'Plant ESD: Normal' : 'Plant ESD: Power off'}
        color={plantPowered ? 'default' : 'error'}
        variant="outlined"
      />
      {alarmCount > 0 && (
        <Chip
          icon={<Warning />}
          size="small"
          label={`${alarmCount} active alarm${alarmCount > 1 ? 's' : ''}`}
          color="error"
        />
      )}
      <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto !important' }}>
        Manual restart required after ESD — per emergency philosophy
      </Typography>
    </Stack>
  );
}
