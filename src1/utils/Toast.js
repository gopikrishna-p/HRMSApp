import Toast from 'react-native-toast-message';

/**
 * Show a toast notification
 * @param {Object} options - Toast configuration
 * @param {string} options.type - Type of toast: 'success', 'error', 'info'
 * @param {string} options.text1 - Main heading text
 * @param {string} options.text2 - Description text
 * @param {number} options.visibilityTime - Duration in milliseconds (default: 4000)
 * @param {string} options.position - Position: 'top' or 'bottom' (default: 'top')
 */
const showToast = ({
    type = 'success',
    text1 = '',
    text2 = '',
    visibilityTime = 4000,
    position = 'top'
}) => {
    Toast.show({
        type,
        text1,
        text2,
        visibilityTime,
        position,
        topOffset: 50,
        bottomOffset: 40,
    });
};

export default showToast;