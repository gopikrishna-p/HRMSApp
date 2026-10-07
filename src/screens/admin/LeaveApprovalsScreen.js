// src/screens/admin/LeaveApprovalsScreen.js
//
// Leave applications for HR: approve or reject open requests, browse decided ones, a summary
// by status / leave type / department, and applying leave on behalf of an employee.
// Approve and reject remarks are included in the notification the employee receives.
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Switch, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import apiService, { extractFrappeData, isApiSuccess, getApiErrorMessage } from '../../services/api.service';
import showToast from '../../utils/Toast';
import { loadAllEmployees } from '../../utils/employeeData';
import { formatLocalDate, clampToDateRange } from '../../utils/dateFormat';
import {
    Screen,
    Group,
    Row,
    Avatar,
    Segmented,
    Sheet,
    Button,
    IconButton,
    SearchField,
    Field,
    TextField,
    SelectField,
    StatStrip,
    StatusText,
    EmptyState,
    Loading,
    Icon,
    color,
    space,
    type,
    formatShortDate,
} from '../../components/ds';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// 'YYYY-MM-DD' (or a 'YYYY-MM-DD HH:MM:SS' timestamp) as a local date, no timezone shift
const toDate = (value) => {
    const [y, m, d] = String(value || '').slice(0, 10).split('-').map(Number);
    return y ? new Date(y, m - 1, d) : null;
};
const dayLabel = (value) => {
    const d = toDate(value);
    if (!d) {
        return '–';
    }
    const label = `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
    return d.getFullYear() === new Date().getFullYear() ? label : `${label} ${d.getFullYear()}`;
};
const shortDay = (value) => {
    const d = toDate(value);
    return d ? formatShortDate(d) : '–';
};
const dateRange = (from, to) => {
    const sameDay = !to || String(from).slice(0, 10) === String(to).slice(0, 10);
    return sameDay ? dayLabel(from) : `${dayLabel(from)} – ${dayLabel(to)}`;
};
const formatDays = (value) => {
    if (value === null || value === undefined || value === '') {
        return null;
    }
    const n = Number(value);
    return Number.isNaN(n) ? null : `${n} ${n === 1 ? 'day' : 'days'}`;
};
const leaveDays = (leave) => {
    const days = formatDays(leave.total_leave_days);
    if (!leave.half_day) {
        return days;
    }
    return Number(leave.total_leave_days) === 0.5 ? 'Half day' : [days, 'incl. half day'].filter(Boolean).join(', ');
};
const shortDept = (dept) => String(dept || '').replace(' - DG', '');
// whole calendar days from `from` to `to`, inclusive (time of day ignored)
const daysBetween = (from, to) => {
    const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
    return Math.round((b - a) / 86400000) + 1;
};
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const STATUS_OPTIONS = [
    { value: '', label: 'All statuses' },
    { value: 'Approved', label: 'Approved' },
    { value: 'Rejected', label: 'Rejected' },
    { value: 'Cancelled', label: 'Cancelled' },
];

const LeaveApprovalsScreen = ({ navigation, route }) => {
    // State
    const [loading, setLoading] = useState(true); // first load runs on mount
    const [refreshing, setRefreshing] = useState(false);
    const [tabLoading, setTabLoading] = useState(false); // a tab or filter change is fetching
    const [errors, setErrors] = useState({}); // tab -> message of its last failed load
    const [acting, setActing] = useState(false); // approve / reject request running
    const [submitting, setSubmitting] = useState(false); // apply-on-behalf request running
    const actingRef = useRef(false); // block a second tap before the busy state renders
    const submittingRef = useRef(false);
    const seq = useRef({ pending: 0, history: 0, statistics: 0 }); // ignore responses of superseded loads

    // Tab state — deep-links from EmployeeManagement can pass route.params.tab
    // (e.g. 'history') to land directly on the right tab.
    const [activeTab, setActiveTab] = useState(route?.params?.tab || 'pending'); // 'pending', 'history', 'statistics', 'apply'

    // Leave applications
    const [pendingLeaves, setPendingLeaves] = useState([]);
    const [historyLeaves, setHistoryLeaves] = useState([]);
    const [statistics, setStatistics] = useState(null);

    // Admin Apply Leave Form State
    const [applyForEmployee, setApplyForEmployee] = useState('');
    const [applyLeaveType, setApplyLeaveType] = useState('');
    const [applyFromDate, setApplyFromDate] = useState(new Date());
    const [applyToDate, setApplyToDate] = useState(new Date());
    const [applyIsHalfDay, setApplyIsHalfDay] = useState(false);
    const [applyHalfDayDate, setApplyHalfDayDate] = useState(new Date());
    const [applyReason, setApplyReason] = useState('');
    const [applyAutoApprove, setApplyAutoApprove] = useState(true);
    const [leaveTypes, setLeaveTypes] = useState([]);
    const [leaveBalances, setLeaveBalances] = useState({});
    const [showApplyFromDatePicker, setShowApplyFromDatePicker] = useState(false);
    const [showApplyToDatePicker, setShowApplyToDatePicker] = useState(false);
    const [showApplyHalfDayPicker, setShowApplyHalfDayPicker] = useState(false);

    // Filters
    const [selectedDepartment, setSelectedDepartment] = useState('');
    const [selectedEmployee, setSelectedEmployee] = useState('');
    const [historyStatusFilter, setHistoryStatusFilter] = useState('');

    // Data for filters
    const [departments, setDepartments] = useState([]);
    const [employees, setEmployees] = useState([]);

    // Action sheet: actionType '' shows the details, 'approve' / 'reject' the confirmation step
    const [showActionModal, setShowActionModal] = useState(false);
    const [selectedLeave, setSelectedLeave] = useState(null);
    const [actionType, setActionType] = useState(''); // 'approve' or 'reject'
    const [remarks, setRemarks] = useState('');
    const [rejectionReason, setRejectionReason] = useState('');

    // Presentation only: which option sheet is open, its search text, and the low-balance confirmation
    const [picker, setPicker] = useState(null); // 'department' | 'employee' | 'status' | 'applyEmployee' | 'leaveType'
    const [pickerQuery, setPickerQuery] = useState('');
    const [lowBalance, setLowBalance] = useState(null); // { remaining, requestedDays }

    useEffect(() => {
        loadInitialData();
        // Runs once on mount; loadInitialData is a plain function recreated on every render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Deep-link from EmployeeManagement → "View Leave History" passes
    // `{ preselectEmployee: <empId>, tab: 'history' }` to this screen so HR
    // lands on that employee's leave history without manually filtering.
    useEffect(() => {
        const target = route?.params?.preselectEmployee;
        if (target && employees.length > 0 && selectedEmployee !== target) {
            setSelectedEmployee(target);
        }
        // selectedEmployee is left out on purpose: clearing the filter must not re-apply the deep-link.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [route?.params?.preselectEmployee, employees]);

    const loadInitialData = async () => {
        setLoading(true);
        try {
            await Promise.all([
                loadDepartments(),
                loadEmployees(),
                fetchPendingLeaves(),
            ]);
        } catch (error) {
            console.error('Error loading initial data:', error);
            showToast({ type: 'error', text1: 'Could not load leave requests', text2: error?.message });
        } finally {
            setLoading(false);
        }
    };

    const loadDepartments = async () => {
        try {
            const response = await apiService.getDepartments();
            if (response.success && response.data) {
                // Handle different response structures
                const deptData = response.data.message || response.data;
                setDepartments(Array.isArray(deptData) ? deptData : []);
            } else {
                setDepartments([]);
            }
        } catch (error) {
            console.error('Error loading departments:', error);
            setDepartments([]);
        }
    };

    const loadEmployees = async () => {
        // Shared helper in src/utils/employeeData.js — unwraps backend's
        // `{status, employees:[...]}` shape and falls back to [] on failure.
        setEmployees(await loadAllEmployees());
    };

    const setTabError = (tab, message) => setErrors((all) => (all[tab] === message ? all : { ...all, [tab]: message }));

    const fetchPendingLeaves = async () => {
        const id = ++seq.current.pending;
        try {
            const filters = {
                status: 'Open',
                department: selectedDepartment || null,
                employee: selectedEmployee || null,
            };

            const response = await apiService.getAllLeaves(filters);
            if (id !== seq.current.pending) {
                return;
            }

            if (isApiSuccess(response)) {
                const result = extractFrappeData(response, { applications: [] });
                setPendingLeaves(Array.isArray(result?.applications) ? result.applications : []);
                setTabError('pending', '');
            } else {
                const msg = getApiErrorMessage(response, 'Failed to fetch pending leaves');
                console.error('Failed to fetch pending leaves:', msg);
                showToast({ type: 'error', text1: 'Could not load pending requests', text2: msg });
                setPendingLeaves([]);
                setTabError('pending', msg);
            }
        } catch (error) {
            console.error('Error fetching pending leaves:', error);
            if (id === seq.current.pending) {
                setPendingLeaves([]);
                setTabError('pending', error?.message || 'Please try again.');
            }
        }
    };

    const fetchHistoryLeaves = async () => {
        const id = ++seq.current.history;
        try {
            const filters = {
                status: historyStatusFilter || null,
                department: selectedDepartment || null,
                employee: selectedEmployee || null,
            };

            const response = await apiService.getAllLeaves(filters);
            if (id !== seq.current.history) {
                return;
            }

            if (isApiSuccess(response)) {
                const result = extractFrappeData(response, { applications: [] });
                // Filter history to exclude pending
                const applications = Array.isArray(result?.applications) ? result.applications : [];
                const history = applications.filter(
                    app => ['Approved', 'Rejected', 'Cancelled'].includes(app.status)
                );
                setHistoryLeaves(history);
                setTabError('history', '');
            } else {
                const msg = getApiErrorMessage(response, 'Failed to fetch leave history');
                console.error('Failed to fetch leave history:', msg);
                showToast({ type: 'error', text1: 'Could not load leave history', text2: msg });
                setHistoryLeaves([]);
                setTabError('history', msg);
            }
        } catch (error) {
            console.error('Error fetching leave history:', error);
            if (id === seq.current.history) {
                setHistoryLeaves([]);
                setTabError('history', error?.message || 'Please try again.');
            }
        }
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        try {
            if (activeTab === 'pending') {
                await fetchPendingLeaves();
            } else if (activeTab === 'history') {
                await fetchHistoryLeaves();
            } else if (activeTab === 'statistics') {
                await fetchStatistics();
            }
        } catch (error) {
            console.error('Error refreshing:', error);
        } finally {
            setRefreshing(false);
        }
        // The fetch functions read exactly the filter state listed here.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, selectedDepartment, selectedEmployee, historyStatusFilter]);

    const fetchStatistics = async () => {
        const id = ++seq.current.statistics;
        try {
            const response = await apiService.getLeaveStatistics(selectedDepartment || null);
            if (id !== seq.current.statistics) {
                return;
            }
            if (isApiSuccess(response)) {
                const data = extractFrappeData(response, null);
                setStatistics(data && typeof data === 'object' ? data : null);
                setTabError('statistics', '');
            } else {
                setStatistics(null);
                setTabError('statistics', getApiErrorMessage(response, 'Please try again.'));
            }
        } catch (error) {
            console.error('Error fetching statistics:', error);
            if (id === seq.current.statistics) {
                setStatistics(null);
                setTabError('statistics', error?.message || 'Please try again.');
            }
        }
    };

    useEffect(() => {
        let fetcher = null;
        if (activeTab === 'pending') {
            fetcher = fetchPendingLeaves;
        } else if (activeTab === 'history') {
            fetcher = fetchHistoryLeaves;
        } else if (activeTab === 'statistics') {
            fetcher = fetchStatistics;
        }
        if (fetcher) {
            setTabLoading(true);
            fetcher().finally(() => setTabLoading(false));
        }
        // Refetch when the tab or a filter changes; the fetch functions read exactly this state.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, selectedDepartment, selectedEmployee, historyStatusFilter]);

    const openActionModal = (leave, action) => {
        setSelectedLeave(leave);
        setActionType(action);
        setRemarks('');
        setRejectionReason('');
        setShowActionModal(true);
    };

    // The sheet stays open (button spinner) while the request runs, so a failure can be retried
    // and the list is never replaced by a spinner; it closes on success.
    const handleApprove = async () => {
        if (!selectedLeave || actingRef.current) {
            return;
        }

        actingRef.current = true;
        setActing(true);

        try {
            const response = await apiService.approveLeave(
                selectedLeave.name,
                remarks.trim()
            );

            if (response.success) {
                showToast({ type: 'success', text1: 'Leave approved', text2: selectedLeave.employee_name });
                setShowActionModal(false);
                setRemarks('');
                await fetchPendingLeaves();
            } else {
                showToast({ type: 'error', text1: 'Not approved', text2: response.message || 'Failed to approve leave' });
            }
        } catch (error) {
            console.error('Error approving leave:', error);
            showToast({ type: 'error', text1: 'Not approved', text2: error.message || 'Failed to approve leave' });
        } finally {
            actingRef.current = false;
            setActing(false);
        }
    };

    const handleReject = async () => {
        if (!selectedLeave || actingRef.current) {
            return;
        }

        if (!rejectionReason.trim()) {
            showToast({ type: 'error', text1: 'Enter a reason for rejecting' });
            return;
        }

        actingRef.current = true;
        setActing(true);

        try {
            const response = await apiService.rejectLeave(
                selectedLeave.name,
                rejectionReason.trim()
            );

            if (response.success) {
                showToast({ type: 'success', text1: 'Leave rejected', text2: selectedLeave.employee_name });
                setShowActionModal(false);
                setRejectionReason('');
                await fetchPendingLeaves();
            } else {
                showToast({ type: 'error', text1: 'Not rejected', text2: response.message || 'Failed to reject leave' });
            }
        } catch (error) {
            console.error('Error rejecting leave:', error);
            showToast({ type: 'error', text1: 'Not rejected', text2: error.message || 'Failed to reject leave' });
        } finally {
            actingRef.current = false;
            setActing(false);
        }
    };

    // ===== ADMIN APPLY LEAVE METHODS =====

    const loadLeaveTypesForEmployee = async (employeeId) => {
        if (!employeeId) {
            setLeaveTypes([]);
            setApplyLeaveType('');
            return;
        }

        try {
            const response = await apiService.getLeaveTypes(employeeId);
            if (response.success && response.data?.message) {
                const types = Array.isArray(response.data.message) ? response.data.message : [];
                setLeaveTypes(types);
                // Keep the chosen type only if this employee has it; otherwise pick
                // their first type (a previous employee's type may not apply here).
                setApplyLeaveType(current => (types.includes(current) ? current : (types[0] || '')));
            } else {
                setLeaveTypes([]);
            }
        } catch (error) {
            console.error('Error loading leave types:', error);
            setLeaveTypes([]);
        }
    };

    const loadLeaveBalancesForEmployee = async (employeeId) => {
        if (!employeeId) {
            setLeaveBalances({});
            return;
        }

        try {
            const response = await apiService.getLeaveBalances(employeeId);
            if (response.success && response.data?.message) {
                setLeaveBalances(response.data.message || {});
            } else {
                setLeaveBalances({});
            }
        } catch (error) {
            console.error('Error loading leave balances:', error);
            setLeaveBalances({});
        }
    };

    // Watch for employee selection changes to load their leave types
    useEffect(() => {
        if (applyForEmployee) {
            loadLeaveTypesForEmployee(applyForEmployee);
            loadLeaveBalancesForEmployee(applyForEmployee);
        } else {
            setLeaveTypes([]);
            setLeaveBalances({});
            setApplyLeaveType('');
        }
    }, [applyForEmployee]);

    // Keep the half-day date inside the chosen range; the server rejects it otherwise.
    useEffect(() => {
        const clamped = clampToDateRange(applyHalfDayDate, applyFromDate, applyToDate);
        if (clamped !== applyHalfDayDate) {
            setApplyHalfDayDate(clamped);
        }
    }, [applyHalfDayDate, applyFromDate, applyToDate]);

    const handleAdminSubmitLeave = async () => {
        // Validation
        if (!applyForEmployee) {
            showToast({ type: 'error', text1: 'Select an employee' });
            return;
        }

        if (!applyLeaveType) {
            showToast({ type: 'error', text1: 'Select a leave type' });
            return;
        }

        if (formatLocalDate(applyFromDate) > formatLocalDate(applyToDate)) {
            showToast({ type: 'error', text1: 'The start date is after the end date' });
            return;
        }

        if (!applyReason.trim()) {
            showToast({ type: 'error', text1: 'Enter a reason for the leave' });
            return;
        }

        // Check balance if available
        const balance = leaveBalances[applyLeaveType];
        if (balance && balance.balance_leaves !== undefined) {
            // calendar days (the two dates carry different times of day), less half a day for a half day
            const requestedDays = daysBetween(applyFromDate, applyToDate) - (applyIsHalfDay ? 0.5 : 0);
            if (balance.balance_leaves < requestedDays && !applyAutoApprove) {
                // Confirmed in the low-balance sheet, which calls submitAdminLeave on "Submit anyway".
                setLowBalance({ remaining: balance.balance_leaves, requestedDays });
                return;
            }
        }

        submitAdminLeave();
    };

    const submitAdminLeave = async () => {
        if (submittingRef.current) {
            return;
        }
        submittingRef.current = true;
        setSubmitting(true);
        try {
            const leaveData = {
                employee: applyForEmployee,
                leave_type: applyLeaveType,
                from_date: formatLocalDate(applyFromDate),
                to_date: formatLocalDate(applyToDate),
                half_day: applyIsHalfDay ? 1 : 0,
                half_day_date: applyIsHalfDay ? formatLocalDate(applyHalfDayDate) : null,
                description: applyReason.trim(),
                auto_approve: applyAutoApprove ? 1 : 0
            };

            const response = await apiService.adminSubmitLeave(leaveData);

            if (response.success && response.data?.message) {
                const rawResult = response.data.message;
                const result = rawResult?.data?.message || rawResult;
                const selectedEmployeeName = employees.find(e => e.name === applyForEmployee)?.employee_name || applyForEmployee;
                const days = result?.total_leave_days ?? 'N/A';
                const remainingBalance = result?.leave_balance ?? '';

                showToast({
                    type: 'success',
                    text1: `Leave submitted for ${selectedEmployeeName}`,
                    text2: [
                        formatDays(days),
                        applyAutoApprove ? 'approved' : 'awaiting approval',
                        remainingBalance !== '' ? `${formatDays(remainingBalance) || remainingBalance} left` : null,
                    ].filter(Boolean).join(', '),
                });

                // Reset form (previously done from the success alert's OK button)
                setApplyReason('');
                setApplyIsHalfDay(false);
                setApplyFromDate(new Date());
                setApplyToDate(new Date());
                // Refresh data
                loadLeaveBalancesForEmployee(applyForEmployee);
                fetchPendingLeaves();
                // Switch to pending tab
                setActiveTab('pending');
            } else {
                showToast({ type: 'error', text1: 'Leave not submitted', text2: response.message || 'Failed to submit leave application' });
            }
        } catch (error) {
            console.error('Error submitting leave:', error);
            showToast({ type: 'error', text1: 'Leave not submitted', text2: error.message || 'Failed to submit leave application' });
        } finally {
            submittingRef.current = false;
            setSubmitting(false);
        }
    };

    // ===== PRESENTATION HELPERS =====

    const busy = loading && !refreshing;
    const filtersActive = Boolean(selectedDepartment || selectedEmployee || historyStatusFilter);
    const canAct = activeTab === 'pending';

    const employeeName = (id) => employees.find((e) => e.name === id)?.employee_name || id;
    const departmentName = (id) => {
        const dept = departments.find((d) => d.name === id);
        return dept ? dept.department_name || dept.name : id;
    };

    const clearFilters = () => {
        setSelectedDepartment('');
        setSelectedEmployee('');
        setHistoryStatusFilter('');
    };

    const openPicker = (which) => {
        setPickerQuery('');
        setPicker(which);
    };

    const buildPicker = (which) => {
        const employeeOptions = employees.map((emp) => ({
            value: emp.name,
            label: emp.employee_name || emp.name,
            subtitle: [emp.name, shortDept(emp.department)].filter(Boolean).join('  ·  '),
        }));
        switch (which) {
            case 'department':
                return {
                    title: 'Department',
                    value: selectedDepartment,
                    onSelect: setSelectedDepartment,
                    searchable: departments.length > 10,
                    options: [
                        { value: '', label: 'All departments' },
                        ...departments.map((dept) => ({ value: dept.name, label: dept.department_name || dept.name })),
                    ],
                };
            case 'employee':
                return {
                    title: 'Employee',
                    value: selectedEmployee,
                    onSelect: setSelectedEmployee,
                    searchable: true,
                    options: [{ value: '', label: 'All employees' }, ...employeeOptions],
                };
            case 'status':
                return { title: 'Status', value: historyStatusFilter, onSelect: setHistoryStatusFilter, options: STATUS_OPTIONS };
            case 'applyEmployee':
                return { title: 'Employee', value: applyForEmployee, onSelect: setApplyForEmployee, searchable: true, options: employeeOptions };
            case 'leaveType':
                return {
                    title: 'Leave type',
                    value: applyLeaveType,
                    onSelect: setApplyLeaveType,
                    options: leaveTypes.map((t) => ({
                        value: t,
                        label: t,
                        detail: leaveBalances[t] ? `${leaveBalances[t].balance_leaves || 0} left` : undefined,
                    })),
                };
            default:
                return null;
        }
    };
    const pickerConfig = picker ? buildPicker(picker) : null;

    const renderBalanceCard = () => {
        if (!applyLeaveType || !leaveBalances[applyLeaveType]) {
            return null;
        }

        const balance = leaveBalances[applyLeaveType];
        return (
            <Field label={`${applyLeaveType} balance`}>
                <StatStrip
                    items={[
                        { label: 'Allocated', value: round2(balance.allocated_leaves) },
                        { label: 'Remaining', value: round2(balance.balance_leaves) },
                        { label: 'Used', value: round2((Number(balance.allocated_leaves) || 0) - (Number(balance.balance_leaves) || 0)) },
                    ]}
                />
            </Field>
        );
    };

    const renderToolbar = () => (
        <View style={styles.toolbar}>
            <Segmented
                value={activeTab}
                onChange={setActiveTab}
                style={styles.segmented}
                options={[
                    { value: 'pending', label: 'Pending', count: pendingLeaves.length },
                    { value: 'history', label: 'History' },
                    { value: 'statistics', label: 'Summary' },
                ]}
            />
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.filters}
            >
                <FilterChip
                    label={selectedDepartment ? departmentName(selectedDepartment) : 'Department'}
                    active={Boolean(selectedDepartment)}
                    onPress={() => openPicker('department')}
                />
                {activeTab !== 'statistics' ? (
                    <FilterChip
                        label={selectedEmployee ? employeeName(selectedEmployee) : 'Employee'}
                        active={Boolean(selectedEmployee)}
                        onPress={() => openPicker('employee')}
                    />
                ) : null}
                {activeTab === 'history' ? (
                    <FilterChip
                        label={historyStatusFilter || 'Status'}
                        active={Boolean(historyStatusFilter)}
                        onPress={() => openPicker('status')}
                    />
                ) : null}
                {filtersActive ? (
                    <Pressable onPress={clearFilters} hitSlop={8} style={styles.clear}>
                        <Text style={styles.clearText}>Clear</Text>
                    </Pressable>
                ) : null}
            </ScrollView>
        </View>
    );

    const renderLeaveRow = (leave) => (
        <Row
            key={leave.name}
            left={<Avatar name={leave.employee_name} />}
            title={leave.employee_name}
            subtitle={`${[leave.leave_type, leaveDays(leave)].filter(Boolean).join('  ·  ')}\n${dateRange(leave.from_date, leave.to_date)}`}
            subtitleLines={3}
            right={activeTab === 'history' ? <StatusText label={leave.status} /> : null}
            onPress={() => openActionModal(leave, '')}
        />
    );

    const renderPendingTab = () => (
        <Screen
            refreshing={refreshing}
            onRefresh={onRefresh}
            footer={<Button title="Apply leave on behalf" onPress={() => setActiveTab('apply')} />}
        >
            {pendingLeaves.length === 0 && tabLoading && !refreshing ? (
                <Loading />
            ) : pendingLeaves.length === 0 && errors.pending ? (
                <EmptyState icon="alert-circle" title="Could not load requests" message={errors.pending} action="Try again" onAction={onRefresh} />
            ) : pendingLeaves.length === 0 ? (
                <EmptyState
                    icon="check-circle"
                    title="No pending requests"
                    message={filtersActive ? 'Nothing matches these filters.' : 'New leave requests will appear here.'}
                />
            ) : (
                <Group>{pendingLeaves.map(renderLeaveRow)}</Group>
            )}
        </Screen>
    );

    const renderHistoryTab = () => (
        <Screen refreshing={refreshing} onRefresh={onRefresh}>
            {historyLeaves.length === 0 && tabLoading && !refreshing ? (
                <Loading />
            ) : historyLeaves.length === 0 && errors.history ? (
                <EmptyState icon="alert-circle" title="Could not load leave history" message={errors.history} action="Try again" onAction={onRefresh} />
            ) : historyLeaves.length === 0 ? (
                <EmptyState
                    icon="clock"
                    title="No leave history"
                    message={filtersActive ? 'Nothing matches these filters.' : 'Approved, rejected and cancelled leaves will appear here.'}
                />
            ) : (
                <Group>{historyLeaves.map(renderLeaveRow)}</Group>
            )}
        </Screen>
    );

    const renderBreakdown = (title, counts, labelOf = (label) => label) => {
        if (!counts || Object.keys(counts).length === 0) {
            return null;
        }
        return (
            <Group title={title}>
                {Object.entries(counts).map(([label, count]) => (
                    <Row key={label} title={labelOf(label)} value={String(count)} />
                ))}
            </Group>
        );
    };

    const renderStatisticsTab = () => (
        <Screen refreshing={refreshing} onRefresh={onRefresh}>
            {!statistics && tabLoading && !refreshing ? (
                <Loading />
            ) : !statistics ? (
                <EmptyState
                    icon="bar-chart-2"
                    title={errors.statistics ? 'Could not load the summary' : 'No summary available'}
                    message={errors.statistics || undefined}
                    action="Try again"
                    onAction={onRefresh}
                />
            ) : (
                <>
                    <StatStrip
                        style={styles.strip}
                        items={[
                            { label: 'Applications', value: statistics.total_applications ?? 0 },
                            { label: 'Leave days', value: statistics.total_days || 0 },
                        ]}
                    />
                    {renderBreakdown('By status', statistics.by_status)}
                    {renderBreakdown('By leave type', statistics.by_leave_type)}
                    {renderBreakdown('By department', statistics.by_department, shortDept)}
                </>
            )}
        </Screen>
    );

    // ===== RENDER APPLY LEAVE FORM =====
    const renderApplyLeaveTab = () => (
        <>
            <View style={styles.formBar}>
                <Text style={styles.formTitle}>Apply leave on behalf</Text>
                <IconButton name="x" label="Close" onPress={() => setActiveTab('pending')} />
            </View>
            <Screen
                footer={(
                    <Button
                        title={applyAutoApprove ? 'Submit and approve' : 'Submit for approval'}
                        onPress={handleAdminSubmitLeave}
                        loading={submitting}
                        disabled={!applyForEmployee || !applyLeaveType}
                    />
                )}
            >
                <SelectField
                    label="Employee"
                    value={applyForEmployee ? employeeName(applyForEmployee) : ''}
                    placeholder="Select employee"
                    onPress={() => openPicker('applyEmployee')}
                />
                <SelectField
                    label="Leave type"
                    value={applyLeaveType}
                    placeholder={leaveTypes.length > 0 ? 'Select leave type' : 'Select an employee first'}
                    disabled={leaveTypes.length === 0}
                    onPress={() => openPicker('leaveType')}
                />

                {renderBalanceCard()}

                <View style={styles.dates}>
                    <SelectField
                        label="From"
                        icon="calendar"
                        value={formatShortDate(applyFromDate)}
                        onPress={() => setShowApplyFromDatePicker(true)}
                        style={styles.dateField}
                    />
                    <SelectField
                        label="To"
                        icon="calendar"
                        value={formatShortDate(applyToDate)}
                        onPress={() => setShowApplyToDatePicker(true)}
                        style={styles.dateField}
                    />
                </View>
                {showApplyFromDatePicker && (
                    <DateTimePicker
                        value={applyFromDate}
                        mode="date"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        onChange={(event, date) => {
                            setShowApplyFromDatePicker(Platform.OS === 'ios');
                            if (date) {
                                setApplyFromDate(date);
                                if (date > applyToDate) {
                                    setApplyToDate(date);
                                }
                            }
                        }}
                    />
                )}
                {showApplyToDatePicker && (
                    <DateTimePicker
                        value={applyToDate}
                        mode="date"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        minimumDate={applyFromDate}
                        onChange={(event, date) => {
                            setShowApplyToDatePicker(Platform.OS === 'ios');
                            if (date) {
                                setApplyToDate(date);
                            }
                        }}
                    />
                )}

                <Group>
                    <Row
                        title="Half day"
                        right={<FormSwitch value={applyIsHalfDay} onValueChange={setApplyIsHalfDay} />}
                    />
                    {applyIsHalfDay ? (
                        <Row
                            title="Half day on"
                            value={formatShortDate(applyHalfDayDate)}
                            onPress={() => setShowApplyHalfDayPicker(true)}
                        />
                    ) : null}
                </Group>
                {applyIsHalfDay && showApplyHalfDayPicker && (
                    <DateTimePicker
                        value={applyHalfDayDate}
                        mode="date"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        minimumDate={applyFromDate}
                        maximumDate={applyToDate}
                        onChange={(event, date) => {
                            setShowApplyHalfDayPicker(Platform.OS === 'ios');
                            if (date) {
                                setApplyHalfDayDate(date);
                            }
                        }}
                    />
                )}

                <TextField
                    label="Reason"
                    placeholder="Reason for leave"
                    value={applyReason}
                    onChangeText={setApplyReason}
                    multiline
                    numberOfLines={4}
                />

                <Group>
                    <Row
                        title="Approve immediately"
                        right={<FormSwitch value={applyAutoApprove} onValueChange={setApplyAutoApprove} />}
                    />
                </Group>
            </Screen>
        </>
    );

    const renderLeaveDetails = (leave) => (
        <InfoList>
            {!canAct ? <InfoRow label="Status" value={<StatusText label={leave.status} size={15} />} /> : null}
            <InfoRow label="Dates" value={dateRange(leave.from_date, leave.to_date)} />
            <InfoRow label="Days" value={leaveDays(leave) || '–'} />
            {leave.half_day && leave.half_day_date ? <InfoRow label="Half day" value={dayLabel(leave.half_day_date)} /> : null}
            {formatDays(leave.leave_balance) ? <InfoRow label="Balance before leave" value={formatDays(leave.leave_balance)} /> : null}
            <InfoRow label="Reason" value={leave.description || 'No reason given'} muted={!leave.description} stacked />
            {leave.department ? <InfoRow label="Department" value={shortDept(leave.department)} /> : null}
            {leave.leave_approver_name ? <InfoRow label="Approver" value={leave.leave_approver_name} /> : null}
            <InfoRow label="Applied" value={shortDay(leave.creation)} />
            <InfoRow label="Employee ID" value={leave.employee} />
        </InfoList>
    );

    const renderActionSheetFooter = () => {
        if (actionType === 'approve') {
            return (
                <>
                    <Button title="Back" variant="secondary" onPress={() => setActionType('')} disabled={acting} style={styles.flex} />
                    <Button title="Approve" onPress={handleApprove} loading={acting} style={styles.flex} />
                </>
            );
        }
        if (actionType === 'reject') {
            return (
                <>
                    <Button title="Back" variant="secondary" onPress={() => setActionType('')} disabled={acting} style={styles.flex} />
                    <Button title="Reject" variant="dangerSolid" onPress={handleReject} loading={acting} disabled={!rejectionReason.trim()} style={styles.flex} />
                </>
            );
        }
        if (canAct) {
            return (
                <>
                    <Button title="Reject" variant="danger" onPress={() => setActionType('reject')} style={styles.flex} />
                    <Button title="Approve" onPress={() => setActionType('approve')} style={styles.flex} />
                </>
            );
        }
        return <Button title="Close" variant="secondary" onPress={() => setShowActionModal(false)} style={styles.flex} />;
    };

    const renderActionModal = () => (
        <Sheet
            visible={showActionModal && Boolean(selectedLeave)}
            title={actionType === 'approve' ? 'Approve leave' : actionType === 'reject' ? 'Reject leave' : selectedLeave?.employee_name}
            subtitle={actionType
                ? [selectedLeave?.employee_name, selectedLeave?.leave_type].filter(Boolean).join('  ·  ')
                : selectedLeave?.leave_type}
            onClose={() => !acting && setShowActionModal(false)}
            dismissable={!acting}
            footer={renderActionSheetFooter()}
        >
            {selectedLeave ? (
                actionType ? (
                    <>
                        <InfoList>
                            <InfoRow label="Dates" value={dateRange(selectedLeave.from_date, selectedLeave.to_date)} />
                            <InfoRow label="Days" value={leaveDays(selectedLeave) || '–'} />
                        </InfoList>
                        {actionType === 'approve' ? (
                            <TextField
                                label="Remarks"
                                placeholder="Optional"
                                hint="Included in the employee's notification."
                                value={remarks}
                                onChangeText={setRemarks}
                                editable={!acting}
                                multiline
                                numberOfLines={3}
                                style={styles.actionField}
                            />
                        ) : (
                            <TextField
                                label="Reason for rejecting"
                                placeholder="Required"
                                hint="Included in the employee's notification."
                                value={rejectionReason}
                                onChangeText={setRejectionReason}
                                editable={!acting}
                                multiline
                                numberOfLines={3}
                                style={styles.actionField}
                            />
                        )}
                    </>
                ) : (
                    renderLeaveDetails(selectedLeave)
                )
            ) : null}
        </Sheet>
    );

    const renderBody = () => {
        if (activeTab === 'apply') {
            return renderApplyLeaveTab();
        }
        if (busy) {
            return <Loading />;
        }
        if (activeTab === 'history') {
            return renderHistoryTab();
        }
        if (activeTab === 'statistics') {
            return renderStatisticsTab();
        }
        return renderPendingTab();
    };

    return (
        <View style={styles.container}>
            {/* The standalone "Apply My Leave" button was removed — it was a
                duplicate of the dashboard's My Self-Service → Apply Leave
                entry (both navigated to MyLeaveApplication). This screen
                stays focused on managing OTHER employees' leaves; admin self
                service lives in one place (AdminDashboard → My Self-Service). */}

            {activeTab !== 'apply' ? renderToolbar() : null}
            {renderBody()}

            {renderActionModal()}

            <PickerSheet
                config={pickerConfig}
                query={pickerQuery}
                onQuery={setPickerQuery}
                onSelect={(value) => {
                    pickerConfig?.onSelect(value);
                    setPicker(null);
                }}
                onClose={() => setPicker(null)}
            />

            <Sheet
                visible={Boolean(lowBalance)}
                title="Low leave balance"
                onClose={() => setLowBalance(null)}
                footer={(
                    <>
                        <Button title="Cancel" variant="secondary" onPress={() => setLowBalance(null)} style={styles.flex} />
                        <Button
                            title="Submit anyway"
                            onPress={() => {
                                setLowBalance(null);
                                submitAdminLeave();
                            }}
                            style={styles.flex}
                        />
                    </>
                )}
            >
                {lowBalance ? (
                    <Text style={styles.sheetText}>
                        {`${employeeName(applyForEmployee)} has ${formatDays(lowBalance.remaining) || lowBalance.remaining} of ${applyLeaveType} left. This request is for ${formatDays(lowBalance.requestedDays)}.`}
                    </Text>
                ) : null}
            </Sheet>
        </View>
    );
};

// ------------------------------------------------------------------ local building blocks

const FilterChip = ({ label, active, onPress }) => (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && styles.chipPressed]}>
        <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>{label}</Text>
        <Icon name="chevron-down" size={14} color={active ? color.accent : color.textSecondary} />
    </Pressable>
);

const FormSwitch = ({ value, onValueChange }) => (
    <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: '#D0D5DD', true: color.accent }}
        thumbColor={color.surface}
        ios_backgroundColor="#D0D5DD"
    />
);

// label / value pairs separated by hairlines (detail sheets)
const InfoList = ({ children }) => {
    const items = React.Children.toArray(children).filter(Boolean);
    return (
        <View style={styles.infoList}>
            {items.map((child, i) => (
                <React.Fragment key={child.key ?? i}>
                    {i > 0 ? <View style={styles.infoDivider} /> : null}
                    {child}
                </React.Fragment>
            ))}
        </View>
    );
};

const InfoRow = ({ label, value, stacked, muted }) => (
    <View style={[styles.info, stacked && styles.infoStacked]}>
        <Text style={styles.infoLabel}>{label}</Text>
        {typeof value === 'string' || typeof value === 'number' ? (
            <Text style={[styles.infoValue, stacked && styles.infoValueStacked, muted && styles.infoMuted]}>{value}</Text>
        ) : (
            value
        )}
    </View>
);

// Bottom sheet listing options as rows; the selected one has a check mark.
const PickerSheet = ({ config, query, onQuery, onSelect, onClose }) => {
    const options = config?.options || [];
    const q = query.trim().toLowerCase();
    const shown = q ? options.filter((o) => `${o.label} ${o.subtitle || ''}`.toLowerCase().includes(q)) : options;
    return (
        <Sheet visible={Boolean(config)} title={config?.title} onClose={onClose}>
            {config?.searchable ? (
                <SearchField value={query} onChangeText={onQuery} placeholder="Search" style={styles.sheetSearch} />
            ) : null}
            {shown.length === 0 ? (
                <EmptyState icon="search" title="No matches" />
            ) : (
                <Group>
                    {shown.map((o) => (
                        <Row
                            key={o.value || 'all'}
                            title={o.label}
                            titleLines={2}
                            subtitle={o.subtitle}
                            value={o.detail}
                            chevron={false}
                            onPress={() => onSelect(o.value)}
                            right={(
                                <View style={styles.check}>
                                    {o.value === config.value ? <Icon name="check" size={18} color={color.accent} /> : null}
                                </View>
                            )}
                        />
                    ))}
                </Group>
            )}
        </Sheet>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: color.bg },
    flex: { flex: 1 },

    toolbar: {
        backgroundColor: color.surface,
        paddingTop: space.md,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: color.border,
    },
    segmented: { marginHorizontal: space.lg },
    filters: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.md },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        minHeight: 32,
        paddingVertical: 4,
        maxWidth: 200,
        paddingHorizontal: 10,
        borderRadius: 8,
        backgroundColor: color.neutralSoft,
    },
    chipActive: { backgroundColor: color.accentSoft },
    chipPressed: { opacity: 0.7 },
    chipText: { fontSize: 13, fontWeight: '500', color: color.textSecondary, flexShrink: 1 },
    chipTextActive: { color: color.accent },
    clear: { minHeight: 32, justifyContent: 'center', paddingHorizontal: space.xs },
    clearText: { fontSize: 13, fontWeight: '600', color: color.accent },

    formBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: color.surface,
        paddingLeft: space.lg,
        paddingRight: space.sm,
        paddingVertical: space.xs,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: color.border,
    },
    formTitle: { ...type.title, flex: 1 },
    // side by side from 360 dp; stacked on a 320 dp phone, where two dates would be cut off at large text
    dates: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.md },
    dateField: { flexGrow: 1, flexBasis: 140 },
    strip: { marginBottom: space.xl },

    infoList: { marginBottom: space.sm },
    info: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.lg, paddingVertical: 11 },
    infoStacked: { flexDirection: 'column', alignItems: 'stretch', gap: 4 },
    infoDivider: { height: StyleSheet.hairlineWidth, backgroundColor: color.divider },
    infoLabel: { ...type.secondary, lineHeight: 21, flexShrink: 1, maxWidth: '45%' },
    infoValue: { ...type.body, flex: 1, textAlign: 'right', lineHeight: 21 },
    infoValueStacked: { flex: 0, textAlign: 'left' },
    infoMuted: { color: color.textTertiary },
    actionField: { marginTop: space.md },

    sheetText: { ...type.body, lineHeight: 22, marginBottom: space.sm },
    sheetSearch: { marginBottom: space.md },
    check: { width: 24, alignItems: 'flex-end' },
});

export default LeaveApprovalsScreen;
