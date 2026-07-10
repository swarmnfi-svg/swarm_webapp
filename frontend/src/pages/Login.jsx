import { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  Box, Card, CardContent, TextField, Button, Typography, Alert,
  InputAdornment, IconButton, Link, CircularProgress, Divider,
} from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import Logo from '../components/common/Logo';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [forgotMode, setForgotMode] = useState(false);
  const [success, setSuccess] = useState('');
  const { login, loading } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid email or password');
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

  return (
    <Box sx={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #0066CC 0%, #00A86B 100%)', p: 2,
    }}>
      <Card sx={{ maxWidth: 440, width: '100%', borderRadius: 3 }}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ textAlign: 'center', mb: 3, mx: -4, mt: -4, p: 3, bgcolor: '#1e2430', borderRadius: '12px 12px 0 0' }}>
            <Logo height={52} sx={{ mx: 'auto' }} />
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mb: 2 }}>
            AI-IoT Plant Health Monitoring System
          </Typography>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

          <form onSubmit={forgotMode ? handleForgot : handleLogin}>
            <TextField
              fullWidth label="Email" type="email" margin="normal"
              value={email} onChange={(e) => setEmail(e.target.value)} required
            />
            {!forgotMode && (
              <TextField
                fullWidth label="Password" type={showPassword ? 'text' : 'password'} margin="normal"
                value={password} onChange={(e) => setPassword(e.target.value)} required
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton onClick={() => setShowPassword(!showPassword)} edge="end">
                        {showPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
            )}
            <Button
              fullWidth type="submit" variant="contained" size="large"
              disabled={loading} sx={{ mt: 2, py: 1.5, bgcolor: 'primary.main' }}
            >
              {loading ? <CircularProgress size={24} color="inherit" /> : forgotMode ? 'Send Reset Link' : 'Sign In'}
            </Button>
          </form>

          <Box sx={{ mt: 2, textAlign: 'center' }}>
            <Link
              component="button" variant="body2" type="button"
              onClick={() => { setForgotMode(!forgotMode); setError(''); setSuccess(''); }}
            >
              {forgotMode ? 'Back to Login' : 'Forgot Password?'}
            </Link>
          </Box>

          {!forgotMode && (
            <>
              <Divider sx={{ my: 2.5 }} />
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
                Don&apos;t have an account?{' '}
                <Link component={RouterLink} to="/signup" underline="hover" fontWeight={600}>
                  Sign up
                </Link>
              </Typography>
            </>
          )}

          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 3, textAlign: 'center' }}>
            Demo: admin@biopower.com / admin123
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}
