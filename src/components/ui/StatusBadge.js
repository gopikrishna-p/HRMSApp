// src/components/ui/StatusBadge.js
//
// One soft pill style for every status on the attendance screens: tinted background,
// darker text in the same colour, optional icon or dot. Use `small` for secondary tags
// (Late, Draft, work type) and the default size for the main status of a card.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome5';

export const BADGE_TONES = {
    success: { bg: '#ECFDF5', border: '#A7F3D0', text: '#047857' },
    warning: { bg: '#FFFBEB', border: '#FDE68A', text: '#B45309' },
    danger: { bg: '#FEF2F2', border: '#FECACA', text: '#B91C1C' },
    info: { bg: '#EFF6FF', border: '#BFDBFE', text: '#1D4ED8' },
    purple: { bg: '#F5F3FF', border: '#DDD6FE', text: '#6D28D9' },
    indigo: { bg: '#EEF2FF', border: '#C7D2FE', text: '#4338CA' },
    neutral: { bg: '#F3F4F6', border: '#E5E7EB', text: '#4B5563' },
};

// Attendance status -> tone, shared by all screens
export const STATUS_TONES = {
    'Present': 'success',
    'Half Day': 'success',
    'Complete': 'success',
    'Submitted': 'success',
    'Work From Home': 'purple',
    'WFH': 'purple',
    'On Site': 'info',
    'Office': 'info',
    'Checked in': 'warning',
    'Draft': 'warning',
    'Late': 'warning',
    'On Leave': 'warning',
    'Absent': 'danger',
    'No check-out': 'danger',
    'Holiday': 'indigo',
    'Not Marked': 'neutral',
};

export default function StatusBadge({ label, tone, icon, small = false, style }) {
    const t = BADGE_TONES[tone || STATUS_TONES[label]] || BADGE_TONES.neutral;
    return (
        <View style={[styles.badge, small && styles.badgeSmall, { backgroundColor: t.bg, borderColor: t.border }, style]}>
            {icon ? (
                <Icon name={icon} size={small ? 9 : 10} color={t.text} />
            ) : (
                <View style={[styles.dot, small && styles.dotSmall, { backgroundColor: t.text }]} />
            )}
            <Text style={[styles.text, small && styles.textSmall, { color: t.text }]} numberOfLines={1}>
                {label}
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 5,
        paddingHorizontal: 9,
        paddingVertical: 3,
        borderRadius: 12,
        borderWidth: 1,
    },
    badgeSmall: { paddingHorizontal: 7, paddingVertical: 2, gap: 4, borderRadius: 10 },
    dot: { width: 6, height: 6, borderRadius: 3 },
    dotSmall: { width: 5, height: 5, borderRadius: 2.5 },
    text: { fontSize: 11, fontWeight: '600' },
    textSmall: { fontSize: 10 },
});
