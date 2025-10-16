// Check if user is admin
export const isAdmin = (roles) => {
    if (!roles || !Array.isArray(roles)) return false;

    const adminRoles = ['System Manager', 'HR Manager', 'HR User'];
    return roles.some(role => adminRoles.includes(role));
};

// Format date
export const formatDate = (date) => {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });
};

// Format time
export const formatTime = (time) => {
    if (!time) return '';
    const d = new Date(time);
    return d.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
};

// Delay function
export const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));