import React, { useEffect } from 'react';
import { StatusBar } from 'react-native';
import { Provider as PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AuthProvider } from './context/AuthContext';
import AppNavigator from './navigation/AppNavigator';
import { theme } from './theme/theme';

const App = () => {
    useEffect(() => {
        // Initialize notification service with error handling
        const initializeNotifications = async () => {
            try {
                // Try to import and initialize notification service
                const NotificationService = require('./services/notification.service').default || require('./services/notification.service');
                await NotificationService.initialize();
                console.log('✅ Notification service initialized');
            } catch (error) {
                console.warn('⚠️ Notification service initialization failed:', error.message);
                console.log('📱 App will continue without native notifications');
                // App continues to work without notifications
            }
        };

        initializeNotifications();
    }, []);

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <SafeAreaProvider>
                <PaperProvider theme={theme}>
                    <AuthProvider>
                        <StatusBar barStyle="light-content" />
                        <AppNavigator />
                        <Toast />
                    </AuthProvider>
                </PaperProvider>
            </SafeAreaProvider>
        </GestureHandlerRootView>
    );
};

export default App;
