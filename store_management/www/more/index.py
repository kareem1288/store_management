import frappe

no_cache = 1


def get_context(context):
	context.no_cache = 1
	if frappe.session.user == "Guest":
		frappe.local.flags.redirect_location = "/store-login"
		raise frappe.Redirect
	user = frappe.get_cached_value("User", frappe.session.user, ["full_name", "email"], as_dict=True)
	context.full_name = user.full_name or frappe.session.user
	context.user_email = user.email or frappe.session.user
	context.user_initial = context.full_name[:1].upper()
	context.title = "More · My Sales"
