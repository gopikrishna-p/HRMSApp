// src/screens/employee/EmployeeDashboard.js
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import ApiService, { extractFrappeData } from '../../services/api.service';
import AttendanceService from '../../services/attendance.service';
import FCMService from '../../services/fcm.service';
import showToast from '../../utils/Toast';
import {
    Screen,
    Group,
    Row,
    StatStrip,
    Count,
    IconButton,
    Loading,
    color,
    space,
    type,
    formatLongDate,
    TopInset,
} from '../../components/ds';

const greeting = () => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

// YYYY-MM-DD in local time
const formatDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const formatHours = (value) => {
    const h = Number(value) || 0;
    return `${Math.round(h * 10) / 10}h`;
};

// leave balances can be fractions (earned leave accrues as 1.6666...)
const num = (value) => Math.round((Number(value) || 0) * 100) / 100;
const days = (value) => {
    const n = num(value);
    return `${n} ${n === 1 ? 'day' : 'days'}`;
};

const EMPTY_MONTH = {
    working_days: 0,
    present: 0,
    wfh: 0,
    absent: 0,
    leave: 0,
    total_hours: 0,
    avg_hours: 0,
    rate: null, // null: nothing to count yet (e.g. the 1st of the month)
};

const EmployeeDashboard = ({ navigation }) => {
    const { logout, employee } = useAuth();

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [month, setMonth] = useState(EMPTY_MONTH);
    const [monthLoaded, setMonthLoaded] = useState(false); // false until this month's attendance has loaded once
    const [leaveBalances, setLeaveBalances] = useState({});
    const [unread, setUnread] = useState(0);

    // Leave balances by type, or null when they could not be loaded (the last ones stay on screen)
    const fetchLeaveBalance = async () => {
        try {
            const response = await ApiService.getLeaveBalances(employee.name);
            const data = extractFrappeData(response, null);
            if (!data || typeof data !== 'object' || Array.isArray(data)) {
                return null;
            }
            const balances = {};
            Object.keys(data).forEach((leaveType) => {
                const leave = data[leaveType] || {};
                balances[leaveType] = {
                    allocated: leave.allocated_leaves || leave.total_leaves || 0,
                    balance: leave.balance_leaves || leave.remaining_leaves || 0,
                };
            });
            return balances;
        } catch (error) {
            console.error('Error fetching leave balance:', error);
            return null;
        }
    };

    // This month's attendance (same source as the Attendance screen) plus leave balances.
    // The two load side by side, so one failing does not hide the other.
    const fetchAnalytics = async () => {
        if (!employee?.name) {
            setLoading(false);
            setRefreshing(false);
            return;
        }
        const today = new Date();
        const startDate = formatDate(new Date(today.getFullYear(), today.getMonth(), 1));
        const endDate = formatDate(today);

        const [result, balances] = await Promise.all([
            AttendanceService.getEmployeeAttendanceHistory(employee.name, startDate, endDate).catch((error) => {
                console.error('Error fetching analytics:', error);
                return null;
            }),
            fetchLeaveBalance(),
        ]);

        if (result && result.summary_stats) {
            const s = result.summary_stats;
            const rate = Number(s.attendance_percentage);
            setMonth({
                working_days: s.working_days || 0,
                present: (s.present_days || 0) + (s.onsite_days || 0), // on-site days count as present
                wfh: s.wfh_days || 0,
                absent: s.absent_days || 0,
                leave: s.leave_days || 0,
                total_hours: s.total_working_hours || 0,
                avg_hours: s.avg_working_hours || 0,
                rate: s.attendance_percentage === null || s.attendance_percentage === undefined || !Number.isFinite(rate)
                    ? null
                    : Math.round(rate),
            });
            setMonthLoaded(true);
        } else {
            showToast({ type: 'error', text1: 'Could not load attendance', text2: 'Pull down to try again' });
        }
        if (balances) {
            setLeaveBalances(balances);
        }
        setLoading(false);
        setRefreshing(false);
    };

    const fetchUnread = async () => {
        try {
            if (!employee?.name) {
                return;
            }
            const response = await ApiService.getNotificationStats();
            if (response.success && response.data?.message?.status === 'success') {
                setUnread(response.data.message.stats?.unread || 0);
            } else {
                setUnread(0);
            }
        } catch (error) {
            setUnread(0);
        }
    };

    useEffect(() => {
        if (employee?.name) {
            fetchAnalytics();
        } else {
            setLoading(false);
        }
        // FCMService registers the push token on its own; just release listeners on unmount
        return () => FCMService.cleanup();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [employee?.name]);

    // refresh the bell after coming back from Notifications
    useFocusEffect(
        useCallback(() => {
            fetchUnread();
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [employee?.name])
    );

    const onRefresh = () => {
        setRefreshing(true);
        fetchAnalytics();
        fetchUnread();
    };

    const go = (route) => () => navigation.navigate(route);
    const firstName = (employee?.employee_name || '').split(' ')[0];
    const leaveTypes = Object.keys(leaveBalances);

    return (
        <View style={styles.container}>
            <TopInset />
            <View style={styles.topBar}>
                <Image source={require('../../assets/images/mainLogo.jpg')} style={styles.logo} />
                <View>
                    <IconButton name="bell" onPress={go('Notifications')} color={color.text} label="Notifications" />
                    {unread > 0 ? <View style={styles.bellDot} /> : null}
                </View>
            </View>

            {loading ? (
                <Loading label="Loading" />
            ) : (
                <Screen refreshing={refreshing} onRefresh={onRefresh}>
                    <View style={styles.greeting}>
                        <Text style={type.display}>{greeting()}{firstName ? `, ${firstName}` : ''}</Text>
                        <Text style={styles.date}>{formatLongDate(new Date())}</Text>
                    </View>

                    <Group>
                        <Row icon="log-in" title="Check in / out" subtitle="Mark today's attendance" onPress={go('CheckInOut')} />
                    </Group>

                    <Group title="This month" action="View attendance" onAction={go('AttendanceHistory')}>
                        {monthLoaded ? (
                            <View style={styles.statsBlock}>
                                <StatStrip
                                    style={styles.flatStrip}
                                    items={[
                                        { label: 'Present', value: month.present },
                                        { label: 'WFH', value: month.wfh },
                                        { label: 'Leave', value: month.leave },
                                        { label: 'Absent', value: month.absent, tone: month.absent ? 'danger' : undefined },
                                    ]}
                                />
                                <View style={styles.stripDivider} />
                                <StatStrip
                                    style={styles.flatStrip}
                                    items={[
                                        // "Working days" did not fit a quarter of a 320 dp screen at 1.3x text
                                        { label: 'Work days', value: month.working_days },
                                        { label: 'Hours', value: formatHours(month.total_hours) },
                                        { label: 'Avg / day', value: formatHours(month.avg_hours) },
                                        { label: 'Rate', value: month.rate === null ? '–' : `${month.rate}%` },
                                    ]}
                                />
                            </View>
                        ) : (
                            <Row icon="alert-circle" title="Could not load this month" subtitle="Pull down to try again." />
                        )}
                    </Group>

                    {leaveTypes.length > 0 ? (
                        <Group title="Leave balance" action="View leave" onAction={go('LeaveApplication')}>
                            {leaveTypes.map((leaveType) => {
                                const l = leaveBalances[leaveType];
                                return (
                                    <Row
                                        key={leaveType}
                                        title={leaveType}
                                        value={`${days(l.balance)} left`}
                                        subtitle={`of ${days(l.allocated)}`}
                                    />
                                );
                            })}
                        </Group>
                    ) : null}

                    <Group title="Attendance">
                        <Row icon="calendar" title="Attendance history" onPress={go('AttendanceHistory')} />
                        <Row icon="home" title="Work from home" onPress={go('WFHRequest')} />
                        <Row icon="map-pin" title="On-site" onPress={go('OnSiteRequest')} />
                    </Group>

                    <Group title="Leave">
                        <Row icon="sun" title="Leave" subtitle="Apply, track and cancel" onPress={go('LeaveApplication')} />
                        <Row icon="repeat" title="Comp-off" onPress={go('CompensatoryLeave')} />
                        <Row icon="flag" title="Holidays" onPress={go('HolidayList')} />
                    </Group>

                    <Group title="Expenses and travel">
                        <Row icon="file-text" title="Expense claims" onPress={go('ExpenseClaim')} />
                        <Row icon="navigation" title="Travel" onPress={go('TravelRequest')} />
                    </Group>

                    <Group title="Work">
                        <Row icon="folder" title="My projects" onPress={go('MyProjectsScreen')} />
                        <Row icon="check-square" title="Daily tasks" onPress={go('DailyTasksScreen')} />
                    </Group>

                    <Group title="Pay">
                        <Row icon="layers" title="Salary structure" onPress={go('SalaryStructure')} />
                        <Row icon="file" title="Payslips" onPress={go('Payslip')} />
                        <Row icon="credit-card" title="Salary payments" onPress={go('MySalaryTracker')} />
                    </Group>

                    <Group
                        title="My account"
                        footer={employee?.name ? [employee.name, employee.department].filter(Boolean).join('  ·  ') : undefined}
                    >
                        <Row icon="bell" title="Notifications" right={<Count value={unread} />} onPress={go('Notifications')} />
                        <Row icon="user" title="Profile" onPress={go('Profile')} />
                        <Row icon="log-out" title="Log out" destructive chevron={false} onPress={logout} />
                    </Group>
                </Screen>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: color.bg },
    topBar: {
        height: 60,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingLeft: space.lg,
        paddingRight: space.sm,
        backgroundColor: color.surface,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: color.border,
    },
    logo: { width: 116, height: 34, resizeMode: 'contain' },
    bellDot: { position: 'absolute', top: 9, right: 10, width: 8, height: 8, borderRadius: 4, backgroundColor: '#F04438', borderWidth: 1.5, borderColor: color.surface },
    greeting: { marginBottom: space.xl, paddingHorizontal: space.xs },
    date: { ...type.secondary, marginTop: 2 },
    statsBlock: { backgroundColor: color.surface },
    flatStrip: { borderWidth: 0, borderRadius: 0 },
    stripDivider: { height: StyleSheet.hairlineWidth, backgroundColor: color.divider, marginHorizontal: space.lg },
});

export default EmployeeDashboard;
