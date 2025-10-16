import { MD3LightTheme } from 'react-native-paper';
import { colors } from './colors';

export const theme = {
    ...MD3LightTheme,
    colors: {
        ...MD3LightTheme.colors,
        primary: colors.primary,
        secondary: colors.secondary,
        error: colors.error,
        background: colors.background,
        surface: colors.surface,
        text: colors.textPrimary,
        onSurface: colors.textPrimary,
        disabled: colors.textDisabled,
        placeholder: colors.textSecondary,
        backdrop: colors.overlay,
    },
    roundness: 8,
};