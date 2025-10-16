import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Button from '../components/common/Button';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme/colors';

const EmployeeNavigator = () => {
    const { logout, employee } = useAuth();

    const handleLogout = async () => {
        await logout();
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Employee Dashboard</Text>
            <Text style={styles.subtitle}>Welcome, {employee?.employee_name}!</Text>
            <Text style={styles.text}>Employee ID: {employee?.name}</Text>
            <Text style={styles.text}>Department: {employee?.department}</Text>
            <Button onPress={handleLogout} style={styles.button}>
                Logout
            </Button>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: colors.background,
        padding: 24,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: colors.primary,
        marginBottom: 16,
    },
    subtitle: {
        fontSize: 18,
        color: colors.textPrimary,
        marginBottom: 8,
    },
    text: {
        fontSize: 14,
        color: colors.textSecondary,
        marginBottom: 8,
    },
    button: {
        marginTop: 24,
        minWidth: 200,
    },
});

export default EmployeeNavigator;