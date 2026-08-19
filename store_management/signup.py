import base64
import json

import frappe
from frappe import _
from frappe.utils import validate_email_address


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

	return {"name": doc.name, "email": doc.email_address, "store_name": doc.store_name, "country": doc.country}
