import React, { useEffect } from 'react';
import { StatusBar, Text, TextInput } from 'react-native';
import { Provider as PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { toastConfig } from './config/toastConfig';

import { AuthProvider } from './context/AuthContext';
import AppNavigator from './navigation/AppNavigator';
import { theme } from './theme/theme';

// Respect the phone's font size setting, but cap it so every screen keeps its layout on every phone
Text.defaultProps = { ...(Text.defaultProps || {}), maxFontSizeMultiplier: 1.3 };
TextInput.defaultProps = { ...(TextInput.defaultProps || {}), maxFontSizeMultiplier: 1.3 };

const App = () => {
    useEffect(() => {
        // Initialize notification service with error handling
        const initializeNotifications = async () => {
            try {
                console.log('🚀 App.js: Starting notification initialization...');
                // Try to import and initialize notification service
                const NotificationService = require('./services/notification.service').default || require('./services/notification.service');
                const initialized = await NotificationService.initialize();
                if (initialized) {
                    console.log('✅ App.js: Notification service initialized successfully');
                } else {
                    console.warn('⚠️ App.js: Notification service initialization returned false');
                }
            } catch (error) {
                console.warn('⚠️ App.js: Notification service initialization failed:', error.message);
                console.log('📱 App will continue without native notifications');
                // App continues to work without notifications
            }
        };

        initializeNotifications();
        
        // Cleanup on unmount
        return () => {
            try {
                const NotificationService = require('./services/notification.service').default || require('./services/notification.service');
                if (NotificationService.cleanup) {
                    console.log('🧹 App.js: Cleaning up notification service...');
                    NotificationService.cleanup();
                }
            } catch (error) {
                console.warn('⚠️ App.js: Cleanup error:', error.message);
            }
        };
    }, []);

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <SafeAreaProvider>
                <PaperProvider theme={theme}>
                    <AuthProvider>
                        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
                        <AppNavigator />
                        <Toast config={toastConfig} />
                    </AuthProvider>
                </PaperProvider>
            </SafeAreaProvider>
        </GestureHandlerRootView>
    );
};

export default App;
