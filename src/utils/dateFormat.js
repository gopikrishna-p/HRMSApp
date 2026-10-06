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

/**
 * Keep `date` inside [min, max], comparing calendar days only (time is ignored).
 * Used to keep a half-day date inside the selected leave / work range, which the
 * backend requires.
 *
 * @param {Date} date
 * @param {Date} min
 * @param {Date} max
 * @returns {Date} `date` itself when already in range (or when min > max, which
 *   the screen's own validation reports), otherwise `min` or `max`.
 */
export const clampToDateRange = (date, min, max) => {
    if (formatLocalDate(min) > formatLocalDate(max)) {
        return date;
    }
    const day = formatLocalDate(date);
    if (day < formatLocalDate(min)) {
        return min;
    }
    if (day > formatLocalDate(max)) {
        return max;
    }
    return date;
};

export default formatLocalDate;

/**
 * Time of day for display, e.g. "09:48 AM", from a backend datetime string
 * ("2026-10-06 09:48:53.442343"), an "HH:MM[:SS]" string or a Date. Reads the
 * digits directly, so it never shifts with the phone's timezone and never
 * depends on the JS engine parsing a space-separated date. Returns null if empty.
 *
 * @param {string|Date|null|undefined} value
 * @returns {string|null}
 */
export const formatTimeOfDay = (value) => {
    if (!value) {
        return null;
    }
    let h;
    let m;
    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) {
            return null;
        }
        h = value.getHours();
        m = value.getMinutes();
    } else {
        const match = String(value).match(/(\d{1,2}):(\d{2})(?::\d{2})?/);
        if (!match) {
            return null;
        }
        h = parseInt(match[1], 10);
        m = parseInt(match[2], 10);
    }
    const suffix = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${suffix}`;
};

/**
 * "HH:MM" (24-hour) from a Date, for sending a time to the backend.
 *
 * @param {Date} date
 * @returns {string}
 */
export const toHHMM = (date) =>
    `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

/**
 * A Date on `day` at the time found in `value` ("YYYY-MM-DD HH:MM:SS" or "HH:MM"),
 * or at `fallback` ("HH:MM") when value has no time. Used to pre-fill time pickers.
 *
 * @param {Date} day
 * @param {string|null|undefined} value
 * @param {string} fallback
 * @returns {Date}
 */
export const timeOnDay = (day, value, fallback = '09:00') => {
    const match = String(value || fallback).match(/(\d{1,2}):(\d{2})/) || String(fallback).match(/(\d{1,2}):(\d{2})/);
    const d = new Date(day.getFullYear(), day.getMonth(), day.getDate());
    d.setHours(parseInt(match[1], 10), parseInt(match[2], 10), 0, 0);
    return d;
};
