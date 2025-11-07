# 📝 Complete Leave Application Workflow

## 🎯 Overview
A comprehensive leave application system similar to WFH requests, enabling employees to apply for leaves and admins to approve/reject with automatic notifications.

## 🔄 Complete Workflow Process

### 1. **Employee Side - Leave Application**
```
Employee → LeaveApplicationScreen → Submit Application → Admin Notification
```

#### Features:
- ✅ **Multiple Leave Types**: Casual, Sick, Earned, Emergency, Maternity, Paternity
- ✅ **Date Selection**: From/To date picker with automatic days calculation
- ✅ **Reason Input**: Detailed reason for leave application
- ✅ **Application History**: View all past applications with status
- ✅ **Real-time Status**: Pending, Approved, Rejected with color indicators
- ✅ **Automatic Notifications**: Employee gets notified on approval/rejection

### 2. **Admin Side - Leave Approvals**
```
Admin → LeaveApprovalsScreen → Review Applications → Approve/Reject → Employee Notification
```

#### Features:
- ✅ **Pending Applications**: View all pending leave requests
- ✅ **Filtering Options**: By status (pending/all/approved/rejected) and date (today/week/month)
- ✅ **Employee Details**: Name, department, leave type, dates, reason
- ✅ **Approve/Reject Actions**: Quick approve or reject with reason
- ✅ **Statistics Dashboard**: Count of pending, approved, rejected applications
- ✅ **Automatic Notifications**: Employee gets notified immediately

## 📱 User Interface

### **LeaveApplicationScreen.js**
```
Header Section
├── Back Button
├── Title: "Leave Application"
└── Subtitle: "Apply for leave"

Employee Info Card
├── Icon: User Clock
├── Employee Details (Name, Department, Designation)
└── Quick Action: "Go to Dashboard"

Application Form
├── Leave Type Picker (6 types available)
├── From Date Picker
├── To Date Picker
├── Days Calculation (automatic)
├── Reason Input (multi-line)
└── Submit Button

Applications History
├── Search/Refresh Option
├── Application Cards with:
│   ├── Leave Type Icon
│   ├── Status Badge (Pending/Approved/Rejected)
│   ├── Date Range & Days Count
│   ├── Reason
│   ├── Application Date
│   ├── Processed By (if approved/rejected)
│   ├── Approval/Rejection Notice
│   └── Rejection Reason (if rejected)
└── Empty State for no applications
```

### **LeaveApprovalsScreen.js**
```
Header Section
├── Back Button
├── Title: "Leave Approvals"
└── Subtitle: "Review and process leave applications"

Filters Section
├── Status Filter (Pending/All/Approved/Rejected)
└── Date Filter (All/Today/This Week/This Month)

Statistics Section
├── Pending Count
├── Approved Count
└── Rejected Count

Applications List
├── Application Cards with:
│   ├── Employee Info (Name, Department)
│   ├── Status Badge
│   ├── Leave Type & Icon
│   ├── Date Range & Days
│   ├── Reason Section
│   ├── Application Metadata
│   ├── Action Buttons (Approve/Reject) - for pending only
│   └── Rejection Reason Box (if rejected)
└── Empty State for no applications
```

## 🔧 Technical Implementation

### **API Endpoints**
```javascript
// Employee APIs
submitLeaveApplication(applicationData)
getLeaveApplications()

// Admin APIs  
getPendingLeaveApplications(filter, dateFilter)
processLeaveApplication({application_id, action, rejection_reason})

// Notification APIs
sendLeaveNotification(applicationData)
```

### **Backend Functions** (zbackendserverfile.py)
```python
# Employee Functions
submit_leave_application()      # Create new leave application
get_leave_applications()        # Get user's applications

# Admin Functions
get_pending_leave_applications() # Get applications for admin review
leave_application_action()      # Process approve/reject

# Notification Functions
send_leave_notification()       # Send admin notifications
```

### **Notification Service** (notification.service.js)
```javascript
// Employee Notifications
sendLeaveNotification(applicationData)        # When application submitted
sendLeaveApprovalNotification(data)          # When approved/rejected

// Admin Notifications  
sendAdminLeaveNotification(applicationData)   # New application alert
```

## 📊 Database Schema

### **Leave Application Document**
```
- employee: Link to Employee
- leave_type: Select (Casual/Sick/Earned/Emergency/Maternity/Paternity)
- from_date: Date
- to_date: Date
- reason: Text
- number_of_days: Int
- status: Select (Pending/Approved/Rejected)
- approved_by: Link to User
- rejected_by: Link to User
- rejection_reason: Text
- approval_date: Datetime
- rejection_date: Datetime
- creation: Datetime (auto)
```

## 🔔 Notification Flow

### **When Employee Submits Application:**
1. Local notification to employee: "Application submitted"
2. FCM notification to all admin users
3. Toast notification: Success confirmation

### **When Admin Approves/Rejects:**
1. FCM notification to employee with status
2. Local notification to employee  
3. Toast notification to admin: Action confirmed
4. If rejected: Include rejection reason in notification

## 📋 Leave Types Supported

| Leave Type | Icon | Description |
|------------|------|-------------|
| Casual | calendar-day | Regular casual leave |
| Sick | thermometer-half | Medical/health related |
| Earned | star | Earned leave entitlement |
| Emergency | exclamation-triangle | Urgent situations |
| Maternity | baby | Maternity leave |
| Paternity | baby | Paternity leave |

## 🎨 UI/UX Features

### **Status Indicators**
- 🟡 **Pending**: Yellow badge with clock icon
- 🟢 **Approved**: Green badge with check icon + approval notice
- 🔴 **Rejected**: Red badge with X icon + rejection reason

### **Date Handling**
- Date picker integration (react-native-community/datetimepicker)
- Automatic days calculation
- Date range validation (to_date >= from_date)
- Minimum date: Today (no backdating)

### **Responsive Design**
- Card-based layout
- Touch-friendly buttons
- Loading states
- Pull-to-refresh functionality
- Empty states with helpful messaging

## 🚀 Deployment Checklist

### **Frontend Ready:**
- ✅ LeaveApplicationScreen.js (Complete UI)
- ✅ LeaveApprovalsScreen.js (Complete Admin UI)
- ✅ API Service methods added
- ✅ Notification service enhanced
- ✅ Error handling implemented

### **Backend Ready:**
- ✅ Leave application submission API
- ✅ Leave applications retrieval API
- ✅ Admin approval workflow API
- ✅ FCM notification integration
- ✅ Date-based filtering
- ✅ Permission controls

### **Testing Requirements:**
1. **Employee Flow**: Submit various leave types
2. **Admin Flow**: Approve/reject applications
3. **Notifications**: Verify FCM delivery
4. **Filtering**: Test date and status filters
5. **Edge Cases**: Validation, permissions, error handling

## 📈 Future Enhancements

### **Possible Additions:**
- Leave balance tracking
- Calendar integration
- Email notifications
- Leave policy enforcement
- Bulk approval actions
- Leave reports and analytics
- Holiday calendar integration
- Team leave conflicts detection

---

## 🎉 **The Complete Leave Application Workflow is Ready!**

**Workflow Summary:**
```
Employee applies → Admin gets notified → Admin approves/rejects → Employee gets notified
```

This mirrors the WFH approval system but is specifically designed for comprehensive leave management with multiple leave types, date filtering, and detailed tracking.