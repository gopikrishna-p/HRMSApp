import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import apiService from '../../services/api.service';

const TravelRequestScreen = ({ navigation }) => {
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [requests, setRequests] = useState([]);
  const [purposes, setPurposes] = useState([]);
  const [currentEmployee, setCurrentEmployee] = useState(null);
  
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

  // Filter states
  const [filterStatus, setFilterStatus] = useState('all');

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      // Get current employee
      const empResponse = await apiService.getCurrentEmployee();
      if (empResponse.success && empResponse.data?.message) {
        setCurrentEmployee(empResponse.data.message);
      }

      // Load purposes and requests in parallel
      await Promise.all([
        loadPurposes(),
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
      if (response.success && response.data?.message?.data?.purposes) {
        setPurposes(response.data.message.data.purposes);
      }
    } catch (error) {
      console.error('Load purposes error:', error);
    }
  };

  const loadRequests = async () => {
    try {
      const filters = {};
      if (filterStatus !== 'all') {
        filters.status = filterStatus;
      }

      console.log('[Employee] Fetching travel requests with filters:', filters);
      const response = await apiService.getTravelRequests(filters);
      console.log('[Employee] Travel Requests Response:', JSON.stringify(response, null, 2));
      
      // Try multiple possible response structures
      let requestsData = null;
      
      if (response.success && response.data?.message?.data?.requests) {
        requestsData = response.data.message.data.requests;
      } else if (response.success && response.data?.message?.requests) {
        requestsData = response.data.message.requests;
      } else if (response.success && response.data?.requests) {
        requestsData = response.data.requests;
      } else if (response.data?.message?.data) {
        requestsData = response.data.message.data;
      } else if (response.data?.message) {
        requestsData = response.data.message;
      } else if (response.data) {
        requestsData = response.data;
      }
      
      console.log('[Employee] Parsed requests data:', requestsData);
      
      if (requestsData && Array.isArray(requestsData)) {
        setRequests(requestsData);
      } else if (requestsData) {
        // If it's an object, try to extract an array
        const possibleArrays = Object.values(requestsData).find(val => Array.isArray(val));
        if (possibleArrays) {
          setRequests(possibleArrays);
        } else {
          console.warn('[Employee] Response data is not an array:', requestsData);
          setRequests([]);
        }
      } else {
        console.warn('[Employee] No requests found in response');
        setRequests([]);
      }
    } catch (error) {
      console.error('[Employee] Load requests error:', error);
      console.error('[Employee] Error details:', error.response?.data || error.message);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadRequests();
    setRefreshing(false);
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
      const travelData = {
        employee: currentEmployee.name,
        ...formData,
      };

      const response = await apiService.submitTravelRequest(travelData);
      
      if (response.success && response.data?.message?.status === 'success') {
        Alert.alert(
          'Success',
          'Travel request submitted successfully',
          [
            {
              text: 'OK',
              onPress: () => {
                setShowForm(false);
                resetForm();
                loadRequests();
              },
            },
          ]
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
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Pending':
        return '#FFA500';
      case 'Approved':
        return '#4CAF50';
      case 'Rejected':
        return '#F44336';
      default:
        return '#757575';
    }
  };

  const renderRequestCard = (request) => (
    <TouchableOpacity
      key={request.name}
      style={styles.requestCard}
      onPress={() => navigation.navigate('TravelRequestDetails', { requestId: request.name })}
    >
      <View style={styles.requestHeader}>
        <Text style={styles.requestType}>{request.travel_type}</Text>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(request.status_label) }]}>
          <Text style={styles.statusText}>{request.status_label}</Text>
        </View>
      </View>
      
      <Text style={styles.requestPurpose}>{request.purpose_of_travel}</Text>
      
      {request.description && (
        <Text style={styles.requestDescription} numberOfLines={2}>
          {request.description}
        </Text>
      )}
      
      <View style={styles.requestFooter}>
        <Text style={styles.requestDate}>
          <Icon name="calendar" size={14} color="#666" /> {request.creation}
        </Text>
        <Icon name="chevron-right" size={20} color="#666" />
      </View>
    </TouchableOpacity>
  );

  const renderForm = () => (
    <Modal visible={showForm} animationType="slide" onRequestClose={() => setShowForm(false)}>
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={() => setShowForm(false)}>
            <Icon name="close" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>New Travel Request</Text>
          <TouchableOpacity onPress={handleSubmit} disabled={loading}>
            <Text style={styles.submitButton}>Submit</Text>
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
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          {/* Contact Information */}
          <Text style={styles.sectionTitle}>Contact Information</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Cell Number</Text>
            <TextInput
              style={styles.input}
              value={formData.cell_number}
              onChangeText={(text) => setFormData({ ...formData, cell_number: text })}
              placeholder="Enter phone number"
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Preferred Email</Text>
            <TextInput
              style={styles.input}
              value={formData.prefered_email}
              onChangeText={(text) => setFormData({ ...formData, prefered_email: text })}
              placeholder="Enter email"
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          {/* Funding Information */}
          <Text style={styles.sectionTitle}>Funding Information</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Travel Funding</Text>
            <TextInput
              style={styles.input}
              value={formData.travel_funding}
              onChangeText={(text) => setFormData({ ...formData, travel_funding: text })}
              placeholder="e.g., Self-funded, Company-sponsored"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Sponsor Details</Text>
            <TextInput
              style={styles.textArea}
              value={formData.details_of_sponsor}
              onChangeText={(text) => setFormData({ ...formData, details_of_sponsor: text })}
              placeholder="Enter sponsor name and details"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>

          {/* Identification */}
          {formData.travel_type === 'International' && (
            <>
              <Text style={styles.sectionTitle}>Identification</Text>
              
              <View style={styles.inputGroup}>
                <Text style={styles.label}>ID Type</Text>
                <TextInput
                  style={styles.input}
                  value={formData.personal_id_type}
                  onChangeText={(text) => setFormData({ ...formData, personal_id_type: text })}
                  placeholder="e.g., Passport, Driver's License"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>ID Number</Text>
                <TextInput
                  style={styles.input}
                  value={formData.personal_id_number}
                  onChangeText={(text) => setFormData({ ...formData, personal_id_number: text })}
                  placeholder="Enter ID number"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Passport Number</Text>
                <TextInput
                  style={styles.input}
                  value={formData.passport_number}
                  onChangeText={(text) => setFormData({ ...formData, passport_number: text })}
                  placeholder="Enter passport number"
                />
              </View>
            </>
          )}

          {/* Event/Conference Details */}
          <Text style={styles.sectionTitle}>Event Details (Optional)</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Organizer Name</Text>
            <TextInput
              style={styles.input}
              value={formData.name_of_organizer}
              onChangeText={(text) => setFormData({ ...formData, name_of_organizer: text })}
              placeholder="Enter organizer/host name"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Organizer Address</Text>
            <TextInput
              style={styles.textArea}
              value={formData.address_of_organizer}
              onChangeText={(text) => setFormData({ ...formData, address_of_organizer: text })}
              placeholder="Enter event location/address"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Other Details</Text>
            <TextInput
              style={styles.textArea}
              value={formData.other_details}
              onChangeText={(text) => setFormData({ ...formData, other_details: text })}
              placeholder="Any additional information"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Cost Center</Text>
            <TextInput
              style={styles.input}
              value={formData.cost_center}
              onChangeText={(text) => setFormData({ ...formData, cost_center: text })}
              placeholder="Enter cost center code"
            />
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </Modal>
  );

  if (loading && requests.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4A90E2" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
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
          <Icon name="plus" size={20} color="#FFF" />
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
              onPress={() => {
                setFilterStatus(status);
                loadRequests();
              }}
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
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {requests.length === 0 ? (
          <View style={styles.emptyState}>
            <Icon name="briefcase-outline" size={80} color="#CCC" />
            <Text style={styles.emptyText}>No travel requests found</Text>
            <Text style={styles.emptySubtext}>
              Tap the "New Request" button to submit a travel request
            </Text>
          </View>
        ) : (
          requests.map(renderRequestCard)
        )}
      </ScrollView>

      {/* Form Modal */}
      {renderForm()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  newRequestButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4A90E2',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  newRequestText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 4,
  },
  filterContainer: {
    backgroundColor: '#FFF',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: '#4A90E2',
  },
  filterChipText: {
    fontSize: 14,
    color: '#666',
  },
  filterChipTextActive: {
    color: '#FFF',
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  requestCard: {
    backgroundColor: '#FFF',
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  requestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  requestType: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  requestPurpose: {
    fontSize: 15,
    color: '#4A90E2',
    marginBottom: 8,
    fontWeight: '500',
  },
  requestDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  requestFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  requestDate: {
    fontSize: 13,
    color: '#666',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#999',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#AAA',
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#FFF',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  submitButton: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4A90E2',
  },
  formScroll: {
    flex: 1,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 24,
    marginBottom: 12,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  required: {
    color: '#F44336',
  },
  input: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    backgroundColor: '#FAFAFA',
  },
  textArea: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    backgroundColor: '#FAFAFA',
    minHeight: 80,
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    backgroundColor: '#FAFAFA',
    overflow: 'hidden',
  },
  picker: {
    height: 50,
  },
});

export default TravelRequestScreen;