// src/screens/admin/TodayAttendanceScreen.js
//
// Everyone's attendance for one day. The server (hrms.api.get_today_attendance) puts each
// active employee in exactly one group: present, absent, on leave or on holiday (their own
// holiday list, so weekends and holidays are not shown as absent).
import React, { useCallback, useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    RefreshControl,
    TouchableOpacity,
    ActivityIndicator,
    Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { addDays, subDays } from 'date-fns';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import AttendanceService from '../../services/attendance.service';
import { colors } from '../../theme/colors';
import { formatLocalDate, formatTimeOfDay } from '../../utils/dateFormat';
import showToast from '../../utils/Toast';
import { STATUS_COLORS } from '../../components/admin/AttendanceList';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const longDate = (d) => `${WEEKDAYS[d.getDay()]}, ${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;

const TABS = [
    { key: 'present', label: 'Present', icon: 'check-circle', color: STATUS_COLORS.present },
    { key: 'absent', label: 'Absent', icon: 'times-circle', color: STATUS_COLORS.absent },
    { key: 'leave', label: 'Leave', icon: 'calendar-times', color: STATUS_COLORS.leave },
    { key: 'holiday', label: 'Holiday', icon: 'calendar-day', color: STATUS_COLORS.holiday },
];

const WORK_TYPE = {
    'Work From Home': { label: 'WFH', icon: 'home', color: STATUS_COLORS.wfh },
    'On Site': { label: 'On Site', icon: 'map-marker-alt', color: STATUS_COLORS.onsite },
};
const OFFICE = { label: 'Office', icon: 'building', color: STATUS_COLORS.onsite };

const formatHours = (hours) => {
    const h = Number(hours) || 0;
    if (h <= 0) {
        return null;
    }
    const whole = Math.floor(h);
    const minutes = Math.round((h - whole) * 60);
    return whole ? `${whole}h${minutes ? ` ${minutes}m` : ''}` : `${minutes}m`;
};

const EMPTY = { present: [], absent: [], leave: [], holiday: [], total_employees: 0, working_employees: 0, is_today: false };

const TodayAttendanceScreen = () => {
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [activeTab, setActiveTab] = useState('present');
    const [data, setData] = useState(EMPTY);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(null);

    const dateString = useMemo(() => formatLocalDate(selectedDate), [selectedDate]);
    const isTodayOrLater = dateString >= formatLocalDate(new Date());

    const load = useCallback(async (isRefresh = false) => {
        isRefresh ? setRefreshing(true) : setLoading(true);
        try {
            const payload = await AttendanceService.getTodayAttendance(dateString);
            setData({
                present: Array.isArray(payload.present) ? payload.present : [],
                absent: Array.isArray(payload.absent) ? payload.absent : [],
                leave: Array.isArray(payload.leave) ? payload.leave : [],
                holiday: Array.isArray(payload.holiday) ? payload.holiday : [],
                total_employees: payload.total_employees ?? 0,
                working_employees: payload.working_employees ?? 0,
                is_today: Boolean(payload.is_today),
            });
            setError(payload.error || null);
            if (payload.error) {
                showToast({ type: 'error', text1: 'Could not load attendance', text2: payload.error });
            }
        } finally {
            isRefresh ? setRefreshing(false) : setLoading(false);
        }
    }, [dateString]);

    // reload when the date changes and whenever the screen comes back into view
    useFocusEffect(
        useCallback(() => {
            load(false);
        }, [load])
    );

    const navigateDate = (direction) => {
        if (direction === 'next' && isTodayOrLater) {
            return;
        }
        setSelectedDate((d) => (direction === 'prev' ? subDays(d, 1) : addDays(d, 1)));
    };

    const pickDate = () => {
        if (Platform.OS === 'android') {
            DateTimePickerAndroid.open({
                value: selectedDate,
                mode: 'date',
                maximumDate: new Date(),
                onChange: (event, d) => event?.type !== 'dismissed' && d && setSelectedDate(d),
            });
        } else {
            setShowDatePicker(true);
        }
    };

    const wfhCount = data.present.filter((p) => p.status === 'Work From Home').length;
    const onsiteCount = data.present.filter((p) => p.status === 'On Site').length;
    const officeCount = data.present.length - wfhCount - onsiteCount;
    const rate = data.working_employees > 0 ? Math.round((data.present.length / data.working_employees) * 100) : null;
    const rateColor = rate == null ? colors.textMuted : rate >= 80 ? STATUS_COLORS.present : rate >= 60 ? STATUS_COLORS.late : STATUS_COLORS.absent;
    const activeList = data[activeTab] || [];

    // ------------------------------------------------------------------ list items
    const renderPresent = (item) => {
        const type = WORK_TYPE[item.status] || OFFICE;
        const checkIn = formatTimeOfDay(item.check_in);
        const checkOut = formatTimeOfDay(item.check_out);
        const hours = formatHours(item.working_hours);
        const state = checkOut
            ? { label: 'Complete', color: STATUS_COLORS.present }
            : data.is_today
                ? { label: 'Checked in', color: STATUS_COLORS.late }
                : { label: 'No check-out', color: STATUS_COLORS.absent };
        return (
            <>
                <View style={styles.itemHeader}>
                    <View style={styles.flex}>
                        <Text style={styles.employeeName}>{item.employee_name}</Text>
                        <Text style={styles.employeeId}>{item.employee_id}{item.department ? ` · ${item.department}` : ''}</Text>
                    </View>
                    <View style={styles.badgesContainer}>
                        {item.late ? (
                            <View style={[styles.badge, styles.badgeLate]}>
                                <Icon name="clock" size={9} color={colors.white} />
                                <Text style={styles.badgeText}>Late</Text>
                            </View>
                        ) : null}
                        <View style={[styles.badge, { backgroundColor: type.color }]}>
                            <Icon name={type.icon} size={9} color={colors.white} />
                            <Text style={styles.badgeText}>{type.label}</Text>
                        </View>
                        <View style={[styles.badge, { backgroundColor: state.color }]}>
                            <Text style={styles.badgeText}>{state.label}</Text>
                        </View>
                    </View>
                </View>
                <View style={styles.divider} />
                <View style={styles.timeContainer}>
                    <View style={styles.timeInfo}>
                        <Icon name="sign-in-alt" size={12} color={STATUS_COLORS.present} />
                        <Text style={styles.timeText}>In: {checkIn || '--:--'}</Text>
                    </View>
                    <View style={styles.timeInfo}>
                        <Icon name="sign-out-alt" size={12} color={checkOut ? STATUS_COLORS.absent : STATUS_COLORS.late} />
                        <Text style={[styles.timeText, !checkOut && styles.pendingText]}>
                            Out: {checkOut || (data.is_today ? 'Awaiting' : 'Not recorded')}
                        </Text>
                    </View>
                    {hours ? (
                        <View style={styles.timeInfo}>
                            <Icon name="hourglass-half" size={11} color={colors.primary} />
                            <Text style={styles.timeText}>{hours}</Text>
                        </View>
                    ) : null}
                </View>
                {item.note ? <Text style={styles.noteText}>{item.note}</Text> : null}
            </>
        );
    };

    const renderOther = (item) => {
        let badge;
        let detail;
        if (activeTab === 'absent') {
            badge = { label: 'Absent', color: STATUS_COLORS.absent };
            detail = { icon: 'exclamation-circle', text: item.reason };
        } else if (activeTab === 'leave') {
            badge = { label: item.lwp ? 'Unpaid leave' : 'On leave', color: STATUS_COLORS.leave };
            detail = { icon: 'calendar-times', text: `${item.leave_type}${item.half_day ? ' (half day)' : ''}` };
        } else {
            badge = { label: 'Holiday', color: STATUS_COLORS.holiday };
            detail = { icon: 'calendar-day', text: item.holiday_name };
        }
        return (
            <>
                <View style={styles.itemHeader}>
                    <View style={styles.flex}>
                        <Text style={styles.employeeName}>{item.employee_name}</Text>
                        <Text style={styles.employeeId}>{item.employee_id}{item.department ? ` · ${item.department}` : ''}</Text>
                    </View>
                    <View style={[styles.badge, { backgroundColor: badge.color }]}>
                        <Text style={styles.badgeText}>{badge.label}</Text>
                    </View>
                </View>
                {detail.text ? (
                    <View style={styles.detailRow}>
                        <Icon name={detail.icon} size={12} color={badge.color} />
                        <Text style={[styles.detailText, { color: badge.color }]}>{detail.text}</Text>
                    </View>
                ) : null}
            </>
        );
    };

    // ------------------------------------------------------------------ main
    return (
        <View style={styles.container}>
            {/* Date navigation */}
            <View style={styles.dateNavigation}>
                <TouchableOpacity style={styles.dateNavButton} onPress={() => navigateDate('prev')} activeOpacity={0.8}>
                    <Icon name="chevron-left" size={16} color={colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.dateInfo} onPress={pickDate} activeOpacity={0.8}>
                    <View style={styles.dateTitleRow}>
                        <Text style={styles.dateLabel}>{longDate(selectedDate)}</Text>
                        {data.is_today ? <Text style={styles.todayTag}>Today</Text> : null}
                    </View>
                    <Text style={styles.recordCount}>{data.total_employees} employees</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.dateNavButton, isTodayOrLater && styles.disabled]}
                    onPress={() => navigateDate('next')}
                    disabled={isTodayOrLater}
                    activeOpacity={0.8}
                >
                    <Icon name="chevron-right" size={16} color={colors.primary} />
                </TouchableOpacity>
            </View>

            {/* Summary */}
            <View style={styles.summaryContainer}>
                {[
                    { label: 'Present', value: data.present.length, icon: 'check-circle', color: STATUS_COLORS.present },
                    { label: 'WFH', value: wfhCount, icon: 'home', color: STATUS_COLORS.wfh },
                    { label: 'Leave', value: data.leave.length, icon: 'calendar-times', color: STATUS_COLORS.leave },
                    { label: 'Absent', value: data.absent.length, icon: 'times-circle', color: STATUS_COLORS.absent },
                ].map((s) => (
                    <View key={s.label} style={styles.statCard}>
                        <Icon name={s.icon} size={18} color={s.color} />
                        <View style={styles.flex}>
                            <Text style={[styles.statNumber, { color: s.color }]}>{s.value}</Text>
                            <Text style={styles.statLabel}>{s.label}</Text>
                        </View>
                    </View>
                ))}
            </View>

            {/* Attendance rate */}
            <View style={styles.rateContainer}>
                <View style={styles.rateHeader}>
                    <Text style={styles.rateLabel}>Attendance Rate</Text>
                    <Text style={[styles.ratePercentage, { color: rateColor }]}>{rate == null ? '-' : `${rate}%`}</Text>
                </View>
                <View style={styles.progressBarContainer}>
                    <View style={[styles.progressBarFill, { width: `${rate || 0}%`, backgroundColor: rateColor }]} />
                </View>
                <Text style={styles.rateSubtext}>
                    {data.working_employees > 0
                        ? `${data.present.length} of ${data.working_employees} working employees present`
                        : 'Holiday for everyone: no one was expected to work'}
                </Text>
            </View>

            {/* Tabs */}
            <View style={styles.tabContainer}>
                {TABS.map((t) => {
                    const active = activeTab === t.key;
                    return (
                        <TouchableOpacity
                            key={t.key}
                            style={[styles.tab, active && styles.tabActive]}
                            onPress={() => setActiveTab(t.key)}
                            activeOpacity={0.8}
                        >
                            <Icon name={t.icon} size={12} color={active ? colors.white : t.color} />
                            <Text style={[styles.tabText, active && styles.tabTextActive]} numberOfLines={1}>
                                {t.label} ({(data[t.key] || []).length})
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>

            {/* List */}
            {loading && !refreshing ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator color={colors.primary} size="large" />
                    <Text style={styles.loadingText}>Loading attendance data...</Text>
                </View>
            ) : (
                <ScrollView
                    style={styles.flex}
                    contentContainerStyle={styles.scrollContent}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={[colors.primary]} />}
                >
                    {error ? (
                        <TouchableOpacity style={styles.errorCard} onPress={() => load(false)} activeOpacity={0.8}>
                            <Icon name="exclamation-triangle" size={14} color={STATUS_COLORS.absent} />
                            <Text style={styles.errorText}>Could not load attendance. Tap to try again.</Text>
                        </TouchableOpacity>
                    ) : null}

                    {activeTab === 'present' && data.present.length > 0 ? (
                        <View style={styles.infoCard}>
                            <View style={styles.infoItem}>
                                <Icon name="building" size={13} color={STATUS_COLORS.onsite} />
                                <Text style={styles.infoText}>{officeCount} in Office</Text>
                            </View>
                            <View style={styles.infoItem}>
                                <Icon name="home" size={13} color={STATUS_COLORS.wfh} />
                                <Text style={styles.infoText}>{wfhCount} WFH</Text>
                            </View>
                            <View style={styles.infoItem}>
                                <Icon name="map-marker-alt" size={13} color={STATUS_COLORS.onsite} />
                                <Text style={styles.infoText}>{onsiteCount} On Site</Text>
                            </View>
                        </View>
                    ) : null}

                    {activeList.length === 0 && !error ? (
                        <View style={styles.emptyContainer}>
                            <Icon name="inbox" size={48} color={colors.textMuted} />
                            <Text style={styles.emptyTitle}>No Records</Text>
                            <Text style={styles.emptyText}>
                                No one is {activeTab === 'leave' ? 'on leave' : activeTab === 'holiday' ? 'on holiday' : activeTab} on {longDate(selectedDate)}
                            </Text>
                        </View>
                    ) : (
                        activeList.map((item) => (
                            <View key={item.employee_id} style={styles.attendanceItem}>
                                {activeTab === 'present' ? renderPresent(item) : renderOther(item)}
                            </View>
                        ))
                    )}
                </ScrollView>
            )}

            {showDatePicker && Platform.OS === 'ios' && (
                <DateTimePicker
                    mode="date"
                    value={selectedDate}
                    maximumDate={new Date()}
                    onChange={(_, d) => {
                        setShowDatePicker(false);
                        if (d) {
                            setSelectedDate(d);
                        }
                    }}
                />
            )}
        </View>
    );
};

const SHADOW = {
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    flex: { flex: 1 },
    disabled: { opacity: 0.4 },

    dateNavigation: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    dateNavButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: colors.background,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: colors.border,
    },
    dateInfo: { alignItems: 'center' },
    dateTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    dateLabel: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
    todayTag: {
        fontSize: 10,
        fontWeight: '700',
        color: colors.primary,
        backgroundColor: colors.primaryLight,
        paddingHorizontal: 6,
        paddingVertical: 1,
        borderRadius: 6,
        overflow: 'hidden',
    },
    recordCount: { fontSize: 11, color: colors.textSecondary, marginTop: 2, fontWeight: '500' },

    summaryContainer: { flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 8, backgroundColor: colors.surface, gap: 6 },
    statCard: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background, padding: 8, borderRadius: 8, gap: 6 },
    statNumber: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
    statLabel: { fontSize: 10, color: colors.textSecondary, marginTop: 1, fontWeight: '500' },

    rateContainer: { backgroundColor: colors.surface, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
    rateHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    rateLabel: { fontSize: 12, fontWeight: '600', color: colors.textPrimary },
    ratePercentage: { fontSize: 16, fontWeight: '700' },
    progressBarContainer: { height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden', marginBottom: 4 },
    progressBarFill: { height: '100%', borderRadius: 3 },
    rateSubtext: { fontSize: 10, color: colors.textSecondary, textAlign: 'center' },

    tabContainer: {
        flexDirection: 'row',
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        gap: 6,
    },
    tab: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 8,
        paddingHorizontal: 4,
        backgroundColor: colors.background,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.border,
        gap: 4,
    },
    tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    tabText: { fontSize: 11, fontWeight: '700', color: colors.textPrimary },
    tabTextActive: { color: colors.white },

    scrollContent: { padding: 12, paddingBottom: 20, flexGrow: 1 },
    infoCard: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        backgroundColor: '#F0F9FF',
        padding: 10,
        borderRadius: 8,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#BFDBFE',
    },
    infoItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    infoText: { fontSize: 11, fontWeight: '600', color: '#1E40AF' },
    errorCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: '#FEF2F2',
        borderWidth: 1,
        borderColor: '#FECACA',
        borderRadius: 8,
        padding: 10,
        marginBottom: 12,
    },
    errorText: { flex: 1, fontSize: 12, fontWeight: '600', color: '#B91C1C' },

    attendanceItem: {
        backgroundColor: colors.surface,
        marginBottom: 10,
        padding: 12,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: colors.borderLight,
        ...SHADOW,
    },
    itemHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    employeeName: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
    employeeId: { fontSize: 11, color: colors.textSecondary, marginTop: 1 },
    badgesContainer: { flexDirection: 'row', gap: 4, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end', flexShrink: 1 },
    badge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10 },
    badgeLate: { backgroundColor: STATUS_COLORS.late },
    badgeText: { fontSize: 9.5, color: colors.white, fontWeight: '600' },
    divider: { height: 1, backgroundColor: colors.border, marginVertical: 8 },
    timeContainer: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 4 },
    timeInfo: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    timeText: { fontSize: 12, color: '#374151', fontWeight: '500' },
    pendingText: { color: STATUS_COLORS.late },
    noteText: { fontSize: 11, color: colors.textSecondary, marginTop: 6 },
    detailRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.border },
    detailText: { fontSize: 12, fontWeight: '500' },

    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 30 },
    loadingText: { marginTop: 10, fontSize: 14, color: colors.textSecondary },
    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 50 },
    emptyTitle: { fontSize: 18, fontWeight: '600', color: colors.textSecondary, marginTop: 12 },
    emptyText: { fontSize: 13, color: colors.textMuted, textAlign: 'center', marginTop: 6, paddingHorizontal: 32 },
});

export default TodayAttendanceScreen;
