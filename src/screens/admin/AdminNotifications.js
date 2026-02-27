import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    Modal,
    ScrollView,
    SafeAreaView,
    StatusBar,
    RefreshControl,
    ActivityIndicator,
    Alert,
    TextInput,
    Dimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import ApiService from '../../services/api.service';
import { colors } from '../../theme/colors';
import { useAuth } from '../../context/AuthContext';

// Color palette for notifications
const NOTIFICATION_COLORS = {
    Info: { bg: '#E3F2FD', border: '#2196F3', icon: '#1976D2' },
    Success: { bg: '#E8F5E8', border: '#4CAF50', icon: '#388E3C' },
    Warning: { bg: '#FFF3C4', border: '#FF9800', icon: '#F57C00' },
    Alert: { bg: '#FFEBEE', border: '#F44336', icon: '#D32F2F' },
    Urgent: { bg: '#FCE4EC', border: '#E91E63', icon: '#C2185B' },
};

const AdminNotifications = ({ navigation }) => {
    const { employee } = useAuth();
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchNotifications = useCallback(async () => {
        if (!employee?.name) {
            return;
        }
        try {
            setLoading(true);
            const response = await ApiService.getMyNotifications({
                limit: 100,
                skip: 0,
                employee: employee.name,
            });
            console.log('Admin Notifications response:', JSON.stringify(response, null, 2));
            
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

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.loadingText}>Loading notifications...</Text>
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />
            
            {/* Header */}
            <View style={styles.header}>
                <View style={styles.headerTop}>
                    <View>
                        <Text style={styles.headerTitle}>Notifications</Text>
                        <Text style={styles.headerSubtitle}>Manage system notifications</Text>
                    </View>
                    <TouchableOpacity
                        style={styles.createButton}
                        onPress={handleCreateNotification}
                    >
                        <Icon name="plus" size={20} color={colors.white} />
                    </TouchableOpacity>
                </View>
            </View>

            {/* Notifications List */}
            <FlatList
                data={notifications}
                keyExtractor={(item) => item.name}
                renderItem={({ item }) => (
                    <View style={styles.notificationCard}>
                        <Text style={styles.notificationTitle}>{item.title}</Text>
                        <Text style={styles.notificationMessage}>{item.message}</Text>
                        <Text style={styles.notificationTime}>{item.time_ago}</Text>
                    </View>
                )}
                contentContainerStyle={styles.listContent}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        colors={[colors.primary]}
                    />
                }
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Icon name="bell-sleep" size={80} color={colors.textMuted} />
                        <Text style={styles.emptyTitle}>No Notifications</Text>
                        <Text style={styles.emptyText}>No notifications yet</Text>
                    </View>
                }
            />
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: colors.background,
    },
    loadingText: {
        marginTop: 16,
        fontSize: 14,
        color: colors.textSecondary,
    },

    // Header
    header: {
        backgroundColor: colors.surface,
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    headerTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 26,
        fontWeight: '700',
        color: colors.textPrimary,
    },
    headerSubtitle: {
        fontSize: 14,
        color: colors.textSecondary,
        marginTop: 2,
    },
    createButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
    },

    // Notifications List
    listContent: {
        paddingHorizontal: 16,
        paddingBottom: 20,
    },
    notificationCard: {
        backgroundColor: colors.surface,
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderLeftWidth: 4,
        borderLeftColor: colors.primary,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
    },
    notificationTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.textPrimary,
        marginBottom: 6,
    },
    notificationMessage: {
        fontSize: 14,
        color: colors.textSecondary,
        lineHeight: 20,
        marginBottom: 8,
    },
    notificationTime: {
        fontSize: 12,
        color: colors.textMuted,
    },

    // Empty State
    emptyContainer: {
        alignItems: 'center',
        paddingTop: 60,
        paddingBottom: 40,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: colors.textPrimary,
        marginTop: 16,
    },
    emptyText: {
        fontSize: 14,
        color: colors.textSecondary,
        marginTop: 8,
        textAlign: 'center',
    },
});

export default AdminNotifications;