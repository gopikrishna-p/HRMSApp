// src/screens/admin/AttendanceManagementScreen.js
// Stub replaced with ComingSoon placeholder (Phase 4 of the parity audit).
// Bulk attendance editing already works via ManualCheckInOutScreen — this
// route is currently unreachable from AdminDashboard but kept for any code
// or deep-link that targets it. We point users at the working alternative.

import React from 'react';
import ComingSoon from '../../components/ui/ComingSoon';
import { colors } from '../../theme/colors';

const AttendanceManagementScreen = ({ navigation }) => {
    return (
        <ComingSoon
            title="Attendance Management"
            description="A consolidated attendance-management workspace is planned."
            suggestion="For bulk attendance edits (check-in/out times, deletions, auto-checkout) use the Manual Check-In/Out screen."
            icon="user-clock"
            accent={colors.primary}
            action={{
                label: 'Open Manual Check-In/Out',
                onPress: () => navigation.navigate('ManualCheckInOut'),
            }}
        />
    );
};

export default AttendanceManagementScreen;
