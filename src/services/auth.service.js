import ApiService from './api.service';
import API_CONFIG from '../config/api.config';
import StorageService from '../utils/storage';
import { STORAGE_KEYS } from '../config/constants';

class AuthService {
    // Login
    async login(username, password) {
        try {
            // Frappe login endpoint
            const response = await ApiService.post(API_CONFIG.ENDPOINTS.LOGIN, {
                usr: username,
                pwd: password,
            });

            if (response.success) {
                // Save auth data
                await StorageService.setItem(STORAGE_KEYS.AUTH_TOKEN, response.data.token || 'authenticated');

                // Fetch user info
                const userInfo = await this.getCurrentUserInfo();
                const employeeInfo = await this.getCurrentEmployeeInfo();
                const wfhInfo = await this.getUserWFHInfo();

                return {
                    success: true,
                    user: userInfo.data,
                    employee: employeeInfo.data,
                    wfhInfo: wfhInfo.data,
                };
            }

            return { success: false, message: 'Login failed' };
        } catch (error) {
            console.error('Login error:', error);
            return {
                success: false,
                message: error.message || 'Invalid credentials. Please try again.',
            };
        }
    }

    // Get current user info
    async getCurrentUserInfo() {
        try {
            const response = await ApiService.get(API_CONFIG.ENDPOINTS.GET_CURRENT_USER);

            if (response.success) {
                await StorageService.setItem(STORAGE_KEYS.USER_DATA, response.data.message);
                return { success: true, data: response.data.message };
            }

            return { success: false, data: null };
        } catch (error) {
            console.error('Get user info error:', error);
            return { success: false, data: null };
        }
    }

    // Get current employee info
    async getCurrentEmployeeInfo() {
        try {
            const response = await ApiService.get(API_CONFIG.ENDPOINTS.GET_CURRENT_EMPLOYEE);

            if (response.success && response.data.message) {
                await StorageService.setItem(STORAGE_KEYS.EMPLOYEE_DATA, response.data.message);
                return { success: true, data: response.data.message };
            }

            return { success: false, data: null };
        } catch (error) {
            console.error('Get employee info error:', error);
            return { success: false, data: null };
        }
    }

    // Get WFH info
    async getUserWFHInfo() {
        try {
            const response = await ApiService.get(API_CONFIG.ENDPOINTS.GET_USER_WFH_INFO);
            return response;
        } catch (error) {
            console.error('Get WFH info error:', error);
            return { success: false, data: null };
        }
    }

    // Logout
    async logout() {
        try {
            await ApiService.post(API_CONFIG.ENDPOINTS.LOGOUT);

            // Clear all stored data
            await StorageService.removeItem(STORAGE_KEYS.AUTH_TOKEN);
            await StorageService.removeItem(STORAGE_KEYS.USER_DATA);
            await StorageService.removeItem(STORAGE_KEYS.EMPLOYEE_DATA);

            return { success: true };
        } catch (error) {
            console.error('Logout error:', error);

            // Clear data anyway
            await StorageService.clear();
            return { success: true };
        }
    }

    // Check if user is authenticated
    async isAuthenticated() {
        const token = await StorageService.getItem(STORAGE_KEYS.AUTH_TOKEN);
        return !!token;
    }

    // Get stored user data
    async getStoredUserData() {
        const userData = await StorageService.getItem(STORAGE_KEYS.USER_DATA);
        const employeeData = await StorageService.getItem(STORAGE_KEYS.EMPLOYEE_DATA);

        return {
            user: userData,
            employee: employeeData,
        };
    }
}

export default new AuthService();