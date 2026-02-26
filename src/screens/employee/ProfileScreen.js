import React, { useState, useEffect } from 'react';
import {
    View,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    RefreshControl,
    ActivityIndicator,
    Animated,
    ImageBackground,
    Modal,
    TextInput,
    Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome5';
import MaterialIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Text, useTheme, Avatar, Divider } from 'react-native-paper';
import { useAuth } from '../../context/AuthContext';
import AppHeader from '../../components/ui/AppHeader';
import ApiService from '../../services/api.service';
import showToast from '../../utils/Toast';

const ProfileScreen = ({ navigation }) => {
    const { employee, user, logout } = useAuth();
    const { custom } = useTheme();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [profileData, setProfileData] = useState({
        name: '',
        employee_name: '',
        company_email: '',
        personal_email: '',
        cell_number: '',
        department: '',
        designation: '',
        company: '',
        date_of_joining: '',
        date_of_birth: '',
        gender: '',
        marital_status: '',
        blood_group: '',
        current_address: '',
        permanent_address: '',
        pan_number: '',
        bank_ac_no: '',
        bank_name: '',
        employment_type: '',
        status: '',
        reports_to: '',
        grade: '',
        default_shift: '',
    });

    // Edit permission states
    const [canEdit, setCanEdit] = useState(false);
    const [pendingRequest, setPendingRequest] = useState(false);
    const [requestModalVisible, setRequestModalVisible] = useState(false);
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [requestReason, setRequestReason] = useState('');
    const [editForm, setEditForm] = useState({});
    const [submitting, setSubmitting] = useState(false);
    const [savingEdit, setSavingEdit] = useState(false);

    useEffect(() => {
        fetchProfileData();
    }, []);

    const fetchProfileData = async () => {
        try {
            setLoading(true);
            if (!employee?.name) {
                console.log('No employee ID found');
                setLoading(false);
                return;
            }

            console.log('Fetching profile for employee:', employee.name);
            const response = await ApiService.get(`/api/method/hrms.api.get_employee_profile?employee=${employee.name}`);
            console.log('📊 API Response:', response);
            
            if (response.success) {
                // Extract the actual profile data from response.data.message
                const profileInfo = response.data?.message || response.message || {};
                
                // Check if response contains the new format with can_edit
                if (profileInfo.status === 'success' && profileInfo.data) {
                    const data = profileInfo.data;
                    setProfileData(data);
                    setCanEdit(data.can_edit || false);
                    setPendingRequest(data.pending_edit_request ? true : false);
                    setEditForm(data);
                } else {
                    setProfileData(profileInfo);
                    // Also check edit permission separately
                    checkEditPermission();
                }
                console.log('✅ Profile data extracted:', profileInfo);
            } else {
                console.error('❌ Failed response:', response);
                showToast({
                    type: 'error',
                    text1: 'Error',
                    text2: 'Failed to load profile data',
                });
            }
        } catch (error) {
            console.error('❌ Profile fetch error:', error);
            console.error('Error details:', error.message);
            showToast({
                type: 'error',
                text1: 'Error',
                text2: error.message || 'Failed to fetch profile information',
            });
        } finally {
            setLoading(false);
        }
    };

    const checkEditPermission = async () => {
        try {
            const response = await ApiService.get(`/api/method/hrms.api.check_edit_permission?employee=${employee.name}`);
            if (response.data?.message?.status === 'success') {
                setCanEdit(response.data.message.can_edit || false);
                setPendingRequest(response.data.message.pending_request || false);
            }
        } catch (error) {
            console.error('Error checking edit permission:', error);
        }
    };

    const handleRequestEditAccess = async () => {
        if (!requestReason.trim()) {
            Alert.alert('Required', 'Please provide a reason for requesting edit access');
            return;
        }

        try {
            setSubmitting(true);
            const response = await ApiService.post('/api/method/hrms.api.request_profile_edit', {
                employee: employee.name,
                reason: requestReason,
            });

            if (response.data?.message?.status === 'success') {
                showToast({
                    type: 'success',
                    text1: 'Request Submitted',
                    text2: 'Admin will review your request',
                });
                setRequestModalVisible(false);
                setRequestReason('');
                setPendingRequest(true);
            } else {
                Alert.alert('Error', response.data?.message?.message || 'Failed to submit request');
            }
        } catch (error) {
            console.error('Error requesting edit access:', error);
            Alert.alert('Error', 'Failed to submit request');
        } finally {
            setSubmitting(false);
        }
    };

    const handleSaveProfile = async () => {
        try {
            setSavingEdit(true);
            const response = await ApiService.post('/api/method/hrms.api.update_employee_profile', {
                employee: employee.name,
                updates: JSON.stringify(editForm),
            });

            if (response.data?.message?.status === 'success') {
                showToast({
                    type: 'success',
                    text1: 'Success',
                    text2: 'Profile updated successfully',
                });
                setEditModalVisible(false);
                fetchProfileData();
            } else {
                Alert.alert('Error', response.data?.message?.message || 'Failed to update profile');
            }
        } catch (error) {
            console.error('Error updating profile:', error);
            Alert.alert('Error', 'Failed to update profile');
        } finally {
            setSavingEdit(false);
        }
    };

    const onRefresh = async () => {
        setRefreshing(true);
        await fetchProfileData();
        setRefreshing(false);
    };

    const handleLogout = async () => {
        await logout();
    };

    if (loading) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: custom.palette.background }}>
                <ActivityIndicator size="large" color={custom.palette.primary} />
                <Text style={{ marginTop: 12, color: custom.palette.textSecondary }}>Loading profile...</Text>
            </View>
        );
    }

    const getInitials = (name) => {
        return (name || 'U').split(' ').map(n => n[0]).join('').toUpperCase();
    };

    const renderRequestModal = () => (
        <Modal
            visible={requestModalVisible}
            animationType="slide"
            transparent
            onRequestClose={() => setRequestModalVisible(false)}
        >
            <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>Request Edit Access</Text>
                        <TouchableOpacity onPress={() => setRequestModalVisible(false)}>
                            <MaterialIcon name="close" size={24} color="#333" />
                        </TouchableOpacity>
                    </View>
                    
                    <Text style={styles.modalDescription}>
                        Please provide a reason for requesting edit access to your profile. Admin will review your request.
                    </Text>
                    
                    <Text style={styles.inputLabel}>Reason</Text>
                    <TextInput
                        style={styles.reasonInput}
                        value={requestReason}
                        onChangeText={setRequestReason}
                        placeholder="E.g., Need to update my phone number and address"
                        placeholderTextColor="#9CA3AF"
                        multiline
                        numberOfLines={4}
                        textAlignVertical="top"
                    />
                    
                    <TouchableOpacity
                        style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
                        onPress={handleRequestEditAccess}
                        disabled={submitting}
                    >
                        {submitting ? (
                            <ActivityIndicator size="small" color="#fff" />
                        ) : (
                            <>
                                <MaterialIcon name="send" size={18} color="#fff" />
                                <Text style={styles.submitButtonText}>Submit Request</Text>
                            </>
                        )}
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );

    const renderEditModal = () => (
        <Modal
            visible={editModalVisible}
            animationType="slide"
            onRequestClose={() => setEditModalVisible(false)}
        >
            <View style={styles.editModalContainer}>
                <View style={styles.editModalHeader}>
                    <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                        <MaterialIcon name="close" size={24} color="#333" />
                    </TouchableOpacity>
                    <Text style={styles.editModalTitle}>Edit Profile</Text>
                    <TouchableOpacity onPress={handleSaveProfile} disabled={savingEdit}>
                        {savingEdit ? (
                            <ActivityIndicator size="small" color={custom.palette.primary} />
                        ) : (
                            <MaterialIcon name="check" size={24} color={custom.palette.primary} />
                        )}
                    </TouchableOpacity>
                </View>

                <ScrollView style={styles.editForm} showsVerticalScrollIndicator={false}>
                    <Text style={styles.editSectionTitle}>Basic Information</Text>
                    <EditField label="First Name" field="first_name" value={editForm.first_name} onChange={setEditForm} />
                    <EditField label="Middle Name" field="middle_name" value={editForm.middle_name} onChange={setEditForm} />
                    <EditField label="Last Name" field="last_name" value={editForm.last_name} onChange={setEditForm} />
                    <EditField label="Marital Status" field="marital_status" value={editForm.marital_status} onChange={setEditForm} />
                    <EditField label="Blood Group" field="blood_group" value={editForm.blood_group} onChange={setEditForm} />

                    <Text style={styles.editSectionTitle}>Contact Information</Text>
                    <EditField label="Phone Number" field="cell_number" value={editForm.cell_number} onChange={setEditForm} keyboardType="phone-pad" />
                    <EditField label="Personal Email" field="personal_email" value={editForm.personal_email} onChange={setEditForm} keyboardType="email-address" />

                    <Text style={styles.editSectionTitle}>Address</Text>
                    <EditField label="Current Address" field="current_address" value={editForm.current_address} onChange={setEditForm} multiline />
                    <EditField label="Permanent Address" field="permanent_address" value={editForm.permanent_address} onChange={setEditForm} multiline />

                    <Text style={styles.editSectionTitle}>Emergency Contact</Text>
                    <EditField label="Contact Person" field="person_to_be_contacted" value={editForm.person_to_be_contacted} onChange={setEditForm} />
                    <EditField label="Emergency Phone" field="emergency_phone_number" value={editForm.emergency_phone_number} onChange={setEditForm} keyboardType="phone-pad" />
                    <EditField label="Relation" field="relation" value={editForm.relation} onChange={setEditForm} />

                    <Text style={styles.editSectionTitle}>Bank Details</Text>
                    <EditField label="Bank Name" field="bank_name" value={editForm.bank_name} onChange={setEditForm} />
                    <EditField label="Account Number" field="bank_ac_no" value={editForm.bank_ac_no} onChange={setEditForm} />
                    <EditField label="IBAN" field="iban" value={editForm.iban} onChange={setEditForm} />

                    <Text style={styles.editSectionTitle}>Passport Details</Text>
                    <EditField label="Passport Number" field="passport_number" value={editForm.passport_number} onChange={setEditForm} />
                    <EditField label="Valid Until" field="valid_upto" value={editForm.valid_upto} onChange={setEditForm} />
                    <EditField label="Issue Date" field="date_of_issue" value={editForm.date_of_issue} onChange={setEditForm} />
                    <EditField label="Place of Issue" field="place_of_issue" value={editForm.place_of_issue} onChange={setEditForm} />

                    <View style={{ height: 40 }} />
                </ScrollView>
            </View>
        </Modal>
    );

    return (
        <View style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
            

            <ScrollView
                contentContainerStyle={{ paddingBottom: 20 }}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            >
                {/* Hero Header with Gradient Background */}
                <View style={{
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    paddingVertical: 40,
                    paddingHorizontal: 16,
                    alignItems: 'center',
                    backgroundColor: custom.palette.primary,
                    borderBottomLeftRadius: 24,
                    borderBottomRightRadius: 24,
                    elevation: 3,
                    shadowColor: '#000',
                    shadowOpacity: 0.12,
                    shadowRadius: 4,
                    shadowOffset: { width: 0, height: 2 }
                }}>
                    <Avatar.Text
                        size={100}
                        label={getInitials(profileData.employee_name)}
                        style={{
                            backgroundColor: 'rgba(255,255,255,0.3)',
                            marginBottom: 16,
                            borderWidth: 3,
                            borderColor: '#fff'
                        }}
                        labelStyle={{ fontSize: 40, fontWeight: '700' }}
                    />
                    <Text style={{ fontSize: 22, fontWeight: '700', color: '#fff', marginBottom: 4 }}>
                        {profileData.employee_name || 'Employee'}
                    </Text>
                    <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.9)', marginBottom: 12 }}>
                        {profileData.designation || 'N/A'}
                    </Text>
                    <View style={{
                        backgroundColor: 'rgba(255,255,255,0.25)',
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 20,
                    }}>
                        <Text style={{ fontSize: 11, color: '#fff', fontWeight: '600' }}>
                            ID: {profileData.name}
                        </Text>
                    </View>

                    {/* Edit Permission Status & Actions */}
                    <View style={styles.editActionContainer}>
                        {canEdit ? (
                            <TouchableOpacity
                                style={styles.editButton}
                                onPress={() => {
                                    setEditForm({ ...profileData });
                                    setEditModalVisible(true);
                                }}
                            >
                                <MaterialIcon name="pencil" size={16} color="#fff" />
                                <Text style={styles.editButtonText}>Edit Profile</Text>
                            </TouchableOpacity>
                        ) : pendingRequest ? (
                            <View style={styles.pendingBadge}>
                                <MaterialIcon name="clock-outline" size={16} color="#F59E0B" />
                                <Text style={styles.pendingBadgeText}>Edit Request Pending</Text>
                            </View>
                        ) : (
                            <TouchableOpacity
                                style={styles.requestButton}
                                onPress={() => setRequestModalVisible(true)}
                            >
                                <MaterialIcon name="lock-open-outline" size={16} color="#fff" />
                                <Text style={styles.requestButtonText}>Request Edit Access</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>

                {/* Quick Stats */}
                <View style={{
                    flexDirection: 'row',
                    justifyContent: 'space-around',
                    paddingHorizontal: 12,
                    marginTop: -25,
                    marginBottom: 24,
                    zIndex: 10,
                }}>
                    <StatCard
                        icon="sitemap"
                        label="Department"
                        value={profileData.department || 'N/A'}
                        color="#3B82F6"
                    />
                    <StatCard
                        icon="briefcase"
                        label="Status"
                        value={profileData.status || 'N/A'}
                        color="#10B981"
                    />
                    <StatCard
                        icon="calendar"
                        label="Shift"
                        value={profileData.default_shift || 'N/A'}
                        color="#F59E0B"
                    />
                </View>

                {/* Contact Information */}
                <InfoCard title="📞 Contact Information" icon="envelope">
                    <InfoItem
                        icon="envelope"
                        label="Company Email"
                        value={profileData.company_email || 'N/A'}
                        color="#3B82F6"
                    />
                    <InfoItem
                        icon="envelope-open"
                        label="Personal Email"
                        value={profileData.personal_email || 'N/A'}
                        color="#8B5CF6"
                    />
                    <InfoItem
                        icon="mobile-alt"
                        label="Mobile Number"
                        value={profileData.cell_number || 'N/A'}
                        color="#EC4899"
                    />
                </InfoCard>

                {/* Personal Information */}
                <InfoCard title="👤 Personal Information" icon="user">
                    <InfoItem
                        icon="birthday-cake"
                        label="Date of Birth"
                        value={profileData.date_of_birth || 'N/A'}
                        color="#F59E0B"
                    />
                    <InfoItem
                        icon="user"
                        label="Gender"
                        value={profileData.gender || 'N/A'}
                        color="#06B6D4"
                    />
                    <InfoItem
                        icon="heart"
                        label="Marital Status"
                        value={profileData.marital_status || 'N/A'}
                        color="#EF4444"
                    />
                    <InfoItem
                        icon="tint"
                        label="Blood Group"
                        value={profileData.blood_group || 'N/A'}
                        color="#DC2626"
                    />
                </InfoCard>

                {/* Employment Information */}
                <InfoCard title="💼 Employment Information" icon="briefcase">
                    <InfoItem
                        icon="building"
                        label="Company"
                        value={profileData.company || 'N/A'}
                        color="#10B981"
                    />
                    <InfoItem
                        icon="id-card"
                        label="Designation"
                        value={profileData.designation || 'N/A'}
                        color="#06B6D4"
                    />
                    <InfoItem
                        icon="calendar-alt"
                        label="Date of Joining"
                        value={profileData.date_of_joining || 'N/A'}
                        color="#8B5CF6"
                    />
                    <InfoItem
                        icon="certificate"
                        label="Employment Type"
                        value={profileData.employment_type || 'N/A'}
                        color="#F59E0B"
                    />
                    <InfoItem
                        icon="star"
                        label="Grade"
                        value={profileData.grade || 'N/A'}
                        color="#FBBF24"
                    />
                    <InfoItem
                        icon="user-tie"
                        label="Reports To"
                        value={profileData.reports_to || 'N/A'}
                        color="#3B82F6"
                    />
                </InfoCard>

                {/* Address Information */}
                <InfoCard title="📍 Address Information" icon="map-marker-alt">
                    <InfoItemMultiLine
                        icon="home"
                        label="Current Address"
                        value={profileData.current_address || 'N/A'}
                        color="#06B6D4"
                    />
                    <InfoItemMultiLine
                        icon="map"
                        label="Permanent Address"
                        value={profileData.permanent_address || 'N/A'}
                        color="#8B5CF6"
                    />
                </InfoCard>

                {/* Financial Information */}
                <InfoCard title="💳 Financial Information" icon="credit-card">
                    <InfoItem
                        icon="money-check-alt"
                        label="Bank Name"
                        value={profileData.bank_name || 'N/A'}
                        color="#059669"
                    />
                    <InfoItem
                        icon="shield-alt"
                        label="Bank Account"
                        value={profileData.bank_ac_no ? '••••' + profileData.bank_ac_no.slice(-4) : 'N/A'}
                        color="#DC2626"
                    />
                    <InfoItem
                        icon="id-badge"
                        label="PAN Number"
                        value={profileData.pan_number ? '••••' + profileData.pan_number.slice(-4) : 'N/A'}
                        color="#7C3AED"
                    />
                </InfoCard>

                {/* Logout Button */}
                <TouchableOpacity
                    style={{
                        backgroundColor: '#EF4444',
                        marginHorizontal: 16,
                        marginTop: 24,
                        paddingVertical: 14,
                        borderRadius: 12,
                        alignItems: 'center',
                        elevation: 2,
                        shadowColor: '#EF4444',
                        shadowOpacity: 0.3,
                        shadowRadius: 8,
                        shadowOffset: { width: 0, height: 4 }
                    }}
                    onPress={handleLogout}
                    activeOpacity={0.7}
                >
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Icon name="sign-out-alt" size={16} color="white" />
                        <Text style={{ color: 'white', fontWeight: '700', marginLeft: 10, fontSize: 15 }}>
                            Logout
                        </Text>
                    </View>
                </TouchableOpacity>
            </ScrollView>

            {/* Modals */}
            {renderRequestModal()}
            {renderEditModal()}
        </View>
    );
};

// Stat Card Component for Quick Overview
const StatCard = ({ icon, label, value, color }) => {
    return (
        <View style={{
            flex: 1,
            backgroundColor: '#fff',
            marginHorizontal: 8,
            paddingVertical: 12,
            paddingHorizontal: 10,
            borderRadius: 14,
            alignItems: 'center',
            elevation: 2,
            shadowColor: '#000',
            shadowOpacity: 0.08,
            shadowRadius: 3,
            shadowOffset: { width: 0, height: 1 }
        }}>
            <View style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                backgroundColor: `${color}15`,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 8,
            }}>
                <Icon name={icon} size={18} color={color} />
            </View>
            <Text style={{ fontSize: 10, color: '#6B7280', fontWeight: '500', marginBottom: 4 }}>
                {label}
            </Text>
            <Text style={{ fontSize: 12, color: '#111827', fontWeight: '700', textAlign: 'center' }}>
                {value}
            </Text>
        </View>
    );
};

// Info Card Container
const InfoCard = ({ title, icon, children }) => {
    return (
        <View style={{
            backgroundColor: '#fff',
            marginHorizontal: 16,
            marginBottom: 16,
            borderRadius: 14,
            paddingTop: 14,
            overflow: 'hidden',
            elevation: 1,
            shadowColor: '#000',
            shadowOpacity: 0.06,
            shadowRadius: 3,
            shadowOffset: { width: 0, height: 1 }
        }}>
            <View style={{
                paddingHorizontal: 16,
                paddingBottom: 12,
                borderBottomWidth: 1,
                borderBottomColor: '#F3F4F6',
            }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#111827' }}>
                    {title}
                </Text>
            </View>
            {children}
        </View>
    );
};

// Info Item for single line values
const InfoItem = ({ icon, label, value, color }) => {
    return (
        <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: 12,
            paddingHorizontal: 16,
            borderBottomWidth: 1,
            borderBottomColor: '#F9FAFB',
        }}>
            <View style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                backgroundColor: `${color}15`,
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 12,
            }}>
                <Icon name={icon} size={16} color={color} />
            </View>
            <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, color: '#9CA3AF', fontWeight: '500', marginBottom: 2 }}>
                    {label}
                </Text>
                <Text style={{ fontSize: 13, color: '#111827', fontWeight: '600' }}>
                    {value}
                </Text>
            </View>
        </View>
    );
};

// Info Item for multi-line values
const InfoItemMultiLine = ({ icon, label, value, color }) => {
    return (
        <View style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            paddingVertical: 12,
            paddingHorizontal: 16,
            borderBottomWidth: 1,
            borderBottomColor: '#F9FAFB',
        }}>
            <View style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                backgroundColor: `${color}15`,
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 12,
                marginTop: 2,
            }}>
                <Icon name={icon} size={16} color={color} />
            </View>
            <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, color: '#9CA3AF', fontWeight: '500', marginBottom: 4 }}>
                    {label}
                </Text>
                <Text style={{ fontSize: 13, color: '#111827', fontWeight: '500', lineHeight: 20 }}>
                    {value}
                </Text>
            </View>
        </View>
    );
};

// Edit Field Component
const EditField = ({ label, field, value, onChange, keyboardType = 'default', multiline = false }) => (
    <View style={styles.editFieldContainer}>
        <Text style={styles.editFieldLabel}>{label}</Text>
        <TextInput
            style={[styles.editFieldInput, multiline && styles.editFieldMultiline]}
            value={value || ''}
            onChangeText={(text) => onChange(prev => ({ ...prev, [field]: text }))}
            placeholder={`Enter ${label.toLowerCase()}`}
            placeholderTextColor="#9CA3AF"
            keyboardType={keyboardType}
            multiline={multiline}
            numberOfLines={multiline ? 3 : 1}
        />
    </View>
);

const styles = StyleSheet.create({
    // Edit Action Buttons
    editActionContainer: {
        marginTop: 16,
    },
    editButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#10B981',
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 20,
    },
    editButtonText: {
        color: '#fff',
        fontWeight: '600',
        marginLeft: 8,
        fontSize: 14,
    },
    requestButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.25)',
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.5)',
    },
    requestButtonText: {
        color: '#fff',
        fontWeight: '600',
        marginLeft: 8,
        fontSize: 14,
    },
    pendingBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FEF3C7',
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 20,
    },
    pendingBadgeText: {
        color: '#D97706',
        fontWeight: '600',
        marginLeft: 8,
        fontSize: 14,
    },

    // Modal Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modalContent: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 20,
        width: '100%',
        maxWidth: 400,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#111827',
    },
    modalDescription: {
        fontSize: 14,
        color: '#6B7280',
        marginBottom: 20,
        lineHeight: 20,
    },
    inputLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: '#374151',
        marginBottom: 8,
    },
    reasonInput: {
        backgroundColor: '#F9FAFB',
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 10,
        padding: 12,
        fontSize: 14,
        color: '#111827',
        minHeight: 100,
        textAlignVertical: 'top',
    },
    submitButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#3B82F6',
        paddingVertical: 14,
        borderRadius: 10,
        marginTop: 20,
    },
    submitButtonDisabled: {
        opacity: 0.7,
    },
    submitButtonText: {
        color: '#fff',
        fontWeight: '600',
        marginLeft: 8,
        fontSize: 15,
    },

    // Edit Modal Styles
    editModalContainer: {
        flex: 1,
        backgroundColor: '#F8FAFC',
    },
    editModalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
        backgroundColor: '#fff',
    },
    editModalTitle: {
        fontSize: 17,
        fontWeight: '600',
        color: '#111827',
    },
    editForm: {
        flex: 1,
        padding: 16,
    },
    editSectionTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: '#111827',
        marginBottom: 12,
        marginTop: 16,
    },
    editFieldContainer: {
        marginBottom: 14,
    },
    editFieldLabel: {
        fontSize: 13,
        color: '#6B7280',
        marginBottom: 6,
    },
    editFieldInput: {
        backgroundColor: '#fff',
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 12,
        fontSize: 14,
        color: '#111827',
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    editFieldMultiline: {
        minHeight: 80,
        textAlignVertical: 'top',
    },
});

export default ProfileScreen;