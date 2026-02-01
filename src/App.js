import React, { useEffect } from 'react';
import { StatusBar } from 'react-native';
import { Provider as PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AuthProvider } from './context/AuthContext';
import { ThemeProvider, useAppTheme } from './context/ThemeContext';
import AppNavigator from './navigation/AppNavigator';
import { getTheme } from './theme/theme';

// Inner app component that uses theme
const AppContent = () => {
    const { isDarkMode, colors } = useAppTheme();
    const paperTheme = getTheme(isDarkMode);

    useEffect(() => {
        // Initialize notification service with error handling
        const initializeNotifications = async () => {
            try {
                console.log('🚀 App.js: Starting notification initialization...');
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
            }
        };

        initializeNotifications();

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
        <PaperProvider theme={paperTheme}>
            <AuthProvider>
                <StatusBar
                    barStyle={isDarkMode ? 'light-content' : 'dark-content'}
                    backgroundColor={colors.background}
                />
                <AppNavigator />
                <Toast />
            </AuthProvider>
        </PaperProvider>
    );
};

const App = () => {
    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <SafeAreaProvider>
                <ThemeProvider>
                    <AppContent />
                </ThemeProvider>
            </SafeAreaProvider>
        </GestureHandlerRootView>
    );
};

export default App;
