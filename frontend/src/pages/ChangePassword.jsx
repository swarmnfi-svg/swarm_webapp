import { useState } from 'react';
import { Box, Card, CardContent, TextField, Button, Typography, Alert } from '@mui/material';
import { authAPI } from '../services/api';

export default function ChangePassword() {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.newPassword !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    try {
      await authAPI.changePassword({ currentPassword: form.currentPassword, newPassword: form.newPassword });
      setSuccess('Password changed successfully');
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to change password');
    }
  };

  return (
    <Box sx={{ maxWidth: 500 }}>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>Change Password</Typography>
      <Card>
        <CardContent>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}
          <form onSubmit={handleSubmit}>
            <TextField fullWidth label="Current Password" type="password" margin="normal"
              value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} required />
            <TextField fullWidth label="New Password" type="password" margin="normal"
              value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} required />
            <TextField fullWidth label="Confirm New Password" type="password" margin="normal"
              value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} required />
            <Button type="submit" variant="contained" sx={{ mt: 2 }}>Update Password</Button>
          </form>
        </CardContent>
      </Card>
    </Box>
  );
}
