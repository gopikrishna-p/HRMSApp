import React from 'react';
import { StatusBar } from 'react-native';
import { Provider as PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AuthProvider } from './context/AuthContext';
import AppNavigator from './navigation/AppNavigator';
import { theme } from './theme/theme';

const App = () => (
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

export default App;
