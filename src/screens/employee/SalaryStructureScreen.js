// src/screens/employee/SalaryStructureScreen.js
//
// The signed-in employee's salary structure: base and variable pay, every earning and
// deduction component, and the monthly net pay. Also opened from the admin app as
// "My Salary Structure".
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import apiService, { extractFrappeData, isApiSuccess } from '../../services/api.service';
import {
    Screen,
    Group,
    Row,
    Avatar,
    EmptyState,
    Loading,
    color,
    space,
} from '../../components/ds';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ₹12,34,567 (Indian grouping); paise only when the amount has them.
// Other currencies keep their code as prefix.
const money = (value, currency) => {
    const n = parseFloat(value || 0) || 0;
    const paise = Math.round(Math.abs(n) * 100);
    const s = String(Math.floor(paise / 100));
    const last3 = s.slice(-3);
    const rest = s.slice(0, -3);
    const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}` : last3;
    const frac = paise % 100 ? `.${String(paise % 100).padStart(2, '0')}` : '';
    const symbol = !currency || currency === 'INR' ? '₹' : `${currency} `;
    return `${n < 0 && paise ? '-' : ''}${symbol}${grouped}${frac}`;
};

// 'YYYY-MM-DD' -> '01 Apr 2025', read as a local date
const dateLabel = (value) => {
    const [y, m, d] = String(value || '').slice(0, 10).split('-').map(Number);
    return y && m && d ? `${String(d).padStart(2, '0')} ${MONTHS[m - 1]} ${y}` : String(value || '');
};

const deptLabel = (dept) => String(dept || '').replace(' - DG', '');

const SalaryStructureScreen = ({ navigation }) => {
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [salaryData, setSalaryData] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        loadSalaryStructure();
    }, []);

    const loadSalaryStructure = async () => {
        try {
            setError(null);
            const response = await apiService.getEmployeeSalaryStructure();

            if (isApiSuccess(response)) {
                // extractFrappeData already returns the unwrapped data from {status: 'success', data: {...}}
                const data = extractFrappeData(response, null);

                if (data && typeof data === 'object') {
                    // Check if we got the actual salary data (has employee or earnings)
                    if (data.employee || data.earnings || data.salary_structure) {
                        setSalaryData(data);
                    } else if (data.data) {
                        // Fallback: data might still be wrapped
                        setSalaryData(data.data);
                    } else if (data.status === 'error') {
                        setError(data.message || 'No salary structure assigned');
                    } else {
                        setError('No salary structure data found');
                    }
                } else {
                    setError('No salary structure assigned');
                }
            } else {
                // Try to get error message from response
                const rawMessage = response?.data?.message;
                const errorMsg = rawMessage?.message || rawMessage?.error || 'Failed to load salary structure';
                setError(errorMsg);
            }
        } catch (err) {
            console.error('Load salary structure error:', err);
            setError('Failed to load salary structure');
        } finally {
            setLoading(false);
        }
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadSalaryStructure();
        setRefreshing(false);
    }, []);

    // also covers the moment a retry from the error state has cleared the error
    if (loading || (!error && !salaryData)) {
        return (
            <View style={styles.screen}>
                <Loading label="Loading salary structure" />
            </View>
        );
    }

    if (error) {
        return (
            <Screen refreshing={refreshing} onRefresh={onRefresh}>
                <EmptyState
                    icon="file-text"
                    title="No salary structure"
                    message={`${error}\nContact HR to have one assigned.`}
                />
            </Screen>
        );
    }

    const d = salaryData || {};
    const cur = d.currency;
    const earnings = d.earnings || [];
    const deductions = d.deductions || [];
    const structureNote = [
        d.payroll_frequency,
        d.from_date ? `from ${dateLabel(d.from_date)}` : null,
    ].filter(Boolean).join('  ·  ');

    return (
        <Screen refreshing={refreshing} onRefresh={onRefresh}>
            {d.employee_name ? (
                <Group>
                    <Row
                        left={<Avatar name={d.employee_name} size={40} />}
                        title={d.employee_name}
                        subtitle={[d.designation || 'Employee', deptLabel(d.department)].filter(Boolean).join('  ·  ')}
                    />
                </Group>
            ) : null}

            <Group title="Structure">
                <Row title={d.salary_structure || 'No structure'} subtitle={structureNote || undefined} />
                <Row title="Base pay" value={money(d.base, cur)} />
                <Row title="Variable" value={money(d.variable, cur)} />
                {d.leave_encashment_per_day > 0 ? (
                    <Row title="Leave encashment" value={`${money(d.leave_encashment_per_day, cur)} / day`} />
                ) : null}
            </Group>

            <Group title="Earnings">
                {earnings.length > 0 ? (
                    earnings.map((e, i) => (
                        <Row
                            key={`e-${i}`}
                            title={e.salary_component}
                            subtitle={e.abbr || undefined}
                            value={money(e.calculated_amount || e.amount, cur)}
                        />
                    ))
                ) : (
                    <Row title="No earnings" />
                )}
                <Row title="Total earnings" right={<Text style={styles.total}>{money(d.total_earnings, cur)}</Text>} />
            </Group>

            <Group title="Deductions">
                {deductions.length > 0 ? (
                    deductions.map((x, i) => (
                        <Row
                            key={`d-${i}`}
                            title={x.salary_component}
                            subtitle={[x.abbr, x.calculation_note].filter(Boolean).join('\n') || undefined}
                            subtitleLines={3}
                            value={`−${money(x.calculated_amount || x.amount, cur)}`}
                        />
                    ))
                ) : (
                    <Row title="No deductions" />
                )}
                <Row title="Total deductions" right={<Text style={styles.total}>{`−${money(d.total_deductions, cur)}`}</Text>} />
            </Group>

            <Group footer="Indicative. Actual pay depends on attendance, overtime and other factors.">
                <Row title="Net pay per month" right={<Text style={styles.netPay}>{money(d.net_pay, cur)}</Text>} />
            </Group>
        </Screen>
    );
};

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: color.bg },
    total: { fontSize: 15, fontWeight: '600', color: color.text, fontVariant: ['tabular-nums'], marginLeft: space.sm },
    netPay: { fontSize: 17, fontWeight: '600', color: color.text, fontVariant: ['tabular-nums'], marginLeft: space.sm },
});

export default SalaryStructureScreen;
