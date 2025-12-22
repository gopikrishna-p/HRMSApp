import React, { useCallback, useEffect, useState } from 'react';
import {
    View,
    ScrollView,
    StyleSheet,
    Alert,
    FlatList,
    RefreshControl,
    TouchableOpacity,
} from 'react-native';
import {
    Text,
    useTheme,
    ActivityIndicator,
    Chip,
    Dialog,
    Portal,
    Button as PaperButton,
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/FontAwesome5';
import AppHeader from '../../components/ui/AppHeader';
import Section from '../../components/ui/Section';
import ListItem from '../../components/ui/ListItem';
import StandupService from '../../services/standup.service';

const AdminStandupListScreen = ({ navigation }) => {
    const { custom } = useTheme();

    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [standups, setStandups] = useState([]);
    const [filteredStandups, setFilteredStandups] = useState([]);
    const [filterStatus, setFilterStatus] = useState('all');
    const [filterDepartment, setFilterDepartment] = useState('all');
    const [departments, setDepartments] = useState([]);
    const [showFilters, setShowFilters] = useState(false);
    const [dateRange, setDateRange] = useState({
        startDate: new Date(new Date().setDate(new Date().getDate() - 7)).toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0],
    });

    const fetchStandups = useCallback(async () => {
        setLoading(true);
        try {
            const result = await StandupService.getAllStandups(
                dateRange.startDate,
                dateRange.endDate,
                null,
                200
            );

            console.log('📋 All standups:', result);

            // Handle nested response structure: { data: { standups: [...] }, ... }
            let standupList = [];
            if (result?.data?.standups && Array.isArray(result.data.standups)) {
                standupList = result.data.standups;
            } else if (Array.isArray(result)) {
                standupList = result;
            } else if (Array.isArray(result.standups)) {
                standupList = result.standups;
            }
            setStandups(standupList);

            // Extract unique departments
            const depts = [...new Set(standupList.map(s => s.department).filter(Boolean))];
            setDepartments(depts);

            applyFilters(standupList, filterStatus, filterDepartment);
        } catch (error) {
            console.error('❌ Error fetching standups:', error);
            Alert.alert('Error', 'Failed to load standups');
        } finally {
            setLoading(false);
        }
    }, [dateRange, filterStatus, filterDepartment]);

    const applyFilters = (data, status, dept) => {
        let filtered = data;

        if (status !== 'all') {
            filtered = filtered.filter(s => s.status?.toLowerCase() === status.toLowerCase());
        }

        if (dept !== 'all') {
            filtered = filtered.filter(s => s.department === dept);
        }

        setFilteredStandups(filtered);
    };

    useEffect(() => {
        fetchStandups();
    }, [fetchStandups]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await fetchStandups();
        setRefreshing(false);
    }, [fetchStandups]);

    const getStatusColor = (status) => {
        switch (status?.toLowerCase()) {
            case 'submitted':
                return '#10B981';
            case 'draft':
                return '#F59E0B';
            case 'amended':
                return '#8B5CF6';
            default:
                return '#6B7280';
        }
    };

    const getStatusIcon = (status) => {
        switch (status?.toLowerCase()) {
            case 'submitted':
                return 'check-circle';
            case 'draft':
                return 'edit';
            case 'amended':
                return 'history';
            default:
                return 'circle';
        }
    };

    const renderStandupItem = ({ item }) => {
        // Debug the item structure
        const standupId = item.name || item.id || item.standup_id;
        const employeeDisplay = item.employee_name || standupId || 'Unknown';
        console.log('📄 Standup item:', { name: item.name, id: item.id, standup_id: item.standup_id });

        return (
            <ListItem
                title={employeeDisplay}
                subtitle={`${item.task_count || 0} tasks • ${item.status || 'Draft'}`}
                leftIcon="user"
                tint={custom.palette.primary}
                badge={item.task_count}
                rightContent={
                    <View style={styles.statusBadge}>
                        <Icon
                            name={getStatusIcon(item.status)}
                            size={14}
                            color={getStatusColor(item.status)}
                            style={{ marginRight: 6 }}
                        />
                        <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
                            {item.status || 'Draft'}
                        </Text>
                    </View>
                }
                onPress={() => {
                    if (standupId) {
                        navigation.navigate('AdminStandupDetail', {
                            standupId: standupId,
                            employeeName: item.employee_name,
                        });
                    } else {
                        Alert.alert('Error', 'Unable to load standup details - ID missing');
                    }
                }}
            />
        );
    };

    const renderEmptyState = () => (
        <View style={styles.emptyContainer}>
            <Icon name="inbox" size={48} color="#D1D5DB" />
            <Text style={styles.emptyText}>No standups found</Text>
            <Text style={styles.emptySubtext}>
                Try adjusting your filters or date range
            </Text>
        </View>
    );

    if (loading && standups.length === 0) {
        return (
            <View style={{ flex: 1, backgroundColor: custom.palette.background }}>
                <AppHeader
                    title="All Standups"
                    canGoBack={true}
                    onBack={() => navigation.goBack()}
                />
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <ActivityIndicator size="large" color={custom.palette.primary} />
                    <Text style={{ marginTop: 12, color: '#6B7280' }}>Loading standups...</Text>
                </View>
            </View>
        );
    }

    return (
        <View style={{ flex: 1, backgroundColor: custom.palette.background }}>
            <AppHeader
                title="All Standups"
                canGoBack={true}
                onBack={() => navigation.goBack()}
                rightIcon="filter"
                onRightPress={() => setShowFilters(!showFilters)}
            />

            <ScrollView
                style={styles.container}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        colors={[custom.palette.primary]}
                    />
                }
            >
                {/* Filters Section */}
                {showFilters && (
                    <View style={styles.filterSection}>
                        <Text style={styles.filterTitle}>Filter by Status</Text>
                        <View style={styles.chipGroup}>
                            {['all', 'submitted', 'draft', 'amended'].map(status => (
                                <Chip
                                    key={status}
                                    selected={filterStatus === status}
                                    onPress={() => setFilterStatus(status)}
                                    style={[
                                        styles.chip,
                                        filterStatus === status && { backgroundColor: custom.palette.primary },
                                    ]}
                                    textStyle={filterStatus === status ? { color: '#FFF' } : {}}
                                >
                                    {status.charAt(0).toUpperCase() + status.slice(1)}
                                </Chip>
                            ))}
                        </View>

                        {departments.length > 0 && (
                            <>
                                <Text style={styles.filterTitle}>Filter by Department</Text>
                                <View style={styles.chipGroup}>
                                    <Chip
                                        selected={filterDepartment === 'all'}
                                        onPress={() => setFilterDepartment('all')}
                                        style={[
                                            styles.chip,
                                            filterDepartment === 'all' && { backgroundColor: custom.palette.primary },
                                        ]}
                                        textStyle={filterDepartment === 'all' ? { color: '#FFF' } : {}}
                                    >
                                        All
                                    </Chip>
                                    {departments.map(dept => (
                                        <Chip
                                            key={dept}
                                            selected={filterDepartment === dept}
                                            onPress={() => setFilterDepartment(dept)}
                                            style={[
                                                styles.chip,
                                                filterDepartment === dept && {
                                                    backgroundColor: custom.palette.primary,
                                                },
                                            ]}
                                            textStyle={filterDepartment === dept ? { color: '#FFF' } : {}}
                                        >
                                            {dept}
                                        </Chip>
                                    ))}
                                </View>
                            </>
                        )}
                    </View>
                )}

                {/* Statistics Section */}
                {filteredStandups.length > 0 && (
                    <Section title="Summary" icon="chart-bar" tint={custom.palette.primary}>
                        <View style={styles.statsGrid}>
                            <View style={styles.statBox}>
                                <Text style={styles.statValue}>{filteredStandups.length}</Text>
                                <Text style={styles.statLabel}>Total</Text>
                            </View>
                            <View style={styles.statBox}>
                                <Text style={styles.statValue}>
                                    {filteredStandups.filter(s => s.status?.toLowerCase() === 'submitted').length}
                                </Text>
                                <Text style={styles.statLabel}>Submitted</Text>
                            </View>
                            <View style={styles.statBox}>
                                <Text style={styles.statValue}>
                                    {filteredStandups.filter(s => s.status?.toLowerCase() === 'draft').length}
                                </Text>
                                <Text style={styles.statLabel}>Draft</Text>
                            </View>
                        </View>
                    </Section>
                )}

                {/* Standups List */}
                <Section title="Standups" icon="list" tint={custom.palette.primary}>
                    {filteredStandups.length > 0 ? (
                        <FlatList
                            data={filteredStandups}
                            renderItem={renderStandupItem}
                            keyExtractor={item => item.name}
                            scrollEnabled={false}
                        />
                    ) : (
                        renderEmptyState()
                    )}
                </Section>
            </ScrollView>

            {/* Filter Portal - For mobile-friendly filter panel */}
            <Portal>
                <Dialog visible={false} onDismiss={() => { }} />
            </Portal>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingBottom: 20,
    },
    filterSection: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: '#F3F4F6',
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
    },
    filterTitle: {
        fontSize: 12,
        fontWeight: '700',
        color: '#374151',
        marginBottom: 8,
        textTransform: 'uppercase',
    },
    chipGroup: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 12,
    },
    chip: {
        backgroundColor: '#FFF',
        borderColor: '#E5E7EB',
        borderWidth: 1,
    },
    statsGrid: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        paddingVertical: 12,
    },
    statBox: {
        alignItems: 'center',
        paddingHorizontal: 12,
    },
    statValue: {
        fontSize: 20,
        fontWeight: '700',
        color: '#1F2937',
    },
    statLabel: {
        fontSize: 11,
        color: '#6B7280',
        marginTop: 4,
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        backgroundColor: '#F3F4F6',
    },
    statusText: {
        fontSize: 11,
        fontWeight: '600',
    },
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 40,
    },
    emptyText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#1F2937',
        marginTop: 12,
    },
    emptySubtext: {
        fontSize: 12,
        color: '#6B7280',
        marginTop: 4,
    },
});

export default AdminStandupListScreen;
