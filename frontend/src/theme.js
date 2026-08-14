import { createTheme } from '@mui/material/styles';

export const getTheme = (mode) => {
  const isDark = mode === 'dark' || mode === 'oled';
  return createTheme({
    palette: {
      mode: isDark ? 'dark' : 'light',
      primary: {
        main: '#0A74DA', // Trustworthy medical blue
        light: '#4791db',
        dark: '#115293',
        contrastText: '#ffffff',
      },
      secondary: {
        main: '#E64A19', // For expiries
        light: '#ff7d47',
        dark: '#ac0000',
        contrastText: '#ffffff',
      },
      error: {
        main: '#E64A19',
      },
      success: {
        main: '#2E7D32',
        light: '#4caf50',
        dark: '#1b5e20',
        contrastText: '#ffffff',
      },
      background: {
        default: isDark ? (mode === 'oled' ? '#000000' : '#060913') : '#f8fafc',
        paper: isDark ? (mode === 'oled' ? '#050505' : '#0f172a') : '#ffffff',
      },
      text: {
        primary: isDark ? '#f8fafc' : '#0f172a',
        secondary: isDark ? '#94a3b8' : '#475569',
      },
      divider: isDark ? '#1e293b' : '#e2e8f0',
    },
    typography: {
      fontFamily: [
        'Inter',
        'Roboto',
        '"Helvetica Neue"',
        'Arial',
        'sans-serif',
      ].join(','),
      fontSize: 14,
      htmlFontSize: 16,
      h1: { fontSize: '2rem', fontWeight: 800 },
      h2: { fontSize: '1.5rem', fontWeight: 700 },
      h3: { fontSize: '1.25rem', fontWeight: 600 },
      h4: { fontSize: '1.1rem', fontWeight: 600 },
      h5: { fontSize: '1rem', fontWeight: 600 },
      h6: { fontSize: '0.875rem', fontWeight: 600 },
      body1: { fontSize: '0.875rem', lineHeight: 1.5 },
      body2: { fontSize: '0.75rem', lineHeight: 1.43 },
      button: { fontSize: '0.8125rem', fontWeight: 600, textTransform: 'none' },
    },
    shape: {
      borderRadius: 12,
    },
    components: {
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            boxShadow: 'none',
            '&:hover': {
              boxShadow: 'none',
            },
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            backgroundImage: 'none',
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            borderRadius: 12,
          },
        },
      },
    },
  });
};
