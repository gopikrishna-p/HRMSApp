// src/screens/admin/OnSiteSettingsScreen.js
//
// Per-employee on-site eligibility (hrms.api.toggle_on_site_eligibility). Eligible employees
// may choose "On Site" as their work type when they check in.
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, StyleSheet, Switch, ActivityIndicator } from 'react-native';
import AttendanceService from '../../services/attendance.service';
import showToast from '../../utils/Toast';
import {
    Screen,
    Group,
    Row,
    Avatar,
    Segmented,
    SearchField,
    EmptyState,
    Loading,
    Tag,
    Notice,
    color,
    space,
} from '../../components/ds';

const OnSiteSettingsScreen = () => {
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [rows, setRows] = useState([]);
    const [filter, setFilter] = useState('all'); // 'all' | 'eligible' | 'office'
    const [searchQuery, setSearchQuery] = useState('');
    const [updating, setUpdating] = useState({}); // employee_id -> true while its switch is being saved
    const [error, setError] = useState('');

    const fetchData = useCallback(async (isRefresh = false) => {
        try {
            isRefresh ? setRefreshing(true) : setLoading(true);
            const res = await AttendanceService.getEmployeeOnSiteList();
            if (res.success && Array.isArray(res.data?.message)) {
                setRows(res.data.message);
                setError('');
            } else {
                const msg = res.message || 'Please try again';
                setError(msg);
                showToast({ type: 'error', text1: 'Could not load employees', text2: msg });
            }
        } catch (err) {
            setError(err?.message || 'Please try again');
        } finally {
            isRefresh ? setRefreshing(false) : setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const toggle = async (employee_id, value) => {
        if (updating[employee_id]) {
            return;
        }
        setUpdating((all) => ({ ...all, [employee_id]: true }));
        const res = await AttendanceService.toggleOnSiteEligibility(employee_id, value);

        if (res.success) {
            setRows((prev) =>
                prev.map((r) =>
                    r.name === employee_id ? { ...r, custom_on_site_eligible: value ? 1 : 0 } : r
                )
            );
            showToast({
                type: 'success',
                text1: rows.find((r) => r.name === employee_id)?.employee_name || 'Employee',
                text2: value ? 'On-site check-in allowed' : 'On-site check-in turned off',
            });
        } else {
            showToast({ type: 'error', text1: 'Not saved', text2: res.message || 'Failed to update' });
        }

        setUpdating((all) => {
            const next = { ...all };
            delete next[employee_id];
            return next;
        });
    };

    // Filter and search logic
    const filteredRows = useMemo(() => {
        let filtered = rows;

        if (filter === 'eligible') {
            filtered = filtered.filter((r) => !!r.custom_on_site_eligible);
        } else if (filter === 'office') {
            filtered = filtered.filter((r) => !r.custom_on_site_eligible);
        }

        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(
                (r) =>
                    r.employee_name?.toLowerCase().includes(query) ||
                    r.name?.toLowerCase().includes(query)
            );
        }

        return filtered;
    }, [rows, filter, searchQuery]);

    const stats = useMemo(() => {
        const total = rows.length;
        const eligible = rows.filter((r) => !!r.custom_on_site_eligible).length;
        return { total, eligible, office: total - eligible };
    }, [rows]);

    const hasInactive = filteredRows.some((r) => r.status !== 'Active');

    return (
        <View style={styles.flex}>
            <View style={styles.toolbar}>
                <Segmented
                    value={filter}
                    onChange={setFilter}
                    options={[
                        { value: 'all', label: 'All', count: stats.total },
                        { value: 'eligible', label: 'On-site', count: stats.eligible },
                        { value: 'office', label: 'Office', count: stats.office },
                    ]}
                />
                <SearchField value={searchQuery} onChangeText={setSearchQuery} placeholder="Search by name or ID" style={styles.search} />
            </View>

            {loading ? (
                <Loading />
            ) : (
                <Screen refreshing={refreshing} onRefresh={() => fetchData(true)}>
                    {error && rows.length > 0 ? (
                        <Notice tone="danger" icon="alert-circle" title="Could not refresh" onPress={() => fetchData(true)}>
                            {`${error} Tap to try again.`}
                        </Notice>
                    ) : null}
                    {filter === 'all' && !searchQuery && rows.length > 0 ? (
                        <Notice tone="neutral" icon="info">
                            Anyone can request On Site for specific dates; an approved request covers those dates only.
                            Turn on-site on here only for people who work on site most days.
                        </Notice>
                    ) : null}

                    {error && rows.length === 0 ? (
                        <EmptyState icon="alert-circle" title="Could not load employees" message={error} action="Try again" onAction={() => fetchData(false)} />
                    ) : filteredRows.length === 0 ? (
                        <EmptyState
                            icon="users"
                            title="No employees"
                            message={searchQuery ? `No one matches “${searchQuery}”.` : 'No one in this group.'}
                        />
                    ) : (
                        <Group
                            title={`${filteredRows.length} ${filteredRows.length === 1 ? 'employee' : 'employees'}`}
                            footer={`On-site on: can check in On Site any day.${hasInactive ? ' Inactive employees can’t be changed.' : ''}`}
                        >
                            {filteredRows.map((item) => {
                                const isEligible = !!item.custom_on_site_eligible;
                                const isActive = item.status === 'Active';
                                return (
                                    <Row
                                        key={item.name}
                                        left={<Avatar name={item.employee_name} />}
                                        title={item.employee_name}
                                        subtitle={[item.name, (item.department || '').replace(' - DG', '')].filter(Boolean).join('  ·  ')}
                                        meta={!isActive ? <Tag label={item.status || 'Unknown'} />
                                            : item.on_site_request_today && !isEligible ? <Tag label="On-site approved today" tone="info" /> : null}
                                        right={updating[item.name] ? (
                                            <ActivityIndicator size="small" color={color.textTertiary} style={styles.spinner} />
                                        ) : (
                                            <Switch
                                                value={isEligible}
                                                onValueChange={(val) => toggle(item.name, val)}
                                                disabled={!isActive}
                                                trackColor={{ false: '#D0D5DD', true: color.accent }}
                                                thumbColor={color.surface}
                                                ios_backgroundColor="#D0D5DD"
                                            />
                                        )}
                                    />
                                );
                            })}
                        </Group>
                    )}
                </Screen>
            )}
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
    spinner: { width: 48 },
});

export default OnSiteSettingsScreen;
