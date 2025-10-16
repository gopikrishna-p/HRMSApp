import React, { useState, useEffect } from 'react';
import {
    View,
    StyleSheet,
    Image,
    KeyboardAvoidingView,
    Platform,
    TouchableOpacity,
    Dimensions,
    TextInput,
} from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import Toast from 'react-native-toast-message';
import { SafeAreaView } from 'react-native-safe-area-context';
import NetInfo from '@react-native-community/netinfo';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import { useAuth } from '../../context/AuthContext';
import { validateLoginForm } from '../../utils/validators';
import { colors } from '../../theme/colors';
import { Button } from 'react-native-paper';

const { width, height } = Dimensions.get('window');

const LoginScreen = ({ navigation }) => {
    const { login } = useAuth();

    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState({});
    const [isConnected, setIsConnected] = useState(true);
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

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
            setErrorMessage(Object.values(validation.errors)[0]);
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
        setErrorMessage('');
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
                setErrorMessage(result.message || 'Invalid credentials. Please try again.');
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
            setErrorMessage('An unexpected error occurred. Please try again.');
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
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.container}
            >
                <View style={styles.centeredContent}>
                    {/* Logo Section */}
                    <View style={styles.imageContainer}>
                        <Image
                            style={styles.image}
                            source={require('../../assets/images/mainLogo.jpg')}
                            resizeMode="contain"
                        />
                    </View>

                    {/* Title Section */}
                    <View style={styles.titleContainer}>
                        <Text style={styles.title}>HRMS DeepGrid</Text>
                        <Text style={styles.subtitle}>Employee Management System</Text>
                    </View>

                    {/* Form Section */}
                    <View style={styles.innerContainer}>
                        <Text style={styles.label}>Username</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Enter your username"
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
                            editable={!loading}
                            placeholderTextColor="#999"
                        />

                        <Text style={styles.label}>Password</Text>
                        <View style={styles.passwordContainer}>
                            <TextInput
                                style={styles.passwordInput}
                                placeholder="Enter your password"
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
                                editable={!loading}
                                placeholderTextColor="#999"
                                onSubmitEditing={handleLogin}
                            />
                            <TouchableOpacity
                                onPress={() => setIsPasswordVisible(!isPasswordVisible)}
                                disabled={loading}
                            >
                                <Icon
                                    name={isPasswordVisible ? "eye-off" : "eye"}
                                    size={20}
                                    color="grey"
                                    style={styles.eyeIcon}
                                />
                            </TouchableOpacity>
                        </View>

                        {errorMessage ? (
                            <Text style={styles.errorMessage}>{errorMessage}</Text>
                        ) : null}

                        <Button
                            mode="contained"
                            onPress={handleLogin}
                            buttonColor="#003f82"
                            textColor="white"
                            disabled={loading || !isConnected}
                            loading={loading}
                            style={styles.loginButton}
                        >
                            {loading ? "Logging in..." : "Login"}
                        </Button>

                        {/* Forgot Password */}
                        <TouchableOpacity
                            onPress={handleForgotPassword}
                            disabled={loading}
                            style={styles.forgotPasswordContainer}
                        >
                            <Text style={styles.forgotPasswordText}>
                                Forgot Password?
                            </Text>
                        </TouchableOpacity>

                        {/* Help Section */}
                        <View style={styles.helpSection}>
                            <Text style={styles.helpText}>Having trouble logging in?</Text>
                            <TouchableOpacity
                                onPress={handleContactSupport}
                                disabled={loading}
                                style={styles.contactButton}
                            >
                                <Icon name="headset" size={16} color="#003f82" />
                                <Text style={styles.contactText}>Contact Support</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Footer */}
                    <View style={styles.footer}>
                        <Text style={styles.footerText}>
                            © 2025 DeepGrid Technologies. All rights reserved.
                        </Text>
                        <Text style={styles.versionText}>Version 1.0.0</Text>

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
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: 'white',
    },
    container: {
        flex: 1,
    },
    centeredContent: {
        flex: 1,
        paddingHorizontal: width * 0.05,
        paddingVertical: height * 0.02,
        justifyContent: 'center',
        alignItems: 'center',
    },
    imageContainer: {
        alignItems: 'center',
        marginBottom: height * 0.015,
    },
    image: {
        width: Math.min(width * 0.5, 200),
        height: Math.min(width * 0.25, 100),
        backgroundColor: '#000',
        borderRadius: 12,
    },
    titleContainer: {
        alignItems: 'center',
        marginBottom: height * 0.02,
    },
    title: {
        fontSize: Math.min(width * 0.06, 24),
        fontWeight: 'bold',
        color: '#003f82',
        marginBottom: height * 0.003,
    },
    subtitle: {
        fontSize: Math.min(width * 0.035, 14),
        color: '#666',
    },
    innerContainer: {
        width: '90%',
        maxWidth: 450,
    },
    label: {
        fontSize: Math.min(width * 0.035, 14),
        marginBottom: height * 0.004,
        color: 'black',
    },
    input: {
        height: Math.max(height * 0.05, 40),
        borderColor: 'black',
        borderWidth: 1,
        marginBottom: height * 0.015,
        paddingHorizontal: width * 0.03,
        borderRadius: 5,
        color: 'black',
        fontSize: Math.min(width * 0.035, 14),
    },
    passwordContainer: {
        height: Math.max(height * 0.05, 40),
        flexDirection: 'row',
        borderColor: 'black',
        borderWidth: 1,
        borderRadius: 5,
        marginBottom: height * 0.015,
        alignItems: 'center',
    },
    passwordInput: {
        flex: 1,
        height: '100%',
        paddingHorizontal: width * 0.03,
        color: 'black',
        fontSize: Math.min(width * 0.035, 14),
    },
    eyeIcon: {
        marginRight: width * 0.03,
    },
    errorMessage: {
        color: 'red',
        marginBottom: height * 0.015,
        textAlign: 'center',
        fontSize: Math.min(width * 0.032, 13),
    },
    loginButton: {
        marginTop: height * 0.008,
        height: Math.max(height * 0.05, 40),
    },
    forgotPasswordContainer: {
        alignItems: 'center',
        marginTop: height * 0.015,
        marginBottom: height * 0.008,
        paddingVertical: height * 0.008,
    },
    forgotPasswordText: {
        fontSize: Math.min(width * 0.032, 13),
        color: '#003f82',
        fontWeight: '600',
    },
    helpSection: {
        alignItems: 'center',
        marginTop: height * 0.02,
        paddingTop: height * 0.02,
        borderTopWidth: 1,
        borderTopColor: '#e0e0e0',
    },
    helpText: {
        fontSize: Math.min(width * 0.032, 13),
        color: '#666',
        marginBottom: height * 0.01,
        textAlign: 'center',
    },
    contactButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: height * 0.01,
        paddingHorizontal: width * 0.04,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#003f82',
        backgroundColor: 'white',
        minHeight: 36,
    },
    contactText: {
        fontSize: Math.min(width * 0.032, 13),
        color: '#003f82',
        fontWeight: '600',
        marginLeft: width * 0.015,
    },
    footer: {
        alignItems: 'center',
        paddingVertical: height * 0.015,
        marginTop: height * 0.02,
    },
    footerText: {
        fontSize: Math.min(width * 0.028, 11),
        color: '#666',
        marginBottom: height * 0.003,
        textAlign: 'center',
        paddingHorizontal: width * 0.05,
    },
    versionText: {
        fontSize: Math.min(width * 0.026, 10),
        color: '#999',
        marginBottom: height * 0.01,
    },
    footerLinks: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: height * 0.008,
        flexWrap: 'wrap',
        justifyContent: 'center',
    },
    footerLink: {
        fontSize: Math.min(width * 0.028, 11),
        color: '#003f82',
        textDecorationLine: 'underline',
    },
    footerDot: {
        fontSize: Math.min(width * 0.028, 11),
        color: '#666',
        marginHorizontal: width * 0.025,
    },
});

export default LoginScreen;