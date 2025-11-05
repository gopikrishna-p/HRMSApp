import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../../theme/colors';

const CreateNotificationScreen = ({ navigation }) => {
    return (
        <View style={styles.container}>
            <Text style={styles.title}>Create Notification</Text>
            <Text style={styles.subtitle}>Send notifications to employees</Text>
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

export default CreateNotificationScreen;