import { useEffect, useMemo, useState } from 'react';
import { Box, IconButton, Tooltip, Typography } from '@mui/material';
import { Fullscreen, FullscreenExit, ZoomIn, ZoomOut } from '@mui/icons-material';
import { equipmentMotorStatus, equipmentStatusColor, equipmentStatusBorder, MOTOR_STATUS } from '../../data/swarmControl';
import { isInstrument, isMotorOrValve, isaSymbol } from '../../data/pidRegistry';

const MIN_ZOOM = 0.5;
const MAX_ZOOM_PNG = 4;
const MAX_ZOOM_SVG = 5;
const ZOOM_STEP = 0.25;
const DEFAULT_PNG_ZOOM = 1.5;

function DiagramImage({ src, plantPowered, onReady, onError }) {
  return (
    <Box
      component="img"
      src={src}
      alt="P&ID BPG-10-PR-GD-002"
      draggable={false}
      onLoad={onReady}
      onError={onError}
      sx={{
        width: '100%',
        display: 'block',
        opacity: plantPowered ? 1 : 0.55,
        bgcolor: '#ffffff',
      }}
    />
  );
}

function SchematicCanvas({ diagramUrl, equipment, hotspots, plantPowered, zoom, scrollMaxHeight }) {
  const isSvg = diagramUrl?.toLowerCase().includes('.svg');
  const [src, setSrc] = useState(diagramUrl);
  const [diagramLoading, setDiagramLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    setSrc(diagramUrl);
    setDiagramLoading(true);
    setLoadError('');
  }, [diagramUrl]);

  const equipmentByTag = useMemo(() => {
    const map = {};
    (equipment || []).forEach((eq) => { map[eq.tagNo] = eq; });
    return map;
  }, [equipment]);

  const handleDiagramError = () => {
    setDiagramLoading(false);
    if (isSvg && !src.toLowerCase().includes('.png')) {
      setSrc(diagramUrl.replace(/\.svg(\?.*)?$/i, '.png'));
      setLoadError('');
      return;
    }
    setLoadError('Could not load P&ID image. Open /hmi/tata-steel-pid.png in a new tab, then hard-refresh this page (Ctrl+Shift+R).');
  };

  return (
    <Box
      sx={{
        overflow: 'auto',
        maxHeight: scrollMaxHeight,
        borderRadius: 2,
        border: '2px solid',
        borderColor: plantPowered ? 'success.main' : 'divider',
        bgcolor: '#ffffff',
      }}
    >
      <Box
        sx={{
          position: 'relative',
          width: `${zoom * 100}%`,
          minWidth: '100%',
          transition: 'width 0.15s ease-out',
        }}
      >
        {diagramLoading && !loadError && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', p: 2 }}>
            Loading P&ID…
          </Typography>
        )}
        {loadError ? (
          <Typography variant="body2" color="error" sx={{ p: 2 }}>
            {loadError}
          </Typography>
        ) : (
          <DiagramImage
            src={src}
            plantPowered={plantPowered}
            onReady={() => setDiagramLoading(false)}
            onError={handleDiagramError}
          />
        )}

        {!loadError && (hotspots || []).map((h) => {
          const eq = equipmentByTag[h.tagNo];
          if (!eq) return null;

          if (isMotorOrValve(eq)) {
            const status = equipmentMotorStatus(eq);
            const color = equipmentStatusColor(eq);
            const border = equipmentStatusBorder(eq);
            const dotSize = eq.equipmentKind === 'SOLENOID_VALVE' ? 12 : 14;
            return (
              <Box
                key={h.tagNo}
                title={`${eq.tagNo} ${eq.name}`}
                sx={{
                  position: 'absolute',
                  left: `${h.x}%`,
                  top: `${h.y}%`,
                  width: dotSize,
                  height: dotSize,
                  marginLeft: `${-dotSize / 2}px`,
                  marginTop: `${-dotSize / 2}px`,
                  borderRadius: eq.equipmentKind === 'SOLENOID_VALVE' ? 1 : '50%',
                  border: '2px solid',
                  borderColor: border,
                  bgcolor: color,
                  opacity: 0.92,
                  boxShadow: status === 'RUNNING' ? `0 0 8px ${color}` : 'none',
                  pointerEvents: 'none',
                }}
              />
            );
          }

          if (isInstrument(eq)) {
            const sym = isaSymbol(eq);
            return (
              <Box
                key={h.tagNo}
                title={`${eq.tagNo} ${eq.name}${eq.sensorValue != null ? `: ${eq.sensorValue}` : ''}`}
                sx={{
                  position: 'absolute',
                  left: `${h.x}%`,
                  top: `${h.y}%`,
                  transform: 'translate(-50%, -50%)',
                  minWidth: 28,
                  px: 0.4,
                  py: 0.2,
                  borderRadius: 0.5,
                  bgcolor: eq.inAlarm ? 'error.dark' : 'rgba(13,71,161,0.92)',
                  border: '1px solid',
                  borderColor: eq.inAlarm ? 'error.light' : '#64b5f6',
                  color: 'white',
                  fontSize: '0.5rem',
                  fontWeight: 800,
                  textAlign: 'center',
                  lineHeight: 1.1,
                  pointerEvents: 'none',
                }}
              >
                {sym}
                {eq.sensorValue != null && (
                  <Box component="span" sx={{ display: 'block', fontSize: '0.5rem', fontWeight: 600 }}>
                    {eq.sensorValue.toFixed(1)}
                  </Box>
                )}
              </Box>
            );
          }

          return null;
        })}
      </Box>
    </Box>
  );
}

export default function PidSchematic({ diagramUrl, equipment, hotspots, plantPowered }) {
  const [maximized, setMaximized] = useState(false);
  const isSvg = diagramUrl?.toLowerCase().includes('.svg');
  const [zoom, setZoom] = useState(isSvg ? 1 : DEFAULT_PNG_ZOOM);
  const maxZoom = isSvg ? MAX_ZOOM_SVG : MAX_ZOOM_PNG;
  const zoomLabel = `${Math.round(zoom * 100)}%`;

  useEffect(() => {
    setZoom(isSvg ? 1 : DEFAULT_PNG_ZOOM);
  }, [diagramUrl, isSvg]);

  const toolbar = (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
      <Typography variant="caption" color="text.secondary">
        {isSvg ? 'Vector SVG — sharp at any zoom' : 'Raster PNG — use zoom for detail'} · Scroll when zoomed
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Typography variant="caption" color="text.secondary" sx={{ minWidth: 36, textAlign: 'right' }}>
          {zoomLabel}
        </Typography>
        <Tooltip title="Zoom out">
          <span>
            <IconButton size="small" disabled={zoom <= MIN_ZOOM} onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP))}>
              <ZoomOut fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Zoom in">
          <span>
            <IconButton size="small" disabled={zoom >= maxZoom} onClick={() => setZoom((z) => Math.min(maxZoom, z + ZOOM_STEP))}>
              <ZoomIn fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={maximized ? 'Minimize' : 'Maximize'}>
          <IconButton size="small" onClick={() => setMaximized((m) => !m)}>
            {maximized ? <FullscreenExit fontSize="small" /> : <Fullscreen fontSize="small" />}
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );

  const scrollMaxHeight = maximized ? 'calc(100vh - 88px)' : 560;

  const canvas = (
    <SchematicCanvas
      diagramUrl={diagramUrl}
      equipment={equipment}
      hotspots={hotspots}
      plantPowered={plantPowered}
      zoom={zoom}
      scrollMaxHeight={scrollMaxHeight}
    />
  );

  if (maximized) {
    return (
      <Box sx={{ position: 'fixed', inset: 0, zIndex: 1250, bgcolor: '#1a1a1a', p: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', color: 'white', mb: 1 }}>
          <Typography variant="subtitle1" fontWeight={700}>P&ID BPG-10-PR-GD-002</Typography>
          <IconButton color="inherit" onClick={() => setMaximized(false)}><FullscreenExit /></IconButton>
        </Box>
        {toolbar}
        {canvas}
      </Box>
    );
  }

  return (
    <Box>
      {toolbar}
      {canvas}
      <StackLegend />
    </Box>
  );
}

function StackLegend() {
  return (
    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mt: 1 }}>
      {MOTOR_STATUS.map((s) => (
        <Box key={s.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: s.color }} />
          <Typography variant="caption">{s.label}</Typography>
        </Box>
      ))}
      <Typography variant="caption" color="text.secondary">|</Typography>
      <Typography variant="caption">Blue badge = instrument (TT/FIT/PIT…)</Typography>
    </Box>
  );
}
