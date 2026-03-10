/**
 * Shared Admin Screen Styles
 * Provides consistent UI patterns across all admin screens
 */
import { StyleSheet, Platform } from 'react-native';

// Unified Color Palette for Admin Screens
export const ADMIN_COLORS = {
    // Primary brand colors
    primary: '#6366F1',         // Indigo - main accent
    primaryLight: '#EEF2FF',    // Light indigo background
    
    // Status colors (consistent across all screens)
    success: '#10B981',         // Green - approved, present
    successLight: '#D1FAE5',
    danger: '#EF4444',          // Red - rejected, absent
    dangerLight: '#FEE2E2',
    warning: '#F59E0B',         // Amber - pending, WFH
    warningLight: '#FEF3C7',
    info: '#2196F3',            // Blue - on-site, info
    infoLight: '#E3F2FD',
    
    // Neutral colors
    background: '#F8FAFC',      // Page background
    surface: '#FFFFFF',         // Card background
    border: '#E5E7EB',          // Borders
    borderLight: '#F3F4F6',     // Light borders
    
    // Text colors
    textPrimary: '#111827',     // Main text
    textSecondary: '#6B7280',   // Secondary text
    textMuted: '#9CA3AF',       // Muted text
    textWhite: '#FFFFFF',       // Text on dark backgrounds
    
    // Category-specific colors (for different sections)
    leave: '#8B5CF6',           // Purple - leave related
    leaveLight: '#F3E8FF',
    expense: '#10B981',         // Green - expense/finance
    expenseLight: '#D1FAE5',
    travel: '#06B6D4',          // Cyan - travel
    travelLight: '#CFFAFE',
    wfh: '#F59E0B',             // Amber - WFH
    wfhLight: '#FEF3C7',
    onsite: '#2196F3',          // Blue - on-site
    onsiteLight: '#E3F2FD',
    attendance: '#6366F1',      // Indigo - attendance
    attendanceLight: '#EEF2FF',
};

// Common shadow styles
export const SHADOWS = {
    card: {
        elevation: 2,
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
    },
    light: {
        elevation: 1,
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 2,
        shadowOffset: { width: 0, height: 1 },
    },
    medium: {
        elevation: 3,
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 3 },
    },
};

// Common Admin Styles
export const adminStyles = StyleSheet.create({
    // ===== CONTAINERS =====
    screenContainer: {
        flex: 1,
        backgroundColor: ADMIN_COLORS.background,
    },
    contentContainer: {
        padding: 16,
        paddingBottom: 32,
    },
    scrollContent: {
        flexGrow: 1,
        padding: 16,
        paddingBottom: 32,
    },

    // ===== CARDS =====
    card: {
        backgroundColor: ADMIN_COLORS.surface,
        borderRadius: 12,
        padding: 14,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: ADMIN_COLORS.borderLight,
        ...SHADOWS.card,
    },
    cardWithAccent: {
        backgroundColor: ADMIN_COLORS.surface,
        borderRadius: 12,
        padding: 14,
        marginBottom: 12,
        borderLeftWidth: 4,
        borderWidth: 1,
        borderColor: ADMIN_COLORS.borderLight,
        ...SHADOWS.card,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 10,
    },
    cardTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: ADMIN_COLORS.textPrimary,
        flex: 1,
    },
    cardSubtitle: {
        fontSize: 12,
        color: ADMIN_COLORS.textSecondary,
        marginTop: 2,
    },
    cardBody: {
        marginTop: 8,
    },
    cardFooter: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center',
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: ADMIN_COLORS.borderLight,
    },

    // ===== TABS =====
    tabContainer: {
        flexDirection: 'row',
        backgroundColor: ADMIN_COLORS.surface,
        paddingHorizontal: 4,
        marginBottom: 16,
        borderRadius: 12,
        ...SHADOWS.light,
    },
    tab: {
        flex: 1,
        paddingVertical: 12,
        alignItems: 'center',
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
    },
    tabActive: {
        borderBottomColor: ADMIN_COLORS.primary,
    },
    tabText: {
        fontSize: 13,
        fontWeight: '500',
        color: ADMIN_COLORS.textSecondary,
    },
    tabTextActive: {
        color: ADMIN_COLORS.primary,
        fontWeight: '600',
    },
    tabBadge: {
        backgroundColor: ADMIN_COLORS.danger,
        borderRadius: 10,
        minWidth: 20,
        height: 20,
        paddingHorizontal: 6,
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 6,
    },
    tabBadgeText: {
        fontSize: 11,
        fontWeight: '600',
        color: ADMIN_COLORS.textWhite,
    },

    // ===== STAT CARDS =====
    statsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    statCard: {
        width: '48%',
        backgroundColor: ADMIN_COLORS.surface,
        borderRadius: 12,
        padding: 14,
        marginBottom: 10,
        ...SHADOWS.card,
    },
    statCardSmall: {
        width: '31%',
        backgroundColor: ADMIN_COLORS.surface,
        borderRadius: 10,
        padding: 12,
        marginBottom: 10,
        alignItems: 'center',
        ...SHADOWS.light,
    },
    statIcon: {
        width: 36,
        height: 36,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
    },
    statValue: {
        fontSize: 22,
        fontWeight: '700',
        color: ADMIN_COLORS.textPrimary,
    },
    statLabel: {
        fontSize: 11,
        color: ADMIN_COLORS.textSecondary,
        marginTop: 4,
    },

    // ===== BADGES =====
    badge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
    },
    badgeText: {
        fontSize: 11,
        fontWeight: '600',
    },
    badgePending: {
        backgroundColor: ADMIN_COLORS.warningLight,
    },
    badgePendingText: {
        color: ADMIN_COLORS.warning,
    },
    badgeApproved: {
        backgroundColor: ADMIN_COLORS.successLight,
    },
    badgeApprovedText: {
        color: ADMIN_COLORS.success,
    },
    badgeRejected: {
        backgroundColor: ADMIN_COLORS.dangerLight,
    },
    badgeRejectedText: {
        color: ADMIN_COLORS.danger,
    },
    
    // ===== BUTTONS =====
    buttonRow: {
        flexDirection: 'row',
        gap: 8,
    },
    button: {
        flex: 1,
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
    },
    buttonPrimary: {
        backgroundColor: ADMIN_COLORS.primary,
    },
    buttonSuccess: {
        backgroundColor: ADMIN_COLORS.success,
    },
    buttonDanger: {
        backgroundColor: ADMIN_COLORS.danger,
    },
    buttonOutline: {
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: ADMIN_COLORS.border,
    },
    buttonText: {
        fontSize: 13,
        fontWeight: '600',
        color: ADMIN_COLORS.textWhite,
    },
    buttonTextOutline: {
        color: ADMIN_COLORS.textSecondary,
    },
    buttonIcon: {
        marginRight: 6,
    },

    // ===== DETAIL ROWS =====
    detailRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 6,
    },
    detailIcon: {
        width: 24,
        alignItems: 'center',
    },
    detailText: {
        fontSize: 12,
        color: ADMIN_COLORS.textSecondary,
        flex: 1,
        marginLeft: 8,
    },
    detailValue: {
        fontSize: 12,
        color: ADMIN_COLORS.textPrimary,
        fontWeight: '500',
    },

    // ===== LIST ITEMS =====
    listItem: {
        backgroundColor: ADMIN_COLORS.surface,
        borderRadius: 12,
        padding: 14,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: ADMIN_COLORS.borderLight,
        ...SHADOWS.light,
    },
    listItemHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    listItemTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: ADMIN_COLORS.textPrimary,
    },
    listItemSubtitle: {
        fontSize: 12,
        color: ADMIN_COLORS.textSecondary,
        marginTop: 2,
    },

    // ===== AVATARS =====
    avatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    avatarSmall: {
        width: 36,
        height: 36,
        borderRadius: 18,
    },
    avatarText: {
        fontSize: 16,
        fontWeight: '600',
        color: ADMIN_COLORS.textWhite,
    },

    // ===== EMPTY STATE =====
    emptyState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
        paddingHorizontal: 32,
    },
    emptyIcon: {
        marginBottom: 16,
    },
    emptyTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: ADMIN_COLORS.textPrimary,
        textAlign: 'center',
        marginBottom: 8,
    },
    emptySubtitle: {
        fontSize: 13,
        color: ADMIN_COLORS.textSecondary,
        textAlign: 'center',
    },

    // ===== MODALS =====
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modalContent: {
        backgroundColor: ADMIN_COLORS.surface,
        borderRadius: 14,
        padding: 20,
        width: '100%',
        maxWidth: 400,
        maxHeight: '80%',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    modalTitle: {
        fontSize: 17,
        fontWeight: '600',
        color: ADMIN_COLORS.textPrimary,
    },
    modalCloseBtn: {
        padding: 4,
    },
    modalBody: {
        marginBottom: 16,
    },
    modalFooter: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 10,
    },

    // ===== SEARCH/FILTER =====
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: ADMIN_COLORS.surface,
        borderRadius: 10,
        paddingHorizontal: 12,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: ADMIN_COLORS.borderLight,
    },
    searchInput: {
        flex: 1,
        paddingVertical: 10,
        fontSize: 14,
        color: ADMIN_COLORS.textPrimary,
    },
    searchIcon: {
        marginRight: 8,
    },
    filterRow: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 12,
    },
    filterChip: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: ADMIN_COLORS.surface,
        borderWidth: 1,
        borderColor: ADMIN_COLORS.border,
    },
    filterChipActive: {
        backgroundColor: ADMIN_COLORS.primaryLight,
        borderColor: ADMIN_COLORS.primary,
    },
    filterChipText: {
        fontSize: 12,
        color: ADMIN_COLORS.textSecondary,
    },
    filterChipTextActive: {
        color: ADMIN_COLORS.primary,
        fontWeight: '600',
    },

    // ===== DATE PICKER =====
    dateNavContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: ADMIN_COLORS.surface,
        borderRadius: 10,
        padding: 8,
        marginBottom: 16,
        ...SHADOWS.light,
    },
    dateNavBtn: {
        padding: 8,
    },
    dateNavText: {
        flex: 1,
        textAlign: 'center',
        fontSize: 14,
        fontWeight: '600',
        color: ADMIN_COLORS.textPrimary,
    },

    // ===== LOADING/REFRESH =====
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
    },
    loadingText: {
        marginTop: 12,
        fontSize: 13,
        color: ADMIN_COLORS.textSecondary,
    },

    // ===== SECTION HEADERS =====
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
        marginTop: 8,
    },
    sectionTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: ADMIN_COLORS.textPrimary,
        marginLeft: 8,
    },
    sectionDivider: {
        height: 1,
        backgroundColor: ADMIN_COLORS.borderLight,
        flex: 1,
        marginLeft: 12,
    },

    // ===== INPUTS =====
    inputContainer: {
        marginBottom: 14,
    },
    inputLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: ADMIN_COLORS.textSecondary,
        marginBottom: 6,
    },
    input: {
        backgroundColor: ADMIN_COLORS.surface,
        borderWidth: 1,
        borderColor: ADMIN_COLORS.border,
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 14,
        color: ADMIN_COLORS.textPrimary,
    },
    inputFocused: {
        borderColor: ADMIN_COLORS.primary,
    },
    textArea: {
        minHeight: 80,
        textAlignVertical: 'top',
    },
});

// Helper function to get status color
export const getStatusColor = (status) => {
    const statusColors = {
        'Pending': { bg: ADMIN_COLORS.warningLight, text: ADMIN_COLORS.warning },
        'Approved': { bg: ADMIN_COLORS.successLight, text: ADMIN_COLORS.success },
        'Rejected': { bg: ADMIN_COLORS.dangerLight, text: ADMIN_COLORS.danger },
        'Present': { bg: ADMIN_COLORS.successLight, text: ADMIN_COLORS.success },
        'Absent': { bg: ADMIN_COLORS.dangerLight, text: ADMIN_COLORS.danger },
        'On Leave': { bg: ADMIN_COLORS.leaveLight, text: ADMIN_COLORS.leave },
        'Work From Home': { bg: ADMIN_COLORS.wfhLight, text: ADMIN_COLORS.wfh },
        'WFH': { bg: ADMIN_COLORS.wfhLight, text: ADMIN_COLORS.wfh },
        'On Site': { bg: ADMIN_COLORS.onsiteLight, text: ADMIN_COLORS.onsite },
        'Holiday': { bg: '#FEE2E2', text: '#DC2626' },
        'Weekend': { bg: '#E5E7EB', text: '#6B7280' },
    };
    return statusColors[status] || { bg: ADMIN_COLORS.borderLight, text: ADMIN_COLORS.textSecondary };
};

// Helper to get category color (for different approval types)
export const getCategoryColor = (category) => {
    const categoryColors = {
        'leave': { primary: ADMIN_COLORS.leave, light: ADMIN_COLORS.leaveLight },
        'wfh': { primary: ADMIN_COLORS.wfh, light: ADMIN_COLORS.wfhLight },
        'onsite': { primary: ADMIN_COLORS.onsite, light: ADMIN_COLORS.onsiteLight },
        'expense': { primary: ADMIN_COLORS.expense, light: ADMIN_COLORS.expenseLight },
        'travel': { primary: ADMIN_COLORS.travel, light: ADMIN_COLORS.travelLight },
        'attendance': { primary: ADMIN_COLORS.attendance, light: ADMIN_COLORS.attendanceLight },
    };
    return categoryColors[category] || { primary: ADMIN_COLORS.primary, light: ADMIN_COLORS.primaryLight };
};

// Get avatar background color based on name
export const getAvatarColor = (name) => {
    const colors = [
        '#6366F1', '#8B5CF6', '#EC4899', '#EF4444', '#F59E0B',
        '#10B981', '#06B6D4', '#2196F3', '#7C3AED', '#F43F5E'
    ];
    if (!name) return colors[0];
    const index = name.charCodeAt(0) % colors.length;
    return colors[index];
};

// Get initials from name
export const getInitials = (name) => {
    if (!name) return '?';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0].substring(0, 2).toUpperCase();
};

export default adminStyles;
