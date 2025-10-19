// src/utils/location.js
import { Platform, PermissionsAndroid } from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import { check, request, PERMISSIONS, RESULTS } from 'react-native-permissions';

const ANDROID_PERM = PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION;
const IOS_PERM = PERMISSIONS.IOS.LOCATION_WHEN_IN_USE;

export async function ensureLocationPermission() {
    const perm = Platform.OS === 'android' ? ANDROID_PERM : IOS_PERM;

    let status = await check(perm);
    if (status === RESULTS.DENIED) {
        status = await request(perm);
    }

    if (Platform.OS === 'android') {
        // Optional: request background if your kiosk/admin mode needs it
        // await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION);
    }

    const granted = status === RESULTS.GRANTED || status === RESULTS.LIMITED;
    if (!granted) throw new Error('Location permission not granted');

    // On Android 12+ also ensure Location Services switch is ON — handled by catch block in getCurrentPosition
    return true;
}

export function getCurrentPosition(options = {}) {
    return new Promise((resolve, reject) => {
        Geolocation.getCurrentPosition(
            pos => resolve(pos),
            err => reject(err),
            {
                enableHighAccuracy: true,
                timeout: 15000,
                maximumAge: 5000,
                distanceFilter: 0,
                ...options,
            }
        );
    });
}
