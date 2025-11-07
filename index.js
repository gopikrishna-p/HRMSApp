import 'react-native-gesture-handler';
import { AppRegistry } from 'react-native';
import App from './src/App';
import { name as appName } from './app.json';

// Background message handler for React Native Firebase
// This MUST be set outside of the app lifecycle
let messaging;
try {
    messaging = require('@react-native-firebase/messaging').default;
    
    messaging().setBackgroundMessageHandler(async (remoteMessage) => {
        console.log('🔔 Background Message Handler:', JSON.stringify(remoteMessage, null, 2));
        
        // You can process the message here
        // The notification will be automatically displayed by the system
        // if it has a notification payload
        
        if (remoteMessage.notification) {
            console.log('   Title:', remoteMessage.notification.title);
            console.log('   Body:', remoteMessage.notification.body);
        }
        
        if (remoteMessage.data) {
            console.log('   Data:', remoteMessage.data);
        }
        
        console.log('✅ Background message processed');
    });
    
    console.log('✅ Background message handler registered');
} catch (error) {
    console.warn('⚠️ Firebase messaging not available for background handler:', error.message);
}

AppRegistry.registerComponent(appName, () => App);

