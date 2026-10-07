// src/screens/admin/AdminSelfServiceScreen.js
//
// The admin's own employee self-service: leave, attendance, pay, expenses and work.
// Every route here is a `My*` route in AdminNavigator that reuses an employee screen so the
// admin can act on themselves; acting for others lives in the approval screens ("Apply on behalf").
import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { Screen, Group, Row, Avatar } from '../../components/ds';

const AdminSelfServiceScreen = ({ navigation }) => {
    const { employee, user } = useAuth();
    const go = (route, params) => () => navigation.navigate(route, params);
    const name = employee?.employee_name || user?.full_name || 'My profile';
    const profileSubtitle = [employee?.name, employee?.designation].filter(Boolean).join('  ·  ');

    return (
        <Screen>
            <Group>
                <Row
                    left={<Avatar name={name} size={44} />}
                    title={name}
                    subtitle={profileSubtitle || 'View and update your profile'}
                    onPress={go('MyProfile')}
                />
            </Group>

            <Group title="Leave">
                <Row icon="calendar" title="Apply for leave" onPress={go('MyLeaveApplication')} />
                <Row icon="repeat" title="Comp-off request" subtitle="Claim leave for a holiday you worked" onPress={go('MyCompensatoryLeave')} />
                <Row icon="sun" title="Holiday list" onPress={go('MyHolidayList')} />
            </Group>

            <Group title="Attendance">
                <Row
                    icon="clock"
                    title="My attendance"
                    onPress={go('AllAttendanceAnalyticsScreen', { preselectEmployee: employee?.name })}
                />
                <Row icon="home" title="WFH request" onPress={go('MyWFHRequest')} />
                <Row icon="map-pin" title="On-site request" onPress={go('MyOnSiteRequest')} />
            </Group>

            <Group title="Pay and expenses">
                <Row icon="layers" title="Salary structure" onPress={go('MySalaryStructure')} />
                <Row
                    icon="credit-card"
                    title="Salary tracker"
                    subtitle="Request pending salary"
                    onPress={go('AdminSalaryTracker', { preselectEmployee: employee?.name })}
                />
                <Row icon="file-text" title="Expense claims" onPress={go('MyExpenseClaim')} />
                <Row icon="navigation" title="Travel requests" onPress={go('MyTravelRequest')} />
            </Group>

            <Group title="Work" footer="To apply for another employee, use Apply on behalf in the matching approval screen.">
                {/* tasks and work logs belong to a project, so they open from the project */}
                <Row icon="folder" title="My projects" subtitle="Tasks and work logs" onPress={go('MyProjects')} />
            </Group>
        </Screen>
    );
};

export default AdminSelfServiceScreen;
