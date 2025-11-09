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
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { Text, useTheme } from 'react-native-paper';
import { useAuth } from '../../context/AuthContext';
import AppHeader from '../../components/ui/AppHeader';
import Section from '../../components/ui/Section';
import ListItem from '../../components/ui/ListItem';
import StatCard from '../../components/ui/StatCard';
import Button from '../../components/common/Button';

const AdminDashboard = ({ navigation }) => {
    const { logout, user, employee } = useAuth();
    const { custom } = useTheme();

    const handleLogout = async () => { await logout(); };

    const quickStats = [
        { id: 1, icon: 'users', tint: custom.palette.primary, value: '125', label: 'Total Employees' },
        { id: 2, icon: 'user-check', tint: custom.palette.success, value: '98', label: 'Present Today' },
        { id: 3, icon: 'user-times', tint: custom.palette.danger, value: '12', label: 'Absent' },
        { id: 4, icon: 'home', tint: custom.palette.warning, value: '15', label: 'WFH' },
    ];

    return (
        <View style={{ flex: 1, backgroundColor: custom.palette.background }}>
            <AppHeader title="logo" canGoBack={false} rightIcon="bell" badge={5} onRightPress={() => navigation.navigate('AdminNotifications')} />

            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 36 }} showsVerticalScrollIndicator={false}>
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

                {/* Stats */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 14 }}>
                    {quickStats.map(s => (
                        <View key={s.id} style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
                            <StatCard icon={s.icon} tint={s.tint} value={s.value} label={s.label} />
                        </View>
                    ))}
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
                    <ListItem title="WFH Approvals" subtitle="Approve/reject requests" leftIcon="check-circle" badge="5"
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
                    <ListItem title="Leave Approvals" subtitle="Approve/reject leave requests" leftIcon="clipboard-list" badge="8"
                        tint="#8B5CF6" onPress={() => navigation.navigate('LeaveApprovals')} />
                    <ListItem title="Compensatory Leave Approvals" subtitle="Approve comp leave for holidays" leftIcon="calendar-plus"
                        tint="#8B5CF6" onPress={() => navigation.navigate('CompApprovals')} />
                </Section>

                <Section title="Expense & Travel Management" icon="money-bill-wave" tint="#10B981">
                    <ListItem title="Expense Claim Approvals" subtitle="Review & approve expense claims" leftIcon="receipt"
                        tint="#10B981" onPress={() => navigation.navigate('ExpenseClaimApproval')} />
                    <ListItem title="Travel Request Approvals" subtitle="Approve/reject travel requests" leftIcon="plane"
                        tint="#10B981" onPress={() => navigation.navigate('TravelRequestApproval')} />
                </Section>

                <Section title="Employee Management" icon="users-cog" tint="#EC4899">
                    <ListItem title="Employee Management" subtitle="Manage employee records" leftIcon="users"
                        tint="#EC4899" onPress={() => navigation.navigate('EmployeeManagement')} />
                </Section>

                <Section title="Projects Oversight" icon="project-diagram" tint="#14B8A6">
                    <ListItem title="View Projects" subtitle="Portfolio & status" leftIcon="folder-open"
                        tint="#14B8A6" onPress={() => navigation.navigate('ProjectsOverview')} />
                    <ListItem title="Project Tasks" subtitle="Assign & track tasks" leftIcon="tasks"
                        tint="#14B8A6" onPress={() => navigation.navigate('ProjectTasksScreen')} />
                    <ListItem title="View Project Logs" subtitle="Progress & time entries" leftIcon="history"
                        tint="#14B8A6" onPress={() => navigation.navigate('ProjectLogsScreen')} />

                </Section>

                <Section title="Notifications & Announcements" icon="bullhorn" tint="#F43F5E">
                    <ListItem title="Create Notification" subtitle="Target by dept/location" leftIcon="plus-circle"
                        tint="#F43F5E" onPress={() => navigation.navigate('CreateNotification')} />
                </Section>

                <Button onPress={handleLogout} style={{ marginTop: 8 }}>Logout</Button>
            </ScrollView>
        </View>
    );
};

export default AdminDashboard;