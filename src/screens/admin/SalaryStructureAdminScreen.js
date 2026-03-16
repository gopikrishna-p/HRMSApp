import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    RefreshControl,
    Alert,
    TouchableOpacity,
    Modal,
    TextInput,
    FlatList,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { colors } from '../../theme/colors';
import Loading from '../../components/common/Loading';
import apiService, { extractFrappeData, isApiSuccess } from '../../services/api.service';

const SalaryStructureAdminScreen = ({ navigation }) => {
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [assignments, setAssignments] = useState([]);
    const [statistics, setStatistics] = useState(null);
    const [structures, setStructures] = useState({});
    const [error, setError] = useState(null);
    
    // Filters
    const [filterDepartment, setFilterDepartment] = useState('');
    const [filterStructure, setFilterStructure] = useState('');
    const [searchText, setSearchText] = useState('');
    const [departments, setDepartments] = useState([]);
    const [structureList, setStructureList] = useState([]);
    
    // Detail modal
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [employeeSalaryData, setEmployeeSalaryData] = useState(null);
    const [loadingDetail, setLoadingDetail] = useState(false);

    useEffect(() => {
        loadInitialData();
    }, []);

    useEffect(() => {
        loadSalaryStructures();
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
            if (filterDepartment) filters.department = filterDepartment;
            if (filterStructure) filters.salary_structure = filterStructure;
            
            const response = await apiService.getAllSalaryStructureAssignments(filters);
            console.log('Salary Structure Assignments Response:', JSON.stringify(response, null, 2));

            if (isApiSuccess(response)) {
                // extractFrappeData already unwraps {status: 'success', data: {...}} to just the data
                const data = extractFrappeData(response, null);
                console.log('Extracted Admin Salary Data:', JSON.stringify(data, null, 2));
                
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
    }, [filterDepartment, filterStructure]);

    const handleViewDetail = async (employee) => {
        setSelectedEmployee(employee);
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
            Alert.alert('Error', 'Failed to load employee salary details');
        } finally {
            setLoadingDetail(false);
        }
    };

    const formatCurrency = (amount, currency = 'INR') => {
        const currencySymbol = currency === 'INR' ? '₹' : currency;
        return `${currencySymbol} ${parseFloat(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    };

    const filteredAssignments = assignments.filter(a => {
        if (!searchText) return true;
        const search = searchText.toLowerCase();
        return (
            (a.employee_name || '').toLowerCase().includes(search) ||
            (a.employee || '').toLowerCase().includes(search) ||
            (a.department || '').toLowerCase().includes(search) ||
            (a.designation || '').toLowerCase().includes(search)
        );
    });

    const renderEmployeeCard = ({ item }) => (
        <TouchableOpacity 
            style={styles.employeeCard}
            onPress={() => handleViewDetail(item)}
        >
            <View style={styles.cardHeader}>
                <View style={styles.employeeInfo}>
                    <Text style={styles.employeeName}>{item.employee_name}</Text>
                    <Text style={styles.employeeId}>{item.employee}</Text>
                </View>
                <View style={styles.ctcBadge}>
                    <Text style={styles.ctcLabel}>CTC</Text>
                    <Text style={styles.ctcAmount}>{formatCurrency(item.total_ctc)}</Text>
                </View>
            </View>
            
            <View style={styles.cardDetails}>
                <View style={styles.detailRow}>
                    <Icon name="briefcase" size={14} color={colors.textSecondary} />
                    <Text style={styles.detailText}>{item.designation || 'N/A'}</Text>
                </View>
                <View style={styles.detailRow}>
                    <Icon name="domain" size={14} color={colors.textSecondary} />
                    <Text style={styles.detailText}>{item.department || 'N/A'}</Text>
                </View>
            </View>
            
            <View style={styles.cardFooter}>
                <View style={styles.salaryRow}>
                    <Text style={styles.salaryLabel}>Base:</Text>
                    <Text style={styles.salaryValue}>{formatCurrency(item.base)}</Text>
                </View>
                <View style={styles.salaryRow}>
                    <Text style={styles.salaryLabel}>Variable:</Text>
                    <Text style={styles.salaryValue}>{formatCurrency(item.variable)}</Text>
                </View>
            </View>

            {item.from_date ? (
                <View style={styles.effectiveDateRow}>
                    <Icon name="calendar" size={12} color={colors.textSecondary} />
                    <Text style={styles.effectiveDateText}>From: {item.from_date}</Text>
                </View>
            ) : null}
            
            <View style={styles.structureBadge}>
                <Text style={styles.structureText}>{item.salary_structure}</Text>
            </View>
            
            <View style={styles.viewDetailHint}>
                <Text style={styles.viewDetailText}>Tap to view full breakdown</Text>
                <Icon name="chevron-right" size={14} color={colors.primary} />
            </View>
        </TouchableOpacity>
    );

    const renderDetailModal = () => (
        <Modal
            visible={showDetailModal}
            animationType="slide"
            onRequestClose={() => setShowDetailModal(false)}
        >
            <View style={styles.modalContainer}>
                <View style={styles.modalHeader}>
                    <TouchableOpacity onPress={() => setShowDetailModal(false)}>
                        <Icon name="close" size={24} color={colors.textPrimary} />
                    </TouchableOpacity>
                    <Text style={styles.modalTitle}>Salary Details</Text>
                    <View style={{ width: 24 }} />
                </View>
                
                {loadingDetail ? (
                    <Loading message="Loading details..." />
                ) : employeeSalaryData ? (
                    <ScrollView style={styles.modalContent}>
                        {/* Employee Info */}
                        <View style={styles.detailSection}>
                            <Text style={styles.detailName}>{employeeSalaryData.employee_name}</Text>
                            <Text style={styles.detailDesignation}>
                                {employeeSalaryData.designation} - {employeeSalaryData.department}
                            </Text>
                            <Text style={styles.detailStructure}>
                                Structure: {employeeSalaryData.salary_structure}
                            </Text>
                            <Text style={styles.detailStructure}>
                                Frequency: {employeeSalaryData.payroll_frequency || 'Monthly'}
                            </Text>
                            {employeeSalaryData.from_date ? (
                                <Text style={styles.detailStructure}>
                                    Effective from: {employeeSalaryData.from_date}
                                </Text>
                            ) : null}
                        </View>
                        
                        {/* Base & Variable */}
                        <View style={styles.baseVarSection}>
                            <View style={styles.baseVarItem}>
                                <Text style={styles.baseVarLabel}>Base Pay</Text>
                                <Text style={styles.baseVarValue}>
                                    {formatCurrency(employeeSalaryData.base, employeeSalaryData.currency)}
                                </Text>
                            </View>
                            <View style={styles.baseVarItem}>
                                <Text style={styles.baseVarLabel}>Variable</Text>
                                <Text style={styles.baseVarValue}>
                                    {formatCurrency(employeeSalaryData.variable, employeeSalaryData.currency)}
                                </Text>
                            </View>
                        </View>
                        
                        {/* Earnings */}
                        <View style={styles.componentSection}>
                            <Text style={styles.sectionTitle}>
                                <Icon name="plus-circle" size={16} color={colors.success} /> Earnings
                            </Text>
                            {employeeSalaryData.earnings?.map((e, i) => (
                                <View key={i} style={styles.componentDetailRow}>
                                    <View style={{ flex: 1 }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                            <Text style={styles.componentName}>{e.salary_component}</Text>
                                            {e.abbr ? <Text style={styles.componentAbbr}>({e.abbr})</Text> : null}
                                        </View>
                                        {e.formula && e.amount_based_on_formula ? (
                                            <Text style={styles.formulaText}>Formula: {e.formula}</Text>
                                        ) : null}
                                    </View>
                                    <Text style={styles.componentAmountGreen}>
                                        {formatCurrency(e.calculated_amount || e.amount, employeeSalaryData.currency)}
                                    </Text>
                                </View>
                            ))}
                            <View style={styles.totalRow}>
                                <Text style={styles.totalLabel}>Total Earnings</Text>
                                <Text style={styles.totalAmountGreen}>
                                    {formatCurrency(employeeSalaryData.total_earnings, employeeSalaryData.currency)}
                                </Text>
                            </View>
                        </View>
                        
                        {/* Deductions */}
                        <View style={styles.componentSection}>
                            <Text style={styles.sectionTitle}>
                                <Icon name="minus-circle" size={16} color={colors.error} /> Deductions
                            </Text>
                            {employeeSalaryData.deductions?.map((d, i) => (
                                <View key={i} style={styles.componentDetailRow}>
                                    <View style={{ flex: 1 }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                            <Text style={styles.componentName}>{d.salary_component}</Text>
                                            {d.abbr ? <Text style={styles.componentAbbr}>({d.abbr})</Text> : null}
                                        </View>
                                        {d.formula && d.amount_based_on_formula ? (
                                            <Text style={styles.formulaText}>Formula: {d.formula}</Text>
                                        ) : null}
                                        {d.calculation_note ? (
                                            <Text style={styles.calcNote}>{d.calculation_note}</Text>
                                        ) : null}
                                    </View>
                                    <Text style={styles.componentAmountRed}>
                                        -{formatCurrency(d.calculated_amount || d.amount, employeeSalaryData.currency)}
                                    </Text>
                                </View>
                            ))}
                            <View style={styles.totalRow}>
                                <Text style={styles.totalLabel}>Total Deductions</Text>
                                <Text style={styles.totalAmountRed}>
                                    -{formatCurrency(employeeSalaryData.total_deductions, employeeSalaryData.currency)}
                                </Text>
                            </View>
                        </View>
                        
                        {/* Net Pay */}
                        <View style={styles.netPaySection}>
                            <Text style={styles.netPayLabel}>Net Pay (Monthly)</Text>
                            <Text style={styles.netPayValue}>
                                {formatCurrency(employeeSalaryData.net_pay, employeeSalaryData.currency)}
                            </Text>
                        </View>

                        {/* Leave Encashment */}
                        {employeeSalaryData.leave_encashment_per_day > 0 && (
                            <View style={styles.infoCard}>
                                <Icon name="information-outline" size={16} color={colors.primary} />
                                <Text style={styles.infoText}>
                                    Leave Encashment: {formatCurrency(employeeSalaryData.leave_encashment_per_day, employeeSalaryData.currency)} / day
                                </Text>
                            </View>
                        )}
                        
                        <View style={{ height: 30 }} />
                    </ScrollView>
                ) : (
                    <View style={styles.noData}>
                        <Text style={styles.noDataText}>No salary data available</Text>
                    </View>
                )}
            </View>
        </Modal>
    );

    if (loading) {
        return <Loading message="Loading salary structures..." />;
    }

    return (
        <View style={styles.container}>
            {/* Statistics Summary */}
            {statistics && (
                <View style={styles.statsContainer}>
                    <View style={styles.statCard}>
                        <Icon name="account-group" size={24} color={colors.primary} />
                        <Text style={styles.statValue}>{statistics.total_employees}</Text>
                        <Text style={styles.statLabel}>Employees</Text>
                    </View>
                    <View style={styles.statCard}>
                        <Icon name="currency-inr" size={24} color={colors.success} />
                        <Text style={styles.statValue}>{formatCurrency(statistics.total_ctc)}</Text>
                        <Text style={styles.statLabel}>Total CTC</Text>
                    </View>
                </View>
            )}
            
            {/* Filters */}
            <View style={styles.filterContainer}>
                <TextInput
                    style={styles.searchInput}
                    placeholder="Search by name, ID, department..."
                    value={searchText}
                    onChangeText={setSearchText}
                    placeholderTextColor={colors.textSecondary}
                />
                
                <View style={styles.filterRow}>
                    <View style={styles.filterPicker}>
                        <Picker
                            selectedValue={filterDepartment}
                            onValueChange={setFilterDepartment}
                            style={styles.picker}
                        >
                            <Picker.Item label="All Departments" value="" />
                            {departments.map((dept) => (
                                <Picker.Item key={dept.name} label={dept.name} value={dept.name} />
                            ))}
                        </Picker>
                    </View>
                    
                    <View style={styles.filterPicker}>
                        <Picker
                            selectedValue={filterStructure}
                            onValueChange={setFilterStructure}
                            style={styles.picker}
                        >
                            <Picker.Item label="All Structures" value="" />
                            {structureList.map((s) => (
                                <Picker.Item key={s.name} label={s.name} value={s.name} />
                            ))}
                        </Picker>
                    </View>
                </View>
            </View>
            
            {/* Results Count */}
            <View style={styles.resultCount}>
                <Text style={styles.resultText}>
                    Showing {filteredAssignments.length} of {assignments.length} employees
                </Text>
            </View>
            
            {/* Employee List */}
            <FlatList
                data={filteredAssignments}
                renderItem={renderEmployeeCard}
                keyExtractor={(item) => item.name}
                contentContainerStyle={styles.listContent}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
                }
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Icon name="file-document-outline" size={64} color={colors.textSecondary} />
                        <Text style={styles.emptyText}>No salary structures found</Text>
                    </View>
                }
            />
            
            {renderDetailModal()}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    statsContainer: {
        flexDirection: 'row',
        padding: 12,
        gap: 12,
    },
    statCard: {
        flex: 1,
        backgroundColor: colors.surface,
        borderRadius: 12,
        padding: 16,
        alignItems: 'center',
        elevation: 2,
    },
    statValue: {
        fontSize: 18,
        fontWeight: 'bold',
        color: colors.textPrimary,
        marginTop: 8,
    },
    statLabel: {
        fontSize: 12,
        color: colors.textSecondary,
        marginTop: 4,
    },
    filterContainer: {
        paddingHorizontal: 12,
        paddingBottom: 8,
    },
    searchInput: {
        backgroundColor: colors.surface,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 14,
        color: colors.textPrimary,
        marginBottom: 8,
    },
    filterRow: {
        flexDirection: 'row',
        gap: 8,
    },
    filterPicker: {
        flex: 1,
        backgroundColor: colors.surface,
        borderRadius: 8,
        overflow: 'hidden',
    },
    picker: {
        height: 44,
    },
    resultCount: {
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    resultText: {
        fontSize: 12,
        color: colors.textSecondary,
    },
    listContent: {
        paddingHorizontal: 12,
        paddingBottom: 20,
    },
    employeeCard: {
        backgroundColor: colors.surface,
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        elevation: 2,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 12,
    },
    employeeInfo: {
        flex: 1,
    },
    employeeName: {
        fontSize: 16,
        fontWeight: 'bold',
        color: colors.textPrimary,
    },
    employeeId: {
        fontSize: 12,
        color: colors.textSecondary,
        marginTop: 2,
    },
    ctcBadge: {
        alignItems: 'flex-end',
    },
    ctcLabel: {
        fontSize: 10,
        color: colors.textSecondary,
    },
    ctcAmount: {
        fontSize: 16,
        fontWeight: 'bold',
        color: colors.primary,
    },
    cardDetails: {
        flexDirection: 'row',
        marginBottom: 12,
    },
    detailRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginRight: 16,
    },
    detailText: {
        fontSize: 12,
        color: colors.textSecondary,
        marginLeft: 4,
    },
    cardFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        borderTopWidth: 1,
        borderTopColor: colors.border,
        paddingTop: 12,
    },
    salaryRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    salaryLabel: {
        fontSize: 12,
        color: colors.textSecondary,
        marginRight: 4,
    },
    salaryValue: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.textPrimary,
    },
    structureBadge: {
        position: 'absolute',
        top: 12,
        right: 12,
        backgroundColor: colors.primaryLight || '#E3F2FD',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
    },
    structureText: {
        fontSize: 10,
        color: colors.primary,
        fontWeight: '500',
    },
    effectiveDateRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 8,
    },
    effectiveDateText: {
        fontSize: 11,
        color: colors.textSecondary,
        marginLeft: 4,
    },
    viewDetailHint: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        marginTop: 8,
    },
    viewDetailText: {
        fontSize: 11,
        color: colors.primary,
        marginRight: 2,
    },
    infoCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.primaryLight || '#E3F2FD',
        borderRadius: 8,
        padding: 12,
        marginTop: 12,
    },
    infoText: {
        fontSize: 12,
        color: colors.primary,
        marginLeft: 8,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 60,
    },
    emptyText: {
        fontSize: 14,
        color: colors.textSecondary,
        marginTop: 16,
    },
    modalContainer: {
        flex: 1,
        backgroundColor: colors.background,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 16,
        backgroundColor: colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: colors.textPrimary,
    },
    modalContent: {
        flex: 1,
        padding: 16,
    },
    detailSection: {
        backgroundColor: colors.surface,
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
    },
    detailName: {
        fontSize: 20,
        fontWeight: 'bold',
        color: colors.textPrimary,
    },
    detailDesignation: {
        fontSize: 14,
        color: colors.primary,
        marginTop: 4,
    },
    detailStructure: {
        fontSize: 12,
        color: colors.textSecondary,
        marginTop: 8,
    },
    baseVarSection: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 12,
    },
    baseVarItem: {
        flex: 1,
        backgroundColor: colors.surface,
        borderRadius: 12,
        padding: 16,
        alignItems: 'center',
    },
    baseVarLabel: {
        fontSize: 12,
        color: colors.textSecondary,
    },
    baseVarValue: {
        fontSize: 18,
        fontWeight: 'bold',
        color: colors.textPrimary,
        marginTop: 4,
    },
    componentSection: {
        backgroundColor: colors.surface,
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.textPrimary,
        marginBottom: 12,
    },
    componentRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: colors.border + '30',
    },
    componentDetailRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: colors.border + '30',
    },
    componentName: {
        fontSize: 14,
        color: colors.textPrimary,
    },
    componentAbbr: {
        fontSize: 12,
        color: colors.textSecondary,
        marginLeft: 4,
    },
    formulaText: {
        fontSize: 11,
        color: colors.primary,
        marginTop: 2,
        fontStyle: 'italic',
    },
    calcNote: {
        fontSize: 10,
        color: colors.textSecondary,
        marginTop: 2,
        fontStyle: 'italic',
    },
    componentAmountGreen: {
        fontSize: 14,
        fontWeight: '500',
        color: colors.success,
    },
    componentAmountRed: {
        fontSize: 14,
        fontWeight: '500',
        color: colors.error,
    },
    totalRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 2,
        borderTopColor: colors.border,
    },
    totalLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.textPrimary,
    },
    totalAmountGreen: {
        fontSize: 16,
        fontWeight: 'bold',
        color: colors.success,
    },
    totalAmountRed: {
        fontSize: 16,
        fontWeight: 'bold',
        color: colors.error,
    },
    netPaySection: {
        backgroundColor: colors.primary,
        borderRadius: 12,
        padding: 20,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    netPayLabel: {
        fontSize: 16,
        fontWeight: '600',
        color: '#fff',
    },
    netPayValue: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#fff',
    },
    noData: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    noDataText: {
        fontSize: 14,
        color: colors.textSecondary,
    },
});

export default SalaryStructureAdminScreen;
