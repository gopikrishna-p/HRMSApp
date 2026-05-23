// src/utils/dateFormat.js
//
// Single source of truth for date formatting that the backend expects in
// `YYYY-MM-DD`. The naïve approach `d.toISOString().slice(0, 10)` works in UTC
// but produces an OFF-BY-ONE day in any other timezone — opening Manual
// Attendance for "24-05-2026" in IST and fetching records for "2026-05-23"
// because the picker stored midnight-local which is the previous day in UTC.
// This helper uses the local Y/M/D components so the string sent to the
// backend matches the date displayed to the user.

/**
 * Format a Date as a `YYYY-MM-DD` string in the LOCAL timezone.
 *
 * @param {Date|null|undefined} date
 * @returns {string|null} `YYYY-MM-DD`, or null if input is null/undefined.
 */
export const formatLocalDate = (date) => {
    if (!date) return null;
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return null;
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

/**
 * Today as `YYYY-MM-DD` in the local timezone. Convenience wrapper used by
 * API helpers that default to "today" when no date is provided.
 *
 * @returns {string} `YYYY-MM-DD`
 */
export const todayLocalYMD = () => formatLocalDate(new Date());

export default formatLocalDate;
