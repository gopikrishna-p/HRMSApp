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
    Dialog,
    Portal,
    TextInput,
    Button as PaperButton,
    Chip,
    Divider,
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/FontAwesome5';
import AppHeader from '../../components/ui/AppHeader';
import Section from '../../components/ui/Section';
import ListItem from '../../components/ui/ListItem';
import StandupService from '../../services/standup.service';

const AdminStandupDetailScreen = ({ navigation, route }) => {
    const { standupId, employeeName } = route.params || {};
    const { custom } = useTheme();

    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [standup, setStandup] = useState(null);
    const [showRemarksDialog, setShowRemarksDialog] = useState(false);
    const [remarks, setRemarks] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);

    const fetchStandupDetail = useCallback(async () => {
        if (!standupId) {
            console.error('❌ No standup ID provided');
            setError('Standup ID is missing');
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);
        try {
            console.log('🔍 Fetching standup with ID:', standupId);
            const result = await StandupService.getStandupDetail(standupId);
            console.log('📄 Standup detail:', result);

            const data = result.data || result;
            setStandup(data);
            setRemarks(data?.manager_remarks || '');
        } catch (error) {
            console.error('❌ Error fetching standup:', error);
            setError(error.message || 'Failed to load standup details');
            Alert.alert('Error', error.message || 'Failed to load standup details');
        } finally {
            setLoading(false);
        }
    }, [standupId]);

    useEffect(() => {
        fetchStandupDetail();
    }, [fetchStandupDetail]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await fetchStandupDetail();
        setRefreshing(false);
    }, [fetchStandupDetail]);

    const handleSubmitRemarks = async () => {
        if (!remarks.trim()) {
            Alert.alert('Validation', 'Please enter manager remarks');
            return;
        }

        setSubmitting(true);
        try {
            const result = await StandupService.amendStandup(standupId, {
                manager_remarks: remarks,
                status: 'Submitted',
            });

            console.log('✅ Remarks submitted:', result);
            Alert.alert('Success', 'Remarks added successfully');
            setShowRemarksDialog(false);
            await fetchStandupDetail();
        } catch (error) {
            console.error('❌ Error submitting remarks:', error);
            Alert.alert('Error', 'Failed to submit remarks');
        } finally {
            setSubmitting(false);
        }
    };

    const handleSubmitStandup = async () => {
        Alert.alert(
            'Submit Standup',
            'Are you sure you want to submit this standup? This will lock it from further edits.',
            [
                { text: 'Cancel', onPress: () => { }, style: 'cancel' },
                {
                    text: 'Submit',
                    onPress: async () => {
                        setSubmitting(true);
                        try {
                            const result = await StandupService.submitStandup(standupId, remarks || null);
                            console.log('✅ Standup submitted:', result);
                            Alert.alert('Success', 'Standup submitted successfully');
                            await fetchStandupDetail();
                        } catch (error) {
                            console.error('❌ Error submitting standup:', error);
                            Alert.alert('Error', error.message || 'Failed to submit standup');
                        } finally {
                            setSubmitting(false);
                        }
                    },
                    style: 'destructive',
                },
            ]
        );
    };

    const handleAmendStandup = async () => {
        Alert.alert(
            'Amend Standup',
            'This will unlock the standup for editing. A new version will be created.',
            [
                { text: 'Cancel', onPress: () => { }, style: 'cancel' },
                {
                    text: 'Amend',
                    onPress: async () => {
                        setSubmitting(true);
                        try {
                            const result = await StandupService.amendStandup(standupId);
                            console.log('✅ Standup amended:', result);
                            const amendedId = result.data?.amended_standup_id || result.amended_standup_id;
                            Alert.alert('Success', 'Standup unlocked for editing', [
                                {
                                    text: 'View Amended Version',
                                    onPress: () => {
                                        navigation.replace('AdminStandupDetail', {
                                            standupId: amendedId,
                                            employeeName: employeeName,
                                        });
                                    },
                                },
                            ]);
                        } catch (error) {
                            console.error('❌ Error amending standup:', error);
                            Alert.alert('Error', error.message || 'Failed to amend standup');
                        } finally {
                            setSubmitting(false);
                        }
                    },
                },
            ]
        );
    };

    const renderTaskItem = ({ item }) => {
        const completionPercent = item.completion_percentage || 0;
        const isCarriedForward = item.carry_forward === 1 || item.carry_forward === true;

        return (
            <View style={styles.taskCard}>
                {/* Header Row: Employee + Designation */}
                <View style={styles.taskHeader}>
                    <View style={styles.employeeInfo}>
                        <Icon name="user-circle" size={18} color={custom.palette.primary} />
                        <View style={styles.employeeText}>
                            <Text style={styles.employeeName}>{item.employee || 'Unknown'}</Text>
                            <Text style={styles.designation}>{item.designation || 'N/A'}</Text>
                        </View>
                    </View>
                    <Chip
                        icon={completionPercent >= 80 ? 'check' : 'clock'}
                        style={{
                            backgroundColor: completionPercent >= 80 ? '#D1FAE5' : '#FEF3C7',
                        }}
                        textStyle={{
                            color: completionPercent >= 80 ? '#065F46' : '#92400E',
                            fontWeight: '600',
                            fontSize: 11,
                        }}
                    >
                        {completionPercent}%
                    </Chip>
                </View>

                <Divider style={{ marginVertical: 10 }} />

                {/* Department + Task Status */}
                <View style={styles.taskMetaRow}>
                    <View style={styles.metaItem}>
                        <Icon name="building" size={13} color="#6B7280" />
                        <Text style={styles.metaLabel}>Department</Text>
                        <Text style={styles.metaValue}>{item.department || 'N/A'}</Text>
                    </View>
                    <View style={styles.metaItem}>
                        <Icon
                            name={
                                item.task_status?.toLowerCase() === 'completed'
                                    ? 'check-circle'
                                    : item.task_status?.toLowerCase() === 'in progress'
                                        ? 'hourglass-half'
                                        : 'circle'
                            }
                            size={13}
                            color={
                                item.task_status?.toLowerCase() === 'completed'
                                    ? '#10B981'
                                    : item.task_status?.toLowerCase() === 'in progress'
                                        ? '#3B82F6'
                                        : '#F59E0B'
                            }
                        />
                        <Text style={styles.metaLabel}>Task Status</Text>
                        <Text
                            style={[
                                styles.metaValue,
                                {
                                    color:
                                        item.task_status?.toLowerCase() === 'completed'
                                            ? '#10B981'
                                            : item.task_status?.toLowerCase() === 'in progress'
                                                ? '#3B82F6'
                                                : '#F59E0B',
                                },
                            ]}
                        >
                            {item.task_status || 'Draft'}
                        </Text>
                    </View>
                </View>

                <Divider style={{ marginVertical: 10 }} />

                {/* Task Title */}
                <View style={styles.taskContent}>
                    <Icon name="tasks" size={13} color={custom.palette.primary} style={{ marginRight: 8 }} />
                    <View style={{ flex: 1 }}>
                        <Text style={styles.sectionLabel}>Task Title</Text>
                        <Text style={styles.taskTitle}>{item.task_title || 'N/A'}</Text>
                    </View>
                </View>

                {/* Planned Output */}
                <View style={styles.taskContent}>
                    <Icon name="bullseye" size={13} color="#8B5CF6" style={{ marginRight: 8 }} />
                    <View style={{ flex: 1 }}>
                        <Text style={styles.sectionLabel}>Planned Output</Text>
                        <Text style={styles.taskDescription}>{item.planned_output || 'Not specified'}</Text>
                    </View>
                </View>

                {/* Actual Work Done */}
                <View style={styles.taskContent}>
                    <Icon name="check" size={13} color="#10B981" style={{ marginRight: 8 }} />
                    <View style={{ flex: 1 }}>
                        <Text style={styles.sectionLabel}>Actual Work Done</Text>
                        <Text style={styles.taskDescription}>{item.actual_work_done || 'Not updated yet'}</Text>
                    </View>
                </View>

                {/* Progress Bar */}
                <View style={styles.progressContainer}>
                    <View style={styles.progressBarSmall}>
                        <View
                            style={[
                                styles.progressFillSmall,
                                {
                                    width: `${completionPercent}%`,
                                    backgroundColor:
                                        completionPercent >= 80
                                            ? '#10B981'
                                            : completionPercent >= 50
                                                ? '#F59E0B'
                                                : '#EF4444',
                                },
                            ]}
                        />
                    </View>
                    <Text style={styles.progressText}>
                        {completionPercent}% Complete
                    </Text>
                </View>

                {/* Carry Forward Badge + Next Working Date */}
                {isCarriedForward && (
                    <View style={styles.carryForwardSection}>
                        <Chip
                            icon="arrow-right"
                            style={{ backgroundColor: '#EFF6FF' }}
                            textStyle={{ color: '#1E40AF', fontWeight: '600', fontSize: 11 }}
                        >
                            Carry Forward
                        </Chip>
                        {item.next_working_date && (
                            <View style={styles.nextDateBox}>
                                <Icon name="calendar-alt" size={12} color="#1E40AF" />
                                <Text style={styles.nextDateText}>
                                    {new Date(item.next_working_date).toLocaleDateString('en-IN')}
                                </Text>
                            </View>
                        )}
                    </View>
                )}
            </View>
        );
    };

    if (error || !standupId) {
        return (
            <View style={{ flex: 1, backgroundColor: custom.palette.background }}>
                <AppHeader
                    title="Standup Details"
                    canGoBack={true}
                    onBack={() => navigation.goBack()}
                />
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 }}>
                    <Icon name="exclamation-circle" size={48} color="#EF4444" />
                    <Text style={{ marginTop: 12, fontSize: 16, fontWeight: '600', color: '#1F2937', textAlign: 'center' }}>
                        {error || 'Unable to load standup'}
                    </Text>
                    <Text style={{ marginTop: 8, fontSize: 13, color: '#6B7280', textAlign: 'center' }}>
                        {error || 'The standup ID is missing or invalid'}
                    </Text>
                </View>
            </View>
        );
    }

    if (loading && !standup) {
        return (
            <View style={{ flex: 1, backgroundColor: custom.palette.background }}>
                <AppHeader
                    title="Standup Details"
                    canGoBack={true}
                    onBack={() => navigation.goBack()}
                />
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <ActivityIndicator size="large" color={custom.palette.primary} />
                    <Text style={{ marginTop: 12, color: '#6B7280' }}>Loading details...</Text>
                </View>
            </View>
        );
    }

    if (!standup) {
        return (
            <View style={{ flex: 1, backgroundColor: custom.palette.background }}>
                <AppHeader
                    title="Standup Details"
                    canGoBack={true}
                    onBack={() => navigation.goBack()}
                />
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <Icon name="exclamation-circle" size={48} color="#EF4444" />
                    <Text style={{ marginTop: 12, fontSize: 16, fontWeight: '600', color: '#1F2937' }}>
                        Standup not found
                    </Text>
                </View>
            </View>
        );
    }

    const tasks = standup.tasks || [];
    // Calculate average completion percentage from all tasks
    const completionRate = tasks.length > 0 
      ? Math.round(tasks.reduce((sum, t) => sum + (t.completion_percentage || 0), 0) / tasks.length)
      : 0;

    return (
        <View style={{ flex: 1, backgroundColor: custom.palette.background }}>
            <AppHeader
                title="Standup Details"
                canGoBack={true}
                onBack={() => navigation.goBack()}
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

                {/* Progress Section */}
                <Section title="Task Progress" icon="tasks" tint="#8B5CF6">
                    <View style={styles.progressBox}>
                        <View style={styles.progressRow}>
                            <View style={styles.progressItem}>
                                <Text style={styles.progressNumber}>{tasks.length}</Text>
                                <Text style={styles.progressLabel}>Total Tasks</Text>
                            </View>
                            <View style={styles.progressItem}>
                                <Text style={[styles.progressNumber, { color: '#10B981' }]}>
                                    {completionRate}%
                                </Text>
                                <Text style={styles.progressLabel}>Average</Text>
                            </View>
                            <View style={styles.progressItem}>
                                <Text style={[styles.progressNumber, { color: '#8B5CF6' }]}>
                                    {tasks.length > 0 ? tasks.filter(t => t.completion_percentage >= 80).length : 0}
                                </Text>
                                <Text style={styles.progressLabel}>On Track</Text>
                            </View>
                        </View>

                        <View style={styles.progressBarContainer}>
                            <View style={styles.progressBarLabel}>
                                <Text style={styles.progressBarText}>Completion Rate</Text>
                                <Chip
                                    icon={completionRate >= 80 ? 'check' : 'clock'}
                                    style={{
                                        backgroundColor: completionRate >= 80 ? '#D1FAE5' : '#FEF3C7',
                                    }}
                                    textStyle={{
                                        color: completionRate >= 80 ? '#065F46' : '#92400E',
                                        fontWeight: '600',
                                    }}
                                >
                                    {completionRate}%
                                </Chip>
                            </View>
                            <View style={styles.progressBar}>
                                <View
                                    style={[
                                        styles.progressFill,
                                        {
                                            width: `${completionRate}%`,
                                            backgroundColor:
                                                completionRate >= 80
                                                    ? '#10B981'
                                                    : completionRate >= 50
                                                        ? '#F59E0B'
                                                        : '#EF4444',
                                        },
                                    ]}
                                />
                            </View>
                        </View>
                    </View>
                </Section>

                {/* Tasks Section */}
                {tasks.length > 0 && (
                    <Section title="Tasks" icon="list" tint={custom.palette.primary}>
                        <FlatList
                            data={tasks}
                            renderItem={renderTaskItem}
                            keyExtractor={(item, idx) => idx.toString()}
                            scrollEnabled={false}
                        />
                    </Section>
                )}

                {/* Manager Remarks Section */}
                <Section title="Manager Remarks" icon="comments" tint="#F59E0B">
                    <View style={styles.remarksBox}>
                        {standup.manager_remarks ? (
                            <>
                                <Text style={styles.remarksText}>{standup.manager_remarks}</Text>
                                <TouchableOpacity
                                    style={styles.editButton}
                                    onPress={() => setShowRemarksDialog(true)}
                                >
                                    <Icon name="edit" size={14} color={custom.palette.primary} />
                                    <Text
                                        style={[styles.editButtonText, { color: custom.palette.primary }]}
                                    >
                                        Edit
                                    </Text>
                                </TouchableOpacity>
                            </>
                        ) : (
                            <TouchableOpacity
                                style={styles.addRemarksButton}
                                onPress={() => setShowRemarksDialog(true)}
                            >
                                <Icon name="plus" size={16} color={custom.palette.primary} />
                                <Text
                                    style={[
                                        styles.addRemarksText,
                                        { color: custom.palette.primary },
                                    ]}
                                >
                                    Add Manager Remarks
                                </Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </Section>

                {/* Action Buttons Section */}
                {standup && (
                    <View style={styles.actionSection}>
                        {standup.docstatus === 0 && !standup.is_submitted && standup.task_count > 0 && (
                            <PaperButton
                                mode="contained"
                                onPress={handleSubmitStandup}
                                loading={submitting}
                                disabled={submitting}
                                style={styles.submitButton}
                            >
                                Submit Standup
                            </PaperButton>
                        )}
                        {standup.docstatus === 1 && standup.is_submitted && (
                            <PaperButton
                                mode="outlined"
                                onPress={handleAmendStandup}
                                loading={submitting}
                                disabled={submitting}
                                style={styles.amendButton}
                            >
                                Amend Standup
                            </PaperButton>
                        )}
                    </View>
                )}

                <View style={{ height: 20 }} />
            </ScrollView>

            {/* Remarks Dialog */}
            <Portal>
                <Dialog
                    visible={showRemarksDialog}
                    onDismiss={() => setShowRemarksDialog(false)}
                    style={styles.dialog}
                >
                    <Dialog.Title>Manager Remarks</Dialog.Title>
                    <Dialog.Content>
                        <TextInput
                            mode="outlined"
                            placeholder="Enter your remarks here..."
                            multiline
                            numberOfLines={5}
                            value={remarks}
                            onChangeText={setRemarks}
                            style={styles.remarksInput}
                            editable={!submitting}
                        />
                    </Dialog.Content>
                    <Dialog.Actions>
                        <PaperButton onPress={() => setShowRemarksDialog(false)} disabled={submitting}>
                            Cancel
                        </PaperButton>
                        <PaperButton
                            onPress={handleSubmitRemarks}
                            loading={submitting}
                            disabled={submitting}
                        >
                            Save
                        </PaperButton>
                    </Dialog.Actions>
                </Dialog>
            </Portal>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingBottom: 20,
    },
    infoBox: {
        backgroundColor: '#FFF',
        borderRadius: 8,
        padding: 12,
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
    },
    infoContent: {
        marginLeft: 12,
        flex: 1,
    },
    infoLabel: {
        fontSize: 11,
        color: '#6B7280',
        textTransform: 'uppercase',
        fontWeight: '600',
    },
    infoValue: {
        fontSize: 14,
        color: '#1F2937',
        fontWeight: '500',
        marginTop: 2,
    },
    progressBox: {
        backgroundColor: '#FFF',
        borderRadius: 8,
        padding: 12,
    },
    progressRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginBottom: 16,
    },
    progressItem: {
        alignItems: 'center',
    },
    progressNumber: {
        fontSize: 18,
        fontWeight: '700',
        color: '#1F2937',
    },
    progressLabel: {
        fontSize: 11,
        color: '#6B7280',
        marginTop: 4,
    },
    progressBarContainer: {
        backgroundColor: '#F3F4F6',
        borderRadius: 8,
        padding: 12,
    },
    progressBarLabel: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    progressBarText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#374151',
    },
    progressBar: {
        height: 8,
        backgroundColor: '#E5E7EB',
        borderRadius: 4,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        borderRadius: 4,
    },
    taskMeta: {
        alignItems: 'flex-end',
    },
    taskDetails: {
        fontSize: 11,
        color: '#6B7280',
        fontWeight: '500',
    },
    taskCard: {
        backgroundColor: '#FFF',
        borderRadius: 10,
        padding: 14,
        marginBottom: 12,
        borderLeftWidth: 4,
        borderLeftColor: '#3B82F6',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
    },
    taskHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    employeeInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    employeeText: {
        marginLeft: 10,
        flex: 1,
    },
    employeeName: {
        fontSize: 13,
        fontWeight: '700',
        color: '#1F2937',
    },
    designation: {
        fontSize: 11,
        color: '#6B7280',
        marginTop: 2,
    },
    taskMetaRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    metaItem: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
    },
    metaLabel: {
        fontSize: 10,
        color: '#6B7280',
        marginLeft: 6,
        fontWeight: '600',
        textTransform: 'uppercase',
    },
    metaValue: {
        fontSize: 12,
        fontWeight: '600',
        color: '#374151',
        marginLeft: 4,
    },
    taskContent: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginVertical: 10,
    },
    sectionLabel: {
        fontSize: 10,
        color: '#6B7280',
        fontWeight: '600',
        textTransform: 'uppercase',
        marginBottom: 4,
    },
    taskTitle: {
        fontSize: 13,
        fontWeight: '700',
        color: '#1F2937',
        lineHeight: 18,
    },
    taskDescription: {
        fontSize: 12,
        color: '#374151',
        lineHeight: 18,
    },
    progressContainer: {
        marginVertical: 10,
    },
    progressBarSmall: {
        height: 6,
        backgroundColor: '#E5E7EB',
        borderRadius: 3,
        overflow: 'hidden',
        marginBottom: 6,
    },
    progressFillSmall: {
        height: '100%',
        borderRadius: 3,
    },
    progressText: {
        fontSize: 11,
        color: '#6B7280',
        fontWeight: '500',
    },
    carryForwardSection: {
        marginTop: 10,
        paddingTop: 10,
        borderTopWidth: 1,
        borderTopColor: '#E5E7EB',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    nextDateBox: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#EFF6FF',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        gap: 4,
    },
    nextDateText: {
        fontSize: 11,
        fontWeight: '600',
        color: '#1E40AF',
    },
    remarksBox: {
        backgroundColor: '#FFF',
        borderRadius: 8,
        padding: 12,
        minHeight: 80,
        justifyContent: 'center',
    },
    remarksText: {
        fontSize: 13,
        color: '#374151',
        lineHeight: 20,
    },
    editButton: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 10,
        paddingTop: 10,
        borderTopWidth: 1,
        borderTopColor: '#E5E7EB',
    },
    editButtonText: {
        fontSize: 12,
        fontWeight: '600',
        marginLeft: 6,
    },
    addRemarksButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
    },
    addRemarksText: {
        fontSize: 13,
        fontWeight: '600',
        marginLeft: 8,
    },
    dialog: {
        marginHorizontal: 16,
    },
    remarksInput: {
        backgroundColor: '#FFF',
        marginBottom: 8,
    },
    actionSection: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        gap: 10,
    },
    submitButton: {
        paddingVertical: 8,
        borderRadius: 8,
    },
    amendButton: {
        paddingVertical: 8,
        borderRadius: 8,
    },
});

export default AdminStandupDetailScreen;
