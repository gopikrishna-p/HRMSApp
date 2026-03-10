import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    RefreshControl,
    ActivityIndicator,
    Dimensions,
    BackHandler,
    Platform,
} from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useFocusEffect } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/FontAwesome5';
import ApiService from '../../services/api.service';
import AttendanceService from '../../services/attendance.service';
import showToast from '../../utils/Toast';
import { colors } from '../../theme/colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const TodayEmployeeAnalyticsScreen = ({ navigation }) => {
    // State
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);
    
    // Analytics data
    const [attendanceData, setAttendanceData] = useState({
        present: [],
        absent: [],
        holiday: [],
        total_employees: 0,
        working_employees: 0,
        date: '',
    });
    const [departmentStats, setDepartmentStats] = useState([]);
    const [weeklyData, setWeeklyData] = useState([]);

    // Handle Android back button  
    useFocusEffect(
        useCallback(() => {
            const onBackPress = () => {
                handleGoBack();
                return true;
            };
            const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
            return () => subscription.remove();
        }, [])
    );

    useEffect(() => {
        loadData();
    }, [selectedDate]);

    const handleGoBack = () => {
        if (navigation && navigation.canGoBack()) {
            navigation.goBack();
        } else {
            navigation.navigate('AdminDashboard');
        }
    };

    const loadData = async (isRefresh = false) => {
        try {
            isRefresh ? setRefreshing(true) : setLoading(true);

            const dateString = formatDateToYMD(selectedDate);

            // Fetch today's attendance
            const attendancePayload = await AttendanceService.getTodayAttendance(dateString);
            setAttendanceData({
                present: Array.isArray(attendancePayload.present) ? attendancePayload.present : [],
                absent: Array.isArray(attendancePayload.absent) ? attendancePayload.absent : [],
                holiday: Array.isArray(attendancePayload.holiday) ? attendancePayload.holiday : [],
                total_employees: attendancePayload.total_employees ?? 0,
                working_employees: attendancePayload.working_employees ?? 0,
                date: attendancePayload.date ?? dateString,
            });

            // Fetch department statistics
            await fetchDepartmentStats(attendancePayload);

            // Fetch weekly data for heatmap
            await fetchWeeklyData();

        } catch (error) {
            console.error('Error loading data:', error);
            showToast({
                type: 'error',
                text1: 'Error',
                text2: 'Failed to load analytics data',
            });
        } finally {
            isRefresh ? setRefreshing(false) : setLoading(false);
        }
    };

    const fetchDepartmentStats = async (attendance) => {
        try {
            // Get departments
            const deptResponse = await ApiService.getDepartments();
            if (!deptResponse.success || !deptResponse.data?.message) return;

            const departments = deptResponse.data.message;
            
            // Get all employees
            const empResponse = await ApiService.getAllEmployees();
            if (!empResponse.success || !empResponse.data?.message) return;

            const employees = empResponse.data.message.filter(e => e.status === 'Active');

            // Calculate department-wise stats
            const presentEmployees = attendance.present || [];
            const absentEmployees = attendance.absent || [];

            const deptStatsMap = {};

            // Initialize department stats
            employees.forEach(emp => {
                const dept = emp.department || 'Unassigned';
                if (!deptStatsMap[dept]) {
                    deptStatsMap[dept] = {
                        name: dept,
                        total: 0,
                        present: 0,
                        absent: 0,
                        wfh: 0,
                    };
                }
                deptStatsMap[dept].total++;
            });

            // Count present employees by department
            presentEmployees.forEach(emp => {
                const employee = employees.find(e => e.name === emp.employee_id);
                if (employee) {
                    const dept = employee.department || 'Unassigned';
                    if (deptStatsMap[dept]) {
                        deptStatsMap[dept].present++;
                        if (emp.status === 'Work From Home') {
                            deptStatsMap[dept].wfh++;
                        }
                    }
                }
            });

            // Count absent employees by department
            absentEmployees.forEach(emp => {
                const employee = employees.find(e => e.name === emp.employee_id);
                if (employee) {
                    const dept = employee.department || 'Unassigned';
                    if (deptStatsMap[dept]) {
                        deptStatsMap[dept].absent++;
                    }
                }
            });

            // Convert to array and calculate rates
            const stats = Object.values(deptStatsMap)
                .map(dept => ({
                    ...dept,
                    attendanceRate: dept.total > 0 ? Math.round((dept.present / dept.total) * 100) : 0,
                }))
                .sort((a, b) => b.total - a.total);

            setDepartmentStats(stats);

        } catch (error) {
            console.error('Error fetching department stats:', error);
        }
    };

    const fetchWeeklyData = async () => {
        try {
            const weekData = [];
            const today = new Date(selectedDate);

            // Get data for last 7 days
            for (let i = 6; i >= 0; i--) {
                const date = new Date(today);
                date.setDate(date.getDate() - i);
                const dateStr = formatDateToYMD(date);

                try {
                    const dayPayload = await AttendanceService.getTodayAttendance(dateStr);
                    const presentCount = Array.isArray(dayPayload.present) ? dayPayload.present.length : 0;
                    const totalWorking = dayPayload.working_employees ?? dayPayload.total_employees ?? 1;

                    weekData.push({
                        date: dateStr,
                        dayName: date.toLocaleDateString('en-US', { weekday: 'short' }),
                        dayNum: date.getDate(),
                        present: presentCount,
                        total: totalWorking,
                        rate: totalWorking > 0 ? Math.round((presentCount / totalWorking) * 100) : 0,
                        isToday: i === 0,
                    });
                } catch (e) {
                    weekData.push({
                        date: dateStr,
                        dayName: date.toLocaleDateString('en-US', { weekday: 'short' }),
                        dayNum: date.getDate(),
                        present: 0,
                        total: 0,
                        rate: 0,
                        isToday: i === 0,
                    });
                }
            }

            setWeeklyData(weekData);
        } catch (error) {
            console.error('Error fetching weekly data:', error);
        }
    };

    const formatDateToYMD = (date) => {
        return date.toISOString().split('T')[0];
    };

    const navigateDate = (direction) => {
        const newDate = new Date(selectedDate);
        newDate.setDate(newDate.getDate() + (direction === 'prev' ? -1 : 1));
        setSelectedDate(newDate);
    };

    const openDatePicker = () => {
        if (Platform.OS === 'android') {
            DateTimePickerAndroid.open({
                value: selectedDate,
                mode: 'date',
                onChange: (_, date) => date && setSelectedDate(date),
            });
        } else {
            setShowDatePicker(true);
        }
    };

    const onRefresh = () => loadData(true);

    // Calculate derived stats
    const wfhCount = attendanceData.present.filter(p => p.status === 'Work From Home').length;
    const officeCount = attendanceData.present.length - wfhCount;
    const attendanceRate = attendanceData.working_employees > 0
        ? Math.round((attendanceData.present.length / attendanceData.working_employees) * 100)
        : 0;

    // Get color based on rate
    const getRateColor = (rate) => {
        if (rate >= 90) return '#10B981';
        if (rate >= 75) return '#F59E0B';
        if (rate >= 50) return '#F97316';
        return '#EF4444';
    };

    // Get heatmap color
    const getHeatmapColor = (rate) => {
        if (rate >= 90) return '#10B981';
        if (rate >= 80) return '#34D399';
        if (rate >= 70) return '#6EE7B7';
        if (rate >= 60) return '#FCD34D';
        if (rate >= 50) return '#FBBF24';
        if (rate >= 40) return '#F97316';
        return '#EF4444';
    };

    // Render functions
    const renderOverviewStats = () => (
        <View style={styles.overviewSection}>
            <View style={styles.mainStatRow}>
                <View style={[styles.mainStatCard, { backgroundColor: '#ECFDF5' }]}>
                    <Icon name="users" size={24} color="#10B981" />
                    <Text style={styles.mainStatValue}>{attendanceData.present.length}</Text>
                    <Text style={styles.mainStatLabel}>Present</Text>
                </View>
                <View style={[styles.mainStatCard, { backgroundColor: '#FEE2E2' }]}>
                    <Icon name="user-times" size={24} color="#EF4444" />
                    <Text style={styles.mainStatValue}>{attendanceData.absent.length}</Text>
                    <Text style={styles.mainStatLabel}>Absent</Text>
                </View>
            </View>

            <View style={styles.secondaryStatRow}>
                <View style={styles.secondaryStatCard}>
                    <Icon name="building" size={16} color="#3B82F6" />
                    <Text style={styles.secondaryStatValue}>{officeCount}</Text>
                    <Text style={styles.secondaryStatLabel}>In Office</Text>
                </View>
                <View style={styles.secondaryStatCard}>
                    <Icon name="home" size={16} color="#8B5CF6" />
                    <Text style={styles.secondaryStatValue}>{wfhCount}</Text>
                    <Text style={styles.secondaryStatLabel}>WFH</Text>
                </View>
                <View style={styles.secondaryStatCard}>
                    <Icon name="umbrella-beach" size={16} color="#F59E0B" />
                    <Text style={styles.secondaryStatValue}>{attendanceData.holiday.length}</Text>
                    <Text style={styles.secondaryStatLabel}>Holiday</Text>
                </View>
            </View>

            {/* Attendance Rate Circular Progress */}
            <View style={styles.rateSection}>
                <View style={styles.rateCard}>
                    <View style={[styles.rateCircle, { borderColor: getRateColor(attendanceRate) }]}>
                        <Text style={[styles.rateText, { color: getRateColor(attendanceRate) }]}>
                            {attendanceRate}%
                        </Text>
                    </View>
                    <View style={styles.rateInfo}>
                        <Text style={styles.rateTitle}>Attendance Rate</Text>
                        <Text style={styles.rateSubtitle}>
                            {attendanceData.present.length} of {attendanceData.working_employees} employees
                        </Text>
                    </View>
                </View>
            </View>
        </View>
    );

    const renderWeeklyHeatmap = () => (
        <View style={styles.section}>
            <Text style={styles.sectionTitle}>Weekly Attendance Heatmap</Text>
            
            <View style={styles.heatmapContainer}>
                {weeklyData.map((day, index) => (
                    <TouchableOpacity
                        key={index}
                        style={[
                            styles.heatmapCell,
                            day.isToday && styles.heatmapCellToday
                        ]}
                        onPress={() => setSelectedDate(new Date(day.date))}
                    >
                        <View
                            style={[
                                styles.heatmapBlock,
                                { backgroundColor: getHeatmapColor(day.rate) }
                            ]}
                        >
                            <Text style={styles.heatmapRate}>{day.rate}%</Text>
                        </View>
                        <Text style={[
                            styles.heatmapDay,
                            day.isToday && styles.heatmapDayToday
                        ]}>
                            {day.dayName}
                        </Text>
                        <Text style={styles.heatmapDate}>{day.dayNum}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* Legend */}
            <View style={styles.legendContainer}>
                <Text style={styles.legendTitle}>Legend:</Text>
                <View style={styles.legendItems}>
                    <View style={styles.legendItem}>
                        <View style={[styles.legendColor, { backgroundColor: '#10B981' }]} />
                        <Text style={styles.legendText}>90%+</Text>
                    </View>
                    <View style={styles.legendItem}>
                        <View style={[styles.legendColor, { backgroundColor: '#6EE7B7' }]} />
                        <Text style={styles.legendText}>70-89%</Text>
                    </View>
                    <View style={styles.legendItem}>
                        <View style={[styles.legendColor, { backgroundColor: '#FBBF24' }]} />
                        <Text style={styles.legendText}>50-69%</Text>
                    </View>
                    <View style={styles.legendItem}>
                        <View style={[styles.legendColor, { backgroundColor: '#EF4444' }]} />
                        <Text style={styles.legendText}>&lt;50%</Text>
                    </View>
                </View>
            </View>
        </View>
    );

    const renderDepartmentStats = () => (
        <View style={styles.section}>
            <Text style={styles.sectionTitle}>Department-wise Breakdown</Text>
            
            {departmentStats.length === 0 ? (
                <View style={styles.emptyState}>
                    <Icon name="building" size={40} color="#9CA3AF" />
                    <Text style={styles.emptyText}>No department data available</Text>
                </View>
            ) : (
                <View style={styles.departmentList}>
                    {departmentStats.map((dept, index) => (
                        <View key={index} style={styles.departmentItem}>
                            <View style={styles.departmentHeader}>
                                <View style={styles.departmentNameContainer}>
                                    <Icon name="building" size={14} color="#6366F1" />
                                    <Text style={styles.departmentName} numberOfLines={1}>
                                        {dept.name}
                                    </Text>
                                </View>
                                <View style={[
                                    styles.departmentRateBadge,
                                    { backgroundColor: getRateColor(dept.attendanceRate) + '20' }
                                ]}>
                                    <Text style={[
                                        styles.departmentRateText,
                                        { color: getRateColor(dept.attendanceRate) }
                                    ]}>
                                        {dept.attendanceRate}%
                                    </Text>
                                </View>
                            </View>

                            <View style={styles.departmentStats}>
                                <View style={styles.departmentStatItem}>
                                    <Text style={styles.departmentStatLabel}>Total</Text>
                                    <Text style={styles.departmentStatValue}>{dept.total}</Text>
                                </View>
                                <View style={styles.departmentStatItem}>
                                    <Text style={[styles.departmentStatLabel, { color: '#10B981' }]}>Present</Text>
                                    <Text style={styles.departmentStatValue}>{dept.present}</Text>
                                </View>
                                <View style={styles.departmentStatItem}>
                                    <Text style={[styles.departmentStatLabel, { color: '#8B5CF6' }]}>WFH</Text>
                                    <Text style={styles.departmentStatValue}>{dept.wfh}</Text>
                                </View>
                                <View style={styles.departmentStatItem}>
                                    <Text style={[styles.departmentStatLabel, { color: '#EF4444' }]}>Absent</Text>
                                    <Text style={styles.departmentStatValue}>{dept.absent}</Text>
                                </View>
                            </View>

                            {/* Progress bar */}
                            <View style={styles.departmentProgressBar}>
                                <View
                                    style={[
                                        styles.departmentProgressFill,
                                        {
                                            width: `${dept.attendanceRate}%`,
                                            backgroundColor: getRateColor(dept.attendanceRate)
                                        }
                                    ]}
                                />
                            </View>
                        </View>
                    ))}
                </View>
            )}
        </View>
    );

    const renderTimeDistribution = () => {
        // Calculate time-based stats from present employees
        const checkInTimes = attendanceData.present
            .filter(p => p.check_in)
            .map(p => {
                const time = new Date(p.check_in);
                return time.getHours();
            });

        const earlyBirds = checkInTimes.filter(h => h < 9).length;
        const onTime = checkInTimes.filter(h => h >= 9 && h < 10).length;
        const late = checkInTimes.filter(h => h >= 10).length;

        return (
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Check-in Time Distribution</Text>

                <View style={styles.timeDistRow}>
                    <View style={[styles.timeDistCard, { backgroundColor: '#ECFDF5' }]}>
                        <Icon name="sun" size={20} color="#10B981" />
                        <Text style={styles.timeDistValue}>{earlyBirds}</Text>
                        <Text style={styles.timeDistLabel}>Before 9 AM</Text>
                        <Text style={styles.timeDistSubLabel}>Early Birds</Text>
                    </View>
                    <View style={[styles.timeDistCard, { backgroundColor: '#EEF2FF' }]}>
                        <Icon name="clock" size={20} color="#6366F1" />
                        <Text style={styles.timeDistValue}>{onTime}</Text>
                        <Text style={styles.timeDistLabel}>9-10 AM</Text>
                        <Text style={styles.timeDistSubLabel}>On Time</Text>
                    </View>
                    <View style={[styles.timeDistCard, { backgroundColor: '#FEF3C7' }]}>
                        <Icon name="hourglass-half" size={20} color="#F59E0B" />
                        <Text style={styles.timeDistValue}>{late}</Text>
                        <Text style={styles.timeDistLabel}>After 10 AM</Text>
                        <Text style={styles.timeDistSubLabel}>Late Arrivals</Text>
                    </View>
                </View>
            </View>
        );
    };

    // Main render
    if (loading && !refreshing) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#6366F1" />
                <Text style={styles.loadingText}>Loading analytics...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* Date Navigation */}
            <View style={styles.dateNavigation}>
                <TouchableOpacity
                    style={styles.dateNavButton}
                    onPress={() => navigateDate('prev')}
                >
                    <Icon name="chevron-left" size={16} color="#6366F1" />
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.dateInfo}
                    onPress={openDatePicker}
                >
                    <Icon name="calendar-alt" size={16} color="#6366F1" />
                    <Text style={styles.dateLabel}>
                        {selectedDate.toLocaleDateString('en-US', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                        })}
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.dateNavButton}
                    onPress={() => navigateDate('next')}
                >
                    <Icon name="chevron-right" size={16} color="#6366F1" />
                </TouchableOpacity>
            </View>

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                }
                showsVerticalScrollIndicator={false}
            >
                {renderOverviewStats()}
                {renderWeeklyHeatmap()}
                {renderTimeDistribution()}
                {renderDepartmentStats()}
            </ScrollView>

            {/* iOS Date Picker */}
            {showDatePicker && Platform.OS === 'ios' && (
                <DateTimePicker
                    value={selectedDate}
                    mode="date"
                    display="spinner"
                    onChange={(_, date) => {
                        setShowDatePicker(false);
                        if (date) setSelectedDate(date);
                    }}
                />
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F3F4F6',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#F3F4F6',
    },
    loadingText: {
        marginTop: 12,
        fontSize: 14,
        color: '#6B7280',
    },
    dateNavigation: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#FFFFFF',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
    },
    dateNavButton: {
        padding: 8,
        borderRadius: 8,
        backgroundColor: '#EEF2FF',
    },
    dateInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 8,
        backgroundColor: '#F3F4F6',
    },
    dateLabel: {
        fontSize: 15,
        fontWeight: '600',
        color: '#374151',
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: 20,
    },
    overviewSection: {
        backgroundColor: '#FFFFFF',
        padding: 16,
        marginBottom: 8,
    },
    mainStatRow: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 12,
    },
    mainStatCard: {
        flex: 1,
        alignItems: 'center',
        padding: 16,
        borderRadius: 12,
    },
    mainStatValue: {
        fontSize: 32,
        fontWeight: '700',
        color: '#111827',
        marginTop: 8,
    },
    mainStatLabel: {
        fontSize: 12,
        color: '#6B7280',
        marginTop: 4,
    },
    secondaryStatRow: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 16,
    },
    secondaryStatCard: {
        flex: 1,
        flexDirection: 'column',
        alignItems: 'center',
        padding: 12,
        backgroundColor: '#F9FAFB',
        borderRadius: 8,
    },
    secondaryStatValue: {
        fontSize: 18,
        fontWeight: '600',
        color: '#111827',
        marginTop: 4,
    },
    secondaryStatLabel: {
        fontSize: 10,
        color: '#6B7280',
        marginTop: 2,
    },
    rateSection: {
        borderTopWidth: 1,
        borderTopColor: '#E5E7EB',
        paddingTop: 16,
    },
    rateCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
    },
    rateCircle: {
        width: 80,
        height: 80,
        borderRadius: 40,
        borderWidth: 6,
        justifyContent: 'center',
        alignItems: 'center',
    },
    rateText: {
        fontSize: 20,
        fontWeight: '700',
    },
    rateInfo: {
        flex: 1,
    },
    rateTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#374151',
    },
    rateSubtitle: {
        fontSize: 12,
        color: '#6B7280',
        marginTop: 4,
    },
    section: {
        backgroundColor: '#FFFFFF',
        padding: 16,
        marginHorizontal: 16,
        marginVertical: 8,
        borderRadius: 12,
        elevation: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#374151',
        marginBottom: 16,
    },
    heatmapContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    heatmapCell: {
        alignItems: 'center',
        flex: 1,
    },
    heatmapCellToday: {
        transform: [{ scale: 1.05 }],
    },
    heatmapBlock: {
        width: 40,
        height: 40,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 4,
    },
    heatmapRate: {
        fontSize: 10,
        fontWeight: '600',
        color: '#FFFFFF',
    },
    heatmapDay: {
        fontSize: 10,
        color: '#6B7280',
    },
    heatmapDayToday: {
        fontWeight: '700',
        color: '#6366F1',
    },
    heatmapDate: {
        fontSize: 11,
        fontWeight: '600',
        color: '#374151',
    },
    legendContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingTop: 8,
        borderTopWidth: 1,
        borderTopColor: '#E5E7EB',
    },
    legendTitle: {
        fontSize: 12,
        color: '#6B7280',
        marginRight: 12,
    },
    legendItems: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    legendColor: {
        width: 12,
        height: 12,
        borderRadius: 2,
    },
    legendText: {
        fontSize: 10,
        color: '#6B7280',
    },
    timeDistRow: {
        flexDirection: 'row',
        gap: 8,
    },
    timeDistCard: {
        flex: 1,
        alignItems: 'center',
        padding: 12,
        borderRadius: 8,
    },
    timeDistValue: {
        fontSize: 24,
        fontWeight: '700',
        color: '#111827',
        marginTop: 8,
    },
    timeDistLabel: {
        fontSize: 11,
        color: '#374151',
        marginTop: 4,
    },
    timeDistSubLabel: {
        fontSize: 9,
        color: '#6B7280',
    },
    departmentList: {
        gap: 12,
    },
    departmentItem: {
        backgroundColor: '#F9FAFB',
        padding: 12,
        borderRadius: 8,
    },
    departmentHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    departmentNameContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flex: 1,
    },
    departmentName: {
        fontSize: 14,
        fontWeight: '600',
        color: '#374151',
        flex: 1,
    },
    departmentRateBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
    },
    departmentRateText: {
        fontSize: 12,
        fontWeight: '600',
    },
    departmentStats: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    departmentStatItem: {
        alignItems: 'center',
    },
    departmentStatLabel: {
        fontSize: 10,
        color: '#6B7280',
    },
    departmentStatValue: {
        fontSize: 14,
        fontWeight: '600',
        color: '#111827',
    },
    departmentProgressBar: {
        height: 4,
        backgroundColor: '#E5E7EB',
        borderRadius: 2,
        overflow: 'hidden',
    },
    departmentProgressFill: {
        height: '100%',
        borderRadius: 2,
    },
    emptyState: {
        alignItems: 'center',
        padding: 32,
    },
    emptyText: {
        marginTop: 12,
        fontSize: 14,
        color: '#6B7280',
    },
});

export default TodayEmployeeAnalyticsScreen;