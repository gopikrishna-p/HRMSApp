// src/components/ui/ListItem.js
import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import Icon from 'react-native-vector-icons/FontAwesome5';

export default function ListItem({ title, subtitle, leftIcon, tint, badge, onPress }) {
    const { custom } = useTheme();
    return (
        <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
            <View style={[styles.left, { backgroundColor: `${tint}26` }]}>
                <Icon name={leftIcon} size={18} color={tint} />
            </View>
            <View style={styles.center}>
                <Text style={styles.title}>{title}</Text>
                {subtitle ? (
                    <Text style={[styles.subtitle, { color: custom.palette.textSecondary }]}>{subtitle}</Text>
                ) : null}
            </View>
            {badge ? (
                <View style={styles.badge}>
                    <Text style={styles.badgeText}>{badge}</Text>
                </View>
            ) : null}
            <Icon name="chevron-right" size={14} color="#9CA3AF" />
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row', alignItems: 'center', padding: 14,
        borderBottomWidth: 1, borderBottomColor: '#F3F4F6', backgroundColor: '#FFF',
    },
    left: {
        width: 42, height: 42, borderRadius: 10, alignItems: 'center',
        justifyContent: 'center', marginRight: 12,
    },
    center: { flex: 1 },
    title: { fontSize: 15, fontWeight: '700' },
    subtitle: { fontSize: 12, marginTop: 2 },
    badge: { backgroundColor: '#EF4444', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2, marginRight: 8 },
    badgeText: { color: '#FFF', fontSize: 10, fontWeight: '700' },
});
