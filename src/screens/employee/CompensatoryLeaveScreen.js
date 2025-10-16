import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../../theme/colors';

const CompensatoryLeaveScreen = ({ navigation }) => {
    return (
        <View style={styles.container}>
            <Text style={styles.title}>Compensatory Leave Request</Text>
            <Text style={styles.subtitle}>Request comp-off for overtime work</Text>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        color: colors.textPrimary,
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 14,
        color: colors.textSecondary,
    },
});

export default CompensatoryLeaveScreen;