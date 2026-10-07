// src/screens/employee/PayslipScreen.js
//
// Placeholder until the backend can generate payslips: points the employee to their
// salary structure for the monthly breakdown.
import React from 'react';
import { StyleSheet } from 'react-native';
import { Screen, EmptyState } from '../../components/ds';

const PayslipScreen = ({ navigation }) => {
    return (
        <Screen contentStyle={styles.content}>
            <EmptyState
                icon="file-text"
                title="Payslips are not available yet"
                message="Your salary structure shows the monthly breakdown of earnings and deductions."
                action="View salary structure"
                onAction={() => navigation.navigate('SalaryStructure')}
            />
        </Screen>
    );
};

const styles = StyleSheet.create({
    content: { flexGrow: 1, justifyContent: 'center' },
});

export default PayslipScreen;
