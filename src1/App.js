import React, { useEffect } from 'react';
import { StatusBar, LogBox, Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { Provider as PaperProvider } from 'react-native-paper';
import Toast from 'react-native-toast-message';
import AuthNavigator from './src/navigation/AuthNavigator';
import { getSession } from './src/auth/authStore';

// Ignore specific warnings
LogBox.ignoreLogs([
  'Non-serializable values were found in the navigation state',
  'VirtualizedLists should never be nested',
]);

function App() {
  useEffect(() => {
    // Optional: Check session on app start
    checkInitialSession();
  }, []);

  const checkInitialSession = async () => {
    try {
      const session = await getSession();
      if (session) {
        console.log('App started with active session');
      } else {
        console.log('App started without active session');
      }
    } catch (error) {
      console.log('Error checking initial session:', error);
    }
  };

  return (
    <PaperProvider>
      <NavigationContainer>
        <StatusBar
          barStyle="dark-content"
          backgroundColor="#ffffff"
          translucent={false}
        />
        <AuthNavigator />
        <Toast />
      </NavigationContainer>
    </PaperProvider>
  );
}

export default App;