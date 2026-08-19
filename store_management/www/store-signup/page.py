import frappe


def get_context(context):
	if frappe.session.user != "Guest":
		frappe.local.flags.redirect_location = "/pos"
		raise frappe.Redirect
	context.no_cache = 1
	context.no_header = True
	context.no_breadcrumbs = True
	context.full_width = True
	context.show_sidebar = 0
	context.title = "Create Your Store"
