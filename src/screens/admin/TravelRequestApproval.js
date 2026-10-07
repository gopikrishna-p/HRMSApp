// src/screens/admin/TravelRequestApproval.js
//
// Travel requests for admins: pending approvals, decided history, a summary of counts,
// and a form to create a request on behalf of an employee.
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Switch, ActivityIndicator, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import apiService from '../../services/api.service';
import { loadAllEmployees } from '../../utils/employeeData';
import { formatLocalDateTime } from '../../utils/dateFormat';
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
    Notice,
    StatusText,
    StatStrip,
    SearchField,
    Field,
    TextField,
    SelectField,
    Icon,
    color,
    space,
    type,
    formatShortDate,
} from '../../components/ds';

const TABS = [
    { value: 'pending', label: 'Pending' },
    { value: 'history', label: 'History' },
    { value: 'statistics', label: 'Summary' },
];
const HISTORY_FILTERS = [
    { value: 'all', label: 'All' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' },
];
const TRAVEL_TYPES = ['Domestic', 'International'];
const FUNDING_OPTIONS = [
    { value: 'Require Full Funding', label: 'Require full funding' },
    { value: 'Fully Sponsored', label: 'Fully sponsored' },
    { value: 'Partially Sponsored, Require Partial Funding', label: 'Partially sponsored' },
];
const MODE_OPTIONS = [
    { value: 'Flight', label: 'Flight' },
    { value: 'Train', label: 'Train' },
    { value: 'Taxi', label: 'Taxi' },
    { value: 'Rented Car', label: 'Rented car' },
];
const SWITCH_TRACK = { false: '#D0D5DD', true: color.accent };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// 'YYYY-MM-DD[ HH:MM:SS]' as a local date (no timezone shift)
const toDate = (value) => {
    const [y, m, d] = String(value || '').slice(0, 10).split('-').map(Number);
    return y ? new Date(y, m - 1, d) : null;
};
const dayLabel = (value, withYear = false) => {
    const d = toDate(value);
    if (!d) {
        return '';
    }
    return withYear ? formatShortDate(d) : `${d.getDate()} ${MONTHS[d.getMonth()]}`;
};
const tripDates = (from, to, withYear = false) => {
    const a = dayLabel(from);
    const b = dayLabel(to);
    if (!a || !b || a === b) {
        return dayLabel(from || to, withYear);
    }
    return `${a} – ${dayLabel(to, withYear)}`;
};
const routeLabel = (from, to) => (from && to ? `${from} → ${to}` : from || to || '');
const money = (value) => `₹${(Number(value) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const labelOf = (options, value) => options.find((o) => o.value === value)?.label || value;
const joinDot = (parts) => parts.filter(Boolean).join('  ·  ');

const TravelRequestApproval = ({ navigation, route }) => {
    // Main states
    const [activeTab, setActiveTab] = useState(route?.params?.tab || 'pending'); // pending, apply, history, statistics
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [requests, setRequests] = useState([]);
    const [statistics, setStatistics] = useState({});
    const [filterStatus, setFilterStatus] = useState('');
    // Phase 3.x deep-link from EmployeeManagement Quick Actions (B5).
    const [preselectFilter, setPreselectFilter] = useState(route?.params?.preselectEmployee || '');
    // History lists decided requests only; pending ones live in the Pending tab
    const displayedRequests = requests.filter((r) =>
        (!preselectFilter || r.employee === preselectFilter)
        && (activeTab !== 'history' || r.status_label !== 'Pending'));

    // Detail sheet states
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [showDetailsModal, setShowDetailsModal] = useState(false);

    // Action sheet states
    const [showActionModal, setShowActionModal] = useState(false);
    const [actionType, setActionType] = useState(null);
    const [actionReason, setActionReason] = useState('');

    // Presentation only: row being opened, error shown inside the sheet (toasts render
    // underneath an open Modal), and the option picker for the apply form.
    const [openingId, setOpeningId] = useState(null);
    const [sheetError, setSheetError] = useState('');
    const [picker, setPicker] = useState(null); // { kind, index? }
    const [pickerQuery, setPickerQuery] = useState('');

    // Apply tab states
    const [employees, setEmployees] = useState([]);
    const [purposes, setPurposes] = useState([]);
    const [applyEmployee, setApplyEmployee] = useState('');
    const [formData, setFormData] = useState({
        travel_type: 'Domestic',
        purpose_of_travel: '',
        description: '',
        travel_funding: '',
        details_of_sponsor: '',
        cell_number: '',
        prefered_email: '',
        personal_id_type: '',
        personal_id_number: '',
        passport_number: '',
        cost_center: '',
        name_of_organizer: '',
        address_of_organizer: '',
        other_details: '',
    });

    // Itinerary states
    const [itinerary, setItinerary] = useState([{
        travel_from: '',
        travel_to: '',
        mode_of_travel: '',
        departure_date: new Date(),
        arrival_date: new Date(),
        lodging_required: false,
        preferred_area_for_lodging: '',
    }]);
    const [showDeparturePicker, setShowDeparturePicker] = useState({ show: false, index: -1 });
    const [showArrivalPicker, setShowArrivalPicker] = useState({ show: false, index: -1 });

    // Costings states
    const [costings, setCostings] = useState([{
        expense_type: '',
        sponsored_amount: '',
        funded_amount: '',
        total_amount: '',
        comments: '',
    }]);
    const [expenseTypes, setExpenseTypes] = useState([]);

    const loadInitialData = useCallback(async () => {
        const loadEmployees = async () => {
            // Shared helper — see src/utils/employeeData.js.
            setEmployees(await loadAllEmployees());
        };

        const loadPurposes = async () => {
            try {
                const response = await apiService.getPurposeOfTravelList();
                if (response.success && response.data?.message?.data?.purposes) {
                    setPurposes(response.data.message.data.purposes);
                }
            } catch (error) {
                console.error('Load purposes error:', error);
            }
        };

        const loadExpenseTypes = async () => {
            try {
                const response = await apiService.getExpenseClaimTypes();
                if (response.success && response.data?.message) {
                    setExpenseTypes(response.data.message);
                }
            } catch (error) {
                console.error('Load expense types error:', error);
            }
        };

        await Promise.all([
            loadEmployees(),
            loadPurposes(),
            loadExpenseTypes(),
        ]);
    }, []);

    const loadRequests = useCallback(async () => {
        setLoading(true);
        try {
            const filters = { limit: 500 };

            if (activeTab === 'pending') {
                filters.status = 'pending';
            } else if (activeTab === 'history' && filterStatus) {
                filters.status = filterStatus;
            }

            const response = await apiService.getAdminTravelRequests(filters);

            if (response.success && response.data?.message) {
                const data = response.data.message;
                setRequests(data.requests || []);
                setStatistics(data.statistics || {});
            } else if (response.data?.requests) {
                setRequests(response.data.requests || []);
                setStatistics(response.data.statistics || {});
            } else {
                setRequests([]);
                setStatistics({});
            }
        } catch (error) {
            console.error('[Admin] Load requests error:', error);
            setRequests([]);
        } finally {
            setLoading(false);
        }
    }, [activeTab, filterStatus]);

    useEffect(() => {
        loadInitialData();
    }, [loadInitialData]);

    useEffect(() => {
        if (route?.params?.preselectEmployee) {
            setPreselectFilter(route.params.preselectEmployee);
        }
        if (route?.params?.tab) {
            setActiveTab(route.params.tab);
        }
    }, [route?.params?.preselectEmployee, route?.params?.tab]);

    useEffect(() => {
        if (activeTab === 'pending' || activeTab === 'history' || activeTab === 'statistics') {
            loadRequests();
        }
    }, [activeTab, filterStatus, loadRequests]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadRequests();
        setRefreshing(false);
    }, [loadRequests]);

    const handleViewDetails = async (request) => {
        try {
            setLoading(true);
            const response = await apiService.getTravelRequestDetails(request.name);

            if (response.success && response.data?.message?.data) {
                setSelectedRequest(response.data.message.data);
                setShowDetailsModal(true);
            } else {
                showToast({ type: 'error', text1: 'Could not load request details' });
            }
        } catch (error) {
            console.error('View details error:', error);
            showToast({ type: 'error', text1: 'Could not load request details', text2: error.message });
        } finally {
            setLoading(false);
        }
    };

    // Shows a spinner on the tapped row instead of replacing the list while details load.
    const openRequest = async (request) => {
        if (openingId) {
            return;
        }
        setOpeningId(request.name);
        await handleViewDetails(request);
        setOpeningId(null);
    };

    const handleAction = (actionKind) => {
        if (!selectedRequest) {
            return;
        }
        setActionType(actionKind);
        setActionReason('');
        setSheetError('');
        setShowDetailsModal(false);
        setShowActionModal(true);
    };

    const confirmAction = async () => {
        if (actionType === 'reject' && !actionReason.trim()) {
            setSheetError('Add a reason for rejecting this request');
            return;
        }

        setSheetError('');
        setLoading(true);
        try {
            let response;
            if (actionType === 'approve') {
                response = await apiService.approveTravelRequest(selectedRequest.request_id, actionReason);
            } else {
                response = await apiService.rejectTravelRequest(selectedRequest.request_id, actionReason);
            }

            if (response.success && response.data?.message?.status === 'success') {
                showToast({
                    type: 'success',
                    text1: actionType === 'approve' ? 'Request approved' : 'Request rejected',
                    text2: selectedRequest.employee_name,
                });
                setShowActionModal(false);
                setSelectedRequest(null);
                setActionReason('');
                loadRequests();
            } else {
                setSheetError(response.data?.message?.message || `Could not ${actionType} this request`);
            }
        } catch (error) {
            console.error('Action error:', error);
            setSheetError(`Could not ${actionType} this request. Check your connection and try again.`);
        } finally {
            setLoading(false);
        }
    };

    // Apply tab functions
    const addItineraryItem = () => {
        setItinerary([...itinerary, {
            travel_from: '',
            travel_to: '',
            mode_of_travel: '',
            departure_date: new Date(),
            arrival_date: new Date(),
            lodging_required: false,
            preferred_area_for_lodging: '',
        }]);
    };

    const removeItineraryItem = (index) => {
        if (itinerary.length > 1) {
            setItinerary(itinerary.filter((_, i) => i !== index));
        }
    };

    const updateItineraryItem = (index, field, value) => {
        const newItinerary = [...itinerary];
        newItinerary[index][field] = value;
        setItinerary(newItinerary);
    };

    const addCostingItem = () => {
        setCostings([...costings, {
            expense_type: '',
            sponsored_amount: '',
            funded_amount: '',
            total_amount: '',
            comments: '',
        }]);
    };

    const removeCostingItem = (index) => {
        if (costings.length > 1) {
            setCostings(costings.filter((_, i) => i !== index));
        }
    };

    const updateCostingItem = (index, field, value) => {
        const newCostings = [...costings];
        newCostings[index][field] = value;

        // Auto-calculate total
        if (field === 'sponsored_amount' || field === 'funded_amount') {
            const sponsored = parseFloat(newCostings[index].sponsored_amount) || 0;
            const funded = parseFloat(newCostings[index].funded_amount) || 0;
            newCostings[index].total_amount = (sponsored + funded).toString();
        }

        setCostings(newCostings);
    };

    const validateApplyForm = () => {
        if (!applyEmployee) {
            showToast({ type: 'error', text1: 'Select an employee' });
            return false;
        }
        if (!formData.travel_type) {
            showToast({ type: 'error', text1: 'Select a travel type' });
            return false;
        }
        if (!formData.purpose_of_travel) {
            showToast({ type: 'error', text1: 'Select the purpose of travel' });
            return false;
        }
        return true;
    };

    const handleApplySubmit = async () => {
        if (!validateApplyForm()) {
            return;
        }

        setLoading(true);
        try {
            // Prepare itinerary
            const itineraryData = itinerary.map(item => ({
                travel_from: item.travel_from,
                travel_to: item.travel_to,
                mode_of_travel: item.mode_of_travel,
                departure_date: formatLocalDateTime(item.departure_date),
                arrival_date: formatLocalDateTime(item.arrival_date),
                lodging_required: item.lodging_required ? 1 : 0,
                preferred_area_for_lodging: item.preferred_area_for_lodging,
            }));

            // Prepare costings
            const costingsData = costings.filter(c => c.expense_type).map(item => ({
                expense_type: item.expense_type,
                sponsored_amount: parseFloat(item.sponsored_amount) || 0,
                funded_amount: parseFloat(item.funded_amount) || 0,
                total_amount: parseFloat(item.total_amount) || 0,
                comments: item.comments,
            }));

            const travelData = {
                employee: applyEmployee,
                ...formData,
                itinerary: JSON.stringify(itineraryData),
                costings: JSON.stringify(costingsData),
            };

            const response = await apiService.submitTravelRequest(travelData);

            if (response.success && response.data?.message?.status === 'success') {
                showToast({
                    type: 'success',
                    text1: 'Travel request created',
                    text2: 'Request ID ' + response.data.message.request_id,
                });
                resetApplyForm();
                setActiveTab('pending'); // the tab effect reloads the pending list
            } else {
                showToast({
                    type: 'error',
                    text1: 'Request not created',
                    text2: response.data?.message?.message || 'Please try again',
                });
            }
        } catch (error) {
            console.error('Submit travel request error:', error);
            showToast({ type: 'error', text1: 'Request not created', text2: error.message });
        } finally {
            setLoading(false);
        }
    };

    const resetApplyForm = () => {
        setApplyEmployee('');
        setFormData({
            travel_type: 'Domestic',
            purpose_of_travel: '',
            description: '',
            travel_funding: '',
            details_of_sponsor: '',
            cell_number: '',
            prefered_email: '',
            personal_id_type: '',
            personal_id_number: '',
            passport_number: '',
            cost_center: '',
            name_of_organizer: '',
            address_of_organizer: '',
            other_details: '',
        });
        setItinerary([{
            travel_from: '',
            travel_to: '',
            mode_of_travel: '',
            departure_date: new Date(),
            arrival_date: new Date(),
            lodging_required: false,
            preferred_area_for_lodging: '',
        }]);
        setCostings([{
            expense_type: '',
            sponsored_amount: '',
            funded_amount: '',
            total_amount: '',
            comments: '',
        }]);
    };

    const calculateTotalCost = () => {
        return costings.reduce((sum, c) => sum + (parseFloat(c.total_amount) || 0), 0);
    };

    // ------------------------------------------------------------------ option picker (apply form)
    const openPicker = (kind, index) => {
        setPickerQuery('');
        setPicker({ kind, index });
    };

    const pickerConfig = (() => {
        switch (picker?.kind) {
            case 'employee':
                return {
                    title: 'Employee',
                    searchable: true,
                    value: applyEmployee,
                    options: employees.map((emp) => ({ value: emp.name, label: emp.employee_name, subtitle: emp.name, avatar: true })),
                    onSelect: (v) => setApplyEmployee(v),
                };
            case 'purpose':
                return {
                    title: 'Purpose of travel',
                    value: formData.purpose_of_travel,
                    options: purposes.map((p) => ({ value: p, label: p })),
                    onSelect: (v) => setFormData({ ...formData, purpose_of_travel: v }),
                };
            case 'funding':
                return {
                    title: 'Travel funding',
                    value: formData.travel_funding,
                    options: [{ value: '', label: 'Not specified' }, ...FUNDING_OPTIONS],
                    onSelect: (v) => setFormData({ ...formData, travel_funding: v }),
                };
            case 'mode':
                return {
                    title: 'Mode of travel',
                    value: itinerary[picker.index]?.mode_of_travel,
                    options: [{ value: '', label: 'Not specified' }, ...MODE_OPTIONS],
                    onSelect: (v) => updateItineraryItem(picker.index, 'mode_of_travel', v),
                };
            case 'expense':
                return {
                    title: 'Expense type',
                    value: costings[picker.index]?.expense_type,
                    options: [{ value: '', label: 'None' }, ...expenseTypes.map((t) => ({ value: t.name, label: t.name }))],
                    onSelect: (v) => updateCostingItem(picker.index, 'expense_type', v),
                };
            default:
                return null;
        }
    })();

    const pickerOptions = (() => {
        if (!pickerConfig) {
            return [];
        }
        const q = pickerQuery.trim().toLowerCase();
        if (!pickerConfig.searchable || !q) {
            return pickerConfig.options;
        }
        return pickerConfig.options.filter((o) => String(o.label || '').toLowerCase().includes(q)
            || String(o.subtitle || '').toLowerCase().includes(q));
    })();

    const selectOption = (value) => {
        pickerConfig?.onSelect(value);
        setPicker(null);
    };

    const selectedEmployee = employees.find((emp) => emp.name === applyEmployee);
    const employeeLabel = selectedEmployee
        ? joinDot([selectedEmployee.employee_name, selectedEmployee.name])
        : applyEmployee;

    // ------------------------------------------------------------------ render
    const listBusy = loading && !refreshing && !openingId && !showActionModal;

    const renderToolbar = () => {
        if (activeTab === 'apply') {
            return (
                <View style={[styles.toolbar, styles.toolbarRow]}>
                    <Text style={styles.formTitle}>New travel request</Text>
                    <Button title="Close" variant="ghost" size="sm" onPress={() => setActiveTab('pending')} />
                </View>
            );
        }
        return (
            <View style={styles.toolbar}>
                <View style={styles.toolbarRow}>
                    <Segmented value={activeTab} onChange={setActiveTab} options={TABS} style={styles.flex} />
                    <Button title="New request" size="sm" onPress={() => setActiveTab('apply')} style={styles.newButton} />
                </View>
                {activeTab === 'history' ? (
                    <Segmented
                        value={filterStatus || 'all'}
                        onChange={(v) => setFilterStatus(v === 'all' ? '' : v)}
                        options={HISTORY_FILTERS}
                        style={styles.subControl}
                    />
                ) : null}
                {preselectFilter && activeTab !== 'statistics' ? (
                    <Pressable style={styles.filterChip} onPress={() => setPreselectFilter('')} hitSlop={6}>
                        <Text style={styles.filterChipText}>Employee {preselectFilter}</Text>
                        <Icon name="x" size={14} color={color.textSecondary} />
                    </Pressable>
                ) : null}
            </View>
        );
    };

    const renderRequestRow = (request) => {
        const opening = openingId === request.name;
        const trip = joinDot([
            routeLabel(request.travel_from, request.travel_to),
            tripDates(request.departure_date, request.arrival_date),
        ]);
        const about = joinDot([request.purpose_of_travel, request.travel_type]);
        let right = null;
        if (opening) {
            right = <ActivityIndicator size="small" color={color.textTertiary} />;
        } else if (activeTab === 'history') {
            right = <StatusText label={request.status_label} />;
        }
        return (
            <Row
                key={request.name}
                left={<Avatar name={request.employee_name} />}
                title={request.employee_name}
                subtitle={[trip, about].filter(Boolean).join('\n')}
                value={activeTab === 'pending' && !opening ? dayLabel(request.creation) || undefined : undefined}
                right={right}
                chevron={!opening}
                onPress={() => openRequest(request)}
            />
        );
    };

    const renderList = () => {
        if (listBusy) {
            return <Loading />;
        }
        if (displayedRequests.length === 0) {
            if (activeTab === 'pending') {
                return <EmptyState icon="check-circle" title="No pending requests" message="New travel requests will appear here." />;
            }
            return (
                <EmptyState
                    icon="clock"
                    title={filterStatus ? `No ${filterStatus} requests` : 'No travel requests'}
                    message={preselectFilter ? `Nothing for employee ${preselectFilter}.` : 'Decided requests will appear here.'}
                />
            );
        }
        const n = displayedRequests.length;
        return (
            <Group title={`${n} ${n === 1 ? 'request' : 'requests'}`}>
                {displayedRequests.map(renderRequestRow)}
            </Group>
        );
    };

    const renderStatistics = () => {
        if (listBusy) {
            return <Loading />;
        }
        return (
            <>
                <StatStrip
                    style={styles.stats}
                    items={[
                        { label: 'Total', value: statistics.total_requests || 0 },
                        { label: 'Pending', value: statistics.pending || 0, tone: statistics.pending ? 'warning' : undefined },
                        { label: 'Approved', value: statistics.approved || 0 },
                        { label: 'Rejected', value: statistics.rejected || 0 },
                    ]}
                />
                {statistics.by_type ? (
                    <Group title="By travel type">
                        {Object.entries(statistics.by_type).map(([travelType, count]) => (
                            <Row key={travelType} title={travelType} value={String(count)} />
                        ))}
                    </Group>
                ) : null}
                {statistics.by_department && Object.keys(statistics.by_department).length > 0 ? (
                    <Group title="By department">
                        {Object.entries(statistics.by_department).map(([dept, count]) => (
                            <Row key={dept} title={dept.replace(' - DG', '')} value={String(count)} />
                        ))}
                    </Group>
                ) : null}
            </>
        );
    };

    const renderApplyForm = () => (
        <Screen
            footer={(
                <View style={styles.footerRow}>
                    <View style={styles.flex}>
                        <Text style={type.caption}>Estimated total</Text>
                        <Text style={styles.footerTotal}>{money(calculateTotalCost())}</Text>
                    </View>
                    <Button title="Submit request" onPress={handleApplySubmit} loading={loading} />
                </View>
            )}
        >
            <Group title="Request">
                <View style={styles.panel}>
                    <SelectField
                        label="Employee"
                        value={employeeLabel}
                        placeholder="Select employee"
                        onPress={() => openPicker('employee')}
                    />
                    <Field label="Travel type">
                        <Segmented
                            options={TRAVEL_TYPES}
                            value={formData.travel_type}
                            onChange={(value) => setFormData({ ...formData, travel_type: value })}
                        />
                    </Field>
                    <SelectField
                        label="Purpose"
                        value={formData.purpose_of_travel}
                        placeholder="Select purpose"
                        onPress={() => openPicker('purpose')}
                    />
                    <SelectField
                        label="Funding"
                        value={formData.travel_funding ? labelOf(FUNDING_OPTIONS, formData.travel_funding) : ''}
                        placeholder="Not specified"
                        onPress={() => openPicker('funding')}
                    />
                    <TextField
                        label="Description"
                        value={formData.description}
                        onChangeText={(text) => setFormData({ ...formData, description: text })}
                        placeholder="Optional"
                        multiline
                        numberOfLines={3}
                    />
                </View>
            </Group>

            {itinerary.map((item, index) => (
                <Group
                    key={index}
                    title={itinerary.length > 1 ? `Leg ${index + 1}` : 'Itinerary'}
                    action={itinerary.length > 1 ? 'Remove' : undefined}
                    onAction={() => removeItineraryItem(index)}
                >
                    <View style={styles.panel}>
                        <View style={styles.pair}>
                            <TextField
                                label="From"
                                value={item.travel_from}
                                onChangeText={(text) => updateItineraryItem(index, 'travel_from', text)}
                                placeholder="Origin"
                                style={styles.flex}
                            />
                            <TextField
                                label="To"
                                value={item.travel_to}
                                onChangeText={(text) => updateItineraryItem(index, 'travel_to', text)}
                                placeholder="Destination"
                                style={styles.flex}
                            />
                        </View>
                        <SelectField
                            label="Mode of travel"
                            value={item.mode_of_travel ? labelOf(MODE_OPTIONS, item.mode_of_travel) : ''}
                            placeholder="Not specified"
                            onPress={() => openPicker('mode', index)}
                        />
                        <View style={styles.pair}>
                            <SelectField
                                label="Departure"
                                value={formatShortDate(item.departure_date)}
                                icon="calendar"
                                onPress={() => setShowDeparturePicker({ show: true, index })}
                                style={styles.flex}
                            />
                            <SelectField
                                label="Arrival"
                                value={formatShortDate(item.arrival_date)}
                                icon="calendar"
                                onPress={() => setShowArrivalPicker({ show: true, index })}
                                style={styles.flex}
                            />
                        </View>
                        {showDeparturePicker.show && showDeparturePicker.index === index ? (
                            <DateTimePicker
                                value={item.departure_date}
                                mode="date"
                                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                onChange={(event, date) => {
                                    setShowDeparturePicker({ show: false, index: -1 });
                                    if (date) {
                                        updateItineraryItem(index, 'departure_date', date);
                                    }
                                }}
                            />
                        ) : null}
                        {showArrivalPicker.show && showArrivalPicker.index === index ? (
                            <DateTimePicker
                                value={item.arrival_date}
                                mode="date"
                                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                onChange={(event, date) => {
                                    setShowArrivalPicker({ show: false, index: -1 });
                                    if (date) {
                                        updateItineraryItem(index, 'arrival_date', date);
                                    }
                                }}
                            />
                        ) : null}
                        <View style={styles.switchRow}>
                            <Text style={type.body}>Lodging required</Text>
                            <Switch
                                value={Boolean(item.lodging_required)}
                                onValueChange={(value) => updateItineraryItem(index, 'lodging_required', value)}
                                trackColor={SWITCH_TRACK}
                                thumbColor={color.surface}
                            />
                        </View>
                        {item.lodging_required ? (
                            <TextField
                                label="Preferred lodging area"
                                value={item.preferred_area_for_lodging}
                                onChangeText={(text) => updateItineraryItem(index, 'preferred_area_for_lodging', text)}
                                placeholder="Optional"
                            />
                        ) : null}
                    </View>
                </Group>
            ))}
            <Button title="Add leg" variant="secondary" size="sm" onPress={addItineraryItem} style={styles.addButton} />

            {costings.map((item, index) => (
                <Group
                    key={index}
                    title={costings.length > 1 ? `Cost ${index + 1}` : 'Costs'}
                    action={costings.length > 1 ? 'Remove' : undefined}
                    onAction={() => removeCostingItem(index)}
                >
                    <View style={styles.panel}>
                        <SelectField
                            label="Expense type"
                            value={item.expense_type}
                            placeholder="Select type"
                            onPress={() => openPicker('expense', index)}
                        />
                        <View style={styles.pair}>
                            <TextField
                                label="Sponsored (₹)"
                                value={item.sponsored_amount}
                                onChangeText={(text) => updateCostingItem(index, 'sponsored_amount', text)}
                                placeholder="0"
                                keyboardType="decimal-pad"
                                style={styles.flex}
                            />
                            <TextField
                                label="Funded (₹)"
                                value={item.funded_amount}
                                onChangeText={(text) => updateCostingItem(index, 'funded_amount', text)}
                                placeholder="0"
                                keyboardType="decimal-pad"
                                style={styles.flex}
                            />
                        </View>
                        <View style={styles.totalRow}>
                            <Text style={type.secondary}>Item total</Text>
                            <Text style={styles.amount}>{money(item.total_amount)}</Text>
                        </View>
                    </View>
                </Group>
            ))}
            <Button title="Add cost" variant="secondary" size="sm" onPress={addCostingItem} style={styles.addButton} />
        </Screen>
    );

    // One sheet for the request: details first, then the approve / reject step.
    const sheetMode = showActionModal ? 'action' : showDetailsModal && selectedRequest ? 'details' : null;
    const isPending = selectedRequest?.status_label === 'Pending';
    const actionBusy = sheetMode === 'action' && loading;

    const closeSheet = () => {
        if (sheetMode === 'action') {
            setShowActionModal(false);
        } else {
            setShowDetailsModal(false);
        }
    };

    let sheetTitle;
    let sheetSubtitle;
    let sheetFooter = null;
    if (sheetMode === 'action') {
        sheetTitle = actionType === 'approve' ? 'Approve request' : 'Reject request';
        sheetSubtitle = joinDot([selectedRequest?.employee_name, selectedRequest?.purpose_of_travel]);
        sheetFooter = (
            <>
                <Button title="Cancel" variant="secondary" onPress={() => setShowActionModal(false)} disabled={loading} style={styles.flex} />
                <Button
                    title={actionType === 'approve' ? 'Approve' : 'Reject'}
                    variant={actionType === 'approve' ? 'primary' : 'dangerSolid'}
                    onPress={confirmAction}
                    loading={loading}
                    style={styles.flex}
                />
            </>
        );
    } else if (sheetMode === 'details') {
        sheetTitle = selectedRequest.employee_name;
        sheetSubtitle = joinDot([selectedRequest.request_id, selectedRequest.creation ? `Submitted ${dayLabel(selectedRequest.creation, true)}` : '']);
        sheetFooter = isPending ? (
            <>
                <Button title="Reject" variant="danger" onPress={() => handleAction('reject')} style={styles.flex} />
                <Button title="Approve" onPress={() => handleAction('approve')} style={styles.flex} />
            </>
        ) : (
            <Button title="Close" variant="secondary" onPress={() => setShowDetailsModal(false)} style={styles.flex} />
        );
    }

    const renderDetails = () => {
        const r = selectedRequest;
        const legs = Array.isArray(r.itinerary) ? r.itinerary : [];
        const costs = Array.isArray(r.costings) ? r.costings : [];
        return (
            <>
                {!isPending ? <Detail label="Status" value={<StatusText label={r.status_label} size={15} />} /> : null}
                <Detail label="Purpose" value={r.purpose_of_travel || '-'} />
                <View style={styles.pair}>
                    <Detail label="Travel type" value={r.travel_type || '-'} style={styles.flex} />
                    <Detail label="Funding" value={r.travel_funding ? labelOf(FUNDING_OPTIONS, r.travel_funding) : '-'} style={styles.flex} />
                </View>
                {r.description ? <Detail label="Description" value={r.description} /> : null}
                <View style={styles.pair}>
                    <Detail label="Employee ID" value={r.employee || '-'} style={styles.flex} />
                    <Detail label="Company" value={r.company || '-'} style={styles.flex} />
                </View>

                {legs.length > 0 ? (
                    <Group title="Itinerary">
                        {legs.map((leg, idx) => (
                            <Row
                                key={idx}
                                title={routeLabel(leg.travel_from, leg.travel_to) || `Leg ${idx + 1}`}
                                subtitle={joinDot([
                                    leg.mode_of_travel,
                                    tripDates(leg.departure_date, leg.arrival_date, true),
                                    leg.lodging_required ? `Lodging${leg.preferred_area_for_lodging ? `: ${leg.preferred_area_for_lodging}` : ''}` : '',
                                ])}
                            />
                        ))}
                    </Group>
                ) : null}

                {costs.length > 0 ? (
                    <Group title="Costs">
                        {costs.map((cost, idx) => (
                            <Row
                                key={idx}
                                title={cost.expense_type || '-'}
                                subtitle={`Sponsored ${money(cost.sponsored_amount)}  ·  Funded ${money(cost.funded_amount)}`}
                                value={money(cost.total_amount)}
                            />
                        ))}
                        <Row title="Total estimated" right={<Text style={styles.amount}>{money(r.total_estimated_amount)}</Text>} />
                    </Group>
                ) : null}
            </>
        );
    };

    const renderActionForm = () => (
        <>
            {sheetError ? <Notice tone="danger">{sheetError}</Notice> : null}
            <TextField
                label={actionType === 'approve' ? 'Remarks' : 'Reason for rejection'}
                value={actionReason}
                onChangeText={(text) => {
                    setActionReason(text);
                    if (sheetError) {
                        setSheetError('');
                    }
                }}
                placeholder={actionType === 'approve' ? 'Optional' : 'Required'}
                multiline
                numberOfLines={4}
                autoFocus={actionType === 'reject'}
            />
        </>
    );

    return (
        <View style={styles.container}>
            {renderToolbar()}

            {activeTab === 'apply' ? renderApplyForm() : (
                <Screen refreshing={refreshing} onRefresh={onRefresh}>
                    {activeTab === 'statistics' ? renderStatistics() : renderList()}
                </Screen>
            )}

            <Sheet
                visible={Boolean(sheetMode)}
                title={sheetTitle}
                subtitle={sheetSubtitle || undefined}
                onClose={closeSheet}
                dismissable={!actionBusy}
                footer={sheetFooter}
            >
                {sheetMode === 'details' ? renderDetails() : null}
                {sheetMode === 'action' ? renderActionForm() : null}
            </Sheet>

            <Sheet
                visible={Boolean(pickerConfig)}
                title={pickerConfig?.title}
                onClose={() => setPicker(null)}
            >
                {pickerConfig?.searchable ? (
                    <SearchField
                        value={pickerQuery}
                        onChangeText={setPickerQuery}
                        placeholder="Search employees"
                        style={styles.pickerSearch}
                    />
                ) : null}
                {pickerOptions.length === 0 ? (
                    <EmptyState icon="search" title="Nothing to choose from" message={pickerQuery ? `No match for “${pickerQuery}”.` : undefined} />
                ) : (
                    <Group>
                        {pickerOptions.map((o) => {
                            const active = o.value === (pickerConfig?.value || '');
                            return (
                                <Row
                                    key={o.value || 'none'}
                                    left={o.avatar ? <Avatar name={o.label} size={32} /> : undefined}
                                    title={o.label}
                                    subtitle={o.subtitle}
                                    selected={active}
                                    right={active ? <Icon name="check" size={18} color={color.accent} /> : null}
                                    chevron={false}
                                    onPress={() => selectOption(o.value)}
                                />
                            );
                        })}
                    </Group>
                )}
            </Sheet>
        </View>
    );
};

const Detail = ({ label, value, style }) => (
    <View style={[styles.detail, style]}>
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
    toolbarRow: { flexDirection: 'row', alignItems: 'center' },
    newButton: { marginLeft: space.sm },
    subControl: { marginTop: space.sm },
    formTitle: { ...type.title, flex: 1 },
    filterChip: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 6,
        marginTop: space.sm,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 14,
        backgroundColor: color.neutralSoft,
    },
    filterChipText: { fontSize: 13, color: color.textSecondary, fontWeight: '500' },
    stats: { marginBottom: space.xl },

    panel: { paddingHorizontal: space.lg, paddingTop: space.lg },
    pair: { flexDirection: 'row', gap: space.md },
    switchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: space.lg,
    },
    totalRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: space.lg,
    },
    amount: { ...type.bodyStrong, fontVariant: ['tabular-nums'] },
    addButton: { alignSelf: 'flex-start', marginTop: -space.sm, marginBottom: space.xl },
    footerRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
    footerTotal: { ...type.title, fontVariant: ['tabular-nums'], marginTop: 2 },

    detail: { marginBottom: space.lg },
    detailLabel: { ...type.caption, marginBottom: 4 },
    pickerSearch: { marginBottom: space.md },
});

export default TravelRequestApproval;
