// src/screens/admin/SalaryStructureAdminScreen.js
//
// Salary structure assignments of active employees. Department and structure are filtered
// on the server; the search box filters the loaded list by name, ID, department or
// designation. "CTC" from the server is the monthly gross (sum of the structure's
// earnings). Tapping an employee loads their full monthly breakdown.
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import apiService, { extractFrappeData, isApiSuccess } from '../../services/api.service';
import showToast from '../../utils/Toast';
import {
    Screen,
    Group,
    Row,
    Avatar,
    Tag,
    StatStrip,
    SearchField,
    SelectField,
    Sheet,
    Button,
    EmptyState,
    Loading,
    Notice,
    Icon,
    color,
    space,
} from '../../components/ds';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ₹1,50,000: Indian grouping, whole rupees. Other currencies keep their code as prefix.
const money = (value, currency) => {
    const n = Math.round(parseFloat(value || 0) || 0);
    const s = String(Math.abs(n));
    const last3 = s.slice(-3);
    const rest = s.slice(0, -3);
    const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}` : last3;
    const symbol = !currency || currency === 'INR' ? '₹' : `${currency} `;
    return `${n < 0 ? '-' : ''}${symbol}${grouped}`;
};

// 'YYYY-MM-DD' -> '01 Apr 2025'
const dateLabel = (value) => {
    const [y, m, d] = String(value || '').slice(0, 10).split('-').map(Number);
    return y && m && d ? `${String(d).padStart(2, '0')} ${MONTHS[m - 1]} ${y}` : String(value || '');
};

const deptLabel = (dept) => String(dept || '').replace(' - DG', '');

const componentNote = (c) => [
    c.abbr,
    c.formula && c.amount_based_on_formula ? c.formula : null,
].filter(Boolean).join('  ·  ');

const SalaryStructureAdminScreen = ({ navigation }) => {
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [assignments, setAssignments] = useState([]);
    const [statistics, setStatistics] = useState(null);
    // eslint-disable-next-line no-unused-vars -- returned by the API, not shown on this screen
    const [structures, setStructures] = useState({});
    const [error, setError] = useState(null);

    // Filters
    const [filterDepartment, setFilterDepartment] = useState('');
    const [filterStructure, setFilterStructure] = useState('');
    const [searchText, setSearchText] = useState('');
    const [departments, setDepartments] = useState([]);
    const [structureList, setStructureList] = useState([]);
    const [picker, setPicker] = useState(null); // 'department' | 'structure'

    // Detail sheet
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [employeeSalaryData, setEmployeeSalaryData] = useState(null);
    const [loadingDetail, setLoadingDetail] = useState(false);

    useEffect(() => {
        loadInitialData();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
    }, []);

    useEffect(() => {
        loadSalaryStructures();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- reload whenever a server-side filter changes
    }, [filterDepartment, filterStructure]);

    const loadInitialData = async () => {
        setLoading(true);
        try {
            // Load departments
            const deptResponse = await apiService.getDepartments();
            if (isApiSuccess(deptResponse)) {
                const deptData = extractFrappeData(deptResponse, {});
                setDepartments(deptData.departments || deptData || []);
            }

            // Load structure list
            const structResponse = await apiService.getSalaryStructureList();
            if (isApiSuccess(structResponse)) {
                const structData = extractFrappeData(structResponse, {});
                // Handle both wrapped and unwrapped responses
                setStructureList(structData.structures || structData.data?.structures || []);
            }

            await loadSalaryStructures();
        } catch (err) {
            console.error('Load initial data error:', err);
            setError('Failed to load data');
        } finally {
            setLoading(false);
        }
    };

    const loadSalaryStructures = async () => {
        try {
            setError(null);
            const filters = {};
            if (filterDepartment) {
                filters.department = filterDepartment;
            }
            if (filterStructure) {
                filters.salary_structure = filterStructure;
            }

            const response = await apiService.getAllSalaryStructureAssignments(filters);

            if (isApiSuccess(response)) {
                // extractFrappeData already unwraps {status: 'success', data: {...}} to just the data
                const data = extractFrappeData(response, null);

                if (data && typeof data === 'object') {
                    // Check if we have the expected fields directly
                    if (data.assignments !== undefined) {
                        setAssignments(data.assignments || []);
                        setStatistics(data.statistics || null);
                        setStructures(data.structures || {});
                    } else if (data.data && data.data.assignments !== undefined) {
                        // Fallback: data might still be wrapped
                        setAssignments(data.data.assignments || []);
                        setStatistics(data.data.statistics || null);
                        setStructures(data.data.structures || {});
                    } else if (data.status === 'error') {
                        setError(data.message || 'Failed to load salary structures');
                    } else {
                        setError('No salary structure assignments found');
                    }
                } else {
                    setError('Failed to load salary structures');
                }
            } else {
                const rawMessage = response?.data?.message;
                const errorMsg = rawMessage?.message || rawMessage?.error || 'Failed to load salary structures';
                setError(errorMsg);
            }
        } catch (err) {
            console.error('Load salary structures error:', err);
            setError('Failed to load salary structures');
        }
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadSalaryStructures();
        setRefreshing(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- loadSalaryStructures only reads these filters
    }, [filterDepartment, filterStructure]);

    const handleViewDetail = async (employee) => {
        setSelectedEmployee(employee);
        setEmployeeSalaryData(null);
        setShowDetailModal(true);
        setLoadingDetail(true);

        try {
            const response = await apiService.getEmployeeSalaryStructure(employee.employee);
            if (isApiSuccess(response)) {
                const data = extractFrappeData(response, null);
                // Check if we have the actual salary data (has employee or earnings)
                if (data && (data.employee || data.earnings || data.salary_structure)) {
                    setEmployeeSalaryData(data);
                } else if (data && data.data) {
                    // Fallback: data might still be wrapped
                    setEmployeeSalaryData(data.data);
                }
            }
        } catch (err) {
            console.error('Load employee salary detail error:', err);
            showToast({ type: 'error', text1: 'Could not load salary', text2: 'Failed to load employee salary details' });
        } finally {
            setLoadingDetail(false);
        }
    };

    const filteredAssignments = assignments.filter(a => {
        if (!searchText) {
            return true;
        }
        const search = searchText.toLowerCase();
        return (
            (a.employee_name || '').toLowerCase().includes(search) ||
            (a.employee || '').toLowerCase().includes(search) ||
            (a.department || '').toLowerCase().includes(search) ||
            (a.designation || '').toLowerCase().includes(search)
        );
    });

    const departmentOptions = [
        { value: '', label: 'All departments' },
        ...departments.map((dept) => ({ value: dept.name, label: dept.name })),
    ];
    const structureOptions = [
        { value: '', label: 'All structures' },
        ...structureList.map((s) => ({ value: s.name, label: s.name })),
    ];

    const renderDetail = () => {
        if (loadingDetail) {
            return <Loading label="Loading salary" />;
        }
        const d = employeeSalaryData;
        if (!d) {
            return <EmptyState icon="file-text" title="No salary data" message="No salary structure is assigned yet." />;
        }
        const cur = d.currency;
        const structureNote = [
            d.payroll_frequency || 'Monthly',
            d.from_date ? `from ${dateLabel(d.from_date)}` : null,
        ].filter(Boolean).join('  ·  ');
        return (
            <>
                <Group title="Structure">
                    <Row title={d.salary_structure || 'No structure'} subtitle={structureNote} />
                    <Row title="Base pay" value={money(d.base, cur)} />
                    <Row title="Variable" value={money(d.variable, cur)} />
                    {d.leave_encashment_per_day > 0 ? (
                        <Row title="Leave encashment" value={`${money(d.leave_encashment_per_day, cur)} / day`} />
                    ) : null}
                </Group>

                <Group title="Earnings">
                    {(d.earnings || []).map((e, i) => (
                        <Row
                            key={`e-${i}`}
                            title={e.salary_component}
                            subtitle={componentNote(e) || undefined}
                            value={money(e.calculated_amount || e.amount, cur)}
                        />
                    ))}
                    <Row title="Total earnings" value={money(d.total_earnings, cur)} />
                </Group>

                <Group title="Deductions">
                    {(d.deductions || []).map((x, i) => (
                        <Row
                            key={`d-${i}`}
                            title={x.salary_component}
                            subtitle={[componentNote(x), x.calculation_note].filter(Boolean).join('\n') || undefined}
                            subtitleLines={3}
                            value={`−${money(x.calculated_amount || x.amount, cur)}`}
                        />
                    ))}
                    <Row title="Total deductions" value={`−${money(d.total_deductions, cur)}`} />
                </Group>

                <Group>
                    <Row title="Net pay per month" right={<Text style={styles.netPay}>{money(d.net_pay, cur)}</Text>} />
                </Group>
            </>
        );
    };

    const renderOptions = (options, value, onSelect) => (
        <Group>
            {options.map((o) => {
                const active = o.value === value;
                return (
                    <Row
                        key={`opt-${o.value}`}
                        title={o.label}
                        selected={active}
                        right={active ? <Icon name="check" size={18} color={color.accent} /> : null}
                        chevron={false}
                        onPress={() => {
                            onSelect(o.value);
                            setPicker(null);
                        }}
                    />
                );
            })}
        </Group>
    );

    if (loading) {
        return (
            <View style={styles.screen}>
                <Loading label="Loading salary structures" />
            </View>
        );
    }

    const countLabel = filteredAssignments.length === assignments.length
        ? `${assignments.length} ${assignments.length === 1 ? 'employee' : 'employees'}`
        : `${filteredAssignments.length} of ${assignments.length} employees`;

    return (
        <View style={styles.screen}>
            <View style={styles.toolbar}>
                <SearchField value={searchText} onChangeText={setSearchText} placeholder="Search name, ID, department" />
                <View style={styles.filters}>
                    <SelectField
                        value={filterDepartment || 'All departments'}
                        onPress={() => setPicker('department')}
                        style={[styles.flex, styles.noMargin]}
                    />
                    <SelectField
                        value={filterStructure || 'All structures'}
                        onPress={() => setPicker('structure')}
                        style={[styles.flex, styles.noMargin]}
                    />
                </View>
            </View>

            <Screen refreshing={refreshing} onRefresh={onRefresh}>
                {error ? <Notice tone="danger" icon="alert-circle">{error}</Notice> : null}

                {statistics ? (
                    <StatStrip
                        style={styles.stats}
                        items={[
                            { label: 'Employees', value: statistics.total_employees },
                            { label: 'Monthly CTC', value: money(statistics.total_ctc) },
                        ]}
                    />
                ) : null}

                {filteredAssignments.length > 0 ? (
                    <Group title={`${countLabel}  ·  CTC per month`}>
                        {filteredAssignments.map((item) => (
                            <Row
                                key={item.name}
                                left={<Avatar name={item.employee_name} />}
                                title={item.employee_name}
                                subtitle={[item.employee, item.designation, deptLabel(item.department)].filter(Boolean).join('  ·  ')}
                                meta={item.salary_structure ? <Tag label={item.salary_structure} /> : null}
                                value={money(item.total_ctc)}
                                onPress={() => handleViewDetail(item)}
                            />
                        ))}
                    </Group>
                ) : !error ? (
                    <EmptyState
                        icon="layers"
                        title="No salary structures"
                        message={searchText
                            ? `No one matches “${searchText}”.`
                            : filterDepartment || filterStructure ? 'No assignments match these filters.' : 'No employee has a salary structure yet.'}
                    />
                ) : null}
            </Screen>

            <Sheet visible={picker === 'department'} title="Department" onClose={() => setPicker(null)}>
                {renderOptions(departmentOptions, filterDepartment, setFilterDepartment)}
            </Sheet>

            <Sheet visible={picker === 'structure'} title="Salary structure" onClose={() => setPicker(null)}>
                {renderOptions(structureOptions, filterStructure, setFilterStructure)}
            </Sheet>

            <Sheet
                visible={showDetailModal}
                title={selectedEmployee?.employee_name || 'Salary'}
                subtitle={[selectedEmployee?.designation, deptLabel(selectedEmployee?.department)].filter(Boolean).join('  ·  ') || undefined}
                onClose={() => setShowDetailModal(false)}
                footer={<Button title="Close" variant="secondary" onPress={() => setShowDetailModal(false)} style={styles.flex} />}
            >
                {renderDetail()}
            </Sheet>
        </View>
    );
};

const styles = StyleSheet.create({
    flex: { flex: 1 },
    noMargin: { marginBottom: 0 },
    screen: { flex: 1, backgroundColor: color.bg },
    toolbar: {
        backgroundColor: color.surface,
        paddingHorizontal: space.lg,
        paddingVertical: space.md,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: color.border,
    },
    filters: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
    stats: { marginBottom: space.xl },
    netPay: { fontSize: 17, fontWeight: '600', color: color.text, fontVariant: ['tabular-nums'] },
});

export default SalaryStructureAdminScreen;
