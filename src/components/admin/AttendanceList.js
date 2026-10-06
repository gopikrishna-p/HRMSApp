import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { colors } from '../../theme/colors';

// Same status colours as Today's Attendance, so a status looks the same on every screen
export const STATUS_COLORS = {
    present: '#10B981',
    wfh: '#8B5CF6',
    onsite: '#3B82F6',
    absent: '#EF4444',
    leave: '#F59E0B',
    holiday: '#6366F1',
    late: '#F59E0B',
    muted: '#9CA3AF',
};

const STATUS = {
    'Present': { color: STATUS_COLORS.present, icon: 'check-circle' },
    'Half Day': { color: STATUS_COLORS.present, icon: 'adjust' },
    'Work From Home': { color: STATUS_COLORS.wfh, icon: 'home', label: 'WFH' },
    'On Site': { color: STATUS_COLORS.onsite, icon: 'building' },
    'Absent': { color: STATUS_COLORS.absent, icon: 'times-circle' },
    'On Leave': { color: STATUS_COLORS.leave, icon: 'calendar-times' },
    'Holiday': { color: STATUS_COLORS.holiday, icon: 'calendar-day' },
    'Not Marked': { color: STATUS_COLORS.muted, icon: 'hourglass-half' },
};
const DEFAULT_STATUS = { color: STATUS_COLORS.muted, icon: 'question-circle' };

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// 'YYYY-MM-DD' read as a local date, so the day never shifts with the timezone
const formatDay = (value) => {
    const [y, m, d] = String(value || '').slice(0, 10).split('-').map(Number);
    if (!y) {
        return { date: '-', weekday: '' };
    }
    const date = new Date(y, m - 1, d);
    return { date: `${String(d).padStart(2, '0')} ${MONTHS[m - 1]} ${y}`, weekday: WEEKDAYS[date.getDay()] };
};

const formatHours = (hours) => {
    const h = Number(hours) || 0;
    if (h <= 0) {
        return null;
    }
    const whole = Math.floor(h);
    const minutes = Math.round((h - whole) * 60);
    if (!whole) {
        return `${minutes}m`;
    }
    return minutes ? `${whole}h ${minutes}m` : `${whole}h`;
};

// One card per day (real attendance plus generated holiday / leave / absent days),
// styled like the employee cards on Today's Attendance.
const DayCard = ({ item }) => {
    const status = STATUS[item.status] || DEFAULT_STATUS;
    const day = formatDay(item.attendance_date);
    const hours = formatHours(item.working_hours);
    const hasTimes = Boolean(item.in_time || item.out_time);

    return (
        <View style={styles.attendanceItem}>
            <View style={styles.itemHeader}>
                <View style={styles.dateInfo}>
                    <Text style={styles.dateText}>{day.date}</Text>
                    <Text style={styles.weekdayText}>{day.weekday}</Text>
                </View>
                <View style={styles.badgesContainer}>
                    {item.late_arrival === 'Yes' ? (
                        <View style={[styles.workTypeBadge, styles.badgeLate]}>
                            <Icon name="clock" size={9} color={colors.white} />
                            <Text style={styles.workTypeBadgeText}>Late</Text>
                        </View>
                    ) : null}
                    {item.is_draft ? (
                        <View style={[styles.workTypeBadge, styles.badgeDraft]}>
                            <Icon name="pen" size={8} color={colors.white} />
                            <Text style={styles.workTypeBadgeText}>Draft</Text>
                        </View>
                    ) : null}
                    <View style={[styles.statusBadge, { backgroundColor: status.color }]}>
                        <Icon name={status.icon} size={9} color={colors.white} />
                        <Text style={styles.statusText}>{status.label || item.status}</Text>
                    </View>
                </View>
            </View>

            {hasTimes ? (
                <>
                    <View style={styles.divider} />
                    <View style={styles.timeContainer}>
                        <View style={styles.timeInfo}>
                            <Icon name="sign-in-alt" size={12} color={STATUS_COLORS.present} />
                            <Text style={styles.timeText}>In: {item.in_time || '--:--'}</Text>
                        </View>
                        <View style={styles.timeInfo}>
                            <Icon name="sign-out-alt" size={12} color={item.out_time ? STATUS_COLORS.absent : STATUS_COLORS.late} />
                            <Text style={[styles.timeText, !item.out_time && styles.timePending]}>
                                Out: {item.out_time || 'Not recorded'}
                            </Text>
                        </View>
                        {hours ? (
                            <View style={styles.timeInfo}>
                                <Icon name="hourglass-half" size={11} color={colors.primary} />
                                <Text style={styles.timeText}>{hours}</Text>
                            </View>
                        ) : null}
                    </View>
                </>
            ) : null}

            {item.note ? (
                <View style={styles.noteInfo}>
                    <Icon name="info-circle" size={11} color={status.color} />
                    <Text style={[styles.noteText, { color: status.color }]} numberOfLines={2}>{item.note}</Text>
                </View>
            ) : null}
        </View>
    );
};

const AttendanceList = ({ attendance = [] }) => (
    <View>
        {attendance.map((item, index) => (
            <DayCard key={item.name || `${item.attendance_date}-${index}`} item={item} />
        ))}
    </View>
);

const styles = StyleSheet.create({
    attendanceItem: {
        backgroundColor: colors.surface,
        marginBottom: 10,
        padding: 12,
        borderRadius: 10,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
        borderWidth: 1,
        borderColor: colors.borderLight,
    },
    itemHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    dateInfo: { flex: 1 },
    dateText: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
    weekdayText: { fontSize: 11, color: colors.textSecondary, marginTop: 1 },
    badgesContainer: { flexDirection: 'row', gap: 4, alignItems: 'center' },
    workTypeBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8, gap: 3 },
    workTypeBadgeText: { fontSize: 9, color: colors.white, fontWeight: '600' },
    badgeLate: { backgroundColor: STATUS_COLORS.late },
    badgeDraft: { backgroundColor: colors.textSecondary },
    statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
    statusText: { fontSize: 10, color: colors.white, fontWeight: '600' },
    divider: { height: 1, backgroundColor: colors.border, marginVertical: 8 },
    timeContainer: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 4 },
    timeInfo: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    timeText: { fontSize: 12, color: '#374151', fontWeight: '500' },
    timePending: { color: STATUS_COLORS.late },
    noteInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        marginTop: 8,
        paddingTop: 6,
        borderTopWidth: 1,
        borderTopColor: colors.border,
    },
    noteText: { flex: 1, fontSize: 12, fontWeight: '500' },
});

export default AttendanceList;
