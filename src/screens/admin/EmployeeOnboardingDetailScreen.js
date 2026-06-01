// src/screens/admin/EmployeeOnboardingDetailScreen.js
//
// Admin review + approve screen for a single Employee Onboarding Request.
//
// Sections:
//   A. Status header (status chip + invitation email + expiry)
//   B. Employee-filled (read-only — what the new hire submitted)
//   C. Admin-fill form (company / dept / designation / DOJ / shift / holiday
//      list / salary structure + base + variable / leave policy / company email)
//   D. Action row — varies by current status (Resend / Cancel / Reject / Approve)
//
// On "Approve & Onboard" tap, backend atomically creates User + Employee +
// Salary Structure Assignment + Leave Policy Assignment. See PART 4 of the
// plan doc for the contract.

import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Alert,
    Modal,
    TextInput,
    Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { colors } from '../../theme/colors';
import Loading from '../../components/common/Loading';
import Button from '../../components/common/Button';
import apiService, { extractFrappeData, isApiSuccess, getApiErrorMessage } from '../../services/api.service';
import { formatLocalDate } from '../../utils/dateFormat';
import showToast from '../../utils/Toast';

const STATUS_TINTS = {
    'Pending Submission': { bg: colors.infoLight, fg: colors.info },
    'Submitted': { bg: colors.warningLight, fg: '#92400E' },
    'Approved': { bg: colors.successLight, fg: '#065F46' },
    'Employee Created': { bg: colors.successLight, fg: '#065F46' },
    'Rejected': { bg: colors.errorLight, fg: '#991B1B' },
    'Cancelled': { bg: colors.lightGray, fg: colors.darkGray },
    'Expired': { bg: colors.lightGray, fg: colors.darkGray },
};

const Field = ({ label, value }) => (
    <View style={styles.field}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <Text style={styles.fieldValue}>{value || '—'}</Text>
    </View>
);

const EmployeeOnboardingDetailScreen = ({ navigation, route }) => {
    const requestName = route?.params?.name;
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);

    // Admin-fill form state
    const [company, setCompany] = useState('');
    const [department, setDepartment] = useState('');
    const [designation, setDesignation] = useState('');
    const [dateOfJoining, setDateOfJoining] = useState(new Date());
    const [showDojPicker, setShowDojPicker] = useState(false);
    const [defaultShift, setDefaultShift] = useState('');
    const [holidayList, setHolidayList] = useState('');
    const [salaryStructure, setSalaryStructure] = useState('');
    const [base, setBase] = useState('');
    const [variable, setVariable] = useState('');
    const [leavePolicy, setLeavePolicy] = useState('');
    const [companyEmail, setCompanyEmail] = useState('');
    const [branch, setBranch] = useState('');
    const [reportsTo, setReportsTo] = useState('');

    // Reject modal state
    const [rejectVisible, setRejectVisible] = useState(false);
    const [rejectReason, setRejectReason] = useState('');

    const load = useCallback(async () => {
        try {
            const response = await apiService.getOnboardingRequestDetail(requestName);
            if (!isApiSuccess(response)) {
                Alert.alert('Error', getApiErrorMessage(response, 'Failed to load request'));
                return;
            }
            const d = extractFrappeData(response, {})?.data || {};
            setData(d);
            // Pre-fill admin-fill section from any existing values
            setCompany(d.company || '');
            setDepartment(d.department || '');
            setDesignation(d.designation || '');
            if (d.date_of_joining) {
                try { setDateOfJoining(new Date(d.date_of_joining)); } catch { /* ignore */ }
            }
            setDefaultShift(d.default_shift || '');
            setHolidayList(d.holiday_list || '');
            setSalaryStructure(d.salary_structure || '');
            setBase(d.base ? String(d.base) : '');
            setVariable(d.variable ? String(d.variable) : '');
            setLeavePolicy(d.leave_policy || '');
            setCompanyEmail(d.company_email || '');
            setBranch(d.branch || '');
            setReportsTo(d.reports_to || '');
        } catch (err) {
            Alert.alert('Error', err?.message || 'Failed to load');
        }
    }, [requestName]);

    useEffect(() => {
        (async () => {
            setLoading(true);
            await load();
            setLoading(false);
        })();
    }, [load]);

    if (loading) return <Loading message="Loading onboarding details..." />;
    if (!data) return null;

    const tint = STATUS_TINTS[data.status] || STATUS_TINTS['Pending Submission'];
    const canEdit = data.status === 'Submitted';

    const requiredAdminFields = [
        company, department, designation, defaultShift, holidayList,
        salaryStructure, leavePolicy, companyEmail,
    ];
    const allFilled = requiredAdminFields.every((v) => v && String(v).trim());

    const handleApprove = async () => {
        if (!allFilled) {
            Alert.alert(
                'Missing fields',
                'Please fill all required admin fields (company, department, designation, shift, holiday list, salary structure, leave policy, company email)',
            );
            return;
        }
        Alert.alert(
            'Approve & Onboard',
            `This will create the Employee record, a User account, salary assignment, and allocate leaves per the policy. Continue?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Approve',
                    onPress: async () => {
                        setBusy(true);
                        try {
                            const response = await apiService.approveOnboardingRequest({
                                name: data.name,
                                company,
                                department,
                                designation,
                                date_of_joining: formatLocalDate(dateOfJoining),
                                default_shift: defaultShift,
                                holiday_list: holidayList,
                                salary_structure: salaryStructure,
                                base: parseFloat(base) || 0,
                                variable: parseFloat(variable) || 0,
                                leave_policy: leavePolicy,
                                company_email: companyEmail.trim(),
                                branch: branch || null,
                                reports_to: reportsTo || null,
                            });
                            if (!isApiSuccess(response)) {
                                Alert.alert('Approval failed', getApiErrorMessage(response, 'Could not complete onboarding'));
                                return;
                            }
                            const result = extractFrappeData(response, {});
                            Alert.alert(
                                'Success',
                                `Employee ${result.employee} created with user ${result.user}.\n\nWelcome email queued.`,
                                [{ text: 'OK', onPress: () => navigation.goBack() }],
                            );
                        } catch (err) {
                            Alert.alert('Error', err?.message || 'Unexpected error');
                        } finally {
                            setBusy(false);
                        }
                    },
                },
            ],
        );
    };

    const handleResend = async () => {
        setBusy(true);
        try {
            const response = await apiService.resendOnboardingInvitation(data.name);
            if (!isApiSuccess(response)) {
                Alert.alert('Error', getApiErrorMessage(response, 'Resend failed'));
                return;
            }
            showToast({ type: 'success', text1: 'Invitation resent', text2: data.invitation_email });
            await load();
        } finally {
            setBusy(false);
        }
    };

    const handleCancel = async () => {
        Alert.alert('Cancel invitation?', 'The magic link will stop working immediately.', [
            { text: 'Keep', style: 'cancel' },
            {
                text: 'Cancel Invitation', style: 'destructive',
                onPress: async () => {
                    setBusy(true);
                    try {
                        const response = await apiService.cancelOnboardingInvitation(data.name);
                        if (!isApiSuccess(response)) {
                            Alert.alert('Error', getApiErrorMessage(response, 'Cancel failed'));
                            return;
                        }
                        showToast({ type: 'success', text1: 'Invitation cancelled' });
                        navigation.goBack();
                    } finally {
                        setBusy(false);
                    }
                },
            },
        ]);
    };

    const handleReject = async () => {
        if (!rejectReason.trim()) {
            Alert.alert('Reason required', 'Please provide a rejection reason');
            return;
        }
        setBusy(true);
        try {
            const response = await apiService.rejectOnboardingRequest(data.name, rejectReason.trim());
            if (!isApiSuccess(response)) {
                Alert.alert('Error', getApiErrorMessage(response, 'Reject failed'));
                return;
            }
            setRejectVisible(false);
            showToast({ type: 'success', text1: 'Onboarding rejected' });
            navigation.goBack();
        } finally {
            setBusy(false);
        }
    };

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            {/* Status header */}
            <View style={styles.card}>
                <View style={styles.rowHead}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.title}>
                            {(data.first_name || data.last_name)
                                ? `${data.first_name || ''} ${data.last_name || ''}`.trim()
                                : data.invitation_email}
                        </Text>
                        <Text style={styles.subtitle}>{data.invitation_email}</Text>
                    </View>
                    <View style={[styles.statusChip, { backgroundColor: tint.bg }]}>
                        <Text style={[styles.statusChipText, { color: tint.fg }]}>{data.status}</Text>
                    </View>
                </View>
                {data.invitation_link && (data.status === 'Pending Submission' || data.status === 'Submitted' || data.status === 'Expired') ? (
                    <View style={styles.linkBox}>
                        <Text style={styles.linkLabel}>Invitation link (share if email didn't arrive):</Text>
                        <Text style={styles.linkText} numberOfLines={2} selectable>{data.invitation_link}</Text>
                    </View>
                ) : null}
                {data.status === 'Employee Created' && data.created_employee ? (
                    <View style={styles.createdBox}>
                        <Text style={styles.createdLabel}>✓ Onboarded</Text>
                        <Text style={styles.createdText}>Employee: {data.created_employee}</Text>
                        <Text style={styles.createdText}>User: {data.created_user}</Text>
                    </View>
                ) : null}
            </View>

            {/* Employee-filled */}
            {data.status !== 'Pending Submission' ? (
                <View style={styles.card}>
                    <Text style={styles.sectionTitle}>What the new hire submitted</Text>
                    <Field label="Full name" value={`${data.first_name || ''} ${data.middle_name || ''} ${data.last_name || ''}`.trim()} />
                    <Field label="Date of birth" value={data.date_of_birth} />
                    <Field label="Gender" value={data.gender} />
                    <Field label="Mobile" value={data.cell_number} />
                    <Field label="Personal email" value={data.personal_email} />
                    <Field label="Current address" value={data.current_address} />
                    <Field label="Permanent address" value={data.permanent_address} />
                    <Field label="Emergency contact" value={data.person_to_be_contacted ? `${data.person_to_be_contacted} (${data.relation || '—'}) · ${data.emergency_phone_number || '—'}` : null} />
                    <Field label="Salary mode" value={data.salary_mode} />
                    <Field label="Bank" value={data.bank_name ? `${data.bank_name} · A/C ${data.bank_ac_no || '—'} · IFSC ${data.ifsc_code || '—'}` : null} />
                </View>
            ) : null}

            {/* Admin-fill */}
            {canEdit ? (
                <View style={styles.card}>
                    <Text style={styles.sectionTitle}>Admin fill — assignment</Text>

                    <Text style={styles.fieldLabel}>Company *</Text>
                    <TextInput style={styles.input} value={company} onChangeText={setCompany} placeholder="e.g. DeepGrid Semiconductor" />

                    <Text style={styles.fieldLabel}>Department *</Text>
                    <TextInput style={styles.input} value={department} onChangeText={setDepartment} placeholder="e.g. Engineering" />

                    <Text style={styles.fieldLabel}>Designation *</Text>
                    <TextInput style={styles.input} value={designation} onChangeText={setDesignation} placeholder="e.g. RTL Engineer" />

                    <Text style={styles.fieldLabel}>Date of joining *</Text>
                    <TouchableOpacity style={styles.input} onPress={() => setShowDojPicker(true)}>
                        <Text>{dateOfJoining.toDateString()}</Text>
                    </TouchableOpacity>
                    {showDojPicker && (
                        <DateTimePicker
                            value={dateOfJoining}
                            mode="date"
                            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                            onChange={(e, d) => {
                                setShowDojPicker(Platform.OS === 'ios');
                                if (d) setDateOfJoining(d);
                            }}
                        />
                    )}

                    <Text style={styles.fieldLabel}>Default shift *</Text>
                    <TextInput style={styles.input} value={defaultShift} onChangeText={setDefaultShift} placeholder="Shift Type name" />

                    <Text style={styles.fieldLabel}>Holiday list *</Text>
                    <TextInput style={styles.input} value={holidayList} onChangeText={setHolidayList} placeholder="Holiday List name" />

                    <Text style={styles.fieldLabel}>Salary structure *</Text>
                    <TextInput style={styles.input} value={salaryStructure} onChangeText={setSalaryStructure} placeholder="e.g. SalaryStructure 35KPM" />

                    <View style={{ flexDirection: 'row', gap: 8 }}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.fieldLabel}>Base (₹/month)</Text>
                            <TextInput style={styles.input} value={base} onChangeText={setBase} keyboardType="numeric" placeholder="0" />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.fieldLabel}>Variable</Text>
                            <TextInput style={styles.input} value={variable} onChangeText={setVariable} keyboardType="numeric" placeholder="0" />
                        </View>
                    </View>

                    <Text style={styles.fieldLabel}>Leave policy *</Text>
                    <TextInput style={styles.input} value={leavePolicy} onChangeText={setLeavePolicy} placeholder="Leave Policy name" />

                    <Text style={styles.fieldLabel}>Company email *</Text>
                    <TextInput
                        style={styles.input}
                        value={companyEmail}
                        onChangeText={setCompanyEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        placeholder="firstname@company.com"
                    />

                    <Text style={styles.fieldLabel}>Branch</Text>
                    <TextInput style={styles.input} value={branch} onChangeText={setBranch} placeholder="(optional)" />

                    <Text style={styles.fieldLabel}>Reports to (employee ID)</Text>
                    <TextInput style={styles.input} value={reportsTo} onChangeText={setReportsTo} placeholder="(optional)" />
                </View>
            ) : null}

            {/* Actions */}
            <View style={styles.card}>
                {data.status === 'Pending Submission' ? (
                    <>
                        <Button title="Resend Invitation" onPress={handleResend} disabled={busy} />
                        <View style={{ height: 8 }} />
                        <Button title="Cancel Invitation" mode="outlined" onPress={handleCancel} disabled={busy} />
                    </>
                ) : null}
                {data.status === 'Submitted' ? (
                    <>
                        <Button title="Approve & Onboard" onPress={handleApprove} disabled={busy || !allFilled} />
                        <View style={{ height: 8 }} />
                        <Button title="Reject" mode="outlined" onPress={() => setRejectVisible(true)} disabled={busy} />
                    </>
                ) : null}
                {data.status === 'Expired' ? (
                    <Button title="Resend Invitation" onPress={handleResend} disabled={busy} />
                ) : null}
            </View>

            {/* Reject modal */}
            <Modal visible={rejectVisible} transparent animationType="slide" onRequestClose={() => setRejectVisible(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalBox}>
                        <Text style={styles.modalTitle}>Reject onboarding</Text>
                        <Text style={styles.modalSubtitle}>Reason (sent to HR audit log)</Text>
                        <TextInput
                            style={[styles.input, { minHeight: 80 }]}
                            value={rejectReason}
                            onChangeText={setRejectReason}
                            placeholder="Why is this onboarding being rejected?"
                            multiline
                        />
                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                            <View style={{ flex: 1 }}>
                                <Button title="Cancel" mode="outlined" onPress={() => setRejectVisible(false)} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Button title="Reject" onPress={handleReject} disabled={busy} />
                            </View>
                        </View>
                    </View>
                </View>
            </Modal>
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 12, paddingBottom: 40 },
    card: {
        backgroundColor: colors.surface,
        borderRadius: 12,
        padding: 14,
        marginBottom: 12,
        elevation: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
    },
    rowHead: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
    title: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
    subtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    statusChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
    statusChipText: { fontSize: 11, fontWeight: '700' },
    linkBox: {
        marginTop: 12,
        padding: 10,
        backgroundColor: colors.infoLight,
        borderRadius: 8,
    },
    linkLabel: { fontSize: 11, color: colors.darkGray, marginBottom: 4 },
    linkText: { fontSize: 12, color: colors.info, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
    createdBox: {
        marginTop: 12,
        padding: 10,
        backgroundColor: colors.successLight,
        borderRadius: 8,
    },
    createdLabel: { fontSize: 13, fontWeight: '700', color: '#065F46', marginBottom: 4 },
    createdText: { fontSize: 12, color: '#065F46' },
    sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, marginBottom: 10 },
    field: { marginBottom: 8 },
    fieldLabel: { fontSize: 11, color: colors.textSecondary, marginTop: 8, marginBottom: 4 },
    fieldValue: { fontSize: 14, color: colors.textPrimary },
    input: {
        backgroundColor: colors.background,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 10,
        fontSize: 14,
        color: colors.textPrimary,
    },
    modalOverlay: {
        flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end',
    },
    modalBox: {
        backgroundColor: colors.surface,
        padding: 16,
        borderTopLeftRadius: 16, borderTopRightRadius: 16,
    },
    modalTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
    modalSubtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 4, marginBottom: 8 },
});

export default EmployeeOnboardingDetailScreen;
