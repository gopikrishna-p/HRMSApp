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
    Platform,
    BackHandler,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/FontAwesome5';
import ApiService from '../../services/api.service';
import showToast from '../../utils/Toast';
import { colors } from '../../theme/colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const AttendanceAnalyticsScreen = ({ navigation }) => {
    // State Management
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [departments, setDepartments] = useState([]);
    const [selectedDepartment, setSelectedDepartment] = useState('');
    const [dateRange, setDateRange] = useState({
        startDate: new Date(new Date().setDate(new Date().getDate() - 30)),
        endDate: new Date()
    });
    const [showStartPicker, setShowStartPicker] = useState(false);
    const [showEndPicker, setShowEndPicker] = useState(false);
    const [analyticsData, setAnalyticsData] = useState(null);
    const [selectedTab, setSelectedTab] = useState('overview'); // overview, trends, late, absences

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
        initializeData();
    }, []);

    useEffect(() => {
        if (dateRange.startDate && dateRange.endDate) {
            fetchAnalytics();
        }
    }, [dateRange, selectedDepartment]);

    const handleGoBack = () => {
        if (navigation && navigation.canGoBack()) {
            navigation.goBack();
        } else {
            navigation.navigate('AdminDashboard');
        }
    };

    const initializeData = async () => {
        try {
            setLoading(true);
            await loadDepartments();
            await fetchAnalytics();
        } catch (error) {
            console.error('Initialization error:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadDepartments = async () => {
        try {
            const response = await ApiService.getDepartments();
            if (response.success && response.data?.message) {
                setDepartments(response.data.message);
            }
        } catch (error) {
            console.error('Error loading departments:', error);
        }
    };

    const fetchAnalytics = async () => {
        if (!dateRange.startDate || !dateRange.endDate) return;

        setLoading(true);
        try {
            const params = {
                start_date: dateRange.startDate.toISOString().split('T')[0],
                end_date: dateRange.endDate.toISOString().split('T')[0],
                department: selectedDepartment || null,
            };

            const response = await ApiService.getAttendanceAnalyticsByRange(params);

            if (response.success && response.data?.message) {
                setAnalyticsData(response.data.message);
            } else {
                // Fallback: generate analytics from attendance records
                await generateLocalAnalytics();
            }
        } catch (error) {
            console.error('Error fetching analytics:', error);
            await generateLocalAnalytics();
        } finally {
            setLoading(false);
        }
    };

    const generateLocalAnalytics = async () => {
        // Fallback implementation using local data processing
        try {
            const startStr = dateRange.startDate.toISOString().split('T')[0];
            const endStr = dateRange.endDate.toISOString().split('T')[0];

            // Get attendance records for the date range
            const response = await ApiService.getTodayAttendance({ date: startStr });
            
            // Generate basic analytics from available data
            setAnalyticsData({
                daily_stats: [],
                summary: {
                    total_days: Math.ceil((dateRange.endDate - dateRange.startDate) / (1000 * 60 * 60 * 24)),
                    avg_attendance: 0,
                    trend: 'stable',
                    date_range: { start_date: startStr, end_date: endStr }
                },
                late_arrivals: [],
                absences: []
            });
        } catch (error) {
            console.error('Error generating local analytics:', error);
        }
    };

    const onRefresh = async () => {
        setRefreshing(true);
        await fetchAnalytics();
        setRefreshing(false);
    };

    const applyDatePreset = (preset) => {
        const today = new Date();
        let startDate, endDate;

        switch (preset) {
            case 'week':
                startDate = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
                endDate = today;
                break;
            case 'month':
                startDate = new Date(today.getFullYear(), today.getMonth(), 1);
                endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                break;
            case 'lastMonth':
                startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
                endDate = new Date(today.getFullYear(), today.getMonth(), 0);
                break;
            case 'quarter':
                startDate = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);
                endDate = today;
                break;
            default:
                return;
        }
        setDateRange({ startDate, endDate });
    };

    const formatDate = (date) => {
        if (!date) return 'Select date';
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    };

    const getTrendIcon = (trend) => {
        switch (trend) {
            case 'improving':
                return { name: 'arrow-up', color: '#10B981' };
            case 'declining':
                return { name: 'arrow-down', color: '#EF4444' };
            default:
                return { name: 'minus', color: '#6B7280' };
        }
    };

    // Render functions
    const renderDatePresets = () => (
        <View style={styles.presetContainer}>
            {[
                { label: 'Last 7 Days', type: 'week' },
                { label: 'This Month', type: 'month' },
                { label: 'Last Month', type: 'lastMonth' },
                { label: 'Last 90 Days', type: 'quarter' },
            ].map((preset) => (
                <TouchableOpacity
                    key={preset.type}
                    style={styles.presetButton}
                    onPress={() => applyDatePreset(preset.type)}
                >
                    <Text style={styles.presetText}>{preset.label}</Text>
                </TouchableOpacity>
            ))}
        </View>
    );

    const renderTabs = () => (
        <View style={styles.tabContainer}>
            {[
                { key: 'overview', label: 'Overview', icon: 'chart-pie' },
                { key: 'trends', label: 'Trends', icon: 'chart-line' },
                { key: 'late', label: 'Late/Early', icon: 'clock' },
                { key: 'absences', label: 'Absences', icon: 'calendar-times' },
            ].map((tab) => (
                <TouchableOpacity
                    key={tab.key}
                    style={[styles.tab, selectedTab === tab.key && styles.tabActive]}
                    onPress={() => setSelectedTab(tab.key)}
                >
                    <Icon
                        name={tab.icon}
                        size={14}
                        color={selectedTab === tab.key ? '#6366F1' : '#6B7280'}
                    />
                    <Text style={[styles.tabText, selectedTab === tab.key && styles.tabTextActive]}>
                        {tab.label}
                    </Text>
                </TouchableOpacity>
            ))}
        </View>
    );

    const renderOverviewSection = () => {
        if (!analyticsData?.summary) return null;

        const summary = analyticsData.summary;
        const trendInfo = getTrendIcon(summary.trend);

        return (
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Summary Overview</Text>
                
                <View style={styles.statsGrid}>
                    <View style={[styles.statCard, { backgroundColor: '#EEF2FF' }]}>
                        <Icon name="calendar-check" size={24} color="#6366F1" />
                        <Text style={styles.statValue}>{summary.total_days || 0}</Text>
                        <Text style={styles.statLabel}>Total Days</Text>
                    </View>
                    
                    <View style={[styles.statCard, { backgroundColor: '#ECFDF5' }]}>
                        <Icon name="percentage" size={24} color="#10B981" />
                        <Text style={styles.statValue}>{summary.avg_attendance || 0}%</Text>
                        <Text style={styles.statLabel}>Avg Attendance</Text>
                    </View>
                    
                    <View style={[styles.statCard, { backgroundColor: '#FEF3C7' }]}>
                        <Icon name={trendInfo.name} size={24} color={trendInfo.color} />
                        <Text style={[styles.statValue, { textTransform: 'capitalize' }]}>
                            {summary.trend || 'Stable'}
                        </Text>
                        <Text style={styles.statLabel}>Trend</Text>
                    </View>
                </View>

                {/* Attendance Rate Bar */}
                <View style={styles.progressContainer}>
                    <View style={styles.progressHeader}>
                        <Text style={styles.progressLabel}>Average Attendance Rate</Text>
                        <Text style={styles.progressValue}>{summary.avg_attendance || 0}%</Text>
                    </View>
                    <View style={styles.progressBar}>
                        <View
                            style={[
                                styles.progressFill,
                                {
                                    width: `${Math.min(summary.avg_attendance || 0, 100)}%`,
                                    backgroundColor: (summary.avg_attendance || 0) >= 90 ? '#10B981' :
                                        (summary.avg_attendance || 0) >= 75 ? '#F59E0B' : '#EF4444'
                                }
                            ]}
                        />
                    </View>
                </View>
            </View>
        );
    };

    const renderTrendsSection = () => {
        const dailyStats = analyticsData?.daily_stats || [];

        if (dailyStats.length === 0) {
            return (
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Daily Trends</Text>
                    <View style={styles.emptyState}>
                        <Icon name="chart-line" size={48} color="#9CA3AF" />
                        <Text style={styles.emptyText}>No trend data available</Text>
                    </View>
                </View>
            );
        }

        return (
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Daily Trends</Text>
                
                {/* Simple bar chart representation */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={styles.chartContainer}>
                        {dailyStats.slice(-14).map((day, index) => (
                            <View key={index} style={styles.barContainer}>
                                <Text style={styles.barValue}>{day.attendance_rate || 0}%</Text>
                                <View style={styles.barWrapper}>
                                    <View
                                        style={[
                                            styles.bar,
                                            {
                                                height: `${Math.max(day.attendance_rate || 0, 5)}%`,
                                                backgroundColor: (day.attendance_rate || 0) >= 90 ? '#10B981' :
                                                    (day.attendance_rate || 0) >= 75 ? '#F59E0B' : '#EF4444'
                                            }
                                        ]}
                                    />
                                </View>
                                <Text style={styles.barLabel}>
                                    {new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' })}
                                </Text>
                            </View>
                        ))}
                    </View>
                </ScrollView>

                {/* Statistics table */}
                <View style={styles.statsTable}>
                    <View style={styles.statsRow}>
                        <Text style={styles.statsRowLabel}>Highest Attendance</Text>
                        <Text style={styles.statsRowValue}>
                            {Math.max(...dailyStats.map(d => d.attendance_rate || 0))}%
                        </Text>
                    </View>
                    <View style={styles.statsRow}>
                        <Text style={styles.statsRowLabel}>Lowest Attendance</Text>
                        <Text style={styles.statsRowValue}>
                            {Math.min(...dailyStats.map(d => d.attendance_rate || 0))}%
                        </Text>
                    </View>
                    <View style={styles.statsRow}>
                        <Text style={styles.statsRowLabel}>Total Late Arrivals</Text>
                        <Text style={styles.statsRowValue}>
                            {dailyStats.reduce((sum, d) => sum + (d.late_count || 0), 0)}
                        </Text>
                    </View>
                </View>
            </View>
        );
    };

    const renderLateEarlySection = () => {
        const dailyStats = analyticsData?.daily_stats || [];
        const lateArrivals = analyticsData?.late_arrivals || [];

        const totalLate = dailyStats.reduce((sum, d) => sum + (d.late_count || 0), 0);

        return (
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Late Arrivals & Early Exits</Text>

                <View style={styles.lateStatsGrid}>
                    <View style={[styles.lateStatCard, { backgroundColor: '#FEE2E2' }]}>
                        <Icon name="clock" size={20} color="#EF4444" />
                        <Text style={styles.lateStatValue}>{totalLate}</Text>
                        <Text style={styles.lateStatLabel}>Total Late</Text>
                    </View>
                    <View style={[styles.lateStatCard, { backgroundColor: '#FEF3C7' }]}>
                        <Icon name="sign-out-alt" size={20} color="#F59E0B" />
                        <Text style={styles.lateStatValue}>
                            {analyticsData?.early_exits_count || 0}
                        </Text>
                        <Text style={styles.lateStatLabel}>Early Exits</Text>
                    </View>
                </View>

                {/* Late arrivals by day */}
                {dailyStats.length > 0 && (
                    <View style={styles.lateList}>
                        <Text style={styles.subSectionTitle}>Late Arrivals by Day</Text>
                        {dailyStats.filter(d => (d.late_count || 0) > 0).slice(0, 10).map((day, index) => (
                            <View key={index} style={styles.lateItem}>
                                <View style={styles.lateItemLeft}>
                                    <Text style={styles.lateItemDate}>
                                        {new Date(day.date).toLocaleDateString('en-US', {
                                            weekday: 'short',
                                            month: 'short',
                                            day: 'numeric'
                                        })}
                                    </Text>
                                </View>
                                <View style={styles.lateItemBadge}>
                                    <Text style={styles.lateItemCount}>{day.late_count}</Text>
                                    <Text style={styles.lateItemText}>late</Text>
                                </View>
                            </View>
                        ))}
                    </View>
                )}

                {dailyStats.filter(d => (d.late_count || 0) > 0).length === 0 && (
                    <View style={styles.emptyState}>
                        <Icon name="check-circle" size={48} color="#10B981" />
                        <Text style={styles.emptyText}>No late arrivals in this period!</Text>
                    </View>
                )}
            </View>
        );
    };

    const renderAbsencesSection = () => {
        const dailyStats = analyticsData?.daily_stats || [];

        // Calculate absences
        const absenceDays = dailyStats.filter(d => {
            const absent = (d.working_employees || 0) - (d.total_attendance || 0);
            return absent > 0;
        });

        const totalAbsences = absenceDays.reduce((sum, d) => {
            return sum + ((d.working_employees || 0) - (d.total_attendance || 0));
        }, 0);

        return (
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Absence Patterns</Text>

                <View style={styles.absenceStatsGrid}>
                    <View style={[styles.absenceStatCard, { backgroundColor: '#FEE2E2' }]}>
                        <Icon name="user-times" size={24} color="#EF4444" />
                        <Text style={styles.absenceStatValue}>{totalAbsences}</Text>
                        <Text style={styles.absenceStatLabel}>Total Absences</Text>
                    </View>
                    <View style={[styles.absenceStatCard, { backgroundColor: '#EEF2FF' }]}>
                        <Icon name="calendar-alt" size={24} color="#6366F1" />
                        <Text style={styles.absenceStatValue}>{absenceDays.length}</Text>
                        <Text style={styles.absenceStatLabel}>Days with Absences</Text>
                    </View>
                </View>

                {/* Absence breakdown */}
                {absenceDays.length > 0 && (
                    <View style={styles.absenceList}>
                        <Text style={styles.subSectionTitle}>Days with Most Absences</Text>
                        {absenceDays
                            .sort((a, b) => {
                                const absentA = (a.working_employees || 0) - (a.total_attendance || 0);
                                const absentB = (b.working_employees || 0) - (b.total_attendance || 0);
                                return absentB - absentA;
                            })
                            .slice(0, 10)
                            .map((day, index) => {
                                const absent = (day.working_employees || 0) - (day.total_attendance || 0);
                                return (
                                    <View key={index} style={styles.absenceItem}>
                                        <View style={styles.absenceItemLeft}>
                                            <Text style={styles.absenceItemDate}>
                                                {new Date(day.date).toLocaleDateString('en-US', {
                                                    weekday: 'short',
                                                    month: 'short',
                                                    day: 'numeric'
                                                })}
                                            </Text>
                                            <Text style={styles.absenceItemDay}>{day.day_name}</Text>
                                        </View>
                                        <View style={styles.absenceItemRight}>
                                            <Text style={styles.absenceItemCount}>{absent}</Text>
                                            <Text style={styles.absenceItemLabel}>absent</Text>
                                        </View>
                                    </View>
                                );
                            })}
                    </View>
                )}

                {absenceDays.length === 0 && (
                    <View style={styles.emptyState}>
                        <Icon name="check-circle" size={48} color="#10B981" />
                        <Text style={styles.emptyText}>Perfect attendance in this period!</Text>
                    </View>
                )}
            </View>
        );
    };

    // Main render
    return (
        <View style={styles.container}>
            <ScrollView
                contentContainerStyle={styles.scrollContent}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                }
            >
                {/* Filters Section */}
                <View style={styles.filterSection}>
                    <Text style={styles.filterTitle}>Filter Analytics</Text>

                    {/* Department Picker */}
                    <View style={styles.pickerContainer}>
                        <Picker
                            selectedValue={selectedDepartment}
                            onValueChange={setSelectedDepartment}
                            style={styles.picker}
                        >
                            <Picker.Item label="All Departments" value="" />
                            {departments.map((dept) => (
                                <Picker.Item
                                    key={dept.name}
                                    label={dept.department_name || dept.name}
                                    value={dept.name}
                                />
                            ))}
                        </Picker>
                    </View>

                    {/* Date Presets */}
                    {renderDatePresets()}

                    {/* Custom Date Range */}
                    <View style={styles.dateRow}>
                        <TouchableOpacity
                            style={styles.dateButton}
                            onPress={() => setShowStartPicker(true)}
                        >
                            <Icon name="calendar" size={14} color="#6366F1" />
                            <Text style={styles.dateButtonText}>{formatDate(dateRange.startDate)}</Text>
                        </TouchableOpacity>

                        <Icon name="arrow-right" size={14} color="#9CA3AF" />

                        <TouchableOpacity
                            style={styles.dateButton}
                            onPress={() => setShowEndPicker(true)}
                        >
                            <Icon name="calendar" size={14} color="#6366F1" />
                            <Text style={styles.dateButtonText}>{formatDate(dateRange.endDate)}</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Tabs */}
                {renderTabs()}

                {/* Content based on selected tab */}
                {loading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color="#6366F1" />
                        <Text style={styles.loadingText}>Loading analytics...</Text>
                    </View>
                ) : (
                    <>
                        {selectedTab === 'overview' && renderOverviewSection()}
                        {selectedTab === 'trends' && renderTrendsSection()}
                        {selectedTab === 'late' && renderLateEarlySection()}
                        {selectedTab === 'absences' && renderAbsencesSection()}
                    </>
                )}
            </ScrollView>

            {/* Date Pickers */}
            {showStartPicker && (
                <DateTimePicker
                    value={dateRange.startDate || new Date()}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(event, date) => {
                        setShowStartPicker(false);
                        if (date) setDateRange(prev => ({ ...prev, startDate: date }));
                    }}
                    maximumDate={new Date()}
                />
            )}

            {showEndPicker && (
                <DateTimePicker
                    value={dateRange.endDate || new Date()}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(event, date) => {
                        setShowEndPicker(false);
                        if (date) setDateRange(prev => ({ ...prev, endDate: date }));
                    }}
                    minimumDate={dateRange.startDate || undefined}
                    maximumDate={new Date()}
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
    scrollContent: {
        paddingBottom: 20,
    },
    filterSection: {
        backgroundColor: '#FFFFFF',
        padding: 16,
        marginBottom: 8,
    },
    filterTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#374151',
        marginBottom: 12,
    },
    pickerContainer: {
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 8,
        backgroundColor: '#F9FAFB',
        marginBottom: 12,
    },
    picker: {
        height: 50,
    },
    presetContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 12,
    },
    presetButton: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: '#EEF2FF',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#C7D2FE',
    },
    presetText: {
        fontSize: 12,
        color: '#6366F1',
        fontWeight: '500',
    },
    dateRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
    },
    dateButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        backgroundColor: '#F9FAFB',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        gap: 8,
    },
    dateButtonText: {
        fontSize: 12,
        color: '#374151',
        fontWeight: '500',
    },
    tabContainer: {
        flexDirection: 'row',
        backgroundColor: '#FFFFFF',
        paddingVertical: 8,
        paddingHorizontal: 8,
        marginBottom: 8,
    },
    tab: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        gap: 6,
        borderRadius: 8,
    },
    tabActive: {
        backgroundColor: '#EEF2FF',
    },
    tabText: {
        fontSize: 12,
        color: '#6B7280',
        fontWeight: '500',
    },
    tabTextActive: {
        color: '#6366F1',
        fontWeight: '600',
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
    subSectionTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#6B7280',
        marginBottom: 12,
        marginTop: 8,
    },
    statsGrid: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 12,
        marginBottom: 16,
    },
    statCard: {
        flex: 1,
        alignItems: 'center',
        padding: 16,
        borderRadius: 12,
    },
    statValue: {
        fontSize: 24,
        fontWeight: '700',
        color: '#111827',
        marginTop: 8,
    },
    statLabel: {
        fontSize: 11,
        color: '#6B7280',
        marginTop: 4,
    },
    progressContainer: {
        marginTop: 8,
    },
    progressHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    progressLabel: {
        fontSize: 14,
        color: '#374151',
    },
    progressValue: {
        fontSize: 14,
        fontWeight: '600',
        color: '#6366F1',
    },
    progressBar: {
        height: 8,
        backgroundColor: '#E5E7EB',
        borderRadius: 4,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        borderRadius: 4,
    },
    chartContainer: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        paddingVertical: 16,
        height: 200,
    },
    barContainer: {
        alignItems: 'center',
        marginHorizontal: 4,
        width: 40,
    },
    barValue: {
        fontSize: 10,
        color: '#6B7280',
        marginBottom: 4,
    },
    barWrapper: {
        height: 120,
        width: 24,
        backgroundColor: '#E5E7EB',
        borderRadius: 4,
        justifyContent: 'flex-end',
        overflow: 'hidden',
    },
    bar: {
        width: '100%',
        borderRadius: 4,
    },
    barLabel: {
        fontSize: 10,
        color: '#6B7280',
        marginTop: 4,
    },
    statsTable: {
        marginTop: 16,
        borderTopWidth: 1,
        borderTopColor: '#E5E7EB',
        paddingTop: 16,
    },
    statsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    statsRowLabel: {
        fontSize: 14,
        color: '#374151',
    },
    statsRowValue: {
        fontSize: 14,
        fontWeight: '600',
        color: '#111827',
    },
    lateStatsGrid: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 16,
    },
    lateStatCard: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 8,
        gap: 12,
    },
    lateStatValue: {
        fontSize: 20,
        fontWeight: '700',
        color: '#111827',
    },
    lateStatLabel: {
        fontSize: 12,
        color: '#6B7280',
    },
    lateList: {
        marginTop: 8,
    },
    lateItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    lateItemLeft: {
        flex: 1,
    },
    lateItemDate: {
        fontSize: 14,
        color: '#374151',
    },
    lateItemBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FEE2E2',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        gap: 4,
    },
    lateItemCount: {
        fontSize: 14,
        fontWeight: '600',
        color: '#EF4444',
    },
    lateItemText: {
        fontSize: 12,
        color: '#EF4444',
    },
    absenceStatsGrid: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 16,
    },
    absenceStatCard: {
        flex: 1,
        alignItems: 'center',
        padding: 16,
        borderRadius: 12,
    },
    absenceStatValue: {
        fontSize: 24,
        fontWeight: '700',
        color: '#111827',
        marginTop: 8,
    },
    absenceStatLabel: {
        fontSize: 11,
        color: '#6B7280',
        marginTop: 4,
    },
    absenceList: {
        marginTop: 8,
    },
    absenceItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    absenceItemLeft: {
        flex: 1,
    },
    absenceItemDate: {
        fontSize: 14,
        color: '#374151',
    },
    absenceItemDay: {
        fontSize: 12,
        color: '#6B7280',
    },
    absenceItemRight: {
        alignItems: 'center',
        backgroundColor: '#FEE2E2',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 8,
    },
    absenceItemCount: {
        fontSize: 18,
        fontWeight: '700',
        color: '#EF4444',
    },
    absenceItemLabel: {
        fontSize: 10,
        color: '#EF4444',
    },
    emptyState: {
        alignItems: 'center',
        padding: 40,
    },
    emptyText: {
        marginTop: 16,
        fontSize: 14,
        color: '#6B7280',
        textAlign: 'center',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
    },
    loadingText: {
        marginTop: 12,
        fontSize: 14,
        color: '#6B7280',
    },
});

export default AttendanceAnalyticsScreen;