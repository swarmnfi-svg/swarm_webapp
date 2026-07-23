import { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  Box, Card, CardContent, TextField, Button, Typography, Alert,
  InputAdornment, IconButton, Link, CircularProgress, Divider,
} from '@mui/material';
import { Visibility, VisibilityOff, PersonAdd } from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import Logo from '../components/common/Logo';

const authShellSx = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'linear-gradient(135deg, #0066CC 0%, #00A86B 100%)',
  p: 2,
};

const cardHeaderSx = {
  textAlign: 'center',
  mb: 3,
  mx: -4,
  mt: -4,
  p: 3,
  bgcolor: '#1e2430',
  borderRadius: '12px 12px 0 0',
};

export default function Signup() {
  const [form, setForm] = useState({
    name: '', email: '', mobile: '', password: '', confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const { signup, loading } = useAuth();
  const navigate = useNavigate();

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
      const apiMessage = err.response?.data?.message;
      const fieldErrors = err.response?.data?.data;
      if (fieldErrors && typeof fieldErrors === 'object') {
        setError(Object.values(fieldErrors).join('. '));
      } else {
        setError(apiMessage || 'Unable to create account. Please try again.');
      }
    }
  };

  return (
    <Box sx={authShellSx}>
      <Card sx={{ maxWidth: 440, width: '100%', borderRadius: 3 }}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={cardHeaderSx}>
            <Logo height={52} sx={{ mx: 'auto' }} />
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 1 }}>
            <PersonAdd color="primary" fontSize="small" />
            <Typography variant="h6" fontWeight={700}>Create your account</Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mb: 2 }}>
            Join SWARM to monitor plant health, view alerts, and connect devices.
          </Typography>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          <form onSubmit={handleSubmit}>
            <TextField fullWidth label="Full name" margin="normal" value={form.name} onChange={updateField('name')} required />
            <TextField fullWidth label="Email" type="email" margin="normal" value={form.email} onChange={updateField('email')} required />
            <TextField fullWidth label="Mobile (optional)" type="tel" margin="normal" value={form.mobile} onChange={updateField('mobile')} />
            <TextField fullWidth label="Password" type={showPassword ? 'text' : 'password'} margin="normal" value={form.password} onChange={updateField('password')} required helperText="At least 6 characters"
              InputProps={{ endAdornment: (
                <InputAdornment position="end">
                  <IconButton onClick={() => setShowPassword(!showPassword)} edge="end">
                    {showPassword ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              )}} />
            <TextField fullWidth label="Confirm password" type={showConfirmPassword ? 'text' : 'password'} margin="normal" value={form.confirmPassword} onChange={updateField('confirmPassword')} required
              InputProps={{ endAdornment: (
                <InputAdornment position="end">
                  <IconButton onClick={() => setShowConfirmPassword(!showConfirmPassword)} edge="end">
                    {showConfirmPassword ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              )}} />
            <Button fullWidth type="submit" variant="contained" size="large" disabled={loading} sx={{ mt: 2, py: 1.5 }}>
              {loading ? <CircularProgress size={24} color="inherit" /> : 'Create Account'}
            </Button>
          </form>

          <Divider sx={{ my: 2.5 }} />
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
            Already have an account?{' '}
            <Link component={RouterLink} to="/login" underline="hover" fontWeight={600}>Sign in</Link>
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2, textAlign: 'center' }}>
            Create your SWARM account to access the monitoring dashboard
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}
