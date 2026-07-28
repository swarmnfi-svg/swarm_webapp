import { useMemo, useState } from 'react';
import { Box, IconButton, Tooltip, Typography } from '@mui/material';
import { Fullscreen, FullscreenExit, ZoomIn, ZoomOut } from '@mui/icons-material';
import {
  equipmentMotorStatus,
  equipmentStatusColor,
  equipmentStatusBorder,
  MOTOR_STATUS,
  isTankKind,
  filterHotspotsForPage,
} from '../../data/tataSteelEquipment';

function DiagramCanvas({
  diagramUrl,
  equipment,
  hotspots,
  selectedTag,
  activePage,
  plantPowered,
  onSelectTag,
  zoom,
}) {
  const equipmentByTag = useMemo(() => {
    const map = {};
    (equipment || []).forEach((eq) => { map[eq.tagNo] = eq; });
    return map;
  }, [equipment]);

  const visibleHotspots = filterHotspotsForPage(hotspots, activePage);
  const dimmed = !plantPowered;

  return (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        transform: `scale(${zoom})`,
        transformOrigin: 'top center',
        transition: 'transform 0.2s',
      }}
    >
      <Box
        sx={{
          position: 'relative',
          borderRadius: 2,
          overflow: 'hidden',
          border: '2px solid',
          borderColor: plantPowered ? 'primary.main' : 'divider',
          bgcolor: '#0a1628',
          minHeight: 480,
        }}
      >
        <Box
          component="img"
          src={diagramUrl}
          alt="P&ID BPG-10-PR-GD-002"
          sx={{
            width: '100%',
            display: 'block',
            opacity: dimmed ? 0.5 : 1,
            filter: dimmed ? 'grayscale(30%)' : 'none',
            transition: 'opacity 0.4s',
          }}
          onError={(e) => { e.target.style.display = 'none'; }}
        />

        {visibleHotspots.map((h) => {
          const eq = equipmentByTag[h.tagNo];
          if (!eq) return null;

          const selected = selectedTag === h.tagNo;
          const isMotor = eq.controllable;
          const isTank = isTankKind(eq.equipmentKind);

          if (isMotor) {
            const status = equipmentMotorStatus(eq);
            const color = equipmentStatusColor(eq);
            const border = equipmentStatusBorder(eq);
            const statusMeta = MOTOR_STATUS.find((s) => s.id === status);

            return (
              <Box
                key={h.tagNo}
                onClick={() => onSelectTag(h.tagNo)}
                title={`${h.tagNo} ${h.name} — ${statusMeta?.label}`}
                sx={{
                  position: 'absolute',
                  left: `${h.x}%`,
                  top: `${h.y}%`,
                  width: `${Math.max(h.w, 2.8)}%`,
                  height: `${Math.max(h.h, 2.8)}%`,
                  borderRadius: '50%',
                  border: '3px solid',
                  borderColor: selected ? '#fff' : border,
                  bgcolor: color,
                  opacity: 0.95,
                  cursor: 'pointer',
                  outline: selected ? '3px solid #0066CC' : 'none',
                  outlineOffset: 2,
                  boxShadow: status === 'RUNNING'
                    ? '0 0 10px rgba(76,175,80,0.8)'
                    : status === 'FAULT'
                      ? '0 0 10px rgba(255,193,7,0.9)'
                      : 'none',
                  animation: status === 'FAULT' ? 'faultPulse 1s ease-in-out infinite' : undefined,
                  '@keyframes faultPulse': {
                    '0%, 100%': { opacity: 1 },
                    '50%': { opacity: 0.55 },
                  },
                  '&:hover': { transform: 'scale(1.15)', zIndex: 3 },
                  transition: 'transform 0.15s',
                }}
              />
            );
          }

          if (isTank) {
            const level = eq.sensorValue != null ? Math.min(100, Math.max(0, eq.sensorValue)) : null;
            return (
              <Box
                key={h.tagNo}
                onClick={() => onSelectTag(h.tagNo)}
                title={`${h.tagNo} ${h.name}${level != null ? ` — ${level.toFixed(0)}%` : ''}`}
                sx={{
                  position: 'absolute',
                  left: `${h.x}%`,
                  top: `${h.y}%`,
                  width: `${h.w}%`,
                  height: `${h.h}%`,
                  border: '2px solid',
                  borderColor: selected ? '#0066CC' : 'rgba(255,255,255,0.35)',
                  borderRadius: 1,
                  cursor: 'pointer',
                  bgcolor: 'rgba(33,150,243,0.08)',
                  overflow: 'hidden',
                  '&:hover': { borderColor: '#64b5f6' },
                }}
              >
                {level != null && (
                  <Box
                    sx={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      right: 0,
                      height: `${level}%`,
                      bgcolor: 'rgba(33,150,243,0.45)',
                      transition: 'height 0.5s',
                    }}
                  />
                )}
                {eq.sensorValue != null && (
                  <Typography
                    variant="caption"
                    sx={{
                      position: 'absolute',
                      top: 2,
                      left: 0,
                      right: 0,
                      textAlign: 'center',
                      color: '#fff',
                      fontSize: '0.55rem',
                      fontWeight: 700,
                      textShadow: '0 1px 2px #000',
                    }}
                  >
                    {eq.sensorValue.toFixed(0)}{eq.sensorUnit ? ` ${eq.sensorUnit}` : '%'}
                  </Typography>
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

export default function PidDiagram(props) {
  const [maximized, setMaximized] = useState(false);
  const [zoom, setZoom] = useState(1);

  const toolbar = (
    <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5, mb: 0.5 }}>
      <Tooltip title="Zoom out">
        <IconButton size="small" onClick={() => setZoom((z) => Math.max(0.7, z - 0.1))} disabled={zoom <= 0.7}>
          <ZoomOut fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Zoom in">
        <IconButton size="small" onClick={() => setZoom((z) => Math.min(1.5, z + 0.1))} disabled={zoom >= 1.5}>
          <ZoomIn fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title={maximized ? 'Minimize' : 'Maximize P&ID'}>
        <IconButton size="small" onClick={() => setMaximized((m) => !m)}>
          {maximized ? <FullscreenExit fontSize="small" /> : <Fullscreen fontSize="small" />}
        </IconButton>
      </Tooltip>
    </Box>
  );

  const canvas = <DiagramCanvas {...props} zoom={zoom} />;

  if (maximized) {
    return (
      <Box sx={{
        position: 'fixed', inset: 0, zIndex: 1250, bgcolor: '#0a1628',
        p: 2, display: 'flex', flexDirection: 'column',
      }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Typography variant="subtitle1" fontWeight={700} color="white">
            P&ID BPG-10-PR-GD-002 Rev.3 — Tata Steel West Bokaro
          </Typography>
          <Box>
            {toolbar}
          </Box>
        </Box>
        <Box sx={{ flex: 1, overflow: 'auto' }}>{canvas}</Box>
      </Box>
    );
  }

  return (
    <Box>
      {toolbar}
      {canvas}
    </Box>
  );
}
