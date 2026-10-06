// src/screens/admin/WFHSettingsScreen.js
//
// Each employee's standing WFH arrangement (hrms.api.set_wfh_mode):
//   Office        - works from the office; WFH only on dates of an approved request
//   WFH allowed   - may work from home any day
//   Permanent WFH - works from home permanently; no WFH deduction
// Payroll deducts 30% of a day's pay for every WFH day, except for permanent WFH.
import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AttendanceService from '../../services/attendance.service';
import showToast from '../../utils/Toast';
import {
    Screen,
    Group,
    Row,
    Avatar,
    Segmented,
    SearchField,
    Sheet,
    Button,
    EmptyState,
    Loading,
    Notice,
    Tag,
    Icon,
    color,
    space,
    type,
} from '../../components/ds';

const MODES = [
    { value: 'office', label: 'Office', description: 'Works from the office. WFH only on dates of an approved request.' },
    { value: 'allowed', label: 'WFH allowed', description: 'May work from home on any day. 30% of a day’s pay is deducted per WFH day.' },
    { value: 'permanent', label: 'Permanent WFH', description: 'Works from home permanently. No WFH deduction.' },
];
const MODE_LABEL = Object.fromEntries(MODES.map((m) => [m.value, m.label]));

const modeOf = (row) => row.wfh_mode || (row.custom_is_permanent_wfh ? 'permanent' : row.custom_wfh_eligible ? 'allowed' : 'office');

const WFHSettingsScreen = () => {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [filter, setFilter] = useState('all');
    const [query, setQuery] = useState('');
    const [editing, setEditing] = useState(null); // employee row being changed
    const [choice, setChoice] = useState('office');
    const [saving, setSaving] = useState(false);

    const load = useCallback(async (isRefresh = false) => {
        isRefresh ? setRefreshing(true) : setLoading(true);
        try {
            const res = await AttendanceService.getEmployeeWFHList();
            if (res.success && Array.isArray(res.data?.message)) {
                setRows(res.data.message);
            } else {
                showToast({ type: 'error', text1: 'Could not load employees', text2: res.message || 'Please try again' });
            }
        } finally {
            isRefresh ? setRefreshing(false) : setLoading(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            load(false);
        }, [load])
    );

    const counts = useMemo(() => {
        const c = { all: rows.length, office: 0, allowed: 0, permanent: 0 };
        rows.forEach((r) => {
            c[modeOf(r)] += 1;
        });
        return c;
    }, [rows]);

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        return rows.filter((r) => (filter === 'all' || modeOf(r) === filter)
            && (!q || r.employee_name?.toLowerCase().includes(q) || r.name?.toLowerCase().includes(q)));
    }, [rows, filter, query]);

    const openEditor = (row) => {
        setEditing(row);
        setChoice(modeOf(row));
    };

    const save = async () => {
        if (!editing || choice === modeOf(editing)) {
            setEditing(null);
            return;
        }
        setSaving(true);
        try {
            const res = await AttendanceService.setWFHMode(editing.name, choice);
            if (res.success) {
                setRows((prev) => prev.map((r) => (r.name === editing.name
                    ? {
                        ...r,
                        wfh_mode: choice,
                        custom_wfh_eligible: choice !== 'office' ? 1 : 0,
                        custom_is_permanent_wfh: choice === 'permanent' ? 1 : 0,
                        wfh_today: choice !== 'office' || r.wfh_request_today,
                    }
                    : r)));
                showToast({ type: 'success', text1: editing.employee_name, text2: MODE_LABEL[choice] });
                setEditing(null);
            } else {
                showToast({ type: 'error', text1: 'Not saved', text2: res.message || 'Failed to update' });
            }
        } finally {
            setSaving(false);
        }
    };

    return (
        <View style={styles.flex}>
            <View style={styles.toolbar}>
                <Segmented
                    value={filter}
                    onChange={setFilter}
                    options={[
                        { value: 'all', label: 'All', count: counts.all },
                        { value: 'office', label: 'Office', count: counts.office },
                        { value: 'allowed', label: 'WFH', count: counts.allowed },
                        { value: 'permanent', label: 'Permanent', count: counts.permanent },
                    ]}
                />
                <SearchField value={query} onChangeText={setQuery} placeholder="Search employees" style={styles.search} />
            </View>

            {loading ? (
                <Loading />
            ) : (
                <Screen refreshing={refreshing} onRefresh={() => load(true)}>
                    {filter === 'all' && !query ? (
                        <Notice tone="neutral" icon="info">
                            Anyone can request WFH for specific dates; an approved request covers those dates only.
                            Every WFH day is deducted at 30% of a day's pay, except for permanent WFH.
                        </Notice>
                    ) : null}

                    {visible.length === 0 ? (
                        <EmptyState icon="users" title="No employees" message={query ? `No one matches “${query}”.` : 'No one in this group.'} />
                    ) : (
                        <Group title={`${visible.length} ${visible.length === 1 ? 'employee' : 'employees'}`}>
                            {visible.map((r) => (
                                <Row
                                    key={r.name}
                                    left={<Avatar name={r.employee_name} />}
                                    title={r.employee_name}
                                    subtitle={[r.name, (r.department || '').replace(' - DG', '')].filter(Boolean).join('  ·  ')}
                                    meta={r.wfh_request_today && modeOf(r) === 'office' ? <Tag label="WFH approved today" tone="purple" /> : null}
                                    value={MODE_LABEL[modeOf(r)]}
                                    valueTone={modeOf(r) === 'office' ? undefined : 'purple'}
                                    onPress={() => openEditor(r)}
                                />
                            ))}
                        </Group>
                    )}
                </Screen>
            )}

            <Sheet
                visible={Boolean(editing)}
                title={editing?.employee_name}
                subtitle="Work from home arrangement"
                onClose={() => !saving && setEditing(null)}
                footer={(
                    <>
                        <Button title="Cancel" variant="secondary" onPress={() => setEditing(null)} disabled={saving} style={styles.flex} />
                        <Button title="Save" onPress={save} loading={saving} style={styles.flex} />
                    </>
                )}
            >
                {MODES.map((m) => {
                    const active = choice === m.value;
                    return (
                        <Pressable key={m.value} onPress={() => setChoice(m.value)} style={[styles.option, active && styles.optionActive]}>
                            <View style={[styles.radio, active && styles.radioActive]}>
                                {active ? <View style={styles.radioDot} /> : null}
                            </View>
                            <View style={styles.flex}>
                                <Text style={type.bodyStrong}>{m.label}</Text>
                                <Text style={styles.optionText}>{m.description}</Text>
                            </View>
                        </Pressable>
                    );
                })}
                {editing?.wfh_request_today ? (
                    <View style={styles.sheetNote}>
                        <Icon name="calendar" size={14} color={color.textTertiary} />
                        <Text style={styles.sheetNoteText}>Has an approved WFH request for today.</Text>
                    </View>
                ) : null}
            </Sheet>
        </View>
    );
};

const styles = StyleSheet.create({
    flex: { flex: 1 },
    toolbar: {
        backgroundColor: color.surface,
        paddingHorizontal: space.lg,
        paddingTop: space.md,
        paddingBottom: space.md,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: color.border,
    },
    search: { marginTop: space.md },
    option: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: space.md,
        padding: space.md,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: color.border,
        marginBottom: space.sm,
    },
    optionActive: { borderColor: color.accent, backgroundColor: color.accentSoft },
    optionText: { ...type.secondary, marginTop: 2, lineHeight: 18 },
    radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: '#D0D5DD', alignItems: 'center', justifyContent: 'center', marginTop: 1 },
    radioActive: { borderColor: color.accent },
    radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: color.accent },
    sheetNote: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: space.xs, marginBottom: space.sm },
    sheetNoteText: { ...type.caption },
});

export default WFHSettingsScreen;
