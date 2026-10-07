// src/screens/employee/NotificationsScreen.js
//
// The employee's notification inbox, newest first and grouped by day (Today, Yesterday) and
// then by month. Unread items carry an accent dot and a bolder title; opening one marks it
// read. "Mark all read" sits in the header; archive and delete are in the detail sheet.
import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import ApiService, { extractFrappeData } from '../../services/api.service';
import { formatTimeOfDay } from '../../utils/dateFormat';
import showToast from '../../utils/Toast';
import {
    Screen,
    Group,
    Row,
    Segmented,
    Tag,
    Sheet,
    Button,
    EmptyState,
    Loading,
    color,
    space,
    type,
    formatLongDate,
} from '../../components/ds';

// ------------------------------------------------------------------ helpers
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// "YYYY-MM-DD HH:MM:SS.ffffff" from the server, read as local wall-clock time
// (Hermes cannot parse the space-separated form with new Date()).
const parseDateTime = (value) => {
    const m = String(value || '').match(/(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] || 0), Number(m[5] || 0)) : null;
};

const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

// Today / Yesterday / "October 2026", in the server's newest-first order
const groupByDate = (items) => {
    const now = new Date();
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const groups = [];
    const byKey = {};
    items.forEach((item) => {
        const d = parseDateTime(item.creation);
        let key = 'earlier';
        let title = 'Earlier';
        if (d && sameDay(d, now)) {
            key = 'today';
            title = 'Today';
        } else if (d && sameDay(d, yesterday)) {
            key = 'yesterday';
            title = 'Yesterday';
        } else if (d) {
            key = `${d.getFullYear()}-${d.getMonth()}`;
            title = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
        }
        if (!byKey[key]) {
            byKey[key] = { key, title, recent: key === 'today' || key === 'yesterday', items: [] };
            groups.push(byKey[key]);
        }
        byKey[key].items.push(item);
    });
    return groups;
};

// "09:48 AM" for today and yesterday, "5 Oct, 09:48 AM" for older items
const whenLabel = (item, recent) => {
    const d = parseDateTime(item.creation);
    const time = formatTimeOfDay(item.creation);
    if (!d) {
        return item.time_ago || '';
    }
    return recent ? time : `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}, ${time}`;
};

// get_notification_stats returns total_count / unread_count / urgent_count
const countOf = (stats, key) => Number(stats?.[key] ?? stats?.[`${key}_count`]) || 0;

const NotificationsScreen = ({ navigation }) => {
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [stats, setStats] = useState({ total: 0, unread: 0, urgent: 0 });
    const [detailModalVisible, setDetailModalVisible] = useState(false);
    const [selectedNotification, setSelectedNotification] = useState(null);
    const [selectedTab, setSelectedTab] = useState('All'); // All, Unread, Urgent
    // Settings are fetched as before; this screen has no settings controls yet.
    const [, setSettings] = useState({});

    const tabs = [
        { key: 'All', label: 'All' },
        { key: 'Unread', label: 'Unread' },
        { key: 'Urgent', label: 'Urgent' }
    ];

    useEffect(() => {
        fetchNotifications();
        fetchStats();
        fetchSettings();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch whenever the tab changes
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

            // Use helper to extract data
            const extractedData = extractFrappeData(response, {});

            // Handle different response structures
            let notificationsList = [];
            if (extractedData.status === 'success' && extractedData.notifications) {
                notificationsList = extractedData.notifications;
            } else if (Array.isArray(extractedData)) {
                notificationsList = extractedData;
            } else if (extractedData.notifications) {
                notificationsList = extractedData.notifications;
            }

            // Filter for urgent if needed
            if (selectedTab === 'Urgent') {
                notificationsList = notificationsList.filter(n => n.priority === 'High');
            }

            setNotifications(notificationsList);
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
            const extractedData = extractFrappeData(response, {});
            // Handle nested structure
            const statsData = extractedData.stats || (extractedData.status === 'success' ? extractedData.stats : {});
            setStats(statsData || { total: 0, unread: 0, urgent: 0 });
        } catch (error) {
            console.error('Error fetching notification stats:', error);
        }
    };

    const fetchSettings = async () => {
        try {
            const response = await ApiService.getNotificationSettings();
            const extractedData = extractFrappeData(response, {});
            // Handle nested structure
            const settingsData = extractedData.settings || (extractedData.status === 'success' ? extractedData.settings : {});
            setSettings(settingsData || {});
        } catch (error) {
            console.error('Error fetching notification settings:', error);
        }
    };

    const onRefresh = () => {
        setRefreshing(true);
        fetchNotifications();
        fetchStats();
    };

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
                showToast({ type: 'success', text1: 'All notifications marked as read' });
            }
        } catch (error) {
            console.error('Error marking all as read:', error);
            showToast({ type: 'error', text1: 'Could not mark all as read', text2: error.message });
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
                showToast({ type: 'success', text1: 'Notification deleted' });
            }
        } catch (error) {
            console.error('Error deleting notification:', error);
            showToast({ type: 'error', text1: 'Not deleted', text2: error.message });
        }
    };

    // ------------------------------------------------------------------ header
    const unreadCount = countOf(stats, 'unread');
    const urgentCount = countOf(stats, 'urgent');

    // the header button calls the latest markAllAsRead without re-registering on every render
    const markAllRef = useRef(markAllAsRead);
    markAllRef.current = markAllAsRead;

    useLayoutEffect(() => {
        navigation.setOptions({
            // eslint-disable-next-line react/no-unstable-nested-components -- React Navigation header render prop
            headerRight: () => (unreadCount > 0 ? (
                <Pressable onPress={() => markAllRef.current()} hitSlop={10} style={styles.headerAction}>
                    <Text style={styles.headerActionText}>Mark all read</Text>
                </Pressable>
            ) : null),
        });
    }, [navigation, unreadCount]);

    // ------------------------------------------------------------------ detail actions
    const closeDetail = () => setDetailModalVisible(false);

    const onArchive = () => {
        archiveNotification(selectedNotification.name);
        setDetailModalVisible(false);
    };

    const onDelete = () => {
        Alert.alert(
            'Delete notification',
            'Delete this notification permanently?',
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
    };

    // ------------------------------------------------------------------ list
    const renderRow = (item, recent) => {
        const unread = !item.is_read;
        const when = whenLabel(item, recent);
        const urgent = item.priority === 'High';
        const actionRequired = item.action_required === 1;
        return (
            <Row
                key={item.name}
                left={(
                    <View style={styles.dotSlot}>
                        {unread ? <View style={styles.dot} /> : null}
                    </View>
                )}
                title={<Text style={unread ? styles.unreadTitle : styles.readTitle}>{item.title}</Text>}
                titleLines={2}
                subtitle={item.message}
                subtitleLines={2}
                meta={when || urgent || actionRequired ? (
                    <View style={styles.metaLine}>
                        {when ? <Text style={styles.time}>{when}</Text> : null}
                        {urgent ? <Tag label="Urgent" tone="danger" /> : null}
                        {actionRequired ? <Tag label="Action required" tone="warning" /> : null}
                    </View>
                ) : null}
                chevron={false}
                onPress={() => handleNotificationPress(item)}
            />
        );
    };

    const renderEmpty = () => {
        if (selectedTab === 'Unread') {
            return <EmptyState icon="check-circle" title="All caught up" message="No unread notifications." />;
        }
        if (selectedTab === 'Urgent') {
            return <EmptyState icon="bell" title="No urgent notifications" />;
        }
        return <EmptyState icon="bell" title="No notifications" message="New notifications will appear here." />;
    };

    // ------------------------------------------------------------------ detail sheet
    const detail = selectedNotification;
    const detailDate = detail ? parseDateTime(detail.creation) : null;
    const detailWhen = detailDate
        ? `${formatLongDate(detailDate)}${detailDate.getFullYear() !== new Date().getFullYear() ? ` ${detailDate.getFullYear()}` : ''}  ·  ${formatTimeOfDay(detail.creation)}`
        : detail?.time_ago;

    return (
        <View style={styles.flex}>
            <View style={styles.toolbar}>
                <Segmented
                    value={selectedTab}
                    onChange={setSelectedTab}
                    options={tabs.map((tab) => ({
                        value: tab.key,
                        label: tab.label,
                        count: tab.key === 'Unread' && unreadCount > 0
                            ? unreadCount
                            : tab.key === 'Urgent' && urgentCount > 0 ? urgentCount : undefined,
                    }))}
                />
            </View>

            <Screen refreshing={refreshing} onRefresh={onRefresh}>
                {loading && notifications.length === 0 ? (
                    <Loading />
                ) : notifications.length === 0 ? (
                    renderEmpty()
                ) : (
                    groupByDate(notifications).map((group) => (
                        <Group key={group.key} title={group.title}>
                            {group.items.map((item) => renderRow(item, group.recent))}
                        </Group>
                    ))
                )}
            </Screen>

            <Sheet
                visible={detailModalVisible}
                title={detail?.title}
                subtitle={detailWhen || undefined}
                onClose={closeDetail}
                footer={detail ? (
                    <>
                        <Button title="Archive" variant="secondary" onPress={onArchive} style={styles.flex} />
                        <Button title="Delete" variant="danger" onPress={onDelete} style={styles.flex} />
                    </>
                ) : null}
            >
                {detail ? (
                    <>
                        {detail.message ? <Text style={styles.message}>{detail.message}</Text> : null}
                        <Group>
                            {detail.category ? <Row title="Category" value={detail.category} /> : null}
                            {detail.notification_type ? <Row title="Type" value={detail.notification_type} /> : null}
                            {detail.priority ? (
                                <Row title="Priority" value={detail.priority} valueTone={detail.priority === 'High' ? 'danger' : undefined} />
                            ) : null}
                            {detail.action_required === 1 ? <Row title="Action required" value="Yes" /> : null}
                        </Group>
                    </>
                ) : null}
            </Sheet>
        </View>
    );
};

const styles = StyleSheet.create({
    flex: { flex: 1 },
    toolbar: {
        backgroundColor: color.surface,
        paddingHorizontal: space.lg,
        paddingVertical: space.md,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: color.border,
    },
    headerAction: { paddingHorizontal: 4, paddingVertical: 4 },
    headerActionText: { fontSize: 16, fontWeight: '600', color: color.accent },

    dotSlot: { width: 8, marginRight: space.md, alignSelf: 'flex-start', paddingTop: 7 },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.accent },
    unreadTitle: { fontWeight: '600' },
    readTitle: { fontWeight: '400' },
    metaLine: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
    time: { ...type.caption },

    message: { ...type.body, lineHeight: 22, marginBottom: space.lg },
});

export default NotificationsScreen;
