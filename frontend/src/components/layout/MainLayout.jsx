import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Box, AppBar, Toolbar, Typography, IconButton, Badge, Drawer,
  List, ListItem, ListItemButton, ListItemIcon, ListItemText,
  Avatar, Menu, MenuItem, Divider, useMediaQuery, useTheme,
} from '@mui/material';
import {
  Menu as MenuIcon, Dashboard, Factory, Sensors, ShowChart,
  Notifications as NotifIcon, Psychology, Build, Assessment,
  People, Settings, Logout, Password, BluetoothConnected, MenuBook,
} from '@mui/icons-material';
import { useAuth } from '../../context/AuthContext';
import { notificationAPI } from '../../services/api';
import Logo from '../common/Logo';

const DRAWER_WIDTH = 260;
const NAV_BG = '#1e2430';

const menuItems = [
  { text: 'Dashboard', icon: <Dashboard />, path: '/dashboard', roles: ['SUPER_ADMIN', 'PLANT_ADMIN', 'OPERATOR'] },
  { text: 'Plants', icon: <Factory />, path: '/plants', roles: ['SUPER_ADMIN', 'PLANT_ADMIN'] },
  { text: 'Sensor Nodes', icon: <Sensors />, path: '/sensors', roles: ['SUPER_ADMIN', 'PLANT_ADMIN'] },
  { text: 'Connect Device', icon: <BluetoothConnected />, path: '/connect-device', roles: ['SUPER_ADMIN', 'PLANT_ADMIN', 'OPERATOR'] },
  { text: 'Analytics', icon: <ShowChart />, path: '/analytics', roles: ['SUPER_ADMIN', 'PLANT_ADMIN', 'OPERATOR'] },
  { text: 'Alerts', icon: <NotifIcon />, path: '/alerts', roles: ['SUPER_ADMIN', 'PLANT_ADMIN', 'OPERATOR'] },
  { text: 'AI Recommendations', icon: <Psychology />, path: '/ai', roles: ['SUPER_ADMIN', 'PLANT_ADMIN', 'OPERATOR'] },
  { text: 'Maintenance', icon: <Build />, path: '/maintenance', roles: ['SUPER_ADMIN', 'PLANT_ADMIN', 'OPERATOR'] },
  { text: 'Reports', icon: <Assessment />, path: '/reports', roles: ['SUPER_ADMIN', 'PLANT_ADMIN', 'OPERATOR'] },
  { text: 'Users', icon: <People />, path: '/users', roles: ['SUPER_ADMIN', 'PLANT_ADMIN'] },
  { text: 'Settings', icon: <Settings />, path: '/settings', roles: ['SUPER_ADMIN'] },
  { text: 'User Manual', icon: <MenuBook />, path: '/help', roles: ['SUPER_ADMIN', 'PLANT_ADMIN', 'OPERATOR'] },
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
  const currentPage = menuItems.find(item => item.path === location.pathname)?.text || 'Dashboard';

  const navList = (
    <List sx={{ flex: 1, py: 1, px: 1 }}>
      {filteredMenu.map((item) => {
        const selected = location.pathname === item.path;
        return (
          <ListItem key={item.path} disablePadding sx={{ mb: 0.5 }}>
            <ListItemButton
              selected={selected}
              onClick={() => { navigate(item.path); setMobileOpen(false); }}
              sx={{
                borderRadius: 2,
                '&.Mui-selected': {
                  bgcolor: 'primary.main',
                  color: 'white',
                  '&:hover': { bgcolor: 'primary.dark' },
                  '& .MuiListItemIcon-root': { color: 'white' },
                },
                '&:hover': { bgcolor: selected ? 'primary.dark' : 'action.hover' },
              }}
            >
              <ListItemIcon sx={{ color: selected ? 'white' : 'text.secondary', minWidth: 40 }}>
                {item.icon}
              </ListItemIcon>
              <ListItemText
                primary={item.text}
                primaryTypographyProps={{ fontSize: '0.9rem', fontWeight: selected ? 600 : 400 }}
              />
            </ListItemButton>
          </ListItem>
        );
      })}
    </List>
  );

  const drawerContent = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: 'background.paper' }}>
      {navList}
      <Box sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider', mt: 'auto' }}>
        <Typography variant="caption" color="text.secondary" display="block">
          Logged in as
        </Typography>
        <Typography variant="body2" fontWeight={600} noWrap>
          {user?.name}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {user?.role?.replace('_', ' ')}
        </Typography>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          zIndex: theme.zIndex.drawer + 1,
          bgcolor: NAV_BG,
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <Toolbar sx={{ minHeight: { xs: 56, sm: 64 }, gap: 1 }}>
          {isMobile && (
            <IconButton color="inherit" edge="start" onClick={() => setMobileOpen(!mobileOpen)}>
              <MenuIcon />
            </IconButton>
          )}
          <Logo height={36} sx={{ flexShrink: 0 }} />
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography
              variant="subtitle1"
              sx={{ fontWeight: 600, color: 'rgba(255,255,255,0.95)', lineHeight: 1.2 }}
              noWrap
            >
              {currentPage}
            </Typography>
            <Typography
              variant="caption"
              sx={{ color: 'rgba(255,255,255,0.55)', display: { xs: 'none', sm: 'block' } }}
              noWrap
            >
              Plant Health Monitoring
            </Typography>
          </Box>
          <IconButton color="inherit" onClick={() => navigate('/notifications')}>
            <Badge badgeContent={alertCount} color="error">
              <NotifIcon />
            </Badge>
          </IconButton>
          <IconButton onClick={(e) => setAnchorEl(e.currentTarget)}>
            <Avatar sx={{ width: 36, height: 36, bgcolor: 'secondary.main', fontSize: '0.95rem' }}>
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
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            borderRight: '1px solid',
            borderColor: 'divider',
            height: '100vh',
            top: 0,
            display: 'flex',
            flexDirection: 'column',
            pt: { xs: 0, md: '64px' },
            bgcolor: 'background.paper',
          },
        }}
      >
        {isMobile && (
          <Box sx={{ p: 2, bgcolor: NAV_BG }}>
            <Logo height={40} />
          </Box>
        )}
        {drawerContent}
      </Drawer>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh',
          width: { xs: '100%', md: `calc(100% - ${DRAWER_WIDTH}px)` },
        }}
      >
        <Toolbar sx={{ minHeight: { xs: 56, sm: 64 } }} />
        <Box sx={{ flex: 1, p: { xs: 2, sm: 3 }, width: '100%', maxWidth: '100%' }}>
          <Outlet />
        </Box>
        <Box
          component="footer"
          sx={{
            py: 2,
            px: 3,
            textAlign: 'center',
            color: 'text.secondary',
            borderTop: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.paper',
            mt: 'auto',
          }}
        >
          <Typography variant="caption">
            © 2026 SWARM by nanoFarm — AI-IoT Plant Health Monitoring System
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
