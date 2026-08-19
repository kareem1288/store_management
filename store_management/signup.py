import base64
import json
import re

import frappe
from frappe import _
from frappe.utils import add_days, nowdate, validate_email_address


TRIAL_DAYS = 20


def _unique_company_abbreviation(store_name):
	words = re.findall(r"[A-Za-z0-9]+", store_name or "")
	base = "".join(word[0] for word in words[:5]).upper() or "STORE"
	base = base[:5]
	candidate = base
	index = 1
	while frappe.db.exists("Company", {"abbr": candidate}):
		suffix = str(index)
		candidate = f"{base[: 5 - len(suffix)]}{suffix}"
		index += 1
	return candidate


def _provision_store(doc, password):
	"""Create ERPNext records through Company/User hooks so standard defaults are installed."""
	company = frappe.get_doc({
		"doctype": "Company",
		"company_name": doc.store_name,
		"abbr": _unique_company_abbreviation(doc.store_name),
		"default_currency": doc.currency,
		"country": doc.country,
		"enable_perpetual_inventory": 1,
		"create_chart_of_accounts_based_on": "Standard Template",
	}).insert(ignore_permissions=True)

	available_roles = [
		role for role in ("Sales User", "Sales Manager", "Stock User", "Stock Manager", "Accounts User")
		if frappe.db.exists("Role", role)
	]
	user = frappe.get_doc({
		"doctype": "User",
		"email": doc.email_address,
		"first_name": doc.full_name,
		"enabled": 1,
		"user_type": "System User",
		"send_welcome_email": 0,
		"new_password": password,
		"roles": [{"role": role} for role in available_roles],
	}).insert(ignore_permissions=True)

	frappe.get_doc({
		"doctype": "User Permission",
		"user": user.name,
		"allow": "Company",
		"for_value": company.name,
		"is_default": 1,
		"apply_to_all_doctypes": 1,
	}).insert(ignore_permissions=True)
	frappe.defaults.set_user_default("Company", company.name, user.name)

	# Company insertion creates the standard chart of accounts, warehouses, cost
	# centers, departments, country fixtures, and default tax templates.
	from store_management.setup import ensure_upi_mode_of_payment
	ensure_upi_mode_of_payment()
	return company, user


@frappe.whitelist(allow_guest=True)
def create_signup_details(data):
	"""Store a new-store signup request without granting an account or permissions."""
	if isinstance(data, str):
		data = json.loads(data)
	data = frappe._dict(data or {})

	email = (data.email_address or "").strip().lower()
	if not validate_email_address(email):
		frappe.throw(_("Enter a valid email address."))
	if frappe.db.exists("Sign Up Details", {"email_address": email}):
		frappe.throw(_("A signup request already exists for this email address."))
	if frappe.db.exists("User", email):
		frappe.throw(_("A user account already exists for this email address."))
	if frappe.db.exists("Company", (data.store_name or "").strip()):
		frappe.throw(_("A company already exists with this store name."))
	if len(data.password or "") < 8:
		frappe.throw(_("Password must contain at least 8 characters."))

	allowed = {
		"full_name", "phone_number", "password", "store_name", "business_type",
		"store_address", "city", "pin_code", "state", "country", "currency",
		"financial_year_start", "tax_preference",
	}
	doc = frappe.new_doc("Sign Up Details")
	for fieldname in allowed:
		if fieldname in data:
			setattr(doc, fieldname, data.get(fieldname))
	doc.email_address = email
	doc.status = "Pending"
	doc.flags.ignore_permissions = True
	doc.insert()

	logo = data.get("store_logo")
	if logo and isinstance(logo, str) and logo.startswith("data:image/"):
		header, encoded = logo.split(",", 1)
		extension = header.split("/")[1].split(";")[0].replace("jpeg", "jpg")
		if extension not in {"png", "jpg", "webp"}:
			frappe.throw(_("Upload a PNG, JPG, or WEBP logo."))
		content = base64.b64decode(encoded)
		if len(content) > 2 * 1024 * 1024:
			frappe.throw(_("Store logo must be smaller than 2 MB."))
		from frappe.utils.file_manager import save_file
		file_doc = save_file(f"store-logo-{doc.name}.{extension}", content, doc.doctype, doc.name, is_private=1)
		doc.db_set("store_logo", file_doc.file_url, update_modified=False)

	company, user = _provision_store(doc, data.password)
	trial_start = nowdate()
	trial_end = add_days(trial_start, TRIAL_DAYS)
	doc.db_set({
		"company": company.name,
		"user": user.name,
		"trial_start_date": trial_start,
		"trial_end_date": trial_end,
		"status": "Active Trial",
	})

	return {
		"name": doc.name,
		"email": doc.email_address,
		"store_name": doc.store_name,
		"country": doc.country,
		"trial_end_date": trial_end,
		"provisioned": True,
	}


@frappe.whitelist(allow_guest=True)
def get_trial_login_status(email):
	"""Return only the expiry state needed for the public login error message."""
	row = frappe.db.get_value(
		"Sign Up Details",
		{"email_address": (email or "").strip().lower()},
		["status", "trial_end_date"],
		as_dict=True,
	)
	if not row:
		return {"expired": False}
	from store_management.trial import TRIAL_CONTACT
	return {"expired": row.status == "Trial Expired", "contact": TRIAL_CONTACT if row.status == "Trial Expired" else None}
