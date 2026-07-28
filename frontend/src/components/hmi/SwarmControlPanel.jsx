import { Box, Chip, Stack, Typography } from '@mui/material';
import { getMotorsByZone, HMI_PAGES, SWARM_ZONES } from '../../data/swarmControl';
import { isMotorOrValve } from '../../data/pidRegistry';
import MotorControlCard from './MotorControlCard';

export default function SwarmControlPanel({
  equipment,
  plantPowered,
  zoneCircuits,
  loading,
  onCommand,
  canControl,
  activePage,
  dutyPump,
  onDutyChange,
}) {
  const page = HMI_PAGES.find((p) => p.id === activePage);
  const byZone = getMotorsByZone(
    (equipment || []).filter(isMotorOrValve),
    activePage === 'OVERVIEW' ? null : activePage,
  );

  const zonesToShow = activePage === 'OVERVIEW'
    ? SWARM_ZONES
    : SWARM_ZONES.filter((z) => z.id === page?.zoneId);

  return (
    <Box>
      <Typography variant="subtitle2" fontWeight={700} gutterBottom>
        Electric machines — manual control
      </Typography>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
        Green = running · Yellow = fault · Red = off. Commands routed to swarm-control on SWARM Core.
      </Typography>

      {activePage === 'DIGESTER' && (
        <Stack direction="row" spacing={1} sx={{ mb: 2 }} alignItems="center">
          <Typography variant="caption" fontWeight={700}>P-101 duty pump:</Typography>
          <Chip
            label="P-101A (duty)"
            size="small"
            color={dutyPump === 'P-101A' ? 'primary' : 'default'}
            onClick={() => canControl && onDutyChange('P-101A')}
            clickable={canControl}
          />
          <Chip
            label="P-101B (standby)"
            size="small"
            color={dutyPump === 'P-101B' ? 'primary' : 'default'}
            onClick={() => canControl && onDutyChange('P-101B')}
            clickable={canControl}
          />
        </Stack>
      )}

      {zonesToShow.map((zone) => {
        const motors = byZone[zone.id] || [];
        if (motors.length === 0) return null;
        const circuitClosed = zoneCircuits[zone.id];

        return (
          <Box key={zone.id} sx={{ mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <Box sx={{ width: 4, height: 20, bgcolor: zone.color, borderRadius: 1 }} />
              <Typography variant="subtitle2" fontWeight={700}>{zone.label}</Typography>
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 1.5 }}>
              {motors.map((eq) => (
                <MotorControlCard
                  key={eq.tagNo}
                  equipment={eq}
                  plantPowered={plantPowered}
                  zoneCircuitClosed={circuitClosed}
                  loading={loading}
                  onCommand={canControl ? onCommand : () => {}}
                  isDuty={eq.tagNo === dutyPump}
                  isStandby={eq.tagNo === 'P-101A' || eq.tagNo === 'P-101B' ? eq.tagNo !== dutyPump : false}
                />
              ))}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
