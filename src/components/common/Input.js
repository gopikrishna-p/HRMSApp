import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { TextInput, HelperText } from 'react-native-paper';
import { colors } from '../../theme/colors';

const Input = ({
    label,
    value,
    onChangeText,
    error,
    helperText,
    secureTextEntry = false,
    ...props
}) => {
    const [showPassword, setShowPassword] = useState(false);

    return (
        <View style={styles.container}>
            <TextInput
                label={label}
                value={value}
                onChangeText={onChangeText}
                error={!!error}
                secureTextEntry={secureTextEntry && !showPassword}
                mode="outlined"
                style={styles.input}
                right={
                    secureTextEntry ? (
                        <TextInput.Icon
                            icon={showPassword ? 'eye-off' : 'eye'}
                            onPress={() => setShowPassword(!showPassword)}
                        />
                    ) : null
                }
                {...props}
            />
            {(error || helperText) && (
                <HelperText type={error ? 'error' : 'info'} visible={true}>
                    {error || helperText}
                </HelperText>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginBottom: 16,
    },
    input: {
        backgroundColor: colors.white,
    },
});

export default Input;