// src/theme/theme.js
import { MD3LightTheme } from 'react-native-paper';

export const palette = {
    primary: '#6366F1',   // Indigo
    onPrimary: '#FFFFFF',
    secondary: '#14B8A6', // Teal
    danger: '#EF4444',
    warning: '#F59E0B',
    success: '#10B981',
    info: '#0EA5E9',
    background: '#F7F8FA',
    surface: '#FFFFFF',
    textPrimary: '#111827',
    textSecondary: '#6B7280',
    border: '#E5E7EB',
    muted: '#F3F4F6',
};

const base = {
    roundness: 14,
    version: 3,
    isV3: true,
};

export const theme = {
    ...MD3LightTheme,
    ...base,
    colors: {
        ...MD3LightTheme.colors,
        primary: palette.primary,
        background: palette.background,
        surface: palette.surface,
        onPrimary: palette.onPrimary,
        outline: palette.border,
        error: palette.danger,
    },
    // custom bag for easy access in components
    custom: { palette },
};

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
