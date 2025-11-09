// src/screens/admin/TodayAttendanceScreen.js
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
    View,
    StyleSheet,
    ScrollView,
    RefreshControl,
    TouchableOpacity,
    Platform,
} from 'react-native';
import { Text, ActivityIndicator, Divider } from 'react-native-paper';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { format as fmtDate, addDays, subDays } from 'date-fns';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import AttendanceService from '../../services/attendance.service';

const fmtTime = (val) => {
    if (!val) return null;
    try {
        const d = new Date(String(val).replace(' ', 'T'));
        if (isNaN(d.getTime())) return null;
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
        return null;
    }
};

const ymd = (d) => d.toISOString().slice(0, 10);

const TodayAttendanceScreen = () => {
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [activeTab, setActiveTab] = useState('present'); // 'present' | 'absent' | 'holiday'

    const [data, setData] = useState({
        present: [],
        absent: [],
        holiday: [],
        total_employees: 0,
        working_employees: 0,
        date: '',
    });

    const dateString = useMemo(() => ymd(selectedDate), [selectedDate]);

    const load = useCallback(
        async (isRefresh = false) => {
            try {
                isRefresh ? setRefreshing(true) : setLoading(true);
                const payload = await AttendanceService.getTodayAttendance(dateString);
                setData({
                    present: Array.isArray(payload.present) ? payload.present : [],
                    absent: Array.isArray(payload.absent) ? payload.absent : [],
                    holiday: Array.isArray(payload.holiday) ? payload.holiday : [],
                    total_employees: payload.total_employees ?? 0,
                    working_employees: payload.working_employees ?? 0,
                    date: payload.date ?? dateString,
                });
            } finally {
                isRefresh ? setRefreshing(false) : setLoading(false);
            }
        },
        [dateString]
    );

    useEffect(() => {
        load(false);
    }, [load]);

    const navigateDate = (direction) => {
        setSelectedDate((d) => (direction === 'prev' ? subDays(d, 1) : addDays(d, 1)));
    };

    const pickDate = () => {
        if (Platform.OS === 'android') {
            DateTimePickerAndroid.open({
                value: selectedDate,
                mode: 'date',
                onChange: (_, d) => d && setSelectedDate(d),
            });
        } else {
            setShowDatePicker(true);
        }
    };

    const getActiveList = () => {
        switch (activeTab) {
            case 'present':
                return data.present;
            case 'absent':
                return data.absent;
            case 'holiday':
                return data.holiday;
            default:
                return [];
        }
    };

    const renderAttendanceItem = (item, index) => {
        const checkIn = fmtTime(item.check_in);
        const checkOut = fmtTime(item.check_out);
        const isPresent = activeTab === 'present';
        const isAbsent = activeTab === 'absent';
        const isHoliday = activeTab === 'holiday';
        const isWFH = item.status === 'Work From Home';

        return (
            <View key={`${item.employee_id}-${index}`} style={styles.attendanceItem}>
                <View style={styles.itemHeader}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.employeeName}>{item.employee_name}</Text>
                        <Text style={styles.employeeId}>ID: {item.employee_id}</Text>
                    </View>

                    <View style={styles.badgesContainer}>
                        {isPresent && (
                            <>
                                {/* Work Type Badge */}
                                {isWFH ? (
                                    <View style={[styles.workTypeBadge, { backgroundColor: '#8B5CF6' }]}>
                                        <Icon name="home" size={10} color="white" />
                                        <Text style={styles.workTypeBadgeText}>WFH</Text>
                                    </View>
                                ) : (
                                    <View style={[styles.workTypeBadge, { backgroundColor: '#3B82F6' }]}>
                                        <Icon name="building" size={10} color="white" />
                                        <Text style={styles.workTypeBadgeText}>Office</Text>
                                    </View>
                                )}
                                
                                {/* Status Badge */}
                                <View
                                    style={[
                                        styles.statusBadge,
                                        { backgroundColor: checkOut ? '#10B981' : '#F59E0B' },
                                    ]}
                                >
                                    <Text style={styles.statusText}>
                                        {checkOut ? 'Complete' : 'Active'}
                                    </Text>
                                </View>
                            </>
                        )}
                        {isAbsent && (
                            <View style={[styles.statusBadge, { backgroundColor: '#EF4444' }]}>
                                <Text style={styles.statusText}>Absent</Text>
                            </View>
                        )}
                        {isHoliday && (
                            <View style={[styles.statusBadge, { backgroundColor: '#6366F1' }]}>
                                <Text style={styles.statusText}>Holiday</Text>
                            </View>
                        )}
                    </View>
                </View>

                {isPresent && (
                    <>
                        <View style={styles.divider} />
                        <View style={styles.timeContainer}>
                            {checkIn && (
                                <View style={styles.timeInfo}>
                                    <Icon name="sign-in-alt" size={12} color="#10B981" />
                                    <Text style={styles.timeText}>Check-in: {checkIn}</Text>
                                </View>
                            )}

                            {checkOut ? (
                                <View style={styles.timeInfo}>
                                    <Icon name="sign-out-alt" size={12} color="#EF4444" />
                                    <Text style={styles.timeText}>Check-out: {checkOut}</Text>
                                </View>
                            ) : (
                                <View style={styles.timeInfo}>
                                    <Icon name="exclamation-circle" size={12} color="#F59E0B" />
                                    <Text style={[styles.timeText, { color: '#F59E0B' }]}>
                                        Awaiting check-out
                                    </Text>
                                </View>
                            )}
                        </View>
                    </>
                )}

                {isHoliday && item.holiday_name && (
                    <View style={styles.holidayInfo}>
                        <Icon name="calendar-day" size={12} color="#6366F1" />
                        <Text style={styles.holidayText}>{item.holiday_name}</Text>
                    </View>
                )}
            </View>
        );
    };

    const activeList = getActiveList();
    const attendanceRate = data.working_employees > 0
        ? Math.round((data.present.length / data.working_employees) * 100)
        : 0;
    
    // Calculate WFH and Office counts
    const wfhCount = data.present.filter(p => p.status === 'Work From Home').length;
    const officeCount = data.present.length - wfhCount;

    return (
        <View style={styles.container}>
            {/* Date Navigation */}
            <View style={styles.dateNavigation}>
                <TouchableOpacity
                    style={styles.dateNavButton}
                    onPress={() => navigateDate('prev')}
                    activeOpacity={0.8}
                >
                    <Icon name="chevron-left" size={16} color="#6366F1" />
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.dateInfo}
                    onPress={pickDate}
                    activeOpacity={0.8}
                >
                    <Text style={styles.dateLabel}>{dateString}</Text>
                    <Text style={styles.recordCount}>
                        {data.total_employees} total employees
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.dateNavButton}
                    onPress={() => navigateDate('next')}
                    activeOpacity={0.8}
                >
                    <Icon name="chevron-right" size={16} color="#6366F1" />
                </TouchableOpacity>
            </View>

            {/* Summary Stats - Enhanced */}
            <View style={styles.summaryContainer}>
                <View style={styles.statCard}>
                    <Icon name="check-circle" size={18} color="#10B981" />
                    <View style={styles.statContent}>
                        <Text style={[styles.statNumber, { color: '#10B981' }]}>
                            {data.present.length}
                        </Text>
                        <Text style={styles.statLabel}>Present</Text>
                    </View>
                </View>

                <View style={styles.statCard}>
                    <Icon name="building" size={18} color="#3B82F6" />
                    <View style={styles.statContent}>
                        <Text style={[styles.statNumber, { color: '#3B82F6' }]}>
                            {officeCount}
                        </Text>
                        <Text style={styles.statLabel}>Office</Text>
                    </View>
                </View>

                <View style={styles.statCard}>
                    <Icon name="home" size={18} color="#8B5CF6" />
                    <View style={styles.statContent}>
                        <Text style={[styles.statNumber, { color: '#8B5CF6' }]}>
                            {wfhCount}
                        </Text>
                        <Text style={styles.statLabel}>WFH</Text>
                    </View>
                </View>

                <View style={styles.statCard}>
                    <Icon name="times-circle" size={18} color="#EF4444" />
                    <View style={styles.statContent}>
                        <Text style={[styles.statNumber, { color: '#EF4444' }]}>
                            {data.absent.length}
                        </Text>
                        <Text style={styles.statLabel}>Absent</Text>
                    </View>
                </View>
            </View>

            {/* Attendance Rate Bar */}
            <View style={styles.rateContainer}>
                <View style={styles.rateHeader}>
                    <Text style={styles.rateLabel}>Attendance Rate</Text>
                    <Text style={styles.ratePercentage}>{attendanceRate}%</Text>
                </View>
                <View style={styles.progressBarContainer}>
                    <View 
                        style={[
                            styles.progressBarFill, 
                            { 
                                width: `${attendanceRate}%`,
                                backgroundColor: attendanceRate >= 80 ? '#10B981' : attendanceRate >= 60 ? '#F59E0B' : '#EF4444'
                            }
                        ]} 
                    />
                </View>
                <Text style={styles.rateSubtext}>
                    {data.present.length} of {data.working_employees} employees present
                </Text>
            </View>

            {/* Tab Navigation */}
            <View style={styles.tabContainer}>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'present' && styles.tabActive]}
                    onPress={() => setActiveTab('present')}
                    activeOpacity={0.8}
                >
                    <Icon
                        name="check-circle"
                        size={14}
                        color={activeTab === 'present' ? 'white' : '#10B981'}
                    />
                    <Text
                        style={[
                            styles.tabText,
                            activeTab === 'present' && styles.tabTextActive,
                        ]}
                    >
                        Present ({data.present.length})
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.tab, activeTab === 'absent' && styles.tabActive]}
                    onPress={() => setActiveTab('absent')}
                    activeOpacity={0.8}
                >
                    <Icon
                        name="times-circle"
                        size={14}
                        color={activeTab === 'absent' ? 'white' : '#EF4444'}
                    />
                    <Text
                        style={[
                            styles.tabText,
                            activeTab === 'absent' && styles.tabTextActive,
                        ]}
                    >
                        Absent ({data.absent.length})
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.tab, activeTab === 'holiday' && styles.tabActive]}
                    onPress={() => setActiveTab('holiday')}
                    activeOpacity={0.8}
                >
                    <Icon
                        name="calendar-day"
                        size={14}
                        color={activeTab === 'holiday' ? 'white' : '#6366F1'}
                    />
                    <Text
                        style={[
                            styles.tabText,
                            activeTab === 'holiday' && styles.tabTextActive,
                        ]}
                    >
                        Holiday ({data.holiday.length})
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Content */}
            {loading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator color="#6366F1" size="large" />
                    <Text style={styles.loadingText}>Loading attendance data...</Text>
                </View>
            ) : activeList.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <Icon name="inbox" size={48} color="#9CA3AF" />
                    <Text style={styles.emptyTitle}>No Records</Text>
                    <Text style={styles.emptyText}>
                        No {activeTab} records for {dateString}
                    </Text>
                </View>
            ) : (
                <ScrollView
                    style={styles.scrollView}
                    contentContainerStyle={styles.scrollContent}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={() => load(true)}
                        />
                    }
                >
                    {/* Info Card for Present Tab */}
                    {activeTab === 'present' && (wfhCount > 0 || officeCount > 0) && (
                        <View style={styles.infoCard}>
                            <View style={styles.infoRow}>
                                <View style={styles.infoItem}>
                                    <Icon name="building" size={14} color="#3B82F6" />
                                    <Text style={styles.infoText}>
                                        {officeCount} in Office
                                    </Text>
                                </View>
                                <View style={styles.infoItem}>
                                    <Icon name="home" size={14} color="#8B5CF6" />
                                    <Text style={styles.infoText}>
                                        {wfhCount} Work From Home
                                    </Text>
                                </View>
                            </View>
                        </View>
                    )}
                    
                    {activeList.map((item, index) => renderAttendanceItem(item, index))}
                </ScrollView>
            )}

            {/* iOS Date Picker */}
            {showDatePicker && Platform.OS === 'ios' && (
                <DateTimePicker
                    mode="date"
                    value={selectedDate}
                    onChange={(_, d) => {
                        setShowDatePicker(false);
                        d && setSelectedDate(d);
                    }}
                />
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F8FAFC',
    },

    dateNavigation: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: 'white',
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
        elevation: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
    },
    dateNavButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#F8FAFC',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    dateInfo: {
        alignItems: 'center',
    },
    dateLabel: {
        fontSize: 15,
        fontWeight: '700',
        color: '#111827',
    },
    recordCount: {
        fontSize: 11,
        color: '#6B7280',
        marginTop: 2,
        fontWeight: '500',
    },

    summaryContainer: {
        flexDirection: 'row',
        paddingHorizontal: 10,
        paddingVertical: 8,
        backgroundColor: 'white',
        gap: 6,
    },
    statCard: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F8FAFC',
        padding: 8,
        borderRadius: 8,
        gap: 6,
    },
    statContent: {
        flex: 1,
    },
    statNumber: {
        fontSize: 16,
        fontWeight: '700',
        color: '#374151',
    },
    statLabel: {
        fontSize: 9,
        color: '#6B7280',
        marginTop: 1,
        fontWeight: '500',
    },

    rateContainer: {
        backgroundColor: 'white',
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
    },
    rateHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
    },
    rateLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: '#374151',
    },
    ratePercentage: {
        fontSize: 16,
        fontWeight: '700',
        color: '#6366F1',
    },
    progressBarContainer: {
        height: 6,
        backgroundColor: '#E5E7EB',
        borderRadius: 3,
        overflow: 'hidden',
        marginBottom: 4,
    },
    progressBarFill: {
        height: '100%',
        borderRadius: 3,
    },
    rateSubtext: {
        fontSize: 10,
        color: '#6B7280',
        textAlign: 'center',
    },

    tabContainer: {
        flexDirection: 'row',
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: 'white',
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
        gap: 6,
    },
    tab: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 8,
        paddingHorizontal: 8,
        backgroundColor: '#F8FAFC',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        gap: 4,
    },
    tabActive: {
        backgroundColor: '#6366F1',
        borderColor: '#6366F1',
        elevation: 1,
        shadowColor: '#6366F1',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.3,
        shadowRadius: 2,
    },
    tabText: {
        fontSize: 11,
        fontWeight: '700',
        color: '#374151',
    },
    tabTextActive: {
        color: 'white',
    },

    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: 12,
        paddingBottom: 20,
    },

    infoCard: {
        backgroundColor: '#F0F9FF',
        padding: 10,
        borderRadius: 8,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#BFDBFE',
    },
    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        gap: 8,
    },
    infoItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },
    infoText: {
        fontSize: 11,
        fontWeight: '600',
        color: '#1E40AF',
    },

    attendanceItem: {
        backgroundColor: 'white',
        marginBottom: 10,
        padding: 12,
        borderRadius: 10,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
        borderWidth: 1,
        borderColor: '#F3F4F6',
    },
    itemHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        marginBottom: 6,
    },
    employeeName: {
        fontSize: 14,
        fontWeight: '600',
        color: '#111827',
    },
    employeeId: {
        fontSize: 11,
        color: '#6B7280',
        marginTop: 1,
    },
    badgesContainer: {
        flexDirection: 'row',
        gap: 4,
        alignItems: 'center',
    },
    workTypeBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 6,
        paddingVertical: 3,
        borderRadius: 8,
        gap: 3,
    },
    workTypeBadgeText: {
        fontSize: 9,
        color: 'white',
        fontWeight: '600',
    },
    statusBadge: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 10,
    },
    statusText: {
        fontSize: 9,
        color: 'white',
        fontWeight: '600',
    },

    timeContainer: {
        marginTop: 3,
        gap: 6,
    },
    timeInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 1,
    },
    timeText: {
        fontSize: 12,
        color: '#374151',
        fontWeight: '500',
    },

    divider: {
        height: 1,
        backgroundColor: '#E5E7EB',
        marginVertical: 8,
    },

    holidayInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        marginTop: 6,
        paddingTop: 6,
        borderTopWidth: 1,
        borderTopColor: '#E5E7EB',
    },
    holidayText: {
        fontSize: 12,
        color: '#6366F1',
        fontWeight: '500',
    },

    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 30,
    },
    loadingText: {
        marginTop: 10,
        fontSize: 14,
        color: '#6B7280',
    },

    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 50,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#6B7280',
        marginTop: 12,
    },
    emptyText: {
        fontSize: 13,
        color: '#9CA3AF',
        textAlign: 'center',
        marginTop: 6,
        paddingHorizontal: 32,
    },
});

export default TodayAttendanceScreen;