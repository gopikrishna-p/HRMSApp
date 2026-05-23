// src/screens/admin/AttendanceAnalyticsScreen.js
// Stub replaced with ComingSoon placeholder (Phase 4 of the parity audit).
// The closest functional equivalent today is AllAttendanceAnalyticsScreen.

import React from 'react';
import ComingSoon from '../../components/ui/ComingSoon';
import { colors } from '../../theme/colors';

const AttendanceAnalyticsScreen = ({ navigation }) => {
    return (
        <ComingSoon
            title="Attendance Analytics"
            description="Trend charts, late/early arrival patterns and absence rollups across departments are still under construction."
            suggestion="For per-employee attendance history right now, use the All Attendance screen and pick the employee from the dropdown."
            icon="chart-bar"
            accent={colors.warning}
            action={{
                label: 'Open All Attendance',
                onPress: () => navigation.navigate('AllAttendanceAnalyticsScreen'),
            }}
        />
    );
};

export default AttendanceAnalyticsScreen;
