// src/components/project/ProjectCard.js
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

const normalizeProject = (input) => {
    // accept: { ...project } OR { project: { ... } }
    const p = input?.project ?? input ?? {};
    const percentRaw =
        p.percent_complete ??
        p.percentComplete ?? // just in case
        0;

    const percent = Number.isFinite(Number(percentRaw)) ? Math.max(0, Math.min(100, Number(percentRaw))) : 0;

    return {
        name: p.name || '',
        title: p.project_name || p.name || 'Untitled Project',
        status: p.status || 'Open',
        percent,
        membersCount: p.members_count ?? p.membersCount ?? p.members?.length ?? 0,
    };
};

export default function ProjectCard({ project, onPress, onManageMembers }) {
    const data = normalizeProject(project);

    return (
        <Pressable onPress={onPress} style={styles.card}>
            <View style={styles.row}>
                <Text style={styles.title} numberOfLines={1}>
                    {data.title}
                </Text>
                <Text style={[styles.status, data.status === 'Open' ? styles.open : styles.other]}>
                    {data.status}
                </Text>
            </View>

            <View style={styles.progressWrap}>
                <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${data.percent}%` }]} />
                </View>
                <Text style={styles.percent}>{data.percent.toFixed(0)}%</Text>
            </View>

            <View style={styles.meta}>
                <Text style={styles.metaText}>Members: {data.membersCount}</Text>
            </View>

            {!!onManageMembers && (
                <Pressable onPress={onManageMembers} style={styles.membersBtn}>
                    <Text style={styles.membersBtnText}>Manage Members</Text>
                </Pressable>
            )}
        </Pressable>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: '#fff',
        padding: 14,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#eef0f3',
        marginTop: 12,
    },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    title: { fontSize: 16, fontWeight: '700', flex: 1, marginRight: 8 },
    status: { fontSize: 12, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, overflow: 'hidden' },
    open: { backgroundColor: '#ecfeff', color: '#0369a1' },
    other: { backgroundColor: '#eef2ff', color: '#3730a3' },
    progressWrap: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 8 },
    progressTrack: { flex: 1, height: 8, backgroundColor: '#eef0f3', borderRadius: 9999 },
    progressFill: { height: 8, backgroundColor: '#0ea5e9', borderRadius: 9999 },
    percent: { fontSize: 12, color: '#666' },
    meta: { marginTop: 8 },
    metaText: { fontSize: 12, color: '#6b7280' },
    membersBtn: { marginTop: 10, backgroundColor: '#f3f4f6', paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
    membersBtnText: { fontSize: 13, fontWeight: '700', color: '#111827' },
});
