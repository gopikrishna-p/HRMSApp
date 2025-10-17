// src/components/common/Button.js
import React from 'react';
import { Button as PaperButton, useTheme } from 'react-native-paper';

export default function Button({ children, mode = 'contained', style, ...props }) {
    const { colors } = useTheme();
    return (
        <PaperButton
            mode={mode}
            style={[{ borderRadius: 12, paddingVertical: 6 }, style]}
            labelStyle={{ fontWeight: '700' }}
            buttonColor={mode === 'contained' ? colors.primary : undefined}
            {...props}
        >
            {children}
        </PaperButton>
    );
}
