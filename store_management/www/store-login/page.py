import frappe
from frappe.utils import sanitise_redirect


def get_context(context):
    if frappe.session.user != "Guest":
        frappe.local.flags.redirect_location = "/masters"
        raise frappe.Redirect

    context.redirect_to = "/masters"
    context.no_cache = 1
    context.no_header = True
    context.title = "Retail Billing Login"
