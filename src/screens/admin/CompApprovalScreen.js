// src/screens/admin/CompApprovalScreen.js
//
// Compensatory leave (comp-off) requests for days worked on holidays
// (hrms.api.get_admin_compensatory_requests). Approving submits the request and adds the
// days to the employee's leave balance; rejecting removes the pending request and notifies
// the employee with the reason. Admins can also apply on an employee's behalf; those requests
// are approved on submit. The admin's own comp-off lives under My Self-Service on the dashboard.
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Switch, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import apiService, { isApiSuccess, extractFrappeData, getApiErrorMessage } from '../../services/api.service';
import { loadAllEmployees } from '../../utils/employeeData';
import { formatLocalDate, clampToDateRange } from '../../utils/dateFormat';
import showToast from '../../utils/Toast';
import {
    Screen,
    Group,
    Row,
    Avatar,
    Segmented,
    Sheet,
    Button,
    EmptyState,
    Loading,
    StatusText,
    StatStrip,
    Notice,
    SearchField,
    SelectField,
    TextField,
    Icon,
    color,
    space,
    type,
} from '../../components/ds';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// 'YYYY-MM-DD' (or a Date) as a local date, without a timezone shift
const toDate = (value) => {
    if (value instanceof Date) {
        return value;
    }
    const [y, m, d] = String(value || '').slice(0, 10).split('-').map(Number);
    return y ? new Date(y, m - 1, d) : null;
};
const dayLabel = (value) => {
    const d = toDate(value);
    if (!d) {
        return '-';
    }
    const year = d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : '';
    return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}${year}`;
};
const dateRange = (from, to) => {
    const a = formatLocalDate(toDate(from));
    const b = formatLocalDate(toDate(to));
    return !b || a === b ? dayLabel(from) : `${dayLabel(from)} – ${dayLabel(to)}`;
};
const shortDate = (d) => (d ? `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : '');
const daysLabel = (n) => (n ? `${n} ${Number(n) === 1 ? 'day' : 'days'}` : '-');
const statusOf = (docstatus) => (
    { 0: 'Pending', 1: 'Approved', 2: 'Cancelled' }[docstatus] || 'Unknown'
);

const STATUS_FILTERS = [
    { value: 'all', label: 'All' },
    { value: '1', label: 'Approved' },
    { value: '2', label: 'Cancelled' },
];
const SWITCH_TRACK = { false: '#D0D5DD', true: color.accent };

const CompApprovalScreen = ({ navigation }) => {
    // State management
    const [activeTab, setActiveTab] = useState('pending'); // 'pending', 'apply', 'history', 'statistics'
    const [loading, setLoading] = useState(true); // the pending list is fetched on mount
    const [refreshing, setRefreshing] = useState(false);
    const [loadError, setLoadError] = useState(''); // message of the last failed list load
    const [acting, setActing] = useState(false); // approve / reject request running
    const [submitting, setSubmitting] = useState(false); // apply-on-behalf request running
    const busy = useRef(false); // blocks a second tap before the busy state renders
    const loadSeq = useRef(0); // only the latest list load may update the screen

    // Requests data
    const [pendingRequests, setPendingRequests] = useState([]);
    const [historyRequests, setHistoryRequests] = useState([]);
    const [statistics, setStatistics] = useState({
        total_requests: 0,
        total_days: 0,
        by_status: { pending: 0, approved: 0, cancelled: 0 },
        by_department: {},
        by_leave_type: {}
    });

    // Filters
    const [departments, setDepartments] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [filterDepartment, setFilterDepartment] = useState('');
    const [filterEmployee, setFilterEmployee] = useState('');
    const [filterStatus, setFilterStatus] = useState(''); // For history: 1=Approved, 2=Cancelled

    // Apply Form States
    const [applyEmployee, setApplyEmployee] = useState('');
    const [applyWorkFromDate, setApplyWorkFromDate] = useState(new Date());
    const [applyWorkEndDate, setApplyWorkEndDate] = useState(new Date());
    const [showApplyFromPicker, setShowApplyFromPicker] = useState(false);
    const [showApplyEndPicker, setShowApplyEndPicker] = useState(false);
    const [applyReason, setApplyReason] = useState('');
    const [applyHalfDay, setApplyHalfDay] = useState(false);
    const [applyHalfDayDate, setApplyHalfDayDate] = useState(new Date());
    const [showApplyHalfDayPicker, setShowApplyHalfDayPicker] = useState(false);
    const [applyLeaveType, setApplyLeaveType] = useState('Compensatory Off');
    const [leaveTypes, setLeaveTypes] = useState([]);

    // Request sheet: details first (actionType ''), then approve remarks / reject reason
    const [showActionModal, setShowActionModal] = useState(false);
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [actionType, setActionType] = useState(''); // 'approve' or 'reject'
    const [actionInput, setActionInput] = useState(''); // Remarks for approve, Reason for reject

    // Option picker sheet: 'department' | 'employee' | 'applyEmployee' | 'leaveType'
    const [picker, setPicker] = useState(null);
    const [pickerQuery, setPickerQuery] = useState('');

    useEffect(() => {
        loadDepartments();
        loadEmployees();
        loadLeaveTypes();
    }, []);

    useEffect(() => {
        if (activeTab === 'pending') {
            fetchPendingRequests();
        } else if (activeTab === 'history') {
            fetchHistoryRequests();
        } else if (activeTab === 'statistics') {
            fetchStatistics();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the fetchers are plain functions that read exactly these filters
    }, [activeTab, filterDepartment, filterEmployee, filterStatus]);

    // Keep the half-day date inside the worked range; the server rejects it otherwise.
    useEffect(() => {
        const clamped = clampToDateRange(applyHalfDayDate, applyWorkFromDate, applyWorkEndDate);
        if (clamped !== applyHalfDayDate) {
            setApplyHalfDayDate(clamped);
        }
    }, [applyHalfDayDate, applyWorkFromDate, applyWorkEndDate]);

    const loadDepartments = async () => {
        try {
            const response = await apiService.getDepartments();
            if (response.success && response.data?.message) {
                const deptData = response.data.message;
                setDepartments(Array.isArray(deptData) ? deptData : []);
            } else {
                setDepartments([]);
            }
        } catch (error) {
            console.error('Load departments error:', error);
            setDepartments([]);
        }
    };

    const loadEmployees = async () => {
        // Shared helper — see src/utils/employeeData.js.
        setEmployees(await loadAllEmployees());
    };

    const loadLeaveTypes = async () => {
        try {
            const response = await apiService.getLeaveTypes();
            if (response.success && response.data?.message) {
                const types = response.data.message;
                // Filter for compensatory off types or allow all
                const compTypes = Array.isArray(types)
                    ? types.filter(t => t.is_compensatory === 1 || t.leave_type_name?.toLowerCase().includes('compensatory'))
                    : [];
                // If no compensatory types, use all
                setLeaveTypes(compTypes.length > 0 ? compTypes : (Array.isArray(types) ? types : []));
                // Set default
                if (compTypes.length > 0) {
                    setApplyLeaveType(compTypes[0].name);
                } else if (Array.isArray(types) && types.length > 0) {
                    setApplyLeaveType(types[0].name);
                }
            } else {
                setLeaveTypes([]);
            }
        } catch (error) {
            console.error('Load leave types error:', error);
            setLeaveTypes([]);
        }
    };

    // `quiet` reloads keep the current list on screen (used after a decision)
    const fetchPendingRequests = async (quiet = false) => {
        const id = ++loadSeq.current;
        try {
            if (!quiet) {
                setLoading(true);
            }
            const response = await apiService.getAllCompLeaves({
                docstatus: 0, // Pending only
                department: filterDepartment || null,
                employee: filterEmployee || null,
                limit: 100
            });
            if (id !== loadSeq.current) {
                return;
            }

            if (isApiSuccess(response)) {
                const data = extractFrappeData(response, {}) || {};
                const applications = data.requests || [];
                setPendingRequests(Array.isArray(applications) ? applications : []);
                setStatistics(data.statistics || {});
                setLoadError('');
            } else {
                const errMsg = getApiErrorMessage(response, 'Failed to fetch compensatory leaves');
                console.error('Failed to fetch comp leaves:', errMsg);
                showToast({ type: 'error', text1: 'Could not load requests', text2: errMsg });
                setPendingRequests([]);
                setLoadError(errMsg);
            }
        } catch (error) {
            console.error('Fetch pending comp leave requests error:', error);
            if (id === loadSeq.current) {
                setPendingRequests([]);
                setLoadError(error?.message || 'Please try again.');
            }
        } finally {
            if (id === loadSeq.current) {
                setLoading(false);
                setRefreshing(false);
            }
        }
    };

    const fetchHistoryRequests = async () => {
        const id = ++loadSeq.current;
        try {
            setLoading(true);
            const statusFilter = filterStatus ? parseInt(filterStatus, 10) : null;
            const response = await apiService.getAllCompLeaves({
                docstatus: statusFilter, // 1=Approved, 2=Cancelled, or null for all history
                department: filterDepartment || null,
                employee: filterEmployee || null,
                limit: 200
            });
            if (id !== loadSeq.current) {
                return;
            }

            if (isApiSuccess(response)) {
                const data = extractFrappeData(response, {}) || {};
                const applications = data.requests || [];
                // Filter out pending (docstatus=0) from history
                const historyOnly = Array.isArray(applications)
                    ? applications.filter(app => app.docstatus !== 0)
                    : [];
                setHistoryRequests(historyOnly);
                setStatistics(data.statistics || {});
                setLoadError('');
            } else {
                const errMsg = getApiErrorMessage(response, 'Failed to load history');
                showToast({ type: 'error', text1: 'Could not load history', text2: errMsg });
                setHistoryRequests([]);
                setLoadError(errMsg);
            }
        } catch (error) {
            console.error('Fetch history requests error:', error);
            if (id === loadSeq.current) {
                showToast({ type: 'error', text1: 'Could not load history', text2: error?.message || 'Please try again' });
                setHistoryRequests([]);
                setLoadError(error?.message || 'Please try again.');
            }
        } finally {
            if (id === loadSeq.current) {
                setLoading(false);
                setRefreshing(false);
            }
        }
    };

    const fetchStatistics = async () => {
        const id = ++loadSeq.current;
        try {
            setLoading(true);
            const response = await apiService.getAllCompLeaves({
                department: filterDepartment || null,
                employee: filterEmployee || null,
                limit: 500
            });
            if (id !== loadSeq.current) {
                return;
            }

            if (isApiSuccess(response)) {
                const data = extractFrappeData(response, {}) || {};
                setStatistics(data.statistics || {});
                setLoadError('');
            } else {
                const errMsg = getApiErrorMessage(response, 'Failed to load statistics');
                showToast({ type: 'error', text1: 'Could not load summary', text2: errMsg });
                setLoadError(errMsg);
            }
        } catch (error) {
            console.error('Fetch statistics error:', error);
            if (id === loadSeq.current) {
                showToast({ type: 'error', text1: 'Could not load summary', text2: error?.message || 'Please try again' });
                setLoadError(error?.message || 'Please try again.');
            }
        } finally {
            if (id === loadSeq.current) {
                setLoading(false);
                setRefreshing(false);
            }
        }
    };

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        if (activeTab === 'pending') {
            fetchPendingRequests();
        } else if (activeTab === 'history') {
            fetchHistoryRequests();
        } else {
            fetchStatistics();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the fetchers are plain functions that read exactly these filters
    }, [activeTab, filterDepartment, filterEmployee, filterStatus]);

    // Open the request sheet on its details step.
    const openRequest = (request) => {
        setSelectedRequest(request);
        setActionType('');
        setActionInput('');
        setShowActionModal(true);
    };

    const handleApprove = (request) => {
        setSelectedRequest(request);
        setActionType('approve');
        setActionInput('');
        setShowActionModal(true);
    };

    const handleReject = (request) => {
        setSelectedRequest(request);
        setActionType('reject');
        setActionInput('');
        setShowActionModal(true);
    };

    const closeActionSheet = () => {
        if (acting) {
            return;
        }
        setShowActionModal(false);
        setActionInput('');
    };

    // The sheet stays open (button spinner) while the request runs, so a failure can be retried
    // and the list is never replaced by a spinner; it closes on success.
    const executeAction = async () => {
        if (!selectedRequest || busy.current) {
            return;
        }
        if (actionType === 'reject' && !actionInput.trim()) {
            showToast({ type: 'error', text1: 'Enter a reason for rejecting' });
            return;
        }

        busy.current = true;
        setActing(true);

        try {
            let response;
            if (actionType === 'approve') {
                response = await apiService.approveCompLeave(selectedRequest.name, actionInput.trim());
            } else {
                response = await apiService.rejectCompLeave(selectedRequest.name, actionInput.trim());
            }

            if (response.success && response.data?.message) {
                const data = response.data.message;
                if (actionType === 'approve') {
                    showToast({
                        type: 'success',
                        text1: 'Request approved',
                        text2: `${data.days_allocated ? `${daysLabel(data.days_allocated)} added` : 'Added'} to leave balance${data.leave_allocation ? `  ·  ${data.leave_allocation}` : ''}`,
                    });
                } else {
                    showToast({ type: 'success', text1: 'Request rejected', text2: selectedRequest.employee_name });
                }
                setShowActionModal(false);
                setActionInput('');
                await fetchPendingRequests(true);
            } else {
                showToast({ type: 'error', text1: 'Not updated', text2: getApiErrorMessage(response, `Failed to ${actionType} request`) });
            }
        } catch (error) {
            console.error(`${actionType} error:`, error);
            showToast({ type: 'error', text1: 'Not updated', text2: error.message || `Failed to ${actionType} request` });
        } finally {
            busy.current = false;
            setActing(false);
        }
    };

    // Admin Apply Comp-Off for Employee
    const handleAdminApplyCompOff = async () => {
        // Validation
        if (!applyEmployee) {
            showToast({ type: 'error', text1: 'Select an employee' });
            return;
        }
        if (!applyReason.trim()) {
            showToast({ type: 'error', text1: 'Enter a reason', text2: 'Why the employee worked on the holiday' });
            return;
        }
        if (formatLocalDate(applyWorkEndDate) < formatLocalDate(applyWorkFromDate)) {
            showToast({ type: 'error', text1: 'Check the dates', text2: 'The last day cannot be before the first day' });
            return;
        }
        if (applyHalfDay && !applyHalfDayDate) {
            showToast({ type: 'error', text1: 'Select the half day date' });
            return;
        }
        if (busy.current) {
            return;
        }

        busy.current = true;
        setSubmitting(true);
        try {
            const response = await apiService.submitCompLeave({
                employee: applyEmployee,
                work_from_date: formatLocalDate(applyWorkFromDate),
                work_end_date: formatLocalDate(applyWorkEndDate),
                reason: applyReason.trim(),
                leave_type: applyLeaveType || 'Compensatory Off',
                half_day: applyHalfDay ? 1 : 0,
                half_day_date: applyHalfDay ? formatLocalDate(applyHalfDayDate) : null
            });

            if (response.success && response.data?.message) {
                const data = response.data.message;
                const empName = employees.find(e => e.name === applyEmployee)?.employee_name || applyEmployee;
                showToast({
                    type: 'success',
                    text1: `Request submitted for ${empName}`,
                    text2: [data.compensatory_days ? daysLabel(data.compensatory_days) : null, data.docstatus === 1 ? 'Approved' : 'Pending']
                        .filter(Boolean).join('  ·  '),
                });
                // Reset form
                setApplyEmployee('');
                setApplyReason('');
                setApplyHalfDay(false);
                setApplyWorkFromDate(new Date());
                setApplyWorkEndDate(new Date());
                // Switch to pending tab
                setActiveTab('pending');
            } else {
                showToast({ type: 'error', text1: 'Not submitted', text2: getApiErrorMessage(response, 'Failed to submit comp-off request') });
            }
        } catch (error) {
            console.error('Admin apply comp-off error:', error);
            showToast({ type: 'error', text1: 'Not submitted', text2: error.message || 'Failed to submit comp-off request' });
        } finally {
            busy.current = false;
            setSubmitting(false);
        }
    };

    const clearFilters = () => {
        setFilterDepartment('');
        setFilterEmployee('');
        setFilterStatus('');
    };

    // ------------------------------------------------------------------ presentation helpers
    const filtersActive = Boolean(filterDepartment || filterEmployee || filterStatus);
    const employeeName = (id) => employees.find((e) => e.name === id)?.employee_name || id;
    const departmentName = (id) => departments.find((d) => d.name === id)?.department_name || id;

    const leaveTypeOptions = [
        { value: 'Compensatory Off', label: 'Compensatory Off' },
        ...leaveTypes.map((lt) => ({ value: lt.name, label: lt.leave_type_name || lt.name })),
    ].filter((o, i, all) => all.findIndex((x) => x.value === o.value) === i);
    const employeeOptions = employees.map((emp) => ({
        value: emp.name,
        label: emp.employee_name || emp.name,
        subtitle: [emp.name, String(emp.department || '').replace(' - DG', '')].filter(Boolean).join('  ·  '),
    }));

    const pickers = {
        department: {
            title: 'Department',
            value: filterDepartment,
            onSelect: setFilterDepartment,
            options: [
                { value: '', label: 'All departments' },
                ...departments.map((dept) => ({ value: dept.name, label: dept.department_name || dept.name })),
            ],
        },
        employee: {
            title: 'Employee',
            value: filterEmployee,
            onSelect: setFilterEmployee,
            searchable: true,
            options: [{ value: '', label: 'All employees' }, ...employeeOptions],
        },
        applyEmployee: {
            title: 'Employee',
            value: applyEmployee,
            onSelect: setApplyEmployee,
            searchable: true,
            options: employeeOptions,
        },
        leaveType: {
            title: 'Leave type',
            value: applyLeaveType,
            onSelect: setApplyLeaveType,
            options: leaveTypeOptions,
        },
    };

    const openPicker = (key) => {
        setPickerQuery('');
        setPicker(key);
    };

    const requestSubtitle = (request, withDays) => {
        const dates = dateRange(request.work_from_date, request.work_end_date);
        const first = withDays ? `${dates}  ·  ${daysLabel(request.compensatory_days)}` : dates;
        return request.reason ? `${first}\n${request.reason}` : first;
    };

    const applyFooter = <Button title="Apply on behalf" onPress={() => setActiveTab('apply')} full />;

    // ------------------------------------------------------------------ top bar
    const renderTopBar = () => (
        <View style={styles.toolbar}>
            <Segmented
                value={activeTab}
                onChange={setActiveTab}
                options={[
                    { value: 'pending', label: 'Pending', count: statistics.by_status?.pending || 0 },
                    { value: 'history', label: 'History' },
                    { value: 'statistics', label: 'Summary' },
                ]}
            />
            {activeTab === 'history' ? (
                <Segmented
                    value={filterStatus || 'all'}
                    onChange={(value) => setFilterStatus(value === 'all' ? '' : value)}
                    options={STATUS_FILTERS}
                    style={styles.statusControl}
                />
            ) : null}
            {activeTab !== 'statistics' ? (
                <View style={styles.filters}>
                    <FilterChip
                        label={filterDepartment ? departmentName(filterDepartment) : 'All departments'}
                        active={Boolean(filterDepartment)}
                        onPress={() => openPicker('department')}
                    />
                    {activeTab === 'pending' ? (
                        <FilterChip
                            label={filterEmployee ? employeeName(filterEmployee) : 'All employees'}
                            active={Boolean(filterEmployee)}
                            onPress={() => openPicker('employee')}
                        />
                    ) : null}
                    {filtersActive ? (
                        <Pressable onPress={clearFilters} hitSlop={8} style={styles.clear}>
                            <Text style={styles.link}>Clear</Text>
                        </Pressable>
                    ) : null}
                </View>
            ) : null}
        </View>
    );

    // ------------------------------------------------------------------ apply on behalf
    const renderApplyTab = () => (
        <Screen
            footer={(
                <View style={styles.footerRow}>
                    <Button title="Cancel" variant="secondary" onPress={() => setActiveTab('pending')} style={styles.flex} />
                    <Button title="Submit" onPress={handleAdminApplyCompOff} loading={submitting} style={styles.flex} />
                </View>
            )}
        >
            <Text style={styles.formTitle}>Apply on behalf of an employee</Text>

            <SelectField
                label="Employee"
                value={applyEmployee ? employeeName(applyEmployee) : ''}
                placeholder="Select employee"
                onPress={() => openPicker('applyEmployee')}
            />
            <SelectField
                label="Leave type"
                value={leaveTypeOptions.find((o) => o.value === applyLeaveType)?.label || applyLeaveType}
                onPress={() => openPicker('leaveType')}
            />

            <View style={styles.dateRow}>
                <SelectField
                    label="Worked from"
                    value={shortDate(applyWorkFromDate)}
                    icon="calendar"
                    onPress={() => setShowApplyFromPicker(true)}
                    style={styles.dateField}
                />
                <SelectField
                    label="Worked until"
                    value={shortDate(applyWorkEndDate)}
                    icon="calendar"
                    onPress={() => setShowApplyEndPicker(true)}
                    style={styles.dateField}
                />
            </View>
            <Text style={styles.dateHint}>Must be holidays with attendance marked.</Text>
            {showApplyFromPicker && (
                <DateTimePicker
                    value={applyWorkFromDate}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(event, date) => {
                        setShowApplyFromPicker(Platform.OS === 'ios');
                        if (date) {
                            setApplyWorkFromDate(date);
                        }
                    }}
                />
            )}
            {showApplyEndPicker && (
                <DateTimePicker
                    value={applyWorkEndDate}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(event, date) => {
                        setShowApplyEndPicker(Platform.OS === 'ios');
                        if (date) {
                            setApplyWorkEndDate(date);
                        }
                    }}
                />
            )}

            <Group style={styles.halfDayGroup}>
                <Row
                    title="Half day"
                    right={(
                        <Switch
                            value={applyHalfDay}
                            onValueChange={() => setApplyHalfDay(!applyHalfDay)}
                            trackColor={SWITCH_TRACK}
                            thumbColor={color.surface}
                        />
                    )}
                />
            </Group>

            {applyHalfDay && (
                <>
                    <SelectField
                        label="Half day date"
                        value={shortDate(applyHalfDayDate)}
                        icon="calendar"
                        onPress={() => setShowApplyHalfDayPicker(true)}
                    />
                    {showApplyHalfDayPicker && (
                        <DateTimePicker
                            value={applyHalfDayDate}
                            mode="date"
                            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                            minimumDate={applyWorkFromDate}
                            maximumDate={applyWorkEndDate}
                            onChange={(event, date) => {
                                setShowApplyHalfDayPicker(Platform.OS === 'ios');
                                if (date) {
                                    setApplyHalfDayDate(date);
                                }
                            }}
                        />
                    )}
                </>
            )}

            <TextField
                label="Reason"
                value={applyReason}
                onChangeText={setApplyReason}
                placeholder="What the employee worked on"
                multiline
                numberOfLines={4}
            />
            <Text style={styles.formNote}>
                Requests you submit are approved right away and the days are added to the employee's leave balance.
            </Text>
        </Screen>
    );

    // ------------------------------------------------------------------ pending
    const renderPendingTab = () => (
        <Screen refreshing={refreshing} onRefresh={onRefresh} footer={applyFooter}>
            {loading && !refreshing ? (
                <Loading />
            ) : pendingRequests.length === 0 && loadError ? (
                <EmptyState icon="alert-circle" title="Could not load requests" message={loadError} action="Try again" onAction={onRefresh} />
            ) : pendingRequests.length === 0 ? (
                <EmptyState
                    icon="check-circle"
                    title="No pending requests"
                    message={filtersActive ? 'No requests match these filters.' : 'Requests for days worked on holidays appear here.'}
                    action={filtersActive ? 'Clear filters' : undefined}
                    onAction={clearFilters}
                />
            ) : (
                <Group>
                    {pendingRequests.map((request) => (
                        <Row
                            key={request.name}
                            left={<Avatar name={request.employee_name} />}
                            title={request.employee_name}
                            subtitle={requestSubtitle(request, false)}
                            subtitleLines={3}
                            value={daysLabel(request.compensatory_days)}
                            onPress={() => openRequest(request)}
                        />
                    ))}
                </Group>
            )}
        </Screen>
    );

    // ------------------------------------------------------------------ history
    const renderHistoryTab = () => (
        <Screen refreshing={refreshing} onRefresh={onRefresh} footer={applyFooter}>
            {loading && !refreshing ? (
                <Loading />
            ) : historyRequests.length === 0 && loadError ? (
                <EmptyState icon="alert-circle" title="Could not load history" message={loadError} action="Try again" onAction={onRefresh} />
            ) : historyRequests.length === 0 ? (
                <EmptyState
                    icon="clock"
                    title="No history"
                    message={filtersActive ? 'No requests match these filters.' : 'Approved and cancelled requests appear here.'}
                    action={filtersActive ? 'Clear filters' : undefined}
                    onAction={clearFilters}
                />
            ) : (
                <Group>
                    {historyRequests.map((request) => (
                        <Row
                            key={request.name}
                            left={<Avatar name={request.employee_name} />}
                            title={request.employee_name}
                            subtitle={requestSubtitle(request, true)}
                            subtitleLines={3}
                            right={<StatusText label={statusOf(request.docstatus)} />}
                            onPress={() => openRequest(request)}
                        />
                    ))}
                </Group>
            )}
        </Screen>
    );

    // ------------------------------------------------------------------ summary
    const renderStatisticsTab = () => (
        <Screen refreshing={refreshing} onRefresh={onRefresh} footer={applyFooter}>
            {loading && !refreshing ? (
                <Loading />
            ) : (
                <>
                    {loadError ? (
                        <Notice tone="danger" icon="alert-circle" title="Could not load the summary" onPress={onRefresh}>
                            {`${loadError} Tap to try again.`}
                        </Notice>
                    ) : null}
                    <StatStrip
                        style={styles.strip}
                        items={[
                            { label: 'Requests', value: statistics.total_requests || 0 },
                            { label: 'Days', value: statistics.total_days || 0 },
                        ]}
                    />

                    <Group title="By status">
                        <Row title="Pending" value={statistics.by_status?.pending || 0} />
                        <Row title="Approved" value={statistics.by_status?.approved || 0} />
                        <Row title="Cancelled" value={statistics.by_status?.cancelled || 0} />
                    </Group>

                    {statistics.by_department && Object.keys(statistics.by_department).length > 0 && (
                        <Group title="By department">
                            {Object.entries(statistics.by_department).map(([dept, count]) => (
                                <Row key={dept} title={dept} value={count} />
                            ))}
                        </Group>
                    )}

                    {statistics.by_leave_type && Object.keys(statistics.by_leave_type).length > 0 && (
                        <Group title="By leave type">
                            {Object.entries(statistics.by_leave_type).map(([leaveType, count]) => (
                                <Row key={leaveType} title={leaveType} value={count} />
                            ))}
                        </Group>
                    )}
                </>
            )}
        </Screen>
    );

    // ------------------------------------------------------------------ request sheet
    const renderActionSheet = () => {
        const request = selectedRequest;
        const isPending = request?.docstatus === 0;
        const summary = request
            ? `${dateRange(request.work_from_date, request.work_end_date)}  ·  ${daysLabel(request.compensatory_days)}`
            : '';
        const backToDetails = () => {
            setActionType('');
            setActionInput('');
        };

        let subtitle = 'Comp-off request';
        let footer = <Button title="Close" variant="secondary" onPress={closeActionSheet} style={styles.flex} />;
        let body = null;

        if (request && actionType === 'approve') {
            subtitle = 'Approve comp-off';
            footer = (
                <>
                    <Button title="Back" variant="secondary" onPress={backToDetails} disabled={acting} style={styles.flex} />
                    <Button title="Approve" onPress={executeAction} loading={acting} style={styles.flex} />
                </>
            );
            body = (
                <>
                    <Text style={styles.summary}>{summary}</Text>
                    <TextField
                        label="Remarks"
                        hint="Optional. The days are added to the employee's leave balance."
                        value={actionInput}
                        onChangeText={setActionInput}
                        editable={!acting}
                        placeholder="Add a remark"
                        multiline
                        numberOfLines={4}
                    />
                </>
            );
        } else if (request && actionType === 'reject') {
            subtitle = 'Reject comp-off';
            footer = (
                <>
                    <Button title="Back" variant="secondary" onPress={backToDetails} disabled={acting} style={styles.flex} />
                    <Button title="Reject" variant="dangerSolid" onPress={executeAction} loading={acting} disabled={!actionInput.trim()} style={styles.flex} />
                </>
            );
            body = (
                <>
                    <Text style={styles.summary}>{summary}</Text>
                    <TextField
                        label="Reason"
                        hint="Required. Sent to the employee."
                        value={actionInput}
                        onChangeText={setActionInput}
                        editable={!acting}
                        placeholder="Why the request is rejected"
                        multiline
                        numberOfLines={4}
                    />
                </>
            );
        } else if (request) {
            if (isPending) {
                footer = (
                    <>
                        <Button title="Reject" variant="danger" onPress={() => handleReject(request)} style={styles.flex} />
                        <Button title="Approve" onPress={() => handleApprove(request)} style={styles.flex} />
                    </>
                );
            }
            body = (
                <>
                    <Detail label="Days worked" value={dateRange(request.work_from_date, request.work_end_date)} />
                    <Detail label="Compensatory days" value={daysLabel(request.compensatory_days)} />
                    {request.half_day ? <Detail label="Half day" value={dayLabel(request.half_day_date)} /> : null}
                    <Detail label="Reason" value={request.reason || 'No reason given'} />
                    {request.leave_type ? <Detail label="Leave type" value={request.leave_type} /> : null}
                    <Detail label="Department" value={String(request.department || '-').replace(' - DG', '')} />
                    {!isPending ? <Detail label="Status" value={<StatusText label={statusOf(request.docstatus)} size={15} />} /> : null}
                    {request.leave_allocation ? <Detail label="Leave allocation" value={request.leave_allocation} /> : null}
                    <Detail label="Request" value={request.name} />
                </>
            );
        }

        return (
            <Sheet
                visible={showActionModal && Boolean(request)}
                title={request?.employee_name}
                subtitle={subtitle}
                onClose={closeActionSheet}
                dismissable={!acting}
                footer={footer}
            >
                {body}
            </Sheet>
        );
    };

    // ------------------------------------------------------------------ option picker sheet
    const renderPickerSheet = () => {
        const config = picker ? pickers[picker] : null;
        const q = pickerQuery.trim().toLowerCase();
        const options = (config?.options || []).filter((o) => !q
            || String(o.label || '').toLowerCase().includes(q)
            || String(o.subtitle || '').toLowerCase().includes(q));
        const choose = (value) => {
            config.onSelect(value);
            setPicker(null);
            setPickerQuery('');
        };
        return (
            <Sheet visible={Boolean(config)} title={config?.title} onClose={() => setPicker(null)}>
                {config?.searchable ? (
                    <SearchField value={pickerQuery} onChangeText={setPickerQuery} placeholder="Search employees" style={styles.search} />
                ) : null}
                {options.length === 0 ? (
                    <Text style={styles.noMatch}>No matches</Text>
                ) : (
                    <Group flush style={styles.sheetList}>
                        {options.map((o) => {
                            const active = o.value === config.value;
                            return (
                                <Row
                                    key={o.value || 'all'}
                                    title={o.label}
                                    titleLines={2}
                                    subtitle={o.subtitle || undefined}
                                    selected={active}
                                    right={active ? <Icon name="check" size={18} color={color.accent} /> : null}
                                    chevron={false}
                                    onPress={() => choose(o.value)}
                                />
                            );
                        })}
                    </Group>
                )}
            </Sheet>
        );
    };

    return (
        <View style={styles.container}>
            {activeTab !== 'apply' ? renderTopBar() : null}

            {activeTab === 'pending' && renderPendingTab()}
            {activeTab === 'apply' && renderApplyTab()}
            {activeTab === 'history' && renderHistoryTab()}
            {activeTab === 'statistics' && renderStatisticsTab()}

            {renderActionSheet()}
            {renderPickerSheet()}
        </View>
    );
};

const Detail = ({ label, value }) => (
    <View style={styles.detail}>
        <Text style={styles.detailLabel}>{label}</Text>
        {typeof value === 'string' ? <Text style={type.body}>{value}</Text> : value}
    </View>
);

const FilterChip = ({ label, active, onPress }) => (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && styles.chipPressed]}>
        <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>{label}</Text>
        <Icon name="chevron-down" size={14} color={active ? color.accent : color.textSecondary} />
    </Pressable>
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
    statusControl: { marginTop: space.sm },
    filters: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        flexShrink: 1,
        gap: 4,
        minHeight: 32,
        paddingVertical: 4,
        paddingHorizontal: space.md,
        borderRadius: 16,
        backgroundColor: color.neutralSoft,
    },
    chipActive: { backgroundColor: color.accentSoft },
    chipPressed: { opacity: 0.7 },
    chipText: { flexShrink: 1, fontSize: 13, fontWeight: '500', color: color.textSecondary },
    chipTextActive: { color: color.accent },
    clear: { marginLeft: 'auto', paddingLeft: space.sm },
    link: { fontSize: 13, fontWeight: '600', color: color.accent },

    strip: { marginBottom: space.xl },

    formTitle: { ...type.title, marginBottom: space.lg },
    // side by side from 360 dp; stacked on a 320 dp phone, where two dates would be cut off at large text
    dateRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
    dateField: { flexGrow: 1, flexBasis: 140, marginBottom: 0 },
    dateHint: { ...type.caption, marginTop: 6, marginBottom: space.lg },
    halfDayGroup: { marginBottom: space.lg },
    formNote: { ...type.caption, lineHeight: 17 },
    footerRow: { flexDirection: 'row', gap: space.sm },

    detail: { marginBottom: space.lg },
    detailLabel: { ...type.caption, marginBottom: 4 },
    summary: { ...type.secondary, marginBottom: space.lg },

    search: { marginBottom: space.sm },
    sheetList: { marginHorizontal: -space.lg, marginBottom: 0 },
    noMatch: { ...type.secondary, textAlign: 'center', paddingVertical: space.xl },
});

export default CompApprovalScreen;
