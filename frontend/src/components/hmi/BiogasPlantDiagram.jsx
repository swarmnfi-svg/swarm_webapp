import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, IconButton, Tooltip, Typography, useMediaQuery, useTheme } from '@mui/material';
import { Fullscreen, FullscreenExit } from '@mui/icons-material';
import { MOTOR_STATUS } from '../../data/swarmControl';

const PFD_URL = '/hmi/biogas-pfd.html?embedded=1&v=block-controls-26';

async function tryLockLandscape() {
  try {
    if (screen.orientation?.lock) {
      await screen.orientation.lock('landscape');
    }
  } catch {
    /* optional — user can rotate device manually */
  }
}

function tryUnlockOrientation() {
  try {
    screen.orientation?.unlock?.();
  } catch {
    /* ignore */
  }
}

export default function BiogasPlantDiagram({
  equipment = [],
  plantPowered = false,
  highlightTags = null,
  canControl = false,
  cmdLoading = false,
  onCommand,
  title = 'Biogas Plant — Process Flow Diagram',
}) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const iframeRef = useRef(null);
  const [maximized, setMaximized] = useState(false);
  const [ready, setReady] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState(null);

  const payload = useMemo(() => ({
    plantPowered,
    equipment,
    highlightTags,
    canControl: canControl && !cmdLoading,
    maximized,
  }), [plantPowered, equipment, highlightTags, canControl, cmdLoading, maximized]);

  const postState = useCallback(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win || !ready) return;
    win.postMessage({ type: 'HMI_STATE', payload }, '*');
  }, [payload, ready]);

  const handleToggleMaximize = useCallback(() => {
    setMaximized((m) => !m);
  }, []);

  useEffect(() => {
    const onMessage = (event) => {
      if (event.data?.type === 'PFD_READY') {
        setReady(true);
      }
      if (event.data?.type === 'PFD_UNIT_CLICK') {
        setSelectedUnit(event.data);
      }
      if (event.data?.type === 'PFD_BLOCK_COMMAND' && onCommand) {
        onCommand(event.data.tag, event.data.action);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onCommand]);

  useEffect(() => {
    postState();
  }, [postState]);

  useEffect(() => {
    if (!maximized) {
      document.body.style.overflow = '';
      tryUnlockOrientation();
      return undefined;
    }

    document.body.style.overflow = 'hidden';
    if (isMobile) {
      tryLockLandscape();
    }

    return () => {
      document.body.style.overflow = '';
      tryUnlockOrientation();
    };
  }, [maximized, isMobile]);

  const runningCount = useMemo(
    () => equipment.filter((eq) => eq.controllable && eq.running).length,
    [equipment],
  );

  const selectedLabels = useMemo(() => {
    if (!selectedUnit?.tags?.length) return '';
    return selectedUnit.tags
      .map((tag) => {
        const eq = equipment.find((e) => e.tagNo === tag);
        return eq ? `${eq.tagNo} — ${eq.name}` : tag;
      })
      .join(' · ');
  }, [selectedUnit, equipment]);

  const inlineFrameHeight = isMobile
    ? { xs: 'min(78vh, 900px)', sm: 520 }
    : { xs: 520, md: 680, lg: 760 };

  const frame = (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        height: maximized ? undefined : inlineFrameHeight,
        borderRadius: maximized ? 0 : 2,
        overflow: 'hidden',
        border: maximized ? 'none' : '2px solid',
        borderColor: plantPowered ? 'success.main' : 'divider',
        bgcolor: '#0f172a',
        flex: maximized ? 1 : undefined,
        minHeight: maximized ? 0 : undefined,
      }}
    >
      <Box
        component="iframe"
        ref={iframeRef}
        src={PFD_URL}
        title={title}
        sx={{
          width: '100%',
          height: '100%',
          border: 0,
          display: 'block',
        }}
      />
    </Box>
  );

  const toolbar = (
    <Box sx={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      mb: maximized ? 0.5 : 0.5,
      gap: 1,
      flexWrap: 'wrap',
      flexShrink: 0,
      minHeight: maximized ? 28 : undefined,
    }}>
      <Box sx={{ minWidth: 0 }}>
        {selectedLabels && (
          <Typography variant="caption" color={maximized ? 'grey.400' : 'primary.main'} fontWeight={600}>
            Selected: {selectedLabels}
          </Typography>
        )}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="caption" color={maximized ? 'grey.500' : 'text.secondary'}>
          Motors running: {runningCount}
        </Typography>
        {!maximized && (
          <Tooltip title="Maximize">
            <IconButton size="small" onClick={handleToggleMaximize}>
              <Fullscreen fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>
    </Box>
  );

  if (maximized) {
    return (
      <Box
        sx={{
          position: 'fixed',
          inset: 0,
          zIndex: 1250,
          bgcolor: '#0c0c0e',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          paddingLeft: 'env(safe-area-inset-left)',
          paddingRight: 'env(safe-area-inset-right)',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            color: 'white',
            px: 1.5,
            py: 0.75,
            minHeight: 44,
            flexShrink: 0,
          }}
        >
          <Typography variant="subtitle1" fontWeight={700} noWrap sx={{ flex: 1, pr: 1 }}>
            {title}
          </Typography>
          <Tooltip title="Minimize">
            <IconButton color="inherit" onClick={handleToggleMaximize} aria-label="Minimize diagram">
              <FullscreenExit />
            </IconButton>
          </Tooltip>
        </Box>

        <Box sx={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
          px: 1,
          pb: 1,
        }}>
          {toolbar}
          {frame}
          <Legend maximized />
        </Box>
      </Box>
    );
  }

  return (
    <Box>
      {toolbar}
      {frame}
      <Legend />
    </Box>
  );
}

function Legend({ maximized = false }) {
  return (
    <Box sx={{
      display: 'flex',
      gap: 2,
      flexWrap: 'wrap',
      mt: 1,
      flexShrink: 0,
      color: maximized ? 'grey.500' : undefined,
    }}>
      {MOTOR_STATUS.map((s) => (
        <Box key={s.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: s.color }} />
          <Typography variant="caption" color={maximized ? 'grey.500' : undefined}>{s.label}</Typography>
        </Box>
      ))}
      <Typography variant="caption" color={maximized ? 'grey.600' : 'text.secondary'}>|</Typography>
      <Typography variant="caption" color={maximized ? 'grey.500' : undefined}>
        Green = running · Red = off · Yellow = fault (when bus energized)
      </Typography>
      <Typography variant="caption" color={maximized ? 'grey.600' : 'text.secondary'}>|</Typography>
      <Typography variant="caption" color={maximized ? 'grey.500' : undefined}>
        Pipeline flow follows active blocks
      </Typography>
    </Box>
  );
}
