// src/components/ui/EmptyState.js
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button } from 'react-native-paper';
import Icon from 'react-native-vector-icons/FontAwesome5';

export default function EmptyState({ icon = 'inbox', title = 'Nothing here yet', subtitle, actionLabel, onAction }) {
    return (
        <View style={styles.wrap}>
            <Icon name={icon} size={28} color="#9CA3AF" />
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : null}
            {actionLabel ? <Button mode="contained" onPress={onAction} style={{ marginTop: 8 }}>{actionLabel}</Button> : null}
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: { alignItems: 'center', padding: 24 },
    title: { fontSize: 16, fontWeight: '700', marginTop: 8 },
    sub: { fontSize: 13, color: '#6B7280', marginTop: 4, textAlign: 'center' },
});
