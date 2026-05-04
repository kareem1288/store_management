import frappe

def get_context(context):
    context.no_cache = 1
    context.show_sidebar = 0
    context.login_required = 0
    context.title = "Forgot Password - Retail Billing"
    context.meta_description = "Reset your Retail Billing password securely."

