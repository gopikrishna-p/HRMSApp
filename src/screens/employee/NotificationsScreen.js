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
    Animated,
    PanGestureHandler,
    State,
    Dimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import ApiService from '../../services/api.service';
import { colors } from '../../theme/colors';

const { width } = Dimensions.get('window');

// Color palette for notifications
const NOTIFICATION_COLORS = {
    Info: { bg: '#E3F2FD', border: '#2196F3', icon: '#1976D2' },
    Success: { bg: '#E8F5E8', border: '#4CAF50', icon: '#388E3C' },
    Warning: { bg: '#FFF3C4', border: '#FF9800', icon: '#F57C00' },
    Alert: { bg: '#FFEBEE', border: '#F44336', icon: '#D32F2F' },
    Urgent: { bg: '#FCE4EC', border: '#E91E63', icon: '#C2185B' },
};

const PRIORITY_COLORS = {
    Low: colors.textMuted,
    Medium: colors.warning,
    High: colors.error,
};

const NotificationsScreen = ({ navigation }) => {
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [stats, setStats] = useState({ total: 0, unread: 0, urgent: 0 });
    const [detailModalVisible, setDetailModalVisible] = useState(false);
    const [settingsModalVisible, setSettingsModalVisible] = useState(false);
    const [selectedNotification, setSelectedNotification] = useState(null);
    const [selectedTab, setSelectedTab] = useState('All'); // All, Unread, Archived
    const [settings, setSettings] = useState({});
    
    const tabs = [
        { key: 'All', label: 'All', icon: 'bell-outline' },
        { key: 'Unread', label: 'Unread', icon: 'bell-ring' },
        { key: 'Urgent', label: 'Urgent', icon: 'alert-circle' }
    ];

    useEffect(() => {
        fetchNotifications();
        fetchStats();
        fetchSettings();
    }, [selectedTab]);

    const fetchNotifications = async () => {
        try {
            setLoading(true);
            const params = {
                limit: 100,
                skip: 0,
                unread_only: selectedTab === 'Unread' ? 1 : 0
            };

            const response = await ApiService.getMyNotifications(params);
            console.log('Employee Notifications response:', JSON.stringify(response, null, 2));
            
            if (response.success && response.data?.message?.status === 'success') {
                const message = response.data.message;
                let notificationsList = message.notifications || [];
                
                // Filter for urgent if needed
                if (selectedTab === 'Urgent') {
                    notificationsList = notificationsList.filter(n => n.priority === 'High');
                }
                
                setNotifications(notificationsList);
            }
        } catch (error) {
            console.error('Error fetching notifications:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const fetchStats = async () => {
        try {
            const response = await ApiService.getNotificationStats();
            if (response.success && response.data?.message?.status === 'success') {
                setStats(response.data.message.stats || { total: 0, unread: 0, urgent: 0 });
            }
        } catch (error) {
            console.error('Error fetching notification stats:', error);
        }
    };

    const fetchSettings = async () => {
        try {
            const response = await ApiService.getNotificationSettings();
            if (response.success && response.data?.message?.status === 'success') {
                setSettings(response.data.message.settings || {});
            }
        } catch (error) {
            console.error('Error fetching notification settings:', error);
        }
    };

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchNotifications();
        fetchStats();
    }, [selectedTab]);

    const handleNotificationPress = (notification) => {
        setSelectedNotification(notification);
        setDetailModalVisible(true);
        
        // Mark as read if not already read
        if (!notification.is_read) {
            markAsRead(notification.name);
        }
    };

    const markAsRead = async (notificationId) => {
        try {
            await ApiService.markNotificationRead(notificationId);
            // Update local state
            setNotifications(prev => 
                prev.map(n => n.name === notificationId ? { ...n, is_read: 1 } : n)
            );
            fetchStats(); // Refresh stats
        } catch (error) {
            console.error('Error marking notification as read:', error);
        }
    };

    const markAllAsRead = async () => {
        try {
            const response = await ApiService.markAllNotificationsRead();
            if (response.success) {
                setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
                fetchStats();
                Alert.alert('Success', 'All notifications marked as read');
            }
        } catch (error) {
            console.error('Error marking all as read:', error);
            Alert.alert('Error', 'Failed to mark all as read');
        }
    };

    const archiveNotification = async (notificationId) => {
        try {
            const response = await ApiService.archiveNotification(notificationId);
            if (response.success) {
                setNotifications(prev => prev.filter(n => n.name !== notificationId));
                fetchStats();
            }
        } catch (error) {
            console.error('Error archiving notification:', error);
        }
    };

    const deleteNotification = async (notificationId) => {
        try {
            const response = await ApiService.deleteNotification(notificationId);
            if (response.success) {
                setNotifications(prev => prev.filter(n => n.name !== notificationId));
                fetchStats();
                Alert.alert('Success', 'Notification deleted');
            }
        } catch (error) {
            console.error('Error deleting notification:', error);
            Alert.alert('Error', 'Failed to delete notification');
        }
    };

    const getNotificationIcon = (type) => {
        const iconMap = {
            Info: 'information-outline',
            Success: 'check-circle-outline',
            Warning: 'alert-outline',
            Alert: 'alert-circle-outline',
            Urgent: 'alert-octagon-outline',
        };
        return iconMap[type] || 'bell-outline';
    };

    const TabButton = ({ tab, isActive }) => (
        <TouchableOpacity
            style={[styles.tabButton, isActive && styles.tabButtonActive]}
            onPress={() => setSelectedTab(tab.key)}
        >
            <Icon 
                name={tab.icon} 
                size={18} 
                color={isActive ? colors.white : colors.textSecondary} 
            />
            <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                {tab.label}
            </Text>
            {(tab.key === 'Unread' && stats.unread > 0) && (
                <View style={styles.tabBadge}>
                    <Text style={styles.tabBadgeText}>{stats.unread}</Text>
                </View>
            )}
            {(tab.key === 'Urgent' && stats.urgent > 0) && (
                <View style={[styles.tabBadge, { backgroundColor: colors.error }]}>
                    <Text style={styles.tabBadgeText}>{stats.urgent}</Text>
                </View>
            )}
        </TouchableOpacity>
    );

    const NotificationItem = ({ item, onArchive, onDelete }) => {
        const typeColors = NOTIFICATION_COLORS[item.notification_type] || NOTIFICATION_COLORS.Info;
        
        return (
            <View style={styles.notificationWrapper}>
                <TouchableOpacity
                    style={[
                        styles.notificationCard,
                        { borderLeftColor: typeColors.border },
                        !item.is_read && styles.unreadCard
                    ]}
                    onPress={() => handleNotificationPress(item)}
                    activeOpacity={0.7}
                >
                    <View style={styles.notificationHeader}>
                        <View style={[styles.typeIcon, { backgroundColor: typeColors.bg }]}>
                            <Icon 
                                name={getNotificationIcon(item.notification_type)} 
                                size={18} 
                                color={typeColors.icon} 
                            />
                        </View>
                        <View style={styles.notificationMeta}>
                            <View style={styles.metaRow}>
                                <Text style={styles.notificationType}>{item.notification_type}</Text>
                                <Text style={styles.notificationCategory}>{item.category}</Text>
                            </View>
                            <Text style={styles.notificationTime}>{item.time_ago}</Text>
                        </View>
                        {!item.is_read && (
                            <View style={styles.unreadDot} />
                        )}
                    </View>
                    
                    <Text style={styles.notificationTitle} numberOfLines={2}>{item.title}</Text>
                    <Text style={styles.notificationMessage} numberOfLines={3}>{item.message}</Text>
                    
                    <View style={styles.notificationFooter}>
                        <View style={styles.priorityBadge}>
                            <View style={[
                                styles.priorityDot, 
                                { backgroundColor: PRIORITY_COLORS[item.priority] }
                            ]} />
                            <Text style={[styles.priorityText, { color: PRIORITY_COLORS[item.priority] }]}>
                                {item.priority}
                            </Text>
                        </View>
                        {item.action_required === 1 && (
                            <View style={styles.actionBadge}>
                                <Icon name="hand-pointing-right" size={12} color={colors.warning} />
                                <Text style={styles.actionText}>Action Required</Text>
                            </View>
                        )}
                    </View>
                </TouchableOpacity>
                
                {/* Swipe Actions */}
                <View style={styles.swipeActions}>
                    <TouchableOpacity
                        style={[styles.swipeAction, { backgroundColor: colors.primary }]}
                        onPress={() => onArchive(item.name)}
                    >
                        <Icon name="archive" size={20} color={colors.white} />
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.swipeAction, { backgroundColor: colors.error }]}
                        onPress={() => onDelete(item.name)}
                    >
                        <Icon name="delete" size={20} color={colors.white} />
                    </TouchableOpacity>
                </View>
            </View>
        );
    };

    const renderDetailModal = () => (
        <Modal
            visible={detailModalVisible}
            animationType="slide"
            onRequestClose={() => setDetailModalVisible(false)}
        >
            <SafeAreaView style={styles.modalContainer}>
                <View style={styles.modalHeader}>
                    <TouchableOpacity 
                        onPress={() => setDetailModalVisible(false)}
                        style={styles.modalBackButton}
                    >
                        <Icon name="arrow-left" size={24} color={colors.textPrimary} />
                    </TouchableOpacity>
                    <Text style={styles.modalTitle}>Notification</Text>
                    <View style={styles.modalBackButton} />
                </View>

                {selectedNotification && (
                    <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
                        <View style={[
                            styles.detailHeader, 
                            { backgroundColor: NOTIFICATION_COLORS[selectedNotification.notification_type]?.bg }
                        ]}>
                            <View style={styles.detailTypeRow}>
                                <Icon 
                                    name={getNotificationIcon(selectedNotification.notification_type)} 
                                    size={24} 
                                    color={NOTIFICATION_COLORS[selectedNotification.notification_type]?.icon} 
                                />
                                <Text style={styles.detailType}>{selectedNotification.notification_type}</Text>
                                <View style={styles.detailBadges}>
                                    <View style={[styles.categoryBadge, { backgroundColor: colors.primary + '20' }]}>
                                        <Text style={[styles.categoryBadgeText, { color: colors.primary }]}>
                                            {selectedNotification.category}
                                        </Text>
                                    </View>
                                </View>
                            </View>
                        </View>

                        <View style={styles.detailContent}>
                            <Text style={styles.detailTitle}>{selectedNotification.title}</Text>
                            <Text style={styles.detailMessage}>{selectedNotification.message}</Text>

                            <View style={styles.detailMetaSection}>
                                <View style={styles.detailMetaRow}>
                                    <Icon name="calendar" size={16} color={colors.textMuted} />
                                    <Text style={styles.detailMetaText}>
                                        {selectedNotification.time_ago}
                                    </Text>
                                </View>
                                <View style={styles.detailMetaRow}>
                                    <Icon name="flag" size={16} color={PRIORITY_COLORS[selectedNotification.priority]} />
                                    <Text style={[styles.detailMetaText, { color: PRIORITY_COLORS[selectedNotification.priority] }]}>
                                        {selectedNotification.priority} Priority
                                    </Text>
                                </View>
                                {selectedNotification.action_required === 1 && (
                                    <View style={styles.detailMetaRow}>
                                        <Icon name="hand-pointing-right" size={16} color={colors.warning} />
                                        <Text style={[styles.detailMetaText, { color: colors.warning }]}>
                                            Action Required
                                        </Text>
                                    </View>
                                )}
                            </View>

                            <View style={styles.actionButtons}>
                                <TouchableOpacity
                                    style={styles.archiveButton}
                                    onPress={() => {
                                        archiveNotification(selectedNotification.name);
                                        setDetailModalVisible(false);
                                    }}
                                >
                                    <Icon name="archive" size={18} color={colors.white} />
                                    <Text style={styles.archiveButtonText}>Archive</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={styles.deleteButton}
                                    onPress={() => {
                                        Alert.alert(
                                            'Delete Notification',
                                            'Are you sure you want to delete this notification?',
                                            [
                                                { text: 'Cancel', style: 'cancel' },
                                                { 
                                                    text: 'Delete', 
                                                    style: 'destructive',
                                                    onPress: () => {
                                                        deleteNotification(selectedNotification.name);
                                                        setDetailModalVisible(false);
                                                    }
                                                }
                                            ]
                                        );
                                    }}
                                >
                                    <Icon name="delete" size={18} color={colors.white} />
                                    <Text style={styles.deleteButtonText}>Delete</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </ScrollView>
                )}
            </SafeAreaView>
        </Modal>
    );

    if (loading && notifications.length === 0) {
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
                        <Text style={styles.headerSubtitle}>
                            {stats.total} total • {stats.unread} unread
                        </Text>
                    </View>
                    <View style={styles.headerActions}>
                        {stats.unread > 0 && (
                            <TouchableOpacity
                                style={styles.markAllButton}
                                onPress={markAllAsRead}
                            >
                                <Icon name="check-all" size={20} color={colors.primary} />
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity
                            style={styles.settingsButton}
                            onPress={() => setSettingsModalVisible(true)}
                        >
                            <Icon name="cog" size={20} color={colors.textSecondary} />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Tabs */}
                <View style={styles.tabContainer}>
                    {tabs.map(tab => (
                        <TabButton 
                            key={tab.key} 
                            tab={tab} 
                            isActive={selectedTab === tab.key} 
                        />
                    ))}
                </View>
            </View>

            {/* Notifications List */}
            <FlatList
                data={notifications}
                keyExtractor={(item) => item.name}
                renderItem={({ item }) => 
                    <NotificationItem 
                        item={item} 
                        onArchive={archiveNotification}
                        onDelete={deleteNotification}
                    />
                }
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
                        <Icon 
                            name={selectedTab === 'Unread' ? 'check-all' : 'bell-sleep'} 
                            size={80} 
                            color={colors.textMuted} 
                        />
                        <Text style={styles.emptyTitle}>
                            {selectedTab === 'Unread' ? 'All Caught Up!' : 'No Notifications'}
                        </Text>
                        <Text style={styles.emptyText}>
                            {selectedTab === 'Unread' ? 'No unread notifications' : 'No notifications yet'}
                        </Text>
                    </View>
                }
            />

            {/* Detail Modal */}
            {renderDetailModal()}
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
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    headerTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 12,
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
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    markAllButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 20,
        backgroundColor: colors.primary + '15',
    },
    settingsButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },

    // Tabs
    tabContainer: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingBottom: 16,
        gap: 8,
    },
    tabButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.background,
        paddingVertical: 10,
        borderRadius: 20,
        gap: 6,
    },
    tabButtonActive: {
        backgroundColor: colors.primary,
    },
    tabText: {
        fontSize: 14,
        fontWeight: '500',
        color: colors.textSecondary,
    },
    tabTextActive: {
        color: colors.white,
    },
    tabBadge: {
        backgroundColor: colors.warning,
        borderRadius: 10,
        minWidth: 20,
        height: 20,
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 4,
    },
    tabBadgeText: {
        color: colors.white,
        fontSize: 11,
        fontWeight: '700',
    },

    // Notifications List
    listContent: {
        paddingHorizontal: 16,
        paddingBottom: 20,
    },
    notificationWrapper: {
        position: 'relative',
    },
    notificationCard: {
        backgroundColor: colors.surface,
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderLeftWidth: 4,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        zIndex: 1,
    },
    unreadCard: {
        backgroundColor: '#F8FAFF',
    },
    notificationHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    typeIcon: {
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    notificationMeta: {
        flex: 1,
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    notificationType: {
        fontSize: 12,
        fontWeight: '600',
        color: colors.textPrimary,
    },
    notificationCategory: {
        fontSize: 12,
        color: colors.textMuted,
        backgroundColor: colors.background,
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 10,
    },
    notificationTime: {
        fontSize: 11,
        color: colors.textMuted,
        marginTop: 2,
    },
    unreadDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: colors.primary,
    },
    notificationTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.textPrimary,
        marginBottom: 6,
        lineHeight: 22,
    },
    notificationMessage: {
        fontSize: 14,
        color: colors.textSecondary,
        lineHeight: 20,
        marginBottom: 12,
    },
    notificationFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    priorityBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    priorityDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    priorityText: {
        fontSize: 12,
        fontWeight: '500',
    },
    actionBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.warning + '15',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        gap: 4,
    },
    actionText: {
        fontSize: 11,
        color: colors.warning,
        fontWeight: '500',
    },

    // Swipe Actions
    swipeActions: {
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: 12,
        flexDirection: 'row',
        alignItems: 'center',
        zIndex: 0,
    },
    swipeAction: {
        width: 60,
        justifyContent: 'center',
        alignItems: 'center',
        height: '100%',
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

    // Modal
    modalContainer: {
        flex: 1,
        backgroundColor: colors.background,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 14,
        backgroundColor: colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    modalBackButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: colors.textPrimary,
    },
    modalContent: {
        flex: 1,
    },
    detailHeader: {
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    detailTypeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    detailType: {
        fontSize: 18,
        fontWeight: '600',
        color: colors.textPrimary,
        flex: 1,
    },
    detailBadges: {
        flexDirection: 'row',
        gap: 8,
    },
    categoryBadge: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
    },
    categoryBadgeText: {
        fontSize: 12,
        fontWeight: '600',
    },
    detailContent: {
        padding: 20,
    },
    detailTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: colors.textPrimary,
        marginBottom: 12,
        lineHeight: 28,
    },
    detailMessage: {
        fontSize: 16,
        color: colors.textSecondary,
        lineHeight: 24,
        marginBottom: 24,
    },
    detailMetaSection: {
        gap: 12,
        marginBottom: 24,
    },
    detailMetaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    detailMetaText: {
        fontSize: 14,
        color: colors.textMuted,
    },
    actionButtons: {
        flexDirection: 'row',
        gap: 12,
    },
    archiveButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.primary,
        paddingVertical: 14,
        borderRadius: 12,
        gap: 8,
    },
    archiveButtonText: {
        color: colors.white,
        fontWeight: '600',
    },
    deleteButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.error,
        paddingVertical: 14,
        borderRadius: 12,
        gap: 8,
    },
    deleteButtonText: {
        color: colors.white,
        fontWeight: '600',
    },
});

export default NotificationsScreen;