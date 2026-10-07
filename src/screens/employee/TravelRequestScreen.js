// src/screens/employee/TravelRequestScreen.js
//
// The employee's own travel requests: a status filter, one row per request with a detail
// sheet, and the request form (trip, itinerary legs, estimated costs, other details).
// The admin app opens this screen too, for the admin's own requests.
import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    SafeAreaView,
    Switch,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    Alert,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import Toast from 'react-native-toast-message';
import { toastConfig } from '../../config/toastConfig';
import apiService, { extractFrappeData, isApiSuccess } from '../../services/api.service';
import { formatLocalDate, formatLocalDateTime, formatTimeOfDay } from '../../utils/dateFormat';
import { validateItinerary } from '../../utils/travelValidation';
import showToast from '../../utils/Toast';
import {
    Screen,
    Group,
    Row,
    Segmented,
    Sheet,
    Button,
    IconButton,
    SearchField,
    EmptyState,
    Loading,
    StatusText,
    Field,
    TextField,
    SelectField,
    Icon,
    color,
    space,
    type,
    formatShortDate,
    ModalTopInset,
    Notice,
} from '../../components/ds';

const FILTERS = [
    { value: 'all', label: 'All' },
    { value: 'pending', label: 'Pending' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' },
];
const TRAVEL_TYPES = ['Domestic', 'International'];
const FUNDING_OPTIONS = [
    { value: 'Require Full Funding', label: 'Require full funding' },
    { value: 'Fully Sponsored', label: 'Fully sponsored' },
    { value: 'Partially Sponsored, Require Partial Funding', label: 'Partially sponsored' },
];
const SPONSORED_FUNDING = ['Fully Sponsored', 'Partially Sponsored, Require Partial Funding'];
const MODE_OPTIONS = [
    { value: 'Flight', label: 'Flight' },
    { value: 'Train', label: 'Train' },
    { value: 'Taxi', label: 'Taxi' },
    { value: 'Rented Car', label: 'Rented car' },
    { value: 'Bus', label: 'Bus' },
    { value: 'Own Vehicle', label: 'Own vehicle' },
];
const MEAL_OPTIONS = [
    { value: 'Vegetarian', label: 'Vegetarian' },
    { value: 'Non-Vegetarian', label: 'Non-vegetarian' },
    { value: 'Gluten Free', label: 'Gluten free' },
    { value: 'No Preference', label: 'No preference' },
];
const SWITCH_TRACK = { false: '#D0D5DD', true: color.accent };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const EMPTY_FORM = {
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
};

const newLeg = () => ({
    travel_from: '',
    travel_to: '',
    mode_of_travel: '',
    departure_date: new Date(),
    arrival_date: new Date(),
    lodging_required: false,
    preferred_area_for_lodging: '',
    check_in_date: new Date(),
    check_out_date: new Date(),
    meal_preference: '',
    travel_advance_required: false,
    advance_amount: '',
});

const newCost = () => ({
    expense_type: '',
    sponsored_amount: '',
    funded_amount: '',
    total_amount: '',
    comments: '',
});

// 'YYYY-MM-DD[ HH:MM:SS]' as a local date (no timezone shift, no engine date parsing)
const toDate = (value) => {
    const [y, m, d] = String(value || '').slice(0, 10).split('-').map(Number);
    return y && m && d ? new Date(y, m - 1, d) : null;
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
// '2026-10-07 09:48:53' -> '07 Oct 2026, 09:48 AM'
const stampLabel = (value) => [dayLabel(value, true), formatTimeOfDay(value)].filter(Boolean).join(', ');
const routeLabel = (from, to) => (from && to ? `${from} → ${to}` : from || to || '');
const labelOf = (options, value) => options.find((o) => o.value === value)?.label || value;
const joinDot = (parts) => parts.filter(Boolean).join('  ·  ');

// ₹1,50,000 (Indian grouping); paise are shown only when the amount has them
const inr = (value) => {
    const n = Number(value) || 0;
    const paise = Math.round(Math.abs(n) * 100);
    const s = String(Math.floor(paise / 100));
    const last3 = s.slice(-3);
    const rest = s.slice(0, -3);
    const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}` : last3;
    const frac = paise % 100 ? `.${String(paise % 100).padStart(2, '0')}` : '';
    return `${n < 0 && paise ? '-' : ''}₹${grouped}${frac}`;
};

const TravelRequestScreen = ({ navigation }) => {
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [requests, setRequests] = useState([]);
    const [counts, setCounts] = useState({}); // per status, over all requests (server statistics)
    const [withdrawing, setWithdrawing] = useState(false);
    const [purposes, setPurposes] = useState([]);
    const [currentEmployee, setCurrentEmployee] = useState(null);
    const [expenseTypes, setExpenseTypes] = useState([]);

    // Form states
    const [formData, setFormData] = useState(() => ({ ...EMPTY_FORM }));

    // Itinerary states
    const [itinerary, setItinerary] = useState(() => [newLeg()]);
    const [showDeparturePicker, setShowDeparturePicker] = useState({ show: false, index: -1 });
    const [showArrivalPicker, setShowArrivalPicker] = useState({ show: false, index: -1 });
    const [showCheckInPicker, setShowCheckInPicker] = useState({ show: false, index: -1 });
    const [showCheckOutPicker, setShowCheckOutPicker] = useState({ show: false, index: -1 });

    // Costings states
    const [costings, setCostings] = useState(() => [newCost()]);

    // Filter states
    const [filterStatus, setFilterStatus] = useState('all');

    // Selected request for details
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [showDetailsModal, setShowDetailsModal] = useState(false);

    // Presentation only: the row whose details are loading, and the option picker sheet
    const [openingId, setOpeningId] = useState(null);
    const [picker, setPicker] = useState(null); // { kind, index? }
    const [pickerQuery, setPickerQuery] = useState('');

    useEffect(() => {
        loadInitialData();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
    }, []);

    useEffect(() => {
        loadRequests();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- reload whenever the status filter changes
    }, [filterStatus]);

    const loadInitialData = async () => {
        setLoading(true);
        try {
            // Get current employee
            const empResponse = await apiService.getCurrentEmployee();
            let empId = null;
            if (isApiSuccess(empResponse)) {
                const emp = extractFrappeData(empResponse, {});
                setCurrentEmployee(emp);
                empId = emp?.name || null;
            }

            // Load purposes, expense types and requests in parallel
            await Promise.all([
                loadPurposes(),
                loadExpenseTypes(),
                loadRequests(empId),
            ]);
        } catch (error) {
            console.error('Load initial data error:', error);
            showToast({ type: 'error', text1: 'Could not load travel requests', text2: 'Pull down to try again.' });
        } finally {
            setLoading(false);
        }
    };

    const loadPurposes = async () => {
        try {
            const response = await apiService.getPurposeOfTravelList();
            if (isApiSuccess(response)) {
                const data = extractFrappeData(response, { purposes: [] });
                setPurposes(data.purposes || []);
            }
        } catch (error) {
            console.error('Load purposes error:', error);
        }
    };

    const loadExpenseTypes = async () => {
        try {
            const response = await apiService.getExpenseClaimTypes();
            if (isApiSuccess(response)) {
                const data = extractFrappeData(response, []);
                setExpenseTypes(Array.isArray(data) ? data : []);
            }
        } catch (error) {
            console.error('Load expense types error:', error);
        }
    };

    // Always the signed-in employee's own requests: for an HR login (Self-Service) the server would
    // otherwise return everyone's. Skipped until the employee record is known.
    const loadRequests = async (employeeId = currentEmployee?.name) => {
        if (!employeeId) {
            return;
        }
        try {
            const filters = { limit: 200, employee: employeeId };
            if (filterStatus !== 'all') {
                filters.status = filterStatus;
            }

            const response = await apiService.getTravelRequests(filters);

            if (isApiSuccess(response)) {
                const data = extractFrappeData(response, { requests: [] });
                const requestsData = data.requests || (Array.isArray(data) ? data : []);
                setRequests(requestsData);
                setCounts(data.statistics || {});
            } else {
                setRequests([]);
            }
        } catch (error) {
            console.error('[Employee] Load requests error:', error);
            setRequests([]);
        }
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadRequests();
        setRefreshing(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- loadRequests only reads filterStatus
    }, [filterStatus]);

    // Itinerary functions
    const addItineraryItem = () => {
        setItinerary([...itinerary, newLeg()]);
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

    // Costings functions
    const addCostingItem = () => {
        setCostings([...costings, newCost()]);
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

    const calculateTotalCost = () => {
        return costings.reduce((sum, c) => sum + (parseFloat(c.total_amount) || 0), 0);
    };

    const handleSubmit = async () => {
        // Validation
        if (!formData.travel_type) {
            showToast({ type: 'warning', text1: 'Select a travel type' });
            return;
        }
        if (!formData.purpose_of_travel) {
            showToast({ type: 'warning', text1: 'Select the purpose of travel' });
            return;
        }
        const legProblem = validateItinerary(itinerary);
        if (legProblem) {
            showToast({ type: 'warning', ...legProblem });
            return;
        }

        if (!currentEmployee) {
            showToast({ type: 'error', text1: 'Employee record not found', text2: 'Go back and open this screen again.' });
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
                check_in_date: item.lodging_required ? formatLocalDate(item.check_in_date) : null,
                check_out_date: item.lodging_required ? formatLocalDate(item.check_out_date) : null,
                meal_preference: item.meal_preference,
                travel_advance_required: item.travel_advance_required ? 1 : 0,
                advance_amount: parseFloat(item.advance_amount) || 0,
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
                employee: currentEmployee.name,
                ...formData,
                itinerary: JSON.stringify(itineraryData),
                costings: JSON.stringify(costingsData),
            };

            const response = await apiService.submitTravelRequest(travelData);

            if (response.success && response.data?.message?.status === 'success') {
                showToast({
                    type: 'success',
                    text1: 'Travel request submitted',
                    text2: `Request ${response.data.message.request_id}`,
                });
                setShowForm(false);
                resetForm();
                loadRequests();
            } else {
                showToast({
                    type: 'error',
                    text1: 'Request not submitted',
                    text2: response.data?.message?.message || 'Please try again.',
                });
            }
        } catch (error) {
            console.error('Submit error:', error);
            showToast({ type: 'error', text1: 'Request not submitted', text2: 'Check your connection and try again.' });
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setFormData({ ...EMPTY_FORM });
        setItinerary([newLeg()]);
        setCostings([newCost()]);
    };

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
            showToast({ type: 'error', text1: 'Could not load request details', text2: 'Check your connection and try again.' });
        } finally {
            setLoading(false);
        }
    };

    // Shows a spinner on the tapped row while its details load.
    const openRequest = async (request) => {
        if (openingId) {
            return;
        }
        setOpeningId(request.name);
        await handleViewDetails(request);
        setOpeningId(null);
    };

    // ------------------------------------------------------------------ option picker (form)
    const openPicker = (kind, index) => {
        setPickerQuery('');
        setPicker({ kind, index });
    };

    const pickerConfig = (() => {
        switch (picker?.kind) {
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
            case 'meal':
                return {
                    title: 'Meal preference',
                    value: itinerary[picker.index]?.meal_preference,
                    options: [{ value: '', label: 'Not specified' }, ...MEAL_OPTIONS],
                    onSelect: (v) => updateItineraryItem(picker.index, 'meal_preference', v),
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

    const pickerSearchable = Boolean(pickerConfig && pickerConfig.options.length > 8);
    const pickerOptions = (() => {
        if (!pickerConfig) {
            return [];
        }
        const q = pickerQuery.trim().toLowerCase();
        if (!pickerSearchable || !q) {
            return pickerConfig.options;
        }
        return pickerConfig.options.filter((o) => String(o.label || '').toLowerCase().includes(q));
    })();

    const selectOption = (value) => {
        pickerConfig?.onSelect(value);
        setPicker(null);
    };

    // ------------------------------------------------------------------ list
    const renderRequestRow = (request) => {
        const opening = openingId === request.name;
        const facts = joinDot([
            routeLabel(request.travel_from, request.travel_to),
            request.travel_type,
            request.creation ? `Submitted ${dayLabel(request.creation)}` : '',
        ]);
        return (
            <Row
                key={request.name}
                title={request.purpose_of_travel || 'Travel request'}
                subtitle={[facts, request.description].filter(Boolean).join('\n') || undefined}
                right={opening
                    ? <ActivityIndicator size="small" color={color.textTertiary} />
                    : request.status_label ? <StatusText label={request.status_label} /> : null}
                chevron={!opening}
                onPress={() => openRequest(request)}
            />
        );
    };

    const renderList = () => {
        if (loading && requests.length === 0) {
            return <Loading />;
        }
        if (requests.length === 0) {
            const filter = FILTERS.find((f) => f.value === filterStatus);
            return (
                <EmptyState
                    icon="globe"
                    title={filterStatus === 'all' ? 'No travel requests' : `No ${filter.label.toLowerCase()} requests`}
                    message={filterStatus === 'all' ? 'Requests you submit appear here.' : undefined}
                />
            );
        }
        return (
            <Group title="Requests">
                {requests.map(renderRequestRow)}
            </Group>
        );
    };

    // ------------------------------------------------------------------ form
    const renderDatePicker = (state, setState, item, index, field) => (
        state.show && state.index === index ? (
            <DateTimePicker
                value={item[field]}
                mode="date"
                // arrival can't be before departure, hotel check-out not before check-in
                minimumDate={{ arrival_date: item.departure_date, check_out_date: item.check_in_date }[field] || undefined}
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(event, date) => {
                    setState({ show: false, index: -1 });
                    if (date) {
                        updateItineraryItem(index, field, date);
                    }
                }}
            />
        ) : null
    );

    const renderLeg = (item, index) => (
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
                        placeholder="Origin city"
                        style={styles.flex}
                    />
                    <TextField
                        label="To"
                        value={item.travel_to}
                        onChangeText={(text) => updateItineraryItem(index, 'travel_to', text)}
                        placeholder="Destination city"
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
                {renderDatePicker(showDeparturePicker, setShowDeparturePicker, item, index, 'departure_date')}
                {renderDatePicker(showArrivalPicker, setShowArrivalPicker, item, index, 'arrival_date')}
                <SelectField
                    label="Meal preference"
                    value={item.meal_preference ? labelOf(MEAL_OPTIONS, item.meal_preference) : ''}
                    placeholder="Not specified"
                    onPress={() => openPicker('meal', index)}
                />
            </View>

            <Row
                title="Lodging required"
                right={(
                    <Switch
                        value={Boolean(item.lodging_required)}
                        onValueChange={(value) => updateItineraryItem(index, 'lodging_required', value)}
                        trackColor={SWITCH_TRACK}
                        thumbColor={color.surface}
                    />
                )}
            />
            {item.lodging_required ? (
                <View style={styles.panel}>
                    <TextField
                        label="Preferred area"
                        value={item.preferred_area_for_lodging}
                        onChangeText={(text) => updateItineraryItem(index, 'preferred_area_for_lodging', text)}
                        placeholder="Optional"
                    />
                    <View style={styles.pair}>
                        <SelectField
                            label="Check-in"
                            value={formatShortDate(item.check_in_date)}
                            icon="calendar"
                            onPress={() => setShowCheckInPicker({ show: true, index })}
                            style={styles.flex}
                        />
                        <SelectField
                            label="Check-out"
                            value={formatShortDate(item.check_out_date)}
                            icon="calendar"
                            onPress={() => setShowCheckOutPicker({ show: true, index })}
                            style={styles.flex}
                        />
                    </View>
                    {renderDatePicker(showCheckInPicker, setShowCheckInPicker, item, index, 'check_in_date')}
                    {renderDatePicker(showCheckOutPicker, setShowCheckOutPicker, item, index, 'check_out_date')}
                </View>
            ) : null}

            <Row
                title="Travel advance required"
                right={(
                    <Switch
                        value={Boolean(item.travel_advance_required)}
                        onValueChange={(value) => updateItineraryItem(index, 'travel_advance_required', value)}
                        trackColor={SWITCH_TRACK}
                        thumbColor={color.surface}
                    />
                )}
            />
            {item.travel_advance_required ? (
                <View style={styles.panel}>
                    <TextField
                        label="Advance amount (₹)"
                        value={item.advance_amount}
                        onChangeText={(text) => updateItineraryItem(index, 'advance_amount', text)}
                        placeholder="0"
                        keyboardType="decimal-pad"
                    />
                </View>
            ) : null}
        </Group>
    );

    const renderCost = (item, index) => {
        const leftOut = !item.expense_type && (parseFloat(item.total_amount) || 0) > 0;
        return (
            <Group
                key={index}
                title={costings.length > 1 ? `Cost ${index + 1}` : 'Estimated costs'}
                action={costings.length > 1 ? 'Remove' : undefined}
                onAction={() => removeCostingItem(index)}
                footer={leftOut ? 'Choose an expense type, or this cost is left out of the request.' : undefined}
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
                    <TextField
                        label="Comments"
                        value={item.comments}
                        onChangeText={(text) => updateCostingItem(index, 'comments', text)}
                        placeholder="Optional"
                    />
                </View>
                <Row title="Item total" right={<Text style={styles.amount}>{inr(item.total_amount)}</Text>} />
            </Group>
        );
    };

    const renderPicker = () => (
        <Sheet
            visible={Boolean(pickerConfig)}
            title={pickerConfig?.title}
            onClose={() => setPicker(null)}
        >
            {pickerSearchable ? (
                <SearchField value={pickerQuery} onChangeText={setPickerQuery} style={styles.pickerSearch} />
            ) : null}
            {pickerOptions.length === 0 ? (
                <EmptyState
                    icon="search"
                    title="Nothing to choose from"
                    message={pickerQuery.trim() ? `No match for “${pickerQuery.trim()}”.` : undefined}
                />
            ) : (
                <Group>
                    {pickerOptions.map((o) => {
                        const active = o.value === (pickerConfig?.value || '');
                        return (
                            <Row
                                key={o.value || 'none'}
                                title={o.label}
                                selected={active}
                                right={<CheckMark checked={active} />}
                                chevron={false}
                                onPress={() => selectOption(o.value)}
                            />
                        );
                    })}
                </Group>
            )}
        </Sheet>
    );

    const renderForm = () => (
        <Modal visible={showForm} animationType="slide" statusBarTranslucent onRequestClose={() => setShowForm(false)}>
            <SafeAreaView style={styles.page}>
                <ModalTopInset />
                <PageHeader title="New travel request" onClose={() => setShowForm(false)} />
                <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                    <Screen
                        footer={(
                            <View style={styles.footerRow}>
                                <View style={styles.flex}>
                                    <Text style={type.caption}>Estimated total</Text>
                                    <Text style={styles.footerTotal}>{inr(calculateTotalCost())}</Text>
                                </View>
                                <Button title="Submit request" onPress={handleSubmit} loading={loading} />
                            </View>
                        )}
                    >
                        <Group title="Trip">
                            <View style={styles.panel}>
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
                                <TextField
                                    label="Description"
                                    value={formData.description}
                                    onChangeText={(text) => setFormData({ ...formData, description: text })}
                                    placeholder="Travel details"
                                    multiline
                                    numberOfLines={3}
                                />
                                <SelectField
                                    label="Funding"
                                    value={formData.travel_funding ? labelOf(FUNDING_OPTIONS, formData.travel_funding) : ''}
                                    placeholder="Not specified"
                                    onPress={() => openPicker('funding')}
                                />
                                {SPONSORED_FUNDING.includes(formData.travel_funding) ? (
                                    <TextField
                                        label="Sponsor details"
                                        value={formData.details_of_sponsor}
                                        onChangeText={(text) => setFormData({ ...formData, details_of_sponsor: text })}
                                        placeholder="Sponsor name and location"
                                        multiline
                                        numberOfLines={2}
                                    />
                                ) : null}
                            </View>
                        </Group>

                        {itinerary.map(renderLeg)}
                        <Button title="Add leg" variant="secondary" size="sm" onPress={addItineraryItem} style={styles.addButton} />

                        {costings.map(renderCost)}
                        <Button title="Add cost" variant="secondary" size="sm" onPress={addCostingItem} style={styles.addButton} />

                        <Group title="Other details">
                            <View style={styles.panel}>
                                <TextField
                                    label="Phone"
                                    value={formData.cell_number}
                                    onChangeText={(text) => setFormData({ ...formData, cell_number: text })}
                                    placeholder="Optional"
                                    keyboardType="phone-pad"
                                />
                                <TextField
                                    label="Preferred email"
                                    value={formData.prefered_email}
                                    onChangeText={(text) => setFormData({ ...formData, prefered_email: text })}
                                    placeholder="Optional"
                                    keyboardType="email-address"
                                    autoCapitalize="none"
                                />
                                {formData.travel_type === 'International' ? (
                                    <TextField
                                        label="Passport number"
                                        value={formData.passport_number}
                                        onChangeText={(text) => setFormData({ ...formData, passport_number: text })}
                                        placeholder="Optional"
                                        autoCapitalize="characters"
                                    />
                                ) : null}
                                <TextField
                                    label="Cost center"
                                    value={formData.cost_center}
                                    onChangeText={(text) => setFormData({ ...formData, cost_center: text })}
                                    placeholder="Optional"
                                />
                            </View>
                        </Group>
                    </Screen>
                </KeyboardAvoidingView>
            </SafeAreaView>
            {renderPicker()}
            {/* toasts from the root host would sit under this full-screen page */}
            <Toast config={toastConfig} />
        </Modal>
    );

    const confirmWithdraw = (r) => {
        Alert.alert('Withdraw this request?', 'It is removed and HR will no longer see it.', [
            { text: 'Keep', style: 'cancel' },
            {
                text: 'Withdraw',
                style: 'destructive',
                onPress: async () => {
                    setWithdrawing(true);
                    try {
                        const res = await apiService.withdrawTravelRequest(r.request_id);
                        if (isApiSuccess(res)) {
                            setShowDetailsModal(false);
                            showToast({ type: 'success', text1: 'Request withdrawn' });
                            await loadRequests();
                        } else {
                            showToast({ type: 'error', text1: 'Not withdrawn', text2: res?.message || 'Try again' });
                        }
                    } catch (error) {
                        showToast({ type: 'error', text1: 'Not withdrawn', text2: error?.message || 'Try again' });
                    } finally {
                        setWithdrawing(false);
                    }
                },
            },
        ]);
    };

    // ------------------------------------------------------------------ details
    const renderDetailsSheet = () => {
        const r = selectedRequest;
        const legs = Array.isArray(r?.itinerary) ? r.itinerary : [];
        const costs = Array.isArray(r?.costings) ? r.costings : [];
        return (
            <Sheet
                visible={showDetailsModal && Boolean(r)}
                title={r?.purpose_of_travel || 'Travel request'}
                subtitle={r ? joinDot([r.request_id, r.travel_type]) || undefined : undefined}
                onClose={() => !withdrawing && setShowDetailsModal(false)}
                footer={(
                    <>
                        <Button title="Close" variant="secondary" onPress={() => setShowDetailsModal(false)} disabled={withdrawing} style={styles.flex} />
                        {r?.can_withdraw ? (
                            <Button title="Withdraw" variant="danger" onPress={() => confirmWithdraw(r)} loading={withdrawing} style={styles.flex} />
                        ) : null}
                    </>
                )}
            >
                {r ? (
                    <>
                        {r.status_label ? <Detail label="Status" value={<StatusText label={r.status_label} size={15} />} /> : null}
                        {r.rejection_reason ? (
                            <Notice tone="danger" title="Not approved">{r.rejection_reason}</Notice>
                        ) : null}
                        {r.approval_remarks ? (
                            <Notice tone="success" title="Note from HR">{r.approval_remarks}</Notice>
                        ) : null}
                        <View style={styles.pair}>
                            <Detail label="Travel type" value={r.travel_type || '—'} style={styles.flex} />
                            <Detail label="Funding" value={r.travel_funding ? labelOf(FUNDING_OPTIONS, r.travel_funding) : '—'} style={styles.flex} />
                        </View>
                        {r.description ? <Detail label="Description" value={r.description} /> : null}

                        {legs.length > 0 ? (
                            <Group title="Itinerary">
                                {legs.map((leg, idx) => (
                                    <Row
                                        key={idx}
                                        title={routeLabel(leg.travel_from, leg.travel_to) || `Leg ${idx + 1}`}
                                        subtitle={joinDot([
                                            leg.mode_of_travel,
                                            tripDates(leg.departure_date, leg.arrival_date, true),
                                            leg.lodging_required
                                                ? `Hotel${leg.preferred_area_for_lodging ? ` in ${leg.preferred_area_for_lodging}` : ''}${leg.check_in_date ? ` ${tripDates(leg.check_in_date, leg.check_out_date)}` : ''}`
                                                : '',
                                            Number(leg.travel_advance_required) ? `Advance ${inr(leg.advance_amount)}` : '',
                                        ]) || undefined}
                                    />
                                ))}
                            </Group>
                        ) : null}

                        {costs.length > 0 ? (
                            <Group title="Estimated costs">
                                {costs.map((cost, idx) => (
                                    <Row
                                        key={idx}
                                        title={cost.expense_type || 'Cost'}
                                        subtitle={`Sponsored ${inr(cost.sponsored_amount)}  ·  Funded ${inr(cost.funded_amount)}`}
                                        value={inr(cost.total_amount)}
                                    />
                                ))}
                                <Row title="Total" right={<Text style={styles.amount}>{inr(r.total_estimated_amount)}</Text>} />
                            </Group>
                        ) : null}

                        <View style={styles.pair}>
                            <Detail label="Submitted" value={stampLabel(r.creation) || '—'} style={styles.flex} />
                            {r.modified ? <Detail label="Last updated" value={stampLabel(r.modified) || '—'} style={styles.flex} /> : null}
                        </View>
                    </>
                ) : null}
            </Sheet>
        );
    };

    return (
        <View style={styles.container}>
            <View style={styles.toolbar}>
                <Segmented
                    options={FILTERS.map((f) => ({ ...f, count: (f.value === 'all' ? counts.total : counts[f.value]) || undefined }))}
                    value={filterStatus}
                    onChange={setFilterStatus}
                />
            </View>

            <Screen
                refreshing={refreshing}
                onRefresh={onRefresh}
                footer={<Button title="New request" onPress={() => setShowForm(true)} full />}
            >
                {renderList()}
            </Screen>

            {renderForm()}
            {renderDetailsSheet()}
        </View>
    );
};

// ------------------------------------------------------------------ local building blocks

// Header bar for the full-screen form (matches the stack header).
const PageHeader = ({ title, onClose }) => (
    <View style={styles.pageHeader}>
        <View style={styles.pageHeaderSide}>
            <IconButton name="x" onPress={onClose} color={color.text} size={22} label="Close" />
        </View>
        <Text style={styles.pageTitle} numberOfLines={1}>{title}</Text>
        <View style={styles.pageHeaderSide} />
    </View>
);

// Label above value, for the detail sheet.
const Detail = ({ label, value, style }) => (
    <View style={[styles.detail, style]}>
        <Text style={styles.detailLabel}>{label}</Text>
        {typeof value === 'string' ? <Text style={type.body}>{value}</Text> : value}
    </View>
);

// Check mark slot for picker rows (keeps row text aligned when unchecked).
const CheckMark = ({ checked }) => (
    <View style={styles.check}>
        {checked ? <Icon name="check" size={18} color={color.accent} /> : null}
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

    // Full-screen form
    page: { flex: 1, backgroundColor: color.surface },
    pageHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 56,
        paddingHorizontal: space.xs,
        backgroundColor: color.surface,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: color.border,
    },
    pageHeaderSide: { width: 56, alignItems: 'flex-start', justifyContent: 'center' },
    pageTitle: { ...type.title, flex: 1, textAlign: 'center' },
    panel: { paddingHorizontal: space.lg, paddingTop: space.lg },
    pair: { flexDirection: 'row', gap: space.md },
    amount: { ...type.bodyStrong, fontVariant: ['tabular-nums'] },
    addButton: { alignSelf: 'flex-start', marginTop: -space.sm, marginBottom: space.xl },
    footerRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
    footerTotal: { ...type.title, fontVariant: ['tabular-nums'], marginTop: 2 },
    pickerSearch: { marginBottom: space.md },
    check: { width: 24, alignItems: 'flex-end' },

    // Detail sheet
    detail: { marginBottom: space.lg },
    detailLabel: { ...type.caption, marginBottom: 4 },
});

export default TravelRequestScreen;
