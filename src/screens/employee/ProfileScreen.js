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
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome5';
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
                setProfileData(profileInfo);
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

export default ProfileScreen;