// src/screens/admin/CreateNotificationScreen.js
//
// Compose a notification and send it to all employees, one department or chosen
// employees. The server creates one notification per recipient and sends the push.
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, StatusBar } from 'react-native';
import ApiService from '../../services/api.service';
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
    Field,
    TextField,
    SelectField,
    EmptyState,
    Loading,
    Icon,
    color,
    space,
    radius,
    type,
} from '../../components/ds';

const TARGETS = [
    { value: 'all', label: 'All employees' },
    { value: 'department', label: 'Department' },
    { value: 'specific', label: 'Employees' },
];

const CreateNotificationScreen = ({ navigation }) => {
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const [departments, setDepartments] = useState([]);
    const [employees, setEmployees] = useState([]);

    // Form states
    const [title, setTitle] = useState('');
    const [message, setMessage] = useState('');
    const [notificationType, setNotificationType] = useState('Info');
    const [category, setCategory] = useState('General');
    const [priority, setPriority] = useState('Medium');
    const [targetType, setTargetType] = useState('all');
    const [selectedDepartment, setSelectedDepartment] = useState('');
    const [selectedEmployees, setSelectedEmployees] = useState([]);

    // Templates and delivery options have no controls on this screen yet. The state is kept
    // because the send path still reads it (useTemplate stays false, so templates are not used).
    /* eslint-disable no-unused-vars */
    const [templates, setTemplates] = useState([]);
    const [useTemplate, setUseTemplate] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState('');
    const [templateVariables, setTemplateVariables] = useState({});
    const [templatePreview, setTemplatePreview] = useState(null);
    const [actionRequired, setActionRequired] = useState(false);
    const [expiresAfterDays, setExpiresAfterDays] = useState('');
    const [sendPushNotification, setSendPushNotification] = useState(true);
    const [sendEmail, setSendEmail] = useState(false);
    /* eslint-enable no-unused-vars */

    // Presentation only: which picker sheet is open, its search text, and the confirmation sheet
    const [picker, setPicker] = useState(null); // 'department' | 'employees'
    const [pickerQuery, setPickerQuery] = useState('');
    const [confirmTarget, setConfirmTarget] = useState(null); // target description while confirming

    useEffect(() => {
        loadInitialData();
    }, []);

    const loadInitialData = async () => {
        setLoading(true);
        try {
            const [deptResponse, empResponse, templatesResponse] = await Promise.all([
                ApiService.getDepartments(),
                ApiService.getAllEmployees(),
                ApiService.getNotificationTemplates()
            ]);

            if (deptResponse.success && deptResponse.data?.message) {
                const deptData = deptResponse.data.message;
                setDepartments(Array.isArray(deptData) ? deptData : []);
            }

            if (empResponse.success && empResponse.data?.message) {
                const empData = empResponse.data.message;
                const normalizedEmployees = Array.isArray(empData)
                    ? empData
                    : Array.isArray(empData?.employees)
                        ? empData.employees
                        : null;

                if (normalizedEmployees) {
                    setEmployees(normalizedEmployees.filter(emp => emp.status === 'Active'));
                } else {
                    console.warn('Employee data could not be normalized:', empData);
                    setEmployees([]);
                }
            }

            if (templatesResponse.success) {
                setTemplates(templatesResponse.templates || []);
            }
        } catch (error) {
            console.error('Error loading initial data:', error);
            showToast({
                type: 'error',
                text1: 'Could not load recipients',
                text2: 'Failed to load data',
            });
        } finally {
            setLoading(false);
        }
    };

    const handleTemplateSelection = async (templateName) => {
        setSelectedTemplate(templateName);

        if (templateName) {
            // Load template preview
            try {
                const response = await ApiService.getTemplatePreview(templateName);
                if (response.success) {
                    setTemplatePreview(response.preview);
                    setTitle(response.preview.title);
                    setMessage(response.preview.message);
                    setNotificationType(response.preview.notification_type);
                    setCategory(response.preview.category);
                    setPriority(response.preview.priority);
                }
            } catch (error) {
                console.error('Error loading template preview:', error);
            }
        } else {
            setTemplatePreview(null);
            setTitle('');
            setMessage('');
        }
    };

    // Kept for the template flow, which has no controls on this screen yet.
    // eslint-disable-next-line no-unused-vars
    const updateTemplateVariable = (key, value) => {
        setTemplateVariables(prev => ({
            ...prev,
            [key]: value
        }));

        // Update preview if template is selected
        if (selectedTemplate) {
            handleTemplateSelection(selectedTemplate);
        }
    };

    const handleSendNotification = async () => {
        if (!title.trim()) {
            showToast({
                type: 'warning',
                text1: 'Missing title',
                text2: 'Enter a notification title',
            });
            return;
        }

        if (!message.trim()) {
            showToast({
                type: 'warning',
                text1: 'Missing message',
                text2: 'Enter a notification message',
            });
            return;
        }

        if (targetType === 'department' && !selectedDepartment) {
            showToast({
                type: 'warning',
                text1: 'Select a department',
                text2: 'Choose who should receive this notification',
            });
            return;
        }

        if (targetType === 'specific' && selectedEmployees.length === 0) {
            showToast({
                type: 'warning',
                text1: 'Select employees',
                text2: 'Choose at least one employee',
            });
            return;
        }

        if (getRecipientsList().length === 0) {
            showToast({
                type: 'warning',
                text1: 'No recipients',
                text2: 'No active employees match this selection',
            });
            return;
        }

        // confirmation sheet (replaces the former Alert); its Send button calls confirmSendNotification
        setConfirmTarget(getTargetDescription());
    };

    const confirmSendNotification = async () => {
        setSending(true);
        try {
            let response;

            if (useTemplate && selectedTemplate) {
                // Send via template
                const recipients = getRecipientsList();

                const templateData = {
                    template_name: selectedTemplate,
                    recipients: recipients,
                    variables: templateVariables,
                    override_settings: {
                        // Override template defaults if needed
                        ...(actionRequired && { action_required: 1 }),
                        ...(expiresAfterDays && { expires_at: getExpiryDate() })
                    }
                };

                response = await ApiService.createNotificationFromTemplate(templateData);
            } else {
                // Send regular notification
                const notificationData = {
                    title: title.trim(),
                    message: message.trim(),
                    notification_type: notificationType,
                    category: category,
                    priority: priority,
                    action_required: actionRequired ? 1 : 0,
                    expires_at: expiresAfterDays ? getExpiryDate() : null,
                    // the server takes a JSON list of employee IDs
                    recipients: JSON.stringify(getRecipientsList()),
                };

                response = await ApiService.createNotification(notificationData);
            }

            if (response.success) {
                const result = response.data?.message || {};
                const count = result.notification_count || 0;
                const pushCount = result.push_stats?.sent || 0;

                showToast({
                    type: 'success',
                    text1: 'Notification sent',
                    text2: `Sent to ${count} employee${count === 1 ? '' : 's'}${pushCount > 0 ? ` · ${pushCount} by push` : ''}`,
                });

                // Reset form
                resetForm();

                // Go back after a delay
                setTimeout(() => {
                    navigation.goBack();
                }, 1500);
            } else {
                throw new Error(response.message || 'Failed to send notification');
            }
        } catch (error) {
            console.error('Error sending notification:', error);
            showToast({
                type: 'error',
                text1: 'Not sent',
                text2: error.message || 'Failed to send notification',
            });
        } finally {
            setSending(false);
        }
    };

    const getTargetDescription = () => {
        switch (targetType) {
            case 'all':
                return 'all employees';
            case 'department':
                const dept = departments.find(d => d.name === selectedDepartment);
                return `${dept?.department_name || 'selected'} department`;
            case 'specific':
                return `${selectedEmployees.length} selected employee${selectedEmployees.length > 1 ? 's' : ''}`;
            default:
                return 'selected targets';
        }
    };

    const getRecipientsList = () => {
        switch (targetType) {
            case 'all':
                return employees.map(emp => emp.name);
            case 'department':
                return employees
                    .filter(emp => emp.department === selectedDepartment)
                    .map(emp => emp.name);
            case 'specific':
                return selectedEmployees;
            default:
                return [];
        }
    };

    const getExpiryDate = () => {
        if (!expiresAfterDays) {
            return null;
        }
        const days = parseInt(expiresAfterDays, 10);
        if (isNaN(days) || days <= 0) {
            return null;
        }

        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + days);
        return expiryDate.toISOString();
    };

    const resetForm = () => {
        setTitle('');
        setMessage('');
        setNotificationType('Info');
        setCategory('General');
        setPriority('Medium');
        setTargetType('all');
        setSelectedDepartment('');
        setSelectedEmployees([]);
        setUseTemplate(false);
        setSelectedTemplate('');
        setTemplateVariables({});
        setTemplatePreview(null);
        setActionRequired(false);
        setExpiresAfterDays('');
        setSendPushNotification(true);
        setSendEmail(false);
    };

    const toggleEmployeeSelection = (employeeId) => {
        setSelectedEmployees(prev => {
            if (prev.includes(employeeId)) {
                return prev.filter(id => id !== employeeId);
            } else {
                return [...prev, employeeId];
            }
        });
    };

    // ------------------------------------------------------------------ presentation helpers

    const onConfirmSend = async () => {
        await confirmSendNotification();
        setConfirmTarget(null);
    };

    const openPicker = (which) => {
        setPickerQuery('');
        setPicker(which);
    };

    const departmentLabel = () => {
        const dept = departments.find(d => d.name === selectedDepartment);
        return selectedDepartment ? dept?.department_name || selectedDepartment : '';
    };

    const employeesLabel = () => {
        const names = selectedEmployees.map(id => {
            const emp = employees.find(e => e.name === id);
            return emp?.employee_name || id;
        });
        return names.length <= 2 ? names.join(', ') : `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
    };

    const targetReady = targetType === 'all'
        || (targetType === 'department' && Boolean(selectedDepartment))
        || (targetType === 'specific' && selectedEmployees.length > 0);

    const query = pickerQuery.trim().toLowerCase();
    const pickerDepartments = departments.filter(d => !query || `${d.department_name || ''} ${d.name}`.toLowerCase().includes(query));
    const pickerEmployees = employees.filter(e => !query || `${e.employee_name || ''} ${e.name} ${e.designation || ''}`.toLowerCase().includes(query));

    if (loading) {
        return (
            <View style={styles.container}>
                <Loading />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor={color.surface} />

            <Screen
                footer={<Button title="Send notification" onPress={handleSendNotification} loading={sending} />}
            >
                <TextField
                    label="Title"
                    value={title}
                    onChangeText={setTitle}
                    placeholder="Short headline"
                    maxLength={100}
                    hint={`${title.length}/100`}
                />
                <TextField
                    label="Message"
                    value={message}
                    onChangeText={setMessage}
                    placeholder="What do employees need to know"
                    multiline
                    numberOfLines={4}
                    maxLength={500}
                    hint={`${message.length}/500`}
                />

                <Field label="Send to">
                    <Segmented value={targetType} onChange={setTargetType} options={TARGETS} />
                </Field>

                {targetType === 'department' ? (
                    <SelectField
                        label="Department"
                        value={departmentLabel()}
                        placeholder="Select department"
                        onPress={() => openPicker('department')}
                    />
                ) : null}

                {targetType === 'specific' ? (
                    <SelectField
                        label="Employees"
                        value={employeesLabel()}
                        placeholder="Select employees"
                        onPress={() => openPicker('employees')}
                    />
                ) : null}

                {targetReady ? (
                    <Text style={styles.audience}>{`Goes to ${getTargetDescription()}.`}</Text>
                ) : null}
            </Screen>

            {/* Department picker */}
            <Sheet visible={picker === 'department'} title="Department" onClose={() => setPicker(null)}>
                {departments.length > 8 ? (
                    <SearchField value={pickerQuery} onChangeText={setPickerQuery} placeholder="Search departments" style={styles.sheetSearch} />
                ) : null}
                {pickerDepartments.length === 0 ? (
                    <EmptyState icon="search" title="No departments" />
                ) : (
                    <Group>
                        {pickerDepartments.map((dept) => (
                            <Row
                                key={dept.name}
                                title={dept.department_name || dept.name}
                                chevron={false}
                                onPress={() => {
                                    setSelectedDepartment(dept.name);
                                    setPicker(null);
                                }}
                                right={<CheckMark checked={dept.name === selectedDepartment} />}
                            />
                        ))}
                    </Group>
                )}
            </Sheet>

            {/* Employee multi-select */}
            <Sheet
                visible={picker === 'employees'}
                title="Employees"
                subtitle={selectedEmployees.length ? `${selectedEmployees.length} selected` : undefined}
                onClose={() => setPicker(null)}
                footer={<Button title="Done" onPress={() => setPicker(null)} style={styles.flex} />}
            >
                <SearchField value={pickerQuery} onChangeText={setPickerQuery} placeholder="Search employees" style={styles.sheetSearch} />
                {pickerEmployees.length === 0 ? (
                    <EmptyState icon="users" title="No employees" message={query ? `No one matches “${pickerQuery.trim()}”.` : undefined} />
                ) : (
                    <Group>
                        {pickerEmployees.map((emp) => {
                            const isSelected = selectedEmployees.includes(emp.name);
                            return (
                                <Row
                                    key={emp.name}
                                    left={<Avatar name={emp.employee_name || emp.name} size={32} />}
                                    title={emp.employee_name || emp.name}
                                    subtitle={emp.designation || undefined}
                                    selected={isSelected}
                                    chevron={false}
                                    onPress={() => toggleEmployeeSelection(emp.name)}
                                    right={<CheckMark checked={isSelected} />}
                                />
                            );
                        })}
                    </Group>
                )}
            </Sheet>

            {/* Confirmation */}
            <Sheet
                visible={Boolean(confirmTarget)}
                title="Send notification"
                subtitle={confirmTarget ? `To ${confirmTarget}` : undefined}
                onClose={() => !sending && setConfirmTarget(null)}
                dismissable={!sending}
                footer={(
                    <>
                        <Button title="Cancel" variant="secondary" onPress={() => setConfirmTarget(null)} disabled={sending} style={styles.flex} />
                        <Button title="Send" onPress={onConfirmSend} loading={sending} style={styles.flex} />
                    </>
                )}
            >
                <View style={styles.preview}>
                    <Text style={styles.previewTitle}>{title.trim()}</Text>
                    <Text style={styles.previewMessage}>{message.trim()}</Text>
                </View>
            </Sheet>
        </View>
    );
};

// check mark slot for picker rows (keeps row text aligned when unchecked)
const CheckMark = ({ checked }) => (
    <View style={styles.check}>
        {checked ? <Icon name="check" size={18} color={color.accent} /> : null}
    </View>
);

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: color.bg },
    flex: { flex: 1 },
    audience: { ...type.secondary, paddingHorizontal: space.xs, marginTop: -space.xs },
    sheetSearch: { marginBottom: space.lg },
    check: { width: 24, alignItems: 'flex-end' },
    preview: {
        padding: space.md,
        borderRadius: radius.md,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: color.border,
        backgroundColor: color.surfaceMuted,
        marginBottom: space.sm,
    },
    previewTitle: { ...type.bodyStrong },
    previewMessage: { ...type.secondary, marginTop: 4, lineHeight: 19 },
});

export default CreateNotificationScreen;
