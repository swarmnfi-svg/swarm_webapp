import { useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, Grid, Chip, FormControl, InputLabel,
  Select, MenuItem, LinearProgress, Button, CircularProgress,
} from '@mui/material';
import { Psychology } from '@mui/icons-material';
import { plantAPI, aiAPI } from '../services/api';
import { getHealthColor } from '../utils/constants';
import { pageHeaderRow, pageTitleSx, responsiveSelect } from '../utils/responsive';

export default function AIRecommendations() {
  const [plants, setPlants] = useState([]);
  const [selectedPlant, setSelectedPlant] = useState('');
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    plantAPI.getAll().then(({ data }) => {
      const list = data.data || [];
      setPlants(list);
      if (list.length > 0) setSelectedPlant(list[0].plantId);
    });
  }, []);

  useEffect(() => {
    if (!selectedPlant) return;
    setLoading(true);
    aiAPI.getRecommendations(selectedPlant)
      .then(({ data }) => setRecommendations(data.data || []))
      .finally(() => setLoading(false));
  }, [selectedPlant]);

  const latest = recommendations[0];
  const healthScore = latest?.healthScore || 85;
  const healthStatus = latest?.healthStatus || 'GOOD';

  return (
    <Box>
      <Box sx={pageHeaderRow}>
        <Typography variant="h5" sx={pageTitleSx}>AI Plant Health Engine</Typography>
        <FormControl size="small" sx={responsiveSelect}>
          <InputLabel>Plant</InputLabel>
          <Select value={selectedPlant} label="Plant" onChange={(e) => setSelectedPlant(e.target.value)}>
            {plants.map((p) => <MenuItem key={p.plantId} value={p.plantId}>{p.plantName}</MenuItem>)}
          </Select>
        </FormControl>
      </Box>

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}>
          <Card sx={{ bgcolor: getHealthColor(healthStatus), color: 'white' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Psychology /><Typography variant="h6">AI Health Score</Typography>
              </Box>
              <Typography variant="h2" fontWeight={700}>{healthScore}</Typography>
              <Chip label={healthStatus} sx={{ mt: 1, bgcolor: 'rgba(255,255,255,0.2)', color: 'white' }} />
              <LinearProgress variant="determinate" value={healthScore}
                sx={{ mt: 2, bgcolor: 'rgba(255,255,255,0.3)', '& .MuiLinearProgress-bar': { bgcolor: 'white' } }} />
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={8}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2 }}>Detected Issues</Typography>
              {['ACIDIFICATION', 'OVERFEEDING', 'UNDERFEEDING', 'GAS_YIELD_REDUCTION', 'SENSOR_FAILURE', 'PLANT_INSTABILITY'].map((issue) => {
                const found = recommendations.find((r) => r.issueType === issue);
                return (
                  <Chip key={issue} label={issue.replace(/_/g, ' ')} size="small" sx={{ m: 0.5 }}
                    color={found ? 'warning' : 'default'} variant={found ? 'filled' : 'outlined'} />
                );
              })}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Typography variant="h6" sx={{ mb: 2 }}>AI Recommendations</Typography>
      {loading ? <CircularProgress /> : (
        <Grid container spacing={2}>
          {recommendations.length === 0 ? (
            <Grid item xs={12}><Card><CardContent><Typography color="text.secondary">No recommendations. Plant operating optimally.</Typography></CardContent></Card></Grid>
          ) : recommendations.map((rec) => (
            <Grid item xs={12} key={rec.id}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Box>
                      <Chip label={rec.issueType?.replace(/_/g, ' ')} size="small" color="primary" sx={{ mb: 1 }} />
                      <Typography>{rec.recommendation}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        Score: {rec.healthScore} | Status: {rec.healthStatus}
                      </Typography>
                    </Box>
                    {!rec.acknowledged && (
                      <Button size="small" onClick={() => aiAPI.acknowledge(rec.id).then(() => {
                        setRecommendations((prev) => prev.map((r) => r.id === rec.id ? { ...r, acknowledged: true } : r));
                      })}>Acknowledge</Button>
                    )}
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );
}
