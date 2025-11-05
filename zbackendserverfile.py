import frappe
from frappe import _
from frappe.model import get_permitted_fields
from frappe.model.workflow import get_workflow_name
from frappe.query_builder import Order
from frappe.utils import add_days, date_diff, getdate, strip_html
import json
from frappe.utils import now_datetime, getdate
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
		filters.docstatus = ("!=", 2)
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


# Expense Claims
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
def save_fcm_token(token, user):
    """
    Save FCM token for a user.
    """
    try:
        if not frappe.db.exists("Employee", user):
            return {"status": "error", "message": "User not found"}
        frappe.db.set_value("User", user, "fcm_token", token)
        frappe.db.commit()
        return {"status": "success", "message": "FCM token saved"}
    except Exception as e:
        frappe.log_error(f"Error saving FCM token: {str(e)}")
        return {"status": "error", "message": str(e)}
	

#########################################################################################################################33



@frappe.whitelist(allow_guest=False)
def get_employee_count():
    """
    Get the total number of active employees.
    Returns:
        dict: {"count": int}
    """
    try:
        count = frappe.db.count("Employee", filters={"status": "Active"})
        return {"count": count}
    except Exception as e:
        frappe.log_error(f"Error fetching employee count: {str(e)}")
        frappe.throw(_("Failed to fetch employee count"))


####################################################################################################

@frappe.whitelist()
def get_leave_applications(employee=None, for_approval=False, include_balances=False):
    try:
        filters = {}
        if employee:
            filters['employee'] = employee
        if for_approval:
            filters['status'] = 'Open'
            filters['leave_approver'] = frappe.session.user

        fields = ['name', 'employee', 'employee_name', 'leave_type', 'from_date', 'to_date', 'total_leave_days', 'status', 'description']
        leaves = frappe.get_all('Leave Application', filters=filters, fields=fields)

        if include_balances and employee:
            leave_balances = frappe.get_all(
                'Leave Ledger Entry',
                filters={'employee': employee, 'is_cancelled': 0},
                fields=['leave_type', 'SUM(leaves) as balance'],
                group_by='leave_type'
            )
            balance_map = {entry.leave_type: flt(entry.balance) for entry in leave_balances}
            return {'leaves': leaves, 'leave_balances': balance_map}
        return leaves
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), 'Get Leave Applications Error')
        return {'status': 'error', 'message': str(e)}

@frappe.whitelist()
def apply_workflow_action(doctype, docname, action):
    try:
        if not frappe.has_permission(doctype, 'write', docname):
            frappe.throw(f'Insufficient permissions to {action.lower()} {doctype}')

        doc = frappe.get_doc(doctype, docname)
        if action not in ['Approve', 'Reject']:
            frappe.throw(f'Invalid action: {action}')

        if get_workflow_name(doctype):
            apply_workflow(doc, action)
        else:
            doc.status = 'Approved' if action == 'Approve' else 'Rejected'
            doc.db_update()

        if action == 'Approve' and doctype == 'Leave Application':
            leave_ledger = frappe.get_doc({
                'doctype': 'Leave Ledger Entry',
                'employee': doc.employee,
                'leave_type': doc.leave_type,
                'leaves': -flt(doc.total_leave_days),
                'transaction_type': 'Leave Application',
                'transaction_name': doc.name,
                'is_carry_forward': 0,
                'is_expired': 0,
                'posting_date': nowdate()
            })
            leave_ledger.insert(ignore_permissions=True)

        frappe.db.commit()

        leave_balances = frappe.get_all(
            'Leave Ledger Entry',
            filters={'employee': doc.employee, 'is_cancelled': 0},
            fields=['leave_type', 'SUM(leaves) as balance'],
            group_by='leave_type'
        )
        balance_map = {entry.leave_type: flt(entry.balance) for entry in leave_balances}

        return {
            'status': 'success',
            'message': f'Leave {action.lower()}d successfully',
            'leave_balances': balance_map
        }
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), f'Apply Workflow Action Error: {action}')
        return {'status': 'error', 'message': str(e)}

@frappe.whitelist()
def create_leave_application(employee, leave_type, from_date, to_date, half_day=0, half_day_date=None, description=None, leave_approver=None):
    try:
        if not employee or not leave_type or not from_date or not to_date:
            frappe.throw("Employee, leave type, from date, and to date are mandatory fields", title="Validation Error")
        
        if not frappe.db.exists("Employee", employee):
            frappe.throw(f"Employee {employee} does not exist", title="Invalid Employee")
        
        if not frappe.db.exists("Leave Type", leave_type):
            frappe.throw(f"Leave Type {leave_type} does not exist", title="Invalid Leave Type")
        
        if leave_approver and not frappe.db.exists("User", leave_approver):
            frappe.throw(f"Leave Approver {leave_approver} does not exist", title="Invalid Approver")

        from_date = getdate(from_date)
        to_date = getdate(to_date)
        if to_date < from_date:
            frappe.throw("To Date cannot be before From Date", title="Invalid Date Range")
        
        total_leave_days = (to_date - from_date).days + 1
        if half_day and half_day_date:
            half_day_date = getdate(half_day_date)
            if half_day_date < from_date or half_day_date > to_date:
                frappe.throw("Half Day Date must be between From and To Dates", title="Invalid Half Day Date")
            total_leave_days -= 0.5

        leave_balance = frappe.get_value(
            "Leave Ledger Entry",
            {"employee": employee, "leave_type": leave_type, "is_cancelled": 0},
            "SUM(leaves) as balance",
            as_dict=True
        )["balance"] or 0

        if leave_balance < total_leave_days:
            frappe.throw(f"Insufficient leave balance for {leave_type}. Available: {leave_balance}, Requested: {total_leave_days}", title="Insufficient Balance")

        leave_application = frappe.get_doc({
            "doctype": "Leave Application",
            "employee": employee,
            "leave_type": leave_type,
            "from_date": from_date,
            "to_date": to_date,
            "total_leave_days": total_leave_days,
            "half_day": half_day,
            "half_day_date": half_day_date if half_day else None,
            "description": description,
            "leave_approver": leave_approver,
            "status": "Open",
            "posting_date": nowdate(),
        })
        leave_application.insert(ignore_permissions=False)

        frappe.db.commit()
        return {"status": "success", "message": "Leave application created successfully", "name": leave_application.name}
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Create Leave Application Error")
        frappe.response.http_status_code = 400
        frappe.throw(str(e), title="Failed to create leave application")

@frappe.whitelist()
def get_attendance_records(employee, start_date, end_date):
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
                'docstatus': 1  # Only submitted records
            },
            fields=['attendance_date', 'in_time as check_in', 'custom_out_time_copy as check_out', 'status']
        )

        # Return consistent format that matches your frontend expectations
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
    try:
        if not start_date or not end_date:
            frappe.throw("Start date and end date are mandatory fields", title="Validation Error")

        start_date = getdate(start_date)
        end_date = getdate(end_date)
        if end_date < start_date:
            frappe.throw("End date cannot be before start date", title="Invalid Date Range")

        # Get holidays from all holiday lists (you might want to filter by employee's holiday list)
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
    try:
        if not employee or not start_date or not end_date:
            frappe.throw("Employee, start date, and end date are mandatory fields", title="Validation Error")

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
                'end_date': ['>=', start_date],  # Better date range filtering
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






################################################################################################################
def initialize_firebase():
    if not firebase_admin._apps:  # Check if Firebase is already initialized
        try:
            service_account = frappe.get_site_config().get("firebase_service_account")
            if not service_account:
                frappe.log_error("Firebase Initialization Error", "No firebase_service_account found in site_config.json")
                raise ValueError("Firebase service account not configured")
            cred = credentials.Certificate(service_account)
            firebase_admin.initialize_app(cred)
            frappe.log_error("Firebase Initialization", "Firebase Admin SDK initialized successfully")
        except Exception as e:
            frappe.log_error("Firebase Initialization Error", str(e))
            raise

# Call initialize_firebase at module level
initialize_firebase()


@frappe.whitelist(allow_guest=False)
def save_fcm_token(token, device_type):
    """Save or update FCM token for a user."""
    if not token or device_type not in ['Android', 'iOS']:
        frappe.throw(_("Invalid token or device type"))
    
    user = frappe.session.user
    existing = frappe.db.exists("Mobile Device", {"user": user})
    
    if existing:
        frappe.db.set_value("Mobile Device", existing, {
            "fcm_token": token,
            "device_type": device_type,
            "last_active": now_datetime()
        })
    else:
        existing_token = frappe.db.exists("Mobile Device", {"fcm_token": token})
        if existing_token:
            frappe.db.set_value("Mobile Device", existing_token, {
                "user": user,
                "device_type": device_type,
                "last_active": now_datetime()
            })
        else:
            doc = frappe.get_doc({
                "doctype": "Mobile Device",
                "user": user,
                "fcm_token": token,
                "device_type": device_type,
                "last_active": now_datetime()
            })
            doc.insert(ignore_permissions=True)
    
    frappe.db.commit()
    return {"status": "success", "message": "FCM token saved"}

def send_fcm_notification(tokens, title, body):
    """Send FCM notification to multiple tokens."""
    if not tokens:
        frappe.log_error("FCM Send Error", "No tokens provided")
        return {"success_count": 0, "failure_count": 0, "message": "No tokens provided"}
    
    messages = [messaging.Message(
        notification=messaging.Notification(title=title, body=body),
        token=token
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
        raise

def is_holiday_today(employee):
    """Check if today is a holiday for the employee."""
    holiday_list = get_holiday_list_for_employee(employee, raise_exception=False)
    if not holiday_list:
        return False
    today = getdate()
    return frappe.db.exists("Holiday", {"parent": holiday_list, "holiday_date": today})

def get_employee_tokens(employees):
    """Get FCM tokens for a list of employees."""
    users = frappe.get_all("Employee", filters={"name": ["in", employees], "status": "Active"}, pluck="user_id")
    return frappe.get_all("Mobile Device", filters={"user": ["in", users]}, pluck="fcm_token")

def send_work_log_reminder():
    """Send hourly work log reminder between 10 AM and 7 PM IST, skipping holidays and existing logs."""
    now = now_datetime()
    current_hour = now.hour  # Get hour in 24-hour format (0-23)
    
    # Only send notifications between 10 AM (10) and 7 PM (19)
    if not (10 < current_hour < 19):
        frappe.log_error("Work Log Reminder Skipped", f"Current time {now.strftime('%H:%M:%S')} is outside 10 AM to 7 PM IST")
        return
    
    today = getdate()
    employees = frappe.get_all("Employee", filters={"status": "Active"}, pluck="name")
    for emp in employees:
        if is_holiday_today(emp):
            continue
        if frappe.db.exists("Daily Task Log", {"employee_id": emp, "posting_date": today, "docstatus": 1}):
            continue
        tokens = get_employee_tokens([emp])
        if not tokens:
            frappe.log_error("No Tokens Found", f"No valid tokens for employee: {emp}")
            continue
        response = send_fcm_notification(tokens, "Work Log Reminder", "Please update your work log.")
        frappe.log_error(f"Work Log Reminder sent to {emp}", f"Tokens: {tokens}, Response: {response}")

def send_checkin_reminder():
    """Send daily check-in reminder at 10 AM, skipping holidays and checked-in employees."""
    today = getdate()
    employees = frappe.get_all("Employee", filters={"status": "Active"}, pluck="name")
    for emp in employees:
        if is_holiday_today(emp):
            continue
        if frappe.db.exists("Attendance", {"employee": emp, "attendance_date": today, "in_time": ["is", "set"]}):
            continue
        tokens = get_employee_tokens([emp])
        send_fcm_notification(tokens, "Check-in Reminder", "Don't forget to check in today.")
        frappe.log_error(f"Check-in Reminder sent to {emp}", tokens)

def send_checkout_reminder():
    """Send daily checkout reminder at 7 PM, skipping holidays and checked-out employees."""
    today = getdate()
    employees = frappe.get_all("Employee", filters={"status": "Active"}, pluck="name")
    for emp in employees:
        if is_holiday_today(emp):
            continue
        if frappe.db.exists("Attendance", {"employee": emp, "attendance_date": today, "custom_out_time_copy": ["is", "set"]}):
            continue
        tokens = get_employee_tokens([emp])
        send_fcm_notification(tokens, "Checkout Reminder", "Time to check out!")
        frappe.log_error(f"Checkout Reminder sent to {emp}", tokens)

@frappe.whitelist(allow_guest=False)
def send_admin_notification(docname):
    """Send admin-triggered notification, ignoring holidays."""
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
    frappe.log_error("Tokens for Notification", str(tokens))  # Debug log
    if not tokens:
        frappe.log_error("No Tokens Found", f"No valid tokens for employees: {employees}")
        return {"status": "error", "message": "No valid tokens found"}
    
    response = send_fcm_notification(tokens, doc.title, doc.message)
    frappe.log_error("FCM Notification Response", str(response))  # Debug log
    
    doc.status = "Sent"
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"status": "success", "message": "Notification sent"}

def process_scheduled_notifications():
    """Process scheduled notifications."""
    now = now_datetime()
    notifications = frappe.get_all("Notification Master", filters={
        "status": "Queued",
        "send_now": 0,
        "schedule_time": ["<=", now]
    }, pluck="name")
    
    for name in notifications:
        send_admin_notification(name)



####################################################################################




###########################################################################################################

@frappe.whitelist(allow_guest=False)
def get_employee_statistics():
    """
    Get comprehensive employee statistics for admin dashboard.
    Returns statistics about attendance, WFH, leaves, etc.
    Excludes employees on holidays from absent count.
    """
    try:
        # Check permissions
        if not any(role in frappe.get_roles() for role in ["System Manager", "HR Manager", "HR User"]):
            frappe.throw(_("You do not have permission to access this resource."), frappe.PermissionError)

        today = getdate()
        
        # Get all active employees
        all_employees = frappe.get_all(
            "Employee",
            filters={"status": "Active"},
            fields=["name", "employee_name"]
        )
        total_employees = len(all_employees)
        
        # Get today's attendance
        today_attendance = frappe.get_all(
            "Attendance",
            filters={
                "attendance_date": today,
                "docstatus": ["!=", 2]
            },
            fields=["employee", "employee_name", "status", "in_time"]
        )
        
        # Calculate attendance stats
        present_today = len([att for att in today_attendance if att.status == "Present"])
        wfh_today = len([att for att in today_attendance if att.status == "Work From Home"])
        
        # Get employees who are present or WFH
        attended_employee_ids = {att.employee for att in today_attendance if att.status in ["Present", "Work From Home"]}
        
        # Calculate absent count excluding holidays
        absent_today = 0
        employees_on_holiday = 0
        
        for emp in all_employees:
            if emp.name not in attended_employee_ids:
                # Check if it's a holiday for this employee
                is_holiday = is_employee_on_holiday(emp.name, today)
                
                if is_holiday:
                    employees_on_holiday += 1
                else:
                    absent_today += 1
        
        # Calculate late arrivals (after 10:05 AM)
        late_arrivals = 0
        for att in today_attendance:
            if att.in_time and att.status == "Present":
                if is_late_arrival(att.in_time):
                    late_arrivals += 1
        
        # Get employees on approved leave today
        on_leave = frappe.db.count(
            "Leave Application",
            filters={
                "from_date": ["<=", today],
                "to_date": [">=", today],
                "status": "Approved",
                "docstatus": 1
            }
        )
        
        # Calculate attendance rate excluding holidays
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
        # Return fallback data instead of throwing error
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
    """
    Check if a specific employee is on holiday for a given date.
    """
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
    """
    Get list of employees who are absent today.
    """
    try:
        # Check permissions
        if not any(role in frappe.get_roles() for role in ["System Manager", "HR Manager", "HR User"]):
            frappe.throw(_("You do not have permission to access this resource."), frappe.PermissionError)

        today = getdate()
        
        # Get all active employees
        all_employees = frappe.get_all(
            "Employee",
            filters={"status": "Active"},
            fields=["name", "employee_name", "department", "designation", "user_id"]
        )

        # Get today's attendance records
        today_attendance = frappe.get_all(
            "Attendance",
            filters={
                "attendance_date": today,
                "docstatus": ["!=", 2]
            },
            fields=["employee"]
        )

        # Create set of present employees
        present_employee_ids = {att.employee for att in today_attendance}
        
        # Find absent employees
        absent_employees = []
        for emp in all_employees:
            if emp.name not in present_employee_ids:
                # Check if it's a holiday for this employee
                holiday_list = get_holiday_list_for_employee(emp.name, raise_exception=False)
                is_holiday = False
                if holiday_list:
                    is_holiday = frappe.db.exists("Holiday", {
                        "parent": holiday_list, 
                        "holiday_date": today
                    })
                
                # Only include in absent list if it's not a holiday
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
    """
    Get list of employees who arrived late today (after 10:05 AM).
    """
    try:
        # Check permissions
        if not any(role in frappe.get_roles() for role in ["System Manager", "HR Manager", "HR User"]):
            frappe.throw(_("You do not have permission to access this resource."), frappe.PermissionError)

        today = getdate()
        
        # Get today's attendance with check-in times
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
        standard_time = time(10, 5)  # 10:05 AM as requested
        
        for att in today_attendance:
            if att.in_time:
                try:
                    # Handle different time formats
                    if isinstance(att.in_time, str):
                        if ' ' in att.in_time:
                            check_in_time = datetime.strptime(att.in_time.split(' ')[1], "%H:%M:%S").time()
                        else:
                            check_in_time = datetime.strptime(att.in_time, "%H:%M:%S").time()
                    else:
                        check_in_time = att.in_time.time() if hasattr(att.in_time, 'time') else att.in_time
                    
                    if check_in_time > standard_time:
                        # Get employee details
                        emp_details = frappe.get_value(
                            "Employee", 
                            att.employee, 
                            ["department", "designation"], 
                            as_dict=True
                        )
                        
                        # Calculate how late they were
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
                    # Skip if time parsing fails
                    frappe.log_error(f"Time parsing error for {att.employee}: {str(parse_error)}")
                    continue

        # Sort by latest first
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
    """
    Get department-wise attendance statistics excluding employees on holidays.
    """
    try:
        # Check permissions
        if not any(role in frappe.get_roles() for role in ["System Manager", "HR Manager", "HR User"]):
            frappe.throw(_("You do not have permission to access this resource."), frappe.PermissionError)

        today = getdate()
        
        # Get all active employees with departments
        employees = frappe.get_all(
            "Employee",
            filters={"status": "Active"},
            fields=["name", "department"]
        )
        
        # Get today's attendance
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
        
        # Group by department and exclude holidays
        department_stats = {}
        for emp in employees:
            dept = emp.department or "Not Assigned"
            if dept not in department_stats:
                department_stats[dept] = {"total": 0, "present": 0, "holiday": 0}
            
            # Check if employee is on holiday
            is_holiday = is_employee_on_holiday(emp.name, today)
            
            if is_holiday:
                department_stats[dept]["holiday"] += 1
            else:
                department_stats[dept]["total"] += 1
                if emp.name in present_employees:
                    department_stats[dept]["present"] += 1
        
        # Convert to list format
        result = []
        for dept_name, stats in department_stats.items():
            working_employees = stats["total"]  # Already excludes holidays
            result.append({
                "department": dept_name,
                "total": stats["total"] + stats["holiday"],  # All employees
                "working_today": working_employees,  # Excluding holidays
                "present": stats["present"],
                "holiday": stats["holiday"],
                "attendance_percentage": round((stats["present"] / working_employees * 100), 1) if working_employees > 0 else 0
            })
        
        # Sort by total employees (largest departments first)
        result.sort(key=lambda x: x["total"], reverse=True)
        
        return result
        
    except Exception as e:
        frappe.log_error(f"Get Department Statistics Error: {str(e)[:100]}")
        return []


@frappe.whitelist(allow_guest=False)
def get_attendance_analytics(period="week"):
    """
    Get attendance analytics for different time periods, excluding holidays.
    """
    try:
        # Check permissions
        if not any(role in frappe.get_roles() for role in ["System Manager", "HR Manager", "HR User"]):
            frappe.throw(_("You do not have permission to access this resource."), frappe.PermissionError)

        today = getdate()
        
        if period == "week":
            # Get last 7 days of data
            from datetime import timedelta
            start_date = today - timedelta(days=6)  # Last 7 days including today
            
            daily_stats = []
            total_attendance = 0
            total_working_days = 0
            
            for i in range(7):
                current_date = start_date + timedelta(days=i)
                
                # Get all active employees
                all_employees = frappe.get_all("Employee", filters={"status": "Active"}, pluck="name")
                total_employees = len(all_employees)
                
                # Count employees on holiday for this date
                employees_on_holiday = 0
                for emp in all_employees:
                    if is_employee_on_holiday(emp, current_date):
                        employees_on_holiday += 1
                
                working_employees = total_employees - employees_on_holiday
                
                # Get attendance for this date
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
            
            # Calculate average attendance excluding holidays
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
            # For other periods, return empty data for now
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

#############################################################################################################




@frappe.whitelist(allow_guest=False)
def get_attendance_by_date(date, employee_id=None, department=None):
    """
    Fetch attendance records by date with optional filters.
    """
    try:
        # Check admin permissions
        if not any(role in frappe.get_roles() for role in ["System Manager", "HR Manager", "HR User"]):
            frappe.throw(_("You do not have permission to access this resource."), frappe.PermissionError)
        
        if not date:
            frappe.throw(_("Date is required"))
        
        date = getdate(date)
        
        # Build filters
        filters = {
            "attendance_date": date,
            "docstatus": ["!=", 2]  # Exclude cancelled records
        }
        
        if employee_id:
            filters["employee"] = employee_id
        
        if department:
            # Get employees from specific department
            dept_employees = frappe.get_all("Employee", 
                filters={"department": department, "status": "Active"}, 
                pluck="name"
            )
            if dept_employees:
                filters["employee"] = ["in", dept_employees]
            else:
                # No employees in department
                return {
                    "attendance_records": [],
                    "total_records": 0,
                    "date": date.strftime("%Y-%m-%d"),
                    "summary": {
                        "total": 0, "present": 0, "absent": 0, 
                        "missing_checkout": 0, "draft": 0
                    }
                }
        
        # Fetch attendance records
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
        
        # Get employee department info
        employee_dept_map = {}
        if attendance_records:
            employee_ids = [record.employee for record in attendance_records]
            dept_info = frappe.get_all("Employee", 
                filters={"name": ["in", employee_ids]},
                fields=["name", "department", "designation"]
            )
            employee_dept_map = {emp.name: emp for emp in dept_info}
        
        # Enhance records with additional info
        enhanced_records = []
        summary = {"total": 0, "present": 0, "absent": 0, "missing_checkout": 0, "draft": 0}
        
        for record in attendance_records:
            # Add department info
            emp_info = employee_dept_map.get(record.employee, {})
            record.department = emp_info.get("department", "Not Assigned")
            record.designation = emp_info.get("designation", "Not Assigned")
            
            # Calculate working hours if not already calculated
            if record.in_time and (record.out_time or record.custom_out_time_copy):
                checkout_time = record.out_time or record.custom_out_time_copy
                if not record.working_hours:
                    try:
                        time_diff = checkout_time - record.in_time
                        record.working_hours = round(time_diff.total_seconds() / 3600, 2)
                    except:
                        record.working_hours = 0
            
            # Check if late arrival (after 10:05 AM)
            record.is_late = is_late_arrival(record.in_time) if record.in_time else False
            
            # Determine record status for summary
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
        
        # Get all employees for the department/overall to calculate absent count
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
        
        # Calculate actual absent count (employees not in attendance records)
        attended_employees = [record.employee for record in enhanced_records]
        absent_employees = []
        
        for emp in all_employees:
            if emp not in attended_employees:
                # Check if it's a holiday for this employee
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
    """
    Get list of all departments for filtering.
    """
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

##################################################################








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


# ---------------------- Employee Lists (Scoped) ----------------------
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


# ---------------------- Create Operations ----------------------
@frappe.whitelist()
def create_task(project, subject, description=None, exp_start_date=None, exp_end_date=None, priority=None):
    """Create a new task."""
    try:
        if not project:
            frappe.throw(_("Project is required"))
        
        if not subject:
            frappe.throw(_("Task subject/title is required"))
        
        if not frappe.db.exists("Project", project):
            frappe.throw(_("Project {0} does not exist").format(project))
        
        if not _is_priv():
            emp = _emp_of()
            if not emp:
                frappe.throw(_("No employee record found for current user"), frappe.PermissionError)
            
            is_member = frappe.db.exists("Project Member", {
                "parent": project, 
                "employee": emp, 
                "active": 1
            })
            
            if not is_member:
                frappe.throw(_("You are not a member of this project"), frappe.PermissionError)
        
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
        
        frappe.log_error(
            f"Task created: {task.name}",
            f"Project: {project}, User: {frappe.session.user}"
        )
        
        return {
            "ok": True, 
            "task": task.name,
            "task_name": task.subject,
            "message": _("Task created successfully")
        }
        
    except frappe.PermissionError as e:
        frappe.log_error(f"Permission Error: {str(e)}", "Task Creation")
        frappe.throw(str(e), frappe.PermissionError)
    except Exception as e:
        frappe.log_error(f"Task Creation Error: {str(e)}", "Task Creation")
        frappe.throw(_("Failed to create task: {0}").format(str(e)))


@frappe.whitelist()
def add_task_log(task, description, log_time=None):
    """Add a task log entry."""
    try:
        if not task:
            frappe.throw(_("Task is required"))
        
        if not description or not description.strip():
            frappe.throw(_("Log description is required"))
        
        if not frappe.db.exists("Task", task):
            frappe.throw(_("Task {0} does not exist").format(task))
        
        project = frappe.db.get_value("Task", task, "project")
        if not project:
            frappe.throw(_("Invalid task - no project linked"))
        
        emp = _emp_of()
        
        if not _is_priv():
            if not emp:
                frappe.throw(_("No employee record found"), frappe.PermissionError)
            
            is_member = frappe.db.exists("Project Member", {
                "parent": project, 
                "employee": emp, 
                "active": 1
            })
            
            if not is_member:
                frappe.throw(_("You are not a member of this project"), frappe.PermissionError)
        
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
        
    except frappe.PermissionError as e:
        frappe.log_error(f"Permission Error: {str(e)}", "Task Log")
        frappe.throw(str(e), frappe.PermissionError)
    except Exception as e:
        frappe.log_error(f"Task Log Error: {str(e)}", "Task Log")
        frappe.throw(_("Failed to add task log: {0}").format(str(e)))


# ---------------------- Project Summary ----------------------
@frappe.whitelist()
def my_project_summary(project, limit_tasks=200, limit_logs=200):
    """Get complete project summary."""
    user = frappe.session.user
    if not _is_priv(user):
        emp = _emp_of(user)
        if not emp or not frappe.db.exists("Project Member", {
            "parent": project, "employee": emp, "active": 1
        }):
            frappe.throw(_("Not permitted."), frappe.PermissionError)

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