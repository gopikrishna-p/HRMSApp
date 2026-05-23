// src/screens/admin/AdminSelfServiceScreen.js
//
// Admin's personal-employee surface. Previously a 15-item monolithic section
// on AdminDashboard; refactored to its own screen with 4 thematic sub-sections
// after the dashboard outgrew a clean single-screen view.
//
// Admins land here from the AdminDashboard "My Self-Service" hero card.
// Every route here is a `My*` route in AdminNavigator that reuses an employee
// screen so the admin can act on themselves while the management screens
// (LeaveApprovals "Apply on Behalf", etc.) cover the act-for-others case.

import React, { useState, useEffect, useCallback } from 'react';
import { View, ScrollView, RefreshControl, StyleSheet } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import Section from '../../components/ui/Section';
import ListItem from '../../components/ui/ListItem';
import { useAuth } from '../../context/AuthContext';
import ApiService, { extractFrappeData, isApiSuccess } from '../../services/api.service';
import { colors } from '../../theme/colors';

const TINT = '#06B6D4';

const AdminSelfServiceScreen = ({ navigation }) => {
    const { employee } = useAuth();
    const { custom } = useTheme();

    const [pendingSettlements, setPendingSettlements] = useState(0);
    const [refreshing, setRefreshing] = useState(false);

    const fetchPendingSettlements = useCallback(async () => {
        try {
            if (!employee?.name) return;
            const response = await ApiService.getMyPendingSettlements({ employee: employee.name });
            if (!isApiSuccess(response)) {
                setPendingSettlements(0);
                return;
            }
            const data = extractFrappeData(response, {});
            setPendingSettlements(Array.isArray(data?.settlements) ? data.settlements.length : 0);
        } catch (_) {
            setPendingSettlements(0);
        }
    }, [employee?.name]);

    useEffect(() => {
        fetchPendingSettlements();
    }, [fetchPendingSettlements]);

    const onRefresh = async () => {
        setRefreshing(true);
        await fetchPendingSettlements();
        setRefreshing(false);
    };

    return (
        <ScrollView
            style={styles.container}
            contentContainerStyle={styles.content}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
            <View style={styles.header}>
                <Text style={styles.headerTitle}>My Self-Service</Text>
                <Text style={styles.headerSubtitle}>
                    Everything an employee can do for themselves — leaves, attendance, payroll,
                    profile and work. To act for another employee, use the management screens.
                </Text>
            </View>

            <Section title="Leaves & Time Off" icon="umbrella-beach" tint={TINT}>
                <ListItem
                    title="Apply Leave"
                    subtitle="Submit your own leave application (regular or compensatory advance)"
                    leftIcon="calendar-plus"
                    tint={TINT}
                    onPress={() => navigation.navigate('MyLeaveApplication')}
                />
                <ListItem
                    title="Comp-Off Request"
                    subtitle="Earn-first comp-off: work a holiday, claim a leave-day later"
                    leftIcon="calendar-check"
                    tint={TINT}
                    onPress={() => navigation.navigate('MyCompensatoryLeave')}
                />
                <ListItem
                    title="Pending Settlements"
                    subtitle="Mode-2 advance leaves awaiting settlement"
                    leftIcon="hourglass-half"
                    badge={pendingSettlements || null}
                    tint={TINT}
                    onPress={() => navigation.navigate('MyPendingSettlements')}
                />
                <ListItem
                    title="My Holiday List"
                    subtitle="Your applicable holidays for the year"
                    leftIcon="calendar-alt"
                    tint={TINT}
                    onPress={() => navigation.navigate('MyHolidayList')}
                />
            </Section>

            <Section title="Attendance & Schedule" icon="user-clock" tint={TINT}>
                <ListItem
                    title="WFH Request"
                    subtitle="Submit your own work-from-home request"
                    leftIcon="home"
                    tint={TINT}
                    onPress={() => navigation.navigate('MyWFHRequest')}
                />
                <ListItem
                    title="On-Site Request"
                    subtitle="Submit your own on-site duty request"
                    leftIcon="map-marker-alt"
                    tint={TINT}
                    onPress={() => navigation.navigate('MyOnSiteRequest')}
                />
                <ListItem
                    title="My Attendance"
                    subtitle="View your own attendance history"
                    leftIcon="history"
                    tint={TINT}
                    onPress={() => navigation.navigate('AllAttendanceAnalyticsScreen', {
                        preselectEmployee: employee?.name,
                    })}
                />
            </Section>

            <Section title="Payroll & Profile" icon="user-circle" tint={TINT}>
                <ListItem
                    title="My Profile"
                    subtitle="View and update your own profile"
                    leftIcon="id-card"
                    tint={TINT}
                    onPress={() => navigation.navigate('MyProfile')}
                />
                <ListItem
                    title="My Expense Claim"
                    subtitle="Submit your own expense claims"
                    leftIcon="receipt"
                    tint={TINT}
                    onPress={() => navigation.navigate('MyExpenseClaim')}
                />
                <ListItem
                    title="My Travel Request"
                    subtitle="Submit your own travel requests"
                    leftIcon="plane"
                    tint={TINT}
                    onPress={() => navigation.navigate('MyTravelRequest')}
                />
                <ListItem
                    title="My Salary Tracker"
                    subtitle="Request your own pending salary"
                    leftIcon="search-dollar"
                    tint={TINT}
                    onPress={() => navigation.navigate('AdminSalaryTracker', {
                        preselectEmployee: employee?.name,
                    })}
                />
                <ListItem
                    title="My Salary Structure"
                    subtitle="Your assigned earnings & deductions"
                    leftIcon="file-invoice-dollar"
                    tint={TINT}
                    onPress={() => navigation.navigate('MySalaryStructure')}
                />
            </Section>

            <Section title="Work" icon="briefcase" tint={TINT}>
                <ListItem
                    title="My Tasks"
                    subtitle="Tasks assigned to you across projects"
                    leftIcon="tasks"
                    tint={TINT}
                    onPress={() => navigation.navigate('MyTasks')}
                />
                <ListItem
                    title="My Projects"
                    subtitle="Projects you're assigned to"
                    leftIcon="project-diagram"
                    tint={TINT}
                    onPress={() => navigation.navigate('MyProjects')}
                />
                <ListItem
                    title="My Work Logs"
                    subtitle="Your personal time logs across projects"
                    leftIcon="stopwatch"
                    tint={TINT}
                    onPress={() => navigation.navigate('MyLogs')}
                />
            </Section>

            <Text style={styles.footnote}>
                Looking to apply on behalf of another employee? Use the matching Approval
                screen — each has an "Apply on Behalf" tab.
            </Text>
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 12, paddingBottom: 32 },
    header: {
        backgroundColor: colors.surface,
        borderRadius: 12,
        padding: 14,
        marginBottom: 12,
        elevation: 2,
        shadowColor: '#000',
        shadowOpacity: 0.06,
        shadowRadius: 3,
        shadowOffset: { width: 0, height: 1 },
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: colors.textPrimary,
    },
    headerSubtitle: {
        fontSize: 12,
        color: colors.textSecondary,
        marginTop: 4,
        lineHeight: 17,
    },
    footnote: {
        marginTop: 16,
        marginHorizontal: 12,
        fontSize: 11,
        color: colors.textDisabled,
        textAlign: 'center',
        fontStyle: 'italic',
    },
});

export default AdminSelfServiceScreen;
