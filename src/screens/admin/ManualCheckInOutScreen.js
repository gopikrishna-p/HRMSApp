// src/screens/admin/ManualCheckInOutScreen.js
//
// Fix one day's attendance: edit check-in / check-out times, submit drafts, set times for
// several records at once, and add attendance for employees with no record that day.
// Times are sent as 'HH:MM' and applied on the record's own date by the server, so they
// never shift with the phone's timezone. A draft with both times is submitted automatically.
import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Alert, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { addDays, subDays } from 'date-fns';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import ApiService from '../../services/api.service';
import { formatLocalDate, formatTimeOfDay, toHHMM, timeOnDay } from '../../utils/dateFormat';
import showToast from '../../utils/Toast';
import {
    Screen,
    Group,
    Row,
    Avatar,
    Segmented,
    StatStrip,
    StatusText,
    Tag,
    DateNav,
    Sheet,
    Button,
    Field,
    SelectField,
    EmptyState,
    Loading,
    Icon,
    color,
    space,
    type,
    formatLongDate,
} from '../../components/ds';

const STATUS_LABELS = { 'Work From Home': 'WFH' };
const WORK_TYPES = [
    { value: 'Office', label: 'Office' },
    { value: 'WFH', label: 'WFH' },
    { value: 'On Site', label: 'On site' },
];

const formatHours = (hours) => {
    const h = Number(hours) || 0;
    if (h <= 0) {
        return null;
    }
    const whole = Math.floor(h);
    const minutes = Math.round((h - whole) * 60);
    return whole ? `${whole}h${minutes ? ` ${minutes}m` : ''}` : `${minutes}m`;
};

const hasNoCheckout = (r) => r.name && r.in_time && !r.out_time && r.status !== 'On Leave';

const ManualCheckInOutScreen = () => {
    const [date, setDate] = useState(new Date());
    const [showIosDate, setShowIosDate] = useState(false);
    const [tab, setTab] = useState('all');
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const [selectMode, setSelectMode] = useState(false);
    const [selected, setSelected] = useState([]);

    // sheets: 'edit' (one record), 'add' (no record yet), 'bulk' (selected records)
    const [dialog, setDialog] = useState(null);
    const [saving, setSaving] = useState(false);
    const [iosPicker, setIosPicker] = useState(null); // field name while an iOS inline time picker is open

    const ymd = useMemo(() => formatLocalDate(date), [date]);
    const isTodayOrLater = ymd >= formatLocalDate(new Date());

    // ------------------------------------------------------------------ data
    const load = useCallback(async (isRefresh = false) => {
        isRefresh ? setRefreshing(true) : setLoading(true);
        try {
            const res = await ApiService.getAttendanceRecordsForDate({ date: ymd, include_missing: true });
            if (res.success) {
                setRows(res.data?.message?.attendance_records || []);
            } else {
                setRows([]);
                showToast({ type: 'error', text1: 'Could not load records', text2: res.message || 'Please try again' });
            }
        } finally {
            isRefresh ? setRefreshing(false) : setLoading(false);
        }
    }, [ymd]);

    useFocusEffect(
        useCallback(() => {
            setSelected([]);
            setSelectMode(false);
            load(false);
        }, [load])
    );

    const counts = useMemo(() => {
        const records = rows.filter((r) => r.name);
        return {
            records: records.length,
            pending: records.filter(hasNoCheckout).length,
            missing: rows.filter((r) => !r.name).length,
            drafts: records.filter((r) => r.docstatus === 0).length,
        };
    }, [rows]);

    const visibleRows = useMemo(() => {
        if (tab === 'pending') {
            return rows.filter(hasNoCheckout);
        }
        if (tab === 'missing') {
            return rows.filter((r) => !r.name);
        }
        return rows;
    }, [rows, tab]);
    const selectableRows = visibleRows.filter((r) => r.name && r.status !== 'On Leave');

    const pickDate = () => {
        if (Platform.OS === 'android') {
            DateTimePickerAndroid.open({
                value: date,
                mode: 'date',
                maximumDate: new Date(),
                onChange: (event, d) => event?.type !== 'dismissed' && d && setDate(d),
            });
        } else {
            setShowIosDate(true);
        }
    };

    // ------------------------------------------------------------------ time fields
    const setField = (field, value) => setDialog((dlg) => (dlg ? { ...dlg, [field]: value } : dlg));

    const openTimePicker = (field) => {
        const current = dialog?.[field] || timeOnDay(date, null, field === 'checkOut' ? '18:00' : '10:00');
        if (Platform.OS === 'android') {
            DateTimePickerAndroid.open({
                value: current,
                mode: 'time',
                is24Hour: false,
                onChange: (event, d) => event?.type !== 'dismissed' && d && setField(field, timeOnDay(date, toHHMM(d))),
            });
        } else {
            setIosPicker(field);
        }
    };

    const timeField = (label, field, optional = false) => (
        <View>
            <SelectField
                label={label}
                value={dialog?.[field] ? formatTimeOfDay(dialog[field]) : null}
                placeholder={optional ? 'Not set' : 'Set time'}
                icon="clock"
                onPress={() => openTimePicker(field)}
            />
            {optional && dialog?.[field] ? (
                <Text style={styles.clearLink} onPress={() => setField(field, null)}>Clear check-out time</Text>
            ) : null}
            {Platform.OS === 'ios' && iosPicker === field ? (
                <DateTimePicker
                    mode="time"
                    display="spinner"
                    value={dialog?.[field] || timeOnDay(date, null, '10:00')}
                    onChange={(_, d) => d && setField(field, timeOnDay(date, toHHMM(d)))}
                />
            ) : null}
        </View>
    );

    const closeDialog = () => {
        if (!saving) {
            setDialog(null);
            setIosPicker(null);
        }
    };

    // ------------------------------------------------------------------ actions
    const openRow = (row) => {
        if (selectMode) {
            if (row.name && row.status !== 'On Leave') {
                setSelected((old) => (old.includes(row.name) ? old.filter((x) => x !== row.name) : [...old, row.name]));
            }
            return;
        }
        if (!row.name) {
            setDialog({
                type: 'add',
                row,
                workType: 'Office',
                checkIn: timeOnDay(date, null, '10:00'),
                checkOut: isTodayOrLater ? null : timeOnDay(date, null, '19:00'),
            });
        } else if (row.status !== 'On Leave') {
            setDialog({
                type: 'edit',
                row,
                checkIn: row.in_time ? timeOnDay(date, row.in_time) : null,
                checkOut: row.out_time ? timeOnDay(date, row.out_time) : null,
            });
        }
    };

    const saveEdit = async () => {
        const { row, checkIn, checkOut } = dialog;
        if (!checkIn && !checkOut) {
            showToast({ type: 'warning', text1: 'Set a time', text2: 'Choose a check-in or check-out time' });
            return;
        }
        if (checkIn && checkOut && checkOut <= checkIn) {
            showToast({ type: 'warning', text1: 'Check the times', text2: 'Check-out must be after check-in' });
            return;
        }
        setSaving(true);
        try {
            const res = await ApiService.updateAttendanceTimes({
                attendance_id: row.name,
                check_in_time: checkIn ? `${ymd} ${toHHMM(checkIn)}:00` : undefined,
                check_out_time: checkOut ? `${ymd} ${toHHMM(checkOut)}:00` : undefined,
            });
            if (res.success) {
                showToast({ type: 'success', text1: row.employee_name, text2: res.data?.message?.message || 'Times updated' });
                setDialog(null);
                load(true);
            } else {
                showToast({ type: 'error', text1: 'Not saved', text2: res.message || 'Failed to update times' });
            }
        } finally {
            setSaving(false);
        }
    };

    const submitAsIs = () => {
        const { row } = dialog;
        const doSubmit = async () => {
            setSaving(true);
            try {
                const res = await ApiService.submitAttendance({ attendance_id: row.name });
                if (res.success) {
                    showToast({ type: 'success', text1: row.employee_name, text2: res.data?.message?.message || 'Attendance submitted' });
                    setDialog(null);
                    load(true);
                } else {
                    showToast({ type: 'error', text1: 'Not submitted', text2: res.message || 'Failed to submit' });
                }
            } finally {
                setSaving(false);
            }
        };
        if (!row.out_time) {
            Alert.alert('Submit without check-out?', `${row.employee_name} has no check-out time. Add it first if you know it.`, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Submit', onPress: doSubmit },
            ]);
        } else {
            doSubmit();
        }
    };

    const saveAdd = async () => {
        const { row, workType, checkIn, checkOut } = dialog;
        if (checkOut && checkOut <= checkIn) {
            showToast({ type: 'warning', text1: 'Check the times', text2: 'Check-out must be after check-in' });
            return;
        }
        setSaving(true);
        try {
            const res = await ApiService.adminMarkAttendance({
                employee: row.employee,
                date: ymd,
                check_in_time: toHHMM(checkIn),
                check_out_time: checkOut ? toHHMM(checkOut) : undefined,
                work_type: workType,
            });
            if (res.success) {
                showToast({ type: 'success', text1: row.employee_name, text2: res.data?.message?.message || 'Attendance added' });
                setDialog(null);
                load(true);
            } else {
                showToast({ type: 'error', text1: 'Not added', text2: res.message || 'Failed to add attendance' });
            }
        } finally {
            setSaving(false);
        }
    };

    const saveBulk = async () => {
        const { mode, checkIn, checkOut } = dialog;
        if (mode === 'both' && checkOut <= checkIn) {
            showToast({ type: 'warning', text1: 'Check the times', text2: 'Check-out must be after check-in' });
            return;
        }
        setSaving(true);
        try {
            const res = await ApiService.bulkUpdateAttendanceTimes({
                attendance_updates: selected.map((id) => ({
                    attendance_id: id,
                    check_in_time: mode !== 'out' ? toHHMM(checkIn) : undefined,
                    check_out_time: mode !== 'in' ? toHHMM(checkOut) : undefined,
                })),
            });
            const result = res.data?.message || {};
            if (res.success) {
                showToast({
                    type: result.failed ? 'warning' : 'success',
                    text1: `${result.successful ?? 0} updated${result.failed ? `, ${result.failed} not updated` : ''}`,
                    text2: result.errors?.[0]?.error || 'Drafts with both times are submitted',
                });
                setDialog(null);
                setSelected([]);
                setSelectMode(false);
                load(true);
            } else {
                showToast({ type: 'error', text1: 'Not updated', text2: res.message || 'Bulk update failed' });
            }
        } finally {
            setSaving(false);
        }
    };

    const allSelected = selectableRows.length > 0 && selectableRows.every((r) => selected.includes(r.name));

    // ------------------------------------------------------------------ rows
    const renderRow = (row) => {
        const isMissing = !row.name;
        const isLeave = row.status === 'On Leave';
        const checkIn = formatTimeOfDay(row.in_time);
        const checkOut = formatTimeOfDay(row.out_time);
        const subtitle = isMissing
            ? 'No check-in recorded'
            : isLeave
                ? 'On approved leave'
                : [`In ${checkIn || '–'}`, `Out ${checkOut || '–'}`, formatHours(row.working_hours)].filter(Boolean).join('  ·  ');
        const tags = !isMissing && !isLeave
            ? [row.docstatus === 0 && <Tag key="d" label="Draft" tone="warning" />, row.late_entry ? <Tag key="l" label="Late" tone="warning" /> : null].filter(Boolean)
            : [];
        const checked = selected.includes(row.name);
        const selectable = selectMode && !isMissing && !isLeave;
        return (
            <Row
                key={row.name || `missing-${row.employee}`}
                left={selectMode ? (
                    <View style={[styles.checkbox, checked && styles.checkboxOn, !selectable && styles.checkboxOff]}>
                        {checked ? <Icon name="check" size={14} color={color.textInverse} /> : null}
                    </View>
                ) : <Avatar name={row.employee_name} />}
                title={row.employee_name}
                subtitle={subtitle}
                meta={tags.length ? tags : null}
                right={<StatusText label={STATUS_LABELS[row.status] || row.status} tone={row.status === 'Work From Home' ? 'purple' : undefined} />}
                selected={checked}
                onPress={isLeave && !selectMode ? undefined : () => openRow(row)}
                chevron={false}
            />
        );
    };

    // ------------------------------------------------------------------ sheets
    const sheetProps = () => {
        if (!dialog) {
            return {};
        }
        if (dialog.type === 'edit') {
            return {
                title: dialog.row.employee_name,
                subtitle: `Edit times  ·  ${formatLongDate(date)}`,
                footer: (
                    <>
                        {dialog.row.docstatus === 0 ? (
                            <Button title="Submit as is" variant="secondary" onPress={submitAsIs} disabled={saving} style={styles.flex} />
                        ) : null}
                        <Button title="Save" onPress={saveEdit} loading={saving} style={styles.flex} />
                    </>
                ),
                body: (
                    <>
                        {timeField('Check-in', 'checkIn')}
                        {timeField('Check-out', 'checkOut')}
                        <Text style={styles.sheetNote}>A draft with both times is submitted when you save.</Text>
                    </>
                ),
            };
        }
        if (dialog.type === 'add') {
            return {
                title: dialog.row.employee_name,
                subtitle: `Add attendance  ·  ${formatLongDate(date)}`,
                footer: (
                    <>
                        <Button title="Cancel" variant="secondary" onPress={closeDialog} disabled={saving} style={styles.flex} />
                        <Button title="Add" onPress={saveAdd} loading={saving} style={styles.flex} />
                    </>
                ),
                body: (
                    <>
                        <Field label="Work type">
                            <Segmented options={WORK_TYPES} value={dialog.workType} onChange={(v) => setField('workType', v)} />
                        </Field>
                        {timeField('Check-in', 'checkIn')}
                        {timeField('Check-out (optional)', 'checkOut', true)}
                        <Text style={styles.sheetNote}>With a check-out time the record is submitted straight away.</Text>
                    </>
                ),
            };
        }
        return {
            title: `Set times for ${selected.length} ${selected.length === 1 ? 'record' : 'records'}`,
            subtitle: formatLongDate(date),
            footer: (
                <>
                    <Button title="Cancel" variant="secondary" onPress={closeDialog} disabled={saving} style={styles.flex} />
                    <Button title="Apply" onPress={saveBulk} loading={saving} style={styles.flex} />
                </>
            ),
            body: (
                <>
                    <Field label="Set">
                        <Segmented
                            options={[{ value: 'in', label: 'Check-in' }, { value: 'out', label: 'Check-out' }, { value: 'both', label: 'Both' }]}
                            value={dialog.mode}
                            onChange={(v) => setField('mode', v)}
                        />
                    </Field>
                    {dialog.mode !== 'out' ? timeField('Check-in', 'checkIn') : null}
                    {dialog.mode !== 'in' ? timeField('Check-out', 'checkOut') : null}
                    <Text style={styles.sheetNote}>Drafts that end up with both times are submitted.</Text>
                </>
            ),
        };
    };
    const sheet = sheetProps();

    // ------------------------------------------------------------------ main
    const canSelect = tab !== 'missing' && selectableRows.length > 0;
    return (
        <View style={styles.flex}>
            <DateNav
                date={date}
                onPrev={() => setDate((d) => subDays(d, 1))}
                onNext={() => !isTodayOrLater && setDate((d) => addDays(d, 1))}
                nextDisabled={isTodayOrLater}
                onPick={pickDate}
                caption={`${counts.records} records`}
            />
            <View style={styles.header}>
                <StatStrip
                    style={styles.flatStrip}
                    items={[
                        { label: 'Records', value: counts.records },
                        { label: 'No check-out', value: counts.pending, tone: counts.pending ? 'warning' : undefined },
                        { label: 'Not marked', value: counts.missing, tone: counts.missing ? 'danger' : undefined },
                        { label: 'Drafts', value: counts.drafts },
                    ]}
                />
                <Segmented
                    style={styles.tabs}
                    value={tab}
                    onChange={(v) => {
                        setTab(v);
                        setSelected([]);
                    }}
                    options={[
                        { value: 'all', label: 'All', count: rows.length },
                        { value: 'pending', label: 'No check-out', count: counts.pending },
                        { value: 'missing', label: 'Not marked', count: counts.missing },
                    ]}
                />
            </View>

            {loading && !refreshing ? (
                <Loading />
            ) : (
                <Screen
                    refreshing={refreshing}
                    onRefresh={() => load(true)}
                    footer={selectMode ? (
                        <View style={styles.selectBar}>
                            <Text style={styles.selectText} onPress={() => setSelected(allSelected ? [] : selectableRows.map((r) => r.name))}>
                                {allSelected ? 'Clear selection' : `Select all ${selectableRows.length}`}
                            </Text>
                            <Button title="Cancel" variant="secondary" size="sm" onPress={() => { setSelectMode(false); setSelected([]); }} />
                            <Button
                                title={`Set times${selected.length ? ` (${selected.length})` : ''}`}
                                size="sm"
                                disabled={!selected.length}
                                onPress={() => setDialog({ type: 'bulk', mode: 'out', checkIn: timeOnDay(date, null, '10:00'), checkOut: timeOnDay(date, null, '18:00') })}
                            />
                        </View>
                    ) : null}
                >
                    {visibleRows.length === 0 ? (
                        <EmptyState
                            icon={tab === 'missing' ? 'user-check' : 'check-circle'}
                            title={tab === 'pending' ? 'No missing check-outs' : tab === 'missing' ? 'Everyone is marked' : 'No records'}
                            message={`Nothing to fix for ${formatLongDate(date)}.`}
                        />
                    ) : (
                        <Group
                            title={tab === 'missing' ? 'Tap a name to add attendance' : 'Tap a record to edit its times'}
                            action={canSelect && !selectMode ? 'Select' : undefined}
                            onAction={() => setSelectMode(true)}
                        >
                            {visibleRows.map(renderRow)}
                        </Group>
                    )}
                </Screen>
            )}

            <Sheet visible={Boolean(dialog)} title={sheet.title} subtitle={sheet.subtitle} onClose={closeDialog} dismissable={!saving} footer={sheet.footer}>
                {sheet.body}
            </Sheet>

            {showIosDate && Platform.OS === 'ios' ? (
                <DateTimePicker
                    mode="date"
                    value={date}
                    maximumDate={new Date()}
                    onChange={(_, d) => {
                        setShowIosDate(false);
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
    flex: { flex: 1 },
    header: {
        backgroundColor: color.surface,
        paddingBottom: space.md,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: color.border,
    },
    flatStrip: { borderWidth: 0, borderRadius: 0 },
    tabs: { marginHorizontal: space.lg },
    checkbox: {
        width: 22,
        height: 22,
        borderRadius: 6,
        borderWidth: 1.5,
        borderColor: '#D0D5DD',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: space.md,
    },
    checkboxOn: { backgroundColor: color.accent, borderColor: color.accent },
    checkboxOff: { opacity: 0.35 },
    selectBar: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
    selectText: { flex: 1, fontSize: 14, fontWeight: '600', color: color.accent },
    clearLink: { fontSize: 13, color: color.accent, fontWeight: '500', marginTop: -8, marginBottom: space.lg },
    sheetNote: { ...type.caption, marginBottom: space.sm },
});

export default ManualCheckInOutScreen;
