import { Box, Typography, Chip, Stack, Paper, Button, alpha } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import NovaLogo from '../components/nova/NovaLogo';
import NovaOpChat from '../components/nova/NovaOpChat';
import { useAuth } from '../context/AuthContext';
import { restoreNovaAiBubble } from '../lib/novaBubbleState';

export default function NovaSpaceOp() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const firstName = user?.name?.trim().split(/\s+/)[0];

  return (
    <Box sx={{ maxWidth: 720, mx: 'auto', p: { xs: 1.5, sm: 2 } }}>
      <Paper
        elevation={0}
        sx={{
          p: 2,
          mb: 2,
          borderRadius: 3,
          border: '1px solid',
          borderColor: '#e2e8f0',
          background: 'linear-gradient(135deg, rgba(207,250,254,0.6) 0%, #ffffff 50%, rgba(237,233,254,0.4) 100%)',
        }}
      >
        <Stack direction="row" spacing={1.5} alignItems="center">
          <NovaLogo size={48} variant="logo" />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h6" fontWeight={700} sx={{ color: '#0f172a', letterSpacing: '-0.02em' }}>
              NOVA Space OP
            </Typography>
            <Typography variant="body2" sx={{ color: '#64748b' }}>
              Your permission-aware plant telemetry assistant for SWARM
            </Typography>
          </Box>
          <Chip
            size="small"
            label="Read-only"
            sx={{
              fontSize: '0.625rem',
              fontWeight: 600,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              bgcolor: alpha('#64748b', 0.08),
              color: '#64748b',
            }}
          />
        </Stack>
      </Paper>

      <Paper
        elevation={0}
        sx={{
          borderRadius: 3,
          border: '1px solid',
          borderColor: '#e2e8f0',
          overflow: 'hidden',
          boxShadow: '0 4px 24px rgba(15,23,42,0.06)',
        }}
      >
        <NovaOpChat showQuickPrompts firstName={firstName} />
      </Paper>

      <Box
        sx={{
          mt: 2,
          p: 2,
          borderRadius: 2,
          border: '1px solid #e2e8f0',
          bgcolor: alpha('#f8fafc', 0.8),
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          alignItems: { sm: 'center' },
          justifyContent: 'space-between',
          gap: 1.5,
        }}
      >
        <Typography variant="body2" sx={{ color: '#64748b' }}>
          Use the floating NOVA bubble on other pages for quick plant questions without leaving your workflow.
        </Typography>
        <Button
          variant="outlined"
          size="small"
          onClick={() => {
            restoreNovaAiBubble('minimized');
            navigate(-1);
          }}
          sx={{ textTransform: 'none', flexShrink: 0, borderColor: '#e2e8f0', color: '#334155' }}
        >
          Show floating bubble
        </Button>
      </Box>
    </Box>
  );
}
