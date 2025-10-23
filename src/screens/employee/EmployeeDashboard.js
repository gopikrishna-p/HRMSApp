// src/screens/employee/EmployeeDashboard.js
import React from 'react';
import { View, ScrollView } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { Text, useTheme } from 'react-native-paper';
import { useAuth } from '../../context/AuthContext';
import AppHeader from '../../components/ui/AppHeader';
import Section from '../../components/ui/Section';
import ListItem from '../../components/ui/ListItem';
import StatCard from '../../components/ui/StatCard';
import Button from '../../components/common/Button';
import HeaderWithNotifications from '../../components/ui/HeaderWithNotifications';

const EmployeeDashboard = ({ navigation }) => {
    const { logout, employee } = useAuth();
    const { custom } = useTheme();

    const handleLogout = async () => { await logout(); };

    const quickStats = [
        { id: 1, icon: 'calendar-day', tint: custom.palette.primary, value: '22', label: 'Days Present' },
        { id: 2, icon: 'umbrella-beach', tint: custom.palette.success, value: '5', label: 'Days Leave' },
    ];

    return (
        <View style={{ flex: 1, backgroundColor: custom.palette.background }}>
            <AppHeader title="logo" canGoBack={false} rightIcon="bell" badge={5} onRightPress={() => navigation.navigate('NotificationScreen')}/>
            

            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 36 }} showsVerticalScrollIndicator={false}>
                {/* Welcome */}
                <View style={{
                    backgroundColor: '#FFF', padding: 20, borderRadius: 16, marginBottom: 14,
                    elevation: 2, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }
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

                {/* Stats */}
                <View style={{ flexDirection: 'row', marginBottom: 14 }}>
                    {quickStats.map(s => (
                        <StatCard key={s.id} icon={s.icon} tint={s.tint} value={s.value} label={s.label} />
                    ))}
                </View>

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
                    <ListItem title="My Leaves" subtitle="View leave history" leftIcon="list-ul"
                        tint={custom.palette.success} onPress={() => navigation.navigate('Leaves')} />
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
