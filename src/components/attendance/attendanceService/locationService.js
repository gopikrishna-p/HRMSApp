// src/utils/locationService.js
import Geolocation from 'react-native-geolocation-service';
import { PermissionsAndroid, Platform } from 'react-native';
import showToast from '../../../utils/Toast';

export const requestLocationPermission = async () => {
    if (Platform.OS === 'android') {
        try {
            const granted = await PermissionsAndroid.request(
                PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
                {
                    title: 'Location Access Required',
                    message: 'HRMS app needs to access your location',
                    buttonPositive: 'OK',
                    buttonNegative: 'Cancel',
                }
            );
            return granted === PermissionsAndroid.RESULTS.GRANTED;
        } catch (err) {
            return false;
        }
    }
    return true;
};

export const checkLocationServices = async () => {
    // Optional platform-specific checks can be added here
    return true;
};

export const getCurrentLocation = () => {
    return new Promise(async (resolve, reject) => {
        const hasPermission = await requestLocationPermission();
        if (!hasPermission) {
            showToast({
                type: 'error',
                text1: 'Permission Denied',
                text2: 'Please grant location permission in settings.',
                time: 5000,
            });
            reject(new Error('Location permission denied'));
            return;
        }

        const servicesEnabled = await checkLocationServices();
        if (!servicesEnabled) {
            showToast({
                type: 'error',
                text1: 'Location Error',
                text2: 'Please enable location services in your device settings.',
                time: 5000,
            });
            reject(new Error('Location services disabled'));
            return;
        }

        showToast({
            type: 'info',
            text1: 'Fetching Location',
            text2: 'Please wait while we get your location…',
            time: 3000,
        });

        // Try high-accuracy first
        Geolocation.getCurrentPosition(
            (position) => {
                resolve({
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    accuracy: position.coords.accuracy,
                });
            },
            (error) => {
                if (error.code === 3) {
                    // Timeout → retry low accuracy
                    Geolocation.getCurrentPosition(
                        (position) => {
                            resolve({
                                latitude: position.coords.latitude,
                                longitude: position.coords.longitude,
                                accuracy: position.coords.accuracy,
                            });
                        },
                        (lowError) => {
                            let errorMessage = 'Failed to get location. Ensure GPS or network is enabled.';
                            if (lowError.code === 1) errorMessage = 'Location permission denied.';
                            if (lowError.code === 2) errorMessage = 'GPS unavailable. Enable location services or check signal.';
                            if (lowError.code === 3) errorMessage = 'Location request timed out. Try again.';
                            showToast({ type: 'error', text1: 'Location Error', text2: errorMessage, time: 5000 });
                            reject(new Error(errorMessage));
                        },
                        { enableHighAccuracy: false, timeout: 30000, maximumAge: 60000 }
                    );
                } else {
                    let errorMessage = 'Failed to get location. Ensure GPS or network is enabled.';
                    if (error.code === 1) errorMessage = 'Location permission denied.';
                    if (error.code === 2) errorMessage = 'GPS unavailable. Enable location services or check signal.';
                    showToast({ type: 'error', text1: 'Location Error', text2: errorMessage, time: 5000 });
                    reject(new Error(errorMessage));
                }
            },
            { enableHighAccuracy: true, timeout: 30000, maximumAge: 60000 }
        );
    });
};
