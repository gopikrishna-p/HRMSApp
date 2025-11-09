import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Alert,
    RefreshControl,
    TextInput
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';
import { colors } from '../../theme/colors';
import Button from '../../components/common/Button';
import Input from '../../components/common/Input';
import Loading from '../../components/common/Loading';
import apiService from '../../services/api.service';

const TravelRequestScreen = ({ navigation }) => {
    const [activeTab, setActiveTab] = useState('submit'); // submit, history
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [employeeId, setEmployeeId] = useState(null);
    
    // Submit form state
    const [travelType, setTravelType] = useState('Domestic');
    const [purposeOfTravel, setPurposeOfTravel] = useState('');
    const [description, setDescription] = useState('');
    const [itinerary, setItinerary] = useState([{
        from_date: new Date(),
        to_date: new Date(),
        from_location: '',
        to_location: '',
        travel_mode: 'Flight',
        lodging_required: false
    }]);
    const [costings, setCostings] = useState([]);
    const [travelFunding, setTravelFunding] = useState('Fully Sponsored');
    const [sponsorDetails, setSponsorDetails] = useState('');
    
    // Dropdown data
    const [purposes, setPurposes] = useState([]);
    
    // History state
    const [requests, setRequests] = useState([]);
    const [filterDocstatus, setFilterDocstatus] = useState(''); // '', 0, 1, 2
    const [statusSummary, setStatusSummary] = useState({});
    
    // Date picker state
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [datePickerConfig, setDatePickerConfig] = useState({
        index: null,
        field: '', // from_date, to_date
        value: new Date()
    });

    useEffect(() => {
        loadInitialData();
    }, []);

    const loadInitialData = async () => {
        setLoading(true);
        try {
            // Get employee ID
            const empResponse = await apiService.getCurrentEmployee();
            if (empResponse.success && empResponse.data?.message) {
                const empId = empResponse.data.message.name;
                setEmployeeId(empId);
            }

            // Get purposes of travel
            const purposesResponse = await apiService.getPurposeOfTravelList();
            if (purposesResponse.success && purposesResponse.data?.message) {
                setPurposes(purposesResponse.data.message);
            }
        } catch (error) {
            console.error('Error loading initial data:', error);
            Alert.alert('Error', 'Failed to load employee information');
        } finally {
            setLoading(false);
        }
    };

    const loadRequests = async () => {
        if (!employeeId) return;
        
        setLoading(true);
        try {
            const filters = {
                employee: employeeId,
                limit: 100
            };

            if (filterDocstatus !== '') {
                filters.docstatus = parseInt(filterDocstatus);
            }

            const response = await apiService.getEmployeeTravelRequests(filters);
            
            if (response.success && response.data?.message) {
                const data = response.data.message;
                setRequests(data.travel_requests || []);
                setStatusSummary(data.status_summary || {});
            }
        } catch (error) {
            console.error('Error loading travel requests:', error);
            Alert.alert('Error', 'Failed to load travel requests');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'history' && employeeId) {
            loadRequests();
        }
    }, [activeTab, employeeId, filterDocstatus]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadRequests();
        setRefreshing(false);
    }, [employeeId, filterDocstatus]);

    const addItineraryItem = () => {
        setItinerary([...itinerary, {
            from_date: new Date(),
            to_date: new Date(),
            from_location: '',
            to_location: '',
            travel_mode: 'Flight',
            lodging_required: false
        }]);
    };

    const removeItineraryItem = (index) => {
        if (itinerary.length === 1) {
            Alert.alert('Error', 'At least one itinerary item is required');
            return;
        }
        const newItinerary = itinerary.filter((_, i) => i !== index);
        setItinerary(newItinerary);
    };

    const updateItineraryItem = (index, field, value) => {
        const newItinerary = [...itinerary];
        newItinerary[index][field] = value;
        setItinerary(newItinerary);
    };

    const addCostingItem = () => {
        setCostings([...costings, {
            expense_type: '',
            amount: ''
        }]);
    };

    const removeCostingItem = (index) => {
        const newCostings = costings.filter((_, i) => i !== index);
        setCostings(newCostings);
    };

    const updateCostingItem = (index, field, value) => {
        const newCostings = [...costings];
        newCostings[index][field] = value;
        setCostings(newCostings);
    };

    const showDatePickerModal = (index, field) => {
        setDatePickerConfig({
            index,
            field,
            value: itinerary[index][field] || new Date()
        });
        setShowDatePicker(true);
    };

    const handleDateChange = (event, selectedDate) => {
        setShowDatePicker(false);
        if (selectedDate && datePickerConfig.index !== null) {
            updateItineraryItem(datePickerConfig.index, datePickerConfig.field, selectedDate);
        }
    };

    const validateForm = () => {
        if (!employeeId) {
            Alert.alert('Error', 'Employee information not loaded');
            return false;
        }

        if (!travelType) {
            Alert.alert('Error', 'Please select travel type');
            return false;
        }

        if (!purposeOfTravel) {
            Alert.alert('Error', 'Please select purpose of travel');
            return false;
        }

        if (!description.trim()) {
            Alert.alert('Error', 'Please enter description');
            return false;
        }

        if (itinerary.length === 0) {
            Alert.alert('Error', 'At least one itinerary item is required');
            return false;
        }

        for (let i = 0; i < itinerary.length; i++) {
            const item = itinerary[i];
            if (!item.from_location.trim()) {
                Alert.alert('Error', `From location is required for itinerary item ${i + 1}`);
                return false;
            }
            if (!item.to_location.trim()) {
                Alert.alert('Error', `To location is required for itinerary item ${i + 1}`);
                return false;
            }
            if (!item.travel_mode) {
                Alert.alert('Error', `Travel mode is required for itinerary item ${i + 1}`);
                return false;
            }
            if (item.to_date < item.from_date) {
                Alert.alert('Error', `To date must be after from date for itinerary item ${i + 1}`);
                return false;
            }
        }

        // Validate costings if any
        for (let i = 0; i < costings.length; i++) {
            const cost = costings[i];
            if (!cost.expense_type.trim()) {
                Alert.alert('Error', `Expense type required for cost estimation ${i + 1}`);
                return false;
            }
            if (!cost.amount || parseFloat(cost.amount) <= 0) {
                Alert.alert('Error', `Valid amount required for cost estimation ${i + 1}`);
                return false;
            }
        }

        return true;
    };

    const handleSubmit = async () => {
        if (!validateForm()) return;

        setLoading(true);
        try {
            // Prepare itinerary data
            const itineraryData = itinerary.map(item => ({
                from_date: item.from_date.toISOString().split('T')[0],
                to_date: item.to_date.toISOString().split('T')[0],
                from_location: item.from_location.trim(),
                to_location: item.to_location.trim(),
                travel_mode: item.travel_mode,
                lodging_required: item.lodging_required ? 1 : 0
            }));

            // Prepare costing data
            const costingData = costings.map(cost => ({
                expense_type: cost.expense_type.trim(),
                amount: parseFloat(cost.amount)
            }));

            // Prepare options object with all fields
            const options = {
                travel_funding: travelFunding
            };

            if (costingData.length > 0) {
                options.costings = costingData;
            }

            if (sponsorDetails.trim()) {
                options.details_of_sponsor = sponsorDetails.trim();
            }

            console.log('Submitting travel request:', {
                employeeId,
                travelType,
                purposeOfTravel,
                description: description.trim(),
                itineraryData,
                options
            });

            const response = await apiService.submitTravelRequest(
                employeeId,
                travelType,
                purposeOfTravel,
                description.trim(),
                itineraryData,
                options
            );

            console.log('Travel request response:', response);

            // Check if API returned success
            if (!response.success) {
                Alert.alert('Error', response.message || 'Failed to submit travel request');
                return;
            }

            // Success - show message and reset form
            const data = response.data?.message || {};
            Alert.alert(
                'Success',
                `Travel request submitted successfully!\nRequest ID: ${data.request_id || 'N/A'}`,
                [{ text: 'OK', onPress: () => {
                    // Reset form
                    setTravelType('Domestic');
                    setPurposeOfTravel('');
                    setDescription('');
                    setItinerary([{
                        from_date: new Date(),
                        to_date: new Date(),
                        from_location: '',
                        to_location: '',
                        travel_mode: 'Flight',
                        lodging_required: false
                    }]);
                    setCostings([]);
                    setTravelFunding('Fully Sponsored');
                    setSponsorDetails('');
                    setActiveTab('history');
                }}]
            );
        } catch (error) {
            console.error('Submit travel request error:', error);
            Alert.alert('Error', error.message || 'Failed to submit travel request');
        } finally {
            setLoading(false);
        }
    };

    const getDocstatusLabel = (docstatus) => {
        switch(docstatus) {
            case 0: return 'Draft';
            case 1: return 'Submitted';
            case 2: return 'Cancelled';
            default: return 'Unknown';
        }
    };

    const getDocstatusColor = (docstatus) => {
        switch(docstatus) {
            case 0: return colors.warning;
            case 1: return colors.success;
            case 2: return colors.error;
            default: return colors.textSecondary;
        }
    };

    const renderSubmitTab = () => (
        <ScrollView style={styles.tabContent}>
            <View style={styles.formContainer}>
                {/* Travel Type */}
                <View style={styles.formGroup}>
                    <Text style={styles.label}>Travel Type *</Text>
                    <View style={styles.radioGroup}>
                        <TouchableOpacity
                            style={[styles.radioOption, travelType === 'Domestic' && styles.radioOptionSelected]}
                            onPress={() => setTravelType('Domestic')}
                        >
                            <Text style={[styles.radioText, travelType === 'Domestic' && styles.radioTextSelected]}>
                                Domestic
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.radioOption, travelType === 'International' && styles.radioOptionSelected]}
                            onPress={() => setTravelType('International')}
                        >
                            <Text style={[styles.radioText, travelType === 'International' && styles.radioTextSelected]}>
                                International
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Purpose of Travel */}
                <View style={styles.formGroup}>
                    <Text style={styles.label}>Purpose of Travel *</Text>
                    <View style={styles.pickerContainer}>
                        <Picker
                            selectedValue={purposeOfTravel}
                            onValueChange={(value) => setPurposeOfTravel(value)}
                            style={styles.picker}
                        >
                            <Picker.Item label="Select purpose..." value="" />
                            {purposes.map((purpose, idx) => (
                                <Picker.Item key={idx} label={purpose} value={purpose} />
                            ))}
                        </Picker>
                    </View>
                </View>

                {/* Description */}
                <View style={styles.formGroup}>
                    <Text style={styles.label}>Description *</Text>
                    <TextInput
                        style={styles.textArea}
                        value={description}
                        onChangeText={setDescription}
                        placeholder="Provide travel details..."
                        multiline
                        numberOfLines={4}
                        textAlignVertical="top"
                    />
                </View>

                {/* Itinerary Section */}
                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Travel Itinerary *</Text>
                    <TouchableOpacity onPress={addItineraryItem} style={styles.addButton}>
                        <Text style={styles.addButtonText}>+ Add Item</Text>
                    </TouchableOpacity>
                </View>

                {itinerary.map((item, index) => (
                    <View key={index} style={styles.itineraryItem}>
                        <View style={styles.itineraryHeader}>
                            <Text style={styles.itineraryTitle}>Item {index + 1}</Text>
                            {itinerary.length > 1 && (
                                <TouchableOpacity onPress={() => removeItineraryItem(index)}>
                                    <Text style={styles.removeText}>Remove</Text>
                                </TouchableOpacity>
                            )}
                        </View>

                        {/* From Location */}
                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>From Location *</Text>
                            <TextInput
                                style={styles.input}
                                value={item.from_location}
                                onChangeText={(value) => updateItineraryItem(index, 'from_location', value)}
                                placeholder="Starting location"
                            />
                        </View>

                        {/* To Location */}
                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>To Location *</Text>
                            <TextInput
                                style={styles.input}
                                value={item.to_location}
                                onChangeText={(value) => updateItineraryItem(index, 'to_location', value)}
                                placeholder="Destination"
                            />
                        </View>

                        {/* Dates */}
                        <View style={styles.dateRow}>
                            <View style={styles.dateGroup}>
                                <Text style={styles.inputLabel}>From Date *</Text>
                                <TouchableOpacity
                                    style={styles.dateButton}
                                    onPress={() => showDatePickerModal(index, 'from_date')}
                                >
                                    <Text style={styles.dateText}>
                                        {item.from_date.toLocaleDateString()}
                                    </Text>
                                </TouchableOpacity>
                            </View>

                            <View style={styles.dateGroup}>
                                <Text style={styles.inputLabel}>To Date *</Text>
                                <TouchableOpacity
                                    style={styles.dateButton}
                                    onPress={() => showDatePickerModal(index, 'to_date')}
                                >
                                    <Text style={styles.dateText}>
                                        {item.to_date.toLocaleDateString()}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* Travel Mode */}
                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>Travel Mode *</Text>
                            <View style={styles.pickerContainer}>
                                <Picker
                                    selectedValue={item.travel_mode}
                                    onValueChange={(value) => updateItineraryItem(index, 'travel_mode', value)}
                                    style={styles.picker}
                                >
                                    <Picker.Item label="Flight" value="Flight" />
                                    <Picker.Item label="Train" value="Train" />
                                    <Picker.Item label="Bus" value="Bus" />
                                    <Picker.Item label="Car" value="Car" />
                                </Picker>
                            </View>
                        </View>

                        {/* Lodging Required */}
                        <TouchableOpacity
                            style={styles.checkboxRow}
                            onPress={() => updateItineraryItem(index, 'lodging_required', !item.lodging_required)}
                        >
                            <View style={[styles.checkbox, item.lodging_required && styles.checkboxChecked]}>
                                {item.lodging_required && <Text style={styles.checkmark}>✓</Text>}
                            </View>
                            <Text style={styles.checkboxLabel}>Lodging Required</Text>
                        </TouchableOpacity>
                    </View>
                ))}

                {/* Cost Estimation Section (Optional) */}
                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Cost Estimation (Optional)</Text>
                    <TouchableOpacity onPress={addCostingItem} style={styles.addButton}>
                        <Text style={styles.addButtonText}>+ Add Cost</Text>
                    </TouchableOpacity>
                </View>

                {costings.map((cost, index) => (
                    <View key={index} style={styles.costingItem}>
                        <View style={styles.costingHeader}>
                            <Text style={styles.costingTitle}>Cost {index + 1}</Text>
                            <TouchableOpacity onPress={() => removeCostingItem(index)}>
                                <Text style={styles.removeText}>Remove</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>Expense Type</Text>
                            <TextInput
                                style={styles.input}
                                value={cost.expense_type}
                                onChangeText={(value) => updateCostingItem(index, 'expense_type', value)}
                                placeholder="e.g., Airfare, Hotel"
                            />
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>Amount (₹)</Text>
                            <TextInput
                                style={styles.input}
                                value={cost.amount}
                                onChangeText={(value) => updateCostingItem(index, 'amount', value)}
                                placeholder="0.00"
                                keyboardType="decimal-pad"
                            />
                        </View>
                    </View>
                ))}

                {/* Travel Funding */}
                <View style={styles.formGroup}>
                    <Text style={styles.label}>Travel Funding</Text>
                    <View style={styles.pickerContainer}>
                        <Picker
                            selectedValue={travelFunding}
                            onValueChange={(value) => setTravelFunding(value)}
                            style={styles.picker}
                        >
                            <Picker.Item label="Fully Sponsored" value="Fully Sponsored" />
                            <Picker.Item label="Require Full Funding" value="Require Full Funding" />
                            <Picker.Item label="Partially Sponsored, Require Partial Funding" value="Partially Sponsored, Require Partial Funding" />
                        </Picker>
                    </View>
                </View>

                {/* Sponsor Details (if applicable) */}
                {travelFunding === 'Third Party Sponsored' && (
                    <View style={styles.formGroup}>
                        <Text style={styles.label}>Sponsor Details</Text>
                        <TextInput
                            style={styles.input}
                            value={sponsorDetails}
                            onChangeText={setSponsorDetails}
                            placeholder="Enter sponsor information"
                        />
                    </View>
                )}

                {/* Submit Button */}
                <View style={styles.submitContainer}>
                    <Button
                        title="Submit Travel Request"
                        onPress={handleSubmit}
                        loading={loading}
                        disabled={loading}
                    />
                </View>
            </View>
        </ScrollView>
    );

    const renderHistoryTab = () => (
        <View style={styles.tabContent}>
            {/* Summary Cards */}
            <View style={styles.summaryContainer}>
                <View style={styles.summaryCard}>
                    <Text style={styles.summaryValue}>{statusSummary.draft || 0}</Text>
                    <Text style={styles.summaryLabel}>Draft</Text>
                </View>
                <View style={styles.summaryCard}>
                    <Text style={[styles.summaryValue, { color: colors.success }]}>
                        {statusSummary.submitted || 0}
                    </Text>
                    <Text style={styles.summaryLabel}>Submitted</Text>
                </View>
                <View style={styles.summaryCard}>
                    <Text style={[styles.summaryValue, { color: colors.error }]}>
                        {statusSummary.cancelled || 0}
                    </Text>
                    <Text style={styles.summaryLabel}>Cancelled</Text>
                </View>
            </View>

            {/* Filter Pills */}
            <View style={styles.filterContainer}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <TouchableOpacity
                        onPress={() => setFilterDocstatus('')}
                        style={[styles.filterPill, filterDocstatus === '' && styles.filterPillActive]}
                    >
                        <Text style={[styles.filterText, filterDocstatus === '' && styles.filterTextActive]}>
                            All
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => setFilterDocstatus('0')}
                        style={[styles.filterPill, filterDocstatus === '0' && styles.filterPillActive]}
                    >
                        <Text style={[styles.filterText, filterDocstatus === '0' && styles.filterTextActive]}>
                            Draft
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => setFilterDocstatus('1')}
                        style={[styles.filterPill, filterDocstatus === '1' && styles.filterPillActive]}
                    >
                        <Text style={[styles.filterText, filterDocstatus === '1' && styles.filterTextActive]}>
                            Submitted
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => setFilterDocstatus('2')}
                        style={[styles.filterPill, filterDocstatus === '2' && styles.filterPillActive]}
                    >
                        <Text style={[styles.filterText, filterDocstatus === '2' && styles.filterTextActive]}>
                            Cancelled
                        </Text>
                    </TouchableOpacity>
                </ScrollView>
            </View>

            {/* Requests List */}
            <ScrollView
                style={styles.requestsList}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                }
            >
                {loading ? (
                    <Loading />
                ) : requests.length === 0 ? (
                    <View style={styles.emptyContainer}>
                        <Text style={styles.emptyText}>No travel requests found</Text>
                        <Text style={styles.emptySubtext}>
                            {filterDocstatus !== '' ? 'Try changing the filter' : 'Submit your first request'}
                        </Text>
                    </View>
                ) : (
                    <>
                        {requests.map((request, idx) => (
                            <View key={idx} style={styles.requestCard}>
                                <View style={styles.requestHeader}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.requestId}>{request.name}</Text>
                                        <Text style={styles.travelType}>
                                            {request.travel_type} - {request.purpose_of_travel}
                                        </Text>
                                    </View>
                                    <View style={[
                                        styles.statusBadge,
                                        { backgroundColor: getDocstatusColor(request.docstatus) }
                                    ]}>
                                        <Text style={styles.statusText}>
                                            {getDocstatusLabel(request.docstatus)}
                                        </Text>
                                    </View>
                                </View>

                                <Text style={styles.description} numberOfLines={2}>
                                    {request.description}
                                </Text>

                                {/* Itinerary Summary */}
                                {request.itinerary && request.itinerary.length > 0 && (
                                    <View style={styles.itinerarySummary}>
                                        <Text style={styles.itineraryHeader}>Itinerary ({request.itinerary.length} items):</Text>
                                        {request.itinerary.map((item, itemIdx) => (
                                            <View key={itemIdx} style={styles.itineraryRow}>
                                                <Text style={styles.itineraryText}>
                                                    {item.from_location} → {item.to_location}
                                                </Text>
                                                <Text style={styles.itineraryDates}>
                                                    {new Date(item.from_date).toLocaleDateString()} - {new Date(item.to_date).toLocaleDateString()}
                                                </Text>
                                                <Text style={styles.itineraryMode}>
                                                    {item.travel_mode} {item.lodging_required ? '🏨' : ''}
                                                </Text>
                                            </View>
                                        ))}
                                    </View>
                                )}

                                {/* Total Cost */}
                                {request.total_estimated_cost > 0 && (
                                    <View style={styles.costRow}>
                                        <Text style={styles.costLabel}>Estimated Cost:</Text>
                                        <Text style={styles.costValue}>₹{request.total_estimated_cost.toFixed(2)}</Text>
                                    </View>
                                )}
                            </View>
                        ))}
                        <View style={styles.bottomPadding} />
                    </>
                )}
            </ScrollView>
        </View>
    );

    return (
        <View style={styles.container}>
            {/* Tab Navigation */}
            <View style={styles.tabBar}>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'submit' && styles.activeTab]}
                    onPress={() => setActiveTab('submit')}
                >
                    <Text style={[styles.tabText, activeTab === 'submit' && styles.activeTabText]}>
                        Submit Request
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'history' && styles.activeTab]}
                    onPress={() => setActiveTab('history')}
                >
                    <Text style={[styles.tabText, activeTab === 'history' && styles.activeTabText]}>
                        My Requests
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Tab Content */}
            {activeTab === 'submit' && renderSubmitTab()}
            {activeTab === 'history' && renderHistoryTab()}

            {/* Date Picker Modal */}
            {showDatePicker && (
                <DateTimePicker
                    value={datePickerConfig.value}
                    mode="date"
                    display="default"
                    onChange={handleDateChange}
                />
            )}
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
    },
    tab: {
        flex: 1,
        paddingVertical: 16,
        alignItems: 'center',
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
    },
    activeTab: {
        borderBottomColor: colors.primary,
    },
    tabText: {
        fontSize: 16,
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
    formContainer: {
        padding: 16,
    },
    formGroup: {
        marginBottom: 20,
    },
    label: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.textPrimary,
        marginBottom: 8,
    },
    radioGroup: {
        flexDirection: 'row',
        gap: 12,
    },
    radioOption: {
        flex: 1,
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.white,
        alignItems: 'center',
    },
    radioOptionSelected: {
        backgroundColor: colors.primary,
        borderColor: colors.primary,
    },
    radioText: {
        fontSize: 14,
        color: colors.textPrimary,
        fontWeight: '500',
    },
    radioTextSelected: {
        color: colors.white,
        fontWeight: '600',
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
    textArea: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 8,
        padding: 12,
        fontSize: 16,
        color: colors.textPrimary,
        backgroundColor: colors.white,
        minHeight: 100,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 8,
        marginBottom: 12,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: colors.textPrimary,
    },
    addButton: {
        paddingVertical: 6,
        paddingHorizontal: 12,
        backgroundColor: colors.primary,
        borderRadius: 6,
    },
    addButtonText: {
        color: colors.white,
        fontSize: 14,
        fontWeight: '600',
    },
    itineraryItem: {
        backgroundColor: colors.white,
        padding: 16,
        borderRadius: 8,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: colors.border,
    },
    itineraryHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    itineraryTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.primary,
    },
    removeText: {
        color: colors.error,
        fontSize: 14,
        fontWeight: '500',
    },
    inputGroup: {
        marginBottom: 12,
    },
    inputLabel: {
        fontSize: 14,
        fontWeight: '500',
        color: colors.textSecondary,
        marginBottom: 6,
    },
    input: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 8,
        padding: 12,
        fontSize: 16,
        color: colors.textPrimary,
        backgroundColor: colors.white,
    },
    dateRow: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 12,
    },
    dateGroup: {
        flex: 1,
    },
    dateButton: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 8,
        padding: 12,
        backgroundColor: colors.white,
    },
    dateText: {
        fontSize: 16,
        color: colors.textPrimary,
    },
    checkboxRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
    },
    checkbox: {
        width: 20,
        height: 20,
        borderWidth: 2,
        borderColor: colors.border,
        borderRadius: 4,
        marginRight: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    checkboxChecked: {
        backgroundColor: colors.primary,
        borderColor: colors.primary,
    },
    checkmark: {
        color: colors.white,
        fontSize: 14,
        fontWeight: 'bold',
    },
    checkboxLabel: {
        fontSize: 14,
        color: colors.textPrimary,
    },
    costingItem: {
        backgroundColor: colors.cardBackground,
        padding: 16,
        borderRadius: 8,
        marginBottom: 12,
    },
    costingHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    costingTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.textPrimary,
    },
    submitContainer: {
        marginTop: 20,
        marginBottom: 40,
    },
    summaryContainer: {
        flexDirection: 'row',
        padding: 16,
        backgroundColor: colors.white,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    summaryCard: {
        flex: 1,
        alignItems: 'center',
    },
    summaryValue: {
        fontSize: 24,
        fontWeight: '700',
        color: colors.warning,
        marginBottom: 4,
    },
    summaryLabel: {
        fontSize: 12,
        color: colors.textSecondary,
        fontWeight: '500',
    },
    filterContainer: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: colors.white,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    filterPill: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
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
        fontSize: 14,
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
    requestCard: {
        backgroundColor: colors.white,
        marginHorizontal: 16,
        marginTop: 12,
        borderRadius: 8,
        padding: 16,
        borderWidth: 1,
        borderColor: colors.border,
    },
    requestHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 8,
    },
    requestId: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.textPrimary,
        marginBottom: 4,
    },
    travelType: {
        fontSize: 14,
        fontWeight: '500',
        color: colors.primary,
    },
    statusBadge: {
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 12,
    },
    statusText: {
        color: colors.white,
        fontSize: 12,
        fontWeight: '600',
    },
    description: {
        fontSize: 14,
        color: colors.textSecondary,
        marginBottom: 12,
    },
    itinerarySummary: {
        marginTop: 8,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: colors.border,
    },
    itineraryHeader: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.textPrimary,
        marginBottom: 8,
    },
    itineraryRow: {
        backgroundColor: colors.cardBackground,
        padding: 10,
        borderRadius: 6,
        marginBottom: 6,
    },
    itineraryText: {
        fontSize: 13,
        fontWeight: '600',
        color: colors.primary,
        marginBottom: 4,
    },
    itineraryDates: {
        fontSize: 12,
        color: colors.textSecondary,
        marginBottom: 2,
    },
    itineraryMode: {
        fontSize: 12,
        color: colors.textSecondary,
    },
    costRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: colors.border,
    },
    costLabel: {
        fontSize: 14,
        fontWeight: '500',
        color: colors.textSecondary,
    },
    costValue: {
        fontSize: 16,
        fontWeight: '700',
        color: colors.success,
    },
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
    },
    emptyText: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.textSecondary,
        marginBottom: 8,
    },
    emptySubtext: {
        fontSize: 14,
        color: colors.textSecondary,
    },
    bottomPadding: {
        height: 80,
    },
});

export default TravelRequestScreen;