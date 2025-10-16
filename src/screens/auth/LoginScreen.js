import React, { useState, useEffect } from 'react';
import {
    View,
    StyleSheet,
    Image,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    TouchableOpacity,
    Animated,
    Dimensions,
} from 'react-native';
import { Text, Checkbox, ActivityIndicator } from 'react-native-paper';
import Toast from 'react-native-toast-message';
import { SafeAreaView } from 'react-native-safe-area-context';
import NetInfo from '@react-native-community/netinfo';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import { useAuth } from '../../context/AuthContext';
import { validateLoginForm } from '../../utils/validators';
import { colors } from '../../theme/colors';

const { width, height } = Dimensions.get('window');

const LoginScreen = ({ navigation }) => {
    const { login } = useAuth();

    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [rememberMe, setRememberMe] = useState(false);
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState({});
    const [isConnected, setIsConnected] = useState(true);

    // Animations
    const fadeAnim = new Animated.Value(0);
    const slideAnim = new Animated.Value(50);

    useEffect(() => {
        // Check network connectivity
        const unsubscribe = NetInfo.addEventListener(state => {
            setIsConnected(state.isConnected);
            if (!state.isConnected) {
                Toast.show({
                    type: 'error',
                    text1: 'No Internet Connection',
                    text2: 'Please check your network settings',
                });
            }
        });

        // Entrance animations
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 800,
                useNativeDriver: true,
            }),
            Animated.spring(slideAnim, {
                toValue: 0,
                tension: 20,
                friction: 7,
                useNativeDriver: true,
            }),
        ]).start();

        return () => unsubscribe();
    }, []);

    const handleLogin = async () => {
        // Check internet connection
        if (!isConnected) {
            Toast.show({
                type: 'error',
                text1: 'No Internet Connection',
                text2: 'Please connect to the internet to login',
            });
            return;
        }

        // Validate form
        const validation = validateLoginForm(username, password);

        if (!validation.isValid) {
            setErrors(validation.errors);
            Toast.show({
                type: 'error',
                text1: 'Validation Error',
                text2: Object.values(validation.errors)[0],
                position: 'top',
                visibilityTime: 3000,
            });
            return;
        }

        // Clear errors
        setErrors({});
        setLoading(true);

        try {
            const result = await login(username.trim(), password);

            if (result.success) {
                Toast.show({
                    type: 'success',
                    text1: 'Login Successful',
                    text2: 'Welcome back!',
                    position: 'top',
                    visibilityTime: 2000,
                });

                // Navigation handled by AppNavigator
            } else {
                Toast.show({
                    type: 'error',
                    text1: 'Login Failed',
                    text2: result.message || 'Invalid credentials. Please try again.',
                    position: 'top',
                    visibilityTime: 4000,
                });
            }
        } catch (error) {
            console.error('Login error:', error);
            Toast.show({
                type: 'error',
                text1: 'Error',
                text2: 'An unexpected error occurred. Please try again.',
                position: 'top',
                visibilityTime: 4000,
            });
        } finally {
            setLoading(false);
        }
    };

    const handleForgotPassword = () => {
        Toast.show({
            type: 'info',
            text1: 'Password Reset',
            text2: 'Please contact your HR administrator',
            position: 'top',
            visibilityTime: 4000,
        });
    };

    const handleContactSupport = () => {
        Toast.show({
            type: 'info',
            text1: 'Contact Support',
            text2: 'Email: support@deepgrid.com\nPhone: +91-1234567890',
            position: 'top',
            visibilityTime: 5000,
        });
    };

    return (
        <SafeAreaView style={styles.safeArea} edges={['top']}>
            <LinearGradient
                colors={[colors.primary, colors.primaryLight, colors.white]}
                style={styles.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
            >
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={styles.container}
                >
                    <ScrollView
                        contentContainerStyle={styles.scrollContent}
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator={false}
                    >
                        {/* Logo Section */}
                        <Animated.View
                            style={[
                                styles.logoContainer,
                                {
                                    opacity: fadeAnim,
                                    transform: [{ translateY: slideAnim }],
                                },
                            ]}
                        >
                            <View style={styles.logoWrapper}>
                                <Image
                                    source={require('../../assets/images/mainLogo.jpg')}
                                    style={styles.logo}
                                    resizeMode="contain"
                                />
                            </View>
                            <Text style={styles.title}>HRMS DeepGrid</Text>
                            <Text style={styles.subtitle}>Employee Management System</Text>

                            {/* Connection Status Indicator */}
                            <View style={styles.connectionStatus}>
                                <Icon
                                    name={isConnected ? 'wifi' : 'wifi-off'}
                                    size={16}
                                    color={isConnected ? colors.success : colors.error}
                                />
                                <Text style={[
                                    styles.connectionText,
                                    { color: isConnected ? colors.success : colors.error }
                                ]}>
                                    {isConnected ? 'Connected' : 'No Connection'}
                                </Text>
                            </View>
                        </Animated.View>

                        {/* Form Section */}
                        <Animated.View
                            style={[
                                styles.formContainer,
                                {
                                    opacity: fadeAnim,
                                },
                            ]}
                        >
                            <View style={styles.card}>
                                <Text style={styles.welcomeText}>Welcome Back!</Text>
                                <Text style={styles.loginText}>Login to your account</Text>

                                {/* Username Input */}
                                <View style={styles.inputWrapper}>
                                    <Icon
                                        name="account"
                                        size={20}
                                        color={colors.textSecondary}
                                        style={styles.inputIcon}
                                    />
                                    <Input
                                        label="Username or Email"
                                        value={username}
                                        onChangeText={(text) => {
                                            setUsername(text);
                                            if (errors.username) {
                                                setErrors({ ...errors, username: null });
                                            }
                                        }}
                                        error={errors.username}
                                        keyboardType="email-address"
                                        autoCapitalize="none"
                                        autoCorrect={false}
                                        disabled={loading}
                                        returnKeyType="next"
                                        style={styles.input}
                                    />
                                </View>

                                {/* Password Input */}
                                <View style={styles.inputWrapper}>
                                    <Icon
                                        name="lock"
                                        size={20}
                                        color={colors.textSecondary}
                                        style={styles.inputIcon}
                                    />
                                    <Input
                                        label="Password"
                                        value={password}
                                        onChangeText={(text) => {
                                            setPassword(text);
                                            if (errors.password) {
                                                setErrors({ ...errors, password: null });
                                            }
                                        }}
                                        error={errors.password}
                                        secureTextEntry
                                        disabled={loading}
                                        returnKeyType="done"
                                        onSubmitEditing={handleLogin}
                                        style={styles.input}
                                    />
                                </View>

                                {/* Remember Me & Forgot Password */}
                                <View style={styles.optionsContainer}>
                                    <TouchableOpacity
                                        style={styles.rememberMeContainer}
                                        onPress={() => setRememberMe(!rememberMe)}
                                        disabled={loading}
                                        activeOpacity={0.7}
                                    >
                                        <Checkbox
                                            status={rememberMe ? 'checked' : 'unchecked'}
                                            onPress={() => setRememberMe(!rememberMe)}
                                            disabled={loading}
                                            color={colors.primary}
                                        />
                                        <Text style={styles.rememberMeText}>Remember Me</Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        onPress={handleForgotPassword}
                                        disabled={loading}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={styles.forgotPasswordText}>
                                            Forgot Password?
                                        </Text>
                                    </TouchableOpacity>
                                </View>

                                {/* Login Button */}
                                <Button
                                    mode="contained"
                                    onPress={handleLogin}
                                    loading={loading}
                                    disabled={loading || !isConnected}
                                    style={styles.loginButton}
                                    icon={loading ? null : 'login'}
                                >
                                    {loading ? 'Logging in...' : 'Login'}
                                </Button>

                                {/* Divider */}
                                <View style={styles.divider}>
                                    <View style={styles.dividerLine} />
                                    <Text style={styles.dividerText}>OR</Text>
                                    <View style={styles.dividerLine} />
                                </View>

                                {/* Help Section */}
                                <View style={styles.helpContainer}>
                                    <Icon name="help-circle" size={20} color={colors.textSecondary} />
                                    <Text style={styles.helpText}>Having trouble logging in?</Text>
                                </View>

                                <TouchableOpacity
                                    onPress={handleContactSupport}
                                    disabled={loading}
                                    activeOpacity={0.7}
                                    style={styles.contactButton}
                                >
                                    <Icon name="headset" size={18} color={colors.primary} />
                                    <Text style={styles.contactText}>Contact Support</Text>
                                </TouchableOpacity>
                            </View>
                        </Animated.View>

                        {/* Footer */}
                        <View style={styles.footer}>
                            <Text style={styles.footerText}>
                                © 2025 DeepGrid Technologies. All rights reserved.
                            </Text>
                            <Text style={styles.versionText}>Version 1.0.0</Text>

                            {/* Additional Info */}
                            <View style={styles.footerLinks}>
                                <TouchableOpacity activeOpacity={0.7}>
                                    <Text style={styles.footerLink}>Privacy Policy</Text>
                                </TouchableOpacity>
                                <Text style={styles.footerDot}>•</Text>
                                <TouchableOpacity activeOpacity={0.7}>
                                    <Text style={styles.footerLink}>Terms of Service</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </ScrollView>
                </KeyboardAvoidingView>
            </LinearGradient>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
    },
    gradient: {
        flex: 1,
    },
    container: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
        paddingHorizontal: 20,
        paddingBottom: 20,
    },
    logoContainer: {
        alignItems: 'center',
        marginTop: height * 0.05,
        marginBottom: 24,
    },
    logoWrapper: {
        backgroundColor: colors.white,
        borderRadius: 75,
        padding: 10,
        shadowColor: colors.black,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
        marginBottom: 16,
    },
    logo: {
        width: 100,
        height: 100,
    },
    title: {
        fontSize: 32,
        fontWeight: 'bold',
        color: colors.white,
        marginBottom: 4,
        textShadowColor: 'rgba(0, 0, 0, 0.3)',
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 4,
    },
    subtitle: {
        fontSize: 16,
        color: colors.white,
        opacity: 0.95,
        textShadowColor: 'rgba(0, 0, 0, 0.2)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 2,
    },
    connectionStatus: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 12,
        paddingHorizontal: 16,
        paddingVertical: 6,
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        borderRadius: 20,
    },
    connectionText: {
        fontSize: 12,
        marginLeft: 6,
        fontWeight: '600',
    },
    formContainer: {
        flex: 1,
    },
    card: {
        backgroundColor: colors.white,
        borderRadius: 24,
        padding: 24,
        shadowColor: colors.black,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 16,
        elevation: 8,
    },
    welcomeText: {
        fontSize: 26,
        fontWeight: 'bold',
        color: colors.textPrimary,
        marginBottom: 6,
    },
    loginText: {
        fontSize: 15,
        color: colors.textSecondary,
        marginBottom: 28,
    },
    inputWrapper: {
        position: 'relative',
        marginBottom: 4,
    },
    inputIcon: {
        position: 'absolute',
        left: 12,
        top: 28,
        zIndex: 1,
    },
    input: {
        paddingLeft: 40,
    },
    optionsContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
        marginTop: 8,
    },
    rememberMeContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    rememberMeText: {
        fontSize: 14,
        color: colors.textPrimary,
        marginLeft: -8,
    },
    forgotPasswordText: {
        fontSize: 14,
        color: colors.primary,
        fontWeight: '600',
    },
    loginButton: {
        marginBottom: 20,
        borderRadius: 12,
        elevation: 3,
    },
    divider: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
    },
    dividerLine: {
        flex: 1,
        height: 1,
        backgroundColor: colors.border,
    },
    dividerText: {
        marginHorizontal: 16,
        fontSize: 12,
        color: colors.textSecondary,
        fontWeight: '600',
    },
    helpContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
    },
    helpText: {
        fontSize: 14,
        color: colors.textSecondary,
        marginLeft: 8,
    },
    contactButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.primary,
        backgroundColor: colors.white,
    },
    contactText: {
        fontSize: 15,
        color: colors.primary,
        fontWeight: '600',
        marginLeft: 8,
    },
    footer: {
        alignItems: 'center',
        paddingVertical: 24,
        marginTop: 20,
    },
    footerText: {
        fontSize: 12,
        color: colors.white,
        marginBottom: 4,
        textAlign: 'center',
    },
    versionText: {
        fontSize: 11,
        color: colors.white,
        opacity: 0.8,
        marginBottom: 12,
    },
    footerLinks: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 8,
    },
    footerLink: {
        fontSize: 12,
        color: colors.white,
        textDecorationLine: 'underline',
    },
    footerDot: {
        fontSize: 12,
        color: colors.white,
        marginHorizontal: 12,
    },
});

export default LoginScreen;