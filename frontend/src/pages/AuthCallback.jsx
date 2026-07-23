import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Box, Card, CardContent, Typography, CircularProgress, Alert, Button } from '@mui/material';
import { useAuth } from '../context/AuthContext';
import Logo from '../components/common/Logo';

export default function AuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { loginWithSsoCode } = useAuth();
  const [error, setError] = useState('');

  useEffect(() => {
    const code = searchParams.get('code');
    const err = searchParams.get('error');
    if (err) {
      setError(err);
      return;
    }
    if (!code) {
      setError('Missing authorization code from emPOWER SaaS.');
      return;
    }
    loginWithSsoCode(code)
      .then(() => navigate('/dashboard', { replace: true }))
      .catch((e) => setError(e.response?.data?.message || 'SSO login failed.'));
  }, [searchParams, loginWithSsoCode, navigate]);

  return (
    <Box sx={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #0066CC 0%, #00A86B 100%)', p: 2,
    }}>
      <Card sx={{ maxWidth: 440, width: '100%', borderRadius: 3 }}>
        <CardContent sx={{ p: 4, textAlign: 'center' }}>
          <Logo height={48} sx={{ mx: 'auto', mb: 2 }} />
          {error ? (
            <>
              <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
              <Button variant="contained" onClick={() => navigate('/login')}>Back to login</Button>
            </>
          ) : (
            <>
              <CircularProgress sx={{ mb: 2 }} />
              <Typography>Signing you in via emPOWER SaaS…</Typography>
            </>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
