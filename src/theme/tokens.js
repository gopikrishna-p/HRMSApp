// src/theme/tokens.js
//
// Design tokens for the admin screens. Neutral greys carry the layout; one accent colour is
// used for primary actions, selected states and links; status colours are used for status
// text and dots only, never as decoration.

export const color = {
    bg: '#F4F5F7',
    surface: '#FFFFFF',
    surfaceMuted: '#F9FAFB',
    border: '#E4E7EC',
    divider: '#EAECF0',
    overlay: 'rgba(16, 24, 40, 0.45)',

    text: '#101828',
    textSecondary: '#475467',
    textTertiary: '#98A2B3',
    textInverse: '#FFFFFF',

    accent: '#4F46E5',
    accentPressed: '#4338CA',
    accentSoft: '#EEF2FF',

    success: '#067647',
    warning: '#B54708',
    danger: '#B42318',
    info: '#175CD3',
    purple: '#6941C6',
    neutral: '#475467',

    successSoft: '#ECFDF3',
    warningSoft: '#FFFAEB',
    dangerSoft: '#FEF3F2',
    infoSoft: '#EFF8FF',
    purpleSoft: '#F4F3FF',
    neutralSoft: '#F2F4F7',
};

// status tone -> { fg, bg }
export const tones = {
    success: { fg: color.success, bg: color.successSoft, dot: '#17B26A' },
    warning: { fg: color.warning, bg: color.warningSoft, dot: '#F79009' },
    danger: { fg: color.danger, bg: color.dangerSoft, dot: '#F04438' },
    info: { fg: color.info, bg: color.infoSoft, dot: '#2E90FA' },
    purple: { fg: color.purple, bg: color.purpleSoft, dot: '#7A5AF8' },
    accent: { fg: color.accent, bg: color.accentSoft, dot: color.accent },
    neutral: { fg: color.textSecondary, bg: color.neutralSoft, dot: '#98A2B3' },
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 6, md: 10, lg: 12, xl: 16 };

export const type = {
    display: { fontSize: 24, fontWeight: '700', color: color.text, letterSpacing: -0.2 },
    title: { fontSize: 17, fontWeight: '600', color: color.text },
    body: { fontSize: 15, fontWeight: '400', color: color.text },
    bodyStrong: { fontSize: 15, fontWeight: '500', color: color.text },
    secondary: { fontSize: 13, fontWeight: '400', color: color.textSecondary },
    caption: { fontSize: 12, fontWeight: '400', color: color.textTertiary },
    label: { fontSize: 13, fontWeight: '600', color: color.textSecondary },
    number: { fontSize: 20, fontWeight: '600', color: color.text, fontVariant: ['tabular-nums'] },
};

// Attendance / request status -> tone, shared by every admin screen
export const statusTone = (status) => ({
    'Present': 'success',
    'Half Day': 'success',
    'Complete': 'success',
    'Completed': 'success',
    'Submitted': 'success',
    'Approved': 'success',
    'Paid': 'success',
    'Work From Home': 'purple',
    'WFH': 'purple',
    'On Site': 'info',
    'Office': 'info',
    'Checked in': 'warning',
    'Draft': 'warning',
    'Pending': 'warning',
    'Open': 'warning',
    'Late': 'warning',
    'On Leave': 'warning',
    'Absent': 'danger',
    'Rejected': 'danger',
    'Cancelled': 'neutral',
    'No check-out': 'danger',
    'Holiday': 'accent',
    'Not Marked': 'neutral',
}[status] || 'neutral');

export default { color, tones, space, radius, type, statusTone };
