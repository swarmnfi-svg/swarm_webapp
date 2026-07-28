import { Box, Card, CardContent, Grid, Typography } from '@mui/material';
import { groupInstruments, isaSymbol, INSTRUMENT_GROUPS } from '../../data/pidRegistry';

function InstrumentCard({ eq }) {
  const sym = isaSymbol(eq);
  const displayValue = eq.sensorValue != null
    ? `${eq.sensorValue.toFixed(sym === 'AIT' && eq.sensorValue < 100 ? 1 : 2)} ${eq.sensorUnit || ''}`
    : sym === 'LS' ? 'NORMAL' : '—';

  return (
    <Card variant="outlined" sx={{ borderColor: eq.inAlarm ? 'error.main' : 'divider' }}>
      <CardContent sx={{ py: 1.25, '&:last-child': { pb: 1.25 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          <Box
            sx={{
              px: 0.75,
              py: 0.25,
              borderRadius: 0.5,
              bgcolor: 'primary.dark',
              color: 'white',
              fontSize: '0.65rem',
              fontWeight: 800,
              minWidth: 28,
              textAlign: 'center',
            }}
          >
            {sym}
          </Box>
          <Typography variant="caption" fontWeight={700}>{eq.tagNo}</Typography>
        </Box>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ lineHeight: 1.2 }}>
          {eq.name}
        </Typography>
        <Typography variant="body1" fontWeight={700} color={eq.inAlarm ? 'error.main' : 'primary.main'} sx={{ mt: 0.5 }}>
          {displayValue}
        </Typography>
      </CardContent>
    </Card>
  );
}

export default function InstrumentationPanel({ equipment, title }) {
  const grouped = groupInstruments(equipment);

  return (
    <Box>
      <Typography variant="subtitle2" fontWeight={700} gutterBottom>
        {title || 'P&ID instruments (4–20 mA / switches)'}
      </Typography>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
        TT · FIT · PIT · LIT · LS · AIT · PDT · PSV per P&ID BPG-10-PR-GD-002
      </Typography>

      {Object.entries(grouped).map(([groupId, items]) => {
        if (!items.length) return null;
        const groupLabel = INSTRUMENT_GROUPS.find((g) => g.id === groupId)?.label || groupId;
        return (
          <Box key={groupId} sx={{ mb: 2 }}>
            <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ mb: 1, display: 'block' }}>
              {groupLabel}
            </Typography>
            <Grid container spacing={1}>
              {items.map((eq) => (
                <Grid item xs={6} sm={4} md={3} key={eq.tagNo}>
                  <InstrumentCard eq={eq} />
                </Grid>
              ))}
            </Grid>
          </Box>
        );
      })}
    </Box>
  );
}
