// src/components/ui/HeaderWithNotifications.js
import React from 'react';
import AppHeader from './AppHeader';
import { useAuth } from '../../context/AuthContext';

export default function HeaderWithNotifications({ navigation, ...rest }) {
    const { user } = useAuth();
    const isAdmin = user?.roles?.includes('Administrator') || user?.roles?.includes('System Manager');

    return (
        <AppHeader
            rightIcon="bell"
            onRightPress={() => navigation.navigate(isAdmin ? 'CreateNotification' : 'Notifications')}
            {...rest}
        />
    );
}
