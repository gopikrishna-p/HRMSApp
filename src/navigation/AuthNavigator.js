import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import LoginScreen from '../auth/login';
import DrawerNavigator from './DrawNavigation';
import AdminNavigator from './AdminNavigator';

const Stack = createStackNavigator();

function AuthNavigator() {
    return (
        <Stack.Navigator
            initialRouteName="Login"
            screenOptions={{
                headerShown: false,
                cardStyle: { backgroundColor: '#ffffff' },
            }}
        >
            <Stack.Screen
                name="Login"
                component={LoginScreen}
                options={{
                    animationEnabled: true,
                    gestureEnabled: false,
                }}
            />
            <Stack.Screen
                name="DrawerNavigator"
                component={DrawerNavigator}
                options={{
                    animationEnabled: true,
                    gestureEnabled: false,
                }}
            />
            <Stack.Screen
                name="AdminNavigator"
                component={AdminNavigator}
                options={{
                    animationEnabled: true,
                    gestureEnabled: false,
                }}
            />
        </Stack.Navigator>
    );
}

export default AuthNavigator;