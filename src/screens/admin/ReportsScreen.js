// src/screens/admin/ReportsScreen.js
// Stub replaced with ComingSoon placeholder (Phase 4 of the parity audit).
// Until the reports module is built, admins can pull per-employee data from
// the existing analytics screens or the approval-screen Statistics tabs.

import React from 'react';
import ComingSoon from '../../components/ui/ComingSoon';
import { colors } from '../../theme/colors';

const ReportsScreen = ({ navigation }) => {
    return (
        <ComingSoon
            title="Reports & Analytics"
            description="A consolidated reporting hub (payroll, attendance, leave-balance exports) is on the roadmap."
            suggestion="In the meantime: per-employee attendance exports live in All Attendance, and each approval screen has a Statistics tab."
            icon="file-export"
            accent={colors.warning}
            action={{
                label: 'Open All Attendance',
                onPress: () => navigation.navigate('AllAttendanceAnalyticsScreen'),
            }}
        />
    );
};

export default ReportsScreen;
