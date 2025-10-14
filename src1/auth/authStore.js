import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import Config from 'react-native-config';
import showToast from '../../utils/Toast';
import { getFCMToken } from '../../utils/fcmService';

const BASE_URL = Config.BASE_URL;
const SESSION_KEY = 'userSession';
const USER_DETAILS_KEY = 'UserDetails';

export const storeSession = async (sid, userDetails) => {
    try {
        // Validate userDetails before storing
        if (!userDetails || !userDetails.roles || !Array.isArray(userDetails.roles)) {
            throw new Error('Invalid user details or roles');
        }

        const sessionData = {
            sid,
            userDetails,
            timestamp: Date.now(),
            expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
        };

        await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
        await AsyncStorage.setItem(USER_DETAILS_KEY, JSON.stringify(userDetails));

        try {
            await getFCMToken();
        } catch (fcmError) {
            console.log('FCM token fetch failed (non-critical):', fcmError);
        }

        console.log('Session stored successfully:', {
            userId: userDetails.name,
            roles: userDetails.roles,
            isAdmin: isAdminUser(userDetails.roles),
        });

        return sessionData;
    } catch (error) {
        console.error('Error storing session:', error);
        showToast({ type: 'error', text1: 'Error', text2: 'Failed to store session' });
        throw error;
    }
};

export const getSession = async () => {
    try {
        const sessionData = await AsyncStorage.getItem(SESSION_KEY);
        if (!sessionData) {
            console.log('No session data found');
            return null;
        }

        const session = JSON.parse(sessionData);

        // Validate session structure
        if (!session || !session.sid || !session.userDetails || !session.userDetails.roles) {
            console.log('Invalid session structure, clearing session');
            await clearSession();
            return null;
        }

        // Check expiration
        if (session.expiresAt && Date.now() > session.expiresAt) {
            console.log('Session expired, clearing session');
            await clearSession();
            return null;
        }

        console.log('Valid session found:', {
            userId: session.userDetails.name,
            roles: session.userDetails.roles,
            isAdmin: isAdminUser(session.userDetails.roles),
        });

        return session;
    } catch (error) {
        console.error('Error getting session:', error);
        await clearSession();
        return null;
    }
};

export const clearSession = async () => {
    try {
        await AsyncStorage.multiRemove([SESSION_KEY, USER_DETAILS_KEY]);
        console.log('Session cleared successfully');
    } catch (error) {
        console.error('Error clearing session:', error);
    }
};

export const validateSession = async (sid) => {
    try {
        if (!sid) return false;

        const response = await axios.get(`${BASE_URL}/api/method/frappe.auth.get_logged_user`, {
            headers: { Cookie: `sid=${sid}` },
            timeout: 10000,
        });

        const isValid = response.data.message !== 'No User';
        console.log('Session validation result:', isValid);

        return isValid;
    } catch (error) {
        console.error('Session validation error:', error);
        return false;
    }
};

export const fetchUserInfo = async (sid) => {
    try {
        const response = await axios.get(`${BASE_URL}/api/method/hrms.api.get_current_user_info`, {
            headers: { Cookie: `sid=${sid}` },
            timeout: 10000,
        });
        return response.data.message;
    } catch (error) {
        console.error('Error fetching user info:', error);
        throw error;
    }
};

export const logout = async () => {
    try {
        console.log('Initiating logout...');
        const session = await getSession();
        if (session && session.sid) {
            try {
                await axios.post(`${BASE_URL}/api/method/logout`, {}, {
                    headers: { Cookie: `sid=${session.sid}` },
                    timeout: 5000,
                });
                console.log('Server logout successful');
            } catch (serverError) {
                console.log('Server logout failed (continuing with local logout):', serverError.message);
            }
        }

        await clearSession();
        showToast({ type: 'success', text1: 'Success', text2: 'Logged out successfully' });
        return true;
    } catch (error) {
        console.error('Logout error:', error);
        await clearSession();
        showToast({ type: 'error', text1: 'Error', text2: 'Session cleared locally' });
        return true;
    }
};

export const isAdminUser = (roles) => {
    try {
        if (!roles || !Array.isArray(roles)) {
            console.log('isAdminUser: Invalid or missing roles:', roles);
            return false;
        }

        const adminRoles = ['HR Manager', 'HR User', 'System Manager', 'Administrator'];
        const hasAdminRole = roles.some((role) => {
            if (typeof role !== 'string') {
                console.log('Invalid role type:', role);
                return false;
            }
            return adminRoles.includes(role.trim());
        });

        console.log('isAdminUser check:', { roles, hasAdminRole });
        return hasAdminRole;
    } catch (error) {
        console.error('isAdminUser error:', error);
        return false;
    }
};

export const refreshSession = async () => {
    try {
        const session = await getSession();
        if (!session) {
            console.log('No session to refresh');
            return null;
        }

        const isValid = await validateSession(session.sid);
        if (!isValid) {
            console.log('Session invalid on server, clearing local session');
            await clearSession();
            return null;
        }

        const updatedSession = {
            ...session,
            expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        };

        await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(updatedSession));
        console.log('Session refreshed successfully');

        return updatedSession;
    } catch (error) {
        console.error('Session refresh error:', error);
        return null;
    }
};

export const getUserDetails = async () => {
    try {
        const session = await getSession();
        return session?.userDetails || null;
    } catch (error) {
        console.error('Error getting user details:', error);
        return null;
    }
};

// Replace your existing makeAPIRequest function in authStore.js with this improved version

export const makeAPIRequest = async (method, params = {}) => {
    try {
        const session = await getSession();
        if (!session || !session.sid) {
            throw new Error('No valid session found. Please log in again.');
        }

        console.log(`Making API request to: ${method}`, params);

        // Create FormData for Frappe API compatibility
        const formData = new FormData();
        
        // Add each parameter to FormData
        Object.keys(params).forEach(key => {
            if (params[key] !== null && params[key] !== undefined) {
                formData.append(key, typeof params[key] === 'object' ? JSON.stringify(params[key]) : params[key]);
            }
        });

        const response = await axios.post(
            `${BASE_URL}/api/method/${method}`,
            formData,
            {
                headers: {
                    'Cookie': `sid=${session.sid}`,
                    'Content-Type': 'multipart/form-data',
                    'Accept': 'application/json',
                    'X-Frappe-CSRF-Token': session.csrf_token || '', // Add CSRF if available
                },
                timeout: 15000,
            }
        );

        console.log('API Response Status:', response.status);
        console.log('API Response Data:', response.data);

        if (response.data) {
            // Handle Frappe's response format
            if (response.data.message) {
                return response.data.message;
            } else if (response.data.data) {
                return response.data.data;
            } else {
                return response.data;
            }
        } else {
            throw new Error('No response data received');
        }
    } catch (error) {
        console.error(`API Request Error (${method}):`, error);
        
        // Enhanced error handling
        if (error.response) {
            const status = error.response.status;
            const responseData = error.response.data;
            
            console.log('Error Response Status:', status);
            console.log('Error Response Data:', responseData);
            
            // Handle Frappe error messages
            if (responseData && responseData._server_messages) {
                try {
                    const serverMessages = JSON.parse(responseData._server_messages);
                    if (serverMessages && serverMessages.length > 0) {
                        const lastMessage = JSON.parse(serverMessages[serverMessages.length - 1]);
                        throw new Error(lastMessage.message || `Server error: ${status}`);
                    }
                } catch (parseError) {
                    console.log('Could not parse server messages:', parseError);
                }
            }
            
            if (responseData && responseData.exception) {
                throw new Error(responseData.exception);
            }
            
            // Handle specific status codes
            if (status === 401 || status === 403) {
                await clearSession();
                throw new Error('Session expired. Please log in again.');
            } else if (status === 404) {
                throw new Error('API method not found. Please check the method name.');
            } else if (status === 417) {
                throw new Error('Server validation error. Please check your input data.');
            } else if (status === 500) {
                throw new Error('Internal server error. Please try again later.');
            } else {
                throw new Error(`Server error: ${status}`);
            }
        } else if (error.code === 'ECONNABORTED') {
            throw new Error('Request timeout. Please try again.');
        } else if (error.message === 'Network Error') {
            throw new Error('Network error. Please check your connection.');
        } else {
            throw error;
        }
    }
};