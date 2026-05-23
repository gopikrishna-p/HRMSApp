// src/screens/admin/AdminDashboard.js
import React, { useState, useEffect } from 'react';
import {
    View,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    RefreshControl,
    Modal,
    FlatList,
    ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { Text, useTheme } from 'react-native-paper';
import { useAuth } from '../../context/AuthContext';
import AppHeader from '../../components/ui/AppHeader';
import Section from '../../components/ui/Section';
import ListItem from '../../components/ui/ListItem';
import StatCard from '../../components/ui/StatCard';
import Button from '../../components/common/Button';
import ApiService, { isApiSuccess, extractFrappeData, getApiErrorMessage } from '../../services/api.service';
import FCMService from '../../services/fcm.service';
import showToast from '../../utils/Toast';

const AdminDashboard = ({ navigation }) => {
    const { logout, user, employee } = useAuth();
    const { custom } = useTheme();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [stats, setStats] = useState({
        totalEmployees: 0,
        presentToday: 0,
        absentToday: 0,
        wfhToday: 0,
        onsiteToday: 0,
        onLeave: 0,
        lateArrivals: 0,
        employeesOnHoliday: 0,
        workingEmployees: 0,
        attendanceRate: 0,
    });

    const [pendingData, setPendingData] = useState({
        wfhApprovals: 0,
        onsiteApprovals: 0,
        leaveApprovals: 0,
        expenseApprovals: 0,
        travelApprovals: 0,
        compLeaveApprovals: 0,
        notifications: 0,
    });

    // Leave balance state for admin (if they are also an employee)
    const [leaveBalance, setLeaveBalance] = useState({
        balances: {},
        total_allocated: 0,
        total_used: 0,
        total_balance: 0
    });

    const [pendingSettlements, setPendingSettlements] = useState({ count: 0, earliestDeadline: null });

    const handleLogout = async () => {
        await logout();
    };

    // Fetch the admin's own pending Mode-2 (Compensatory Advance) settlements.
    // Admin is also an employee, so they can apply a Mode-2 leave on themselves
    // via the `MyLeaveApplication` route — this card surfaces the deadlines
    // exactly like the EmployeeDashboard does.
    const fetchPendingSettlements = async () => {
        try {
            if (!employee?.name) return;
            const response = await ApiService.getMyPendingSettlements({ employee: employee.name });
            if (!isApiSuccess(response)) {
                setPendingSettlements({ count: 0, earliestDeadline: null });
                return;
            }
            const data = extractFrappeData(response, {});
            const list = Array.isArray(data?.settlements) ? data.settlements : [];
            const earliest = list.reduce((acc, s) => {
                if (!s.month_end) return acc;
                if (!acc) return s.month_end;
                return new Date(s.month_end) < new Date(acc) ? s.month_end : acc;
            }, null);
            setPendingSettlements({ count: list.length, earliestDeadline: earliest });
        } catch (e) {
            setPendingSettlements({ count: 0, earliestDeadline: null });
        }
    };

    useEffect(() => {
        fetchDashboardData();
        
        // Initialize FCM for push notifications
        initializeFCM();

        // Cleanup on unmount to prevent memory leaks
        return () => {
            setLoading(false);
            setRefreshing(false);
            
            // Cleanup FCM listeners
            FCMService.cleanup();
        };
    }, []);

    const fetchDashboardData = async () => {
        try {
            setLoading(true);
            await Promise.all([
                fetchDashboardStats(),
                fetchPendingApprovals(),
                fetchLeaveBalance(),
                fetchPendingSettlements(),
            ]);
        } catch (error) {
            console.error('Dashboard load error:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchLeaveBalance = async () => {
        try {
            const empId = employee?.name;
            if (!empId) {
                console.log('⚠️ No employee ID for admin, skipping leave balance fetch');
                return;
            }

            const response = await ApiService.getLeaveBalances(empId);
            console.log('📋 Leave balance response:', response);
            
            if (response && response.data?.message) {
                const balanceData = response.data.message;
                
                // Process leave balances
                const processedBalances = {};
                let totalAllocated = 0;
                let totalBalance = 0;
                
                Object.keys(balanceData).forEach(leaveType => {
                    const leave = balanceData[leaveType];
                    const allocated = leave.allocated_leaves || 0;
                    const balance = leave.balance_leaves || 0;
                    processedBalances[leaveType] = {
                        allocated: allocated,
                        balance: balance,
                        used: allocated - balance
                    };
                    totalAllocated += allocated;
                    totalBalance += balance;
                });
                
                setLeaveBalance({
                    balances: processedBalances,
                    total_allocated: totalAllocated,
                    total_used: totalAllocated - totalBalance,
                    total_balance: totalBalance
                });
                
                console.log('✅ Leave balance loaded:', { totalAllocated, totalBalance });
            }
        } catch (error) {
            console.error('❌ Error fetching leave balance:', error?.message);
        }
    };

    const fetchDashboardStats = async () => {
        try {
            const response = await ApiService.get('/api/method/hrms.api.get_employee_statistics');
            if (response.success && response.data?.message) {
                const data = response.data.message;
                setStats(prev => ({
                    ...prev,
                    totalEmployees: data.totalEmployees || 0,
                    presentToday: data.presentToday || 0,
                    absentToday: data.absentToday || 0,
                    wfhToday: data.wfhToday || 0,
                    onsiteToday: data.onsiteToday || 0,
                    onLeave: data.onLeave || 0,
                    lateArrivals: data.lateArrivals || 0,
                    employeesOnHoliday: data.employeesOnHoliday || 0,
                    workingEmployees: data.workingEmployees || 0,
                    attendanceRate: data.attendanceRate || 0,
                }));
            }
        } catch (error) {
            console.error('Dashboard stats error:', error);
        }
    };

    const fetchPendingApprovals = async () => {
        try {
            const empId = employee?.name;
            console.log('📋 Fetching admin pending approvals for:', empId);

            // Skip if employee ID is missing
            if (!empId) {
                console.log('⚠️ No employee ID, skipping approval fetch');
                return;
            }

            // Use new comprehensive admin approval API
            const response = await ApiService.get(`/api/method/hrms.api.get_admin_pending_approvals?employee=${empId}&limit_page_length=500`);
            console.log('📋 Raw response from get_admin_pending_approvals:', response);
            
            if (isApiSuccess(response)) {
                const approvals = extractFrappeData(response, {});
                console.log('✅ Raw approvals data:', {
                    leave: approvals.leave_applications?.length || 0,
                    expense: approvals.expense_claims?.length || 0,
                    wfh: approvals.wfh_requests?.length || 0,
                    onsite: approvals.on_site_requests?.length || 0,
                    travel: approvals.travel_requests?.length || 0,
                    compLeave: approvals.comp_leave_requests?.length || 0,
                });
                
                const data = {
                    wfhApprovals: approvals.wfh_requests?.length || 0,
                    onsiteApprovals: approvals.on_site_requests?.length || 0,
                    leaveApprovals: approvals.leave_applications?.length || 0,
                    expenseApprovals: approvals.expense_claims?.length || 0,
                    travelApprovals: approvals.travel_requests?.length || 0,
                    compLeaveApprovals: approvals.comp_leave_requests?.length || 0,
                };
                
                data.notifications = data.wfhApprovals + data.onsiteApprovals + data.leaveApprovals + data.expenseApprovals + 
                                    data.travelApprovals + data.compLeaveApprovals;
                
                console.log('✅ Admin pending approvals fetched:', {
                    leave: data.leaveApprovals,
                    expense: data.expenseApprovals,
                    wfh: data.wfhApprovals,
                    onsite: data.onsiteApprovals,
                    travel: data.travelApprovals,
                    compLeave: data.compLeaveApprovals,
                    total: data.notifications
                });
                
                setPendingData(data);
            } else {
                console.error('❌ Failed to fetch approvals:', getApiErrorMessage(response, 'Unknown error'));
            }
        } catch (error) {
            console.error('❌ Error fetching pending approvals:', error?.message);
            // Silently fail - don't show error to user
        }
    };

    // Initialize FCM for push notifications
    const initializeFCM = async () => {
        try {
            console.log('📱 Initializing FCM for admin:', employee?.name || user?.name);
            
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
    };

    const onRefresh = async () => {
        setRefreshing(true);
        await fetchDashboardData();
        setRefreshing(false);
    };

    // Quick stats: rendered as a 3-per-row grid. Backend `get_employee_statistics`
    // already returns `employeesOnHoliday` (and `workingEmployees`); we surface the
    // former here so the grid is a clean 3×3 and "On Holiday" gets its own tile —
    // a distinct attendance status from On Leave (Holiday = no work expected per
    // the employee's holiday list; Leave = approved absence from a working day).
    const quickStats = [
        { id: 1, icon: 'users', tint: custom.palette.primary, value: String(stats.totalEmployees), label: 'Total Employees' },
        { id: 2, icon: 'user-check', tint: custom.palette.success, value: String(stats.presentToday), label: 'Present Today' },
        { id: 3, icon: 'user-times', tint: custom.palette.danger, value: String(stats.absentToday), label: 'Absent' },
        { id: 4, icon: 'home', tint: custom.palette.warning, value: String(stats.wfhToday), label: 'WFH' },
        { id: 5, icon: 'map-marker-alt', tint: '#2196F3', value: String(stats.onsiteToday), label: 'On Site', iconSize: 20 },
        { id: 6, icon: 'umbrella-beach', tint: '#8B5CF6', value: String(stats.onLeave), label: 'On Leave' },
        { id: 7, icon: 'clock', tint: '#F59E0B', value: String(stats.lateArrivals), label: 'Late Arrivals' },
        { id: 8, icon: 'gift', tint: '#14B8A6', value: String(stats.employeesOnHoliday), label: 'On Holiday' },
        { id: 9, icon: 'chart-pie', tint: '#EC4899', value: `${stats.attendanceRate}%`, label: 'Attendance Rate' },
    ];

    return (
        <View style={{ flex: 1, backgroundColor: custom.palette.background }}>
            <AppHeader 
                title="logo" 
                canGoBack={false} 
                rightIcon="bell" 
                badge={pendingData.notifications > 0 ? pendingData.notifications : null}
                onRightPress={() => navigation.navigate('AdminNotifications')} 
            />

            {loading ? (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <ActivityIndicator size="large" color={custom.palette.primary} />
                    <Text style={{ marginTop: 12, color: custom.palette.textSecondary }}>Loading dashboard...</Text>
                </View>
            ) : (
                <ScrollView 
                    contentContainerStyle={{ padding: 16, paddingBottom: 36 }} 
                    showsVerticalScrollIndicator={false}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                >
                {/* Welcome */}
                <View style={{
                    backgroundColor: '#FFF', padding: 20, borderRadius: 16, marginBottom: 14,
                    elevation: 2, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }
                }}>
                    <Text style={{ fontSize: 14, color: custom.palette.textSecondary }}>Welcome back!</Text>
                    <Text style={{ fontSize: 22, fontWeight: '800', marginTop: 6 }}>
                        {user?.full_name || 'Admin'}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                        <Icon name="shield-alt" size={13} color={custom.palette.primary} />
                        <Text style={{ fontSize: 13, color: custom.palette.primary, marginLeft: 6, fontWeight: '600' }}>
                            {user?.roles?.join(', ') || 'Administrator'}
                        </Text>
                    </View>
                    {employee?.name ? (
                        <Text style={{ fontSize: 11, color: custom.palette.textSecondary, marginTop: 4 }}>ID: {employee.name}</Text>
                    ) : null}
                </View>

                {/* Stats - Compact Minimal Layout */}
                <View style={{
                    backgroundColor: '#FFF',
                    borderRadius: 12,
                    padding: 16,
                    marginBottom: 14,
                    elevation: 2,
                    shadowColor: '#000',
                    shadowOpacity: 0.08,
                    shadowRadius: 3,
                    shadowOffset: { width: 0, height: 1 }
                }}>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                        {quickStats.map(s => (
                            <View key={s.id} style={{ 
                                width: '32%', 
                                marginBottom: 12,
                                alignItems: 'center',
                                paddingVertical: 8
                            }}>
                                <View style={{
                                    backgroundColor: s.tint,
                                    borderRadius: 8,
                                    padding: 8,
                                    marginBottom: 6
                                }}>
                                    <Icon name={s.icon} size={s.iconSize || 16} color="#FFF" />
                                </View>
                                <Text style={{
                                    fontSize: 18,
                                    fontWeight: '700',
                                    color: '#000',
                                    marginBottom: 2
                                }}>
                                    {s.value}
                                </Text>
                                <Text style={{
                                    fontSize: 10,
                                    color: custom.palette.textSecondary,
                                    textAlign: 'center'
                                }}>
                                    {s.label}
                                </Text>
                            </View>
                        ))}
                    </View>
                </View>

                {/* Leave Balance Card - Only show if admin is also an employee */}
                {employee?.name && Object.keys(leaveBalance.balances).length > 0 && (
                    <View style={{
                        backgroundColor: '#FFF',
                        borderRadius: 12,
                        padding: 16,
                        marginBottom: 14,
                        elevation: 2,
                        shadowColor: '#000',
                        shadowOpacity: 0.08,
                        shadowRadius: 3,
                        shadowOffset: { width: 0, height: 1 }
                    }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <View style={{ backgroundColor: '#8B5CF6', borderRadius: 8, padding: 8, marginRight: 10 }}>
                                    <Icon name="umbrella-beach" size={16} color="#FFF" />
                                </View>
                                <Text style={{ fontSize: 16, fontWeight: '700', color: '#000' }}>My Leave Balance</Text>
                            </View>
                            <View style={{ backgroundColor: '#F0F9FF', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
                                <Text style={{ fontSize: 12, fontWeight: '600', color: '#8B5CF6' }}>
                                    {leaveBalance.total_balance} left
                                </Text>
                            </View>
                        </View>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                            {Object.keys(leaveBalance.balances).map((leaveType, index) => {
                                const leave = leaveBalance.balances[leaveType];
                                const colors = ['#10B981', '#3B82F6', '#F59E0B', '#EC4899', '#8B5CF6'];
                                const color = colors[index % colors.length];
                                return (
                                    <View key={leaveType} style={{ 
                                        width: '48%', 
                                        backgroundColor: '#F8FAFC',
                                        borderRadius: 8,
                                        padding: 10,
                                        marginBottom: 8
                                    }}>
                                        <Text style={{ fontSize: 11, color: '#6B7280', marginBottom: 4 }} numberOfLines={1}>
                                            {leaveType}
                                        </Text>
                                        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                                            <Text style={{ fontSize: 18, fontWeight: '700', color: color }}>
                                                {leave.balance}
                                            </Text>
                                            <Text style={{ fontSize: 11, color: '#9CA3AF', marginLeft: 4 }}>
                                                / {leave.allocated}
                                            </Text>
                                        </View>
                                    </View>
                                );
                            })}
                        </View>
                    </View>
                )}

                {/* My Pending Compensatory Settlements (Mode-2) — admin-as-employee surface */}
                {pendingSettlements.count > 0 && (() => {
                    const deadline = pendingSettlements.earliestDeadline
                        ? new Date(pendingSettlements.earliestDeadline)
                        : null;
                    const today = new Date(); today.setHours(0, 0, 0, 0);
                    const daysLeft = deadline
                        ? Math.round((deadline - today) / (1000 * 60 * 60 * 24))
                        : null;
                    const urgent = daysLeft !== null && daysLeft <= 7;
                    const accent = urgent ? custom.palette.danger : custom.palette.warning;
                    return (
                        <TouchableOpacity
                            activeOpacity={0.85}
                            onPress={() => navigation.navigate('MyPendingSettlements')}
                            style={{
                                backgroundColor: '#FFF',
                                padding: 12,
                                borderRadius: 10,
                                marginBottom: 14,
                                borderLeftWidth: 4,
                                borderLeftColor: accent,
                                flexDirection: 'row',
                                alignItems: 'center',
                                elevation: 2,
                                shadowColor: '#000',
                                shadowOpacity: 0.08,
                                shadowRadius: 3,
                                shadowOffset: { width: 0, height: 1 },
                            }}
                        >
                            <View style={{
                                width: 40, height: 40, borderRadius: 10,
                                backgroundColor: accent + '26',
                                alignItems: 'center', justifyContent: 'center', marginRight: 10,
                            }}>
                                <Icon name="hourglass-half" size={18} color={accent} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 13, fontWeight: '700', color: custom.palette.textPrimary }}>
                                    {pendingSettlements.count} pending settlement{pendingSettlements.count > 1 ? 's' : ''}
                                </Text>
                                <Text style={{ fontSize: 11, color: custom.palette.textSecondary, marginTop: 2 }}>
                                    {daysLeft !== null
                                        ? (daysLeft < 0
                                            ? 'Deadline passed — forfeit imminent'
                                            : `Settle by ${deadline.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} (${daysLeft} day${daysLeft === 1 ? '' : 's'} left)`)
                                        : 'Compensatory advance leaves on credit'}
                                </Text>
                            </View>
                            <Icon name="chevron-right" size={14} color="#9CA3AF" />
                        </TouchableOpacity>
                    );
                })()}

                {/* Sections */}
                <Section title="Attendance Control" icon="clipboard-check" tint={custom.palette.primary}>
                    <ListItem title="Admin Check In/Out" subtitle="Kiosk/Supervisor mode" leftIcon="user-clock"
                        tint={custom.palette.primary} onPress={() => navigation.navigate('AdminCheckInOut')} />
                    <ListItem title="Manual Check In/Out" subtitle="Attendance regularization" leftIcon="edit"
                        tint={custom.palette.primary} onPress={() => navigation.navigate('ManualCheckInOut')} />
                    <ListItem title="Today's Attendance" subtitle="Live attendance view" leftIcon="calendar-day"
                        tint={custom.palette.primary} onPress={() => navigation.navigate('TodayAttendance')} />
                    <ListItem title="All Attendance Analytics List" subtitle="View all employee records" leftIcon="list-alt"
                        tint={custom.palette.primary} onPress={() => navigation.navigate('AllAttendanceAnalyticsScreen')} />
                </Section>

                <Section title="Analytics & Reports" icon="chart-line" tint={custom.palette.warning}>
                    <ListItem title="Attendance Analytics" subtitle="Trends, late/early, absences" leftIcon="chart-bar"
                        tint={custom.palette.warning} onPress={() => navigation.navigate('AttendanceAnalytics')} />
                    <ListItem title="Today Employee Analytics" subtitle="Real-time counts & heatmap" leftIcon="chart-pie"
                        tint={custom.palette.warning} onPress={() => navigation.navigate('TodayEmployeeAnalytics')} />
                    <ListItem title="Reports & Analytics" subtitle="Comprehensive reports" leftIcon="file-alt"
                        tint={custom.palette.warning} onPress={() => navigation.navigate('Reports')} />
                </Section>

                <Section title="WFH Policy & Settings" icon="home" tint={custom.palette.success}>
                    <ListItem title="Manage WFH Settings" subtitle="Configure rules & eligibility" leftIcon="cog"
                        tint={custom.palette.success} onPress={() => navigation.navigate('WFHSettings')} />
                    <ListItem title="WFH Approvals" subtitle="Approve/reject requests" leftIcon="check-circle" badge={pendingData.wfhApprovals || null}
                        tint={custom.palette.success} onPress={() => navigation.navigate('WFHApprovals')} />
                </Section>

                <Section title="On Site Policy & Settings" icon="map-marker-alt" tint="#2196F3">
                    <ListItem title="Manage On Site Settings" subtitle="Configure rules & eligibility" leftIcon="cog"
                        tint="#2196F3" onPress={() => navigation.navigate('OnSiteSettings')} />
                    <ListItem title="On Site Approvals" subtitle="Approve/reject requests" leftIcon="check-circle" badge={pendingData.onsiteApprovals || null}
                        tint="#2196F3" onPress={() => navigation.navigate('OnSiteApprovals')} />
                </Section>

                <Section title="Leave Management" icon="umbrella-beach" tint="#8B5CF6">
                    <ListItem title="Leave Approvals" subtitle="Approve/reject leave requests" leftIcon="clipboard-list" badge={pendingData.leaveApprovals || null}
                        tint="#8B5CF6" onPress={() => navigation.navigate('LeaveApprovals')} />
                    <ListItem title="Compensatory Leave Approvals" subtitle="Approve comp leave for holidays" leftIcon="calendar-plus" badge={pendingData.compLeaveApprovals || null}
                        tint="#8B5CF6" onPress={() => navigation.navigate('CompApprovals')} />
                    <ListItem title="Advance Settlement Monitor" subtitle="Track Mode-2 settlements at forfeit risk" leftIcon="hourglass-half"
                        tint="#8B5CF6" onPress={() => navigation.navigate('AdvanceSettlementsAdmin')} />
                </Section>

                {/* Admin is also an employee. The 15-item self-service list (Apply Leave,
                    WFH/OnSite, expense, travel, profile, payroll, work) was getting long and
                    duplicated the "Apply on Behalf" tabs in the management screens, so it now
                    lives on a dedicated AdminSelfServiceScreen — surfaced here as one hero
                    card. The standalone "Pending Settlements" urgency card above stays as it
                    is a time-sensitive action surface. */}
                <Section title="My Self-Service" icon="user-circle" tint="#06B6D4">
                    <ListItem
                        title="Open My Self-Service"
                        subtitle="Leaves, attendance, payroll, profile, work — everything for yourself"
                        leftIcon="user-circle"
                        badge={pendingSettlements.count || null}
                        tint="#06B6D4"
                        onPress={() => navigation.navigate('AdminSelfService')}
                    />
                </Section>

                <Section title="Expense & Travel Management" icon="money-bill-wave" tint="#10B981">
                    <ListItem title="Expense Claim Approvals" subtitle="Review & approve expense claims" leftIcon="receipt" badge={pendingData.expenseApprovals || null}
                        tint="#10B981" onPress={() => navigation.navigate('ExpenseClaimApproval')} />
                    <ListItem title="Travel Request Approvals" subtitle="Approve/reject travel requests" leftIcon="plane" badge={pendingData.travelApprovals || null}
                        tint="#10B981" onPress={() => navigation.navigate('TravelRequestApproval')} />
                </Section>

                <Section title="Employee Management" icon="users-cog" tint="#EC4899">
                    <ListItem title="Employee Management" subtitle="Manage employee records" leftIcon="users"
                        tint="#EC4899" onPress={() => navigation.navigate('EmployeeManagement')} />
                </Section>

                <Section title="Payroll & Salary" icon="money-check-alt" tint="#8E44AD">
                    <ListItem title="Salary Structures" subtitle="View all employee salary structures" leftIcon="file-invoice-dollar"
                        tint="#8E44AD" onPress={() => navigation.navigate('SalaryStructureAdmin')} />
                    <ListItem title="Salary Tracker" subtitle="Track pending salaries & payments" leftIcon="search-dollar"
                        tint="#8E44AD" onPress={() => navigation.navigate('AdminSalaryTracker')} />
                </Section>

                <Section title="Projects Oversight" icon="project-diagram" tint="#14B8A6">
                    <ListItem title="View Projects" subtitle="Portfolio & status" leftIcon="folder-open"
                        tint="#14B8A6" onPress={() => navigation.navigate('ProjectsOverview')} />
                    <ListItem title="Daily Tasks" subtitle="View & assign employee tasks" leftIcon="clipboard-list"
                        tint="#14B8A6" onPress={() => navigation.navigate('AdminDailyTasksScreen')} />
                </Section>

                <Section title="Notifications & Announcements" icon="bullhorn" tint="#F43F5E">
                    <ListItem title="Create Notification" subtitle="Target by dept/location" leftIcon="plus-circle"
                        tint="#F43F5E" onPress={() => navigation.navigate('CreateNotification')} />
                </Section>

                <Button onPress={handleLogout} style={{ marginTop: 8 }}>Logout</Button>
                </ScrollView>
            )}
        </View>
    );
};

export default AdminDashboard;