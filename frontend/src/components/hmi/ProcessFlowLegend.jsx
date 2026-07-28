import { Box, Typography } from '@mui/material';
import { HMI_ZONES, ZONE_COLORS } from '../../data/tataSteelEquipment';

export default function ProcessFlowLegend({ activeZone, onZoneChange }) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
      <Typography variant="caption" color="text.secondary" sx={{ mr: 1 }}>Zones:</Typography>
      {HMI_ZONES.map((z) => (
        <Box
          key={z.id}
          onClick={() => onZoneChange(z.id)}
          sx={{
            px: 1.5,
            py: 0.5,
            borderRadius: 2,
            cursor: 'pointer',
            fontSize: '0.75rem',
            fontWeight: activeZone === z.id ? 700 : 500,
            bgcolor: activeZone === z.id ? 'primary.main' : 'action.hover',
            color: activeZone === z.id ? 'white' : 'text.primary',
            border: '1px solid',
            borderColor: z.id !== 'ALL' && activeZone !== z.id ? ZONE_COLORS[z.id] : 'transparent',
          }}
        >
          {z.label}
        </Box>
      ))}
    </Box>
  );
}
