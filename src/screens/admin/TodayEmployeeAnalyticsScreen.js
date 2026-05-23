// src/screens/admin/TodayEmployeeAnalyticsScreen.js
// Stub replaced with ComingSoon placeholder (Phase 4 of the parity audit).
// Today's roll-up by status is already available in TodayAttendanceScreen.

import React from 'react';
import ComingSoon from '../../components/ui/ComingSoon';
import { colors } from '../../theme/colors';

const TodayEmployeeAnalyticsScreen = ({ navigation }) => {
    return (
        <ComingSoon
            title="Today Employee Analytics"
            description="Real-time counts, a department heatmap and a per-hour activity chart are still being built."
            suggestion="For the live present / absent / holiday breakdown today, use the Today's Attendance screen."
            icon="chart-pie"
            accent={colors.warning}
            action={{
                label: "Open Today's Attendance",
                onPress: () => navigation.navigate('TodayAttendance'),
            }}
        />
    );
};

export default TodayEmployeeAnalyticsScreen;
