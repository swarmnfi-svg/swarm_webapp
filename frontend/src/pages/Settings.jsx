import { useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, Grid, TextField, Button, Tabs, Tab,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, CircularProgress, Alert,
} from '@mui/material';
import { settingsAPI } from '../services/api';

export default function Settings() {
  const [settings, setSettings] = useState([]);
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const categories = ['ALERT', 'MQTT', 'EMAIL', 'AI', 'REPORT'];

  useEffect(() => {
    settingsAPI.getAll().then(({ data }) => setSettings(data.data || [])).finally(() => setLoading(false));
  }, []);

  const categorySettings = settings.filter((s) => s.category === categories[tab]);

  const handleSave = async (setting) => {
    await settingsAPI.save({
      settingKey: setting.settingKey,
      settingValue: setting.settingValue,
      category: setting.category,
      description: setting.description,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const updateValue = (key, value) => {
    setSettings((prev) => prev.map((s) => s.settingKey === key ? { ...s, settingValue: value } : s));
  };

  if (loading) return <CircularProgress />;

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 3, fontWeight: 700, fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>System Settings</Typography>
      {saved && <Alert severity="success" sx={{ mb: 2 }}>Settings saved successfully</Alert>}

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }} variant="scrollable" scrollButtons="auto">
        <Tab label="Alert Thresholds" /><Tab label="MQTT Broker" /><Tab label="Email Server" />
        <Tab label="AI Settings" /><Tab label="Report Schedule" />
      </Tabs>

      <Card>
        <CardContent>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Setting</TableCell><TableCell>Description</TableCell><TableCell>Value</TableCell><TableCell>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {categorySettings.map((s) => (
                  <TableRow key={s.settingKey}>
                    <TableCell>{s.settingKey}</TableCell>
                    <TableCell>{s.description}</TableCell>
                    <TableCell>
                      <TextField size="small" value={s.settingValue || ''} onChange={(e) => updateValue(s.settingKey, e.target.value)} />
                    </TableCell>
                    <TableCell>
                      <Button size="small" variant="outlined" onClick={() => handleSave(s)}>Save</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    </Box>
  );
}
