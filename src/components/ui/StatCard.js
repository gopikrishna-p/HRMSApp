// src/components/ui/StatCard.js
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import Icon from 'react-native-vector-icons/FontAwesome5';

export default function StatCard({ icon, tint, value, label }) {
    return (
        <View style={[styles.card, { backgroundColor: `${tint}1A` }]}>
            <View style={[styles.iconWrap, { backgroundColor: `${tint}26` }]}>
                <Icon name={icon} size={18} color={tint} />
            </View>
            <Text style={styles.value}>{value}</Text>
            <Text style={styles.label}>{label}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    card: { flex: 1, padding: 14, borderRadius: 14, alignItems: 'center', marginHorizontal: 4 },
    iconWrap: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
    value: { fontSize: 22, fontWeight: '800' },
    label: { fontSize: 11, marginTop: 2, textAlign: 'center', color: '#6B7280' },
});
