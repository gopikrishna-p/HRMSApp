// src/components/ui/ComingSoon.js
//
// Reusable placeholder screen for features that are registered in navigation
// but not yet implemented. Replaces the bare "title + subtitle" stubs that
// previously rendered for AttendanceAnalytics, TodayEmployeeAnalytics,
// AttendanceManagement, Reports, Payslip, ForgotPassword.
//
// Phase 4 of ADMIN_EMPLOYEE_PARITY_AUDIT.md. Either remove the dashboard
// menu items that point to stubs, or route them to this component so admin
// gets a friendly, on-roadmap message instead of a blank white screen.

import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { colors } from '../../theme/colors';

export default function ComingSoon({
    title,
    description,
    suggestion,
    icon = 'tools',
    accent = colors.primary,
    action,
}) {
    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.wrap}>
            <View style={[styles.iconWrap, { backgroundColor: accent + '20' }]}>
                <Icon name={icon} size={32} color={accent} />
            </View>

            <Text style={styles.title}>{title}</Text>
            {description ? <Text style={styles.description}>{description}</Text> : null}

            {suggestion ? (
                <View style={styles.suggestionCard}>
                    <Icon name="info-circle" size={14} color={colors.info} />
                    <Text style={styles.suggestionText}>{suggestion}</Text>
                </View>
            ) : null}

            {action ? (
                <TouchableOpacity
                    style={[styles.actionButton, { backgroundColor: accent }]}
                    onPress={action.onPress}
                    activeOpacity={0.85}
                >
                    <Text style={styles.actionLabel}>{action.label}</Text>
                </TouchableOpacity>
            ) : null}

            <Text style={styles.footer}>
                This screen is on the roadmap. Track progress in
                {' '}ADMIN_EMPLOYEE_PARITY_AUDIT.md.
            </Text>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    wrap: {
        flexGrow: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 28,
    },
    iconWrap: {
        width: 84,
        height: 84,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 18,
    },
    title: {
        fontSize: 20,
        fontWeight: '800',
        color: colors.textPrimary,
        textAlign: 'center',
    },
    description: {
        fontSize: 14,
        color: colors.textSecondary,
        textAlign: 'center',
        marginTop: 8,
        lineHeight: 20,
    },
    suggestionCard: {
        flexDirection: 'row',
        backgroundColor: colors.infoLight,
        borderRadius: 12,
        padding: 12,
        marginTop: 20,
        gap: 10,
        maxWidth: 360,
    },
    suggestionText: {
        flex: 1,
        fontSize: 13,
        color: colors.darkGray,
        lineHeight: 18,
    },
    actionButton: {
        marginTop: 20,
        paddingHorizontal: 22,
        paddingVertical: 12,
        borderRadius: 12,
    },
    actionLabel: {
        color: colors.white,
        fontWeight: '700',
        fontSize: 14,
    },
    footer: {
        fontSize: 11,
        color: colors.textDisabled,
        textAlign: 'center',
        marginTop: 28,
        maxWidth: 320,
    },
});
