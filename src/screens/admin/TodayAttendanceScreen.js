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

        return (
            <View key={`${item.employee_id}-${index}`} style={styles.attendanceItem}>
                <View style={styles.itemHeader}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.employeeName}>{item.employee_name}</Text>
                        <Text style={styles.employeeId}>ID: {item.employee_id}</Text>
                    </View>

                    {isPresent && (
                        <View
                            style={[
                                styles.statusBadge,
                                { backgroundColor: checkOut ? '#10B981' : '#F59E0B' },
                            ]}
                        >
                            <Text style={styles.statusText}>
                                {checkOut ? 'Complete' : 'In Progress'}
                            </Text>
                        </View>
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

                {isPresent && (
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

            {/* Summary Stats */}
            <View style={styles.summaryContainer}>
                <View style={styles.statCard}>
                    <Icon name="users" size={18} color="#6366F1" />
                    <View style={styles.statContent}>
                        <Text style={styles.statNumber}>{data.working_employees}</Text>
                        <Text style={styles.statLabel}>Working</Text>
                    </View>
                </View>

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
                    <Icon name="times-circle" size={18} color="#EF4444" />
                    <View style={styles.statContent}>
                        <Text style={[styles.statNumber, { color: '#EF4444' }]}>
                            {data.absent.length}
                        </Text>
                        <Text style={styles.statLabel}>Absent</Text>
                    </View>
                </View>

                <View style={styles.statCard}>
                    <Icon name="percentage" size={18} color="#8B5CF6" />
                    <View style={styles.statContent}>
                        <Text style={[styles.statNumber, { color: '#8B5CF6' }]}>
                            {attendanceRate}%
                        </Text>
                        <Text style={styles.statLabel}>Rate</Text>
                    </View>
                </View>
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
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: 'white',
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
    },
    dateNavButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
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
        fontSize: 16,
        fontWeight: '600',
        color: '#374151',
    },
    recordCount: {
        fontSize: 12,
        color: '#6B7280',
        marginTop: 2,
    },

    summaryContainer: {
        flexDirection: 'row',
        paddingHorizontal: 12,
        paddingVertical: 12,
        backgroundColor: 'white',
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
        gap: 8,
    },
    statCard: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F8FAFC',
        padding: 10,
        borderRadius: 10,
        gap: 8,
    },
    statContent: {
        flex: 1,
    },
    statNumber: {
        fontSize: 18,
        fontWeight: '700',
        color: '#374151',
    },
    statLabel: {
        fontSize: 10,
        color: '#6B7280',
        marginTop: 2,
        fontWeight: '500',
    },

    tabContainer: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingVertical: 10,
        backgroundColor: '#EEF2FF',
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
        gap: 8,
    },
    tab: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        paddingHorizontal: 12,
        backgroundColor: 'white',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        gap: 6,
    },
    tabActive: {
        backgroundColor: '#6366F1',
        borderColor: '#6366F1',
    },
    tabText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#374151',
    },
    tabTextActive: {
        color: 'white',
    },

    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: 16,
        paddingBottom: 24,
    },

    attendanceItem: {
        backgroundColor: 'white',
        marginBottom: 12,
        padding: 16,
        borderRadius: 12,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
    },
    itemHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    employeeName: {
        fontSize: 16,
        fontWeight: '600',
        color: '#111827',
    },
    employeeId: {
        fontSize: 12,
        color: '#6B7280',
        marginTop: 2,
    },
    statusBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    statusText: {
        fontSize: 10,
        color: 'white',
        fontWeight: '600',
    },

    timeContainer: {
        marginTop: 8,
        gap: 6,
    },
    timeInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    timeText: {
        fontSize: 13,
        color: '#374151',
        fontWeight: '500',
    },

    holidayInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 8,
        paddingTop: 8,
        borderTopWidth: 1,
        borderTopColor: '#E5E7EB',
    },
    holidayText: {
        fontSize: 13,
        color: '#6366F1',
        fontWeight: '500',
    },

    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 40,
    },
    loadingText: {
        marginTop: 12,
        fontSize: 16,
        color: '#6B7280',
    },

    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 60,
    },
    emptyTitle: {
        fontSize: 20,
        fontWeight: '600',
        color: '#6B7280',
        marginTop: 16,
    },
    emptyText: {
        fontSize: 14,
        color: '#9CA3AF',
        textAlign: 'center',
        marginTop: 8,
        paddingHorizontal: 32,
    },
});

export default TodayAttendanceScreen;