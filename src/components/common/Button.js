import React from 'react';
import { StyleSheet } from 'react-native';
import { Button as PaperButton } from 'react-native-paper';
import { colors } from '../../theme/colors';

const Button = ({
    mode = 'contained',
    loading = false,
    disabled = false,
    onPress,
    children,
    style,
    ...props
}) => {
    return (
        <PaperButton
            mode={mode}
            loading={loading}
            disabled={disabled || loading}
            onPress={onPress}
            style={[styles.button, style]}
            contentStyle={styles.content}
            labelStyle={styles.label}
            {...props}
        >
            {children}
        </PaperButton>
    );
};

const styles = StyleSheet.create({
    button: {
        borderRadius: 8,
    },
    content: {
        paddingVertical: 8,
    },
    label: {
        fontSize: 16,
        fontWeight: '600',
    },
});

export default Button;