// src/utils/location.js
import { Platform } from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import { check, request, PERMISSIONS, RESULTS } from 'react-native-permissions';

const ANDROID_FINE = PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION;
const IOS_WHEN_IN_USE = PERMISSIONS.IOS.LOCATION_WHEN_IN_USE;

export async function ensureLocationPermission() {
    const perm = Platform.OS === 'android' ? ANDROID_FINE : IOS_WHEN_IN_USE;

    let status = await check(perm);
    if (status === RESULTS.DENIED) {
        status = await request(perm);
    }

    const granted = status === RESULTS.GRANTED || status === RESULTS.LIMITED;
    if (!granted) throw new Error('Location permission not granted');
    return true;
}

export function getCurrentPosition(options = {}) {
    return new Promise((resolve, reject) => {
        Geolocation.getCurrentPosition(
            (pos) => resolve(pos),
            (err) => reject(err),
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
