// src/screens/auth/LoginScreen.js
//
// Sign in with a Frappe username (or email) and password. AppNavigator switches to the
// employee or admin app once AuthContext reports a session.
import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Image,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    Pressable,
    TextInput,
    StatusBar,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { SafeAreaView } from 'react-native-safe-area-context';
import NetInfo from '@react-native-community/netinfo';

import { useAuth } from '../../context/AuthContext';
import { ROUTES } from '../../config/constants';
import { validateLoginForm } from '../../utils/validators';
import {
    Button,
    Field,
    TextField,
    IconButton,
    Notice,
    color,
    space,
    radius,
    type,
} from '../../components/ds';

const LoginScreen = ({ navigation }) => {
    const { login } = useAuth();

    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState({});
    const [isConnected, setIsConnected] = useState(true);
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const passwordRef = useRef(null);

    useEffect(() => {
        // Check network connectivity
        const unsubscribe = NetInfo.addEventListener(state => {
            // isConnected is null while NetInfo is still checking; only false means offline
            setIsConnected(state.isConnected !== false);
            if (state.isConnected === false) {
                Toast.show({
                    type: 'error',
                    text1: 'No internet connection',
                    text2: 'Check your network settings',
                });
            }
        });

        return () => unsubscribe();
    }, []);

    const handleLogin = async () => {
        // Check internet connection
        if (!isConnected) {
            Toast.show({
                type: 'error',
                text1: 'No internet connection',
                text2: 'Connect to the internet to sign in',
            });
            return;
        }

        // Validate form
        const validation = validateLoginForm(username, password);

        if (!validation.isValid) {
            setErrors(validation.errors);
            setErrorMessage(Object.values(validation.errors)[0]);
            Toast.show({
                type: 'error',
                text1: 'Check your details',
                text2: Object.values(validation.errors)[0],
                position: 'top',
                visibilityTime: 3000,
            });
            return;
        }

        // Clear errors
        setErrors({});
        setErrorMessage('');
        setLoading(true);

        try {
            const result = await login(username.trim(), password);

            if (result.success) {
                Toast.show({
                    type: 'success',
                    text1: 'Signed in',
                    text2: 'Welcome back',
                    position: 'top',
                    visibilityTime: 2000,
                });

                // Navigation handled by AppNavigator
            } else {
                setErrorMessage(result.message || 'Invalid credentials. Please try again.');
                Toast.show({
                    type: 'error',
                    text1: 'Could not sign in',
                    text2: result.message || 'Invalid credentials. Please try again.',
                    position: 'top',
                    visibilityTime: 4000,
                });
            }
        } catch (error) {
            console.error('Login error:', error);
            setErrorMessage('An unexpected error occurred. Please try again.');
            Toast.show({
                type: 'error',
                text1: 'Something went wrong',
                text2: 'An unexpected error occurred. Please try again.',
                position: 'top',
                visibilityTime: 4000,
            });
        } finally {
            setLoading(false);
        }
    };

    const handleForgotPassword = () => {
        // carry the email over when the user already typed one
        const typed = username.trim();
        navigation.navigate(ROUTES.FORGOT_PASSWORD, { email: typed.includes('@') ? typed : '' });
    };

    const handleContactSupport = () => {
        Toast.show({
            type: 'info',
            text1: 'Contact support',
            text2: 'Ask your HR team to reset your password or unlock your account',
            position: 'top',
            visibilityTime: 5000,
        });
    };

    return (
        <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
            <StatusBar barStyle="dark-content" backgroundColor={color.surface} />
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={styles.flex}
            >
                <ScrollView
                    contentContainerStyle={styles.scroll}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    <View style={styles.form}>
                        <Image
                            style={styles.logo}
                            source={require('../../assets/images/mainLogo.jpg')}
                            resizeMode="contain"
                            accessibilityLabel="DeepGrid"
                        />
                        <Text style={styles.title}>Sign in</Text>
                        <Text style={styles.subtitle}>Continue to HRMS DeepGrid</Text>

                        {!isConnected ? (
                            <Notice tone="warning" icon="wifi-off">No internet connection</Notice>
                        ) : null}

                        <TextField
                            label="Username"
                            placeholder="Email or username"
                            onChangeText={(text) => {
                                setUsername(text);
                                if (errors.username) {
                                    setErrors({ ...errors, username: null });
                                }
                                setErrorMessage('');
                            }}
                            value={username}
                            autoCapitalize="none"
                            autoCorrect={false}
                            autoComplete="username"
                            textContentType="username"
                            returnKeyType="next"
                            onSubmitEditing={() => passwordRef.current?.focus()}
                            blurOnSubmit={false}
                            editable={!loading}
                            inputStyle={errors.username ? styles.inputError : undefined}
                        />

                        <Field label="Password">
                            <View style={[styles.passwordBox, errors.password && styles.inputError]}>
                                <TextInput
                                    ref={passwordRef}
                                    style={styles.passwordInput}
                                    placeholder="Password"
                                    placeholderTextColor={color.textTertiary}
                                    onChangeText={(text) => {
                                        setPassword(text);
                                        if (errors.password) {
                                            setErrors({ ...errors, password: null });
                                        }
                                        setErrorMessage('');
                                    }}
                                    secureTextEntry={!isPasswordVisible}
                                    value={password}
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    autoComplete="password"
                                    textContentType="password"
                                    returnKeyType="go"
                                    editable={!loading}
                                    onSubmitEditing={handleLogin}
                                />
                                <IconButton
                                    name={isPasswordVisible ? 'eye-off' : 'eye'}
                                    size={18}
                                    color={color.textTertiary}
                                    label={isPasswordVisible ? 'Hide password' : 'Show password'}
                                    onPress={() => setIsPasswordVisible(!isPasswordVisible)}
                                    disabled={loading}
                                />
                            </View>
                        </Field>

                        {errorMessage ? (
                            <Notice tone="danger" icon="alert-circle">{errorMessage}</Notice>
                        ) : null}

                        <Button
                            title={loading ? 'Signing in' : 'Sign in'}
                            onPress={handleLogin}
                            disabled={loading || !isConnected}
                            loading={loading}
                            full
                        />

                        <Button
                            title="Forgot password?"
                            variant="ghost"
                            onPress={handleForgotPassword}
                            disabled={loading}
                            style={styles.forgot}
                        />
                    </View>

                    <View style={styles.footer}>
                        <View style={styles.helpRow}>
                            <Text style={styles.helpText}>Trouble signing in?</Text>
                            <Pressable onPress={handleContactSupport} disabled={loading} hitSlop={8}>
                                <Text style={styles.link}>Contact support</Text>
                            </Pressable>
                        </View>
                        <Text style={styles.caption}>© {new Date().getFullYear()} DeepGrid Technologies</Text>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    flex: { flex: 1 },
    safeArea: {
        flex: 1,
        backgroundColor: color.surface,
    },
    scroll: {
        flexGrow: 1,
        paddingHorizontal: space.xl,
        paddingTop: space.xl,
        paddingBottom: space.lg,
    },
    form: {
        flex: 1,
        width: '100%',
        maxWidth: 420,
        alignSelf: 'center',
        justifyContent: 'center',
        paddingBottom: space.xl,
    },
    logo: {
        width: 180,
        height: 90,
        alignSelf: 'center',
        marginBottom: space.lg,
    },
    title: {
        ...type.display,
        textAlign: 'center',
    },
    subtitle: {
        ...type.secondary,
        fontSize: 15,
        textAlign: 'center',
        marginTop: space.xs,
        marginBottom: space.xxl,
    },
    inputError: {
        borderColor: color.danger,
    },
    passwordBox: {
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 44,
        paddingLeft: space.md,
        paddingRight: 2,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: color.border,
        backgroundColor: color.surface,
    },
    passwordInput: {
        flex: 1,
        fontSize: 15,
        color: color.text,
        paddingVertical: 10,
    },
    forgot: {
        marginTop: space.sm,
        alignSelf: 'center',
    },
    footer: {
        alignItems: 'center',
        gap: space.sm,
    },
    helpRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: space.xs,
    },
    helpText: {
        ...type.secondary,
    },
    link: {
        fontSize: 13,
        fontWeight: '600',
        color: color.accent,
    },
    caption: {
        ...type.caption,
        textAlign: 'center',
    },
});

export default LoginScreen;
