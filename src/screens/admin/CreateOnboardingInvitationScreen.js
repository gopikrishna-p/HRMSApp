// src/screens/admin/CreateOnboardingInvitationScreen.js
//
// Admin sends a new onboarding invitation. Mandatory input: the new hire's
// email. Optional pre-fill: company / department / designation (so when the
// new hire opens the form those fields are visible, though only admin can
// finalize them on Approve).
//
// On success, the backend emails the new hire a magic link AND returns the
// link in the API response so the admin can copy/share it directly (in case
// the SMTP relay drops the message).

import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TextInput,
    TouchableOpacity,
    Alert,
    Share,
    Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { colors } from '../../theme/colors';
import Button from '../../components/common/Button';
import apiService, { extractFrappeData, isApiSuccess, getApiErrorMessage } from '../../services/api.service';
import showToast from '../../utils/Toast';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const CreateOnboardingInvitationScreen = ({ navigation }) => {
    const [email, setEmail] = useState('');
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [designation, setDesignation] = useState('');
    const [company, setCompany] = useState('');
    const [department, setDepartment] = useState('');
    const [busy, setBusy] = useState(false);

    // After-create state: the result returned by the API so the admin can copy/share
    const [created, setCreated] = useState(null); // { name, invitation_link, expires_on }

    const handleSend = async () => {
        const trimmed = email.trim();
        if (!EMAIL_RE.test(trimmed)) {
            Alert.alert('Invalid email', 'Please enter a valid email address for the new hire.');
            return;
        }
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
                Alert.alert('Error', getApiErrorMessage(response, 'Failed to send invitation'));
                return;
            }
            const result = extractFrappeData(response, {});
            setCreated({
                name: result.name,
                invitation_link: result.invitation_link,
                expires_on: result.expires_on,
                invitation_email: trimmed,
            });
            showToast({ type: 'success', text1: 'Invitation sent', text2: trimmed });
        } catch (err) {
            Alert.alert('Error', err?.message || 'Failed to send invitation');
        } finally {
            setBusy(false);
        }
    };

    const handleShare = async () => {
        if (!created?.invitation_link) return;
        try {
            await Share.share({
                title: 'Onboarding link',
                message: `Hi! Please complete your onboarding form using this link (expires ${created.expires_on || 'in 7 days'}):\n\n${created.invitation_link}`,
            });
        } catch (e) {
            // Share dialog dismissed — no-op
        }
    };

    const handleDone = () => {
        navigation.goBack();
    };

    // Success state — show the link + share/done actions
    if (created) {
        return (
            <ScrollView style={styles.container} contentContainerStyle={styles.content}>
                <View style={styles.successCard}>
                    <View style={styles.successIconWrap}>
                        <Icon name="check-circle" size={40} color={colors.success} solid />
                    </View>
                    <Text style={styles.successTitle}>Invitation sent</Text>
                    <Text style={styles.successSubtitle}>
                        We've emailed the magic link to {created.invitation_email}.
                    </Text>
                    {created.expires_on ? (
                        <Text style={styles.successMeta}>
                            Link expires on {new Date(created.expires_on).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}.
                        </Text>
                    ) : null}
                </View>

                <View style={styles.card}>
                    <Text style={styles.sectionTitle}>Invitation link</Text>
                    <Text style={styles.helperText}>
                        Share this with the new hire if the email doesn't arrive.
                    </Text>
                    <View style={styles.linkBox}>
                        <Text style={styles.linkText} selectable>{created.invitation_link}</Text>
                    </View>
                    <Button title="Share link" onPress={handleShare} />
                </View>

                <View style={styles.card}>
                    <Button title="Done" mode="outlined" onPress={handleDone} />
                </View>
            </ScrollView>
        );
    }

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {/* Info card */}
            <View style={styles.infoCard}>
                <View style={styles.infoRow}>
                    <Icon name="info-circle" size={16} color={colors.info} />
                    <Text style={styles.infoText}>
                        The new hire receives a branded email with a secure 7-day link
                        to fill in their personal details. You'll review and approve
                        before any Employee record is created.
                    </Text>
                </View>
            </View>

            {/* New hire core details */}
            <View style={styles.card}>
                <Text style={styles.sectionTitle}>New hire</Text>
                <Text style={styles.helperText}>
                    Used to personalise the invitation email.
                </Text>

                <Text style={styles.label}>Email address *</Text>
                <TextInput
                    style={styles.input}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="newhire@example.com"
                    editable={!busy}
                />

                <View style={{ flexDirection: 'row', gap: 8 }}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.label}>First name</Text>
                        <TextInput
                            style={styles.input}
                            value={firstName}
                            onChangeText={setFirstName}
                            placeholder="Aravind"
                            editable={!busy}
                        />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.label}>Last name</Text>
                        <TextInput
                            style={styles.input}
                            value={lastName}
                            onChangeText={setLastName}
                            placeholder="Reddy"
                            editable={!busy}
                        />
                    </View>
                </View>

                <Text style={styles.label}>Role / Designation</Text>
                <TextInput
                    style={styles.input}
                    value={designation}
                    onChangeText={setDesignation}
                    placeholder="e.g. RTL Engineer"
                    editable={!busy}
                />
            </View>

            {/* Optional employment context */}
            <View style={styles.card}>
                <Text style={styles.sectionTitle}>Employment (optional)</Text>
                <Text style={styles.helperText}>
                    Pre-fill these to save time later. You can still adjust during the
                    final approval step.
                </Text>

                <Text style={styles.label}>Company</Text>
                <TextInput
                    style={styles.input}
                    value={company}
                    onChangeText={setCompany}
                    placeholder="e.g. DeepGrid Semiconductor"
                    editable={!busy}
                />

                <Text style={styles.label}>Department</Text>
                <TextInput
                    style={styles.input}
                    value={department}
                    onChangeText={setDepartment}
                    placeholder="e.g. Engineering"
                    editable={!busy}
                />
            </View>

            {/* Actions */}
            <View style={styles.card}>
                <Button
                    title={busy ? 'Sending…' : 'Send Invitation'}
                    onPress={handleSend}
                    disabled={busy || !email.trim()}
                />
                <View style={{ height: 8 }} />
                <Button title="Cancel" mode="outlined" onPress={() => navigation.goBack()} disabled={busy} />
            </View>
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
    infoCard: {
        backgroundColor: colors.infoLight,
        borderRadius: 10,
        padding: 12,
        marginBottom: 12,
    },
    infoRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
    infoText: { flex: 1, fontSize: 12, color: colors.info, lineHeight: 18 },
    sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, marginBottom: 6 },
    helperText: { fontSize: 12, color: colors.textSecondary, marginBottom: 10 },
    label: { fontSize: 12, color: colors.textSecondary, marginTop: 8, marginBottom: 4 },
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
    successCard: {
        backgroundColor: colors.surface,
        borderRadius: 12,
        padding: 20,
        marginBottom: 12,
        alignItems: 'center',
    },
    successIconWrap: { marginBottom: 12 },
    successTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
    successSubtitle: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginTop: 6 },
    successMeta: { fontSize: 12, color: colors.darkGray, marginTop: 6 },
    linkBox: {
        backgroundColor: colors.background,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 8,
        padding: 10,
        marginBottom: 10,
    },
    linkText: {
        fontSize: 12,
        color: colors.info,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
});

export default CreateOnboardingInvitationScreen;
