// src/utils/attendance.js
export const hoursColor = (hours, shiftHours = 9) => {
    if (!hours && hours !== 0) return '#9CA3AF';
    const p = (hours / shiftHours) * 100;
    if (p >= 100) return '#10B981';
    if (p >= 75) return '#F59E0B';
    if (p >= 50) return '#EF4444';
    return '#7C3AED';
};

export const fmtHours = (h) => {
    if (!h && h !== 0) return 'N/A';
    if (h < 1) return `${Math.round(h * 60)}m`;
    const whole = Math.floor(h);
    const mins = Math.round((h - whole) * 60);
    return mins ? `${whole}h ${mins}m` : `${whole}h`;
};
