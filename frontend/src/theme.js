import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    primary: { main: '#0066CC', light: '#3385D6', dark: '#004C99' },
    secondary: { main: '#00A86B', light: '#33BA88', dark: '#007A4F' },
    error: { main: '#DC3545' },
    warning: { main: '#FFC107' },
    background: { default: '#F5F7FA', paper: '#FFFFFF' },
    success: { main: '#00A86B' },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    h4: { fontWeight: 700 },
    h5: { fontWeight: 700 },
    h6: { fontWeight: 600 },
  },
  shape: { borderRadius: 8 },
  components: {
    MuiCard: {
      styleOverrides: {
        root: { boxShadow: '0 2px 8px rgba(0,0,0,0.08)' },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: { textTransform: 'none', fontWeight: 500 },
      },
    },
    MuiTableContainer: {
      styleOverrides: {
        root: {
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
          maxWidth: '100%',
        },
      },
    },
    MuiTabs: {
      defaultProps: {
        variant: 'scrollable',
        scrollButtons: 'auto',
        allowScrollButtonsMobile: true,
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: ({ theme: t }) => ({
          margin: t.spacing(2),
          width: 'calc(100% - 32px)',
          maxWidth: '100%',
          [t.breakpoints.up('sm')]: {
            margin: t.spacing(4),
            width: 'auto',
            maxWidth: 600,
          },
        }),
      },
    },
    MuiCardContent: {
      styleOverrides: {
        root: ({ theme: t }) => ({
          padding: t.spacing(2),
          '&:last-child': { paddingBottom: t.spacing(2) },
          [t.breakpoints.up('sm')]: {
            padding: t.spacing(3),
            '&:last-child': { paddingBottom: t.spacing(3) },
          },
        }),
      },
    },
  },
});

export default theme;
