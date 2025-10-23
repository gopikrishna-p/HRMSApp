// src/screens/employee/MyProjectsScreen.js
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, TouchableOpacity, View, Text } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { listProjects } from '../../services/project.service';

const ProjectCard = ({ title, company, progress = 0, status = 'Open', onPress }) => (
    <TouchableOpacity
        onPress={onPress}
        style={{
            backgroundColor: '#fff',
            marginHorizontal: 16,
            marginVertical: 8,
            borderRadius: 16,
            padding: 16,
            elevation: 2,
        }}
    >
        <Text style={{ fontSize: 16, fontWeight: '600' }}>{title}</Text>
        {!!company && <Text style={{ color: '#666', marginTop: 4 }}>{company}</Text>}
        <View style={{ flexDirection: 'row', marginTop: 10, alignItems: 'center' }}>
            <View style={{ flex: 1, height: 8, backgroundColor: '#eee', borderRadius: 8, overflow: 'hidden' }}>
                <View style={{ width: `${Math.max(0, Math.min(100, progress))}%`, height: 8, backgroundColor: '#111827' }} />
            </View>
            <Text style={{ marginLeft: 8 }}>{Math.round(progress)}%</Text>
        </View>
        <Text style={{ marginTop: 8, fontSize: 12, color: '#888' }}>Status: {status}</Text>
    </TouchableOpacity>
);

export default function MyProjectsScreen() {
    const navigation = useNavigation();
    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const load = async () => {
        try {
            setLoading(true);
            // Backend should return projects visible to the logged-in employee
            const list = await listProjects({ q: '', limit: 200 });
            // Make it defensive with fallbacks
            const safe = (list || []).map(p => ({
                id: p.name || p.project || p.project_name,
                name: p.name,
                project_name: p.project_name || p.name,
                status: p.status || 'Open',
                company: p.company,
                percent_complete: Number(p.percent_complete ?? p.progress ?? 0),
            })).filter(p => !!p.id);
            setProjects(safe);
        } catch (e) {
            console.log('listProjects error', e?.message || e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);
    useFocusEffect(useCallback(() => { load(); }, []));

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
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator />
                <Text style={{ marginTop: 8 }}>Loading your projects…</Text>
            </View>
        );
    }

    return (
        <FlatList
            data={projects}
            keyExtractor={(item) => item.id}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            ListHeaderComponent={() => (
                <Text style={{ fontSize: 22, fontWeight: '700', margin: 16 }}>My Projects</Text>
            )}
            ListEmptyComponent={() => (
                <View style={{ alignItems: 'center', marginTop: 48 }}>
                    <Text>No projects assigned yet.</Text>
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
    );
}
