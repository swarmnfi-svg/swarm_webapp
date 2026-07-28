import { Box, Button, Grid, Typography } from '@mui/material';
import { SWARM_ZONES } from '../../data/swarmControl';

export default function ZoneCircuitPanel({ zoneCircuits, onToggleZone, plantPowered, canControl }) {
  return (
    <Box>
      <Typography variant="subtitle2" fontWeight={700} gutterBottom>
        Zone circuits (SWARM output permits)
      </Typography>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
        Each circuit must be closed before motors in that section can be powered.
      </Typography>
      <Grid container spacing={1.5}>
        {SWARM_ZONES.map((zone) => {
          const closed = zoneCircuits[zone.id];
          const active = plantPowered && closed;
          return (
            <Grid item xs={12} sm={6} md={3} key={zone.id}>
              <Box
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  border: '2px solid',
                  borderColor: active ? zone.color : 'divider',
                  bgcolor: active ? `${zone.color}14` : 'action.hover',
                  opacity: plantPowered ? 1 : 0.55,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <Box
                    sx={{
                      width: 14,
                      height: 14,
                      borderRadius: '50%',
                      bgcolor: active ? '#4caf50' : '#f44336',
                      boxShadow: active ? '0 0 6px #4caf50' : 'none',
                    }}
                  />
                  <Typography variant="caption" fontWeight={700}>{zone.label}</Typography>
                </Box>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                  {closed ? 'Circuit closed' : 'Circuit open'}
                </Typography>
                {canControl && (
                  <Button
                    fullWidth
                    size="small"
                    variant={closed ? 'outlined' : 'contained'}
                    color={closed ? 'warning' : 'success'}
                    disabled={!plantPowered}
                    onClick={() => onToggleZone(zone.id)}
                  >
                    {closed ? 'Open circuit' : 'Close circuit'}
                  </Button>
                )}
              </Box>
            </Grid>
          );
        })}
      </Grid>
    </Box>
  );
}
