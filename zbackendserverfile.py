#Actual file name /home/gcp_user/frappe-bench-v15/apps/hrms/hrms/api/__init__.py
import frappe
from frappe import _
from frappe.model import get_permitted_fields
from frappe.model.workflow import get_workflow_name
from frappe.query_builder import Order
from frappe.utils import add_days, date_diff, getdate, strip_html, nowdate, cint, now_datetime
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
		present_days = sum(1 for a in attendance_records if a.status == "Present")
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
		present_days = sum(1 for a in attendance_records if a.status == "Present")
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
def get_holidays_for_employee(employee: str) -> list[dict]:
	holiday_list = get_holiday_list_for_employee(employee, raise_exception=False)
	if not holiday_list:
		return []

	Holiday = frappe.qb.DocType("Holiday")
	holidays = (
		frappe.qb.from_(Holiday)
		.select(Holiday.name, Holiday.holiday_date, Holiday.description)
		.where((Holiday.parent == holiday_list) & (Holiday.weekly_off == 0))
		.orderby(Holiday.holiday_date, order=Order.asc)
	).run(as_dict=True)

	for holiday in holidays:
		holiday["description"] = strip_html(holiday["description"] or "").strip()

	return holidays


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
		
		# Insert and submit
		leave_app.insert(ignore_permissions=True)
		leave_app.submit()
		frappe.db.commit()
		
		# Get updated leave balance
		balance = get_leave_balance_map(employee)
		
		# Send notification to approver
		try:
			send_leave_application_notification(leave_app.name, "submitted")
		except Exception as notif_error:
			frappe.log_error(f"Failed to send notification: {str(notif_error)}", "Leave Notification")
		
		return {
			"status": "success",
			"message": _("Leave application submitted successfully"),
			"application_id": leave_app.name,
			"employee": employee,
			"employee_name": leave_app.employee_name,
			"leave_type": leave_type,
			"from_date": str(leave_app.from_date),
			"to_date": str(leave_app.to_date),
			"total_leave_days": leave_app.total_leave_days,
			"leave_balance": balance.get(leave_type, {}).get("remaining_leaves", 0),
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
		
		# Approve
		leave_app.status = "Approved"
		if remarks:
			leave_app.add_comment("Comment", f"Approved: {remarks}")
		leave_app.save(ignore_permissions=True)
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
		
		# Reject
		leave_app.status = "Rejected"
		leave_app.add_comment("Comment", f"Rejected: {reason}")
		leave_app.save(ignore_permissions=True)
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
		
		# Send notification to HR
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
		
		# Send notification to approver
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
def approve_expense_claim(claim_id: str, remarks: str | None = None) -> dict:
	"""
	Approve an expense claim (for admins/approvers).
	
	Args:
		claim_id: Expense Claim ID
		remarks: Optional approval remarks
	
	Returns:
		Dict with approval status
	"""
	try:
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
		
		# Approve
		claim.approval_status = "Approved"
		claim.status = "Approved"
		
		if remarks:
			claim.add_comment("Comment", f"Approved: {remarks}")
		
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
		
		# Send notification to HR/Admin
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

        # Convert coordinates to float if they exist
        if latitude is not None and longitude is not None:
            try:
                latitude = float(latitude)
                longitude = float(longitude)
            except (TypeError, ValueError):
                frappe.throw(_("Invalid latitude or longitude values"))

        # Only verify location if not WFH and coordinates are provided
        if work_type != "WFH":
            if latitude is None or longitude is None:
                frappe.throw(_("Location coordinates are required for non-WFH attendance"))
            
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

        # Check for duplicate action today
        last_log = frappe.db.get_all(
            "Geo Log",
            filters={
                "employee": employee,
                "action": action,
                "status": "Approved",
                "creation": [">=", getdate(now_datetime())],
            },
            fields=["name"],
            limit=1,
        )
        if last_log:
            frappe.throw(_(f"You have already performed {action} today"))

        # For Check-Out, verify there's a Check-In
        if action == "Check-Out":
            check_in = frappe.db.get_all(
                "Geo Log",
                filters={
                    "employee": employee,
                    "action": "Check-In",
                    "status": "Approved",
                    "creation": [">=", getdate(now_datetime())],
                },
                fields=["name"],
                limit=1,
            )
            if not check_in:
                frappe.throw(_("No Check-In found for today"))

        # Create Geo Log
        geo_log = frappe.get_doc({
            "doctype": "Geo Log",
            "employee": employee,
            "action": action,
            "timestamp": now_datetime(),
            "latitude": latitude,
            "longitude": longitude,
            "work_type": work_type,
            "status": "Approved",
        })
        geo_log.insert()

        try:
            attendance = mark_attendance(employee, action, geo_log, work_type)
            geo_log.attendance = attendance.name
            geo_log.save()
        except frappe.PermissionError:
            frappe.db.rollback()
            frappe.throw(_("You lack permission to submit attendance. Contact HR."), exc=frappe.exceptions.PermissionError)
        except frappe.UpdateAfterSubmitError:
            frappe.db.rollback()
            frappe.throw(_("Cannot update attendance after submission. Contact HR."), exc=frappe.exceptions.UpdateAfterSubmitError)

        frappe.db.commit()

        return {
            "status": "Approved",
            "message": f"{action} Successfully",
            "geo_log": geo_log.name,
            "attendance": attendance.name,
        }
    except Exception as e:
        frappe.log_error(f"Geo Attendance Error: {str(e)[:100]}")
        frappe.throw(_("An error occurred while processing your request. Please try again or contact HR."))

def mark_attendance(employee, action, geo_log, work_type=None):
    attendance_date = getdate(geo_log.timestamp)
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
        attendance = frappe.get_doc({
            "doctype": "Attendance",
            "employee": employee,
            "attendance_date": attendance_date,
            "status": "Work From Home" if work_type == "WFH" else "Present",
            "in_time": geo_log.timestamp,
            "custom_work_type": work_type if work_type else None,
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
            
            # Update both out_time fields directly in database
            frappe.db.sql("""
                UPDATE `tabAttendance` 
                SET out_time = %s, 
                    custom_out_time_copy = %s, 
                    modified = %s,
                    modified_by = %s
                WHERE name = %s
            """, (geo_log.timestamp, geo_log.timestamp, now_datetime(), frappe.session.user, attendance_name))
            
            frappe.db.commit()
            
            # Return the updated record
            attendance = frappe.get_doc("Attendance", attendance_name)
            
        else:
            # Attendance is in draft - update normally
            attendance = frappe.get_doc("Attendance", attendance_name)
            
            # Set both out_time fields
            attendance.out_time = geo_log.timestamp
            attendance.custom_out_time_copy = geo_log.timestamp
            
            if work_type == "WFH" and existing_attendance[0].status != "Work From Home":
                attendance.status = "Work From Home"
            
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

        present_ids = {att.employee for att in today_attendance if att.status in ["Present", "Work From Home"]}

        present = []
        for att in today_attendance:
            if att.status in ["Present", "Work From Home"]:
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


@frappe.whitelist(allow_guest=False)
def get_all_employees_attendance_summary(start_date=None, end_date=None, department=None):
    """Get attendance summary for all employees with export data."""
    if not any(role in frappe.get_roles() for role in ["System Manager", "HR Manager", "HR User"]):
        frappe.throw(_("You do not have permission to access this resource."), frappe.PermissionError)

    # Set date range
    if not start_date:
        start_date = add_days(getdate(), -30)
    if not end_date:
        end_date = getdate()
    
    start_date = getdate(start_date)
    end_date = getdate(end_date)

    # Get employees
    employee_filters = {"status": "Active"}
    if department:
        employee_filters["department"] = department
    
    employees = frappe.get_all(
        "Employee",
        filters=employee_filters,
        fields=["name", "employee_name", "department", "designation"],
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
            
            emp_summary = {
                "employee_id": emp.name,
                "employee_name": emp.employee_name,
                "department": emp.department or "Not Assigned",
                "designation": emp.designation or "Not Assigned",
                "total_working_days": emp_working_days,
                **emp_data["summary_stats"]
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
                "total_working_days": 0,
                "present_days": 0,
                "wfh_days": 0,
                "absent_days": 0,
                "total_working_hours": 0,
                "attendance_percentage": 0
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
def export_attendance_report(employee_id=None, start_date=None, end_date=None, export_format="pdf", department=None):
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

        if employee_id:
            # Individual employee report
            data = get_employee_attendance_history(employee_id, start_date.strftime("%Y-%m-%d"), end_date.strftime("%Y-%m-%d"))
            if export_format.lower() == "pdf":
                return generate_individual_pdf_report(data, employee_id)
            else:
                return generate_individual_excel_report(data, employee_id)
        else:
            # All employees report
            data = get_all_employees_attendance_summary(start_date.strftime("%Y-%m-%d"), end_date.strftime("%Y-%m-%d"), department)
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
    """Generate PDF report for all employees with proper base64 encoding."""
    try:
        from frappe.utils.pdf import get_pdf
        import base64
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body {{ font-family: Arial, sans-serif; padding: 20px; }}
                .header {{ text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }}
                .title {{ color: #333; font-size: 24px; margin-bottom: 10px; }}
                .date-range {{ color: #888; font-size: 14px; }}
                .summary-section {{ margin-bottom: 30px; }}
                .section-title {{ color: #333; font-size: 18px; margin-bottom: 15px; border-bottom: 1px solid #ddd; padding-bottom: 5px; }}
                table {{ width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 11px; }}
                th, td {{ border: 1px solid #ddd; padding: 6px; text-align: left; }}
                th {{ background-color: #f2f2f2; font-weight: bold; }}
                .stats-table {{ width: 80%; margin: 0 auto; }}
                .stats-table td {{ width: 20%; text-align: center; }}
                .highlight {{ background-color: #f0f8ff; }}
                .text-center {{ text-align: center; }}
                .small-text {{ font-size: 10px; color: #666; }}
            </style>
        </head>
        <body>
            <div class="header">
                <div class="title">All Employees Attendance Summary</div>
                <div class="date-range">Period: {data['date_range']['start_date']} to {data['date_range']['end_date']}</div>
                <div class="small-text">Total Days: {data['date_range'].get('total_days', 'N/A')} | Working Days: {data['date_range'].get('working_days', 'N/A')}</div>
                <div class="small-text">Generated on {frappe.utils.now_datetime().strftime('%Y-%m-%d %H:%M:%S')}</div>
            </div>
            
            <div class="summary-section">
                <div class="section-title">Overall Statistics</div>
                <table class="stats-table">
                    <tr>
                        <td><strong>Total Employees</strong></td>
                        <td>{data['overall_stats']['total_employees']}</td>
                        <td><strong>Working Days</strong></td>
                        <td>{data['overall_stats'].get('total_working_days', 'N/A')}</td>
                        <td><strong>Avg Attendance %</strong></td>
                        <td class="highlight"><strong>{data['overall_stats']['avg_attendance_percentage']}%</strong></td>
                    </tr>
                </table>
            </div>
            
            <div>
                <div class="section-title">Employee-wise Attendance Details</div>
                <table>
                    <thead>
                        <tr>
                            <th>Employee Name</th>
                            <th>Department</th>
                            <th>Designation</th>
                            <th>Working Days</th>
                            <th>Present</th>
                            <th>WFH</th>
                            <th>Absent</th>
                            <th>Late</th>
                            <th>Total Hours</th>
                            <th>Attendance %</th>
                        </tr>
                    </thead>
                    <tbody>
        """
        
        for emp in data['employees_data']:
            html_content += f"""
                        <tr>
                            <td>{emp['employee_name']}</td>
                            <td>{emp['department']}</td>
                            <td>{emp['designation']}</td>
                            <td class="text-center">{emp.get('total_working_days', 'N/A')}</td>
                            <td class="text-center">{emp.get('present_days', 0)}</td>
                            <td class="text-center">{emp.get('wfh_days', 0)}</td>
                            <td class="text-center">{emp.get('absent_days', 0)}</td>
                            <td class="text-center">{emp.get('late_arrivals', 0)}</td>
                            <td class="text-center">{emp.get('total_working_hours', 0)}</td>
                            <td class="text-center highlight">{emp.get('attendance_percentage', 0)}%</td>
                        </tr>
            """
        
        html_content += """
                    </tbody>
                </table>
            </div>
            <div class="small-text text-center" style="margin-top: 30px; border-top: 1px solid #ddd; padding-top: 10px;">
                This report was generated automatically by the HRMS system.<br>
                Working Days = Total Days - Holidays for each employee
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
    """Generate Excel report for all employees with proper base64 encoding."""
    try:
        import io
        import xlsxwriter
        import base64
        
        output = io.BytesIO()
        workbook = xlsxwriter.Workbook(output, {'in_memory': True})
        worksheet = workbook.add_worksheet('Attendance Summary')
        
        # Define formats
        header_format = workbook.add_format({
            'bold': True, 
            'bg_color': '#4472C4', 
            'font_color': 'white',
            'align': 'center',
            'valign': 'vcenter'
        })
        title_format = workbook.add_format({'bold': True, 'font_size': 16, 'align': 'center'})
        
        # Write title
        worksheet.merge_range('A1:J1', "All Employees Attendance Summary", title_format)
        worksheet.write(1, 0, f"Period: {data['date_range']['start_date']} to {data['date_range']['end_date']}")
        worksheet.write(2, 0, f"Total Days: {data['date_range'].get('total_days', 'N/A')} | Working Days: {data['date_range'].get('working_days', 'N/A')}")
        worksheet.write(3, 0, f"Generated on: {frappe.utils.now_datetime().strftime('%Y-%m-%d %H:%M:%S')}")
        
        # Write headers
        row = 5
        headers = ["Employee Name", "Department", "Designation", "Working Days", "Present Days", "WFH Days", 
                  "Absent Days", "Late Arrivals", "Total Hours", "Attendance %"]
        
        for col, header in enumerate(headers):
            worksheet.write(row, col, header, header_format)
        row += 1
        
        # Write data
        for emp in data['employees_data']:
            worksheet.write(row, 0, emp['employee_name'])
            worksheet.write(row, 1, emp['department'])
            worksheet.write(row, 2, emp['designation'])
            worksheet.write(row, 3, emp.get('total_working_days', 0))
            worksheet.write(row, 4, emp.get('present_days', 0))
            worksheet.write(row, 5, emp.get('wfh_days', 0))
            worksheet.write(row, 6, emp.get('absent_days', 0))
            worksheet.write(row, 7, emp.get('late_arrivals', 0))
            worksheet.write(row, 8, emp.get('total_working_hours', 0))
            worksheet.write(row, 9, f"{emp.get('attendance_percentage', 0)}%")
            row += 1
        
        # Auto-adjust column widths
        worksheet.set_column('A:A', 20)  # Employee Name
        worksheet.set_column('B:B', 15)  # Department
        worksheet.set_column('C:C', 15)  # Designation
        worksheet.set_column('D:I', 12)  # Numeric columns
        worksheet.set_column('J:J', 15)  # Attendance %
        
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
                SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END) as present_count,
                SUM(CASE WHEN status = 'Work From Home' THEN 1 ELSE 0 END) as wfh_count,
                SUM(CASE WHEN TIME(in_time) > '10:05:00' AND status = 'Present' THEN 1 ELSE 0 END) as late_count
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
    """Save or update FCM token for a user."""
    try:
        # Validate inputs
        if not token:
            frappe.throw(_("Token is required"))
        
        if device_type not in ['Android', 'iOS', 'android', 'ios']:
            frappe.throw(_("Invalid device type. Expected: Android, iOS, android, or ios. Got: {0}").format(device_type))
        
        # Normalize device_type to capitalized format
        device_type = 'Android' if device_type.lower() == 'android' else 'iOS'
        
        user = frappe.session.user
        
        # Log for debugging
        frappe.log_error(
            f"FCM Token Registration - User: {user}, Device: {device_type}, Token: {token[:20]}...",
            "FCM Token Save"
        )
        
        existing = frappe.db.exists("Mobile Device", {"user": user})
        
        if existing:
            frappe.db.set_value("Mobile Device", existing, {
                "fcm_token": token,
                "device_type": device_type,
                "last_active": now_datetime()
            })
            frappe.log_error(f"✅ Updated existing Mobile Device for user: {user}", "FCM Token Save")
        else:
            # Check if this token is already registered to a different user
            existing_token = frappe.db.exists("Mobile Device", {"fcm_token": token})
            if existing_token:
                frappe.db.set_value("Mobile Device", existing_token, {
                    "user": user,
                    "device_type": device_type,
                    "last_active": now_datetime()
                })
                frappe.log_error(f"✅ Updated Mobile Device with existing token for user: {user}", "FCM Token Save")
            else:
                doc = frappe.get_doc({
                    "doctype": "Mobile Device",
                    "user": user,
                    "fcm_token": token,
                    "device_type": device_type,
                    "last_active": now_datetime()
                })
                doc.insert(ignore_permissions=True)
                frappe.log_error(f"✅ Created new Mobile Device for user: {user}", "FCM Token Save")
        
        frappe.db.commit()
        
        return {"status": "success", "message": "FCM token saved", "user": user, "device_type": device_type}
        
    except Exception as e:
        frappe.log_error(f"❌ Error saving FCM token: {str(e)}", "FCM Token Save Error")
        frappe.log_error(frappe.get_traceback(), "FCM Token Save Error Traceback")
        frappe.throw(_("Failed to save FCM token: {0}").format(str(e)))


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
        
        present_today = len([att for att in today_attendance if att.status == "Present"])
        wfh_today = len([att for att in today_attendance if att.status == "Work From Home"])
        
        attended_employee_ids = {att.employee for att in today_attendance if att.status in ["Present", "Work From Home"]}
        
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
            if att.in_time and att.status == "Present":
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
                "status": ["in", ["Present", "Work From Home"]]
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
                        "status": ["in", ["Present", "Work From Home"]]
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
            elif record.status in ["Present", "Work From Home"]:
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

def send_project_log_reminders():
    """Send hourly project log reminders during office hours (10 AM - 7 PM)."""
    try:
        import datetime
        current_time = datetime.datetime.now()
        current_hour = current_time.hour
        
        # Only send during office hours (10 AM to 7 PM) on weekdays
        if current_hour < 10 or current_hour > 19:
            return
        
        # Check if it's a weekday (Monday=0, Sunday=6)
        if current_time.weekday() > 4:  # Saturday=5, Sunday=6
            return
        
        # Get all active employees with project assignments
        project_employees = frappe.db.sql("""
            SELECT DISTINCT e.name, e.employee_name, e.user_id
            FROM `tabEmployee` e
            WHERE e.status = 'Active' 
            AND e.user_id IS NOT NULL
            AND e.user_id != ''
            AND EXISTS (
                SELECT 1 FROM `tabProject Member` pm
                WHERE pm.employee = e.name
            )
        """, as_dict=True)
        
        if not project_employees:
            frappe.log_error("No employees with project assignments found", "Project Reminder")
            return
        
        # Get FCM tokens using Mobile Device table
        tokens = []
        for emp in project_employees:
            if emp.user_id:
                emp_tokens = frappe.get_all("Mobile Device", 
                    filters={"user": emp.user_id}, 
                    pluck="fcm_token"
                )
                tokens.extend([t for t in emp_tokens if t])  # Filter out None/empty tokens
        
        if tokens:
            title = "Project Log Reminder"
            message = f"Time to log your project activities! Don't forget to record what you've accomplished this hour."
            
            response = send_fcm_notification(tokens, title, message)
            frappe.log_error(f"✅ Project reminder sent to {len(tokens)} devices at {current_time}", "Project Reminder")
        else:
            frappe.log_error(f"No FCM tokens found for {len(project_employees)} project employees", "Project Reminder")
            
    except Exception as e:
        frappe.log_error(f"Project Log Reminder Error: {str(e)}", "Notification Scheduler")


def send_checkin_reminder():
    """Send morning check-in reminder (9:30 AM)."""
    try:
        import datetime
        current_time = datetime.datetime.now()
        today = current_time.date()
        
        # Check if it's a weekday
        if current_time.weekday() > 4:
            return
        
        # Check if it's a holiday
        holiday_lists = frappe.get_all("Holiday List", pluck="name")
        is_holiday = False
        
        for holiday_list in holiday_lists:
            if frappe.db.exists("Holiday", {"parent": holiday_list, "holiday_date": today}):
                is_holiday = True
                break
        
        if is_holiday:
            return
        
        # Get employees who haven't checked in yet
        # Note: Removed custom field checks that may not exist in all installations
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
        
        frappe.log_error(f"Found {len(employees_not_checked_in)} employees without check-in: {[e.employee_name for e in employees_not_checked_in]}", "Check-in Reminder")
        
        # Get FCM tokens from Mobile Device table using user_id directly from query
        tokens = []
        
        for emp in employees_not_checked_in:
            if emp.user_id:
                emp_tokens = frappe.get_all("Mobile Device", 
                    filters={"user": emp.user_id}, 
                    pluck="fcm_token"
                )
                tokens.extend([t for t in emp_tokens if t])  # Filter out None/empty tokens
        
        frappe.log_error(f"Total FCM tokens collected: {len(tokens)}", "Check-in Reminder")
        
        if tokens:
            title = "Check-in Reminder"
            message = "Good morning! Don't forget to check in when you arrive at the office."
            
            response = send_fcm_notification(tokens, title, message)
            frappe.log_error(f"✅ Check-in reminder sent to {len(tokens)} devices. Response: {response}", "Attendance Reminder")
        else:
            frappe.log_error("No FCM tokens found for employees without check-in", "Check-in Reminder")
            
    except Exception as e:
        frappe.log_error(f"Check-in Reminder Error: {str(e)}", "Notification Scheduler")


def send_checkout_reminder():
    """Send evening check-out reminder (6:30 PM)."""
    try:
        import datetime
        current_time = datetime.datetime.now()
        today = current_time.date()
        
        # Check if it's a weekday
        if current_time.weekday() > 4:
            return
        
        # Get employees who checked in but haven't checked out
        # Note: Removed custom field checks that may not exist in all installations
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
        
        # Get FCM tokens from Mobile Device table using user_id directly from query
        tokens = []
        
        for emp in employees_need_checkout:
            if emp.user_id:
                emp_tokens = frappe.get_all("Mobile Device", 
                    filters={"user": emp.user_id}, 
                    pluck="fcm_token"
                )
                tokens.extend([t for t in emp_tokens if t])  # Filter out None/empty tokens
        
        if tokens:
            title = "Check-out Reminder"
            message = "Don't forget to check out before leaving the office!"
            
            response = send_fcm_notification(tokens, title, message)
            frappe.log_error(f"Check-out reminder sent to {len(tokens)} devices", "Attendance Reminder")
            
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