// src/screens/employee/MyProjectsScreen.js
import React, { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    RefreshControl,
    TouchableOpacity,
    View,
    Text,
    StyleSheet,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { listProjects } from '../../services/project.service';
import Icon from 'react-native-vector-icons/FontAwesome5';

const ProjectCard = ({ title, company, progress = 0, status = 'Open', onPress }) => {
    const getStatusColor = (status) => {
        switch (status) {
            case 'Open': return '#3B82F6';
            case 'Working': return '#8B5CF6';
            case 'Completed': return '#10B981';
            case 'Cancelled': return '#EF4444';
            default: return '#6B7280';
        }
    };

    const getProgressColor = (progress) => {
        if (progress >= 75) return '#10B981';
        if (progress >= 50) return '#8B5CF6';
        if (progress >= 25) return '#F59E0B';
        return '#3B82F6';
    };

    return (
        <TouchableOpacity onPress={onPress} style={styles.projectCard}>
            <View style={styles.cardHeader}>
                <View style={styles.cardTitleContainer}>
                    <View style={[styles.projectIcon, { backgroundColor: getStatusColor(status) + '20' }]}>
                        <Icon name="folder-open" size={18} color={getStatusColor(status)} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.projectTitle} numberOfLines={1}>{title}</Text>
                        {!!company && (
                            <View style={styles.companyContainer}>
                                <Icon name="building" size={11} color="#6B7280" />
                                <Text style={styles.companyText} numberOfLines={1}>{company}</Text>
                            </View>
                        )}
                    </View>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(status) + '15' }]}>
                    <Text style={[styles.statusText, { color: getStatusColor(status) }]}>{status}</Text>
                </View>
            </View>

            <View style={styles.progressSection}>
                <View style={styles.progressHeader}>
                    <Text style={styles.progressLabel}>Progress</Text>
                    <Text style={[styles.progressValue, { color: getProgressColor(progress) }]}>
                        {Math.round(progress)}%
                    </Text>
                </View>
                <View style={styles.progressBarContainer}>
                    <View
                        style={[
                            styles.progressBar,
                            {
                                width: `${Math.max(0, Math.min(100, progress))}%`,
                                backgroundColor: getProgressColor(progress),
                            }
                        ]}
                    />
                </View>
            </View>

            <View style={styles.cardFooter}>
                <Icon name="chevron-right" size={14} color="#9CA3AF" />
            </View>
        </TouchableOpacity>
    );
};

export default function MyProjectsScreen() {
    const navigation = useNavigation();
    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback(async () => {
        try {
            setLoading(true);
            const list = await listProjects({ q: '', limit: 200 });
            const safe = (list || [])
                .map((p) => ({
                    id: p.name || p.project || p.project_name,
                    name: p.name,
                    project_name: p.project_name || p.name,
                    status: p.status || 'Open',
                    company: p.company,
                    percent_complete: Number(p.percent_complete ?? p.progress ?? 0),
                }))
                .filter((p) => !!p.id);
            setProjects(safe);
        } catch (e) {
            console.log('listProjects error', e?.message || e);
            setProjects([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useFocusEffect(
        React.useCallback(() => {
            load();
            return () => { };
        }, [load])
    );

    const onRefresh = async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
    };

    const openProject = (p) => {
        navigation.navigate('MyTasksScreen', {
            projectId: p.id,
            projectName: p.project_name,
        });
    };

    if (loading) {
        return (
            <View style={styles.centerContainer}>
                <View style={styles.loadingCard}>
                    <ActivityIndicator size="large" color="#8B5CF6" />
                    <Text style={styles.loadingText}>Loading your projects…</Text>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View>
                    <Text style={styles.headerTitle}>My Projects</Text>
                    <Text style={styles.headerSubtitle}>{projects.length} active project{projects.length !== 1 ? 's' : ''}</Text>
                </View>
                <View style={styles.headerIcon}>
                    <Icon name="folder-open" size={24} color="#8B5CF6" />
                </View>
            </View>

            <FlatList
                data={projects}
                keyExtractor={(item) => item.id}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                contentContainerStyle={styles.listContainer}
                ListEmptyComponent={() => (
                    <View style={styles.emptyContainer}>
                        <View style={styles.emptyIcon}>
                            <Icon name="folder-open" size={48} color="#D1D5DB" />
                        </View>
                        <Text style={styles.emptyTitle}>No Projects Yet</Text>
                        <Text style={styles.emptySubtitle}>Projects assigned to you will appear here</Text>
                    </View>
                )}
                renderItem={({ item }) => (
                    <ProjectCard
                        title={item.project_name}
                        company={item.company}
                        progress={item.percent_complete}
                        status={item.status}
                        onPress={() => openProject(item)}
                    />
                )}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F9FAFB',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        paddingTop: 24,
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
        elevation: 2,
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
    },
    headerTitle: {
        fontSize: 24,
        fontWeight: '800',
        color: '#111827',
    },
    headerSubtitle: {
        fontSize: 13,
        color: '#6B7280',
        marginTop: 2,
    },
    headerIcon: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: '#8B5CF6' + '15',
        alignItems: 'center',
        justifyContent: 'center',
    },
    listContainer: {
        padding: 16,
        paddingBottom: 24,
    },
    projectCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        elevation: 2,
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 14,
    },
    cardTitleContainer: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        marginRight: 12,
    },
    projectIcon: {
        width: 40,
        height: 40,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    projectTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#111827',
        marginBottom: 2,
    },
    companyContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 2,
    },
    companyText: {
        fontSize: 12,
        color: '#6B7280',
        marginLeft: 6,
        flex: 1,
    },
    statusBadge: {
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 8,
    },
    statusText: {
        fontSize: 11,
        fontWeight: '700',
    },
    progressSection: {
        marginBottom: 10,
    },
    progressHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    progressLabel: {
        fontSize: 12,
        color: '#6B7280',
        fontWeight: '600',
    },
    progressValue: {
        fontSize: 14,
        fontWeight: '700',
    },
    progressBarContainer: {
        height: 8,
        backgroundColor: '#F3F4F6',
        borderRadius: 8,
        overflow: 'hidden',
    },
    progressBar: {
        height: 8,
        borderRadius: 8,
    },
    cardFooter: {
        alignItems: 'flex-end',
        marginTop: 4,
    },
    centerContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#F9FAFB',
        padding: 20,
    },
    loadingCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 32,
        alignItems: 'center',
        elevation: 2,
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
    },
    loadingText: {
        marginTop: 16,
        fontSize: 14,
        color: '#6B7280',
        fontWeight: '500',
    },
    emptyContainer: {
        alignItems: 'center',
        paddingVertical: 60,
    },
    emptyIcon: {
        width: 96,
        height: 96,
        borderRadius: 48,
        backgroundColor: '#F3F4F6',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#111827',
        marginBottom: 8,
    },
    emptySubtitle: {
        fontSize: 14,
        color: '#6B7280',
        textAlign: 'center',
    },
});