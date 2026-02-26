import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    TextInput,
    Modal,
    ScrollView,
    RefreshControl,
    ActivityIndicator,
    Alert,
    Image,
    SafeAreaView,
    StatusBar,
    Dimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import LinearGradient from 'react-native-linear-gradient';
import ApiService from '../../services/api.service';

const { width } = Dimensions.get('window');

// Color palette
const COLORS = {
    primary: '#4F46E5',
    primaryLight: '#818CF8',
    primaryDark: '#3730A3',
    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444',
    info: '#3B82F6',
    background: '#F3F4F6',
    surface: '#FFFFFF',
    surfaceSecondary: '#F9FAFB',
    textPrimary: '#111827',
    textSecondary: '#6B7280',
    textMuted: '#9CA3AF',
    border: '#E5E7EB',
    white: '#FFFFFF',
};

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
    
    // Modals
    const [detailsModalVisible, setDetailsModalVisible] = useState(false);
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [pendingRequestsModalVisible, setPendingRequestsModalVisible] = useState(false);
    const [filterModalVisible, setFilterModalVisible] = useState(false);
    
    // Selected employee
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const [employeeDetails, setEmployeeDetails] = useState(null);
    const [loadingDetails, setLoadingDetails] = useState(false);
    
    // Edit form
    const [editForm, setEditForm] = useState({});
    const [savingEdit, setSavingEdit] = useState(false);
    
    // Pending requests
    const [pendingRequests, setPendingRequests] = useState([]);
    const [loadingRequests, setLoadingRequests] = useState(false);

    const statusOptions = ['All', 'Active', 'Inactive', 'Suspended', 'Left'];

    useEffect(() => {
        fetchEmployees();
        fetchPendingRequests();
    }, []);

    useEffect(() => {
        filterEmployees();
    }, [searchQuery, selectedStatus, selectedDepartment, employees]);

    const fetchEmployees = async () => {
        try {
            setLoading(true);
            const response = await ApiService.get('/api/method/hrms.api.get_all_employees');
            console.log('Employee response:', JSON.stringify(response, null, 2));
            
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
                } else if (message.status === 'success') {
                    // Wrapped object format
                    setEmployees(message.employees || []);
                    setStatistics(message.statistics || {});
                    setFilterOptions(message.filters || { departments: [], companies: [] });
                } else {
                    console.error('Unexpected message format:', message);
                }
            } else {
                console.error('Failed to fetch employees - response not success');
            }
        } catch (error) {
            console.error('Error fetching employees:', error);
            Alert.alert('Error', 'Failed to load employees. Please try again.');
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

    const filterEmployees = () => {
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
    };

    const fetchEmployeeDetails = async (employeeId) => {
        try {
            setLoadingDetails(true);
            const response = await ApiService.get(`/api/method/hrms.api.get_employee_details?employee=${employeeId}`);
            console.log('Employee details response:', JSON.stringify(response, null, 2));
            
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
                    Alert.alert('Error', 'Failed to load employee details');
                }
            } else {
                console.error('Employee details response not success:', response);
                Alert.alert('Error', 'Failed to load employee details');
            }
        } catch (error) {
            console.error('Error fetching employee details:', error);
            Alert.alert('Error', 'Failed to load employee details');
        } finally {
            setLoadingDetails(false);
        }
    };

    const handleViewDetails = (employee) => {
        setSelectedEmployee(employee);
        fetchEmployeeDetails(employee.name);
        setDetailsModalVisible(true);
    };

    const handleEditEmployee = () => {
        setEditForm({ ...employeeDetails });
        setDetailsModalVisible(false);
        setEditModalVisible(true);
    };

    const handleSaveEdit = async () => {
        try {
            setSavingEdit(true);
            const response = await ApiService.post('/api/method/hrms.api.admin_update_employee', {
                employee: selectedEmployee.name,
                updates: JSON.stringify(editForm),
            });

            if (response.success && response.data?.message?.status === 'success') {
                Alert.alert('Success', 'Employee profile updated successfully');
                setEditModalVisible(false);
                fetchEmployees();
            } else {
                Alert.alert('Error', response.data?.message?.message || 'Failed to update employee');
            }
        } catch (error) {
            console.error('Error updating employee:', error);
            Alert.alert('Error', 'Failed to update employee profile');
        } finally {
            setSavingEdit(false);
        }
    };

    const handleGrantPermission = async (employeeId, employeeName) => {
        Alert.alert(
            'Grant Edit Permission',
            `Allow ${employeeName} to edit their profile?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Grant',
                    onPress: async () => {
                        try {
                            const response = await ApiService.post('/api/method/hrms.api.grant_edit_permission', {
                                employee: employeeId,
                                remarks: 'Granted via mobile app',
                            });

                            if (response.success && response.data?.message?.status === 'success') {
                                Alert.alert('Success', 'Edit permission granted');
                                fetchEmployees();
                                fetchPendingRequests();
                                if (detailsModalVisible) {
                                    fetchEmployeeDetails(employeeId);
                                }
                            } else {
                                Alert.alert('Error', response.data?.message?.message || 'Failed to grant permission');
                            }
                        } catch (error) {
                            console.error('Error granting permission:', error);
                            Alert.alert('Error', 'Failed to grant permission');
                        }
                    },
                },
            ]
        );
    };

    const handleRevokePermission = async (employeeId, employeeName) => {
        Alert.alert(
            'Revoke Edit Permission',
            `Remove edit access from ${employeeName}?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Revoke',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const response = await ApiService.post('/api/method/hrms.api.revoke_edit_permission', {
                                employee: employeeId,
                                remarks: 'Revoked via mobile app',
                            });

                            if (response.success && response.data?.message?.status === 'success') {
                                Alert.alert('Success', 'Edit permission revoked');
                                fetchEmployees();
                                if (detailsModalVisible) {
                                    fetchEmployeeDetails(employeeId);
                                }
                            } else {
                                Alert.alert('Error', response.data?.message?.message || 'Failed to revoke permission');
                            }
                        } catch (error) {
                            console.error('Error revoking permission:', error);
                            Alert.alert('Error', 'Failed to revoke permission');
                        }
                    },
                },
            ]
        );
    };

    const handleRejectRequest = async (employeeId, employeeName) => {
        Alert.alert(
            'Reject Edit Request',
            `Reject edit request from ${employeeName}?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Reject',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const response = await ApiService.post('/api/method/hrms.api.reject_edit_request', {
                                employee: employeeId,
                                reason: 'Request reviewed and rejected',
                            });

                            if (response.success && response.data?.message?.status === 'success') {
                                Alert.alert('Success', 'Request rejected');
                                fetchPendingRequests();
                            } else {
                                Alert.alert('Error', response.data?.message?.message || 'Failed to reject request');
                            }
                        } catch (error) {
                            console.error('Error rejecting request:', error);
                            Alert.alert('Error', 'Failed to reject request');
                        }
                    },
                },
            ]
        );
    };

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchEmployees();
        fetchPendingRequests();
    }, []);

    const getStatusColor = (status) => {
        switch (status) {
            case 'Active': return COLORS.success;
            case 'Inactive': return COLORS.textSecondary;
            case 'Suspended': return COLORS.warning;
            case 'Left': return COLORS.error;
            default: return COLORS.textSecondary;
        }
    };

    const getInitials = (name) => {
        if (!name) return 'E';
        return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    };

    // Stat Card Component
    const StatCard = ({ title, value, color, icon }) => (
        <View style={styles.statCard}>
            <View style={[styles.statIconContainer, { backgroundColor: color + '15' }]}>
                <Icon name={icon} size={18} color={color} />
            </View>
            <Text style={styles.statValue}>{value || 0}</Text>
            <Text style={styles.statTitle}>{title}</Text>
        </View>
    );

    // Employee Card Component
    const renderEmployeeItem = ({ item }) => (
        <TouchableOpacity
            style={styles.employeeCard}
            onPress={() => handleViewDetails(item)}
            activeOpacity={0.7}
        >
            <View style={styles.employeeCardContent}>
                <View style={styles.avatarContainer}>
                    {item.image ? (
                        <Image source={{ uri: item.image }} style={styles.avatar} />
                    ) : (
                        <View style={styles.avatarGradient}>
                            <Text style={styles.avatarText}>{getInitials(item.employee_name)}</Text>
                        </View>
                    )}
                </View>
                <View style={styles.employeeInfo}>
                    <Text style={styles.employeeName} numberOfLines={1}>{item.employee_name}</Text>
                    <Text style={styles.employeeId}>{item.name}</Text>
                    <View style={styles.employeeMetaRow}>
                        <Icon name="briefcase-outline" size={12} color={COLORS.textMuted} />
                        <Text style={styles.employeeMeta} numberOfLines={1}>
                            {item.designation || 'N/A'}
                        </Text>
                    </View>
                    <View style={styles.employeeMetaRow}>
                        <Icon name="office-building-outline" size={12} color={COLORS.textMuted} />
                        <Text style={styles.employeeMeta} numberOfLines={1}>
                            {item.department || 'N/A'}
                        </Text>
                    </View>
                </View>
                <View style={styles.employeeActions}>
                    <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '15' }]}>
                        <View style={[styles.statusDot, { backgroundColor: getStatusColor(item.status) }]} />
                        <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
                            {item.status || 'N/A'}
                        </Text>
                    </View>
                    <View style={styles.actionIcons}>
                        {item.has_edit_permission && (
                            <View style={[styles.iconBadge, { backgroundColor: COLORS.warning + '20' }]}>
                                <Icon name="pencil" size={14} color={COLORS.warning} />
                            </View>
                        )}
                        {item.has_pending_request && (
                            <View style={[styles.iconBadge, { backgroundColor: COLORS.info + '20' }]}>
                                <Icon name="clock-outline" size={14} color={COLORS.info} />
                            </View>
                        )}
                    </View>
                </View>
            </View>
        </TouchableOpacity>
    );

    // Details Modal
    const renderDetailsModal = () => (
        <Modal
            visible={detailsModalVisible}
            animationType="slide"
            onRequestClose={() => setDetailsModalVisible(false)}
        >
            <SafeAreaView style={styles.modalContainer}>
                {/* Header */}
                <View style={styles.modalHeader}>
                    <TouchableOpacity 
                        onPress={() => setDetailsModalVisible(false)}
                        style={styles.modalHeaderBtn}
                    >
                        <Icon name="arrow-left" size={24} color={COLORS.textPrimary} />
                    </TouchableOpacity>
                    <Text style={styles.modalTitle}>Employee Details</Text>
                    <TouchableOpacity onPress={handleEditEmployee} style={styles.modalHeaderBtn}>
                        <Icon name="pencil" size={22} color={COLORS.primary} />
                    </TouchableOpacity>
                </View>

                {loadingDetails ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color={COLORS.primary} />
                        <Text style={styles.loadingText}>Loading details...</Text>
                    </View>
                ) : employeeDetails && (
                    <ScrollView style={styles.detailsContent} showsVerticalScrollIndicator={false}>
                        {/* Profile Header */}
                        <View style={styles.profileHeaderGradient}>
                            <View style={styles.profileAvatarContainer}>
                                {employeeDetails.image ? (
                                    <Image source={{ uri: employeeDetails.image }} style={styles.profileAvatar} />
                                ) : (
                                    <View style={styles.profileAvatarPlaceholder}>
                                        <Text style={styles.profileAvatarText}>
                                            {getInitials(employeeDetails.employee_name)}
                                        </Text>
                                    </View>
                                )}
                            </View>
                            <Text style={styles.profileName}>{employeeDetails.employee_name}</Text>
                            <Text style={styles.profileDesignation}>{employeeDetails.designation}</Text>
                            <View style={styles.profileIdBadge}>
                                <Text style={styles.profileIdText}>{employeeDetails.name}</Text>
                            </View>
                        </View>

                        {/* Edit Permission Section */}
                        <View style={styles.permissionSection}>
                            <Text style={styles.sectionTitle}>
                                <Icon name="shield-account" size={16} color={COLORS.textPrimary} /> Edit Permission
                            </Text>
                            <View style={styles.permissionCard}>
                                {employeeDetails.has_edit_permission ? (
                                    <>
                                        <View style={styles.permissionStatusRow}>
                                            <View style={[styles.permissionIcon, { backgroundColor: COLORS.success + '20' }]}>
                                                <Icon name="check-circle" size={24} color={COLORS.success} />
                                            </View>
                                            <View style={styles.permissionInfo}>
                                                <Text style={styles.permissionActive}>Edit Access Enabled</Text>
                                                <Text style={styles.permissionSubtext}>Employee can edit their profile</Text>
                                            </View>
                                        </View>
                                        <TouchableOpacity
                                            style={styles.revokeButton}
                                            onPress={() => handleRevokePermission(employeeDetails.name, employeeDetails.employee_name)}
                                        >
                                            <Icon name="lock" size={18} color={COLORS.white} />
                                            <Text style={styles.revokeButtonText}>Revoke Access</Text>
                                        </TouchableOpacity>
                                    </>
                                ) : employeeDetails.has_pending_request ? (
                                    <>
                                        <View style={styles.permissionStatusRow}>
                                            <View style={[styles.permissionIcon, { backgroundColor: COLORS.warning + '20' }]}>
                                                <Icon name="clock-outline" size={24} color={COLORS.warning} />
                                            </View>
                                            <View style={styles.permissionInfo}>
                                                <Text style={styles.permissionPending}>Request Pending</Text>
                                                <Text style={styles.permissionSubtext}>
                                                    {employeeDetails.edit_request_details?.reason || 'No reason provided'}
                                                </Text>
                                            </View>
                                        </View>
                                        <View style={styles.permissionActions}>
                                            <TouchableOpacity
                                                style={styles.approveButton}
                                                onPress={() => handleGrantPermission(employeeDetails.name, employeeDetails.employee_name)}
                                            >
                                                <Icon name="check" size={18} color={COLORS.white} />
                                                <Text style={styles.approveButtonText}>Approve</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={styles.rejectButton}
                                                onPress={() => handleRejectRequest(employeeDetails.name, employeeDetails.employee_name)}
                                            >
                                                <Icon name="close" size={18} color={COLORS.white} />
                                                <Text style={styles.rejectButtonText}>Reject</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </>
                                ) : (
                                    <>
                                        <View style={styles.permissionStatusRow}>
                                            <View style={[styles.permissionIcon, { backgroundColor: COLORS.textMuted + '20' }]}>
                                                <Icon name="lock-outline" size={24} color={COLORS.textMuted} />
                                            </View>
                                            <View style={styles.permissionInfo}>
                                                <Text style={styles.permissionInactive}>No Edit Access</Text>
                                                <Text style={styles.permissionSubtext}>Employee cannot edit their profile</Text>
                                            </View>
                                        </View>
                                        <TouchableOpacity
                                            style={styles.grantButton}
                                            onPress={() => handleGrantPermission(employeeDetails.name, employeeDetails.employee_name)}
                                        >
                                            <Icon name="lock-open" size={18} color={COLORS.white} />
                                            <Text style={styles.grantButtonText}>Grant Edit Access</Text>
                                        </TouchableOpacity>
                                    </>
                                )}
                            </View>
                        </View>

                        {/* Info Sections */}
                        <DetailSection title="Basic Information" icon="account">
                            <DetailRow label="First Name" value={employeeDetails.first_name} />
                            <DetailRow label="Middle Name" value={employeeDetails.middle_name} />
                            <DetailRow label="Last Name" value={employeeDetails.last_name} />
                            <DetailRow label="Gender" value={employeeDetails.gender} />
                            <DetailRow label="Date of Birth" value={employeeDetails.date_of_birth} />
                            <DetailRow label="Blood Group" value={employeeDetails.blood_group} />
                            <DetailRow label="Marital Status" value={employeeDetails.marital_status} />
                        </DetailSection>

                        <DetailSection title="Contact Information" icon="phone">
                            <DetailRow label="Phone" value={employeeDetails.cell_number} />
                            <DetailRow label="Company Email" value={employeeDetails.company_email} />
                            <DetailRow label="Personal Email" value={employeeDetails.personal_email} />
                        </DetailSection>

                        <DetailSection title="Employment Details" icon="briefcase">
                            <DetailRow label="Company" value={employeeDetails.company} />
                            <DetailRow label="Department" value={employeeDetails.department} />
                            <DetailRow label="Designation" value={employeeDetails.designation} />
                            <DetailRow label="Branch" value={employeeDetails.branch} />
                            <DetailRow label="Reports To" value={employeeDetails.reports_to_name || employeeDetails.reports_to} />
                            <DetailRow label="Date of Joining" value={employeeDetails.date_of_joining} />
                            <DetailRow label="Status" value={employeeDetails.status} />
                        </DetailSection>

                        <DetailSection title="Address" icon="map-marker">
                            <DetailRow label="Current Address" value={employeeDetails.current_address} multiline />
                            <DetailRow label="Permanent Address" value={employeeDetails.permanent_address} multiline />
                        </DetailSection>

                        <DetailSection title="Emergency Contact" icon="alert-circle">
                            <DetailRow label="Contact Person" value={employeeDetails.person_to_be_contacted} />
                            <DetailRow label="Phone" value={employeeDetails.emergency_phone_number} />
                            <DetailRow label="Relation" value={employeeDetails.relation} />
                        </DetailSection>

                        <DetailSection title="Bank Details" icon="bank">
                            <DetailRow label="Bank Name" value={employeeDetails.bank_name} />
                            <DetailRow label="Account No." value={employeeDetails.bank_ac_no ? '••••' + employeeDetails.bank_ac_no.slice(-4) : null} />
                            <DetailRow label="IBAN" value={employeeDetails.iban} />
                            <DetailRow label="Salary Mode" value={employeeDetails.salary_mode} />
                        </DetailSection>

                        <View style={{ height: 30 }} />
                    </ScrollView>
                )}
            </SafeAreaView>
        </Modal>
    );

    // Edit Modal
    const renderEditModal = () => (
        <Modal
            visible={editModalVisible}
            animationType="slide"
            onRequestClose={() => setEditModalVisible(false)}
        >
            <SafeAreaView style={styles.modalContainer}>
                <View style={styles.modalHeader}>
                    <TouchableOpacity 
                        onPress={() => setEditModalVisible(false)}
                        style={styles.modalHeaderBtn}
                    >
                        <Icon name="close" size={24} color={COLORS.textPrimary} />
                    </TouchableOpacity>
                    <Text style={styles.modalTitle}>Edit Employee</Text>
                    <TouchableOpacity 
                        onPress={handleSaveEdit} 
                        disabled={savingEdit}
                        style={styles.modalHeaderBtn}
                    >
                        {savingEdit ? (
                            <ActivityIndicator size="small" color={COLORS.primary} />
                        ) : (
                            <Icon name="check" size={24} color={COLORS.primary} />
                        )}
                    </TouchableOpacity>
                </View>

                <ScrollView style={styles.editContent} showsVerticalScrollIndicator={false}>
                    <EditSection title="Basic Information">
                        <EditField label="First Name" field="first_name" value={editForm.first_name} onChange={setEditForm} />
                        <EditField label="Middle Name" field="middle_name" value={editForm.middle_name} onChange={setEditForm} />
                        <EditField label="Last Name" field="last_name" value={editForm.last_name} onChange={setEditForm} />
                        <EditField label="Gender" field="gender" value={editForm.gender} onChange={setEditForm} />
                        <EditField label="Date of Birth" field="date_of_birth" value={editForm.date_of_birth} onChange={setEditForm} />
                        <EditField label="Marital Status" field="marital_status" value={editForm.marital_status} onChange={setEditForm} />
                        <EditField label="Blood Group" field="blood_group" value={editForm.blood_group} onChange={setEditForm} />
                    </EditSection>

                    <EditSection title="Contact">
                        <EditField label="Phone" field="cell_number" value={editForm.cell_number} onChange={setEditForm} keyboardType="phone-pad" />
                        <EditField label="Company Email" field="company_email" value={editForm.company_email} onChange={setEditForm} keyboardType="email-address" />
                        <EditField label="Personal Email" field="personal_email" value={editForm.personal_email} onChange={setEditForm} keyboardType="email-address" />
                    </EditSection>

                    <EditSection title="Employment">
                        <EditField label="Department" field="department" value={editForm.department} onChange={setEditForm} />
                        <EditField label="Designation" field="designation" value={editForm.designation} onChange={setEditForm} />
                        <EditField label="Branch" field="branch" value={editForm.branch} onChange={setEditForm} />
                        <EditField label="Status" field="status" value={editForm.status} onChange={setEditForm} />
                        <EditField label="Date of Joining" field="date_of_joining" value={editForm.date_of_joining} onChange={setEditForm} />
                    </EditSection>

                    <EditSection title="Address">
                        <EditField label="Current Address" field="current_address" value={editForm.current_address} onChange={setEditForm} multiline />
                        <EditField label="Permanent Address" field="permanent_address" value={editForm.permanent_address} onChange={setEditForm} multiline />
                    </EditSection>

                    <EditSection title="Emergency Contact">
                        <EditField label="Contact Person" field="person_to_be_contacted" value={editForm.person_to_be_contacted} onChange={setEditForm} />
                        <EditField label="Emergency Phone" field="emergency_phone_number" value={editForm.emergency_phone_number} onChange={setEditForm} keyboardType="phone-pad" />
                        <EditField label="Relation" field="relation" value={editForm.relation} onChange={setEditForm} />
                    </EditSection>

                    <EditSection title="Bank Details">
                        <EditField label="Bank Name" field="bank_name" value={editForm.bank_name} onChange={setEditForm} />
                        <EditField label="Account No." field="bank_ac_no" value={editForm.bank_ac_no} onChange={setEditForm} />
                        <EditField label="IBAN" field="iban" value={editForm.iban} onChange={setEditForm} />
                        <EditField label="Salary Mode" field="salary_mode" value={editForm.salary_mode} onChange={setEditForm} />
                    </EditSection>

                    <View style={{ height: 50 }} />
                </ScrollView>
            </SafeAreaView>
        </Modal>
    );

    // Pending Requests Modal
    const renderPendingRequestsModal = () => (
        <Modal
            visible={pendingRequestsModalVisible}
            animationType="slide"
            onRequestClose={() => setPendingRequestsModalVisible(false)}
        >
            <SafeAreaView style={styles.modalContainer}>
                <View style={styles.modalHeader}>
                    <TouchableOpacity 
                        onPress={() => setPendingRequestsModalVisible(false)}
                        style={styles.modalHeaderBtn}
                    >
                        <Icon name="arrow-left" size={24} color={COLORS.textPrimary} />
                    </TouchableOpacity>
                    <Text style={styles.modalTitle}>Pending Requests</Text>
                    <TouchableOpacity onPress={fetchPendingRequests} style={styles.modalHeaderBtn}>
                        <Icon name="refresh" size={22} color={COLORS.primary} />
                    </TouchableOpacity>
                </View>

                {loadingRequests ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color={COLORS.primary} />
                    </View>
                ) : pendingRequests.length === 0 ? (
                    <View style={styles.emptyContainer}>
                        <Icon name="check-circle-outline" size={80} color={COLORS.success} />
                        <Text style={styles.emptyTitle}>All Caught Up!</Text>
                        <Text style={styles.emptyText}>No pending edit requests</Text>
                    </View>
                ) : (
                    <FlatList
                        data={pendingRequests}
                        keyExtractor={(item) => item.employee}
                        renderItem={({ item }) => (
                            <View style={styles.requestCard}>
                                <View style={styles.requestHeader}>
                                    <View style={styles.requestAvatar}>
                                        <Text style={styles.requestAvatarText}>
                                            {getInitials(item.employee_name)}
                                        </Text>
                                    </View>
                                    <View style={styles.requestInfo}>
                                        <Text style={styles.requestName}>{item.employee_name}</Text>
                                        <Text style={styles.requestId}>{item.employee}</Text>
                                        <Text style={styles.requestDept}>{item.designation} • {item.department}</Text>
                                    </View>
                                </View>
                                <View style={styles.requestReasonContainer}>
                                    <Text style={styles.requestReasonLabel}>Reason:</Text>
                                    <Text style={styles.requestReason}>{item.reason || 'No reason provided'}</Text>
                                </View>
                                <Text style={styles.requestDate}>
                                    <Icon name="calendar" size={12} color={COLORS.textMuted} /> {item.requested_on}
                                </Text>
                                <View style={styles.requestActions}>
                                    <TouchableOpacity
                                        style={styles.approveButton}
                                        onPress={() => handleGrantPermission(item.employee, item.employee_name)}
                                    >
                                        <Icon name="check" size={18} color={COLORS.white} />
                                        <Text style={styles.approveButtonText}>Approve</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={styles.rejectButton}
                                        onPress={() => handleRejectRequest(item.employee, item.employee_name)}
                                    >
                                        <Icon name="close" size={18} color={COLORS.white} />
                                        <Text style={styles.rejectButtonText}>Reject</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}
                        contentContainerStyle={{ padding: 16 }}
                    />
                )}
            </SafeAreaView>
        </Modal>
    );

    // Filter Modal
    const renderFilterModal = () => (
        <Modal
            visible={filterModalVisible}
            animationType="slide"
            transparent
            onRequestClose={() => setFilterModalVisible(false)}
        >
            <View style={styles.filterModalOverlay}>
                <View style={styles.filterModalContent}>
                    <View style={styles.filterModalHandle} />
                    <View style={styles.filterModalHeader}>
                        <Text style={styles.filterModalTitle}>Filters</Text>
                        <TouchableOpacity onPress={() => setFilterModalVisible(false)}>
                            <Icon name="close" size={24} color={COLORS.textPrimary} />
                        </TouchableOpacity>
                    </View>

                    <Text style={styles.filterLabel}>Status</Text>
                    <View style={styles.filterOptions}>
                        {statusOptions.map((status) => (
                            <TouchableOpacity
                                key={status}
                                style={[
                                    styles.filterChip,
                                    selectedStatus === status && styles.filterChipActive
                                ]}
                                onPress={() => setSelectedStatus(status)}
                            >
                                <Text style={[
                                    styles.filterChipText,
                                    selectedStatus === status && styles.filterChipTextActive
                                ]}>
                                    {status}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    <Text style={styles.filterLabel}>Department</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        <View style={styles.filterOptions}>
                            <TouchableOpacity
                                style={[
                                    styles.filterChip,
                                    selectedDepartment === 'All' && styles.filterChipActive
                                ]}
                                onPress={() => setSelectedDepartment('All')}
                            >
                                <Text style={[
                                    styles.filterChipText,
                                    selectedDepartment === 'All' && styles.filterChipTextActive
                                ]}>
                                    All
                                </Text>
                            </TouchableOpacity>
                            {filterOptions.departments.map((dept) => (
                                <TouchableOpacity
                                    key={dept}
                                    style={[
                                        styles.filterChip,
                                        selectedDepartment === dept && styles.filterChipActive
                                    ]}
                                    onPress={() => setSelectedDepartment(dept)}
                                >
                                    <Text style={[
                                        styles.filterChipText,
                                        selectedDepartment === dept && styles.filterChipTextActive
                                    ]} numberOfLines={1}>
                                        {dept}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </ScrollView>

                    <TouchableOpacity
                        style={styles.applyFilterButton}
                        onPress={() => setFilterModalVisible(false)}
                    >
                        <Text style={styles.applyFilterButtonText}>Apply Filters</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.clearFilterButton}
                        onPress={() => {
                            setSelectedStatus('Active');
                            setSelectedDepartment('All');
                        }}
                    >
                        <Text style={styles.clearFilterButtonText}>Clear All</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={styles.loadingText}>Loading employees...</Text>
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor={COLORS.surface} />
            
            {/* Header */}
            {/* <View style={styles.header}>
                <View style={styles.headerTop}>
                    <View>
                        <Text style={styles.headerTitle}>Employees</Text>
                        <Text style={styles.headerSubtitle}>Manage your team</Text>
                    </View>
                    {pendingRequests.length > 0 && (
                        <TouchableOpacity
                            style={styles.notificationBadge}
                            onPress={() => setPendingRequestsModalVisible(true)}
                        >
                            <Icon name="bell" size={22} color={COLORS.white} />
                            <View style={styles.notificationCount}>
                                <Text style={styles.notificationCountText}>{pendingRequests.length}</Text>
                            </View>
                        </TouchableOpacity>
                    )}
                </View>
            </View> */}

            {/* Statistics - Fixed row layout */}
            <View style={styles.statsContainer}>
                <View style={styles.statsContent}>
                    <StatCard title="Total" value={statistics.total} color={COLORS.primary} icon="account-group" />
                    <StatCard title="Active" value={statistics.active} color={COLORS.success} icon="account-check" />
                    <StatCard title="Inactive" value={statistics.inactive} color={COLORS.textMuted} icon="account-off" />
                    <StatCard title="Edit" value={statistics.with_edit_permission} color={COLORS.warning} icon="pencil" />
                </View>
            </View>

            {/* Pending Requests Banner */}
            {pendingRequests.length > 0 && (
                <TouchableOpacity
                    style={styles.pendingBanner}
                    onPress={() => setPendingRequestsModalVisible(true)}
                    activeOpacity={0.8}
                >
                    <View style={styles.pendingBannerContent}>
                        <Icon name="bell-ring" size={20} color={COLORS.white} />
                        <Text style={styles.pendingBannerText}>
                            {pendingRequests.length} pending edit request{pendingRequests.length > 1 ? 's' : ''}
                        </Text>
                        <Icon name="chevron-right" size={20} color={COLORS.white} />
                    </View>
                </TouchableOpacity>
            )}

            {/* Search and Filter */}
            <View style={styles.searchSection}>
                <View style={styles.searchContainer}>
                    <Icon name="magnify" size={20} color={COLORS.textMuted} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search employees..."
                        placeholderTextColor={COLORS.textMuted}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                    {searchQuery.length > 0 && (
                        <TouchableOpacity onPress={() => setSearchQuery('')}>
                            <Icon name="close-circle" size={18} color={COLORS.textMuted} />
                        </TouchableOpacity>
                    )}
                </View>
                <TouchableOpacity
                    style={[
                        styles.filterButton,
                        (selectedStatus !== 'Active' || selectedDepartment !== 'All') && styles.filterButtonActive
                    ]}
                    onPress={() => setFilterModalVisible(true)}
                >
                    <Icon
                        name="tune-vertical"
                        size={22}
                        color={(selectedStatus !== 'Active' || selectedDepartment !== 'All') ? COLORS.white : COLORS.primary}
                    />
                </TouchableOpacity>
            </View>

            {/* Active Filters - Only show non-default filters */}
            {(selectedStatus !== 'Active' || selectedDepartment !== 'All') && (
                <View style={styles.activeFilters}>
                    {selectedStatus !== 'Active' && (
                        <View style={styles.activeFilterChip}>
                            <Text style={styles.activeFilterText}>{selectedStatus}</Text>
                            <TouchableOpacity onPress={() => setSelectedStatus('Active')}>
                                <Icon name="close-circle" size={16} color={COLORS.primary} />
                            </TouchableOpacity>
                        </View>
                    )}
                    {selectedDepartment !== 'All' && (
                        <View style={styles.activeFilterChip}>
                            <Text style={styles.activeFilterText} numberOfLines={1}>{selectedDepartment}</Text>
                            <TouchableOpacity onPress={() => setSelectedDepartment('All')}>
                                <Icon name="close-circle" size={16} color={COLORS.primary} />
                            </TouchableOpacity>
                        </View>
                    )}
                </View>
            )}

            {/* Results Count */}
            <View style={styles.resultsHeader}>
                <Text style={styles.resultsCount}>
                    {filteredEmployees.length} of {employees.length} employees
                </Text>
            </View>

            {/* Employee List */}
            <FlatList
                data={filteredEmployees}
                keyExtractor={(item) => item.name}
                renderItem={renderEmployeeItem}
                contentContainerStyle={styles.listContent}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        colors={[COLORS.primary]}
                    />
                }
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Icon name="account-search" size={80} color={COLORS.textMuted} />
                        <Text style={styles.emptyTitle}>No Employees Found</Text>
                        <Text style={styles.emptyText}>Try adjusting your search or filters</Text>
                    </View>
                }
            />

            {/* Modals */}
            {renderDetailsModal()}
            {renderEditModal()}
            {renderPendingRequestsModal()}
            {renderFilterModal()}
        </SafeAreaView>
    );
};

// Detail Section Component
const DetailSection = ({ title, icon, children }) => (
    <View style={styles.detailSection}>
        <Text style={styles.sectionTitle}>
            <Icon name={icon} size={16} color={COLORS.textPrimary} /> {title}
        </Text>
        <View style={styles.detailCard}>
            {children}
        </View>
    </View>
);

// Detail Row Component
const DetailRow = ({ label, value, multiline }) => (
    <View style={[styles.detailRow, multiline && styles.detailRowMultiline]}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={[styles.detailValue, multiline && styles.detailValueMultiline]}>
            {value || '—'}
        </Text>
    </View>
);

// Edit Section Component
const EditSection = ({ title, children }) => (
    <View style={styles.editSection}>
        <Text style={styles.editSectionTitle}>{title}</Text>
        {children}
    </View>
);

// Edit Field Component
const EditField = ({ label, field, value, onChange, keyboardType = 'default', multiline = false }) => (
    <View style={styles.editFieldContainer}>
        <Text style={styles.editFieldLabel}>{label}</Text>
        <TextInput
            style={[styles.editFieldInput, multiline && styles.editFieldMultiline]}
            value={value || ''}
            onChangeText={(text) => onChange(prev => ({ ...prev, [field]: text }))}
            placeholder={`Enter ${label.toLowerCase()}`}
            placeholderTextColor={COLORS.textMuted}
            keyboardType={keyboardType}
            multiline={multiline}
            numberOfLines={multiline ? 3 : 1}
        />
    </View>
);

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: COLORS.background,
    },
    loadingText: {
        marginTop: 16,
        fontSize: 14,
        color: COLORS.textSecondary,
    },

    // Header
    header: {
        backgroundColor: COLORS.surface,
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
    },
    headerTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 26,
        fontWeight: '700',
        color: COLORS.textPrimary,
    },
    headerSubtitle: {
        fontSize: 14,
        color: COLORS.textSecondary,
        marginTop: 2,
    },
    notificationBadge: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: COLORS.primary,
        justifyContent: 'center',
        alignItems: 'center',
    },
    notificationCount: {
        position: 'absolute',
        top: -2,
        right: -2,
        backgroundColor: COLORS.error,
        borderRadius: 10,
        minWidth: 20,
        height: 20,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: COLORS.surface,
    },
    notificationCountText: {
        color: COLORS.white,
        fontSize: 11,
        fontWeight: '700',
    },

    // Stats - Horizontal row that fits in screen
    statsContainer: {
        backgroundColor: COLORS.surface,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
    },
    statsContent: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    statCard: {
        flex: 1,
        backgroundColor: COLORS.surfaceSecondary,
        borderRadius: 10,
        paddingVertical: 10,
        paddingHorizontal: 8,
        marginHorizontal: 4,
        alignItems: 'center',
    },
    statIconContainer: {
        width: 32,
        height: 32,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 4,
    },
    statValue: {
        fontSize: 18,
        fontWeight: '700',
        color: COLORS.textPrimary,
    },
    statTitle: {
        fontSize: 10,
        color: COLORS.textSecondary,
        marginTop: 2,
    },

    // Pending Banner
    pendingBanner: {
        marginHorizontal: 16,
        marginTop: 12,
        borderRadius: 12,
        overflow: 'hidden',
        backgroundColor: COLORS.warning,
    },
    pendingBannerContent: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 16,
    },
    pendingBannerText: {
        flex: 1,
        color: COLORS.white,
        fontWeight: '600',
        fontSize: 14,
        marginLeft: 12,
    },

    // Search
    searchSection: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    searchContainer: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.surface,
        borderRadius: 12,
        paddingHorizontal: 14,
        marginRight: 10,
        height: 48,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    searchInput: {
        flex: 1,
        marginLeft: 10,
        fontSize: 15,
        color: COLORS.textPrimary,
    },
    filterButton: {
        width: 48,
        height: 48,
        borderRadius: 12,
        backgroundColor: COLORS.surface,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    filterButtonActive: {
        backgroundColor: COLORS.primary,
        borderColor: COLORS.primary,
    },

    // Active Filters
    activeFilters: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingBottom: 8,
        flexWrap: 'wrap',
    },
    activeFilterChip: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.primary + '15',
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 20,
        marginRight: 8,
        marginBottom: 4,
        maxWidth: 150,
    },
    activeFilterText: {
        fontSize: 13,
        color: COLORS.primary,
        marginRight: 6,
        fontWeight: '500',
    },

    // Results Header
    resultsHeader: {
        paddingHorizontal: 16,
        paddingBottom: 8,
    },
    resultsCount: {
        fontSize: 13,
        color: COLORS.textSecondary,
    },

    // Employee List
    listContent: {
        paddingHorizontal: 16,
        paddingBottom: 20,
    },
    employeeCard: {
        backgroundColor: COLORS.surface,
        borderRadius: 16,
        marginBottom: 12,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
    },
    employeeCardContent: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
    },
    avatarContainer: {
        marginRight: 14,
    },
    avatar: {
        width: 56,
        height: 56,
        borderRadius: 28,
    },
    avatarGradient: {
        width: 56,
        height: 56,
        borderRadius: 28,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: COLORS.primary,
    },
    avatarText: {
        fontSize: 20,
        fontWeight: '700',
        color: COLORS.white,
    },
    employeeInfo: {
        flex: 1,
    },
    employeeName: {
        fontSize: 16,
        fontWeight: '600',
        color: COLORS.textPrimary,
        marginBottom: 2,
    },
    employeeId: {
        fontSize: 12,
        color: COLORS.textMuted,
        marginBottom: 6,
    },
    employeeMetaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 2,
    },
    employeeMeta: {
        fontSize: 12,
        color: COLORS.textSecondary,
        marginLeft: 6,
        flex: 1,
    },
    employeeActions: {
        alignItems: 'flex-end',
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 5,
        paddingHorizontal: 10,
        borderRadius: 20,
    },
    statusDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        marginRight: 6,
    },
    statusText: {
        fontSize: 12,
        fontWeight: '600',
    },
    actionIcons: {
        flexDirection: 'row',
        marginTop: 8,
    },
    iconBadge: {
        width: 28,
        height: 28,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 6,
    },

    // Empty State
    emptyContainer: {
        alignItems: 'center',
        paddingTop: 60,
        paddingBottom: 40,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: COLORS.textPrimary,
        marginTop: 16,
    },
    emptyText: {
        fontSize: 14,
        color: COLORS.textSecondary,
        marginTop: 8,
    },

    // Modal
    modalContainer: {
        flex: 1,
        backgroundColor: COLORS.background,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 14,
        backgroundColor: COLORS.surface,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
    },
    modalHeaderBtn: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: COLORS.textPrimary,
    },

    // Profile Header
    profileHeaderGradient: {
        alignItems: 'center',
        paddingVertical: 32,
        paddingHorizontal: 20,
        backgroundColor: COLORS.primary,
    },
    profileAvatarContainer: {
        marginBottom: 16,
    },
    profileAvatar: {
        width: 100,
        height: 100,
        borderRadius: 50,
        borderWidth: 4,
        borderColor: 'rgba(255,255,255,0.3)',
    },
    profileAvatarPlaceholder: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: 'rgba(255,255,255,0.25)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 4,
        borderColor: 'rgba(255,255,255,0.3)',
    },
    profileAvatarText: {
        fontSize: 36,
        fontWeight: '700',
        color: COLORS.white,
    },
    profileName: {
        fontSize: 24,
        fontWeight: '700',
        color: COLORS.white,
        textAlign: 'center',
    },
    profileDesignation: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.85)',
        marginTop: 4,
    },
    profileIdBadge: {
        backgroundColor: 'rgba(255,255,255,0.2)',
        paddingVertical: 6,
        paddingHorizontal: 16,
        borderRadius: 20,
        marginTop: 12,
    },
    profileIdText: {
        fontSize: 12,
        color: COLORS.white,
        fontWeight: '500',
    },

    // Permission Section
    permissionSection: {
        padding: 16,
    },
    permissionCard: {
        backgroundColor: COLORS.surface,
        borderRadius: 16,
        padding: 16,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
    },
    permissionStatusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    permissionIcon: {
        width: 48,
        height: 48,
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 14,
    },
    permissionInfo: {
        flex: 1,
    },
    permissionActive: {
        fontSize: 16,
        fontWeight: '600',
        color: COLORS.success,
    },
    permissionPending: {
        fontSize: 16,
        fontWeight: '600',
        color: COLORS.warning,
    },
    permissionInactive: {
        fontSize: 16,
        fontWeight: '600',
        color: COLORS.textSecondary,
    },
    permissionSubtext: {
        fontSize: 13,
        color: COLORS.textSecondary,
        marginTop: 2,
    },
    permissionActions: {
        flexDirection: 'row',
    },
    grantButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: COLORS.primary,
        paddingVertical: 12,
        borderRadius: 10,
    },
    grantButtonText: {
        color: COLORS.white,
        fontWeight: '600',
        marginLeft: 8,
    },
    revokeButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: COLORS.error,
        paddingVertical: 12,
        borderRadius: 10,
    },
    revokeButtonText: {
        color: COLORS.white,
        fontWeight: '600',
        marginLeft: 8,
    },
    approveButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: COLORS.success,
        paddingVertical: 12,
        borderRadius: 10,
        marginRight: 8,
    },
    approveButtonText: {
        color: COLORS.white,
        fontWeight: '600',
        marginLeft: 6,
    },
    rejectButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: COLORS.error,
        paddingVertical: 12,
        borderRadius: 10,
    },
    rejectButtonText: {
        color: COLORS.white,
        fontWeight: '600',
        marginLeft: 6,
    },

    // Detail Sections
    detailsContent: {
        flex: 1,
    },
    sectionTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: COLORS.textPrimary,
        marginBottom: 12,
    },
    detailSection: {
        paddingHorizontal: 16,
        paddingTop: 16,
    },
    detailCard: {
        backgroundColor: COLORS.surface,
        borderRadius: 14,
        overflow: 'hidden',
    },
    detailRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
    },
    detailRowMultiline: {
        flexDirection: 'column',
        alignItems: 'flex-start',
    },
    detailLabel: {
        fontSize: 14,
        color: COLORS.textSecondary,
    },
    detailValue: {
        fontSize: 14,
        color: COLORS.textPrimary,
        fontWeight: '500',
        textAlign: 'right',
        flex: 1,
        marginLeft: 16,
    },
    detailValueMultiline: {
        textAlign: 'left',
        marginLeft: 0,
        marginTop: 6,
        lineHeight: 20,
    },

    // Edit Modal
    editContent: {
        flex: 1,
        padding: 16,
    },
    editSection: {
        marginBottom: 20,
    },
    editSectionTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: COLORS.textPrimary,
        marginBottom: 14,
    },
    editFieldContainer: {
        marginBottom: 14,
    },
    editFieldLabel: {
        fontSize: 13,
        color: COLORS.textSecondary,
        marginBottom: 8,
    },
    editFieldInput: {
        backgroundColor: COLORS.surface,
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 15,
        color: COLORS.textPrimary,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    editFieldMultiline: {
        minHeight: 90,
        textAlignVertical: 'top',
    },

    // Request Card
    requestCard: {
        backgroundColor: COLORS.surface,
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
    },
    requestHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    requestAvatar: {
        width: 50,
        height: 50,
        borderRadius: 25,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
        backgroundColor: COLORS.primary,
    },
    requestAvatarText: {
        fontSize: 18,
        fontWeight: '700',
        color: COLORS.white,
    },
    requestInfo: {
        flex: 1,
    },
    requestName: {
        fontSize: 16,
        fontWeight: '600',
        color: COLORS.textPrimary,
    },
    requestId: {
        fontSize: 12,
        color: COLORS.textMuted,
        marginTop: 2,
    },
    requestDept: {
        fontSize: 13,
        color: COLORS.textSecondary,
        marginTop: 2,
    },
    requestReasonContainer: {
        backgroundColor: COLORS.surfaceSecondary,
        padding: 12,
        borderRadius: 10,
        marginBottom: 10,
    },
    requestReasonLabel: {
        fontSize: 12,
        color: COLORS.textMuted,
        marginBottom: 4,
    },
    requestReason: {
        fontSize: 14,
        color: COLORS.textPrimary,
        fontStyle: 'italic',
    },
    requestDate: {
        fontSize: 12,
        color: COLORS.textMuted,
        marginBottom: 14,
    },
    requestActions: {
        flexDirection: 'row',
    },

    // Filter Modal
    filterModalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    filterModalContent: {
        backgroundColor: COLORS.surface,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 20,
        maxHeight: '70%',
    },
    filterModalHandle: {
        width: 40,
        height: 4,
        backgroundColor: COLORS.border,
        borderRadius: 2,
        alignSelf: 'center',
        marginBottom: 16,
    },
    filterModalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    filterModalTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: COLORS.textPrimary,
    },
    filterLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: COLORS.textPrimary,
        marginBottom: 12,
        marginTop: 8,
    },
    filterOptions: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    filterChip: {
        paddingVertical: 10,
        paddingHorizontal: 18,
        backgroundColor: COLORS.surfaceSecondary,
        borderRadius: 25,
        marginRight: 10,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    filterChipActive: {
        backgroundColor: COLORS.primary,
        borderColor: COLORS.primary,
    },
    filterChipText: {
        fontSize: 14,
        color: COLORS.textPrimary,
        fontWeight: '500',
    },
    filterChipTextActive: {
        color: COLORS.white,
    },
    applyFilterButton: {
        backgroundColor: COLORS.primary,
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: 'center',
        marginTop: 24,
    },
    applyFilterButtonText: {
        color: COLORS.white,
        fontWeight: '600',
        fontSize: 16,
    },
    clearFilterButton: {
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
        marginTop: 10,
    },
    clearFilterButtonText: {
        color: COLORS.textSecondary,
        fontWeight: '600',
        fontSize: 14,
    },
});

export default EmployeeManagement;
