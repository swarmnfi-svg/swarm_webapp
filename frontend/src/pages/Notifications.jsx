import { useState, useEffect } from 'react';
import {
  Box, Typography, Card, Grid, Chip, List, ListItem, ListItemText, CircularProgress,
} from '@mui/material';
import { notificationAPI } from '../services/api';
import { formatDate } from '../utils/constants';

export default function Notifications() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    notificationAPI.getAll().then(({ data }) => setData(data.data)).finally(() => setLoading(false));
  }, []);

  if (loading) return <CircularProgress />;

  const counts = data?.counts || {};

  const renderList = (alerts, emptyMsg) => (
    <List dense>
      {(alerts || []).length === 0 ? (
        <ListItem><ListItemText primary={emptyMsg} /></ListItem>
      ) : alerts.map((a) => (
        <ListItem key={a.id} divider>
          <ListItemText
            primary={a.title}
            secondary={`${a.plantName} | ${formatDate(a.createdAt)}`}
          />
          <Chip label={a.severity} size="small"
            color={a.severity === 'CRITICAL' ? 'error' : a.severity === 'WARNING' ? 'warning' : 'info'} />
        </ListItem>
      ))}
    </List>
  );

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>Notification Center</Typography>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={4}>
          <Card sx={{ textAlign: 'center', p: 2 }}>
            <Typography variant="h3" color="error.main" fontWeight={700}>{counts.active || 0}</Typography>
            <Typography>Active</Typography>
          </Card>
        </Grid>
        <Grid item xs={4}>
          <Card sx={{ textAlign: 'center', p: 2 }}>
            <Typography variant="h3" color="warning.main" fontWeight={700}>{counts.acknowledged || 0}</Typography>
            <Typography>Acknowledged</Typography>
          </Card>
        </Grid>
        <Grid item xs={4}>
          <Card sx={{ textAlign: 'center', p: 2 }}>
            <Typography variant="h3" color="success.main" fontWeight={700}>{counts.resolved || 0}</Typography>
            <Typography>Resolved</Typography>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        <Grid item xs={12} md={4}>
          <Card><Box sx={{ p: 2, bgcolor: 'error.light', color: 'white' }}><Typography fontWeight={600}>Active Alerts</Typography></Box>
            {renderList(data?.activeAlerts, 'No active alerts')}</Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card><Box sx={{ p: 2, bgcolor: 'warning.light', color: 'white' }}><Typography fontWeight={600}>Acknowledged</Typography></Box>
            {renderList(data?.acknowledgedAlerts, 'No acknowledged alerts')}</Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card><Box sx={{ p: 2, bgcolor: 'success.light', color: 'white' }}><Typography fontWeight={600}>Resolved</Typography></Box>
            {renderList(data?.resolvedAlerts, 'No resolved alerts')}</Card>
        </Grid>
      </Grid>
    </Box>
  );
}
