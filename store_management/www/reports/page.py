import frappe
import json


def get_context(context):
	context.no_cache = 1
	context.show_sidebar = 0
	context.login_required = 1
	context.title = "Reports · My Sales"
	context.body_class = "store-reports-page"
	context.meta_description = "Review sales performance in My Sales."
	configured = frappe.get_all(
		"Custom Reports",
		filters={"is_visible": 1},
		fields=["report_name", "route_key", "accent_color", "display_order"],
		order_by="display_order asc, report_name asc",
	)
	context.configured_reports_json = json.dumps(configured)
	context.insights_dashboards = []
	if "insights" in frappe.get_installed_apps():
		for template, label in (("insights/sales", "Sales Analytics"), ("insights/accounting", "Accounting Analytics")):
			workbook = frappe.db.get_value("Insights Workbook", {"from_template": template}, "name")
			dashboard = workbook and frappe.db.get_value("Insights Dashboard v3", {"workbook": workbook}, "name", order_by="creation asc")
			if dashboard:
				context.insights_dashboards.append({"label": label, "url": f"/insights/dashboard/{dashboard}"})

	try:
		from store_management.api import _get_default_company

		context.default_company = _get_default_company() or ""
	except Exception:
		frappe.log_error(frappe.get_traceback(), "Reports Default Company Failed")
		context.default_company = ""
