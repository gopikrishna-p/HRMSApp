// src/screens/employee/AttendanceHistoryScreen.js
//
// The employee's own attendance for a date range (default: 1st of this month to today):
// attendance records plus generated rows for holidays, approved leave and absent weekdays,
// from AttendanceService.getEmployeeAttendanceHistory (counted on the server like payroll). A new range is loaded when
// the employee taps Show in the Period sheet, or on pull-to-refresh.
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAuth } from '../../context/AuthContext';
import AttendanceService from '../../services/attendance.service';
import { formatTimeOfDay } from '../../utils/dateFormat';
import showToast from '../../utils/Toast';
import {
    Screen,
    Group,
    Row,
    StatusText,
    Tag,
    StatStrip,
    ProgressBar,
    SelectField,
    Sheet,
    Button,
    EmptyState,
    Loading,
    formatShortDate,
    statusTone,
    color,
    space,
    type,
} from '../../components/ds';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const STATUS_LABELS = { 'Work From Home': 'WFH', 'On Leave': 'On leave', 'Half Day': 'Half day' };

const stripHtml = (html) => {
    if (!html) {
        return '';
    }
    // Remove HTML tags and decode common HTML entities
    return String(html)
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();
};

// 'YYYY-MM-DD' as a local date (not UTC midnight)
const parseDay = (value) => {
    const [y, m, d] = String(value || '').slice(0, 10).split('-').map(Number);
    return y ? new Date(y, m - 1, d) : null;
};

// "2026-10-06 09:48:53.442343" -> local Date, without relying on the JS engine's date parser
const parseDateTime = (value) => {
    const m = String(value || '').match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
    return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) : null;
};

// worked hours for one record: check-out minus check-in, like the summary in the service
const hoursWorked = (item) => {
    const start = parseDateTime(item.check_in);
    const end = parseDateTime(item.check_out);
    if (start && end) {
        const h = (end - start) / 3600000;
        return h > 0 && h < 24 ? h : 0;
    }
    return 0;
};

const formatHours = (hours) => {
    const h = Number(hours) || 0;
    if (h <= 0) {
        return null;
    }
    let whole = Math.floor(h);
    let minutes = Math.round((h - whole) * 60);
    if (minutes === 60) {
        whole += 1;
        minutes = 0;
    }
    return whole ? `${whole}h${minutes ? ` ${minutes}m` : ''}` : `${minutes}m`;
};

const shortDay = (d) => `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
const formatPeriod = (a, b) => (a.getFullYear() === b.getFullYear()
    ? `${shortDay(a)} – ${shortDay(b)} ${b.getFullYear()}`
    : `${shortDay(a)} ${a.getFullYear()} – ${shortDay(b)} ${b.getFullYear()}`);

const DayBlock = ({ value, muted }) => {
    const d = parseDay(value);
    return (
        <View style={styles.day}>
            <Text style={[styles.dayNumber, muted && styles.muted]}>{d ? d.getDate() : '-'}</Text>
            <Text style={styles.dayName}>{d ? WEEKDAYS[d.getDay()] : ''}</Text>
        </View>
    );
};

const AttendanceHistoryScreen = ({ navigation }) => {
    const { employee } = useAuth();

    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [attendanceData, setAttendanceData] = useState([]);
    const [summaryStats, setSummaryStats] = useState({});
    const [dateRange, setDateRange] = useState({});
    const [, setHolidays] = useState([]);
    const [, setLeaves] = useState([]);
    const [showPeriod, setShowPeriod] = useState(false);

    // Date picker states - Default to 1st of current month to today
    const getFirstDayOfCurrentMonth = () => {
        const today = new Date();
        return new Date(today.getFullYear(), today.getMonth(), 1);
    };

    const [startDate, setStartDate] = useState(getFirstDayOfCurrentMonth());
    const [endDate, setEndDate] = useState(new Date());
    const [showStartPicker, setShowStartPicker] = useState(false);
    const [showEndPicker, setShowEndPicker] = useState(false);

    const employeeId = employee?.name;

    const formatDate = (date) => {
        // Use local timezone to avoid date shift issues
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const loadAttendanceHistory = useCallback(async () => {
        if (!employeeId) {
            return;
        }

        setLoading(true);
        try {
            const startDateStr = formatDate(startDate);
            const endDateStr = formatDate(endDate);

            const result = await AttendanceService.getEmployeeAttendanceHistory(
                employeeId,
                startDateStr,
                endDateStr
            );

            setAttendanceData(result.attendance_records || []);
            setSummaryStats(result.summary_stats || {});
            setDateRange(result.date_range || {});
            setHolidays(result.holidays || []);
            setLeaves(result.leaves || []);
        } catch (error) {
            console.error('Error loading attendance history:', error);
            showToast({ type: 'error', text1: 'Could not load attendance', text2: 'Pull down to try again.' });
        } finally {
            setLoading(false);
        }
    }, [employeeId, startDate, endDate]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadAttendanceHistory();
        setRefreshing(false);
    }, [loadAttendanceHistory]);

    // Load on open only; a new date range is loaded when the employee taps Show
    useEffect(() => {
        loadAttendanceHistory();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [employeeId]);

    const onStartDateChange = (event, selectedDate) => {
        setShowStartPicker(false);
        if (event.type === 'set' && selectedDate) {
            setStartDate(selectedDate);
        }
    };

    const onEndDateChange = (event, selectedDate) => {
        setShowEndPicker(false);
        if (event.type === 'set' && selectedDate) {
            setEndDate(selectedDate);
        }
    };

    const closePeriod = () => {
        setShowPeriod(false);
        setShowStartPicker(false);
        setShowEndPicker(false);
    };

    const showRange = () => {
        closePeriod();
        loadAttendanceHistory();
    };

    // ------------------------------------------------------------------ derived
    const months = useMemo(() => {
        const groups = [];
        attendanceData.forEach((item) => {
            const key = String(item.attendance_date || '').slice(0, 7);
            let group = groups[groups.length - 1];
            if (!group || group.key !== key) {
                const d = parseDay(item.attendance_date);
                group = { key, title: d ? `${MONTHS[d.getMonth()]} ${d.getFullYear()}` : 'Other', items: [] };
                groups.push(group);
            }
            group.items.push(item);
        });
        return groups;
    }, [attendanceData]);

    const totalHours = useMemo(
        () => Math.round(attendanceData.reduce((sum, item) => sum + hoursWorked(item), 0) * 10) / 10,
        [attendanceData]
    );

    const loadedStart = parseDay(dateRange.start_date) || startDate;
    const loadedEnd = parseDay(dateRange.end_date) || endDate;
    const periodText = formatPeriod(loadedStart, loadedEnd);

    // ------------------------------------------------------------------ rows
    const renderRow = (item, index) => {
        const inTime = formatTimeOfDay(item.check_in);
        const outTime = formatTimeOfDay(item.check_out);
        const hasTimes = Boolean(inTime || outTime);

        let title;
        let subtitle = null;
        if (item.type === 'holiday') {
            title = stripHtml(item.description) || 'Holiday';
        } else if (item.type === 'leave') {
            title = item.leave_type || 'Leave';
            const note = stripHtml(item.description);
            subtitle = note && note !== title ? note : null;
        } else if (hasTimes) {
            title = `In ${inTime || '–'}  ·  Out ${outTime || '–'}`;
            // the server's note explains drafts ("Not submitted: counts as absent until submitted")
            subtitle = [formatHours(hoursWorked(item)), item.is_draft ? stripHtml(item.description) : null].filter(Boolean).join('  ·  ') || null;
        } else {
            title = stripHtml(item.description) || 'No check-in';
        }

        // Work mode tag only when the status does not already say it
        const showWorkMode = item.work_mode &&
            item.work_mode !== 'Office' &&
            item.work_mode !== item.status &&
            item.work_mode !== 'Absent' &&
            item.work_mode !== 'On Leave' &&
            item.work_mode !== 'Holiday' &&
            !(item.status === 'Work From Home' && item.work_mode === 'Work From Home');

        const tags = [
            item.type === 'attendance' && item.late_entry ? <Tag key="late" label="Late" tone="warning" /> : null,
            showWorkMode ? <Tag key="mode" label={item.work_mode === 'Work From Home' ? 'WFH' : item.work_mode} /> : null,
        ].filter(Boolean);

        return (
            <Row
                key={item.name || `${item.attendance_date}_${index}`}
                left={<DayBlock value={item.attendance_date} muted={item.type === 'holiday'} />}
                title={title}
                subtitle={subtitle}
                meta={tags.length ? tags : null}
                right={<StatusText label={STATUS_LABELS[item.status] || item.status} tone={statusTone(item.status)} />}
            />
        );
    };

    const renderSummary = () => {
        const rate = Number(summaryStats.attendance_percentage) || 0;
        const absent = summaryStats.absent_days || 0;
        const attended = Number(summaryStats.attended_days) || 0;
        const avg = totalHours > 0 && attended > 0 ? Math.round((totalHours / attended) * 10) / 10 : 0;
        const footer = totalHours > 0
            ? `${formatHours(totalHours)} worked${avg > 0 ? `, ${formatHours(avg)} a day on average` : ''}`
            : undefined;
        return (
            <Group title="Summary" footer={footer}>
                <StatStrip
                    style={styles.flatStrip}
                    items={[
                        { label: 'Present', value: summaryStats.present_days || 0 },
                        { label: 'WFH', value: summaryStats.wfh_days || 0 },
                        { label: 'Leave', value: summaryStats.leave_days || 0 },
                        { label: 'Holiday', value: summaryStats.holiday_days || 0 },
                        { label: 'Absent', value: absent, tone: absent ? 'danger' : undefined },
                    ]}
                />
                <View style={styles.rate}>
                    <View style={styles.rateHeader}>
                        <Text style={type.secondary}>Attendance rate</Text>
                        <Text style={styles.rateValue}>{`${rate}%`}</Text>
                    </View>
                    <ProgressBar value={rate} tone={rate >= 80 ? 'success' : rate >= 60 ? 'warning' : 'danger'} />
                </View>
            </Group>
        );
    };

    // ------------------------------------------------------------------ render
    return (
        <View style={styles.flex}>
            <View style={styles.controls}>
                <SelectField value={periodText} icon="calendar" onPress={() => setShowPeriod(true)} style={styles.noMargin} />
            </View>

            {loading && !refreshing ? (
                <Loading />
            ) : (
                <Screen refreshing={refreshing} onRefresh={onRefresh}>
                    {Object.keys(summaryStats).length > 0 ? renderSummary() : null}
                    {attendanceData.length === 0 ? (
                        <EmptyState icon="calendar" title="No records" message="Nothing recorded for this period." />
                    ) : (
                        months.map((month) => (
                            <Group key={month.key} title={month.title}>
                                {month.items.map(renderRow)}
                            </Group>
                        ))
                    )}
                </Screen>
            )}

            <Sheet
                visible={showPeriod}
                title="Period"
                onClose={closePeriod}
                footer={<Button title="Show" onPress={showRange} disabled={loading} style={styles.grow} />}
            >
                <SelectField label="From" value={formatShortDate(startDate)} icon="calendar" onPress={() => setShowStartPicker(true)} />
                <SelectField label="To" value={formatShortDate(endDate)} icon="calendar" onPress={() => setShowEndPicker(true)} />

                {/* Date Pickers */}
                {showStartPicker && (
                    <DateTimePicker
                        value={startDate}
                        mode="date"
                        display="default"
                        onChange={onStartDateChange}
                        maximumDate={endDate}
                    />
                )}

                {showEndPicker && (
                    <DateTimePicker
                        value={endDate}
                        mode="date"
                        display="default"
                        onChange={onEndDateChange}
                        minimumDate={startDate}
                        maximumDate={new Date()}
                    />
                )}
            </Sheet>
        </View>
    );
};

const styles = StyleSheet.create({
    flex: { flex: 1, backgroundColor: color.bg },
    controls: {
        backgroundColor: color.surface,
        paddingHorizontal: space.lg,
        paddingVertical: space.md,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: color.border,
    },
    grow: { flex: 1 },
    noMargin: { marginBottom: 0 },
    flatStrip: { borderWidth: 0, borderRadius: 0 },
    rate: { paddingHorizontal: space.lg, paddingVertical: space.md },
    rateHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: space.sm, marginBottom: 6 },
    rateValue: { fontSize: 15, fontWeight: '600', color: color.text, fontVariant: ['tabular-nums'] },
    day: { width: 36, alignItems: 'center', marginRight: space.md },
    dayNumber: { fontSize: 17, fontWeight: '600', color: color.text, fontVariant: ['tabular-nums'] },
    dayName: { fontSize: 12, color: color.textTertiary, marginTop: 1 },
    muted: { color: color.textTertiary },
});

export default AttendanceHistoryScreen;
