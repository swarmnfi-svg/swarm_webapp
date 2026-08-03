import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Box, IconButton, Tooltip, alpha } from '@mui/material';
import RemoveIcon from '@mui/icons-material/Remove';
import CloseIcon from '@mui/icons-material/Close';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import NovaLogo from './NovaLogo';
import NovaOpChat from './NovaOpChat';
import {
  readNovaAiBubbleState,
  writeNovaAiBubbleState,
  NOVA_AI_BUBBLE_STATE_EVENT,
} from '../../lib/novaBubbleState';

const NOVA_ROLES = ['SUPER_ADMIN', 'PLANT_ADMIN', 'OPERATOR'];

export default function NovaOpFab({ userRole, firstName }) {
  const [bubbleState, setBubbleState] = useState('minimized');
  const [hydrated, setHydrated] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    setBubbleState(readNovaAiBubbleState());
    setHydrated(true);

    const onStateEvent = (event) => {
      const detail = event.detail?.state;
      if (detail === 'open' || detail === 'minimized' || detail === 'hidden') {
        setBubbleState(detail);
        return;
      }
      setBubbleState(readNovaAiBubbleState());
    };

    window.addEventListener(NOVA_AI_BUBBLE_STATE_EVENT, onStateEvent);
    return () => window.removeEventListener(NOVA_AI_BUBBLE_STATE_EVENT, onStateEvent);
  }, []);

  useEffect(() => {
    if (hydrated) setBubbleState(readNovaAiBubbleState());
  }, [location.pathname, hydrated]);

  if (!NOVA_ROLES.includes(userRole)) return null;
  if (location.pathname === '/nova-space-op') return null;
  if (!hydrated) return null;

  const setState = (next) => {
    setBubbleState(next);
    writeNovaAiBubbleState(next);
  };

  const panelOpen = bubbleState === 'open';
  const isHidden = bubbleState === 'hidden';

  const headerActions = (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, ml: 0.5 }}>
      <Tooltip title="Open full page">
        <IconButton
          size="small"
          onClick={() => { setState('minimized'); navigate('/nova-space-op'); }}
          sx={{ color: '#64748b' }}
          aria-label="Open full NOVA page"
        >
          <OpenInFullIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Tooltip>
      <Tooltip title="Minimize">
        <IconButton
          size="small"
          onClick={() => setState('minimized')}
          sx={{ color: '#64748b' }}
          aria-label="Minimize NOVA"
        >
          <RemoveIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Tooltip>
      <Tooltip title="Hide for this session">
        <IconButton
          size="small"
          onClick={() => setState('hidden')}
          sx={{ color: '#64748b' }}
          aria-label="Hide NOVA"
        >
          <CloseIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Tooltip>
    </Box>
  );

  return (
    <Box
      sx={{
        pointerEvents: 'none',
        position: 'fixed',
        bottom: { xs: 16, sm: 20 },
        right: { xs: 16, sm: 20 },
        zIndex: (theme) => theme.zIndex.speedDial,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 1.5,
        pb: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {isHidden && (
        <Tooltip title="Show NOVA" placement="left">
          <Box
            component="button"
            type="button"
            onClick={() => setState('minimized')}
            aria-label="Show NOVA"
            sx={{
              pointerEvents: 'auto',
              border: '1px solid',
              borderColor: alpha('#e2e8f0', 0.9),
              borderRadius: '50%',
              p: 1,
              bgcolor: alpha('#ffffff', 0.95),
              backdropFilter: 'blur(8px)',
              boxShadow: '0 4px 16px rgba(15,23,42,0.12)',
              cursor: 'pointer',
              transition: 'all 0.2s',
              '&:hover': {
                borderColor: '#67e8f9',
                boxShadow: '0 6px 20px rgba(34,211,238,0.2)',
              },
            }}
          >
            <NovaLogo size={28} />
          </Box>
        </Tooltip>
      )}

      {!isHidden && (
        <Box
          role="dialog"
          aria-label="NOVA chat"
          aria-hidden={!panelOpen}
          sx={{
            pointerEvents: panelOpen ? 'auto' : 'none',
            display: 'flex',
            flexDirection: 'column',
            width: { xs: 'calc(100vw - 24px)', sm: 400 },
            maxWidth: 'calc(100vw - 24px)',
            height: panelOpen ? { xs: 'min(78vh, 620px)', sm: 'min(78vh, 620px)' } : 0,
            overflow: 'hidden',
            borderRadius: 3,
            bgcolor: '#ffffff',
            boxShadow: panelOpen ? '0 20px 50px rgba(15,23,42,0.18)' : 'none',
            border: panelOpen ? '1px solid' : 'none',
            borderColor: alpha('#e2e8f0', 0.8),
            opacity: panelOpen ? 1 : 0,
            visibility: panelOpen ? 'visible' : 'hidden',
            transition: 'opacity 0.2s ease',
          }}
        >
          <NovaOpChat
            compact
            showQuickPrompts
            firstName={firstName}
            showInternalHeader
            headerActions={headerActions}
          />
        </Box>
      )}

      {!isHidden && !panelOpen && (
        <Box
          component="button"
          type="button"
          onClick={() => setState('open')}
          aria-label="Open NOVA"
          sx={{
            pointerEvents: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            border: '1px solid',
            borderColor: alpha('#e2e8f0', 0.9),
            borderRadius: 999,
            py: 1,
            pl: 1,
            pr: 2,
            bgcolor: alpha('#ffffff', 0.98),
            backdropFilter: 'blur(8px)',
            boxShadow: '0 8px 24px rgba(15,23,42,0.12)',
            cursor: 'pointer',
            transition: 'all 0.2s',
            '&:hover': {
              borderColor: '#67e8f9',
              boxShadow: '0 10px 28px rgba(34,211,238,0.18)',
            },
          }}
        >
          <NovaLogo size={40} />
          <Box
            component="span"
            sx={{
              fontWeight: 700,
              fontSize: '0.875rem',
              letterSpacing: '-0.02em',
              color: '#0f172a',
            }}
          >
            NOVA
          </Box>
          <Box
            component="span"
            sx={{
              display: { xs: 'none', sm: 'inline' },
              borderRadius: 999,
              px: 0.75,
              py: 0.25,
              fontSize: '0.5625rem',
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              bgcolor: '#f1f5f9',
              color: '#64748b',
            }}
          >
            OP
          </Box>
        </Box>
      )}
    </Box>
  );
}
