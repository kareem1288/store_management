import frappe


def get_context(context):
    context.no_cache = 1
    if frappe.session.user != "Guest":
        frappe.local.flags.redirect_location = "/pos"
        raise frappe.Redirect

    context.redirect_to = "/pos"
    context.no_cache = 1
    context.no_header = True
    context.no_breadcrumbs = True
    context.full_width = True
    context.show_sidebar = 0
    context.title = "Retail Billing Login"
