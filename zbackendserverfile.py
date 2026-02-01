
#Actual file name /home/gcp_user/frappe-bench-v15/apps/hrms/hrms/api/__init__.py
import frappe
from frappe import _
from frappe.model import get_permitted_fields
from frappe.model.workflow import get_workflow_name
from frappe.query_builder import Order
from frappe.utils import add_days, date_diff, getdate, strip_html, nowdate, cint, now_datetime, today
import json
from datetime import timedelta
from geopy.distance import geodesic
import firebase_admin
from firebase_admin import credentials, messaging

from erpnext.setup.doctype.employee.employee import get_holiday_list_for_employee

SUPPORTED_FIELD_TYPES = [
	"Link",
	"Select",   
	"Small Text",
	"Text",
	"Long Text",
	"Text Editor",
	"Table",
	"Check",
	"Data",
	"Float",
	"Int",
	"Section Break",
	"Date",
	"Time",
	"Datetime",
	"Currency",
]


def set_wfh_days(doc, method=None):
	"""
	Hook to calculate and set Work From Home (WFH) days in Salary Slip
	based on attendance records within the salary slip period.
	
	This function is called as a before_validate hook on Salary Slip creation.
	"""
	try:
		# Only process Salary Slip documents
		if doc.doctype != "Salary Slip":
			return
		
		# Get attendance records for the salary slip period
		attendance_records = frappe.get_all(
			"Attendance",
			filters={
				"employee": doc.employee,
				"attendance_date": ["between", [doc.start_date, doc.end_date]],
				"docstatus": 1,
			},
			fields=["attendance_date", "status"],
		)
		
		# Count Work From Home days
		wfh_days = sum(1 for a in attendance_records if a.status == "Work From Home")
		
		# Set the custom_wfh_days field
		doc.custom_wfh_days = wfh_days
		
	except Exception as e:
		# Log the error but don't throw to prevent salary slip creation failure
		frappe.logger().warning(f"Failed to set WFH days for {doc.employee}: {str(e)}")


@frappe.whitelist()
def get_current_user_info() -> dict:
	current_user = frappe.session.user
	user = frappe.db.get_value(
		"User", current_user, ["name", "first_name", "full_name", "user_image"], as_dict=True
	)
	user["roles"] = frappe.get_roles(current_user)

	return user


@frappe.whitelist()
def get_current_employee_info() -> dict:
	current_user = frappe.session.user
	employee = frappe.db.get_value(
		"Employee",
		{"user_id": current_user, "status": "Active"},
		[
			"name",
			"first_name",
			"employee_name",
			"designation",
			"department",
			"company",
			"reports_to",
			"user_id",
		],
		as_dict=True,
	)
	return employee


def get_employee_by_user():
	"""Helper function to get employee ID for current user."""
	current_user = frappe.session.user
	employee_id = frappe.db.get_value(
		"Employee",
		{"user_id": current_user, "status": "Active"},
		"name"
	)
	return employee_id


@frappe.whitelist()
def get_all_employees() -> list[dict]:
    """
    Get all active employees for admin use.
    Only returns employees with status = 'Active'
    """
    return frappe.get_all(
        "Employee",
        fields=[
            "name",
            "employee_name",
            "designation",
            "department",
            "company",
            "reports_to",
            "user_id",
            "image",
            "status",
        ],
        #filters={"status": "Active"},  # Explicitly filter for active employees only
        order_by="employee_name asc",   # Sort alphabetically for better UX
        limit=999999,
    )


# ============================================================================
# EMPLOYEE ANALYTICS APIs - Comprehensive Dashboard Data
# ============================================================================

@frappe.whitelist()
def get_employee_analytics(
	employee: str | None = None,
	from_date: str | None = None,
	to_date: str | None = None,
	period: str = "current_month",
) -> dict:
	"""
	Get comprehensive employee analytics for dashboard.
	
	Args:
		employee: Employee ID (if None, uses current user's employee)
		from_date: Start date (YYYY-MM-DD) - overrides period
		to_date: End date (YYYY-MM-DD) - overrides period
		period: Predefined period - "current_month", "last_month", "current_year", "custom"
	
	Returns:
		Comprehensive analytics dict with:
		- attendance: detailed attendance statistics
		- leave: leave balance and usage
		- expense: expense claims summary
		- travel: travel requests summary
		- projects: project and task stats
		- performance: overall performance metrics
	"""
	try:
		# Get employee
		if not employee:
			employee = get_employee_by_user()
			if not employee:
				frappe.throw(_("No employee record found for current user"))
		
		# Verify permission - employees can only see their own data
		current_employee = get_employee_by_user()
		user_roles = frappe.get_roles()
		is_admin = bool(set(user_roles) & {"Administrator", "System Manager", "HR Manager", "HR User"})
		
		if not is_admin and employee != current_employee:
			frappe.throw(_("You can only view your own analytics"))
		
		# Calculate date range based on period
		if from_date and to_date:
			start_date = getdate(from_date)
			end_date = getdate(to_date)
		else:
			if period == "current_month":
				today = getdate()
				start_date = today.replace(day=1)
				next_month = start_date.replace(day=28) + timedelta(days=4)
				end_date = next_month.replace(day=1) - timedelta(days=1)
			elif period == "last_month":
				today = getdate()
				end_date = today.replace(day=1) - timedelta(days=1)
				start_date = end_date.replace(day=1)
			elif period == "current_year":
				today = getdate()
				start_date = today.replace(month=1, day=1)
				end_date = today.replace(month=12, day=31)
			else:
				# Default to current month
				today = getdate()
				start_date = today.replace(day=1)
				next_month = start_date.replace(day=28) + timedelta(days=4)
				end_date = next_month.replace(day=1) - timedelta(days=1)
		
		# Get employee info
		emp_info = frappe.get_doc("Employee", employee)
		
		# Build analytics response
		analytics = {
			"employee": employee,
			"employee_name": emp_info.employee_name,
			"department": emp_info.department,
			"designation": emp_info.designation,
			"company": emp_info.company,
			"period": {
				"from_date": str(start_date),
				"to_date": str(end_date),
				"period_type": period,
			},
			
			# Attendance Analytics
			"attendance": get_attendance_analytics(employee, start_date, end_date),
			
			# Leave Analytics
			"leave": get_leave_analytics(employee, start_date, end_date),
			
			# Expense Analytics
			"expense": get_expense_analytics(employee, start_date, end_date),
			
			# Travel Analytics
			"travel": get_travel_analytics(employee, start_date, end_date),
			
			# Project & Task Analytics
			"projects": get_project_analytics(employee, start_date, end_date),
			
			# Overall Performance Score
			"performance": calculate_performance_score(employee, start_date, end_date),
		}
		
		return {
			"status": "success",
			"data": analytics,
			"message": _("Analytics fetched successfully"),
		}
		
	except Exception as e:
		frappe.log_error(f"Get Employee Analytics Error: {str(e)}\n{frappe.get_traceback()}", "Employee Analytics")
		return {
			"status": "error",
			"message": str(e),
			"data": None,
		}


def get_attendance_analytics(employee: str, start_date, end_date) -> dict:
	"""Get detailed attendance analytics."""
	try:
		# Get all attendance records for period
		attendance_records = frappe.get_all(
			"Attendance",
			filters={
				"employee": employee,
				"attendance_date": ["between", [start_date, end_date]],
				"docstatus": 1,
			},
			fields=["attendance_date", "status", "working_hours", "in_time", "out_time", "late_entry", "early_exit"],
		)
		
		# Calculate statistics
		total_days = date_diff(end_date, start_date) + 1
		present_days = sum(1 for a in attendance_records if a.status in ["Present", "On Site"])
		absent_days = sum(1 for a in attendance_records if a.status == "Absent")
		half_day = sum(1 for a in attendance_records if a.status == "Half Day")
		wfh_days = sum(1 for a in attendance_records if a.status == "Work From Home")
		on_leave = sum(1 for a in attendance_records if a.status == "On Leave")
		late_arrivals = sum(1 for a in attendance_records if a.get("late_entry"))
		early_exits = sum(1 for a in attendance_records if a.get("early_exit"))
		
		# Calculate working hours - try working_hours field first, then calculate from in/out times
		total_working_hours = 0
		hours_count = 0
		
		for a in attendance_records:
			hours = 0
			
			# First try to use the working_hours field
			if a.working_hours and a.working_hours > 0:
				hours = a.working_hours
			# Otherwise calculate from in_time and out_time
			elif a.in_time and a.out_time:
				try:
					# Calculate time difference in hours
					time_diff = a.out_time - a.in_time
					hours = time_diff.total_seconds() / 3600.0
				except:
					hours = 0
			
			if hours > 0:
				total_working_hours += hours
				hours_count += 1
		
		# Calculate average working hours
		avg_working_hours = total_working_hours / hours_count if hours_count > 0 else 0
		
		# Get holidays for period
		holiday_list = get_holiday_list_for_employee(employee, raise_exception=False)
		holidays_count = 0
		if holiday_list:
			holidays_count = frappe.db.count(
				"Holiday",
				filters={
					"parent": holiday_list,
					"holiday_date": ["between", [start_date, end_date]],
				}
			)
		
		# Calculate working days (excluding weekends/holidays)
		total_working_days = total_days - holidays_count
		
		# Calculate attendance percentage - count Present + WFH + 0.5*HalfDay as attended
		attended_days = present_days + wfh_days + (half_day * 0.5)
		attendance_percentage = (attended_days / total_working_days * 100) if total_working_days > 0 else 0
		
		# Get recent check-ins
		recent_checkins = frappe.get_all(
			"Employee Checkin",
			filters={
				"employee": employee,
				"time": ["between", [start_date, end_date]],
			},
			fields=["name", "time", "log_type", "device_id"],
			order_by="time desc",
			limit=10,
		)
		
		return {
			"total_days": total_days,
			"total_working_days": total_working_days,
			"holidays": holidays_count,
			"present_days": present_days,
			"absent_days": absent_days,
			"half_day": half_day,
			"wfh_days": wfh_days,
			"on_leave": on_leave,
			"late_arrivals": late_arrivals,
			"early_exits": early_exits,
			"total_working_hours": round(total_working_hours, 2),
			"avg_working_hours": round(avg_working_hours, 2),
			"attendance_percentage": round(attendance_percentage, 2),
			"recent_checkins": recent_checkins,
			"status_breakdown": {
				"Present": present_days,
				"Absent": absent_days,
				"Half Day": half_day,
				"Work From Home": wfh_days,
				"On Leave": on_leave,
			}
		}
		
	except Exception as e:
		frappe.log_error(f"Attendance Analytics Error: {str(e)}", "Attendance Analytics")
		return {
			"total_days": 0,
			"error": str(e),
		}


def get_leave_analytics(employee: str, start_date, end_date) -> dict:
	"""Get leave analytics and balances."""
	try:
		# Get leave balance
		leave_balance_map = get_leave_balance_map(employee)
		
		# Get leave applications for period
		leave_applications = frappe.get_all(
			"Leave Application",
			filters={
				"employee": employee,
				"from_date": ["<=", end_date],
				"to_date": [">=", start_date],
				"docstatus": 1,
			},
			fields=["name", "leave_type", "from_date", "to_date", "total_leave_days", "status", "half_day"],
		)
		
		# Calculate statistics
		total_leave_taken = sum(app.total_leave_days for app in leave_applications if app.status == "Approved")
		pending_leaves = sum(app.total_leave_days for app in leave_applications if app.status == "Open")
		rejected_leaves = sum(app.total_leave_days for app in leave_applications if app.status == "Rejected")
		
		# Leave by type
		leave_by_type = {}
		for app in leave_applications:
			if app.status == "Approved":
				leave_type = app.leave_type
				leave_by_type[leave_type] = leave_by_type.get(leave_type, 0) + app.total_leave_days
		
		# Calculate total available leaves
		total_allocated = sum(details.get("allocated_leaves", 0) for details in leave_balance_map.values())
		total_balance = sum(details.get("balance_leaves", 0) for details in leave_balance_map.values())
		
		return {
			"leave_balances": leave_balance_map,
			"total_allocated": round(total_allocated, 2),
			"total_balance": round(total_balance, 2),
			"total_used": round(total_allocated - total_balance, 2),
			"period_stats": {
				"total_leave_taken": round(total_leave_taken, 2),
				"pending_leaves": round(pending_leaves, 2),
				"rejected_leaves": round(rejected_leaves, 2),
				"leave_by_type": leave_by_type,
			},
			"applications": leave_applications,
		}
		
	except Exception as e:
		frappe.log_error(f"Leave Analytics Error: {str(e)}", "Leave Analytics")
		return {
			"leave_balances": {},
			"error": str(e),
		}


def get_expense_analytics(employee: str, start_date, end_date) -> dict:
	"""Get expense claim analytics."""
	try:
		# Get expense claims for period
		expense_claims = frappe.get_all(
			"Expense Claim",
			filters={
				"employee": employee,
				"posting_date": ["between", [start_date, end_date]],
			},
			fields=[
				"name", "posting_date", "approval_status", "total_claimed_amount",
				"total_sanctioned_amount", "total_amount_reimbursed", "is_paid",
			],
		)
		
		# Calculate statistics
		total_claimed = sum(c.total_claimed_amount for c in expense_claims)
		total_sanctioned = sum(c.total_sanctioned_amount or 0 for c in expense_claims)
		total_reimbursed = sum(c.total_amount_reimbursed or 0 for c in expense_claims)
		
		pending_claims = sum(1 for c in expense_claims if c.approval_status == "Draft")
		approved_claims = sum(1 for c in expense_claims if c.approval_status == "Approved")
		rejected_claims = sum(1 for c in expense_claims if c.approval_status == "Rejected")
		
		paid_claims = sum(1 for c in expense_claims if c.is_paid)
		unpaid_amount = sum(c.total_sanctioned_amount or 0 for c in expense_claims if not c.is_paid)
		
		return {
			"total_claims": len(expense_claims),
			"total_claimed": round(total_claimed, 2),
			"total_sanctioned": round(total_sanctioned, 2),
			"total_reimbursed": round(total_reimbursed, 2),
			"unpaid_amount": round(unpaid_amount, 2),
			"status_summary": {
				"pending": pending_claims,
				"approved": approved_claims,
				"rejected": rejected_claims,
				"paid": paid_claims,
			},
			"claims": expense_claims,
		}
		
	except Exception as e:
		frappe.log_error(f"Expense Analytics Error: {str(e)}", "Expense Analytics")
		return {
			"total_claims": 0,
			"error": str(e),
		}


def get_travel_analytics(employee: str, start_date, end_date) -> dict:
	"""Get travel request analytics."""
	try:
		# Get travel requests for period
		travel_requests = frappe.get_all(
			"Travel Request",
			filters={
				"employee": employee,
				"creation": ["between", [start_date, end_date]],
			},
			fields=[
				"name", "travel_type", "purpose_of_travel", "docstatus",
				"creation", "modified",
			],
		)
		
		# Calculate statistics
		total_requests = len(travel_requests)
		pending_requests = sum(1 for r in travel_requests if r.docstatus == 0)
		approved_requests = sum(1 for r in travel_requests if r.docstatus == 1)
		rejected_requests = sum(1 for r in travel_requests if r.docstatus == 2)
		
		domestic_travel = sum(1 for r in travel_requests if r.travel_type == "Domestic")
		international_travel = sum(1 for r in travel_requests if r.travel_type == "International")
		
		return {
			"total_requests": total_requests,
			"pending": pending_requests,
			"approved": approved_requests,
			"rejected": rejected_requests,
			"domestic_travel": domestic_travel,
			"international_travel": international_travel,
			"requests": travel_requests,
		}
		
	except Exception as e:
		frappe.log_error(f"Travel Analytics Error: {str(e)}", "Travel Analytics")
		return {
			"total_requests": 0,
			"error": str(e),
		}


def get_project_analytics(employee: str, start_date, end_date) -> dict:
	"""Get project and task analytics."""
	try:
		# Get projects where employee is a member
		project_members = frappe.get_all(
			"Project Member",
			filters={
				"employee": employee,
				"active": 1,
			},
			fields=["parent", "role_in_project"],
			pluck="parent",
		)
		
		# Get project details
		projects = []
		if project_members:
			projects = frappe.get_all(
				"Project",
				filters={
					"name": ["in", project_members],
				},
				fields=["name", "project_name", "status", "percent_complete", "expected_start_date", "expected_end_date"],
			)
		
		# Get tasks for period
		tasks = []
		if project_members:
			tasks = frappe.get_all(
				"Task",
				filters={
					"project": ["in", project_members],
					"modified": ["between", [start_date, end_date]],
				},
				fields=["name", "subject", "project", "status", "priority", "progress"],
			)
		
		# Get task logs for period
		task_logs = frappe.get_all(
			"Task Log",
			filters={
				"employee": employee,
				"log_time": ["between", [start_date, end_date]],
			},
			fields=["name", "task", "project", "log_time", "description"],
		)
		
		# Calculate statistics
		total_projects = len(projects)
		active_projects = sum(1 for p in projects if p.status == "Open")
		completed_projects = sum(1 for p in projects if p.status == "Completed")
		
		total_tasks = len(tasks)
		open_tasks = sum(1 for t in tasks if t.status == "Open")
		completed_tasks = sum(1 for t in tasks if t.status == "Completed")
		overdue_tasks = sum(1 for t in tasks if t.status == "Overdue")
		
		total_task_logs = len(task_logs)
		
		return {
			"total_projects": total_projects,
			"active_projects": active_projects,
			"completed_projects": completed_projects,
			"total_tasks": total_tasks,
			"open_tasks": open_tasks,
			"completed_tasks": completed_tasks,
			"overdue_tasks": overdue_tasks,
			"total_task_logs": total_task_logs,
			"projects": projects,
			"tasks": tasks,
			"recent_task_logs": task_logs[:10],  # Last 10 logs
		}
		
	except Exception as e:
		frappe.log_error(f"Project Analytics Error: {str(e)}", "Project Analytics")
		return {
			"total_projects": 0,
			"total_tasks": 0,
			"error": str(e),
		}


def calculate_performance_score(employee: str, start_date, end_date) -> dict:
	"""Calculate overall performance score based on various metrics."""
	try:
		# Get all analytics
		attendance = get_attendance_analytics(employee, start_date, end_date)
		projects = get_project_analytics(employee, start_date, end_date)
		
		# Calculate scores (0-100)
		
		# Attendance Score (40% weight)
		attendance_score = attendance.get("attendance_percentage", 0)
		
		# Punctuality Score (20% weight) - based on late arrivals
		late_ratio = attendance.get("late_arrivals", 0) / attendance.get("total_working_days", 1)
		punctuality_score = max(0, 100 - (late_ratio * 200))  # Penalty for late arrivals
		
		# Task Completion Score (30% weight)
		total_tasks = projects.get("total_tasks", 0)
		completed_tasks = projects.get("completed_tasks", 0)
		task_completion_score = (completed_tasks / total_tasks * 100) if total_tasks > 0 else 100
		
		# Engagement Score (10% weight) - based on task logs
		task_logs = projects.get("total_task_logs", 0)
		working_days = attendance.get("total_working_days", 1)
		engagement_score = min(100, (task_logs / working_days) * 50) if working_days > 0 else 0
		
		# Weighted overall score
		overall_score = (
			attendance_score * 0.4 +
			punctuality_score * 0.2 +
			task_completion_score * 0.3 +
			engagement_score * 0.1
		)
		
		# Determine rating
		if overall_score >= 90:
			rating = "Excellent"
		elif overall_score >= 75:
			rating = "Good"
		elif overall_score >= 60:
			rating = "Average"
		elif overall_score >= 50:
			rating = "Below Average"
		else:
			rating = "Needs Improvement"
		
		return {
			"overall_score": round(overall_score, 2),
			"rating": rating,
			"breakdown": {
				"attendance_score": round(attendance_score, 2),
				"punctuality_score": round(punctuality_score, 2),
				"task_completion_score": round(task_completion_score, 2),
				"engagement_score": round(engagement_score, 2),
			},
			"insights": {
				"total_working_days": working_days,
				"attendance_percentage": round(attendance.get("attendance_percentage", 0), 2),
				"late_arrivals": attendance.get("late_arrivals", 0),
				"tasks_completed": completed_tasks,
				"tasks_total": total_tasks,
				"task_logs": task_logs,
			}
		}
		
	except Exception as e:
		frappe.log_error(f"Performance Score Error: {str(e)}", "Performance Score")
		return {
			"overall_score": 0,
			"rating": "N/A",
			"error": str(e),
		}


@frappe.whitelist()
def get_employee_attendance_history(
	employee_id: str,
	start_date: str,
	end_date: str,
) -> dict:
	"""
	Get employee attendance history with summary statistics.
	Optimized for mobile app dashboard.
	
	Args:
		employee_id: Employee ID
		start_date: Start date (YYYY-MM-DD)
		end_date: End date (YYYY-MM-DD)
	
	Returns:
		Dict with attendance records and summary stats
	"""
	try:
		# Validate dates
		start = getdate(start_date)
		end = getdate(end_date)
		
		# Get attendance records
		attendance_records = frappe.get_all(
			"Attendance",
			filters={
				"employee": employee_id,
				"attendance_date": ["between", [start, end]],
				"docstatus": 1,
			},
			fields=[
				"name", "attendance_date", "status", "working_hours",
				"in_time", "out_time", "late_entry", "early_exit", "shift",
			],
			order_by="attendance_date desc",
		)
		
		# Calculate summary statistics
		present_days = sum(1 for a in attendance_records if a.status in ["Present", "On Site"])
		absent_days = sum(1 for a in attendance_records if a.status == "Absent")
		half_day = sum(1 for a in attendance_records if a.status == "Half Day")
		wfh_days = sum(1 for a in attendance_records if a.status == "Work From Home")
		on_leave = sum(1 for a in attendance_records if a.status == "On Leave")
		late_arrivals = sum(1 for a in attendance_records if a.late_entry)
		early_exits = sum(1 for a in attendance_records if a.early_exit)
		
		total_working_hours = sum(a.working_hours or 0 for a in attendance_records)
		
		# Get holidays count
		holiday_list = get_holiday_list_for_employee(employee_id, raise_exception=False)
		holidays_count = 0
		if holiday_list:
			holidays_count = frappe.db.count(
				"Holiday",
				filters={
					"parent": holiday_list,
					"holiday_date": ["between", [start, end]],
				}
			)
		
		# Calculate working days
		total_days = date_diff(end, start) + 1
		total_working_days = total_days - holidays_count
		
		# Calculate attendance percentage
		attendance_percentage = 0
		if total_working_days > 0:
			attended_days = present_days + wfh_days + (half_day * 0.5)
			attendance_percentage = (attended_days / total_working_days) * 100
		
		return {
			"status": "success",
			"data": {
				"records": attendance_records,
				"summary_stats": {
					"total_days": total_days,
					"total_working_days": total_working_days,
					"holidays": holidays_count,
					"present_days": present_days,
					"absent_days": absent_days,
					"half_day": half_day,
					"wfh_days": wfh_days,
					"on_leave": on_leave,
					"late_arrivals": late_arrivals,
					"early_exits": early_exits,
					"total_working_hours": round(total_working_hours, 2),
					"attendance_percentage": round(attendance_percentage, 2),
				},
			},
			"message": _("Attendance history fetched successfully"),
		}
		
	except Exception as e:
		frappe.log_error(f"Get Attendance History Error: {str(e)}\n{frappe.get_traceback()}", "Attendance History")
		return {
			"status": "error",
			"message": str(e),
			"data": {
				"records": [],
				"summary_stats": {},
			},
		}


# HR Settings
@frappe.whitelist()
def get_hr_settings() -> dict:
	settings = frappe.db.get_singles_dict("HR Settings", cast=True)
	return frappe._dict(
		allow_employee_checkin_from_mobile_app=settings.allow_employee_checkin_from_mobile_app,
		allow_geolocation_tracking=settings.allow_geolocation_tracking,
	)


# Notifications
@frappe.whitelist()
def get_unread_notifications_count() -> int:
	return frappe.db.count(
		"PWA Notification",
		{"to_user": frappe.session.user, "read": 0},
	)


@frappe.whitelist()
def mark_all_notifications_as_read() -> None:
	frappe.db.set_value(
		"PWA Notification",
		{"to_user": frappe.session.user, "read": 0},
		"read",
		1,
		update_modified=False,
	)


@frappe.whitelist()
def are_push_notifications_enabled() -> bool:
	try:
		return frappe.db.get_single_value("Push Notification Settings", "enable_push_notification_relay")
	except frappe.DoesNotExistError:
		# push notifications are not supported in the current framework version
		return False


# Attendance
@frappe.whitelist()
def get_attendance_calendar_events(employee: str, from_date: str, to_date: str) -> dict[str, str]:
	holidays = get_holidays_for_calendar(employee, from_date, to_date)
	attendance = get_attendance_for_calendar(employee, from_date, to_date)
	events = {}

	date = getdate(from_date)
	while date_diff(to_date, date) >= 0:
		date_str = date.strftime("%Y-%m-%d")
		if date in attendance:
			events[date_str] = attendance[date]
		elif date in holidays:
			events[date_str] = "Holiday"
		date = add_days(date, 1)

	return events


def get_attendance_for_calendar(employee: str, from_date: str, to_date: str) -> list[dict[str, str]]:
	attendance = frappe.get_all(
		"Attendance",
		{"employee": employee, "attendance_date": ["between", [from_date, to_date]], "docstatus": 1},
		["attendance_date", "status"],
	)
	return {d["attendance_date"]: d["status"] for d in attendance}


def get_holidays_for_calendar(employee: str, from_date: str, to_date: str) -> list[str]:
	if holiday_list := get_holiday_list_for_employee(employee, raise_exception=False):
		return frappe.get_all(
			"Holiday",
			filters={"parent": holiday_list, "holiday_date": ["between", [from_date, to_date]]},
			pluck="holiday_date",
		)

	return []


@frappe.whitelist()
def get_shift_requests(
	employee: str,
	approver_id: str | None = None,
	for_approval: bool = False,
	limit: int | None = None,
) -> list[dict]:
	filters = get_filters("Shift Request", employee, approver_id, for_approval)
	fields = [
		"name",
		"employee",
		"employee_name",
		"shift_type",
		"from_date",
		"to_date",
		"status",
		"approver",
		"docstatus",
		"creation",
	]

	if workflow_state_field := get_workflow_state_field("Shift Request"):
		fields.append(workflow_state_field)

	shift_requests = frappe.get_list(
		"Shift Request",
		fields=fields,
		filters=filters,
		order_by="creation desc",
		limit=limit,
	)

	if workflow_state_field:
		for application in shift_requests:
			application["workflow_state_field"] = workflow_state_field

	return shift_requests


@frappe.whitelist()
def get_attendance_requests(
	employee: str,
	for_approval: bool = False,
	limit: int | None = None,
) -> list[dict]:
	filters = get_filters("Attendance Request", employee, None, for_approval)
	fields = [
		"name",
		"reason",
		"employee",
		"employee_name",
		"from_date",
		"to_date",
		"include_holidays",
		"shift",
		"docstatus",
		"creation",
	]

	if workflow_state_field := get_workflow_state_field("Attendance Request"):
		fields.append(workflow_state_field)

	attendance_requests = frappe.get_list(
		"Attendance Request",
		fields=fields,
		filters=filters,
		order_by="creation desc",
		limit=limit,
	)

	if workflow_state_field:
		for application in attendance_requests:
			application["workflow_state_field"] = workflow_state_field

	return attendance_requests


def get_filters(
	doctype: str,
	employee: str,
	approver_id: str | None = None,
	for_approval: bool = False,
) -> dict:
	filters = frappe._dict()
	if for_approval:
		filters.docstatus = 0
		filters.employee = ("!=", employee)

		if workflow := get_workflow(doctype):
			allowed_states = get_allowed_states_for_workflow(workflow, approver_id)
			filters[workflow.workflow_state_field] = ("in", allowed_states)
		elif doctype != "Attendance Request":
			approver_field_map = {
				"Shift Request": "approver",
				"Leave Application": "leave_approver",
				"Expense Claim": "expense_approver",
			}
			filters.status = "Open" if doctype == "Leave Application" else "Draft"
			if approver_id:
				filters[approver_field_map[doctype]] = approver_id
	else:
		# For employee view: show submitted documents (docstatus=1) for Leave Application
		# Submitted documents can have status: Open, Approved, Rejected, Cancelled
		if doctype == "Leave Application":
			filters.docstatus = 1  # Only submitted leave applications
		else:
			filters.docstatus = ("!=", 2)  # For other doctypes, show draft and submitted
		filters.employee = employee

	return filters


@frappe.whitelist()
def get_shift_request_approvers(employee: str) -> str | list[str]:
	shift_request_approver, department = frappe.get_cached_value(
		"Employee",
		employee,
		["shift_request_approver", "department"],
	)

	department_approvers = []
	if department:
		department_approvers = get_department_approvers(department, "shift_request_approver")
		if not shift_request_approver:
			shift_request_approver = frappe.db.get_value(
				"Department Approver",
				{"parent": department, "parentfield": "shift_request_approver", "idx": 1},
				"approver",
			)

	shift_request_approver_name = frappe.db.get_value("User", shift_request_approver, "full_name", cache=True)

	if shift_request_approver and shift_request_approver not in [
		approver.name for approver in department_approvers
	]:
		department_approvers.insert(
			0, {"name": shift_request_approver, "full_name": shift_request_approver_name}
		)

	return department_approvers


@frappe.whitelist()
def get_shifts(employee: str) -> list[dict[str, str]]:
	ShiftAssignment = frappe.qb.DocType("Shift Assignment")
	ShiftType = frappe.qb.DocType("Shift Type")
	return (
		frappe.qb.from_(ShiftAssignment)
		.join(ShiftType)
		.on(ShiftAssignment.shift_type == ShiftType.name)
		.select(
			ShiftAssignment.name,
			ShiftAssignment.shift_type,
			ShiftAssignment.start_date,
			ShiftAssignment.end_date,
			ShiftType.start_time,
			ShiftType.end_time,
		)
		.where(
			(ShiftAssignment.employee == employee)
			& (ShiftAssignment.status == "Active")
			& (ShiftAssignment.docstatus == 1)
		)
		.orderby(ShiftAssignment.start_date, order=Order.asc)
	).run(as_dict=True)


# Leaves and Holidays
@frappe.whitelist()
def get_leave_applications(
	employee: str,
	approver_id: str | None = None,
	for_approval: bool = False,
	limit: int | None = None,
) -> list[dict]:
	# For admin approval view, get current employee to exclude their applications
	if for_approval and not employee:
		employee = get_employee_by_user()
	
	filters = get_filters("Leave Application", employee, approver_id, for_approval)
	fields = [
		"name",
		"posting_date",
		"employee",
		"employee_name",
		"leave_type",
		"status",
		"from_date",
		"to_date",
		"half_day",
		"half_day_date",
		"description",
		"total_leave_days",
		"leave_balance",
		"leave_approver",
		"posting_date",
		"creation",
		"docstatus",
	]

	if workflow_state_field := get_workflow_state_field("Leave Application"):
		fields.append(workflow_state_field)

	applications = frappe.get_list(
		"Leave Application",
		fields=fields,
		filters=filters,
		order_by="posting_date desc",
		limit=limit,
	)

	if workflow_state_field:
		for application in applications:
			application["workflow_state_field"] = workflow_state_field

	return applications


@frappe.whitelist()
def get_leave_history(
	employee: str = None,
	status_filter: str = None,
	limit: int | None = 500,
) -> list[dict]:
	"""
	Get leave application history (approved, rejected, cancelled applications).
	For employees: shows their own history
	For admins: shows all history or specific employee's history
	
	Args:
		employee: Employee ID (optional for admin, required for employee view)
		status_filter: Filter by status - 'approved', 'rejected', 'cancelled', or None for all
		limit: Maximum number of records to return
	
	Returns:
		List of submitted leave applications with status Approved/Rejected/Cancelled
	"""
	# If no employee specified, get current user's employee ID
	if not employee:
		employee = get_employee_by_user()
		if not employee:
			frappe.throw(_("No employee record found for current user"))
	
	# Build filters for submitted applications only
	filters = frappe._dict()
	filters.docstatus = 1  # Only submitted applications
	
	# Filter by employee (admins can pass different employee ID, employees see only their own)
	current_employee = get_employee_by_user()
	user_roles = frappe.get_roles()
	
	# Check if user is admin/HR
	is_admin = bool(set(user_roles) & {"Administrator", "System Manager", "HR Manager", "HR User"})
	
	if is_admin:
		# Admins can see all or specific employee's history
		if employee:
			filters.employee = employee
		# If no employee specified, show all
	else:
		# Regular employees can only see their own history
		filters.employee = current_employee
	
	# Apply status filter
	if status_filter:
		status_map = {
			'approved': 'Approved',
			'rejected': 'Rejected',
			'cancelled': 'Cancelled',
		}
		if status_filter.lower() in status_map:
			filters.status = status_map[status_filter.lower()]
	else:
		# Show all completed statuses (exclude pending "Open")
		filters.status = ("in", ["Approved", "Rejected", "Cancelled"])
	
	fields = [
		"name",
		"posting_date",
		"employee",
		"employee_name",
		"leave_type",
		"status",
		"from_date",
		"to_date",
		"half_day",
		"half_day_date",
		"description",
		"total_leave_days",
		"leave_balance",
		"leave_approver",
		"creation",
		"modified",
		"docstatus",
	]

	if workflow_state_field := get_workflow_state_field("Leave Application"):
		fields.append(workflow_state_field)

	applications = frappe.get_list(
		"Leave Application",
		fields=fields,
		filters=filters,
		order_by="posting_date desc",
		limit=limit,
	)

	if workflow_state_field:
		for application in applications:
			application["workflow_state_field"] = workflow_state_field

	return applications


@frappe.whitelist()
def get_leave_balance_map(employee: str) -> dict[str, dict[str, float]]:
	"""
	Returns a map of leave type and balance details like:
	{
	        'Casual Leave': {'allocated_leaves': 10.0, 'balance_leaves': 5.0},
	        'Earned Leave': {'allocated_leaves': 3.0, 'balance_leaves': 3.0},
	}
	"""
	from hrms.hr.doctype.leave_application.leave_application import get_leave_details

	date = getdate()
	leave_map = {}

	leave_details = get_leave_details(employee, date)
	allocation = leave_details["leave_allocation"]

	for leave_type, details in allocation.items():
		leave_map[leave_type] = {
			"allocated_leaves": details.get("total_leaves"),
			"balance_leaves": details.get("remaining_leaves"),
		}

	return leave_map


@frappe.whitelist()
def get_employee_holidays(employee: str = None, year: str = None) -> dict:
	"""
	Get comprehensive holiday information for employee or admin.
	Works for both employees (viewing their own) and HR managers (viewing any employee).
	
	Args:
		employee: Employee ID (optional, defaults to current user's employee)
		year: Optional year filter (e.g., "2025")
		
	Returns:
		dict with holiday list details, all holidays, and statistics
	"""
	try:
		from datetime import datetime
		
		# Get employee if not provided
		if not employee:
			employee = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
			if not employee:
				return {
					"data": None,
					"message": _("No employee record found for current user"),
					"status": "error"
				}
		
		# Check permissions
		current_user = frappe.session.user
		employee_user = frappe.db.get_value("Employee", employee, "user_id")
		user_roles = frappe.get_roles(current_user)
		
		# Allow if: user is viewing their own data OR user has HR Manager/Admin role
		is_own_data = employee_user == current_user
		is_hr_manager = "HR Manager" in user_roles or "System Manager" in user_roles
		
		if not (is_own_data or is_hr_manager):
			return {
				"data": None,
				"message": _("You don't have permission to view this employee's holidays"),
				"status": "error"
			}
		
		# Get employee's holiday list
		holiday_list_name = get_holiday_list_for_employee(employee, raise_exception=False)
		
		if not holiday_list_name:
			return {
				"data": None,
				"message": _("No holiday list assigned to this employee"),
				"status": "error"
			}
		
		# Get holiday list details
		holiday_list = frappe.get_doc("Holiday List", holiday_list_name)
		
		# Build filters for holidays
		filters = {"parent": holiday_list_name}
		
		# Filter by year if specified
		if year:
			year_int = int(year)
			filters["holiday_date"] = ["between", [f"{year_int}-01-01", f"{year_int}-12-31"]]
		
		# Fetch all holidays (including weekly offs)
		holidays = frappe.get_all(
			"Holiday",
			filters=filters,
			fields=["name", "holiday_date", "description", "weekly_off"],
			order_by="holiday_date asc"
		)
		
		# Clean descriptions
		for holiday in holidays:
			holiday["description"] = strip_html(holiday["description"] or "").strip()
		
		# Calculate statistics
		today = getdate()
		total = len(holidays)
		weekly_offs = sum(1 for h in holidays if h.get("weekly_off"))
		public_holidays = total - weekly_offs
		upcoming = sum(1 for h in holidays if getdate(h["holiday_date"]) >= today)
		past = total - upcoming
		
		# Count holidays in current month
		current_month = today.month
		current_year = today.year
		this_month = sum(
			1 for h in holidays 
			if getdate(h["holiday_date"]).month == current_month 
			and getdate(h["holiday_date"]).year == current_year
		)
		
		# Group by month
		holidays_by_month = {}
		for holiday in holidays:
			holiday_date = getdate(holiday["holiday_date"])
			month_key = holiday_date.strftime("%Y-%m")
			if month_key not in holidays_by_month:
				holidays_by_month[month_key] = {
					"month": holiday_date.strftime("%B %Y"),
					"holidays": []
				}
			holidays_by_month[month_key]["holidays"].append(holiday)
		
		return {
			"data": {
				"employee": employee,
				"holiday_list": {
					"name": holiday_list.name,
					"holiday_list_name": holiday_list.holiday_list_name,
					"from_date": str(holiday_list.from_date) if holiday_list.from_date else None,
					"to_date": str(holiday_list.to_date) if holiday_list.to_date else None,
					"weekly_off": holiday_list.weekly_off,
					"country": holiday_list.country,
					"color": holiday_list.color
				},
				"holidays": holidays,
				"holidays_by_month": holidays_by_month,
				"statistics": {
					"total": total,
					"weekly_offs": weekly_offs,
					"public_holidays": public_holidays,
					"upcoming": upcoming,
					"past": past,
					"this_month": this_month
				}
			},
			"message": _("Holidays fetched successfully"),
			"status": "success"
		}
		
	except Exception as e:
		frappe.log_error(
			f"Get Employee Holidays Error: {str(e)}\n{frappe.get_traceback()}", 
			"Employee Holidays API"
		)
		return {
			"data": None,
			"message": str(e),
			"status": "error"
		}


@frappe.whitelist()
def get_leave_approval_details(employee: str) -> dict:
	leave_approver, department = frappe.get_cached_value(
		"Employee",
		employee,
		["leave_approver", "department"],
	)

	if not leave_approver and department:
		leave_approver = frappe.db.get_value(
			"Department Approver",
			{"parent": department, "parentfield": "leave_approvers", "idx": 1},
			"approver",
		)

	leave_approver_name = frappe.db.get_value("User", leave_approver, "full_name", cache=True)
	department_approvers = get_department_approvers(department, "leave_approvers")

	if leave_approver and leave_approver not in [approver.name for approver in department_approvers]:
		department_approvers.append({"name": leave_approver, "full_name": leave_approver_name})

	return dict(
		leave_approver=leave_approver,
		leave_approver_name=leave_approver_name,
		department_approvers=department_approvers,
		is_mandatory=frappe.db.get_single_value(
			"HR Settings", "leave_approver_mandatory_in_leave_application"
		),
	)


def get_department_approvers(department: str, parentfield: str) -> list[str]:
	if not department:
		return []

	department_details = frappe.db.get_value("Department", department, ["lft", "rgt"], as_dict=True)
	departments = frappe.get_all(
		"Department",
		filters={
			"lft": ("<=", department_details.lft),
			"rgt": (">=", department_details.rgt),
			"disabled": 0,
		},
		pluck="name",
	)

	Approver = frappe.qb.DocType("Department Approver")
	User = frappe.qb.DocType("User")
	department_approvers = (
		frappe.qb.from_(User)
		.join(Approver)
		.on(Approver.approver == User.name)
		.select(User.name.as_("name"), User.full_name.as_("full_name"))
		.where((Approver.parent.isin(departments)) & (Approver.parentfield == parentfield))
	).run(as_dict=True)

	return department_approvers


@frappe.whitelist()
def get_leave_types(employee: str, date: str) -> list:
	from hrms.hr.doctype.leave_application.leave_application import get_leave_details

	date = date or getdate()

	leave_details = get_leave_details(employee, date)
	leave_types = list(leave_details["leave_allocation"].keys()) + leave_details["lwps"]

	return leave_types


# ============================================================================
# COMPREHENSIVE LEAVE MANAGEMENT APIs
# ============================================================================

@frappe.whitelist()
def submit_leave_application(
	employee: str,
	leave_type: str,
	from_date: str,
	to_date: str,
	half_day: int = 0,
	half_day_date: str | None = None,
	description: str | None = None,
	leave_approver: str | None = None,
) -> dict:
	"""
	Submit a new leave application for mobile app.
	
	Args:
		employee: Employee ID
		leave_type: Leave Type name
		from_date: Start date (YYYY-MM-DD)
		to_date: End date (YYYY-MM-DD)
		half_day: 1 if half day, 0 otherwise
		half_day_date: Date for half day (YYYY-MM-DD)
		description: Reason for leave
		leave_approver: Leave approver user ID (optional)
	
	Returns:
		Dict with application details and updated leave balance
	"""
	try:
		# Validate current user has employee record
		current_employee = get_employee_by_user()
		if not current_employee:
			frappe.throw(_("No employee record found for current user"))
		
		# Employees can only apply for their own leave
		user_roles = frappe.get_roles()
		is_admin = bool(set(user_roles) & {"Administrator", "System Manager", "HR Manager", "HR User"})
		
		if not is_admin and employee != current_employee:
			frappe.throw(_("You can only apply leave for yourself"))
		
		# Get company from employee
		company = frappe.get_value("Employee", employee, "company")
		
		# Create leave application
		leave_app = frappe.get_doc({
			"doctype": "Leave Application",
			"employee": employee,
			"leave_type": leave_type,
			"from_date": getdate(from_date),
			"to_date": getdate(to_date),
			"half_day": cint(half_day),
			"half_day_date": getdate(half_day_date) if half_day_date else None,
			"description": description or "",
			"leave_approver": leave_approver,
			"company": company,
			"posting_date": nowdate(),
			"status": "Open",
		})
		
		# Insert only (don't submit yet - it needs approval)
		leave_app.insert(ignore_permissions=True)
		frappe.db.commit()
		
		# Get updated leave balance
		balance = get_leave_balance_map(employee)
		
		# Send notification to approvers (NEW)
		try:
			send_leave_approval_notification(leave_app.name, "submitted")
		except Exception as notif_error:
			frappe.log_error(f"Failed to send approval notification: {str(notif_error)}", "Leave Notification")
		
		# Also send to employee
		try:
			send_leave_application_notification(leave_app.name, "submitted")
		except Exception as notif_error:
			frappe.log_error(f"Failed to send notification: {str(notif_error)}", "Leave Notification")
		
		return {
			"status": "success",
			"message": _("Leave application submitted successfully and pending approval"),
			"application_id": leave_app.name,
			"employee": employee,
			"employee_name": leave_app.employee_name,
			"leave_type": leave_type,
			"from_date": str(leave_app.from_date),
			"to_date": str(leave_app.to_date),
			"total_leave_days": leave_app.total_leave_days,
			"application_status": leave_app.status,
			"docstatus": leave_app.docstatus,
			"leave_balance": balance.get(leave_type, {}).get("balance_leaves", 0),
		}
		
	except Exception as e:
		frappe.log_error(f"Submit Leave Error: {str(e)}\n{frappe.get_traceback()}", "Leave Application")
		frappe.throw(_("Failed to submit leave application: {0}").format(str(e)))


@frappe.whitelist()
def approve_leave_application(application_id: str, remarks: str | None = None) -> dict:
	"""
	Approve a leave application (for admins/approvers).
	
	Args:
		application_id: Leave Application ID
		remarks: Optional approval remarks
	
	Returns:
		Dict with updated application status and employee leave balance
	"""
	try:
		# Get leave application
		leave_app = frappe.get_doc("Leave Application", application_id)
		
		# Check permission
		current_user = frappe.session.user
		user_roles = frappe.get_roles()
		is_admin = bool(set(user_roles) & {"Administrator", "System Manager", "HR Manager", "HR User", "Leave Approver"})
		is_approver = current_user == leave_app.leave_approver
		
		if not (is_admin or is_approver):
			frappe.throw(_("You do not have permission to approve this leave"))
		
		# Check if already processed
		if leave_app.status != "Open":
			frappe.throw(_("This leave application has already been {0}").format(leave_app.status.lower()))
		
		# Approve and submit
		leave_app.status = "Approved"
		if remarks:
			leave_app.add_comment("Comment", f"Approved: {remarks}")
		leave_app.save(ignore_permissions=True)
		
		# Submit the document after approval
		leave_app.submit()
		frappe.db.commit()
		
		# Get updated balance
		balance = get_leave_balance_map(leave_app.employee)
		
		# Send notification to employee
		try:
			send_leave_application_notification(application_id, "approved", remarks)
		except Exception as notif_error:
			frappe.log_error(f"Failed to send notification: {str(notif_error)}", "Leave Notification")
		
		return {
			"status": "success",
			"message": _("Leave application approved successfully"),
			"application_id": application_id,
			"employee": leave_app.employee,
			"leave_type": leave_app.leave_type,
			"leave_balance": balance.get(leave_app.leave_type, {}).get("remaining_leaves", 0),
		}
		
	except Exception as e:
		frappe.log_error(f"Approve Leave Error: {str(e)}\n{frappe.get_traceback()}", "Leave Approval")
		frappe.throw(_("Failed to approve leave: {0}").format(str(e)))


@frappe.whitelist()
def reject_leave_application(application_id: str, reason: str) -> dict:
	"""
	Reject a leave application (for admins/approvers).
	
	Args:
		application_id: Leave Application ID
		reason: Rejection reason (required)
	
	Returns:
		Dict with updated application status
	"""
	try:
		if not reason or not reason.strip():
			frappe.throw(_("Rejection reason is required"))
		
		# Get leave application
		leave_app = frappe.get_doc("Leave Application", application_id)
		
		# Check permission
		current_user = frappe.session.user
		user_roles = frappe.get_roles()
		is_admin = bool(set(user_roles) & {"Administrator", "System Manager", "HR Manager", "HR User", "Leave Approver"})
		is_approver = current_user == leave_app.leave_approver
		
		if not (is_admin or is_approver):
			frappe.throw(_("You do not have permission to reject this leave"))
		
		# Check if already processed
		if leave_app.status != "Open":
			frappe.throw(_("This leave application has already been {0}").format(leave_app.status.lower()))
		
		# Reject and submit
		leave_app.status = "Rejected"
		leave_app.add_comment("Comment", f"Rejected: {reason}")
		leave_app.save(ignore_permissions=True)
		
		# Submit the document after rejection
		leave_app.submit()
		frappe.db.commit()
		
		# Send notification to employee
		try:
			send_leave_application_notification(application_id, "rejected", reason)
		except Exception as notif_error:
			frappe.log_error(f"Failed to send notification: {str(notif_error)}", "Leave Notification")
		
		return {
			"status": "success",
			"message": _("Leave application rejected"),
			"application_id": application_id,
			"employee": leave_app.employee,
		}
		
	except Exception as e:
		frappe.log_error(f"Reject Leave Error: {str(e)}\n{frappe.get_traceback()}", "Leave Rejection")
		frappe.throw(_("Failed to reject leave: {0}").format(str(e)))


@frappe.whitelist()
def cancel_leave_application(application_id: str, reason: str | None = None) -> dict:
	"""
	Cancel a leave application (employee can cancel their own pending/approved leaves).
	
	Args:
		application_id: Leave Application ID
		reason: Cancellation reason
	
	Returns:
		Dict with cancellation status
	"""
	try:
		# Get leave application
		leave_app = frappe.get_doc("Leave Application", application_id)
		
		# Check permission - employee can cancel their own or admin can cancel any
		current_employee = get_employee_by_user()
		user_roles = frappe.get_roles()
		is_admin = bool(set(user_roles) & {"Administrator", "System Manager", "HR Manager", "HR User"})
		
		if not is_admin and leave_app.employee != current_employee:
			frappe.throw(_("You can only cancel your own leave applications"))
		
		# Check if can be cancelled
		if leave_app.status == "Cancelled":
			frappe.throw(_("This leave application is already cancelled"))
		
		if leave_app.status == "Rejected":
			frappe.throw(_("Cannot cancel a rejected leave application"))
		
		# Cancel
		if leave_app.docstatus == 1:
			leave_app.cancel()
		else:
			leave_app.status = "Cancelled"
			leave_app.save(ignore_permissions=True)
		
		if reason:
			leave_app.add_comment("Comment", f"Cancelled: {reason}")
		
		frappe.db.commit()
		
		# Get updated balance if approved leave was cancelled
		balance = None
		if leave_app.status == "Approved":
			balance = get_leave_balance_map(leave_app.employee)
		
		return {
			"status": "success",
			"message": _("Leave application cancelled successfully"),
			"application_id": application_id,
			"leave_balance": balance.get(leave_app.leave_type, {}).get("remaining_leaves", 0) if balance else None,
		}
		
	except Exception as e:
		frappe.log_error(f"Cancel Leave Error: {str(e)}\n{frappe.get_traceback()}", "Leave Cancellation")
		frappe.throw(_("Failed to cancel leave: {0}").format(str(e)))


@frappe.whitelist()
def get_employee_leave_applications(
	employee: str | None = None,
	from_date: str | None = None,
	to_date: str | None = None,
	status_filter: str | None = None,
	leave_type: str | None = None,
	limit: int = 100,
) -> dict:
	"""
	Get leave applications for an employee with filters.
	
	Args:
		employee: Employee ID (if None, uses current user's employee)
		from_date: Filter from this date
		to_date: Filter to this date
		status_filter: Filter by status (Open, Approved, Rejected, Cancelled)
		leave_type: Filter by leave type
		limit: Maximum number of records
	
	Returns:
		Dict with applications list and summary
	"""
	try:
		# If no employee, get current user's employee
		if not employee:
			employee = get_employee_by_user()
			if not employee:
				frappe.throw(_("No employee record found for current user"))
		
		# Build filters
		filters = {"employee": employee}
		
		if from_date:
			filters["from_date"] = (">=", getdate(from_date))
		if to_date:
			filters["to_date"] = ("<=", getdate(to_date))
		if status_filter:
			filters["status"] = status_filter
		if leave_type:
			filters["leave_type"] = leave_type
		
		# Get applications
		fields = [
			"name",
			"employee",
			"employee_name",
			"leave_type",
			"from_date",
			"to_date",
			"half_day",
			"half_day_date",
			"total_leave_days",
			"description",
			"status",
			"posting_date",
			"leave_balance",
			"leave_approver",
			"leave_approver_name",
			"creation",
			"modified",
			"docstatus",
		]
		
		applications = frappe.get_list(
			"Leave Application",
			fields=fields,
			filters=filters,
			order_by="from_date desc, creation desc",
			limit=limit,
		)
		
		# Calculate summary
		total_days = sum(app.get("total_leave_days", 0) for app in applications)
		status_summary = {}
		for app in applications:
			status = app.get("status", "Unknown")
			status_summary[status] = status_summary.get(status, 0) + 1
		
		# Get current balances
		balance = get_leave_balance_map(employee)
		
		return {
			"status": "success",
			"applications": applications,
			"total_applications": len(applications),
			"total_leave_days": total_days,
			"status_summary": status_summary,
			"leave_balances": balance,
		}
		
	except Exception as e:
		frappe.log_error(f"Get Employee Leaves Error: {str(e)}\n{frappe.get_traceback()}", "Leave Applications")
		return {
			"status": "error",
			"message": str(e),
			"applications": [],
		}


@frappe.whitelist()
def get_admin_leave_applications(
	department: str | None = None,
	employee: str | None = None,
	from_date: str | None = None,
	to_date: str | None = None,
	status_filter: str | None = None,
	leave_type: str | None = None,
	limit: int = 500,
) -> dict:
	"""
	Get all leave applications for admin with advanced filters.
	
	Args:
		department: Filter by department
		employee: Filter by specific employee
		from_date: Filter from this date
		to_date: Filter to this date
		status_filter: Filter by status
		leave_type: Filter by leave type
		limit: Maximum records
	
	Returns:
		Dict with applications and statistics
	"""
	try:
		# Check if user is admin
		user_roles = frappe.get_roles()
		is_admin = bool(set(user_roles) & {"Administrator", "System Manager", "HR Manager", "HR User", "Leave Approver"})
		
		if not is_admin:
			frappe.throw(_("You do not have permission to view all leave applications"))
		
		# Build filters
		filters = {}
		
		if department:
			filters["department"] = department
		if employee:
			filters["employee"] = employee
		if from_date:
			filters["from_date"] = (">=", getdate(from_date))
		if to_date:
			filters["to_date"] = ("<=", getdate(to_date))
		if status_filter:
			filters["status"] = status_filter
		if leave_type:
			filters["leave_type"] = leave_type
		
		# Get applications
		fields = [
			"name",
			"employee",
			"employee_name",
			"department",
			"leave_type",
			"from_date",
			"to_date",
			"half_day",
			"half_day_date",
			"total_leave_days",
			"description",
			"status",
			"posting_date",
			"leave_balance",
			"leave_approver",
			"leave_approver_name",
			"creation",
			"modified",
			"docstatus",
		]
		
		applications = frappe.get_list(
			"Leave Application",
			fields=fields,
			filters=filters,
			order_by="posting_date desc, creation desc",
			limit=limit,
		)
		
		# Calculate statistics
		stats = {
			"total_applications": len(applications),
			"total_days": sum(app.get("total_leave_days", 0) for app in applications),
			"by_status": {},
			"by_leave_type": {},
			"by_department": {},
		}
		
		for app in applications:
			# By status
			status = app.get("status", "Unknown")
			stats["by_status"][status] = stats["by_status"].get(status, 0) + 1
			
			# By leave type
			ltype = app.get("leave_type", "Unknown")
			stats["by_leave_type"][ltype] = stats["by_leave_type"].get(ltype, 0) + 1
			
			# By department
			dept = app.get("department", "Unknown")
			stats["by_department"][dept] = stats["by_department"].get(dept, 0) + 1
		
		return {
			"status": "success",
			"applications": applications,
			"statistics": stats,
		}
		
	except Exception as e:
		frappe.log_error(f"Get Admin Leaves Error: {str(e)}\n{frappe.get_traceback()}", "Admin Leave Applications")
		return {
			"status": "error",
			"message": str(e),
			"applications": [],
		}


def send_leave_application_notification(application_id: str, action: str, remarks: str | None = None):
	"""Send FCM notification for leave application status."""
	try:
		leave_app = frappe.get_doc("Leave Application", application_id)
		user_id = frappe.get_value("Employee", leave_app.employee, "user_id")
		
		if not user_id:
			return
		
		# Get FCM token
		tokens = frappe.get_all("Mobile Device", 
			filters={"user": user_id}, 
			pluck="fcm_token"
		)
		tokens = [t for t in tokens if t]
		
		if not tokens:
			return
		
		# Build notification
		if action == "submitted":
			title = "Leave Application Submitted"
			body = f"Your leave application for {leave_app.total_leave_days} day(s) has been submitted successfully"
		elif action == "approved":
			title = "Leave Approved"
			body = f"Your leave application for {leave_app.total_leave_days} day(s) has been approved"
			if remarks:
				body += f". {remarks}"
		elif action == "rejected":
			title = "Leave Rejected"
			body = f"Your leave application for {leave_app.total_leave_days} day(s) has been rejected"
			if remarks:
				body += f". Reason: {remarks}"
		else:
			return
		
		# Send notification
		send_fcm_notification(tokens, title, body, {
			"type": "leave_application",
			"action": action,
			"application_id": application_id,
		})
		
	except Exception as e:
		frappe.log_error(f"Send Leave Notification Error: {str(e)}", "Leave Notification")


# ============================================================================
# COMPENSATORY LEAVE REQUEST APIs
# ============================================================================

@frappe.whitelist()
def submit_compensatory_leave_request(
	employee: str,
	work_from_date: str,
	work_end_date: str,
	reason: str,
	leave_type: str | None = None,
	half_day: int = 0,
	half_day_date: str | None = None,
) -> dict:
	"""
	Submit compensatory leave request for working on holidays.
	
	Args:
		employee: Employee ID
		work_from_date: Date worked from (YYYY-MM-DD)
		work_end_date: Date worked till (YYYY-MM-DD)
		reason: Reason for working on holiday
		leave_type: Leave Type for compensation (optional)
		half_day: 1 if half day, 0 otherwise
		half_day_date: Date for half day (YYYY-MM-DD)
	
	Returns:
		Dict with request details and status
	"""
	try:
		# Validate current user has employee record
		current_employee = get_employee_by_user()
		if not current_employee:
			frappe.throw(_("No employee record found for current user"))
		
		# Employees can only apply for themselves
		user_roles = frappe.get_roles()
		is_admin = bool(set(user_roles) & {"Administrator", "System Manager", "HR Manager", "HR User"})
		
		if not is_admin and employee != current_employee:
			frappe.throw(_("You can only apply compensatory leave for yourself"))
		
		# Validate reason
		if not reason or not reason.strip():
			frappe.throw(_("Reason is mandatory"))
		
		# Get company from employee
		company = frappe.get_value("Employee", employee, "company")
		
		# Create compensatory leave request
		comp_leave = frappe.get_doc({
			"doctype": "Compensatory Leave Request",
			"employee": employee,
			"work_from_date": getdate(work_from_date),
			"work_end_date": getdate(work_end_date),
			"reason": reason,
			"leave_type": leave_type,
			"half_day": cint(half_day),
			"half_day_date": getdate(half_day_date) if half_day_date else None,
		})
		
		# Insert and submit
		comp_leave.insert(ignore_permissions=True)
		
		# Try to submit (requires HR Manager/User role)
		try:
			if is_admin or "HR Manager" in user_roles or "HR User" in user_roles:
				comp_leave.submit()
				status_msg = "submitted and approved"
				doc_status = 1
			else:
				status_msg = "submitted for approval"
				doc_status = 0
		except Exception as submit_error:
			frappe.log_error(f"Auto-submit failed: {str(submit_error)}", "Comp Leave Submit")
			status_msg = "submitted for approval"
			doc_status = 0
		
		frappe.db.commit()
		
		# Calculate days
		from frappe.utils import date_diff
		date_difference = date_diff(work_end_date, work_from_date) + 1
		if half_day:
			date_difference -= 0.5
		
		# Send notification to approvers (NEW)
		try:
			send_comp_leave_approval_notification(comp_leave.name, "submitted")
		except Exception as notif_error:
			frappe.log_error(f"Failed to send approval notification: {str(notif_error)}", "Comp Leave Notification")
		
		# Also send to employee
		try:
			send_comp_leave_notification(comp_leave.name, "submitted")
		except Exception as notif_error:
			frappe.log_error(f"Failed to send notification: {str(notif_error)}", "Comp Leave Notification")
		
		return {
			"status": "success",
			"message": _("Compensatory leave request {0}").format(status_msg),
			"request_id": comp_leave.name,
			"employee": employee,
			"employee_name": comp_leave.employee_name,
			"work_from_date": str(comp_leave.work_from_date),
			"work_end_date": str(comp_leave.work_end_date),
			"compensatory_days": date_difference,
			"docstatus": doc_status,
		}
		
	except Exception as e:
		frappe.log_error(f"Submit Comp Leave Error: {str(e)}\n{frappe.get_traceback()}", "Compensatory Leave")
		frappe.throw(_("Failed to submit compensatory leave request: {0}").format(str(e)))


@frappe.whitelist()
def approve_compensatory_leave_request(request_id: str, remarks: str | None = None) -> dict:
	"""
	Approve a compensatory leave request (for admins).
	
	Args:
		request_id: Compensatory Leave Request ID
		remarks: Optional approval remarks
	
	Returns:
		Dict with approval status and allocated leave days
	"""
	try:
		# Get comp leave request
		comp_leave = frappe.get_doc("Compensatory Leave Request", request_id)
		
		# Check permission
		user_roles = frappe.get_roles()
		is_admin = bool(set(user_roles) & {"Administrator", "System Manager", "HR Manager", "HR User"})
		
		if not is_admin:
			frappe.throw(_("You do not have permission to approve compensatory leave requests"))
		
		# Check if already submitted
		if comp_leave.docstatus == 1:
			frappe.throw(_("This compensatory leave request has already been approved"))
		
		if comp_leave.docstatus == 2:
			frappe.throw(_("This compensatory leave request has been cancelled"))
		
		# Submit (approve)
		comp_leave.submit()
		
		if remarks:
			comp_leave.add_comment("Comment", f"Approved: {remarks}")
		
		frappe.db.commit()
		
		# Calculate days allocated
		from frappe.utils import date_diff
		date_difference = date_diff(comp_leave.work_end_date, comp_leave.work_from_date) + 1
		if comp_leave.half_day:
			date_difference -= 0.5
		
		# Send notification to employee
		try:
			send_comp_leave_notification(request_id, "approved", remarks)
		except Exception as notif_error:
			frappe.log_error(f"Failed to send notification: {str(notif_error)}", "Comp Leave Notification")
		
		return {
			"status": "success",
			"message": _("Compensatory leave request approved successfully"),
			"request_id": request_id,
			"employee": comp_leave.employee,
			"leave_type": comp_leave.leave_type,
			"days_allocated": date_difference,
			"leave_allocation": comp_leave.leave_allocation,
		}
		
	except Exception as e:
		frappe.log_error(f"Approve Comp Leave Error: {str(e)}\n{frappe.get_traceback()}", "Comp Leave Approval")
		frappe.throw(_("Failed to approve compensatory leave: {0}").format(str(e)))


@frappe.whitelist()
def reject_compensatory_leave_request(request_id: str, reason: str) -> dict:
	"""
	Reject a compensatory leave request (for admins).
	
	Args:
		request_id: Compensatory Leave Request ID
		reason: Rejection reason (required)
	
	Returns:
		Dict with rejection status
	"""
	try:
		if not reason or not reason.strip():
			frappe.throw(_("Rejection reason is required"))
		
		# Get comp leave request
		comp_leave = frappe.get_doc("Compensatory Leave Request", request_id)
		
		# Check permission
		user_roles = frappe.get_roles()
		is_admin = bool(set(user_roles) & {"Administrator", "System Manager", "HR Manager", "HR User"})
		
		if not is_admin:
			frappe.throw(_("You do not have permission to reject compensatory leave requests"))
		
		# Check if already processed
		if comp_leave.docstatus == 1:
			frappe.throw(_("Cannot reject an already approved compensatory leave request"))
		
		if comp_leave.docstatus == 2:
			frappe.throw(_("This compensatory leave request has already been cancelled"))
		
		# Cancel (reject)
		comp_leave.cancel()
		comp_leave.add_comment("Comment", f"Rejected: {reason}")
		frappe.db.commit()
		
		# Send notification to employee
		try:
			send_comp_leave_notification(request_id, "rejected", reason)
		except Exception as notif_error:
			frappe.log_error(f"Failed to send notification: {str(notif_error)}", "Comp Leave Notification")
		
		return {
			"status": "success",
			"message": _("Compensatory leave request rejected"),
			"request_id": request_id,
			"employee": comp_leave.employee,
		}
		
	except Exception as e:
		frappe.log_error(f"Reject Comp Leave Error: {str(e)}\n{frappe.get_traceback()}", "Comp Leave Rejection")
		frappe.throw(_("Failed to reject compensatory leave: {0}").format(str(e)))


@frappe.whitelist()
def cancel_compensatory_leave_request(request_id: str, reason: str | None = None) -> dict:
	"""
	Cancel a compensatory leave request.
	
	Args:
		request_id: Compensatory Leave Request ID
		reason: Cancellation reason
	
	Returns:
		Dict with cancellation status
	"""
	try:
		# Get comp leave request
		comp_leave = frappe.get_doc("Compensatory Leave Request", request_id)
		
		# Check permission
		current_employee = get_employee_by_user()
		user_roles = frappe.get_roles()
		is_admin = bool(set(user_roles) & {"Administrator", "System Manager", "HR Manager", "HR User"})
		
		if not is_admin and comp_leave.employee != current_employee:
			frappe.throw(_("You can only cancel your own compensatory leave requests"))
		
		# Check if already cancelled
		if comp_leave.docstatus == 2:
			frappe.throw(_("This compensatory leave request is already cancelled"))
		
		# Cancel
		if comp_leave.docstatus == 1:
			comp_leave.cancel()
		else:
			comp_leave.docstatus = 2
			comp_leave.save(ignore_permissions=True)
		
		if reason:
			comp_leave.add_comment("Comment", f"Cancelled: {reason}")
		
		frappe.db.commit()
		
		return {
			"status": "success",
			"message": _("Compensatory leave request cancelled successfully"),
			"request_id": request_id,
		}
		
	except Exception as e:
		frappe.log_error(f"Cancel Comp Leave Error: {str(e)}\n{frappe.get_traceback()}", "Comp Leave Cancellation")
		frappe.throw(_("Failed to cancel compensatory leave: {0}").format(str(e)))


@frappe.whitelist()
def get_employee_compensatory_requests(
	employee: str | None = None,
	from_date: str | None = None,
	to_date: str | None = None,
	docstatus: int | None = None,
	limit: int = 100,
) -> dict:
	"""
	Get compensatory leave requests for an employee.
	
	Args:
		employee: Employee ID (if None, uses current user's employee)
		from_date: Filter from this date
		to_date: Filter to this date
		docstatus: Filter by status (0=Draft, 1=Submitted/Approved, 2=Cancelled)
		limit: Maximum number of records
	
	Returns:
		Dict with requests list and summary
	"""
	try:
		# If no employee, get current user's employee
		if not employee:
			employee = get_employee_by_user()
			if not employee:
				frappe.throw(_("No employee record found for current user"))
		
		# Build filters
		filters = {"employee": employee}
		
		if from_date:
			filters["work_from_date"] = (">=", getdate(from_date))
		if to_date:
			filters["work_end_date"] = ("<=", getdate(to_date))
		if docstatus is not None:
			filters["docstatus"] = docstatus
		
		# Get requests
		fields = [
			"name",
			"employee",
			"employee_name",
			"department",
			"work_from_date",
			"work_end_date",
			"half_day",
			"half_day_date",
			"reason",
			"leave_type",
			"leave_allocation",
			"docstatus",
			"creation",
			"modified",
		]
		
		requests = frappe.get_list(
			"Compensatory Leave Request",
			fields=fields,
			filters=filters,
			order_by="work_from_date desc, creation desc",
			limit=limit,
		)
		
		# Calculate summary
		from frappe.utils import date_diff
		total_days = 0
		for req in requests:
			days = date_diff(req.work_end_date, req.work_from_date) + 1
			if req.half_day:
				days -= 0.5
			req["compensatory_days"] = days
			total_days += days
		
		status_summary = {
			"pending": sum(1 for r in requests if r.docstatus == 0),
			"approved": sum(1 for r in requests if r.docstatus == 1),
			"cancelled": sum(1 for r in requests if r.docstatus == 2),
		}
		
		return {
			"status": "success",
			"requests": requests,
			"total_requests": len(requests),
			"total_compensatory_days": total_days,
			"status_summary": status_summary,
		}
		
	except Exception as e:
		frappe.log_error(f"Get Employee Comp Leaves Error: {str(e)}\n{frappe.get_traceback()}", "Comp Leave Requests")
		return {
			"status": "error",
			"message": str(e),
			"requests": [],
		}


@frappe.whitelist()
def get_admin_compensatory_requests(
	department: str | None = None,
	employee: str | None = None,
	from_date: str | None = None,
	to_date: str | None = None,
	docstatus: int | None = None,
	limit: int = 500,
) -> dict:
	"""
	Get all compensatory leave requests for admin with filters.
	
	Args:
		department: Filter by department
		employee: Filter by specific employee
		from_date: Filter from this date
		to_date: Filter to this date
		docstatus: Filter by status (0=Draft, 1=Approved, 2=Cancelled)
		limit: Maximum records
	
	Returns:
		Dict with requests and statistics
	"""
	try:
		# Check if user is admin
		user_roles = frappe.get_roles()
		is_admin = bool(set(user_roles) & {"Administrator", "System Manager", "HR Manager", "HR User"})
		
		if not is_admin:
			frappe.throw(_("You do not have permission to view all compensatory leave requests"))
		
		# Build filters
		filters = {}
		
		if department:
			filters["department"] = department
		if employee:
			filters["employee"] = employee
		if from_date:
			filters["work_from_date"] = (">=", getdate(from_date))
		if to_date:
			filters["work_end_date"] = ("<=", getdate(to_date))
		if docstatus is not None:
			filters["docstatus"] = docstatus
		
		# Get requests
		fields = [
			"name",
			"employee",
			"employee_name",
			"department",
			"work_from_date",
			"work_end_date",
			"half_day",
			"half_day_date",
			"reason",
			"leave_type",
			"leave_allocation",
			"docstatus",
			"creation",
			"modified",
		]
		
		requests = frappe.get_list(
			"Compensatory Leave Request",
			fields=fields,
			filters=filters,
			order_by="creation desc",
			limit=limit,
		)
		
		# Calculate statistics
		from frappe.utils import date_diff
		stats = {
			"total_requests": len(requests),
			"total_days": 0,
			"by_status": {
				"pending": 0,
				"approved": 0,
				"cancelled": 0,
			},
			"by_department": {},
			"by_leave_type": {},
		}
		
		for req in requests:
			# Calculate days
			days = date_diff(req.work_end_date, req.work_from_date) + 1
			if req.half_day:
				days -= 0.5
			req["compensatory_days"] = days
			stats["total_days"] += days
			
			# By status
			if req.docstatus == 0:
				stats["by_status"]["pending"] += 1
			elif req.docstatus == 1:
				stats["by_status"]["approved"] += 1
			elif req.docstatus == 2:
				stats["by_status"]["cancelled"] += 1
			
			# By department
			dept = req.department or "Unknown"
			stats["by_department"][dept] = stats["by_department"].get(dept, 0) + 1
			
			# By leave type
			ltype = req.leave_type or "Not Specified"
			stats["by_leave_type"][ltype] = stats["by_leave_type"].get(ltype, 0) + 1
		
		return {
			"status": "success",
			"requests": requests,
			"statistics": stats,
		}
		
	except Exception as e:
		frappe.log_error(f"Get Admin Comp Leaves Error: {str(e)}\n{frappe.get_traceback()}", "Admin Comp Leave Requests")
		return {
			"status": "error",
			"message": str(e),
			"requests": [],
		}


def send_comp_leave_notification(request_id: str, action: str, remarks: str | None = None):
	"""Send FCM notification for compensatory leave request status."""
	try:
		comp_leave = frappe.get_doc("Compensatory Leave Request", request_id)
		
		# Calculate days
		from frappe.utils import date_diff
		days = date_diff(comp_leave.work_end_date, comp_leave.work_from_date) + 1
		if comp_leave.half_day:
			days -= 0.5
		
		if action == "submitted":
			# Send to HR Manager/User
			hr_users = frappe.get_all("Has Role",
				filters={"role": ["in", ["HR Manager", "HR User"]]},
				pluck="parent"
			)
			
			for hr_user in hr_users:
				tokens = frappe.get_all("Mobile Device",
					filters={"user": hr_user},
					pluck="fcm_token"
				)
				tokens = [t for t in tokens if t]
				
				if tokens:
					title = "New Compensatory Leave Request"
					body = f"{comp_leave.employee_name} requested {days} day(s) comp leave for working on holiday"
					
					send_fcm_notification(tokens, title, body, {
						"type": "compensatory_leave_request",
						"action": "submitted",
						"request_id": request_id,
					})
		
		else:
			# Send to employee
			user_id = frappe.get_value("Employee", comp_leave.employee, "user_id")
			if not user_id:
				return
			
			tokens = frappe.get_all("Mobile Device",
				filters={"user": user_id},
				pluck="fcm_token"
			)
			tokens = [t for t in tokens if t]
			
			if not tokens:
				return
			
			if action == "approved":
				title = "Compensatory Leave Approved"
				body = f"Your comp leave request for {days} day(s) has been approved"
				if remarks:
					body += f". {remarks}"
			elif action == "rejected":
				title = "Compensatory Leave Rejected"
				body = f"Your comp leave request for {days} day(s) has been rejected"
				if remarks:
					body += f". Reason: {remarks}"
			else:
				return
			
			send_fcm_notification(tokens, title, body, {
				"type": "compensatory_leave_request",
				"action": action,
				"request_id": request_id,
			})
		
	except Exception as e:
		frappe.log_error(f"Send Comp Leave Notification Error: {str(e)}", "Comp Leave Notification")


# ============================================================================
# EXPENSE CLAIM APIs
# ============================================================================

@frappe.whitelist()
def submit_expense_claim(
	employee: str,
	expenses: str,  # JSON string of expense items
	expense_approver: str | None = None,
	project: str | None = None,
	cost_center: str | None = None,
	remark: str | None = None,
) -> dict:
	"""
	Submit expense claim for mobile app.
	
	Args:
		employee: Employee ID
		expenses: JSON array of expense items [{expense_type, amount, description, expense_date, sanctioned_amount}]
		expense_approver: Approver user ID
		project: Project ID
		cost_center: Cost Center
		remark: Additional remarks
	
	Returns:
		Dict with claim details and status
	"""
	try:
		import json
		
		# Validate current user
		current_employee = get_employee_by_user()
		if not current_employee:
			frappe.throw(_("No employee record found for current user"))
		
		# Employees can only submit for themselves
		user_roles = frappe.get_roles()
		is_admin = bool(set(user_roles) & {"Administrator", "System Manager", "HR Manager", "HR User", "Expense Approver"})
		
		if not is_admin and employee != current_employee:
			frappe.throw(_("You can only submit expense claims for yourself"))
		
		# Parse expenses
		try:
			expense_items = json.loads(expenses) if isinstance(expenses, str) else expenses
		except:
			frappe.throw(_("Invalid expense items format"))
		
		if not expense_items or len(expense_items) == 0:
			frappe.throw(_("At least one expense item is required"))
		
		# Get employee details
		emp_doc = frappe.get_doc("Employee", employee)
		company = emp_doc.company
		
		# Create expense claim
		expense_claim = frappe.get_doc({
			"doctype": "Expense Claim",
			"naming_series": "HR-EXP-.YYYY.-",
			"employee": employee,
			"expense_approver": expense_approver or emp_doc.expense_approver,
			"company": company,
			"posting_date": nowdate(),
			"approval_status": "Draft",
			"project": project,
			"cost_center": cost_center,
			"remark": remark,
			"expenses": []
		})
		
		# Add expense items
		total_amount = 0
		for item in expense_items:
			expense_claim.append("expenses", {
				"expense_type": item.get("expense_type"),
				"expense_date": item.get("expense_date") or nowdate(),
				"description": item.get("description"),
				"amount": float(item.get("amount", 0)),
				"sanctioned_amount": float(item.get("sanctioned_amount") or item.get("amount", 0)),
			})
			total_amount += float(item.get("amount", 0))
		
		# Insert
		expense_claim.insert(ignore_permissions=True)
		frappe.db.commit()
		
		# Send notification to approvers (NEW)
		try:
			send_expense_approval_notification(expense_claim.name, "submitted")
		except Exception as notif_error:
			frappe.log_error(f"Failed to send approval notification: {str(notif_error)}", "Expense Claim Notification")
		
		# Also send to employee
		try:
			send_expense_claim_notification(expense_claim.name, "submitted")
		except Exception as notif_error:
			frappe.log_error(f"Failed to send notification: {str(notif_error)}", "Expense Claim Notification")
		
		return {
			"status": "success",
			"message": _("Expense claim submitted successfully"),
			"claim_id": expense_claim.name,
			"employee": employee,
			"employee_name": expense_claim.employee_name,
			"total_claimed_amount": total_amount,
			"total_expenses": len(expense_items),
			"approval_status": "Draft",
		}
		
	except Exception as e:
		frappe.log_error(f"Submit Expense Claim Error: {str(e)}\n{frappe.get_traceback()}", "Expense Claim")
		frappe.throw(_("Failed to submit expense claim: {0}").format(str(e)))


@frappe.whitelist()
def approve_expense_claim(
	claim_id: str, 
	remarks: str | None = None,
	sanctioned_amounts: str | None = None,
	payable_account: str | None = None,
) -> dict:
	"""
	Approve an expense claim (for admins/approvers).
	
	Args:
		claim_id: Expense Claim ID
		remarks: Optional approval remarks
		sanctioned_amounts: JSON dict or dict of expense index -> sanctioned amount {0: 1000.0, 1: 500.0}
		payable_account: Payable Account for this expense claim (mandatory for submission)
	
	Returns:
		Dict with approval status
	"""
	try:
		import json
		
		# Get expense claim
		claim = frappe.get_doc("Expense Claim", claim_id)
		
		# Check permission
		current_user = frappe.session.user
		user_roles = frappe.get_roles()
		is_admin = bool(set(user_roles) & {"Administrator", "System Manager", "HR Manager", "HR User", "Expense Approver"})
		is_approver = current_user == claim.expense_approver
		
		if not (is_admin or is_approver):
			frappe.throw(_("You do not have permission to approve this expense claim"))
		
		# Check if already processed
		if claim.approval_status == "Approved":
			frappe.throw(_("This expense claim has already been approved"))
		
		if claim.approval_status == "Rejected":
			frappe.throw(_("Cannot approve a rejected expense claim"))
		
		# Parse sanctioned amounts if provided
		sanctioned_amounts_dict = {}
		if sanctioned_amounts:
			try:
				sanctioned_amounts_dict = json.loads(sanctioned_amounts) if isinstance(sanctioned_amounts, str) else sanctioned_amounts
				# Convert string keys to integers
				sanctioned_amounts_dict = {int(k): float(v) for k, v in sanctioned_amounts_dict.items()}
			except Exception as parse_error:
				frappe.log_error(f"Failed to parse sanctioned_amounts: {str(parse_error)}", "Expense Claim Approval")
				# Continue without custom sanctioned amounts
		
		# Update sanctioned amounts for each expense item
		if sanctioned_amounts_dict:
			for idx, expense in enumerate(claim.expenses):
				if idx in sanctioned_amounts_dict:
					new_sanctioned = float(sanctioned_amounts_dict[idx])
					
					# Validate: sanctioned amount should not exceed claimed amount
					if new_sanctioned > expense.amount:
						frappe.throw(_(f"Sanctioned amount (₹{new_sanctioned}) cannot exceed claimed amount (₹{expense.amount}) for expense item {idx + 1}"))
					
					if new_sanctioned < 0:
						frappe.throw(_(f"Sanctioned amount cannot be negative for expense item {idx + 1}"))
					
					expense.sanctioned_amount = new_sanctioned
		
		# Set payable account if provided (mandatory for submission)
		if payable_account:
			claim.payable_account = payable_account
		elif not claim.payable_account:
			# Try to fetch default payable account from company
			default_payable = frappe.get_cached_value("Company", claim.company, "default_expense_claim_payable_account")
			if default_payable:
				claim.payable_account = default_payable
		
		# Approve
		claim.approval_status = "Approved"
		claim.status = "Approved"
		
		if remarks:
			claim.add_comment("Comment", f"Approved: {remarks}")
		
		# Save and recalculate totals
		claim.save(ignore_permissions=True)
		frappe.db.commit()
		
		# Send notification to employee
		try:
			send_expense_claim_notification(claim_id, "approved", remarks)
		except Exception as notif_error:
			frappe.log_error(f"Failed to send notification: {str(notif_error)}", "Expense Claim Notification")
		
		return {
			"status": "success",
			"message": _("Expense claim approved successfully"),
			"claim_id": claim_id,
			"employee": claim.employee,
			"total_claimed_amount": claim.total_claimed_amount,
			"total_sanctioned_amount": claim.total_sanctioned_amount,
			"payable_account": claim.payable_account,
		}
		
	except Exception as e:
		frappe.log_error(f"Approve Expense Claim Error: {str(e)}\n{frappe.get_traceback()}", "Expense Claim Approval")
		frappe.throw(_("Failed to approve expense claim: {0}").format(str(e)))


@frappe.whitelist()
def reject_expense_claim(claim_id: str, reason: str) -> dict:
	"""
	Reject an expense claim (for admins/approvers).
	
	Args:
		claim_id: Expense Claim ID
		reason: Rejection reason (required)
	
	Returns:
		Dict with rejection status
	"""
	try:
		if not reason or not reason.strip():
			frappe.throw(_("Rejection reason is required"))
		
		# Get expense claim
		claim = frappe.get_doc("Expense Claim", claim_id)
		
		# Check permission
		current_user = frappe.session.user
		user_roles = frappe.get_roles()
		is_admin = bool(set(user_roles) & {"Administrator", "System Manager", "HR Manager", "HR User", "Expense Approver"})
		is_approver = current_user == claim.expense_approver
		
		if not (is_admin or is_approver):
			frappe.throw(_("You do not have permission to reject this expense claim"))
		
		# Check if already processed
		if claim.approval_status == "Rejected":
			frappe.throw(_("This expense claim has already been rejected"))
		
		if claim.approval_status == "Approved":
			frappe.throw(_("Cannot reject an approved expense claim"))
		
		# Reject
		claim.approval_status = "Rejected"
		claim.status = "Rejected"
		claim.add_comment("Comment", f"Rejected: {reason}")
		claim.save(ignore_permissions=True)
		frappe.db.commit()
		
		# Send notification to employee
		try:
			send_expense_claim_notification(claim_id, "rejected", reason)
		except Exception as notif_error:
			frappe.log_error(f"Failed to send notification: {str(notif_error)}", "Expense Claim Notification")
		
		return {
			"status": "success",
			"message": _("Expense claim rejected"),
			"claim_id": claim_id,
			"employee": claim.employee,
		}
		
	except Exception as e:
		frappe.log_error(f"Reject Expense Claim Error: {str(e)}\n{frappe.get_traceback()}", "Expense Claim Rejection")
		frappe.throw(_("Failed to reject expense claim: {0}").format(str(e)))


@frappe.whitelist()
def get_employee_expense_claims(
	employee: str | None = None,
	from_date: str | None = None,
	to_date: str | None = None,
	approval_status: str | None = None,
	limit: int = 100,
) -> dict:
	"""
	Get expense claims for an employee with filters.
	
	Args:
		employee: Employee ID (if None, uses current user's employee)
		from_date: Filter from this date
		to_date: Filter to this date
		approval_status: Filter by status (Draft, Approved, Rejected)
		limit: Maximum number of records
	
	Returns:
		Dict with claims list and summary
	"""
	try:
		# If no employee, get current user's employee
		if not employee:
			employee = get_employee_by_user()
			if not employee:
				frappe.throw(_("No employee record found for current user"))
		
		# Build filters
		filters = {"employee": employee}
		
		if from_date:
			filters["posting_date"] = (">=", getdate(from_date))
		if to_date:
			filters["posting_date"] = ("<=", getdate(to_date))
		if approval_status:
			filters["approval_status"] = approval_status
		
		# Get claims
		fields = [
			"name",
			"employee",
			"employee_name",
			"posting_date",
			"approval_status",
			"status",
			"expense_approver",
			"total_claimed_amount",
			"total_sanctioned_amount",
			"total_amount_reimbursed",
			"is_paid",
			"payable_account",
			"project",
			"cost_center",
			"remark",
			"creation",
			"modified",
		]
		
		claims = frappe.get_list(
			"Expense Claim",
			fields=fields,
			filters=filters,
			order_by="posting_date desc, creation desc",
			limit=limit,
		)
		
		# Get expense details for each claim
		for claim in claims:
			expenses = frappe.get_all(
				"Expense Claim Detail",
				filters={"parent": claim.name},
				fields=["expense_type", "expense_date", "description", "amount", "sanctioned_amount"],
			)
			claim["expenses"] = expenses
			claim["total_expenses"] = len(expenses)
		
		# Calculate summary
		total_claimed = sum(c.get("total_claimed_amount", 0) for c in claims)
		total_sanctioned = sum(c.get("total_sanctioned_amount", 0) for c in claims)
		
		status_summary = {}
		for claim in claims:
			status = claim.get("approval_status", "Unknown")
			status_summary[status] = status_summary.get(status, 0) + 1
		
		return {
			"status": "success",
			"claims": claims,
			"total_claims": len(claims),
			"total_claimed_amount": total_claimed,
			"total_sanctioned_amount": total_sanctioned,
			"status_summary": status_summary,
		}
		
	except Exception as e:
		frappe.log_error(f"Get Employee Expense Claims Error: {str(e)}\n{frappe.get_traceback()}", "Expense Claims")
		return {
			"status": "error",
			"message": str(e),
			"claims": [],
		}


@frappe.whitelist()
def get_admin_expense_claims(
	department: str | None = None,
	employee: str | None = None,
	from_date: str | None = None,
	to_date: str | None = None,
	approval_status: str | None = None,
	limit: int = 500,
) -> dict:
	"""
	Get all expense claims for admin with advanced filters.
	
	Args:
		department: Filter by department
		employee: Filter by specific employee
		from_date: Filter from this date
		to_date: Filter to this date
		approval_status: Filter by status
		limit: Maximum records
	
	Returns:
		Dict with claims and statistics
	"""
	try:
		# Check if user is admin
		user_roles = frappe.get_roles()
		is_admin = bool(set(user_roles) & {"Administrator", "System Manager", "HR Manager", "HR User", "Expense Approver"})
		
		if not is_admin:
			frappe.throw(_("You do not have permission to view all expense claims"))
		
		# Build filters
		filters = {}
		
		if department:
			filters["department"] = department
		if employee:
			filters["employee"] = employee
		if from_date:
			filters["posting_date"] = (">=", getdate(from_date))
		if to_date:
			filters["posting_date"] = ("<=", getdate(to_date))
		if approval_status:
			filters["approval_status"] = approval_status
		
		# Get claims
		fields = [
			"name",
			"employee",
			"employee_name",
			"department",
			"posting_date",
			"approval_status",
			"status",
			"expense_approver",
			"total_claimed_amount",
			"total_sanctioned_amount",
			"total_amount_reimbursed",
			"is_paid",
			"payable_account",
			"project",
			"cost_center",
			"remark",
			"creation",
			"modified",
		]
		
		claims = frappe.get_list(
			"Expense Claim",
			fields=fields,
			filters=filters,
			order_by="posting_date desc, creation desc",
			limit=limit,
		)
		
		# Get expense details
		for claim in claims:
			expenses = frappe.get_all(
				"Expense Claim Detail",
				filters={"parent": claim.name},
				fields=["expense_type", "expense_date", "description", "amount", "sanctioned_amount"],
			)
			claim["expenses"] = expenses
			claim["total_expenses"] = len(expenses)
		
		# Calculate statistics
		stats = {
			"total_claims": len(claims),
			"total_claimed": sum(c.get("total_claimed_amount", 0) for c in claims),
			"total_sanctioned": sum(c.get("total_sanctioned_amount", 0) for c in claims),
			"total_reimbursed": sum(c.get("total_amount_reimbursed", 0) for c in claims),
			"by_status": {},
			"by_department": {},
		}
		
		for claim in claims:
			# By status
			status = claim.get("approval_status", "Unknown")
			stats["by_status"][status] = stats["by_status"].get(status, 0) + 1
			
			# By department
			dept = claim.get("department", "Unknown")
			stats["by_department"][dept] = stats["by_department"].get(dept, 0) + 1
		
		return {
			"status": "success",
			"claims": claims,
			"statistics": stats,
		}
		
	except Exception as e:
		frappe.log_error(f"Get Admin Expense Claims Error: {str(e)}\n{frappe.get_traceback()}", "Admin Expense Claims")
		return {
			"status": "error",
			"message": str(e),
			"claims": [],
		}


@frappe.whitelist()
def get_payable_accounts(company: str | None = None) -> dict:
	"""
	Get list of payable accounts for expense claims.
	
	Args:
		company: Company name (optional, uses employee's company if not provided)
	
	Returns:
		Dict with list of payable accounts
	"""
	try:
		# If no company specified, get from current user's employee
		if not company:
			employee = get_employee_by_user()
			if employee:
				company = frappe.get_value("Employee", employee, "company")
		
		if not company:
			frappe.throw(_("Company is required to fetch payable accounts"))
		
		# Get payable accounts (account_type = "Payable")
		accounts = frappe.get_all(
			"Account",
			filters={
				"company": company,
				"account_type": "Payable",
				"is_group": 0,
				"disabled": 0,
			},
			fields=["name", "account_name", "account_number", "parent_account"],
			order_by="account_name asc",
		)
		
		# Get default payable account from company
		default_account = frappe.get_cached_value("Company", company, "default_expense_claim_payable_account")
		
		return {
			"status": "success",
			"accounts": accounts,
			"default_account": default_account,
			"company": company,
		}
		
	except Exception as e:
		frappe.log_error(f"Get Payable Accounts Error: {str(e)}\n{frappe.get_traceback()}", "Payable Accounts")
		return {
			"status": "error",
			"message": str(e),
			"accounts": [],
		}


def send_expense_claim_notification(claim_id: str, action: str, remarks: str | None = None):
	"""Send FCM notification for expense claim status."""
	try:
		claim = frappe.get_doc("Expense Claim", claim_id)
		
		if action == "submitted":
			# Send to approver
			if claim.expense_approver:
				tokens = frappe.get_all("Mobile Device",
					filters={"user": claim.expense_approver},
					pluck="fcm_token"
				)
				tokens = [t for t in tokens if t]
				
				if tokens:
					title = "New Expense Claim"
					body = f"{claim.employee_name} submitted expense claim for ₹{claim.total_claimed_amount:.2f}"
					
					send_fcm_notification(tokens, title, body, {
						"type": "expense_claim",
						"action": "submitted",
						"claim_id": claim_id,
					})
		
		else:
			# Send to employee
			user_id = frappe.get_value("Employee", claim.employee, "user_id")
			if not user_id:
				return
			
			tokens = frappe.get_all("Mobile Device",
				filters={"user": user_id},
				pluck="fcm_token"
			)
			tokens = [t for t in tokens if t]
			
			if not tokens:
				return
			
			if action == "approved":
				title = "Expense Claim Approved"
				body = f"Your expense claim for ₹{claim.total_claimed_amount:.2f} has been approved"
				if remarks:
					body += f". {remarks}"
			elif action == "rejected":
				title = "Expense Claim Rejected"
				body = f"Your expense claim for ₹{claim.total_claimed_amount:.2f} has been rejected"
				if remarks:
					body += f". Reason: {remarks}"
			else:
				return
			
			send_fcm_notification(tokens, title, body, {
				"type": "expense_claim",
				"action": action,
				"claim_id": claim_id,
			})
		
	except Exception as e:
		frappe.log_error(f"Send Expense Claim Notification Error: {str(e)}", "Expense Claim Notification")


# ============================================================================
# TRAVEL REQUEST APIs - Clean Implementation for Android App
# ============================================================================

@frappe.whitelist()
def submit_travel_request(
	employee: str,
	travel_type: str,
	purpose_of_travel: str,
	description: str | None = None,
	travel_funding: str | None = None,
	details_of_sponsor: str | None = None,
	travel_proof: str | None = None,
	cell_number: str | None = None,
	prefered_email: str | None = None,
	personal_id_type: str | None = None,
	personal_id_number: str | None = None,
	passport_number: str | None = None,
	cost_center: str | None = None,
	name_of_organizer: str | None = None,
	address_of_organizer: str | None = None,
	other_details: str | None = None,
) -> dict:
	"""
	Submit a new travel request.
	
	Args:
		employee: Employee ID
		travel_type: Travel type ("Domestic" or "International")
		purpose_of_travel: Purpose of Travel (Link to Purpose of Travel doctype)
		description: Any other details
		travel_funding: Travel funding type
		details_of_sponsor: Details of sponsor (name, location)
		travel_proof: Attachment - Copy of invitation/announcement
		cell_number: Contact number
		prefered_email: Contact email
		personal_id_type: Identification document type
		personal_id_number: Identification document number
		passport_number: Passport number
		cost_center: Cost center
		name_of_organizer: Event organizer name
		address_of_organizer: Event organizer address
		other_details: Event other details
	
	Returns:
		Dict with status and travel request details
	"""
	try:
		# Validate current user has employee record
		current_employee = get_employee_by_user()
		if not current_employee:
			frappe.throw(_("No employee record found for current user"))
		
		# Check permissions - employees can only submit for themselves, admins can submit for anyone
		user_roles = frappe.get_roles()
		is_admin = bool(set(user_roles) & {"Administrator", "System Manager", "HR Manager", "HR User"})
		
		if not is_admin and employee != current_employee:
			frappe.throw(_("You can only submit travel requests for yourself"))
		
		# Validate required fields
		if not travel_type or travel_type not in ["Domestic", "International"]:
			frappe.throw(_("Travel type must be 'Domestic' or 'International'"))
		
		if not purpose_of_travel:
			frappe.throw(_("Purpose of travel is required"))
		
		# Create travel request document
		travel_request = frappe.get_doc({
			"doctype": "Travel Request",
			"employee": employee,
			"travel_type": travel_type,
			"purpose_of_travel": purpose_of_travel,
			"description": description,
			"travel_funding": travel_funding,
			"details_of_sponsor": details_of_sponsor,
			"travel_proof": travel_proof,
			"cell_number": cell_number,
			"prefered_email": prefered_email,
			"personal_id_type": personal_id_type,
			"personal_id_number": personal_id_number,
			"passport_number": passport_number,
			"cost_center": cost_center,
			"name_of_organizer": name_of_organizer,
			"address_of_organizer": address_of_organizer,
			"other_details": other_details,
		})
		
		# Insert the document (validation will auto-fetch employee details)
		travel_request.insert(ignore_permissions=True)
		frappe.db.commit()
		
		# Send notification to approvers (NEW)
		try:
			send_travel_approval_notification(travel_request.name, "submitted")
		except Exception as notif_error:
			frappe.log_error(f"Failed to send approval notification: {str(notif_error)}", "Travel Request Notification")
		
		# Also send to employee
		try:
			send_travel_request_notification(travel_request.name, "submitted")
		except Exception as notif_error:
			frappe.log_error(f"Notification failed: {str(notif_error)}", "Travel Request Notification")
		
		return {
			"status": "success",
			"message": _("Travel request submitted successfully"),
			"data": {
				"request_id": travel_request.name,
				"employee": employee,
				"employee_name": travel_request.employee_name,
				"travel_type": travel_type,
				"purpose_of_travel": purpose_of_travel,
				"docstatus": travel_request.docstatus,
				"status_label": get_travel_request_status_label(travel_request.docstatus),
				"creation": str(travel_request.creation),
			}
		}
		
	except Exception as e:
		frappe.log_error(f"Submit Travel Request Error: {str(e)}\n{frappe.get_traceback()}", "Travel Request Submit")
		return {
			"status": "error",
			"message": str(e),
		}


@frappe.whitelist()
def approve_travel_request(request_id: str, remarks: str | None = None) -> dict:
	"""
	Approve a travel request (Admin only).
	
	Args:
		request_id: Travel Request ID
		remarks: Optional approval remarks/comments
	
	Returns:
		Dict with status and message
	"""
	try:
		# Check admin permission
		user_roles = frappe.get_roles()
		is_admin = bool(set(user_roles) & {"Administrator", "System Manager", "HR Manager", "HR User"})
		
		if not is_admin:
			frappe.throw(_("You do not have permission to approve travel requests"))
		
		# DEBUG: Log what we're approving
		frappe.log_error(
			f"Attempting to approve:\n"
			f"Request ID: {request_id}\n"
			f"User: {frappe.session.user}\n"
			f"Is Admin: {is_admin}",
			"Travel Request Approve Attempt"
		)
		
		# Get travel request
		travel_request = frappe.get_doc("Travel Request", request_id)
		
		# DEBUG: Log document details
		frappe.log_error(
			f"Document loaded:\n"
			f"DocType: {travel_request.doctype}\n"
			f"Name: {travel_request.name}\n"
			f"Employee: {travel_request.employee}\n"
			f"Current docstatus: {travel_request.docstatus}",
			"Travel Request Document Details"
		)
		
		# Check if already approved
		if travel_request.docstatus == 1:
			return {
				"status": "info",
				"message": _("Travel request is already approved"),
				"data": {
					"request_id": request_id,
					"status_label": "Approved",
				}
			}
		
		# Check if cancelled
		if travel_request.docstatus == 2:
			frappe.throw(_("Cannot approve a cancelled travel request"))
		
		# Submit (approve) the request - ignore permissions for admin
		travel_request.flags.ignore_permissions = True
		travel_request.submit()
		
		# Add comment if remarks provided
		if remarks:
			travel_request.add_comment("Comment", f"Approved: {remarks}")
		
		frappe.db.commit()
		
		# Send notification to employee
		try:
			send_travel_request_notification(request_id, "approved", remarks)
		except Exception as notif_error:
			frappe.log_error(f"Notification failed: {str(notif_error)}", "Travel Request Notification")
		
		return {
			"status": "success",
			"message": _("Travel request approved successfully"),
			"data": {
				"request_id": request_id,
				"employee": travel_request.employee,
				"employee_name": travel_request.employee_name,
				"status_label": "Approved",
			}
		}
		
	except Exception as e:
		frappe.log_error(f"Approve Travel Request Error: {str(e)}\n{frappe.get_traceback()}", "Travel Request Approve")
		
		# Return user-friendly error message
		error_msg = str(e)
		if "PermissionError" in str(type(e)):
			error_msg = "Permission denied. Please ensure you have HR Manager or HR User role."
		elif "Payable Account" in error_msg:
			error_msg = "Configuration error: This appears to be an Expense Claim issue, not a Travel Request. Please check your document type."
		
		return {
			"status": "error",
			"message": error_msg,
		}


@frappe.whitelist()
def reject_travel_request(request_id: str, reason: str) -> dict:
	"""
	Reject a travel request (Admin only).
	
	Args:
		request_id: Travel Request ID
		reason: Rejection reason (required)
	
	Returns:
		Dict with status and message
	"""
	try:
		# Validate reason
		if not reason or not reason.strip():
			frappe.throw(_("Rejection reason is required"))
		
		# Check admin permission
		user_roles = frappe.get_roles()
		is_admin = bool(set(user_roles) & {"Administrator", "System Manager", "HR Manager", "HR User"})
		
		if not is_admin:
			frappe.throw(_("You do not have permission to reject travel requests"))
		
		# Get travel request
		travel_request = frappe.get_doc("Travel Request", request_id)
		
		# Check if already cancelled
		if travel_request.docstatus == 2:
			return {
				"status": "info",
				"message": _("Travel request is already rejected/cancelled"),
				"data": {
					"request_id": request_id,
					"status_label": "Rejected",
				}
			}
		
		# Cancel the request
		if travel_request.docstatus == 1:
			# Already submitted, need to cancel - ignore permissions for admin
			travel_request.flags.ignore_permissions = True
			travel_request.cancel()
		else:
			# Draft state, mark as cancelled
			travel_request.docstatus = 2
			travel_request.flags.ignore_permissions = True
			travel_request.save(ignore_permissions=True)
		
		# Add rejection comment
		travel_request.add_comment("Comment", f"Rejected: {reason}")
		frappe.db.commit()
		
		# Send notification to employee
		try:
			send_travel_request_notification(request_id, "rejected", reason)
		except Exception as notif_error:
			frappe.log_error(f"Notification failed: {str(notif_error)}", "Travel Request Notification")
		
		return {
			"status": "success",
			"message": _("Travel request rejected"),
			"data": {
				"request_id": request_id,
				"employee": travel_request.employee,
				"employee_name": travel_request.employee_name,
				"status_label": "Rejected",
				"rejection_reason": reason,
			}
		}
		
	except Exception as e:
		frappe.log_error(f"Reject Travel Request Error: {str(e)}\n{frappe.get_traceback()}", "Travel Request Reject")
		return {
			"status": "error",
			"message": str(e),
		}


@frappe.whitelist()
def get_travel_requests(
	employee: str | None = None,
	travel_type: str | None = None,
	purpose_of_travel: str | None = None,
	status: str | None = None,
	from_date: str | None = None,
	to_date: str | None = None,
	limit: int = 100,
) -> dict:
	"""
	Get travel requests with filters.
	For employees: returns their own requests
	For admins: can see all requests or filter by employee
	
	Args:
		employee: Filter by employee ID (admin only)
		travel_type: Filter by travel type (Domestic/International)
		purpose_of_travel: Filter by purpose
		status: Filter by status (pending/approved/rejected)
		from_date: Filter from creation date
		to_date: Filter to creation date
		limit: Maximum number of records
	
	Returns:
		Dict with requests list and summary
	"""
	try:
		# Get current user's employee
		current_employee = get_employee_by_user()
		user_roles = frappe.get_roles()
		is_admin = bool(set(user_roles) & {"Administrator", "System Manager", "HR Manager", "HR User"})
		
		# DEBUG LOGGING
		frappe.log_error(
			f"get_travel_requests called:\n"
			f"User: {frappe.session.user}\n"
			f"Current Employee: {current_employee}\n"
			f"Roles: {user_roles}\n"
			f"Is Admin: {is_admin}\n"
			f"Params - employee: {employee}, travel_type: {travel_type}, purpose: {purpose_of_travel}\n"
			f"Status param: {status}, from_date: {from_date}, to_date: {to_date}, limit: {limit}",
			"Travel Request Debug"
		)
		
		# Build filters
		filters = {}
		
		# Non-admin users can only see their own requests
		if not is_admin:
			if not current_employee:
				frappe.throw(_("No employee record found for current user"))
			filters["employee"] = current_employee
		elif employee:
			# Admin can filter by specific employee
			filters["employee"] = employee
		
		# Apply other filters
		if travel_type:
			filters["travel_type"] = travel_type
		if purpose_of_travel:
			filters["purpose_of_travel"] = purpose_of_travel
		
		# Status filter (docstatus: 0=Draft/Pending, 1=Approved, 2=Rejected/Cancelled)
		if status:
			status_map = {
				"pending": 0,
				"approved": 1,
				"rejected": 2,
			}
			if status.lower() in status_map:
				filters["docstatus"] = status_map[status.lower()]
			else:
				frappe.log_error(f"Invalid status filter: {status}", "Travel Request Filter Error")
		
		# Date range filter
		if from_date:
			filters["creation"] = (">=", from_date)
		if to_date:
			if "creation" in filters:
				filters["creation"] = ("between", [from_date, to_date])
			else:
				filters["creation"] = ("<=", to_date)
		
		# DEBUG: Log final filters
		frappe.log_error(f"Final filters applied: {filters}", "Travel Request Filters")
		
		# Get travel requests
		fields = [
			"name",
			"employee",
			"employee_name",
			"company",
			"travel_type",
			"purpose_of_travel",
			"travel_funding",
			"details_of_sponsor",
			"description",
			"cell_number",
			"prefered_email",
			"cost_center",
			"name_of_organizer",
			"docstatus",
			"creation",
			"modified",
			"owner",
		]
		
		# For admin users, ignore permissions to see all requests
		# For employees, permissions are automatically applied
		requests = frappe.get_list(
			"Travel Request",
			fields=fields,
			filters=filters,
			order_by="creation desc",
			limit=limit,
			ignore_permissions=is_admin,  # Admin can see all requests
		)
		
		# DEBUG: Log query results
		frappe.log_error(
			f"Query returned {len(requests)} requests\n"
			f"Request IDs: {[r.get('name') for r in requests]}\n"
			f"Ignore permissions: {is_admin}",
			"Travel Request Query Result"
		)
		
		# Add status labels
		for req in requests:
			req["status_label"] = get_travel_request_status_label(req.docstatus)
		
		# Calculate summary
		summary = {
			"total": len(requests),
			"pending": sum(1 for r in requests if r.docstatus == 0),
			"approved": sum(1 for r in requests if r.docstatus == 1),
			"rejected": sum(1 for r in requests if r.docstatus == 2),
		}
		
		return {
			"status": "success",
			"data": {
				"requests": requests,
				"summary": summary,
			}
		}
		
	except Exception as e:
		frappe.log_error(f"Get Travel Requests Error: {str(e)}\n{frappe.get_traceback()}", "Travel Request List")
		return {
			"status": "error",
			"message": str(e),
			"data": {
				"requests": [],
				"summary": {},
			}
		}


@frappe.whitelist()
def get_travel_request_details(request_id: str) -> dict:
	"""
	Get detailed information about a specific travel request.
	
	Args:
		request_id: Travel Request ID
	
	Returns:
		Dict with complete travel request details
	"""
	try:
		# Get current user's employee
		current_employee = get_employee_by_user()
		user_roles = frappe.get_roles()
		is_admin = bool(set(user_roles) & {"Administrator", "System Manager", "HR Manager", "HR User"})
		
		# Get travel request
		travel_request = frappe.get_doc("Travel Request", request_id)
		
		# Check permission - employee can only see their own, admin can see all
		if not is_admin and travel_request.employee != current_employee:
			frappe.throw(_("You do not have permission to view this travel request"))
		
		# Get comments/activity
		comments = frappe.get_all(
			"Comment",
			filters={
				"reference_doctype": "Travel Request",
				"reference_name": request_id,
				"comment_type": "Comment",
			},
			fields=["content", "owner", "creation"],
			order_by="creation desc",
		)
		
		return {
			"status": "success",
			"data": {
				"request_id": travel_request.name,
				"employee": travel_request.employee,
				"employee_name": travel_request.employee_name,
				"company": travel_request.company,
				"travel_type": travel_request.travel_type,
				"purpose_of_travel": travel_request.purpose_of_travel,
				"travel_funding": travel_request.travel_funding,
				"details_of_sponsor": travel_request.details_of_sponsor,
				"description": travel_request.description,
				"travel_proof": travel_request.travel_proof,
				"cell_number": travel_request.cell_number,
				"prefered_email": travel_request.prefered_email,
				"date_of_birth": str(travel_request.date_of_birth) if travel_request.date_of_birth else None,
				"personal_id_type": travel_request.personal_id_type,
				"personal_id_number": travel_request.personal_id_number,
				"passport_number": travel_request.passport_number,
				"cost_center": travel_request.cost_center,
				"name_of_organizer": travel_request.name_of_organizer,
				"address_of_organizer": travel_request.address_of_organizer,
				"other_details": travel_request.other_details,
				"docstatus": travel_request.docstatus,
				"status_label": get_travel_request_status_label(travel_request.docstatus),
				"creation": str(travel_request.creation),
				"modified": str(travel_request.modified),
				"owner": travel_request.owner,
				"comments": comments,
			}
		}
		
	except Exception as e:
		frappe.log_error(f"Get Travel Request Details Error: {str(e)}\n{frappe.get_traceback()}", "Travel Request Details")
		return {
			"status": "error",
			"message": str(e),
		}


@frappe.whitelist()
def get_purpose_of_travel_list() -> dict:
	"""
	Get all available purposes of travel.
	
	Returns:
		Dict with list of purposes
	"""
	try:
		purposes = frappe.get_all(
			"Purpose of Travel",
			fields=["name", "purpose_of_travel"],
			order_by="name asc",
		)
		
		# Extract just the names (since autoname is field:purpose_of_travel)
		purpose_list = [p.get("name") or p.get("purpose_of_travel") for p in purposes]
		
		return {
			"status": "success",
			"data": {
				"purposes": purpose_list,
				"total": len(purpose_list),
			}
		}
		
	except Exception as e:
		frappe.log_error(f"Get Purpose of Travel Error: {str(e)}", "Purpose of Travel")
		return {
			"status": "error",
			"message": str(e),
			"data": {
				"purposes": [],
				"total": 0,
			}
		}


def get_travel_request_status_label(docstatus: int) -> str:
	"""
	Convert docstatus to readable label.
	
	Args:
		docstatus: 0=Draft/Pending, 1=Approved, 2=Rejected/Cancelled
	
	Returns:
		Status label string
	"""
	status_map = {
		0: "Pending",
		1: "Approved",
		2: "Rejected",
	}
	return status_map.get(docstatus, "Unknown")


def send_travel_request_notification(request_id: str, action: str, remarks: str | None = None):
	"""
	Send FCM push notification for travel request status updates.
	
	Args:
		request_id: Travel Request ID
		action: "submitted", "approved", or "rejected"
		remarks: Optional remarks/reason
	"""
	try:
		travel_request = frappe.get_doc("Travel Request", request_id)
		
		if action == "submitted":
			# Notify HR Managers and HR Users about new request
			hr_users = frappe.get_all(
				"Has Role",
				filters={"role": ["in", ["HR Manager", "HR User", "Administrator"]]},
				pluck="parent"
			)
			
			for hr_user in hr_users:
				# Skip if user is the one who submitted
				if hr_user == frappe.session.user:
					continue
				
				tokens = frappe.get_all(
					"Mobile Device",
					filters={"user": hr_user},
					pluck="fcm_token"
				)
				tokens = [t for t in tokens if t]
				
				if tokens:
					title = "New Travel Request"
					body = f"{travel_request.employee_name} submitted a {travel_request.travel_type} travel request"
					
					send_fcm_notification(tokens, title, body, {
						"type": "travel_request",
						"action": "submitted",
						"request_id": request_id,
					})
		
		elif action in ["approved", "rejected"]:
			# Notify the employee who submitted the request
			user_id = frappe.get_value("Employee", travel_request.employee, "user_id")
			
			if not user_id:
				return
			
			tokens = frappe.get_all(
				"Mobile Device",
				filters={"user": user_id},
				pluck="fcm_token"
			)
			tokens = [t for t in tokens if t]
			
			if not tokens:
				return
			
			if action == "approved":
				title = "Travel Request Approved ✓"
				body = f"Your {travel_request.travel_type} travel request has been approved"
				if remarks:
					body += f". {remarks}"
			else:  # rejected
				title = "Travel Request Rejected"
				body = f"Your {travel_request.travel_type} travel request has been rejected"
				if remarks:
					body += f". Reason: {remarks}"
			
			send_fcm_notification(tokens, title, body, {
				"type": "travel_request",
				"action": action,
				"request_id": request_id,
			})
		
	except Exception as e:
		frappe.log_error(f"Send Travel Request Notification Error: {str(e)}", "Travel Request Notification")


# OLD Basic Expense Claims (Kept for backward compatibility)
@frappe.whitelist()
def get_expense_claims(
	employee: str,
	approver_id: str | None = None,
	for_approval: bool = False,
	limit: int | None = None,
) -> list[dict]:
	filters = get_filters("Expense Claim", employee, approver_id, for_approval)
	fields = [
		"`tabExpense Claim`.name",
		"`tabExpense Claim`.posting_date",
		"`tabExpense Claim`.employee",
		"`tabExpense Claim`.employee_name",
		"`tabExpense Claim`.approval_status",
		"`tabExpense Claim`.status",
		"`tabExpense Claim`.expense_approver",
		"`tabExpense Claim`.total_claimed_amount",
		"`tabExpense Claim`.posting_date",
		"`tabExpense Claim`.company",
		"`tabExpense Claim`.creation",
		"`tabExpense Claim Detail`.expense_type",
		"count(`tabExpense Claim Detail`.expense_type) as total_expenses",
	]

	if workflow_state_field := get_workflow_state_field("Expense Claim"):
		fields.append(workflow_state_field)

	claims = frappe.get_list(
		"Expense Claim",
		fields=fields,
		filters=filters,
		order_by="`tabExpense Claim`.posting_date desc",
		group_by="`tabExpense Claim`.name",
		limit=limit,
	)

	if workflow_state_field:
		for claim in claims:
			claim["workflow_state_field"] = workflow_state_field

	return claims


@frappe.whitelist()
def get_expense_claim_summary(employee: str) -> dict:
	from frappe.query_builder.functions import Sum

	Claim = frappe.qb.DocType("Expense Claim")

	pending_claims_case = (
		frappe.qb.terms.Case().when(Claim.approval_status == "Draft", Claim.total_claimed_amount).else_(0)
	)
	sum_pending_claims = Sum(pending_claims_case).as_("total_pending_amount")

	approved_claims_case = (
		frappe.qb.terms.Case()
		.when(Claim.approval_status == "Approved", Claim.total_sanctioned_amount)
		.else_(0)
	)
	sum_approved_claims = Sum(approved_claims_case).as_("total_approved_amount")

	approved_total_claimed_case = (
		frappe.qb.terms.Case().when(Claim.approval_status == "Approved", Claim.total_claimed_amount).else_(0)
	)
	sum_approved_total_claimed = Sum(approved_total_claimed_case).as_("total_claimed_in_approved")

	rejected_claims_case = (
		frappe.qb.terms.Case().when(Claim.approval_status == "Rejected", Claim.total_claimed_amount).else_(0)
	)
	sum_rejected_claims = Sum(rejected_claims_case).as_("total_rejected_amount")

	summary = (
		frappe.qb.from_(Claim)
		.select(
			sum_pending_claims,
			sum_approved_claims,
			sum_rejected_claims,
			sum_approved_total_claimed,
			Claim.company,
		)
		.where((Claim.docstatus != 2) & (Claim.employee == employee))
	).run(as_dict=True)[0]

	currency = frappe.db.get_value("Company", summary.company, "default_currency")
	summary["currency"] = currency

	return summary


@frappe.whitelist()
def get_expense_type_description(expense_type: str) -> str:
	return frappe.db.get_value("Expense Claim Type", expense_type, "description")


@frappe.whitelist()
def get_expense_claim_types() -> list[dict]:
	ClaimType = frappe.qb.DocType("Expense Claim Type")

	return (frappe.qb.from_(ClaimType).select(ClaimType.name, ClaimType.description)).run(as_dict=True)


@frappe.whitelist()
def get_expense_approval_details(employee: str) -> dict:
	expense_approver, department = frappe.get_cached_value(
		"Employee",
		employee,
		["expense_approver", "department"],
	)

	if not expense_approver and department:
		expense_approver = frappe.db.get_value(
			"Department Approver",
			{"parent": department, "parentfield": "expense_approvers", "idx": 1},
			"approver",
		)

	expense_approver_name = frappe.db.get_value("User", expense_approver, "full_name", cache=True)
	department_approvers = get_department_approvers(department, "expense_approvers")

	if expense_approver and expense_approver not in [approver.name for approver in department_approvers]:
		department_approvers.append({"name": expense_approver, "full_name": expense_approver_name})

	return dict(
		expense_approver=expense_approver,
		expense_approver_name=expense_approver_name,
		department_approvers=department_approvers,
		is_mandatory=frappe.db.get_single_value("HR Settings", "expense_approver_mandatory_in_expense_claim"),
	)


# Employee Advance
@frappe.whitelist()
def get_employee_advance_balance(employee: str) -> list[dict]:
	Advance = frappe.qb.DocType("Employee Advance")

	advances = (
		frappe.qb.from_(Advance)
		.select(
			Advance.name,
			Advance.employee,
			Advance.status,
			Advance.purpose,
			Advance.paid_amount,
			(Advance.paid_amount - (Advance.claimed_amount + Advance.return_amount)).as_("balance_amount"),
			Advance.posting_date,
			Advance.currency,
		)
		.where(
			(Advance.docstatus == 1)
			& (Advance.paid_amount)
			& (Advance.employee == employee)
			# don't need claimed & returned advances, only partly or completely paid ones
			& (Advance.status.isin(["Paid", "Unpaid"]))
		)
		.orderby(Advance.posting_date, order=Order.desc)
	).run(as_dict=True)

	return advances


@frappe.whitelist()
def get_advance_account(company: str) -> str | None:
	return frappe.db.get_value("Company", company, "default_employee_advance_account", cache=True)


# Company
@frappe.whitelist()
def get_company_currencies() -> dict:
	Company = frappe.qb.DocType("Company")
	Currency = frappe.qb.DocType("Currency")

	query = (
		frappe.qb.from_(Company)
		.join(Currency)
		.on(Company.default_currency == Currency.name)
		.select(
			Company.name,
			Company.default_currency,
			Currency.name.as_("currency"),
			Currency.symbol.as_("symbol"),
		)
	)

	companies = query.run(as_dict=True)
	return {company.name: (company.default_currency, company.symbol) for company in companies}


@frappe.whitelist()
def get_currency_symbols() -> dict:
	Currency = frappe.qb.DocType("Currency")

	currencies = (frappe.qb.from_(Currency).select(Currency.name, Currency.symbol)).run(as_dict=True)

	return {currency.name: currency.symbol or currency.name for currency in currencies}


@frappe.whitelist()
def get_company_cost_center_and_expense_account(company: str) -> dict:
	return frappe.db.get_value(
		"Company", company, ["cost_center", "default_expense_claim_payable_account"], as_dict=True
	)


# Form View APIs
@frappe.whitelist()
def get_doctype_fields(doctype: str) -> list[dict]:
	fields = frappe.get_meta(doctype).fields
	return [
		field
		for field in fields
		if field.fieldtype in SUPPORTED_FIELD_TYPES and field.fieldname != "amended_from"
	]


@frappe.whitelist()
def get_doctype_states(doctype: str) -> dict:
	states = frappe.get_meta(doctype).states
	return {state.title: state.color.lower() for state in states}


# File
@frappe.whitelist()
def get_attachments(dt: str, dn: str):
	from frappe.desk.form.load import get_attachments

	return get_attachments(dt, dn)


@frappe.whitelist()
def upload_base64_file(content, filename, dt=None, dn=None, fieldname=None):
	import base64
	import io
	from mimetypes import guess_type

	from PIL import Image, ImageOps

	from frappe.handler import ALLOWED_MIMETYPES

	decoded_content = base64.b64decode(content)
	content_type = guess_type(filename)[0]
	if content_type not in ALLOWED_MIMETYPES:
		frappe.throw(_("You can only upload JPG, PNG, PDF, TXT or Microsoft documents."))

	if content_type.startswith("image/jpeg"):
		# transpose the image according to the orientation tag, and remove the orientation data
		with Image.open(io.BytesIO(decoded_content)) as image:
			transpose_img = ImageOps.exif_transpose(image)
			# convert the image back to bytes
			file_content = io.BytesIO()
			transpose_img.save(file_content, format="JPEG")
			file_content = file_content.getvalue()
	else:
		file_content = decoded_content

	return frappe.get_doc(
		{
			"doctype": "File",
			"attached_to_doctype": dt,
			"attached_to_name": dn,
			"attached_to_field": fieldname,
			"folder": "Home",
			"file_name": filename,
			"content": file_content,
			"is_private": 1,
		}
	).insert()


@frappe.whitelist()
def delete_attachment(filename: str):
	frappe.delete_doc("File", filename)


@frappe.whitelist()
def download_salary_slip(name: str):
	import base64

	from frappe.utils.print_format import download_pdf

	default_print_format = frappe.get_meta("Salary Slip").default_print_format or "Standard"

	try:
		download_pdf("Salary Slip", name, format=default_print_format)
	except Exception:
		frappe.throw(_("Failed to download Salary Slip PDF"))

	base64content = base64.b64encode(frappe.local.response.filecontent)
	content_type = frappe.local.response.type

	return f"data:{content_type};base64," + base64content.decode("utf-8")


# Workflow
@frappe.whitelist()
def get_workflow(doctype: str) -> dict:
	workflow = get_workflow_name(doctype)
	if not workflow:
		return frappe._dict()
	return frappe.get_doc("Workflow", workflow)


def get_workflow_state_field(doctype: str) -> str | None:
	workflow_name = get_workflow_name(doctype)
	if not workflow_name:
		return None

	override_status, workflow_state_field = frappe.db.get_value(
		"Workflow",
		workflow_name,
		["override_status", "workflow_state_field"],
	)
	# NOTE: checkbox labelled 'Don't Override Status' is named override_status hence the inverted logic
	if not override_status:
		return workflow_state_field
	return None


def get_allowed_states_for_workflow(workflow: dict, user_id: str) -> list[str]:
	user_roles = frappe.get_roles(user_id)
	return [transition.state for transition in workflow.transitions if transition.allowed in user_roles]


# Permissions
@frappe.whitelist()
def get_permitted_fields_for_write(doctype: str) -> list[str]:
	return get_permitted_fields(doctype, permission_type="write")

###########################################

@frappe.whitelist(allow_guest=False)
def geo_attendance(employee, action, latitude=None, longitude=None, work_type=None):
    """
    Mark attendance with geolocation tracking.
    Stores coordinates directly in Attendance doctype (no Geo Log dependency).
    
    Args:
        employee: Employee ID
        action: "Check-In" or "Check-Out"
        latitude: GPS latitude (optional for WFH/On Site)
        longitude: GPS longitude (optional for WFH/On Site)
        work_type: "Office", "WFH", or "On Site"
    """
    try:
        # Log shortened input for debugging
        frappe.log_error(
            f"Geo Attendance: {action} by {employee}",
            f"Details: lat={latitude}, long={longitude}, work_type={work_type}, user={frappe.session.user}"
        )
        
        # Validate employee
        if not employee or not frappe.db.exists("Employee", employee):
            frappe.throw(_("Invalid Employee ID"))
        
        # Validate action
        if action not in ["Check-In", "Check-Out"]:
            frappe.throw(_("Invalid action: Must be Check-In or Check-Out"))
        
        # Check authentication
        if not frappe.session.user or frappe.session.user == "Guest":
            frappe.throw(_("User not authenticated"), frappe.AuthenticationError)

        # Check WFH eligibility if work_type is WFH
        if work_type == "WFH":
            employee_doc = frappe.get_doc("Employee", employee)
            if not employee_doc.custom_wfh_eligible:
                frappe.throw(_("You are not authorized to mark Work From Home attendance"), frappe.PermissionError)

        # Check On Site eligibility if work_type is On Site
        if work_type == "On Site":
            employee_doc = frappe.get_doc("Employee", employee)
            if not employee_doc.custom_on_site_eligible:
                frappe.throw(_("You are not authorized to mark On Site attendance"), frappe.PermissionError)

        # Convert coordinates to float if they exist
        if latitude is not None and longitude is not None:
            try:
                latitude = float(latitude)
                longitude = float(longitude)
            except (TypeError, ValueError):
                frappe.throw(_("Invalid latitude or longitude values"))

        # Only verify location if not WFH or On Site and coordinates are provided
        # WFH and On Site don't require geofence validation
        if work_type not in ["WFH", "On Site"]:
            if latitude is None or longitude is None:
                frappe.throw(_("Location coordinates are required for office attendance"))
            
            employee_doc = frappe.get_doc("Employee", employee)
            if not employee_doc.custom_office_location:
                frappe.throw(_("No office location assigned to employee"))

            office_location = frappe.get_doc("Office Location", employee_doc.custom_office_location)
            geofence_center = (office_location.latitude, office_location.longitude)
            geofence_radius = office_location.radius

            user_location = (latitude, longitude)
            distance = geodesic(geofence_center, user_location).meters
            if distance > geofence_radius:
                frappe.throw(_("You are outside the office geofence"))

        # Get today's date
        today = getdate(now_datetime())
        
        # Check for duplicate action today using Attendance table
        if action == "Check-In":
            existing_attendance = frappe.db.get_all(
                "Attendance",
                filters={
                    "employee": employee,
                    "attendance_date": today,
                    "docstatus": ["!=", 2],
                },
                fields=["name", "in_time"],
                limit=1,
            )
            if existing_attendance and existing_attendance[0].in_time:
                frappe.throw(_("You have already checked in today"))
        
        # For Check-Out, verify there's a Check-In
        if action == "Check-Out":
            existing_attendance = frappe.db.get_all(
                "Attendance",
                filters={
                    "employee": employee,
                    "attendance_date": today,
                    "docstatus": ["!=", 2],
                },
                fields=["name", "in_time", "out_time"],
                limit=1,
            )
            if not existing_attendance or not existing_attendance[0].in_time:
                frappe.throw(_("No Check-In found for today"))
            if existing_attendance[0].out_time:
                frappe.throw(_("You have already checked out today"))

        # Get current timestamp
        current_timestamp = now_datetime()
        
        try:
            attendance = mark_attendance_direct(
                employee=employee,
                action=action,
                timestamp=current_timestamp,
                latitude=latitude,
                longitude=longitude,
                work_type=work_type
            )
        except frappe.PermissionError:
            frappe.db.rollback()
            frappe.throw(_("You lack permission to submit attendance. Contact HR."), exc=frappe.exceptions.PermissionError)
        except frappe.UpdateAfterSubmitError:
            frappe.db.rollback()
            frappe.throw(_("Cannot update attendance after submission. Contact HR."), exc=frappe.exceptions.UpdateAfterSubmitError)

        frappe.db.commit()

        return {
            "status": "Success",
            "message": f"{action} recorded successfully",
            "attendance": attendance.name,
            "timestamp": str(current_timestamp),
        }
    except Exception as e:
        frappe.log_error(f"Geo Attendance Error: {str(e)[:200]}")
        raise


def mark_attendance_direct(employee, action, timestamp, latitude=None, longitude=None, work_type=None):
    """
    Mark attendance directly without Geo Log intermediate step.
    Stores all location data in custom fields on Attendance doctype.
    
    Args:
        employee: Employee ID
        action: "Check-In" or "Check-Out"
        timestamp: Datetime of the action
        latitude: GPS latitude
        longitude: GPS longitude
        work_type: "Office", "WFH", or "On Site"
    """
    attendance_date = getdate(timestamp)
    attendance = None

    if action == "Check-In":
        existing_attendance = frappe.db.get_all(
            "Attendance",
            filters={
                "employee": employee,
                "attendance_date": attendance_date,
                "docstatus": ["!=", 2],
            },
            fields=["name"],
            limit=1,
        )
        if existing_attendance:
            frappe.throw(_("Attendance already marked for today"))

        # Create attendance record in draft state
        # Determine status based on work_type
        if work_type == "WFH":
            status = "Work From Home"
        elif work_type == "On Site":
            status = "On Site"
        else:
            status = "Present"
        
        attendance = frappe.get_doc({
            "doctype": "Attendance",
            "employee": employee,
            "attendance_date": attendance_date,
            "status": status,
            "in_time": timestamp,
            "custom_work_type": work_type if work_type else "Office",
            "custom_checkin_latitude": latitude,
            "custom_checkin_longitude": longitude,
        })
        attendance.save()
        
    elif action == "Check-Out":
        existing_attendance = frappe.db.get_all(
            "Attendance",
            filters={
                "employee": employee,
                "attendance_date": attendance_date,
                "docstatus": ["!=", 2],
            },
            fields=["name", "docstatus", "status"],
            limit=1,
        )
        if not existing_attendance:
            frappe.throw(_("No attendance found for Check-Out"))

        attendance_name = existing_attendance[0].name
        attendance_docstatus = existing_attendance[0].docstatus
        
        # Log for debugging
        frappe.log_error(
            f"Check-out for {employee}: Record={attendance_name}, DocStatus={attendance_docstatus}",
            "Checkout Process"
        )
        
        if attendance_docstatus == 1:
            # Attendance is submitted - update directly in database
            frappe.log_error(f"Updating submitted attendance {attendance_name} via SQL", "Checkout Direct Update")
            
            # Update both out_time fields and checkout coordinates directly in database
            frappe.db.sql("""
                UPDATE `tabAttendance` 
                SET out_time = %s, 
                    custom_out_time_copy = %s,
                    custom_checkout_latitude = %s,
                    custom_checkout_longitude = %s,
                    modified = %s,
                    modified_by = %s
                WHERE name = %s
            """, (timestamp, timestamp, latitude, longitude, now_datetime(), frappe.session.user, attendance_name))
            
            frappe.db.commit()
            
            # Return the updated record
            attendance = frappe.get_doc("Attendance", attendance_name)
            
        else:
            # Attendance is in draft - update normally
            attendance = frappe.get_doc("Attendance", attendance_name)
            
            # Set both out_time fields and checkout coordinates
            attendance.out_time = timestamp
            attendance.custom_out_time_copy = timestamp
            attendance.custom_checkout_latitude = latitude
            attendance.custom_checkout_longitude = longitude
            
            if work_type == "WFH" and existing_attendance[0].status != "Work From Home":
                attendance.status = "Work From Home"
            elif work_type == "On Site" and existing_attendance[0].status != "On Site":
                attendance.status = "On Site"
            
            # Save the changes
            attendance.save()
            
            # Try to submit if not already submitted
            try:
                attendance.submit()
                frappe.log_error(f"Successfully submitted attendance {attendance_name}", "Checkout Success")
            except Exception as submit_error:
                frappe.log_error(f"Could not submit attendance {attendance_name}: {str(submit_error)}", "Checkout Submit Error")
                # Keep the record in draft state but with out_time recorded
                pass
    
    return attendance

@frappe.whitelist(allow_guest=False)
def get_office_location(employee):
    try:
        if not frappe.db.exists("Employee", employee):
            frappe.throw(_("Invalid Employee ID"))
        
        employee_doc = frappe.get_doc("Employee", employee)
        if not employee_doc.custom_office_location:
            frappe.throw(_("No office location assigned to employee"))
        
        office_location = frappe.get_doc("Office Location", employee_doc.custom_office_location)
        return {
            "latitude": office_location.latitude,
            "longitude": office_location.longitude,
            "radius": office_location.radius
        }
    except Exception as e:
        frappe.log_error(f"Get Office Location Error: {str(e)[:100]}")
        frappe.throw(_("Failed to fetch office location: {0}").format(str(e)))

@frappe.whitelist(allow_guest=False)
def get_user_wfh_info():
    try:
        user = frappe.session.user
        if user == "Guest":
            frappe.throw(_("User not authenticated"), frappe.AuthenticationError)
        
        employee = frappe.db.get_value(
            "Employee",
            {"user_id": user},
            ["name", "custom_wfh_eligible", "employee_name", "department", "designation"],
            as_dict=True
        )
        is_admin = any(role in frappe.get_roles() for role in ["System Manager", "HR Manager"])
        
        if not employee:
            frappe.log_error(f"get_user_wfh_info: No Employee found for user {user}")
            return {
                "is_admin": is_admin,
                "wfh_eligible": False,
                "employee_id": None,
                "employee_name": None,
                "department": None,
                "designation": None
            }
        
        return {
            "is_admin": is_admin,
            "wfh_eligible": employee.custom_wfh_eligible or False,
            "employee_id": employee.name,
            "employee_name": employee.employee_name,
            "department": employee.department or None,
            "designation": employee.designation or None
        }
    except Exception as e:
        frappe.log_error(f"get_user_wfh_info Error: {str(e)[:100]}, User: {frappe.session.user}")
        frappe.throw(_("Failed to fetch user WFH info: {0}").format(str(e)), frappe.DataError)

@frappe.whitelist(allow_guest=False)
def get_employee_wfh_list():
    # Check if user has Admin role
    if not frappe.has_permission("Employee", "read") or not any(role in frappe.get_roles() for role in ["System Manager", "HR Manager"]):
        frappe.throw(_("You do not have permission to access this resource."), frappe.PermissionError)

    # Fetch active employees with relevant fields
    employees = frappe.get_all(
        "Employee",
        fields=["name", "employee_name", "custom_wfh_eligible", "status"],
        filters={"status": "Active"}
    )
    return employees

@frappe.whitelist(allow_guest=False)
def toggle_wfh_eligibility(employee_id, wfh_eligible):
    # Check Admin permissions
    if not frappe.has_permission("Employee", "write") or not any(role in frappe.get_roles() for role in ["System Manager", "HR Manager"]):
        frappe.throw(_("You do not have permission to modify this resource."), frappe.PermissionError)

    # Validate employee exists
    if not frappe.db.exists("Employee", employee_id):
        frappe.throw(_("Employee {0} does not exist.").format(employee_id))

    # Update WFH eligibility
    frappe.db.set_value("Employee", employee_id, "custom_wfh_eligible", int(wfh_eligible))
    frappe.db.commit()
    return {"status": "success", "message": _("WFH eligibility updated for {0}.").format(employee_id)}

# ============================================================================
# ON SITE ELIGIBILITY APIs - Similar to WFH
# ============================================================================

@frappe.whitelist(allow_guest=False)
def get_user_on_site_info():
    """Get On Site eligibility info for current user."""
    try:
        user = frappe.session.user
        if user == "Guest":
            frappe.throw(_("User not authenticated"), frappe.AuthenticationError)
        
        employee = frappe.db.get_value(
            "Employee",
            {"user_id": user},
            ["name", "custom_on_site_eligible", "employee_name", "department", "designation"],
            as_dict=True
        )
        is_admin = any(role in frappe.get_roles() for role in ["System Manager", "HR Manager"])
        
        if not employee:
            frappe.log_error(f"get_user_on_site_info: No Employee found for user {user}")
            return {
                "is_admin": is_admin,
                "on_site_eligible": False,
                "employee_id": None,
                "employee_name": None,
                "department": None,
                "designation": None
            }
        
        return {
            "is_admin": is_admin,
            "on_site_eligible": employee.custom_on_site_eligible or False,
            "employee_id": employee.name,
            "employee_name": employee.employee_name,
            "department": employee.department or None,
            "designation": employee.designation or None
        }
    except Exception as e:
        frappe.log_error(f"get_user_on_site_info Error: {str(e)[:100]}, User: {frappe.session.user}")
        frappe.throw(_("Failed to fetch user On Site info: {0}").format(str(e)), frappe.DataError)

@frappe.whitelist(allow_guest=False)
def get_employee_on_site_list():
    """Get list of all employees with On Site eligibility status (Admin only)."""
    # Check if user has Admin role
    if not frappe.has_permission("Employee", "read") or not any(role in frappe.get_roles() for role in ["System Manager", "HR Manager"]):
        frappe.throw(_("You do not have permission to access this resource."), frappe.PermissionError)

    # Fetch active employees with relevant fields
    employees = frappe.get_all(
        "Employee",
        fields=["name", "employee_name", "custom_on_site_eligible", "status"],
        filters={"status": "Active"}
    )
    return employees

@frappe.whitelist(allow_guest=False)
def toggle_on_site_eligibility(employee_id, on_site_eligible):
    """Toggle On Site eligibility for an employee (Admin only)."""
    # Check Admin permissions
    if not frappe.has_permission("Employee", "write") or not any(role in frappe.get_roles() for role in ["System Manager", "HR Manager"]):
        frappe.throw(_("You do not have permission to modify this resource."), frappe.PermissionError)

    # Validate employee exists
    if not frappe.db.exists("Employee", employee_id):
        frappe.throw(_("Employee {0} does not exist.").format(employee_id))

    # Update On Site eligibility
    frappe.db.set_value("Employee", employee_id, "custom_on_site_eligible", int(on_site_eligible))
    frappe.db.commit()
    return {"status": "success", "message": _("On Site eligibility updated for {0}.").format(employee_id)}

@frappe.whitelist(allow_guest=False)
def get_today_attendance(date=None):
    """Present / Absent / Holiday for a given date (default: today).
    Adds check_out from out_time/custom_out_time_copy and excludes holidays from absent.
    """
    try:
        if not frappe.has_permission("Attendance", "read") or not any(
            role in frappe.get_roles() for role in ["System Manager", "HR Manager", "HR User"]
        ):
            frappe.throw(_("You do not have permission to access this resource."), frappe.PermissionError)

        target_date = getdate(date) if date else getdate()

        all_employees = frappe.get_all(
            "Employee",
            filters={"status": "Active"},
            fields=["name", "employee_name"],
        )

        today_attendance = frappe.get_all(
            "Attendance",
            filters={"attendance_date": target_date, "docstatus": ["!=", 2]},
            fields=["employee", "employee_name", "in_time", "out_time", "custom_out_time_copy", "status"]
        )

        present_ids = {att.employee for att in today_attendance if att.status in ["Present", "Work From Home", "On Site"]}

        present = []
        for att in today_attendance:
            if att.status in ["Present", "Work From Home", "On Site"]:
                checkout = att.out_time or att.custom_out_time_copy
                present.append({
                    "employee_id": att.employee,
                    "employee_name": att.employee_name,
                    "check_in": att.in_time,
                    "check_out": checkout,  # <-- added
                    "status": att.status
                })

        absent, holiday = [], []
        for emp in all_employees:
            if emp.name not in present_ids:
                if is_employee_on_holiday(emp.name, target_date):
                    holiday.append({"employee_id": emp.name, "employee_name": emp.employee_name, "status": "Holiday"})
                else:
                    absent.append({"employee_id": emp.name, "employee_name": emp.employee_name, "status": "Absent"})

        return {
            "present": present,
            "absent": absent,
            "holiday": holiday,
            "total_employees": len(all_employees),
            "working_employees": len(all_employees) - len(holiday),
            "date": target_date.strftime("%Y-%m-%d"),
        }

    except Exception as e:
        frappe.log_error(f"Get Today Attendance Error: {str(e)[:200]}")
        frappe.throw(_("Failed to fetch today's attendance: {0}").format(str(e)))
########################################################

@frappe.whitelist(allow_guest=False)
def manual_checkout(attendance_id, checkout_time=None):
    """
    Manually add checkout time to existing attendance record.
    For admin use when employees forget to check out.
    """
    try:
        # Check admin permissions
        if not any(role in frappe.get_roles() for role in ["System Manager", "HR Manager", "HR User"]):
            frappe.throw(_("You do not have permission to perform this action."), frappe.PermissionError)
        
        # Validate attendance record exists
        if not frappe.db.exists("Attendance", attendance_id):
            frappe.throw(_("Attendance record not found."))
        
        attendance = frappe.get_doc("Attendance", attendance_id)
        
        # Check if check-in exists
        if not attendance.in_time:
            frappe.throw(_("Cannot add checkout time without check-in time."))
        
        # Check if already checked out
        if attendance.out_time or attendance.custom_out_time_copy:
            frappe.throw(_("Employee has already checked out."))
        
        # Use provided checkout_time or default to end of working day
        if not checkout_time:
            # Default to 6:00 PM on the attendance date
            from datetime import datetime, time
            attendance_date = attendance.attendance_date
            default_checkout = datetime.combine(attendance_date, time(18, 0, 0))
            checkout_time = default_checkout
        else:
            checkout_time = frappe.utils.get_datetime(checkout_time)
        
        # Validate checkout time is after check-in time
        if checkout_time <= attendance.in_time:
            frappe.throw(_("Checkout time must be after check-in time."))
        
        # Update attendance record
        if attendance.docstatus == 1:
            # If already submitted, update directly in database
            frappe.db.sql("""
                UPDATE `tabAttendance` 
                SET out_time = %s, 
                    custom_out_time_copy = %s,
                    modified = %s,
                    modified_by = %s
                WHERE name = %s
            """, (checkout_time, checkout_time, now_datetime(), frappe.session.user, attendance_id))
            
            frappe.db.commit()
            
            # Log the manual checkout
            frappe.log_error(
                f"Manual checkout added by {frappe.session.user} for attendance {attendance_id}",
                f"Employee: {attendance.employee}, Checkout: {checkout_time}"
            )
            
        else:
            # If in draft, update normally
            attendance.out_time = checkout_time
            attendance.custom_out_time_copy = checkout_time
            attendance.save()
            
            # Submit if not already submitted
            if attendance.docstatus == 0:
                attendance.submit()
        
        return {
            "status": "success",
            "message": "Checkout time added successfully",
            "attendance_id": attendance_id,
            "checkout_time": checkout_time.strftime("%Y-%m-%d %H:%M:%S")
        }
        
    except Exception as e:
        frappe.log_error(f"Manual Checkout Error: {str(e)[:100]}")
        frappe.throw(_("Failed to add checkout time: {0}").format(str(e)))


@frappe.whitelist(allow_guest=False)
def get_pending_checkouts(date=None):
    """
    Get list of employees who checked in but haven't checked out.
    """
    try:
        # Check admin permissions
        if not any(role in frappe.get_roles() for role in ["System Manager", "HR Manager", "HR User"]):
            frappe.throw(_("You do not have permission to access this resource."), frappe.PermissionError)
        
        if not date:
            date = getdate()
        else:
            date = getdate(date)
        
        # Get attendance records with check-in but no check-out
        pending_checkouts = frappe.get_all(
            "Attendance",
            filters={
                "attendance_date": date,
                "in_time": ["is", "set"],
                "out_time": ["is", "not set"],
                "custom_out_time_copy": ["is", "not set"],
                "docstatus": ["!=", 2]
            },
            fields=[
                "name", "employee", "employee_name", "in_time", 
                "status", "attendance_date", "docstatus"
            ],
            order_by="in_time desc"
        )
        
        return {
            "pending_checkouts": pending_checkouts,
            "total_pending": len(pending_checkouts),
            "date": date.strftime("%Y-%m-%d")
        }
        
    except Exception as e:
        frappe.log_error(f"Get Pending Checkouts Error: {str(e)[:100]}")
        frappe.throw(_("Failed to fetch pending checkouts: {0}").format(str(e)))


@frappe.whitelist(allow_guest=False)
def bulk_manual_checkout(attendance_ids, default_checkout_time=None):
    """
    Add checkout time to multiple attendance records at once.
    """
    try:
        # Check admin permissions
        if not any(role in frappe.get_roles() for role in ["System Manager", "HR Manager", "HR User"]):
            frappe.throw(_("You do not have permission to perform this action."), frappe.PermissionError)
        
        if isinstance(attendance_ids, str):
            attendance_ids = frappe.parse_json(attendance_ids)
        
        if not default_checkout_time:
            # Default to 6:00 PM
            from datetime import datetime, time
            today = getdate()
            default_checkout_time = datetime.combine(today, time(18, 0, 0))
        else:
            default_checkout_time = frappe.utils.get_datetime(default_checkout_time)
        
        successful_updates = []
        failed_updates = []
        
        for attendance_id in attendance_ids:
            try:
                result = manual_checkout(attendance_id, default_checkout_time)
                successful_updates.append({
                    "attendance_id": attendance_id,
                    "status": "success"
                })
            except Exception as e:
                failed_updates.append({
                    "attendance_id": attendance_id,
                    "error": str(e)
                })
        
        return {
            "status": "completed",
            "successful": len(successful_updates),
            "failed": len(failed_updates),
            "successful_updates": successful_updates,
            "failed_updates": failed_updates
        }
        
    except Exception as e:
        frappe.log_error(f"Bulk Manual Checkout Error: {str(e)[:100]}")
        frappe.throw(_("Failed to process bulk checkout: {0}").format(str(e)))

@frappe.whitelist(allow_guest=False)
def get_attendance_records_for_date(date):
    """
    Get all attendance records for a specific date.
    Returns all records including complete, missing checkout, and draft records.
    """
    try:
        # Check admin permissions
        if not any(role in frappe.get_roles() for role in ["System Manager", "HR Manager", "HR User"]):
            frappe.throw(_("You do not have permission to access this resource."), frappe.PermissionError)
        
        if not date:
            date = getdate()
        else:
            date = getdate(date)
        
        # Get all attendance records for the date
        attendance_records = frappe.db.sql("""
            SELECT 
                name,
                employee,
                employee_name,
                in_time,
                out_time,
                custom_out_time_copy,
                status,
                attendance_date,
                docstatus,
                working_hours
            FROM `tabAttendance`
            WHERE attendance_date = %s
            AND docstatus != 2
            ORDER BY 
                CASE 
                    WHEN in_time IS NOT NULL THEN in_time 
                    ELSE '1900-01-01 00:00:00'
                END DESC
        """, (date,), as_dict=True)
        
        return {
            "attendance_records": attendance_records,
            "total_records": len(attendance_records),
            "date": date.strftime("%Y-%m-%d")
        }
        
    except Exception as e:
        frappe.log_error(f"Get Attendance Records Error: {str(e)[:100]}")
        frappe.throw(_("Failed to fetch attendance records: {0}").format(str(e)))


# Add this to your backend Python file (where other hrms.api functions are defined)

@frappe.whitelist(allow_guest=False)
def update_attendance_times(attendance_id, check_in_time=None, check_out_time=None):
    """
    Update check-in and/or check-out times for attendance records.
    Admin function that bypasses permission restrictions using direct SQL updates.
    """
    try:
        # Log the incoming parameters
        frappe.log_error(f"update_attendance_times called with: attendance_id={attendance_id}, check_in_time={check_in_time}, check_out_time={check_out_time}")
        
        # Check admin permissions
        if not any(role in frappe.get_roles() for role in ["System Manager", "HR Manager", "HR User"]):
            frappe.throw(_("You do not have permission to perform this action."), frappe.PermissionError)
        
        # Validate input
        if not attendance_id:
            frappe.throw(_("Attendance ID is required."))
        
        if not frappe.db.exists("Attendance", attendance_id):
            frappe.throw(_("Attendance record not found."))
        
        # Get current attendance data without loading the document (to avoid permission issues)
        current_data = frappe.db.get_value("Attendance", attendance_id, 
                                          ["in_time", "out_time", "custom_out_time_copy", "employee", "docstatus"], 
                                          as_dict=True)
        
        if not current_data:
            frappe.throw(_("Attendance record not found."))
        
        # Parse and validate times
        updated = False
        new_check_in = None
        new_check_out = None
        
        if check_in_time:
            try:
                new_check_in = frappe.utils.get_datetime(check_in_time)
                # Strip timezone info to match database format
                if hasattr(new_check_in, 'tzinfo') and new_check_in.tzinfo is not None:
                    new_check_in = new_check_in.replace(tzinfo=None)
                frappe.log_error(f"Parsed check_in_time: {new_check_in}")
            except Exception as e:
                frappe.log_error(f"Error parsing check_in_time: {str(e)}")
                frappe.throw(_("Invalid check-in time format: {0}").format(str(e)))
        
        if check_out_time:
            try:
                new_check_out = frappe.utils.get_datetime(check_out_time)
                # Strip timezone info to match database format
                if hasattr(new_check_out, 'tzinfo') and new_check_out.tzinfo is not None:
                    new_check_out = new_check_out.replace(tzinfo=None)
                frappe.log_error(f"Parsed check_out_time: {new_check_out}")
            except Exception as e:
                frappe.log_error(f"Error parsing check_out_time: {str(e)}")
                frappe.throw(_("Invalid check-out time format: {0}").format(str(e)))
        
        # Validate time sequence using safe comparison
        try:
            final_check_in = new_check_in if new_check_in else current_data.in_time
            final_check_out = new_check_out if new_check_out else (current_data.out_time or current_data.custom_out_time_copy)
            
            if final_check_in and final_check_out:
                # Convert to timestamps for safe comparison
                import time
                if hasattr(final_check_in, 'timestamp'):
                    check_in_ts = final_check_in.timestamp()
                else:
                    check_in_ts = time.mktime(final_check_in.timetuple())
                
                if hasattr(final_check_out, 'timestamp'):
                    check_out_ts = final_check_out.timestamp()
                else:
                    check_out_ts = time.mktime(final_check_out.timetuple())
                
                if check_out_ts <= check_in_ts:
                    frappe.throw(_("Check-out time must be after check-in time."))
        except Exception as comparison_error:
            frappe.log_error(f"Time comparison error (non-critical): {str(comparison_error)}")
        
        # ALWAYS use direct SQL update to bypass ALL permission restrictions
        frappe.log_error(f"Using SQL update to bypass permission restrictions for attendance {attendance_id}")
        
        update_fields = []
        update_values = []
        
        if check_in_time:
            update_fields.append("in_time = %s")
            update_values.append(new_check_in)
            updated = True
        
        if check_out_time:
            update_fields.append("out_time = %s")
            update_fields.append("custom_out_time_copy = %s")
            update_values.extend([new_check_out, new_check_out])
            updated = True
        
        if updated:
            # Add modification tracking
            update_fields.extend(["modified = %s", "modified_by = %s"])
            update_values.extend([now_datetime(), frappe.session.user])
            
            # Build and execute SQL update
            sql_query = f"UPDATE `tabAttendance` SET {', '.join(update_fields)} WHERE name = %s"
            update_values.append(attendance_id)
            
            frappe.db.sql(sql_query, update_values)
            frappe.db.commit()
            
            # Log the successful update
            frappe.log_error(
                f"Admin attendance update completed by {frappe.session.user}",
                f"Record: {attendance_id}, Employee: {current_data.employee}, " +
                f"Check-in: {new_check_in}, Check-out: {new_check_out}"
            )
        
        if not updated:
            frappe.throw(_("No valid time provided for update."))
        
        return {
            "status": "success",
            "message": "Attendance times updated successfully",
            "attendance_id": attendance_id
        }
        
    except Exception as e:
        frappe.log_error(f"update_attendance_times error: {str(e)}")
        frappe.throw(str(e))

@frappe.whitelist(allow_guest=False)
def get_attendance_statistics_for_date(date=None):
    """
    Get detailed statistics for attendance records on a specific date.
    """
    try:
        # Check admin permissions
        if not any(role in frappe.get_roles() for role in ["System Manager", "HR Manager", "HR User"]):
            frappe.throw(_("You do not have permission to access this resource."), frappe.PermissionError)
        
        if not date:
            date = getdate()
        else:
            date = getdate(date)
        
        # Get statistics using SQL for better performance
        stats = frappe.db.sql("""
            SELECT 
                COUNT(*) as total_records,
                SUM(CASE WHEN in_time IS NOT NULL THEN 1 ELSE 0 END) as has_checkin,
                SUM(CASE WHEN (out_time IS NOT NULL OR custom_out_time_copy IS NOT NULL) THEN 1 ELSE 0 END) as has_checkout,
                SUM(CASE WHEN in_time IS NOT NULL AND (out_time IS NULL AND custom_out_time_copy IS NULL) THEN 1 ELSE 0 END) as missing_checkout,
                SUM(CASE WHEN in_time IS NULL THEN 1 ELSE 0 END) as missing_checkin,
                SUM(CASE WHEN docstatus = 1 THEN 1 ELSE 0 END) as submitted_records,
                SUM(CASE WHEN docstatus = 0 THEN 1 ELSE 0 END) as draft_records
            FROM `tabAttendance`
            WHERE attendance_date = %s
            AND docstatus != 2
        """, (date,), as_dict=True)[0]
        
        # Get all active employees count for comparison
        total_employees = frappe.db.count("Employee", {"status": "Active"})
        
        # Calculate employees on holiday for this date
        employees_on_holiday = 0
        all_employees = frappe.get_all("Employee", filters={"status": "Active"}, pluck="name")
        
        for emp in all_employees:
            if is_employee_on_holiday(emp, date):
                employees_on_holiday += 1
        
        working_employees = total_employees - employees_on_holiday
        attendance_rate = round((stats.total_records / working_employees * 100), 1) if working_employees > 0 else 0
        
        return {
            "date": date.strftime("%Y-%m-%d"),
            "total_employees": total_employees,
            "working_employees": working_employees,
            "employees_on_holiday": employees_on_holiday,
            "attendance_statistics": {
                "total_records": stats.total_records,
                "has_checkin": stats.has_checkin,
                "has_checkout": stats.has_checkout,
                "missing_checkout": stats.missing_checkout,
                "missing_checkin": stats.missing_checkin,
                "submitted_records": stats.submitted_records,
                "draft_records": stats.draft_records,
                "complete_records": stats.has_checkin - stats.missing_checkout
            },
            "attendance_rate": attendance_rate
        }
        
    except Exception as e:
        frappe.log_error(f"Get Attendance Statistics Error: {str(e)[:100]}")
        frappe.throw(_("Failed to get attendance statistics: {0}").format(str(e)))


@frappe.whitelist(allow_guest=False)
def bulk_update_attendance_times(attendance_updates):
    """
    Update multiple attendance records at once.
    attendance_updates should be a list of dictionaries with attendance_id, check_in_time, check_out_time
    """
    try:
        # Check admin permissions
        if not any(role in frappe.get_roles() for role in ["System Manager", "HR Manager", "HR User"]):
            frappe.throw(_("You do not have permission to perform this action."), frappe.PermissionError)
        
        if isinstance(attendance_updates, str):
            attendance_updates = frappe.parse_json(attendance_updates)
        
        successful_updates = []
        failed_updates = []
        
        for update_data in attendance_updates:
            try:
                attendance_id = update_data.get('attendance_id')
                check_in_time = update_data.get('check_in_time')
                check_out_time = update_data.get('check_out_time')
                
                result = update_attendance_times(attendance_id, check_in_time, check_out_time)
                successful_updates.append({
                    "attendance_id": attendance_id,
                    "status": "success"
                })
            except Exception as e:
                failed_updates.append({
                    "attendance_id": update_data.get('attendance_id'),
                    "error": str(e)
                })
        
        return {
            "status": "completed",
            "successful": len(successful_updates),
            "failed": len(failed_updates),
            "successful_updates": successful_updates,
            "failed_updates": failed_updates
        }
        
    except Exception as e:
        frappe.log_error(f"Bulk Update Attendance Times Error: {str(e)[:100]}")
        frappe.throw(_("Failed to process bulk update: {0}").format(str(e)))


@frappe.whitelist(allow_guest=False)
def delete_attendance_record(attendance_id, reason=None):
    """
    Delete/cancel an attendance record.
    Only allows cancellation, not permanent deletion for audit purposes.
    """
    try:
        # Check admin permissions
        if not any(role in frappe.get_roles() for role in ["System Manager", "HR Manager"]):
            frappe.throw(_("You do not have permission to perform this action."), frappe.PermissionError)
        
        # Validate attendance record exists
        if not frappe.db.exists("Attendance", attendance_id):
            frappe.throw(_("Attendance record not found."))
        
        attendance = frappe.get_doc("Attendance", attendance_id)
        
        # Cancel the record instead of deleting
        if attendance.docstatus == 1:
            attendance.cancel()
        else:
            # For draft records, we can delete them
            attendance.delete()
        
        # Log the deletion/cancellation
        frappe.log_error(
            f"Attendance record {'cancelled' if attendance.docstatus == 2 else 'deleted'} by {frappe.session.user}",
            f"Record: {attendance_id}, Employee: {attendance.employee}, Reason: {reason or 'Not provided'}"
        )
        
        return {
            "status": "success",
            "message": f"Attendance record {'cancelled' if attendance.docstatus == 2 else 'deleted'} successfully",
            "attendance_id": attendance_id
        }
        
    except Exception as e:
        frappe.log_error(f"Delete Attendance Record Error: {str(e)[:100]}")
        frappe.throw(_("Failed to delete attendance record: {0}").format(str(e)))

###########################################








###########################################
def get_employee_shifts(employee_id, start_date, end_date):
    """Get employee shift assignments for the date range."""
    shifts = {}
    
    # Get shift assignments
    shift_assignments = frappe.get_all(
        "Shift Assignment",
        filters={
            "employee": employee_id,
            "docstatus": 1,
            "status": "Active",
            "start_date": ["<=", end_date],
        },
        fields=["shift_type", "start_date", "end_date"],
        order_by="start_date desc"
    )
    
    # Get shift type details
    for assignment in shift_assignments:
        shift_details = frappe.get_doc("Shift Type", assignment.shift_type)
        
        # Determine date range for this assignment
        assign_start = max(getdate(assignment.start_date), start_date)
        assign_end = min(getdate(assignment.end_date) if assignment.end_date else end_date, end_date)
        
        current_date = assign_start
        while current_date <= assign_end:
            shifts[current_date] = {
                "shift_type": assignment.shift_type,
                "start_time": shift_details.start_time,
                "end_time": shift_details.end_time,
            }
            current_date = add_days(current_date, 1)
    
    return shifts

def calculate_working_hours(check_in, check_out, shift_info=None):
    """Calculate working hours between check-in and check-out."""
    if not check_in:
        return None
        
    # If check_out is not available, try to estimate from shift
    if not check_out and shift_info and shift_info.get('end_time'):
        # Use shift end time as estimated checkout (for incomplete records)
        return None
    
    if not check_out:
        return None
    
    try:
        # Handle different time formats
        if isinstance(check_in, str):
            if 'T' in check_in:
                check_in_time = frappe.utils.get_datetime(check_in)
            else:
                check_in_time = frappe.utils.get_datetime(check_in)
        else:
            check_in_time = check_in
            
        if isinstance(check_out, str):
            if 'T' in check_out:
                check_out_time = frappe.utils.get_datetime(check_out)
            else:
                check_out_time = frappe.utils.get_datetime(check_out)
        else:
            check_out_time = check_out
        
        # Calculate difference in hours
        time_diff = check_out_time - check_in_time
        hours = time_diff.total_seconds() / 3600
        
        # Return positive hours only
        return round(hours, 2) if hours > 0 else 0
        
    except Exception as e:
        frappe.log_error(f"Error calculating working hours: {str(e)}")
        return None

@frappe.whitelist(allow_guest=False)
def get_employee_attendance_history(employee_id, start_date=None, end_date=None):
    """Get attendance history for a specific employee with working hours and export data."""
    if not frappe.has_permission("Employee", "read") or not any(role in frappe.get_roles() for role in ["System Manager", "HR Manager", "HR User"]):
        frappe.throw(_("You do not have permission to access this resource."), frappe.PermissionError)

    if not frappe.db.exists("Employee", employee_id):
        frappe.throw(_("Employee {0} does not exist.").format(employee_id))

    # Build filters and date range
    filters = {"employee": employee_id, "docstatus": ["!=", 2]}
    
    if start_date and end_date:
        filters["attendance_date"] = ["between", [start_date, end_date]]
        date_range_start = getdate(start_date)
        date_range_end = getdate(end_date)
    elif start_date:
        filters["attendance_date"] = [">=", start_date]
        date_range_start = getdate(start_date)
        date_range_end = getdate()
    elif end_date:
        filters["attendance_date"] = ["<=", end_date]
        date_range_end = getdate(end_date)
        date_range_start = add_days(date_range_end, -30)
    else:
        date_range_end = getdate()
        date_range_start = add_days(date_range_end, -30)
        filters["attendance_date"] = ["between", [date_range_start, date_range_end]]

    # Get employee's shift assignments
    employee_shifts = get_employee_shifts(employee_id, date_range_start, date_range_end)
    
    # Fetch attendance records
    attendance_records = frappe.get_all(
        "Attendance",
        filters=filters,
        fields=[
            "name", "attendance_date", "status", "in_time", "out_time",
            "custom_out_time_copy", "employee", "employee_name"
        ],
        order_by="attendance_date desc",
        limit=200
    )

    # Process records with working hours calculation
    processed_records = []
    attendance_dates = set()
    total_working_hours = 0
    
    for record in attendance_records:
        checkout_time = record.get('out_time') or record.get('custom_out_time_copy')
        working_hours = calculate_working_hours(record.in_time, checkout_time, employee_shifts.get(record.attendance_date))
        
        processed_record = {
            "name": record.name,
            "attendance_date": record.attendance_date,
            "status": record.status,
            "in_time": record.in_time,
            "out_time": checkout_time,
            "custom_out_time_copy": checkout_time,
            "employee": record.employee,
            "employee_name": record.employee_name,
            "late_arrival": "Yes" if record.in_time and is_late_arrival(record.in_time) else "No",
            "working_hours": working_hours,
            "shift_start": employee_shifts.get(record.attendance_date, {}).get('start_time'),
            "shift_end": employee_shifts.get(record.attendance_date, {}).get('end_time'),
        }
        processed_records.append(processed_record)
        attendance_dates.add(record.attendance_date)
        
        if working_hours:
            total_working_hours += working_hours

    # Calculate summary statistics
    total_working_days = 0
    absent_days = 0
    holiday_dates = set()
    
    holiday_list = get_holiday_list_for_employee(employee_id, raise_exception=False)
    if holiday_list:
        holidays = frappe.get_all(
            "Holiday",
            filters={
                "parent": holiday_list,
                "holiday_date": ["between", [date_range_start, date_range_end]]
            },
            pluck="holiday_date"
        )
        holiday_dates = set(holidays)

    current_date = date_range_start
    while current_date <= date_range_end:
        if current_date not in holiday_dates:
            total_working_days += 1
            if current_date not in attendance_dates:
                absent_days += 1
        current_date = add_days(current_date, 1)

    # Calculate statistics
    present_count = len([r for r in processed_records if r["status"] == "Present"])
    wfh_count = len([r for r in processed_records if r["status"] == "Work From Home"])
    late_count = len([r for r in processed_records if r["late_arrival"] == "Yes"])

    summary_stats = {
        "total_records": len(processed_records),
        "total_working_days": total_working_days,
        "present_days": present_count,
        "wfh_days": wfh_count,
        "absent_days": absent_days,
        "holiday_days": len(holiday_dates),
        "late_arrivals": late_count,
        "total_working_hours": round(total_working_hours, 2),
        "avg_working_hours": round(total_working_hours / len(processed_records), 2) if processed_records else 0,
        "attendance_percentage": round((len(processed_records) / total_working_days * 100), 1) if total_working_days > 0 else 0
    }

    return {
        "attendance_records": processed_records,
        "summary_stats": summary_stats,
        "date_range": {
            "start_date": date_range_start.strftime("%Y-%m-%d"),
            "end_date": date_range_end.strftime("%Y-%m-%d")
        }
    }


# ============================================================================
# ATTENDANCE ANALYTICS REPORT APIs - For App Export Reports
# Functions: get_all_employees_attendance_summary, export_attendance_report,
#            generate_all_employees_pdf_report, generate_all_employees_excel_report
# WFH Deduction: Calculated only if salary structure has WFH component
# Formula: (total_earnings / total_days_in_month) * wfh_days * 0.3
# ============================================================================

@frappe.whitelist(allow_guest=False)
def get_all_employees_attendance_summary(start_date=None, end_date=None, department=None, wfh_deduction_per_day=0):
    """Get attendance summary for all employees with export data including salary calculations."""
    if not any(role in frappe.get_roles() for role in ["System Manager", "HR Manager", "HR User"]):
        frappe.throw(_("You do not have permission to access this resource."), frappe.PermissionError)

    # Set date range
    if not start_date:
        start_date = add_days(getdate(), -30)
    if not end_date:
        end_date = getdate()
    
    start_date = getdate(start_date)
    end_date = getdate(end_date)

    # Get employees with CTC
    employee_filters = {"status": "Active"}
    if department:
        employee_filters["department"] = department
    
    employees = frappe.get_all(
        "Employee",
        filters=employee_filters,
        fields=["name", "employee_name", "department", "designation", "ctc"],
        limit=500
    )

    # Calculate total working days for the date range (excluding holidays)
    total_days_in_range = (end_date - start_date).days + 1
    
    # Get holiday dates that would affect any employee
    all_holiday_dates = set()
    for emp in employees:
        holiday_list = get_holiday_list_for_employee(emp.name, raise_exception=False)
        if holiday_list:
            holidays = frappe.get_all(
                "Holiday",
                filters={
                    "parent": holiday_list,
                    "holiday_date": ["between", [start_date, end_date]]
                },
                pluck="holiday_date"
            )
            all_holiday_dates.update(holidays)
    
    # Calculate working days (this is an approximation - in reality each employee might have different holidays)
    total_working_days = total_days_in_range - len(all_holiday_dates)

    all_employees_data = []
    overall_stats = {
        "total_employees": len(employees),
        "total_present_days": 0,
        "total_wfh_days": 0,
        "total_absent_days": 0,
        "total_working_hours": 0,
        "avg_attendance_percentage": 0,
        "total_working_days": total_working_days,
        "date_range_days": total_days_in_range
    }

    for emp in employees:
        try:
            # Get attendance data for this employee
            emp_data = get_employee_attendance_history(emp.name, start_date.strftime("%Y-%m-%d"), end_date.strftime("%Y-%m-%d"))
            
            # Calculate individual employee working days (more accurate per employee)
            employee_holiday_list = get_holiday_list_for_employee(emp.name, raise_exception=False)
            emp_holiday_dates = set()
            if employee_holiday_list:
                emp_holidays = frappe.get_all(
                    "Holiday",
                    filters={
                        "parent": employee_holiday_list,
                        "holiday_date": ["between", [start_date, end_date]]
                    },
                    pluck="holiday_date"
                )
                emp_holiday_dates.update(emp_holidays)
            
            emp_working_days = total_days_in_range - len(emp_holiday_dates)
            
            # If no holidays found, calculate weekends manually
            if not emp_holiday_dates:
                current = start_date
                while current <= end_date:
                    if current.weekday() in [5, 6]:  # Saturday, Sunday
                        emp_holiday_dates.add(current)
                    current = current + timedelta(days=1)
                emp_working_days = total_days_in_range - len(emp_holiday_dates)
            
            # Get approved leaves for the period
            leave_applications = frappe.get_all(
                "Leave Application",
                filters={
                    "employee": emp.name,
                    "from_date": ["<=", end_date],
                    "to_date": [">=", start_date],
                    "docstatus": 1,
                    "status": "Approved"
                },
                fields=["from_date", "to_date", "total_leave_days", "half_day"]
            )
            
            # Calculate total leave days
            total_leave_days = 0
            for leave in leave_applications:
                leave_start = max(getdate(leave.from_date), start_date)
                leave_end = min(getdate(leave.to_date), end_date)
                leave_overlap_days = 0
                current = leave_start
                while current <= leave_end:
                    if current not in emp_holiday_dates:
                        leave_overlap_days += 1
                    current = current + timedelta(days=1)
                if leave.half_day:
                    total_leave_days += 0.5
                else:
                    total_leave_days += leave_overlap_days
            
            # Calculate salary info from Salary Structure
            total_earnings = 0
            total_deductions = 0
            wfh_deduction_applicable = False
            
            # Get active salary structure assignment
            ssa = frappe.get_all(
                "Salary Structure Assignment",
                filters={
                    "employee": emp.name,
                    "docstatus": 1,
                    "from_date": ["<=", end_date]
                },
                fields=["salary_structure", "base"],
                order_by="from_date desc",
                limit=1
            )
            
            if ssa:
                try:
                    salary_structure = frappe.get_doc("Salary Structure", ssa[0].salary_structure)
                    for earning in salary_structure.earnings:
                        if earning.amount and earning.amount > 0:
                            total_earnings += earning.amount
                    for deduction in salary_structure.deductions:
                        component_name = (deduction.salary_component or "").lower()
                        # Check if this is a WFH deduction component
                        if "wfh" in component_name or "work from home" in component_name:
                            wfh_deduction_applicable = True
                        elif deduction.amount and deduction.amount > 0:
                            total_deductions += deduction.amount
                except:
                    pass
            
            # Fallback to CTC if no salary structure
            if total_earnings == 0 and emp.ctc:
                total_earnings = emp.ctc / 12
            
            wfh_days = emp_data["data"]["summary_stats"].get("wfh_days", 0) if "data" in emp_data else emp_data["summary_stats"].get("wfh_days", 0)
            
            # Calculate WFH deduction ONLY if applicable (salary structure has WFH deduction component)
            # Use total_days_in_range (total calendar days in month) for calculation, not working days
            wfh_deduction = 0
            if wfh_deduction_applicable and wfh_days > 0:
                # Formula: (total_earnings / total_days_in_month) * wfh_days * 0.3
                per_day_salary = total_earnings / total_days_in_range if total_days_in_range > 0 else 0
                wfh_deduction = per_day_salary * wfh_days * 0.3
            elif wfh_deduction_per_day > 0 and wfh_days > 0:
                # Manual override if wfh_deduction_per_day is provided
                wfh_deduction = wfh_days * wfh_deduction_per_day
            
            net_salary = total_earnings - total_deductions
            salary_to_pay = max(0, net_salary - wfh_deduction)
            
            summary_stats = emp_data["data"]["summary_stats"] if "data" in emp_data else emp_data["summary_stats"]
            
            emp_summary = {
                "employee_id": emp.name,
                "employee_name": emp.employee_name,
                "department": emp.department or "Not Assigned",
                "designation": emp.designation or "Not Assigned",
                "total_working_days": emp_working_days,
                "present_days": summary_stats.get("present_days", 0),
                "wfh_days": summary_stats.get("wfh_days", 0),
                "leaves": round(total_leave_days, 1),
                "absent_days": summary_stats.get("absent_days", 0),
                "late_arrivals": summary_stats.get("late_arrivals", 0),
                "total_working_hours": summary_stats.get("total_working_hours", 0),
                "attendance_percentage": summary_stats.get("attendance_percentage", 0),
                "total_earnings": round(total_earnings, 2),
                "total_deductions": round(total_deductions, 2),
                "net_salary": round(net_salary, 2),
                "wfh_deduction": round(wfh_deduction, 2),
                "wfh_applicable": "Yes" if wfh_deduction_applicable else "No",
                "salary_to_pay": round(salary_to_pay, 2)
            }
            
            all_employees_data.append(emp_summary)
            
            # Add to overall stats
            overall_stats["total_present_days"] += emp_data["summary_stats"].get("present_days", 0)
            overall_stats["total_wfh_days"] += emp_data["summary_stats"].get("wfh_days", 0)
            overall_stats["total_absent_days"] += emp_data["summary_stats"].get("absent_days", 0)
            overall_stats["total_working_hours"] += emp_data["summary_stats"].get("total_working_hours", 0)
            
        except Exception as e:
            frappe.log_error(f"Error getting data for employee {emp.name}: {str(e)}")
            # Add employee with default values if data fetch fails
            all_employees_data.append({
                "employee_id": emp.name,
                "employee_name": emp.employee_name,
                "department": emp.department or "Not Assigned",
                "designation": emp.designation or "Not Assigned",
                "total_working_days": total_working_days,
                "present_days": 0,
                "wfh_days": 0,
                "leaves": 0,
                "absent_days": 0,
                "late_arrivals": 0,
                "total_working_hours": 0,
                "attendance_percentage": 0,
                "total_earnings": 0,
                "total_deductions": 0,
                "net_salary": 0,
                "wfh_deduction": 0,
                "wfh_applicable": "N/A",
                "salary_to_pay": 0
            })
            continue

    # Calculate average attendance percentage
    if all_employees_data:
        total_percentage = sum([emp.get("attendance_percentage", 0) for emp in all_employees_data])
        overall_stats["avg_attendance_percentage"] = round(total_percentage / len(all_employees_data), 1)

    return {
        "employees_data": all_employees_data,
        "overall_stats": overall_stats,
        "date_range": {
            "start_date": start_date.strftime("%Y-%m-%d"),
            "end_date": end_date.strftime("%Y-%m-%d"),
            "total_days": total_days_in_range,
            "working_days": total_working_days
        }
    }


############################################### 
@frappe.whitelist(allow_guest=False)
def export_attendance_report(employee_id=None, start_date=None, end_date=None, export_format="pdf", department=None, wfh_deduction_per_day=0):
    """Export attendance report in PDF or Excel format with proper file handling."""
    if not any(role in frappe.get_roles() for role in ["System Manager", "HR Manager", "HR User"]):
        frappe.throw(_("You do not have permission to access this resource."), frappe.PermissionError)

    try:
        # Validate inputs
        if not start_date or not end_date:
            frappe.throw(_("Start date and end date are required"))
        
        start_date = getdate(start_date)
        end_date = getdate(end_date)
        
        if start_date > end_date:
            frappe.throw(_("Start date cannot be after end date"))
        
        # Check date range (max 1 year)
        if (end_date - start_date).days > 365:
            frappe.throw(_("Date range cannot exceed 365 days"))
        
        # Convert wfh_deduction_per_day to float
        wfh_deduction_per_day = float(wfh_deduction_per_day or 0)

        if employee_id:
            # Individual employee report
            data = get_employee_attendance_history(employee_id, start_date.strftime("%Y-%m-%d"), end_date.strftime("%Y-%m-%d"))
            if export_format.lower() == "pdf":
                return generate_individual_pdf_report(data, employee_id)
            else:
                return generate_individual_excel_report(data, employee_id)
        else:
            # All employees report
            data = get_all_employees_attendance_summary(start_date.strftime("%Y-%m-%d"), end_date.strftime("%Y-%m-%d"), department, wfh_deduction_per_day)
            if export_format.lower() == "pdf":
                return generate_all_employees_pdf_report(data)
            else:
                return generate_all_employees_excel_report(data)
                
    except Exception as e:
        frappe.log_error(f"Export error: {str(e)}")
        frappe.throw(_("Export failed: {0}").format(str(e)))

def generate_individual_pdf_report(data, employee_id):
    """Generate PDF report for individual employee with proper base64 encoding."""
    try:
        from frappe.utils.pdf import get_pdf
        import base64
        
        # Get employee details
        employee = frappe.get_doc("Employee", employee_id)
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body {{ font-family: Arial, sans-serif; padding: 20px; }}
                .header {{ text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }}
                .title {{ color: #333; font-size: 24px; margin-bottom: 10px; }}
                .subtitle {{ color: #666; font-size: 18px; margin-bottom: 5px; }}
                .date-range {{ color: #888; font-size: 14px; }}
                .summary-section {{ margin-bottom: 30px; }}
                .section-title {{ color: #333; font-size: 18px; margin-bottom: 15px; border-bottom: 1px solid #ddd; padding-bottom: 5px; }}
                table {{ width: 100%; border-collapse: collapse; margin-bottom: 20px; }}
                th, td {{ border: 1px solid #ddd; padding: 8px; text-align: left; }}
                th {{ background-color: #f2f2f2; font-weight: bold; }}
                .stats-table {{ width: 100%; }}
                .stats-table td {{ width: 25%; }}
                .highlight {{ background-color: #f0f8ff; }}
                .text-center {{ text-align: center; }}
                .text-right {{ text-align: right; }}
                .small-text {{ font-size: 12px; color: #666; }}
            </style>
        </head>
        <body>
            <div class="header">
                <div class="title">Attendance Report</div>
                <div class="subtitle">{employee.employee_name}</div>
                <div class="date-range">Period: {data['date_range']['start_date']} to {data['date_range']['end_date']}</div>
                <div class="small-text">Generated on {frappe.utils.now_datetime().strftime('%Y-%m-%d %H:%M:%S')}</div>
            </div>
            
            <div class="summary-section">
                <div class="section-title">Summary Statistics</div>
                <table class="stats-table">
                    <tr>
                        <td><strong>Total Working Days</strong></td>
                        <td>{data['summary_stats']['total_working_days']}</td>
                        <td><strong>Present Days</strong></td>
                        <td>{data['summary_stats']['present_days']}</td>
                    </tr>
                    <tr>
                        <td><strong>WFH Days</strong></td>
                        <td>{data['summary_stats']['wfh_days']}</td>
                        <td><strong>Absent Days</strong></td>
                        <td>{data['summary_stats']['absent_days']}</td>
                    </tr>
                    <tr>
                        <td><strong>Late Arrivals</strong></td>
                        <td>{data['summary_stats']['late_arrivals']}</td>
                        <td><strong>Attendance %</strong></td>
                        <td class="highlight"><strong>{data['summary_stats']['attendance_percentage']}%</strong></td>
                    </tr>
                    <tr>
                        <td><strong>Total Working Hours</strong></td>
                        <td>{data['summary_stats']['total_working_hours']}</td>
                        <td><strong>Avg Hours/Day</strong></td>
                        <td>{data['summary_stats']['avg_working_hours']}</td>
                    </tr>
                </table>
            </div>
            
            <div>
                <div class="section-title">Detailed Attendance Records</div>
                <table>
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Status</th>
                            <th>Check In</th>
                            <th>Check Out</th>
                            <th>Working Hours</th>
                            <th>Late Arrival</th>
                        </tr>
                    </thead>
                    <tbody>
        """
        
        for record in data['attendance_records']:
            check_in = record.get('in_time', 'N/A')
            check_out = record.get('out_time') or record.get('custom_out_time_copy') or 'N/A'
            working_hours = record.get('working_hours', 'N/A')
            late_arrival = record.get('late_arrival', 'No')
            
            html_content += f"""
                        <tr>
                            <td>{record['attendance_date']}</td>
                            <td>{record['status']}</td>
                            <td>{check_in}</td>
                            <td>{check_out}</td>
                            <td class="text-center">{working_hours}</td>
                            <td class="text-center">{late_arrival}</td>
                        </tr>
            """
        
        html_content += """
                    </tbody>
                </table>
            </div>
            <div class="small-text text-center" style="margin-top: 30px; border-top: 1px solid #ddd; padding-top: 10px;">
                This report was generated automatically by the HRMS system.
            </div>
        </body>
        </html>
        """
        
        # Generate PDF
        pdf_content = get_pdf(html_content, {"page-size": "A4", "orientation": "Portrait"})
        
        # Encode to base64
        base64_content = base64.b64encode(pdf_content).decode('utf-8')
        
        # Generate filename
        file_name = f"attendance_report_{employee_id}_{data['date_range']['start_date']}_{data['date_range']['end_date']}.pdf"
        
        return {
            "status": "success",
            "file_name": file_name,
            "content": f"data:application/pdf;base64,{base64_content}",
            "content_type": "application/pdf"
        }
        
    except Exception as e:
        frappe.log_error(f"PDF generation error: {str(e)}")
        return {"status": "error", "message": str(e)}


def generate_individual_excel_report(data, employee_id):
    """Generate Excel report for individual employee with proper base64 encoding."""
    try:
        import io
        import xlsxwriter
        import base64
        
        output = io.BytesIO()
        workbook = xlsxwriter.Workbook(output, {'in_memory': True})
        
        # Create worksheet
        worksheet = workbook.add_worksheet('Attendance Report')
        
        # Define formats
        header_format = workbook.add_format({
            'bold': True, 
            'bg_color': '#4472C4', 
            'font_color': 'white',
            'align': 'center',
            'valign': 'vcenter'
        })
        title_format = workbook.add_format({'bold': True, 'font_size': 16, 'align': 'center'})
        stats_header_format = workbook.add_format({'bold': True, 'bg_color': '#D9E1F2'})
        
        # Write title
        employee = frappe.get_doc("Employee", employee_id)
        worksheet.merge_range('A1:F1', f"Attendance Report - {employee.employee_name}", title_format)
        worksheet.write(1, 0, f"Period: {data['date_range']['start_date']} to {data['date_range']['end_date']}")
        worksheet.write(2, 0, f"Generated on: {frappe.utils.now_datetime().strftime('%Y-%m-%d %H:%M:%S')}")
        
        # Write summary statistics
        row = 4
        worksheet.write(row, 0, "Summary Statistics", title_format)
        row += 1
        
        summary_data = [
            ["Metric", "Value"],
            ["Total Working Days", data['summary_stats']['total_working_days']],
            ["Present Days", data['summary_stats']['present_days']],
            ["WFH Days", data['summary_stats']['wfh_days']],
            ["Absent Days", data['summary_stats']['absent_days']],
            ["Late Arrivals", data['summary_stats']['late_arrivals']],
            ["Attendance Percentage", f"{data['summary_stats']['attendance_percentage']}%"],
            ["Total Working Hours", data['summary_stats']['total_working_hours']],
            ["Average Hours/Day", data['summary_stats']['avg_working_hours']],
        ]
        
        for i, stat in enumerate(summary_data):
            if i == 0:  # Header row
                worksheet.write(row, 0, stat[0], stats_header_format)
                worksheet.write(row, 1, stat[1], stats_header_format)
            else:
                worksheet.write(row, 0, stat[0])
                worksheet.write(row, 1, stat[1])
            row += 1
        
        # Write detailed records
        row += 2
        worksheet.write(row, 0, "Detailed Attendance Records", title_format)
        row += 1
        
        headers = ["Date", "Status", "Check In", "Check Out", "Working Hours", "Late Arrival"]
        for col, header in enumerate(headers):
            worksheet.write(row, col, header, header_format)
        row += 1
        
        for record in data['attendance_records']:
            check_in = record.get('in_time', 'N/A')
            check_out = record.get('out_time') or record.get('custom_out_time_copy') or 'N/A'
            working_hours = record.get('working_hours', 'N/A')
            late_arrival = record.get('late_arrival', 'No')
            
            worksheet.write(row, 0, str(record['attendance_date']))
            worksheet.write(row, 1, record['status'])
            worksheet.write(row, 2, str(check_in))
            worksheet.write(row, 3, str(check_out))
            worksheet.write(row, 4, working_hours if working_hours != 'N/A' else 'N/A')
            worksheet.write(row, 5, late_arrival)
            row += 1
        
        # Auto-adjust column widths
        worksheet.set_column('A:A', 12)  # Date
        worksheet.set_column('B:B', 15)  # Status
        worksheet.set_column('C:C', 15)  # Check In
        worksheet.set_column('D:D', 15)  # Check Out
        worksheet.set_column('E:E', 12)  # Working Hours
        worksheet.set_column('F:F', 12)  # Late Arrival
        
        workbook.close()
        output.seek(0)
        
        # Encode to base64
        base64_content = base64.b64encode(output.getvalue()).decode('utf-8')
        
        file_name = f"attendance_report_{employee_id}_{data['date_range']['start_date']}_{data['date_range']['end_date']}.xlsx"
        
        return {
            "status": "success",
            "file_name": file_name,
            "content": f"data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,{base64_content}",
            "content_type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        }
        
    except Exception as e:
        frappe.log_error(f"Excel generation error: {str(e)}")
        return {"status": "error", "message": str(e)}

def generate_all_employees_pdf_report(data):
    """Generate PDF report with sorting by employee ID, WFH row colors, and professional styling."""
    try:
        from frappe.utils.pdf import get_pdf
        import base64
        
        # Sort employees by employee_id
        sorted_employees = sorted(data['employees_data'], key=lambda x: x.get('employee_id', ''))
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body {{ font-family: 'Segoe UI', Arial, sans-serif; padding: 15px; font-size: 9px; background: #fff; }}
                .header {{ text-align: center; margin-bottom: 20px; padding: 15px; background: linear-gradient(135deg, #1F4E79 0%, #2E75B6 100%); color: white; border-radius: 8px; }}
                .title {{ font-size: 20px; font-weight: bold; margin-bottom: 8px; letter-spacing: 1px; }}
                .subtitle {{ font-size: 11px; opacity: 0.9; margin-bottom: 3px; }}
                .legend {{ margin: 10px 0; padding: 8px; background: #f8f9fa; border-radius: 5px; font-size: 9px; }}
                .legend-item {{ display: inline-block; margin-right: 20px; }}
                .legend-color {{ display: inline-block; width: 15px; height: 15px; vertical-align: middle; margin-right: 5px; border: 1px solid #ddd; }}
                .wfh-color {{ background-color: #FFF2CC; }}
                table {{ width: 100%; border-collapse: collapse; margin-top: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }}
                th {{ background: linear-gradient(135deg, #1F4E79 0%, #2E75B6 100%); color: white; padding: 10px 4px; text-align: center; font-size: 8px; font-weight: 600; border: 1px solid #1F4E79; }}
                td {{ padding: 7px 4px; border: 1px solid #e0e0e0; font-size: 8px; }}
                tr:nth-child(even) {{ background-color: #f8f9fa; }}
                tr:nth-child(odd) {{ background-color: #ffffff; }}
                tr.wfh-row {{ background-color: #FFF2CC !important; }}
                tr:hover {{ background-color: #e3f2fd !important; }}
                .text-center {{ text-align: center; }}
                .text-right {{ text-align: right; }}
                .text-left {{ text-align: left; }}
                .footer {{ margin-top: 15px; text-align: center; font-size: 8px; color: #666; padding: 10px; border-top: 1px solid #ddd; }}
            </style>
        </head>
        <body>
            <div class="header">
                <div class="title">📊 All Employees Attendance Summary</div>
                <div class="subtitle">📅 Period: {data['date_range']['start_date']} to {data['date_range']['end_date']}</div>
                <div class="subtitle">📆 Total Days: {data['date_range'].get('total_days', 'N/A')} | Working Days: {data['date_range'].get('working_days', 'N/A')}</div>
                <div class="subtitle">🕐 Generated on: {frappe.utils.now_datetime().strftime('%Y-%m-%d %H:%M:%S')}</div>
            </div>
            
            <div class="legend">
                <span class="legend-item"><span class="legend-color wfh-color"></span> 🏠 Employees with WFH Days</span>
                <span class="legend-item">📋 Total Employees: {len(sorted_employees)}</span>
            </div>
            
            <table>
                <thead>
                    <tr>
                        <th>S.No</th>
                        <th>Employee ID</th>
                        <th>Employee Name</th>
                        <th>Department</th>
                        <th>Designation</th>
                        <th>Working<br>Days</th>
                        <th>Present<br>Days</th>
                        <th>WFH<br>Days</th>
                        <th>Leaves</th>
                        <th>Absent<br>Days</th>
                        <th>Late</th>
                        <th>Total<br>Hours</th>
                        <th>Attend<br>%</th>
                        <th>Total<br>Earnings</th>
                        <th>Total<br>Deduct</th>
                        <th>Net<br>Salary</th>
                        <th>WFH<br>Deduct</th>
                        <th>Salary<br>to Pay</th>
                    </tr>
                </thead>
                <tbody>
        """
        
        for idx, emp in enumerate(sorted_employees, 1):
            has_wfh = emp.get('wfh_days', 0) > 0
            row_class = 'wfh-row' if has_wfh else ''
            html_content += f"""
                    <tr class="{row_class}">
                        <td class="text-center">{idx}</td>
                        <td class="text-left">{emp.get('employee_id', '')}</td>
                        <td class="text-left">{emp['employee_name']}</td>
                        <td class="text-left">{emp['department']}</td>
                        <td class="text-left">{emp['designation']}</td>
                        <td class="text-center">{emp.get('total_working_days', 0)}</td>
                        <td class="text-center">{emp.get('present_days', 0)}</td>
                        <td class="text-center">{emp.get('wfh_days', 0)}</td>
                        <td class="text-center">{emp.get('leaves', 0)}</td>
                        <td class="text-center">{emp.get('absent_days', 0)}</td>
                        <td class="text-center">{emp.get('late_arrivals', 0)}</td>
                        <td class="text-center">{emp.get('total_working_hours', 0)}</td>
                        <td class="text-center">{emp.get('attendance_percentage', 0)}%</td>
                        <td class="text-right">₹{emp.get('total_earnings', 0):,.0f}</td>
                        <td class="text-right">₹{emp.get('total_deductions', 0):,.0f}</td>
                        <td class="text-right">₹{emp.get('net_salary', 0):,.0f}</td>
                        <td class="text-right">₹{emp.get('wfh_deduction', 0):,.0f}</td>
                        <td class="text-right">₹{emp.get('salary_to_pay', 0):,.0f}</td>
                    </tr>
            """
        
        html_content += """
                </tbody>
            </table>
            <div class="footer">
                <p>This is a system-generated report. For any queries, please contact HR Department.</p>
            </div>
        </body>
        </html>
        """
        
        # Generate PDF
        pdf_content = get_pdf(html_content, {"page-size": "A4", "orientation": "Landscape"})
        
        # Encode to base64
        base64_content = base64.b64encode(pdf_content).decode('utf-8')
        
        file_name = f"all_employees_attendance_{data['date_range']['start_date']}_{data['date_range']['end_date']}.pdf"
        
        return {
            "status": "success",
            "file_name": file_name,
            "content": f"data:application/pdf;base64,{base64_content}",
            "content_type": "application/pdf"
        }
        
    except Exception as e:
        frappe.log_error(f"PDF generation error: {str(e)}")
        return {"status": "error", "message": str(e)}

def generate_all_employees_excel_report(data):
    """Generate Excel report with sorting by employee ID, WFH row colors, and professional styling."""
    try:
        import io
        import xlsxwriter
        import base64
        
        output = io.BytesIO()
        workbook = xlsxwriter.Workbook(output, {'in_memory': True})
        worksheet = workbook.add_worksheet('Attendance Summary')
        
        # Sort employees by employee_id
        sorted_employees = sorted(data['employees_data'], key=lambda x: x.get('employee_id', ''))
        
        # Define formats - Professional styling
        title_format = workbook.add_format({
            'bold': True,
            'font_size': 18,
            'align': 'center',
            'valign': 'vcenter',
            'font_color': '#1F4E79',
            'font_name': 'Calibri'
        })
        
        subtitle_format = workbook.add_format({
            'font_size': 11,
            'align': 'left',
            'font_color': '#404040',
            'italic': True
        })
        
        header_format = workbook.add_format({
            'bold': True,
            'font_size': 10,
            'bg_color': '#1F4E79',
            'font_color': 'white',
            'align': 'center',
            'valign': 'vcenter',
            'border': 1,
            'border_color': '#1F4E79',
            'text_wrap': True
        })
        
        # Normal row formats (alternating colors)
        data_format_odd = workbook.add_format({
            'font_size': 10,
            'align': 'left',
            'valign': 'vcenter',
            'border': 1,
            'border_color': '#D9D9D9',
            'bg_color': '#FFFFFF'
        })
        
        data_format_even = workbook.add_format({
            'font_size': 10,
            'align': 'left',
            'valign': 'vcenter',
            'border': 1,
            'border_color': '#D9D9D9',
            'bg_color': '#F2F2F2'
        })
        
        number_format_odd = workbook.add_format({
            'font_size': 10,
            'align': 'center',
            'valign': 'vcenter',
            'border': 1,
            'border_color': '#D9D9D9',
            'bg_color': '#FFFFFF'
        })
        
        number_format_even = workbook.add_format({
            'font_size': 10,
            'align': 'center',
            'valign': 'vcenter',
            'border': 1,
            'border_color': '#D9D9D9',
            'bg_color': '#F2F2F2'
        })
        
        currency_format_odd = workbook.add_format({
            'font_size': 10,
            'align': 'right',
            'valign': 'vcenter',
            'border': 1,
            'border_color': '#D9D9D9',
            'num_format': '₹#,##0',
            'bg_color': '#FFFFFF'
        })
        
        currency_format_even = workbook.add_format({
            'font_size': 10,
            'align': 'right',
            'valign': 'vcenter',
            'border': 1,
            'border_color': '#D9D9D9',
            'num_format': '₹#,##0',
            'bg_color': '#F2F2F2'
        })
        
        percent_format_odd = workbook.add_format({
            'font_size': 10,
            'align': 'center',
            'valign': 'vcenter',
            'border': 1,
            'border_color': '#D9D9D9',
            'num_format': '0.0%',
            'bg_color': '#FFFFFF'
        })
        
        percent_format_even = workbook.add_format({
            'font_size': 10,
            'align': 'center',
            'valign': 'vcenter',
            'border': 1,
            'border_color': '#D9D9D9',
            'num_format': '0.0%',
            'bg_color': '#F2F2F2'
        })
        
        # WFH row formats (light orange/peach background)
        wfh_data_format = workbook.add_format({
            'font_size': 10,
            'align': 'left',
            'valign': 'vcenter',
            'border': 1,
            'border_color': '#D9D9D9',
            'bg_color': '#FFF2CC'
        })
        
        wfh_number_format = workbook.add_format({
            'font_size': 10,
            'align': 'center',
            'valign': 'vcenter',
            'border': 1,
            'border_color': '#D9D9D9',
            'bg_color': '#FFF2CC'
        })
        
        wfh_currency_format = workbook.add_format({
            'font_size': 10,
            'align': 'right',
            'valign': 'vcenter',
            'border': 1,
            'border_color': '#D9D9D9',
            'num_format': '₹#,##0',
            'bg_color': '#FFF2CC'
        })
        
        wfh_percent_format = workbook.add_format({
            'font_size': 10,
            'align': 'center',
            'valign': 'vcenter',
            'border': 1,
            'border_color': '#D9D9D9',
            'num_format': '0.0%',
            'bg_color': '#FFF2CC'
        })
        
        # Write title
        worksheet.merge_range('A1:R1', '📊 All Employees Attendance Summary', title_format)
        
        # Write period info
        worksheet.write(2, 0, f"📅 Period: {data['date_range']['start_date']} to {data['date_range']['end_date']}", subtitle_format)
        worksheet.write(3, 0, f"📆 Total Days: {data['date_range'].get('total_days', 'N/A')} | Working Days: {data['date_range'].get('working_days', 'N/A')}", subtitle_format)
        worksheet.write(4, 0, f"🕐 Generated on: {frappe.utils.now_datetime().strftime('%Y-%m-%d %H:%M:%S')}", subtitle_format)
        
        # Legend for WFH
        legend_format = workbook.add_format({'font_size': 9, 'bg_color': '#FFF2CC', 'border': 1, 'align': 'center'})
        worksheet.write(2, 14, '🏠 WFH Row', legend_format)
        
        # Headers - Row 6 (index 5)
        headers = [
            "S.No", "Employee ID", "Employee Name", "Department", "Designation", "Working\nDays",
            "Present\nDays", "WFH\nDays", "Leaves", "Absent\nDays",
            "Late", "Total\nHours", "Attendance\n%",
            "Total\nEarnings", "Total\nDeductions", "Net\nSalary", "WFH\nDeduction", "Salary\nto Pay"
        ]
        
        row = 6
        for col, header in enumerate(headers):
            worksheet.write(row, col, header, header_format)
        
        # Set row height for header
        worksheet.set_row(row, 30)
        
        # Data rows
        row = 7
        for idx, emp in enumerate(sorted_employees, 1):
            has_wfh = emp.get('wfh_days', 0) > 0
            is_even = idx % 2 == 0
            
            # Select format based on WFH status
            if has_wfh:
                d_fmt = wfh_data_format
                n_fmt = wfh_number_format
                c_fmt = wfh_currency_format
                p_fmt = wfh_percent_format
            elif is_even:
                d_fmt = data_format_even
                n_fmt = number_format_even
                c_fmt = currency_format_even
                p_fmt = percent_format_even
            else:
                d_fmt = data_format_odd
                n_fmt = number_format_odd
                c_fmt = currency_format_odd
                p_fmt = percent_format_odd
            
            worksheet.write(row, 0, idx, n_fmt)
            worksheet.write(row, 1, emp.get('employee_id', ''), d_fmt)
            worksheet.write(row, 2, emp['employee_name'], d_fmt)
            worksheet.write(row, 3, emp['department'], d_fmt)
            worksheet.write(row, 4, emp['designation'], d_fmt)
            worksheet.write(row, 5, emp.get('total_working_days', 0), n_fmt)
            worksheet.write(row, 6, emp.get('present_days', 0), n_fmt)
            worksheet.write(row, 7, emp.get('wfh_days', 0), n_fmt)
            worksheet.write(row, 8, emp.get('leaves', 0), n_fmt)
            worksheet.write(row, 9, emp.get('absent_days', 0), n_fmt)
            worksheet.write(row, 10, emp.get('late_arrivals', 0), n_fmt)
            worksheet.write(row, 11, emp.get('total_working_hours', 0), n_fmt)
            worksheet.write(row, 12, emp.get('attendance_percentage', 0) / 100, p_fmt)
            worksheet.write(row, 13, emp.get('total_earnings', 0), c_fmt)
            worksheet.write(row, 14, emp.get('total_deductions', 0), c_fmt)
            worksheet.write(row, 15, emp.get('net_salary', 0), c_fmt)
            worksheet.write(row, 16, emp.get('wfh_deduction', 0), c_fmt)
            worksheet.write(row, 17, emp.get('salary_to_pay', 0), c_fmt)
            row += 1
        
        # Set column widths
        worksheet.set_column('A:A', 5)   # S.No
        worksheet.set_column('B:B', 14)  # Employee ID
        worksheet.set_column('C:C', 22)  # Employee Name
        worksheet.set_column('D:D', 15)  # Department
        worksheet.set_column('E:E', 25)  # Designation
        worksheet.set_column('F:F', 10)  # Working Days
        worksheet.set_column('G:G', 10)  # Present Days
        worksheet.set_column('H:H', 8)   # WFH Days
        worksheet.set_column('I:I', 8)   # Leaves
        worksheet.set_column('J:J', 9)   # Absent Days
        worksheet.set_column('K:K', 6)   # Late
        worksheet.set_column('L:L', 9)   # Total Hours
        worksheet.set_column('M:M', 10)  # Attendance %
        worksheet.set_column('N:N', 12)  # Total Earnings
        worksheet.set_column('O:O', 12)  # Total Deductions
        worksheet.set_column('P:P', 11)  # Net Salary
        worksheet.set_column('Q:Q', 11)  # WFH Deduction
        worksheet.set_column('R:R', 11)  # Salary to Pay
        
        # Freeze panes (freeze header row)
        worksheet.freeze_panes(7, 0)
        
        workbook.close()
        output.seek(0)
        
        # Encode to base64
        base64_content = base64.b64encode(output.getvalue()).decode('utf-8')
        
        file_name = f"all_employees_attendance_{data['date_range']['start_date']}_{data['date_range']['end_date']}.xlsx"
        
        return {
            "status": "success",
            "file_name": file_name,
            "content": f"data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,{base64_content}",
            "content_type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        }
        
    except Exception as e:
        frappe.log_error(f"Excel generation error: {str(e)}")
        return {"status": "error", "message": str(e)}


@frappe.whitelist(allow_guest=False)
def get_attendance_analytics_by_date_range(start_date, end_date, department=None, employee_id=None):
    """
    Get attendance analytics for a specific date range with filtering options.
    """
    try:
        if not any(role in frappe.get_roles() for role in ["System Manager", "HR Manager", "HR User"]):
            frappe.throw(_("You do not have permission to access this resource."), frappe.PermissionError)
        
        start_date = getdate(start_date)
        end_date = getdate(end_date)
        
        if start_date > end_date:
            frappe.throw(_("Start date cannot be after end date"))
        
        # Build filters
        filters = {
            "attendance_date": ["between", [start_date, end_date]],
            "docstatus": ["!=", 2]
        }
        
        if employee_id:
            filters["employee"] = employee_id
        
        if department:
            dept_employees = frappe.get_all("Employee", 
                filters={"department": department, "status": "Active"}, 
                pluck="name"
            )
            if dept_employees:
                filters["employee"] = ["in", dept_employees]
            else:
                return {
                    "daily_stats": [],
                    "summary": {
                        "total_days": 0,
                        "avg_attendance": 0,
                        "trend": "stable"
                    }
                }
        
        # Get daily attendance counts
        daily_data = frappe.db.sql("""
            SELECT 
                attendance_date,
                COUNT(*) as total_attendance,
                SUM(CASE WHEN status IN ('Present', 'On Site') THEN 1 ELSE 0 END) as present_count,
                SUM(CASE WHEN status = 'Work From Home' THEN 1 ELSE 0 END) as wfh_count,
                SUM(CASE WHEN TIME(in_time) > '10:05:00' AND status IN ('Present', 'On Site') THEN 1 ELSE 0 END) as late_count
            FROM `tabAttendance`
            WHERE attendance_date BETWEEN %s AND %s
            AND docstatus != 2
            {employee_filter}
            {dept_filter}
            GROUP BY attendance_date
            ORDER BY attendance_date
        """.format(
            employee_filter=f"AND employee = '{employee_id}'" if employee_id else "",
            dept_filter=f"AND employee IN ({','.join(['%s'] * len(dept_employees))})" if department and dept_employees else ""
        ), [start_date, end_date] + (dept_employees if department and dept_employees else []), as_dict=True)
        
        # Calculate working employees for each day (excluding holidays)
        daily_stats = []
        total_attendance = 0
        total_working_days = 0
        
        # Get all relevant employees
        if employee_id:
            all_employees = [employee_id]
        elif department:
            all_employees = dept_employees if dept_employees else []
        else:
            all_employees = frappe.get_all("Employee", filters={"status": "Active"}, pluck="name")
        
        # Create date range
        current_date = start_date
        while current_date <= end_date:
            # Count employees on holiday for this date
            employees_on_holiday = 0
            for emp in all_employees:
                if is_employee_on_holiday(emp, current_date):
                    employees_on_holiday += 1
            
            working_employees = len(all_employees) - employees_on_holiday
            
            # Find attendance data for this date
            day_data = next((d for d in daily_data if d.attendance_date == current_date), {
                'attendance_date': current_date,
                'total_attendance': 0,
                'present_count': 0,
                'wfh_count': 0,
                'late_count': 0
            })
            
            attendance_rate = round((day_data['total_attendance'] / working_employees * 100), 1) if working_employees > 0 else 0
            
            daily_stats.append({
                "date": current_date.strftime("%Y-%m-%d"),
                "day_name": current_date.strftime("%A"),
                "total_employees": len(all_employees),
                "working_employees": working_employees,
                "employees_on_holiday": employees_on_holiday,
                "total_attendance": day_data['total_attendance'],
                "present_count": day_data['present_count'],
                "wfh_count": day_data['wfh_count'],
                "late_count": day_data['late_count'],
                "attendance_rate": attendance_rate
            })
            
            total_attendance += day_data['total_attendance']
            total_working_days += working_employees
            
            current_date = add_days(current_date, 1)
        
        # Calculate summary
        avg_attendance = round((total_attendance / total_working_days * 100), 1) if total_working_days > 0 else 0
        
        # Determine trend (simple logic based on first vs last week)
        trend = "stable"
        if len(daily_stats) >= 14:  # At least 2 weeks of data
            first_week_avg = sum([d['attendance_rate'] for d in daily_stats[:7]]) / 7
            last_week_avg = sum([d['attendance_rate'] for d in daily_stats[-7:]]) / 7
            
            if last_week_avg > first_week_avg + 5:
                trend = "improving"
            elif last_week_avg < first_week_avg - 5:
                trend = "declining"
        
        return {
            "daily_stats": daily_stats,
            "summary": {
                "total_days": len(daily_stats),
                "avg_attendance": avg_attendance,
                "trend": trend,
                "date_range": {
                    "start_date": start_date.strftime("%Y-%m-%d"),
                    "end_date": end_date.strftime("%Y-%m-%d")
                }
            }
        }
        
    except Exception as e:
        frappe.log_error(f"Get Attendance Analytics Error: {str(e)[:100]}")
        frappe.throw(_("Failed to get attendance analytics: {0}").format(str(e)))


def is_late_arrival(in_time):
    """Check if the check-in time is considered late (after 10:05 AM)."""
    if not in_time:
        return False
    
    try:
        from datetime import time, datetime
        standard_time = time(10, 5)  # 10:05 AM
        
        if isinstance(in_time, str):
            if ' ' in in_time:
                check_in_time = datetime.strptime(in_time.split(' ')[1], "%H:%M:%S").time()
            else:
                check_in_time = datetime.strptime(in_time, "%H:%M:%S").time()
        else:
            check_in_time = in_time.time() if hasattr(in_time, 'time') else in_time
        
        return check_in_time > standard_time
    except:
        return False




@frappe.whitelist(allow_guest=False)
@frappe.whitelist(allow_guest=False)
def get_employee_count():
    """Get the total number of active employees."""
    try:
        count = frappe.db.count("Employee", filters={"status": "Active"})
        return {"count": count}
    except Exception as e:
        frappe.log_error(f"Error fetching employee count: {str(e)}")
        frappe.throw(_("Failed to fetch employee count"))




# ============================================================================
# COMPREHENSIVE ATTENDANCE ANALYTICS API - JSON/Excel/PDF Report
# Functions: get_attendance_analytics_report, _get_employee_attendance_data,
#            _generate_attendance_analytics_excel, _generate_attendance_analytics_pdf
# WFH Deduction: Calculated only if salary structure has WFH component
# Formula: (total_earnings / total_days_in_month) * wfh_days * 0.3
# ============================================================================

@frappe.whitelist(allow_guest=False)
def get_attendance_analytics_report(
    start_date: str = None,
    end_date: str = None,
    department: str = None,
    employee_id: str = None,
    export_format: str = "json",
    wfh_deduction_per_day: float = 0
) -> dict:
    """
    Generate comprehensive attendance analytics report matching Excel format.
    
    Args:
        start_date: Start date (YYYY-MM-DD). Defaults to first day of current month.
        end_date: End date (YYYY-MM-DD). Defaults to last day of current month.
        department: Filter by department (optional)
        employee_id: Filter by specific employee (optional)
        export_format: 'json', 'excel', or 'pdf'
        wfh_deduction_per_day: Amount to deduct per WFH day (default 0)
    
    Returns:
        Comprehensive attendance report with:
        - Employee Name, Department, Designation
        - Working Days, Present Days, WFH Days, Leaves, Absent Days
        - Late Arrivals, Total Hours, Attendance %
        - Net Salary, WFH Deduction, Salary to Pay
    """
    try:
        # Permission check
        user_roles = frappe.get_roles()
        is_admin = bool(set(user_roles) & {"Administrator", "System Manager", "HR Manager", "HR User"})
        
        if not is_admin:
            # Non-admin can only see their own data
            current_employee = get_employee_by_user()
            if not current_employee:
                frappe.throw(_("No employee record found for current user"))
            employee_id = current_employee
        
        # Set default date range (current month)
        if not start_date:
            today = getdate()
            start_date = today.replace(day=1)
        else:
            start_date = getdate(start_date)
            
        if not end_date:
            today = getdate()
            next_month = today.replace(day=28) + timedelta(days=4)
            end_date = next_month.replace(day=1) - timedelta(days=1)
        else:
            end_date = getdate(end_date)
        
        # Validate date range
        if start_date > end_date:
            frappe.throw(_("Start date cannot be after end date"))
        
        if (end_date - start_date).days > 366:
            frappe.throw(_("Date range cannot exceed 366 days"))
        
        # Calculate total days in range
        total_days_in_range = (end_date - start_date).days + 1
        
        # Build employee filters
        emp_filters = {"status": "Active"}
        if department:
            emp_filters["department"] = department
        if employee_id:
            emp_filters["name"] = employee_id
        
        # Get employees
        employees = frappe.get_all(
            "Employee",
            filters=emp_filters,
            fields=["name", "employee_name", "department", "designation", "ctc"],
            order_by="employee_name asc"
        )
        
        if not employees:
            return {
                "status": "success",
                "data": {
                    "employees_data": [],
                    "period": {
                        "start_date": str(start_date),
                        "end_date": str(end_date),
                        "total_days": total_days_in_range,
                        "working_days": 0
                    },
                    "generated_on": now_datetime().strftime("%Y-%m-%d %H:%M:%S")
                },
                "message": _("No employees found")
            }
        
        # Calculate common working days (approximate - using first employee's holiday list)
        sample_holiday_list = get_holiday_list_for_employee(employees[0].name, raise_exception=False)
        common_holidays = 0
        common_weekend_count = 0
        
        if sample_holiday_list:
            common_holidays = frappe.db.count(
                "Holiday",
                filters={
                    "parent": sample_holiday_list,
                    "holiday_date": ["between", [start_date, end_date]]
                }
            )
        
        # If no holidays found, count weekends manually
        if common_holidays == 0:
            current = start_date
            while current <= end_date:
                if current.weekday() in [5, 6]:  # Saturday, Sunday
                    common_weekend_count += 1
                current = current + timedelta(days=1)
        
        common_working_days = total_days_in_range - max(common_holidays, common_weekend_count)
        
        # Process each employee
        employees_data = []
        
        for emp in employees:
            emp_data = _get_employee_attendance_data(
                emp, start_date, end_date, total_days_in_range, wfh_deduction_per_day
            )
            employees_data.append(emp_data)
        
        # Generate report data
        report_data = {
            "employees_data": employees_data,
            "period": {
                "start_date": str(start_date),
                "end_date": str(end_date),
                "total_days": total_days_in_range,
                "working_days": common_working_days
            },
            "generated_on": now_datetime().strftime("%Y-%m-%d %H:%M:%S"),
            "wfh_deduction_per_day": wfh_deduction_per_day
        }
        
        # Export based on format
        if export_format.lower() == "excel":
            return _generate_attendance_analytics_excel(report_data)
        elif export_format.lower() == "pdf":
            return _generate_attendance_analytics_pdf(report_data)
        else:
            return {
                "status": "success",
                "data": report_data,
                "message": _("Attendance analytics report generated successfully")
            }
    
    except Exception as e:
        frappe.log_error(f"Attendance Analytics Report Error: {str(e)}\n{frappe.get_traceback()}", "Attendance Analytics")
        return {
            "status": "error",
            "message": str(e),
            "data": None
        }


def _get_employee_attendance_data(emp, start_date, end_date, total_days_in_range, wfh_deduction_per_day=0):
    """Get attendance data for a single employee."""
    try:
        # Get employee's holiday list
        holiday_list = get_holiday_list_for_employee(emp.name, raise_exception=False)
        holiday_dates = set()
        weekend_dates = set()
        
        if holiday_list:
            holidays = frappe.get_all(
                "Holiday",
                filters={
                    "parent": holiday_list,
                    "holiday_date": ["between", [start_date, end_date]]
                },
                pluck="holiday_date"
            )
            holiday_dates = set(holidays)
        
        # If no holidays found in the period, calculate weekends (Sat, Sun) manually
        if not holiday_dates:
            current = start_date
            while current <= end_date:
                # Saturday = 5, Sunday = 6
                if current.weekday() in [5, 6]:
                    weekend_dates.add(current)
                current = current + timedelta(days=1)
        
        # Combine holidays and weekends
        non_working_dates = holiday_dates | weekend_dates
        
        # Calculate working days for this employee
        working_days = total_days_in_range - len(non_working_dates)
        
        # Get attendance records
        attendance_records = frappe.get_all(
            "Attendance",
            filters={
                "employee": emp.name,
                "attendance_date": ["between", [start_date, end_date]],
                "docstatus": 1
            },
            fields=["attendance_date", "status", "working_hours", "in_time", "late_entry"]
        )
        
        # Count attendance statuses
        present_days = 0
        wfh_days = 0
        half_days = 0
        on_leave_days = 0
        late_arrivals = 0
        total_working_hours = 0
        
        attendance_dates = set()
        
        for att in attendance_records:
            attendance_dates.add(att.attendance_date)
            
            if att.status in ["Present", "On Site"]:
                present_days += 1
            elif att.status == "Work From Home":
                wfh_days += 1
            elif att.status == "Half Day":
                half_days += 1
            elif att.status == "On Leave":
                on_leave_days += 1
            
            if att.late_entry:
                late_arrivals += 1
            
            # Calculate working hours
            if att.working_hours and att.working_hours > 0:
                total_working_hours += att.working_hours
        
        # Get approved leaves for the period
        leave_applications = frappe.get_all(
            "Leave Application",
            filters={
                "employee": emp.name,
                "from_date": ["<=", end_date],
                "to_date": [">=", start_date],
                "docstatus": 1,
                "status": "Approved"
            },
            fields=["from_date", "to_date", "total_leave_days", "half_day"]
        )
        
        # Calculate total leave days
        total_leave_days = 0
        for leave in leave_applications:
            # Calculate overlap with our date range
            leave_start = max(getdate(leave.from_date), start_date)
            leave_end = min(getdate(leave.to_date), end_date)
            overlap_days = (leave_end - leave_start).days + 1
            
            # Exclude non-working days (holidays + weekends) from leave days
            leave_overlap_days = 0
            current = leave_start
            while current <= leave_end:
                if current not in non_working_dates:
                    leave_overlap_days += 1
                current = current + timedelta(days=1)
            
            if leave.half_day:
                total_leave_days += 0.5
            else:
                total_leave_days += leave_overlap_days
        
        # Calculate absent days (working days without attendance and not on leave)
        days_accounted = present_days + wfh_days + half_days + on_leave_days + total_leave_days
        absent_days = max(0, working_days - days_accounted)
        
        # Calculate attendance percentage
        # Present + WFH + 0.5*HalfDay counts as attended
        attended_days = present_days + wfh_days + (half_days * 0.5)
        attendance_percentage = round((attended_days / working_days * 100), 1) if working_days > 0 else 0
        
        # Get salary info from Salary Structure Assignment (like Salary Slip calculation)
        total_earnings = 0
        total_deductions = 0
        wfh_deduction_applicable = False
        wfh_deduction_formula_vars = {}
        
        # Get active salary structure assignment
        ssa = frappe.get_all(
            "Salary Structure Assignment",
            filters={
                "employee": emp.name,
                "docstatus": 1,
                "from_date": ["<=", end_date]
            },
            fields=["salary_structure", "base"],
            order_by="from_date desc",
            limit=1
        )
        
        if ssa:
            # Get salary structure details
            try:
                salary_structure = frappe.get_doc("Salary Structure", ssa[0].salary_structure)
                
                # Calculate total earnings from salary structure and build abbreviation map
                earning_abbr_map = {}
                for earning in salary_structure.earnings:
                    if earning.amount and earning.amount > 0:
                        total_earnings += earning.amount
                        # Get abbreviation for the component
                        abbr = frappe.db.get_value("Salary Component", earning.salary_component, "salary_component_abbr")
                        if abbr:
                            earning_abbr_map[abbr] = earning.amount
                
                # Check if WFH deduction is applicable and calculate
                for deduction in salary_structure.deductions:
                    component_name = (deduction.salary_component or "").lower()
                    
                    # Check if this is a WFH deduction component
                    if "wfh" in component_name or "work from home" in component_name:
                        wfh_deduction_applicable = True
                        wfh_deduction_formula_vars = earning_abbr_map
                    elif deduction.amount and deduction.amount > 0:
                        # Add other fixed deductions
                        total_deductions += deduction.amount
                        
            except Exception as e:
                frappe.log_error(f"Error fetching salary structure for {emp.name}: {str(e)}", "Salary Structure Fetch")
        
        # If no salary structure, fallback to CTC
        if total_earnings == 0 and emp.ctc:
            total_earnings = emp.ctc / 12  # Monthly from annual CTC
        
        # Calculate WFH deduction ONLY if applicable (salary structure has WFH deduction component)
        # Use total_days_in_range (total calendar days in month) for calculation, not working days
        wfh_deduction = 0
        if wfh_deduction_applicable and wfh_days > 0:
            # Formula: (total_earnings / total_days_in_month) * wfh_days * 0.3
            per_day_salary = total_earnings / total_days_in_range if total_days_in_range > 0 else 0
            wfh_deduction = per_day_salary * wfh_days * 0.3
        elif wfh_deduction_per_day > 0 and wfh_days > 0:
            # Manual override if wfh_deduction_per_day is provided
            wfh_deduction = wfh_days * wfh_deduction_per_day
        
        # Net salary = Total Earnings - Fixed Deductions
        net_salary = total_earnings - total_deductions
        
        # Calculate salary to pay = Net Salary - WFH Deduction
        salary_to_pay = max(0, net_salary - wfh_deduction)
        
        return {
            "employee_id": emp.name,
            "employee_name": emp.employee_name or emp.name,
            "department": emp.department or "Not Assigned",
            "designation": emp.designation or "Not Assigned",
            "working_days": working_days,
            "present_days": present_days,
            "wfh_days": wfh_days,
            "leaves": round(total_leave_days, 1),
            "absent_days": round(absent_days, 1),
            "late_arrivals": late_arrivals,
            "total_hours": round(total_working_hours, 2),
            "attendance_percentage": min(100, attendance_percentage),
            "total_earnings": round(total_earnings, 2),
            "total_deductions": round(total_deductions, 2),
            "net_salary": round(net_salary, 2),
            "wfh_deduction": round(wfh_deduction, 2),
            "wfh_applicable": "Yes" if wfh_deduction_applicable else "No",
            "salary_to_pay": round(salary_to_pay, 2)
        }
    
    except Exception as e:
        frappe.log_error(f"Error processing employee {emp.name}: {str(e)}", "Attendance Analytics")
        return {
            "employee_id": emp.name,
            "employee_name": emp.employee_name or emp.name,
            "department": emp.department or "Not Assigned",
            "designation": emp.designation or "Not Assigned",
            "working_days": 0,
            "present_days": 0,
            "wfh_days": 0,
            "leaves": 0,
            "absent_days": 0,
            "late_arrivals": 0,
            "total_hours": 0,
            "attendance_percentage": 0,
            "total_earnings": 0,
            "total_deductions": 0,
            "net_salary": 0,
            "wfh_deduction": 0,
            "wfh_applicable": "N/A",
            "salary_to_pay": 0
        }


def _generate_attendance_analytics_excel(data):
    """Generate Excel report with sorting by employee ID, WFH row colors, and professional styling."""
    try:
        import io
        import xlsxwriter
        import base64
        
        output = io.BytesIO()
        workbook = xlsxwriter.Workbook(output, {'in_memory': True})
        worksheet = workbook.add_worksheet('Attendance Summary')
        
        # Sort employees by employee_id
        sorted_employees = sorted(data['employees_data'], key=lambda x: x.get('employee_id', ''))
        
        # Define formats - Professional styling
        title_format = workbook.add_format({
            'bold': True,
            'font_size': 18,
            'align': 'center',
            'valign': 'vcenter',
            'font_color': '#1F4E79',
            'font_name': 'Calibri'
        })
        
        subtitle_format = workbook.add_format({
            'font_size': 11,
            'align': 'left',
            'font_color': '#404040',
            'italic': True
        })
        
        header_format = workbook.add_format({
            'bold': True,
            'font_size': 10,
            'bg_color': '#1F4E79',
            'font_color': 'white',
            'align': 'center',
            'valign': 'vcenter',
            'border': 1,
            'border_color': '#1F4E79',
            'text_wrap': True
        })
        
        # Normal row formats (alternating colors)
        data_format_odd = workbook.add_format({
            'font_size': 10,
            'align': 'left',
            'valign': 'vcenter',
            'border': 1,
            'border_color': '#D9D9D9',
            'bg_color': '#FFFFFF'
        })
        
        data_format_even = workbook.add_format({
            'font_size': 10,
            'align': 'left',
            'valign': 'vcenter',
            'border': 1,
            'border_color': '#D9D9D9',
            'bg_color': '#F2F2F2'
        })
        
        number_format_odd = workbook.add_format({
            'font_size': 10,
            'align': 'center',
            'valign': 'vcenter',
            'border': 1,
            'border_color': '#D9D9D9',
            'bg_color': '#FFFFFF'
        })
        
        number_format_even = workbook.add_format({
            'font_size': 10,
            'align': 'center',
            'valign': 'vcenter',
            'border': 1,
            'border_color': '#D9D9D9',
            'bg_color': '#F2F2F2'
        })
        
        currency_format_odd = workbook.add_format({
            'font_size': 10,
            'align': 'right',
            'valign': 'vcenter',
            'border': 1,
            'border_color': '#D9D9D9',
            'num_format': '₹#,##0',
            'bg_color': '#FFFFFF'
        })
        
        currency_format_even = workbook.add_format({
            'font_size': 10,
            'align': 'right',
            'valign': 'vcenter',
            'border': 1,
            'border_color': '#D9D9D9',
            'num_format': '₹#,##0',
            'bg_color': '#F2F2F2'
        })
        
        percent_format_odd = workbook.add_format({
            'font_size': 10,
            'align': 'center',
            'valign': 'vcenter',
            'border': 1,
            'border_color': '#D9D9D9',
            'num_format': '0.0%',
            'bg_color': '#FFFFFF'
        })
        
        percent_format_even = workbook.add_format({
            'font_size': 10,
            'align': 'center',
            'valign': 'vcenter',
            'border': 1,
            'border_color': '#D9D9D9',
            'num_format': '0.0%',
            'bg_color': '#F2F2F2'
        })
        
        # WFH row formats (light orange/peach background)
        wfh_data_format = workbook.add_format({
            'font_size': 10,
            'align': 'left',
            'valign': 'vcenter',
            'border': 1,
            'border_color': '#D9D9D9',
            'bg_color': '#FFF2CC'  # Light orange/peach for WFH
        })
        
        wfh_number_format = workbook.add_format({
            'font_size': 10,
            'align': 'center',
            'valign': 'vcenter',
            'border': 1,
            'border_color': '#D9D9D9',
            'bg_color': '#FFF2CC'
        })
        
        wfh_currency_format = workbook.add_format({
            'font_size': 10,
            'align': 'right',
            'valign': 'vcenter',
            'border': 1,
            'border_color': '#D9D9D9',
            'num_format': '₹#,##0',
            'bg_color': '#FFF2CC'
        })
        
        wfh_percent_format = workbook.add_format({
            'font_size': 10,
            'align': 'center',
            'valign': 'vcenter',
            'border': 1,
            'border_color': '#D9D9D9',
            'num_format': '0.0%',
            'bg_color': '#FFF2CC'
        })
        
        # Write title
        worksheet.merge_range('A1:Q1', '📊 All Employees Attendance Summary', title_format)
        
        # Write period info
        period = data['period']
        worksheet.write(2, 0, f"📅 Period: {period['start_date']} to {period['end_date']}", subtitle_format)
        worksheet.write(3, 0, f"📆 Total Days: {period['total_days']} | Working Days: {period['working_days']}", subtitle_format)
        worksheet.write(4, 0, f"🕐 Generated on: {data['generated_on']}", subtitle_format)
        
        # Legend for WFH
        legend_format = workbook.add_format({'font_size': 9, 'bg_color': '#FFF2CC', 'border': 1, 'align': 'center'})
        worksheet.write(2, 14, '🏠 WFH Row', legend_format)
        
        # Headers - Row 6 (index 5)
        headers = [
            "S.No", "Employee ID", "Employee Name", "Department", "Designation", "Working\nDays",
            "Present\nDays", "WFH\nDays", "Leaves", "Absent\nDays",
            "Late", "Total\nHours", "Attendance\n%",
            "Total\nEarnings", "Total\nDeductions", "Net\nSalary", "WFH\nDeduction", "Salary\nto Pay"
        ]
        
        row = 6
        for col, header in enumerate(headers):
            worksheet.write(row, col, header, header_format)
        
        # Set row height for header
        worksheet.set_row(row, 30)
        
        # Data rows
        row = 7
        for idx, emp in enumerate(sorted_employees, 1):
            has_wfh = emp.get('wfh_days', 0) > 0
            is_even = idx % 2 == 0
            
            # Select format based on WFH status
            if has_wfh:
                d_fmt = wfh_data_format
                n_fmt = wfh_number_format
                c_fmt = wfh_currency_format
                p_fmt = wfh_percent_format
            elif is_even:
                d_fmt = data_format_even
                n_fmt = number_format_even
                c_fmt = currency_format_even
                p_fmt = percent_format_even
            else:
                d_fmt = data_format_odd
                n_fmt = number_format_odd
                c_fmt = currency_format_odd
                p_fmt = percent_format_odd
            
            worksheet.write(row, 0, idx, n_fmt)
            worksheet.write(row, 1, emp.get('employee_id', ''), d_fmt)
            worksheet.write(row, 2, emp['employee_name'], d_fmt)
            worksheet.write(row, 3, emp['department'], d_fmt)
            worksheet.write(row, 4, emp['designation'], d_fmt)
            worksheet.write(row, 5, emp['working_days'], n_fmt)
            worksheet.write(row, 6, emp['present_days'], n_fmt)
            worksheet.write(row, 7, emp['wfh_days'], n_fmt)
            worksheet.write(row, 8, emp['leaves'], n_fmt)
            worksheet.write(row, 9, emp['absent_days'], n_fmt)
            worksheet.write(row, 10, emp['late_arrivals'], n_fmt)
            worksheet.write(row, 11, emp['total_hours'], n_fmt)
            worksheet.write(row, 12, emp['attendance_percentage'] / 100, p_fmt)
            worksheet.write(row, 13, emp.get('total_earnings', 0), c_fmt)
            worksheet.write(row, 14, emp.get('total_deductions', 0), c_fmt)
            worksheet.write(row, 15, emp['net_salary'], c_fmt)
            worksheet.write(row, 16, emp['wfh_deduction'], c_fmt)
            worksheet.write(row, 17, emp['salary_to_pay'], c_fmt)
            row += 1
        
        # Set column widths
        worksheet.set_column('A:A', 5)   # S.No
        worksheet.set_column('B:B', 14)  # Employee ID
        worksheet.set_column('C:C', 22)  # Employee Name
        worksheet.set_column('D:D', 15)  # Department
        worksheet.set_column('E:E', 25)  # Designation
        worksheet.set_column('F:F', 10)  # Working Days
        worksheet.set_column('G:G', 10)  # Present Days
        worksheet.set_column('H:H', 8)   # WFH Days
        worksheet.set_column('I:I', 8)   # Leaves
        worksheet.set_column('J:J', 9)   # Absent Days
        worksheet.set_column('K:K', 6)   # Late
        worksheet.set_column('L:L', 9)   # Total Hours
        worksheet.set_column('M:M', 10)  # Attendance %
        worksheet.set_column('N:N', 12)  # Total Earnings
        worksheet.set_column('O:O', 12)  # Total Deductions
        worksheet.set_column('P:P', 11)  # Net Salary
        worksheet.set_column('Q:Q', 11)  # WFH Deduction
        worksheet.set_column('R:R', 11)  # Salary to Pay
        
        # Freeze panes (freeze header row)
        worksheet.freeze_panes(7, 0)
        
        workbook.close()
        output.seek(0)
        
        # Encode to base64
        base64_content = base64.b64encode(output.getvalue()).decode('utf-8')
        
        file_name = f"attendance_summary_{data['period']['start_date']}_{data['period']['end_date']}.xlsx"
        
        return {
            "status": "success",
            "file_name": file_name,
            "content": f"data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,{base64_content}",
            "content_type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        }
    
    except Exception as e:
        frappe.log_error(f"Excel generation error: {str(e)}", "Attendance Analytics Excel")
        return {"status": "error", "message": str(e)}


def _generate_attendance_analytics_pdf(data):
    """Generate PDF report with sorting by employee ID, WFH row colors, and professional styling."""
    try:
        from frappe.utils.pdf import get_pdf
        import base64
        
        period = data['period']
        
        # Sort employees by employee_id
        sorted_employees = sorted(data['employees_data'], key=lambda x: x.get('employee_id', ''))
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body {{ font-family: 'Segoe UI', Arial, sans-serif; padding: 15px; font-size: 9px; background: #fff; }}
                .header {{ text-align: center; margin-bottom: 20px; padding: 15px; background: linear-gradient(135deg, #1F4E79 0%, #2E75B6 100%); color: white; border-radius: 8px; }}
                .title {{ font-size: 20px; font-weight: bold; margin-bottom: 8px; letter-spacing: 1px; }}
                .subtitle {{ font-size: 11px; opacity: 0.9; margin-bottom: 3px; }}
                .legend {{ margin: 10px 0; padding: 8px; background: #f8f9fa; border-radius: 5px; font-size: 9px; }}
                .legend-item {{ display: inline-block; margin-right: 20px; }}
                .legend-color {{ display: inline-block; width: 15px; height: 15px; vertical-align: middle; margin-right: 5px; border: 1px solid #ddd; }}
                .wfh-color {{ background-color: #FFF2CC; }}
                table {{ width: 100%; border-collapse: collapse; margin-top: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }}
                th {{ background: linear-gradient(135deg, #1F4E79 0%, #2E75B6 100%); color: white; padding: 10px 4px; text-align: center; font-size: 8px; font-weight: 600; border: 1px solid #1F4E79; }}
                td {{ padding: 7px 4px; border: 1px solid #e0e0e0; font-size: 8px; }}
                tr:nth-child(even) {{ background-color: #f8f9fa; }}
                tr:nth-child(odd) {{ background-color: #ffffff; }}
                tr.wfh-row {{ background-color: #FFF2CC !important; }}
                tr:hover {{ background-color: #e3f2fd !important; }}
                .text-center {{ text-align: center; }}
                .text-right {{ text-align: right; }}
                .text-left {{ text-align: left; }}
                .footer {{ margin-top: 15px; text-align: center; font-size: 8px; color: #666; padding: 10px; border-top: 1px solid #ddd; }}
            </style>
        </head>
        <body>
            <div class="header">
                <div class="title">📊 All Employees Attendance Summary</div>
                <div class="subtitle">📅 Period: {period['start_date']} to {period['end_date']}</div>
                <div class="subtitle">📆 Total Days: {period['total_days']} | Working Days: {period['working_days']}</div>
                <div class="subtitle">🕐 Generated on: {data['generated_on']}</div>
            </div>
            
            <div class="legend">
                <span class="legend-item"><span class="legend-color wfh-color"></span> 🏠 Employees with WFH Days</span>
                <span class="legend-item">📋 Total Employees: {len(sorted_employees)}</span>
            </div>
            
            <table>
                <thead>
                    <tr>
                        <th>S.No</th>
                        <th>Employee ID</th>
                        <th>Employee Name</th>
                        <th>Department</th>
                        <th>Designation</th>
                        <th>Working<br>Days</th>
                        <th>Present<br>Days</th>
                        <th>WFH<br>Days</th>
                        <th>Leaves</th>
                        <th>Absent<br>Days</th>
                        <th>Late</th>
                        <th>Total<br>Hours</th>
                        <th>Attend<br>%</th>
                        <th>Total<br>Earnings</th>
                        <th>Total<br>Deduct</th>
                        <th>Net<br>Salary</th>
                        <th>WFH<br>Deduct</th>
                        <th>Salary<br>to Pay</th>
                    </tr>
                </thead>
                <tbody>
        """
        
        for idx, emp in enumerate(sorted_employees, 1):
            has_wfh = emp.get('wfh_days', 0) > 0
            row_class = 'wfh-row' if has_wfh else ''
            html_content += f"""
                    <tr class="{row_class}">
                        <td class="text-center">{idx}</td>
                        <td class="text-left">{emp.get('employee_id', '')}</td>
                        <td class="text-left">{emp['employee_name']}</td>
                        <td class="text-left">{emp['department']}</td>
                        <td class="text-left">{emp['designation']}</td>
                        <td class="text-center">{emp['working_days']}</td>
                        <td class="text-center">{emp['present_days']}</td>
                        <td class="text-center">{emp['wfh_days']}</td>
                        <td class="text-center">{emp['leaves']}</td>
                        <td class="text-center">{emp['absent_days']}</td>
                        <td class="text-center">{emp['late_arrivals']}</td>
                        <td class="text-center">{emp['total_hours']}</td>
                        <td class="text-center">{emp['attendance_percentage']}%</td>
                        <td class="text-right">₹{emp.get('total_earnings', 0):,.0f}</td>
                        <td class="text-right">₹{emp.get('total_deductions', 0):,.0f}</td>
                        <td class="text-right">₹{emp['net_salary']:,.0f}</td>
                        <td class="text-right">₹{emp['wfh_deduction']:,.0f}</td>
                        <td class="text-right">₹{emp['salary_to_pay']:,.0f}</td>
                    </tr>
            """
        
        html_content += """
                </tbody>
            </table>
            <div class="footer">
                <p>This is a system-generated report. For any queries, please contact HR Department.</p>
            </div>
        </body>
        </html>
        """
        
        # Generate PDF
        pdf_content = get_pdf(html_content, {"page-size": "A4", "orientation": "Landscape"})
        
        # Encode to base64
        base64_content = base64.b64encode(pdf_content).decode('utf-8')
        
        file_name = f"attendance_summary_{period['start_date']}_{period['end_date']}.pdf"
        
        return {
            "status": "success",
            "file_name": file_name,
            "content": f"data:application/pdf;base64,{base64_content}",
            "content_type": "application/pdf"
        }
    
    except Exception as e:
        frappe.log_error(f"PDF generation error: {str(e)}", "Attendance Analytics PDF")
        return {"status": "error", "message": str(e)}

# OLD DUPLICATE LEAVE FUNCTIONS REMOVED - Use new comprehensive APIs starting at line ~600


@frappe.whitelist()
def get_attendance_records(employee, start_date, end_date):
    """Get attendance records for an employee within date range."""
    try:
        if not employee or not start_date or not end_date:
            frappe.throw("Employee, start date, and end date are mandatory fields", title="Validation Error")

        if not frappe.db.exists("Employee", employee):
            frappe.throw(f"Employee {employee} does not exist", title="Invalid Employee")

        start_date = getdate(start_date)
        end_date = getdate(end_date)
        if end_date < start_date:
            frappe.throw("End date cannot be before start date", title="Invalid Date Range")

        attendance_records = frappe.get_all(
            'Attendance',
            filters={
                'employee': employee,
                'attendance_date': ['between', [start_date, end_date]],
                'docstatus': ['!=', 2]  # Include draft (0) and submitted (1), exclude cancelled (2)
            },
            fields=[
                'name',
                'attendance_date', 
                'in_time', 
                'out_time', 
                'custom_out_time_copy',
                'status',
                'docstatus',
                'working_hours',
                'employee',
                'employee_name'
            ]
        )
        
        # Enrich with work_type from Geo Log
        for record in attendance_records:
            # Get work_type from Geo Log for check-in
            geo_logs = frappe.get_all(
                'Geo Log',
                filters={
                    'employee': employee,
                    'attendance': record.get('name'),
                    'action': 'Check-In'
                },
                fields=['work_type'],
                limit=1
            )
            
            if geo_logs and geo_logs[0].work_type:
                record['work_type'] = geo_logs[0].work_type
            else:
                record['work_type'] = 'Office'  # Default to Office
            
            # Use out_time, fallback to custom_out_time_copy
            if not record.get('out_time') and record.get('custom_out_time_copy'):
                record['out_time'] = record['custom_out_time_copy']
            
            # Determine actual display status based on docstatus and in_time
            if record.get('docstatus') == 0 and record.get('in_time'):
                # Draft with check-in = Present (waiting for checkout)
                record['status'] = 'Present'
            elif record.get('docstatus') == 1:
                # Submitted = use actual status from database
                pass  # Keep the status as is
            elif not record.get('in_time'):
                # No check-in = Absent
                record['status'] = 'Absent'

        return {
            'status': 'success', 
            'message': 'Attendance records fetched successfully', 
            'data': attendance_records
        }
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Get Attendance Records Error")
        return {
            'status': 'error',
            'message': str(e),
            'data': []
        }


@frappe.whitelist()
def get_holidays(start_date, end_date):
    """Get holidays within date range."""
    try:
        if not start_date or not end_date:
            frappe.throw("Start date and end date are mandatory fields", title="Validation Error")

        start_date = getdate(start_date)
        end_date = getdate(end_date)
        if end_date < start_date:
            frappe.throw("End date cannot be before start date", title="Invalid Date Range")

        holidays = frappe.get_all(
            'Holiday',
            filters={
                'holiday_date': ['between', [start_date, end_date]],
            },
            fields=['holiday_date', 'description']
        )

        return {
            'status': 'success', 
            'message': 'Holidays fetched successfully', 
            'data': holidays
        }
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Get Holidays Error")
        return {
            'status': 'error',
            'message': str(e),
            'data': []
        }


@frappe.whitelist()
def get_shift_assignments(employee, start_date, end_date):
    """Get shift assignments for an employee within date range."""
    try:
        if not employee or not start_date or not end_date:
            frappe.throw("Employee, start_date, and end_date are mandatory fields", title="Validation Error")

        if not frappe.db.exists("Employee", employee):
            frappe.throw(f"Employee {employee} does not exist", title="Invalid Employee")

        start_date = getdate(start_date)
        end_date = getdate(end_date)
        if end_date < start_date:
            frappe.throw("End date cannot be before start date", title="Invalid Date Range")

        shift_assignments = frappe.get_all(
            'Shift Assignment',
            filters={
                'employee': employee,
                'start_date': ['<=', end_date],
                'end_date': ['>=', start_date],
                'docstatus': 1,
                'status': 'Active'
            },
            fields=['start_date', 'end_date', 'shift_type']
        )

        return {
            'status': 'success', 
            'message': 'Shift assignments fetched successfully', 
            'data': shift_assignments
        }
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Get Shift Assignments Error")
        return {
            'status': 'error',
            'message': str(e),
            'data': []
        }


# Firebase and Notification Management
def initialize_firebase():
    """Initialize Firebase Admin SDK."""
    if not firebase_admin._apps:
        try:
            service_account = frappe.get_site_config().get("firebase_service_account")
            if not service_account:
                frappe.log_error("Firebase Initialization Error", "No firebase_service_account found in site_config.json")
                raise ValueError("Firebase service account not configured")
            
            # Check if service_account is a dict (JSON object) or a file path (string)
            if isinstance(service_account, dict):
                # Direct JSON configuration
                cred = credentials.Certificate(service_account)
                frappe.log_error("Firebase Initialization", "Using direct JSON configuration from site_config.json")
            else:
                # File path to service account JSON
                cred = credentials.Certificate(service_account)
                frappe.log_error("Firebase Initialization", f"Using service account file: {service_account}")
            
            firebase_admin.initialize_app(cred)
            frappe.log_error("Firebase Initialization Success", "Firebase Admin SDK initialized successfully")
        except Exception as e:
            frappe.log_error("Firebase Initialization Error", f"Failed to initialize Firebase: {str(e)}")
            frappe.log_error("Firebase Initialization Error Traceback", frappe.get_traceback())
            raise

# Initialize Firebase at module level
try:
    initialize_firebase()
except Exception as init_error:
    frappe.log_error(f"Firebase Module Initialization Failed: {str(init_error)}", "Firebase Init")


@frappe.whitelist(allow_guest=False)
def save_fcm_token(token, device_type):
    """Save or update FCM token for a user.
    
    This API should be called by the mobile app immediately after:
    1. User successfully logs in
    2. FCM token is refreshed (token changes periodically)
    3. App is opened after being closed for a while
    
    Args:
        token: FCM token from Firebase SDK
        device_type: "Android" or "iOS"
    
    Returns:
        dict with status, message, and registration details
    """
    try:
        # Validate inputs
        if not token:
            return {"status": "error", "message": "Token is required"}
        
        if not token.strip():
            return {"status": "error", "message": "Token cannot be empty"}
        
        # Accept various device type formats
        device_type_lower = str(device_type).lower().strip() if device_type else "android"
        if device_type_lower in ['android', 'a']:
            device_type = 'Android'
        elif device_type_lower in ['ios', 'i', 'iphone', 'ipad']:
            device_type = 'iOS'
        else:
            device_type = 'Android'  # Default to Android
        
        user = frappe.session.user
        token = token.strip()
        
        # Log for debugging
        frappe.log_error(
            f"FCM Token Registration - User: {user}, Device: {device_type}, Token: {token[:30]}...",
            "FCM Token Save"
        )
        
        # Check if user already has a device registered - use get_all to be safe
        existing_devices = frappe.get_all(
            "Mobile Device", 
            filters={"user": user}, 
            fields=["name", "fcm_token"],
            limit=1
        )
        
        if existing_devices:
            # Update existing record
            existing = existing_devices[0]
            old_token = existing.fcm_token
            frappe.db.set_value("Mobile Device", existing.name, {
                "fcm_token": token,
                "device_type": device_type,
                "last_active": now_datetime()
            }, update_modified=True)
            action = "updated" if old_token != token else "refreshed"
            frappe.log_error(f"✅ {action.capitalize()} Mobile Device {existing.name} for user: {user}", "FCM Token Save")
        else:
            # Check if this token is already registered to a different user (device shared/transferred)
            existing_token_devices = frappe.get_all(
                "Mobile Device", 
                filters={"fcm_token": token}, 
                fields=["name", "user"],
                limit=1
            )
            
            if existing_token_devices:
                existing_token = existing_token_devices[0]
                old_user = existing_token.user
                frappe.db.set_value("Mobile Device", existing_token.name, {
                    "user": user,
                    "device_type": device_type,
                    "last_active": now_datetime()
                }, update_modified=True)
                frappe.log_error(f"✅ Transferred Mobile Device {existing_token.name} from {old_user} to {user}", "FCM Token Save")
                action = "transferred"
            else:
                # Create new record
                doc = frappe.get_doc({
                    "doctype": "Mobile Device",
                    "user": user,
                    "fcm_token": token,
                    "device_type": device_type,
                    "last_active": now_datetime()
                })
                doc.insert(ignore_permissions=True)
                frappe.log_error(f"✅ Created new Mobile Device {doc.name} for user: {user}", "FCM Token Save")
                action = "created"
        
        frappe.db.commit()
        
        return {
            "status": "success", 
            "message": f"FCM token {action}", 
            "user": user, 
            "device_type": device_type,
            "action": action
        }
        
    except Exception as e:
        frappe.log_error(f"❌ Error saving FCM token for {frappe.session.user}: {str(e)}", "FCM Token Save Error")
        frappe.log_error(frappe.get_traceback(), "FCM Token Save Error Traceback")
        return {"status": "error", "message": f"Failed to save FCM token: {str(e)}"}


@frappe.whitelist(allow_guest=False)
def get_notification_status():
    """Get current user's notification registration status.
    
    This API helps diagnose why a user might not be receiving notifications.
    
    Returns:
        dict with registration status, token info, and diagnostic details
    """
    try:
        user = frappe.session.user
        
        # Check if user has a mobile device registered
        device = frappe.db.get_value(
            "Mobile Device", 
            {"user": user}, 
            ["name", "fcm_token", "device_type", "last_active"],
            as_dict=True
        )
        
        # Check if user is linked to an employee
        employee = frappe.db.get_value(
            "Employee",
            {"user_id": user, "status": "Active"},
            ["name", "employee_name"],
            as_dict=True
        )
        
        if not device:
            return {
                "status": "not_registered",
                "message": "No mobile device registered. Please ensure the app registers FCM token on login.",
                "user": user,
                "employee": employee.name if employee else None,
                "employee_name": employee.employee_name if employee else None,
                "is_registered": False,
                "can_receive_notifications": False,
                "troubleshooting": [
                    "1. Make sure notification permissions are enabled on your device",
                    "2. Log out and log back in to the app",
                    "3. Check if Firebase is properly configured in the app",
                    "4. Ensure internet connectivity when logging in"
                ]
            }
        
        # Check if token looks valid (FCM tokens are typically 150+ chars)
        token_valid = device.fcm_token and len(device.fcm_token) > 100
        
        # Check if device was recently active
        from datetime import datetime, timedelta
        is_recent = device.last_active and device.last_active > datetime.now() - timedelta(days=7)
        
        return {
            "status": "registered",
            "message": "Mobile device is registered for notifications",
            "user": user,
            "employee": employee.name if employee else None,
            "employee_name": employee.employee_name if employee else None,
            "is_registered": True,
            "can_receive_notifications": token_valid and is_recent,
            "device_type": device.device_type,
            "last_active": str(device.last_active) if device.last_active else None,
            "token_preview": f"{device.fcm_token[:20]}...{device.fcm_token[-10:]}" if device.fcm_token else None,
            "token_length": len(device.fcm_token) if device.fcm_token else 0,
            "token_looks_valid": token_valid,
            "recently_active": is_recent,
            "troubleshooting": [] if (token_valid and is_recent) else [
                "Token may be stale - try logging out and back in",
                "Check if notifications are enabled in device settings"
            ]
        }
        
    except Exception as e:
        frappe.log_error(f"Get Notification Status Error: {str(e)}", "Notification Status")
        return {"status": "error", "message": str(e)}


@frappe.whitelist(allow_guest=False)
def test_notification():
    """Send a test notification to the current user's device.
    
    Use this to verify notifications are working for a specific user.
    """
    try:
        user = frappe.session.user
        
        # Get user's FCM token
        device = frappe.db.get_value(
            "Mobile Device", 
            {"user": user}, 
            ["fcm_token", "device_type"],
            as_dict=True
        )
        
        if not device or not device.fcm_token:
            return {
                "status": "error",
                "message": "No FCM token registered for this user. Please log in to the mobile app first."
            }
        
        # Send test notification
        title = "Test Notification"
        body = f"This is a test notification sent at {now_datetime().strftime('%H:%M:%S')}"
        
        result = send_fcm_notification(
            [device.fcm_token], 
            title, 
            body, 
            {"type": "test", "user": user},
            "test_notification"
        )
        
        return {
            "status": "success" if result.get("success_count", 0) > 0 else "failed",
            "message": "Test notification sent" if result.get("success_count", 0) > 0 else "Failed to send notification",
            "device_type": device.device_type,
            "fcm_result": result
        }
        
    except Exception as e:
        frappe.log_error(f"Test Notification Error: {str(e)}", "Test Notification")
        return {"status": "error", "message": str(e)}


def send_fcm_notification(tokens, title, body, data=None, notification_tag=None):
    """Send FCM notification to multiple tokens with optional data payload.
    
    Args:
        tokens: List of FCM tokens or single token string
        title: Notification title
        body: Notification body
        data: Optional dict of custom data
        notification_tag: Optional tag for notification grouping/replacement
    """
    if not tokens:
        frappe.log_error("FCM Send Error", "No tokens provided")
        return {"success_count": 0, "failure_count": 0, "message": "No tokens provided"}
    
    # Ensure tokens is a list and filter out None/empty values
    if isinstance(tokens, str):
        tokens = [tokens]
    tokens = [t for t in tokens if t]
    
    if not tokens:
        frappe.log_error("FCM Send Error", "All tokens were empty or None")
        return {"success_count": 0, "failure_count": 0, "message": "All tokens were empty"}
    
    frappe.log_error(f"Attempting to send notification to {len(tokens)} tokens", f"Title: {title}, Body: {body}")
    
    # Add unique message ID and timestamp for deduplication
    import time
    import uuid
    notification_data = data or {}
    notification_data.update({
        "notification_id": str(uuid.uuid4()),
        "timestamp": str(int(time.time())),
        "type": "hrms_notification"
    })
    
    # Create messages with notification payload
    messages = [messaging.Message(
        notification=messaging.Notification(
            title=title,
            body=body
        ),
        data={k: str(v) for k, v in notification_data.items()},
        token=token,
        android=messaging.AndroidConfig(
            priority='high',
            notification=messaging.AndroidNotification(
                sound='default',
                priority='high',
                default_vibrate_timings=True,
                tag=notification_tag or str(uuid.uuid4())[:8],  # Tag for notification replacement
                notification_count=1
            )
        )
    ) for token in tokens]
    
    try:
        response = messaging.send_each(messages)
        result = {
            "success_count": response.success_count,
            "failure_count": response.failure_count,
            "responses": [
                {
                    "message_id": resp.message_id,
                    "success": resp.success,
                    "exception": str(resp.exception) if resp.exception else None
                } for resp in response.responses
            ]
        }
        frappe.log_error("FCM Send Response", str(result))
        return result
    except Exception as e:
        frappe.log_error("FCM Send Error", str(e))
        frappe.log_error("FCM Send Error Traceback", frappe.get_traceback())
        raise


def is_holiday_today(employee):
    """Check if today is a holiday for the employee."""
    holiday_list = get_holiday_list_for_employee(employee, raise_exception=False)
    if not holiday_list:
        return False
    today = getdate()
    return frappe.db.exists("Holiday", {"parent": holiday_list, "holiday_date": today})


def get_employee_tokens(employees):
    """Get FCM tokens for a list of employees from Mobile Device table."""
    if not employees:
        return []
    
    users = frappe.get_all("Employee", 
        filters={"name": ["in", employees], "status": "Active"}, 
        pluck="user_id"
    )
    
    # Filter out None values
    valid_users = [u for u in users if u]
    
    if not valid_users:
        return []
    
    tokens = frappe.get_all("Mobile Device", 
        filters={"user": ["in", valid_users]}, 
        pluck="fcm_token"
    )
    
    # Filter out None/empty tokens
    return [t for t in tokens if t]


@frappe.whitelist(allow_guest=False)
def get_notification_diagnostics():
    """Get comprehensive notification system diagnostics (Admin only).
    
    Returns detailed information about:
    - Total employees vs registered devices
    - Employees without FCM tokens
    - Stale/inactive devices
    - Recent notification delivery stats
    """
    try:
        # Check admin permission
        if not any(role in frappe.get_roles() for role in ["System Manager", "HR Manager"]):
            frappe.throw(_("Only System Manager or HR Manager can access diagnostics"))
        
        from datetime import datetime, timedelta
        
        # Get all active employees with user_id
        active_employees = frappe.get_all(
            "Employee",
            filters={"status": "Active", "user_id": ["is", "set"]},
            fields=["name", "employee_name", "user_id", "department"]
        )
        
        # Get all mobile devices
        mobile_devices = frappe.get_all(
            "Mobile Device",
            fields=["name", "user", "fcm_token", "device_type", "last_active"]
        )
        
        # Create lookup sets
        registered_users = {d.user for d in mobile_devices if d.user}
        
        # Find employees without devices
        employees_without_device = []
        for emp in active_employees:
            if emp.user_id not in registered_users:
                employees_without_device.append({
                    "employee": emp.name,
                    "employee_name": emp.employee_name,
                    "user_id": emp.user_id,
                    "department": emp.department
                })
        
        # Find stale devices (inactive > 30 days)
        cutoff_30_days = datetime.now() - timedelta(days=30)
        cutoff_7_days = datetime.now() - timedelta(days=7)
        
        stale_devices = []
        inactive_devices = []
        for d in mobile_devices:
            if d.last_active:
                if d.last_active < cutoff_30_days:
                    stale_devices.append({
                        "user": d.user,
                        "last_active": str(d.last_active),
                        "days_inactive": (datetime.now() - d.last_active).days
                    })
                elif d.last_active < cutoff_7_days:
                    inactive_devices.append({
                        "user": d.user,
                        "last_active": str(d.last_active),
                        "days_inactive": (datetime.now() - d.last_active).days
                    })
        
        # Check for invalid tokens (too short)
        invalid_tokens = []
        for d in mobile_devices:
            if d.fcm_token and len(d.fcm_token) < 100:
                invalid_tokens.append({
                    "user": d.user,
                    "token_length": len(d.fcm_token)
                })
        
        return {
            "status": "success",
            "summary": {
                "total_active_employees": len(active_employees),
                "total_registered_devices": len(mobile_devices),
                "employees_without_device": len(employees_without_device),
                "stale_devices_30_days": len(stale_devices),
                "inactive_devices_7_days": len(inactive_devices),
                "invalid_tokens": len(invalid_tokens),
                "coverage_percentage": round((len(mobile_devices) / len(active_employees) * 100), 1) if active_employees else 0
            },
            "employees_without_device": employees_without_device,
            "stale_devices": stale_devices,
            "inactive_devices": inactive_devices,
            "invalid_tokens": invalid_tokens,
            "recommendations": [
                f"Request {len(employees_without_device)} employees to install/login to the mobile app" if employees_without_device else None,
                f"Consider cleaning up {len(stale_devices)} stale device records" if stale_devices else None,
                f"Check {len(invalid_tokens)} devices with potentially invalid tokens" if invalid_tokens else None,
            ]
        }
        
    except Exception as e:
        frappe.log_error(f"Notification Diagnostics Error: {str(e)}", "Diagnostics")
        return {"status": "error", "message": str(e)}


@frappe.whitelist(allow_guest=False)
def send_admin_notification(docname):
    """Send admin-triggered notification."""
    if not frappe.has_permission("Notification Master", "write"):
        frappe.throw(_("Insufficient permissions"))
    
    doc = frappe.get_doc("Notification Master", docname)
    if doc.status == "Sent":
        return {"status": "error", "message": "Notification already sent"}
    
    employees = []
    if doc.send_to == "All Employees":
        employees = frappe.get_all("Employee", filters={"status": "Active"}, pluck="name")
    elif doc.send_to == "Specific Department":
        employees = frappe.get_all("Employee", filters={"department": doc.department, "status": "Active"}, pluck="name")
    elif doc.send_to == "Specific Employee":
        employees = [doc.employee]
    
    tokens = get_employee_tokens(employees)
    if not tokens:
        frappe.log_error("No Tokens Found", f"No valid tokens for employees: {employees}")
        return {"status": "error", "message": "No valid tokens found"}
    
    response = send_fcm_notification(tokens, doc.title, doc.message)
    
    doc.status = "Sent"
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"status": "success", "message": "Notification sent"}


# ============================================================================
# ADMIN NOTIFICATION SYSTEM - Automatic Notifications for Approvals
# ============================================================================

def get_approver_tokens(approver_users):
    """Get FCM tokens for approver users."""
    if not approver_users:
        return []
    
    if isinstance(approver_users, str):
        approver_users = [approver_users]
    
    tokens = frappe.db.sql(
        """SELECT fcm_token FROM `tabMobile Device` 
           WHERE user IN ({users}) AND fcm_token IS NOT NULL AND fcm_token != ''
        """.format(users=",".join(["%s"] * len(approver_users))),
        approver_users,
        as_dict=False
    )
    return [t[0] for t in tokens if t[0]]


def send_approver_notification(approver_users, title, body, data=None):
    """Send push notification to approvers."""
    try:
        tokens = get_approver_tokens(approver_users)
        if not tokens:
            frappe.logger().info(f"⚠️ No tokens found for approvers: {approver_users}")
            return False
        
        if data is None:
            data = {}
        
        data.update({
            "type": "approval_request",
            "priority": "high"
        })
        
        result = send_fcm_notification(tokens, title, body, data)
        frappe.logger().info(f"✅ Admin notification sent to {result.get('success_count', 0)} approvers")
        return True
    except Exception as e:
        frappe.logger().error(f"❌ Failed to send approver notification: {str(e)}")
        return False


def send_leave_approval_notification(application_id, notification_type="submitted"):
    """Send notification to leave approvers when new application is submitted."""
    try:
        leave_app = frappe.get_doc("Leave Application", application_id)
        
        # Get all approvers
        approvers = []
        
        # Primary leave approver
        if leave_app.leave_approver:
            approvers.append(leave_app.leave_approver)
        
        # Department leave approvers
        if leave_app.department:
            dept_approvers = frappe.db.sql(
                """SELECT employee FROM `tabDepartment Approver` 
                   WHERE parent = %s AND approver_type = 'Leave Approver'""",
                leave_app.department,
                as_dict=False
            )
            approvers.extend([a[0] for a in dept_approvers])
        
        # HR managers as fallback
        if not approvers:
            hr_managers = frappe.get_all(
                "User",
                filters={"roles": "HR Manager"},
                pluck="name"
            )
            approvers.extend(hr_managers)
        
        if not approvers:
            frappe.logger().warning(f"⚠️ No approvers found for leave application {application_id}")
            return
        
        # Remove duplicates
        approvers = list(set(approvers))
        
        if notification_type == "submitted":
            title = f"New Leave Request - {leave_app.employee_name}"
            body = f"Leave request for {leave_app.total_leave_days} day(s) from {leave_app.from_date} to {leave_app.to_date}"
        elif notification_type == "resubmitted":
            title = f"Leave Request Resubmitted - {leave_app.employee_name}"
            body = f"Updated leave request pending approval"
        else:
            return
        
        data = {
            "type": "leave_application",
            "application_id": application_id,
            "employee": leave_app.employee,
            "notification_type": notification_type,
            "from_date": str(leave_app.from_date),
            "to_date": str(leave_app.to_date)
        }
        
        send_approver_notification(approvers, title, body, data)
        frappe.logger().info(f"✅ Leave approval notification sent to {len(approvers)} approvers for {application_id}")
        
    except Exception as e:
        frappe.logger().error(f"❌ Error sending leave approval notification: {str(e)}")


def send_expense_approval_notification(claim_id, notification_type="submitted"):
    """Send notification to expense approvers when new claim is submitted."""
    try:
        expense_claim = frappe.get_doc("Expense Claim", claim_id)
        
        # Get all approvers
        approvers = []
        
        # Employee's expense approver
        employee = frappe.get_doc("Employee", expense_claim.employee)
        if employee.expense_approver:
            approvers.append(employee.expense_approver)
        
        # Department expense approvers
        if expense_claim.department:
            dept_approvers = frappe.db.sql(
                """SELECT employee FROM `tabDepartment Approver` 
                   WHERE parent = %s AND approver_type = 'Expense Approver'""",
                expense_claim.department,
                as_dict=False
            )
            approvers.extend([a[0] for a in dept_approvers])
        
        # HR managers as fallback
        if not approvers:
            hr_managers = frappe.get_all(
                "User",
                filters={"roles": "HR Manager"},
                pluck="name"
            )
            approvers.extend(hr_managers)
        
        if not approvers:
            frappe.logger().warning(f"⚠️ No approvers found for expense claim {claim_id}")
            return
        
        approvers = list(set(approvers))
        
        if notification_type == "submitted":
            title = f"New Expense Claim - {expense_claim.employee_name}"
            body = f"Expense claim of ₹{expense_claim.total_claimed_amount} pending approval"
        elif notification_type == "resubmitted":
            title = f"Expense Claim Resubmitted - {expense_claim.employee_name}"
            body = f"Updated expense claim of ₹{expense_claim.total_claimed_amount} pending approval"
        else:
            return
        
        data = {
            "type": "expense_claim",
            "claim_id": claim_id,
            "employee": expense_claim.employee,
            "notification_type": notification_type,
            "amount": str(expense_claim.total_claimed_amount)
        }
        
        send_approver_notification(approvers, title, body, data)
        frappe.logger().info(f"✅ Expense approval notification sent to {len(approvers)} approvers for {claim_id}")
        
    except Exception as e:
        frappe.logger().error(f"❌ Error sending expense approval notification: {str(e)}")


def send_wfh_approval_notification(request_id, notification_type="submitted"):
    """Send notification to WFH approvers when new request is submitted."""
    try:
        shift_request = frappe.get_doc("Shift Request", request_id)
        
        # Get all approvers
        approvers = []
        
        # Employee's shift request approver
        employee = frappe.get_doc("Employee", shift_request.employee)
        if employee.shift_request_approver:
            approvers.append(employee.shift_request_approver)
        
        # Department approvers
        if shift_request.department:
            dept_approvers = frappe.db.sql(
                """SELECT employee FROM `tabDepartment Approver` 
                   WHERE parent = %s AND approver_type = 'Shift Request Approver'""",
                shift_request.department,
                as_dict=False
            )
            approvers.extend([a[0] for a in dept_approvers])
        
        # HR managers as fallback
        if not approvers:
            hr_managers = frappe.get_all(
                "User",
                filters={"roles": "HR Manager"},
                pluck="name"
            )
            approvers.extend(hr_managers)
        
        if not approvers:
            frappe.logger().warning(f"⚠️ No approvers found for WFH request {request_id}")
            return
        
        approvers = list(set(approvers))
        
        if notification_type == "submitted":
            title = f"New WFH Request - {shift_request.employee_name}"
            body = f"Work from home request for {shift_request.date} pending approval"
        elif notification_type == "resubmitted":
            title = f"WFH Request Resubmitted - {shift_request.employee_name}"
            body = f"Updated WFH request pending approval"
        else:
            return
        
        data = {
            "type": "wfh_request",
            "request_id": request_id,
            "employee": shift_request.employee,
            "notification_type": notification_type,
            "date": str(shift_request.date)
        }
        
        send_approver_notification(approvers, title, body, data)
        frappe.logger().info(f"✅ WFH approval notification sent to {len(approvers)} approvers for {request_id}")
        
    except Exception as e:
        frappe.logger().error(f"❌ Error sending WFH approval notification: {str(e)}")


def send_travel_approval_notification(request_id, notification_type="submitted"):
    """Send notification to travel approvers when new request is submitted."""
    try:
        travel_request = frappe.get_doc("Travel Request", request_id)
        
        # Get all approvers
        approvers = []
        
        # Employee's reports_to
        employee = frappe.get_doc("Employee", travel_request.employee)
        if employee.reports_to:
            reports_to_user = frappe.get_value("Employee", employee.reports_to, "user_id")
            if reports_to_user:
                approvers.append(reports_to_user)
        
        # Department approvers
        if travel_request.department:
            dept_approvers = frappe.db.sql(
                """SELECT employee FROM `tabDepartment Approver` 
                   WHERE parent = %s""",
                travel_request.department,
                as_dict=False
            )
            approvers.extend([a[0] for a in dept_approvers])
        
        # HR managers as fallback
        if not approvers:
            hr_managers = frappe.get_all(
                "User",
                filters={"roles": "HR Manager"},
                pluck="name"
            )
            approvers.extend(hr_managers)
        
        if not approvers:
            frappe.logger().warning(f"⚠️ No approvers found for travel request {request_id}")
            return
        
        approvers = list(set(approvers))
        
        if notification_type == "submitted":
            title = f"New Travel Request - {travel_request.employee_name}"
            body = f"Travel request from {travel_request.travel_from_date} to {travel_request.travel_to_date} pending approval"
        elif notification_type == "resubmitted":
            title = f"Travel Request Resubmitted - {travel_request.employee_name}"
            body = f"Updated travel request pending approval"
        else:
            return
        
        data = {
            "type": "travel_request",
            "request_id": request_id,
            "employee": travel_request.employee,
            "notification_type": notification_type,
            "from_date": str(travel_request.travel_from_date),
            "to_date": str(travel_request.travel_to_date)
        }
        
        send_approver_notification(approvers, title, body, data)
        frappe.logger().info(f"✅ Travel approval notification sent to {len(approvers)} approvers for {request_id}")
        
    except Exception as e:
        frappe.logger().error(f"❌ Error sending travel approval notification: {str(e)}")


def send_comp_leave_approval_notification(request_id, notification_type="submitted"):
    """Send notification to approvers when new comp leave request is submitted."""
    try:
        comp_off = frappe.get_doc("Compensatory Leave Request", request_id)
        
        # Get all approvers
        approvers = []
        
        # Employee's leave approver
        employee = frappe.get_doc("Employee", comp_off.employee)
        if employee.leave_approver:
            approvers.append(employee.leave_approver)
        
        # Department leave approvers
        if comp_off.department:
            dept_approvers = frappe.db.sql(
                """SELECT employee FROM `tabDepartment Approver` 
                   WHERE parent = %s AND approver_type = 'Leave Approver'""",
                comp_off.department,
                as_dict=False
            )
            approvers.extend([a[0] for a in dept_approvers])
        
        # HR managers as fallback
        if not approvers:
            hr_managers = frappe.get_all(
                "User",
                filters={"roles": "HR Manager"},
                pluck="name"
            )
            approvers.extend(hr_managers)
        
        if not approvers:
            frappe.logger().warning(f"⚠️ No approvers found for comp leave request {request_id}")
            return
        
        approvers = list(set(approvers))
        
        if notification_type == "submitted":
            title = f"New Comp Leave Request - {comp_off.employee_name}"
            body = f"Compensatory leave request from {comp_off.work_from_date} to {comp_off.work_end_date} pending approval"
        elif notification_type == "resubmitted":
            title = f"Comp Leave Request Resubmitted - {comp_off.employee_name}"
            body = f"Updated compensatory leave request pending approval"
        else:
            return
        
        data = {
            "type": "comp_leave_request",
            "request_id": request_id,
            "employee": comp_off.employee,
            "notification_type": notification_type,
            "from_date": str(comp_off.work_from_date),
            "to_date": str(comp_off.work_end_date)
        }
        
        send_approver_notification(approvers, title, body, data)
        frappe.logger().info(f"✅ Comp leave approval notification sent to {len(approvers)} approvers for {request_id}")
        
    except Exception as e:
        frappe.logger().error(f"❌ Error sending comp leave approval notification: {str(e)}")


# Admin Dashboard Statistics
@frappe.whitelist(allow_guest=False)
def get_employee_statistics():
    """Get comprehensive employee statistics for admin dashboard."""
    try:
        if not any(role in frappe.get_roles() for role in ["System Manager", "HR Manager", "HR User"]):
            frappe.throw(_("You do not have permission to access this resource."), frappe.PermissionError)

        today = getdate()
        
        all_employees = frappe.get_all(
            "Employee",
            filters={"status": "Active"},
            fields=["name", "employee_name"]
        )
        total_employees = len(all_employees)
        
        today_attendance = frappe.get_all(
            "Attendance",
            filters={
                "attendance_date": today,
                "docstatus": ["!=", 2]
            },
            fields=["employee", "employee_name", "status", "in_time"]
        )
        
        present_today = len([att for att in today_attendance if att.status in ["Present", "On Site"]])
        wfh_today = len([att for att in today_attendance if att.status == "Work From Home"])
        
        attended_employee_ids = {att.employee for att in today_attendance if att.status in ["Present", "Work From Home", "On Site"]}
        
        absent_today = 0
        employees_on_holiday = 0
        
        for emp in all_employees:
            if emp.name not in attended_employee_ids:
                is_holiday = is_employee_on_holiday(emp.name, today)
                
                if is_holiday:
                    employees_on_holiday += 1
                else:
                    absent_today += 1
        
        late_arrivals = 0
        for att in today_attendance:
            if att.in_time and att.status in ["Present", "On Site"]:
                if is_late_arrival(att.in_time):
                    late_arrivals += 1
        
        on_leave = frappe.db.count(
            "Leave Application",
            filters={
                "from_date": ["<=", today],
                "to_date": [">=", today],
                "status": "Approved",
                "docstatus": 1
            }
        )
        
        working_employees = total_employees - employees_on_holiday
        attendance_rate = round((len(today_attendance) / working_employees * 100), 1) if working_employees > 0 else 0
        
        return {
            "totalEmployees": total_employees,
            "presentToday": present_today,
            "absentToday": absent_today,
            "wfhToday": wfh_today,
            "onLeave": on_leave,
            "lateArrivals": late_arrivals,
            "employeesOnHoliday": employees_on_holiday,
            "workingEmployees": working_employees,
            "attendanceRate": attendance_rate
        }
        
    except Exception as e:
        frappe.log_error(f"Get Employee Statistics Error: {str(e)[:100]}")
        return {
            "totalEmployees": 0,
            "presentToday": 0,
            "absentToday": 0,
            "wfhToday": 0,
            "onLeave": 0,
            "lateArrivals": 0,
            "employeesOnHoliday": 0,
            "workingEmployees": 0,
            "attendanceRate": 0
        }


def is_employee_on_holiday(employee_id, date):
    """Check if a specific employee is on holiday for a given date."""
    try:
        holiday_list = get_holiday_list_for_employee(employee_id, raise_exception=False)
        if not holiday_list:
            return False
        
        return frappe.db.exists("Holiday", {
            "parent": holiday_list, 
            "holiday_date": date
        })
    except Exception:
        return False


@frappe.whitelist(allow_guest=False)
def get_absent_employees_list():
    """Get list of employees who are absent today."""
    try:
        if not any(role in frappe.get_roles() for role in ["System Manager", "HR Manager", "HR User"]):
            frappe.throw(_("You do not have permission to access this resource."), frappe.PermissionError)

        today = getdate()
        
        all_employees = frappe.get_all(
            "Employee",
            filters={"status": "Active"},
            fields=["name", "employee_name", "department", "designation", "user_id"]
        )

        today_attendance = frappe.get_all(
            "Attendance",
            filters={
                "attendance_date": today,
                "docstatus": ["!=", 2]
            },
            fields=["employee"]
        )

        present_employee_ids = {att.employee for att in today_attendance}
        
        absent_employees = []
        for emp in all_employees:
            if emp.name not in present_employee_ids:
                holiday_list = get_holiday_list_for_employee(emp.name, raise_exception=False)
                is_holiday = False
                if holiday_list:
                    is_holiday = frappe.db.exists("Holiday", {
                        "parent": holiday_list, 
                        "holiday_date": today
                    })
                
                if not is_holiday:
                    absent_employees.append({
                        "employee_id": emp.name,
                        "employee_name": emp.employee_name,
                        "department": emp.department or "Not Assigned",
                        "designation": emp.designation or "Not Assigned"
                    })

        return {
            "absent_employees": absent_employees,
            "total_absent": len(absent_employees),
            "date": today.strftime("%Y-%m-%d")
        }

    except Exception as e:
        frappe.log_error(f"Get Absent Employees Error: {str(e)[:100]}")
        frappe.throw(_("Failed to fetch absent employees: {0}").format(str(e)))


@frappe.whitelist(allow_guest=False)
def get_late_arrivals_list():
    """Get list of employees who arrived late today (after 10:05 AM)."""
    try:
        if not any(role in frappe.get_roles() for role in ["System Manager", "HR Manager", "HR User"]):
            frappe.throw(_("You do not have permission to access this resource."), frappe.PermissionError)

        today = getdate()
        
        today_attendance = frappe.get_all(
            "Attendance",
            filters={
                "attendance_date": today,
                "docstatus": ["!=", 2],
                "status": "Present",
                "in_time": ["is", "set"]
            },
            fields=["employee", "employee_name", "in_time"]
        )
        
        late_employees = []
        from datetime import time, datetime
        standard_time = time(10, 5)  # 10:05 AM
        
        for att in today_attendance:
            if att.in_time:
                try:
                    if isinstance(att.in_time, str):
                        if ' ' in att.in_time:
                            check_in_time = datetime.strptime(att.in_time.split(' ')[1], "%H:%M:%S").time()
                        else:
                            check_in_time = datetime.strptime(att.in_time, "%H:%M:%S").time()
                    else:
                        check_in_time = att.in_time.time() if hasattr(att.in_time, 'time') else att.in_time
                    
                    if check_in_time > standard_time:
                        emp_details = frappe.get_value(
                            "Employee", 
                            att.employee, 
                            ["department", "designation"], 
                            as_dict=True
                        )
                        
                        late_minutes = (datetime.combine(today, check_in_time) - 
                                      datetime.combine(today, standard_time)).total_seconds() / 60
                        
                        late_employees.append({
                            "employee_id": att.employee,
                            "employee_name": att.employee_name,
                            "department": emp_details.department if emp_details else "Not Assigned",
                            "designation": emp_details.designation if emp_details else "Not Assigned",
                            "check_in_time": att.in_time,
                            "late_by_minutes": int(late_minutes)
                        })
                        
                except Exception as parse_error:
                    frappe.log_error(f"Time parsing error for {att.employee}: {str(parse_error)}")
                    continue

        late_employees.sort(key=lambda x: x["late_by_minutes"], reverse=True)

        return {
            "late_employees": late_employees,
            "total_late": len(late_employees),
            "date": today.strftime("%Y-%m-%d"),
            "threshold_time": "10:05 AM"
        }

    except Exception as e:
        frappe.log_error(f"Get Late Arrivals Error: {str(e)[:100]}")
        frappe.throw(_("Failed to fetch late arrivals: {0}").format(str(e)))


@frappe.whitelist(allow_guest=False)
def get_department_statistics():
    """Get department-wise attendance statistics excluding employees on holidays."""
    try:
        if not any(role in frappe.get_roles() for role in ["System Manager", "HR Manager", "HR User"]):
            frappe.throw(_("You do not have permission to access this resource."), frappe.PermissionError)

        today = getdate()
        
        employees = frappe.get_all(
            "Employee",
            filters={"status": "Active"},
            fields=["name", "department"]
        )
        
        today_attendance = frappe.get_all(
            "Attendance",
            filters={
                "attendance_date": today,
                "docstatus": ["!=", 2],
                "status": ["in", ["Present", "Work From Home", "On Site"]]
            },
            fields=["employee"]
        )
        
        present_employees = {att.employee for att in today_attendance}
        
        department_stats = {}
        for emp in employees:
            dept = emp.department or "Not Assigned"
            if dept not in department_stats:
                department_stats[dept] = {"total": 0, "present": 0, "holiday": 0}
            
            is_holiday = is_employee_on_holiday(emp.name, today)
            
            if is_holiday:
                department_stats[dept]["holiday"] += 1
            else:
                department_stats[dept]["total"] += 1
                if emp.name in present_employees:
                    department_stats[dept]["present"] += 1
        
        result = []
        for dept_name, stats in department_stats.items():
            working_employees = stats["total"]
            result.append({
                "department": dept_name,
                "total": stats["total"] + stats["holiday"],
                "working_today": working_employees,
                "present": stats["present"],
                "holiday": stats["holiday"],
                "attendance_percentage": round((stats["present"] / working_employees * 100), 1) if working_employees > 0 else 0
            })
        
        result.sort(key=lambda x: x["total"], reverse=True)
        return result
        
    except Exception as e:
        frappe.log_error(f"Get Department Statistics Error: {str(e)[:100]}")
        return []


@frappe.whitelist(allow_guest=False)
def get_admin_attendance_analytics(period="week"):
    """Get attendance analytics for different time periods, excluding holidays (Admin Dashboard)."""
    try:
        if not any(role in frappe.get_roles() for role in ["System Manager", "HR Manager", "HR User"]):
            frappe.throw(_("You do not have permission to access this resource."), frappe.PermissionError)

        today = getdate()
        
        if period == "week":
            from datetime import timedelta
            start_date = today - timedelta(days=6)
            
            daily_stats = []
            total_attendance = 0
            total_working_days = 0
            
            for i in range(7):
                current_date = start_date + timedelta(days=i)
                
                all_employees = frappe.get_all("Employee", filters={"status": "Active"}, pluck="name")
                total_employees = len(all_employees)
                
                employees_on_holiday = 0
                for emp in all_employees:
                    if is_employee_on_holiday(emp, current_date):
                        employees_on_holiday += 1
                
                working_employees = total_employees - employees_on_holiday
                
                attendance_count = frappe.db.count(
                    "Attendance",
                    filters={
                        "attendance_date": current_date,
                        "docstatus": ["!=", 2],
                        "status": ["in", ["Present", "Work From Home", "On Site"]]
                    }
                )
                
                percentage = round((attendance_count / working_employees * 100), 1) if working_employees > 0 else 0
                
                daily_stats.append({
                    "date": current_date.strftime("%Y-%m-%d"),
                    "day": current_date.strftime("%a"),
                    "present": attendance_count,
                    "total": total_employees,
                    "working": working_employees,
                    "holiday": employees_on_holiday,
                    "percentage": percentage
                })
                
                total_attendance += attendance_count
                total_working_days += working_employees
            
            avg_attendance = round((total_attendance / total_working_days * 100), 1) if total_working_days > 0 else 0
            
            return {
                "weeklyTrend": daily_stats,
                "averageAttendance": avg_attendance,
                "period": period,
                "trends": {
                    "improving": avg_attendance > 80,
                    "stable": 70 <= avg_attendance <= 80,
                    "declining": avg_attendance < 70
                }
            }
        
        else:
            return {
                "weeklyTrend": [],
                "averageAttendance": 0,
                "period": period,
                "trends": {}
            }
        
    except Exception as e:
        frappe.log_error(f"Get Attendance Analytics Error: {str(e)[:100]}")
        return {
            "weeklyTrend": [],
            "averageAttendance": 0,
            "period": period,
            "trends": {}
        }


@frappe.whitelist(allow_guest=False)
def get_attendance_by_date(date, employee_id=None, department=None):
    """Fetch attendance records by date with optional filters."""
    try:
        if not any(role in frappe.get_roles() for role in ["System Manager", "HR Manager", "HR User"]):
            frappe.throw(_("You do not have permission to access this resource."), frappe.PermissionError)
        
        if not date:
            frappe.throw(_("Date is required"))
        
        date = getdate(date)
        
        filters = {
            "attendance_date": date,
            "docstatus": ["!=", 2]
        }
        
        if employee_id:
            filters["employee"] = employee_id
        
        if department:
            dept_employees = frappe.get_all("Employee", 
                filters={"department": department, "status": "Active"}, 
                pluck="name"
            )
            if dept_employees:
                filters["employee"] = ["in", dept_employees]
            else:
                return {
                    "attendance_records": [],
                    "total_records": 0,
                    "date": date.strftime("%Y-%m-%d"),
                    "summary": {
                        "total": 0, "present": 0, "absent": 0, 
                        "missing_checkout": 0, "draft": 0
                    }
                }
        
        attendance_records = frappe.get_all(
            "Attendance",
            filters=filters,
            fields=[
                "name", "employee", "employee_name", "attendance_date",
                "in_time", "out_time", "custom_out_time_copy", "status",
                "docstatus", "working_hours", "late_entry", "early_exit",
                "custom_work_type", "creation", "modified"
            ],
            order_by="in_time desc"
        )
        
        employee_dept_map = {}
        if attendance_records:
            employee_ids = [record.employee for record in attendance_records]
            dept_info = frappe.get_all("Employee", 
                filters={"name": ["in", employee_ids]},
                fields=["name", "department", "designation"]
            )
            employee_dept_map = {emp.name: emp for emp in dept_info}
        
        enhanced_records = []
        summary = {"total": 0, "present": 0, "absent": 0, "missing_checkout": 0, "draft": 0}
        
        for record in attendance_records:
            emp_info = employee_dept_map.get(record.employee, {})
            record.department = emp_info.get("department", "Not Assigned")
            record.designation = emp_info.get("designation", "Not Assigned")
            
            if record.in_time and (record.out_time or record.custom_out_time_copy):
                checkout_time = record.out_time or record.custom_out_time_copy
                if not record.working_hours:
                    try:
                        time_diff = checkout_time - record.in_time
                        record.working_hours = round(time_diff.total_seconds() / 3600, 2)
                    except:
                        record.working_hours = 0
            
            record.is_late = is_late_arrival(record.in_time) if record.in_time else False
            
            if record.docstatus == 0:
                summary["draft"] += 1
            elif record.status in ["Present", "Work From Home", "On Site"]:
                summary["present"] += 1
                if record.in_time and not (record.out_time or record.custom_out_time_copy):
                    summary["missing_checkout"] += 1
            else:
                summary["absent"] += 1
            
            summary["total"] += 1
            enhanced_records.append(record)
        
        if department:
            all_employees = frappe.get_all("Employee", 
                filters={"department": department, "status": "Active"}, 
                pluck="name"
            )
        elif employee_id:
            all_employees = [employee_id]
        else:
            all_employees = frappe.get_all("Employee", 
                filters={"status": "Active"}, 
                pluck="name"
            )
        
        attended_employees = [record.employee for record in enhanced_records]
        absent_employees = []
        
        for emp in all_employees:
            if emp not in attended_employees:
                if not is_employee_on_holiday(emp, date):
                    absent_employees.append(emp)
        
        summary["absent"] = len(absent_employees)
        summary["total_employees"] = len(all_employees)
        summary["attendance_rate"] = round(
            (len(attended_employees) / len(all_employees) * 100), 1
        ) if all_employees else 0
        
        return {
            "attendance_records": enhanced_records,
            "total_records": len(enhanced_records),
            "date": date.strftime("%Y-%m-%d"),
            "summary": summary,
            "absent_employees": absent_employees
        }
        
    except Exception as e:
        frappe.log_error(f"Get Attendance By Date Error: {str(e)[:100]}")
        frappe.throw(_("Failed to fetch attendance records: {0}").format(str(e)))


@frappe.whitelist(allow_guest=False)
def get_departments_list():
    """Get list of all departments for filtering."""
    try:
        departments = frappe.get_all(
            "Department",
            filters={"disabled": 0},
            fields=["name", "department_name"],
            order_by="department_name"
        )
        return departments
    except Exception as e:
        frappe.log_error(f"Get Departments Error: {str(e)}")
        return []


# ============================================================================
# NOTIFICATION SYSTEM
# ============================================================================

@frappe.whitelist(allow_guest=False)
def create_notification(title, message, target_type, target_employees=None, department=None):
    """Create and send admin notification to employees."""
    try:
        if not any(role in frappe.get_roles() for role in ["System Manager", "HR Manager", "HR User"]):
            frappe.throw(_("You do not have permission to send notifications"), frappe.PermissionError)
        
        if not title or not message:
            frappe.throw(_("Title and message are required"))
        
        # Create notification document
        notification_doc = frappe.get_doc({
            "doctype": "Notification Log",
            "subject": title,
            "email_content": message,
            "message": message,
            "type": "Alert",
            "document_type": "Employee",
            "from_user": frappe.session.user
        })
        
        # Determine target employees
        target_emp_list = []
        if target_type == "all":
            target_emp_list = frappe.get_all("Employee", 
                filters={"status": "Active"}, 
                pluck="name"
            )
        elif target_type == "department" and department:
            target_emp_list = frappe.get_all("Employee", 
                filters={"department": department, "status": "Active"}, 
                pluck="name"
            )
        elif target_type == "specific" and target_employees:
            target_emp_list = json.loads(target_employees) if isinstance(target_employees, str) else target_employees
        
        if not target_emp_list:
            frappe.throw(_("No target employees found"))
        
        # Get FCM tokens for target employees using Mobile Device table
        tokens = []
        for emp_id in target_emp_list:
            user_id = frappe.get_value("Employee", emp_id, "user_id")
            if user_id:
                emp_tokens = frappe.get_all("Mobile Device", 
                    filters={"user": user_id}, 
                    pluck="fcm_token"
                )
                tokens.extend([t for t in emp_tokens if t])
        
        # Send FCM notification
        if tokens:
            response = send_fcm_notification(tokens, title, message)
            frappe.log_error(f"FCM Response: {response}", "Admin Notification")
        
        # Save notification for each target employee
        for emp_id in target_emp_list:
            notification_doc.for_user = frappe.get_value("Employee", emp_id, "user_id")
            if notification_doc.for_user:
                notification_copy = frappe.copy_doc(notification_doc)
                notification_copy.insert(ignore_permissions=True)
        
        frappe.db.commit()
        
        return {
            "status": "success",
            "message": f"Notification sent to {len(target_emp_list)} employees",
            "sent_count": len(target_emp_list)
        }
        
    except Exception as e:
        frappe.log_error(f"Create Notification Error: {str(e)}")
        frappe.throw(_("Failed to create notification: {0}").format(str(e)))


@frappe.whitelist(allow_guest=False)
def send_admin_broadcast(title, body, target_type, target_ids=None, department_id=None):
    """Send admin broadcast notification."""
    try:
        return create_notification(title, body, target_type, target_ids, department_id)
    except Exception as e:
        frappe.log_error(f"Send Admin Broadcast Error: {str(e)}")
        frappe.throw(_("Failed to send broadcast: {0}").format(str(e)))


@frappe.whitelist()
def submit_wfh_request(request_type, from_date, to_date, reason):
    """Submit WFH request and notify admin."""
    try:
        employee = get_employee_by_user()
        if not employee:
            frappe.throw(_("Employee record not found"), frappe.PermissionError)
        
        # Convert dates
        from_date = getdate(from_date)
        to_date = getdate(to_date)
        
        # Check for overlapping requests (same employee, overlapping dates, pending/approved)
        overlapping = frappe.db.sql("""
            SELECT name, from_date, to_date, status
            FROM `tabWork From Home Request`
            WHERE employee = %s
            AND status IN ('Pending', 'Approved')
            AND (
                (from_date <= %s AND to_date >= %s) OR
                (from_date <= %s AND to_date >= %s) OR
                (from_date >= %s AND to_date <= %s)
            )
        """, (employee, from_date, from_date, to_date, to_date, from_date, to_date), as_dict=True)
        
        if overlapping:
            frappe.throw(_(
                "You already have a WFH request for overlapping dates: "
                f"{overlapping[0].from_date} to {overlapping[0].to_date} ({overlapping[0].status})"
            ))
        
        # Create WFH request document
        wfh_request = frappe.get_doc({
            "doctype": "Work From Home Request",
            "employee": employee,
            "request_type": request_type,
            "from_date": from_date,
            "to_date": to_date,
            "reason": reason,
            "status": "Pending"
        })
        
        wfh_request.insert(ignore_permissions=True)
        frappe.db.commit()
        
        # Notify admins/HR managers
        admin_users = []
        for role in ["System Manager", "HR Manager", "HR User"]:
            role_users = frappe.get_all("Has Role", 
                filters={"role": role}, 
                pluck="parent"
            )
            admin_users.extend(role_users)
        
        admin_users = list(set(admin_users))  # Remove duplicates
        
        # Get admin FCM tokens from Mobile Device table
        admin_tokens = []
        for user in admin_users:
            tokens = frappe.get_all("Mobile Device", 
                filters={"user": user}, 
                pluck="fcm_token"
            )
            admin_tokens.extend([t for t in tokens if t])  # Filter out None/empty
        
        # Send notification to admins
        if admin_tokens:
            emp_name = frappe.get_value("Employee", employee, "employee_name")
            title = "New WFH Request"
            message = f"{emp_name} has requested work from home from {from_date} to {to_date}"
            
            response = send_fcm_notification(admin_tokens, title, message)
            frappe.log_error(f"WFH Notification Response: {response}", "WFH Request")
        
        return {
            "status": "success",
            "message": "WFH request submitted successfully",
            "name": wfh_request.name
        }
        
    except frappe.DuplicateEntryError:
        frappe.log_error("Duplicate WFH request entry detected", "WFH Request Error")
        frappe.throw(_("A WFH request with similar details already exists. Please try again."))
    except Exception as e:
        error_msg = str(e)[:100]
        frappe.log_error(f"WFH Error: {error_msg}", "WFH Request")
        frappe.throw(_("Failed to submit WFH request. Please try again or contact support."))

@frappe.whitelist()
def delete_wfh_request(request_id):
    """Delete a WFH request (only for pending requests by the owner)."""
    try:
        if not request_id:
            frappe.throw(_("Request ID is required"))
        
        if not frappe.db.exists("Work From Home Request", request_id):
            frappe.throw(_("WFH request not found"))
        
        # Get the WFH request
        wfh_request = frappe.get_doc("Work From Home Request", request_id)
        
        # Get current user's employee ID
        current_user = frappe.session.user
        employee_id = frappe.db.get_value(
            "Employee",
            {"user_id": current_user, "status": "Active"},
            "name"
        )
        
        # Check if user is the owner or has admin permissions
        is_admin = any(role in frappe.get_roles() for role in ["System Manager", "HR Manager", "HR User"])
        is_owner = (employee_id == wfh_request.employee)
        
        if not (is_owner or is_admin):
            frappe.throw(_("You do not have permission to delete this request"), frappe.PermissionError)
        
        # Only allow deletion of pending requests
        if wfh_request.status != "Pending":
            frappe.throw(_("Only pending requests can be deleted"))
        
        # Delete the request
        frappe.delete_doc("Work From Home Request", request_id, ignore_permissions=True)
        frappe.db.commit()
        
        return {
            "status": "success",
            "message": "WFH request deleted successfully"
        }
        
    except Exception as e:
        frappe.log_error(f"Delete WFH Request Error: {str(e)}")
        frappe.throw(_("Failed to delete WFH request: {0}").format(str(e)))

@frappe.whitelist()
def get_wfh_requests():
    """Get WFH requests for current employee."""
    try:
        employee = get_employee_by_user()
        if not employee:
            return []
        
        requests = frappe.get_all("Work From Home Request",
            filters={"employee": employee},
            fields=["name", "from_date", "to_date", "reason", "status", "creation", "approved_by"],
            order_by="creation desc"
        )
        
        return requests
        
    except Exception as e:
        frappe.log_error(f"Get WFH Requests Error: {str(e)}")
        return []


@frappe.whitelist()
def get_pending_wfh_requests():
    """Get all pending WFH requests for admin approval."""
    try:
        # Check if user has admin permissions
        if not any(role in frappe.get_roles() for role in ["System Manager", "HR Manager", "HR User"]):
            frappe.throw(_("You do not have permission to view WFH requests"), frappe.PermissionError)
        
        requests = frappe.get_all("Work From Home Request",
            filters={"status": "Pending"},
            fields=[
                "name", "employee", "employee_name", "from_date", "to_date", 
                "reason", "status", "creation", "modified"
            ],
            order_by="creation desc"
        )
        
        return requests
        
    except Exception as e:
        frappe.log_error(f"Get Pending WFH Requests Error: {str(e)}")
        return []


@frappe.whitelist()
def wfh_request_action():
    """Handle WFH request approval/rejection."""
    try:
        request_id = frappe.form_dict.get('request_id')
        action = frappe.form_dict.get('action')  # 'approve' or 'reject'
        
        if not request_id or not action:
            frappe.throw(_("Request ID and action are required"))
        
        if not any(role in frappe.get_roles() for role in ["System Manager", "HR Manager", "HR User"]):
            frappe.throw(_("You do not have permission to process WFH requests"), frappe.PermissionError)
        
        # Get the WFH request
        wfh_request = frappe.get_doc("Work From Home Request", request_id)
        
        if wfh_request.status != "Pending":
            frappe.throw(_("Request has already been processed"))
        
        # Update request status
        if action == 'approve':
            wfh_request.status = "Approved"
            wfh_request.approved_by = frappe.session.user
            wfh_request.approved_on = frappe.utils.now()
            
            # Auto-enable WFH for employee
            try:
                employee_doc = frappe.get_doc("Employee", wfh_request.employee)
                employee_doc.custom_wfh_eligible = 1
                employee_doc.save(ignore_permissions=True)
                
                frappe.log_error(f"Auto-enabled WFH for employee {wfh_request.employee}", "WFH Auto Enable")
            except Exception as e:
                frappe.log_error(f"Failed to auto-enable WFH for {wfh_request.employee}: {str(e)}", "WFH Auto Enable Error")
            
        elif action == 'reject':
            wfh_request.status = "Rejected"
            wfh_request.rejected_by = frappe.session.user
            wfh_request.rejected_on = frappe.utils.now()
        else:
            frappe.throw(_("Invalid action"))
        
        wfh_request.save(ignore_permissions=True)
        
        # Send notification to employee
        try:
            employee_doc = frappe.get_doc("Employee", wfh_request.employee)
            if hasattr(employee_doc, 'user_id') and employee_doc.user_id:
                notification_title = f"WFH Request {action.title()}"
                notification_message = f"Your WFH request from {wfh_request.from_date} to {wfh_request.to_date} has been {action}d"
                
                # Send FCM notification
                send_employee_notification(
                    employee_id=wfh_request.employee,
                    title=notification_title,
                    message=notification_message,
                    data={
                        'type': 'wfh_response',
                        'request_id': request_id,
                        'action': action
                    }
                )
        except Exception as e:
            frappe.log_error(f"Failed to send notification: {str(e)}", "WFH Notification Error")
        
        return {
            "success": True,
            "message": f"Request {action}d successfully"
        }
        
    except Exception as e:
        frappe.log_error(f"WFH Request Action Error: {str(e)}")
        frappe.throw(_("Failed to process request: {0}").format(str(e)))


@frappe.whitelist()
def enable_wfh_for_employee():
    """Enable WFH for specific employee."""
    try:
        employee_id = frappe.form_dict.get('employee_id')
        
        if not employee_id:
            frappe.throw(_("Employee ID is required"))
        
        if not any(role in frappe.get_roles() for role in ["System Manager", "HR Manager", "HR User"]):
            frappe.throw(_("You do not have permission to modify WFH settings"), frappe.PermissionError)
        
        employee_doc = frappe.get_doc("Employee", employee_id)
        employee_doc.custom_wfh_eligible = 1
        employee_doc.save(ignore_permissions=True)
        
        return {
            "success": True,
            "message": f"WFH enabled for {employee_doc.employee_name}"
        }
        
    except Exception as e:
        frappe.log_error(f"Enable WFH Error: {str(e)}")
        frappe.throw(_("Failed to enable WFH: {0}").format(str(e)))


@frappe.whitelist()
def delete_wfh_request():
    """Delete a Work From Home request (only if status is Pending and user is the creator)."""
    try:
        request_id = frappe.form_dict.get('request_id')
        
        if not request_id:
            frappe.throw(_("Request ID is required"))
        
        # Get the WFH request
        wfh_request = frappe.get_doc("Work From Home Request", request_id)
        
        # Get employee record for current user
        employee = get_employee_by_user()
        
        # Security checks
        if wfh_request.employee != employee:
            frappe.throw(_("You can only delete your own WFH requests"))
            
        if wfh_request.status != "Pending":
            frappe.throw(_("Only pending requests can be deleted"))
        
        # Delete the request
        frappe.delete_doc("Work From Home Request", request_id)
        frappe.db.commit()
        
        return {
            "success": True,
            "message": "WFH request deleted successfully"
        }
        
    except Exception as e:
        frappe.log_error(f"Delete WFH Request Error: {str(e)}")
        frappe.throw(_("Failed to delete request: {0}").format(str(e)))


@frappe.whitelist()
def get_all_wfh_requests_admin():
    """Get all Work From Home requests across all statuses for admin users."""
    try:
        # Check if user has admin permissions
        if not any(role in frappe.get_roles() for role in ["System Manager", "HR Manager", "HR User"]):
            frappe.throw(_("You do not have permission to view all WFH requests"), frappe.PermissionError)
        
        # Fetch all requests (no status filter)
        requests = frappe.get_all("Work From Home Request",
            fields=[
                "name", "employee", "employee_name", "from_date", "to_date", 
                "reason", "status", "approved_by", "creation", "modified"
            ],
            order_by="creation desc"
        )
        
        return requests
        
    except Exception as e:
        frappe.log_error(f"Get All WFH Requests Admin Error: {str(e)}")
        return []




@frappe.whitelist(allow_guest=False)
def approve_wfh_request(request_id):
    """Approve WFH request."""
    try:
        if not any(role in frappe.get_roles() for role in ["System Manager", "HR Manager", "HR User"]):
            frappe.throw(_("You do not have permission to approve WFH requests"), frappe.PermissionError)
        
        wfh_request = frappe.get_doc("Work From Home Request", request_id)
        wfh_request.status = "Approved"
        wfh_request.approved_by = frappe.session.user
        wfh_request.approval_date = now_datetime()
        wfh_request.save(ignore_permissions=True)
        
        # Enable WFH for employee during the approved period
        employee = wfh_request.employee
        frappe.db.set_value("Employee", employee, "custom_wfh_enabled", 1)
        
        # Notify employee using Mobile Device table
        user_id = frappe.get_value("Employee", employee, "user_id")
        emp_tokens = []
        if user_id:
            emp_tokens = frappe.get_all("Mobile Device", 
                filters={"user": user_id}, 
                pluck="fcm_token"
            )
            emp_tokens = [t for t in emp_tokens if t]
        
        if emp_tokens:
            emp_name = frappe.get_value("Employee", employee, "employee_name")
            title = "WFH Request Approved"
            message = f"Your work from home request has been approved for {wfh_request.from_date} to {wfh_request.to_date}"
            
            send_fcm_notification(emp_tokens, title, message)
        
        frappe.db.commit()
        
        return {
            "status": "success",
            "message": "WFH request approved successfully"
        }
        
    except Exception as e:
        frappe.log_error(f"Approve WFH Request Error: {str(e)}")
        frappe.throw(_("Failed to approve WFH request: {0}").format(str(e)))


@frappe.whitelist(allow_guest=False)
def reject_wfh_request(request_id):
    """Reject WFH request."""
    try:
        if not any(role in frappe.get_roles() for role in ["System Manager", "HR Manager", "HR User"]):
            frappe.throw(_("You do not have permission to reject WFH requests"), frappe.PermissionError)
        
        wfh_request = frappe.get_doc("Work From Home Request", request_id)
        wfh_request.status = "Rejected"
        wfh_request.approved_by = frappe.session.user
        wfh_request.approval_date = now_datetime()
        wfh_request.save(ignore_permissions=True)
        
        # Notify employee using Mobile Device table
        employee = wfh_request.employee
        user_id = frappe.get_value("Employee", employee, "user_id")
        emp_tokens = []
        if user_id:
            emp_tokens = frappe.get_all("Mobile Device", 
                filters={"user": user_id}, 
                pluck="fcm_token"
            )
            emp_tokens = [t for t in emp_tokens if t]
        
        if emp_tokens:
            title = "WFH Request Rejected"
            message = f"Your work from home request for {wfh_request.from_date} to {wfh_request.to_date} has been rejected"
            
            send_fcm_notification(emp_tokens, title, message)
        
        frappe.db.commit()
        
        return {
            "status": "success",
            "message": "WFH request rejected"
        }
        
    except Exception as e:
        frappe.log_error(f"Reject WFH Request Error: {str(e)}")
        frappe.throw(_("Failed to reject WFH request: {0}").format(str(e)))


@frappe.whitelist()
def send_wfh_notification(requestData):
    """Send WFH notification (wrapper for submit_wfh_request)."""
    try:
        return submit_wfh_request(
            requestData.get('request_type'),
            requestData.get('from_date'),
            requestData.get('to_date'),
            requestData.get('reason')
        )
    except Exception as e:
        frappe.log_error(f"Send WFH Notification Error: {str(e)}")
        frappe.throw(_("Failed to send WFH notification: {0}").format(str(e)))


@frappe.whitelist()
def get_notification_settings():
    """Get user notification settings."""
    try:
        employee = get_employee_by_user()
        if not employee:
            return {"notifications_enabled": False}
        
        settings = frappe.get_value("Employee", employee, 
            ["custom_notifications_enabled", "custom_project_reminders", "custom_attendance_reminders"],
            as_dict=True
        ) or {}
        
        return {
            "notifications_enabled": settings.get("custom_notifications_enabled", True),
            "project_reminders": settings.get("custom_project_reminders", True),
            "attendance_reminders": settings.get("custom_attendance_reminders", True)
        }
        
    except Exception as e:
        frappe.log_error(f"Get Notification Settings Error: {str(e)}")
        return {"notifications_enabled": False}


@frappe.whitelist()
def update_notification_settings(settings):
    """Update user notification settings."""
    try:
        employee = get_employee_by_user()
        if not employee:
            frappe.throw(_("Employee record not found"))
        
        if isinstance(settings, str):
            settings = json.loads(settings)
        
        frappe.db.set_value("Employee", employee, {
            "custom_notifications_enabled": settings.get("notifications_enabled", True),
            "custom_project_reminders": settings.get("project_reminders", True),
            "custom_attendance_reminders": settings.get("attendance_reminders", True)
        })
        
        frappe.db.commit()
        
        return {
            "status": "success",
            "message": "Notification settings updated"
        }
        
    except Exception as e:
        frappe.log_error(f"Update Notification Settings Error: {str(e)}")
        frappe.throw(_("Failed to update notification settings: {0}").format(str(e)))


# ============================================================================
# NOTIFICATION SCHEDULER
# ============================================================================

def is_employee_on_leave(employee_id, date):
    """Check if an employee has approved leave on a specific date."""
    try:
        leave_exists = frappe.db.exists("Leave Application", {
            "employee": employee_id,
            "status": "Approved",
            "docstatus": 1,
            "from_date": ["<=", date],
            "to_date": [">=", date]
        })
        return bool(leave_exists)
    except Exception:
        return False


def send_checkin_reminder():
    """Send morning check-in reminder at 10:00 AM only on working days.
    
    Excludes:
    - Weekends (Saturday, Sunday)
    - Employees on holiday
    - Employees on approved leave
    """
    try:
        import datetime
        current_time = datetime.datetime.now()
        today = current_time.date()
        
        # Check if it's a weekday (Monday=0, Sunday=6)
        if current_time.weekday() > 4:  # Saturday=5, Sunday=6
            frappe.log_error("Skipping check-in reminder - Weekend", "Check-in Reminder")
            return
        
        # Get employees who haven't checked in yet
        employees_not_checked_in = frappe.db.sql("""
            SELECT e.name, e.employee_name, e.user_id
            FROM `tabEmployee` e
            WHERE e.status = 'Active'
            AND e.user_id IS NOT NULL
            AND e.user_id != ''
            AND NOT EXISTS (
                SELECT 1 FROM `tabAttendance` a
                WHERE a.employee = e.name
                AND a.attendance_date = %s
                AND a.docstatus != 2
            )
        """, (today,), as_dict=True)
        
        if not employees_not_checked_in:
            frappe.log_error(f"No employees need check-in reminder. All {frappe.db.count('Employee', {'status': 'Active'})} active employees have already checked in.", "Check-in Reminder")
            return
        
        # Filter out employees who are on holiday or leave, and get FCM tokens
        tokens = []
        employees_notified = []
        employees_on_holiday = []
        employees_on_leave = []
        
        for emp in employees_not_checked_in:
            # Check if employee is on holiday today
            if is_employee_on_holiday(emp.name, today):
                employees_on_holiday.append(emp.employee_name)
                continue
            
            # Check if employee is on approved leave today
            if is_employee_on_leave(emp.name, today):
                employees_on_leave.append(emp.employee_name)
                continue
            
            if emp.user_id:
                emp_tokens = frappe.get_all("Mobile Device", 
                    filters={"user": emp.user_id}, 
                    pluck="fcm_token"
                )
                valid_tokens = [t for t in emp_tokens if t]
                if valid_tokens:
                    tokens.extend(valid_tokens)
                    employees_notified.append(emp.employee_name)
        
        frappe.log_error(f"Check-in reminder: {len(employees_not_checked_in)} without check-in, {len(employees_on_holiday)} on holiday, {len(employees_on_leave)} on leave, {len(employees_notified)} to notify", "Check-in Reminder")
        
        if tokens:
            title = "Check-in Reminder"
            message = "Good morning! Don't forget to check in when you arrive at the office."
            
            response = send_fcm_notification(tokens, title, message)
            frappe.log_error(f"✅ Check-in reminder sent to {len(tokens)} devices for {len(employees_notified)} employees.", "Attendance Reminder")
        else:
            frappe.log_error("No FCM tokens found for eligible employees (excluding holidays and leaves)", "Check-in Reminder")
            
    except Exception as e:
        frappe.log_error(f"Check-in Reminder Error: {str(e)}", "Notification Scheduler")


def send_checkout_reminder():
    """Send evening check-out reminder at 7:00 PM only on working days.
    
    Excludes:
    - Weekends (Saturday, Sunday)
    - Employees on holiday
    - Employees on approved leave
    """
    try:
        import datetime
        current_time = datetime.datetime.now()
        today = current_time.date()
        
        # Check if it's a weekday (Monday=0, Sunday=6)
        if current_time.weekday() > 4:  # Saturday=5, Sunday=6
            frappe.log_error("Skipping check-out reminder - Weekend", "Check-out Reminder")
            return
        
        # Get employees who checked in but haven't checked out
        employees_need_checkout = frappe.db.sql("""
            SELECT e.name, e.employee_name, e.user_id, a.name as attendance_id
            FROM `tabEmployee` e
            JOIN `tabAttendance` a ON e.name = a.employee
            WHERE e.status = 'Active'
            AND e.user_id IS NOT NULL
            AND e.user_id != ''
            AND a.attendance_date = %s
            AND a.docstatus != 2
            AND a.in_time IS NOT NULL
            AND (a.out_time IS NULL AND a.custom_out_time_copy IS NULL)
        """, (today,), as_dict=True)
        
        if not employees_need_checkout:
            frappe.log_error("No employees found for check-out reminder", "Check-out Reminder")
            return
        
        # Filter out employees who are on holiday or leave, and get FCM tokens
        tokens = []
        employees_notified = []
        employees_on_holiday = []
        employees_on_leave = []
        
        for emp in employees_need_checkout:
            # Check if employee is on holiday today
            if is_employee_on_holiday(emp.name, today):
                employees_on_holiday.append(emp.employee_name)
                continue
            
            # Check if employee is on approved leave today
            if is_employee_on_leave(emp.name, today):
                employees_on_leave.append(emp.employee_name)
                continue
            
            if emp.user_id:
                emp_tokens = frappe.get_all("Mobile Device", 
                    filters={"user": emp.user_id}, 
                    pluck="fcm_token"
                )
                valid_tokens = [t for t in emp_tokens if t]
                if valid_tokens:
                    tokens.extend(valid_tokens)
                    employees_notified.append(emp.employee_name)
        
        frappe.log_error(f"Check-out reminder: {len(employees_need_checkout)} need checkout, {len(employees_on_holiday)} on holiday, {len(employees_on_leave)} on leave, {len(employees_notified)} to notify", "Check-out Reminder")
        
        if tokens:
            title = "Check-out Reminder"
            message = "Don't forget to check out before leaving the office!"
            
            response = send_fcm_notification(tokens, title, message)
            frappe.log_error(f"✅ Check-out reminder sent to {len(tokens)} devices for {len(employees_notified)} employees.", "Attendance Reminder")
        else:
            frappe.log_error("No FCM tokens found for eligible employees (excluding holidays and leaves)", "Check-out Reminder")
            
    except Exception as e:
        frappe.log_error(f"Check-out Reminder Error: {str(e)}", "Notification Scheduler")


def send_attendance_reminders():
    """Daily attendance reminder check."""
    try:
        # This function can be used for additional daily checks
        # For now, we rely on cron jobs for specific times
        pass
    except Exception as e:
        frappe.log_error(f"Daily Attendance Reminder Error: {str(e)}", "Notification Scheduler")


def send_work_log_reminder():
    """Send hourly work log reminders during office hours (10 AM - 7 PM) only on working days.
    
    This reminder is sent to all employees who have checked in today.
    
    Excludes:
    - Weekends (Saturday, Sunday)
    - Outside office hours (before 10 AM or after 7 PM)
    - Employees on holiday
    - Employees on approved leave
    """
    try:
        import datetime
        current_time = datetime.datetime.now()
        current_hour = current_time.hour
        today = current_time.date()
        
        # Only send during office hours (10 AM to 7 PM)
        if current_hour < 10 or current_hour > 19:
            frappe.log_error(f"Skipping work log reminder - Outside office hours ({current_hour}:00)", "Work Log Reminder")
            return
        
        # Check if it's a weekday (Monday=0, Sunday=6)
        if current_time.weekday() > 4:  # Saturday=5, Sunday=6
            frappe.log_error("Skipping work log reminder - Weekend", "Work Log Reminder")
            return
        
        # Get all active employees who have checked in today
        employees_checked_in = frappe.db.sql("""
            SELECT DISTINCT e.name, e.employee_name, e.user_id
            FROM `tabEmployee` e
            JOIN `tabAttendance` a ON e.name = a.employee
            WHERE e.status = 'Active'
            AND e.user_id IS NOT NULL
            AND e.user_id != ''
            AND a.attendance_date = %s
            AND a.docstatus != 2
            AND a.in_time IS NOT NULL
        """, (today,), as_dict=True)
        
        if not employees_checked_in:
            frappe.log_error("No employees with check-in found for work log reminder", "Work Log Reminder")
            return
        
        # Filter out employees who are on holiday or leave, and get FCM tokens
        tokens = []
        employees_notified = []
        employees_on_holiday = []
        employees_on_leave = []
        
        for emp in employees_checked_in:
            # Check if employee is on holiday today
            if is_employee_on_holiday(emp.name, today):
                employees_on_holiday.append(emp.employee_name)
                continue
            
            # Check if employee is on approved leave today
            if is_employee_on_leave(emp.name, today):
                employees_on_leave.append(emp.employee_name)
                continue
            
            if emp.user_id:
                emp_tokens = frappe.get_all("Mobile Device", 
                    filters={"user": emp.user_id}, 
                    pluck="fcm_token"
                )
                valid_tokens = [t for t in emp_tokens if t]
                if valid_tokens:
                    tokens.extend(valid_tokens)
                    employees_notified.append(emp.employee_name)
        
        frappe.log_error(f"Work log reminder: {len(employees_checked_in)} checked in, {len(employees_on_holiday)} on holiday, {len(employees_on_leave)} on leave, {len(employees_notified)} to notify", "Work Log Reminder")
        
        if tokens:
            title = "Work Log Reminder"
            message = "Don't forget to log your work activities! Keep track of what you've accomplished this hour."
            
            response = send_fcm_notification(tokens, title, message)
            frappe.log_error(f"✅ Work log reminder sent to {len(tokens)} devices for {len(employees_notified)} employees at {current_hour}:00", "Work Log Reminder")
        else:
            frappe.log_error("No FCM tokens found for eligible employees (excluding holidays and leaves)", "Work Log Reminder")
            
    except Exception as e:
        frappe.log_error(f"Work Log Reminder Error: {str(e)}", "Notification Scheduler")


# ============================================================================
# PROJECT MANAGEMENT MODULE
# ============================================================================

PRIV = {"Administrator", "System Manager", "HR Manager", "Project Manager"}

def _is_priv(user=None):
    """Check if user has privileged roles."""
    user = user or frappe.session.user
    return bool(set(frappe.get_roles(user)) & PRIV)

def _emp_of(user=None):
    """Get employee ID for a user."""
    user = user or frappe.session.user
    return frappe.db.get_value("Employee", {"user_id": user}, "name")

def _pm_childfield():
    """Return the fieldname of the 'Project Member' table on Project, e.g. 'members' or 'custom_project_members'."""
    meta = frappe.get_meta("Project")

    # common names first
    for fn in ("members", "project_members", "custom_project_members", "team_members"):
        df = meta.get_field(fn)
        if df and df.fieldtype == "Table" and df.options == "Project Member":
            return df.fieldname

    # fallback: scan all table fields whose options == Project Member
    for df in meta.get("fields") or []:
        if getattr(df, "fieldtype", None) == "Table" and getattr(df, "options", None) == "Project Member":
            return getattr(df, "fieldname")

    frappe.throw(_("Project DocType has no child Table field pointing to 'Project Member'. "
                   "Set the Table field's Options to 'Project Member'."), frappe.ValidationError)

# ---------------------- Member Management (Admin/HR/PM) ----------------------
@frappe.whitelist()
def assign_members(project, employee_ids, role_in_project="Contributor"):
    """Assign members to a Project regardless of the child-table fieldname."""
    if not _is_priv():
        frappe.throw(_("Not permitted."), frappe.PermissionError)

    if isinstance(employee_ids, str):
        employee_ids = frappe.parse_json(employee_ids) or []

    if not frappe.db.exists("Project", project):
        frappe.throw(_("Project {0} does not exist").format(project))

    child_field = _pm_childfield()

    # fetch existing active members from child table
    existing = set(frappe.get_all(
        "Project Member",
        filters={"parent": project, "parenttype": "Project", "docstatus": 0, "active": 1},
        pluck="employee",
    ))

    doc = frappe.get_doc("Project", project)
    doc.flags.ignore_permissions = True

    added, skipped = [], []
    for emp in employee_ids:
        if not frappe.db.exists("Employee", emp):
            skipped.append(emp)
            continue
        if emp in existing:
            skipped.append(emp)
            continue

        emp_data = frappe.db.get_value("Employee", emp, ["employee_name", "user_id"], as_dict=True) or {}
        doc.append(child_field, {
            "employee": emp,
            "employee_name": emp_data.get("employee_name"),
            "role_in_project": role_in_project,
            "active": 1,
            "user": emp_data.get("user_id"),
        })
        added.append(emp)

    if added:
        doc.save(ignore_permissions=True)
        frappe.db.commit()

    return {"ok": True, "added": added, "skipped": skipped}



@frappe.whitelist()
def remove_member(project, employee):
    """Deactivate a member row on the Project regardless of the child-table fieldname."""
    if not _is_priv():
        frappe.throw(_("Not permitted."), frappe.PermissionError)
    if not frappe.db.exists("Project", project):
        frappe.throw(_("Project {0} does not exist").format(project))
    if not frappe.db.exists("Employee", employee):
        frappe.throw(_("Employee {0} does not exist").format(employee))

    child_field = _pm_childfield()

    doc = frappe.get_doc("Project", project)
    doc.flags.ignore_permissions = True

    changed = False
    for row in (doc.get(child_field) or []):
        if row.employee == employee and (getattr(row, "active", 1) == 1):
            row.active = 0
            changed = True
            break

    if changed:
        doc.save(ignore_permissions=True)
        frappe.db.commit()
        return {"ok": True, "message": _("Member removed")}
    else:
        return {"ok": False, "message": _("Member not found or already inactive")}



# ---------------------- Admin Lists ----------------------
@frappe.whitelist()
def admin_projects(q="", limit=200):
    """Get all projects for admins."""
    if not _is_priv(): 
        frappe.throw(_("Not permitted."), frappe.PermissionError)
    
    vals = {"limit": int(limit)}
    cond = "1=1"
    if q:
        cond += " and (name like %(q)s or project_name like %(q)s)"
        vals["q"] = f"%{q}%"
    
    return frappe.db.sql(f"""
        select name, project_name, status, company, 
               expected_start_date, expected_end_date, modified, percent_complete
        from `tabProject` 
        where {cond}
        order by modified desc
        limit %(limit)s
    """, vals, as_dict=True)


@frappe.whitelist()
def admin_tasks(project=None, limit=500):
    """Get all tasks for admins."""
    if not _is_priv(): 
        frappe.throw(_("Not permitted."), frappe.PermissionError)
    
    vals = {"limit": int(limit)}
    cond = "1=1"
    if project:
        cond += " and project=%(project)s"
        vals["project"] = project
    
    return frappe.db.sql(f"""
        select name, subject, project, status, priority, 
               exp_start_date, exp_end_date, modified, progress
        from `tabTask` 
        where {cond}
        order by modified desc 
        limit %(limit)s
    """, vals, as_dict=True)


@frappe.whitelist()
def admin_task_logs(project=None, task=None, limit=500):
    """Get all task logs for admins."""
    if not _is_priv(): 
        frappe.throw(_("Not permitted."), frappe.PermissionError)
    
    vals = {"limit": int(limit)}
    cond = "1=1"
    if project:
        cond += " and project=%(project)s"
        vals["project"] = project
    if task:
        cond += " and task=%(task)s"
        vals["task"] = task
    
    return frappe.db.sql(f"""
        select name, project, task, employee, log_time, description, owner, creation
        from `tabTask Log`
        where {cond}
        order by log_time desc, creation desc
        limit %(limit)s
    """, vals, as_dict=True)


@frappe.whitelist()
def my_projects(q="", limit=200):
    """Get projects for current user."""
    user = frappe.session.user
    if _is_priv(user):
        return admin_projects(q=q, limit=limit)
    
    emp = _emp_of(user)
    if not emp:
        return []
    
    vals = {"limit": int(limit), "emp": emp}
    cond = """
        exists(select 1 from `tabProject Member` pm
               where pm.parenttype='Project'
                 and pm.parent=`tabProject`.name
                 and pm.employee=%(emp)s
                 and coalesce(pm.active,1)=1)
    """
    if q:
        cond += " and (name like %(q)s or project_name like %(q)s)"
        vals["q"] = f"%{q}%"
    
    return frappe.db.sql(f"""
        select name, project_name, status, company, 
               expected_start_date, expected_end_date, modified, percent_complete
        from `tabProject` 
        where {cond}
        order by modified desc
        limit %(limit)s
    """, vals, as_dict=True)


@frappe.whitelist()
def my_tasks(project=None, status=None, limit=500):
    """Get tasks for current user."""
    user = frappe.session.user
    if _is_priv(user):
        return admin_tasks(project=project, limit=limit)
    
    emp = _emp_of(user)
    if not emp:
        return []
    
    vals = {"limit": int(limit), "emp": emp}
    cond = """
        project in (select pm.parent from `tabProject Member` pm
                    where pm.parenttype='Project'
                      and pm.employee=%(emp)s 
                      and coalesce(pm.active,1)=1)
    """
    if project:
        cond += " and project=%(project)s"
        vals["project"] = project
    if status:
        cond += " and status=%(status)s"
        vals["status"] = status
    
    return frappe.db.sql(f"""
        select name, subject, project, status, priority, 
        exp_start_date, exp_end_date, modified, progress
        from `tabTask`
        where {cond}
        order by modified desc 
        limit %(limit)s
    """, vals, as_dict=True)


@frappe.whitelist()
def my_task_logs(project=None, task=None, limit=500):
    """Get task logs for current user."""
    user = frappe.session.user
    if _is_priv(user):
        return admin_task_logs(project=project, task=task, limit=limit)
    
    emp = _emp_of(user)
    if not emp:
        return []
    
    vals = {"limit": int(limit), "emp": emp}
    cond = """
        (employee=%(emp)s OR project IN (
            SELECT pm.parent FROM `tabProject Member` pm
            WHERE pm.parenttype='Project'
              AND pm.employee=%(emp)s
              AND COALESCE(pm.active,1)=1
        ))
    """
    if project:
        cond += " AND project=%(project)s"
        vals["project"] = project
    if task:
        cond += " AND task=%(task)s"
        vals["task"] = task

    return frappe.db.sql(f"""
        SELECT name, project, task, employee, log_time, description, owner, creation
        FROM `tabTask Log`
        WHERE {cond}
        ORDER BY log_time DESC, creation DESC
        LIMIT %(limit)s
    """, vals, as_dict=True)


@frappe.whitelist()
def create_task(project, subject, description=None, exp_start_date=None, exp_end_date=None, priority=None):
    """Create a new task."""
    try:
        if not project or not subject:
            frappe.throw(_("Project and subject are required"))
        
        if not frappe.db.exists("Project", project):
            frappe.throw(_("Project does not exist"))
        
        if not _is_priv():
            emp = _emp_of()
            if not emp or not frappe.db.exists("Project Member", {
                "parent": project, "employee": emp, "active": 1
            }):
                frappe.throw(_("Not permitted"), frappe.PermissionError)
        
        task = frappe.get_doc({
            "doctype": "Task",
            "subject": subject,
            "project": project,
            "description": description or "",
            "exp_start_date": exp_start_date,
            "exp_end_date": exp_end_date,
            "priority": priority or "Medium",
            "status": "Open",
        })
        
        task.flags.ignore_permissions = True
        task.insert(ignore_permissions=True)
        frappe.db.commit()
        
        return {
            "ok": True, 
            "task": task.name,
            "task_name": task.subject,
            "message": _("Task created successfully")
        }
        
    except Exception as e:
        frappe.log_error(f"Task Creation Error: {str(e)}")
        frappe.throw(_("Failed to create task: {0}").format(str(e)))


@frappe.whitelist()
def add_task_log(task, description, log_time=None):
    """Add a task log entry."""
    try:
        if not task or not description:
            frappe.throw(_("Task and description are required"))
        
        if not frappe.db.exists("Task", task):
            frappe.throw(_("Task does not exist"))
        
        project = frappe.db.get_value("Task", task, "project")
        emp = _emp_of()
        
        if not _is_priv():
            if not emp or not frappe.db.exists("Project Member", {
                "parent": project, "employee": emp, "active": 1
            }):
                frappe.throw(_("Not permitted"), frappe.PermissionError)
        
        doc = frappe.get_doc({
            "doctype": "Task Log",
            "task": task,
            "project": project,
            "employee": emp or None,
            "log_time": log_time or now_datetime(),
            "description": description.strip(),
        })
        
        doc.flags.ignore_permissions = True
        doc.insert(ignore_permissions=True)
        frappe.db.commit()
        
        return {
            "ok": True, 
            "task_log": doc.name,
            "message": _("Log added successfully")
        }
        
    except Exception as e:
        frappe.log_error(f"Task Log Error: {str(e)}")
        frappe.throw(_("Failed to add task log: {0}").format(str(e)))

@frappe.whitelist()
def my_project_summary(project, limit_tasks=200, limit_logs=200):
    """Get complete project summary."""
    user = frappe.session.user
    if not _is_priv(user):
        emp = _emp_of(user)
        if not emp or not frappe.db.exists("Project Member", {
            "parent": project, "employee": emp, "active": 1
        }):
            frappe.throw(_("Not permitted"), frappe.PermissionError)

    proj = frappe.db.get_value(
        "Project", project,
        ["name", "project_name", "status", "expected_start_date", 
         "expected_end_date", "modified", "percent_complete"],
        as_dict=True
    )

    tasks = frappe.db.sql("""
        SELECT name, subject, status, priority, exp_start_date, exp_end_date, modified, progress
        FROM `tabTask` 
        WHERE project=%s
        ORDER BY modified DESC 
        LIMIT %s
    """, (project, int(limit_tasks)), as_dict=True)

    logs = frappe.db.sql("""
        SELECT name, task, employee, log_time, description, owner, creation
        FROM `tabTask Log` 
        WHERE project=%s
        ORDER BY log_time DESC, creation DESC 
        LIMIT %s
    """, (project, int(limit_logs)), as_dict=True)

    members = frappe.db.sql("""
        SELECT employee, employee_name, role_in_project, user, COALESCE(active,1) AS active
        FROM `tabProject Member`
        WHERE parenttype='Project' AND parent=%s AND COALESCE(active,1)=1
        ORDER BY employee_name
    """, (project,), as_dict=True)

    return {
        "project": proj, 
        "tasks": tasks, 
        "logs": logs, 
        "members": members
    }


# ============================================================================
# EMPLOYEE PROFILE API
# ============================================================================

@frappe.whitelist()
def get_employee_profile(employee: str) -> dict:
    """
    Get complete employee profile information.
    Returns all main employee details for the profile screen.
    
    Args:
        employee (str): Employee ID (e.g., 'EMP-00001')
    
    Returns:
        dict: Employee profile data with all main fields
    """
    try:
        # Validate employee exists
        if not frappe.db.exists("Employee", employee):
            frappe.throw(_("Employee not found: {0}").format(employee))
        
        # Get complete employee profile with all main fields
        employee_data = frappe.db.get_value(
            "Employee",
            employee,
            [
                "name",
                "employee_name",
                "company_email",
                "personal_email",
                "cell_number",
                "department",
                "designation",
                "company",
                "date_of_joining",
                "date_of_birth",
                "gender",
                "marital_status",
                "blood_group",
                "current_address",
                "permanent_address",
                "pan_number",
                "bank_ac_no",
                "bank_name",
                "employment_type",
                "status",
                "reports_to",
                "grade",
                "default_shift",
                "image",
                "creation",
                "modified",
            ],
            as_dict=True,
        )
        
        if not employee_data:
            frappe.throw(_("Unable to fetch employee profile"))
        
        frappe.logger().info(f"✅ Employee profile fetched for {employee}")
        
        return employee_data
        
    except Exception as e:
        frappe.logger().error(f"❌ Error fetching employee profile: {str(e)}")
        frappe.throw(_("Failed to fetch employee profile: {0}").format(str(e)))


@frappe.whitelist()
def get_current_employee_profile() -> dict:
    """
    Get the profile of the current logged-in employee.
    Convenient method for employees to fetch their own profile.
    
    Returns:
        dict: Current employee's profile data
    """
    try:
        # Get current employee ID
        current_user = frappe.session.user
        employee_id = frappe.db.get_value(
            "Employee",
            {"user_id": current_user, "status": "Active"},
            "name"
        )
        
        if not employee_id:
            frappe.throw(_("No active employee record found for this user"))
        
        # Return the employee profile
        return get_employee_profile(employee_id)
        
    except Exception as e:
        frappe.logger().error(f"❌ Error fetching current employee profile: {str(e)}")
        frappe.throw(_("Failed to fetch your profile: {0}").format(str(e)))


# ============================================================================
# ADMIN APPROVALS NOTIFICATIONS API
# ============================================================================

@frappe.whitelist()
def get_admin_pending_approvals(employee: str | None = None, limit_page_length: int = 500) -> dict:
    """
    Get all pending approvals for admin/approver.
    Returns leave, expense, travel, WFH, and comp-leave requests pending approval.
    
    Args:
        employee: Employee ID (approver)
        limit_page_length: Limit results
    
    Returns:
        dict with all pending approvals by type
    """
    try:
        if not employee:
            current_user = frappe.session.user
            employee = frappe.db.get_value(
                "Employee",
                {"user_id": current_user, "status": "Active"},
                "name"
            )
        
        if not employee:
            frappe.throw(_("No employee record found"))
        
        # Get user ID from employee
        approver_user = frappe.db.get_value("Employee", employee, "user_id")
        
        # Check if user is an approver or HR manager
        user_roles = frappe.get_roles(approver_user)
        is_hr = bool(set(user_roles) & {"HR Manager", "HR User", "System Manager"})
        
        pending_approvals = {
            "leave_applications": [],
            "expense_claims": [],
            "wfh_requests": [],
            "travel_requests": [],
            "comp_leave_requests": [],
            "total_pending": 0
        }
        
        # Get leave applications pending for this approver - status must be 'Open'
        try:
            leave_apps = frappe.db.sql("""
                SELECT name, employee, employee_name, from_date, to_date, total_leave_days, status
                FROM `tabLeave Application`
                WHERE status = 'Open'
                AND (leave_approver = %s OR %s = 1)
                ORDER BY creation DESC
                LIMIT %s
            """, (approver_user, 1 if is_hr else 0, limit_page_length), as_dict=True)
            pending_approvals["leave_applications"] = leave_apps
        except:
            pass
        
        # Get expense claims pending for this approver - approval_status must be 'Draft'
        try:
            expense_claims = frappe.db.sql("""
                SELECT name, employee, employee_name, total_claimed_amount, posting_date, approval_status
                FROM `tabExpense Claim`
                WHERE approval_status = 'Draft'
                AND (expense_approver = %s OR %s = 1)
                ORDER BY posting_date DESC
                LIMIT %s
            """, (approver_user, 1 if is_hr else 0, limit_page_length), as_dict=True)
            pending_approvals["expense_claims"] = expense_claims
        except:
            pass
        
        # Get WFH requests pending
        try:
            wfh_requests = frappe.db.sql("""
                SELECT name, employee, employee_name, from_date, to_date, reason, status
                FROM `tabShift Request`
                WHERE status = 'Pending'
                ORDER BY creation DESC
                LIMIT %s
            """, limit_page_length, as_dict=True)
            pending_approvals["wfh_requests"] = wfh_requests
        except:
            pass
        
        # Get travel requests pending - status should be submitted (docstatus=1) with submission status 'Pending'
        try:
            travel_requests = frappe.db.sql("""
                SELECT name, employee, employee_name, travel_type, purpose_of_travel, 
                       travel_from_date, travel_to_date
                FROM `tabTravel Request`
                WHERE docstatus = 1
                AND status = 'Pending'
                ORDER BY creation DESC
                LIMIT %s
            """, limit_page_length, as_dict=True)
            pending_approvals["travel_requests"] = travel_requests
        except:
            pass
        
        # Get comp leave requests pending - docstatus should be 0 (Draft/Pending)
        try:
            comp_leaves = frappe.db.sql("""
                SELECT name, employee, employee_name, work_from_date, work_end_date, reason
                FROM `tabCompensatory Leave Request`
                WHERE docstatus = 0
                ORDER BY creation DESC
                LIMIT %s
            """, limit_page_length, as_dict=True)
            pending_approvals["comp_leave_requests"] = comp_leaves
        except:
            pass
        
        # Calculate total pending
        total_count = (
            len(pending_approvals["leave_applications"]) +
            len(pending_approvals["expense_claims"]) +
            len(pending_approvals["wfh_requests"]) +
            len(pending_approvals["travel_requests"]) +
            len(pending_approvals["comp_leave_requests"])
        )
        pending_approvals["total_pending"] = total_count
        
        frappe.logger().info(f"✅ Admin pending approvals fetched: {total_count} total")
        
        return pending_approvals
        
    except Exception as e:
        frappe.logger().error(f"❌ Error fetching admin pending approvals: {str(e)}")
        frappe.throw(_("Failed to fetch pending approvals: {0}").format(str(e)))


# ---------------------- Project Management ----------------------
@frappe.whitelist()
def create_project(project_name, customer=None, company=None, description=None, 
                   expected_start_date=None, expected_end_date=None, priority="Medium"):
    """Create a new project"""
    if not _is_priv():
        frappe.throw(_("Not permitted to create projects"), frappe.PermissionError)
    
    if not project_name or not project_name.strip():
        frappe.throw(_("Project name is required"))
    
    if not company:
        company = frappe.get_value("Employee", _emp_of(frappe.session.user), "company")
    
    try:
        # Create new project doc
        project_doc = frappe.get_doc({
            "doctype": "Project",
            "project_name": project_name.strip(),
            "status": "Open",
            "company": company,
            "customer": customer,
            "description": description,
            "expected_start_date": expected_start_date,
            "expected_end_date": expected_end_date,
            "priority": priority,
        })
        
        project_doc.insert(ignore_permissions=True)
        frappe.db.commit()
        
        return {
            "ok": True,
            "message": _("Project created successfully"),
            "project": {
                "name": project_doc.name,
                "project_name": project_doc.project_name,
                "status": project_doc.status,
                "company": project_doc.company,
                "expected_start_date": str(project_doc.expected_start_date) if project_doc.expected_start_date else None,
                "expected_end_date": str(project_doc.expected_end_date) if project_doc.expected_end_date else None,
                "percent_complete": 0,
            }
        }
    except Exception as e:
        frappe.db.rollback()
        frappe.logger().error(f"Error creating project: {str(e)}")
        frappe.throw(_("Failed to create project: {0}").format(str(e)))


@frappe.whitelist()
def get_project_members(project):
    """Get all members of a specific project"""
    if not frappe.db.exists("Project", project):
        frappe.throw(_("Project {0} does not exist").format(project))
    
    members = frappe.get_all(
        "Project Member",
        filters={
            "parent": project,
            "parenttype": "Project",
            "active": 1,
        },
        fields=["employee", "employee_name", "role_in_project", "user"],
        order_by="creation asc"
    )
    
    return {
        "ok": True,
        "project": project,
        "members": members,
        "count": len(members)
    }


@frappe.whitelist()
def update_project(project, **kwargs):
    """Update project details"""
    if not _is_priv():
        frappe.throw(_("Not permitted."), frappe.PermissionError)
    
    if not frappe.db.exists("Project", project):
        frappe.throw(_("Project {0} does not exist").format(project))
    
    allowed_fields = [
        "project_name", "description", "status", "priority",
        "expected_start_date", "expected_end_date", "customer", "company"
    ]
    
    doc = frappe.get_doc("Project", project)
    doc.flags.ignore_permissions = True
    
    for field, value in kwargs.items():
        if field in allowed_fields and value is not None:
            setattr(doc, field, value)
    
    try:
        doc.save(ignore_permissions=True)
        frappe.db.commit()
        
        return {
            "ok": True,
            "message": _("Project updated successfully"),
            "project": {
                "name": doc.name,
                "project_name": doc.project_name,
                "status": doc.status,
                "priority": doc.priority,
                "description": doc.description,
            }
        }
    except Exception as e:
        frappe.db.rollback()
        frappe.logger().error(f"Error updating project: {str(e)}")
        frappe.throw(_("Failed to update project: {0}").format(str(e)))


@frappe.whitelist()
def delete_project(project):
    """Delete a project"""
    if not _is_priv():
        frappe.throw(_("Not permitted."), frappe.PermissionError)
    
    if not frappe.db.exists("Project", project):
        frappe.throw(_("Project {0} does not exist").format(project))
    
    try:
        frappe.delete_doc("Project", project, ignore_permissions=True)
        frappe.db.commit()
        
        return {
            "ok": True,
            "message": _("Project deleted successfully"),
            "project": project
        }
    except Exception as e:
        frappe.db.rollback()
        frappe.logger().error(f"Error deleting project: {str(e)}")
        frappe.throw(_("Failed to delete project: {0}").format(str(e)))


# ---------------------- Attendance Management ----------------------
@frappe.whitelist()
def mark_attendance_app(employee=None, attendance_date=None, status="Present", shift=None):
    """Mark attendance from mobile app"""
    try:
        # Get current employee if not specified
        if not employee:
            employee = _emp_of(frappe.session.user)
        
        if not employee:
            frappe.throw(_("No employee found for current user"))
        
        # Validate employee is active
        emp_status = frappe.db.get_value("Employee", employee, "status")
        if emp_status != "Active":
            frappe.throw(_("Cannot mark attendance for inactive employee"))
        
        if not attendance_date:
            attendance_date = today()
        
        if not status:
            status = "Present"
        
        # Validate status
        valid_statuses = ["Present", "Absent", "On Leave", "Half Day", "Work From Home", "On Site"]
        if status not in valid_statuses:
            frappe.throw(_("Invalid status. Must be one of: {0}").format(", ".join(valid_statuses)))
        
        # Check if attendance already exists
        existing = frappe.db.get_value(
            "Attendance",
            {"employee": employee, "attendance_date": attendance_date, "docstatus": ["<", 2]},
            "name"
        )
        
        if existing:
            # Update existing
            att_doc = frappe.get_doc("Attendance", existing)
            att_doc.status = status
            att_doc.shift = shift
            att_doc.flags.ignore_permissions = True
            att_doc.save()
        else:
            # Create new
            att_doc = frappe.get_doc({
                "doctype": "Attendance",
                "employee": employee,
                "attendance_date": attendance_date,
                "status": status,
                "shift": shift,
            })
            att_doc.flags.ignore_permissions = True
            att_doc.insert()
            att_doc.submit()
        
        frappe.db.commit()
        
        return {
            "ok": True,
            "message": _("Attendance marked successfully"),
            "attendance": {
                "name": att_doc.name,
                "employee": att_doc.employee,
                "employee_name": att_doc.employee_name,
                "attendance_date": str(att_doc.attendance_date),
                "status": att_doc.status,
                "shift": att_doc.shift,
            }
        }
    except Exception as e:
        frappe.db.rollback()
        frappe.logger().error(f"Error marking attendance: {str(e)}")
        frappe.throw(_("Failed to mark attendance: {0}").format(str(e)))


@frappe.whitelist()
def get_my_attendance(from_date=None, to_date=None, limit=30):
    """Get attendance records for current employee"""
    employee = _emp_of(frappe.session.user)
    
    if not employee:
        return {"ok": False, "attendance": [], "message": "No employee found"}
    
    if not from_date:
        from_date = add_days(today(), -30)
    if not to_date:
        to_date = today()
    
    attendance = frappe.get_all(
        "Attendance",
        filters={
            "employee": employee,
            "attendance_date": ["between", [from_date, to_date]],
            "docstatus": ["<", 2],
        },
        fields=["name", "employee", "employee_name", "attendance_date", "status", "shift", "leave_type"],
        order_by="attendance_date desc",
        limit_page_length=int(limit)
    )
    
    return {
        "ok": True,
        "attendance": attendance,
        "count": len(attendance),
        "employee": employee,
    }


@frappe.whitelist()
def get_attendance_summary(employee=None, from_date=None, to_date=None):
    """Get attendance summary for current month/period"""
    if not employee:
        employee = _emp_of(frappe.session.user)
    
    if not employee:
        frappe.throw(_("No employee found"))
    
    if not from_date:
        from_date = add_days(today(), -30)
    if not to_date:
        to_date = today()
    
    records = frappe.get_all(
        "Attendance",
        filters={
            "employee": employee,
            "attendance_date": ["between", [from_date, to_date]],
            "docstatus": ["<", 2],
        },
        fields=["status"],
        order_by="attendance_date"
    )
    
    summary = {
        "present": 0,
        "absent": 0,
        "on_leave": 0,
        "half_day": 0,
        "work_from_home": 0,
        "total": 0,
    }
    
    for record in records:
        status = record.get("status", "").lower().replace(" ", "_")
        if status in summary:
            summary[status] += 1
        summary["total"] += 1
    
    return {
        "ok": True,
        "employee": employee,
        "from_date": str(from_date),
        "to_date": str(to_date),
        "summary": summary,
    }


@frappe.whitelist()
def get_today_attendance_status(employee=None):
    """Get today's attendance status for current employee"""
    if not employee:
        employee = _emp_of(frappe.session.user)
    
    if not employee:
        return {"ok": False, "status": None, "message": "No employee found"}
    
    att_date = today()
    
    attendance = frappe.db.get_value(
        "Attendance",
        {"employee": employee, "attendance_date": att_date, "docstatus": ["<", 2]},
        ["name", "status", "shift"],
        as_dict=True
    )
    
    if attendance:
        return {
            "ok": True,
            "status": attendance.get("status"),
            "shift": attendance.get("shift"),
            "attendance_id": attendance.get("name"),
            "marked": True,
        }
    else:
        return {
            "ok": True,
            "status": None,
            "shift": None,
            "attendance_id": None,
            "marked": False,
        }


@frappe.whitelist()
def admin_get_attendance(employee=None, from_date=None, to_date=None, limit=500):
    """Admin: Get attendance records for active employees only"""
    if not _is_priv():
        frappe.throw(_("Not permitted."), frappe.PermissionError)
    
    if not from_date:
        from_date = add_days(today(), -60)
    if not to_date:
        to_date = today()
    
    # Build query to only get attendance for active employees
    vals = {
        "from_date": from_date,
        "to_date": to_date,
        "limit": int(limit)
    }
    
    cond = """
        a.attendance_date BETWEEN %(from_date)s AND %(to_date)s
        AND a.docstatus < 2
        AND e.status = 'Active'
    """
    
    if employee:
        cond += " AND a.employee = %(employee)s"
        vals["employee"] = employee
    
    attendance = frappe.db.sql(f"""
        SELECT a.name, a.employee, a.employee_name, a.attendance_date, 
               a.status, a.shift, a.leave_type
        FROM `tabAttendance` a
        INNER JOIN `tabEmployee` e ON a.employee = e.name
        WHERE {cond}
        ORDER BY a.attendance_date DESC
        LIMIT %(limit)s
    """, vals, as_dict=True)
    
    # Convert date objects to strings for JSON serialization
    for att in attendance:
        if att.get("attendance_date"):
            att["attendance_date"] = str(att["attendance_date"])
    
    return {
        "ok": True,
        "attendance": attendance,
        "count": len(attendance),
    }


@frappe.whitelist()
def get_all_active_employees():
    """Get all active employees for admin attendance marking"""
    if not _is_priv():
        frappe.throw(_("Not permitted."), frappe.PermissionError)
    
    employees = frappe.get_all(
        "Employee",
        filters={"status": "Active"},
        fields=["name", "employee_name", "department", "designation", "company"],
        order_by="employee_name asc"
    )
    
    return {
        "ok": True,
        "employees": employees,
        "count": len(employees)
    }


@frappe.whitelist()
def admin_mark_attendance(employee, attendance_date=None, status="Present", shift=None, in_time=None, out_time=None):
    """
    Admin: Mark attendance for a specific active employee.
    
    Args:
        employee: Employee ID (required)
        attendance_date: Date for attendance (defaults to today)
        status: Attendance status (Present, Absent, On Leave, Half Day, Work From Home, On Site)
        shift: Shift name (optional)
        in_time: Check-in time as datetime string e.g. '2026-01-26 09:00:00' (optional)
        out_time: Check-out time as datetime string e.g. '2026-01-26 18:00:00' (optional)
    """
    if not _is_priv():
        frappe.throw(_("Not permitted."), frappe.PermissionError)
    
    if not employee:
        frappe.throw(_("Employee is required"))
    
    # Validate employee exists and is active
    emp_data = frappe.db.get_value("Employee", employee, ["name", "status", "employee_name"], as_dict=True)
    
    if not emp_data:
        frappe.throw(_("Employee not found"))
    
    if emp_data.status != "Active":
        frappe.throw(_("Cannot mark attendance for inactive employee: {0}").format(emp_data.employee_name))
    
    if not attendance_date:
        attendance_date = today()
    
    if not status:
        status = "Present"
    
    # Validate status
    valid_statuses = ["Present", "Absent", "On Leave", "Half Day", "Work From Home", "On Site"]
    if status not in valid_statuses:
        frappe.throw(_("Invalid status. Must be one of: {0}").format(", ".join(valid_statuses)))
    
    try:
        # Check if attendance already exists
        existing = frappe.db.get_value(
            "Attendance",
            {"employee": employee, "attendance_date": attendance_date, "docstatus": ["<", 2]},
            "name"
        )
        
        if existing:
            # Update existing
            att_doc = frappe.get_doc("Attendance", existing)
            att_doc.status = status
            att_doc.shift = shift
            if in_time:
                att_doc.in_time = in_time
            if out_time:
                att_doc.out_time = out_time
            att_doc.flags.ignore_permissions = True
            att_doc.save()
        else:
            # Create new
            att_data = {
                "doctype": "Attendance",
                "employee": employee,
                "attendance_date": attendance_date,
                "status": status,
                "shift": shift,
            }
            if in_time:
                att_data["in_time"] = in_time
            if out_time:
                att_data["out_time"] = out_time
            
            att_doc = frappe.get_doc(att_data)
            att_doc.flags.ignore_permissions = True
            att_doc.insert()
            att_doc.submit()
        
        frappe.db.commit()
        
        return {
            "ok": True,
            "message": _("Attendance marked successfully for {0}").format(emp_data.employee_name),
            "attendance": {
                "name": att_doc.name,
                "employee": att_doc.employee,
                "employee_name": att_doc.employee_name,
                "attendance_date": str(att_doc.attendance_date),
                "status": att_doc.status,
                "shift": att_doc.shift,
                "in_time": str(att_doc.in_time) if att_doc.in_time else None,
                "out_time": str(att_doc.out_time) if att_doc.out_time else None,
            }
        }
    except Exception as e:
        frappe.db.rollback()
        frappe.logger().error(f"Error marking attendance: {str(e)}")
        frappe.throw(_("Failed to mark attendance: {0}").format(str(e)))


@frappe.whitelist()
def admin_bulk_mark_attendance(employees, attendance_date=None, status="Present", shift=None, in_time=None, out_time=None):
    """
    Admin: Bulk mark attendance for multiple active employees at once.
    
    Args:
        employees: List of employee IDs (JSON string or list)
        attendance_date: Date for attendance (defaults to today)
        status: Attendance status (Present, Absent, On Leave, Half Day, Work From Home, On Site)
        shift: Shift name (optional)
        in_time: Check-in time as datetime string e.g. '2026-01-26 09:00:00' (optional)
        out_time: Check-out time as datetime string e.g. '2026-01-26 18:00:00' (optional)
    
    Returns:
        Dict with success/failure counts and details
    """
    if not _is_priv():
        frappe.throw(_("Not permitted."), frappe.PermissionError)
    
    # Parse employees if JSON string
    if isinstance(employees, str):
        try:
            employees = json.loads(employees)
        except json.JSONDecodeError:
            frappe.throw(_("Invalid employees list format"))
    
    if not employees or not isinstance(employees, list):
        frappe.throw(_("Employees list is required"))
    
    if not attendance_date:
        attendance_date = today()
    
    # Validate status
    valid_statuses = ["Present", "Absent", "On Leave", "Half Day", "Work From Home", "On Site"]
    if status not in valid_statuses:
        frappe.throw(_("Invalid status. Must be one of: {0}").format(", ".join(valid_statuses)))
    
    results = {
        "success": [],
        "failed": [],
        "skipped": [],
    }
    
    for employee in employees:
        try:
            # Validate employee exists and is active
            emp_data = frappe.db.get_value(
                "Employee", 
                employee, 
                ["name", "status", "employee_name"], 
                as_dict=True
            )
            
            if not emp_data:
                results["failed"].append({
                    "employee": employee,
                    "reason": "Employee not found"
                })
                continue
            
            if emp_data.status != "Active":
                results["skipped"].append({
                    "employee": employee,
                    "employee_name": emp_data.employee_name,
                    "reason": "Inactive employee"
                })
                continue
            
            # Check if attendance already exists
            existing = frappe.db.get_value(
                "Attendance",
                {"employee": employee, "attendance_date": attendance_date, "docstatus": ["<", 2]},
                "name"
            )
            
            if existing:
                # Update existing
                att_doc = frappe.get_doc("Attendance", existing)
                att_doc.status = status
                att_doc.shift = shift
                if in_time:
                    att_doc.in_time = in_time
                if out_time:
                    att_doc.out_time = out_time
                att_doc.flags.ignore_permissions = True
                att_doc.save()
                action = "updated"
            else:
                # Create new
                att_data = {
                    "doctype": "Attendance",
                    "employee": employee,
                    "attendance_date": attendance_date,
                    "status": status,
                    "shift": shift,
                }
                if in_time:
                    att_data["in_time"] = in_time
                if out_time:
                    att_data["out_time"] = out_time
                
                att_doc = frappe.get_doc(att_data)
                att_doc.flags.ignore_permissions = True
                att_doc.insert()
                att_doc.submit()
                action = "created"
            
            results["success"].append({
                "employee": employee,
                "employee_name": emp_data.employee_name,
                "attendance": att_doc.name,
                "action": action,
                "status": status,
                "in_time": str(att_doc.in_time) if att_doc.in_time else None,
                "out_time": str(att_doc.out_time) if att_doc.out_time else None,
            })
            
        except Exception as e:
            results["failed"].append({
                "employee": employee,
                "reason": str(e)
            })
    
    frappe.db.commit()
    
    return {
        "ok": True,
        "message": _("Bulk attendance processed: {0} success, {1} failed, {2} skipped").format(
            len(results["success"]), 
            len(results["failed"]), 
            len(results["skipped"])
        ),
        "attendance_date": str(attendance_date),
        "status": status,
        "results": results,
        "summary": {
            "total": len(employees),
            "success": len(results["success"]),
            "failed": len(results["failed"]),
            "skipped": len(results["skipped"]),
        }
    }


@frappe.whitelist()
def admin_get_unmarked_employees(attendance_date=None):
    """
    Admin: Get list of active employees who don't have attendance marked for a specific date.
    Useful for identifying who needs attendance to be marked.
    
    Args:
        attendance_date: Date to check (defaults to today)
    
    Returns:
        List of employees without attendance for the date
    """
    if not _is_priv():
        frappe.throw(_("Not permitted."), frappe.PermissionError)
    
    if not attendance_date:
        attendance_date = today()
    
    # Get all active employees
    all_employees = frappe.get_all(
        "Employee",
        filters={"status": "Active"},
        fields=["name", "employee_name", "department", "designation", "company"],
        order_by="employee_name asc"
    )
    
    # Get employees who already have attendance
    marked_employees = frappe.get_all(
        "Attendance",
        filters={
            "attendance_date": attendance_date,
            "docstatus": ["<", 2],
        },
        pluck="employee"
    )
    
    marked_set = set(marked_employees)
    
    # Filter out employees who already have attendance
    unmarked = [emp for emp in all_employees if emp.name not in marked_set]
    
    return {
        "ok": True,
        "attendance_date": str(attendance_date),
        "unmarked_employees": unmarked,
        "unmarked_count": len(unmarked),
        "total_active": len(all_employees),
        "marked_count": len(marked_employees),
    }


@frappe.whitelist()
def admin_delete_attendance(attendance_name):
    if not _is_priv():
        frappe.throw(_("Not permitted."), frappe.PermissionError)
    
    if not attendance_name:
        frappe.throw(_("Attendance name is required"))
    
    if not frappe.db.exists("Attendance", attendance_name):
        frappe.throw(_("Attendance record not found"))
    
    att_doc = frappe.get_doc("Attendance", attendance_name)
    employee_name = att_doc.employee_name
    att_date = str(att_doc.attendance_date)
    
    try:
        if att_doc.docstatus == 1:
            # Cancel if submitted
            att_doc.flags.ignore_permissions = True
            att_doc.cancel()
        
        # Delete the record
        frappe.delete_doc("Attendance", attendance_name, force=True, ignore_permissions=True)
        frappe.db.commit()
        
        return {
            "ok": True,
            "message": _("Attendance deleted for {0} on {1}").format(employee_name, att_date),
        }
    except Exception as e:
        frappe.db.rollback()
        frappe.throw(_("Failed to delete attendance: {0}").format(str(e)))


def get_employee_by_user():
	"""Helper function to get employee ID for current user."""
	current_user = frappe.session.user
	employee_id = frappe.db.get_value(
		"Employee",
		{"user_id": current_user, "status": "Active"},
		"name"
	)
	return employee_id


# ============================================================================
# EMPLOYEE STANDUP APIs
# ============================================================================

@frappe.whitelist()
def get_or_create_today_standup() -> dict:
	"""
	Get today's Daily Standup or create it if doesn't exist.
	Used by employees to view/edit their standup for today.
	
	Returns:
		Dict with standup details, tasks, and employee info
	"""
	try:
		current_employee = get_employee_by_user()
		if not current_employee:
			frappe.throw(_("No employee record found for current user"))
		
		standup_date = getdate()
		
		# Try to get existing standup for today (exclude cancelled - docstatus=2)
		existing_standup = frappe.db.get_value(
			"Daily Standup",
			{"standup_date": standup_date, "docstatus": ["!=", 2]},
			"name"
		)
		
		if existing_standup:
			standup = frappe.get_doc("Daily Standup", existing_standup)
		else:
			# Create new standup for today
			standup = frappe.get_doc({
				"doctype": "Daily Standup",
				"standup_date": standup_date,
				"standup_time": now_datetime(),
			})
			standup.insert(ignore_permissions=True)
			frappe.db.commit()
		
		# Get employee info
		employee_info = frappe.get_value("Employee", current_employee, ["employee_name", "department"], as_dict=True)
		employee_name = employee_info.employee_name if employee_info else None
		department = employee_info.department if employee_info else None
		
		# Get employee's task for this standup
		employee_task = None
		if standup.standup_tasks:
			for task in standup.standup_tasks:
				if task.employee == current_employee:
					employee_task = {
						"idx": task.idx,
						"employee": task.employee,
						"employee_name": task.employee_name or employee_name,
						"department": task.department if hasattr(task, 'department') else department,
						"task_title": task.task_title,
						"planned_output": task.planned_output,
						"estimated_hours": task.estimated_hours if hasattr(task, 'estimated_hours') else None,
						"actual_work_done": task.actual_work_done,
						"actual_hours": task.actual_hours if hasattr(task, 'actual_hours') else None,
						"completion_percentage": task.completion_percentage,
						"task_status": task.task_status,
						"blockers": task.blockers if hasattr(task, 'blockers') else None,
						"carry_forward": task.carry_forward,
						"next_working_date": str(task.next_working_date) if task.next_working_date else None,
					}
					break
		
		return {
			"status": "success",
			"data": {
				"standup_id": standup.name,
				"standup_date": str(standup.standup_date),
				"standup_time": str(standup.standup_time),
				"is_submittable": standup.docstatus == 0,  # Can edit if draft
				"is_submitted": standup.docstatus == 1,  # Locked if submitted
				"docstatus": standup.docstatus,
				"remarks": standup.remarks,
				"employee": current_employee,
				"employee_name": employee_name,
				"employee_task": employee_task,
				"total_tasks": len(standup.standup_tasks) if standup.standup_tasks else 0,
			},
			"message": _("Standup fetched successfully"),
		}
		
	except Exception as e:
		frappe.log_error(f"Get/Create Standup Error: {str(e)}\n{frappe.get_traceback()}", "Daily Standup")
		return {
			"status": "error",
			"message": str(e),
			"data": None,
		}


@frappe.whitelist()
def submit_employee_standup_task(
	standup_id: str,
	task_title: str,
	planned_output: str,
	completion_percentage: int = 0,
	estimated_hours: float | None = None,
) -> dict:
	"""
	Employee submits their daily standup task (morning entry).
	Creates or updates task for current employee in the standup.
	
	Args:
		standup_id: Daily Standup ID
		task_title: Short title of the task
		planned_output: What employee plans to complete today
		completion_percentage: Initial completion % (optional, defaults to 0)
		estimated_hours: Estimated hours to complete (optional)
	
	Returns:
		Dict with task details and standup status
	"""
	try:
		# Get current employee
		current_employee = get_employee_by_user()
		if not current_employee:
			frappe.throw(_("No employee record found for current user"))
		
		# Get employee info
		employee_info = frappe.get_value("Employee", current_employee, ["employee_name", "department"], as_dict=True)
		
		# Get standup
		standup = frappe.get_doc("Daily Standup", standup_id)
		
		# Check if standup is submitted (cannot add tasks)
		if standup.docstatus == 1:
			frappe.throw(_("This standup is already submitted and cannot be modified"))
		
		# Validate inputs
		if not task_title or not task_title.strip():
			frappe.throw(_("Task title is required"))
		
		if not planned_output or not planned_output.strip():
			frappe.throw(_("Planned output is required"))
		
		# Check if employee already has a task in this standup
		existing_task = None
		task_idx = None
		
		if standup.standup_tasks:
			for idx, task in enumerate(standup.standup_tasks):
				if task.employee == current_employee:
					existing_task = task
					task_idx = idx
					break
		
		# Add or update task
		if existing_task:
			# Update existing task
			existing_task.task_title = task_title
			existing_task.planned_output = planned_output
			existing_task.completion_percentage = min(100, max(0, cint(completion_percentage)))
			if estimated_hours is not None:
				existing_task.estimated_hours = estimated_hours
		else:
			# Add new task
			standup.append("standup_tasks", {
				"employee": current_employee,
				"employee_name": employee_info.employee_name if employee_info else None,
				"department": employee_info.department if employee_info else None,
				"task_title": task_title,
				"planned_output": planned_output,
				"estimated_hours": estimated_hours,
				"actual_work_done": "",
				"actual_hours": None,
				"completion_percentage": min(100, max(0, cint(completion_percentage))),
				"task_status": "Draft",
				"blockers": "",
				"carry_forward": 0,
				"next_working_date": None,
			})
		
		# Save standup
		standup.save(ignore_permissions=True)
		frappe.db.commit()
		
		# Get employee name and updated task
		employee_name = frappe.get_value("Employee", current_employee, "employee_name")
		employee_task = None
		if standup.standup_tasks:
			for task in standup.standup_tasks:
				if task.employee == current_employee:
					employee_task = {
						"idx": task.idx,
						"employee": task.employee,
						"employee_name": employee_name,
						"task_title": task.task_title,
						"planned_output": task.planned_output,
						"actual_work_done": task.actual_work_done,
						"completion_percentage": task.completion_percentage,
						"task_status": task.task_status,
						"carry_forward": task.carry_forward,
						"next_working_date": str(task.next_working_date) if task.next_working_date else None,
					}
					break
		
		return {
			"status": "success",
			"message": _("Standup task submitted successfully"),
			"data": {
				"standup_id": standup.name,
				"standup_date": str(standup.standup_date),
				"employee": current_employee,
				"employee_name": employee_name,
				"employee_task": employee_task,
				"total_tasks": len(standup.standup_tasks) if standup.standup_tasks else 0,
			},
		}
		
	except Exception as e:
		frappe.log_error(f"Submit Standup Task Error: {str(e)}\n{frappe.get_traceback()}", "Standup Task")
		frappe.throw(_("Failed to submit standup task: {0}").format(str(e)))


@frappe.whitelist()
def update_employee_standup_task(
	standup_id: str,
	actual_work_done: str,
	completion_percentage: int,
	task_status: str = "Draft",
	carry_forward: int = 0,
	next_working_date: str | None = None,
	actual_hours: float | None = None,
	blockers: str | None = None,
) -> dict:
	"""
	Employee updates their standup task with actual work done (evening entry).
	
	Args:
		standup_id: Daily Standup ID
		actual_work_done: What was actually completed
		completion_percentage: Task progress (0-100)
		task_status: Task status (Draft, In Progress, Completed, Blocked)
		carry_forward: 1 if task continues to next day, 0 otherwise
		next_working_date: Date to continue (required if carry_forward=1)
		actual_hours: Actual hours spent (optional)
		blockers: Any blockers/impediments (optional)
	
	Returns:
		Dict with updated task details
	"""
	try:
		# Get current employee
		current_employee = get_employee_by_user()
		if not current_employee:
			frappe.throw(_("No employee record found for current user"))
		
		# Get standup
		standup = frappe.get_doc("Daily Standup", standup_id)
		
		# Check if standup is submitted (cannot edit unless allowed)
		if standup.docstatus == 1:
			frappe.throw(_("This standup is already submitted. Contact administrator to unlock."))
		
		# Validate inputs
		if not actual_work_done or not actual_work_done.strip():
			frappe.throw(_("Actual work done is required"))
		
		completion_percentage = min(100, max(0, cint(completion_percentage)))
		
		# Validate task status
		valid_statuses = ["Draft", "In Progress", "Completed", "Blocked"]
		if task_status not in valid_statuses:
			frappe.throw(_("Invalid task status. Must be Draft, In Progress, Completed, or Blocked"))
		
		# When completed, clear carry forward but keep the completion percentage as entered
		if task_status == "Completed":
			carry_forward = 0
			next_working_date = None
		
		# Validate carry forward logic
		if carry_forward and not next_working_date:
			frappe.throw(_("Next working date is required when carry_forward is enabled"))
		
		# Find and update employee's task
		task_found = False
		
		if standup.standup_tasks:
			for task in standup.standup_tasks:
				if task.employee == current_employee:
					task.actual_work_done = actual_work_done
					task.completion_percentage = completion_percentage
					task.task_status = task_status
					task.carry_forward = cint(carry_forward)
					task.next_working_date = getdate(next_working_date) if next_working_date else None
					if actual_hours is not None:
						task.actual_hours = actual_hours
					if blockers is not None:
						task.blockers = blockers
					task_found = True
					break
		
		if not task_found:
			frappe.throw(_("Employee does not have a task in this standup"))
		
		# Save standup
		standup.save(ignore_permissions=True)
		frappe.db.commit()
		
		# Get employee info
		employee_info = frappe.get_value("Employee", current_employee, ["employee_name", "department"], as_dict=True)
		
		# Get updated task
		employee_task = None
		if standup.standup_tasks:
			for task in standup.standup_tasks:
				if task.employee == current_employee:
					employee_task = {
						"idx": task.idx,
						"employee": task.employee,
						"employee_name": task.employee_name or (employee_info.employee_name if employee_info else None),
						"department": task.department if hasattr(task, 'department') else (employee_info.department if employee_info else None),
						"task_title": task.task_title,
						"planned_output": task.planned_output,
						"estimated_hours": task.estimated_hours if hasattr(task, 'estimated_hours') else None,
						"actual_work_done": task.actual_work_done,
						"actual_hours": task.actual_hours if hasattr(task, 'actual_hours') else None,
						"completion_percentage": task.completion_percentage,
						"task_status": task.task_status,
						"blockers": task.blockers if hasattr(task, 'blockers') else None,
						"carry_forward": task.carry_forward,
						"next_working_date": str(task.next_working_date) if task.next_working_date else None,
					}
					break
		
		return {
			"status": "success",
			"message": _("Standup task updated successfully"),
			"data": {
				"standup_id": standup.name,
				"standup_date": str(standup.standup_date),
				"employee": current_employee,
				"employee_name": employee_info.employee_name if employee_info else None,
				"employee_task": employee_task,
			},
		}
		
	except Exception as e:
		frappe.log_error(f"Update Standup Task Error: {str(e)}\n{frappe.get_traceback()}", "Standup Task Update")
		frappe.throw(_("Failed to update standup task: {0}").format(str(e)))


@frappe.whitelist()
def get_employee_standup_history(
	employee: str | None = None,
	from_date: str | None = None,
	to_date: str | None = None,
	limit: int = 30,
) -> dict:
	"""
	Get standup history for an employee with their tasks.
	
	Args:
		employee: Employee ID (if None, uses current user's employee)
		from_date: Filter from this date
		to_date: Filter to this date
		limit: Maximum number of standups
	
	Returns:
		Dict with standups and employee's tasks in each
	"""
	try:
		# If no employee, get current user's employee
		if not employee:
			employee = get_employee_by_user()
			if not employee:
				frappe.throw(_("No employee record found for current user"))
		
		# Set date range
		if not from_date:
			from_date = add_days(getdate(), -30)
		if not to_date:
			to_date = getdate()
		
		# Get employee name
		employee_name = frappe.get_value("Employee", employee, "employee_name")
		
		# Get all standups in date range (exclude cancelled)
		standups = frappe.get_all(
			"Daily Standup",
			filters={
				"standup_date": ["between", [from_date, to_date]],
				"docstatus": ["!=", 2],  # Exclude cancelled standups
			},
			fields=["name", "standup_date", "standup_time", "remarks", "docstatus"],
			order_by="standup_date desc",
			limit=limit,
		)
		
		# Fetch tasks for each standup and filter by employee
		standup_list = []
		for standup in standups:
			standup_doc = frappe.get_doc("Daily Standup", standup.name)
			
			# Find employee's task in this standup
			employee_task = None
			if standup_doc.standup_tasks:
				for task in standup_doc.standup_tasks:
					if task.employee == employee:
						employee_task = {
							"idx": task.idx,
							"employee": task.employee,
							"employee_name": employee_name,
							"task_title": task.task_title,
							"planned_output": task.planned_output,
							"actual_work_done": task.actual_work_done,
							"completion_percentage": task.completion_percentage,
							"task_status": task.task_status,
							"carry_forward": task.carry_forward,
							"next_working_date": str(task.next_working_date) if task.next_working_date else None,
						}
						break
			
			if employee_task:  # Only include standups where employee has a task
				standup_list.append({
					"standup_id": standup.name,
					"standup_date": str(standup.standup_date),
					"standup_time": str(standup.standup_time),
					"remarks": standup.remarks,
					"docstatus": standup.docstatus,
					"is_submitted": standup.docstatus == 1,
					"employee_task": employee_task,
				})
		
		return {
			"status": "success",
			"data": {
				"employee": employee,
				"employee_name": employee_name,
				"from_date": str(from_date),
				"to_date": str(to_date),
				"standups": standup_list,
				"total_standups": len(standup_list),
			},
			"message": _("Standup history fetched successfully"),
		}
		
	except Exception as e:
		frappe.log_error(f"Get Standup History Error: {str(e)}\n{frappe.get_traceback()}", "Standup History")
		return {
			"status": "error",
			"message": str(e),
			"data": None,
		}


# ============================================================================
# ADMIN STANDUP MANAGEMENT APIs
# ============================================================================

@frappe.whitelist()
def get_all_standups(
	from_date: str | None = None,
	to_date: str | None = None,
	department: str | None = None,
	limit: int = 100,
) -> dict:
	"""
	Get all standups with filters (Admin only).
	
	Args:
		from_date: Filter from this date
		to_date: Filter to this date
		department: Filter by department
		limit: Maximum number of standups
	
	Returns:
		Dict with standups and comprehensive statistics
	"""
	try:
		# Check if user is admin
		user_roles = frappe.get_roles()
		is_admin = bool(set(user_roles) & {"Administrator", "System Manager", "HR Manager", "HR User"})
		
		if not is_admin:
			frappe.throw(_("You do not have permission to view all standups"))
		
		# Set date range
		if not from_date:
			from_date = add_days(getdate(), -30)
		if not to_date:
			to_date = getdate()
		
		# Get all standups in date range
		filters = {
			"standup_date": ["between", [from_date, to_date]],
		}
		
		standups = frappe.get_all(
			"Daily Standup",
			filters=filters,
			fields=["name", "standup_date", "standup_time", "remarks", "docstatus"],
			order_by="standup_date desc",
			limit=limit,
		)
		
		# Enrich with task details and optional department filter
		standup_list = []
		for standup in standups:
			standup_doc = frappe.get_doc("Daily Standup", standup.name)
			
			# Get task details
			tasks = []
			if standup_doc.standup_tasks:
				for task in standup_doc.standup_tasks:
					# Get employee's department
					emp_dept = frappe.get_value("Employee", task.employee, "department")
					
					# Filter by department if specified
					if department and emp_dept != department:
						continue
					
					tasks.append({
						"idx": task.idx,
						"employee": task.employee,
						"department": emp_dept,
						"task_title": task.task_title,
						"planned_output": task.planned_output,
						"actual_work_done": task.actual_work_done,
						"completion_percentage": task.completion_percentage,
						"task_status": task.task_status,
						"carry_forward": task.carry_forward,
						"next_working_date": str(task.next_working_date) if task.next_working_date else None,
					})
			
			# Only include standup if has tasks (or no department filter applied)
			if tasks or not department:
				standup_list.append({
					"standup_id": standup.name,
					"standup_date": str(standup.standup_date),
					"standup_time": str(standup.standup_time),
					"remarks": standup.remarks,
					"docstatus": standup.docstatus,
					"is_submitted": standup.docstatus == 1,
					"total_tasks": len(standup_doc.standup_tasks) if standup_doc.standup_tasks else 0,
					"tasks": tasks,
				})
		
		# Calculate statistics
		stats = {
			"total_standups": len(standup_list),
			"submitted_standups": sum(1 for s in standup_list if s["is_submitted"]),
			"draft_standups": sum(1 for s in standup_list if not s["is_submitted"]),
			"total_tasks": sum(s["total_tasks"] for s in standup_list),
			"completed_tasks": sum(
				sum(1 for t in s["tasks"] if t["task_status"] == "Completed")
				for s in standup_list
			),
			"pending_tasks": sum(
				sum(1 for t in s["tasks"] if t["task_status"] == "Draft")
				for s in standup_list
			),
		}
		
		return {
			"status": "success",
			"data": {
				"from_date": str(from_date),
				"to_date": str(to_date),
				"standups": standup_list,
				"statistics": stats,
			},
			"message": _("Standups fetched successfully"),
		}
		
	except Exception as e:
		frappe.log_error(f"Get All Standups Error: {str(e)}\n{frappe.get_traceback()}", "Admin Standups")
		return {
			"status": "error",
			"message": str(e),
			"data": None,
		}


@frappe.whitelist()
def get_standup_detail(standup_id: str) -> dict:
	"""
	Get detailed view of a specific standup with all tasks (Admin).
	
	Args:
		standup_id: Daily Standup ID
	
	Returns:
		Dict with complete standup details and all tasks
	"""
	try:
		# Check if user is admin
		user_roles = frappe.get_roles()
		is_admin = bool(set(user_roles) & {"Administrator", "System Manager", "HR Manager", "HR User"})
		
		if not is_admin:
			frappe.throw(_("You do not have permission to view this standup"))
		
		# Get standup
		standup = frappe.get_doc("Daily Standup", standup_id)
		
		# Get all tasks with employee details
		tasks = []
		if standup.standup_tasks:
			for task in standup.standup_tasks:
				emp_doc = frappe.get_doc("Employee", task.employee)
				tasks.append({
					"idx": task.idx,
					"employee": task.employee,
					"department": emp_doc.department,
					"designation": emp_doc.designation,
					"task_title": task.task_title,
					"planned_output": task.planned_output,
					"actual_work_done": task.actual_work_done,
					"completion_percentage": task.completion_percentage,
					"task_status": task.task_status,
					"carry_forward": task.carry_forward,
					"next_working_date": str(task.next_working_date) if task.next_working_date else None,
				})
		
		# Calculate statistics
		stats = {
			"total_tasks": len(tasks),
			"completed_tasks": sum(1 for t in tasks if t["task_status"] == "Completed"),
			"pending_tasks": sum(1 for t in tasks if t["task_status"] == "Draft"),
			"avg_completion": round(sum(t["completion_percentage"] for t in tasks) / len(tasks), 1) if tasks else 0,
			"carry_forward_count": sum(1 for t in tasks if t["carry_forward"]),
		}
		
		return {
			"status": "success",
			"data": {
				"standup_id": standup.name,
				"standup_date": str(standup.standup_date),
				"standup_time": str(standup.standup_time),
				"remarks": standup.remarks,
				"docstatus": standup.docstatus,
				"is_submitted": standup.docstatus == 1,
				"tasks": tasks,
				"statistics": stats,
			},
			"message": _("Standup detail fetched successfully"),
		}
		
	except Exception as e:
		frappe.log_error(f"Get Standup Detail Error: {str(e)}\n{frappe.get_traceback()}", "Standup Detail")
		return {
			"status": "error",
			"message": str(e),
			"data": None,
		}


@frappe.whitelist()
def submit_standup(standup_id: str, remarks: str | None = None) -> dict:
	"""
	Submit/finalize a standup (Admin only).
	Locks the standup from further editing.
	
	Args:
		standup_id: Daily Standup ID
		remarks: Optional manager remarks/notes
	
	Returns:
		Dict with submission status
	"""
	try:
		# Check if user is admin
		user_roles = frappe.get_roles()
		is_admin = bool(set(user_roles) & {"Administrator", "System Manager", "HR Manager", "HR User"})
		
		if not is_admin:
			frappe.throw(_("You do not have permission to submit standups"))
		
		# Get standup
		standup = frappe.get_doc("Daily Standup", standup_id)
		
		# Check if already submitted
		if standup.docstatus == 1:
			frappe.throw(_("This standup is already submitted"))
		
		# Check if standup has tasks
		if not standup.standup_tasks or len(standup.standup_tasks) == 0:
			frappe.throw(_("Standup must have at least one task before submission"))
		
		# Update remarks if provided
		if remarks:
			standup.remarks = remarks
		
		# Submit standup
		standup.submit()
		frappe.db.commit()
		
		# Calculate statistics
		stats = {
			"total_tasks": len(standup.standup_tasks),
			"completed_tasks": sum(1 for t in standup.standup_tasks if t.task_status == "Completed"),
			"pending_tasks": sum(1 for t in standup.standup_tasks if t.task_status == "Draft"),
		}
		
		return {
			"status": "success",
			"message": _("Standup submitted successfully"),
			"data": {
				"standup_id": standup.name,
				"standup_date": str(standup.standup_date),
				"docstatus": standup.docstatus,
				"is_submitted": True,
				"statistics": stats,
			},
		}
		
	except Exception as e:
		frappe.log_error(f"Submit Standup Error: {str(e)}\n{frappe.get_traceback()}", "Standup Submit")
		frappe.throw(_("Failed to submit standup: {0}").format(str(e)))


@frappe.whitelist()
def amend_standup(standup_id: str) -> dict:
	"""
	Unlock a submitted standup for editing (Admin only).
	Creates an amended copy that can be edited.
	
	Args:
		standup_id: Daily Standup ID (must be submitted)
	
	Returns:
		Dict with amended standup details
	"""
	try:
		# Check if user is admin
		user_roles = frappe.get_roles()
		is_admin = bool(set(user_roles) & {"Administrator", "System Manager", "HR Manager", "HR User"})
		
		if not is_admin:
			frappe.throw(_("You do not have permission to amend standups"))
		
		# Get standup
		standup = frappe.get_doc("Daily Standup", standup_id)
		
		# Check if submitted
		if standup.docstatus != 1:
			frappe.throw(_("Only submitted standups can be amended"))
		
		# Cancel the original standup (required for amendment in Frappe)
		standup.flags.ignore_permissions = True
		standup.cancel()
		frappe.db.commit()
		
		# Create a new draft document with same data, linking to original via amended_from
		amended_doc = frappe.get_doc({
			"doctype": "Daily Standup",
			"standup_date": standup.standup_date,
			"standup_time": standup.standup_time,
			"remarks": standup.remarks,
			"amended_from": standup.name,
			"docstatus": 0,
		})
		
		# Copy all tasks from original standup
		if standup.standup_tasks:
			for task in standup.standup_tasks:
				amended_doc.append("standup_tasks", {
					"employee": task.employee,
					"task_title": task.task_title,
					"planned_output": task.planned_output,
					"actual_work_done": task.actual_work_done,
					"completion_percentage": task.completion_percentage,
					"task_status": task.task_status,
					"carry_forward": task.carry_forward,
					"next_working_date": task.next_working_date,
				})
		
		amended_doc.flags.ignore_permissions = True
		amended_doc.insert(ignore_permissions=True)
		frappe.db.commit()
		
		return {
			"status": "success",
			"message": _("Standup unlocked for editing"),
			"data": {
				"original_standup_id": standup.name,
				"amended_standup_id": amended_doc.name,
				"standup_date": str(amended_doc.standup_date),
				"docstatus": amended_doc.docstatus,
			},
		}
		
	except Exception as e:
		frappe.log_error(f"Amend Standup Error: {str(e)}\n{frappe.get_traceback()}", "Standup Amend")
		frappe.throw(_("Failed to amend standup: {0}").format(str(e)))


@frappe.whitelist()
def get_department_standup_summary(
	department: str,
	from_date: str | None = None,
	to_date: str | None = None,
) -> dict:
	"""
	Get standup summary for a specific department.
	Shows all employees' standups and their completion status.
	
	Args:
		department: Department name
		from_date: Filter from this date
		to_date: Filter to this date
	
	Returns:
		Dict with department standup analytics
	"""
	try:
		# Check if user is admin
		user_roles = frappe.get_roles()
		is_admin = bool(set(user_roles) & {"Administrator", "System Manager", "HR Manager", "HR User"})
		
		if not is_admin:
			frappe.throw(_("You do not have permission to view department standups"))
		
		# Validate department exists
		if not frappe.db.exists("Department", department):
			frappe.throw(_("Department {0} does not exist").format(department))
		
		# Set date range
		if not from_date:
			from_date = add_days(getdate(), -7)
		if not to_date:
			to_date = getdate()
		
		# Get all employees in department
		employees = frappe.get_all(
			"Employee",
			filters={
				"department": department,
				"status": "Active",
			},
			fields=["name", "employee_name", "designation"],
			order_by="employee_name asc",
		)
		
		# Get all standups in date range (exclude cancelled standups - docstatus=2)
		standups = frappe.get_all(
			"Daily Standup",
			filters={
				"standup_date": ["between", [from_date, to_date]],
				"docstatus": ["!=", 2],  # Exclude cancelled standups
			},
			fields=["name", "standup_date", "docstatus"],
		)
		
		# Build summary for each employee
		employee_summary = []
		for emp in employees:
			emp_tasks = []
			task_count = 0
			completed_count = 0
			
			for standup in standups:
				standup_doc = frappe.get_doc("Daily Standup", standup.name)
				
				# Find employee's task
				if standup_doc.standup_tasks:
					for task in standup_doc.standup_tasks:
						if task.employee == emp.name:
							emp_tasks.append({
								"standup_date": str(standup.standup_date),
								"task_title": task.task_title,
								"task_status": task.task_status,
								"completion_percentage": task.completion_percentage,
								"actual_work_done": task.actual_work_done[:100] if task.actual_work_done else "",  # Truncate
							})
							task_count += 1
							if task.task_status == "Completed":
								completed_count += 1
			
			if task_count > 0:  # Only include if employee has tasks
				employee_summary.append({
					"employee": emp.name,
					"employee_name": emp.employee_name,
					"designation": emp.designation,
					"total_tasks": task_count,
					"completed_tasks": completed_count,
					"completion_rate": round((completed_count / task_count * 100), 1) if task_count > 0 else 0,
					"tasks": emp_tasks,
				})
		
		# Calculate department stats
		total_tasks = sum(e["total_tasks"] for e in employee_summary)
		total_completed = sum(e["completed_tasks"] for e in employee_summary)
		
		return {
			"status": "success",
			"data": {
				"department": department,
				"from_date": str(from_date),
				"to_date": str(to_date),
				"employee_summary": employee_summary,
				"department_statistics": {
					"total_employees": len(employee_summary),
					"total_tasks": total_tasks,
					"completed_tasks": total_completed,
					"overall_completion_rate": round((total_completed / total_tasks * 100), 1) if total_tasks > 0 else 0,
				},
			},
			"message": _("Department standup summary fetched successfully"),
		}
		
	except Exception as e:
		frappe.log_error(f"Get Department Standup Summary Error: {str(e)}\n{frappe.get_traceback()}", "Department Standup")
		return {
			"status": "error",
			"message": str(e),
			"data": None,
		}



# =========================================================================
# EMPLOYEE EDIT PREVIOUS STANDUP TASK API
# =========================================================================

@frappe.whitelist()
def edit_employee_standup_task(
    standup_id: str,
    task_title: str | None = None,
    planned_output: str | None = None,
    actual_work_done: str | None = None,
    completion_percentage: int | None = None,
    task_status: str | None = None,
    carry_forward: int | None = None,
    next_working_date: str | None = None,
) -> dict:
    """
    Allow employee to edit their standup task for any date (if not submitted).
    Args:
        standup_id: Daily Standup ID
        task_title: (optional) New title
        planned_output: (optional) New planned output
        actual_work_done: (optional) New actual work done
        completion_percentage: (optional) New completion %
        task_status: (optional) New status
        carry_forward: (optional) Carry forward flag
        next_working_date: (optional) Next working date
    Returns:
        Dict with updated task details
    """
    try:
        current_employee = get_employee_by_user()
        if not current_employee:
            frappe.throw(_("No employee record found for current user"))

        standup = frappe.get_doc("Daily Standup", standup_id)
        if standup.docstatus == 1:
            frappe.throw(_("This standup is already submitted. Cannot edit task."))

        # Find employee's task
        task_found = False
        if standup.standup_tasks:
            for task in standup.standup_tasks:
                if task.employee == current_employee:
                    if task_title is not None:
                        task.task_title = task_title
                    if planned_output is not None:
                        task.planned_output = planned_output
                    if actual_work_done is not None:
                        task.actual_work_done = actual_work_done
                    if completion_percentage is not None:
                        task.completion_percentage = min(100, max(0, cint(completion_percentage)))
                    if task_status is not None:
                        valid_statuses = ["Draft", "Completed"]
                        if task_status not in valid_statuses:
                            frappe.throw(_("Invalid task status. Must be Draft or Completed"))
                        task.task_status = task_status
                        if task_status == "Completed":
                            task.carry_forward = 0
                            task.next_working_date = None
                    # Handle carry forward logic - only if status is not "Completed"
                    if task.task_status != "Completed":
                        if carry_forward is not None:
                            task.carry_forward = cint(carry_forward)
                        # Validate: if carry_forward is enabled, next_working_date is required
                        if task.carry_forward and not next_working_date and not task.next_working_date:
                            frappe.throw(_("Next working date is required when carry_forward is enabled"))
                        if next_working_date is not None:
                            task.next_working_date = getdate(next_working_date) if next_working_date else None
                    task_found = True
                    break

        if not task_found:
            frappe.throw(_("Employee does not have a task in this standup"))

        standup.save(ignore_permissions=True)
        frappe.db.commit()

        # Get updated task
        # Get employee name
        employee_name = frappe.get_value("Employee", current_employee, "employee_name")
        
        employee_task = None
        if standup.standup_tasks:
            for task in standup.standup_tasks:
                if task.employee == current_employee:
                    employee_task = {
                        "idx": task.idx,
                        "employee": task.employee,
                        "employee_name": employee_name,
                        "task_title": task.task_title,
                        "planned_output": task.planned_output,
                        "actual_work_done": task.actual_work_done,
                        "completion_percentage": task.completion_percentage,
                        "task_status": task.task_status,
                        "carry_forward": task.carry_forward,
                        "next_working_date": str(task.next_working_date) if task.next_working_date else None,
                    }
                    break

        return {
            "status": "success",
            "message": _("Standup task edited successfully"),
            "data": {
                "standup_id": standup.name,
                "standup_date": str(standup.standup_date),
                "employee": current_employee,
                "employee_name": employee_name,
                "employee_task": employee_task,
            },
        }

    except Exception as e:
        frappe.log_error(f"Edit Standup Task Error: {str(e)}\\n{frappe.get_traceback()}", "Edit Standup Task")
        frappe.throw(_("Failed to edit standup task: {0}").format(str(e)))


@frappe.whitelist()
def get_carry_forward_tasks() -> dict:
    """
    Get tasks marked for carry forward to today for the current employee.
    Useful for pre-populating today's standup with yesterday's incomplete tasks.
    
    Returns:
        Dict with carry forward tasks from previous standups
    """
    try:
        current_employee = get_employee_by_user()
        if not current_employee:
            frappe.throw(_("No employee record found for current user"))
        
        today = getdate()
        employee_name = frappe.get_value("Employee", current_employee, "employee_name")
        
        # Get recent standups (last 7 days) with carry_forward tasks for today
        standups = frappe.get_all(
            "Daily Standup",
            filters={
                "standup_date": ["<", today],
                "docstatus": ["!=", 2],  # Exclude cancelled
            },
            fields=["name", "standup_date"],
            order_by="standup_date desc",
            limit=7,
        )
        
        carry_forward_tasks = []
        for standup in standups:
            standup_doc = frappe.get_doc("Daily Standup", standup.name)
            if standup_doc.standup_tasks:
                for task in standup_doc.standup_tasks:
                    # Check if this is a carry forward task for today
                    if (task.employee == current_employee and 
                        task.carry_forward == 1 and 
                        task.next_working_date and
                        getdate(task.next_working_date) == today):
                        carry_forward_tasks.append({
                            "source_standup_id": standup.name,
                            "source_standup_date": str(standup.standup_date),
                            "task_title": task.task_title,
                            "planned_output": task.planned_output,
                            "actual_work_done": task.actual_work_done,
                            "completion_percentage": task.completion_percentage,
                        })
        
        return {
            "status": "success",
            "data": {
                "employee": current_employee,
                "employee_name": employee_name,
                "today": str(today),
                "carry_forward_tasks": carry_forward_tasks,
                "total_tasks": len(carry_forward_tasks),
            },
            "message": _("Carry forward tasks fetched successfully"),
        }
        
    except Exception as e:
        frappe.log_error(f"Get Carry Forward Tasks Error: {str(e)}\\n{frappe.get_traceback()}", "Carry Forward Tasks")
        return {
            "status": "error",
            "message": str(e),
            "data": None,
        }


@frappe.whitelist()
def delete_employee_standup_task(standup_id: str) -> dict:
    """
    Allow employee to delete their own task from a draft standup.
    
    Args:
        standup_id: Daily Standup ID
    
    Returns:
        Dict with deletion status
    """
    try:
        current_employee = get_employee_by_user()
        if not current_employee:
            frappe.throw(_("No employee record found for current user"))

        standup = frappe.get_doc("Daily Standup", standup_id)
        if standup.docstatus == 1:
            frappe.throw(_("This standup is already submitted. Cannot delete task."))
        
        if standup.docstatus == 2:
            frappe.throw(_("This standup is cancelled."))

        # Find and remove employee's task
        task_found = False
        if standup.standup_tasks:
            for idx, task in enumerate(standup.standup_tasks):
                if task.employee == current_employee:
                    standup.standup_tasks.pop(idx)
                    task_found = True
                    break

        if not task_found:
            frappe.throw(_("Employee does not have a task in this standup"))

        standup.save(ignore_permissions=True)
        frappe.db.commit()

        return {
            "status": "success",
            "message": _("Standup task deleted successfully"),
            "data": {
                "standup_id": standup.name,
                "standup_date": str(standup.standup_date),
                "employee": current_employee,
                "remaining_tasks": len(standup.standup_tasks),
            },
        }

    except Exception as e:
        frappe.log_error(f"Delete Standup Task Error: {str(e)}\\n{frappe.get_traceback()}", "Delete Standup Task")
        frappe.throw(_("Failed to delete standup task: {0}").format(str(e)))
