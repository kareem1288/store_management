import frappe
from frappe import _
from frappe.utils import getdate, nowdate


TRIAL_CONTACT = "9014040855"


def expiry_message():
	return _("Your 20-day free trial has ended. Please call or message {0} to continue using My Sales.").format(TRIAL_CONTACT)


def expire_trials():
	"""Disable users whose free trial has passed. Called daily by the scheduler."""
	today = getdate(nowdate())
	rows = frappe.get_all(
		"Sign Up Details",
		filters={"status": "Active Trial", "trial_end_date": ["<", today]},
		fields=["name", "user"],
	)
	for row in rows:
		if row.user and frappe.db.exists("User", row.user):
			frappe.db.set_value("User", row.user, "enabled", 0, update_modified=True)
		frappe.db.set_value("Sign Up Details", row.name, "status", "Trial Expired", update_modified=True)


def validate_trial_session(login_manager=None):
	"""Block a newly authenticated session immediately when its trial has expired."""
	user = getattr(login_manager, "user", None) or frappe.session.user
	if not user or user in {"Guest", "Administrator"}:
		return
	row = frappe.db.get_value(
		"Sign Up Details", {"user": user}, ["name", "trial_end_date", "status"], as_dict=True
	)
	if not row:
		return
	if row.status == "Trial Expired" or (row.trial_end_date and getdate(row.trial_end_date) < getdate(nowdate())):
		frappe.db.set_value("User", user, "enabled", 0, update_modified=True)
		frappe.db.set_value("Sign Up Details", row.name, "status", "Trial Expired", update_modified=True)
		frappe.throw(expiry_message(), frappe.AuthenticationError)
