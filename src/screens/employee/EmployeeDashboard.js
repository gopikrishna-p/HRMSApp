import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../theme/colors';
import Button from '../../components/common/Button';

const EmployeeDashboard = ({ navigation }) => {
    const { logout, employee } = useAuth();

    const handleLogout = async () => {
        await logout();
    };

    // Quick Stats Data
    const quickStats = [
        {
            id: 1,
            icon: 'calendar-day',
            iconColor: '#6366F1',
            value: '22',
            label: 'Days Present',
            bgColor: '#EEF2FF',
        },
        {
            id: 2,
            icon: 'umbrella-beach',
            iconColor: '#10B981',
            value: '5',
            label: 'Days Leave',
            bgColor: '#D1FAE5',
        },
    ];

    // Section-wise Menu Items
    const sections = [
        {
            id: 'attendance',
            title: 'Attendance',
            icon: 'calendar-check',
            iconColor: '#6366F1',
            items: [
                {
                    id: 1,
                    title: 'Check In/Out',
                    icon: 'clock',
                    screen: 'CheckInOut',
                    description: 'Mark your attendance',
                },
                {
                    id: 2,
                    title: 'Attendance History',
                    icon: 'history',
                    screen: 'AttendanceHistory',
                    description: 'View attendance records',
                },
                {
                    id: 3,
                    title: 'WFH Request',
                    icon: 'home',
                    screen: 'WFHRequest',
                    description: 'Apply for work from home',
                },
            ],
        },
        {
            id: 'leaves',
            title: 'Leaves',
            icon: 'umbrella-beach',
            iconColor: '#10B981',
            items: [
                {
                    id: 1,
                    title: 'Holiday List',
                    icon: 'calendar-alt',
                    screen: 'HolidayList',
                    description: 'View company holidays',
                },
                {
                    id: 2,
                    title: 'Apply Leave',
                    icon: 'file-alt',
                    screen: 'LeaveApplication',
                    description: 'Submit leave request',
                },
                {
                    id: 3,
                    title: 'My Leaves',
                    icon: 'list-ul',
                    screen: 'Leaves',
                    description: 'View leave history',
                },
                {
                    id: 4,
                    title: 'Comp-Off Request',
                    icon: 'exchange-alt',
                    screen: 'CompensatoryLeave',
                    description: 'Request compensatory leave',
                },
            ],
        },
        {
            id: 'expense',
            title: 'Expense & Travel',
            icon: 'money-bill-wave',
            iconColor: '#F59E0B',
            items: [
                {
                    id: 1,
                    title: 'Expense Claim',
                    icon: 'receipt',
                    screen: 'ExpenseClaim',
                    description: 'Submit expense claims',
                },
                {
                    id: 2,
                    title: 'Travel Request',
                    icon: 'plane',
                    screen: 'TravelRequest',
                    description: 'Request business travel',
                },
            ],
        },
        {
            id: 'projects',
            title: 'Projects & Tasks',
            icon: 'tasks',
            iconColor: '#8B5CF6',
            items: [
                {
                    id: 1,
                    title: 'My Projects',
                    icon: 'folder-open',
                    screen: 'MyProjects',
                    description: 'View assigned projects',
                },
                {
                    id: 2,
                    title: 'My Tasks',
                    icon: 'check-square',
                    screen: 'MyTasks',
                    description: 'Manage work logs',
                },
            ],
        },
        {
            id: 'payroll',
            title: 'Payroll',
            icon: 'wallet',
            iconColor: '#EF4444',
            items: [
                {
                    id: 1,
                    title: 'Salary Structure',
                    icon: 'chart-pie',
                    screen: 'SalaryStructure',
                    description: 'View salary breakdown',
                },
                {
                    id: 2,
                    title: 'Payslips',
                    icon: 'file-invoice-dollar',
                    screen: 'Payslip',
                    description: 'Download payslips',
                },
            ],
        },
        {
            id: 'other',
            title: 'Other',
            icon: 'ellipsis-h',
            iconColor: '#6B7280',
            items: [
                {
                    id: 1,
                    title: 'Notifications',
                    icon: 'bell',
                    screen: 'Notifications',
                    description: 'View notifications',
                    badge: '3',
                },
                {
                    id: 2,
                    title: 'Profile',
                    icon: 'user-circle',
                    screen: 'Profile',
                    description: 'Update your profile',
                },
            ],
        },
    ];

    const renderSection = (section) => (
        <View key={section.id} style={styles.section}>
            <View style={styles.sectionHeader}>
                <View style={styles.sectionHeaderLeft}>
                    <View style={[styles.sectionIcon, { backgroundColor: section.iconColor + '20' }]}>
                        <Icon name={section.icon} size={18} color={section.iconColor} />
                    </View>
                    <Text style={styles.sectionTitle}>{section.title}</Text>
                </View>
            </View>

            <View style={styles.sectionContent}>
                {section.items.map((item, index) => (
                    <TouchableOpacity
                        key={item.id}
                        style={[
                            styles.menuCard,
                            index === section.items.length - 1 && styles.lastMenuCard,
                        ]}
                        onPress={() => navigation.navigate(item.screen)}
                        activeOpacity={0.7}
                    >
                        <View style={[styles.menuIconContainer, { backgroundColor: section.iconColor + '15' }]}>
                            <Icon name={item.icon} size={20} color={section.iconColor} />
                        </View>
                        <View style={styles.menuContent}>
                            <View style={styles.menuTitleRow}>
                                <Text style={styles.menuTitle}>{item.title}</Text>
                                {item.badge && (
                                    <View style={styles.badge}>
                                        <Text style={styles.badgeText}>{item.badge}</Text>
                                    </View>
                                )}
                            </View>
                            <Text style={styles.menuDescription}>{item.description}</Text>
                        </View>
                        <Icon name="chevron-right" size={16} color="#9CA3AF" />
                    </TouchableOpacity>
                ))}
            </View>
        </View>
    );

    return (
        <View style={styles.container}>
            <ScrollView 
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Welcome Section */}
                <View style={styles.welcomeSection}>
                    <Text style={styles.welcomeTitle}>Welcome back!</Text>
                    <Text style={styles.welcomeSubtitle}>{employee?.employee_name || 'Employee'}</Text>
                    <View style={styles.infoRow}>
                        <View style={styles.infoItem}>
                            <Icon name="id-badge" size={13} color={colors.textSecondary} />
                            <Text style={styles.infoText}>{employee?.name || 'EMP-001'}</Text>
                        </View>
                        <View style={styles.infoItem}>
                            <Icon name="building" size={13} color={colors.textSecondary} />
                            <Text style={styles.infoText}>{employee?.department || 'Department'}</Text>
                        </View>
                    </View>
                </View>

                {/* Quick Stats */}
                <View style={styles.statsContainer}>
                    {quickStats.map((stat) => (
                        <View key={stat.id} style={[styles.statCard, { backgroundColor: stat.bgColor }]}>
                            <Icon name={stat.icon} size={24} color={stat.iconColor} />
                            <Text style={styles.statValue}>{stat.value}</Text>
                            <Text style={styles.statLabel}>{stat.label}</Text>
                        </View>
                    ))}
                </View>

                {/* Section-wise Menu */}
                {sections.map(renderSection)}

                {/* Logout Button */}
                <Button onPress={handleLogout} style={styles.logoutButton}>
                    Logout
                </Button>
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    scrollContent: {
        padding: 16,
        paddingBottom: 40,
    },
    welcomeSection: {
        backgroundColor: '#FFFFFF',
        padding: 20,
        borderRadius: 16,
        marginBottom: 16,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
    },
    welcomeTitle: {
        fontSize: 15,
        color: colors.textSecondary,
        marginBottom: 4,
    },
    welcomeSubtitle: {
        fontSize: 22,
        fontWeight: 'bold',
        color: colors.textPrimary,
        marginBottom: 12,
    },
    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 8,
    },
    infoItem: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    infoText: {
        fontSize: 12,
        color: colors.textSecondary,
        marginLeft: 6,
    },
    statsContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 20,
    },
    statCard: {
        flex: 1,
        padding: 16,
        borderRadius: 12,
        alignItems: 'center',
        marginHorizontal: 4,
        elevation: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
    },
    statValue: {
        fontSize: 26,
        fontWeight: 'bold',
        color: colors.textPrimary,
        marginTop: 8,
    },
    statLabel: {
        fontSize: 11,
        color: colors.textSecondary,
        marginTop: 4,
        textAlign: 'center',
    },
    section: {
        marginBottom: 20,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    sectionHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    sectionIcon: {
        width: 36,
        height: 36,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 10,
    },
    sectionTitle: {
        fontSize: 17,
        fontWeight: '700',
        color: colors.textPrimary,
    },
    sectionContent: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        overflow: 'hidden',
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 3,
    },
    menuCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    lastMenuCard: {
        borderBottomWidth: 0,
    },
    menuIconContainer: {
        width: 42,
        height: 42,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    menuContent: {
        flex: 1,
    },
    menuTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 2,
    },
    menuTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: colors.textPrimary,
    },
    menuDescription: {
        fontSize: 12,
        color: colors.textSecondary,
    },
    badge: {
        backgroundColor: '#EF4444',
        borderRadius: 10,
        paddingHorizontal: 6,
        paddingVertical: 2,
        marginLeft: 8,
    },
    badgeText: {
        color: '#FFFFFF',
        fontSize: 10,
        fontWeight: '600',
    },
    logoutButton: {
        marginTop: 8,
    },
});

export default EmployeeDashboard;