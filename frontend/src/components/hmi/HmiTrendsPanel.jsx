import { Box, Card, CardContent, Grid, Typography, Button } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { ShowChart } from '@mui/icons-material';

export default function HmiTrendsPanel({ equipment, plantId }) {
  const instruments = (equipment || []).filter((eq) => eq.sensorValue != null);

  const dailyTotals = [
    { label: 'Feed processed (est.)', value: '482', unit: 'kg' },
    { label: 'Biogas produced (est.)', value: '11.4', unit: 'm³/h' },
    { label: 'Treated water (est.)', value: '2.1', unit: 'm³' },
  ];

  return (
    <Box>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
        Per swarm-historian — live values and daily totals (demo estimates)
      </Typography>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {dailyTotals.map((t) => (
          <Grid item xs={12} sm={4} key={t.label}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="caption" color="text.secondary">{t.label}</Typography>
                <Typography variant="h5" fontWeight={700}>
                  {t.value}
                  <Typography component="span" variant="body2" color="text.secondary"> {t.unit}</Typography>
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Typography variant="subtitle2" fontWeight={700} gutterBottom>Live instruments</Typography>
      <Grid container spacing={1.5}>
        {instruments.map((eq) => (
          <Grid item xs={12} sm={6} md={4} key={eq.tagNo}>
            <Card variant="outlined">
              <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Typography variant="caption" color="text.secondary">{eq.tagNo} · {eq.sensorType}</Typography>
                <Typography variant="h6" fontWeight={700}>
                  {eq.sensorValue.toFixed(2)} {eq.sensorUnit}
                </Typography>
                <Typography variant="caption">{eq.sensorNodeName}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Button
        component={RouterLink}
        to={`/analytics?plantId=${plantId}`}
        startIcon={<ShowChart />}
        sx={{ mt: 2 }}
        variant="outlined"
      >
        Open full Analytics & trends
      </Button>
    </Box>
  );
}
