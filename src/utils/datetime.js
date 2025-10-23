// src/utils/datetime.js
export const fmtDateLabel = (d) => {
    if (!d) return 'Select Date';
    const dd = new Date(d);
    if (isNaN(dd)) return 'Select Date';
    return dd.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
};

export const clampStartBeforeEnd = (start, end) => {
    if (!start || !end) return { start, end };
    const s = new Date(start), e = new Date(end);
    return s > e ? { start: e, end: s } : { start: s, end: e };
};

export const dayDiffInclusive = (start, end) => {
    if (!start || !end) return 0;
    const s = new Date(start); s.setHours(0, 0, 0, 0);
    const e = new Date(end); e.setHours(0, 0, 0, 0);
    return Math.floor((e - s) / (1000 * 60 * 60 * 24)) + 1;
};
