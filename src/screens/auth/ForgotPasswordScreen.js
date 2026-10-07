// src/screens/auth/ForgotPasswordScreen.js
//
// Self-serve password reset through Frappe (frappe.core.doctype.user.user.reset_password):
// the server emails a link that opens the site's "set a new password" page in the browser.
import React, { useState } from 'react';
import {
    Text,
    Image,
    StyleSheet,
    StatusBar,
    ScrollView,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ApiService from '../../services/api.service';
import showToast from '../../utils/Toast';
import { ROUTES } from '../../config/constants';
import { Button, TextField, Notice, color, space, type } from '../../components/ds';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ForgotPasswordScreen = ({ navigation, route }) => {
    const [email, setEmail] = useState(route?.params?.email || '');
    const [sending, setSending] = useState(false);
    const [sentTo, setSentTo] = useState(null);

    const backToSignIn = () => navigation.navigate(ROUTES.LOGIN);

    const sendLink = async () => {
        const address = email.trim().toLowerCase();
        if (!EMAIL_RE.test(address)) {
            showToast({ type: 'warning', text1: 'Enter your work email', text2: 'The email you sign in with' });
            return;
        }
        setSending(true);
        try {
            const res = await ApiService.requestPasswordReset(address);
            const result = res?.data?.message;
            if (result === 'disabled') {
                showToast({ type: 'error', text1: 'This account is disabled', text2: 'Contact your HR team' });
            } else if (res?.success || res?.status === 404) {
                // "not found" gets the same answer, so the screen doesn't reveal which emails have accounts
                setSentTo(address);
            } else {
                showToast({
                    type: 'error',
                    text1: res?.status === 429 ? 'Too many attempts' : 'Could not send the link',
                    text2: res?.status === 429 ? 'Try again in an hour' : res?.message || 'Check your connection and try again',
                });
            }
        } catch (error) {
            showToast({ type: 'error', text1: 'Could not send the link', text2: error?.message || 'Check your connection and try again' });
        } finally {
            setSending(false);
        }
    };

    return (
        <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
            <StatusBar barStyle="dark-content" backgroundColor={color.surface} />
            <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                    <Image
                        source={require('../../assets/images/mainLogo.jpg')}
                        style={styles.logo}
                        resizeMode="contain"
                        accessibilityLabel="DeepGrid"
                    />
                    <Text style={styles.title}>Reset password</Text>

                    {sentTo ? (
                        <>
                            <Text style={styles.message}>
                                {`If ${sentTo} has an account, a link to set a new password is on its way. Open it on this phone, set the password, then sign in.`}
                            </Text>
                            <Notice tone="neutral" icon="info">
                                Nothing in a few minutes? Check spam, or ask your HR team.
                            </Notice>
                            <Button title="Back to sign in" full onPress={backToSignIn} style={styles.primary} />
                            <Button title="Use a different email" variant="ghost" full onPress={() => setSentTo(null)} />
                        </>
                    ) : (
                        <>
                            <Text style={styles.message}>
                                Enter the email you sign in with and we'll send you a link to set a new password.
                            </Text>
                            <TextField
                                label="Work email"
                                value={email}
                                onChangeText={setEmail}
                                placeholder="name@company.com"
                                keyboardType="email-address"
                                autoCapitalize="none"
                                autoCorrect={false}
                                autoComplete="email"
                                textContentType="emailAddress"
                                returnKeyType="send"
                                onSubmitEditing={sendLink}
                                editable={!sending}
                            />
                            <Button title="Send reset link" full loading={sending} onPress={sendLink} style={styles.primary} />
                            <Button title="Back to sign in" variant="ghost" full onPress={backToSignIn} disabled={sending} />
                        </>
                    )}
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: color.surface,
    },
    flex: { flex: 1 },
    content: {
        flexGrow: 1,
        width: '100%',
        maxWidth: 420,
        alignSelf: 'center',
        justifyContent: 'center',
        paddingHorizontal: space.xl,
        paddingVertical: space.xxl,
    },
    logo: {
        width: 180,
        height: 90,
        alignSelf: 'center',
        marginBottom: space.xl,
    },
    title: {
        ...type.display,
        textAlign: 'center',
    },
    message: {
        ...type.body,
        color: color.textSecondary,
        textAlign: 'center',
        lineHeight: 22,
        marginTop: space.sm,
        marginBottom: space.xl,
    },
    primary: {
        marginTop: space.lg,
        marginBottom: space.sm,
    },
});

export default ForgotPasswordScreen;
