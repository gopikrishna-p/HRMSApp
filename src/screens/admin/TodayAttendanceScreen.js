// src/screens/admin/TodayAttendanceScreen.js
//
// Everyone's attendance for one day. The server (hrms.api.get_today_attendance) puts each
// active employee in exactly one group: present, absent, on leave or on holiday (their own
// holiday list, so weekends and holidays are not shown as absent).
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { addDays, subDays } from 'date-fns';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import AttendanceService from '../../services/attendance.service';
import { formatLocalDate, formatTimeOfDay } from '../../utils/dateFormat';
import {
    Screen,
    Group,
    Row,
    Avatar,
    Segmented,
    StatStrip,
    ProgressBar,
    StatusText,
    Tag,
    DateNav,
    EmptyState,
    Loading,
    Notice,
    color,
    space,
    type,
    statusTone,
} from '../../components/ds';

const WORK_TYPE = { 'Work From Home': { label: 'WFH', tone: 'purple' }, 'On Site': { label: 'On site', tone: 'info' } };

const formatHours = (hours) => {
    const h = Number(hours) || 0;
    if (h <= 0) {
        return null;
    }
    const whole = Math.floor(h);
    const minutes = Math.round((h - whole) * 60);
    return whole ? `${whole}h${minutes ? ` ${minutes}m` : ''}` : `${minutes}m`;
};

// non-breaking spaces inside one piece ("In 09:48 AM"), so a narrow row wraps only between pieces
const keep = (text) => String(text).replace(/ /g, '\u00A0');

const EMPTY = { present: [], absent: [], leave: [], holiday: [], total_employees: 0, working_employees: 0, is_today: false };

const TodayAttendanceScreen = () => {
    const [date, setDate] = useState(new Date());
    const [showIosPicker, setShowIosPicker] = useState(false);
    const [tab, setTab] = useState('present');
    const [data, setData] = useState(EMPTY);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(null);
    const requestId = useRef(0); // answers for an older date are ignored

    const ymd = useMemo(() => formatLocalDate(date), [date]);
    const isTodayOrLater = ymd >= formatLocalDate(new Date());

    const load = useCallback(async (isRefresh = false) => {
        const id = ++requestId.current;
        isRefresh ? setRefreshing(true) : setLoading(true);
        try {
            const p = await AttendanceService.getTodayAttendance(ymd);
            if (id !== requestId.current) {
                return;
            }
            setData({
                present: Array.isArray(p.present) ? p.present : [],
                absent: Array.isArray(p.absent) ? p.absent : [],
                leave: Array.isArray(p.leave) ? p.leave : [],
                holiday: Array.isArray(p.holiday) ? p.holiday : [],
                total_employees: p.total_employees ?? 0,
                working_employees: p.working_employees ?? 0,
                is_today: Boolean(p.is_today),
            });
            setError(p.error || null);
        } finally {
            if (id === requestId.current) {
                setLoading(false);
                setRefreshing(false);
            }
        }
    }, [ymd]);

    useFocusEffect(
        useCallback(() => {
            load(false);
        }, [load])
    );

    const pickDate = () => {
        if (Platform.OS === 'android') {
            DateTimePickerAndroid.open({
                value: date,
                mode: 'date',
                maximumDate: new Date(),
                onChange: (event, d) => event?.type !== 'dismissed' && d && setDate(d),
            });
        } else {
            setShowIosPicker(true);
        }
    };

    const wfh = data.present.filter((p) => p.status === 'Work From Home').length;
    const onsite = data.present.filter((p) => p.status === 'On Site').length;
    const office = data.present.length - wfh - onsite;
    const rate = data.working_employees > 0 ? Math.round((data.present.length / data.working_employees) * 100) : null;
    const list = data[tab] || [];

    const renderRow = (item) => {
        if (tab === 'present') {
            const checkIn = formatTimeOfDay(item.check_in);
            const checkOut = formatTimeOfDay(item.check_out);
            const hours = formatHours(item.working_hours);
            const state = checkOut ? 'Complete' : data.is_today ? 'Checked in' : 'No check-out';
            const work = WORK_TYPE[item.status];
            // the state sits on the meta line with the tags, so long names and times keep the full row width
            const meta = [
                <StatusText key="s" label={state} />,
                work && <Tag key="w" label={work.label} tone={work.tone} />,
                item.late && <Tag key="l" label="Late" tone="warning" />,
            ].filter(Boolean);
            return (
                <Row
                    key={item.employee_id}
                    left={<Avatar name={item.employee_name} />}
                    title={item.employee_name}
                    titleLines={2}
                    subtitle={[keep(`In ${checkIn || '–'}`), keep(`Out ${checkOut || '–'}`), hours && keep(hours)].filter(Boolean).join('  \u00B7  ')}
                    meta={meta}
                />
            );
        }
        const detail = tab === 'absent'
            ? item.reason
            : tab === 'leave'
                ? `${item.leave_type || 'Leave'}${item.half_day ? ', half day' : ''}`
                : item.holiday_name;
        const status = tab === 'absent' ? 'Absent' : tab === 'leave' ? (item.lwp ? 'Unpaid leave' : 'On leave') : 'Holiday';
        const tone = tab === 'leave' ? (item.lwp ? 'danger' : statusTone('On Leave')) : statusTone(status);
        return (
            <Row
                key={item.employee_id}
                left={<Avatar name={item.employee_name} />}
                title={item.employee_name}
                titleLines={2}
                subtitle={detail || null}
                right={<StatusText label={status} tone={tone} />}
            />
        );
    };

    const emptyText = {
        present: 'No one has checked in.',
        absent: 'No one is absent.',
        leave: 'No one is on leave.',
        holiday: 'No one is on holiday.',
    }[tab];

    return (
        <View style={styles.flex}>
            <DateNav
                date={date}
                onPrev={() => setDate((d) => subDays(d, 1))}
                onNext={() => !isTodayOrLater && setDate((d) => addDays(d, 1))}
                nextDisabled={isTodayOrLater}
                onPick={pickDate}
                caption={`${data.total_employees} ${data.total_employees === 1 ? 'employee' : 'employees'}`}
            />

            <View style={styles.summary}>
                <StatStrip
                    style={styles.flatStrip}
                    items={[
                        { label: 'Present', value: data.present.length },
                        { label: 'Absent', value: data.absent.length, tone: data.absent.length ? 'danger' : undefined },
                        { label: 'On leave', value: data.leave.length },
                        { label: 'Holiday', value: data.holiday.length },
                    ]}
                />
                <View style={styles.rate}>
                    <View style={styles.rateHeader}>
                        <Text style={styles.rateText}>
                            {data.working_employees > 0
                                ? `${data.present.length} of ${data.working_employees} expected at work`
                                : 'No one was expected to work'}
                        </Text>
                        <Text style={styles.rateValue}>{rate == null ? '–' : `${rate}%`}</Text>
                    </View>
                    <ProgressBar value={rate || 0} tone={rate == null ? 'neutral' : rate >= 80 ? 'success' : rate >= 60 ? 'warning' : 'danger'} />
                </View>
                <Segmented
                    value={tab}
                    onChange={setTab}
                    style={styles.tabs}
                    options={[
                        { value: 'present', label: 'Present', count: data.present.length },
                        { value: 'absent', label: 'Absent', count: data.absent.length },
                        { value: 'leave', label: 'Leave', count: data.leave.length },
                        { value: 'holiday', label: 'Holiday', count: data.holiday.length },
                    ]}
                />
            </View>

            {loading && !refreshing ? (
                <Loading />
            ) : (
                <Screen refreshing={refreshing} onRefresh={() => load(true)}>
                    {error ? (
                        <Notice tone="danger" icon="alert-circle" title="Could not load attendance" onPress={() => load(false)}>
                            {`${String(error).replace(/\.\s*$/, '')}. Tap to try again.`}
                        </Notice>
                    ) : null}
                    {list.length === 0 ? (
                        !error ? <EmptyState icon="users" title="Nothing here" message={emptyText} /> : null
                    ) : (
                        <Group footer={tab === 'present' ? `${office} in office, ${wfh} working from home, ${onsite} on site` : undefined}>
                            {list.map(renderRow)}
                        </Group>
                    )}
                </Screen>
            )}

            {showIosPicker && Platform.OS === 'ios' ? (
                <DateTimePicker
                    mode="date"
                    value={date}
                    maximumDate={new Date()}
                    onChange={(_, d) => {
                        setShowIosPicker(false);
                        if (d) {
                            setDate(d);
                        }
                    }}
                />
            ) : null}
        </View>
    );
};

const styles = StyleSheet.create({
    flex: { flex: 1, backgroundColor: color.bg },
    summary: {
        backgroundColor: color.surface,
        paddingBottom: space.md,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: color.border,
    },
    flatStrip: { borderWidth: 0, borderRadius: 0 },
    rate: { paddingHorizontal: space.lg, marginBottom: space.md },
    rateHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: space.sm, marginBottom: 6 },
    rateText: { ...type.secondary, flex: 1 },
    rateValue: { fontSize: 15, fontWeight: '600', color: color.text, fontVariant: ['tabular-nums'] },
    tabs: { marginHorizontal: space.lg },
});

export default TodayAttendanceScreen;
