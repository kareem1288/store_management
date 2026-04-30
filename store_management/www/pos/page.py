import frappe
import json


def _empty_bootstrap():
	return {
		"shop_name": "Retail POS",
		"company": None,
		"default_customer": "Walk-in Customer",
		"categories": [],
		"items": [],
		"summary": {
			"today_sales": 0,
			"today_bills": 0,
			"recent_bills": [],
		},
	}

def get_context(context):
	context.no_cache = 1
	context.show_sidebar = 0
	context.login_required = 1
	context.title = "Retail POS"
	context.body_class = "store-pos-page"
	context.meta_description = "Fast bilingual retail POS for ERPNext and Frappe."
	try:
		from store_management.api import get_pos_bootstrap

		context.pos_bootstrap = get_pos_bootstrap() or _empty_bootstrap()
	except Exception:
		frappe.log_error(frappe.get_traceback(), "POS Page Bootstrap Failed")
		context.pos_bootstrap = _empty_bootstrap()

	context.pos_bootstrap_json = json.dumps(context.pos_bootstrap)
