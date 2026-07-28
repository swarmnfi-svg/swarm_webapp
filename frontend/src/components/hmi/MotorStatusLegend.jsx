import { Box, Stack, Typography } from '@mui/material';
import { MOTOR_STATUS } from '../../data/swarmControl';

export default function MotorStatusLegend() {
  return (
    <Stack direction="row" spacing={2} flexWrap="wrap" alignItems="center" useFlexGap>
      <Typography variant="caption" color="text.secondary" fontWeight={600}>
        Motor status:
      </Typography>
      {MOTOR_STATUS.map((s) => (
        <Stack key={s.id} direction="row" spacing={0.75} alignItems="center">
          <Box
            sx={{
              width: 14,
              height: 14,
              borderRadius: '50%',
              bgcolor: s.color,
              border: '2px solid',
              borderColor: s.border,
            }}
          />
          <Typography variant="caption">{s.label}</Typography>
        </Stack>
      ))}
    </Stack>
  );
}
