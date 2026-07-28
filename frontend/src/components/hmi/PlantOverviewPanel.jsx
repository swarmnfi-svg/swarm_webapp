import {
  Box, Card, CardContent, Chip, Grid, Stack, Typography,
} from '@mui/material';
import { Shield, Warning, CheckCircle } from '@mui/icons-material';
import {
  MOTOR_STATUS, SAFETY_LEVELS, PROCESS_FLOW_STEPS, equipmentMotorStatus,
} from '../../data/swarmControl';

export default function PlantOverviewPanel({ state, flowStep, autoActive }) {
  const equipment = state?.equipment || [];
  const motors = equipment.filter((eq) => eq.controllable);
  const running = motors.filter((eq) => eq.running).length;
  const fault = motors.filter((eq) => equipmentMotorStatus(eq) === 'FAULT').length;
  const off = motors.length - running - fault;

  return (
    <Grid container spacing={2}>
      <Grid item xs={12} sm={6} md={4}>
        <Card variant="outlined" sx={{ height: '100%' }}>
          <CardContent>
            <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 1 }}>
              <Shield color="success" />
              <Typography variant="subtitle2" fontWeight={700}>Safety chain</Typography>
            </Stack>
            {SAFETY_LEVELS.map((s) => (
              <Stack key={s.level} direction="row" justifyContent="space-between" sx={{ py: 0.5 }}>
                <Typography variant="caption">L{s.level} — {s.label}</Typography>
                <CheckCircle sx={{ fontSize: 16, color: 'success.main' }} />
              </Stack>
            ))}
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              Hardwired E-stop and gas trips independent of SWARM Core
            </Typography>
          </CardContent>
        </Card>
      </Grid>

      <Grid item xs={12} sm={6} md={4}>
        <Card variant="outlined" sx={{ height: '100%' }}>
          <CardContent>
            <Typography variant="subtitle2" fontWeight={700} gutterBottom>Equipment status</Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip label={`Running: ${running}`} size="small" sx={{ bgcolor: MOTOR_STATUS[0].color, color: 'white' }} />
              <Chip label={`Fault: ${fault}`} size="small" sx={{ bgcolor: MOTOR_STATUS[1].color, color: '#1a1a1a' }} />
              <Chip label={`Off: ${off}`} size="small" sx={{ bgcolor: MOTOR_STATUS[2].color, color: 'white' }} />
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: 'block' }}>
              Master bus: {state?.plantPowered ? 'ENERGIZED' : 'DE-ENERGIZED'}
            </Typography>
          </CardContent>
        </Card>
      </Grid>

      <Grid item xs={12} sm={6} md={4}>
        <Card variant="outlined" sx={{ height: '100%' }}>
          <CardContent>
            <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 1 }}>
              <Warning color={state?.alarmTags?.length ? 'error' : 'disabled'} />
              <Typography variant="subtitle2" fontWeight={700}>Active alarms</Typography>
            </Stack>
            {state?.alarmTags?.length > 0 ? (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {state.alarmTags.map((t) => (
                  <Chip key={t} label={t} size="small" color="error" />
                ))}
              </Box>
            ) : (
              <Typography variant="body2" color="success.main">No active alarms</Typography>
            )}
          </CardContent>
        </Card>
      </Grid>

      <Grid item xs={12}>
        <Card variant="outlined">
          <CardContent>
            <Typography variant="subtitle2" fontWeight={700} gutterBottom>Process flow</Typography>
            <Typography variant="body2" color="text.secondary">
              {autoActive
                ? PROCESS_FLOW_STEPS[flowStep]
                : 'Feed → pretreatment → digester → gas handling → slurry/ETP (per P&ID BPG-10-PR-GD-002)'}
            </Typography>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
}
