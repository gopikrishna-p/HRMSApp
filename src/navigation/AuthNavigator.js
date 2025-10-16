import React from 'react';
import { createNativeStackNavigator as createStackNavigator } from '@react-navigation/native-stack';
import LoginScreen from '../screens/auth/LoginScreen';
import { ROUTES } from '../config/constants';

const Stack = createStackNavigator();

const AuthNavigator = () => {
    return (
        <Stack.Navigator
            screenOptions={{
                headerShown: false,
            }}
        >
            <Stack.Screen name={ROUTES.LOGIN} component={LoginScreen} />
        </Stack.Navigator>
    );
};

export default AuthNavigator;