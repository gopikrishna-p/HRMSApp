import React from 'react';
import {
  View,
  Modal,
  Pressable,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { useAppTheme } from '../../context/ThemeContext';

/**
 * BottomSheetModal - Consistent bottom sheet modal component
 * 
 * @param {boolean} visible - Whether the modal is visible
 * @param {function} onDismiss - Callback when modal is dismissed
 * @param {string} title - Modal title
 * @param {React.ReactNode} children - Modal content
 * @param {boolean} loading - Whether to disable interactions
 * @param {string} maxHeight - Max height percentage (default: '85%')
 */
const BottomSheetModal = ({
  visible,
  onDismiss,
  title,
  children,
  loading = false,
  maxHeight = '85%',
}) => {
  const { colors, isDarkMode } = useAppTheme();

  const dynamicStyles = {
    modalContent: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      maxHeight,
    },
    modalHeader: {
      borderBottomColor: isDarkMode ? colors.border : '#F3F4F6',
    },
    modalTitle: {
      color: colors.text,
    },
    closeButton: {
      backgroundColor: isDarkMode ? colors.surfaceVariant : '#F3F4F6',
    },
  };

  return (
    <Modal
      transparent
      animationType="slide"
      visible={visible}
      onRequestClose={() => !loading && onDismiss?.()}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardAvoid}
      >
        <Pressable
          style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}
          onPress={() => !loading && onDismiss?.()}
        >
          <View />
        </Pressable>
        <View style={[styles.modalContent, dynamicStyles.modalContent]}>
          <View style={[styles.modalHeader, dynamicStyles.modalHeader]}>
            <Text style={[styles.modalTitle, dynamicStyles.modalTitle]}>{title}</Text>
            <TouchableOpacity
              onPress={() => !loading && onDismiss?.()}
              style={[styles.closeButton, dynamicStyles.closeButton]}
              disabled={loading}
            >
              <Icon name="times" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView
            style={styles.modalBody}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

/**
 * ModalActions - Footer actions for BottomSheetModal
 */
export const ModalActions = ({
  onCancel,
  onSubmit,
  cancelLabel = 'Cancel',
  submitLabel = 'Submit',
  loading = false,
  disabled = false,
  submitIcon = 'check',
}) => {
  const { colors, isDarkMode } = useAppTheme();

  const dynamicStyles = {
    cancelButton: {
      backgroundColor: isDarkMode ? colors.surfaceVariant : '#F3F4F6',
    },
    cancelButtonText: {
      color: colors.textSecondary,
    },
    submitButton: {
      backgroundColor: disabled || loading ? colors.textTertiary : colors.text,
    },
  };

  return (
    <View style={styles.modalActions}>
      <TouchableOpacity
        onPress={onCancel}
        style={[styles.cancelButton, dynamicStyles.cancelButton]}
        disabled={loading}
      >
        <Text style={[styles.cancelButtonText, dynamicStyles.cancelButtonText]}>
          {cancelLabel}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onSubmit}
        style={[styles.submitButton, dynamicStyles.submitButton]}
        disabled={disabled || loading}
      >
        {loading ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <>
            {submitIcon && <Icon name={submitIcon} size={14} color="#FFFFFF" />}
            <Text style={styles.submitButtonText}>{submitLabel}</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
};

/**
 * ModalInput - Styled input for BottomSheetModal
 */
export const ModalInput = ({
  label,
  required = false,
  children,
}) => {
  const { colors } = useAppTheme();

  return (
    <View style={styles.inputGroup}>
      {label && (
        <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
          {label} {required && <Text style={{ color: colors.error }}>*</Text>}
        </Text>
      )}
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  keyboardAvoid: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
  },
  modalContent: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBody: {
    padding: 20,
    paddingBottom: 40,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    paddingBottom: 20,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
  submitButton: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  submitButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

export default BottomSheetModal;
