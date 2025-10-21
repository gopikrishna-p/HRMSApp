// src/screens/admin/WFHSettingsScreen.js
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
    View,
    StyleSheet,
    FlatList,
    RefreshControl,
    TouchableOpacity,
    Alert,
} from 'react-native';
import { Text, ActivityIndicator, Switch, Snackbar, Searchbar } from 'react-native-paper';
import Icon from 'react-native-vector-icons/FontAwesome5';
import AttendanceService from '../../services/attendance.service';

const WFHSettingsScreen = () => {
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [rows, setRows] = useState([]);
    const [filter, setFilter] = useState('all'); // 'all' | 'active' | 'eligible' | 'inactive'
    const [searchQuery, setSearchQuery] = useState('');
    const [snack, setSnack] = useState({ visible: false, msg: '' });
    const [updating, setUpdating] = useState(null); // employee_id being updated

    const fetchData = useCallback(async (isRefresh = false) => {
        try {
            isRefresh ? setRefreshing(true) : setLoading(true);
            const res = await AttendanceService.getEmployeeWFHList();
            if (res.success && res.data?.message) {
                setRows(res.data.message);
            } else {
                setSnack({ visible: true, msg: res.message || 'Failed to load WFH list' });
            }
        } finally {
            isRefresh ? setRefreshing(false) : setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const toggle = async (employee_id, value) => {
        setUpdating(employee_id);
        const res = await AttendanceService.toggleWFHEligibility(employee_id, value);
        
        if (res.success) {
            setRows((prev) =>
                prev.map((r) =>
                    r.name === employee_id ? { ...r, custom_wfh_eligible: value ? 1 : 0 } : r
                )
            );
            setSnack({
                visible: true,
                msg: `WFH eligibility ${value ? 'enabled' : 'disabled'} for ${
                    rows.find((r) => r.name === employee_id)?.employee_name || 'employee'
                }`,
            });
        } else {
            setSnack({ visible: true, msg: res.message || 'Failed to update' });
        }
        
        setUpdating(null);
    };

    // Filter and search logic
    const filteredRows = useMemo(() => {
        let filtered = rows;

        // Apply status filter
        if (filter === 'active') {
            filtered = filtered.filter((r) => r.status === 'Active');
        } else if (filter === 'eligible') {
            filtered = filtered.filter((r) => !!r.custom_wfh_eligible);
        } else if (filter === 'inactive') {
            filtered = filtered.filter((r) => r.status !== 'Active');
        }

        // Apply search filter
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

    // Calculate stats
    const stats = useMemo(() => {
        const total = rows.length;
        const active = rows.filter((r) => r.status === 'Active').length;
        const eligible = rows.filter((r) => !!r.custom_wfh_eligible).length;
        const eligibleActive = rows.filter(
            (r) => r.status === 'Active' && !!r.custom_wfh_eligible
        ).length;
        return { total, active, eligible, eligibleActive };
    }, [rows]);

    const renderItem = ({ item }) => {
        const isEligible = !!item.custom_wfh_eligible;
        const isActive = item.status === 'Active';
        const isUpdating = updating === item.name;

        return (
            <View style={styles.employeeItem}>
                <View style={styles.employeeInfo}>
                    <View style={styles.employeeHeader}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.employeeName}>{item.employee_name}</Text>
                            <Text style={styles.employeeId}>ID: {item.name}</Text>
                        </View>

                        <View
                            style={[
                                styles.statusBadge,
                                { backgroundColor: isActive ? '#10B981' : '#9CA3AF' },
                            ]}
                        >
                            <Text style={styles.statusText}>{item.status || 'Unknown'}</Text>
                        </View>
                    </View>

                    <View style={styles.wfhControl}>
                        <View style={styles.wfhLabel}>
                            <Icon
                                name="home"
                                size={14}
                                color={isEligible ? '#6366F1' : '#9CA3AF'}
                            />
                            <Text
                                style={[
                                    styles.wfhText,
                                    { color: isEligible ? '#6366F1' : '#6B7280' },
                                ]}
                            >
                                Work From Home Eligible
                            </Text>
                        </View>

                        {isUpdating ? (
                            <ActivityIndicator size="small" color="#6366F1" />
                        ) : (
                            <Switch
                                value={isEligible}
                                onValueChange={(val) => toggle(item.name, val)}
                                color="#6366F1"
                                disabled={!isActive}
                            />
                        )}
                    </View>

                    {!isActive && (
                        <View style={styles.infoBox}>
                            <Icon name="info-circle" size={12} color="#F59E0B" />
                            <Text style={styles.infoText}>
                                Cannot modify WFH settings for inactive employees
                            </Text>
                        </View>
                    )}
                </View>
            </View>
        );
    };

    return (
        <View style={styles.container}>
            {/* Header with Stats */}
            <View style={styles.headerContainer}>
                <View style={styles.statsRow}>
                    <View style={styles.statItem}>
                        <Icon name="users" size={16} color="#6366F1" />
                        <View style={styles.statContent}>
                            <Text style={styles.statNumber}>{stats.total}</Text>
                            <Text style={styles.statLabel}>Total</Text>
                        </View>
                    </View>

                    <View style={styles.statItem}>
                        <Icon name="check-circle" size={16} color="#10B981" />
                        <View style={styles.statContent}>
                            <Text style={[styles.statNumber, { color: '#10B981' }]}>
                                {stats.active}
                            </Text>
                            <Text style={styles.statLabel}>Active</Text>
                        </View>
                    </View>

                    <View style={styles.statItem}>
                        <Icon name="home" size={16} color="#6366F1" />
                        <View style={styles.statContent}>
                            <Text style={[styles.statNumber, { color: '#6366F1' }]}>
                                {stats.eligible}
                            </Text>
                            <Text style={styles.statLabel}>WFH Eligible</Text>
                        </View>
                    </View>

                    <View style={styles.statItem}>
                        <Icon name="user-check" size={16} color="#8B5CF6" />
                        <View style={styles.statContent}>
                            <Text style={[styles.statNumber, { color: '#8B5CF6' }]}>
                                {stats.eligibleActive}
                            </Text>
                            <Text style={styles.statLabel}>Active+WFH</Text>
                        </View>
                    </View>
                </View>

                {/* Filter Tabs */}
                <View style={styles.filterContainer}>
                    <TouchableOpacity
                        style={[styles.filterTab, filter === 'all' && styles.filterTabActive]}
                        onPress={() => setFilter('all')}
                        activeOpacity={0.8}
                    >
                        <Text
                            style={[
                                styles.filterText,
                                filter === 'all' && styles.filterTextActive,
                            ]}
                        >
                            All ({rows.length})
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.filterTab, filter === 'active' && styles.filterTabActive]}
                        onPress={() => setFilter('active')}
                        activeOpacity={0.8}
                    >
                        <Text
                            style={[
                                styles.filterText,
                                filter === 'active' && styles.filterTextActive,
                            ]}
                        >
                            Active ({stats.active})
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.filterTab, filter === 'eligible' && styles.filterTabActive]}
                        onPress={() => setFilter('eligible')}
                        activeOpacity={0.8}
                    >
                        <Text
                            style={[
                                styles.filterText,
                                filter === 'eligible' && styles.filterTextActive,
                            ]}
                        >
                            WFH ({stats.eligible})
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.filterTab, filter === 'inactive' && styles.filterTabActive]}
                        onPress={() => setFilter('inactive')}
                        activeOpacity={0.8}
                    >
                        <Text
                            style={[
                                styles.filterText,
                                filter === 'inactive' && styles.filterTextActive,
                            ]}
                        >
                            Inactive
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Search Bar */}
            <View style={styles.searchContainer}>
                <Searchbar
                    placeholder="Search by name or ID..."
                    onChangeText={setSearchQuery}
                    value={searchQuery}
                    style={styles.searchBar}
                    iconColor="#6366F1"
                />
            </View>

            {/* Content */}
            {loading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator color="#6366F1" size="large" />
                    <Text style={styles.loadingText}>Loading employee data...</Text>
                </View>
            ) : filteredRows.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <Icon name="search" size={48} color="#9CA3AF" />
                    <Text style={styles.emptyTitle}>No Employees Found</Text>
                    <Text style={styles.emptyText}>
                        {searchQuery
                            ? `No results for "${searchQuery}"`
                            : `No ${filter === 'all' ? '' : filter + ' '}employees to display`}
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={filteredRows}
                    keyExtractor={(item) => item.name}
                    renderItem={renderItem}
                    contentContainerStyle={styles.listContent}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={() => fetchData(true)}
                        />
                    }
                />
            )}

            <Snackbar
                visible={snack.visible}
                onDismiss={() => setSnack({ visible: false, msg: '' })}
                duration={2500}
            >
                {snack.msg}
            </Snackbar>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F8FAFC',
    },

    headerContainer: {
        backgroundColor: 'white',
        paddingTop: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
    },
    statsRow: {
        flexDirection: 'row',
        gap: 8,
        paddingHorizontal: 16,
        marginBottom: 12,
    },
    statItem: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F8FAFC',
        padding: 10,
        borderRadius: 10,
        gap: 8,
    },
    statContent: {
        flex: 1,
    },
    statNumber: {
        fontSize: 18,
        fontWeight: '700',
        color: '#374151',
    },
    statLabel: {
        fontSize: 9,
        color: '#6B7280',
        marginTop: 2,
        fontWeight: '500',
    },

    searchContainer: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: 'white',
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
    },
    searchBar: {
        backgroundColor: '#F8FAFC',
        elevation: 0,
    },

    filterContainer: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingBottom: 12,
        gap: 8,
    },
    filterTab: {
        flex: 1,
        paddingVertical: 8,
        paddingHorizontal: 8,
        backgroundColor: 'white',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        alignItems: 'center',
    },
    filterTabActive: {
        backgroundColor: '#6366F1',
        borderColor: '#6366F1',
    },
    filterText: {
        fontSize: 11,
        fontWeight: '600',
        color: '#374151',
    },
    filterTextActive: {
        color: 'white',
    },

    listContent: {
        padding: 16,
        paddingBottom: 24,
    },

    employeeItem: {
        backgroundColor: 'white',
        marginBottom: 12,
        borderRadius: 12,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        overflow: 'hidden',
    },
    employeeInfo: {
        padding: 16,
    },
    employeeHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    employeeName: {
        fontSize: 16,
        fontWeight: '600',
        color: '#111827',
    },
    employeeId: {
        fontSize: 12,
        color: '#6B7280',
        marginTop: 2,
    },
    statusBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    statusText: {
        fontSize: 10,
        color: 'white',
        fontWeight: '600',
    },

    wfhControl: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12,
        paddingHorizontal: 12,
        backgroundColor: '#F8FAFC',
        borderRadius: 8,
    },
    wfhLabel: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flex: 1,
    },
    wfhText: {
        fontSize: 14,
        fontWeight: '600',
    },

    infoBox: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 12,
        padding: 10,
        backgroundColor: '#FEF3C7',
        borderRadius: 8,
        borderLeftWidth: 3,
        borderLeftColor: '#F59E0B',
    },
    infoText: {
        flex: 1,
        fontSize: 12,
        color: '#92400E',
        fontWeight: '500',
    },

    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 40,
    },
    loadingText: {
        marginTop: 12,
        fontSize: 16,
        color: '#6B7280',
    },

    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 60,
    },
    emptyTitle: {
        fontSize: 20,
        fontWeight: '600',
        color: '#6B7280',
        marginTop: 16,
    },
    emptyText: {
        fontSize: 14,
        color: '#9CA3AF',
        textAlign: 'center',
        marginTop: 8,
        paddingHorizontal: 32,
    },
});

export default WFHSettingsScreen;