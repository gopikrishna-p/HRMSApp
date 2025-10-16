import axios from 'axios';
import API_CONFIG from '../config/api.config';
import StorageService from '../utils/storage';
import { STORAGE_KEYS } from '../config/constants';

class ApiService {
    constructor() {
        this.api = axios.create({
            baseURL: API_CONFIG.BASE_URL,
            timeout: API_CONFIG.TIMEOUT,
            headers: API_CONFIG.HEADERS,
        });

        // Request interceptor
        this.api.interceptors.request.use(
            async (config) => {
                // Add auth token if available
                const token = await StorageService.getItem(STORAGE_KEYS.AUTH_TOKEN);
                if (token) {
                    config.headers.Authorization = `Bearer ${token}`;
                }

                console.log('API Request:', config.method?.toUpperCase(), config.url);
                return config;
            },
            (error) => {
                console.error('Request error:', error);
                return Promise.reject(error);
            }
        );

        // Response interceptor
        this.api.interceptors.response.use(
            (response) => {
                console.log('API Response:', response.config.url, response.status);
                return response;
            },
            async (error) => {
                console.error('Response error:', error.response?.status, error.message);

                // Handle 401 Unauthorized
                if (error.response?.status === 401) {
                    // Clear stored auth data
                    await StorageService.removeItem(STORAGE_KEYS.AUTH_TOKEN);
                    await StorageService.removeItem(STORAGE_KEYS.USER_DATA);
                    // You might want to navigate to login screen here
                }

                return Promise.reject(this.handleError(error));
            }
        );
    }

    handleError(error) {
        if (error.response) {
            // Server responded with error
            const message = error.response.data?.message
                || error.response.data?.error
                || error.response.statusText
                || 'Server error occurred';

            return {
                status: error.response.status,
                message,
                data: error.response.data
            };
        } else if (error.request) {
            // Request made but no response
            return {
                status: 0,
                message: 'No response from server. Please check your internet connection.',
                data: null
            };
        } else {
            // Error in request setup
            return {
                status: -1,
                message: error.message || 'An unexpected error occurred',
                data: null
            };
        }
    }

    // GET request
    async get(endpoint, params = {}) {
        try {
            const response = await this.api.get(endpoint, { params });
            return { success: true, data: response.data };
        } catch (error) {
            return { success: false, error };
        }
    }

    // POST request
    async post(endpoint, data = {}) {
        try {
            const response = await this.api.post(endpoint, data);
            return { success: true, data: response.data };
        } catch (error) {
            return { success: false, error };
        }
    }

    // PUT request
    async put(endpoint, data = {}) {
        try {
            const response = await this.api.put(endpoint, data);
            return { success: true, data: response.data };
        } catch (error) {
            return { success: false, error };
        }
    }

    // DELETE request
    async delete(endpoint) {
        try {
            const response = await this.api.delete(endpoint);
            return { success: true, data: response.data };
        } catch (error) {
            return { success: false, error };
        }
    }
}

export default new ApiService();