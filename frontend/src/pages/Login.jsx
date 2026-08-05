import { useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  Box, Card, CardContent, TextField, Button, Typography, Alert,
  InputAdornment, IconButton, Link, CircularProgress, Divider,
} from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import Logo from '../components/common/Logo';
import { networkErrorMessage } from '../utils/networkError';
import { loadSsoConfig, redirectToSso } from '../utils/sso';

const O = {
  amber: '#FF9500',
  marigold: '#FFB340',
  honey: '#FFCC02',
  deep: '#CC7A00',
  bg: '#0C0C0E',
  card: '#18181B',
  border: '#2E2E33',
  muted: '#98989F',
  text: '#F5F5F7',
};

const inputSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: 2,
    bgcolor: '#111114',
    color: O.text,
    '& fieldset': { borderColor: O.border },
    '&:hover fieldset': { borderColor: '#444' },
    '&.Mui-focused fieldset': { borderColor: O.amber, borderWidth: 2 },
    '&.Mui-focused': { boxShadow: '0 0 0 3px rgba(255, 149, 0, 0.18)' },
  },
  '& .MuiInputLabel-root': { color: O.muted },
  '& .MuiInputLabel-root.Mui-focused': { color: O.amber },
  '& .MuiOutlinedInput-input::placeholder': { color: O.muted },
};

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [forgotMode, setForgotMode] = useState(false);
  const [success, setSuccess] = useState('');
  const [checkingSso, setCheckingSso] = useState(true);
  const [ssoAvailable, setSsoAvailable] = useState(false);
  const { login, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    loadSsoConfig()
      .then((config) => setSsoAvailable(!!config?.saasEnabled))
      .catch(() => {})
      .finally(() => setCheckingSso(false));
  }, []);

  const handleEmpowerSignIn = async () => {
    setError('');
    try {
      const redirected = await redirectToSso('login');
      if (!redirected) {
        setError('emPOWER sign-in is not available. Use email and password below.');
      }
    } catch {
      setError('Unable to start emPOWER sign-in. Use email and password below.');
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      const networkMsg = networkErrorMessage(err);
      if (networkMsg) {
        setError(networkMsg);
      } else if (err.response.status === 401) {
        setError(err.response.data?.message || 'Invalid email or password');
      } else {
        setError(
          err.response.data?.message
          || `Server error (${err.response.status}). Ensure the backend is running on the host PC.`
        );
      }
    }
  };

  const handleForgot = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const { authAPI } = await import('../services/api');
      await authAPI.forgotPassword({ email });
      setSuccess('Password reset link sent to your email');
      setForgotMode(false);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send reset link');
    }
  };

  if (checkingSso) {
    return (
      <Box sx={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: O.bg,
      }}>
        <CircularProgress sx={{ color: O.amber }} />
      </Box>
    );
  }

  return (
    <Box sx={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      p: 2,
      bgcolor: O.bg,
      backgroundImage: `
        radial-gradient(ellipse 80% 60% at 50% -10%, rgba(255, 149, 0, 0.18) 0%, transparent 60%),
        radial-gradient(ellipse 50% 40% at 80% 100%, rgba(255, 179, 64, 0.08) 0%, transparent 50%)
      `,
    }}>
      <Card sx={{
        maxWidth: 420,
        width: '100%',
        borderRadius: 3,
        bgcolor: O.card,
        border: `1px solid ${O.border}`,
        boxShadow: '0 0 0 1px rgba(255,149,0,0.06), 0 24px 64px rgba(0,0,0,0.5)',
      }}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ textAlign: 'center', mb: 3 }}>
            <Logo height={48} sx={{ mx: 'auto', mb: 2 }} />
            <Typography variant="overline" sx={{ color: O.amber, letterSpacing: '0.12em', fontWeight: 700 }}>
              SWARM by nanoFarm
            </Typography>
            <Typography variant="body2" sx={{ color: O.muted, mt: 0.5 }}>
              AI-IoT Plant Health Monitoring
            </Typography>
          </Box>

          <Typography variant="h6" fontWeight={700} sx={{ color: O.text, textAlign: 'center', mb: 0.5 }}>
            {forgotMode ? 'Reset password' : 'Welcome back'}
          </Typography>
          <Typography variant="body2" sx={{ color: O.muted, textAlign: 'center', mb: 3 }}>
            {forgotMode ? 'Enter your email for a reset link' : 'Sign in to your account'}
          </Typography>

          {import.meta.env.DEV
            && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && (
            <Alert severity="info" sx={{ mb: 2, borderRadius: 2 }}>
              LAN access from other computers: use the host PC&apos;s network URL
              {' '}(<strong>http://192.168.29.22:3000</strong>), not <strong>localhost</strong>.
            </Alert>
          )}

          {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}
          {success && <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }}>{success}</Alert>}

          {!forgotMode && ssoAvailable && (
            <>
              <Button
                fullWidth variant="outlined" size="large" onClick={handleEmpowerSignIn}
                sx={{
                  py: 1.5, borderRadius: 2, fontWeight: 600, textTransform: 'none',
                  color: O.text, borderColor: O.border,
                  '&:hover': { borderColor: O.amber, bgcolor: 'rgba(255,149,0,0.08)' },
                }}
              >
                Sign in with emPOWER account
              </Button>
              <Divider sx={{ my: 2.5, borderColor: O.border }}>
                <Typography variant="caption" sx={{ color: O.muted }}>or</Typography>
              </Divider>
            </>
          )}

          <form onSubmit={forgotMode ? handleForgot : handleLogin}>
            <TextField
              fullWidth label="Email" type="email" margin="normal"
              value={email} onChange={(e) => setEmail(e.target.value)} required sx={inputSx}
            />
            {!forgotMode && (
              <TextField
                fullWidth label="Password" type={showPassword ? 'text' : 'password'} margin="normal"
                value={password} onChange={(e) => setPassword(e.target.value)} required sx={inputSx}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton onClick={() => setShowPassword(!showPassword)} edge="end" sx={{ color: O.amber }}>
                        {showPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
            )}
            <Button
              fullWidth type="submit" variant="contained" size="large" disabled={loading}
              sx={{
                mt: 2.5, py: 1.5, borderRadius: 2,
                fontWeight: 700, fontSize: '0.95rem', textTransform: 'none',
                color: '#000',
                bgcolor: O.amber,
                boxShadow: `0 0 24px rgba(255, 149, 0, 0.35)`,
                '&:hover': {
                  bgcolor: O.marigold,
                  boxShadow: `0 0 32px rgba(255, 179, 64, 0.45)`,
                },
              }}
            >
              {loading ? <CircularProgress size={24} sx={{ color: '#000' }} /> : forgotMode ? 'Send Reset Link' : 'Sign In'}
            </Button>
          </form>

          <Box sx={{ mt: 2, textAlign: 'center' }}>
            <Link
              component="button" variant="body2" type="button"
              onClick={() => { setForgotMode(!forgotMode); setError(''); setSuccess(''); }}
              sx={{ color: O.marigold, fontWeight: 600, '&:hover': { color: O.amber } }}
            >
              {forgotMode ? 'Back to Login' : 'Forgot Password?'}
            </Link>
          </Box>

          {!forgotMode && (
            <>
              <Divider sx={{ my: 2.5, borderColor: O.border }} />
              <Typography variant="body2" sx={{ textAlign: 'center', color: O.muted }}>
                Don&apos;t have an account?{' '}
                <Link component={RouterLink} to="/signup" fontWeight={700} sx={{ color: O.amber, '&:hover': { color: O.marigold } }}>
                  Sign up
                </Link>
              </Typography>
            </>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
