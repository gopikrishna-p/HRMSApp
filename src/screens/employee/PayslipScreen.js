// src/screens/employee/PayslipScreen.js
// Stub replaced with ComingSoon placeholder (Phase 4 of the parity audit).
// Backend endpoint for payslip generation is not yet implemented; this is
// the A7 row in the audit (severity 🟢 Low, blocked on backend).

import React from 'react';
import ComingSoon from '../../components/ui/ComingSoon';
import { colors } from '../../theme/colors';

const PayslipScreen = ({ navigation }) => {
    return (
        <ComingSoon
            title="Payslips"
            description="Downloadable monthly payslips are not yet available in the mobile app."
            suggestion="The backend payslip endpoint is still in development. In the meantime, use your salary structure for a breakdown of earnings and deductions."
            icon="file-invoice-dollar"
            accent={colors.success}
            action={{
                label: 'View Salary Structure',
                onPress: () => navigation.navigate('SalaryStructure'),
            }}
        />
    );
};

export default PayslipScreen;
