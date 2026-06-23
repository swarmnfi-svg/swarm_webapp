import { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Box, AppBar, Toolbar, Typography, IconButton, Badge, Drawer,
  List, ListItem, ListItemButton, ListItemIcon, ListItemText,
  Avatar, Menu, MenuItem, Divider, useMediaQuery, useTheme,
} from '@mui/material';
import {
  Menu as MenuIcon, Dashboard, Factory, Sensors, ShowChart,
  Notifications as NotifIcon, Psychology, Build, Assessment,
  People, Settings, Logout, Password,
} from '@mui/icons-material';
import { useAuth } from '../../context/AuthContext';
import { notificationAPI } from '../../services/api';
import Logo from '../common/Logo';
import { useEffect } from 'react';

const DRAWER_WIDTH = 260;

const menuItems = [
  { text: 'Dashboard', icon: <Dashboard />, path: '/dashboard', roles: ['SUPER_ADMIN', 'PLANT_ADMIN', 'OPERATOR'] },
  { text: 'Plants', icon: <Factory />, path: '/plants', roles: ['SUPER_ADMIN', 'PLANT_ADMIN'] },
  { text: 'Sensor Nodes', icon: <Sensors />, path: '/sensors', roles: ['SUPER_ADMIN', 'PLANT_ADMIN'] },
  { text: 'Analytics', icon: <ShowChart />, path: '/analytics', roles: ['SUPER_ADMIN', 'PLANT_ADMIN', 'OPERATOR'] },
  { text: 'Alerts', icon: <NotifIcon />, path: '/alerts', roles: ['SUPER_ADMIN', 'PLANT_ADMIN', 'OPERATOR'] },
  { text: 'AI Recommendations', icon: <Psychology />, path: '/ai', roles: ['SUPER_ADMIN', 'PLANT_ADMIN', 'OPERATOR'] },
  { text: 'Maintenance', icon: <Build />, path: '/maintenance', roles: ['SUPER_ADMIN', 'PLANT_ADMIN', 'OPERATOR'] },
  { text: 'Reports', icon: <Assessment />, path: '/reports', roles: ['SUPER_ADMIN', 'PLANT_ADMIN', 'OPERATOR'] },
  { text: 'Users', icon: <People />, path: '/users', roles: ['SUPER_ADMIN'] },
  { text: 'Settings', icon: <Settings />, path: '/settings', roles: ['SUPER_ADMIN'] },
];

export default function MainLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const [alertCount, setAlertCount] = useState(0);

  useEffect(() => {
    notificationAPI.getAll()
      .then(({ data }) => setAlertCount(data.data?.counts?.active || 0))
      .catch(() => {});
    const interval = setInterval(() => {
      notificationAPI.getAll()
        .then(({ data }) => setAlertCount(data.data?.counts?.active || 0))
        .catch(() => {});
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const filteredMenu = menuItems.filter(item => item.roles.includes(user?.role));

  const drawer = (
    <Box>
      <Box sx={{ p: 2, bgcolor: '#1e2430' }}>
        <Logo height={44} />
        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', display: 'block', mt: 0.5 }}>
          Plant Health Monitoring
        </Typography>
      </Box>
      <List sx={{ pt: 1 }}>
        {filteredMenu.map((item) => (
          <ListItem key={item.path} disablePadding>
            <ListItemButton
              selected={location.pathname === item.path}
              onClick={() => { navigate(item.path); setMobileOpen(false); }}
              sx={{ '&.Mui-selected': { bgcolor: 'primary.light', color: 'white', '& .MuiListItemIcon-root': { color: 'white' } } }}
            >
              <ListItemIcon sx={{ color: location.pathname === item.path ? 'white' : 'primary.main' }}>
                {item.icon}
              </ListItemIcon>
              <ListItemText primary={item.text} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar position="fixed" sx={{ zIndex: theme.zIndex.drawer + 1, bgcolor: '#1e2430' }}>
        <Toolbar>
          {isMobile && (
            <IconButton color="inherit" edge="start" onClick={() => setMobileOpen(!mobileOpen)} sx={{ mr: 1 }}>
              <MenuIcon />
            </IconButton>
          )}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexGrow: 1 }}>
            <Logo height={32} sx={{ display: { xs: 'none', sm: 'block' } }} />
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Plant Health Monitoring
            </Typography>
          </Box>
          <IconButton color="inherit" onClick={() => navigate('/notifications')}>
            <Badge badgeContent={alertCount} color="error">
              <NotifIcon />
            </Badge>
          </IconButton>
          <IconButton onClick={(e) => setAnchorEl(e.currentTarget)} sx={{ ml: 1 }}>
            <Avatar sx={{ width: 36, height: 36, bgcolor: 'secondary.main' }}>
              {user?.name?.charAt(0)}
            </Avatar>
          </IconButton>
          <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
            <MenuItem disabled>
              <Typography variant="body2">{user?.name}</Typography>
            </MenuItem>
            <MenuItem disabled>
              <Typography variant="caption" color="text.secondary">{user?.role?.replace('_', ' ')}</Typography>
            </MenuItem>
            <Divider />
            <MenuItem onClick={() => { setAnchorEl(null); navigate('/change-password'); }}>
              <ListItemIcon><Password fontSize="small" /></ListItemIcon> Change Password
            </MenuItem>
            <MenuItem onClick={() => { logout(); navigate('/login'); }}>
              <ListItemIcon><Logout fontSize="small" /></ListItemIcon> Logout
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      <Drawer
        variant={isMobile ? 'temporary' : 'permanent'}
        open={isMobile ? mobileOpen : true}
        onClose={() => setMobileOpen(false)}
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box', borderRight: '1px solid #e0e0e0' },
        }}
      >
        <Toolbar />
        {drawer}
      </Drawer>

      <Box component="main" sx={{ flexGrow: 1, p: 3, bgcolor: 'background.default', minHeight: '100vh' }}>
        <Toolbar />
        <Outlet />
        <Box component="footer" sx={{ mt: 4, py: 2, textAlign: 'center', color: 'text.secondary', borderTop: '1px solid #e0e0e0' }}>
          <Typography variant="body2">
            © 2026 SWARM by nanoFarm — AI-IoT Plant Health Monitoring System
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
