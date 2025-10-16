// Email validation
export const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};

// Password validation (minimum 6 characters)
export const validatePassword = (password) => {
    return password && password.length >= 6;
};

// Username validation (for Frappe, usually email or username)
export const validateUsername = (username) => {
    return username && username.trim().length >= 3;
};

// Form validation
export const validateLoginForm = (username, password) => {
    const errors = {};

    if (!username || username.trim().length === 0) {
        errors.username = 'Username is required';
    } else if (username.includes('@') && !validateEmail(username)) {
        errors.username = 'Please enter a valid email';
    }

    if (!password || password.length === 0) {
        errors.password = 'Password is required';
    } else if (password.length < 6) {
        errors.password = 'Password must be at least 6 characters';
    }

    return {
        isValid: Object.keys(errors).length === 0,
        errors
    };
};