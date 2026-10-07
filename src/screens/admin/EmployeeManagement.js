// src/screens/admin/EmployeeManagement.js
//
// Employee directory for admins: search and filter employees, open a profile, edit it,
// manage profile edit access (grant / revoke, approve or reject an employee's request)
// and jump to the employee's leave, attendance, WFH, on-site, expense and travel records.
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Pressable,
    Modal,
    Alert,
    Image,
    SafeAreaView,
    StatusBar,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import Toast from 'react-native-toast-message';
import ApiService, { getApiErrorMessage } from '../../services/api.service';
import showToast from '../../utils/Toast';
import { toastConfig } from '../../config/toastConfig';
import {
    Screen,
    Group,
    Row,
    Avatar,
    StatusText,
    Tag,
    StatStrip,
    SearchField,
    Sheet,
    Button,
    IconButton,
    TextField,
    EmptyState,
    Loading,
    Notice,
    Icon,
    formatShortDate,
    color,
    space,
    radius,
    type,
    ModalTopInset,
    KeyboardSafeView,
} from '../../components/ds';

const STATUS_OPTIONS = ['All', 'Active', 'Inactive', 'Suspended', 'Left'];
const STATUS_TONE = { Active: 'success', Inactive: 'neutral', Suspended: 'warning', Left: 'danger' };

// Deep links to the employee's records (admin-on-behalf views). Each closes the profile first
// so the destination screen is visible.
const RECORD_LINKS = [
    { route: 'LeaveApprovals', title: 'Leave history', icon: 'calendar', params: { tab: 'history' } },
    { route: 'AllAttendanceAnalyticsScreen', title: 'Attendance', icon: 'clock', params: {} },
    { route: 'WFHApprovals', title: 'Work from home history', icon: 'home', params: { tab: 'history' } },
    { route: 'OnSiteApprovals', title: 'On-site history', icon: 'map-pin', params: { tab: 'history' } },
    { route: 'ExpenseClaimApproval', title: 'Expense claims', icon: 'credit-card', params: { tab: 'history' } },
    { route: 'TravelRequestApproval', title: 'Travel requests', icon: 'globe', params: { tab: 'history' } },
];

// 'Engineering - DG' -> 'Engineering' (display only; filters use the full name)
const shortDept = (dept) => String(dept || '').replace(/ - [A-Z0-9]+$/, '');

// 'YYYY-MM-DD' -> '12 Oct 2026' (local date, no timezone shift); other values pass through
const displayDate = (value) => {
    const [y, m, d] = String(value || '').slice(0, 10).split('-').map(Number);
    return y && m && d ? formatShortDate(new Date(y, m - 1, d)) : value || null;
};

const roleOf = (emp) => [emp?.designation, shortDept(emp?.department)].filter(Boolean).join('  ·  ');

const EmployeeManagement = ({ navigation }) => {
    const [employees, setEmployees] = useState([]);
    const [filteredEmployees, setFilteredEmployees] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedStatus, setSelectedStatus] = useState('Active');
    const [selectedDepartment, setSelectedDepartment] = useState('All');
    const [statistics, setStatistics] = useState({});
    const [filterOptions, setFilterOptions] = useState({ departments: [], companies: [] });
    // Message of the last failed employee load (shown when there is no list to fall back on)
    const [loadError, setLoadError] = useState(null);

    // Modals and sheets
    const [detailsModalVisible, setDetailsModalVisible] = useState(false);
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [departmentSheetVisible, setDepartmentSheetVisible] = useState(false);
    const [statusSheetVisible, setStatusSheetVisible] = useState(false);
    const [selectedRequest, setSelectedRequest] = useState(null);

    // Selected employee
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const [employeeDetails, setEmployeeDetails] = useState(null);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [detailsError, setDetailsError] = useState(null);
    // Only the newest profile request may update the page (an older, slower one is ignored)
    const detailsRequestId = useRef(0);

    // Edit form
    const [editForm, setEditForm] = useState({});
    const [savingEdit, setSavingEdit] = useState(false);
    const savingRef = useRef(false);
    // Save errors are shown inside the edit page (toasts render behind full-screen modals)
    const [saveError, setSaveError] = useState(null);

    // Pending requests (listed inline on the main screen; their loading flag is no longer
    // rendered because pull-to-refresh shows its own indicator)
    const [pendingRequests, setPendingRequests] = useState([]);
    const [, setLoadingRequests] = useState(false);

    // Edit-access action in progress: 'grant' | 'revoke' | 'reject'. The ref blocks a second
    // tap that lands before the buttons re-render as disabled.
    const [permissionAction, setPermissionAction] = useState(null);
    const permissionBusy = useRef(false);

    useEffect(() => {
        fetchEmployees();
        fetchPendingRequests();
    }, []);

    const filterEmployees = useCallback(() => {
        let filtered = [...employees];

        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(emp =>
                emp.name?.toLowerCase().includes(query) ||
                emp.employee_name?.toLowerCase().includes(query) ||
                emp.cell_number?.includes(query) ||
                emp.company_email?.toLowerCase().includes(query)
            );
        }

        if (selectedStatus !== 'All') {
            filtered = filtered.filter(emp => emp.status === selectedStatus);
        }

        if (selectedDepartment !== 'All') {
            filtered = filtered.filter(emp => emp.department === selectedDepartment);
        }

        setFilteredEmployees(filtered);
    }, [searchQuery, selectedStatus, selectedDepartment, employees]);

    useEffect(() => {
        filterEmployees();
    }, [filterEmployees]);

    const fetchEmployees = async () => {
        try {
            setLoading(true);
            const response = await ApiService.get('/api/method/hrms.api.get_all_employees');

            if (response.success && response.data?.message) {
                const message = response.data.message;

                // Handle both formats: direct array or wrapped object
                if (Array.isArray(message)) {
                    // Direct array format
                    setEmployees(message);
                    // Calculate statistics from the data
                    const stats = {
                        total: message.length,
                        active: message.filter(e => e.status === 'Active').length,
                        inactive: message.filter(e => e.status !== 'Active').length,
                        with_edit_permission: message.filter(e => e.has_edit_permission).length,
                    };
                    setStatistics(stats);
                    // Extract unique departments
                    const depts = [...new Set(message.map(e => e.department).filter(Boolean))];
                    setFilterOptions({ departments: depts, companies: [] });
                    setLoadError(null);
                } else if (message.status === 'success') {
                    // Wrapped object format
                    setEmployees(message.employees || []);
                    setStatistics(message.statistics || {});
                    setFilterOptions(message.filters || { departments: [], companies: [] });
                    setLoadError(null);
                } else {
                    console.error('Unexpected message format:', message);
                    setLoadError('The server sent an unexpected response.');
                }
            } else {
                // keep the list already on screen; the toast (and the empty state when there is
                // no list yet) carry the server's message
                const reason = getApiErrorMessage(response, 'Please try again');
                setLoadError(reason);
                showToast({ type: 'error', text1: 'Could not load employees', text2: reason });
            }
        } catch (error) {
            console.error('Error fetching employees:', error);
            setLoadError('Please try again');
            showToast({ type: 'error', text1: 'Could not load employees', text2: 'Please try again' });
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const fetchPendingRequests = async () => {
        try {
            setLoadingRequests(true);
            const response = await ApiService.get('/api/method/hrms.api.get_pending_edit_requests');

            if (response.success && response.data?.message) {
                const message = response.data.message;
                if (message.status === 'success') {
                    setPendingRequests(message.requests || []);
                }
            }
        } catch (error) {
            console.error('Error fetching pending requests:', error);
        } finally {
            setLoadingRequests(false);
        }
    };

    // `quiet` reloads the profile that is already open (after an edit-access change) without
    // blanking the page or jumping it back to the top; a failure then keeps what is shown.
    const fetchEmployeeDetails = async (employeeId, { quiet = false } = {}) => {
        const requestId = ++detailsRequestId.current;
        const isCurrent = () => requestId === detailsRequestId.current;
        if (!quiet) {
            // drop the previous employee's profile first, so a failed load can never be edited and
            // saved onto this employee
            setEmployeeDetails(null);
            setEditForm({});
            setDetailsError(null);
            setLoadingDetails(true);
        }
        let failure = null;
        try {
            const response = await ApiService.get(`/api/method/hrms.api.get_employee_details?employee=${employeeId}`);
            if (!isCurrent()) {
                return;
            }

            if (response.success && response.data?.message) {
                const message = response.data.message;
                // Handle both formats
                if (message.status === 'success' && message.data) {
                    setEmployeeDetails(message.data);
                    setEditForm(message.data);
                } else if (message.name) {
                    // Direct employee object
                    setEmployeeDetails(message);
                    setEditForm(message);
                } else {
                    console.error('Invalid employee details format:', message);
                    failure = 'The server sent an unexpected response.';
                }
            } else {
                console.error('Employee details response not success:', response);
                failure = getApiErrorMessage(response, 'Check your connection and try again.');
            }
        } catch (error) {
            console.error('Error fetching employee details:', error);
            failure = 'Check your connection and try again.';
        } finally {
            if (isCurrent()) {
                setLoadingDetails(false);
                if (failure) {
                    if (quiet) {
                        showToast({ type: 'error', text1: 'Could not refresh employee details', text2: failure });
                    } else {
                        setDetailsError(failure);
                    }
                }
            }
        }
    };

    const handleViewDetails = (employee) => {
        setSelectedEmployee(employee);
        fetchEmployeeDetails(employee.name);
        setDetailsModalVisible(true);
    };

    const handleEditEmployee = () => {
        setEditForm({ ...employeeDetails });
        setSaveError(null);
        setDetailsModalVisible(false);
        setEditModalVisible(true);
    };

    const handleSaveEdit = async () => {
        if (savingRef.current) {
            return;
        }
        if (!employeeDetails || employeeDetails.name !== selectedEmployee?.name) {
            setSaveError('This profile did not load correctly. Close it and open the employee again.');
            return;
        }
        savingRef.current = true;
        try {
            setSavingEdit(true);
            setSaveError(null);
            const response = await ApiService.post('/api/method/hrms.api.admin_update_employee', {
                employee: selectedEmployee.name,
                updates: JSON.stringify(editForm),
            });

            if (response.success && response.data?.message?.status === 'success') {
                showToast({ type: 'success', text1: 'Profile updated', text2: editForm.employee_name || selectedEmployee.employee_name });
                setEditModalVisible(false);
                fetchEmployees();
            } else {
                setSaveError(getApiErrorMessage(response, 'Failed to update employee'));
            }
        } catch (error) {
            console.error('Error updating employee:', error);
            setSaveError('Failed to update employee profile');
        } finally {
            savingRef.current = false;
            setSavingEdit(false);
        }
    };

    // ---------------------------------------------------------------- edit access
    // Each returns true when the server accepted the change, false otherwise (also when another
    // edit-access action is still running).
    const startPermissionAction = (action) => {
        if (permissionBusy.current) {
            return false;
        }
        permissionBusy.current = true;
        setPermissionAction(action);
        return true;
    };

    const endPermissionAction = () => {
        permissionBusy.current = false;
        setPermissionAction(null);
    };

    const grantPermission = async (employeeId, employeeName) => {
        if (!startPermissionAction('grant')) {
            return false;
        }
        try {
            const response = await ApiService.post('/api/method/hrms.api.grant_edit_permission', {
                employee: employeeId,
                remarks: 'Granted via mobile app',
            });

            if (response.success && response.data?.message?.status === 'success') {
                showToast({ type: 'success', text1: 'Edit access granted', text2: employeeName });
                fetchEmployees();
                fetchPendingRequests();
                if (detailsModalVisible) {
                    fetchEmployeeDetails(employeeId, { quiet: true });
                }
                return true;
            }
            showToast({ type: 'error', text1: 'Access not granted', text2: getApiErrorMessage(response, 'Failed to grant permission') });
        } catch (error) {
            console.error('Error granting permission:', error);
            showToast({ type: 'error', text1: 'Access not granted', text2: 'Failed to grant permission' });
        } finally {
            endPermissionAction();
        }
        return false;
    };

    const revokePermission = async (employeeId, employeeName) => {
        if (!startPermissionAction('revoke')) {
            return false;
        }
        try {
            const response = await ApiService.post('/api/method/hrms.api.revoke_edit_permission', {
                employee: employeeId,
                remarks: 'Revoked via mobile app',
            });

            if (response.success && response.data?.message?.status === 'success') {
                showToast({ type: 'success', text1: 'Edit access revoked', text2: employeeName });
                fetchEmployees();
                if (detailsModalVisible) {
                    fetchEmployeeDetails(employeeId, { quiet: true });
                }
                return true;
            }
            showToast({ type: 'error', text1: 'Access not revoked', text2: getApiErrorMessage(response, 'Failed to revoke permission') });
        } catch (error) {
            console.error('Error revoking permission:', error);
            showToast({ type: 'error', text1: 'Access not revoked', text2: 'Failed to revoke permission' });
        } finally {
            endPermissionAction();
        }
        return false;
    };

    const rejectRequest = async (employeeId, employeeName) => {
        if (!startPermissionAction('reject')) {
            return false;
        }
        try {
            const response = await ApiService.post('/api/method/hrms.api.reject_edit_request', {
                employee: employeeId,
                reason: 'Request reviewed and rejected',
            });

            if (response.success && response.data?.message?.status === 'success') {
                showToast({ type: 'success', text1: 'Request rejected', text2: employeeName });
                fetchPendingRequests();
                // the list rows ("Edit requested") and the open profile show the request too
                fetchEmployees();
                if (detailsModalVisible) {
                    fetchEmployeeDetails(employeeId, { quiet: true });
                }
                return true;
            }
            showToast({ type: 'error', text1: 'Request not rejected', text2: getApiErrorMessage(response, 'Failed to reject request') });
        } catch (error) {
            console.error('Error rejecting request:', error);
            showToast({ type: 'error', text1: 'Request not rejected', text2: 'Failed to reject request' });
        } finally {
            endPermissionAction();
        }
        return false;
    };

    // Granting is not destructive: the button (or the request sheet) is the confirmation.
    const handleGrantPermission = (employeeId, employeeName) => grantPermission(employeeId, employeeName);

    const handleRevokePermission = (employeeId, employeeName) => {
        Alert.alert(
            'Revoke edit access',
            `${employeeName} will no longer be able to edit their profile.`,
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Revoke', style: 'destructive', onPress: () => revokePermission(employeeId, employeeName) },
            ]
        );
    };

    const handleRejectRequest = (employeeId, employeeName) => {
        Alert.alert(
            'Reject edit request',
            `Reject the request from ${employeeName}?`,
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Reject', style: 'destructive', onPress: () => rejectRequest(employeeId, employeeName) },
            ]
        );
    };

    // Request sheet: the sheet is the confirmation, so these act directly.
    const approveSelectedRequest = async () => {
        if (await grantPermission(selectedRequest.employee, selectedRequest.employee_name)) {
            setSelectedRequest(null);
        }
    };

    const rejectSelectedRequest = async () => {
        if (await rejectRequest(selectedRequest.employee, selectedRequest.employee_name)) {
            setSelectedRequest(null);
        }
    };

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchEmployees();
        fetchPendingRequests();
    }, []);

    const clearFilters = () => {
        setSearchQuery('');
        setSelectedStatus('Active');
        setSelectedDepartment('All');
    };

    // Short department name, or the full one when two departments share the short name
    const departmentLabel = (dept) => {
        const short = shortDept(dept);
        const clash = (filterOptions.departments || []).some((d) => d !== dept && shortDept(d) === short);
        return clash ? dept : short;
    };

    const openRecord = (link) => {
        if (!employeeDetails) {
            return;
        }
        setDetailsModalVisible(false);
        navigation.navigate(link.route, {
            preselectEmployee: employeeDetails.name,
            ...link.params,
        });
    };

    // ---------------------------------------------------------------- list
    const renderEmployeeRow = (item) => {
        // a non-active status sits with the tags under the text, so long names keep the row width
        const tags = [
            item.status && item.status !== 'Active' && <StatusText key="status" label={item.status} tone={STATUS_TONE[item.status]} />,
            item.has_edit_permission && <Tag key="edit" label="Can edit profile" />,
            item.has_pending_request && <Tag key="request" label="Edit requested" tone="warning" />,
        ].filter(Boolean);
        return (
            <Row
                key={item.name}
                left={<PhotoAvatar name={item.employee_name || item.name} image={item.image} />}
                title={item.employee_name || item.name}
                subtitle={roleOf(item) || item.name}
                meta={tags.length ? tags : null}
                onPress={() => handleViewDetails(item)}
            />
        );
    };

    const renderList = () => {
        if (loading && employees.length === 0) {
            return <Loading />;
        }

        const isFiltered = filteredEmployees.length !== employees.length;
        const countLabel = isFiltered
            ? `${filteredEmployees.length} of ${employees.length} employees`
            : `${employees.length} ${employees.length === 1 ? 'employee' : 'employees'}`;

        return (
            <Screen refreshing={refreshing} onRefresh={onRefresh}>
                <StatStrip
                    style={styles.stats}
                    items={[
                        { label: 'Total', value: statistics.total || 0 },
                        { label: 'Active', value: statistics.active || 0 },
                        { label: 'Inactive', value: statistics.inactive || 0 },
                        { label: 'Can edit', value: statistics.with_edit_permission || 0 },
                    ]}
                />

                {pendingRequests.length > 0 ? (
                    <Group title="Profile edit requests">
                        {pendingRequests.map((req) => (
                            <Row
                                key={req.employee}
                                left={<Avatar name={req.employee_name || req.employee} />}
                                title={req.employee_name || req.employee}
                                subtitle={req.reason || 'No reason given'}
                                meta={displayDate(req.requested_on) ? (
                                    <Text style={styles.metaText} numberOfLines={1}>{`Requested ${displayDate(req.requested_on)}`}</Text>
                                ) : null}
                                onPress={() => setSelectedRequest(req)}
                            />
                        ))}
                    </Group>
                ) : null}

                {employees.length === 0 && loadError ? (
                    <EmptyState
                        icon="alert-circle"
                        title="Could not load employees"
                        message={loadError}
                        action="Try again"
                        onAction={fetchEmployees}
                    />
                ) : employees.length === 0 ? (
                    <EmptyState icon="users" title="No employees" message="Pull down to refresh." />
                ) : filteredEmployees.length === 0 ? (
                    <EmptyState
                        icon="search"
                        title="No matches"
                        message={searchQuery ? `No one matches “${searchQuery}”.` : 'No one with this status or department.'}
                        action="Clear filters"
                        onAction={clearFilters}
                    />
                ) : (
                    <Group title={countLabel}>
                        {filteredEmployees.map(renderEmployeeRow)}
                    </Group>
                )}
            </Screen>
        );
    };

    // ---------------------------------------------------------------- profile
    const renderPermissionGroup = (details) => {
        const busy = Boolean(permissionAction);
        let state;
        let actions;
        if (details.has_edit_permission) {
            state = <StatusText label="Allowed" tone="success" />;
            actions = (
                <Button
                    title="Revoke access"
                    variant="danger"
                    onPress={() => handleRevokePermission(details.name, details.employee_name)}
                    loading={permissionAction === 'revoke'}
                    disabled={busy}
                    style={styles.flex}
                />
            );
        } else if (details.has_pending_request) {
            state = <StatusText label="Requested" tone="warning" />;
            actions = (
                <>
                    <Button
                        title="Reject"
                        variant="danger"
                        onPress={() => handleRejectRequest(details.name, details.employee_name)}
                        loading={permissionAction === 'reject'}
                        disabled={busy}
                        style={styles.flex}
                    />
                    <Button
                        title="Approve"
                        onPress={() => handleGrantPermission(details.name, details.employee_name)}
                        loading={permissionAction === 'grant'}
                        disabled={busy}
                        style={styles.flex}
                    />
                </>
            );
        } else {
            state = <StatusText label="Not allowed" tone="neutral" />;
            actions = (
                <Button
                    title="Grant edit access"
                    variant="secondary"
                    onPress={() => handleGrantPermission(details.name, details.employee_name)}
                    loading={permissionAction === 'grant'}
                    disabled={busy}
                    style={styles.flex}
                />
            );
        }

        const request = details.edit_request_details;
        return (
            <Group title="Profile editing">
                <InfoRow label="Edit access" value={state} />
                {!details.has_edit_permission && details.has_pending_request ? (
                    <InfoRow label="Reason" value={request?.reason || 'No reason given'} stacked />
                ) : null}
                {!details.has_edit_permission && details.has_pending_request && request?.requested_on ? (
                    <InfoRow label="Requested on" value={displayDate(request.requested_on)} />
                ) : null}
                <View style={styles.groupActions}>{actions}</View>
            </Group>
        );
    };

    const renderProfile = (d) => (
        <>
            <View style={styles.profile}>
                <View style={styles.profileAvatar}>
                    <PhotoAvatar key={d.name} name={d.employee_name} image={d.image} size={64} />
                </View>
                <Text style={styles.profileName}>{d.employee_name || d.name}</Text>
                {roleOf(d) ? <Text style={styles.profileRole}>{roleOf(d)}</Text> : null}
                <View style={styles.profileMeta}>
                    <Text style={styles.profileId} selectable>{d.name}</Text>
                    {d.status ? <StatusText label={d.status} tone={STATUS_TONE[d.status]} /> : null}
                </View>
            </View>

            <Group title="Records">
                {RECORD_LINKS.map((link) => (
                    <Row key={link.route} icon={link.icon} title={link.title} onPress={() => openRecord(link)} />
                ))}
            </Group>

            {renderPermissionGroup(d)}

            <Group title="Basic information">
                <InfoRow label="First name" value={d.first_name} />
                <InfoRow label="Middle name" value={d.middle_name} />
                <InfoRow label="Last name" value={d.last_name} />
                <InfoRow label="Gender" value={d.gender} />
                <InfoRow label="Date of birth" value={displayDate(d.date_of_birth)} />
                <InfoRow label="Blood group" value={d.blood_group} />
                <InfoRow label="Marital status" value={d.marital_status} />
            </Group>

            <Group title="Contact">
                <InfoRow label="Phone" value={d.cell_number} />
                <InfoRow label="Company email" value={d.company_email} />
                <InfoRow label="Personal email" value={d.personal_email} />
            </Group>

            <Group title="Employment">
                <InfoRow label="Company" value={d.company} />
                <InfoRow label="Department" value={d.department} />
                <InfoRow label="Designation" value={d.designation} />
                <InfoRow label="Branch" value={d.branch} />
                <InfoRow label="Reports to" value={d.reports_to_name || d.reports_to} />
                <InfoRow label="Date of joining" value={displayDate(d.date_of_joining)} />
                <InfoRow label="Status" value={d.status ? <StatusText label={d.status} tone={STATUS_TONE[d.status]} /> : null} />
            </Group>

            <Group title="Address">
                <InfoRow label="Current address" value={d.current_address} stacked />
                <InfoRow label="Permanent address" value={d.permanent_address} stacked />
            </Group>

            <Group title="Emergency contact">
                <InfoRow label="Contact person" value={d.person_to_be_contacted} />
                <InfoRow label="Phone" value={d.emergency_phone_number} />
                <InfoRow label="Relation" value={d.relation} />
            </Group>

            <Group title="Bank details">
                <InfoRow label="Bank name" value={d.bank_name} />
                <InfoRow label="Account number" value={d.bank_ac_no ? '••••' + String(d.bank_ac_no).slice(-4) : null} />
                <InfoRow label="IBAN" value={d.iban} />
                <InfoRow label="Salary mode" value={d.salary_mode} />
            </Group>
        </>
    );

    const renderDetailsModal = () => (
        <Modal
            visible={detailsModalVisible}
            animationType="slide"
            statusBarTranslucent
            onRequestClose={() => setDetailsModalVisible(false)}
        >
            <SafeAreaView style={styles.page}>
                <ModalTopInset />
                <PageHeader
                    title="Employee"
                    onClose={() => setDetailsModalVisible(false)}
                    actionLabel="Edit"
                    onAction={handleEditEmployee}
                    actionDisabled={loadingDetails || !employeeDetails}
                />
                {loadingDetails ? (
                    <View style={styles.pageBody}>
                        <Loading />
                    </View>
                ) : employeeDetails ? (
                    <Screen>{renderProfile(employeeDetails)}</Screen>
                ) : (
                    <View style={styles.pageBody}>
                        <EmptyState
                            icon="alert-circle"
                            title="Could not load details"
                            message={detailsError || 'Check your connection and try again.'}
                            action="Try again"
                            onAction={() => selectedEmployee && fetchEmployeeDetails(selectedEmployee.name)}
                        />
                    </View>
                )}
            </SafeAreaView>
            {/* Second toast host so feedback shows above this full-screen page */}
            <Toast config={toastConfig} />
        </Modal>
    );

    // ---------------------------------------------------------------- edit
    const renderEditModal = () => (
        <Modal
            visible={editModalVisible}
            animationType="slide"
            statusBarTranslucent
            onRequestClose={() => setEditModalVisible(false)}
        >
            <SafeAreaView style={styles.page}>
                <ModalTopInset />
                <PageHeader title="Edit employee" onClose={() => setEditModalVisible(false)} />
                <KeyboardSafeView>
                <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                    <Screen
                        footer={(
                            <>
                                {saveError ? (
                                    <Notice tone="danger" icon="alert-circle" title="Not saved" style={styles.saveError}>
                                        {saveError}
                                    </Notice>
                                ) : null}
                                <Button title="Save changes" onPress={handleSaveEdit} loading={savingEdit} full />
                            </>
                        )}
                    >
                        <FormSection title="Basic information">
                            <EditField label="First name" field="first_name" value={editForm.first_name} onChange={setEditForm} />
                            <EditField label="Middle name" field="middle_name" value={editForm.middle_name} onChange={setEditForm} />
                            <EditField label="Last name" field="last_name" value={editForm.last_name} onChange={setEditForm} />
                            <EditField label="Gender" field="gender" value={editForm.gender} onChange={setEditForm} />
                            <EditField label="Date of birth" field="date_of_birth" value={editForm.date_of_birth} onChange={setEditForm} placeholder="YYYY-MM-DD" />
                            <EditField label="Marital status" field="marital_status" value={editForm.marital_status} onChange={setEditForm} />
                            <EditField label="Blood group" field="blood_group" value={editForm.blood_group} onChange={setEditForm} />
                        </FormSection>

                        <FormSection title="Contact">
                            <EditField label="Phone" field="cell_number" value={editForm.cell_number} onChange={setEditForm} keyboardType="phone-pad" />
                            <EditField label="Company email" field="company_email" value={editForm.company_email} onChange={setEditForm} keyboardType="email-address" />
                            <EditField label="Personal email" field="personal_email" value={editForm.personal_email} onChange={setEditForm} keyboardType="email-address" />
                        </FormSection>

                        <FormSection title="Employment">
                            <EditField label="Department" field="department" value={editForm.department} onChange={setEditForm} />
                            <EditField label="Designation" field="designation" value={editForm.designation} onChange={setEditForm} />
                            <EditField label="Branch" field="branch" value={editForm.branch} onChange={setEditForm} />
                            <EditField label="Status" field="status" value={editForm.status} onChange={setEditForm} />
                            <EditField label="Date of joining" field="date_of_joining" value={editForm.date_of_joining} onChange={setEditForm} placeholder="YYYY-MM-DD" />
                        </FormSection>

                        <FormSection title="Address">
                            <EditField label="Current address" field="current_address" value={editForm.current_address} onChange={setEditForm} multiline />
                            <EditField label="Permanent address" field="permanent_address" value={editForm.permanent_address} onChange={setEditForm} multiline />
                        </FormSection>

                        <FormSection title="Emergency contact">
                            <EditField label="Contact person" field="person_to_be_contacted" value={editForm.person_to_be_contacted} onChange={setEditForm} />
                            <EditField label="Emergency phone" field="emergency_phone_number" value={editForm.emergency_phone_number} onChange={setEditForm} keyboardType="phone-pad" />
                            <EditField label="Relation" field="relation" value={editForm.relation} onChange={setEditForm} />
                        </FormSection>

                        <FormSection title="Bank details">
                            <EditField label="Bank name" field="bank_name" value={editForm.bank_name} onChange={setEditForm} />
                            <EditField label="Account number" field="bank_ac_no" value={editForm.bank_ac_no} onChange={setEditForm} />
                            <EditField label="IBAN" field="iban" value={editForm.iban} onChange={setEditForm} />
                            <EditField label="Salary mode" field="salary_mode" value={editForm.salary_mode} onChange={setEditForm} />
                        </FormSection>
                    </Screen>
                </KeyboardAvoidingView>
                </KeyboardSafeView>
            </SafeAreaView>
        </Modal>
    );

    // ---------------------------------------------------------------- sheets
    const renderRequestSheet = () => {
        const busy = Boolean(permissionAction);
        return (
            <Sheet
                visible={Boolean(selectedRequest)}
                title={selectedRequest?.employee_name || selectedRequest?.employee}
                subtitle="Profile edit request"
                onClose={() => !busy && setSelectedRequest(null)}
                dismissable={!busy}
                footer={(
                    <>
                        <Button
                            title="Reject"
                            variant="danger"
                            onPress={rejectSelectedRequest}
                            loading={permissionAction === 'reject'}
                            disabled={busy}
                            style={styles.flex}
                        />
                        <Button
                            title="Approve"
                            onPress={approveSelectedRequest}
                            loading={permissionAction === 'grant'}
                            disabled={busy}
                            style={styles.flex}
                        />
                    </>
                )}
            >
                {selectedRequest ? (
                    <>
                        <SheetDetail label="Reason" value={selectedRequest.reason || 'No reason given'} />
                        <SheetDetail label="Requested on" value={displayDate(selectedRequest.requested_on) || '—'} />
                        <SheetDetail label="Employee ID" value={selectedRequest.employee} />
                        {roleOf(selectedRequest) ? <SheetDetail label="Role" value={roleOf(selectedRequest)} /> : null}
                    </>
                ) : null}
            </Sheet>
        );
    };

    const renderDepartmentSheet = () => (
        <Sheet
            visible={departmentSheetVisible}
            title="Department"
            onClose={() => setDepartmentSheetVisible(false)}
        >
            <Group>
                {['All', ...(filterOptions.departments || [])].map((dept) => (
                    <Row
                        key={dept}
                        title={dept === 'All' ? 'All departments' : departmentLabel(dept)}
                        titleLines={2}
                        selected={selectedDepartment === dept}
                        right={selectedDepartment === dept ? <Icon name="check" size={18} color={color.accent} /> : null}
                        chevron={false}
                        onPress={() => {
                            setSelectedDepartment(dept);
                            setDepartmentSheetVisible(false);
                        }}
                    />
                ))}
            </Group>
        </Sheet>
    );

    // Status filter: a sheet instead of a five-way segmented control, which cannot fit
    // "Suspended" and "Inactive" on a 320 dp phone
    const renderStatusSheet = () => (
        <Sheet
            visible={statusSheetVisible}
            title="Status"
            onClose={() => setStatusSheetVisible(false)}
        >
            <Group>
                {STATUS_OPTIONS.map((status) => {
                    const count = status === 'All' ? employees.length : employees.filter((e) => e.status === status).length;
                    return (
                        <Row
                            key={status}
                            title={status === 'All' ? 'All statuses' : status}
                            value={employees.length ? count : undefined}
                            selected={selectedStatus === status}
                            right={selectedStatus === status ? <Icon name="check" size={18} color={color.accent} /> : null}
                            chevron={false}
                            onPress={() => {
                                setSelectedStatus(status);
                                setStatusSheetVisible(false);
                            }}
                        />
                    );
                })}
            </Group>
        </Sheet>
    );

    const departmentActive = selectedDepartment !== 'All';
    const statusActive = selectedStatus !== 'Active';

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor={color.surface} />

            <View style={styles.toolbar}>
                <SearchField
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder="Search employees"
                />
                <View style={styles.filters}>
                    <FilterChip
                        label={selectedStatus === 'All' ? 'All statuses' : selectedStatus}
                        active={statusActive}
                        onPress={() => setStatusSheetVisible(true)}
                        accessibilityLabel="Filter by status"
                    />
                    <FilterChip
                        label={departmentActive ? departmentLabel(selectedDepartment) : 'All departments'}
                        active={departmentActive}
                        onPress={() => setDepartmentSheetVisible(true)}
                        accessibilityLabel="Filter by department"
                    />
                    {statusActive || departmentActive ? (
                        <Pressable onPress={clearFilters} hitSlop={8} style={styles.clear}>
                            <Text style={styles.link}>Clear</Text>
                        </Pressable>
                    ) : null}
                </View>
            </View>

            {renderList()}

            {renderDetailsModal()}
            {renderEditModal()}
            {renderRequestSheet()}
            {renderDepartmentSheet()}
            {renderStatusSheet()}
        </View>
    );
};

// Filter button in the toolbar: current choice + chevron; accent when it narrows the list.
const FilterChip = ({ label, active, onPress, accessibilityLabel }) => (
    <Pressable
        onPress={onPress}
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && styles.pressed]}
    >
        <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>{label}</Text>
        <Icon name="chevron-down" size={14} color={active ? color.accent : color.textSecondary} />
    </Pressable>
);

// ------------------------------------------------------------------ local building blocks

// Employee photo when there is one, initials otherwise (also when the photo fails to load).
const PhotoAvatar = ({ name, image, size = 36 }) => {
    const [failed, setFailed] = useState(false);
    if (!image || failed) {
        return <Avatar name={name} size={size} />;
    }
    const dimensions = { width: size, height: size, borderRadius: size / 2 };
    // the server returns site-relative paths such as /files/photo.jpg
    const uri = image.startsWith('/') ? `${ApiService.getBaseURL()}${image}` : image;
    return <Image source={{ uri }} onError={() => setFailed(true)} style={[styles.photo, dimensions]} />;
};

// Header bar for the full-screen profile and edit pages (matches the stack header).
const PageHeader = ({ title, onClose, actionLabel, onAction, actionDisabled }) => (
    <View style={styles.pageHeader}>
        <View style={styles.pageHeaderSide}>
            <IconButton name="x" onPress={onClose} color={color.text} size={22} label="Close" />
        </View>
        <Text style={styles.pageTitle} numberOfLines={1}>{title}</Text>
        <View style={[styles.pageHeaderSide, styles.pageHeaderRight]}>
            {actionLabel ? (
                <Pressable onPress={onAction} disabled={actionDisabled} hitSlop={8}>
                    <Text style={[styles.headerAction, actionDisabled && styles.disabled]}>{actionLabel}</Text>
                </Pressable>
            ) : null}
        </View>
    </View>
);

// Label / value row for the profile groups. `stacked` puts long values (addresses) under the label.
const InfoRow = ({ label, value, stacked }) => {
    const empty = value === null || value === undefined || value === '';
    let content;
    if (empty) {
        content = <Text style={[styles.infoValue, stacked && styles.infoValueStacked, styles.infoEmpty]}>—</Text>;
    } else if (typeof value === 'string' || typeof value === 'number') {
        content = <Text style={[styles.infoValue, stacked && styles.infoValueStacked]} selectable>{value}</Text>;
    } else {
        content = <View style={styles.infoNode}>{value}</View>;
    }
    return (
        <View style={[styles.info, stacked && styles.infoStacked]}>
            <Text style={[styles.infoLabel, stacked && styles.infoLabelStacked]}>{label}</Text>
            {content}
        </View>
    );
};

const SheetDetail = ({ label, value }) => (
    <View style={styles.sheetDetail}>
        <Text style={styles.sheetDetailLabel}>{label}</Text>
        <Text style={type.body}>{value}</Text>
    </View>
);

const FormSection = ({ title, children }) => (
    <View style={styles.formSection}>
        <Text style={styles.formSectionTitle}>{title}</Text>
        <View style={styles.formCard}>{children}</View>
    </View>
);

const EditField = ({ label, field, value, onChange, keyboardType = 'default', multiline = false, placeholder }) => (
    <TextField
        label={label}
        value={value === null || value === undefined ? '' : String(value)}
        onChangeText={(text) => onChange(prev => ({ ...prev, [field]: text }))}
        placeholder={placeholder}
        keyboardType={keyboardType}
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
    />
);

const styles = StyleSheet.create({
    flex: { flex: 1 },
    container: { flex: 1, backgroundColor: color.bg },
    pressed: { opacity: 0.7 },
    disabled: { opacity: 0.45 },

    // Toolbar
    toolbar: {
        backgroundColor: color.surface,
        paddingHorizontal: space.lg,
        paddingVertical: space.md,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: color.border,
    },
    filters: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        flexShrink: 1,
        gap: 4,
        minHeight: 32,
        paddingHorizontal: space.md,
        paddingVertical: 4,
        borderRadius: 16,
        backgroundColor: color.neutralSoft,
    },
    chipActive: { backgroundColor: color.accentSoft },
    chipText: { flexShrink: 1, fontSize: 13, fontWeight: '500', color: color.textSecondary },
    chipTextActive: { color: color.accent },
    clear: { marginLeft: 'auto', paddingLeft: space.sm },
    link: { fontSize: 13, fontWeight: '600', color: color.accent },

    // List
    stats: { marginBottom: space.xl },
    metaText: { ...type.caption, flexShrink: 1 },
    photo: { marginRight: space.md, backgroundColor: color.neutralSoft },

    // Full-screen pages
    page: { flex: 1, backgroundColor: color.surface },
    pageBody: { flex: 1, backgroundColor: color.bg },
    pageHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 56,
        paddingHorizontal: space.xs,
        backgroundColor: color.surface,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: color.border,
    },
    pageHeaderSide: { width: 72, alignItems: 'flex-start', justifyContent: 'center' },
    pageHeaderRight: { alignItems: 'flex-end', paddingRight: space.md },
    pageTitle: { ...type.title, flex: 1, textAlign: 'center' },
    headerAction: { fontSize: 15, fontWeight: '600', color: color.accent },

    // Profile header
    profile: { alignItems: 'center', paddingTop: space.sm, paddingBottom: space.xl },
    // Avatar carries a right margin for list rows; cancel it so the photo is centred
    profileAvatar: { marginRight: -space.md, marginBottom: space.md },
    profileName: { ...type.title, textAlign: 'center' },
    profileRole: { ...type.secondary, marginTop: 2, textAlign: 'center' },
    profileMeta: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: space.md, marginTop: space.sm },
    profileId: { ...type.secondary, color: color.textTertiary, fontVariant: ['tabular-nums'] },

    // Profile rows
    info: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        minHeight: 48,
        paddingHorizontal: space.lg,
        paddingVertical: 13,
        backgroundColor: color.surface,
    },
    infoStacked: { flexDirection: 'column', alignItems: 'stretch' },
    infoLabel: { ...type.body, flexShrink: 0, maxWidth: '45%', marginRight: space.lg },
    infoLabelStacked: { ...type.secondary, maxWidth: '100%', marginRight: 0, marginBottom: 2 },
    infoValue: { flex: 1, fontSize: 15, lineHeight: 20, color: color.textSecondary, textAlign: 'right' },
    infoValueStacked: { flex: 0, color: color.text, textAlign: 'left' },
    infoEmpty: { color: color.textTertiary },
    infoNode: { flex: 1, alignItems: 'flex-end', justifyContent: 'center', minHeight: 20 },
    groupActions: {
        flexDirection: 'row',
        gap: space.sm,
        paddingHorizontal: space.lg,
        paddingVertical: space.md,
        backgroundColor: color.surface,
    },

    // Request sheet
    sheetDetail: { marginBottom: space.lg },
    sheetDetailLabel: { ...type.caption, marginBottom: 4 },

    // Edit form
    saveError: { marginBottom: space.md },
    formSection: { marginBottom: space.xl },
    formSectionTitle: { ...type.label, marginBottom: space.sm, paddingHorizontal: space.xs },
    formCard: {
        backgroundColor: color.surface,
        borderRadius: radius.lg,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: color.border,
        paddingHorizontal: space.lg,
        paddingTop: space.lg,
    },
});

export default EmployeeManagement;
