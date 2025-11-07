import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, Alert } from 'react-native';
import ApiService from './api.service';
import showToast from '../utils/Toast';

class NotificationServiceFallback {
    constructor() {
        this.fcmToken = null;
        this.isInitialized = false;
    }

    // ==========================================
    // INITIALIZATION (Fallback Mode)
    // ==========================================
    async initialize() {
        try {
            console.log('🔔 Initializing NotificationService in fallback mode...');
            console.warn('⚠️ Native notification modules not available. Some features will be limited.');
            
            this.isInitialized = true;
            console.log('✅ NotificationService initialized in fallback mode');
            return true;
        } catch (error) {
            console.error('❌ NotificationService fallback initialization failed:', error);
            this.isInitialized = false;
            return false;
        }
    }

    async requestPermissions() {
        console.warn('Notification permissions not available in fallback mode');
        return true; // Return true to not block the app
    }

    async getFCMToken() {
        console.warn('FCM token not available in fallback mode');
        return null;
    }

    async sendLocalNotification(title, message, data = {}) {
        console.log('Local notification (fallback):', title, message);
        // Show toast instead of native notification
        showToast(title + ': ' + message);
        return true;
    }

    async scheduleNotification(id, title, message, scheduledTime, data = {}) {
        console.log('Scheduled notification (fallback):', id, title, message, scheduledTime);
        // Log the scheduled notification
        showToast(`Scheduled: ${title}`);
        return true;
    }

    async cancelNotification(id) {
        console.log('Cancel notification (fallback):', id);
        return true;
    }

    async cancelAllNotifications() {
        console.log('Cancel all notifications (fallback)');
        return true;
    }

    // ==========================================
    // PROJECT REMINDERS (Fallback)
    // ==========================================
    async scheduleProjectReminders() {
        console.log('Project reminders would be scheduled (fallback mode)');
        showToast('Project reminders enabled (fallback mode)');
        return true;
    }

    async cancelProjectReminders() {
        console.log('Project reminders cancelled (fallback mode)');
        return true;
    }

    // ==========================================
    // ATTENDANCE REMINDERS (Fallback)
    // ==========================================
    async scheduleAttendanceReminders() {
        console.log('Attendance reminders would be scheduled (fallback mode)');
        showToast('Attendance reminders enabled (fallback mode)');
        return true;
    }

    async cancelAttendanceReminders() {
        console.log('Attendance reminders cancelled (fallback mode)');
        return true;
    }

    // ==========================================
    // WFH NOTIFICATIONS (Fallback)
    // ==========================================
    async sendWFHRequestNotification(employeeName, date, reason) {
        console.log('WFH request notification (fallback):', employeeName, date, reason);
        showToast(`WFH Request from ${employeeName} for ${date}`);
        return true;
    }

    async sendWFHApprovalNotification(isApproved, date, adminComments) {
        const status = isApproved ? 'Approved' : 'Rejected';
        console.log('WFH approval notification (fallback):', status, date);
        showToast(`WFH Request ${status} for ${date}`);
        return true;
    }

    // ==========================================
    // ADMIN NOTIFICATIONS (Fallback)
    // ==========================================
    async sendAdminBroadcast(title, message, targetType, targets) {
        console.log('Admin broadcast (fallback):', title, message, targetType, targets);
        showToast(`Admin Broadcast: ${title}`);
        return true;
    }

    // ==========================================
    // SETTINGS (Fallback)
    // ==========================================
    async updateNotificationSettings(settings) {
        try {
            await AsyncStorage.setItem('notification_settings', JSON.stringify(settings));
            console.log('Notification settings saved (fallback):', settings);
            return true;
        } catch (error) {
            console.error('Error saving notification settings:', error);
            return false;
        }
    }

    async getNotificationSettings() {
        try {
            const settings = await AsyncStorage.getItem('notification_settings');
            return settings ? JSON.parse(settings) : {
                projectReminders: true,
                attendanceReminders: true,
                adminNotifications: true,
                wfhNotifications: true
            };
        } catch (error) {
            console.error('Error loading notification settings:', error);
            return {
                projectReminders: true,
                attendanceReminders: true,
                adminNotifications: true,
                wfhNotifications: true
            };
        }
    }

    // ==========================================
    // UTILITY METHODS (Fallback)
    // ==========================================
    isAvailable() {
        return false; // Native notifications not available
    }

    getStatus() {
        return {
            initialized: this.isInitialized,
            hasPermissions: false,
            fcmToken: null,
            mode: 'fallback'
        };
    }
}

export default new NotificationServiceFallback();