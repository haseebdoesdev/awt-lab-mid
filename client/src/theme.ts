import { createTheme } from '@mui/material/styles';

/**
 * Light + dark colour schemes rendered as CSS variables, so switching modes
 * is instant and the user's choice (light / dark / system) is persisted by MUI.
 */
export const theme = createTheme({
  cssVariables: { colorSchemeSelector: 'class' },
  colorSchemes: {
    light: {
      palette: {
        primary: { main: '#4f46e5' },
        secondary: { main: '#0d9488' },
        background: { default: '#f4f5fb', paper: '#ffffff' },
      },
    },
    dark: {
      palette: {
        primary: { main: '#818cf8' },
        secondary: { main: '#2dd4bf' },
        background: { default: '#0d1017', paper: '#151a24' },
      },
    },
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: '"Inter Variable", "Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    button: { textTransform: 'none', fontWeight: 600 },
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      // Touch screens: small text buttons get a thumb-sized height.
      styleOverrides: { sizeSmall: { '@media (pointer: coarse)': { minHeight: 36 } } },
    },
    MuiAppBar: { defaultProps: { elevation: 0, color: 'inherit' } },
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiTooltip: { defaultProps: { arrow: true } },
    // Touch screens: small icon buttons get a thumb-sized (~36 px) tap area.
    MuiIconButton: { styleOverrides: { sizeSmall: { '@media (pointer: coarse)': { padding: 8 } } } },
  },
});
