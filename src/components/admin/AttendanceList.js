// src/components/admin/AttendanceList.js
//
// Day-by-day attendance rows (Attendance Reports screen): real records plus generated rows for
// holidays, leave and absent days, as returned by hrms.api.get_employee_attendance_history.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Group, Row, StatusText, Tag, color, space } from '../ds';
import { formatTimeOfDay } from '../../utils/dateFormat';

// Kept for screens that still colour attendance icons (same palette as the design tokens)
export const STATUS_COLORS = {
    present: '#17B26A',
    wfh: '#7A5AF8',
    onsite: '#2E90FA',
    absent: '#F04438',
    leave: '#F79009',
    holiday: '#4F46E5',
    late: '#F79009',
    muted: '#98A2B3',
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const LABELS = { 'Work From Home': 'WFH', 'Not Marked': 'Not marked' };

const parseDay = (value) => {
    const [y, m, d] = String(value || '').slice(0, 10).split('-').map(Number);
    return y ? new Date(y, m - 1, d) : null;
};

const formatHours = (hours) => {
    const h = Number(hours) || 0;
    if (h <= 0) {
        return null;
    }
    const whole = Math.floor(h);
    const minutes = Math.round((h - whole) * 60);
    return whole ? `${whole}h${minutes ? ` ${minutes}m` : ''}` : `${minutes}m`;
};

const DayBlock = ({ value, muted }) => {
    const d = parseDay(value);
    return (
        <View style={styles.day}>
            <Text style={[styles.dayNumber, muted && styles.muted]}>{d ? d.getDate() : '-'}</Text>
            <Text style={styles.dayName}>{d ? WEEKDAYS[d.getDay()] : ''}</Text>
        </View>
    );
};

export const attendanceRow = (item, index = 0) => {
    const inTime = formatTimeOfDay(item.in_time);
    const outTime = formatTimeOfDay(item.out_time);
    const hasTimes = Boolean(inTime || outTime);
    const title = hasTimes ? `In ${inTime || '–'}  ·  Out ${outTime || '–'}` : (item.note || item.status);
    const subtitle = hasTimes ? [formatHours(item.working_hours), item.note].filter(Boolean).join('  ·  ') : null;
    const tags = [
        item.late_arrival === 'Yes' && <Tag key="l" label="Late" tone="warning" />,
        item.is_draft ? <Tag key="d" label="Not submitted" tone="warning" /> : null,
    ].filter(Boolean);
    return (
        <Row
            key={item.name || `${item.attendance_date}-${index}`}
            left={<DayBlock value={item.attendance_date} muted={item.status === 'Holiday'} />}
            title={title}
            subtitle={subtitle || null}
            meta={tags.length ? tags : null}
            right={<StatusText label={LABELS[item.status] || item.status} tone={item.status === 'Work From Home' ? 'purple' : undefined} />}
        />
    );
};

const AttendanceList = ({ attendance = [], title }) => (
    <Group title={title}>{attendance.map(attendanceRow)}</Group>
);

const styles = StyleSheet.create({
    day: { width: 36, alignItems: 'center', marginRight: space.md },
    dayNumber: { fontSize: 17, fontWeight: '600', color: color.text, fontVariant: ['tabular-nums'] },
    dayName: { fontSize: 11, color: color.textTertiary, marginTop: 1 },
    muted: { color: color.textTertiary },
});

export default AttendanceList;
