// src/screens/employee/OnSiteRequestScreen.js
//
// The employee's own on-site (client / site visit) requests: the list (requested today / all),
// the request form in a bottom sheet, and a detail sheet that can delete a pending request.
// An approved request covers the requested dates only; standing on-site work is set by HR.
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Alert, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import ApiService, { extractFrappeData } from '../../services/api.service';
import showToast from '../../utils/Toast';
import {
    Screen,
    Group,
    Row,
    Segmented,
    Sheet,
    Button,
    TextField,
    SelectField,
    EmptyState,
    Loading,
    StatusText,
    color,
    space,
    type,
} from '../../components/ds';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// 'YYYY-MM-DD' (or 'YYYY-MM-DD HH:MM:SS', or a Date) as a local calendar day, without a timezone shift
const toDay = (value) => {
    if (value instanceof Date) {
        return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    }
    const [y, m, d] = String(value || '').slice(0, 10).split('-').map(Number);
    return y ? new Date(y, m - 1, d) : null;
};
const yearSuffix = (d) => (d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : '');
const dayLabel = (value) => {
    const d = toDay(value);
    return d ? `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}${yearSuffix(d)}` : '-';
};
const dayCount = (from, to) => {
    const a = toDay(from);
    const b = toDay(to);
    return a && b ? Math.round((b - a) / 86400000) + 1 : 1;
};
const daysLabel = (n) => `${n} ${n === 1 ? 'day' : 'days'}`;
// compact range for list rows: "Wed, 8 Oct", "8–10 Oct", "28 Oct – 2 Nov"
const rangeLabel = (from, to) => {
    const a = toDay(from);
    const b = toDay(to);
    if (!a) {
        return '-';
    }
    if (!b || a.getTime() === b.getTime()) {
        return dayLabel(a);
    }
    if (a.getFullYear() !== b.getFullYear()) {
        return `${a.getDate()} ${MONTHS[a.getMonth()]} ${a.getFullYear()} – ${b.getDate()} ${MONTHS[b.getMonth()]} ${b.getFullYear()}`;
    }
    if (a.getMonth() === b.getMonth()) {
        return `${a.getDate()}–${b.getDate()} ${MONTHS[b.getMonth()]}${yearSuffix(b)}`;
    }
    return `${a.getDate()} ${MONTHS[a.getMonth()]} – ${b.getDate()} ${MONTHS[b.getMonth()]}${yearSuffix(b)}`;
};
// full range for the detail sheet: "Wed, 8 Oct – Fri, 10 Oct"
const fullRange = (from, to) => (dayCount(from, to) === 1 ? dayLabel(from) : `${dayLabel(from)} – ${dayLabel(to)}`);
const statusLabel = (status) => {
    const s = String(status || 'Pending');
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
};
// the API returns `location`; older payloads used `client_location`
const placeOf = (r) => r?.location || r?.client_location || '';

const OnSiteRequestScreen = ({ navigation }) => {
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [deleting, setDeleting] = useState(null);

    // Form state
    const [fromDate, setFromDate] = useState(new Date());
    const [toDate, setToDate] = useState(new Date());
    const [clientLocation, setClientLocation] = useState('');
    const [reason, setReason] = useState('');
    const [showFromDatePicker, setShowFromDatePicker] = useState(false);
    const [showToDatePicker, setShowToDatePicker] = useState(false);

    // Request history
    const [myRequests, setMyRequests] = useState([]);
    // The list is always shown; false while the request form sheet is open.
    const [showHistory, setShowHistory] = useState(true);
    const [historyFilter, setHistoryFilter] = useState('today');

    // Presentation only: the request shown in the detail sheet
    const [selectedId, setSelectedId] = useState(null);

    useEffect(() => {
        loadMyRequests();
        // load once on mount; later reloads come from pull-to-refresh, submit and delete
    }, []);

    const loadMyRequests = async (isRefresh = false) => {
        try {
            if (isRefresh) {
                setRefreshing(true);
            } else {
                setLoading(true);
            }

            const response = await ApiService.getOnSiteRequests();

            // Use helper function to extract data
            const requestsData = extractFrappeData(response, []);

            // Ensure we have an array
            const requests = Array.isArray(requestsData) ? requestsData : [];

            setMyRequests(requests);
        } catch (error) {
            console.error('Error loading On Site requests:', error);
            showToast({
                type: 'error',
                text1: 'Could not load your requests',
                text2: 'Pull down to try again',
            });
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const handleFromDateChange = (event, selectedDate) => {
        setShowFromDatePicker(Platform.OS === 'ios');
        if (selectedDate) {
            setFromDate(selectedDate);
            if (toDate < selectedDate) {
                setToDate(selectedDate);
            }
        }
    };

    const handleToDateChange = (event, selectedDate) => {
        setShowToDatePicker(Platform.OS === 'ios');
        if (selectedDate) {
            if (selectedDate >= fromDate) {
                setToDate(selectedDate);
            } else {
                showToast({
                    type: 'warning',
                    text1: 'Check the dates',
                    text2: 'The end date cannot be before the start date',
                });
            }
        }
    };

    const validateForm = () => {
        if (!fromDate) {
            showToast({
                type: 'warning',
                text1: 'Choose a start date',
            });
            return false;
        }

        if (!toDate) {
            showToast({
                type: 'warning',
                text1: 'Choose an end date',
            });
            return false;
        }

        if (toDate < fromDate) {
            showToast({
                type: 'warning',
                text1: 'Check the dates',
                text2: 'The end date cannot be before the start date',
            });
            return false;
        }

        if (!clientLocation.trim()) {
            showToast({
                type: 'warning',
                text1: 'Add the location',
                text2: 'Enter the client or site you will work at',
            });
            return false;
        }

        if (clientLocation.trim().length < 3) {
            showToast({
                type: 'warning',
                text1: 'Location is too short',
                text2: 'Use at least 3 characters',
            });
            return false;
        }

        // Check for overlapping dates
        const fromDateStr = formatDateForAPI(fromDate);
        const toDateStr = formatDateForAPI(toDate);

        const hasOverlap = myRequests.some(request => {
            if (request.status?.toLowerCase() === 'rejected') {
                return false;
            }

            const requestFrom = request.from_date;
            const requestTo = request.to_date;

            const isOverlapping =
                (fromDateStr <= requestTo && fromDateStr >= requestFrom) ||
                (toDateStr >= requestFrom && toDateStr <= requestTo) ||
                (fromDateStr <= requestFrom && toDateStr >= requestTo);

            return isOverlapping;
        });

        if (hasOverlap) {
            showToast({
                type: 'warning',
                text1: 'Already requested',
                text2: 'You have an on-site request for some of these dates',
            });
            return false;
        }

        return true;
    };

    // The form sheet is the confirmation, so a valid form is sent straight away.
    const handleSubmit = () => {
        if (!validateForm()) {
            return;
        }
        submitRequest();
    };

    const submitRequest = async () => {
        try {
            setSubmitting(true);

            const requestData = {
                from_date: formatDateForAPI(fromDate),
                to_date: formatDateForAPI(toDate),
                location: clientLocation.trim(),
                reason: reason.trim() || null,
            };

            const response = await ApiService.submitOnSiteRequest(requestData);

            if (response.success) {
                const backendData = response.data?.message || response.data || {};

                if (backendData.success === true) {
                    showToast({
                        type: 'success',
                        text1: 'Request sent',
                        text2: 'You will be notified when it is reviewed',
                    });

                    // Reset form
                    setFromDate(new Date());
                    setToDate(new Date());
                    setClientLocation('');
                    setReason('');

                    // Reload requests
                    await loadMyRequests();

                    // Close the form sheet
                    setShowHistory(true);
                } else {
                    showToast({
                        type: 'error',
                        text1: 'Not sent',
                        text2: backendData.message || 'Failed to submit On Site request',
                    });
                }
            } else {
                showToast({
                    type: 'error',
                    text1: 'Not sent',
                    text2: response.message || 'Failed to submit On Site request',
                });
            }
        } catch (error) {
            console.error('Error submitting On Site request:', error);
            showToast({
                type: 'error',
                text1: 'Not sent',
                text2: error.message || 'Failed to submit On Site request. Please try again.',
            });
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteRequest = (requestId, requestDates) => {
        Alert.alert(
            'Delete this request?',
            `${requestDates}. This cannot be undone.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => deleteRequest(requestId),
                },
            ]
        );
    };

    const deleteRequest = async (requestId) => {
        try {
            setDeleting(requestId);

            const response = await ApiService.deleteOnSiteRequest(requestId);

            if (response.success) {
                const backendData = response.data?.message || response.data || {};

                if (backendData.success === true) {
                    showToast({
                        type: 'success',
                        text1: 'Request deleted',
                    });

                    await loadMyRequests();
                } else {
                    showToast({
                        type: 'error',
                        text1: 'Not deleted',
                        text2: backendData.message || 'Failed to delete On Site request',
                    });
                }
            } else {
                showToast({
                    type: 'error',
                    text1: 'Not deleted',
                    text2: response.message || 'Failed to delete On Site request',
                });
            }
        } catch (error) {
            console.error('Error deleting On Site request:', error);
            showToast({
                type: 'error',
                text1: 'Not deleted',
                text2: error.message || 'Failed to delete On Site request. Please try again.',
            });
        } finally {
            setDeleting(null);
        }
    };

    const formatDateForAPI = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    // Calendar days in the form's range, both ends included (display only)
    const calculateDuration = () => dayCount(fromDate, toDate);

    const getFilteredRequests = () => {
        if (historyFilter === 'today') {
            const today = formatDateForAPI(new Date());
            return myRequests.filter(request => {
                const creationDate = request.creation ? request.creation.split(' ')[0] : '';
                return creationDate === today;
            });
        }
        return myRequests;
    };

    // ------------------------------------------------------------------ presentation helpers
    const openForm = () => setShowHistory(false);
    const closeForm = () => {
        if (!submitting) {
            setShowFromDatePicker(false);
            setShowToDatePicker(false);
            setShowHistory(true);
        }
    };

    // The detail sheet follows the list, so it closes by itself once a deleted request is gone.
    const selected = selectedId ? myRequests.find((r) => r.name === selectedId) || null : null;
    const selectedPending = selected?.status?.toLowerCase() === 'pending';
    const days = calculateDuration();

    const renderList = () => {
        const filteredRequests = getFilteredRequests();
        if (loading && myRequests.length === 0) {
            return <Loading />;
        }
        if (myRequests.length === 0) {
            return (
                <EmptyState
                    icon="map-pin"
                    title="No requests yet"
                    message="Your on-site requests appear here."
                />
            );
        }
        if (filteredRequests.length === 0) {
            return (
                <EmptyState
                    icon="calendar"
                    title="Nothing requested today"
                    message="Earlier requests are under All."
                    action="Show all"
                    onAction={() => setHistoryFilter('all')}
                />
            );
        }
        return (
            <Group title="Requests" footer="An approved request covers those dates only. Standing on-site work is set by HR.">
                {filteredRequests.map((item) => (
                    <Row
                        key={item.name}
                        title={rangeLabel(item.from_date, item.to_date)}
                        subtitle={[daysLabel(dayCount(item.from_date, item.to_date)), placeOf(item) || item.reason].filter(Boolean).join('  ·  ')}
                        subtitleLines={1}
                        right={<StatusText label={statusLabel(item.status)} />}
                        onPress={() => setSelectedId(item.name)}
                    />
                ))}
            </Group>
        );
    };

    return (
        <View style={styles.container}>
            <View style={styles.toolbar}>
                <Segmented
                    value={historyFilter}
                    onChange={setHistoryFilter}
                    options={[
                        { value: 'today', label: 'Requested today' },
                        { value: 'all', label: 'All', count: myRequests.length },
                    ]}
                />
            </View>

            <Screen
                refreshing={refreshing}
                onRefresh={() => loadMyRequests(true)}
                footer={<Button title="Request on-site" onPress={openForm} full />}
            >
                {renderList()}
            </Screen>

            {/* Request form */}
            <Sheet
                visible={!showHistory}
                title="Request on-site"
                subtitle={daysLabel(days)}
                onClose={closeForm}
                dismissable={!submitting}
                footer={(
                    <>
                        <Button title="Cancel" variant="secondary" onPress={closeForm} disabled={submitting} style={styles.flex} />
                        <Button title="Send request" onPress={handleSubmit} loading={submitting} style={styles.flex} />
                    </>
                )}
            >
                <View style={styles.dateRow}>
                    <SelectField
                        label="From"
                        value={dayLabel(fromDate)}
                        icon="calendar"
                        onPress={() => setShowFromDatePicker(true)}
                        style={styles.dateField}
                    />
                    <SelectField
                        label="To"
                        value={dayLabel(toDate)}
                        icon="calendar"
                        onPress={() => setShowToDatePicker(true)}
                        style={styles.dateField}
                    />
                </View>

                {showFromDatePicker && (
                    <DateTimePicker
                        value={fromDate}
                        mode="date"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        onChange={handleFromDateChange}
                        minimumDate={new Date()}
                    />
                )}

                {showToDatePicker && (
                    <DateTimePicker
                        value={toDate}
                        mode="date"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        onChange={handleToDateChange}
                        minimumDate={fromDate}
                    />
                )}

                <TextField
                    label="Client or site"
                    placeholder="Company name, address or site"
                    value={clientLocation}
                    onChangeText={setClientLocation}
                    maxLength={200}
                    hint={clientLocation.length > 150 ? `${clientLocation.length}/200` : undefined}
                />
                <TextField
                    label="Notes (optional)"
                    placeholder="Anything HR should know"
                    value={reason}
                    onChangeText={setReason}
                    multiline
                    numberOfLines={3}
                    maxLength={500}
                    hint={reason.length ? `${reason.length}/500` : undefined}
                />
                <Text style={styles.formNote}>
                    Sent to HR for approval. An approved request lets you check in as on-site on these dates only.
                </Text>
            </Sheet>

            {/* Request detail */}
            <Sheet
                visible={Boolean(selected)}
                title={selected ? rangeLabel(selected.from_date, selected.to_date) : ''}
                subtitle={selected ? `On-site  ·  ${daysLabel(dayCount(selected.from_date, selected.to_date))}` : undefined}
                onClose={() => !deleting && setSelectedId(null)}
                dismissable={!deleting}
                footer={selectedPending ? (
                    <>
                        <Button
                            title="Delete request"
                            variant="danger"
                            onPress={() => handleDeleteRequest(selected.name, fullRange(selected.from_date, selected.to_date))}
                            loading={deleting === selected.name}
                            disabled={Boolean(deleting)}
                            style={styles.flex}
                        />
                        <Button title="Close" variant="secondary" onPress={() => setSelectedId(null)} disabled={Boolean(deleting)} style={styles.flex} />
                    </>
                ) : (
                    <Button title="Close" variant="secondary" onPress={() => setSelectedId(null)} style={styles.flex} />
                )}
            >
                {selected ? (
                    <>
                        <Detail label="Status" value={<StatusText label={statusLabel(selected.status)} size={15} />} />
                        <Detail label="Dates" value={fullRange(selected.from_date, selected.to_date)} />
                        <Detail label="Client or site" value={placeOf(selected) || 'Not given'} />
                        {selected.reason ? <Detail label="Notes" value={selected.reason} /> : null}
                        {selected.creation ? <Detail label="Requested on" value={dayLabel(selected.creation)} /> : null}
                        {selected.approved_by ? <Detail label="Reviewed by" value={selected.approved_by} /> : null}
                    </>
                ) : null}
            </Sheet>
        </View>
    );
};

const Detail = ({ label, value }) => (
    <View style={styles.detail}>
        <Text style={styles.detailLabel}>{label}</Text>
        {typeof value === 'string' ? <Text style={type.body}>{value}</Text> : value}
    </View>
);

const styles = StyleSheet.create({
    flex: { flex: 1 },
    container: { flex: 1, backgroundColor: color.bg },
    toolbar: {
        backgroundColor: color.surface,
        paddingHorizontal: space.lg,
        paddingVertical: space.md,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: color.border,
    },
    dateRow: { flexDirection: 'row', gap: space.md },
    dateField: { flex: 1 },
    formNote: { ...type.caption, lineHeight: 17, marginTop: -space.xs, marginBottom: space.sm },
    detail: { marginBottom: space.lg },
    detailLabel: { ...type.caption, marginBottom: 4 },
});

export default OnSiteRequestScreen;
