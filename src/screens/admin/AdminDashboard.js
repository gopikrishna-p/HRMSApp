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
import ApiService from '../../services/api.service';
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
        onLeave: 0,
        lateArrivals: 0,
        employeesOnHoliday: 0,
        workingEmployees: 0,
        attendanceRate: 0,
    });

    const [pendingData, setPendingData] = useState({
        wfhApprovals: 0,
        leaveApprovals: 0,
        expenseApprovals: 0,
        travelApprovals: 0,
        compLeaveApprovals: 0,
        notifications: 0,
    });

    const handleLogout = async () => { 
        await logout(); 
    };

    useEffect(() => {
        fetchDashboardData();

        // Cleanup on unmount to prevent memory leaks
        return () => {
            setLoading(false);
            setRefreshing(false);
        };
    }, []);

    const fetchDashboardData = async () => {
        try {
            setLoading(true);
            await Promise.all([
                fetchDashboardStats(),
                fetchPendingApprovals(),
            ]);
        } catch (error) {
            console.error('Dashboard load error:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchDashboardStats = async () => {
        try {
            const response = await ApiService.get('/api/method/hrms.api.get_employee_statistics');
            if (response.success && response.data?.message) {
                setStats(response.data.message);
            }
        } catch (error) {
            console.error('Dashboard stats error:', error);
        }
    };

    const fetchPendingApprovals = async () => {
        try {
            const data = { ...pendingData };
            
            // Get current employee ID (admin user's employee record)
            const empId = employee?.name;
            console.log('📋 Fetching approvals for employee:', empId);

            // Skip if employee ID is missing or logout is in progress
            if (!empId) {
                console.log('⚠️ No employee ID, skipping approval fetch');
                return;
            }

            // Fetch WFH approvals
            try {
                const wfhRes = await ApiService.get(`/api/method/hrms.api.get_shift_requests?employee=${empId}&for_approval=true&limit_page_length=500`);
                if (wfhRes.success) {
                    data.wfhApprovals = (wfhRes.data?.message || []).length;
                    console.log('✅ WFH Approvals fetched:', data.wfhApprovals, wfhRes.data?.message);
                }
            } catch (e) { 
                console.log('❌ WFH fetch error:', e?.message); 
            }

            // Fetch leave approvals
            try {
                const leaveRes = await ApiService.get(`/api/method/hrms.api.get_leave_applications?employee=${empId}&for_approval=true&limit_page_length=500`);
                if (leaveRes.success) {
                    data.leaveApprovals = (leaveRes.data?.message || []).length;
                    console.log('✅ Leave Approvals fetched:', data.leaveApprovals, leaveRes.data?.message);
                }
            } catch (e) { 
                console.log('❌ Leave fetch error:', e?.message); 
            }

            // Fetch expense approvals
            try {
                const expenseRes = await ApiService.get(`/api/method/hrms.api.get_expense_claims?employee=${empId}&for_approval=true&limit_page_length=500`);
                if (expenseRes.success) {
                    data.expenseApprovals = (expenseRes.data?.message || []).length;
                    console.log('✅ Expense Approvals fetched:', data.expenseApprovals, expenseRes.data?.message);
                } else {
                    console.log('❌ Expense API not successful:', expenseRes);
                }
            } catch (e) { 
                console.log('❌ Expense fetch error:', e?.message); 
            }

            // Fetch travel approvals
            try {
                const travelRes = await ApiService.get(`/api/method/hrms.api.get_travel_requests?employee=${empId}&for_approval=true&limit_page_length=500`);
                if (travelRes.success) {
                    data.travelApprovals = (travelRes.data?.message || []).length;
                    console.log('✅ Travel Approvals fetched:', data.travelApprovals, travelRes.data?.message);
                }
            } catch (e) { 
                console.log('❌ Travel fetch error:', e?.message); 
            }

            // Fetch comp leave approvals
            try {
                const compRes = await ApiService.get(`/api/method/hrms.api.get_comp_offs?employee=${empId}&for_approval=true&limit_page_length=500`);
                if (compRes.success) {
                    data.compLeaveApprovals = (compRes.data?.message || []).length;
                    console.log('✅ Comp Leave Approvals fetched:', data.compLeaveApprovals, compRes.data?.message);
                }
            } catch (e) { 
                console.log('❌ Comp leave fetch error:', e?.message); 
            }

            // Calculate total notifications
            data.notifications = data.wfhApprovals + data.leaveApprovals + data.expenseApprovals + 
                                data.travelApprovals + data.compLeaveApprovals;

            console.log('📊 Final pending data:', data);
            setPendingData(data);
        } catch (error) {
            console.error('Pending approvals fetch error:', error);
        }
    };

    const onRefresh = async () => {
        setRefreshing(true);
        await fetchDashboardData();
        setRefreshing(false);
    };

    const quickStats = [
        { id: 1, icon: 'users', tint: custom.palette.primary, value: String(stats.totalEmployees), label: 'Total Employees' },
        { id: 2, icon: 'user-check', tint: custom.palette.success, value: String(stats.presentToday), label: 'Present Today' },
        { id: 3, icon: 'user-times', tint: custom.palette.danger, value: String(stats.absentToday), label: 'Absent' },
        { id: 4, icon: 'home', tint: custom.palette.warning, value: String(stats.wfhToday), label: 'WFH' },
        { id: 5, icon: 'umbrella-beach', tint: '#8B5CF6', value: String(stats.onLeave), label: 'On Leave' },
        { id: 6, icon: 'clock', tint: '#F59E0B', value: String(stats.lateArrivals), label: 'Late Arrivals' },
        { id: 7, icon: 'chart-pie', tint: '#EC4899', value: `${stats.attendanceRate}%`, label: 'Attendance Rate' },
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
                                    <Icon name={s.icon} size={16} color="#FFF" />
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

                {/* Sections */}
                <Section title="Attendance Control" icon="clipboard-check" tint={custom.palette.primary}>
                    <ListItem title="Admin Check In/Out" subtitle="Kiosk/Supervisor mode" leftIcon="user-clock"
                        tint={custom.palette.primary} onPress={() => navigation.navigate('AdminCheckInOut')} />
                    <ListItem title="All Attendance Analytics List" subtitle="View all employee records" leftIcon="list-alt"
                        tint={custom.palette.primary} onPress={() => navigation.navigate('AllAttendanceAnalyticsScreen')} />
                    <ListItem title="Manual Check In/Out" subtitle="Attendance regularization" leftIcon="edit"
                        tint={custom.palette.primary} onPress={() => navigation.navigate('ManualCheckInOut')} />
                    <ListItem title="Today's Attendance" subtitle="Live attendance view" leftIcon="calendar-day"
                        tint={custom.palette.primary} onPress={() => navigation.navigate('TodayAttendance')} />
                </Section>

                <Section title="WFH Policy & Settings" icon="home" tint={custom.palette.success}>
                    <ListItem title="Manage WFH Settings" subtitle="Configure rules & eligibility" leftIcon="cog"
                        tint={custom.palette.success} onPress={() => navigation.navigate('WFHSettings')} />
                    <ListItem title="WFH Approvals" subtitle="Approve/reject requests" leftIcon="check-circle" badge={pendingData.wfhApprovals || null}
                        tint={custom.palette.success} onPress={() => navigation.navigate('WFHApprovals')} />
                </Section>

                <Section title="Analytics & Reports" icon="chart-line" tint={custom.palette.warning}>
                    <ListItem title="Attendance Analytics" subtitle="Trends, late/early, absences" leftIcon="chart-bar"
                        tint={custom.palette.warning} onPress={() => navigation.navigate('AttendanceAnalytics')} />
                    <ListItem title="Today Employee Analytics" subtitle="Real-time counts & heatmap" leftIcon="chart-pie"
                        tint={custom.palette.warning} onPress={() => navigation.navigate('TodayEmployeeAnalytics')} />
                    <ListItem title="Reports & Analytics" subtitle="Comprehensive reports" leftIcon="file-alt"
                        tint={custom.palette.warning} onPress={() => navigation.navigate('Reports')} />
                </Section>

                <Section title="Leave Management" icon="umbrella-beach" tint="#8B5CF6">
                    <ListItem title="Leave Approvals" subtitle="Approve/reject leave requests" leftIcon="clipboard-list" badge={pendingData.leaveApprovals || null}
                        tint="#8B5CF6" onPress={() => navigation.navigate('LeaveApprovals')} />
                    <ListItem title="Compensatory Leave Approvals" subtitle="Approve comp leave for holidays" leftIcon="calendar-plus" badge={pendingData.compLeaveApprovals || null}
                        tint="#8B5CF6" onPress={() => navigation.navigate('CompApprovals')} />
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

                <Section title="Projects Oversight" icon="project-diagram" tint="#14B8A6">
                    <ListItem title="View Projects" subtitle="Portfolio & status" leftIcon="folder-open"
                        tint="#14B8A6" onPress={() => navigation.navigate('ProjectsOverview')} />
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