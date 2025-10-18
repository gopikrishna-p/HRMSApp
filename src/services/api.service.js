import axios from 'axios';

// Get configuration from environment variables
const BASE_URL = process.env.BASE_URL || 'https://hr.deepgrid.in';
const API_TIMEOUT = parseInt(process.env.API_TIMEOUT || '30000', 10);

class ApiService {
    constructor() {
        this.api = axios.create({
            baseURL: BASE_URL,
            timeout: API_TIMEOUT,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            withCredentials: true, // Important for Frappe session cookies
        });

        // Request interceptor
        this.api.interceptors.request.use(
            (config) => {
                console.log('API Request:', config.method.toUpperCase(), config.url);
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
                return {
                    success: true,
                    data: response.data,
                    status: response.status,
                };
            },
            (error) => {
                console.error('API Error:', error.response?.data || error.message);
                
                return {
                    success: false,
                    message: error.response?.data?.message || error.message,
                    status: error.response?.status,
                };
            }
        );
    }

    // GET request
    async get(endpoint, params = {}) {
        return this.api.get(endpoint, { params });
    }

    // POST request
    async post(endpoint, data = {}) {
        return this.api.post(endpoint, data);
    }

    // PUT request
    async put(endpoint, data = {}) {
        return this.api.put(endpoint, data);
    }

    // DELETE request
    async delete(endpoint) {
        return this.api.delete(endpoint);
    }

    // Get base URL (useful for debugging)
    getBaseURL() {
        return BASE_URL;
    }
}

export default new ApiService();