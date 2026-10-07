// src/screens/admin/CreateOnboardingInvitationScreen.js
//
// Admin sends a new onboarding invitation. Mandatory input: the new hire's email.
// Optional pre-fill: name, designation, company and department (shown to the new hire on the
// form; only the admin can finalize them on Approve).
//
// On success the backend emails the new hire a magic link AND returns the link in the API
// response so the admin can share it directly (in case the SMTP relay drops the message).
import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, Share, Platform } from 'react-native';
import apiService, { extractFrappeData, isApiSuccess, getApiErrorMessage } from '../../services/api.service';
import showToast from '../../utils/Toast';
import {
    Screen,
    Group,
    Row,
    Button,
    TextField,
    Icon,
    color,
    space,
    type,
    formatShortDate,
} from '../../components/ds';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 'YYYY-MM-DD[ HH:mm:ss]' shown as '06 Oct 2026' (parsed as a local date); '' if unparseable
const formatDate = (s) => {
    const [y, m, d] = String(s || '').slice(0, 10).split('-').map(Number);
    return y && m && d ? formatShortDate(new Date(y, m - 1, d)) : '';
};

const CreateOnboardingInvitationScreen = ({ navigation }) => {
    const [email, setEmail] = useState('');
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [designation, setDesignation] = useState('');
    const [company, setCompany] = useState('');
    const [department, setDepartment] = useState('');
    const [busy, setBusy] = useState(false);
    // blocks a second tap that lands before the button re-renders as disabled
    const busyRef = useRef(false);

    // After-create state: the result returned by the API so the admin can copy/share
    const [created, setCreated] = useState(null); // { name, invitation_link, expires_on }

    const handleSend = async () => {
        const trimmed = email.trim();
        if (!EMAIL_RE.test(trimmed)) {
            showToast({ type: 'error', text1: 'Invalid email', text2: 'Enter a valid email address for the new hire' });
            return;
        }
        if (busyRef.current) {
            return;
        }
        busyRef.current = true;
        setBusy(true);
        try {
            const response = await apiService.createOnboardingInvitation({
                invitation_email: trimmed,
                first_name: firstName.trim() || null,
                last_name: lastName.trim() || null,
                company: company.trim() || null,
                department: department.trim() || null,
                designation: designation.trim() || null,
            });
            if (!isApiSuccess(response)) {
                showToast({ type: 'error', text1: 'Invitation not sent', text2: getApiErrorMessage(response, 'Failed to send invitation') });
                return;
            }
            const result = extractFrappeData(response, {}) || {};
            setCreated({
                name: result.name,
                invitation_link: result.invitation_link,
                expires_on: result.expires_on,
                invitation_email: trimmed,
            });
            showToast({ type: 'success', text1: 'Invitation sent', text2: trimmed });
        } catch (err) {
            showToast({ type: 'error', text1: 'Invitation not sent', text2: err?.message || 'Failed to send invitation' });
        } finally {
            busyRef.current = false;
            setBusy(false);
        }
    };

    const handleShare = async () => {
        if (!created?.invitation_link) {
            return;
        }
        // expires_on is a server datetime ('2026-10-14 10:30:00.123456'); show it as a date
        const expiry = formatDate(created.expires_on);
        try {
            await Share.share({
                title: 'Onboarding link',
                message: `Hi, please complete your onboarding form using this link (expires ${expiry ? `on ${expiry}` : 'in 7 days'}):\n\n${created.invitation_link}`,
            });
        } catch (e) {
            // Share dialog dismissed: no-op
        }
    };

    const handleDone = () => {
        navigation.goBack();
    };

    // Success state: show the link with share/done actions
    if (created) {
        return (
            <Screen footer={<Button title="Done" onPress={handleDone} />}>
                <View style={styles.sent}>
                    <Icon name="check-circle" size={32} color={color.success} />
                    <Text style={styles.sentTitle}>Invitation sent</Text>
                    <Text style={styles.sentText}>
                        {`Emailed to ${created.invitation_email}.`}
                        {formatDate(created.expires_on) ? ` The link expires on ${formatDate(created.expires_on)}.` : ''}
                    </Text>
                </View>

                {created.invitation_link ? (
                    <Group title="Invitation link" footer="Share it with the new hire if the email does not arrive.">
                        <View style={styles.linkBox}>
                            <Text style={styles.linkText} selectable>{created.invitation_link}</Text>
                        </View>
                        <Row icon="share-2" title="Share link" chevron={false} onPress={handleShare} />
                    </Group>
                ) : null}
            </Screen>
        );
    }

    return (
        <Screen
            footer={(
                <Button
                    title="Send invitation"
                    onPress={handleSend}
                    loading={busy}
                    disabled={busy || !email.trim()}
                />
            )}
        >
            <Group
                title="New hire"
                flush
                footer="They get an email with a 7-day link to fill in their details. You review it before the employee record is created."
            >
                <View>
                    <TextField
                        label="Email"
                        value={email}
                        onChangeText={setEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoCorrect={false}
                        placeholder="newhire@example.com"
                        editable={!busy}
                    />
                    <View style={styles.pair}>
                        <TextField
                            label="First name"
                            value={firstName}
                            onChangeText={setFirstName}
                            placeholder="Aravind"
                            editable={!busy}
                            style={styles.flex}
                        />
                        <TextField
                            label="Last name"
                            value={lastName}
                            onChangeText={setLastName}
                            placeholder="Reddy"
                            editable={!busy}
                            style={styles.flex}
                        />
                    </View>
                    <TextField
                        label="Designation"
                        value={designation}
                        onChangeText={setDesignation}
                        placeholder="e.g. RTL Engineer"
                        editable={!busy}
                        style={styles.lastField}
                    />
                </View>
            </Group>

            <Group title="Employment" flush footer="Optional. You can change these when you approve.">
                <View>
                    <TextField
                        label="Company"
                        value={company}
                        onChangeText={setCompany}
                        placeholder="e.g. DeepGrid Semiconductor"
                        editable={!busy}
                    />
                    <TextField
                        label="Department"
                        value={department}
                        onChangeText={setDepartment}
                        placeholder="e.g. Engineering"
                        editable={!busy}
                        style={styles.lastField}
                    />
                </View>
            </Group>
        </Screen>
    );
};

const styles = StyleSheet.create({
    flex: { flex: 1 },
    // bottom-aligned so the two inputs stay level if a label wraps at large text sizes
    pair: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
    lastField: { marginBottom: 0 },
    sent: { alignItems: 'center', paddingTop: space.xl, paddingBottom: space.xxl, paddingHorizontal: space.xl },
    sentTitle: { ...type.title, marginTop: space.md },
    sentText: { ...type.secondary, lineHeight: 19, marginTop: 4, textAlign: 'center' },
    linkBox: { paddingHorizontal: space.lg, paddingVertical: space.md, backgroundColor: color.surface },
    linkText: {
        fontSize: 13,
        lineHeight: 19,
        color: color.text,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
});

export default CreateOnboardingInvitationScreen;
