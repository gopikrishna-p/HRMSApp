// src/screens/employee/MyProjectsScreen.js
//
// Projects the signed-in employee is a member of (hrms.api.my_projects), with status and
// progress. Tapping a project opens its tasks.
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { listProjects } from '../../services/project.service';
import {
    Screen,
    Group,
    Row,
    StatusText,
    ProgressBar,
    EmptyState,
    Loading,
    Notice,
    color,
    space,
    type,
} from '../../components/ds';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PROJECT_TONE = { Open: 'info', Completed: 'success', Cancelled: 'neutral' };

// 'YYYY-MM-DD' -> '12 Oct' (or '12 Oct 2027' outside the current year)
const shortDate = (value) => {
    const [y, m, d] = String(value || '').slice(0, 10).split('-').map(Number);
    if (!y || !m || !d) {
        return null;
    }
    return `${d} ${MONTHS[m - 1]}${y !== new Date().getFullYear() ? ` ${y}` : ''}`;
};

const ProjectRow = ({ project, onPress }) => {
    const progress = Number(project.percent_complete) || 0;
    const status = project.status || 'Open';
    const tasks = Number(project.task_count || 0);
    const due = shortDate(project.expected_end_date);
    const subtitle = [
        tasks ? `${tasks} ${tasks === 1 ? 'task' : 'tasks'}` : 'No tasks',
        due ? `Due ${due}` : null,
        project.company,
    ].filter(Boolean).join('  ·  ');

    return (
        <Row
            title={project.project_name}
            titleLines={2}
            subtitle={subtitle}
            subtitleLines={1}
            meta={(
                <View style={styles.metaLine}>
                    <StatusText label={status} tone={PROJECT_TONE[status]} />
                    <View style={styles.barGroup}>
                        <View style={styles.bar}>
                            <ProgressBar value={progress} tone={status === 'Completed' || progress >= 100 ? 'success' : 'accent'} />
                        </View>
                        <Text style={styles.percent} numberOfLines={1}>{`${Math.round(progress)}%`}</Text>
                    </View>
                </View>
            )}
            onPress={onPress}
        />
    );
};

export default function MyProjectsScreen() {
    const navigation = useNavigation();
    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback(async () => {
        try {
            setLoading(true);
            const list = await listProjects({ q: '', limit: 200 });
            // project.service returns null (it does not throw) when the request fails; that must
            // not read as "no projects"
            if (!Array.isArray(list)) {
                throw new Error('Check your connection and try again.');
            }
            const safe = list
                .map((p) => ({
                    id: p.name || p.project || p.project_name,
                    name: p.name,
                    project_name: p.project_name || p.name,
                    status: p.status || 'Open',
                    company: p.company,
                    percent_complete: Number(p.percent_complete ?? p.progress ?? 0) || 0,
                    // display only
                    task_count: p.task_count,
                    expected_end_date: p.expected_end_date,
                }))
                .filter((p) => !!p.id);
            setProjects(safe);
            setLoadError(null);
        } catch (e) {
            console.log('listProjects error', e?.message || e);
            setLoadError(e?.message || 'Check your connection and try again.');
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

    return (
        <Screen refreshing={refreshing} onRefresh={onRefresh}>
            {loading && !refreshing && projects.length === 0 && !loadError ? (
                <Loading />
            ) : projects.length === 0 ? (
                loadError ? (
                    <EmptyState icon="alert-circle" title="Could not load projects" message={loadError} action="Try again" onAction={onRefresh} />
                ) : (
                    <EmptyState icon="folder" title="No projects yet" message="Projects you are added to appear here." />
                )
            ) : (
                <>
                    {loadError ? (
                        <Notice tone="danger" icon="alert-circle" title="Could not refresh">{loadError}</Notice>
                    ) : null}
                    <Group title={`${projects.length} ${projects.length === 1 ? 'project' : 'projects'}`}>
                        {projects.map((item) => (
                            <ProjectRow key={item.id} project={item} onPress={() => openProject(item)} />
                        ))}
                    </Group>
                </>
            )}
        </Screen>
    );
}

const styles = StyleSheet.create({
    // the bar and its percent move under the status together when a long status and 1.3x text
    // leave them no room
    metaLine: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space.md, rowGap: space.xs, marginTop: 2 },
    barGroup: { flex: 1, minWidth: 120, flexDirection: 'row', alignItems: 'center', gap: space.md },
    bar: { flex: 1, maxWidth: 160 },
    percent: { ...type.caption, color: color.textSecondary, fontVariant: ['tabular-nums'], minWidth: 32 },
});
