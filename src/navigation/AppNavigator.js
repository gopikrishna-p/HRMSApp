import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator as createStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import AuthNavigator from './AuthNavigator';
import EmployeeNavigator from './EmployeeNavigator';
import AdminNavigator from './AdminNavigator';
import SplashScreen from '../screens/auth/SplashScreen';
import { ROUTES } from '../config/constants';

const Stack = createStackNavigator();

const AppNavigator = () => {
    const { isAuthenticated, loading, isAdmin } = useAuth();

    if (loading) {
        return <SplashScreen />;
    }

    return (
        <NavigationContainer>
            <Stack.Navigator screenOptions={{ headerShown: false }}>
                {!isAuthenticated ? (
                    <Stack.Screen name="Auth" component={AuthNavigator} />
                ) : isAdmin ? (
                    <Stack.Screen name="Admin" component={AdminNavigator} />
                ) : (
                    <Stack.Screen name="Employee" component={EmployeeNavigator} />
                )}
            </Stack.Navigator>
        </NavigationContainer>
    );
};

export default AppNavigator;