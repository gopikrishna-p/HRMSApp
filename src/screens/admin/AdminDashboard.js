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
import { Text, useTheme, ActivityIndicator } from 'react-native-paper';
import { useAuth } from '../../context/AuthContext';
import AppHeader from '../../components/ui/AppHeader';
import Section from '../../components/ui/Section';
import ListItem from '../../components/ui/ListItem';
import Button from '../../components/common/Button';
import Api from '../../services/api.service';

const AdminDashboard = ({ navigation }) => {
    const { logout, user, employee } = useAuth();
    const { custom } = useTheme();

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Statistics State
    const [stats, setStats] = useState({
        totalEmployees: 0,
        presentToday: 0,
        absentToday: 0,
        wfhToday: 0,
        onLeave: 0,
        lateArrivals: 0,
    });

    // Department Stats
    const [departmentStats, setDepartmentStats] = useState([]);

    // Modal States
    const [modalVisible, setModalVisible] = useState(false);
    const [modalTitle, setModalTitle] = useState('');
    const [modalData, setModalData] = useState([]);
    const [modalLoading, setModalLoading] = useState(false);
    const [modalType, setModalType] = useState('');

    useEffect(() => {
        loadStatistics();
    }, []);

    const loadStatistics = async () => {
        try {
            setLoading(true);
            await Promise.all([loadEmployeeStats(), loadDepartmentStats()]);
        } catch (error) {
            console.error('Error loading statistics:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadEmployeeStats = async () => {
        try {
            const res = await Api.getEmployeeStatistics();
            if (res.success && res.data) {
                setStats(res.data);
            }
        } catch (error) {
            console.error('Failed to load employee stats:', error);
        }
    };

    const loadDepartmentStats = async () => {
        try {
            const res = await Api.getDepartmentStatistics();
            if (res.success && res.data) {
                setDepartmentStats(res.data.slice(0, 5));
            }
        } catch (error) {
            console.error('Failed to load department stats:', error);
        }
    };

    const handleRefresh = async () => {
        setRefreshing(true);
        await loadStatistics();
        setRefreshing(false);
    };

    const showAbsentEmployees = async () => {
        setModalLoading(true);
        setModalVisible(true);
        setModalTitle('Absent Employees');
        setModalType('absent');
        setModalData([]);

        try {
            const res = await Api.getAbsentEmployeesList();
            if (res.success && res.data?.absent_employees) {
                setModalData(res.data.absent_employees);
            }
        } catch (error) {
            console.error('Error fetching absent employees:', error);
            setModalVisible(false);
        } finally {
            setModalLoading(false);
        }
    };

    const showLateArrivals = async () => {
        setModalLoading(true);
        setModalVisible(true);
        setModalTitle('Late Arrivals (After 10:05 AM)');
        setModalType('late');
        setModalData([]);

        try {
            const res = await Api.getLateArrivalsList();
            if (res.success && res.data?.late_employees) {
                setModalData(res.data.late_employees);
            }
        } catch (error) {
            console.error('Error fetching late arrivals:', error);
            setModalVisible(false);
        } finally {
            setModalLoading(false);
        }
    };

    const handleLogout = async () => {
        await logout();
    };

    const getAttendancePercentage = () => {
        if (stats.totalEmployees === 0) return 0;
        return Math.round(
            ((stats.presentToday + stats.wfhToday) / stats.totalEmployees) * 100
        );
    };

    const getAttendanceStatus = () => {
        const percentage = getAttendancePercentage();
        if (percentage >= 90)
            return { status: 'Excellent', color: '#10B981', icon: 'check-circle' };
        if (percentage >= 80)
            return { status: 'Good', color: '#10B981', icon: 'check-circle' };
        if (percentage >= 70)
            return { status: 'Average', color: '#F59E0B', icon: 'exclamation-circle' };
        return { status: 'Poor', color: '#EF4444', icon: 'times-circle' };
    };

    const AttendanceOverview = () => {
        const attendanceStatus = getAttendanceStatus();

        return (
            <View style={styles.overviewCard}>
                <View style={styles.overviewHeader}>
                    <Icon name="chart-pie" size={20} color="#6366F1" />
                    <Text style={styles.overviewTitle}>Today's Overview</Text>
                </View>

                <View style={styles.overviewContent}>
                    <View style={styles.mainMetric}>
                        <Text style={styles.mainMetricValue}>
                            {loading ? '...' : getAttendancePercentage()}%
                        </Text>
                        <View style={styles.statusBadge}>
                            <Icon
                                name={attendanceStatus.icon}
                                size={12}
                                color={attendanceStatus.color}
                            />
                            <Text
                                style={[styles.statusText, { color: attendanceStatus.color }]}
                            >
                                {attendanceStatus.status}
                            </Text>
                        </View>
                    </View>

                    <View style={styles.overviewStats}>
                        <View style={styles.overviewItem}>
                            <Text style={styles.overviewValue}>
                                {loading ? '...' : stats.presentToday}
                            </Text>
                            <Text style={styles.overviewLabel}>In Office</Text>
                        </View>
                        <View style={styles.overviewItem}>
                            <Text style={styles.overviewValue}>
                                {loading ? '...' : stats.wfhToday}
                            </Text>
                            <Text style={styles.overviewLabel}>WFH</Text>
                        </View>
                        <View style={styles.overviewItem}>
                            <Text style={[styles.overviewValue, { color: '#EF4444' }]}>
                                {loading ? '...' : stats.absentToday}
                            </Text>
                            <Text style={styles.overviewLabel}>Absent</Text>
                        </View>
                    </View>
                </View>
            </View>
        );
    };

    const QuickStatsGrid = () => {
        const quickStats = [
            {
                id: 1,
                icon: 'users',
                tint: custom.palette.primary,
                value: loading ? '...' : stats.totalEmployees,
                label: 'Total Employees',
            },
            {
                id: 2,
                icon: 'user-check',
                tint: custom.palette.success,
                value: loading ? '...' : stats.presentToday,
                label: 'Present Today',
                onPress: null,
            },
            {
                id: 3,
                icon: 'user-times',
                tint: custom.palette.danger,
                value: loading ? '...' : stats.absentToday,
                label: 'Absent',
                onPress: showAbsentEmployees,
            },
            {
                id: 4,
                icon: 'home',
                tint: custom.palette.warning,
                value: loading ? '...' : stats.wfhToday,
                label: 'WFH',
            },
            {
                id: 5,
                icon: 'calendar-times',
                tint: '#8B5CF6',
                value: loading ? '...' : stats.onLeave,
                label: 'On Leave',
            },
            {
                id: 6,
                icon: 'clock',
                tint: '#F59E0B',
                value: loading ? '...' : stats.lateArrivals,
                label: 'Late Arrivals',
                onPress: showLateArrivals,
            },
        ];

        return (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 14 }}>
                {quickStats.map((s) => (
                    <View key={s.id} style={{ width: '33.33%', paddingHorizontal: 4, marginBottom: 8 }}>
                        <TouchableOpacity
                            style={styles.statCard}
                            onPress={s.onPress}
                            activeOpacity={s.onPress ? 0.8 : 1}
                        >
                            <View style={[styles.statIconContainer, { backgroundColor: s.tint }]}>
                                <Icon name={s.icon} size={16} color="white" />
                            </View>
                            <Text style={styles.statValue}>{s.value}</Text>
                            <Text style={styles.statLabel}>{s.label}</Text>
                        </TouchableOpacity>
                    </View>
                ))}
            </View>
        );
    };

    const DepartmentBreakdown = () => (
        <View style={styles.departmentCard}>
            <View style={styles.cardHeader}>
                <Icon name="building" size={16} color="#8B5CF6" />
                <Text style={styles.cardTitle}>Department Breakdown</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.departmentList}>
                    {departmentStats.map((dept, index) => (
                        <View key={index} style={styles.departmentItem}>
                            <Text style={styles.departmentName} numberOfLines={1}>
                                {dept.department || 'Not Assigned'}
                            </Text>
                            <Text style={styles.departmentCount}>
                                {dept.present || 0}/{dept.working_today || 0}
                            </Text>
                            <Text style={styles.departmentPercentage}>
                                {dept.attendance_percentage || 0}%
                            </Text>
                        </View>
                    ))}
                </View>
            </ScrollView>
        </View>
    );

    const QuickInsights = () => {
        const insights = [];

        if (stats.lateArrivals > 0) {
            insights.push({
                icon: 'clock',
                color: '#F59E0B',
                text: `${stats.lateArrivals} late arrivals today`,
                action: 'View Details',
                onPress: showLateArrivals,
            });
        }

        if (stats.absentToday > 0) {
            insights.push({
                icon: 'exclamation-triangle',
                color: '#EF4444',
                text: `${stats.absentToday} employees absent`,
                action: 'Investigate',
                onPress: showAbsentEmployees,
            });
        }

        if (stats.onLeave > 0) {
            insights.push({
                icon: 'calendar-times',
                color: '#8B5CF6',
                text: `${stats.onLeave} employees on leave`,
                action: 'Review',
                onPress: () => navigation.navigate('LeaveApprovals'),
            });
        }

        if (insights.length === 0) {
            insights.push({
                icon: 'check-circle',
                color: '#10B981',
                text: 'All metrics look healthy today',
                action: 'View Reports',
                onPress: () => navigation.navigate('AllAttendanceAnalyticsScreen'),
            });
        }

        return (
            <View style={styles.insightsCard}>
                <View style={styles.cardHeader}>
                    <Icon name="lightbulb" size={16} color="#F59E0B" />
                    <Text style={styles.cardTitle}>Quick Insights</Text>
                </View>
                {insights.map((insight, index) => (
                    <TouchableOpacity
                        key={index}
                        style={styles.insightItem}
                        onPress={insight.onPress}
                        activeOpacity={0.8}
                    >
                        <View style={[styles.insightIcon, { backgroundColor: insight.color }]}>
                            <Icon name={insight.icon} size={12} color="white" />
                        </View>
                        <Text style={styles.insightText}>{insight.text}</Text>
                        <Text style={styles.insightAction}>{insight.action}</Text>
                    </TouchableOpacity>
                ))}
            </View>
        );
    };

    const EmployeeDetailModal = () => {
        const renderEmployeeItem = ({ item }) => (
            <View style={styles.employeeModalItem}>
                <View style={styles.employeeModalInfo}>
                    <Text style={styles.employeeModalName}>
                        {item.employee_name || 'N/A'}
                    </Text>
                    <Text style={styles.employeeModalId}>ID: {item.employee_id || 'N/A'}</Text>
                    <Text style={styles.employeeModalDept}>
                        {item.department || 'Not Assigned'} •{' '}
                        {item.designation || 'Not Assigned'}
                    </Text>
                    {modalType === 'late' && item.late_by_minutes && (
                        <Text style={styles.lateInfo}>
                            Late by {item.late_by_minutes} minutes
                        </Text>
                    )}
                </View>
                {modalType === 'late' && item.check_in_time && (
                    <View style={styles.timeInfo}>
                        <Text style={styles.checkInTime}>
                            {new Date(item.check_in_time).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                            })}
                        </Text>
                    </View>
                )}
            </View>
        );

        return (
            <Modal
                animationType="slide"
                transparent={true}
                visible={modalVisible}
                onRequestClose={() => setModalVisible(false)}
            >
                <View style={styles.modalContainer}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <View style={styles.modalHeaderLeft}>
                                <Text style={styles.modalHeaderTitle}>{modalTitle}</Text>
                                <Text style={styles.modalSubtitle}>
                                    {modalData.length}{' '}
                                    {modalType === 'absent' ? 'absent' : 'late'} employee
                                    {modalData.length !== 1 ? 's' : ''}
                                </Text>
                            </View>
                            <TouchableOpacity
                                style={styles.modalCloseButton}
                                onPress={() => setModalVisible(false)}
                            >
                                <Icon name="times" size={20} color="#6B7280" />
                            </TouchableOpacity>
                        </View>

                        {modalLoading ? (
                            <View style={styles.modalLoading}>
                                <ActivityIndicator color="#6366F1" size="large" />
                                <Text style={styles.modalLoadingText}>Loading...</Text>
                            </View>
                        ) : (
                            <FlatList
                                data={modalData}
                                renderItem={renderEmployeeItem}
                                keyExtractor={(item, index) =>
                                    item.employee_id || index.toString()
                                }
                                style={styles.modalList}
                                showsVerticalScrollIndicator={false}
                                ListEmptyComponent={
                                    <View style={styles.emptyModalState}>
                                        <Icon
                                            name={modalType === 'absent' ? 'user-check' : 'clock'}
                                            size={48}
                                            color="#E5E7EB"
                                        />
                                        <Text style={styles.emptyModalText}>
                                            {modalType === 'absent'
                                                ? 'No absent employees found'
                                                : 'No late arrivals found'}
                                        </Text>
                                    </View>
                                }
                            />
                        )}
                    </View>
                </View>
            </Modal>
        );
    };

    return (
        <View style={{ flex: 1, backgroundColor: custom.palette.background }}>
            <AppHeader
                title="logo"
                canGoBack={false}
                rightIcon="bell"
                badge={5}
                onRightPress={() => navigation.navigate('AdminNotifications')}
            />

            <ScrollView
                contentContainerStyle={{ padding: 16, paddingBottom: 36 }}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
                }
            >
                {/* Welcome Card */}
                <View
                    style={{
                        backgroundColor: '#FFF',
                        padding: 20,
                        borderRadius: 16,
                        marginBottom: 14,
                        elevation: 2,
                        shadowColor: '#000',
                        shadowOpacity: 0.08,
                        shadowRadius: 3,
                        shadowOffset: { width: 0, height: 1 },
                    }}
                >
                    <Text style={{ fontSize: 14, color: custom.palette.textSecondary }}>
                        Welcome back!
                    </Text>
                    <Text style={{ fontSize: 22, fontWeight: '800', marginTop: 6 }}>
                        {user?.full_name || 'Admin'}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                        <Icon name="shield-alt" size={13} color={custom.palette.primary} />
                        <Text
                            style={{
                                fontSize: 13,
                                color: custom.palette.primary,
                                marginLeft: 6,
                                fontWeight: '600',
                            }}
                        >
                            {user?.roles?.join(', ') || 'Administrator'}
                        </Text>
                    </View>
                    {employee?.name ? (
                        <Text
                            style={{
                                fontSize: 11,
                                color: custom.palette.textSecondary,
                                marginTop: 4,
                            }}
                        >
                            ID: {employee.name}
                        </Text>
                    ) : null}
                </View>

                {/* Today's Overview */}
                <AttendanceOverview />

                {/* Stats Grid */}
                <QuickStatsGrid />

                {/* Department Breakdown */}
                {departmentStats.length > 0 && <DepartmentBreakdown />}

                {/* Quick Insights */}
                <QuickInsights />

                {/* Sections */}
                <Section
                    title="Attendance Control"
                    icon="clipboard-check"
                    tint={custom.palette.primary}
                >
                    <ListItem
                        title="Admin Check In/Out"
                        subtitle="Kiosk/Supervisor mode"
                        leftIcon="user-clock"
                        tint={custom.palette.primary}
                        onPress={() => navigation.navigate('AdminCheckInOut')}
                    />
                    <ListItem
                        title="All Attendance Analytics List"
                        subtitle="View all employee records"
                        leftIcon="list-alt"
                        tint={custom.palette.primary}
                        onPress={() => navigation.navigate('AllAttendanceAnalyticsScreen')}
                    />
                    <ListItem
                        title="Manual Check In/Out"
                        subtitle="Attendance regularization"
                        leftIcon="edit"
                        tint={custom.palette.primary}
                        onPress={() => navigation.navigate('ManualCheckInOut')}
                    />
                    <ListItem
                        title="Today's Attendance"
                        subtitle="Live attendance view"
                        leftIcon="calendar-day"
                        tint={custom.palette.primary}
                        onPress={() => navigation.navigate('TodayAttendance')}
                    />
                </Section>

                <Section
                    title="WFH Policy & Settings"
                    icon="home"
                    tint={custom.palette.success}
                >
                    <ListItem
                        title="Manage WFH Settings"
                        subtitle="Configure rules & eligibility"
                        leftIcon="cog"
                        tint={custom.palette.success}
                        onPress={() => navigation.navigate('WFHSettings')}
                    />
                    <ListItem
                        title="WFH Approvals"
                        subtitle="Approve/reject requests"
                        leftIcon="check-circle"
                        badge="5"
                        tint={custom.palette.success}
                        onPress={() => navigation.navigate('WFHApprovals')}
                    />
                </Section>

                <Section
                    title="Analytics & Reports"
                    icon="chart-line"
                    tint={custom.palette.warning}
                >
                    <ListItem
                        title="Attendance Analytics"
                        subtitle="Trends, late/early, absences"
                        leftIcon="chart-bar"
                        tint={custom.palette.warning}
                        onPress={() => navigation.navigate('AttendanceAnalytics')}
                    />
                    <ListItem
                        title="Today Employee Analytics"
                        subtitle="Real-time counts & heatmap"
                        leftIcon="chart-pie"
                        tint={custom.palette.warning}
                        onPress={() => navigation.navigate('TodayEmployeeAnalytics')}
                    />
                    <ListItem
                        title="Reports & Analytics"
                        subtitle="Comprehensive reports"
                        leftIcon="file-alt"
                        tint={custom.palette.warning}
                        onPress={() => navigation.navigate('Reports')}
                    />
                </Section>

                <Section title="Leave Management" icon="umbrella-beach" tint="#8B5CF6">
                    <ListItem
                        title="Leave Approvals"
                        subtitle="Approve/reject leave requests"
                        leftIcon="clipboard-list"
                        badge="8"
                        tint="#8B5CF6"
                        onPress={() => navigation.navigate('LeaveApprovals')}
                    />
                </Section>

                <Section title="Employee Management" icon="users-cog" tint="#EC4899">
                    <ListItem
                        title="Employee Management"
                        subtitle="Manage employee records"
                        leftIcon="users"
                        tint="#EC4899"
                        onPress={() => navigation.navigate('EmployeeManagement')}
                    />
                </Section>

                <Section title="Projects Oversight" icon="project-diagram" tint="#14B8A6">
                    <ListItem
                        title="View Projects"
                        subtitle="Portfolio & status"
                        leftIcon="folder-open"
                        tint="#14B8A6"
                        onPress={() => navigation.navigate('ProjectsOverview')}
                    />
                    <ListItem
                        title="View Project Logs"
                        subtitle="Progress & time entries"
                        leftIcon="history"
                        tint="#14B8A6"
                        onPress={() => navigation.navigate('ProjectLogs')}
                    />
                </Section>

                <Section
                    title="Notifications & Announcements"
                    icon="bullhorn"
                    tint="#F43F5E"
                >
                    <ListItem
                        title="Create Notification"
                        subtitle="Target by dept/location"
                        leftIcon="plus-circle"
                        tint="#F43F5E"
                        onPress={() => navigation.navigate('CreateNotification')}
                    />
                </Section>

                <Button onPress={handleLogout} style={{ marginTop: 8 }}>
                    Logout
                </Button>
            </ScrollView>

            <EmployeeDetailModal />
        </View>
    );
};

const styles = StyleSheet.create({
    // Overview Card
    overviewCard: {
        backgroundColor: 'white',
        borderRadius: 12,
        padding: 16,
        marginBottom: 14,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
    },
    overviewHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    overviewTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#374151',
        marginLeft: 8,
    },
    overviewContent: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    mainMetric: {
        flex: 1,
        alignItems: 'center',
    },
    mainMetricValue: {
        fontSize: 32,
        fontWeight: '700',
        color: '#111827',
        marginBottom: 4,
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'white',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    statusText: {
        fontSize: 12,
        fontWeight: '500',
        marginLeft: 4,
    },
    overviewStats: {
        flex: 1,
        paddingLeft: 16,
    },
    overviewItem: {
        marginBottom: 8,
    },
    overviewValue: {
        fontSize: 18,
        fontWeight: '700',
        color: '#111827',
    },
    overviewLabel: {
        fontSize: 12,
        color: '#6B7280',
        fontWeight: '500',
    },

    // Stat Card
    statCard: {
        backgroundColor: 'white',
        borderRadius: 12,
        padding: 12,
        alignItems: 'center',
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
    },
    statIconContainer: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
    },
    statValue: {
        fontSize: 18,
        fontWeight: '700',
        color: '#111827',
        marginBottom: 4,
    },
    statLabel: {
        fontSize: 10,
        color: '#6B7280',
        fontWeight: '500',
        textAlign: 'center',
    },

    // Department Card
    departmentCard: {
        backgroundColor: 'white',
        borderRadius: 12,
        padding: 16,
        marginBottom: 14,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    cardTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#374151',
        marginLeft: 8,
    },
    departmentList: {
        flexDirection: 'row',
        paddingRight: 16,
    },
    departmentItem: {
        backgroundColor: '#F8FAFC',
        borderRadius: 8,
        padding: 12,
        marginRight: 12,
        minWidth: 80,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    departmentName: {
        fontSize: 10,
        fontWeight: '600',
        color: '#374151',
        textAlign: 'center',
        marginBottom: 4,
    },
    departmentCount: {
        fontSize: 14,
        fontWeight: '700',
        color: '#111827',
        marginBottom: 2,
    },
    departmentPercentage: {
        fontSize: 10,
        color: '#6B7280',
        fontWeight: '500',
    },

    // Insights Card
    insightsCard: {
        backgroundColor: 'white',
        borderRadius: 12,
        padding: 16,
        marginBottom: 14,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
    },
    insightItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F8FAFC',
        padding: 12,
        borderRadius: 8,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    insightIcon: {
        width: 24,
        height: 24,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    insightText: {
        flex: 1,
        fontSize: 12,
        color: '#374151',
        fontWeight: '500',
    },
    insightAction: {
        fontSize: 10,
        color: '#6366F1',
        fontWeight: '600',
    },

    // Modal Styles
    modalContainer: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: 'white',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        maxHeight: '85%',
        minHeight: '50%',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
    },
    modalHeaderLeft: {
        flex: 1,
    },
    modalHeaderTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#111827',
        marginBottom: 4,
    },
    modalSubtitle: {
        fontSize: 14,
        color: '#6B7280',
        fontWeight: '500',
    },
    modalCloseButton: {
        padding: 8,
        marginLeft: 16,
    },
    modalLoading: {
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
        minHeight: 200,
    },
    modalLoadingText: {
        marginTop: 12,
        color: '#6B7280',
        fontSize: 14,
    },
    modalList: {
        flex: 1,
        paddingHorizontal: 20,
        paddingBottom: 20,
    },
    employeeModalItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#F8FAFC',
        padding: 16,
        borderRadius: 12,
        marginTop: 12,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    employeeModalInfo: {
        flex: 1,
    },
    employeeModalName: {
        fontSize: 16,
        fontWeight: '600',
        color: '#111827',
        marginBottom: 4,
    },
    employeeModalId: {
        fontSize: 12,
        color: '#6B7280',
        marginBottom: 4,
    },
    employeeModalDept: {
        fontSize: 12,
        color: '#6B7280',
    },
    lateInfo: {
        fontSize: 12,
        color: '#EF4444',
        fontWeight: '500',
        marginTop: 6,
    },
    timeInfo: {
        alignItems: 'flex-end',
        marginLeft: 12,
    },
    checkInTime: {
        fontSize: 14,
        fontWeight: '600',
        color: '#6366F1',
    },
    emptyModalState: {
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
        minHeight: 200,
    },
    emptyModalText: {
        marginTop: 16,
        fontSize: 16,
        color: '#6B7280',
        textAlign: 'center',
        fontWeight: '500',
    },
});

export default AdminDashboard;