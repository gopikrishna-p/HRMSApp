// src/screens/employee/ExpenseClaimScreen.js
//
// The employee's expense claims: counts by status, the claims (filter by status, tap for the
// line items) and the form to file a new claim with one or more expenses. The approver sets
// the sanctioned amounts.
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import apiService, { extractFrappeData } from '../../services/api.service';
import { formatLocalDate } from '../../utils/dateFormat';
import showToast from '../../utils/Toast';
import {
    Screen,
    Group,
    Row,
    Segmented,
    StatStrip,
    StatusText,
    Tag,
    Sheet,
    Button,
    TextField,
    SelectField,
    EmptyState,
    Loading,
    Icon,
    color,
    space,
    type,
    formatShortDate,
} from '../../components/ds';

// ------------------------------------------------------------------ helpers
// Indian digit grouping: 1234567 -> 12,34,567
const groupIndian = (digits) => {
    const last3 = digits.slice(-3);
    const rest = digits.slice(0, -3);
    return rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}` : last3;
};
// ₹1,23,456.50; whole amounts drop the decimals unless `decimals` is given
const formatINR = (value, decimals) => {
    const n = Number(value) || 0;
    const places = decimals ?? (Number.isInteger(Math.round(n * 100) / 100) ? 0 : 2);
    const [whole, fraction] = Math.abs(n).toFixed(places).split('.');
    return `${n < 0 ? '-' : ''}₹${groupIndian(whole)}${fraction ? `.${fraction}` : ''}`;
};

// 'YYYY-MM-DD' as a local date (no timezone shift)
const parseYMD = (value) => {
    const [y, m, d] = String(value || '').slice(0, 10).split('-').map(Number);
    return y ? new Date(y, m - 1, d) : null;
};
const dateLabel = (value) => {
    const d = parseYMD(value);
    return d ? formatShortDate(d) : '–';
};

// ERPNext keeps undecided claims as approval_status "Draft"; employees read that as pending.
const statusLabel = (status) => (status === 'Draft' ? 'Pending' : status || '–');

// "Travel" or "Travel +2" for a claim with several expense types
const typesLabel = (claim) => {
    const types = [...new Set((claim.expenses || []).map((e) => e.expense_type).filter(Boolean))];
    if (types.length === 0) {
        return claim.total_expenses ? `${claim.total_expenses} ${claim.total_expenses === 1 ? 'item' : 'items'}` : '';
    }
    return types.length === 1 ? types[0] : `${types[0]} +${types.length - 1}`;
};

const STATUS_FILTERS = [
    { value: 'all', label: 'All' },
    { value: 'Draft', label: 'Pending' },
    { value: 'Approved', label: 'Approved' },
    { value: 'Rejected', label: 'Rejected' },
];

const Check = ({ on }) => (on ? <Icon name="check" size={18} color={color.accent} /> : null);

const ExpenseClaimScreen = ({ navigation }) => {
    // State management
    const [activeTab, setActiveTab] = useState('history'); // history (my claims), submit (new claim form)
    const [loading, setLoading] = useState(true); // employee and expense types are fetched on mount
    const [refreshing, setRefreshing] = useState(false);
    const [employeeId, setEmployeeId] = useState('');

    // Submit form state
    const [expenses, setExpenses] = useState([{
        expense_type: '',
        amount: '',
        description: '',
        expense_date: new Date()
    }]);
    const [remark, setRemark] = useState('');
    const [expenseTypes, setExpenseTypes] = useState([]);
    const [showDatePicker, setShowDatePicker] = useState({ show: false, index: -1 });

    // History state
    const [claims, setClaims] = useState([]);
    const [filterStatus, setFilterStatus] = useState(''); // '', Draft, Approved, Rejected
    const [statusSummary, setStatusSummary] = useState({});
    const [totalClaimed, setTotalClaimed] = useState(0);
    const [totalApproved, setTotalApproved] = useState(0);

    // Presentation only: claim open in the detail sheet, expense-type picker
    const [selected, setSelected] = useState(null);
    const [typePicker, setTypePicker] = useState(null); // { index, open }
    const lastSelected = useRef(null); // keeps the detail sheet filled while it slides out

    useEffect(() => {
        loadInitialData();
    }, []);

    useEffect(() => {
        if (activeTab === 'history' && employeeId) {
            loadClaims();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when the list is shown, the filter changes or the employee is known
    }, [activeTab, filterStatus, employeeId]);

    const loadInitialData = async () => {
        setLoading(true);
        try {
            // Get employee info
            const empResponse = await apiService.getCurrentEmployee();
            const empData = extractFrappeData(empResponse, null);
            if (empData && empData.name) {
                setEmployeeId(empData.name);
            }

            // Get expense types
            const typesResponse = await apiService.getExpenseClaimTypes();
            const types = extractFrappeData(typesResponse, []);
            setExpenseTypes(Array.isArray(types) ? types : []);
        } catch (error) {
            console.error('Error loading initial data:', error);
            showToast({ type: 'error', text1: 'Could not load expense types', text2: error.message });
        } finally {
            setLoading(false);
        }
    };

    const loadClaims = async () => {
        if (!employeeId) {
            return;
        }

        setLoading(true);
        try {
            const filters = {
                employee: employeeId,
                approval_status: filterStatus || null,
                limit: 100
            };

            const response = await apiService.getEmployeeExpenseClaims(filters);
            const data = extractFrappeData(response, {});
            setClaims(data.claims || []);
            setStatusSummary(data.status_summary || {});
            setTotalClaimed(data.total_claimed_amount || 0);
            setTotalApproved(data.total_approved_amount || 0);
        } catch (error) {
            console.error('Error loading claims:', error);
            showToast({ type: 'error', text1: 'Could not load expense claims', text2: error.message });
        } finally {
            setLoading(false);
        }
    };

    const onRefresh = async () => {
        setRefreshing(true);
        if (activeTab === 'history') {
            await loadClaims();
        } else {
            await loadInitialData();
        }
        setRefreshing(false);
    };

    const addExpenseItem = () => {
        setExpenses([...expenses, {
            expense_type: '',
            amount: '',
            description: '',
            expense_date: new Date()
        }]);
    };

    const removeExpenseItem = (index) => {
        if (expenses.length > 1) {
            const newExpenses = expenses.filter((_, i) => i !== index);
            setExpenses(newExpenses);
        }
    };

    const updateExpenseItem = (index, field, value) => {
        const newExpenses = [...expenses];
        newExpenses[index][field] = value;

        // sanctioned_amount is not set here: the backend defaults it to the amount and the
        // approver changes it during approval.

        setExpenses(newExpenses);
    };

    const handleDateChange = (event, selectedDate, index) => {
        setShowDatePicker({ show: false, index: -1 });
        if (selectedDate) {
            updateExpenseItem(index, 'expense_date', selectedDate);
        }
    };

    const validateForm = () => {
        if (!employeeId) {
            showToast({ type: 'error', text1: 'Your employee record is not loaded', text2: 'Pull down to try again' });
            return false;
        }

        // Check if at least one expense exists
        if (expenses.length === 0) {
            showToast({ type: 'error', text1: 'Add at least one expense' });
            return false;
        }

        // Validate each expense
        for (let i = 0; i < expenses.length; i++) {
            const exp = expenses[i];

            if (!exp.expense_type) {
                showToast({ type: 'error', text1: `Expense ${i + 1}: select a type` });
                return false;
            }

            if (!exp.amount || parseFloat(exp.amount) <= 0) {
                showToast({ type: 'error', text1: `Expense ${i + 1}: enter an amount above zero` });
                return false;
            }

            if (!exp.description || !exp.description.trim()) {
                showToast({ type: 'error', text1: `Expense ${i + 1}: add a description` });
                return false;
            }
        }

        return true;
    };

    const resetForm = () => {
        setExpenses([{
            expense_type: '',
            amount: '',
            description: '',
            expense_date: new Date()
        }]);
        setRemark('');
        setActiveTab('history');
    };

    const handleSubmit = async () => {
        if (!validateForm()) {
            return;
        }

        setLoading(true);
        try {
            // Prepare expense items. sanctioned_amount is not sent by the employee: the
            // backend defaults it to the amount and the approver changes it during approval.
            const expenseItems = expenses.map(exp => ({
                expense_type: exp.expense_type,
                amount: parseFloat(exp.amount),
                description: exp.description.trim(),
                expense_date: formatLocalDate(exp.expense_date)
            }));

            const response = await apiService.submitExpenseClaim(
                employeeId,
                expenseItems,
                { remark: remark.trim() }
            );

            // Check if API returned success
            if (!response.success) {
                showToast({ type: 'error', text1: 'Claim not submitted', text2: response.message || 'Failed to submit expense claim' });
                return;
            }

            // Check if we have valid data
            if (response.data?.message) {
                const data = response.data.message;
                showToast({
                    type: 'success',
                    text1: 'Claim submitted',
                    text2: [data.claim_id, formatINR(data.total_claimed_amount || calculateTotal())].filter(Boolean).join('  ·  '),
                });
            } else {
                showToast({ type: 'success', text1: 'Claim submitted' });
            }
            // Reset form; back to the list, which reloads the claims
            resetForm();
        } catch (error) {
            console.error('Submit expense claim error:', error);
            showToast({ type: 'error', text1: 'Claim not submitted', text2: error.message || 'Failed to submit expense claim' });
        } finally {
            setLoading(false);
        }
    };

    const calculateTotal = () => {
        return expenses.reduce((sum, exp) => sum + (parseFloat(exp.amount) || 0), 0);
    };

    // ------------------------------------------------------------------ presentation helpers
    const openTypePicker = (index) => setTypePicker({ index, open: true });
    const closeTypePicker = () => setTypePicker((p) => (p ? { ...p, open: false } : p));
    const pickType = (name) => {
        if (typePicker) {
            updateExpenseItem(typePicker.index, 'expense_type', name);
        }
        closeTypePicker();
    };

    if (selected) {
        lastSelected.current = selected;
    }
    const detail = selected || lastSelected.current;
    const busy = loading && !refreshing;

    // ------------------------------------------------------------------ new claim form
    const renderSubmitTab = () => (
        <Screen
            refreshing={refreshing}
            onRefresh={onRefresh}
            footer={(
                <View style={styles.footerButtons}>
                    <Button title="Cancel" variant="secondary" onPress={() => setActiveTab('history')} disabled={loading} style={styles.flex} />
                    <Button
                        title="Submit claim"
                        onPress={handleSubmit}
                        loading={loading && !refreshing}
                        disabled={loading || expenses.length === 0}
                        style={styles.flex}
                    />
                </View>
            )}
        >
            {expenses.map((expense, index) => (
                <Group
                    key={index}
                    title={`Expense ${index + 1}`}
                    action={expenses.length > 1 ? 'Remove' : undefined}
                    onAction={() => removeExpenseItem(index)}
                >
                    <View style={styles.formBody}>
                        <SelectField
                            label="Type"
                            value={expense.expense_type}
                            placeholder="Select type"
                            onPress={() => openTypePicker(index)}
                        />
                        <TextField
                            label="Amount (₹)"
                            value={expense.amount}
                            onChangeText={(text) => updateExpenseItem(index, 'amount', text)}
                            placeholder="0.00"
                            keyboardType="decimal-pad"
                        />
                        <TextField
                            label="Description"
                            value={expense.description}
                            onChangeText={(text) => updateExpenseItem(index, 'description', text)}
                            placeholder="What was this for?"
                            multiline
                            numberOfLines={3}
                            inputStyle={styles.shortMultiline}
                        />
                        <SelectField
                            label="Date"
                            value={formatShortDate(expense.expense_date)}
                            icon="calendar"
                            onPress={() => setShowDatePicker({ show: true, index })}
                        />
                        {showDatePicker.show && showDatePicker.index === index && (
                            <DateTimePicker
                                value={expense.expense_date}
                                mode="date"
                                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                onChange={(event, date) => handleDateChange(event, date, index)}
                                maximumDate={new Date()}
                            />
                        )}
                    </View>
                </Group>
            ))}

            <Button title="Add another expense" variant="secondary" onPress={addExpenseItem} style={styles.addButton} />

            <Group>
                <Row title="Total" right={<Text style={styles.totalValue}>{formatINR(calculateTotal(), 2)}</Text>} />
            </Group>

            <Group title="Remarks">
                <View style={styles.formBody}>
                    <TextField
                        value={remark}
                        onChangeText={setRemark}
                        placeholder="Optional"
                        multiline
                        numberOfLines={3}
                        inputStyle={styles.shortMultiline}
                    />
                </View>
            </Group>
        </Screen>
    );

    // ------------------------------------------------------------------ my claims
    const renderClaimItem = (claim) => {
        const sanctionedDiffers = claim.approval_status === 'Approved'
            && Number(claim.total_sanctioned_amount) !== Number(claim.total_claimed_amount);
        return (
            <Row
                key={claim.name}
                title={formatINR(claim.total_claimed_amount)}
                subtitle={[dateLabel(claim.posting_date), typesLabel(claim)].filter(Boolean).join('  ·  ')}
                meta={sanctionedDiffers ? <Tag label={`${formatINR(claim.total_sanctioned_amount)} sanctioned`} /> : null}
                right={<StatusText label={statusLabel(claim.approval_status)} />}
                onPress={() => setSelected(claim)}
            />
        );
    };

    const renderHistoryTab = () => {
        const filterLabel = STATUS_FILTERS.find((f) => f.value === filterStatus)?.label || '';
        return (
            <Screen
                refreshing={refreshing}
                onRefresh={onRefresh}
                footer={<Button title="New claim" onPress={() => setActiveTab('submit')} />}
            >
                <StatStrip
                    style={styles.stats}
                    items={[
                        { label: 'Pending', value: statusSummary.Draft || 0 },
                        { label: 'Approved', value: statusSummary.Approved || 0 },
                        { label: 'Rejected', value: statusSummary.Rejected || 0 },
                    ]}
                />
                <Group footer="Totals cover all your claims, whatever filter is on.">
                    <Row title="Total claimed" value={formatINR(totalClaimed)} />
                    <Row title="Total approved" value={formatINR(totalApproved)} />
                </Group>

                <Text style={styles.sectionTitle}>Claims</Text>
                <Segmented
                    value={filterStatus || 'all'}
                    onChange={(value) => setFilterStatus(value === 'all' ? '' : value)}
                    options={STATUS_FILTERS}
                    style={styles.filter}
                />

                {busy ? (
                    <Loading />
                ) : claims.length === 0 ? (
                    <EmptyState
                        icon="file-text"
                        title={filterStatus ? `No ${filterLabel.toLowerCase()} claims` : 'No expense claims'}
                        message={filterStatus ? undefined : 'Claims you submit appear here.'}
                    />
                ) : (
                    <Group>{claims.map(renderClaimItem)}</Group>
                )}
            </Screen>
        );
    };

    // ------------------------------------------------------------------ claim detail
    const renderDetail = (claim) => {
        const isPending = claim.approval_status === 'Draft';
        const items = claim.expenses || [];
        return (
            <>
                <Group>
                    <Row title="Status" right={<StatusText label={statusLabel(claim.approval_status)} />} />
                    <Row title="Date" value={dateLabel(claim.posting_date)} />
                    <Row title="Claimed" value={formatINR(claim.total_claimed_amount)} />
                    {!isPending ? <Row title="Sanctioned" value={formatINR(claim.total_sanctioned_amount)} /> : null}
                    {claim.expense_approver ? <Row title="Approver" value={claim.expense_approver} /> : null}
                </Group>

                {items.length > 0 ? (
                    <Group title="Expenses">
                        {items.map((exp, idx) => (
                            <Row
                                key={idx}
                                title={exp.expense_type}
                                subtitle={[dateLabel(exp.expense_date), exp.description].filter(Boolean).join('  ·  ')}
                                meta={!isPending && exp.sanctioned_amount !== undefined && exp.sanctioned_amount !== exp.amount
                                    ? <Tag label={`${formatINR(exp.sanctioned_amount)} sanctioned`} />
                                    : null}
                                value={formatINR(exp.amount)}
                            />
                        ))}
                    </Group>
                ) : null}

                {claim.remark ? (
                    <Group title="Remarks">
                        <Text style={styles.note}>{claim.remark}</Text>
                    </Group>
                ) : null}
            </>
        );
    };

    return (
        <View style={styles.flex}>
            {activeTab === 'submit' ? renderSubmitTab() : renderHistoryTab()}

            <Sheet
                visible={Boolean(selected)}
                title={detail ? formatINR(detail.total_claimed_amount) : undefined}
                subtitle={detail?.name}
                onClose={() => setSelected(null)}
                footer={<Button title="Close" variant="secondary" onPress={() => setSelected(null)} style={styles.flex} />}
            >
                {detail ? renderDetail(detail) : null}
            </Sheet>

            <Sheet visible={Boolean(typePicker?.open)} title="Expense type" onClose={closeTypePicker}>
                {expenseTypes.length === 0 ? (
                    <EmptyState icon="list" title="No expense types" />
                ) : (
                    <Group>
                        {expenseTypes.map((t) => (
                            <Row
                                key={t.name}
                                title={t.name}
                                right={<Check on={Boolean(typePicker) && expenses[typePicker.index]?.expense_type === t.name} />}
                                chevron={false}
                                onPress={() => pickType(t.name)}
                            />
                        ))}
                    </Group>
                )}
            </Sheet>
        </View>
    );
};

const styles = StyleSheet.create({
    flex: { flex: 1 },
    stats: { marginBottom: space.md },
    sectionTitle: { ...type.label, marginBottom: space.sm, paddingHorizontal: space.xs },
    filter: { marginBottom: space.md },
    note: { ...type.body, lineHeight: 21, paddingHorizontal: space.lg, paddingVertical: space.md },

    formBody: { paddingHorizontal: space.lg, paddingTop: space.lg },
    shortMultiline: { minHeight: 72 },
    addButton: { marginTop: -space.sm, marginBottom: space.xl },
    footerButtons: { flexDirection: 'row', gap: space.sm },
    totalValue: { ...type.bodyStrong, fontWeight: '600', fontVariant: ['tabular-nums'] },
});

export default ExpenseClaimScreen;
