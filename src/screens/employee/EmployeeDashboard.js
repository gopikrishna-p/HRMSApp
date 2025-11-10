    // src/screens/employee/EmployeeDashboard.js
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
import ApiService from '../../services/api.service';
import showToast from '../../utils/Toast';

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
                late: 0
            }
        });

        const handleLogout = async () => { await logout(); };

        // Fetch employee analytics data
        const fetchAnalytics = async () => {
            try {
                if (!employee?.name) {
                    console.log('No employee ID available yet');
                    return;
                }

                console.log('Fetching analytics for employee:', employee.name);

                // Use the new comprehensive analytics API
                const response = await ApiService.getEmployeeAnalytics({
                    employee: employee.name,
                    period: 'current_month'
                });

                console.log('Analytics API Response:', JSON.stringify(response, null, 2));

                if (response.success && response.data) {
                    // Backend returns: { message: { status: "success", data: {...}, message: "..." } }
                    // Extract the analytics data - it's nested inside message.data
                    const messageData = response.data.message;
                    let analyticsData = null;
                    
                    if (messageData && messageData.data) {
                        analyticsData = messageData.data;
                    } else if (messageData && typeof messageData === 'object' && messageData.attendance) {
                        // Sometimes the data IS the message object itself
                        analyticsData = messageData;
                    } else {
                        analyticsData = response.data;
                    }
                    
                    console.log('Extracted Analytics Data:', JSON.stringify(analyticsData, null, 2));

                    // Check if we have the attendance and leave data
                    if (analyticsData && analyticsData.attendance && analyticsData.leave) {
                        console.log('=== ANALYTICS DATA BREAKDOWN ===');
                        console.log('Attendance Data:', analyticsData.attendance);
                        console.log('Leave Data:', analyticsData.leave);
                        console.log('================================');
                        
                        // Process leave balances to ensure correct structure
                        const processedLeaveBalances = {};
                        const leaveBalances = analyticsData.leave.leave_balances || {};
                        
                        Object.keys(leaveBalances).forEach(leaveType => {
                            const leave = leaveBalances[leaveType];
                            processedLeaveBalances[leaveType] = {
                                allocated: leave.allocated_leaves || 0,
                                balance: leave.balance_leaves || 0,
                                used: (leave.allocated_leaves || 0) - (leave.balance_leaves || 0)
                            };
                        });

                        const newAnalytics = {
                            attendance: {
                                total_working_days: analyticsData.attendance.total_working_days || 0,
                                present_days: analyticsData.attendance.present_days || 0,
                                wfh_days: analyticsData.attendance.wfh_days || 0,
                                absent_days: analyticsData.attendance.absent_days || 0,
                                late_arrivals: analyticsData.attendance.late_arrivals || 0,
                                total_working_hours: analyticsData.attendance.total_working_hours || 0,
                                avg_working_hours: analyticsData.attendance.avg_working_hours || 0,
                                attendance_percentage: Math.round(analyticsData.attendance.attendance_percentage || 0)
                            },
                            leave: {
                                balances: processedLeaveBalances,
                                total_allocated: analyticsData.leave.total_allocated || 0,
                                total_used: analyticsData.leave.total_used || 0,
                                total_balance: analyticsData.leave.total_balance || 0,
                                pending_applications: analyticsData.leave.period_stats?.pending_leaves || 0
                            },
                            thisMonth: {
                                present: analyticsData.attendance.present_days || 0,
                                wfh: analyticsData.attendance.wfh_days || 0,
                                absent: analyticsData.attendance.absent_days || 0,
                                late: analyticsData.attendance.late_arrivals || 0
                            }
                        };
                        
                        console.log('Setting Analytics State:', newAnalytics);
                        setAnalytics(newAnalytics);
                        console.log('Analytics state updated successfully');
                    } else {
                        console.error('Analytics data structure unexpected:', analyticsData);
                        showToast({
                            type: 'error',
                            text1: 'Analytics Error',
                            text2: analyticsData.message || 'Analytics data format error'
                        });
                    }
                } else {
                    console.error('Analytics API failed:', response.message);
                    showToast({
                        type: 'error',
                        text1: 'Failed to Load',
                        text2: response.message || 'Failed to load analytics'
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
            } else {
                setLoading(false);
            }
        }, [employee?.name]);

        // Handle pull-to-refresh
        const onRefresh = useCallback(() => {
            setRefreshing(true);
            fetchAnalytics();
        }, [employee?.name]);

        // Quick stats for display - All in one row
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
                tint: '#10B981', 
                value: analytics.thisMonth.wfh.toString(), 
                label: 'WFH' 
            },
            { 
                id: 3, 
                icon: 'times-circle', 
                tint: '#EF4444', 
                value: analytics.thisMonth.absent.toString(), 
                label: 'Absent' 
            },
            { 
                id: 4, 
                icon: 'exclamation-triangle', 
                tint: '#F59E0B', 
                value: analytics.thisMonth.late.toString(), 
                label: 'Late' 
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
                    badge={5} 
                    onRightPress={() => navigation.navigate('NotificationScreen')}
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
                                { label: 'Total Working Days', value: analytics.attendance.total_working_days, icon: 'calendar', color: '#6B7280' },
                                { label: 'Hours', value: Math.round(analytics.attendance.total_working_hours) || 0, icon: 'clock', color: '#8B5CF6' },
                                { label: 'Avg/Day', value: analytics.attendance.avg_working_hours > 0 ? analytics.attendance.avg_working_hours.toFixed(1) + 'h' : '0h', icon: 'hourglass-half', color: '#10B981' },
                            ].map((stat, index) => (
                                <View key={index} style={{ flex: 1, paddingHorizontal: 2 }}>
                                    <View style={{ 
                                        backgroundColor: '#F9FAFB', 
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
                                                backgroundColor: '#F9FAFB',
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

                    <Section title="Projects & Tasks" icon="tasks" tint="#8B5CF6">
                        <ListItem title="My Projects" subtitle="View assigned projects" leftIcon="folder-open"
                            tint="#8B5CF6" onPress={() => navigation.navigate('MyProjectsScreen')} />
                        <ListItem title="My Tasks" subtitle="Manage your tasks" leftIcon="check-circle"
                            tint="#8B5CF6" onPress={() => navigation.navigate('MyTasksScreen')} />
                        <ListItem title="My Tasks Logs" subtitle="Manage work logs" leftIcon="check-square"
                            tint="#8B5CF6" onPress={() => navigation.navigate('MyLogsScreen')} />
                    </Section>

                    <Section title="Payroll" icon="wallet" tint={custom.palette.danger}>
                        <ListItem title="Salary Structure" subtitle="View salary breakdown" leftIcon="chart-pie"
                            tint={custom.palette.danger} onPress={() => navigation.navigate('SalaryStructure')} />
                        <ListItem title="Payslips" subtitle="Download payslips" leftIcon="file-invoice-dollar"
                            tint={custom.palette.danger} onPress={() => navigation.navigate('Payslip')} />
                    </Section>

                    <Section title="Other" icon="ellipsis-h" tint="#6B7280">
                        <ListItem title="Notifications" subtitle="View notifications" leftIcon="bell" badge="3"
                            tint="#6B7280" onPress={() => navigation.navigate('Notifications')} />
                        <ListItem title="Profile" subtitle="Update your profile" leftIcon="user-circle"
                            tint="#6B7280" onPress={() => navigation.navigate('Profile')} />
                    </Section>

                    <Button onPress={handleLogout} style={{ marginTop: 8 }}>Logout</Button>
                </ScrollView>
            </View>
        );
    };

    export default EmployeeDashboard;
