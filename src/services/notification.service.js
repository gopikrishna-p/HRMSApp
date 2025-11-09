// Conditional imports to prevent crashes if modules aren't installed
let messaging = null;
let notifee = null;
let AndroidImportance = null;
let AndroidCategory = null;

try {
  messaging = require('@react-native-firebase/messaging').default;
} catch (e) {
  console.warn('Firebase messaging not available:', e.message);
}

try {
  const notifeeModule = require('@notifee/react-native');
  notifee = notifeeModule.default;
  AndroidImportance = notifeeModule.AndroidImportance;
  AndroidCategory = notifeeModule.AndroidCategory;
} catch (e) {
  console.warn('Notifee not available:', e.message);
}

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, Alert, PermissionsAndroid } from 'react-native';
import ApiService from './api.service';
import showToast from '../utils/Toast';

// Global flags to prevent multiple handler registrations
if (!global.notificationServiceInstance) {
    global.notificationServiceInstance = null;
    global.fcmHandlersRegistered = false;
}

class NotificationService {
    constructor() {
        this.fcmToken = null;
        this.unsubscribe = null;
        this.backgroundUnsubscribe = null;
        this.tokenRefreshUnsubscribe = null; // Track token refresh listener
        this.notificationHandlers = new Map();
        this.isInitialized = false;
        this.processedMessageIds = new Set(); // Track processed message IDs to prevent duplicates
        this.messageIdCleanupInterval = null;
    }

    // ==========================================
    // INITIALIZATION
    // ==========================================
    async initialize() {
        try {
            console.log('Initializing notification service...');
            
            // Prevent multiple initializations
            if (this.isInitialized) {
                console.log('⚠️ Notification service already initialized, skipping...');
                return true;
            }
            
            // Check if required modules are available
            if (!messaging || !notifee) {
                console.warn('⚠️ Notification modules not available. Install @react-native-firebase/messaging and @notifee/react-native');
                this.isInitialized = false;
                return false;
            }
            
            // Clean up old message IDs every 5 minutes to prevent memory leak
            this.messageIdCleanupInterval = setInterval(() => {
                if (this.processedMessageIds.size > 100) {
                    console.log('🧹 Cleaning up old message IDs...');
                    this.processedMessageIds.clear();
                }
            }, 5 * 60 * 1000);
            
            // Request permissions
            const hasPermission = await this.requestPermissions();
            if (!hasPermission) {
                console.log('Notification permissions denied');
                return false;
            }

            // Get FCM token
            await this.getFCMToken();
            
            // Setup notification channels (Android)
            await this.createNotificationChannels();
            
            // Setup message handlers (only once!)
            this.setupMessageHandlers();
            
            // Register notification action handlers
            this.setupNotificationHandlers();
            
            this.isInitialized = true;
            console.log('✅ Notification service initialized successfully');
            return true;
        } catch (error) {
            console.error('Failed to initialize notifications:', error);
            return false;
        }
    }

    async requestPermissions() {
        try {
            // Check if modules are available
            if (!messaging || !notifee) {
                console.warn('Notification modules not available');
                return false;
            }

            // Request Firebase messaging permission
            const authStatus = await messaging().requestPermission();
            const enabled =
                authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
                authStatus === messaging.AuthorizationStatus.PROVISIONAL;

            if (!enabled) {
                console.log('Firebase messaging permission denied');
                return false;
            }

            // Request Notifee permission (for local notifications and actions)
            const settings = await notifee.requestPermission();
            if (settings.authorizationStatus !== 1) {
                console.log('Notifee permission denied');
                return false;
            }

            // Request additional Android permissions
            if (Platform.OS === 'android') {
                await this.requestAndroidPermissions();
            }

            return true;
        } catch (error) {
            console.error('Permission request error:', error);
            return false;
        }
    }

    async requestAndroidPermissions() {
        try {
            if (Platform.Version >= 33) {
                const granted = await PermissionsAndroid.request(
                    PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
                    {
                        title: 'Notification Permission',
                        message: 'This app needs notification permission to send important updates',
                        buttonPositive: 'OK',
                        buttonNegative: 'Cancel',
                    }
                );
                return granted === PermissionsAndroid.RESULTS.GRANTED;
            }
            return true;
        } catch (error) {
            console.error('Android permission error:', error);
            return false;
        }
    }

    // ==========================================
    // FCM TOKEN MANAGEMENT
    // ==========================================
    async getFCMToken() {
        try {
            const token = await messaging().getToken();
            this.fcmToken = token;
            console.log('FCM Token:', token);
            
            // Save token to server
            await this.saveFCMTokenToServer(token);
            
            // Save token locally
            await AsyncStorage.setItem('fcm_token', token);
            
            // Clean up existing token refresh listener to prevent duplicates
            if (this.tokenRefreshUnsubscribe) {
                console.log('🧹 Cleaning up existing token refresh listener...');
                this.tokenRefreshUnsubscribe();
                this.tokenRefreshUnsubscribe = null;
            }
            
            // Listen for token refresh (only register once!)
            this.tokenRefreshUnsubscribe = messaging().onTokenRefresh(async (newToken) => {
                console.log('FCM Token refreshed:', newToken);
                this.fcmToken = newToken;
                await this.saveFCMTokenToServer(newToken);
                await AsyncStorage.setItem('fcm_token', newToken);
            });
            
            return token;
        } catch (error) {
            console.error('Failed to get FCM token:', error);
            return null;
        }
    }

    async saveFCMTokenToServer(token) {
        try {
            // Capitalize first letter to match server validation (Android/iOS not android/ios)
            const deviceType = Platform.OS === 'android' ? 'Android' : 'iOS';
            
            console.log('📤 Saving FCM token to server:', {
                token: token.substring(0, 20) + '...',
                device_type: deviceType,
                user: 'current_user'
            });
            
            const response = await ApiService.saveFcmToken({ 
                token, 
                device_type: deviceType 
            });
            
            if (response.success) {
                console.log('✅ FCM token saved to server successfully');
            } else {
                console.error('❌ Failed to save FCM token:', response.message);
            }
            
            return response;
        } catch (error) {
            console.error('❌ Failed to save FCM token to server:', error);
            throw error;
        }
    }

    // ==========================================
    // NOTIFICATION CHANNELS (ANDROID)
    // ==========================================
    async createNotificationChannels() {
        if (Platform.OS !== 'android') return;

        try {
            // Project reminder channel
            await notifee.createChannel({
                id: 'project_reminders',
                name: 'Project Reminders',
                description: 'Hourly project log entry reminders',
                importance: AndroidImportance.HIGH,
                sound: 'default',
                vibration: true,
                vibrationPattern: [300, 500],
            });

            // Attendance reminder channel
            await notifee.createChannel({
                id: 'attendance_reminders',
                name: 'Attendance Reminders',
                description: 'Check-in and check-out reminders',
                importance: AndroidImportance.HIGH,
                sound: 'default',
                vibration: true,
                vibrationPattern: [300, 500],
            });

            // Admin notifications channel
            await notifee.createChannel({
                id: 'admin_notifications',
                name: 'Admin Notifications',
                description: 'Important notifications from admin',
                importance: AndroidImportance.HIGH,
                sound: 'default',
                vibration: true,
                vibrationPattern: [300, 500],
            });

            // WFH requests channel
            await notifee.createChannel({
                id: 'wfh_requests',
                name: 'WFH Requests',
                description: 'Work from home approval requests',
                importance: AndroidImportance.HIGH,
                sound: 'default',
                vibration: true,
                vibrationPattern: [300, 500],
            });

            console.log('✅ Notification channels created successfully');
        } catch (error) {
            console.error('❌ Failed to create notification channels:', error);
        }
    }

    // ==========================================
    // MESSAGE HANDLERS
    // ==========================================
    setupMessageHandlers() {
        console.log('📨 Setting up message handlers...');
        
        // CRITICAL: Only register handlers ONCE globally, never again
        if (global.fcmHandlersRegistered) {
            console.log('⚠️ FCM handlers already registered globally, skipping...');
            return;
        }
        
        // Clean up existing handlers to prevent duplicates
        if (this.unsubscribe) {
            console.log('🧹 Cleaning up existing message handler...');
            this.unsubscribe();
            this.unsubscribe = null;
        }
        
        // Handle foreground messages
        this.unsubscribe = messaging().onMessage(async (remoteMessage) => {
            await this.handleForegroundMessage(remoteMessage);
        });

        // Handle notification opened app (when app is in background)
        messaging().onNotificationOpenedApp((remoteMessage) => {
            console.log('📲 Notification opened app (background):', remoteMessage);
            this.handleNotificationPress(remoteMessage);
        });

        // Check if app was opened from notification (when app was quit/killed)
        messaging()
            .getInitialNotification()
            .then((remoteMessage) => {
                if (remoteMessage) {
                    console.log('📲 App opened from notification (quit state):', remoteMessage);
                    this.handleNotificationPress(remoteMessage);
                }
            });
        
        // Mark as registered globally
        global.fcmHandlersRegistered = true;
        console.log('✅ Message handlers setup complete and marked as registered globally');
    }

    async handleForegroundMessage(remoteMessage) {
        try {
            const { notification, data, messageId } = remoteMessage;
            
            // Check if we've already processed this message
            if (messageId && this.processedMessageIds.has(messageId)) {
                console.log('⏭️  Skipping duplicate message:', messageId);
                return;
            }
            
            // Mark message as processed FIRST
            if (messageId) {
                this.processedMessageIds.add(messageId);
                console.log('📬 New message received (ID:', messageId, ')');
            }
            
            console.log('📢 Processing foreground notification:');
            console.log('   Title:', notification?.title);
            console.log('   Body:', notification?.body);
            console.log('   Data:', data);
            
            // Determine channel based on notification type or data
            let channelId = 'admin_notifications';
            if (data?.type === 'attendance_reminder' || notification?.title?.includes('Check-in') || notification?.title?.includes('Check-out')) {
                channelId = 'attendance_reminders';
            } else if (data?.type === 'project_reminder' || notification?.title?.includes('Project')) {
                channelId = 'project_reminders';
            } else if (data?.type === 'wfh_request' || notification?.title?.includes('WFH')) {
                channelId = 'wfh_requests';
            }
            
            console.log('   Using channel:', channelId);
            
            // Show local notification with actions
            await this.showLocalNotification({
                title: notification?.title || 'New Notification',
                body: notification?.body || '',
                data: data || {},
                channelId: channelId,
            });
            
            console.log('✅ Foreground notification displayed');
        } catch (error) {
            console.error('❌ Error handling foreground message:', error);
        }
    }

    async handleBackgroundMessage(remoteMessage) {
        try {
            console.log('🔔 Background message received:', remoteMessage);
            const { notification, data } = remoteMessage;
            
            // For background messages, we can just log
            // The system will handle displaying the notification
            console.log('   Title:', notification?.title);
            console.log('   Body:', notification?.body);
            console.log('✅ Background message processed');
        } catch (error) {
            console.error('❌ Error handling background message:', error);
        }
    }

    handleNotificationPress(remoteMessage) {
        try {
            const { data } = remoteMessage;
            
            if (data?.action) {
                this.executeNotificationAction(data.action, data);
            }
        } catch (error) {
            console.error('Error handling notification press:', error);
        }
    }

    // ==========================================
    // LOCAL NOTIFICATIONS
    // ==========================================
    async showLocalNotification({ title, body, data = {}, channelId = 'admin_notifications' }) {
        try {
            console.log('📢 Showing local notification:');
            console.log('   Title:', title);
            console.log('   Body:', body);
            console.log('   Channel:', channelId);
            console.log('   Data:', data);
            
            const actions = this.getNotificationActions(data.type);
            
            const notificationId = await notifee.displayNotification({
                title,
                body,
                data,
                android: {
                    channelId,
                    importance: AndroidImportance.HIGH,
                    category: AndroidCategory.MESSAGE,
                    smallIcon: 'ic_launcher', // Default app icon
                    color: '#4F46E5', // Indigo color
                    actions,
                    pressAction: {
                        id: 'default',
                        launchActivity: 'default',
                    },
                    // Add sound and vibration
                    sound: 'default',
                    vibrationPattern: [300, 500],
                    // Show notification on lockscreen
                    visibility: 1, // PUBLIC
                    // Priority
                    priority: 'high',
                },
                ios: {
                    categoryId: data.type || 'general',
                    sound: 'default',
                },
            });
            
            console.log('✅ Local notification displayed with ID:', notificationId);
            return notificationId;
        } catch (error) {
            console.error('❌ Error showing local notification:', error);
            throw error;
        }
    }

    getNotificationActions(type) {
        switch (type) {
            case 'wfh_request':
                return [
                    {
                        title: 'Approve',
                        pressAction: { id: 'approve_wfh' },
                        icon: 'ic_check',
                    },
                    {
                        title: 'Reject',
                        pressAction: { id: 'reject_wfh' },
                        icon: 'ic_close',
                    },
                ];
            case 'project_reminder':
                return [
                    {
                        title: 'Add Log',
                        pressAction: { id: 'add_project_log' },
                        icon: 'ic_add',
                    },
                    {
                        title: 'Dismiss',
                        pressAction: { id: 'dismiss' },
                        icon: 'ic_close',
                    },
                ];
            case 'attendance_reminder':
                return [
                    {
                        title: 'Check In/Out',
                        pressAction: { id: 'check_attendance' },
                        icon: 'ic_access_time',
                    },
                    {
                        title: 'Dismiss',
                        pressAction: { id: 'dismiss' },
                        icon: 'ic_close',
                    },
                ];
            default:
                return [];
        }
    }

    // ==========================================
    // NOTIFICATION ACTION HANDLERS
    // ==========================================
    setupNotificationHandlers() {
        // Handle notification actions
        notifee.onForegroundEvent(({ type, detail }) => {
            switch (type) {
                case 1: // PRESS
                    this.handleNotificationAction(detail.pressAction?.id, detail.notification?.data);
                    break;
                case 3: // ACTION_PRESS
                    this.handleNotificationAction(detail.pressAction?.id, detail.notification?.data);
                    break;
            }
        });

        notifee.onBackgroundEvent(async ({ type, detail }) => {
            if (type === 3) { // ACTION_PRESS
                await this.handleNotificationAction(detail.pressAction?.id, detail.notification?.data);
            }
        });
    }

    async handleNotificationAction(actionId, data) {
        try {
            console.log('Notification action:', actionId, data);
            
            switch (actionId) {
                case 'approve_wfh':
                    await this.approveWFHRequest(data);
                    break;
                case 'reject_wfh':
                    await this.rejectWFHRequest(data);
                    break;
                case 'add_project_log':
                    this.navigateToProjectLog(data);
                    break;
                case 'check_attendance':
                    this.navigateToAttendance(data);
                    break;
                case 'dismiss':
                    // Just dismiss the notification
                    break;
                default:
                    console.log('Unknown action:', actionId);
            }
        } catch (error) {
            console.error('Error handling notification action:', error);
        }
    }

    async approveWFHRequest(data) {
        try {
            const response = await ApiService.approveWFHRequest(data.request_id);
            if (response.success) {
                showToast({
                    type: 'success',
                    text1: 'WFH Approved',
                    text2: 'Work from home request has been approved',
                });
            }
        } catch (error) {
            console.error('Error approving WFH request:', error);
            showToast({
                type: 'error',
                text1: 'Error',
                text2: 'Failed to approve WFH request',
            });
        }
    }

    async rejectWFHRequest(data) {
        try {
            const response = await ApiService.rejectWFHRequest(data.request_id);
            if (response.success) {
                showToast({
                    type: 'success',
                    text1: 'WFH Rejected',
                    text2: 'Work from home request has been rejected',
                });
            }
        } catch (error) {
            console.error('Error rejecting WFH request:', error);
            showToast({
                type: 'error',
                text1: 'Error',
                text2: 'Failed to reject WFH request',
            });
        }
    }

    navigateToProjectLog(data) {
        // This will be handled by the navigation service
        console.log('Navigate to project log:', data);
    }

    navigateToAttendance(data) {
        // This will be handled by the navigation service
        console.log('Navigate to attendance:', data);
    }

    // ==========================================
    // NOTIFICATION SCHEDULING
    // ==========================================
    async scheduleProjectReminders() {
        try {
            // Cancel existing reminders
            await this.cancelScheduledNotifications('project_reminder');
            
            // Schedule hourly reminders between 10 AM and 7 PM
            const workingHours = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19]; // 10 AM to 7 PM
            
            for (const hour of workingHours) {
                await this.scheduleRepeatingNotification({
                    id: `project_reminder_${hour}`,
                    title: 'Project Log Reminder',
                    body: 'Don\'t forget to log your project activities for this hour!',
                    data: { type: 'project_reminder', hour },
                    channelId: 'project_reminders',
                    schedule: {
                        hour,
                        minute: 0,
                        repeatFrequency: 'daily',
                        weekdays: [1, 2, 3, 4, 5], // Monday to Friday
                    },
                });
            }
            
            console.log('Project reminders scheduled');
        } catch (error) {
            console.error('Error scheduling project reminders:', error);
        }
    }

    async scheduleAttendanceReminders() {
        try {
            // Cancel existing reminders
            await this.cancelScheduledNotifications('attendance_reminder');
            
            // Morning check-in reminder (9:30 AM)
            await this.scheduleRepeatingNotification({
                id: 'checkin_reminder',
                title: 'Check-in Reminder',
                body: 'Good morning! Don\'t forget to check in when you arrive at the office.',
                data: { type: 'attendance_reminder', action: 'checkin' },
                channelId: 'attendance_reminders',
                schedule: {
                    hour: 9,
                    minute: 30,
                    repeatFrequency: 'daily',
                    weekdays: [1, 2, 3, 4, 5], // Monday to Friday
                },
            });
            
            // Evening check-out reminder (6:30 PM)
            await this.scheduleRepeatingNotification({
                id: 'checkout_reminder',
                title: 'Check-out Reminder',
                body: 'Don\'t forget to check out before leaving the office!',
                data: { type: 'attendance_reminder', action: 'checkout' },
                channelId: 'attendance_reminders',
                schedule: {
                    hour: 18,
                    minute: 30,
                    repeatFrequency: 'daily',
                    weekdays: [1, 2, 3, 4, 5], // Monday to Friday
                },
            });
            
            console.log('Attendance reminders scheduled');
        } catch (error) {
            console.error('Error scheduling attendance reminders:', error);
        }
    }

    async scheduleRepeatingNotification({ id, title, body, data, channelId, schedule }) {
        try {
            const trigger = {
                type: 1, // TimestampTrigger
                timestamp: this.getNextScheduleTime(schedule),
                repeatFrequency: 1, // DAILY
            };

            await notifee.createTriggerNotification(
                {
                    id,
                    title,
                    body,
                    data,
                    android: {
                        channelId,
                        importance: AndroidImportance.HIGH,
                    },
                },
                trigger
            );
        } catch (error) {
            console.error('Error scheduling notification:', error);
        }
    }

    getNextScheduleTime({ hour, minute, weekdays }) {
        const now = new Date();
        const scheduleTime = new Date();
        scheduleTime.setHours(hour, minute, 0, 0);
        
        // If the time has passed today, schedule for tomorrow
        if (scheduleTime <= now) {
            scheduleTime.setDate(scheduleTime.getDate() + 1);
        }
        
        // Find next working day
        while (!weekdays.includes(scheduleTime.getDay())) {
            scheduleTime.setDate(scheduleTime.getDate() + 1);
        }
        
        return scheduleTime.getTime();
    }

    async cancelScheduledNotifications(type) {
        try {
            const notifications = await notifee.getTriggerNotifications();
            
            for (const notification of notifications) {
                if (notification.notification.data?.type === type) {
                    await notifee.cancelNotification(notification.notification.id);
                }
            }
        } catch (error) {
            console.error('Error canceling notifications:', error);
        }
    }

    // ==========================================
    // API NOTIFICATIONS
    // ==========================================
    async sendAdminNotification({ title, body, target_type, target_ids, department_id }) {
        try {
            const response = await ApiService.sendAdminNotification({
                title,
                body,
                target_type, // 'all', 'department', 'specific'
                target_ids,
                department_id,
            });
            
            return response;
        } catch (error) {
            console.error('Error sending admin notification:', error);
            throw error;
        }
    }

    async sendWFHNotification(requestData) {
        try {
            if (!this.isInitialized) {
                console.warn('NotificationService not initialized');
                return false;
            }

            const title = 'WFH Request Submitted';
            const body = `Your WFH request from ${requestData.from_date} to ${requestData.to_date} has been submitted for approval`;
            
            await this.showLocalNotification({
                title,
                body,
                data: {
                    type: 'wfh_request',
                    request_id: requestData.request_id,
                    action: 'view_request'
                },
                channelId: 'wfh_requests'
            });

            // Also send to backend for admin notification
            try {
                const response = await ApiService.sendWFHNotification(requestData);
                return response;
            } catch (error) {
                console.warn('Failed to send backend WFH notification:', error);
                return false;
            }
        } catch (error) {
            console.error('Error sending WFH notification:', error);
            return false;
        }
    }

    async sendWFHApprovalNotification(isApproved, date, adminComments = '') {
        try {
            if (!this.isInitialized) {
                console.warn('NotificationService not initialized');
                return false;
            }

            const title = isApproved ? 'WFH Request Approved ✅' : 'WFH Request Rejected ❌';
            const body = isApproved 
                ? `Your WFH request for ${date} has been approved!`
                : `Your WFH request for ${date} has been rejected. ${adminComments}`;
            
            await this.showLocalNotification({
                title,
                body,
                data: {
                    type: 'wfh_response',
                    approved: isApproved,
                    date: date,
                    action: 'view_status'
                },
                channelId: 'wfh_requests'
            });

            showToast({
                type: isApproved ? 'success' : 'error',
                text1: title,
                text2: body,
            });

            return true;
        } catch (error) {
            console.error('Error sending WFH approval notification:', error);
            return false;
        }
    }

    async sendAdminWFHNotification(employeeName, fromDate, toDate, requestId) {
        try {
            if (!this.isInitialized) {
                console.warn('NotificationService not initialized');
                return false;
            }

            const title = 'New WFH Request 📋';
            const body = `${employeeName} requested WFH from ${fromDate} to ${toDate}`;
            
            await this.showLocalNotification({
                title,
                body,
                data: {
                    type: 'admin_wfh_request',
                    employee_name: employeeName,
                    from_date: fromDate,
                    to_date: toDate,
                    request_id: requestId,
                    action: 'review_request'
                },
                channelId: 'wfh_requests'
            });

            return true;
        } catch (error) {
            console.error('Error sending admin WFH notification:', error);
            return false;
        }
    }

    // ==========================================
    // LEAVE APPLICATION NOTIFICATIONS
    // ==========================================
    async sendLeaveNotification(applicationData) {
        try {
            if (!this.isInitialized) {
                console.warn('NotificationService not initialized');
                return false;
            }

            const title = 'Leave Application Submitted';
            const body = `Your ${applicationData.leave_type} leave application from ${applicationData.from_date} to ${applicationData.to_date} has been submitted for approval`;
            
            await this.showLocalNotification({
                title,
                body,
                data: {
                    type: 'leave_application',
                    application_id: applicationData.application_id,
                    action: 'view_application'
                },
                channelId: 'admin_notifications'
            });

            // Also send to backend for admin notification
            try {
                const response = await ApiService.sendLeaveNotification(applicationData);
                return response;
            } catch (error) {
                console.warn('Failed to send backend leave notification:', error);
                return false;
            }
        } catch (error) {
            console.error('Error sending leave notification:', error);
            return false;
        }
    }

    async sendLeaveApprovalNotification(data) {
        try {
            if (!this.isInitialized) {
                console.warn('NotificationService not initialized');
                return false;
            }

            const isApproved = data.action === 'approve';
            const title = isApproved ? 'Leave Application Approved ✅' : 'Leave Application Rejected ❌';
            const body = isApproved 
                ? `Your leave application has been approved!`
                : `Your leave application has been rejected. ${data.rejection_reason || ''}`;
            
            await this.showLocalNotification({
                title,
                body,
                data: {
                    type: 'leave_response',
                    approved: isApproved,
                    application_id: data.application_id,
                    action: 'view_status'
                },
                channelId: 'admin_notifications'
            });

            showToast({
                type: isApproved ? 'success' : 'error',
                text1: title,
                text2: body,
            });

            return true;
        } catch (error) {
            console.error('Error sending leave approval notification:', error);
            return false;
        }
    }

    async sendAdminLeaveNotification(applicationData) {
        try {
            if (!this.isInitialized) {
                console.warn('NotificationService not initialized');
                return false;
            }

            const title = 'New Leave Application';
            const body = `${applicationData.employee_name} has submitted a ${applicationData.leave_type} leave application`;
            
            await this.showLocalNotification({
                title,
                body,
                data: {
                    type: 'admin_leave_notification',
                    application_id: applicationData.application_id,
                    action: 'review_application'
                },
                channelId: 'admin_notifications'
            });

            return true;
        } catch (error) {
            console.error('Error sending admin leave notification:', error);
            return false;
        }
    }

    // ==========================================
    // UTILITY METHODS
    // ==========================================
    async enableNotifications() {
        try {
            await this.scheduleProjectReminders();
            await this.scheduleAttendanceReminders();
            await AsyncStorage.setItem('notifications_enabled', 'true');
            
            showToast({
                type: 'success',
                text1: 'Notifications Enabled',
                text2: 'You will receive reminders and updates',
            });
        } catch (error) {
            console.error('Error enabling notifications:', error);
            showToast({
                type: 'error',
                text1: 'Error',
                text2: 'Failed to enable notifications',
            });
        }
    }

    async disableNotifications() {
        try {
            await notifee.cancelAllNotifications();
            await AsyncStorage.setItem('notifications_enabled', 'false');
            
            showToast({
                type: 'success',
                text1: 'Notifications Disabled',
                text2: 'You will not receive reminders',
            });
        } catch (error) {
            console.error('Error disabling notifications:', error);
        }
    }

    async isNotificationsEnabled() {
        try {
            const enabled = await AsyncStorage.getItem('notifications_enabled');
            return enabled === 'true';
        } catch (error) {
            return false;
        }
    }

    executeNotificationAction(action, data) {
        const handler = this.notificationHandlers.get(action);
        if (handler) {
            handler(data);
        }
    }

    registerNotificationHandler(action, handler) {
        this.notificationHandlers.set(action, handler);
    }

    cleanup() {
        if (this.unsubscribe) {
            this.unsubscribe();
        }
        if (this.backgroundUnsubscribe) {
            this.backgroundUnsubscribe();
        }
        if (this.tokenRefreshUnsubscribe) {
            this.tokenRefreshUnsubscribe();
        }
        if (this.messageIdCleanupInterval) {
            clearInterval(this.messageIdCleanupInterval);
        }
        this.processedMessageIds.clear();
        this.isInitialized = false; // Allow re-initialization after cleanup
        
        // Reset global handler flag if we're truly cleaning up
        global.fcmHandlersRegistered = false;
    }
}

// Use global instance to survive hot reloads
if (!global.notificationServiceInstance) {
    global.notificationServiceInstance = new NotificationService();
}

export default global.notificationServiceInstance;