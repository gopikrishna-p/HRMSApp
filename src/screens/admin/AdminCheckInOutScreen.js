import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../../theme/colors';

const AdminCheckInOutScreen = ({ navigation }) => {
    return (
        <View style={styles.container}>
            <Text style={styles.title}>Admin Check-In/Out</Text>
            <Text style={styles.subtitle}>Kiosk/Supervisor mode</Text>
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

export default AdminCheckInOutScreen;