import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Alert,
    RefreshControl,
    Modal,
    TextInput,
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
import apiService from '../../services/api.service';

const TravelRequestApproval = ({ navigation }) => {
    // Main states
    const [activeTab, setActiveTab] = useState('pending'); // pending, apply, history, statistics
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [requests, setRequests] = useState([]);
    const [statistics, setStatistics] = useState({});
    const [filterStatus, setFilterStatus] = useState('');

    // Detail modal states
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [showDetailsModal, setShowDetailsModal] = useState(false);

    // Action modal states  
    const [showActionModal, setShowActionModal] = useState(false);
    const [actionType, setActionType] = useState(null);
    const [actionReason, setActionReason] = useState('');

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

    useEffect(() => {
        loadInitialData();
    }, []);

    useEffect(() => {
        if (activeTab === 'pending' || activeTab === 'history' || activeTab === 'statistics') {
            loadRequests();
        }
    }, [activeTab, filterStatus]);

    const loadInitialData = async () => {
        await Promise.all([
            loadEmployees(),
            loadPurposes(),
            loadExpenseTypes(),
        ]);
    };

    const loadEmployees = async () => {
        try {
            const response = await apiService.getAllEmployees();
            if (response.success && response.data?.message) {
                setEmployees(Array.isArray(response.data.message) ? response.data.message : []);
            }
        } catch (error) {
            console.error('Load employees error:', error);
        }
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

    const loadRequests = async () => {
        setLoading(true);
        try {
            const filters = { limit: 500 };
            
            if (activeTab === 'pending') {
                filters.status = 'pending';
            } else if (activeTab === 'history' && filterStatus) {
                filters.status = filterStatus;
            }

            console.log('[Admin] Fetching travel requests with filters:', filters);
            const response = await apiService.getAdminTravelRequests(filters);
            console.log('[Admin] Travel Requests Response:', response);

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
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadRequests();
        setRefreshing(false);
    }, [activeTab, filterStatus]);

    const handleViewDetails = async (request) => {
        try {
            setLoading(true);
            const response = await apiService.getTravelRequestDetails(request.name);
            console.log('[Admin] Travel Request Details:', response);
            
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

    const handleAction = (type) => {
        if (!selectedRequest) return;
        setActionType(type);
        setActionReason('');
        setShowDetailsModal(false);
        setShowActionModal(true);
    };

    const confirmAction = async () => {
        if (actionType === 'reject' && !actionReason.trim()) {
            Alert.alert('Validation Error', 'Please provide a reason for rejection');
            return;
        }

        setLoading(true);
        try {
            let response;
            if (actionType === 'approve') {
                response = await apiService.approveTravelRequest(selectedRequest.request_id, actionReason);
            } else {
                response = await apiService.rejectTravelRequest(selectedRequest.request_id, actionReason);
            }

            if (response.success && response.data?.message?.status === 'success') {
                Alert.alert(
                    'Success',
                    'Travel request ' + (actionType === 'approve' ? 'approved' : 'rejected') + ' successfully',
                    [{
                        text: 'OK',
                        onPress: () => {
                            setShowActionModal(false);
                            setSelectedRequest(null);
                            setActionReason('');
                            loadRequests();
                        },
                    }]
                );
            } else {
                Alert.alert('Error', response.data?.message?.message || 'Failed to ' + actionType + ' request');
            }
        } catch (error) {
            console.error('Action error:', error);
            Alert.alert('Error', 'Failed to ' + actionType + ' travel request');
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
            Alert.alert('Validation Error', 'Please select an employee');
            return false;
        }
        if (!formData.travel_type) {
            Alert.alert('Validation Error', 'Please select travel type');
            return false;
        }
        if (!formData.purpose_of_travel) {
            Alert.alert('Validation Error', 'Please select purpose of travel');
            return false;
        }
        return true;
    };

    const handleApplySubmit = async () => {
        if (!validateApplyForm()) return;

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

            console.log('Admin submitting travel request:', travelData);
            const response = await apiService.submitTravelRequest(travelData);

            if (response.success && response.data?.message?.status === 'success') {
                Alert.alert(
                    'Success',
                    'Travel request created successfully!\nRequest ID: ' + response.data.message.request_id,
                    [{
                        text: 'OK',
                        onPress: () => {
                            resetApplyForm();
                            setActiveTab('pending');
                            loadRequests();
                        },
                    }]
                );
            } else {
                Alert.alert('Error', response.data?.message?.message || 'Failed to create travel request');
            }
        } catch (error) {
            console.error('Submit travel request error:', error);
            Alert.alert('Error', 'Failed to create travel request');
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

    const getStatusColor = (status) => {
        switch (status) {
            case 'Pending': return colors.warning;
            case 'Approved': return colors.success;
            case 'Rejected': return colors.error;
            default: return colors.textSecondary;
        }
    };

    const calculateTotalCost = () => {
        return costings.reduce((sum, c) => sum + (parseFloat(c.total_amount) || 0), 0);
    };

    // Render functions
    const renderRequestCard = (request) => (
        <TouchableOpacity
            key={request.name}
            style={styles.requestCard}
            onPress={() => handleViewDetails(request)}
        >
            <View style={styles.cardHeader}>
                <View style={styles.cardHeaderLeft}>
                    <Icon name="account" size={20} color={colors.primary} />
                    <View style={{ marginLeft: 8, flex: 1 }}>
                        <Text style={styles.employeeName}>{request.employee_name}</Text>
                        <Text style={styles.departmentText}>{request.department || 'N/A'}</Text>
                    </View>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(request.status_label) }]}>
                    <Text style={styles.statusText}>{request.status_label}</Text>
                </View>
            </View>

            <View style={styles.cardBody}>
                <View style={styles.infoRow}>
                    <Icon name="airplane" size={16} color={colors.textSecondary} />
                    <Text style={styles.infoText}>{request.travel_type}</Text>
                </View>
                <View style={styles.infoRow}>
                    <Icon name="target" size={16} color={colors.textSecondary} />
                    <Text style={styles.infoText}>{request.purpose_of_travel}</Text>
                </View>
                {request.travel_from && request.travel_to && (
                    <View style={styles.infoRow}>
                        <Icon name="map-marker" size={16} color={colors.textSecondary} />
                        <Text style={styles.infoText}>{request.travel_from} to {request.travel_to}</Text>
                    </View>
                )}
                {request.description && (
                    <Text style={styles.description} numberOfLines={2}>{request.description}</Text>
                )}
            </View>

            <View style={styles.cardFooter}>
                <Text style={styles.dateText}>
                    <Icon name="calendar" size={14} color={colors.textSecondary} /> {request.creation?.split(' ')[0]}
                </Text>
                <Icon name="chevron-right" size={20} color={colors.textSecondary} />
            </View>
        </TouchableOpacity>
    );

    const renderPendingTab = () => (
        <ScrollView
            style={styles.tabContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
            {loading ? (
                <Loading />
            ) : requests.length === 0 ? (
                <View style={styles.emptyState}>
                    <Icon name="clipboard-text-outline" size={80} color={colors.border} />
                    <Text style={styles.emptyText}>No pending travel requests</Text>
                    <Text style={styles.emptySubtext}>All requests have been processed</Text>
                </View>
            ) : (
                <>
                    <View style={styles.pendingHeader}>
                        <Text style={styles.pendingCount}>
                            {requests.length} Pending Approval{requests.length !== 1 ? 's' : ''}
                        </Text>
                    </View>
                    {requests.map(renderRequestCard)}
                    <View style={styles.bottomPadding} />
                </>
            )}
        </ScrollView>
    );

    const renderApplyTab = () => (
        <ScrollView
            style={styles.tabContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
            {/* My Travel Request Button */}
            <TouchableOpacity
                style={styles.myTravelButton}
                onPress={() => navigation.navigate('MyTravelRequest')}
            >
                <Text style={styles.myTravelButtonText}>+ Apply My Travel Request</Text>
            </TouchableOpacity>

            <View style={styles.applySection}>
                <Text style={styles.applySectionTitle}>Create Travel Request for Employee</Text>

                {/* Employee Selector */}
                <Text style={styles.label}>Select Employee *</Text>
                <View style={styles.pickerContainer}>
                    <Picker
                        selectedValue={applyEmployee}
                        onValueChange={setApplyEmployee}
                        style={styles.picker}
                    >
                        <Picker.Item label="Select employee..." value="" />
                        {employees.map((emp) => (
                            <Picker.Item
                                key={emp.name}
                                label={emp.employee_name + ' (' + emp.name + ')'}
                                value={emp.name}
                            />
                        ))}
                    </Picker>
                </View>

                {/* Travel Type */}
                <Text style={styles.label}>Travel Type *</Text>
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

                {/* Purpose */}
                <Text style={styles.label}>Purpose of Travel *</Text>
                <View style={styles.pickerContainer}>
                    <Picker
                        selectedValue={formData.purpose_of_travel}
                        onValueChange={(value) => setFormData({ ...formData, purpose_of_travel: value })}
                        style={styles.picker}
                    >
                        <Picker.Item label="Select purpose..." value="" />
                        {purposes.map((purpose) => (
                            <Picker.Item key={purpose} label={purpose} value={purpose} />
                        ))}
                    </Picker>
                </View>

                {/* Description */}
                <Text style={styles.label}>Description</Text>
                <Input
                    value={formData.description}
                    onChangeText={(text) => setFormData({ ...formData, description: text })}
                    placeholder="Travel details..."
                    multiline
                    numberOfLines={3}
                />

                {/* Funding */}
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

                {/* Itinerary Section */}
                <Text style={styles.sectionHeader}>Travel Itinerary</Text>
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

                        <View style={styles.rowInputs}>
                            <View style={{ flex: 1, marginRight: 8 }}>
                                <Text style={styles.smallLabel}>From</Text>
                                <Input
                                    value={item.travel_from}
                                    onChangeText={(text) => updateItineraryItem(index, 'travel_from', text)}
                                    placeholder="Origin"
                                />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.smallLabel}>To</Text>
                                <Input
                                    value={item.travel_to}
                                    onChangeText={(text) => updateItineraryItem(index, 'travel_to', text)}
                                    placeholder="Destination"
                                />
                            </View>
                        </View>

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
                            </Picker>
                        </View>

                        <View style={styles.rowInputs}>
                            <View style={{ flex: 1, marginRight: 8 }}>
                                <Text style={styles.smallLabel}>Departure</Text>
                                <TouchableOpacity
                                    style={styles.dateButton}
                                    onPress={() => setShowDeparturePicker({ show: true, index })}
                                >
                                    <Text style={styles.dateText}>{item.departure_date.toLocaleDateString()}</Text>
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
                                <Text style={styles.smallLabel}>Arrival</Text>
                                <TouchableOpacity
                                    style={styles.dateButton}
                                    onPress={() => setShowArrivalPicker({ show: true, index })}
                                >
                                    <Text style={styles.dateText}>{item.arrival_date.toLocaleDateString()}</Text>
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
                                <Text style={styles.smallLabel}>Preferred Lodging Area</Text>
                                <Input
                                    value={item.preferred_area_for_lodging}
                                    onChangeText={(text) => updateItineraryItem(index, 'preferred_area_for_lodging', text)}
                                    placeholder="Enter preferred area"
                                />
                            </>
                        )}
                    </View>
                ))}

                <TouchableOpacity onPress={addItineraryItem} style={styles.addButton}>
                    <Text style={styles.addButtonText}>+ Add Another Leg</Text>
                </TouchableOpacity>

                {/* Costings Section */}
                <Text style={styles.sectionHeader}>Costing Details</Text>
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
                                <Picker.Item label="Select type..." value="" />
                                {expenseTypes.map((type) => (
                                    <Picker.Item key={type.name} label={type.name} value={type.name} />
                                ))}
                            </Picker>
                        </View>

                        <View style={styles.rowInputs}>
                            <View style={{ flex: 1, marginRight: 8 }}>
                                <Text style={styles.smallLabel}>Sponsored (Rs.)</Text>
                                <Input
                                    value={item.sponsored_amount}
                                    onChangeText={(text) => updateCostingItem(index, 'sponsored_amount', text)}
                                    placeholder="0"
                                    keyboardType="decimal-pad"
                                />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.smallLabel}>Funded (Rs.)</Text>
                                <Input
                                    value={item.funded_amount}
                                    onChangeText={(text) => updateCostingItem(index, 'funded_amount', text)}
                                    placeholder="0"
                                    keyboardType="decimal-pad"
                                />
                            </View>
                        </View>

                        <Text style={styles.smallLabel}>Total: Rs.{item.total_amount || '0'}</Text>
                    </View>
                ))}

                <TouchableOpacity onPress={addCostingItem} style={styles.addButton}>
                    <Text style={styles.addButtonText}>+ Add Cost Item</Text>
                </TouchableOpacity>

                {/* Total Cost Summary */}
                <View style={styles.totalContainer}>
                    <Text style={styles.totalLabel}>Total Estimated Cost:</Text>
                    <Text style={styles.totalAmount}>Rs.{calculateTotalCost().toFixed(2)}</Text>
                </View>

                <Button
                    title="Submit Travel Request"
                    onPress={handleApplySubmit}
                    disabled={loading}
                />
            </View>

            <View style={styles.bottomPadding} />
        </ScrollView>
    );

    const renderHistoryTab = () => (
        <View style={styles.tabContent}>
            {/* Filter Pills */}
            <View style={styles.filterContainer}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <TouchableOpacity
                        onPress={() => setFilterStatus('')}
                        style={[styles.filterPill, !filterStatus && styles.filterPillActive]}
                    >
                        <Text style={[styles.filterText, !filterStatus && styles.filterTextActive]}>All</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => setFilterStatus('approved')}
                        style={[styles.filterPill, filterStatus === 'approved' && styles.filterPillActive]}
                    >
                        <Text style={[styles.filterText, filterStatus === 'approved' && styles.filterTextActive]}>Approved</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => setFilterStatus('rejected')}
                        style={[styles.filterPill, filterStatus === 'rejected' && styles.filterPillActive]}
                    >
                        <Text style={[styles.filterText, filterStatus === 'rejected' && styles.filterTextActive]}>Rejected</Text>
                    </TouchableOpacity>
                </ScrollView>
            </View>

            <ScrollView
                style={styles.requestsList}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            >
                {loading ? (
                    <Loading />
                ) : requests.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyText}>No travel requests found</Text>
                    </View>
                ) : (
                    <>
                        {requests.map(renderRequestCard)}
                        <View style={styles.bottomPadding} />
                    </>
                )}
            </ScrollView>
        </View>
    );

    const renderStatisticsTab = () => (
        <ScrollView
            style={styles.tabContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
            <View style={styles.statsContainer}>
                <Text style={styles.statsTitle}>Overall Statistics</Text>

                <View style={styles.statsGrid}>
                    <View style={styles.statCard}>
                        <Text style={styles.statValue}>{statistics.total_requests || 0}</Text>
                        <Text style={styles.statLabel}>Total Requests</Text>
                    </View>
                    <View style={styles.statCard}>
                        <Text style={[styles.statValue, { color: colors.warning }]}>{statistics.pending || 0}</Text>
                        <Text style={styles.statLabel}>Pending</Text>
                    </View>
                    <View style={styles.statCard}>
                        <Text style={[styles.statValue, { color: colors.success }]}>{statistics.approved || 0}</Text>
                        <Text style={styles.statLabel}>Approved</Text>
                    </View>
                    <View style={styles.statCard}>
                        <Text style={[styles.statValue, { color: colors.error }]}>{statistics.rejected || 0}</Text>
                        <Text style={styles.statLabel}>Rejected</Text>
                    </View>
                </View>

                {/* By Type */}
                {statistics.by_type && (
                    <View style={styles.statsSection}>
                        <Text style={styles.statsSectionTitle}>By Travel Type</Text>
                        {Object.entries(statistics.by_type).map(([type, count]) => (
                            <View key={type} style={styles.statsRow}>
                                <Text style={styles.statsRowLabel}>{type}</Text>
                                <Text style={styles.statsRowValue}>{count}</Text>
                            </View>
                        ))}
                    </View>
                )}

                {/* By Department */}
                {statistics.by_department && Object.keys(statistics.by_department).length > 0 && (
                    <View style={styles.statsSection}>
                        <Text style={styles.statsSectionTitle}>By Department</Text>
                        {Object.entries(statistics.by_department).map(([dept, count]) => (
                            <View key={dept} style={styles.statsRow}>
                                <Text style={styles.statsRowLabel}>{dept}</Text>
                                <Text style={styles.statsRowValue}>{count}</Text>
                            </View>
                        ))}
                    </View>
                )}
            </View>
            <View style={styles.bottomPadding} />
        </ScrollView>
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

                    <ScrollView style={styles.modalContent}>
                        {/* Employee Info */}
                        <View style={styles.detailSection}>
                            <Text style={styles.detailSectionTitle}>Employee Information</Text>
                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>Name:</Text>
                                <Text style={styles.detailValue}>{selectedRequest.employee_name}</Text>
                            </View>
                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>ID:</Text>
                                <Text style={styles.detailValue}>{selectedRequest.employee}</Text>
                            </View>
                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>Company:</Text>
                                <Text style={styles.detailValue}>{selectedRequest.company}</Text>
                            </View>
                        </View>

                        {/* Travel Details */}
                        <View style={styles.detailSection}>
                            <Text style={styles.detailSectionTitle}>Travel Details</Text>
                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>Type:</Text>
                                <Text style={styles.detailValue}>{selectedRequest.travel_type}</Text>
                            </View>
                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>Purpose:</Text>
                                <Text style={styles.detailValue}>{selectedRequest.purpose_of_travel}</Text>
                            </View>
                            {selectedRequest.travel_funding && (
                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>Funding:</Text>
                                    <Text style={styles.detailValue}>{selectedRequest.travel_funding}</Text>
                                </View>
                            )}
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
                                <Text style={styles.detailSectionTitle}>Costing Details</Text>
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

                        {/* Status */}
                        <View style={styles.detailSection}>
                            <Text style={styles.detailSectionTitle}>Status</Text>
                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>Status:</Text>
                                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(selectedRequest.status_label) }]}>
                                    <Text style={styles.statusText}>{selectedRequest.status_label}</Text>
                                </View>
                            </View>
                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>Created:</Text>
                                <Text style={styles.detailValue}>{selectedRequest.creation}</Text>
                            </View>
                        </View>

                        <View style={{ height: 100 }} />
                    </ScrollView>

                    {/* Action Buttons */}
                    {selectedRequest.status_label === 'Pending' && (
                        <View style={styles.actionButtons}>
                            <TouchableOpacity
                                style={[styles.actionButton, styles.rejectBtn]}
                                onPress={() => handleAction('reject')}
                            >
                                <Icon name="close-circle" size={20} color={colors.white} />
                                <Text style={styles.actionButtonText}>Reject</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.actionButton, styles.approveBtn]}
                                onPress={() => handleAction('approve')}
                            >
                                <Icon name="check-circle" size={20} color={colors.white} />
                                <Text style={styles.actionButtonText}>Approve</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>
            </Modal>
        );
    };

    const renderActionModal = () => (
        <Modal
            visible={showActionModal}
            transparent
            animationType="fade"
            onRequestClose={() => setShowActionModal(false)}
        >
            <View style={styles.actionModalOverlay}>
                <View style={styles.actionModalContent}>
                    <Text style={styles.actionModalTitle}>
                        {actionType === 'approve' ? 'Approve Request' : 'Reject Request'}
                    </Text>
                    <Text style={styles.actionModalSubtitle}>
                        {actionType === 'approve'
                            ? 'Optional: Add remarks'
                            : 'Please provide a reason for rejection'}
                    </Text>

                    <TextInput
                        style={styles.actionInput}
                        value={actionReason}
                        onChangeText={setActionReason}
                        placeholder={actionType === 'approve' ? 'Remarks (optional)' : 'Rejection reason *'}
                        multiline
                        numberOfLines={4}
                        textAlignVertical="top"
                    />

                    <View style={styles.actionModalButtons}>
                        <TouchableOpacity
                            style={[styles.actionModalButton, styles.actionModalCancelBtn]}
                            onPress={() => setShowActionModal(false)}
                        >
                            <Text style={styles.actionModalCancelText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[
                                styles.actionModalButton,
                                actionType === 'approve' ? styles.actionModalApproveBtn : styles.actionModalRejectBtn
                            ]}
                            onPress={confirmAction}
                            disabled={loading}
                        >
                            {loading ? (
                                <ActivityIndicator size="small" color={colors.white} />
                            ) : (
                                <Text style={styles.actionModalConfirmText}>
                                    {actionType === 'approve' ? 'Approve' : 'Reject'}
                                </Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );

    return (
        <View style={styles.container}>
            {/* Tab Navigation */}
            <View style={styles.tabBar}>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'pending' && styles.activeTab]}
                    onPress={() => setActiveTab('pending')}
                >
                    <Text style={[styles.tabText, activeTab === 'pending' && styles.activeTabText]}>Pending</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'apply' && styles.activeTab]}
                    onPress={() => setActiveTab('apply')}
                >
                    <Text style={[styles.tabText, activeTab === 'apply' && styles.activeTabText]}>Apply</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'history' && styles.activeTab]}
                    onPress={() => setActiveTab('history')}
                >
                    <Text style={[styles.tabText, activeTab === 'history' && styles.activeTabText]}>History</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'statistics' && styles.activeTab]}
                    onPress={() => setActiveTab('statistics')}
                >
                    <Text style={[styles.tabText, activeTab === 'statistics' && styles.activeTabText]}>Statistics</Text>
                </TouchableOpacity>
            </View>

            {/* Tab Content */}
            {activeTab === 'pending' && renderPendingTab()}
            {activeTab === 'apply' && renderApplyTab()}
            {activeTab === 'history' && renderHistoryTab()}
            {activeTab === 'statistics' && renderStatisticsTab()}

            {/* Modals */}
            {renderDetailsModal()}
            {renderActionModal()}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    tabBar: {
        flexDirection: 'row',
        backgroundColor: colors.white,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        elevation: 1,
    },
    tab: {
        flex: 1,
        paddingVertical: 12,
        alignItems: 'center',
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
    },
    activeTab: {
        borderBottomColor: colors.primary,
    },
    tabText: {
        fontSize: 12,
        color: colors.textSecondary,
        fontWeight: '500',
    },
    activeTabText: {
        color: colors.primary,
        fontWeight: '600',
    },
    tabContent: {
        flex: 1,
    },
    pendingHeader: {
        padding: 12,
        backgroundColor: colors.white,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    pendingCount: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.textPrimary,
    },
    requestCard: {
        backgroundColor: colors.white,
        marginHorizontal: 12,
        marginTop: 10,
        borderRadius: 10,
        padding: 12,
        borderWidth: 1,
        borderColor: colors.border,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
        elevation: 2,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 10,
    },
    cardHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    employeeName: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.textPrimary,
    },
    departmentText: {
        fontSize: 11,
        color: colors.textSecondary,
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
    cardBody: {
        marginBottom: 10,
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 5,
    },
    infoText: {
        fontSize: 12,
        color: colors.textSecondary,
        marginLeft: 8,
    },
    description: {
        fontSize: 11,
        color: colors.textSecondary,
        marginTop: 4,
        fontStyle: 'italic',
    },
    cardFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 10,
        borderTopWidth: 1,
        borderTopColor: colors.border,
    },
    dateText: {
        fontSize: 11,
        color: colors.textSecondary,
    },
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 50,
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
    // Apply Tab Styles
    myTravelButton: {
        backgroundColor: colors.success,
        marginHorizontal: 12,
        marginTop: 12,
        paddingVertical: 14,
        borderRadius: 10,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    myTravelButtonText: {
        color: colors.white,
        fontSize: 15,
        fontWeight: '600',
    },
    applySection: {
        padding: 12,
    },
    applySectionTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.textPrimary,
        marginBottom: 16,
        marginTop: 8,
    },
    label: {
        fontSize: 13,
        fontWeight: '600',
        color: colors.textPrimary,
        marginBottom: 6,
        marginTop: 12,
    },
    smallLabel: {
        fontSize: 11,
        fontWeight: '500',
        color: colors.textSecondary,
        marginBottom: 4,
        marginTop: 8,
    },
    pickerContainer: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 8,
        backgroundColor: colors.white,
    },
    picker: {
        height: 50,
    },
    sectionHeader: {
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
        backgroundColor: colors.white,
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
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 8,
        padding: 12,
        backgroundColor: colors.white,
    },
    checkboxRow: {
        marginTop: 8,
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
        borderWidth: 1,
        borderColor: colors.primary,
        borderStyle: 'dashed',
        borderRadius: 10,
        padding: 14,
        alignItems: 'center',
        marginBottom: 16,
    },
    addButtonText: {
        color: colors.primary,
        fontSize: 14,
        fontWeight: '600',
    },
    totalContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: colors.cardBackground,
        borderRadius: 10,
        padding: 16,
        marginBottom: 16,
    },
    totalLabel: {
        fontSize: 15,
        fontWeight: '600',
        color: colors.textPrimary,
    },
    totalAmount: {
        fontSize: 18,
        fontWeight: '700',
        color: colors.success,
    },
    // Filter styles
    filterContainer: {
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: colors.white,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    filterPill: {
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 16,
        backgroundColor: colors.cardBackground,
        marginRight: 8,
        borderWidth: 1,
        borderColor: colors.border,
    },
    filterPillActive: {
        backgroundColor: colors.primary,
        borderColor: colors.primary,
    },
    filterText: {
        fontSize: 12,
        color: colors.textSecondary,
        fontWeight: '500',
    },
    filterTextActive: {
        color: colors.white,
        fontWeight: '600',
    },
    requestsList: {
        flex: 1,
    },
    // Statistics styles
    statsContainer: {
        padding: 12,
    },
    statsTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.textPrimary,
        marginBottom: 12,
    },
    statsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginHorizontal: -5,
        marginBottom: 16,
    },
    statCard: {
        width: '50%',
        padding: 5,
    },
    statValue: {
        fontSize: 20,
        fontWeight: '700',
        color: colors.primary,
        marginBottom: 3,
    },
    statLabel: {
        fontSize: 11,
        color: colors.textSecondary,
        fontWeight: '500',
    },
    statsSection: {
        backgroundColor: colors.white,
        borderRadius: 10,
        padding: 12,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: colors.border,
    },
    statsSectionTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.textPrimary,
        marginBottom: 10,
    },
    statsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 6,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    statsRowLabel: {
        fontSize: 13,
        color: colors.textSecondary,
    },
    statsRowValue: {
        fontSize: 13,
        fontWeight: '600',
        color: colors.textPrimary,
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
        padding: 14,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    modalTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.textPrimary,
    },
    modalContent: {
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
    actionButtons: {
        flexDirection: 'row',
        padding: 12,
        backgroundColor: colors.white,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        gap: 10,
    },
    actionButton: {
        flex: 1,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 10,
        borderRadius: 8,
        gap: 6,
    },
    approveBtn: {
        backgroundColor: colors.success,
    },
    rejectBtn: {
        backgroundColor: colors.error,
    },
    actionButtonText: {
        color: colors.white,
        fontSize: 13,
        fontWeight: '600',
    },
    actionModalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    actionModalContent: {
        backgroundColor: colors.white,
        borderRadius: 12,
        padding: 16,
        width: '100%',
        maxWidth: 400,
    },
    actionModalTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.textPrimary,
        marginBottom: 6,
    },
    actionModalSubtitle: {
        fontSize: 12,
        color: colors.textSecondary,
        marginBottom: 14,
    },
    actionInput: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 8,
        padding: 10,
        fontSize: 13,
        backgroundColor: colors.cardBackground,
        minHeight: 90,
        marginBottom: 14,
        textAlignVertical: 'top',
    },
    actionModalButtons: {
        flexDirection: 'row',
        gap: 10,
    },
    actionModalButton: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    actionModalCancelBtn: {
        backgroundColor: colors.cardBackground,
        borderWidth: 1,
        borderColor: colors.border,
    },
    actionModalApproveBtn: {
        backgroundColor: colors.success,
    },
    actionModalRejectBtn: {
        backgroundColor: colors.error,
    },
    actionModalCancelText: {
        fontSize: 13,
        fontWeight: '600',
        color: colors.textPrimary,
    },
    actionModalConfirmText: {
        fontSize: 13,
        fontWeight: '600',
        color: colors.white,
    },
    bottomPadding: {
        height: 60,
    },
});

export default TravelRequestApproval;
