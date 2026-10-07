import frappe

no_cache = 1


def get_context(context):
	context.no_cache = 1
	if frappe.session.user == "Guest":
		frappe.local.flags.redirect_location = "/store-login"
		raise frappe.Redirect
	context.title = "MSA · My Sales Assistant"
	context.no_header = True
	context.no_breadcrumbs = True
