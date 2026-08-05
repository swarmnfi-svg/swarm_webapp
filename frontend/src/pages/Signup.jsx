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
  '& .MuiFormHelperText-root': { color: O.muted },
};

export default function Signup() {
  const [form, setForm] = useState({
    name: '', email: '', mobile: '', password: '', confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [checkingSso, setCheckingSso] = useState(true);
  const [ssoAvailable, setSsoAvailable] = useState(false);
  const { signup, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    loadSsoConfig()
      .then((config) => setSsoAvailable(!!config?.saasEnabled))
      .catch(() => {})
      .finally(() => setCheckingSso(false));
  }, []);

  const handleEmpowerSignUp = async () => {
    setError('');
    try {
      const redirected = await redirectToSso('signup');
      if (!redirected) {
        setError('emPOWER sign-up is not available. Use the form below.');
      }
    } catch {
      setError('Unable to start emPOWER sign-up. Use the form below.');
    }
  };

  const updateField = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    try {
      await signup({
        name: form.name.trim(),
        email: form.email.trim(),
        mobile: form.mobile.trim() || undefined,
        password: form.password,
      });
      navigate('/dashboard');
    } catch (err) {
      const networkMsg = networkErrorMessage(err);
      if (networkMsg) {
        setError(networkMsg);
      } else {
        const apiMessage = err.response?.data?.message;
        const fieldErrors = err.response?.data?.data;
        if (fieldErrors && typeof fieldErrors === 'object') {
          setError(Object.values(fieldErrors).join('. '));
        } else {
          setError(apiMessage || 'Unable to create account. Please try again.');
        }
      }
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
            Create your account
          </Typography>
          <Typography variant="body2" sx={{ color: O.muted, textAlign: 'center', mb: 3 }}>
            Join SWARM to monitor plant health, view alerts, and connect devices.
          </Typography>

          {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}

          {ssoAvailable && (
            <>
              <Button
                fullWidth variant="outlined" size="large" onClick={handleEmpowerSignUp}
                sx={{
                  py: 1.5, borderRadius: 2, fontWeight: 600, textTransform: 'none',
                  color: O.text, borderColor: O.border,
                  '&:hover': { borderColor: O.amber, bgcolor: 'rgba(255,149,0,0.08)' },
                }}
              >
                Sign up with emPOWER account
              </Button>
              <Divider sx={{ my: 2.5, borderColor: O.border }}>
                <Typography variant="caption" sx={{ color: O.muted }}>or</Typography>
              </Divider>
            </>
          )}

          <form onSubmit={handleSubmit}>
            <TextField
              fullWidth label="Full name" margin="normal"
              value={form.name} onChange={updateField('name')} required sx={inputSx}
            />
            <TextField
              fullWidth label="Email" type="email" margin="normal"
              value={form.email} onChange={updateField('email')} required sx={inputSx}
            />
            <TextField
              fullWidth label="Mobile (optional)" type="tel" margin="normal"
              value={form.mobile} onChange={updateField('mobile')} sx={inputSx}
            />
            <TextField
              fullWidth label="Password" type={showPassword ? 'text' : 'password'} margin="normal"
              value={form.password} onChange={updateField('password')} required
              helperText="At least 6 characters" sx={inputSx}
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
            <TextField
              fullWidth label="Confirm password" type={showConfirmPassword ? 'text' : 'password'} margin="normal"
              value={form.confirmPassword} onChange={updateField('confirmPassword')} required sx={inputSx}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton onClick={() => setShowConfirmPassword(!showConfirmPassword)} edge="end" sx={{ color: O.amber }}>
                      {showConfirmPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
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
              {loading ? <CircularProgress size={24} sx={{ color: '#000' }} /> : 'Create Account'}
            </Button>
          </form>

          <Divider sx={{ my: 2.5, borderColor: O.border }} />
          <Typography variant="body2" sx={{ textAlign: 'center', color: O.muted }}>
            Already have an account?{' '}
            <Link component={RouterLink} to="/login" fontWeight={700} sx={{ color: O.amber, '&:hover': { color: O.marigold } }}>
              Sign in
            </Link>
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}
