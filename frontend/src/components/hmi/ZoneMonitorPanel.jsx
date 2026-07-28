import { Box, Card, CardContent, Grid, Typography } from '@mui/material';
import { getMonitorsForPage } from '../../data/swarmControl';

export default function ZoneMonitorPanel({ equipment, pageId }) {
  const monitors = getMonitorsForPage(equipment, pageId);

  if (monitors.length === 0) return null;

  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="subtitle2" fontWeight={700} gutterBottom>
        Levels & instruments
      </Typography>
      <Grid container spacing={1.5}>
        {monitors.map((eq) => (
          <Grid item xs={12} sm={6} md={4} key={eq.tagNo}>
            <Card variant="outlined">
              <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Typography variant="caption" color="text.secondary" fontWeight={700}>
                  {eq.tagNo}
                </Typography>
                <Typography variant="body2" fontWeight={600}>{eq.name}</Typography>
                {eq.capacity && (
                  <Typography variant="caption" color="text.secondary">{eq.capacity}</Typography>
                )}
                <Typography variant="h5" fontWeight={700} color="primary.main" sx={{ mt: 0.5 }}>
                  {eq.sensorValue != null ? eq.sensorValue.toFixed(2) : '—'}
                  <Typography component="span" variant="body2" color="text.secondary">
                    {' '}{eq.sensorUnit || ''}
                  </Typography>
                </Typography>
                {eq.sensorNodeName && (
                  <Typography variant="caption" color="text.secondary">{eq.sensorNodeName}</Typography>
                )}
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
