// src/screens/admin/ManualCheckInOutScreen.js
//
// Fix one day's attendance: edit check-in / check-out times, submit drafts, set times for
// several records at once, and add attendance for employees with no record that day.
// Times are sent as 'HH:MM' and applied on the record's own date by the server, so they
// never shift with the phone's timezone. A draft with both times is submitted automatically.
import React, { useCallback, useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    RefreshControl,
    TouchableOpacity,
    Modal,
    Alert,
    ActivityIndicator,
    Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { addDays, subDays } from 'date-fns';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import ApiService from '../../services/api.service';
import { colors } from '../../theme/colors';
import { formatLocalDate, formatTimeOfDay, toHHMM, timeOnDay } from '../../utils/dateFormat';
import showToast from '../../utils/Toast';
import { STATUS_COLORS } from '../../components/admin/AttendanceList';
import StatusBadge from '../../components/ui/StatusBadge';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const longDate = (d) => `${WEEKDAYS[d.getDay()]}, ${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;

const TABS = [
    { key: 'all', label: 'All', icon: 'list' },
    { key: 'pending', label: 'No Check-out', icon: 'sign-out-alt' },
    { key: 'missing', label: 'Not Marked', icon: 'user-clock' },
];

// short labels for the status pill; colours come from StatusBadge
const STATUS_LABELS = { 'Work From Home': 'WFH' };
const WORK_TYPES = [
    { key: 'Office', label: 'Office', icon: 'building' },
    { key: 'WFH', label: 'WFH', icon: 'home' },
    { key: 'On Site', label: 'On Site', icon: 'map-marker-alt' },
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

const ManualCheckInOutScreen = () => {
    const [date, setDate] = useState(new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [tab, setTab] = useState('all');
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const [selectMode, setSelectMode] = useState(false);
    const [selected, setSelected] = useState([]);

    // dialogs: 'edit' (one record), 'add' (no record yet), 'bulk' (selected records)
    const [dialog, setDialog] = useState(null);
    const [saving, setSaving] = useState(false);
    const [iosPicker, setIosPicker] = useState(null); // { field } while an iOS inline time picker is open

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
            pending: records.filter((r) => r.in_time && !r.out_time && r.status !== 'On Leave').length,
            missing: rows.filter((r) => !r.name).length,
            drafts: records.filter((r) => r.docstatus === 0).length,
        };
    }, [rows]);

    const visibleRows = useMemo(() => {
        if (tab === 'pending') {
            return rows.filter((r) => r.name && r.in_time && !r.out_time && r.status !== 'On Leave');
        }
        if (tab === 'missing') {
            return rows.filter((r) => !r.name);
        }
        return rows;
    }, [rows, tab]);
    const selectableRows = visibleRows.filter((r) => r.name && r.status !== 'On Leave');

    const navigateDate = (direction) => {
        if (direction === 'next' && isTodayOrLater) {
            return;
        }
        setDate((d) => (direction === 'prev' ? subDays(d, 1) : addDays(d, 1)));
    };

    const pickDate = () => {
        if (Platform.OS === 'android') {
            DateTimePickerAndroid.open({
                value: date,
                mode: 'date',
                maximumDate: new Date(),
                onChange: (event, d) => event?.type !== 'dismissed' && d && setDate(d),
            });
        } else {
            setShowDatePicker(true);
        }
    };

    // ------------------------------------------------------------------ time pickers
    const setDialogTime = (field, value) => setDialog((dlg) => (dlg ? { ...dlg, [field]: value } : dlg));

    const openTimePicker = (field) => {
        const current = dialog?.[field] || timeOnDay(date, null, field.toLowerCase().includes('out') ? '18:00' : '10:00');
        if (Platform.OS === 'android') {
            DateTimePickerAndroid.open({
                value: current,
                mode: 'time',
                is24Hour: false,
                onChange: (event, d) => event?.type !== 'dismissed' && d && setDialogTime(field, timeOnDay(date, toHHMM(d))),
            });
        } else {
            setIosPicker({ field });
        }
    };

    const renderTimeField = (label, field, optional = false) => {
        const value = dialog?.[field];
        return (
            <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>{label}</Text>
                <View style={styles.timeFieldRow}>
                    <TouchableOpacity style={[styles.timeField, styles.flex]} onPress={() => openTimePicker(field)} activeOpacity={0.8}>
                        <Icon name="clock" size={14} color={colors.primary} />
                        <Text style={[styles.timeFieldText, !value && styles.placeholder]}>
                            {value ? formatTimeOfDay(value) : 'Tap to set'}
                        </Text>
                    </TouchableOpacity>
                    {optional && value ? (
                        <TouchableOpacity style={styles.clearButton} onPress={() => setDialogTime(field, null)} activeOpacity={0.8}>
                            <Icon name="times" size={14} color={colors.textSecondary} />
                        </TouchableOpacity>
                    ) : null}
                </View>
                {Platform.OS === 'ios' && iosPicker?.field === field ? (
                    <DateTimePicker
                        mode="time"
                        display="spinner"
                        value={value || timeOnDay(date, null, '10:00')}
                        onChange={(_, d) => d && setDialogTime(field, timeOnDay(date, toHHMM(d)))}
                    />
                ) : null}
            </View>
        );
    };

    const closeDialog = () => {
        if (!saving) {
            setDialog(null);
            setIosPicker(null);
        }
    };

    // ------------------------------------------------------------------ actions
    const openEdit = (row) => setDialog({
        type: 'edit',
        row,
        checkIn: row.in_time ? timeOnDay(date, row.in_time) : null,
        checkOut: row.out_time ? timeOnDay(date, row.out_time) : null,
    });

    const openAdd = (row) => setDialog({
        type: 'add',
        row,
        workType: 'Office',
        checkIn: timeOnDay(date, null, '10:00'),
        checkOut: isTodayOrLater ? null : timeOnDay(date, null, '19:00'),
    });

    const openBulk = () => setDialog({
        type: 'bulk',
        mode: 'out',
        checkIn: timeOnDay(date, null, '10:00'),
        checkOut: timeOnDay(date, null, '18:00'),
    });

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
                const firstError = result.errors?.[0]?.error;
                showToast({
                    type: result.failed ? 'warning' : 'success',
                    text1: `${result.successful ?? 0} updated${result.failed ? `, ${result.failed} not updated` : ''}`,
                    text2: firstError || 'Drafts with both times are submitted',
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

    const submitRecord = (row) => {
        const noCheckout = !row.out_time;
        Alert.alert(
            'Submit Attendance',
            noCheckout
                ? `${row.employee_name} has no check-out time. Submit anyway? Add the check-out time first if you know it.`
                : `Submit ${row.employee_name}'s attendance for ${longDate(date)}?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Submit',
                    onPress: async () => {
                        const res = await ApiService.submitAttendance({ attendance_id: row.name });
                        if (res.success) {
                            showToast({ type: 'success', text1: row.employee_name, text2: res.data?.message?.message || 'Attendance submitted' });
                            load(true);
                        } else {
                            showToast({ type: 'error', text1: 'Not submitted', text2: res.message || 'Failed to submit' });
                        }
                    },
                },
            ]
        );
    };

    const toggleSelect = (id) => setSelected((old) => (old.includes(id) ? old.filter((x) => x !== id) : [...old, id]));
    const allSelected = selectableRows.length > 0 && selectableRows.every((r) => selected.includes(r.name));
    const toggleSelectAll = () => setSelected(allSelected ? [] : selectableRows.map((r) => r.name));

    // ------------------------------------------------------------------ row
    const renderRow = (row) => {
        const isMissing = !row.name;
        const isLeave = row.status === 'On Leave';
        const checkIn = formatTimeOfDay(row.in_time);
        const checkOut = formatTimeOfDay(row.out_time);
        const hours = formatHours(row.working_hours);
        const canSelect = selectMode && !isMissing && !isLeave;
        const checked = selected.includes(row.name);

        return (
            <TouchableOpacity
                key={row.name || `missing-${row.employee}`}
                style={[styles.attendanceItem, checked && styles.itemSelected]}
                onPress={canSelect ? () => toggleSelect(row.name) : undefined}
                activeOpacity={canSelect ? 0.8 : 1}
                disabled={!canSelect}
            >
                <View style={styles.itemHeader}>
                    {selectMode ? (
                        <View style={[styles.checkbox, checked && styles.checkboxChecked, !canSelect && styles.checkboxDisabled]}>
                            {checked ? <Icon name="check" size={10} color={colors.white} /> : null}
                        </View>
                    ) : null}
                    <View style={styles.flex}>
                        <Text style={styles.employeeName}>{row.employee_name}</Text>
                        <Text style={styles.employeeId}>{row.employee}</Text>
                    </View>
                    <StatusBadge label={STATUS_LABELS[row.status] || row.status} tone={row.status === 'Work From Home' ? 'purple' : undefined} />
                </View>

                <View style={styles.divider} />

                {isMissing ? (
                    <Text style={styles.noteText}>No check-in recorded on this day.</Text>
                ) : isLeave ? (
                    <Text style={styles.noteText}>On approved leave. Nothing to fix.</Text>
                ) : (
                    <View style={styles.timeContainer}>
                        <View style={styles.timeInfo}>
                            <Icon name="sign-in-alt" size={12} color={checkIn ? STATUS_COLORS.present : STATUS_COLORS.absent} />
                            <Text style={[styles.timeText, !checkIn && styles.missingText]}>In: {checkIn || 'Missing'}</Text>
                        </View>
                        <View style={styles.timeInfo}>
                            <Icon name="sign-out-alt" size={12} color={checkOut ? STATUS_COLORS.absent : STATUS_COLORS.late} />
                            <Text style={[styles.timeText, !checkOut && styles.pendingText]}>Out: {checkOut || 'Missing'}</Text>
                        </View>
                        {hours ? (
                            <View style={styles.timeInfo}>
                                <Icon name="hourglass-half" size={11} color={colors.primary} />
                                <Text style={styles.timeText}>{hours}</Text>
                            </View>
                        ) : null}
                    </View>
                )}

                {!isMissing ? (
                    <View style={styles.tagRow}>
                        {row.docstatus === 1
                            ? <StatusBadge small label="Submitted" icon="check" />
                            : <StatusBadge small label="Draft" icon="pen" />}
                        {row.late_entry ? <StatusBadge small label="Late" icon="clock" /> : null}
                    </View>
                ) : null}

                {!selectMode && !isLeave ? (
                    <View style={styles.actionRow}>
                        {isMissing ? (
                            <TouchableOpacity style={[styles.actionButton, styles.actionPrimary]} onPress={() => openAdd(row)} activeOpacity={0.8}>
                                <Icon name="plus" size={11} color={colors.white} />
                                <Text style={[styles.actionText, styles.actionTextLight]}>Add Attendance</Text>
                            </TouchableOpacity>
                        ) : (
                            <>
                                <TouchableOpacity style={styles.actionButton} onPress={() => openEdit(row)} activeOpacity={0.8}>
                                    <Icon name="edit" size={11} color={colors.primary} />
                                    <Text style={styles.actionText}>Edit Times</Text>
                                </TouchableOpacity>
                                {row.docstatus === 0 ? (
                                    <TouchableOpacity style={[styles.actionButton, styles.actionSubmit]} onPress={() => submitRecord(row)} activeOpacity={0.8}>
                                        <Icon name="check-circle" size={11} color={STATUS_COLORS.present} />
                                        <Text style={[styles.actionText, styles.actionTextSubmit]}>Submit</Text>
                                    </TouchableOpacity>
                                ) : null}
                            </>
                        )}
                    </View>
                ) : null}
            </TouchableOpacity>
        );
    };

    // ------------------------------------------------------------------ dialogs
    const renderDialog = () => {
        if (!dialog) {
            return null;
        }
        const title = dialog.type === 'edit' ? 'Edit Times' : dialog.type === 'add' ? 'Add Attendance' : 'Set Times';
        const subtitle = dialog.type === 'bulk'
            ? `${selected.length} record${selected.length === 1 ? '' : 's'} · ${longDate(date)}`
            : `${dialog.row.employee_name} · ${longDate(date)}`;
        const onSave = dialog.type === 'edit' ? saveEdit : dialog.type === 'add' ? saveAdd : saveBulk;

        return (
            <Modal visible transparent animationType="fade" onRequestClose={closeDialog}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>{title}</Text>
                        <Text style={styles.modalSubtitle}>{subtitle}</Text>

                        {dialog.type === 'add' ? (
                            <View style={styles.inputContainer}>
                                <Text style={styles.inputLabel}>Work type</Text>
                                <View style={styles.segmentRow}>
                                    {WORK_TYPES.map((w) => (
                                        <TouchableOpacity
                                            key={w.key}
                                            style={[styles.segment, dialog.workType === w.key && styles.segmentActive]}
                                            onPress={() => setDialogTime('workType', w.key)}
                                            activeOpacity={0.8}
                                        >
                                            <Icon name={w.icon} size={12} color={dialog.workType === w.key ? colors.white : colors.textSecondary} />
                                            <Text style={[styles.segmentText, dialog.workType === w.key && styles.segmentTextActive]}>{w.label}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>
                        ) : null}

                        {dialog.type === 'bulk' ? (
                            <View style={styles.inputContainer}>
                                <Text style={styles.inputLabel}>Set</Text>
                                <View style={styles.segmentRow}>
                                    {[
                                        { key: 'in', label: 'Check-in' },
                                        { key: 'out', label: 'Check-out' },
                                        { key: 'both', label: 'Both' },
                                    ].map((m) => (
                                        <TouchableOpacity
                                            key={m.key}
                                            style={[styles.segment, dialog.mode === m.key && styles.segmentActive]}
                                            onPress={() => setDialogTime('mode', m.key)}
                                            activeOpacity={0.8}
                                        >
                                            <Text style={[styles.segmentText, dialog.mode === m.key && styles.segmentTextActive]}>{m.label}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>
                        ) : null}

                        {dialog.type !== 'bulk' || dialog.mode !== 'out' ? renderTimeField('Check-in time', 'checkIn') : null}
                        {dialog.type !== 'bulk' || dialog.mode !== 'in'
                            ? renderTimeField(dialog.type === 'add' ? 'Check-out time (optional)' : 'Check-out time', 'checkOut', dialog.type === 'add')
                            : null}

                        <Text style={styles.modalNote}>
                            {dialog.type === 'add'
                                ? 'With a check-out time the record is submitted straight away.'
                                : 'A draft with both times is submitted automatically.'}
                        </Text>

                        <View style={styles.modalButtons}>
                            <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={closeDialog} disabled={saving} activeOpacity={0.8}>
                                <Text style={styles.cancelButtonText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.modalButton, styles.confirmButton]} onPress={onSave} disabled={saving} activeOpacity={0.8}>
                                {saving ? <ActivityIndicator size="small" color={colors.white} /> : (
                                    <Text style={styles.confirmButtonText}>{dialog.type === 'add' ? 'Add' : dialog.type === 'bulk' ? 'Apply' : 'Save'}</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
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
                    <Text style={styles.dateLabel}>{longDate(date)}</Text>
                    <Text style={styles.recordCount}>{counts.records} records{counts.missing ? ` · ${counts.missing} not marked` : ''}</Text>
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
                    { label: 'Records', value: counts.records, icon: 'clipboard-list', color: colors.primary },
                    { label: 'No Check-out', value: counts.pending, icon: 'sign-out-alt', color: STATUS_COLORS.late },
                    { label: 'Not Marked', value: counts.missing, icon: 'user-clock', color: STATUS_COLORS.absent },
                    { label: 'Drafts', value: counts.drafts, icon: 'pen', color: colors.textSecondary },
                ].map((s) => (
                    <View key={s.label} style={styles.statCard}>
                        <Icon name={s.icon} size={15} color={s.color} />
                        <View style={styles.flex}>
                            <Text style={[styles.statNumber, { color: s.color }]}>{s.value}</Text>
                            <Text style={styles.statLabel} numberOfLines={1}>{s.label}</Text>
                        </View>
                    </View>
                ))}
            </View>

            {/* Tabs */}
            <View style={styles.tabContainer}>
                {TABS.map((t) => {
                    const active = tab === t.key;
                    const count = t.key === 'all' ? rows.length : t.key === 'pending' ? counts.pending : counts.missing;
                    return (
                        <TouchableOpacity
                            key={t.key}
                            style={[styles.tab, active && styles.tabActive]}
                            onPress={() => {
                                setTab(t.key);
                                setSelected([]);
                            }}
                            activeOpacity={0.8}
                        >
                            <Icon name={t.icon} size={11} color={active ? colors.white : colors.primary} />
                            <Text style={[styles.tabText, active && styles.tabTextActive]} numberOfLines={1}>{t.label} ({count})</Text>
                        </TouchableOpacity>
                    );
                })}
            </View>

            {/* Selection toolbar */}
            {tab !== 'missing' && selectableRows.length > 0 ? (
                <View style={styles.toolbar}>
                    {selectMode ? (
                        <>
                            <TouchableOpacity style={styles.toolbarLink} onPress={toggleSelectAll} activeOpacity={0.8}>
                                <Icon name={allSelected ? 'check-square' : 'square'} size={15} color={colors.primary} />
                                <Text style={styles.toolbarLinkText}>{allSelected ? 'Clear all' : `Select all (${selectableRows.length})`}</Text>
                            </TouchableOpacity>
                            <View style={styles.toolbarButtons}>
                                <TouchableOpacity
                                    style={styles.toolbarButton}
                                    onPress={() => {
                                        setSelectMode(false);
                                        setSelected([]);
                                    }}
                                    activeOpacity={0.8}
                                >
                                    <Text style={styles.toolbarButtonText}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.toolbarButton, styles.toolbarButtonPrimary, !selected.length && styles.disabled]}
                                    onPress={openBulk}
                                    disabled={!selected.length}
                                    activeOpacity={0.8}
                                >
                                    <Icon name="clock" size={11} color={colors.white} />
                                    <Text style={[styles.toolbarButtonText, styles.actionTextLight]}>Set Times ({selected.length})</Text>
                                </TouchableOpacity>
                            </View>
                        </>
                    ) : (
                        <>
                            <Text style={styles.toolbarHint}>Fix several records at once</Text>
                            <TouchableOpacity style={styles.toolbarButton} onPress={() => setSelectMode(true)} activeOpacity={0.8}>
                                <Icon name="tasks" size={11} color={colors.primary} />
                                <Text style={styles.toolbarButtonText}>Select</Text>
                            </TouchableOpacity>
                        </>
                    )}
                </View>
            ) : null}

            {/* List */}
            {loading && !refreshing ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator color={colors.primary} size="large" />
                    <Text style={styles.loadingText}>Loading attendance records...</Text>
                </View>
            ) : (
                <ScrollView
                    style={styles.flex}
                    contentContainerStyle={styles.scrollContent}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={[colors.primary]} />}
                >
                    {visibleRows.length === 0 ? (
                        <View style={styles.emptyContainer}>
                            <Icon name={tab === 'missing' ? 'user-check' : 'inbox'} size={48} color={colors.textMuted} />
                            <Text style={styles.emptyTitle}>
                                {tab === 'pending' ? 'No Missing Check-outs' : tab === 'missing' ? 'Everyone Is Marked' : 'No Records'}
                            </Text>
                            <Text style={styles.emptyText}>Nothing to fix on {longDate(date)}.</Text>
                        </View>
                    ) : (
                        visibleRows.map(renderRow)
                    )}
                </ScrollView>
            )}

            {renderDialog()}

            {showDatePicker && Platform.OS === 'ios' && (
                <DateTimePicker
                    mode="date"
                    value={date}
                    maximumDate={new Date()}
                    onChange={(_, d) => {
                        setShowDatePicker(false);
                        if (d) {
                            setDate(d);
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
    dateLabel: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
    recordCount: { fontSize: 11, color: colors.textSecondary, marginTop: 2, fontWeight: '500' },

    summaryContainer: { flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 8, backgroundColor: colors.surface, gap: 6 },
    statCard: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background, padding: 8, borderRadius: 8, gap: 6 },
    statNumber: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
    statLabel: { fontSize: 9, color: colors.textSecondary, marginTop: 1, fontWeight: '500' },

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

    toolbar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    toolbarHint: { fontSize: 12, color: colors.textSecondary },
    toolbarLink: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    toolbarLinkText: { fontSize: 12, fontWeight: '600', color: colors.primary },
    toolbarButtons: { flexDirection: 'row', gap: 6 },
    toolbarButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 10,
        paddingVertical: 6,
        backgroundColor: colors.background,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.primary,
    },
    toolbarButtonPrimary: { backgroundColor: colors.primary },
    toolbarButtonText: { fontSize: 12, fontWeight: '600', color: colors.primary },

    scrollContent: { padding: 12, paddingBottom: 20, flexGrow: 1 },
    attendanceItem: {
        backgroundColor: colors.surface,
        marginBottom: 10,
        padding: 12,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: colors.borderLight,
        ...SHADOW,
    },
    itemSelected: { borderColor: colors.primary, backgroundColor: '#F5F7FF' },
    itemHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    checkbox: {
        width: 20,
        height: 20,
        borderRadius: 5,
        borderWidth: 1.5,
        borderColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkboxChecked: { backgroundColor: colors.primary },
    checkboxDisabled: { borderColor: colors.border },
    employeeName: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
    employeeId: { fontSize: 11, color: colors.textSecondary, marginTop: 1 },
    tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
    divider: { height: 1, backgroundColor: colors.border, marginVertical: 8 },
    timeContainer: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 4 },
    timeInfo: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    timeText: { fontSize: 12, color: '#374151', fontWeight: '500' },
    missingText: { color: STATUS_COLORS.absent },
    pendingText: { color: STATUS_COLORS.late },
    noteText: { fontSize: 12, color: colors.textSecondary },
    actionRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.primary,
        backgroundColor: colors.background,
    },
    actionPrimary: { backgroundColor: colors.primary },
    actionSubmit: { borderColor: STATUS_COLORS.present },
    actionText: { fontSize: 12, fontWeight: '600', color: colors.primary },
    actionTextLight: { color: colors.white },
    actionTextSubmit: { color: STATUS_COLORS.present },

    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 30 },
    loadingText: { marginTop: 10, fontSize: 14, color: colors.textSecondary },
    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 50 },
    emptyTitle: { fontSize: 18, fontWeight: '600', color: colors.textSecondary, marginTop: 12 },
    emptyText: { fontSize: 13, color: colors.textMuted, textAlign: 'center', marginTop: 6, paddingHorizontal: 32 },

    // dialogs (same look as the pop-ups on the approval screens)
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'center', alignItems: 'center', padding: 16 },
    modalContent: {
        backgroundColor: colors.surface,
        borderRadius: 14,
        padding: 16,
        width: '100%',
        maxWidth: 400,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 10,
    },
    modalTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
    modalSubtitle: { fontSize: 12, color: colors.textSecondary, textAlign: 'center', marginTop: 2, marginBottom: 12 },
    modalNote: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
    inputContainer: { marginBottom: 12 },
    inputLabel: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginBottom: 6 },
    timeFieldRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    timeField: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.background,
    },
    timeFieldText: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
    placeholder: { color: colors.textMuted, fontWeight: '500' },
    clearButton: {
        width: 40,
        height: 44,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: 'center',
        justifyContent: 'center',
    },
    segmentRow: { flexDirection: 'row', gap: 6 },
    segment: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        paddingVertical: 9,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.background,
    },
    segmentActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    segmentText: { fontSize: 12, fontWeight: '700', color: colors.textPrimary },
    segmentTextActive: { color: colors.white },
    modalButtons: { flexDirection: 'row', gap: 10, marginTop: 14 },
    modalButton: { flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    cancelButton: { borderWidth: 1, borderColor: colors.border },
    cancelButtonText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
    confirmButton: { backgroundColor: colors.primary },
    confirmButtonText: { fontSize: 14, fontWeight: '700', color: colors.white },
});

export default ManualCheckInOutScreen;
