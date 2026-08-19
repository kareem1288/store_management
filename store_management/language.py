import frappe


def sync_company_language(doc, method=None):
	"""Keep each company user's Frappe language aligned with the company setting."""
	language = doc.get("custom_application_language") or "en"
	if not frappe.db.exists("Language", language):
		return

	users = frappe.get_all(
		"User Permission",
		filters={"allow": "Company", "for_value": doc.name},
		pluck="user",
	)
	for user in set(users):
		if user not in {"Administrator", "Guest"} and frappe.db.exists("User", user):
			frappe.db.set_value("User", user, "language", language, update_modified=False)

	frappe.clear_cache()
