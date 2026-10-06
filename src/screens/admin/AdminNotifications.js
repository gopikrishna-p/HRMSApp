// src/screens/admin/AdminNotifications.js
//
// The admin's notification inbox (newest first, as returned by the server), plus the way in to
// send a new notification. Unread items carry an accent dot and a bolder title.
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import ApiService from '../../services/api.service';
import { useAuth } from '../../context/AuthContext';
import {
    Screen,
    Group,
    Row,
    Button,
    EmptyState,
    Loading,
    color,
    space,
    type,
} from '../../components/ds';

const AdminNotifications = ({ navigation }) => {
    const { employee } = useAuth();
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchNotifications = useCallback(async () => {
        if (!employee?.name) {
            setLoading(false); // nothing to load without an employee record
            return;
        }
        try {
            setLoading(true);
            const response = await ApiService.getMyNotifications({
                limit: 100,
                skip: 0,
                employee: employee.name,
            });

            if (response.success && response.data?.message?.status === 'success') {
                const message = response.data.message;
                setNotifications(message.notifications || []);
            }
        } catch (error) {
            console.error('Error fetching notifications:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [employee]);

    useEffect(() => {
        fetchNotifications();
    }, [fetchNotifications]);

    const onRefresh = useCallback(() => {
        if (!employee?.name) {
            return;
        }
        setRefreshing(true);
        fetchNotifications();
    }, [employee, fetchNotifications]);

    const handleCreateNotification = () => {
        navigation.navigate('CreateNotification');
    };

    if (loading && !refreshing) {
        return (
            <View style={styles.flex}>
                <Loading />
            </View>
        );
    }

    return (
        <View style={styles.flex}>
            <Screen
                refreshing={refreshing}
                onRefresh={onRefresh}
                footer={<Button title="Send a notification" onPress={handleCreateNotification} />}
            >
                {notifications.length === 0 ? (
                    <EmptyState icon="bell" title="No notifications" message="New notifications will appear here." />
                ) : (
                    <Group>
                        {notifications.map((item) => {
                            const unread = !item.is_read;
                            return (
                                <Row
                                    key={item.name}
                                    left={(
                                        <View style={styles.dotSlot}>
                                            {unread ? <View style={styles.dot} /> : null}
                                        </View>
                                    )}
                                    title={unread ? <Text style={styles.unreadTitle}>{item.title}</Text> : item.title}
                                    titleLines={2}
                                    subtitle={item.message}
                                    subtitleLines={0}
                                    meta={item.time_ago ? <Text style={styles.time}>{item.time_ago}</Text> : null}
                                />
                            );
                        })}
                    </Group>
                )}
            </Screen>
        </View>
    );
};

const styles = StyleSheet.create({
    flex: { flex: 1, backgroundColor: color.bg },
    dotSlot: { width: 8, marginRight: space.md, alignSelf: 'flex-start', paddingTop: 7 },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.accent },
    unreadTitle: { fontWeight: '600' },
    time: { ...type.caption },
});

export default AdminNotifications;
