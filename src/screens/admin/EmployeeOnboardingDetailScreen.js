// src/screens/admin/EmployeeOnboardingDetailScreen.js
//
// Admin review + approve screen for a single Employee Onboarding Request.
//
//   A. Header: name, invitation email, status; invitation link while the invite is open
//   B. What the new hire submitted (read-only)
//   C. Admin-fill form (company / dept / designation / DOJ / shift / holiday list /
//      salary structure + base + variable / leave policy / company email), status Submitted only
//   D. Footer actions by status (Resend / Cancel / Reject / Approve)
//
// "Approve and onboard" opens a confirmation sheet; on confirm the backend atomically creates
// User + Employee + Salary Structure Assignment + Leave Policy Assignment.
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Alert, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import apiService, { extractFrappeData, isApiSuccess, getApiErrorMessage } from '../../services/api.service';
import { formatLocalDate } from '../../utils/dateFormat';
import showToast from '../../utils/Toast';
import {
    Screen,
    Group,
    Row,
    Avatar,
    StatusText,
    Button,
    TextField,
    SelectField,
    Sheet,
    EmptyState,
    Loading,
    color,
    space,
    type,
    formatShortDate,
} from '../../components/ds';

// server status -> label and tone
const STATUS_LABEL = {
    'Pending Submission': 'Invited',
    'Employee Created': 'Onboarded',
};
const STATUS_TONE = {
    'Pending Submission': 'info',
    'Submitted': 'warning',
    'Approved': 'success',
    'Employee Created': 'success',
    'Rejected': 'danger',
    'Cancelled': 'neutral',
    'Expired': 'neutral',
};

// 'YYYY-MM-DD[ HH:mm:ss]' shown as '06 Oct 2026' (parsed as a local date; raw value if unparseable)
const formatDate = (s) => {
    const [y, m, d] = String(s || '').slice(0, 10).split('-').map(Number);
    return y && m && d ? formatShortDate(new Date(y, m - 1, d)) : s;
};

// label / value line; `stacked` puts the value under the label for long text
const InfoRow = ({ label, value, stacked }) => (
    <View style={[styles.info, stacked && styles.infoStacked]}>
        <Text style={stacked ? styles.infoLabelStacked : styles.infoLabel}>{label}</Text>
        <Text style={stacked ? styles.infoValueStacked : styles.infoValue} selectable>{value || '—'}</Text>
    </View>
);

const EmployeeOnboardingDetailScreen = ({ navigation, route }) => {
    const requestName = route?.params?.name;
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [acting, setActing] = useState(null); // which footer button shows the spinner while busy

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

    // Approve confirmation sheet
    const [confirmVisible, setConfirmVisible] = useState(false);

    // Reject sheet state
    const [rejectVisible, setRejectVisible] = useState(false);
    const [rejectReason, setRejectReason] = useState('');

    const load = useCallback(async () => {
        try {
            const response = await apiService.getOnboardingRequestDetail(requestName);
            if (!isApiSuccess(response)) {
                showToast({ type: 'error', text1: 'Could not load request', text2: getApiErrorMessage(response, 'Failed to load request') });
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
            showToast({ type: 'error', text1: 'Could not load request', text2: err?.message || 'Failed to load' });
        }
    }, [requestName]);

    useEffect(() => {
        (async () => {
            setLoading(true);
            await load();
            setLoading(false);
        })();
    }, [load]);

    if (loading) {
        return (
            <View style={styles.flex}>
                <Loading />
            </View>
        );
    }
    if (!data) {
        return (
            <View style={styles.flex}>
                <EmptyState icon="alert-circle" title="Request not available" message="Go back and try again." />
            </View>
        );
    }

    const canEdit = data.status === 'Submitted';

    const requiredAdminFields = [
        company, department, designation, defaultShift, holidayList,
        salaryStructure, leavePolicy, companyEmail,
    ];
    const allFilled = requiredAdminFields.every((v) => v && String(v).trim());

    const handleApprove = () => {
        if (!allFilled) {
            showToast({
                type: 'error',
                text1: 'Missing fields',
                text2: 'Fill in company, department, designation, shift, holiday list, salary structure, leave policy and company email',
            });
            return;
        }
        setConfirmVisible(true);
    };

    const confirmApprove = async () => {
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
                setConfirmVisible(false);
                showToast({ type: 'error', text1: 'Approval failed', text2: getApiErrorMessage(response, 'Could not complete onboarding') });
                return;
            }
            const result = extractFrappeData(response, {});
            setConfirmVisible(false);
            showToast({
                type: 'success',
                text1: `Employee ${result.employee} created`,
                text2: `User ${result.user}. Welcome email queued.`,
            });
            navigation.goBack();
        } catch (err) {
            setConfirmVisible(false);
            showToast({ type: 'error', text1: 'Approval failed', text2: err?.message || 'Unexpected error' });
        } finally {
            setBusy(false);
        }
    };

    const handleResend = async () => {
        setBusy(true);
        try {
            const response = await apiService.resendOnboardingInvitation(data.name);
            if (!isApiSuccess(response)) {
                showToast({ type: 'error', text1: 'Not resent', text2: getApiErrorMessage(response, 'Resend failed') });
                return;
            }
            showToast({ type: 'success', text1: 'Invitation resent', text2: data.invitation_email });
            await load();
        } catch (error) {
            showToast({ type: 'error', text1: 'Not resent', text2: error?.message || 'Check your connection and try again' });
        } finally {
            setBusy(false);
        }
    };

    const handleCancel = async () => {
        Alert.alert('Cancel invitation?', 'The link will stop working immediately.', [
            { text: 'Keep', style: 'cancel' },
            {
                text: 'Cancel invitation', style: 'destructive',
                onPress: async () => {
                    setBusy(true);
                    try {
                        const response = await apiService.cancelOnboardingInvitation(data.name);
                        if (!isApiSuccess(response)) {
                            showToast({ type: 'error', text1: 'Not cancelled', text2: getApiErrorMessage(response, 'Cancel failed') });
                            return;
                        }
                        showToast({ type: 'success', text1: 'Invitation cancelled' });
                        navigation.goBack();
                    } catch (error) {
                        showToast({ type: 'error', text1: 'Not cancelled', text2: error?.message || 'Check your connection and try again' });
                    } finally {
                        setBusy(false);
                    }
                },
            },
        ]);
    };

    const handleReject = async () => {
        if (!rejectReason.trim()) {
            showToast({ type: 'error', text1: 'Reason required', text2: 'Enter a reason for rejecting' });
            return;
        }
        setBusy(true);
        try {
            const response = await apiService.rejectOnboardingRequest(data.name, rejectReason.trim());
            if (!isApiSuccess(response)) {
                showToast({ type: 'error', text1: 'Not rejected', text2: getApiErrorMessage(response, 'Reject failed') });
                return;
            }
            setRejectVisible(false);
            showToast({ type: 'success', text1: 'Onboarding rejected' });
            navigation.goBack();
        } catch (error) {
            showToast({ type: 'error', text1: 'Not rejected', text2: error?.message || 'Check your connection and try again' });
        } finally {
            setBusy(false);
        }
    };

    const act = (key, fn) => () => {
        setActing(key);
        fn();
    };

    const hasName = Boolean(data.first_name || data.last_name);
    const displayName = hasName ? `${data.first_name || ''} ${data.last_name || ''}`.trim() : data.invitation_email;
    const showLink = Boolean(data.invitation_link)
        && (data.status === 'Pending Submission' || data.status === 'Submitted' || data.status === 'Expired');

    let footer = null;
    if (data.status === 'Pending Submission') {
        footer = (
            <View style={styles.footerRow}>
                <Button title="Cancel invite" variant="danger" onPress={act('cancel', handleCancel)}
                    loading={busy && acting === 'cancel'} disabled={busy} style={styles.flex1} />
                <Button title="Resend invite" onPress={act('resend', handleResend)}
                    loading={busy && acting === 'resend'} disabled={busy} style={styles.flex1} />
            </View>
        );
    } else if (data.status === 'Submitted') {
        footer = (
            <View style={styles.footerRow}>
                <Button title="Reject" variant="danger" onPress={() => setRejectVisible(true)} disabled={busy} style={styles.flex1} />
                <Button title="Approve and onboard" onPress={handleApprove} disabled={busy || !allFilled} style={styles.flex2} />
            </View>
        );
    } else if (data.status === 'Expired') {
        footer = <Button title="Resend invite" onPress={act('resend', handleResend)} loading={busy && acting === 'resend'} disabled={busy} />;
    }

    return (
        <View style={styles.flex}>
            <Screen footer={footer}>
                <Group>
                    <Row
                        left={<Avatar name={displayName} size={44} />}
                        title={displayName}
                        subtitle={hasName ? data.invitation_email : undefined}
                        right={<StatusText label={STATUS_LABEL[data.status] || data.status} tone={STATUS_TONE[data.status]} />}
                    />
                </Group>

                {showLink ? (
                    <Group title="Invitation link" footer="Share this link if the email did not arrive.">
                        <View style={styles.linkBox}>
                            <Text style={styles.linkText} selectable>{data.invitation_link}</Text>
                        </View>
                        {data.status === 'Pending Submission' && data.invitation_expires_on ? (
                            <InfoRow label="Expires" value={formatDate(data.invitation_expires_on)} />
                        ) : null}
                    </Group>
                ) : null}

                {data.status === 'Employee Created' && data.created_employee ? (
                    <Group title="Onboarded">
                        <InfoRow label="Employee" value={data.created_employee} />
                        <InfoRow label="User" value={data.created_user} />
                    </Group>
                ) : null}

                {data.status !== 'Pending Submission' ? (
                    <>
                        <Group title="Submitted by the new hire">
                            <InfoRow label="Full name" value={`${data.first_name || ''} ${data.middle_name || ''} ${data.last_name || ''}`.replace(/\s+/g, ' ').trim()} />
                            <InfoRow label="Date of birth" value={formatDate(data.date_of_birth)} />
                            <InfoRow label="Gender" value={data.gender} />
                            <InfoRow label="Mobile" value={data.cell_number} />
                            <InfoRow label="Personal email" value={data.personal_email} />
                            <InfoRow label="Current address" value={data.current_address} stacked />
                            <InfoRow label="Permanent address" value={data.permanent_address} stacked />
                            <InfoRow
                                label="Emergency contact"
                                value={data.person_to_be_contacted
                                    ? `${data.person_to_be_contacted} (${data.relation || '—'})\n${data.emergency_phone_number || '—'}`
                                    : null}
                                stacked
                            />
                        </Group>

                        <Group title="Bank">
                            <InfoRow label="Salary mode" value={data.salary_mode} />
                            <InfoRow label="Bank" value={data.bank_name} />
                            {data.bank_name ? <InfoRow label="Account number" value={data.bank_ac_no} /> : null}
                            {data.bank_name ? <InfoRow label="IFSC" value={data.ifsc_code} /> : null}
                        </Group>
                    </>
                ) : null}

                {canEdit ? (
                    <>
                        <Group title="Employment" flush>
                            <View>
                                <TextField label="Company" value={company} onChangeText={setCompany} placeholder="e.g. DeepGrid Semiconductor" />
                                <TextField label="Department" value={department} onChangeText={setDepartment} placeholder="e.g. Engineering" />
                                <TextField label="Designation" value={designation} onChangeText={setDesignation} placeholder="e.g. RTL Engineer" />
                                <SelectField
                                    label="Date of joining"
                                    icon="calendar"
                                    value={formatShortDate(dateOfJoining)}
                                    onPress={() => setShowDojPicker(true)}
                                />
                                {showDojPicker && (
                                    <DateTimePicker
                                        value={dateOfJoining}
                                        mode="date"
                                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                        onChange={(e, d) => {
                                            setShowDojPicker(Platform.OS === 'ios');
                                            if (d) {
                                                setDateOfJoining(d);
                                            }
                                        }}
                                    />
                                )}
                                <TextField
                                    label="Company email"
                                    value={companyEmail}
                                    onChangeText={setCompanyEmail}
                                    keyboardType="email-address"
                                    autoCapitalize="none"
                                    placeholder="firstname@company.com"
                                />
                                <TextField label="Branch (optional)" value={branch} onChangeText={setBranch} />
                                <TextField label="Reports to (optional)" value={reportsTo} onChangeText={setReportsTo} placeholder="Employee ID" style={styles.lastField} />
                            </View>
                        </Group>

                        <Group title="Schedule and leave" flush>
                            <View>
                                <TextField label="Default shift" value={defaultShift} onChangeText={setDefaultShift} placeholder="Shift type name" />
                                <TextField label="Holiday list" value={holidayList} onChangeText={setHolidayList} placeholder="Holiday list name" />
                                <TextField label="Leave policy" value={leavePolicy} onChangeText={setLeavePolicy} placeholder="Leave policy name" style={styles.lastField} />
                            </View>
                        </Group>

                        <Group title="Salary" flush>
                            <View>
                                <TextField label="Salary structure" value={salaryStructure} onChangeText={setSalaryStructure} placeholder="e.g. SalaryStructure 35KPM" />
                                <View style={styles.pair}>
                                    <TextField label="Base (₹ per month)" value={base} onChangeText={setBase} keyboardType="numeric" placeholder="0" style={styles.pairField} />
                                    <TextField label="Variable" value={variable} onChangeText={setVariable} keyboardType="numeric" placeholder="0" style={styles.pairField} />
                                </View>
                            </View>
                        </Group>
                    </>
                ) : null}
            </Screen>

            <Sheet
                visible={confirmVisible}
                title="Approve and onboard"
                subtitle={displayName}
                onClose={() => !busy && setConfirmVisible(false)}
                dismissable={!busy}
                footer={(
                    <>
                        <Button title="Cancel" variant="secondary" onPress={() => setConfirmVisible(false)} disabled={busy} style={styles.flex1} />
                        <Button title="Approve" onPress={confirmApprove} loading={busy} style={styles.flex1} />
                    </>
                )}
            >
                <Text style={styles.sheetText}>
                    Creates the employee record, a user account and the salary assignment, and allocates leave under the policy.
                </Text>
                <Group>
                    <InfoRow label="Designation" value={designation} />
                    <InfoRow label="Date of joining" value={formatShortDate(dateOfJoining)} />
                    <InfoRow label="Company email" value={companyEmail.trim()} />
                    <InfoRow label="Salary structure" value={salaryStructure} />
                    <InfoRow label="Leave policy" value={leavePolicy} />
                </Group>
            </Sheet>

            <Sheet
                visible={rejectVisible}
                title="Reject onboarding"
                subtitle={displayName}
                onClose={() => !busy && setRejectVisible(false)}
                dismissable={!busy}
                footer={(
                    <>
                        <Button title="Cancel" variant="secondary" onPress={() => setRejectVisible(false)} style={styles.flex1} />
                        <Button title="Reject" variant="dangerSolid" onPress={handleReject} loading={busy} disabled={busy} style={styles.flex1} />
                    </>
                )}
            >
                <TextField
                    label="Reason"
                    hint="Recorded in the HR audit log."
                    value={rejectReason}
                    onChangeText={setRejectReason}
                    placeholder="Why is this onboarding being rejected?"
                    multiline
                />
            </Sheet>
        </View>
    );
};

const styles = StyleSheet.create({
    flex: { flex: 1, backgroundColor: color.bg },
    flex1: { flex: 1 },
    flex2: { flex: 2 },
    footerRow: { flexDirection: 'row', gap: space.sm },
    pair: { flexDirection: 'row', gap: space.sm },
    pairField: { flex: 1, marginBottom: 0 },
    lastField: { marginBottom: 0 },
    linkBox: { paddingHorizontal: space.lg, paddingVertical: space.md, backgroundColor: color.surface },
    linkText: {
        fontSize: 13,
        lineHeight: 19,
        color: color.text,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    info: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: space.lg,
        minHeight: 48,
        paddingHorizontal: space.lg,
        paddingVertical: space.md,
        backgroundColor: color.surface,
    },
    infoStacked: { flexDirection: 'column', alignItems: 'stretch', gap: 2 },
    infoLabel: { ...type.body, color: color.textSecondary },
    infoValue: { ...type.body, flexShrink: 1, textAlign: 'right' },
    infoLabelStacked: { ...type.secondary },
    infoValueStacked: { ...type.body, lineHeight: 21 },
    sheetText: { ...type.secondary, lineHeight: 19, marginBottom: space.lg },
});

export default EmployeeOnboardingDetailScreen;
