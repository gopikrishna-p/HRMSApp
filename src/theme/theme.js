// src/theme/theme.js
import { MD3LightTheme, MD3DarkTheme } from 'react-native-paper';

// Light palette
export const lightPalette = {
  primary: '#6366F1',
  onPrimary: '#FFFFFF',
  secondary: '#14B8A6',
  danger: '#EF4444',
  warning: '#F59E0B',
  success: '#10B981',
  info: '#0EA5E9',
  background: '#F7F8FA',
  surface: '#FFFFFF',
  surfaceVariant: '#F3F4F6',
  card: '#FFFFFF',
  textPrimary: '#111827',
  textSecondary: '#6B7280',
  textTertiary: '#9CA3AF',
  border: '#E5E7EB',
  muted: '#F3F4F6',
  overlay: 'rgba(0, 0, 0, 0.5)',
};

// Dark palette
export const darkPalette = {
  primary: '#818CF8',
  onPrimary: '#1F2937',
  secondary: '#2DD4BF',
  danger: '#F87171',
  warning: '#FBBF24',
  success: '#34D399',
  info: '#38BDF8',
  background: '#0F172A',
  surface: '#1E293B',
  surfaceVariant: '#334155',
  card: '#1E293B',
  textPrimary: '#F9FAFB',
  textSecondary: '#9CA3AF',
  textTertiary: '#6B7280',
  border: '#374151',
  muted: '#1F2937',
  overlay: 'rgba(0, 0, 0, 0.7)',
};

// Keep backward compatibility
export const palette = lightPalette;

const base = {
  roundness: 14,
  version: 3,
  isV3: true,
};

// Light theme for react-native-paper
export const lightTheme = {
  ...MD3LightTheme,
  ...base,
  colors: {
    ...MD3LightTheme.colors,
    primary: lightPalette.primary,
    background: lightPalette.background,
    surface: lightPalette.surface,
    surfaceVariant: lightPalette.surfaceVariant,
    onPrimary: lightPalette.onPrimary,
    outline: lightPalette.border,
    error: lightPalette.danger,
  },
  custom: { palette: lightPalette },
};

// Dark theme for react-native-paper
export const darkTheme = {
  ...MD3DarkTheme,
  ...base,
  dark: true,
  colors: {
    ...MD3DarkTheme.colors,
    primary: darkPalette.primary,
    background: darkPalette.background,
    surface: darkPalette.surface,
    surfaceVariant: darkPalette.surfaceVariant,
    onPrimary: darkPalette.onPrimary,
    outline: darkPalette.border,
    error: darkPalette.danger,
  },
  custom: { palette: darkPalette },
};

// Default export for backward compatibility
export const theme = lightTheme;

// Helper to get theme based on dark mode
export const getTheme = (isDark) => isDark ? darkTheme : lightTheme;

// Optional: Typography guide (use when needed)
export const typography = {
  h1: { fontSize: 28, fontWeight: '800' },
  h2: { fontSize: 22, fontWeight: '700' },
  h3: { fontSize: 18, fontWeight: '700' },
  subtitle: { fontSize: 14, fontWeight: '600' },
  body: { fontSize: 14, fontWeight: '500' },
  caption: { fontSize: 12, fontWeight: '500' },
  tiny: { fontSize: 11, fontWeight: '500' },
};

