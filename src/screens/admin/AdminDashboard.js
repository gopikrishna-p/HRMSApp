import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../theme/colors';
import Button from '../../components/common/Button';

const AdminDashboard = ({ navigation }) => {
    const { logout, user, employee } = useAuth();

    const handleLogout = async () => {
        await logout();
    };

    const menuItems = [
        {
            id: 1,
            title: 'Employee Management',
            icon: 'users',
            color: '#6366F1',
            screen: 'EmployeeManagement',
            description: 'Manage employee records'
        },
        {
            id: 2,
            title: 'Attendance Management',
            icon: 'clipboard-check',
            color: '#10B981',
            screen: 'AttendanceManagement',
            description: 'Track attendance records'
        },
        {
            id: 3,
            title: 'Reports & Analytics',
            icon: 'chart-bar',
            color: '#F59E0B',
            screen: 'Reports',
            description: 'View reports and insights'
        },
    ];

    const handleNavigate = (screen) => {
        navigation.navigate(screen);
    };

    return (
        <View style={styles.container}>
            <ScrollView 
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Welcome Section */}
                <View style={styles.welcomeSection}>
                    <Text style={styles.welcomeTitle}>Welcome back!</Text>
                    <Text style={styles.welcomeSubtitle}>{user?.full_name}</Text>
                    <View style={styles.roleContainer}>
                        <Icon name="shield-alt" size={14} color={colors.primary} />
                        <Text style={styles.roleText}>
                            {user?.roles?.join(', ')}
                        </Text>
                    </View>
                    {employee && (
                        <Text style={styles.employeeId}>ID: {employee.name}</Text>
                    )}
                </View>

                {/* Quick Stats */}
                <View style={styles.statsContainer}>
                    <View style={styles.statCard}>
                        <Icon name="users" size={24} color="#6366F1" />
                        <Text style={styles.statValue}>125</Text>
                        <Text style={styles.statLabel}>Total Employees</Text>
                    </View>
                    <View style={styles.statCard}>
                        <Icon name="user-check" size={24} color="#10B981" />
                        <Text style={styles.statValue}>98</Text>
                        <Text style={styles.statLabel}>Present Today</Text>
                    </View>
                </View>

                {/* Menu Items */}
                <View style={styles.menuSection}>
                    <Text style={styles.sectionTitle}>Quick Actions</Text>
                    {menuItems.map((item) => (
                        <TouchableOpacity
                            key={item.id}
                            style={styles.menuCard}
                            onPress={() => handleNavigate(item.screen)}
                            activeOpacity={0.7}
                        >
                            <View style={[styles.iconContainer, { backgroundColor: item.color + '20' }]}>
                                <Icon name={item.icon} size={24} color={item.color} />
                            </View>
                            <View style={styles.menuContent}>
                                <Text style={styles.menuTitle}>{item.title}</Text>
                                <Text style={styles.menuDescription}>{item.description}</Text>
                            </View>
                            <Icon name="chevron-right" size={20} color="#9CA3AF" />
                        </TouchableOpacity>
                    ))}
                </View>

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
        padding: 20,
        paddingBottom: 40,
    },
    welcomeSection: {
        backgroundColor: '#FFFFFF',
        padding: 20,
        borderRadius: 16,
        marginBottom: 20,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
    },
    welcomeTitle: {
        fontSize: 16,
        color: colors.textSecondary,
        marginBottom: 4,
    },
    welcomeSubtitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: colors.textPrimary,
        marginBottom: 8,
    },
    roleContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 8,
    },
    roleText: {
        fontSize: 14,
        color: colors.primary,
        marginLeft: 6,
        fontWeight: '600',
    },
    employeeId: {
        fontSize: 12,
        color: colors.textSecondary,
        marginTop: 4,
    },
    statsContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 24,
    },
    statCard: {
        flex: 1,
        backgroundColor: '#FFFFFF',
        padding: 16,
        borderRadius: 12,
        alignItems: 'center',
        marginHorizontal: 4,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
    },
    statValue: {
        fontSize: 28,
        fontWeight: 'bold',
        color: colors.textPrimary,
        marginTop: 8,
    },
    statLabel: {
        fontSize: 12,
        color: colors.textSecondary,
        marginTop: 4,
        textAlign: 'center',
    },
    menuSection: {
        marginBottom: 24,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: colors.textPrimary,
        marginBottom: 12,
    },
    menuCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        padding: 16,
        borderRadius: 12,
        marginBottom: 12,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
    },
    iconContainer: {
        width: 48,
        height: 48,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    menuContent: {
        flex: 1,
    },
    menuTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.textPrimary,
        marginBottom: 2,
    },
    menuDescription: {
        fontSize: 13,
        color: colors.textSecondary,
    },
    logoutButton: {
        marginTop: 8,
    },
});

export default AdminDashboard;