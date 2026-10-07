// src/screens/employee/CompensatoryLeaveScreen.js
//
// The employee's comp-off requests for days worked on holidays: a status filter, the list,
// the request form in a bottom sheet, and a detail sheet that can cancel a pending request.
// Approved days are added to the employee's leave balance by the server.
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Alert, Platform, Switch } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import apiService, { extractFrappeData, isApiSuccess, getApiErrorMessage } from '../../services/api.service';
import { formatLocalDate, clampToDateRange } from '../../utils/dateFormat';
import showToast from '../../utils/Toast';
import {
    Screen,
    Group,
    Row,
    Segmented,
    StatStrip,
    Sheet,
    Button,
    TextField,
    SelectField,
    EmptyState,
    Loading,
    StatusText,
    color,
    space,
    type,
} from '../../components/ds';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// 'YYYY-MM-DD' (or a Date) as a local calendar day, without a timezone shift
const toDay = (value) => {
    if (value instanceof Date) {
        return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    }
    const [y, m, d] = String(value || '').slice(0, 10).split('-').map(Number);
    return y ? new Date(y, m - 1, d) : null;
};
const yearSuffix = (d) => (d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : '');
const dayLabel = (value) => {
    const d = toDay(value);
    return d ? `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}${yearSuffix(d)}` : '-';
};
const dayCount = (from, to) => {
    const a = toDay(from);
    const b = toDay(to);
    return a && b ? Math.round((b - a) / 86400000) + 1 : 1;
};
// compact range for list rows: "Sun, 2 Nov", "1–2 Nov", "31 Oct – 2 Nov"
const rangeLabel = (from, to) => {
    const a = toDay(from);
    const b = toDay(to);
    if (!a) {
        return '-';
    }
    if (!b || a.getTime() === b.getTime()) {
        return dayLabel(a);
    }
    if (a.getFullYear() !== b.getFullYear()) {
        return `${a.getDate()} ${MONTHS[a.getMonth()]} ${a.getFullYear()} – ${b.getDate()} ${MONTHS[b.getMonth()]} ${b.getFullYear()}`;
    }
    if (a.getMonth() === b.getMonth()) {
        return `${a.getDate()}–${b.getDate()} ${MONTHS[b.getMonth()]}${yearSuffix(b)}`;
    }
    return `${a.getDate()} ${MONTHS[a.getMonth()]} – ${b.getDate()} ${MONTHS[b.getMonth()]}${yearSuffix(b)}`;
};
// full range for the detail sheet: "Sat, 1 Nov – Sun, 2 Nov"
const fullRange = (from, to) => (dayCount(from, to) === 1 ? dayLabel(from) : `${dayLabel(from)} – ${dayLabel(to)}`);
const formatDays = (n) => {
    const v = Number(n) || 0;
    return Number.isInteger(v) ? String(v) : v.toFixed(1);
};
const daysLabel = (n) => (n || n === 0 ? `${formatDays(n)} ${Number(n) === 1 ? 'day' : 'days'}` : '-');
const statusOf = (docstatus) => ({ 0: 'Pending', 1: 'Approved', 2: 'Cancelled' }[docstatus] || 'Unknown');

// docstatus filter: null = all, 0 = pending, 1 = approved, 2 = cancelled
const STATUS_FILTERS = [
    { value: 'all', label: 'All' },
    { value: '0', label: 'Pending' },
    { value: '1', label: 'Approved' },
    { value: '2', label: 'Cancelled' },
];
const SWITCH_TRACK = { false: '#D0D5DD', true: color.accent };

const CompensatoryLeaveScreen = ({ navigation }) => {
    // State management
    const [employeeId, setEmployeeId] = useState('');
    // 'history' shows the list; 'apply' while the request form sheet is open.
    // Going back to 'history' reloads the list.
    const [activeTab, setActiveTab] = useState('history');
    const [loading, setLoading] = useState(false); // employee record / list loading
    const [refreshing, setRefreshing] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [cancelling, setCancelling] = useState(false);
    const busy = useRef(false); // blocks a second submit / cancel while one is being sent
    const listRequest = useRef(0); // only the latest list load may fill the list (filters can change mid-load)
    const [employeeError, setEmployeeError] = useState(null);
    const [listError, setListError] = useState(null);

    // Apply form states
    const [workFromDate, setWorkFromDate] = useState(new Date());
    const [workEndDate, setWorkEndDate] = useState(new Date());
    const [showWorkFromPicker, setShowWorkFromPicker] = useState(false);
    const [showWorkEndPicker, setShowWorkEndPicker] = useState(false);
    const [reason, setReason] = useState('');
    const [halfDay, setHalfDay] = useState(false);
    const [halfDayDate, setHalfDayDate] = useState(new Date());
    const [showHalfDayPicker, setShowHalfDayPicker] = useState(false);
    // there is no leave type picker on this screen; requests go in as Compensatory Off
    const [leaveType] = useState('Compensatory Off');

    // History states
    const [myRequests, setMyRequests] = useState([]);
    const [filterStatus, setFilterStatus] = useState(null); // null, 0, 1, 2
    const [totalDays, setTotalDays] = useState(0); // approved days, all requests
    // counts over all of the employee's requests, whatever filter is on
    const [statusSummary, setStatusSummary] = useState({
        all: 0,
        pending: 0,
        approved: 0,
        cancelled: 0
    });

    // Presentation only: the request shown in the detail sheet
    const [selectedName, setSelectedName] = useState(null);
    const lastSelected = useRef(null); // keeps the detail sheet filled while it slides out

    useEffect(() => {
        loadInitialData();
    }, []);

    useEffect(() => {
        if (activeTab === 'history' && employeeId) {
            loadMyRequests();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadMyRequests is a plain function that reads exactly these values
    }, [activeTab, filterStatus, employeeId]);

    const loadInitialData = async () => {
        try {
            setLoading(true);
            // Get employee ID
            const empResponse = await apiService.getCurrentEmployee();
            const empId = isApiSuccess(empResponse) ? extractFrappeData(empResponse, {})?.name : null;
            if (empId) {
                setEmployeeId(empId);
                setEmployeeError(null);
            } else {
                const message = getApiErrorMessage(empResponse, 'No employee record is linked to your login');
                setEmployeeError(message);
                showToast({ type: 'error', text1: 'Could not load your employee record', text2: message });
            }
        } catch (error) {
            console.error('Error loading employee data:', error);
            setEmployeeError(error?.message || 'Please try again');
            showToast({ type: 'error', text1: 'Could not load your employee record', text2: 'Please try again' });
        } finally {
            setLoading(false);
        }
    };

    // keep: on a failed pull-to-refresh the list for this same filter stays on screen
    const loadMyRequests = async ({ keep = false } = {}) => {
        if (!employeeId) {
            setRefreshing(false);
            return;
        }

        const requestNo = ++listRequest.current;
        try {
            setLoading(true);
            const response = await apiService.getMyCompLeaves({
                employee: employeeId,
                docstatus: filterStatus,
                from_date: null,
                to_date: null,
                limit: 100
            });
            if (requestNo !== listRequest.current) {
                return; // a newer load (another filter) is on its way
            }

            if (isApiSuccess(response)) {
                const data = extractFrappeData(response, { requests: [], total_compensatory_days: 0, status_summary: { pending: 0, approved: 0, cancelled: 0 } });
                setMyRequests(Array.isArray(data.requests) ? data.requests : []);
                setTotalDays(data.total_compensatory_days || 0);
                setStatusSummary(data.status_summary || { pending: 0, approved: 0, cancelled: 0 });
                setListError(null);
            } else {
                const message = getApiErrorMessage(response, 'Pull down to try again');
                setListError(message);
                if (!keep) {
                    setMyRequests([]); // the list on screen may be for another filter
                }
                showToast({ type: 'error', text1: 'Could not load your requests', text2: message });
            }
        } catch (error) {
            console.error('Load requests error:', error);
            showToast({ type: 'error', text1: 'Could not load your requests', text2: 'Pull down to try again' });
        } finally {
            if (requestNo === listRequest.current) {
                setLoading(false);
                setRefreshing(false);
            }
        }
    };

    // Not memoised: a memoised callback kept the first render's loadMyRequests,
    // which had no employee yet, so the spinner never stopped.
    const onRefresh = () => {
        setRefreshing(true);
        if (employeeId) {
            loadMyRequests({ keep: true });
        } else {
            // the employee record did not load; once it does, the list loads by itself
            loadInitialData().finally(() => setRefreshing(false));
        }
    };

    // Keep the half-day date inside the worked range; the server rejects it otherwise.
    useEffect(() => {
        const clamped = clampToDateRange(halfDayDate, workFromDate, workEndDate);
        if (clamped !== halfDayDate) {
            setHalfDayDate(clamped);
        }
    }, [halfDayDate, workFromDate, workEndDate]);

    const handleSubmit = async () => {
        if (busy.current) {
            return;
        }
        // Check if employee ID is loaded
        if (!employeeId) {
            showToast({ type: 'error', text1: 'Your employee record is not loaded', text2: 'Close this screen and open it again' });
            return;
        }

        // Validation
        if (!reason.trim()) {
            showToast({ type: 'warning', text1: 'Add a reason', text2: 'Say what you worked on during the holiday' });
            return;
        }

        if (formatLocalDate(workEndDate) < formatLocalDate(workFromDate)) {
            showToast({ type: 'warning', text1: 'Check the dates', text2: 'The last day cannot be before the first day' });
            return;
        }

        if (halfDay && !halfDayDate) {
            showToast({ type: 'warning', text1: 'Choose the half day date' });
            return;
        }

        busy.current = true;
        setSubmitting(true);
        try {
            const response = await apiService.submitCompLeave({
                employee: employeeId,
                work_from_date: formatLocalDate(workFromDate),
                work_end_date: formatLocalDate(workEndDate),
                reason: reason.trim(),
                leave_type: leaveType,
                half_day: halfDay ? 1 : 0,
                half_day_date: halfDay ? formatLocalDate(halfDayDate) : null
            });

            if (response.success && response.data?.message) {
                const data = response.data.message;
                showToast({
                    type: 'success',
                    text1: 'Request sent',
                    text2: [
                        data.compensatory_days ? daysLabel(data.compensatory_days) : null,
                        data.docstatus === 1 ? 'Approved' : 'Waiting for approval',
                    ].filter(Boolean).join('  ·  '),
                });
                // Reset form
                setReason('');
                setHalfDay(false);
                setWorkFromDate(new Date());
                setWorkEndDate(new Date());
                // Close the form sheet; back on the list it reloads
                setActiveTab('history');
            } else {
                showToast({ type: 'error', text1: 'Not sent', text2: getApiErrorMessage(response, 'Failed to submit request') });
            }
        } catch (error) {
            console.error('Submit error:', error);
            showToast({ type: 'error', text1: 'Not sent', text2: error.message || 'Failed to submit compensatory leave request' });
        } finally {
            busy.current = false;
            setSubmitting(false);
        }
    };

    const handleCancelRequest = (requestId, requestLabel) => {
        Alert.alert(
            'Cancel this request?',
            `Comp-off for ${requestLabel}.`,
            [
                { text: 'Keep', style: 'cancel' },
                {
                    text: 'Cancel request',
                    style: 'destructive',
                    onPress: async () => {
                        if (busy.current) {
                            return;
                        }
                        busy.current = true;
                        try {
                            setCancelling(true);
                            const response = await apiService.cancelCompLeave(requestId, 'Cancelled by employee');

                            if (response.success) {
                                showToast({ type: 'success', text1: 'Request cancelled' });
                                setSelectedName(null);
                                // wait for the fresh list so the cancelled request can't be cancelled again
                                await loadMyRequests();
                            } else {
                                showToast({ type: 'error', text1: 'Not cancelled', text2: getApiErrorMessage(response, 'Failed to cancel request') });
                            }
                        } catch (error) {
                            showToast({ type: 'error', text1: 'Not cancelled', text2: error.message || 'Failed to cancel request' });
                        } finally {
                            busy.current = false;
                            setCancelling(false);
                        }
                    }
                }
            ]
        );
    };

    // ------------------------------------------------------------------ presentation helpers
    const closeForm = () => {
        if (!submitting) {
            setShowWorkFromPicker(false);
            setShowWorkEndPicker(false);
            setShowHalfDayPicker(false);
            setActiveTab('history');
        }
    };

    // The detail sheet follows the list, so it closes by itself once a cancelled request is gone.
    const selected = selectedName ? myRequests.find((r) => r.name === selectedName) || null : null;
    if (selected) {
        lastSelected.current = selected;
    }
    const detail = selected || lastSelected.current;
    const selectedPending = detail?.docstatus === 0;

    // days the form would request (display only; the server computes the real figure)
    const formDays = formatLocalDate(workEndDate) >= formatLocalDate(workFromDate)
        ? dayCount(workFromDate, workEndDate) - (halfDay ? 0.5 : 0)
        : null;

    const renderList = () => {
        if (loading && !refreshing) {
            return <Loading />;
        }
        if (!employeeId && employeeError) {
            return (
                <EmptyState
                    icon="alert-circle"
                    title="Could not load your employee record"
                    message={employeeError}
                    action="Try again"
                    onAction={loadInitialData}
                />
            );
        }
        if (myRequests.length === 0 && listError) {
            return (
                <EmptyState
                    icon="alert-circle"
                    title="Could not load your requests"
                    message={listError}
                    action="Try again"
                    onAction={() => loadMyRequests()}
                />
            );
        }
        // the numbers cover every request, whatever the filter, so they stay when a filter has none
        const total = statusSummary.all ?? myRequests.length;
        const strip = total ? (
            <StatStrip
                style={styles.strip}
                items={[
                    { label: 'Days earned', value: formatDays(totalDays) },
                    { label: 'Pending', value: statusSummary.pending || 0, tone: statusSummary.pending ? 'warning' : undefined },
                    { label: 'Requests', value: total },
                ]}
            />
        ) : null;
        if (myRequests.length === 0) {
            return (
                <>
                    {strip}
                    <EmptyState
                        icon="calendar"
                        title={filterStatus === null ? 'No requests yet' : `No ${statusOf(filterStatus).toLowerCase()} requests`}
                        message={filterStatus === null ? 'Requests for days worked on holidays appear here.' : undefined}
                    />
                </>
            );
        }
        return (
            <>
                {strip}
                <Group title="Requests" footer="Approved days are added to your leave balance.">
                    {myRequests.map((request) => (
                        <Row
                            key={request.name}
                            title={rangeLabel(request.work_from_date, request.work_end_date)}
                            subtitle={[daysLabel(request.compensatory_days), request.reason].filter(Boolean).join('  ·  ')}
                            subtitleLines={1}
                            right={<StatusText label={statusOf(request.docstatus)} />}
                            onPress={() => setSelectedName(request.name)}
                        />
                    ))}
                </Group>
            </>
        );
    };

    return (
        <View style={styles.container}>
            <View style={styles.toolbar}>
                {/* no counts: four labels plus counts overlapped each other on 320-360 dp phones; the totals are in the strip below */}
                <Segmented
                    value={filterStatus === null ? 'all' : String(filterStatus)}
                    onChange={(value) => setFilterStatus(value === 'all' ? null : Number(value))}
                    options={STATUS_FILTERS}
                />
            </View>

            <Screen
                refreshing={refreshing}
                onRefresh={onRefresh}
                footer={<Button title="Apply for comp-off" onPress={() => setActiveTab('apply')} full />}
            >
                {renderList()}
            </Screen>

            {/* Request form */}
            <Sheet
                visible={activeTab === 'apply'}
                title="Apply for comp-off"
                subtitle={formDays ? daysLabel(formDays) : undefined}
                onClose={closeForm}
                dismissable={!submitting}
                footer={(
                    <>
                        <Button title="Cancel" variant="secondary" onPress={closeForm} disabled={submitting} style={styles.flex} />
                        <Button title="Submit" onPress={handleSubmit} loading={submitting} style={styles.flex} />
                    </>
                )}
            >
                <View style={styles.dateRow}>
                    <SelectField
                        label="Worked from"
                        value={dayLabel(workFromDate)}
                        icon="calendar"
                        onPress={() => setShowWorkFromPicker(true)}
                        style={styles.dateField}
                    />
                    <SelectField
                        label="Worked until"
                        value={dayLabel(workEndDate)}
                        icon="calendar"
                        onPress={() => setShowWorkEndPicker(true)}
                        style={styles.dateField}
                    />
                </View>
                <Text style={styles.dateHint}>Must be holidays with your attendance marked.</Text>
                {showWorkFromPicker && (
                    <DateTimePicker
                        value={workFromDate}
                        mode="date"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        onChange={(event, date) => {
                            setShowWorkFromPicker(Platform.OS === 'ios');
                            if (date) {
                                setWorkFromDate(date);
                            }
                        }}
                    />
                )}
                {showWorkEndPicker && (
                    <DateTimePicker
                        value={workEndDate}
                        mode="date"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        onChange={(event, date) => {
                            setShowWorkEndPicker(Platform.OS === 'ios');
                            if (date) {
                                setWorkEndDate(date);
                            }
                        }}
                    />
                )}

                <Group style={styles.halfDayGroup}>
                    <Row
                        title="Half day"
                        right={(
                            <Switch
                                value={halfDay}
                                onValueChange={() => setHalfDay(!halfDay)}
                                trackColor={SWITCH_TRACK}
                                thumbColor={color.surface}
                            />
                        )}
                    />
                </Group>

                {halfDay && (
                    <>
                        <SelectField
                            label="Half day date"
                            value={dayLabel(halfDayDate)}
                            icon="calendar"
                            onPress={() => {
                                // the picker's earliest date would be after its latest
                                if (formDays === null) {
                                    showToast({ type: 'warning', text1: 'Check the dates', text2: 'The last day cannot be before the first day' });
                                    return;
                                }
                                setShowHalfDayPicker(true);
                            }}
                        />
                        {showHalfDayPicker && (
                            <DateTimePicker
                                value={halfDayDate}
                                mode="date"
                                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                minimumDate={workFromDate}
                                maximumDate={workEndDate}
                                onChange={(event, date) => {
                                    setShowHalfDayPicker(Platform.OS === 'ios');
                                    if (date) {
                                        setHalfDayDate(date);
                                    }
                                }}
                            />
                        )}
                    </>
                )}

                <TextField
                    label="Reason"
                    value={reason}
                    onChangeText={setReason}
                    placeholder="What you worked on"
                    multiline
                    numberOfLines={4}
                />
                <Text style={styles.formNote}>Approved days are added to your leave balance.</Text>
            </Sheet>

            {/* Request detail */}
            <Sheet
                visible={Boolean(selected)}
                title={detail ? rangeLabel(detail.work_from_date, detail.work_end_date) : ''}
                subtitle={detail ? `Comp-off  ·  ${daysLabel(detail.compensatory_days)}` : undefined}
                onClose={() => !cancelling && setSelectedName(null)}
                dismissable={!cancelling}
                footer={selectedPending ? (
                    <>
                        <Button
                            title="Cancel request"
                            variant="danger"
                            onPress={() => handleCancelRequest(detail.name, fullRange(detail.work_from_date, detail.work_end_date))}
                            loading={cancelling}
                            style={styles.flex}
                        />
                        <Button title="Close" variant="secondary" onPress={() => setSelectedName(null)} disabled={cancelling} style={styles.flex} />
                    </>
                ) : (
                    <Button title="Close" variant="secondary" onPress={() => setSelectedName(null)} style={styles.flex} />
                )}
            >
                {detail ? (
                    <>
                        <Detail label="Status" value={<StatusText label={statusOf(detail.docstatus)} size={15} />} />
                        <Detail label="Days worked" value={fullRange(detail.work_from_date, detail.work_end_date)} />
                        <Detail label="Compensatory days" value={daysLabel(detail.compensatory_days)} />
                        {Number(detail.half_day) === 1 && detail.half_day_date ? <Detail label="Half day" value={dayLabel(detail.half_day_date)} /> : null}
                        <Detail label="Reason" value={detail.reason || 'No reason given'} />
                        {detail.leave_type ? <Detail label="Leave type" value={detail.leave_type} /> : null}
                        {detail.leave_allocation ? <Detail label="Leave allocation" value={detail.leave_allocation} /> : null}
                        <Detail label="Request" value={detail.name} />
                    </>
                ) : null}
            </Sheet>
        </View>
    );
};

const Detail = ({ label, value }) => (
    <View style={styles.detail}>
        <Text style={styles.detailLabel}>{label}</Text>
        {typeof value === 'string' ? <Text style={type.body}>{value}</Text> : value}
    </View>
);

const styles = StyleSheet.create({
    flex: { flex: 1 },
    container: { flex: 1, backgroundColor: color.bg },
    toolbar: {
        backgroundColor: color.surface,
        paddingHorizontal: space.lg,
        paddingVertical: space.md,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: color.border,
    },
    strip: { marginBottom: space.xl },
    // side by side when both fit (150 dp each: 360 dp phones and wider), stacked on 320 dp phones
    dateRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.md, rowGap: space.lg },
    dateField: { flexGrow: 1, flexShrink: 1, flexBasis: 150, marginBottom: 0 },
    dateHint: { ...type.caption, marginTop: 6, marginBottom: space.lg },
    halfDayGroup: { marginBottom: space.lg },
    formNote: { ...type.caption, lineHeight: 17, marginTop: -space.xs, marginBottom: space.sm },
    detail: { marginBottom: space.lg },
    detailLabel: { ...type.caption, marginBottom: 4 },
});

export default CompensatoryLeaveScreen;
