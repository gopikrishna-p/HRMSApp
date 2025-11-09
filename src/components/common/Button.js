// src/components/common/Button.js
import React from 'react';
import { Button as PaperButton, useTheme } from 'react-native-paper';

export default function Button({ children, title, mode = 'contained', style, ...props }) {
    const { colors } = useTheme();
    return (
        <PaperButton
            mode={mode}
            style={[{ borderRadius: 12, paddingVertical: 6 }, style]}
            labelStyle={{ fontWeight: '700', fontSize: 15 }}
            buttonColor={mode === 'contained' ? colors.primary : undefined}
            textColor={mode === 'contained' ? '#FFFFFF' : colors.primary}
            {...props}
        >
            {children || title}
        </PaperButton>
    );
}
