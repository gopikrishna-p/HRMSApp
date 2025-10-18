// src/components/attendance/attendanceService/attendanceService.js
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import API_CONFIG from '../../../config/api.config'; // <— use your config

// Build URLs from your config
const API_URL = `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.GEO_ATTENDANCE}`;
const GEO_LOG_URL = `${API_CONFIG.BASE_URL}/api/resource/Geo%20Log`;
const OFFICE_LOCATION_URL = `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.GET_OFFICE_LOCATION}`;

const RATE_LIMIT_KEY = 'attendanceRateLimit';
const RATE_LIMIT_COUNT = 10;
const RATE_LIMIT_WINDOW = 60 * 1000;

const checkRateLimit = async () => {
    const now = Date.now();
    const data = JSON.parse((await AsyncStorage.getItem(RATE_LIMIT_KEY)) || '{}');
    const { count = 0, startTime = now } = data;

    if (now - startTime > RATE_LIMIT_WINDOW) {
        await AsyncStorage.setItem(RATE_LIMIT_KEY, JSON.stringify({ count: 1, startTime: now }));
        return true;
    }
    if (count >= RATE_LIMIT_COUNT) return false;

    await AsyncStorage.setItem(RATE_LIMIT_KEY, JSON.stringify({ count: count + 1, startTime }));
    return true;
};

export const markGeoAttendance = async (action, employee, latitude, longitude, workType = null) => {
    try {
        const userDetails = JSON.parse((await AsyncStorage.getItem('UserDetails')) || '{}');
        const sid = userDetails.sid;
        if (!sid) throw new Error('User not authenticated');
        if (!employee) throw new Error('Employee ID is required');

        if (!(await checkRateLimit())) throw new Error('Rate limit exceeded');

        const formattedAction = action?.toLowerCase() === 'check-in' ? 'Check-In' : 'Check-Out';
        let payload = { employee, action: formattedAction };

        if (workType === 'WFH') {
            payload = { ...payload, latitude: latitude || 0, longitude: longitude || 0, work_type: 'WFH' };
        } else {
            if (!latitude || !longitude) throw new Error('Location data is required for office attendance');
            payload = { ...payload, latitude, longitude };
        }

        const response = await axios.post(API_URL, payload, {
            headers: { Cookie: `sid=${sid}`, ...API_CONFIG.HEADERS },
            timeout: API_CONFIG.TIMEOUT,
        });

        const successMessage = formattedAction === 'Check-In' ? 'Check-In Successful' : 'Check-Out Successful';
        return {
            status: 'success',
            message: workType === 'WFH' ? `${successMessage} (WFH)` : successMessage,
            timestamp: response.data?.message?.geo_log
                ? await fetchGeoLogTimestamp(response.data.message.geo_log)
                : null,
        };
    } catch (error) {
        const formattedAction = action?.toLowerCase() === 'check-in' ? 'Check-In' : 'Check-Out';
        let errorMessage = error.message;

        if (error.response?.status === 417) {
            const backendMsg =
                error.response.data?.message ||
                error.response.data?.exception ||
                (() => {
                    try {
                        const arr = JSON.parse(error.response.data?._server_messages || '[]');
                        return arr?.[0]?.message || '';
                    } catch {
                        return '';
                    }
                })();

            if (backendMsg.includes('already performed')) {
                errorMessage =
                    formattedAction === 'Check-In'
                        ? 'You have already performed Check-In today'
                        : 'You have already performed Check-Out today';
            } else if (backendMsg.includes('Invalid action')) {
                errorMessage = `Invalid ${formattedAction.toLowerCase()} action. Please try again.`;
            } else if (backendMsg.includes('No Check-In found')) {
                errorMessage = 'Please check in before checking out.';
            } else if (backendMsg.includes('outside the office geofence') && workType !== 'WFH') {
                errorMessage = 'You are outside the office geofence. Use WFH option or check-in from office premises.';
            } else if (backendMsg.includes('No office location assigned')) {
                errorMessage = 'No office location assigned. Contact HR.';
            } else if (backendMsg.includes('not authorized to mark Work From Home') && workType === 'WFH') {
                errorMessage = 'You are not authorized for Work From Home. Contact HR to enable WFH access.';
            } else if (backendMsg.includes('Invalid Employee ID')) {
                errorMessage = 'Invalid Employee ID. Please check your profile or contact HR.';
            } else if (backendMsg.includes('Cannot update attendance after submission')) {
                errorMessage = 'Cannot update attendance after check-in. Contact HR.';
            } else {
                errorMessage = backendMsg || 'Failed to mark attendance. Please try again.';
            }
        } else if (error.response?.data?.exc_type === 'AuthenticationError') {
            errorMessage = 'Session expired. Please log in again.';
            await AsyncStorage.removeItem('UserDetails');
            await AsyncStorage.removeItem('attendanceQueue');
        } else if (error.response?.data?.exc_type === 'PermissionError') {
            errorMessage = 'You lack permission to submit Geo Log or Attendance. Contact HR.';
        } else if (error.response?.data?.exc_type === 'UpdateAfterSubmitError') {
            errorMessage = 'Cannot update attendance after check-in. Contact HR.';
        } else if (error.message === 'Location permission denied') {
            errorMessage = 'Please grant location permission in settings.';
        } else if (error.message.includes('timed out')) {
            errorMessage = 'Unable to get location. Ensure GPS is enabled and try again.';
        } else if (error.message.includes('GPS unavailable')) {
            errorMessage = 'GPS unavailable. Enable location services or check signal.';
        } else if (error.message === 'Employee ID is required') {
            errorMessage = 'Employee ID not found. Please log in again or contact HR.';
        }

        throw new Error(errorMessage);
    }
};

async function fetchGeoLogTimestamp(geoLogName) {
    try {
        const userDetails = JSON.parse((await AsyncStorage.getItem('UserDetails')) || '{}');
        const sid = userDetails.sid;
        if (!sid) throw new Error('User not authenticated');

        const response = await axios.get(`${GEO_LOG_URL}/${geoLogName}`, {
            headers: { Cookie: `sid=${sid}`, ...API_CONFIG.HEADERS },
            timeout: API_CONFIG.TIMEOUT,
        });
        return response.data?.data?.timestamp || null;
    } catch {
        return null;
    }
}

export const getTodayAttendanceStatus = async (employee) => {
    try {
        const userDetails = JSON.parse((await AsyncStorage.getItem('UserDetails')) || '{}');
        const sid = userDetails.sid;
        if (!sid) throw new Error('User not authenticated');
        if (!employee) throw new Error('Employee ID is required');

        const today = new Date().toISOString().split('T')[0];
        const response = await axios.get(GEO_LOG_URL, {
            headers: { Cookie: `sid=${sid}`, ...API_CONFIG.HEADERS },
            params: {
                filters: JSON.stringify([
                    ['employee', '=', employee],
                    ['action', 'in', ['Check-In', 'Check-Out']],
                    ['status', '=', 'Approved'],
                    ['creation', '>=', `${today} 00:00:00`],
                ]),
                fields: JSON.stringify(['action', 'timestamp']),
                limit: 2,
                order_by: 'creation desc',
            },
            timeout: API_CONFIG.TIMEOUT,
        });

        const logs = response.data?.data || [];
        const checkIn = logs.find((l) => l.action === 'Check-In')?.timestamp || null;
        const checkOut = logs.find((l) => l.action === 'Check-Out')?.timestamp || null;
        return { checkIn, checkOut };
    } catch {
        throw new Error('Failed to fetch attendance status');
    }
};

export const getOfficeLocation = async (employee) => {
    try {
        const userDetails = JSON.parse((await AsyncStorage.getItem('UserDetails')) || '{}');
        const sid = userDetails.sid;
        if (!sid) throw new Error('User not authenticated');
        if (!employee) throw new Error('Employee ID is required');

        const response = await axios.get(`${OFFICE_LOCATION_URL}?employee=${employee}`, {
            headers: { Cookie: `sid=${sid}`, ...API_CONFIG.HEADERS },
            timeout: API_CONFIG.TIMEOUT,
        });

        const data = response.data?.message;
        if (!data || !data.latitude || !data.longitude || !data.radius) {
            throw new Error('No office location assigned. Contact HR.');
        }
        return data;
    } catch (error) {
        throw new Error(error.message || 'Failed to fetch office location');
    }
};

// --- Offline queue sync ---
async function queueAttendance(action, latitude, longitude, employee) {
    try {
        const queue = JSON.parse((await AsyncStorage.getItem('attendanceQueue')) || '[]');
        queue.push({ action, latitude, longitude, employee, timestamp: new Date() });
        await AsyncStorage.setItem('attendanceQueue', JSON.stringify(queue));
        const msg = action === 'Check-In' ? 'Check-In queued for syncing' : 'Check-Out queued for syncing';
        return { status: 'Queued', message: msg };
    } catch {
        throw new Error('Failed to queue attendance. Please try again.');
    }
}

export const syncAttendanceQueue = async () => {
    const queue = JSON.parse((await AsyncStorage.getItem('attendanceQueue')) || '[]');
    if (!queue.length) return;

    const userDetails = JSON.parse((await AsyncStorage.getItem('UserDetails')) || '{}');
    const sid = userDetails.sid;
    if (!sid) {
        await AsyncStorage.removeItem('attendanceQueue');
        return;
    }

    for (const item of queue) {
        try {
            if (!(await checkRateLimit())) continue;

            const response = await axios.post(
                API_URL,
                {
                    employee: item.employee,
                    action: item.action,
                    latitude: item.latitude,
                    longitude: item.longitude,
                },
                { headers: { Cookie: `sid=${sid}`, ...API_CONFIG.HEADERS }, timeout: API_CONFIG.TIMEOUT }
            );

            queue.shift();
            await AsyncStorage.setItem('attendanceQueue', JSON.stringify(queue));
            const syncMessage = item.action === 'Check-In' ? 'Check-In Successful' : 'Check-Out Successful';
            return {
                status: 'success',
                message: syncMessage,
                timestamp: response.data?.message?.geo_log
                    ? await fetchGeoLogTimestamp(response.data.message.geo_log)
                    : null,
            };
        } catch (error) {
            if (error.response?.data?.exc_type === 'AuthenticationError' || error.message === 'Network Error') {
                await AsyncStorage.removeItem('attendanceQueue');
            }
            throw new Error(error.message || 'Failed to sync attendance');
        }
    }
};

NetInfo.addEventListener((state) => {
    if (state.isConnected) {
        syncAttendanceQueue();
    }
});
