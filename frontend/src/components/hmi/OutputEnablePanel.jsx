import { Box, Button, Stack, Typography } from '@mui/material';
import { PowerSettingsNew, Stop } from '@mui/icons-material';
import { useAuth } from '../../context/AuthContext';

export default function OutputEnablePanel({ plantPowered, loading, onMaster }) {
  const { canManagePlants } = useAuth();

  return (
    <Box
      sx={{
        p: 2,
        borderRadius: 2,
        border: '2px solid',
        borderColor: plantPowered ? 'success.main' : 'error.main',
        bgcolor: plantPowered ? 'success.50' : 'error.50',
      }}
    >
      <Typography variant="overline" color="text.secondary">Master output enable relay</Typography>
      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={2}>
        <Box>
          <Typography variant="h6" fontWeight={700}>
            Plant electrical bus: {plantPowered ? 'ENERGIZED' : 'DE-ENERGIZED'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Master output enable — all motor start permits blocked when de-energized.
            Commands are sent to swarm-control; logic is not executed in the browser.
          </Typography>
        </Box>
        {canManagePlants && (
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1}
            sx={{ width: { xs: '100%', sm: 'auto' } }}
          >
            <Button
              variant="contained"
              color="success"
              size="large"
              fullWidth
              sx={{ width: { sm: 'auto' } }}
              startIcon={<PowerSettingsNew />}
              disabled={loading || plantPowered}
              onClick={() => onMaster('PLANT_POWER_ON')}
            >
              Energize bus
            </Button>
            <Button
              variant="contained"
              color="error"
              size="large"
              fullWidth
              sx={{ width: { sm: 'auto' } }}
              startIcon={<Stop />}
              disabled={loading || !plantPowered}
              onClick={() => onMaster('PLANT_POWER_OFF')}
            >
              De-energize bus
            </Button>
          </Stack>
        )}
      </Stack>
    </Box>
  );
}
