// src/components/ui/PreselectChip.js
//
// Reusable "Filtered to {employeeId}" chip rendered at the top of the
// approval screens (WFH / OnSite / Expense / Travel / Leave / Comp) when
// they're deep-linked from EmployeeManagement's Quick Actions row with a
// `preselectEmployee` route param. Tap → clears the filter.
//
// Was previously inlined identically in 4 screens; consolidated here so
// styling and icon changes propagate everywhere automatically.

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { colors } from '../../theme/colors';

export default function PreselectChip({ value, onClear }) {
    if (!value) return null;
    return (
        <TouchableOpacity
            style={styles.chip}
            onPress={onClear}
            activeOpacity={0.7}
        >
            <Icon name="user" size={11} color={colors.primary} />
            <Text style={styles.text}>Filtered to {value}</Text>
            <Icon name="times" size={11} color={colors.primary} />
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        alignSelf: 'flex-start',
        backgroundColor: colors.primaryLight,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 14,
        marginHorizontal: 12,
        marginTop: 8,
        marginBottom: 4,
    },
    text: {
        fontSize: 12,
        fontWeight: '600',
        color: colors.primary,
    },
});
