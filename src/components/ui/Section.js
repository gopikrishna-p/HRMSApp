// src/components/ui/Section.js
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import Icon from 'react-native-vector-icons/FontAwesome5';

export default function Section({ title, icon, tint, children }) {
    return (
        <View style={styles.wrap}>
            <View style={styles.header}>
                <View style={[styles.icon, { backgroundColor: `${tint}20` }]}>
                    <Icon name={icon} size={16} color={tint} />
                </View>
                <Text style={styles.title}>{title}</Text>
            </View>
            <View style={styles.body}>{children}</View>
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: { marginBottom: 18 },
    header: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
    icon: {
        width: 32, height: 32, borderRadius: 8,
        alignItems: 'center', justifyContent: 'center', marginRight: 8,
    },
    title: { fontSize: 16, fontWeight: '800' },
    body: { borderRadius: 12, overflow: 'hidden', elevation: 2, backgroundColor: '#FFF' },
});
