import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    TextInput,
    Alert,
    RefreshControl,
    Modal,
    ActivityIndicator,
    Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { colors } from '../../theme/colors';
import Button from '../../components/common/Button';
import Input from '../../components/common/Input';
import Loading from '../../components/common/Loading';
import apiService, { extractFrappeData, isApiSuccess, getApiErrorMessage } from '../../services/api.service';

const TravelRequestScreen = ({ navigation }) => {
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [requests, setRequests] = useState([]);
    const [purposes, setPurposes] = useState([]);
    const [currentEmployee, setCurrentEmployee] = useState(null);
    const [expenseTypes, setExpenseTypes] = useState([]);

    // Form states
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
        check_in_date: new Date(),
        check_out_date: new Date(),
        meal_preference: '',
        travel_advance_required: false,
        advance_amount: '',
    }]);
    const [showDeparturePicker, setShowDeparturePicker] = useState({ show: false, index: -1 });
    const [showArrivalPicker, setShowArrivalPicker] = useState({ show: false, index: -1 });
    const [showCheckInPicker, setShowCheckInPicker] = useState({ show: false, index: -1 });
    const [showCheckOutPicker, setShowCheckOutPicker] = useState({ show: false, index: -1 });
    
    // Costings states
    const [costings, setCostings] = useState([{
        expense_type: '',
        sponsored_amount: '',
        funded_amount: '',
        total_amount: '',
        comments: '',
    }]);

    // Filter states
    const [filterStatus, setFilterStatus] = useState('all');

    // Selected request for details
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [showDetailsModal, setShowDetailsModal] = useState(false);

    useEffect(() => {
        loadInitialData();
    }, []);

    useEffect(() => {
        loadRequests();
    }, [filterStatus]);

    const loadInitialData = async () => {
        setLoading(true);
        try {
            // Get current employee
            const empResponse = await apiService.getCurrentEmployee();
            if (isApiSuccess(empResponse)) {
                setCurrentEmployee(extractFrappeData(empResponse, {}));
            }

            // Load purposes, expense types and requests in parallel
            await Promise.all([
                loadPurposes(),
                loadExpenseTypes(),
                loadRequests(),
            ]);
        } catch (error) {
            console.error('Load initial data error:', error);
            Alert.alert('Error', 'Failed to load data');
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

    const loadRequests = async () => {
        try {
            const filters = { limit: 200 };
            if (filterStatus !== 'all') {
                filters.status = filterStatus;
            }

            console.log('[Employee] Fetching travel requests with filters:', filters);
            const response = await apiService.getTravelRequests(filters);
            console.log('[Employee] Travel Requests Response:', response);

            if (isApiSuccess(response)) {
                const data = extractFrappeData(response, { requests: [] });
                const requestsData = data.requests || (Array.isArray(data) ? data : []);
                setRequests(requestsData);
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
    }, [filterStatus]);

    // Itinerary functions
    const addItineraryItem = () => {
        setItinerary([...itinerary, {
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

    // Costings functions
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

    const calculateTotalCost = () => {
        return costings.reduce((sum, c) => sum + (parseFloat(c.total_amount) || 0), 0);
    };

    const handleSubmit = async () => {
        // Validation
        if (!formData.travel_type) {
            Alert.alert('Validation Error', 'Please select travel type');
            return;
        }
        if (!formData.purpose_of_travel) {
            Alert.alert('Validation Error', 'Please select purpose of travel');
            return;
        }

        if (!currentEmployee) {
            Alert.alert('Error', 'Employee information not found');
            return;
        }

        setLoading(true);
        try {
            // Prepare itinerary
            const itineraryData = itinerary.map(item => ({
                travel_from: item.travel_from,
                travel_to: item.travel_to,
                mode_of_travel: item.mode_of_travel,
                departure_date: item.departure_date.toISOString(),
                arrival_date: item.arrival_date.toISOString(),
                lodging_required: item.lodging_required ? 1 : 0,
                preferred_area_for_lodging: item.preferred_area_for_lodging,
                check_in_date: item.lodging_required ? item.check_in_date.toISOString().split('T')[0] : null,
                check_out_date: item.lodging_required ? item.check_out_date.toISOString().split('T')[0] : null,
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

            console.log('Submitting travel request:', travelData);
            const response = await apiService.submitTravelRequest(travelData);

            if (response.success && response.data?.message?.status === 'success') {
                Alert.alert(
                    'Success',
                    'Travel request submitted successfully!\nRequest ID: ' + response.data.message.request_id,
                    [{
                        text: 'OK',
                        onPress: () => {
                            setShowForm(false);
                            resetForm();
                            loadRequests();
                        },
                    }]
                );
            } else {
                Alert.alert('Error', response.data?.message?.message || 'Failed to submit request');
            }
        } catch (error) {
            console.error('Submit error:', error);
            Alert.alert('Error', 'Failed to submit travel request');
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
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
            check_in_date: new Date(),
            check_out_date: new Date(),
            meal_preference: '',
            travel_advance_required: false,
            advance_amount: '',
        }]);
        setCostings([{
            expense_type: '',
            sponsored_amount: '',
            funded_amount: '',
            total_amount: '',
            comments: '',
        }]);
    };

    const handleViewDetails = async (request) => {
        try {
            setLoading(true);
            const response = await apiService.getTravelRequestDetails(request.name);
            console.log('Travel Request Details:', response);
            
            if (response.success && response.data?.message?.data) {
                setSelectedRequest(response.data.message.data);
                setShowDetailsModal(true);
            } else {
                Alert.alert('Error', 'Failed to load request details');
            }
        } catch (error) {
            console.error('View details error:', error);
            Alert.alert('Error', 'Failed to load request details');
        } finally {
            setLoading(false);
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'Pending': return colors.warning;
            case 'Approved': return colors.success;
            case 'Rejected': return colors.error;
            default: return colors.textSecondary;
        }
    };

    const renderRequestCard = (request) => (
        <TouchableOpacity
            key={request.name}
            style={styles.requestCard}
            onPress={() => handleViewDetails(request)}
        >
            <View style={styles.requestHeader}>
                <Text style={styles.requestType}>{request.travel_type}</Text>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(request.status_label) }]}>
                    <Text style={styles.statusText}>{request.status_label}</Text>
                </View>
            </View>

            <Text style={styles.requestPurpose}>{request.purpose_of_travel}</Text>

            {request.travel_from && request.travel_to && (
                <View style={styles.routeRow}>
                    <Icon name="map-marker-path" size={16} color={colors.primary} />
                    <Text style={styles.routeText}>{request.travel_from} to {request.travel_to}</Text>
                </View>
            )}

            {request.description && (
                <Text style={styles.requestDescription} numberOfLines={2}>
                    {request.description}
                </Text>
            )}

            <View style={styles.requestFooter}>
                <Text style={styles.requestDate}>
                    <Icon name="calendar" size={14} color={colors.textSecondary} /> {request.creation?.split(' ')[0]}
                </Text>
                <Icon name="chevron-right" size={20} color={colors.textSecondary} />
            </View>
        </TouchableOpacity>
    );

    const renderForm = () => (
        <Modal visible={showForm} animationType="slide" onRequestClose={() => setShowForm(false)}>
            <View style={styles.modalContainer}>
                <View style={styles.modalHeader}>
                    <TouchableOpacity onPress={() => setShowForm(false)}>
                        <Icon name="close" size={24} color={colors.textPrimary} />
                    </TouchableOpacity>
                    <Text style={styles.modalTitle}>New Travel Request</Text>
                    <TouchableOpacity onPress={handleSubmit} disabled={loading}>
                        {loading ? (
                            <ActivityIndicator size="small" color={colors.primary} />
                        ) : (
                            <Text style={styles.submitButton}>Submit</Text>
                        )}
                    </TouchableOpacity>
                </View>

                <ScrollView style={styles.formScroll}>
                    {/* Travel Type */}
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>
                            Travel Type <Text style={styles.required}>*</Text>
                        </Text>
                        <View style={styles.pickerContainer}>
                            <Picker
                                selectedValue={formData.travel_type}
                                onValueChange={(value) => setFormData({ ...formData, travel_type: value })}
                                style={styles.picker}
                            >
                                <Picker.Item label="Domestic" value="Domestic" />
                                <Picker.Item label="International" value="International" />
                            </Picker>
                        </View>
                    </View>

                    {/* Purpose of Travel */}
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>
                            Purpose of Travel <Text style={styles.required}>*</Text>
                        </Text>
                        <View style={styles.pickerContainer}>
                            <Picker
                                selectedValue={formData.purpose_of_travel}
                                onValueChange={(value) => setFormData({ ...formData, purpose_of_travel: value })}
                                style={styles.picker}
                            >
                                <Picker.Item label="Select Purpose" value="" />
                                {purposes.map((purpose) => (
                                    <Picker.Item key={purpose} label={purpose} value={purpose} />
                                ))}
                            </Picker>
                        </View>
                    </View>

                    {/* Description */}
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Description / Details</Text>
                        <TextInput
                            style={styles.textArea}
                            value={formData.description}
                            onChangeText={(text) => setFormData({ ...formData, description: text })}
                            placeholder="Enter travel details"
                            multiline
                            numberOfLines={3}
                            textAlignVertical="top"
                        />
                    </View>

                    {/* Travel Funding */}
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Travel Funding</Text>
                        <View style={styles.pickerContainer}>
                            <Picker
                                selectedValue={formData.travel_funding}
                                onValueChange={(value) => setFormData({ ...formData, travel_funding: value })}
                                style={styles.picker}
                            >
                                <Picker.Item label="Select funding type..." value="" />
                                <Picker.Item label="Require Full Funding" value="Require Full Funding" />
                                <Picker.Item label="Fully Sponsored" value="Fully Sponsored" />
                                <Picker.Item label="Partially Sponsored" value="Partially Sponsored, Require Partial Funding" />
                            </Picker>
                        </View>
                    </View>

                    {/* Details of Sponsor - shown when sponsored */}
                    {(formData.travel_funding === 'Fully Sponsored' || formData.travel_funding === 'Partially Sponsored, Require Partial Funding') && (
                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Sponsor Details</Text>
                            <TextInput
                                style={styles.textArea}
                                value={formData.details_of_sponsor}
                                onChangeText={(text) => setFormData({ ...formData, details_of_sponsor: text })}
                                placeholder="Enter sponsor name and location"
                                multiline
                                numberOfLines={2}
                                textAlignVertical="top"
                            />
                        </View>
                    )}

                    {/* ========== ITINERARY SECTION ========== */}
                    <Text style={styles.sectionTitle}>Travel Itinerary</Text>
                    {itinerary.map((item, index) => (
                        <View key={index} style={styles.itemCard}>
                            <View style={styles.itemCardHeader}>
                                <Text style={styles.itemCardTitle}>Leg {index + 1}</Text>
                                {itinerary.length > 1 && (
                                    <TouchableOpacity onPress={() => removeItineraryItem(index)} style={styles.removeBtn}>
                                        <Text style={styles.removeBtnText}>Remove</Text>
                                    </TouchableOpacity>
                                )}
                            </View>

                            {/* From / To */}
                            <View style={styles.rowInputs}>
                                <View style={{ flex: 1, marginRight: 8 }}>
                                    <Text style={styles.smallLabel}>From *</Text>
                                    <TextInput
                                        style={styles.input}
                                        value={item.travel_from}
                                        onChangeText={(text) => updateItineraryItem(index, 'travel_from', text)}
                                        placeholder="Origin city"
                                    />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.smallLabel}>To *</Text>
                                    <TextInput
                                        style={styles.input}
                                        value={item.travel_to}
                                        onChangeText={(text) => updateItineraryItem(index, 'travel_to', text)}
                                        placeholder="Destination city"
                                    />
                                </View>
                            </View>

                            {/* Mode of Travel */}
                            <Text style={styles.smallLabel}>Mode of Travel</Text>
                            <View style={styles.pickerContainer}>
                                <Picker
                                    selectedValue={item.mode_of_travel}
                                    onValueChange={(value) => updateItineraryItem(index, 'mode_of_travel', value)}
                                    style={styles.picker}
                                >
                                    <Picker.Item label="Select mode..." value="" />
                                    <Picker.Item label="Flight" value="Flight" />
                                    <Picker.Item label="Train" value="Train" />
                                    <Picker.Item label="Taxi" value="Taxi" />
                                    <Picker.Item label="Rented Car" value="Rented Car" />
                                    <Picker.Item label="Bus" value="Bus" />
                                    <Picker.Item label="Own Vehicle" value="Own Vehicle" />
                                </Picker>
                            </View>

                            {/* Dates */}
                            <View style={styles.rowInputs}>
                                <View style={{ flex: 1, marginRight: 8 }}>
                                    <Text style={styles.smallLabel}>Departure Date</Text>
                                    <TouchableOpacity
                                        style={styles.dateButton}
                                        onPress={() => setShowDeparturePicker({ show: true, index })}
                                    >
                                        <Icon name="calendar" size={18} color={colors.primary} />
                                        <Text style={styles.dateButtonText}>{item.departure_date.toLocaleDateString()}</Text>
                                    </TouchableOpacity>
                                    {showDeparturePicker.show && showDeparturePicker.index === index && (
                                        <DateTimePicker
                                            value={item.departure_date}
                                            mode="date"
                                            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                            onChange={(event, date) => {
                                                setShowDeparturePicker({ show: false, index: -1 });
                                                if (date) updateItineraryItem(index, 'departure_date', date);
                                            }}
                                        />
                                    )}
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.smallLabel}>Arrival Date</Text>
                                    <TouchableOpacity
                                        style={styles.dateButton}
                                        onPress={() => setShowArrivalPicker({ show: true, index })}
                                    >
                                        <Icon name="calendar" size={18} color={colors.primary} />
                                        <Text style={styles.dateButtonText}>{item.arrival_date.toLocaleDateString()}</Text>
                                    </TouchableOpacity>
                                    {showArrivalPicker.show && showArrivalPicker.index === index && (
                                        <DateTimePicker
                                            value={item.arrival_date}
                                            mode="date"
                                            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                            onChange={(event, date) => {
                                                setShowArrivalPicker({ show: false, index: -1 });
                                                if (date) updateItineraryItem(index, 'arrival_date', date);
                                            }}
                                        />
                                    )}
                                </View>
                            </View>

                            {/* Meal Preference */}
                            <Text style={styles.smallLabel}>Meal Preference</Text>
                            <View style={styles.pickerContainer}>
                                <Picker
                                    selectedValue={item.meal_preference}
                                    onValueChange={(value) => updateItineraryItem(index, 'meal_preference', value)}
                                    style={styles.picker}
                                >
                                    <Picker.Item label="Select preference..." value="" />
                                    <Picker.Item label="Vegetarian" value="Vegetarian" />
                                    <Picker.Item label="Non-Vegetarian" value="Non-Vegetarian" />
                                    <Picker.Item label="Gluten Free" value="Gluten Free" />
                                    <Picker.Item label="No Preference" value="No Preference" />
                                </Picker>
                            </View>

                            {/* Lodging Required */}
                            <View style={styles.checkboxRow}>
                                <TouchableOpacity
                                    style={styles.checkbox}
                                    onPress={() => updateItineraryItem(index, 'lodging_required', !item.lodging_required)}
                                >
                                    <Icon
                                        name={item.lodging_required ? 'checkbox-marked' : 'checkbox-blank-outline'}
                                        size={24}
                                        color={colors.primary}
                                    />
                                    <Text style={styles.checkboxLabel}>Lodging Required</Text>
                                </TouchableOpacity>
                            </View>

                            {item.lodging_required && (
                                <>
                                    <Text style={styles.smallLabel}>Preferred Area for Lodging</Text>
                                    <TextInput
                                        style={styles.input}
                                        value={item.preferred_area_for_lodging}
                                        onChangeText={(text) => updateItineraryItem(index, 'preferred_area_for_lodging', text)}
                                        placeholder="Enter preferred area"
                                    />
                                    
                                    {/* Check-in and Check-out Dates */}
                                    <View style={styles.rowInputs}>
                                        <View style={{ flex: 1, marginRight: 8 }}>
                                            <Text style={styles.smallLabel}>Check-in Date</Text>
                                            <TouchableOpacity
                                                style={styles.dateButton}
                                                onPress={() => setShowCheckInPicker({ show: true, index })}
                                            >
                                                <Icon name="calendar-check" size={18} color={colors.primary} />
                                                <Text style={styles.dateButtonText}>{item.check_in_date.toLocaleDateString()}</Text>
                                            </TouchableOpacity>
                                            {showCheckInPicker.show && showCheckInPicker.index === index && (
                                                <DateTimePicker
                                                    value={item.check_in_date}
                                                    mode="date"
                                                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                                    onChange={(event, date) => {
                                                        setShowCheckInPicker({ show: false, index: -1 });
                                                        if (date) updateItineraryItem(index, 'check_in_date', date);
                                                    }}
                                                />
                                            )}
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.smallLabel}>Check-out Date</Text>
                                            <TouchableOpacity
                                                style={styles.dateButton}
                                                onPress={() => setShowCheckOutPicker({ show: true, index })}
                                            >
                                                <Icon name="calendar-remove" size={18} color={colors.primary} />
                                                <Text style={styles.dateButtonText}>{item.check_out_date.toLocaleDateString()}</Text>
                                            </TouchableOpacity>
                                            {showCheckOutPicker.show && showCheckOutPicker.index === index && (
                                                <DateTimePicker
                                                    value={item.check_out_date}
                                                    mode="date"
                                                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                                    onChange={(event, date) => {
                                                        setShowCheckOutPicker({ show: false, index: -1 });
                                                        if (date) updateItineraryItem(index, 'check_out_date', date);
                                                    }}
                                                />
                                            )}
                                        </View>
                                    </View>
                                </>
                            )}

                            {/* Travel Advance */}
                            <View style={styles.checkboxRow}>
                                <TouchableOpacity
                                    style={styles.checkbox}
                                    onPress={() => updateItineraryItem(index, 'travel_advance_required', !item.travel_advance_required)}
                                >
                                    <Icon
                                        name={item.travel_advance_required ? 'checkbox-marked' : 'checkbox-blank-outline'}
                                        size={24}
                                        color={colors.primary}
                                    />
                                    <Text style={styles.checkboxLabel}>Travel Advance Required</Text>
                                </TouchableOpacity>
                            </View>

                            {item.travel_advance_required && (
                                <>
                                    <Text style={styles.smallLabel}>Advance Amount (Rs.)</Text>
                                    <TextInput
                                        style={styles.input}
                                        value={item.advance_amount}
                                        onChangeText={(text) => updateItineraryItem(index, 'advance_amount', text)}
                                        placeholder="Enter amount"
                                        keyboardType="decimal-pad"
                                    />
                                </>
                            )}
                        </View>
                    ))}

                    <TouchableOpacity onPress={addItineraryItem} style={styles.addButton}>
                        <Icon name="plus" size={18} color={colors.primary} />
                        <Text style={styles.addButtonText}>Add Another Travel Leg</Text>
                    </TouchableOpacity>

                    {/* ========== COSTINGS SECTION ========== */}
                    <Text style={styles.sectionTitle}>Estimated Costs</Text>
                    {costings.map((item, index) => (
                        <View key={index} style={styles.itemCard}>
                            <View style={styles.itemCardHeader}>
                                <Text style={styles.itemCardTitle}>Cost Item {index + 1}</Text>
                                {costings.length > 1 && (
                                    <TouchableOpacity onPress={() => removeCostingItem(index)} style={styles.removeBtn}>
                                        <Text style={styles.removeBtnText}>Remove</Text>
                                    </TouchableOpacity>
                                )}
                            </View>

                            <Text style={styles.smallLabel}>Expense Type</Text>
                            <View style={styles.pickerContainer}>
                                <Picker
                                    selectedValue={item.expense_type}
                                    onValueChange={(value) => updateCostingItem(index, 'expense_type', value)}
                                    style={styles.picker}
                                >
                                    <Picker.Item label="Select expense type..." value="" />
                                    {expenseTypes.map((type) => (
                                        <Picker.Item key={type.name} label={type.name} value={type.name} />
                                    ))}
                                </Picker>
                            </View>

                            <View style={styles.rowInputs}>
                                <View style={{ flex: 1, marginRight: 8 }}>
                                    <Text style={styles.smallLabel}>Sponsored (Rs.)</Text>
                                    <TextInput
                                        style={styles.input}
                                        value={item.sponsored_amount}
                                        onChangeText={(text) => updateCostingItem(index, 'sponsored_amount', text)}
                                        placeholder="0"
                                        keyboardType="decimal-pad"
                                    />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.smallLabel}>Funded (Rs.)</Text>
                                    <TextInput
                                        style={styles.input}
                                        value={item.funded_amount}
                                        onChangeText={(text) => updateCostingItem(index, 'funded_amount', text)}
                                        placeholder="0"
                                        keyboardType="decimal-pad"
                                    />
                                </View>
                            </View>

                            <View style={styles.costTotalRow}>
                                <Text style={styles.costTotalLabel}>Item Total:</Text>
                                <Text style={styles.costTotalValue}>Rs.{item.total_amount || '0'}</Text>
                            </View>

                            <Text style={styles.smallLabel}>Comments</Text>
                            <TextInput
                                style={styles.input}
                                value={item.comments}
                                onChangeText={(text) => updateCostingItem(index, 'comments', text)}
                                placeholder="Any notes..."
                            />
                        </View>
                    ))}

                    <TouchableOpacity onPress={addCostingItem} style={styles.addButton}>
                        <Icon name="plus" size={18} color={colors.primary} />
                        <Text style={styles.addButtonText}>Add Cost Item</Text>
                    </TouchableOpacity>

                    {/* Total Cost Summary */}
                    <View style={styles.totalContainer}>
                        <Text style={styles.totalLabel}>Total Estimated Cost:</Text>
                        <Text style={styles.totalAmount}>Rs.{calculateTotalCost().toFixed(2)}</Text>
                    </View>

                    {/* Contact & Other Info (Collapsible Optional Section) */}
                    <Text style={styles.sectionTitle}>Additional Information (Optional)</Text>

                    <View style={styles.inputGroup}>
                        <Text style={styles.smallLabel}>Cell Number</Text>
                        <TextInput
                            style={styles.input}
                            value={formData.cell_number}
                            onChangeText={(text) => setFormData({ ...formData, cell_number: text })}
                            placeholder="Enter phone number"
                            keyboardType="phone-pad"
                        />
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={styles.smallLabel}>Preferred Email</Text>
                        <TextInput
                            style={styles.input}
                            value={formData.prefered_email}
                            onChangeText={(text) => setFormData({ ...formData, prefered_email: text })}
                            placeholder="Enter email"
                            keyboardType="email-address"
                            autoCapitalize="none"
                        />
                    </View>

                    {/* International only fields */}
                    {formData.travel_type === 'International' && (
                        <>
                            <View style={styles.inputGroup}>
                                <Text style={styles.smallLabel}>Passport Number</Text>
                                <TextInput
                                    style={styles.input}
                                    value={formData.passport_number}
                                    onChangeText={(text) => setFormData({ ...formData, passport_number: text })}
                                    placeholder="Enter passport number"
                                />
                            </View>
                        </>
                    )}

                    <View style={styles.inputGroup}>
                        <Text style={styles.smallLabel}>Cost Center</Text>
                        <TextInput
                            style={styles.input}
                            value={formData.cost_center}
                            onChangeText={(text) => setFormData({ ...formData, cost_center: text })}
                            placeholder="Enter cost center code"
                        />
                    </View>

                    <View style={{ height: 60 }} />
                </ScrollView>
            </View>
        </Modal>
    );

    const renderDetailsModal = () => {
        if (!selectedRequest) return null;

        return (
            <Modal
                visible={showDetailsModal}
                animationType="slide"
                onRequestClose={() => setShowDetailsModal(false)}
            >
                <View style={styles.modalContainer}>
                    <View style={styles.modalHeader}>
                        <TouchableOpacity onPress={() => setShowDetailsModal(false)}>
                            <Icon name="close" size={24} color={colors.textPrimary} />
                        </TouchableOpacity>
                        <Text style={styles.modalTitle}>Request Details</Text>
                        <View style={{ width: 24 }} />
                    </View>

                    <ScrollView style={styles.detailsContent}>
                        {/* Basic Info */}
                        <View style={styles.detailSection}>
                            <Text style={styles.detailSectionTitle}>Travel Information</Text>
                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>Request ID:</Text>
                                <Text style={styles.detailValue}>{selectedRequest.request_id}</Text>
                            </View>
                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>Type:</Text>
                                <Text style={styles.detailValue}>{selectedRequest.travel_type}</Text>
                            </View>
                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>Purpose:</Text>
                                <Text style={styles.detailValue}>{selectedRequest.purpose_of_travel}</Text>
                            </View>
                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>Status:</Text>
                                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(selectedRequest.status_label) }]}>
                                    <Text style={styles.statusText}>{selectedRequest.status_label}</Text>
                                </View>
                            </View>
                            {selectedRequest.description && (
                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>Description:</Text>
                                    <Text style={styles.detailValue}>{selectedRequest.description}</Text>
                                </View>
                            )}
                        </View>

                        {/* Itinerary */}
                        {selectedRequest.itinerary && selectedRequest.itinerary.length > 0 && (
                            <View style={styles.detailSection}>
                                <Text style={styles.detailSectionTitle}>Travel Itinerary</Text>
                                {selectedRequest.itinerary.map((item, idx) => (
                                    <View key={idx} style={styles.itineraryCard}>
                                        <Text style={styles.itineraryTitle}>Leg {idx + 1}</Text>
                                        <Text style={styles.itineraryRoute}>
                                            {item.travel_from} to {item.travel_to}
                                        </Text>
                                        {item.mode_of_travel && (
                                            <Text style={styles.itineraryDetail}>Mode: {item.mode_of_travel}</Text>
                                        )}
                                        {item.departure_date && (
                                            <Text style={styles.itineraryDetail}>
                                                Departure: {item.departure_date?.split('T')[0] || item.departure_date}
                                            </Text>
                                        )}
                                        {item.arrival_date && (
                                            <Text style={styles.itineraryDetail}>
                                                Arrival: {item.arrival_date?.split('T')[0] || item.arrival_date}
                                            </Text>
                                        )}
                                        {item.lodging_required && (
                                            <Text style={styles.itineraryDetail}>
                                                Lodging: {item.preferred_area_for_lodging || 'Required'}
                                            </Text>
                                        )}
                                    </View>
                                ))}
                            </View>
                        )}

                        {/* Costings */}
                        {selectedRequest.costings && selectedRequest.costings.length > 0 && (
                            <View style={styles.detailSection}>
                                <Text style={styles.detailSectionTitle}>Cost Breakdown</Text>
                                {selectedRequest.costings.map((item, idx) => (
                                    <View key={idx} style={styles.costingCard}>
                                        <Text style={styles.costingType}>{item.expense_type}</Text>
                                        <View style={styles.costingRow}>
                                            <Text style={styles.costingLabel}>Sponsored:</Text>
                                            <Text style={styles.costingAmount}>Rs.{item.sponsored_amount?.toFixed(2) || 0}</Text>
                                        </View>
                                        <View style={styles.costingRow}>
                                            <Text style={styles.costingLabel}>Funded:</Text>
                                            <Text style={styles.costingAmount}>Rs.{item.funded_amount?.toFixed(2) || 0}</Text>
                                        </View>
                                        <View style={styles.costingRow}>
                                            <Text style={styles.costingLabel}>Total:</Text>
                                            <Text style={[styles.costingAmount, { fontWeight: '700' }]}>
                                                Rs.{item.total_amount?.toFixed(2) || 0}
                                            </Text>
                                        </View>
                                    </View>
                                ))}
                                <View style={styles.totalCostingRow}>
                                    <Text style={styles.totalCostingLabel}>Total Estimated:</Text>
                                    <Text style={styles.totalCostingAmount}>
                                        Rs.{selectedRequest.total_estimated_amount?.toFixed(2) || 0}
                                    </Text>
                                </View>
                            </View>
                        )}

                        {/* Timestamps */}
                        <View style={styles.detailSection}>
                            <Text style={styles.detailSectionTitle}>Timeline</Text>
                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>Created:</Text>
                                <Text style={styles.detailValue}>{selectedRequest.creation}</Text>
                            </View>
                            {selectedRequest.modified && (
                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>Modified:</Text>
                                    <Text style={styles.detailValue}>{selectedRequest.modified}</Text>
                                </View>
                            )}
                        </View>

                        <View style={{ height: 40 }} />
                    </ScrollView>
                </View>
            </Modal>
        );
    };

    if (loading && requests.length === 0) {
        return <Loading />;
    }

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Travel Requests</Text>
                <TouchableOpacity
                    style={styles.newRequestButton}
                    onPress={() => setShowForm(true)}
                >
                    <Icon name="plus" size={20} color={colors.white} />
                    <Text style={styles.newRequestText}>New Request</Text>
                </TouchableOpacity>
            </View>

            {/* Filter */}
            <View style={styles.filterContainer}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {['all', 'pending', 'approved', 'rejected'].map((status) => (
                        <TouchableOpacity
                            key={status}
                            style={[
                                styles.filterChip,
                                filterStatus === status && styles.filterChipActive,
                            ]}
                            onPress={() => setFilterStatus(status)}
                        >
                            <Text
                                style={[
                                    styles.filterChipText,
                                    filterStatus === status && styles.filterChipTextActive,
                                ]}
                            >
                                {status.charAt(0).toUpperCase() + status.slice(1)}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>

            {/* Requests List */}
            <ScrollView
                style={styles.requestsList}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                }
            >
                {requests.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Icon name="airplane-off" size={80} color={colors.border} />
                        <Text style={styles.emptyText}>No travel requests</Text>
                        <Text style={styles.emptySubtext}>
                            Tap the + button to create a new request
                        </Text>
                    </View>
                ) : (
                    <>
                        {requests.map(renderRequestCard)}
                        <View style={{ height: 20 }} />
                    </>
                )}
            </ScrollView>

            {/* Form Modal */}
            {renderForm()}

            {/* Details Modal */}
            {renderDetailsModal()}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: colors.background,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: colors.white,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: colors.textPrimary,
    },
    newRequestButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.primary,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
    },
    newRequestText: {
        color: colors.white,
        marginLeft: 6,
        fontWeight: '600',
        fontSize: 13,
    },
    filterContainer: {
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: colors.white,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    filterChip: {
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 16,
        marginRight: 8,
        backgroundColor: colors.cardBackground,
        borderWidth: 1,
        borderColor: colors.border,
    },
    filterChipActive: {
        backgroundColor: colors.primary,
        borderColor: colors.primary,
    },
    filterChipText: {
        fontSize: 12,
        color: colors.textSecondary,
        fontWeight: '500',
    },
    filterChipTextActive: {
        color: colors.white,
        fontWeight: '600',
    },
    requestsList: {
        flex: 1,
        paddingHorizontal: 12,
    },
    requestCard: {
        backgroundColor: colors.white,
        borderRadius: 10,
        padding: 12,
        marginTop: 10,
        borderWidth: 1,
        borderColor: colors.border,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
        elevation: 2,
    },
    requestHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    requestType: {
        fontSize: 14,
        fontWeight: '700',
        color: colors.primary,
    },
    statusBadge: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 8,
    },
    statusText: {
        color: colors.white,
        fontSize: 10,
        fontWeight: '600',
    },
    requestPurpose: {
        fontSize: 13,
        fontWeight: '600',
        color: colors.textPrimary,
        marginBottom: 4,
    },
    routeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 4,
    },
    routeText: {
        fontSize: 12,
        color: colors.textSecondary,
        marginLeft: 6,
    },
    requestDescription: {
        fontSize: 11,
        color: colors.textSecondary,
        marginTop: 4,
        fontStyle: 'italic',
    },
    requestFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 10,
        paddingTop: 10,
        borderTopWidth: 1,
        borderTopColor: colors.border,
    },
    requestDate: {
        fontSize: 11,
        color: colors.textSecondary,
    },
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
    },
    emptyText: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.textSecondary,
        marginTop: 12,
    },
    emptySubtext: {
        fontSize: 12,
        color: colors.textSecondary,
        marginTop: 6,
    },
    // Modal styles
    modalContainer: {
        flex: 1,
        backgroundColor: colors.white,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    modalTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.textPrimary,
    },
    submitButton: {
        color: colors.primary,
        fontWeight: '700',
        fontSize: 15,
    },
    formScroll: {
        flex: 1,
        padding: 16,
    },
    inputGroup: {
        marginBottom: 12,
    },
    label: {
        fontSize: 13,
        fontWeight: '600',
        color: colors.textPrimary,
        marginBottom: 6,
    },
    smallLabel: {
        fontSize: 11,
        fontWeight: '500',
        color: colors.textSecondary,
        marginBottom: 4,
        marginTop: 8,
    },
    required: {
        color: colors.error,
    },
    input: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 8,
        padding: 10,
        fontSize: 14,
        backgroundColor: colors.cardBackground,
    },
    textArea: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 8,
        padding: 10,
        fontSize: 14,
        minHeight: 80,
        textAlignVertical: 'top',
        backgroundColor: colors.cardBackground,
    },
    pickerContainer: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 8,
        backgroundColor: colors.cardBackground,
    },
    picker: {
        height: 50,
    },
    sectionTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: colors.primary,
        marginTop: 20,
        marginBottom: 10,
        borderBottomWidth: 2,
        borderBottomColor: colors.primary,
        paddingBottom: 6,
    },
    itemCard: {
        backgroundColor: colors.cardBackground,
        borderRadius: 10,
        padding: 12,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: colors.border,
    },
    itemCardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    itemCardTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.primary,
    },
    removeBtn: {
        backgroundColor: colors.error,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 6,
    },
    removeBtnText: {
        color: colors.white,
        fontSize: 11,
        fontWeight: '600',
    },
    rowInputs: {
        flexDirection: 'row',
    },
    dateButton: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 8,
        padding: 10,
        backgroundColor: colors.white,
    },
    dateButtonText: {
        fontSize: 13,
        color: colors.textPrimary,
        marginLeft: 8,
    },
    checkboxRow: {
        marginTop: 10,
    },
    checkbox: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    checkboxLabel: {
        marginLeft: 8,
        fontSize: 13,
        color: colors.textPrimary,
    },
    addButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: colors.primary,
        borderStyle: 'dashed',
        borderRadius: 10,
        padding: 12,
        marginBottom: 16,
    },
    addButtonText: {
        color: colors.primary,
        fontSize: 13,
        fontWeight: '600',
        marginLeft: 6,
    },
    costTotalRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 8,
        paddingTop: 8,
        borderTopWidth: 1,
        borderTopColor: colors.border,
    },
    costTotalLabel: {
        fontSize: 12,
        color: colors.textSecondary,
    },
    costTotalValue: {
        fontSize: 12,
        fontWeight: '600',
        color: colors.textPrimary,
    },
    totalContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: colors.primary + '15',
        borderRadius: 10,
        padding: 14,
        marginBottom: 16,
    },
    totalLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.textPrimary,
    },
    totalAmount: {
        fontSize: 18,
        fontWeight: '700',
        color: colors.success,
    },
    // Detail Modal styles
    detailsContent: {
        flex: 1,
        padding: 14,
    },
    detailSection: {
        marginBottom: 20,
    },
    detailSectionTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: colors.textPrimary,
        marginBottom: 10,
    },
    detailRow: {
        flexDirection: 'row',
        marginBottom: 7,
        alignItems: 'flex-start',
    },
    detailLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: colors.textSecondary,
        width: 100,
    },
    detailValue: {
        fontSize: 12,
        color: colors.textPrimary,
        flex: 1,
    },
    itineraryCard: {
        backgroundColor: colors.cardBackground,
        borderRadius: 8,
        padding: 10,
        marginBottom: 8,
    },
    itineraryTitle: {
        fontSize: 12,
        fontWeight: '700',
        color: colors.primary,
        marginBottom: 4,
    },
    itineraryRoute: {
        fontSize: 13,
        fontWeight: '600',
        color: colors.textPrimary,
        marginBottom: 4,
    },
    itineraryDetail: {
        fontSize: 11,
        color: colors.textSecondary,
        marginTop: 2,
    },
    costingCard: {
        backgroundColor: colors.cardBackground,
        borderRadius: 8,
        padding: 10,
        marginBottom: 8,
    },
    costingType: {
        fontSize: 12,
        fontWeight: '700',
        color: colors.primary,
        marginBottom: 6,
    },
    costingRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 3,
    },
    costingLabel: {
        fontSize: 11,
        color: colors.textSecondary,
    },
    costingAmount: {
        fontSize: 11,
        color: colors.textPrimary,
    },
    totalCostingRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingTop: 10,
        marginTop: 8,
        borderTopWidth: 1,
        borderTopColor: colors.border,
    },
    totalCostingLabel: {
        fontSize: 13,
        fontWeight: '600',
        color: colors.textPrimary,
    },
    totalCostingAmount: {
        fontSize: 15,
        fontWeight: '700',
        color: colors.success,
    },
});

export default TravelRequestScreen;
