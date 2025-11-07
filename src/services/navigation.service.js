import { createNavigationContainerRef } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef();

class NavigationService {
    navigate(name, params) {
        if (navigationRef.isReady()) {
            navigationRef.navigate(name, params);
        }
    }

    goBack() {
        if (navigationRef.isReady()) {
            navigationRef.goBack();
        }
    }

    reset(state) {
        if (navigationRef.isReady()) {
            navigationRef.reset(state);
        }
    }

    getCurrentRoute() {
        if (navigationRef.isReady()) {
            return navigationRef.getCurrentRoute();
        }
        return null;
    }

    // Notification-specific navigation handlers
    handleProjectLogNotification(data) {
        this.navigate('EmployeeProjectLogsScreen', { 
            projectId: data.project_id,
            autoFocus: true 
        });
    }

    handleAttendanceNotification(data) {
        if (data.action === 'checkin' || data.action === 'checkout') {
            this.navigate('EmployeeAttendanceScreen', { 
                autoAction: data.action 
            });
        }
    }

    handleWFHNotification(data) {
        this.navigate('WFHRequestsScreen', { 
            requestId: data.request_id,
            action: data.action 
        });
    }

    handleAdminNotification(data) {
        switch (data.notification_type) {
            case 'wfh_request':
                this.navigate('WFHApprovalsScreen', { 
                    requestId: data.request_id 
                });
                break;
            case 'general':
                this.navigate('AdminNotifications', { 
                    notificationId: data.notification_id 
                });
                break;
            default:
                this.navigate('AdminDashboard');
        }
    }
}

export default new NavigationService();