from pathlib import Path
import re

import frappe


PRINT_FORMAT_NAME = "My Sales Thermal Receipt"


def after_migrate():
	"""Install or update the app-owned thermal Sales Invoice print format."""
	ensure_company_language_field()
	ensure_default_reports()
	ensure_mobile_otp_authentication()
	ensure_upi_mode_of_payment()
	template_path = Path(frappe.get_app_path("store_management", "print_formats", "my_sales_thermal_receipt.html"))
	html = template_path.read_text(encoding="utf-8")

	if frappe.db.exists("Print Format", PRINT_FORMAT_NAME):
		print_format = frappe.get_doc("Print Format", PRINT_FORMAT_NAME)
	else:
		print_format = frappe.new_doc("Print Format")
		print_format.name = PRINT_FORMAT_NAME

	print_format.update(
		{
			"doc_type": "Sales Invoice",
			"module": "Store Management",
			"custom_format": 1,
			"print_format_type": "Jinja",
			"html": html,
			"disabled": 0,
			"standard": "No",
		}
	)
	print_format.save(ignore_permissions=True)

	frappe.make_property_setter(
		{
			"doctype": "Sales Invoice",
			"doctype_or_field": "DocType",
			"property": "default_print_format",
			"value": PRINT_FORMAT_NAME,
			"property_type": "Data",
		},
		validate_fields_for_doctype=False,
	)
	frappe.clear_cache(doctype="Sales Invoice")


def ensure_company_language_field():
	"""Add the company-owned language preference without modifying ERPNext core."""
	from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

	create_custom_fields({
		"Company": [{
			"fieldname": "custom_application_language",
			"label": "Application Language",
			"fieldtype": "Link",
			"options": "Language",
			"default": "en",
			"description": "Language used by My Sales web and mobile users of this company.",
			"insert_after": "default_currency",
		}],
	}, update=True)


def ensure_default_reports():
	"""Seed the standard report sidebar without overwriting user visibility choices."""
	removed_reports = {"Asset Depreciation Ledger"}
	for report_name in removed_reports:
		if frappe.db.exists("Custom Reports", report_name):
			frappe.db.set_value(
				"Custom Reports", report_name,
				{"is_visible": 0, "is_default": 0}, update_modified=False,
			)
	defaults = [
		("Sales Register", "sales", 10, "#168650"),
		("Item-wise Sales Register", "items", 20, "#2878c8"),
		("Customer Ledger Summary", "customers", 30, "#7b5cc7"),
		("Accounts Receivable", "open-bills", 40, "#d27a2d"),
		("Profit and Loss Statement", "profit-and-loss", 50, "#e45756"),
		("General Ledger", "general-ledger", 60, "#0f9d91"),
		("Trial Balance", "trial-balance", 70, "#7c5ce5"),
	]
	for row in frappe.get_all("Custom Reports", filters={"route_key": ["is", "not set"]}, fields=["name", "report_name"]):
		route_key = re.sub(r"[^a-z0-9]+", "-", row.report_name.lower()).strip("-")
		frappe.db.set_value("Custom Reports", row.name, "route_key", route_key, update_modified=False)
	for report_name, route_key, order, accent in defaults:
		if not frappe.db.exists("Report", report_name):
			continue
		if frappe.db.exists("Custom Reports", report_name):
			frappe.db.set_value("Custom Reports", report_name, {
				"route_key": route_key, "is_default": 1, "display_order": order, "accent_color": accent,
			}, update_modified=False)
			continue
		frappe.get_doc({
			"doctype": "Custom Reports", "report_name": report_name, "route_key": route_key,
			"is_visible": 1, "is_default": 1, "display_order": order, "accent_color": accent,
		}).insert(ignore_permissions=True)


def ensure_mobile_otp_authentication():
	"""Keep signup users marked for app-owned OTP without enabling site-wide 2FA."""
	role_name = "My Sales OTP User"
	if frappe.db.exists("Role", role_name):
		role = frappe.get_doc("Role", role_name)
	else:
		role = frappe.get_doc({"doctype": "Role", "role_name": role_name, "desk_access": 1})
	role.two_factor_auth = 0
	role.save(ignore_permissions=True)
	for signup in frappe.get_all("Sign Up Details", filters={"user": ["is", "set"]}, fields=["user", "phone_number"]):
		if not frappe.db.exists("User", signup.user):
			continue
		user = frappe.get_doc("User", signup.user)
		if signup.phone_number and not user.mobile_no:
			user.mobile_no = signup.phone_number
		if role_name not in {row.role for row in user.roles}:
			user.append("roles", {"role": role_name})
		if frappe.db.exists("Role", "Insights User") and "Insights User" not in {row.role for row in user.roles}:
			user.append("roles", {"role": "Insights User"})
		user.save(ignore_permissions=True)

	return True


def ensure_upi_mode_of_payment():
	"""Create the UPI payment mode and map it to each configured company's receiving account."""
	if frappe.db.exists("Mode of Payment", "UPI"):
		mode = frappe.get_doc("Mode of Payment", "UPI")
	else:
		mode = frappe.get_doc(
			{"doctype": "Mode of Payment", "mode_of_payment": "UPI", "type": "Phone", "enabled": 1}
		)

	companies = frappe.get_all("Company", pluck="name")
	configured_companies = {row.company for row in mode.accounts}
	for company in companies:
		if company in configured_companies:
			continue
		account = frappe.db.get_value(
			"Mode of Payment Account",
			{"parent": "Cash", "company": company},
			"default_account",
		)
		account = account or frappe.db.get_value(
			"Account",
			{"company": company, "is_group": 0, "account_type": ["in", ["Bank", "Cash"]]},
			"name",
		)
		if account:
			mode.append("accounts", {"company": company, "default_account": account})

	mode.save(ignore_permissions=True)
