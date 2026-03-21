import React, { useState, useEffect, useCallback } from 'react';
import { View, ScrollView, RefreshControl, ActivityIndicator, Dimensions } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { Text, useTheme } from 'react-native-paper';
import { useAuth } from '../../context/AuthContext';
import AppHeader from '../../components/ui/AppHeader';
import Section from '../../components/ui/Section';
import ListItem from '../../components/ui/ListItem';
import StatCard from '../../components/ui/StatCard';
import Button from '../../components/common/Button';
import ApiService, { extractFrappeData, isApiSuccess, getApiErrorMessage } from '../../services/api.service';
import AttendanceService from '../../services/attendance.service';
import FCMService from '../../services/fcm.service';
import showToast from '../../utils/Toast';
import { colors } from '../../theme/colors';

const { width } = Dimensions.get('window');    const EmployeeDashboard = ({ navigation }) => {
        const { logout, employee } = useAuth();
        const { custom } = useTheme();

        const [loading, setLoading] = useState(true);
        const [refreshing, setRefreshing] = useState(false);
    const [analytics, setAnalytics] = useState({
        attendance: {
            total_working_days: 0,
            present_days: 0,
            wfh_days: 0,
            absent_days: 0,
            on_leave: 0,
            holiday_days: 0,
            late_arrivals: 0,
            total_working_hours: 0,
            avg_working_hours: 0,
            attendance_percentage: 0
        },
        leave: {
            balances: {},
            total_allocated: 0,
            total_used: 0,
            total_balance: 0,
            pending_applications: 0
        },
        thisMonth: {
            present: 0,
            wfh: 0,
            absent: 0,
            leave: 0,
            holiday: 0
        }
    });

    // Add state for calculated working hours (using same logic as AttendanceHistoryScreen)
    const [calculatedHours, setCalculatedHours] = useState({
        total_working_hours: 0,
        avg_working_hours: 0
    });

    const [pendingNotifications, setPendingNotifications] = useState(0);

    const handleLogout = async () => { await logout(); };

    // Get first day of current month
    const getFirstDayOfCurrentMonth = () => {
        const today = new Date();
        return new Date(today.getFullYear(), today.getMonth(), 1);
    };

    // Format date to YYYY-MM-DD
    const formatDate = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    // Fetch leave balance for the employee
    const fetchLeaveBalance = async () => {
        try {
            if (!employee?.name) return {};
            
            const response = await ApiService.getLeaveBalances(employee.name);
            console.log('Leave balance response:', response);
            
            if (response && response.data?.message) {
                return response.data.message || {};
            }
            return {};
        } catch (error) {
            console.error('Error fetching leave balance:', error);
            return {};
        }
    };

    // Fetch employee analytics using same approach as AttendanceHistoryScreen
    const fetchAnalytics = async () => {
        try {
            if (!employee?.name) {
                console.log('No employee ID available yet');
                return;
            }

            console.log('Fetching analytics for employee:', employee.name);

            const startDate = formatDate(getFirstDayOfCurrentMonth());
            const endDate = formatDate(new Date());

            console.log('Fetching attendance history for analytics:', {
                employee: employee.name,
                startDate,
                endDate
            });

            // Fetch attendance history using same service as AttendanceHistoryScreen
            const result = await AttendanceService.getEmployeeAttendanceHistory(
                employee.name,
                startDate,
                endDate
            );

            console.log('Attendance history result for dashboard:', result);

            if (result && result.summary_stats) {
                const summaryStats = result.summary_stats;
                
                // Also fetch leave balance separately
                const leaveBalanceData = await fetchLeaveBalance();
                
                // Process leave balances
                const processedLeaveBalances = {};
                Object.keys(leaveBalanceData).forEach(leaveType => {
                    const leave = leaveBalanceData[leaveType];
                    processedLeaveBalances[leaveType] = {
                        allocated: leave.allocated_leaves || leave.total_leaves || 0,
                        balance: leave.balance_leaves || leave.remaining_leaves || 0,
                        used: (leave.allocated_leaves || leave.total_leaves || 0) - (leave.balance_leaves || leave.remaining_leaves || 0)
                    };
                });
                
                const totalAllocated = Object.values(processedLeaveBalances).reduce((sum, l) => sum + l.allocated, 0);
                const totalBalance = Object.values(processedLeaveBalances).reduce((sum, l) => sum + l.balance, 0);
                const totalUsed = Object.values(processedLeaveBalances).reduce((sum, l) => sum + l.used, 0);

                const newAnalytics = {
                    attendance: {
                        total_working_days: summaryStats.working_days || 0,
                        present_days: summaryStats.present_days || 0,
                        wfh_days: summaryStats.wfh_days || 0,
                        absent_days: summaryStats.absent_days || 0,
                        on_leave: summaryStats.leave_days || 0,
                        holiday_days: summaryStats.holiday_days || 0,
                        late_arrivals: summaryStats.late_arrivals || 0,
                        total_working_hours: summaryStats.total_working_hours || 0,
                        avg_working_hours: summaryStats.avg_working_hours || 0,
                        attendance_percentage: Math.round(summaryStats.attendance_percentage || 0)
                    },
                    leave: {
                        balances: processedLeaveBalances,
                        total_allocated: totalAllocated,
                        total_used: totalUsed,
                        total_balance: totalBalance,
                        pending_applications: 0
                    },
                    thisMonth: {
                        present: summaryStats.present_days || 0,
                        wfh: summaryStats.wfh_days || 0,
                        absent: summaryStats.absent_days || 0,
                        leave: summaryStats.leave_days || 0,
                        holiday: summaryStats.holiday_days || 0
                    }
                };
                
                // Set calculated hours from the same result
                setCalculatedHours({
                    total_working_hours: summaryStats.total_working_hours || 0,
                    avg_working_hours: summaryStats.avg_working_hours || 0
                });
                
                console.log('Setting Analytics State:', newAnalytics);
                setAnalytics(newAnalytics);
                console.log('Analytics state updated successfully');
            } else {
                console.error('No summary stats in attendance history result');
                showToast({
                    type: 'error',
                    text1: 'Analytics Error',
                    text2: 'Unable to load attendance data'
                });
            }
            } catch (error) {
                console.error('Error fetching analytics:', error);
                showToast({
                    type: 'error',
                    text1: 'Error',
                    text2: 'Failed to load analytics data'
                });
            } finally {
                setLoading(false);
                setRefreshing(false);
            }
        };

        // Load analytics on mount and when employee changes
        useEffect(() => {
            if (employee?.name) {
                fetchAnalytics();
                fetchPendingNotifications();
                
                // Initialize FCM for push notifications
                initializeFCM();
            } else {
                setLoading(false);
            }

            // Cleanup on unmount to prevent memory leaks and API calls after logout
            return () => {
                setLoading(false);
                setRefreshing(false);
                
                // Cleanup FCM listeners
                FCMService.cleanup();
            };
        }, [employee?.name]);

    // Handle pull-to-refresh
    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchAnalytics();
        fetchPendingNotifications();
    }, [employee?.name]);

    // Fetch pending notifications from system
    const fetchPendingNotifications = async () => {
        try {
            if (!employee?.name) return;

            console.log('📢 Fetching notification stats for employee:', employee.name);
            
            // Fetch unread notification count using our notification API
            const response = await ApiService.getNotificationStats();
            if (response.success && response.data?.message?.status === 'success') {
                const stats = response.data.message.stats || { total: 0, unread: 0, urgent: 0 };
                setPendingNotifications(stats.unread || 0);
                console.log('Notification stats:', stats);
            } else {
                setPendingNotifications(0);
            }
        } catch (error) {
            console.log('Error fetching notification stats:', error);
            setPendingNotifications(0);
        }
    };
    
    // Initialize FCM for push notifications
    const initializeFCM = async () => {
        try {
            console.log('📱 Initializing FCM for employee:', employee?.name);
            
            // FCM Service handles initialization and token registration automatically
            // The token will be registered with the backend if permission is granted
            
            // Get current FCM token to verify registration
            const token = FCMService.getToken();
            if (token) {
                console.log('FCM token available:', token.substring(0, 20) + '...');
            }
        } catch (error) {
            console.error('FCM initialization error:', error);
        }
    };        // Quick stats for display - All in one row
        const quickStats = [
            { 
                id: 1, 
                icon: 'calendar-check', 
                tint: custom.palette.primary, 
                value: analytics.thisMonth.present.toString(), 
                label: 'Present' 
            },
            { 
                id: 2, 
                icon: 'home', 
                tint: colors.success, 
                value: analytics.thisMonth.wfh.toString(), 
                label: 'WFH' 
            },
            { 
                id: 3, 
                icon: 'umbrella-beach', 
                tint: colors.leave || '#9C27B0', 
                value: analytics.thisMonth.leave.toString(), 
                label: 'Leave' 
            },
            { 
                id: 4, 
                icon: 'times-circle', 
                tint: colors.error, 
                value: analytics.thisMonth.absent.toString(), 
                label: 'Absent' 
            },
        ];

        if (loading) {
            return (
                <View style={{ flex: 1, backgroundColor: custom.palette.background, justifyContent: 'center', alignItems: 'center' }}>
                    <ActivityIndicator size="large" color={custom.palette.primary} />
                    <Text style={{ marginTop: 12, color: custom.palette.textSecondary }}>Loading dashboard...</Text>
                </View>
            );
        }

        return (
            <View style={{ flex: 1, backgroundColor: custom.palette.background }}>
                <AppHeader 
                    title="logo" 
                    canGoBack={false} 
                    rightIcon="bell" 
                    badge={pendingNotifications > 0 ? pendingNotifications : null}
                    onRightPress={() => navigation.navigate('Notifications')}
                />
                

                <ScrollView 
                    contentContainerStyle={{ padding: 16, paddingBottom: 36 }} 
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl 
                            refreshing={refreshing} 
                            onRefresh={onRefresh}
                            colors={[custom.palette.primary]}
                        />
                    }
                >
                    {/* Welcome Card */}
                    <View style={{
                        backgroundColor: '#FFF', 
                        padding: 20, 
                        borderRadius: 16, 
                        marginBottom: 14,
                        elevation: 2, 
                        shadowColor: '#000', 
                        shadowOpacity: 0.08, 
                        shadowRadius: 3, 
                        shadowOffset: { width: 0, height: 1 }
                    }}>
                        <Text style={{ fontSize: 14, color: custom.palette.textSecondary }}>Welcome back!</Text>
                        <Text style={{ fontSize: 22, fontWeight: '800', marginTop: 6 }}>
                            {employee?.employee_name || 'Employee'}
                        </Text>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <Icon name="id-badge" size={13} color={custom.palette.textSecondary} />
                                <Text style={{ fontSize: 12, color: custom.palette.textSecondary, marginLeft: 6 }}>
                                    {employee?.name || 'EMP-001'}
                                </Text>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <Icon name="building" size={13} color={custom.palette.textSecondary} />
                                <Text style={{ fontSize: 12, color: custom.palette.textSecondary, marginLeft: 6 }}>
                                    {employee?.department || 'Department'}
                                </Text>
                            </View>
                        </View>
                    </View>

                    {/* Quick Stats - Single Row */}
                    <View style={{
                        flexDirection: 'row',
                        marginBottom: 8,
                        marginHorizontal: -4
                    }}>
                        {quickStats.map(s => (
                            <View key={s.id} style={{ flex: 1, paddingHorizontal: 4 }}>
                                <StatCard 
                                    icon={s.icon} 
                                    tint={s.tint} 
                                    value={s.value} 
                                    label={s.label} 
                                />
                            </View>
                        ))}
                    </View>

                    {/* Compact Analytics Card */}
                    <View style={{
                        backgroundColor: '#FFF',
                        padding: 10,
                        borderRadius: 10,
                        marginBottom: 8,
                        elevation: 2,
                        shadowColor: '#000',
                        shadowOpacity: 0.08,
                        shadowRadius: 3,
                        shadowOffset: { width: 0, height: 1 }
                    }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                            <Icon name="chart-bar" size={14} color={custom.palette.primary} />
                            <Text style={{ fontSize: 13, fontWeight: '700', marginLeft: 5, color: custom.palette.text }}>
                                This Month Summary
                            </Text>
                            <Text style={{ fontSize: 20, fontWeight: '800', color: custom.palette.primary, marginLeft: 'auto' }}>
                                {analytics.attendance.attendance_percentage}%
                            </Text>
                        </View>

                        {/* Single Row Stats */}
                        <View style={{ flexDirection: 'row', marginHorizontal: -2 }}>
                            {[
                                { label: 'Total Working Days', value: analytics.attendance.total_working_days, icon: 'calendar', color: colors.textSecondary },
                                { label: 'Hours', value: calculatedHours.total_working_hours || 0, icon: 'clock', color: colors.leave },
                                { label: 'Avg/Day', value: calculatedHours.avg_working_hours > 0 ? calculatedHours.avg_working_hours + 'h' : '0h', icon: 'hourglass-half', color: colors.success },
                            ].map((stat, index) => (
                                <View key={index} style={{ flex: 1, paddingHorizontal: 2 }}>
                                    <View style={{ 
                                        backgroundColor: colors.surfaceSecondary, 
                                        padding: 6, 
                                        borderRadius: 6,
                                        alignItems: 'center'
                                    }}>
                                        <Icon name={stat.icon} size={14} color={stat.color} />
                                        <Text style={{ fontSize: 16, fontWeight: '700', color: custom.palette.text, marginTop: 2 }}>
                                            {stat.value}
                                        </Text>
                                        <Text style={{ fontSize: 9, color: custom.palette.textSecondary }}>
                                            {stat.label}
                                        </Text>
                                    </View>
                                </View>
                            ))}
                        </View>
                    </View>

                    {/* Leave Balance Card - Ultra Compact */}
                    {Object.keys(analytics.leave.balances).length > 0 && (
                        <View style={{
                            backgroundColor: '#FFF',
                            padding: 10,
                            borderRadius: 10,
                            marginBottom: 8,
                            elevation: 2,
                            shadowColor: '#000',
                            shadowOpacity: 0.08,
                            shadowRadius: 3,
                            shadowOffset: { width: 0, height: 1 }
                        }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                                <Icon name="umbrella-beach" size={14} color={custom.palette.success} />
                                <Text style={{ fontSize: 13, fontWeight: '700', marginLeft: 5, color: custom.palette.text }}>
                                    Leave Balance
                                </Text>
                                <View style={{ 
                                    backgroundColor: custom.palette.success + '20', 
                                    paddingHorizontal: 6, 
                                    paddingVertical: 2, 
                                    borderRadius: 8,
                                    marginLeft: 'auto'
                                }}>
                                    <Text style={{ fontSize: 10, fontWeight: '600', color: custom.palette.success }}>
                                        {analytics.leave.total_balance} left
                                    </Text>
                                </View>
                            </View>

                            <View style={{ flexDirection: 'row', marginHorizontal: -2 }}>
                                {Object.keys(analytics.leave.balances).map((leaveType, index) => {
                                    const leave = analytics.leave.balances[leaveType];
                                    const usagePercentage = leave.allocated > 0 
                                        ? Math.round((leave.used / leave.allocated) * 100) 
                                        : 0;
                                    
                                    return (
                                        <View key={index} style={{ flex: 1, paddingHorizontal: 2 }}>
                                            <View style={{ 
                                                backgroundColor: colors.surfaceSecondary,
                                                padding: 6,
                                                borderRadius: 6,
                                                alignItems: 'center'
                                            }}>
                                                <Text style={{ fontSize: 10, color: custom.palette.textSecondary, marginBottom: 2 }}>
                                                    {leaveType.replace(' Leave', '')}
                                                </Text>
                                                <Text style={{ fontSize: 16, fontWeight: '700', color: custom.palette.success }}>
                                                    {leave.balance}
                                                </Text>
                                                <Text style={{ fontSize: 9, color: custom.palette.textSecondary }}>
                                                    of {leave.allocated}
                                                </Text>
                                            </View>
                                        </View>
                                    );
                                })}
                            </View>
                        </View>
                    )}

                    {/* Sections */}
                    <Section title="Attendance" icon="calendar-check" tint={custom.palette.primary}>
                        <ListItem title="Check In/Out" subtitle="Mark your attendance" leftIcon="clock"
                            tint={custom.palette.primary} onPress={() => navigation.navigate('CheckInOut')} />
                        <ListItem title="Attendance History" subtitle="View attendance records" leftIcon="history"
                            tint={custom.palette.primary} onPress={() => navigation.navigate('AttendanceHistory')} />
                        <ListItem title="WFH Request" subtitle="Apply for work from home" leftIcon="home"
                            tint={custom.palette.primary} onPress={() => navigation.navigate('WFHRequest')} />
                        <ListItem title="On Site Request" subtitle="Request to work on client site" leftIcon="map-marker-alt"
                            tint={custom.palette.primary} onPress={() => navigation.navigate('OnSiteRequest')} />
                    </Section>

                    <Section title="Leaves" icon="umbrella-beach" tint={custom.palette.success}>
                        <ListItem title="Holiday List" subtitle="View company holidays" leftIcon="calendar-alt"
                            tint={custom.palette.success} onPress={() => navigation.navigate('HolidayList')} />
                        <ListItem title="Apply Leave" subtitle="Submit leave request" leftIcon="file-alt"
                            tint={custom.palette.success} onPress={() => navigation.navigate('LeaveApplication')} />
                        <ListItem title="Comp-Off Request" subtitle="Request compensatory leave" leftIcon="exchange-alt"
                            tint={custom.palette.success} onPress={() => navigation.navigate('CompensatoryLeave')} />
                    </Section>

                    <Section title="Expense & Travel" icon="money-bill-wave" tint={custom.palette.warning}>
                        <ListItem title="Expense Claim" subtitle="Submit expense claims" leftIcon="receipt"
                            tint={custom.palette.warning} onPress={() => navigation.navigate('ExpenseClaim')} />
                        <ListItem title="Travel Request" subtitle="Request business travel" leftIcon="plane"
                            tint={custom.palette.warning} onPress={() => navigation.navigate('TravelRequest')} />
                    </Section>

                    <Section title="Projects & Tasks" icon="tasks" tint={colors.leave}>
                        <ListItem title="My Projects" subtitle="View assigned projects" leftIcon="folder-open"
                            tint={colors.leave} onPress={() => navigation.navigate('MyProjectsScreen')} />
                        <ListItem title="Daily Tasks" subtitle="Manage your daily tasks" leftIcon="clipboard-list"
                            tint={colors.leave} onPress={() => navigation.navigate('DailyTasksScreen')} />
                    </Section>

                    <Section title="Payroll" icon="wallet" tint={custom.palette.danger}>
                        <ListItem title="Salary Structure" subtitle="View salary breakdown" leftIcon="chart-pie"
                            tint={custom.palette.danger} onPress={() => navigation.navigate('SalaryStructure')} />
                        <ListItem title="Payslips" subtitle="Download payslips" leftIcon="file-invoice-dollar"
                            tint={custom.palette.danger} onPress={() => navigation.navigate('Payslip')} />
                        <ListItem title="Salary Tracker" subtitle="Track your pending salaries" leftIcon="search-dollar"
                            tint={custom.palette.danger} onPress={() => navigation.navigate('MySalaryTracker')} />
                    </Section>

                    <Section title="Other" icon="ellipsis-h" tint={colors.textSecondary}>
                        <ListItem title="Notifications" subtitle="View notifications" leftIcon="bell" badge={pendingNotifications > 0 ? pendingNotifications : null}
                            tint={colors.textSecondary} onPress={() => navigation.navigate('Notifications')} />
                        <ListItem title="Profile" subtitle="Update your profile" leftIcon="user-circle"
                            tint={colors.textSecondary} onPress={() => navigation.navigate('Profile')} />
                    </Section>

                    <Button onPress={handleLogout} style={{ marginTop: 8 }}>Logout</Button>
                </ScrollView>
            </View>
        );
    };

    export default EmployeeDashboard;
