import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    RefreshControl,
    Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { colors } from '../../theme/colors';
import Loading from '../../components/common/Loading';
import apiService, { extractFrappeData, isApiSuccess } from '../../services/api.service';

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
            console.log('Salary Structure Response:', JSON.stringify(response, null, 2));

            if (isApiSuccess(response)) {
                // extractFrappeData already returns the unwrapped data from {status: 'success', data: {...}}
                const data = extractFrappeData(response, null);
                console.log('Extracted Salary Data:', JSON.stringify(data, null, 2));
                
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

    const formatCurrency = (amount, currency = 'INR') => {
        const currencySymbol = currency === 'INR' ? '₹' : currency;
        return `${currencySymbol} ${parseFloat(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    if (loading) {
        return <Loading message="Loading salary structure..." />;
    }

    if (error) {
        return (
            <View style={styles.container}>
                <View style={styles.errorContainer}>
                    <Icon name="alert-circle-outline" size={64} color={colors.textSecondary} />
                    <Text style={styles.errorTitle}>No Salary Structure</Text>
                    <Text style={styles.errorText}>{error}</Text>
                    <Text style={styles.errorHint}>Contact HR for salary structure assignment</Text>
                </View>
            </View>
        );
    }

    return (
        <ScrollView
            style={styles.container}
            refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
            }
        >
            {/* Header Card */}
            <View style={styles.headerCard}>
                <View style={styles.headerRow}>
                    <View>
                        <Text style={styles.employeeName}>{salaryData?.employee_name}</Text>
                        <Text style={styles.designation}>{salaryData?.designation || 'Employee'}</Text>
                        <Text style={styles.department}>{salaryData?.department}</Text>
                    </View>
                    <View style={styles.structureBadge}>
                        <Text style={styles.structureLabel}>{salaryData?.salary_structure}</Text>
                        <Text style={styles.frequencyLabel}>{salaryData?.payroll_frequency}</Text>
                    </View>
                </View>
                <View style={styles.divider} />
                <View style={styles.effectiveDateRow}>
                    <Icon name="calendar-check" size={16} color={colors.textSecondary} />
                    <Text style={styles.effectiveDate}>
                        Effective from: {salaryData?.from_date || 'N/A'}
                    </Text>
                </View>
            </View>

            {/* Base & Variable Section */}
            <View style={styles.baseVariableCard}>
                <View style={styles.baseVariableRow}>
                    <View style={styles.baseItem}>
                        <Text style={styles.baseLabel}>Base Pay</Text>
                        <Text style={styles.baseValue}>
                            {formatCurrency(salaryData?.base, salaryData?.currency)}
                        </Text>
                    </View>
                    <View style={styles.variableItem}>
                        <Text style={styles.variableLabel}>Variable</Text>
                        <Text style={styles.variableValue}>
                            {formatCurrency(salaryData?.variable, salaryData?.currency)}
                        </Text>
                    </View>
                </View>
            </View>

            {/* Earnings Section */}
            <View style={styles.section}>
                <View style={styles.sectionHeader}>
                    <Icon name="plus-circle" size={20} color={colors.success} />
                    <Text style={styles.sectionTitle}>Earnings</Text>
                </View>
                {salaryData?.earnings?.length > 0 ? (
                    salaryData.earnings.map((earning, index) => (
                        <View key={index} style={styles.componentRow}>
                            <View style={styles.componentLeft}>
                                <Text style={styles.componentName}>{earning.salary_component}</Text>
                                {earning.abbr && (
                                    <Text style={styles.componentAbbr}>({earning.abbr})</Text>
                                )}
                                {earning.formula && earning.amount_based_on_formula ? (
                                    <Text style={styles.formulaText}>
                                        Formula: {earning.formula}
                                    </Text>
                                ) : null}
                            </View>
                            <Text style={[styles.componentAmount, styles.earningAmount]}>
                                {formatCurrency(earning.calculated_amount || earning.amount, salaryData?.currency)}
                            </Text>
                        </View>
                    ))
                ) : (
                    <Text style={styles.noComponents}>No earnings components</Text>
                )}
                <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Total Earnings</Text>
                    <Text style={[styles.totalAmount, styles.earningTotal]}>
                        {formatCurrency(salaryData?.total_earnings, salaryData?.currency)}
                    </Text>
                </View>
            </View>

            {/* Deductions Section */}
            <View style={styles.section}>
                <View style={styles.sectionHeader}>
                    <Icon name="minus-circle" size={20} color={colors.error} />
                    <Text style={styles.sectionTitle}>Deductions</Text>
                </View>
                {salaryData?.deductions?.length > 0 ? (
                    salaryData.deductions.map((deduction, index) => (
                        <View key={index} style={styles.componentRow}>
                            <View style={styles.componentLeft}>
                                <Text style={styles.componentName}>{deduction.salary_component}</Text>
                                {deduction.abbr && (
                                    <Text style={styles.componentAbbr}>({deduction.abbr})</Text>
                                )}
                                {deduction.formula && deduction.amount_based_on_formula ? (
                                    <Text style={styles.formulaText}>
                                        Formula: {deduction.formula}
                                    </Text>
                                ) : null}
                                {deduction.calculation_note ? (
                                    <Text style={styles.calculationNote}>
                                        {deduction.calculation_note}
                                    </Text>
                                ) : null}
                            </View>
                            <Text style={[styles.componentAmount, styles.deductionAmount]}>
                                -{formatCurrency(deduction.calculated_amount || deduction.amount, salaryData?.currency)}
                            </Text>
                        </View>
                    ))
                ) : (
                    <Text style={styles.noComponents}>No deduction components</Text>
                )}
                <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Total Deductions</Text>
                    <Text style={[styles.totalAmount, styles.deductionTotal]}>
                        -{formatCurrency(salaryData?.total_deductions, salaryData?.currency)}
                    </Text>
                </View>
            </View>

            {/* Net Pay Section */}
            <View style={styles.netPayCard}>
                <View style={styles.netPayRow}>
                    <Text style={styles.netPayLabel}>Net Pay (Per Month)</Text>
                    <Text style={styles.netPayAmount}>
                        {formatCurrency(salaryData?.net_pay, salaryData?.currency)}
                    </Text>
                </View>
            </View>

            {/* Leave Encashment */}
            {salaryData?.leave_encashment_per_day > 0 && (
                <View style={styles.infoCard}>
                    <Icon name="information-outline" size={18} color={colors.primary} />
                    <Text style={styles.infoText}>
                        Leave Encashment Rate: {formatCurrency(salaryData?.leave_encashment_per_day, salaryData?.currency)} per day
                    </Text>
                </View>
            )}

            {/* Disclaimer */}
            <View style={styles.disclaimer}>
                <Text style={styles.disclaimerText}>
                    * This is an indicative salary structure. Actual salary may vary based on attendance, overtime, and other factors.
                </Text>
            </View>

            <View style={{ height: 30 }} />
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    errorContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
    },
    errorTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: colors.textPrimary,
        marginTop: 16,
    },
    errorText: {
        fontSize: 14,
        color: colors.textSecondary,
        marginTop: 8,
        textAlign: 'center',
    },
    errorHint: {
        fontSize: 12,
        color: colors.primary,
        marginTop: 16,
    },
    headerCard: {
        backgroundColor: colors.surface,
        margin: 16,
        marginBottom: 8,
        borderRadius: 12,
        padding: 16,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    employeeName: {
        fontSize: 18,
        fontWeight: 'bold',
        color: colors.textPrimary,
    },
    designation: {
        fontSize: 14,
        color: colors.primary,
        marginTop: 4,
    },
    department: {
        fontSize: 12,
        color: colors.textSecondary,
        marginTop: 2,
    },
    structureBadge: {
        alignItems: 'flex-end',
    },
    structureLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: colors.primary,
        backgroundColor: colors.primaryLight || '#E3F2FD',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    frequencyLabel: {
        fontSize: 10,
        color: colors.textSecondary,
        marginTop: 4,
    },
    divider: {
        height: 1,
        backgroundColor: colors.border,
        marginVertical: 12,
    },
    effectiveDateRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    effectiveDate: {
        fontSize: 12,
        color: colors.textSecondary,
        marginLeft: 6,
    },
    baseVariableCard: {
        backgroundColor: colors.surface,
        marginHorizontal: 16,
        marginBottom: 8,
        borderRadius: 12,
        padding: 16,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
    },
    baseVariableRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
    },
    baseItem: {
        alignItems: 'center',
    },
    baseLabel: {
        fontSize: 12,
        color: colors.textSecondary,
    },
    baseValue: {
        fontSize: 18,
        fontWeight: 'bold',
        color: colors.textPrimary,
        marginTop: 4,
    },
    variableItem: {
        alignItems: 'center',
    },
    variableLabel: {
        fontSize: 12,
        color: colors.textSecondary,
    },
    variableValue: {
        fontSize: 18,
        fontWeight: 'bold',
        color: colors.primary,
        marginTop: 4,
    },
    section: {
        backgroundColor: colors.surface,
        marginHorizontal: 16,
        marginBottom: 8,
        borderRadius: 12,
        padding: 16,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
        paddingBottom: 8,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.textPrimary,
        marginLeft: 8,
    },
    componentRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: colors.border + '30',
    },
    componentLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    componentName: {
        fontSize: 14,
        color: colors.textPrimary,
    },
    componentAbbr: {
        fontSize: 12,
        color: colors.textSecondary,
        marginLeft: 6,
    },
    formulaText: {
        fontSize: 11,
        color: colors.primary,
        marginTop: 2,
        fontStyle: 'italic',
    },
    calculationNote: {
        fontSize: 10,
        color: colors.textSecondary,
        marginTop: 2,
        fontStyle: 'italic',
    },
    componentAmount: {
        fontSize: 14,
        fontWeight: '500',
    },
    earningAmount: {
        color: colors.success,
    },
    deductionAmount: {
        color: colors.error,
    },
    noComponents: {
        fontSize: 14,
        color: colors.textSecondary,
        fontStyle: 'italic',
        textAlign: 'center',
        paddingVertical: 12,
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
    totalAmount: {
        fontSize: 16,
        fontWeight: 'bold',
    },
    earningTotal: {
        color: colors.success,
    },
    deductionTotal: {
        color: colors.error,
    },
    netPayCard: {
        backgroundColor: colors.primary,
        marginHorizontal: 16,
        marginBottom: 8,
        borderRadius: 12,
        padding: 20,
        elevation: 3,
    },
    netPayRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    netPayLabel: {
        fontSize: 16,
        fontWeight: '600',
        color: '#fff',
    },
    netPayAmount: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#fff',
    },
    infoCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.primaryLight || '#E3F2FD',
        marginHorizontal: 16,
        marginBottom: 8,
        borderRadius: 8,
        padding: 12,
    },
    infoText: {
        fontSize: 12,
        color: colors.primary,
        marginLeft: 8,
        flex: 1,
    },
    disclaimer: {
        marginHorizontal: 16,
        marginTop: 8,
        padding: 12,
    },
    disclaimerText: {
        fontSize: 11,
        color: colors.textSecondary,
        fontStyle: 'italic',
        textAlign: 'center',
    },
});

export default SalaryStructureScreen;