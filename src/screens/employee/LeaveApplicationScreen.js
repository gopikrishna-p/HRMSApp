// src/screens/employee/LeaveApplicationScreen.js
//
// The employee's leave: balance per leave type, their applications (filter by status, cancel an
// open one) and the form to apply. The server counts working days, holidays and half days and
// refuses an application when the balance is not enough.
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
    Sheet,
    Button,
    TextField,
    SelectField,
    StatusText,
    EmptyState,
    Loading,
    Icon,
    color,
    space,
    type,
    formatShortDate,
} from '../../components/ds';

// ------------------------------------------------------------------ helpers
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// 'YYYY-MM-DD' as a local date (no timezone shift)
const parseYMD = (value) => {
    const [y, m, d] = String(value || '').slice(0, 10).split('-').map(Number);
    return y ? new Date(y, m - 1, d) : null;
};

// "5 Oct", with the year when it is not this year
const shortDay = (d, withYear) => `${d.getDate()} ${MONTHS[d.getMonth()]}${withYear ? ` ${d.getFullYear()}` : ''}`;

// "Mon, 5 Oct" for one day, "5 Oct – 7 Oct" for a range
const rangeLabel = (from, to) => {
    const a = parseYMD(from);
    const b = parseYMD(to) || a;
    if (!a) {
        return '–';
    }
    const thisYear = new Date().getFullYear();
    const withYear = a.getFullYear() !== thisYear || b.getFullYear() !== thisYear;
    if (a.getTime() === b.getTime()) {
        return `${WEEKDAYS[a.getDay()]}, ${shortDay(a, withYear)}`;
    }
    return `${shortDay(a, withYear)} – ${shortDay(b, withYear)}`;
};

const dayLabel = (value) => {
    const d = parseYMD(value);
    return d ? `${WEEKDAYS[d.getDay()]}, ${formatShortDate(d)}` : '–';
};

// 1.5 -> "1.5", 2 -> "2"
const num = (value) => String(Math.round((Number(value) || 0) * 100) / 100);
const daysText = (value) => {
    const n = Math.round((Number(value) || 0) * 100) / 100;
    return `${n} ${n === 1 ? 'day' : 'days'}`;
};

// ERPNext keeps undecided applications as "Open"; employees read that as pending.
const statusLabel = (status) => (status === 'Open' ? 'Pending' : status || '–');

const STATUS_FILTERS = [
    { value: 'all', label: 'All' },
    { value: 'Open', label: 'Pending' },
    { value: 'Approved', label: 'Approved' },
    { value: 'Rejected', label: 'Rejected' },
    { value: 'Cancelled', label: 'Cancelled' },
];

const SWITCH_TRACK = { false: '#D0D5DD', true: color.accent };

const Check = ({ on }) => (on ? <Icon name="check" size={18} color={color.accent} /> : null);

const LeaveApplicationScreen = ({ navigation }) => {
    // State for form
    const [loading, setLoading] = useState(true); // data is fetched on mount
    const [refreshing, setRefreshing] = useState(false);
    const [employeeId, setEmployeeId] = useState('');

    // Leave application form
    const [selectedLeaveType, setSelectedLeaveType] = useState('');
    const [fromDate, setFromDate] = useState(new Date());
    const [toDate, setToDate] = useState(new Date());
    const [isHalfDay, setIsHalfDay] = useState(false);
    const [halfDayDate, setHalfDayDate] = useState(new Date());
    const [reason, setReason] = useState('');
    const [selectedApprover, setSelectedApprover] = useState('');

    // Date picker controls
    const [showFromDatePicker, setShowFromDatePicker] = useState(false);
    const [showToDatePicker, setShowToDatePicker] = useState(false);
    const [showHalfDayPicker, setShowHalfDayPicker] = useState(false);

    // Leave data
    const [leaveTypes, setLeaveTypes] = useState([]);
    const [balances, setBalances] = useState({});
    const [approvers, setApprovers] = useState([]);
    const [myLeaves, setMyLeaves] = useState([]);

    // 'history' = the list; 'apply' = the application form sheet is open
    const [activeTab, setActiveTab] = useState('history');

    // Filter state for history
    const [historyStatusFilter, setHistoryStatusFilter] = useState('all');

    // Presentation only: inline option list open in the form, application open in the detail sheet
    const [picker, setPicker] = useState(null); // 'type' | 'approver'
    const [selected, setSelected] = useState(null);
    const lastSelected = useRef(null); // keeps the detail sheet filled while it slides out

    useEffect(() => {
        loadInitialData();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- employee, leave types, balances and approvers are loaded once on mount
    }, []);

    // Keep the half-day date inside the chosen range; the server rejects it otherwise.
    useEffect(() => {
        const clamped = clampToDateRange(halfDayDate, fromDate, toDate);
        if (clamped !== halfDayDate) {
            setHalfDayDate(clamped);
        }
    }, [halfDayDate, fromDate, toDate]);

    const loadInitialData = async () => {
        setLoading(true);
        try {
            // Get employee ID
            const empResponse = await apiService.getCurrentEmployee();
            const empData = extractFrappeData(empResponse, null);
            if (empData && empData.name) {
                const empId = empData.name;
                setEmployeeId(empId);

                // Load leave types, balances, and approvers in parallel
                await Promise.all([
                    loadLeaveTypes(empId),
                    loadLeaveBalances(empId),
                    loadApprovers(empId),
                    loadMyLeaves(empId)
                ]);
            } else {
                console.error('Failed to get employee info:', empResponse);
                showToast({ type: 'error', text1: 'Could not load your employee record', text2: 'Pull down to try again' });
            }
        } catch (error) {
            console.error('Error loading initial data:', error);
            showToast({ type: 'error', text1: 'Could not load leave data', text2: error.message });
        } finally {
            setLoading(false);
        }
    };

    const loadLeaveTypes = async (empId) => {
        try {
            const response = await apiService.getLeaveTypes(empId);
            const types = extractFrappeData(response, []);
            const typesArray = Array.isArray(types) ? types : [];
            setLeaveTypes(typesArray);
            if (typesArray.length > 0) {
                setSelectedLeaveType(typesArray[0]);
            }
        } catch (error) {
            console.error('Error loading leave types:', error);
            setLeaveTypes([]);
        }
    };

    const loadLeaveBalances = async (empId) => {
        try {
            const response = await apiService.getLeaveBalances(empId);
            const balancesData = extractFrappeData(response, {});
            setBalances(typeof balancesData === 'object' && !Array.isArray(balancesData) ? balancesData : {});
        } catch (error) {
            console.error('Error loading balances:', error);
            setBalances({});
        }
    };

    const loadApprovers = async (empId) => {
        try {
            const response = await apiService.getLeaveApprovalDetails(empId);
            const approverData = extractFrappeData(response, {});
            const approversList = Array.isArray(approverData.department_approvers)
                ? approverData.department_approvers
                : [];
            setApprovers(approversList);
            if (approverData.leave_approver) {
                setSelectedApprover(approverData.leave_approver);
            }
        } catch (error) {
            console.error('Error loading approvers:', error);
            setApprovers([]);
        }
    };

    const loadMyLeaves = async (empId) => {
        try {
            const response = await apiService.getMyLeaves({ employee: empId, limit: 50 });
            const leavesData = extractFrappeData(response, {});
            // Handle different response structures - applications might be direct or nested
            const applications = leavesData.applications || (Array.isArray(leavesData) ? leavesData : []);
            setMyLeaves(Array.isArray(applications) ? applications : []);
        } catch (error) {
            console.error('Error loading my leaves:', error);
            setMyLeaves([]);
        }
    };

    const onRefresh = async () => {
        setRefreshing(true);
        try {
            if (employeeId) {
                await Promise.all([
                    loadLeaveBalances(employeeId),
                    loadMyLeaves(employeeId)
                ]);
            }
        } catch (error) {
            console.error('Error refreshing:', error);
        } finally {
            setRefreshing(false);
        }
    };

    const handleSubmitLeave = async () => {
        // Validation
        if (!selectedLeaveType) {
            showToast({ type: 'error', text1: 'Select a leave type' });
            return;
        }

        if (formatLocalDate(fromDate) > formatLocalDate(toDate)) {
            showToast({ type: 'error', text1: 'From date is after To date' });
            return;
        }

        if (!reason.trim()) {
            showToast({ type: 'error', text1: 'Add a reason for your leave' });
            return;
        }

        // No client-side balance check: the server counts working days, holidays and
        // half days correctly and returns "Insufficient leave balance" when needed.
        setLoading(true);
        try {
            const leaveData = {
                employee: employeeId,
                leave_type: selectedLeaveType,
                from_date: formatLocalDate(fromDate),
                to_date: formatLocalDate(toDate),
                half_day: isHalfDay ? 1 : 0,
                half_day_date: isHalfDay ? formatLocalDate(halfDayDate) : null,
                description: reason.trim(),
                leave_approver: selectedApprover || null
            };

            const response = await apiService.submitLeave(leaveData);

            if (isApiSuccess(response)) {
                const result = extractFrappeData(response, {});
                // The refreshed Balance group shows what is left; the server's leave_balance
                // in this response is not reliable (see report), so it is not shown here.
                const days = result.total_leave_days;
                showToast({
                    type: 'success',
                    text1: 'Leave applied',
                    text2: days !== undefined && days !== null ? `${daysText(days)} requested` : undefined,
                });
                // Reset form
                setReason('');
                setIsHalfDay(false);
                setFromDate(new Date());
                setToDate(new Date());
                // Refresh data
                loadLeaveBalances(employeeId);
                loadMyLeaves(employeeId);
                // Back to the list (closes the form sheet)
                setActiveTab('history');
                setPicker(null);
            } else {
                showToast({ type: 'error', text1: 'Not submitted', text2: getApiErrorMessage(response, 'Failed to submit leave application') });
            }
        } catch (error) {
            console.error('Error submitting leave:', error);
            showToast({ type: 'error', text1: 'Not submitted', text2: error.message || 'Failed to submit leave application' });
        } finally {
            setLoading(false);
        }
    };

    const handleCancelLeave = async (applicationId) => {
        Alert.alert(
            'Cancel leave',
            'Cancel this leave application?',
            [
                { text: 'Keep', style: 'cancel' },
                {
                    text: 'Cancel leave',
                    style: 'destructive',
                    onPress: async () => {
                        setLoading(true);
                        try {
                            const response = await apiService.cancelMyLeave(
                                applicationId,
                                'Cancelled by employee'
                            );

                            if (response.success) {
                                showToast({ type: 'success', text1: 'Leave cancelled' });
                                setSelected(null);
                                loadLeaveBalances(employeeId);
                                loadMyLeaves(employeeId);
                            } else {
                                showToast({ type: 'error', text1: 'Not cancelled', text2: response.message || 'Failed to cancel leave' });
                            }
                        } catch (error) {
                            console.error('Error cancelling leave:', error);
                            showToast({ type: 'error', text1: 'Not cancelled', text2: 'Failed to cancel leave' });
                        } finally {
                            setLoading(false);
                        }
                    }
                }
            ]
        );
    };

    // ------------------------------------------------------------------ presentation helpers
    const openForm = () => {
        setPicker(null);
        setActiveTab('apply');
    };

    const closeForm = () => {
        if (!loading) {
            setActiveTab('history');
            setPicker(null);
        }
    };

    const closeDetail = () => {
        if (!loading) {
            setSelected(null);
        }
    };

    const togglePicker = (which) => setPicker((open) => (open === which ? null : which));

    if (selected) {
        lastSelected.current = selected;
    }
    const detail = selected || lastSelected.current;

    const balanceTypes = Object.keys(balances).filter((t) => balances[t]);
    const selectedBalance = selectedLeaveType ? balances[selectedLeaveType] : null;
    const balanceHint = selectedBalance
        ? `${num(selectedBalance.balance_leaves)} of ${daysText(selectedBalance.allocated_leaves)} left`
        : undefined;
    const approverLabel = approvers.find((a) => a.name === selectedApprover)?.full_name || selectedApprover || 'Default approver';

    const filteredLeaves = myLeaves.filter(leave => {
        if (historyStatusFilter === 'all') {
            return true;
        }
        return leave.status === historyStatusFilter;
    });
    const filterLabel = STATUS_FILTERS.find((f) => f.value === historyStatusFilter)?.label || '';

    // ------------------------------------------------------------------ list
    const renderList = () => (
        <>
            {balanceTypes.length > 0 ? (
                <Group title="Balance">
                    {balanceTypes.map((leaveType) => {
                        const b = balances[leaveType];
                        const allocated = Number(b.allocated_leaves) || 0;
                        const remaining = Number(b.balance_leaves) || 0;
                        return (
                            <Row
                                key={leaveType}
                                title={leaveType}
                                subtitle={`${num(allocated - remaining)} used of ${daysText(allocated)}`}
                                value={`${daysText(remaining)} left`}
                            />
                        );
                    })}
                </Group>
            ) : null}

            <Text style={styles.sectionTitle}>Applications</Text>
            <Segmented
                value={historyStatusFilter}
                onChange={setHistoryStatusFilter}
                options={STATUS_FILTERS}
                style={styles.filter}
            />

            {filteredLeaves.length === 0 ? (
                <EmptyState
                    icon="calendar"
                    title={historyStatusFilter === 'all' ? 'No leave applications' : `No ${filterLabel.toLowerCase()} applications`}
                    message={historyStatusFilter === 'all' ? 'Applications you submit appear here.' : undefined}
                />
            ) : (
                <Group>
                    {filteredLeaves.map((leave) => {
                        const facts = [
                            leave.leave_type,
                            leave.total_leave_days !== undefined && leave.total_leave_days !== null ? daysText(leave.total_leave_days) : null,
                            leave.half_day ? 'Half day' : null,
                        ].filter(Boolean).join('  ·  ');
                        return (
                            <Row
                                key={leave.name}
                                title={rangeLabel(leave.from_date, leave.to_date)}
                                subtitle={leave.description ? `${facts}\n${leave.description}` : facts}
                                right={<StatusText label={statusLabel(leave.status)} />}
                                onPress={() => setSelected(leave)}
                            />
                        );
                    })}
                </Group>
            )}
        </>
    );

    // ------------------------------------------------------------------ form
    const renderForm = () => (
        <>
            <SelectField
                label="Leave type"
                value={selectedLeaveType}
                placeholder="Select leave type"
                hint={picker === 'type' ? undefined : balanceHint}
                icon={picker === 'type' ? 'chevron-up' : 'chevron-down'}
                onPress={() => togglePicker('type')}
                style={picker === 'type' ? styles.selectOpen : undefined}
            />
            {picker === 'type' ? (
                <Group style={styles.inlineList}>
                    {leaveTypes.length === 0 ? (
                        <Row title="No leave types available" />
                    ) : (
                        leaveTypes.map((leaveType) => (
                            <Row
                                key={leaveType}
                                title={leaveType}
                                subtitle={balances[leaveType] ? `${daysText(balances[leaveType].balance_leaves)} left` : undefined}
                                right={<Check on={leaveType === selectedLeaveType} />}
                                chevron={false}
                                onPress={() => {
                                    setSelectedLeaveType(leaveType);
                                    setPicker(null);
                                }}
                            />
                        ))
                    )}
                </Group>
            ) : null}

            <View style={styles.dateRow}>
                <SelectField
                    label="From"
                    value={formatShortDate(fromDate)}
                    icon="calendar"
                    onPress={() => setShowFromDatePicker(true)}
                    style={styles.dateField}
                />
                <SelectField
                    label="To"
                    value={formatShortDate(toDate)}
                    icon="calendar"
                    onPress={() => setShowToDatePicker(true)}
                    style={styles.dateField}
                />
            </View>
            {showFromDatePicker && (
                <DateTimePicker
                    value={fromDate}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(event, date) => {
                        setShowFromDatePicker(Platform.OS === 'ios');
                        if (date) {
                            setFromDate(date);
                            if (date > toDate) {
                                setToDate(date);
                            }
                        }
                    }}
                />
            )}
            {showToDatePicker && (
                <DateTimePicker
                    value={toDate}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    minimumDate={fromDate}
                    onChange={(event, date) => {
                        setShowToDatePicker(Platform.OS === 'ios');
                        if (date) {
                            setToDate(date);
                        }
                    }}
                />
            )}

            <Group style={styles.toggleGroup}>
                <Row
                    title="Half day"
                    right={(
                        <Switch
                            value={isHalfDay}
                            onValueChange={() => setIsHalfDay(!isHalfDay)}
                            trackColor={SWITCH_TRACK}
                            thumbColor={color.surface}
                        />
                    )}
                />
            </Group>

            {isHalfDay && (
                <>
                    <SelectField
                        label="Half-day date"
                        value={formatShortDate(halfDayDate)}
                        icon="calendar"
                        onPress={() => setShowHalfDayPicker(true)}
                    />
                    {showHalfDayPicker && (
                        <DateTimePicker
                            value={halfDayDate}
                            mode="date"
                            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                            minimumDate={fromDate}
                            maximumDate={toDate}
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
                placeholder="Reason for leave"
                multiline
                numberOfLines={3}
                inputStyle={styles.shortMultiline}
            />

            {/* Approver (optional) */}
            {approvers.length > 0 && (
                <>
                    <SelectField
                        label="Approver"
                        value={approverLabel}
                        icon={picker === 'approver' ? 'chevron-up' : 'chevron-down'}
                        onPress={() => togglePicker('approver')}
                        style={picker === 'approver' ? styles.selectOpen : undefined}
                    />
                    {picker === 'approver' ? (
                        <Group style={styles.inlineList}>
                            {[{ name: '', full_name: 'Default approver' }, ...approvers].map((approver) => (
                                <Row
                                    key={approver.name || 'default'}
                                    title={approver.full_name || approver.name}
                                    right={<Check on={approver.name === selectedApprover} />}
                                    chevron={false}
                                    onPress={() => {
                                        setSelectedApprover(approver.name);
                                        setPicker(null);
                                    }}
                                />
                            ))}
                        </Group>
                    ) : null}
                </>
            )}
        </>
    );

    // ------------------------------------------------------------------ detail
    const renderDetail = (leave) => (
        <>
            <Group>
                <Row title="Status" right={<StatusText label={statusLabel(leave.status)} />} />
                <Row title="From" value={dayLabel(leave.from_date)} />
                <Row title="To" value={dayLabel(leave.to_date)} />
                {leave.total_leave_days !== undefined && leave.total_leave_days !== null ? (
                    <Row title="Days" value={daysText(leave.total_leave_days)} />
                ) : null}
                {leave.half_day ? (
                    <Row title="Half day" value={leave.half_day_date ? dayLabel(leave.half_day_date) : 'Yes'} />
                ) : null}
                {leave.posting_date ? <Row title="Applied on" value={dayLabel(leave.posting_date)} /> : null}
                {leave.leave_approver_name ? <Row title="Approver" value={leave.leave_approver_name} /> : null}
            </Group>
            {leave.description ? (
                <Group title="Reason">
                    <Text style={styles.note}>{leave.description}</Text>
                </Group>
            ) : null}
        </>
    );

    const busy = loading && !refreshing;

    return (
        <View style={styles.flex}>
            <Screen
                refreshing={refreshing}
                onRefresh={onRefresh}
                footer={<Button title="Apply for leave" onPress={openForm} disabled={busy} />}
            >
                {busy ? <Loading /> : renderList()}
            </Screen>

            <Sheet
                visible={activeTab === 'apply'}
                title="Apply for leave"
                onClose={closeForm}
                dismissable={!loading}
                footer={(
                    <>
                        <Button title="Cancel" variant="secondary" onPress={closeForm} disabled={loading} style={styles.flex} />
                        <Button title="Submit" onPress={handleSubmitLeave} loading={loading} style={styles.flex} />
                    </>
                )}
            >
                {renderForm()}
            </Sheet>

            <Sheet
                visible={Boolean(selected)}
                title={detail?.leave_type}
                subtitle={detail?.name}
                onClose={closeDetail}
                dismissable={!loading}
                footer={detail?.status === 'Open' ? (
                    <>
                        <Button title="Close" variant="secondary" onPress={closeDetail} disabled={loading} style={styles.flex} />
                        <Button title="Cancel leave" variant="danger" onPress={() => handleCancelLeave(detail.name)} loading={loading} style={styles.flex} />
                    </>
                ) : (
                    <Button title="Close" variant="secondary" onPress={closeDetail} style={styles.flex} />
                )}
            >
                {detail ? renderDetail(detail) : null}
            </Sheet>
        </View>
    );
};

const styles = StyleSheet.create({
    flex: { flex: 1 },
    sectionTitle: { ...type.label, marginBottom: space.sm, paddingHorizontal: space.xs },
    filter: { marginBottom: space.md },
    note: { ...type.body, lineHeight: 21, paddingHorizontal: space.lg, paddingVertical: space.md },

    selectOpen: { marginBottom: space.sm },
    inlineList: { marginBottom: space.lg },
    dateRow: { flexDirection: 'row', gap: space.md, marginBottom: space.lg },
    dateField: { flex: 1, marginBottom: 0 },
    toggleGroup: { marginBottom: space.lg },
    shortMultiline: { minHeight: 72 },
});

export default LeaveApplicationScreen;
