import React from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { Text } from 'react-native-paper';
import { colors } from '../../theme/colors';

const Loading = ({ message = 'Loading...', size = 'large' }) => {
    return (
        <View style={styles.container}>
            <ActivityIndicator size={size} color={colors.primary} />
            {message && <Text style={styles.text}>{message}</Text>}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: colors.background,
    },
    text: {
        marginTop: 16,
        fontSize: 16,
        color: colors.textSecondary,
    },
});

export default Loading;