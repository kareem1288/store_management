from pathlib import Path

import frappe


PRINT_FORMAT_NAME = "My Sales Thermal Receipt"


def after_migrate():
	"""Install or update the app-owned thermal Sales Invoice print format."""
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


def ensure_mobile_otp_authentication():
	"""Enable Frappe SMS 2FA only for users carrying the app-owned OTP role."""
	role_name = "My Sales OTP User"
	if frappe.db.exists("Role", role_name):
		role = frappe.get_doc("Role", role_name)
	else:
		role = frappe.get_doc({"doctype": "Role", "role_name": role_name, "desk_access": 1})
	role.two_factor_auth = 1
	role.save(ignore_permissions=True)
	for signup in frappe.get_all("Sign Up Details", filters={"user": ["is", "set"]}, fields=["user", "phone_number"]):
		if not frappe.db.exists("User", signup.user):
			continue
		user = frappe.get_doc("User", signup.user)
		if signup.phone_number and not user.mobile_no:
			user.mobile_no = signup.phone_number
		if role_name not in {row.role for row in user.roles}:
			user.append("roles", {"role": role_name})
		user.save(ignore_permissions=True)

	# Enabling SMS 2FA without a gateway would make valid users unable to receive
	# their code. Keep the role ready and activate it after SMS Settings is saved.
	if not frappe.db.get_single_value("SMS Settings", "sms_gateway_url"):
		return False

	settings = frappe.get_single("System Settings")
	was_enabled = bool(settings.enable_two_factor_auth)
	changed = False
	if not settings.enable_two_factor_auth:
		settings.enable_two_factor_auth = 1
		changed = True
	if settings.two_factor_method != "SMS":
		settings.two_factor_method = "SMS"
		changed = True
	if changed:
		settings.save(ignore_permissions=True)
	# Frappe marks the global All role during first-time activation. Restrict the
	# new requirement to My Sales customers instead of changing unrelated users.
	if not was_enabled and frappe.db.exists("Role", "All"):
		frappe.db.set_value("Role", "All", "two_factor_auth", 0, update_modified=False)
	return True


def activate_mobile_otp_after_sms_setup(doc=None, method=None):
	"""Activate customer OTP as soon as an administrator saves an SMS gateway."""
	if doc and doc.sms_gateway_url:
		ensure_mobile_otp_authentication()


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
