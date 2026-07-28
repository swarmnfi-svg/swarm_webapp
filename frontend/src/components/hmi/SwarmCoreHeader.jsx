import { Box, Chip, Grid, Stack, Typography } from '@mui/material';
import { Sensors, Circle } from '@mui/icons-material';
import { SWARM_PLATFORM } from '../../data/swarmControl';

export default function SwarmCoreHeader({ simulationMode, plantPowered }) {
  return (
    <Box
      sx={{
        p: 2,
        borderRadius: 2,
        bgcolor: '#0d1b2a',
        color: 'white',
        border: '1px solid',
        borderColor: plantPowered ? 'success.main' : 'grey.700',
      }}
    >
      <Stack direction="row" flexWrap="wrap" alignItems="flex-start" gap={{ xs: 1, sm: 2 }}>
        <Stack direction="row" alignItems="center" gap={1} sx={{ minWidth: 0, flex: { md: 1 } }}>
          <Sensors sx={{ color: '#4fc3f7', fontSize: { xs: 28, sm: 32 } }} />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h6" fontWeight={700} sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}>
              {SWARM_PLATFORM.name}
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.9 }}>
              {SWARM_PLATFORM.tagline}
            </Typography>
            <Typography variant="caption" sx={{ opacity: 0.65 }}>
              {SWARM_PLATFORM.subtitle} · {SWARM_PLATFORM.document}
            </Typography>
          </Box>
        </Stack>
        <Chip
          icon={<Circle sx={{ fontSize: '10px !important', color: '#4caf50 !important' }} />}
          label="SWARM Core online"
          size="small"
          sx={{ bgcolor: 'rgba(76,175,80,0.15)', color: '#a5d6a7' }}
        />
        <Chip
          label={simulationMode ? 'Demo / simulation mode' : 'Live I/O'}
          size="small"
          variant="outlined"
          sx={{ borderColor: '#ffb74d', color: '#ffe0b2' }}
        />
      </Stack>

      <Typography variant="caption" sx={{ display: 'block', mt: 1.5, opacity: 0.7 }}>
        {SWARM_PLATFORM.hmiNote}
      </Typography>

      <Grid container spacing={0.75} sx={{ mt: 1.5 }}>
        {SWARM_PLATFORM.modules.map((m) => (
          <Grid item xs={6} sm={4} md="auto" key={m.id}>
            <Chip
              label={m.label}
              size="small"
              title={m.desc}
              sx={{ bgcolor: 'rgba(255,255,255,0.08)', color: '#b0bec5', fontSize: '0.7rem' }}
            />
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
