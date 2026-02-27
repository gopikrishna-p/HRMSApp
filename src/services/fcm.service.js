import messaging from '@react-native-firebase/messaging';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {Platform, Alert, PermissionsAndroid} from 'react-native';
import PushNotification from 'react-native-push-notification';
import ApiService from './api.service';

class FCMService {
  constructor() {
    this.fcmToken = null;
    this.unsubscribeTokenRefreshListener = null;
    this.unsubscribeMessageListener = null;
    this.unsubscribeNotificationOpenListener = null;
    this.unsubscribeBackgroundHandler = null;
    this.initialized = false;
    
    // Defer initialization to allow native modules to be ready
    // Use setImmediate to run after current execution context
    setImmediate(() => {
      this.initializeFCM();
    });
  }

  /**
   * Safely get the messaging instance with validation
   * @returns {object|null} Firebase messaging instance or null if not ready
   */
  getMessagingInstance() {
    try {
      if (!messaging) {
        return null;
      }
      const instance = messaging();
      // Verify it's a valid messaging instance with expected methods
      if (!instance || typeof instance !== 'object') {
        return null;
      }
      return instance;
    } catch (error) {
      console.warn('Error getting messaging instance:', error.message);
      return null;
    }
  }

  async initializeFCM() {
    try {
      // Prevent double initialization
      if (this.initialized) {
        console.log('FCM already initialized');
        return;
      }

      // Verify messaging instance is available
      const messagingInstance = this.getMessagingInstance();
      if (!messagingInstance) {
        console.warn('Firebase messaging instance not ready');
        return;
      }

      // Request permission
      const permission = await this.requestPermission();
      if (!permission) {
        console.log('FCM permission denied');
        return;
      }

      // Initialize local notifications
      this.initializeLocalNotifications();
      
      // Get FCM token
      await this.getFCMToken();
      
      // Set up message handlers
      this.setupMessageHandlers();
      
      // Set up token refresh listener
      this.setupTokenRefreshListener();
      
      this.initialized = true;
      console.log('✅ FCM initialized successfully');
    } catch (error) {
      console.error('FCM initialization error:', error);
    }
  }

  async requestPermission() {
    try {
      if (Platform.OS === 'android') {
        if (Platform.Version >= 33) {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
          );
          if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
            console.log('Notification permission denied');
            return false;
          }
        }
      }

      // Use namespace API - still works, just shows deprecation warning
      const messagingInstance = this.getMessagingInstance();
      if (!messagingInstance) {
        console.warn('Messaging instance not available for permission request');
        return false;
      }
      const authStatus = await messagingInstance.requestPermission();
      const enabled =
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL;

      if (enabled) {
        console.log('FCM authorization status:', authStatus);
        return true;
      } else {
        console.log('FCM permission denied');
        return false;
      }
    } catch (error) {
      console.error('Permission request error:', error);
      return false;
    }
  }

  initializeLocalNotifications() {
    PushNotification.configure({
      // Called when Token is generated (iOS and Android)
      onRegister: function (token) {
        console.log('Local notification token:', token);
      },

      // Called when a remote is received or opened/clicked
      onNotification: function (notification) {
        console.log('Local notification received:', notification);
        
        // Handle notification tap
        if (notification.userInteraction) {
          // User tapped on notification
          // Navigate to appropriate screen
        }
      },

      // Should the initial notification be popped automatically
      popInitialNotification: true,

      // Requested permissions are granted or rejected
      requestPermissions: Platform.OS === 'ios',
    });

    // Create notification channel for Android
    if (Platform.OS === 'android') {
      PushNotification.createChannel(
        {
          channelId: 'hrms-notifications',
          channelName: 'HRMS Notifications',
          channelDescription: 'Notifications from HRMS app',
          playSound: true,
          soundName: 'default',
          importance: 4,
          vibrate: true,
        },
        (created) => console.log(`Notification channel created: ${created}`)
      );
    }
  }

  async getFCMToken() {
    try {
      // Get stored token
      const storedToken = await AsyncStorage.getItem('fcm_token');
      
      // Get current token - use namespace API
      const messagingInstance = this.getMessagingInstance();
      if (!messagingInstance) {
        console.warn('Messaging instance not available for token retrieval');
        return null;
      }
      const currentToken = await messagingInstance.getToken();
      
      if (currentToken) {
        this.fcmToken = currentToken;
        
        // If token changed, update backend
        if (storedToken !== currentToken) {
          await this.registerTokenWithBackend(currentToken);
          await AsyncStorage.setItem('fcm_token', currentToken);
        }
        
        console.log('FCM Token:', currentToken);
      } else {
        console.log('Failed to get FCM token');
      }
    } catch (error) {
      console.error('Get FCM token error:', error);
    }
  }

  async registerTokenWithBackend(token) {
    try {
      const deviceId = await this.getDeviceId();
      
      const response = await ApiService.registerFCMToken({
        fcm_token: token,
        device_platform: Platform.OS === 'ios' ? 'iOS' : 'Android',
        device_id: deviceId
      });
      
      if (response.success) {
        console.log('FCM token registered with backend');
      } else {
        console.error('Failed to register FCM token:', response.message);
      }
    } catch (error) {
      console.error('Register FCM token error:', error);
    }
  }

  async unregisterToken() {
    try {
      // Unregister from backend
      await ApiService.unregisterFCMToken();
      
      // Clear local storage
      await AsyncStorage.removeItem('fcm_token');
      
      // Delete FCM token - use namespace API
      const messagingInstance = this.getMessagingInstance();
      if (messagingInstance) {
        await messagingInstance.deleteToken();
      }
      
      console.log('FCM token unregistered');
    } catch (error) {
      console.error('Unregister FCM token error:', error);
    }
  }

  setupMessageHandlers() {
    try {
      // Get messaging instance and verify it's valid
      const messagingInstance = this.getMessagingInstance();
      if (!messagingInstance) {
        console.warn('Messaging instance not available for handlers');
        return;
      }

      // Background/Quit state messages - use namespace API
      messagingInstance.setBackgroundMessageHandler(async remoteMessage => {
        console.log('Message handled in the background!', remoteMessage);
        this.handleBackgroundMessage(remoteMessage);
      });

      // Foreground messages - use namespace API
      this.unsubscribeMessageListener = messagingInstance.onMessage(async remoteMessage => {
        console.log('Message received in foreground:', remoteMessage);
        this.handleForegroundMessage(remoteMessage);
      });

      // App opened via notification - use namespace API
      this.unsubscribeNotificationOpenListener = messagingInstance.onNotificationOpenedApp(remoteMessage => {
        console.log('Notification opened app:', remoteMessage);
        this.handleNotificationOpen(remoteMessage);
      });

      // App launched via notification (killed state) - use namespace API
      // Check if getInitialNotification is available before calling
      if (typeof messagingInstance.getInitialNotification === 'function') {
        messagingInstance
          .getInitialNotification()
          .then(remoteMessage => {
            if (remoteMessage) {
              console.log('App launched via notification:', remoteMessage);
              this.handleNotificationOpen(remoteMessage);
            }
          })
          .catch(error => {
            console.log('No initial notification or error:', error);
          });
      }
      
      console.log('✅ Message handlers setup complete');
    } catch (error) {
      console.error('Setup message handlers error:', error);
    }
  }

  setupTokenRefreshListener() {
    try {
      // Use namespace API
      const messagingInstance = this.getMessagingInstance();
      if (!messagingInstance) {
        console.warn('Messaging instance not available for token refresh listener');
        return;
      }
      this.unsubscribeTokenRefreshListener = messagingInstance.onTokenRefresh(token => {
        console.log('FCM token refreshed:', token);
        this.fcmToken = token;
        this.registerTokenWithBackend(token);
        AsyncStorage.setItem('fcm_token', token);
      });
    } catch (error) {
      console.error('Setup token refresh listener error:', error);
    }
  }

  handleForegroundMessage(remoteMessage) {
    const { notification, data } = remoteMessage;
    
    if (notification) {
      // Show local notification when app is in foreground
      PushNotification.localNotification({
        channelId: 'hrms-notifications',
        title: notification.title,
        message: notification.body,
        userInfo: data,
        playSound: true,
        soundName: 'default',
        actions: ['View'],
      });
    }
  }

  handleBackgroundMessage(remoteMessage) {
    const { notification, data } = remoteMessage;
    console.log('Background notification:', notification);
    
    // Update notification badge or perform silent updates
    // This runs in background, so UI updates are limited
  }

  handleNotificationOpen(remoteMessage) {
    const { data } = remoteMessage;
    
    // Navigate based on notification data
    if (data && data.notification_id) {
      // Navigate to specific notification or screen
      console.log('Navigate to notification:', data.notification_id);
      // Add navigation logic here
    }
  }

  async getDeviceId() {
    try {
      let deviceId = await AsyncStorage.getItem('device_id');
      
      if (!deviceId) {
        // Generate unique device ID
        deviceId = `${Platform.OS}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await AsyncStorage.setItem('device_id', deviceId);
      }
      
      return deviceId;
    } catch (error) {
      console.error('Get device ID error:', error);
      return `${Platform.OS}_unknown`;
    }
  }

  // Show local notification manually
  showLocalNotification(title, message, data = {}) {
    PushNotification.localNotification({
      channelId: 'hrms-notifications',
      title: title,
      message: message,
      userInfo: data,
      playSound: true,
      soundName: 'default',
      actions: ['View'],
    });
  }

  // Get current FCM token
  getToken() {
    return this.fcmToken;
  }

  // Cleanup listeners
  cleanup() {
    if (this.unsubscribeTokenRefreshListener) {
      this.unsubscribeTokenRefreshListener();
      this.unsubscribeTokenRefreshListener = null;
    }
    
    if (this.unsubscribeMessageListener) {
      this.unsubscribeMessageListener();
      this.unsubscribeMessageListener = null;
    }
    
    if (this.unsubscribeNotificationOpenListener) {
      this.unsubscribeNotificationOpenListener();
      this.unsubscribeNotificationOpenListener = null;
    }
  }
}

// Export singleton instance
const fcmService = new FCMService();
export default fcmService;
