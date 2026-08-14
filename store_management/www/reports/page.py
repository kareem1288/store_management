import frappe


def get_context(context):
	context.no_cache = 1
	context.show_sidebar = 0
	context.login_required = 1
	context.title = "Reports · My Sales"
	context.body_class = "store-reports-page"
	context.meta_description = "Review sales performance in My Sales."

	try:
		from store_management.api import _get_default_company

		context.default_company = _get_default_company() or ""
	except Exception:
		frappe.log_error(frappe.get_traceback(), "Reports Default Company Failed")
		context.default_company = ""
