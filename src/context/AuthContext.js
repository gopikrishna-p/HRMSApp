import React, { createContext, useState, useEffect, useContext } from 'react';
import AuthService from '../services/auth.service';
import { isAdmin } from '../utils/helpers';
import StorageService from '../utils/storage';
import { STORAGE_KEYS } from '../config/constants';

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [employee, setEmployee] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isAuthenticated, setIsAuthenticated] = useState(false);

    // Check authentication on mount
    useEffect(() => {
        checkAuth();
    }, []);

    const checkAuth = async () => {
        try {
            const authenticated = await AuthService.isAuthenticated();

            if (authenticated) {
                const storedData = await AuthService.getStoredUserData();

                if (storedData.user) {
                    setUser(storedData.user);
                    setEmployee(storedData.employee);
                    setIsAuthenticated(true);
                } else {
                    setIsAuthenticated(false);
                }
            } else {
                setIsAuthenticated(false);
            }
        } catch (error) {
            console.error('Check auth error:', error);
            setIsAuthenticated(false);
        } finally {
            setLoading(false);
        }
    };

    const login = async (username, password) => {
        try {
            const result = await AuthService.login(username, password);

            if (result.success) {
                setUser(result.user);
                setEmployee(result.employee);
                setIsAuthenticated(true);
                return { success: true };
            }

            return { success: false, message: result.message };
        } catch (error) {
            return { success: false, message: error.message };
        }
    };

    const logout = async () => {
        try {
            await AuthService.logout();
            setUser(null);
            setEmployee(null);
            setIsAuthenticated(false);
            return { success: true };
        } catch (error) {
            console.error('Logout error:', error);
            return { success: false };
        }
    };

    const updateUser = (userData) => {
        setUser(userData);
    };

    const updateEmployee = (employeeData) => {
        setEmployee(employeeData);
    };

    const value = {
        user,
        employee,
        loading,
        isAuthenticated,
        isAdmin: user ? isAdmin(user.roles) : false,
        login,
        logout,
        updateUser,
        updateEmployee,
        checkAuth,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return context;
};

export default AuthContext;