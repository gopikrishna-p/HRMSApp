// src/screens/employee/ProfileScreen.js
//
// The signed-in employee's profile: contact, personal, employment, address and bank details.
// Editing is gated by HR: the employee requests edit access, and once it is granted edits a
// fixed set of fields on a full-screen form. The admin app opens this screen too (My Profile).
import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    SafeAreaView,
    KeyboardAvoidingView,
    Platform,
    Image,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { toastConfig } from '../../config/toastConfig';
import { useAuth } from '../../context/AuthContext';
import ApiService, { extractFrappeData, isApiSuccess, getApiErrorMessage } from '../../services/api.service';
import showToast from '../../utils/Toast';
import {
    Screen,
    Group,
    Row,
    Avatar,
    StatusText,
    Sheet,
    Button,
    IconButton,
    TextField,
    Loading,
    EmptyState,
    color,
    space,
    type,
    formatShortDate,
    ModalTopInset,
    KeyboardSafeView,
} from '../../components/ds';

const STATUS_TONE = { Active: 'success', Inactive: 'neutral', Suspended: 'warning', Left: 'danger' };

// 'Engineering - DG' -> 'Engineering' (display only)
const shortDept = (dept) => String(dept || '').replace(/ - [A-Z0-9]+$/, '');

// 'YYYY-MM-DD' -> '12 Oct 2026' (local date, no timezone shift); other values pass through
const displayDate = (value) => {
    const [y, m, d] = String(value || '').slice(0, 10).split('-').map(Number);
    return y && m && d ? formatShortDate(new Date(y, m - 1, d)) : value || null;
};

// last four characters only, e.g. '••••4321'
const masked = (value) => (value ? '••••' + String(value).slice(-4) : null);

const ProfileScreen = ({ navigation }) => {
    const { employee, logout } = useAuth();
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
    const busyRef = useRef(false); // blocks a second tap before the re-render disables the button
    const [loadError, setLoadError] = useState(null); // shown when there is no profile on screen yet
    const [loggingOut, setLoggingOut] = useState(false);

    useEffect(() => {
        fetchProfileData();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
    }, []);

    const fetchProfileData = async () => {
        try {
            setLoading(true);
            if (!employee?.name) {
                console.log('No employee ID found');
                setLoadError('Your account is not linked to an employee record. Ask HR to link it.');
                setLoading(false);
                return;
            }

            const response = await ApiService.get(`/api/method/hrms.api.get_employee_profile?employee=${employee.name}`);

            if (!isApiSuccess(response)) {
                const errorMsg = getApiErrorMessage(response, 'Failed to load profile data');
                console.error('Profile fetch failed:', errorMsg);
                setLoadError(errorMsg);
                showToast({
                    type: 'error',
                    text1: 'Could not load your profile',
                    text2: errorMsg,
                });
                return;
            }

            // Extract the actual profile data using helper
            const profileInfo = extractFrappeData(response, {});

            // Check if response contains the new format with can_edit
            if (profileInfo.status === 'success' && profileInfo.data) {
                const data = profileInfo.data;
                setProfileData(data);
                setCanEdit(data.can_edit || false);
                setPendingRequest(data.pending_edit_request ? true : false);
                setEditForm(data);
                setLoadError(null);
            } else if (profileInfo && Object.keys(profileInfo).length > 0) {
                // Direct profile data format
                setProfileData(profileInfo);
                setEditForm(profileInfo);
                setLoadError(null);
                // Also check edit permission separately
                checkEditPermission();
            } else {
                console.warn('Empty or invalid profile data');
                setLoadError('The server sent an empty profile.');
            }
        } catch (error) {
            console.error('Profile fetch error:', error);
            setLoadError(error.message || 'Check your connection and try again.');
            showToast({
                type: 'error',
                text1: 'Could not load your profile',
                text2: error.message || 'Check your connection and try again.',
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
        if (busyRef.current) {
            return;
        }
        if (!requestReason.trim()) {
            showToast({ type: 'warning', text1: 'Add a reason', text2: 'Tell HR what you need to change.' });
            return;
        }

        busyRef.current = true;
        try {
            setSubmitting(true);
            const response = await ApiService.post('/api/method/hrms.api.request_profile_edit', {
                employee: employee.name,
                reason: requestReason,
            });

            if (response.data?.message?.status === 'success') {
                showToast({
                    type: 'success',
                    text1: 'Request sent',
                    text2: 'HR will review it.',
                });
                setRequestModalVisible(false);
                setRequestReason('');
                setPendingRequest(true);
            } else {
                showToast({
                    type: 'error',
                    text1: 'Request not sent',
                    // the API wrapper puts the server's text in response.message (HTTP and status errors)
                    text2: response.message || response.data?.message?.message || 'Please try again.',
                });
            }
        } catch (error) {
            console.error('Error requesting edit access:', error);
            showToast({ type: 'error', text1: 'Request not sent', text2: 'Check your connection and try again.' });
        } finally {
            busyRef.current = false;
            setSubmitting(false);
        }
    };

    const handleSaveProfile = async () => {
        if (busyRef.current) {
            return;
        }
        // passport dates go into Date fields, so they must be YYYY-MM-DD (or empty)
        const badDate = [['valid_upto', 'Valid until'], ['date_of_issue', 'Issue date']]
            .find(([field]) => editForm[field] && !/^\d{4}-\d{2}-\d{2}$/.test(String(editForm[field]).trim()));
        if (badDate) {
            showToast({ type: 'warning', text1: `${badDate[1]}: use YYYY-MM-DD`, text2: 'For example 2030-04-15' });
            return;
        }
        busyRef.current = true;
        try {
            setSavingEdit(true);
            const response = await ApiService.post('/api/method/hrms.api.update_employee_profile', {
                employee: employee.name,
                updates: JSON.stringify(editForm),
            });

            if (response.data?.message?.status === 'success') {
                showToast({
                    type: 'success',
                    text1: 'Profile updated',
                });
                setEditModalVisible(false);
                await fetchProfileData();
            } else {
                showToast({
                    type: 'error',
                    text1: 'Profile not saved',
                    // the API wrapper puts the server's text in response.message (HTTP and status errors)
                    text2: response.message || response.data?.message?.message || 'Please try again.',
                });
            }
        } catch (error) {
            console.error('Error updating profile:', error);
            showToast({ type: 'error', text1: 'Profile not saved', text2: 'Check your connection and try again.' });
        } finally {
            busyRef.current = false;
            setSavingEdit(false);
        }
    };

    const onRefresh = async () => {
        setRefreshing(true);
        await fetchProfileData();
        setRefreshing(false);
    };

    const handleLogout = async () => {
        if (loggingOut) {
            return;
        }
        setLoggingOut(true);
        try {
            await logout();
        } finally {
            setLoggingOut(false);
        }
    };

    const openEdit = () => {
        setEditForm({ ...profileData });
        setEditModalVisible(true);
    };

    // the edit form stays open while a save is in flight
    const closeEdit = () => {
        if (!busyRef.current) {
            setEditModalVisible(false);
        }
    };

    // Full-screen spinner for the first load only; refreshes keep the profile on screen.
    if (loading && !profileData.name) {
        return (
            <View style={styles.container}>
                <Loading />
            </View>
        );
    }

    // First load failed: say why, offer a retry, and keep Log out reachable.
    if (!profileData.name && loadError) {
        return (
            <View style={styles.container}>
                <Screen refreshing={refreshing} onRefresh={onRefresh}>
                    <EmptyState
                        icon="alert-circle"
                        title="Could not load your profile"
                        message={loadError}
                        action="Try again"
                        onAction={fetchProfileData}
                    />
                    <Button title="Log out" variant="danger" onPress={handleLogout} loading={loggingOut} full />
                </Screen>
            </View>
        );
    }

    const displayName = profileData.employee_name || 'Employee';
    const role = [profileData.designation, shortDept(profileData.department)].filter(Boolean).join('  ·  ');

    let editRow;
    let editNote;
    if (canEdit) {
        editRow = <Row title="Edit profile" onPress={openEdit} />;
    } else if (pendingRequest) {
        editRow = <Row title="Edit access" right={<StatusText label="Requested" tone="warning" />} />;
        editNote = 'HR is reviewing your request to edit your details.';
    } else {
        editRow = <Row title="Request edit access" onPress={() => setRequestModalVisible(true)} />;
        editNote = 'Your details are locked. Ask HR for access to change them.';
    }

    const renderRequestSheet = () => (
        <Sheet
            visible={requestModalVisible}
            title="Request edit access"
            subtitle="HR reviews the request before you can edit your details."
            onClose={() => !submitting && setRequestModalVisible(false)}
            dismissable={!submitting}
            footer={(
                <>
                    <Button title="Cancel" variant="secondary" onPress={() => setRequestModalVisible(false)} disabled={submitting} style={styles.flex} />
                    <Button title="Send request" onPress={handleRequestEditAccess} loading={submitting} style={styles.flex} />
                </>
            )}
        >
            <TextField
                label="Reason"
                value={requestReason}
                onChangeText={setRequestReason}
                placeholder="For example, a new phone number or address"
                multiline
                numberOfLines={4}
                autoFocus
            />
        </Sheet>
    );

    const renderEditModal = () => (
        <Modal
            visible={editModalVisible}
            animationType="slide"
            statusBarTranslucent
            onRequestClose={closeEdit}
        >
            <SafeAreaView style={styles.page}>
                <ModalTopInset />
                <PageHeader title="Edit profile" onClose={closeEdit} />
                {/* Android: the translucent Modal does not shrink for the keyboard; this keeps the form above it */}
                <KeyboardSafeView>
                <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                    <Screen footer={<Button title="Save changes" onPress={handleSaveProfile} loading={savingEdit} full />}>
                        <FormGroup title="Basic information">
                            <EditField label="First name" field="first_name" value={editForm.first_name} onChange={setEditForm} />
                            <EditField label="Middle name" field="middle_name" value={editForm.middle_name} onChange={setEditForm} />
                            <EditField label="Last name" field="last_name" value={editForm.last_name} onChange={setEditForm} />
                            <EditField label="Marital status" field="marital_status" value={editForm.marital_status} onChange={setEditForm} />
                            <EditField label="Blood group" field="blood_group" value={editForm.blood_group} onChange={setEditForm} />
                        </FormGroup>

                        <FormGroup title="Contact">
                            <EditField label="Phone" field="cell_number" value={editForm.cell_number} onChange={setEditForm} keyboardType="phone-pad" />
                            <EditField label="Personal email" field="personal_email" value={editForm.personal_email} onChange={setEditForm} keyboardType="email-address" />
                        </FormGroup>

                        <FormGroup title="Address">
                            <EditField label="Current address" field="current_address" value={editForm.current_address} onChange={setEditForm} multiline />
                            <EditField label="Permanent address" field="permanent_address" value={editForm.permanent_address} onChange={setEditForm} multiline />
                        </FormGroup>

                        <FormGroup title="Emergency contact">
                            <EditField label="Contact person" field="person_to_be_contacted" value={editForm.person_to_be_contacted} onChange={setEditForm} />
                            <EditField label="Phone" field="emergency_phone_number" value={editForm.emergency_phone_number} onChange={setEditForm} keyboardType="phone-pad" />
                            <EditField label="Relation" field="relation" value={editForm.relation} onChange={setEditForm} />
                        </FormGroup>

                        <FormGroup title="Bank details">
                            <EditField label="Bank name" field="bank_name" value={editForm.bank_name} onChange={setEditForm} />
                            <EditField label="Account number" field="bank_ac_no" value={editForm.bank_ac_no} onChange={setEditForm} />
                            <EditField label="IBAN" field="iban" value={editForm.iban} onChange={setEditForm} />
                        </FormGroup>

                        <FormGroup title="Passport">
                            <EditField label="Passport number" field="passport_number" value={editForm.passport_number} onChange={setEditForm} />
                            <EditField label="Valid until" field="valid_upto" value={editForm.valid_upto} onChange={setEditForm} placeholder="YYYY-MM-DD" />
                            <EditField label="Issue date" field="date_of_issue" value={editForm.date_of_issue} onChange={setEditForm} placeholder="YYYY-MM-DD" />
                            <EditField label="Place of issue" field="place_of_issue" value={editForm.place_of_issue} onChange={setEditForm} />
                        </FormGroup>
                    </Screen>
                </KeyboardAvoidingView>
                </KeyboardSafeView>
            </SafeAreaView>
            {/* toasts from the root host would sit under this full-screen page */}
            <Toast config={toastConfig} />
        </Modal>
    );

    return (
        <View style={styles.container}>
            <Screen refreshing={refreshing} onRefresh={onRefresh}>
                <Group footer={editNote}>
                    <View style={styles.header}>
                        <PhotoAvatar key={profileData.image || 'initials'} name={displayName} image={profileData.image} size={56} />
                        <View style={styles.flex}>
                            <Text style={styles.name} numberOfLines={2}>{displayName}</Text>
                            {role ? <Text style={styles.role}>{role}</Text> : null}
                            {profileData.name ? <Text style={styles.id} selectable>{profileData.name}</Text> : null}
                        </View>
                    </View>
                    {editRow}
                </Group>

                <Group title="Contact">
                    <InfoRow label="Company email" value={profileData.company_email} />
                    <InfoRow label="Personal email" value={profileData.personal_email} />
                    <InfoRow label="Mobile" value={profileData.cell_number} />
                </Group>

                <Group title="Personal">
                    <InfoRow label="Date of birth" value={displayDate(profileData.date_of_birth)} />
                    <InfoRow label="Gender" value={profileData.gender} />
                    <InfoRow label="Marital status" value={profileData.marital_status} />
                    <InfoRow label="Blood group" value={profileData.blood_group} />
                </Group>

                <Group title="Employment">
                    <InfoRow label="Company" value={profileData.company} />
                    <InfoRow label="Department" value={shortDept(profileData.department)} />
                    <InfoRow label="Designation" value={profileData.designation} />
                    <InfoRow label="Date of joining" value={displayDate(profileData.date_of_joining)} />
                    {/* employment type, grade and shift are not in the profile response; shown only when present */}
                    {profileData.employment_type ? <InfoRow label="Employment type" value={profileData.employment_type} /> : null}
                    {profileData.grade ? <InfoRow label="Grade" value={profileData.grade} /> : null}
                    <InfoRow label="Reports to" value={profileData.reports_to_name || profileData.reports_to} />
                    {profileData.default_shift ? <InfoRow label="Shift" value={profileData.default_shift} /> : null}
                    <InfoRow
                        label="Status"
                        value={profileData.status ? <StatusText label={profileData.status} tone={STATUS_TONE[profileData.status] || 'neutral'} /> : null}
                    />
                </Group>

                <Group title="Address">
                    <InfoRow label="Current address" value={profileData.current_address} stacked />
                    <InfoRow label="Permanent address" value={profileData.permanent_address} stacked />
                </Group>

                <Group title="Emergency contact">
                    <InfoRow label="Contact person" value={profileData.person_to_be_contacted} />
                    <InfoRow label="Phone" value={profileData.emergency_phone_number} />
                    <InfoRow label="Relation" value={profileData.relation} />
                </Group>

                <Group title="Bank details">
                    <InfoRow label="Bank name" value={profileData.bank_name} />
                    <InfoRow label="Account number" value={masked(profileData.bank_ac_no)} />
                    {profileData.iban ? <InfoRow label="IBAN" value={masked(profileData.iban)} /> : null}
                    {profileData.pan_number ? <InfoRow label="PAN" value={masked(profileData.pan_number)} /> : null}
                </Group>

                <Group title="Passport">
                    <InfoRow label="Passport number" value={masked(profileData.passport_number)} />
                    <InfoRow label="Valid until" value={displayDate(profileData.valid_upto)} />
                    <InfoRow label="Issue date" value={displayDate(profileData.date_of_issue)} />
                    <InfoRow label="Place of issue" value={profileData.place_of_issue} />
                </Group>

                <Button title="Log out" variant="danger" onPress={handleLogout} loading={loggingOut} full />
            </Screen>

            {renderRequestSheet()}
            {renderEditModal()}
        </View>
    );
};

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

// Header bar for the full-screen edit form (matches the stack header).
const PageHeader = ({ title, onClose }) => (
    <View style={styles.pageHeader}>
        <View style={styles.pageHeaderSide}>
            <IconButton name="x" onPress={onClose} color={color.text} size={22} label="Close" />
        </View>
        <Text style={styles.pageTitle} numberOfLines={1}>{title}</Text>
        <View style={styles.pageHeaderSide} />
    </View>
);

// Label / value row. `stacked` puts long values (addresses) under the label.
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

// A titled white group holding form fields.
const FormGroup = ({ title, children }) => (
    <Group title={title}>
        <View style={styles.panel}>{children}</View>
    </Group>
);

// Edit Field Component
const EditField = ({ label, field, value, onChange, keyboardType = 'default', multiline = false, placeholder }) => (
    <TextField
        label={label}
        value={value || ''}
        onChangeText={(text) => onChange(prev => ({ ...prev, [field]: text }))}
        placeholder={placeholder}
        keyboardType={keyboardType}
        autoCapitalize={keyboardType === 'email-address' ? 'none' : undefined}
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
    />
);

const styles = StyleSheet.create({
    flex: { flex: 1 },
    container: { flex: 1, backgroundColor: color.bg },

    // Header group
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: space.lg,
        paddingVertical: space.lg,
        backgroundColor: color.surface,
    },
    photo: { marginRight: space.md, backgroundColor: color.neutralSoft },
    name: { ...type.title },
    role: { ...type.secondary, marginTop: 2 },
    id: { ...type.caption, marginTop: 2, fontVariant: ['tabular-nums'] },

    // Label / value rows
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

    // Full-screen edit form
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
});

export default ProfileScreen;
