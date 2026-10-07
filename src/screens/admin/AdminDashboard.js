// src/screens/admin/AdminDashboard.js
import React, { useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import ApiService, { isApiSuccess, extractFrappeData, getApiErrorMessage } from '../../services/api.service';
import FCMService from '../../services/fcm.service';
import {
    Screen,
    Group,
    Row,
    StatStrip,
    Count,
    IconButton,
    Loading,
    Notice,
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

const AdminDashboard = ({ navigation }) => {
    const { logout, user, employee } = useAuth();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [stats, setStats] = useState(null); // null until loaded, so a failed load shows dashes, not zeros
    const [statsError, setStatsError] = useState(null);
    const [pending, setPending] = useState({
        wfh: 0, onsite: 0, leave: 0, expense: 0, travel: 0, compLeave: 0, total: 0,
    });
    const [pendingOnboarding, setPendingOnboarding] = useState(0);
    const [leaveLeft, setLeaveLeft] = useState(null);
    const [expenseDue, setExpenseDue] = useState(0); // employees owed money for approved expense claims

    const fetchStats = async () => {
        try {
            const response = await ApiService.get('/api/method/hrms.api.get_employee_statistics');
            if (response.success && response.data?.message) {
                const d = response.data.message;
                setStatsError(null);
                setStats({
                    totalEmployees: d.totalEmployees || 0,
                    presentToday: d.presentToday || 0,
                    absentToday: d.absentToday || 0,
                    wfhToday: d.wfhToday || 0,
                    onsiteToday: d.onsiteToday || 0,
                    onLeave: d.onLeave || 0,
                    lateArrivals: d.lateArrivals || 0,
                    employeesOnHoliday: d.employeesOnHoliday || 0,
                    attendanceRate: d.attendanceRate || 0,
                });
            } else {
                setStats(null);
                setStatsError(getApiErrorMessage(response, 'Could not load today\'s numbers'));
            }
        } catch (error) {
            console.error('Dashboard stats error:', error);
            setStats(null);
            setStatsError(error?.message || 'Could not load today\'s numbers');
        }
    };

    const fetchPendingApprovals = async () => {
        const empId = employee?.name;
        if (!empId) {
            return;
        }
        try {
            const response = await ApiService.get(`/api/method/hrms.api.get_admin_pending_approvals?employee=${empId}&limit_page_length=500`);
            if (isApiSuccess(response)) {
                const a = extractFrappeData(response, {});
                const counts = {
                    wfh: a.wfh_requests?.length || 0,
                    onsite: a.on_site_requests?.length || 0,
                    leave: a.leave_applications?.length || 0,
                    expense: a.expense_claims?.length || 0,
                    travel: a.travel_requests?.length || 0,
                    compLeave: a.comp_leave_requests?.length || 0,
                };
                counts.total = Object.values(counts).reduce((x, y) => x + y, 0);
                setPending(counts);
            } else {
                console.error('Pending approvals failed:', getApiErrorMessage(response, 'Unknown error'));
            }
        } catch (error) {
            console.error('Pending approvals error:', error?.message);
        }
    };

    const fetchPendingOnboarding = async () => {
        try {
            const response = await ApiService.getOnboardingRequests({ status: 'Submitted', limit: 50 });
            const data = isApiSuccess(response) ? extractFrappeData(response, {}) : {};
            setPendingOnboarding(Array.isArray(data?.requests) ? data.requests.length : 0);
        } catch (e) {
            setPendingOnboarding(0);
        }
    };

    const fetchLeaveBalance = async () => {
        const empId = employee?.name;
        if (!empId) {
            return;
        }
        try {
            const response = await ApiService.getLeaveBalances(empId);
            const balances = isApiSuccess(response) ? response.data?.message : null;
            if (balances && typeof balances === 'object') {
                const total = Object.values(balances).reduce((sum, b) => sum + (Number(b?.balance_leaves) || 0), 0);
                setLeaveLeft(Math.round(total * 100) / 100);
            }
        } catch (error) {
            console.error('Leave balance error:', error?.message);
        }
    };

    // HR only; anyone else gets a permission error, which is ignored
    const fetchExpensePayables = async () => {
        try {
            const response = await ApiService.getExpensePayables();
            const data = isApiSuccess(response) ? extractFrappeData(response, {}) : {};
            setExpenseDue(Number(data?.employees_due) || 0);
        } catch (e) {
            setExpenseDue(0);
        }
    };

    const fetchAll = async () => {
        await Promise.all([fetchStats(), fetchPendingApprovals(), fetchPendingOnboarding(), fetchLeaveBalance(), fetchExpensePayables()]);
    };

    useEffect(() => {
        (async () => {
            setLoading(true);
            await fetchAll();
            setLoading(false);
        })();
        // FCMService registers the push token on its own; just release listeners on unmount
        return () => FCMService.cleanup();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const onRefresh = async () => {
        setRefreshing(true);
        await fetchAll();
        setRefreshing(false);
    };

    const go = (route) => () => navigation.navigate(route);
    const stat = (key) => (stats ? stats[key] : '–');
    const firstName = (employee?.employee_name || user?.full_name || '').split(' ')[0];

    const attention = [
        { key: 'leave', title: 'Leave requests', icon: 'calendar', route: 'LeaveApprovals', count: pending.leave },
        { key: 'wfh', title: 'WFH requests', icon: 'home', route: 'WFHApprovals', count: pending.wfh },
        { key: 'onsite', title: 'On-site requests', icon: 'map-pin', route: 'OnSiteApprovals', count: pending.onsite },
        { key: 'comp', title: 'Comp-off requests', icon: 'repeat', route: 'CompApprovals', count: pending.compLeave },
        { key: 'expense', title: 'Expense claims', icon: 'file-text', route: 'ExpenseClaimApproval', count: pending.expense },
        { key: 'travel', title: 'Travel requests', icon: 'navigation', route: 'TravelRequestApproval', count: pending.travel },
        { key: 'onboarding', title: 'Onboarding submissions', icon: 'user-plus', route: 'EmployeeOnboardingList', count: pendingOnboarding },
    ].filter((a) => a.count > 0);

    return (
        <View style={styles.container}>
            <TopInset />
            <View style={styles.topBar}>
                <Image source={require('../../assets/images/mainLogo.jpg')} style={styles.logo} />
                <View>
                    <IconButton name="bell" onPress={go('AdminNotifications')} color={color.text} label="Notifications" />
                    {pending.total > 0 ? <View style={styles.bellDot} /> : null}
                </View>
            </View>

            {loading ? (
                <Loading label="Loading dashboard" />
            ) : (
                <Screen refreshing={refreshing} onRefresh={onRefresh}>
                    <View style={styles.greeting}>
                        <Text style={type.display}>{greeting()}{firstName ? `, ${firstName}` : ''}</Text>
                        <Text style={styles.date}>{formatLongDate(new Date())}</Text>
                    </View>

                    {statsError ? (
                        <Notice tone="danger" icon="alert-circle" title="Could not load today's numbers" onPress={onRefresh}>
                            {`${String(statsError).replace(/\.\s*$/, '')}. Tap to try again.`}
                        </Notice>
                    ) : null}

                    <Group title="Today" action="View attendance" onAction={go('TodayAttendance')}>
                        <View style={styles.statsBlock}>
                            <StatStrip
                                style={styles.flatStrip}
                                items={[
                                    { label: 'Present', value: stat('presentToday') },
                                    { label: 'Absent', value: stat('absentToday'), tone: stats?.absentToday ? 'danger' : undefined },
                                    { label: 'On leave', value: stat('onLeave') },
                                    { label: 'WFH', value: stat('wfhToday') },
                                ]}
                            />
                            <View style={styles.stripDivider} />
                            <StatStrip
                                style={styles.flatStrip}
                                items={[
                                    { label: 'On site', value: stat('onsiteToday') },
                                    { label: 'Late', value: stat('lateArrivals'), tone: stats?.lateArrivals ? 'warning' : undefined },
                                    { label: 'Holiday', value: stat('employeesOnHoliday') },
                                    { label: 'Rate', value: stats ? `${stats.attendanceRate}%` : '–' },
                                ]}
                            />
                        </View>
                    </Group>

                    {attention.length > 0 ? (
                        <Group title="Needs your attention">
                            {attention.map((a) => (
                                <Row key={a.key} icon={a.icon} title={a.title} right={<Count value={a.count} />} onPress={go(a.route)} />
                            ))}
                        </Group>
                    ) : null}

                    <Group title="Attendance">
                        <Row icon="users" title="Today's attendance" subtitle="Who is in, on leave or absent" onPress={go('TodayAttendance')} />
                        <Row icon="edit-3" title="Manual attendance" subtitle="Fix times, submit drafts, add missing days" onPress={go('ManualCheckInOut')} />
                        <Row icon="log-in" title="Check in / out" subtitle="Your attendance and kiosk mode" onPress={go('AdminCheckInOut')} />
                        <Row icon="bar-chart-2" title="Attendance reports" subtitle="Monthly summary, salary and exports" onPress={go('AllAttendanceAnalyticsScreen')} />
                    </Group>

                    <Group title="Work arrangements">
                        <Row icon="home" title="WFH settings" onPress={go('WFHSettings')} />
                        <Row icon="inbox" title="WFH requests" right={<Count value={pending.wfh} />} onPress={go('WFHApprovals')} />
                        <Row icon="map-pin" title="On-site settings" onPress={go('OnSiteSettings')} />
                        <Row icon="inbox" title="On-site requests" right={<Count value={pending.onsite} />} onPress={go('OnSiteApprovals')} />
                    </Group>

                    <Group title="Leave">
                        <Row icon="calendar" title="Leave requests" right={<Count value={pending.leave} />} onPress={go('LeaveApprovals')} />
                        <Row icon="repeat" title="Comp-off requests" right={<Count value={pending.compLeave} />} onPress={go('CompApprovals')} />
                    </Group>

                    <Group title="Expenses and travel">
                        <Row icon="file-text" title="Expense claims" right={<Count value={pending.expense} />} onPress={go('ExpenseClaimApproval')} />
                        <Row icon="credit-card" title="Expense payments" right={<Count value={expenseDue} />} onPress={go('ExpensePayments')} />
                        <Row icon="navigation" title="Travel requests" right={<Count value={pending.travel} />} onPress={go('TravelRequestApproval')} />
                    </Group>

                    <Group title="People">
                        <Row icon="users" title="Employees" value={stats?.totalEmployees || undefined} onPress={go('EmployeeManagement')} />
                        <Row icon="user-plus" title="Onboarding" right={<Count value={pendingOnboarding} />} onPress={go('EmployeeOnboardingList')} />
                    </Group>

                    <Group title="Payroll">
                        <Row icon="layers" title="Salary structures" onPress={go('SalaryStructureAdmin')} />
                        <Row icon="credit-card" title="Salary tracker" onPress={go('AdminSalaryTracker')} />
                    </Group>

                    <Group title="Projects">
                        <Row icon="folder" title="Projects" onPress={go('ProjectsOverview')} />
                        <Row icon="check-square" title="Daily tasks" onPress={go('AdminDailyTasksScreen')} />
                    </Group>

                    <Group title="Communication">
                        <Row icon="send" title="Send a notification" onPress={go('CreateNotification')} />
                    </Group>

                    <Group title="My account" footer={employee?.name ? [user?.full_name, employee.name].filter(Boolean).join('  ·  ') : undefined}>
                        <Row icon="user" title="My self-service" subtitle="Leave, attendance, payslips and profile" onPress={go('AdminSelfService')} />
                        {leaveLeft !== null ? (
                            <Row icon="sun" title="My leave balance" value={`${leaveLeft} ${leaveLeft === 1 ? 'day' : 'days'}`} onPress={go('MyLeaveApplication')} />
                        ) : null}
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

export default AdminDashboard;
