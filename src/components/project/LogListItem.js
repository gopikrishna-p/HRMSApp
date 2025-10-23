import React from 'react';
import { View, StyleSheet } from 'react-native';
import { List, Text } from 'react-native-paper';

export default function LogListItem({ log }) {
    return (
        <List.Item
            title={log.title}
            description={() => (
                <View style={styles.desc}>
                    {log.description ? <Text variant="bodySmall">{log.description}</Text> : null}
                    <View style={styles.row}>
                        {log.status ? <Text variant="labelSmall">Status: {log.status}</Text> : null}
                        {log.duration_hours != null ? (
                            <Text variant="labelSmall" style={styles.badge}>
                                {Number(log.duration_hours).toFixed(2)} h
                            </Text>
                        ) : null}
                    </View>
                    <Text variant="labelSmall" style={{ opacity: 0.6 }}>
                        {log.started_at ? `Started: ${String(log.started_at)}` : ''}
                        {log.ended_at ? `   Ended: ${String(log.ended_at)}` : ''}
                    </Text>
                </View>
            )}
            left={(props) => <List.Icon {...props} icon="clipboard-text" />}
        />
    );
}

const styles = StyleSheet.create({
    desc: { gap: 6 },
    row: { flexDirection: 'row', gap: 12, marginTop: 4 },
    badge: { paddingHorizontal: 6 },
});
