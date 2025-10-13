import React, { useEffect } from 'react';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
// import AuthNavigator from './navigation/AuthNavigator';
// import { requestLocationPermission } from './utils/locationService';
// import { syncAttendanceQueue } from './utils/attendanceService';
// import { initializeFCM } from './utils/fcmService';
// import Toast from 'react-native-toast-message';
// import { View, Text } from 'react-native';
// import { getSession, validateSession } from './screens/auth/authStore';
// import { AppState } from 'react-native';

const toastConfig = {
  success: ({ text1, text2, props }) => (
    <View style={{
      height: 60,
      width: '90%',
      backgroundColor: props.backgroundColor || '#4CAF50',
      borderRadius: 10,
      padding: 10,
      justifyContent: 'center',
    }}>
      <Text style={{ color: '#FFF', fontSize: 16, fontWeight: 'bold' }}>{text1}</Text>
      <Text style={{ color: '#FFF', fontSize: 14 }}>{text2}</Text>
    </View>
  ),
  error: ({ text1, text2 }) => (
    <View style={{
      height: 60,
      width: '90%',
      backgroundColor: '#F44336',
      borderRadius: 10,
      padding: 10,
      justifyContent: 'center',
    }}>
      <Text style={{ color: '#FFF', fontSize: 16, fontWeight: 'bold' }}>{text1}</Text>
      <Text style={{ color: '#FFF', fontSize: 14 }}>{text2}</Text>
    </View>
  ),
  info: ({ text1, text2, props }) => (
    <View style={{
      height: 60,
      width: '90%',
      backgroundColor: props.backgroundColor || '#2196F3',
      borderRadius: 10,
      padding: 10,
      justifyContent: 'center',
    }}>
      <Text style={{ color: '#FFF', fontSize: 16, fontWeight: 'bold' }}>{text1}</Text>
      <Text style={{ color: '#FFF', fontSize: 14 }}>{text2}</Text>
    </View>
  ),
};

export default function App() {
  const navigationRef = useNavigationContainerRef();

  useEffect(() => {
    const initializeApp = async () => {
      await initializeFCM();
      const hasPermission = await requestLocationPermission();
      if (!hasPermission) {
        console.log('Location permission denied');
      } else {
        console.log('Location permission granted');
      }
      await syncAttendanceQueue();

      // Let AuthNavigator handle initial routing
      console.log('App initialized, delegating to AuthNavigator');
    };

    initializeApp();
  }, []);

  return (
    <NavigationContainer ref={navigationRef}>
      <AuthNavigator navigation={navigationRef} />
      <Toast config={toastConfig} style={{ zIndex: 9999 }} />
    </NavigationContainer>
  );
}