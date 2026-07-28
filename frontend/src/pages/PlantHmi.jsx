import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box, Card, CardContent, CircularProgress, FormControl,
  InputLabel, MenuItem, Select, Typography, IconButton, Tooltip,
} from '@mui/material';
import { Fullscreen, FullscreenExit } from '@mui/icons-material';
import { plantAPI, hmiAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import SwarmCoreHeader from '../components/hmi/SwarmCoreHeader';
import OutputEnablePanel from '../components/hmi/OutputEnablePanel';
import HmiPageNav from '../components/hmi/HmiPageNav';
import PlantOverviewPanel from '../components/hmi/PlantOverviewPanel';
import ZoneMonitorPanel from '../components/hmi/ZoneMonitorPanel';
import HmiAlarmSummary from '../components/hmi/HmiAlarmSummary';
import HmiTrendsPanel from '../components/hmi/HmiTrendsPanel';
import HmiDiagnosticsPanel from '../components/hmi/HmiDiagnosticsPanel';
import HmiAuditPanel from '../components/hmi/HmiAuditPanel';
import BiogasPlantDiagram from '../components/hmi/BiogasPlantDiagram';
import {
  SWARM_ZONES, SWARM_PLATFORM, PROCESS_FLOW_STEPS, HMI_PAGES,
  appendAuditLog,
} from '../data/swarmControl';
import { equipmentTagsForZones } from '../data/pidRegistry';
import { contentMaxWidth, pageHeaderRow, pageTitleSx, responsiveSelect } from '../utils/responsive';

export default function PlantHmi() {
  const { canManagePlants, user } = useAuth();
  const [searchParams] = useSearchParams();
  const [plants, setPlants] = useState([]);
  const [selectedPlant, setSelectedPlant] = useState('');
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cmdLoading, setCmdLoading] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [flowStep, setFlowStep] = useState(0);
  const [loadError, setLoadError] = useState('');
  const [activePage, setActivePage] = useState('OVERVIEW');

  const plantRef = useRef(selectedPlant);
  plantRef.current = selectedPlant;

  const loadHmi = useCallback(async (plantId) => {
    if (!plantId) return;
    setLoadError('');
    try {
      const { data } = await hmiAPI.getState(plantId);
      if (plantRef.current !== plantId) return;
      setState(data.data);
    } catch (err) {
      if (plantRef.current !== plantId) return;
      setState(null);
      setLoadError(err.response?.data?.message || 'Could not load SWARM HMI state.');
      console.error(err);
    }
  }, []);

  useEffect(() => {
    plantAPI.getAll().then(({ data }) => {
      const list = data.data || [];
      const hmiPlants = list.filter((p) => p.feedstockType?.includes('P&ID'));
      const selectable = hmiPlants.length > 0 ? hmiPlants : list;
      setPlants(selectable);
      const fromUrl = searchParams.get('plantId');
      if (fromUrl && selectable.some((p) => p.plantId === Number(fromUrl))) {
        setSelectedPlant(Number(fromUrl));
      } else if (selectable.length > 0) {
        const hmiPlant = selectable.find((p) => p.feedstockType?.includes('P&ID')) || selectable[0];
        setSelectedPlant(hmiPlant.plantId);
      }
    }).finally(() => setLoading(false));
  }, [searchParams]);

  useEffect(() => {
    if (!selectedPlant || cmdLoading) return undefined;
    loadHmi(selectedPlant);
    const interval = setInterval(() => {
      if (!cmdLoading) loadHmi(selectedPlant);
    }, 4000);
    return () => clearInterval(interval);
  }, [selectedPlant, loadHmi, cmdLoading]);

  useEffect(() => {
    if (!state?.autoSequenceActive) return undefined;
    const t = setInterval(() => {
      setFlowStep((s) => (s + 1) % PROCESS_FLOW_STEPS.length);
    }, 3500);
    return () => clearInterval(t);
  }, [state?.autoSequenceActive]);

  const logAudit = useCallback((action, target) => {
    appendAuditLog(selectedPlant, {
      user: user?.email || user?.name || 'unknown',
      action,
      target,
    });
  }, [selectedPlant, user]);

  const handleMaster = async (action) => {
    setCmdLoading(true);
    try {
      const { data } = await hmiAPI.sendMaster(selectedPlant, { action });
      setState(data.data);
      logAudit(action, 'PLANT');
    } catch (err) {
      window.alert(err.response?.data?.message || 'Command failed');
    } finally {
      setCmdLoading(false);
    }
  };

  const handleCommand = async (tagNo, action) => {
    if (!canManagePlants) return;
    setCmdLoading(true);
    try {
      const { data } = await hmiAPI.sendCommand(selectedPlant, { tagNo, action });
      setState(data.data);
      logAudit(action, tagNo);
    } catch (err) {
      window.alert(err.response?.data?.message || 'Command failed');
    } finally {
      setCmdLoading(false);
    }
  };

  const currentPage = HMI_PAGES.find((p) => p.id === activePage);
  const showControls = currentPage?.controlPage;

  const instrumentZoneIds = activePage === 'OVERVIEW'
    ? null
    : SWARM_ZONES.find((z) => z.id === currentPage?.zoneId)?.zones;

  const zoneEquipmentTags = equipmentTagsForZones(state?.equipment, instrumentZoneIds);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={fullscreen ? {
      position: 'fixed', inset: 0, zIndex: 1300, bgcolor: 'background.default',
      p: { xs: 1, sm: 2 }, overflow: 'auto',
    } : contentMaxWidth}>
      <Box sx={pageHeaderRow}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h5" sx={pageTitleSx}>SWARM Plant HMI</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>
            {SWARM_PLATFORM.tagline} · {SWARM_PLATFORM.pid}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', width: { xs: '100%', sm: 'auto' } }}>
          <FormControl size="small" sx={responsiveSelect}>
            <InputLabel>Plant</InputLabel>
            <Select value={selectedPlant} label="Plant" onChange={(e) => setSelectedPlant(e.target.value)}>
              {plants.map((p) => (
                <MenuItem key={p.plantId} value={p.plantId}>{p.plantName}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <Tooltip title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
            <IconButton onClick={() => setFullscreen((f) => !f)}>
              {fullscreen ? <FullscreenExit /> : <Fullscreen />}
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {loadError && (
        <Card sx={{ mb: 2 }}><CardContent><Typography color="error" fontWeight={600}>{loadError}</Typography></CardContent></Card>
      )}

      {state && (
        <>
          <Box sx={{ mb: 2 }}>
            <SwarmCoreHeader simulationMode={state.simulationMode} plantPowered={state.plantPowered} />
          </Box>

          {showControls && (
            <Card sx={{ mb: 2 }}>
              <CardContent>
                <OutputEnablePanel
                  plantPowered={state.plantPowered}
                  loading={cmdLoading}
                  onMaster={handleMaster}
                />
              </CardContent>
            </Card>
          )}

          {(activePage === 'OVERVIEW' || ['FEED', 'DIGESTER', 'GAS', 'SLURRY'].includes(activePage)) && (
            <Card sx={{ mb: 2 }}>
              <CardContent>
                <BiogasPlantDiagram
                  equipment={state.equipment}
                  plantPowered={state.plantPowered}
                  highlightTags={activePage === 'OVERVIEW' ? null : zoneEquipmentTags}
                  canControl={canManagePlants}
                  cmdLoading={cmdLoading}
                  onCommand={handleCommand}
                />
              </CardContent>
            </Card>
          )}

          <Card sx={{ mb: 2 }}>
            <CardContent>
              <HmiPageNav activePage={activePage} onPageChange={setActivePage} />

              {activePage === 'OVERVIEW' && (
                <Box sx={{ mt: 2 }}>
                  <PlantOverviewPanel
                    state={state}
                    flowStep={flowStep}
                    autoActive={state.autoSequenceActive}
                  />
                </Box>
              )}

              {['FEED', 'DIGESTER', 'GAS', 'SLURRY'].includes(activePage) && (
                <Box sx={{ mt: 2 }}>
                  <ZoneMonitorPanel equipment={state.equipment} pageId={activePage} />
                </Box>
              )}

              {activePage === 'ALARMS' && (
                <Box sx={{ mt: 2 }}>
                  <HmiAlarmSummary plantId={selectedPlant} />
                </Box>
              )}
              {activePage === 'TRENDS' && (
                <Box sx={{ mt: 2 }}>
                  <HmiTrendsPanel equipment={state.equipment} plantId={selectedPlant} />
                </Box>
              )}
              {activePage === 'DIAGNOSTICS' && (
                <Box sx={{ mt: 2 }}>
                  <HmiDiagnosticsPanel equipment={state.equipment} state={state} />
                </Box>
              )}
              {activePage === 'AUDIT' && (
                <Box sx={{ mt: 2 }}>
                  <HmiAuditPanel plantId={selectedPlant} user={user} />
                </Box>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </Box>
  );
}
