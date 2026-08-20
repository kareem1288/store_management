import base64
import io
import json
import secrets
import re

import frappe
from frappe import _
from frappe.utils import add_days, flt, get_first_day, nowdate

CATEGORY_COLORS = [
	"#1F9D55",
	"#0F766E",
	"#2563EB",
	"#C2410C",
	"#BE185D",
	"#7C3AED",
	"#CA8A04",
	"#0891B2",
]

MOBILE_MASTER_DOCTYPES = {
	"Company",
	"Customer",
	"Customer Group",
	"Item",
	"Item Group",
	"Item Tax Template",
	"Role Profile",
	"UOM",
	"User",
}

MOBILE_LINK_DOCTYPES = MOBILE_MASTER_DOCTYPES | {"Country", "Currency", "Language", "Territory"}

MY_SALES_REPORTS = {
	"sales": "Sales Register",
	"items": "Item-wise Sales Register",
	"customers": "Customer Ledger Summary",
	"open-bills": "Accounts Receivable",
}


def _make_qr_data_uri(value):
	try:
		import segno
	except ImportError:
		frappe.throw(_("QR support is not installed. Run bench setup requirements and restart the bench."))

	output = io.BytesIO()
	segno.make(value, error="m").save(output, kind="svg", scale=6, border=2, dark="#101512")
	return "data:image/svg+xml;base64," + base64.b64encode(output.getvalue()).decode("ascii")


@frappe.whitelist()
def create_upi_payment(amount):
	"""Create a safe test QR or request a live UPI payment from the configured gateway."""
	if frappe.session.user == "Guest":
		frappe.throw(_("Please sign in to create a payment request."), frappe.PermissionError)

	amount = flt(amount, 2)
	if amount <= 0:
		frappe.throw(_("Payment amount must be greater than zero."))
	if not frappe.db.exists("DocType", "UPI Configuration"):
		frappe.throw(_("UPI Configuration is not installed. Run bench migrate."))

	configuration = frappe.get_single("UPI Configuration")
	if not configuration.enabled:
		frappe.throw(_("UPI payments are disabled in UPI Configuration."))
	if not configuration.company:
		frappe.throw(_("Select a Company in UPI Configuration."))

	reference = f"UPI-{secrets.token_hex(8).upper()}"
	mode = configuration.status or "Testing"
	upi_id = configuration.upi_id or ""

	if mode == "Testing":
		# Deliberately not a upi://pay URI: scanning this QR can never initiate a debit.
		payment_uri = f"mysales-test://payment/{reference}?amount=0&display_amount={amount:.2f}"
		return {
			"mode": "Testing",
			"chargeable": False,
			"amount": amount,
			"transaction_id": reference,
			"payment_uri": payment_uri,
			"qr_code": _make_qr_data_uri(payment_uri),
			"upi_id": upi_id or _("Test payment"),
			"company": configuration.company,
			"message": _("Test QR generated. No amount will be deducted."),
		}

	if not configuration.payment_api_url or not configuration.payment_api_url.startswith("https://"):
		frappe.throw(_("Configure a valid HTTPS Payment API URL for Live mode."))

	api_key = configuration.get_password("api_key", raise_exception=False)
	api_secret = configuration.get_password("api_secret", raise_exception=False)
	if not api_key or not api_secret:
		frappe.throw(_("Configure the API Key and API Secret for Live mode."))

	import requests

	payload = {
		"amount": amount,
		"currency": "INR",
		"reference": reference,
		"upi_id": upi_id,
		"company": configuration.company,
		"redirect_url": configuration.redirect_to,
	}
	try:
		response = requests.post(
			configuration.payment_api_url,
			json=payload,
			headers={"X-API-Key": api_key, "X-API-Secret": api_secret, "Accept": "application/json"},
			timeout=20,
		)
		response.raise_for_status()
		gateway_data = response.json()
	except (requests.RequestException, ValueError):
		frappe.log_error(frappe.get_traceback(), "UPI payment request failed")
		frappe.throw(_("The UPI gateway could not create a payment request. Please try again."))

	payment_uri = gateway_data.get("payment_uri") or gateway_data.get("upi_uri") or gateway_data.get("payment_url")
	if not payment_uri:
		frappe.throw(_("The UPI gateway response did not contain a payment URI."))

	return {
		"mode": "Live",
		"chargeable": True,
		"amount": amount,
		"transaction_id": gateway_data.get("transaction_id") or gateway_data.get("id") or reference,
		"payment_uri": payment_uri,
		"qr_code": gateway_data.get("qr_code") or _make_qr_data_uri(payment_uri),
		"upi_id": upi_id,
		"expires_in": gateway_data.get("expires_in") or 300,
		"message": _("Live payment request created."),
	}


@frappe.whitelist()
def run_my_sales_report(report_type, filters=None):
	"""Run an approved My Sales report with a reliable company default."""
	from frappe.desk.query_report import run

	report_name = MY_SALES_REPORTS.get(report_type) or frappe.db.get_value(
		"Custom Reports", {"route_key": report_type}, "report_name"
	)
	if not report_name:
		frappe.throw(_("Unsupported report type"))

	if isinstance(filters, str):
		filters = json.loads(filters or "{}")
	filters = frappe._dict(filters or {})
	filters.company = filters.get("company") or _get_default_company()
	if not filters.company:
		frappe.throw(_("Please configure a default Company before running reports."))

	return run(
		report_name=report_name,
		filters=filters,
		user=frappe.session.user,
		ignore_prepared_report=True,
	)


@frappe.whitelist()
def get_report_sidebar(include_catalog=False):
	"""Return the user's configurable report navigation and optional Report catalog."""
	configured = frappe.get_all(
		"Custom Reports",
		fields=["report_name", "route_key", "is_visible", "is_default", "display_order", "accent_color", "report_description"],
		order_by="display_order asc, report_name asc",
	)
	result = {"reports": configured}
	if frappe.parse_json(include_catalog):
		configured_names = {row.report_name for row in configured}
		catalog = frappe.get_all(
			"Report",
			filters={"disabled": 0, "report_type": ["in", ["Query Report", "Script Report"]]},
			fields=["name", "ref_doctype", "report_type"],
			order_by="name asc",
			limit_page_length=0,
		)
		result["catalog"] = [
			row for row in catalog
			if row.name not in configured_names and frappe.get_cached_doc("Report", row.name).is_permitted()
		]
	return result


@frappe.whitelist()
def add_report_to_sidebar(report_name):
	"""Add an existing permitted Query/Script Report to My Sales navigation."""
	report = frappe.get_doc("Report", report_name)
	if report.disabled or report.report_type not in {"Query Report", "Script Report"}:
		frappe.throw(_("Select an enabled Query Report or Script Report."))
	if not frappe.has_permission("Report", "read", report):
		frappe.throw(_("You do not have permission to use this report."), frappe.PermissionError)
	if frappe.db.exists("Custom Reports", report_name):
		frappe.db.set_value("Custom Reports", report_name, "is_visible", 1)
	else:
		route_key = re.sub(r"[^a-z0-9]+", "-", report_name.lower()).strip("-")
		frappe.get_doc({
			"doctype": "Custom Reports", "report_name": report_name, "route_key": route_key,
			"is_visible": 1, "display_order": 100, "accent_color": "#168650",
		}).insert()
	return get_report_sidebar(include_catalog=True)


@frappe.whitelist()
def set_report_sidebar_visibility(report_name, visible=0):
	"""Show or hide a configured report without deleting the underlying ERPNext Report."""
	if not frappe.db.exists("Custom Reports", report_name):
		frappe.throw(_("Report is not configured in My Sales."))
	frappe.db.set_value("Custom Reports", report_name, "is_visible", 1 if frappe.parse_json(visible) else 0)
	return get_report_sidebar(include_catalog=True)


@frappe.whitelist()
def remove_report_from_sidebar(report_name):
	"""Remove a user-added report configuration without deleting the ERPNext Report."""
	name = frappe.db.get_value("Custom Reports", {"report_name": report_name}, "name")
	if not name:
		frappe.throw(_("Report is not configured in My Sales."))
	if frappe.db.get_value("Custom Reports", name, "is_default"):
		frappe.throw(_("Default reports can be hidden, but cannot be removed."))
	frappe.delete_doc("Custom Reports", name)
	return get_report_sidebar(include_catalog=True)

# ... [all existing functions remain the same] ...

@frappe.whitelist(allow_guest=True)
def forgot_password_helper(email):
    """
    Handle forgot password for store management
    """
    if not frappe.db.exists('Email Account', {'enable_outgoing': 1,'default_outgoing': 1}):
        return {
			"status": "error",
			"message": "No outgoing email account configured. Please contact administrator."
		}
    if not frappe.db.exists("User", email):
        return {
			"status": "error",
			"message": "User with email {0} does not exist".format(email)
		}
    try:
        frappe.sendmail(
            recipients=email,
            subject=_("Password Reset Request"),
            template="password_reset",
            args={"user": email}
        )
        return {
            "status": "success",
            "message": "Password reset email sent successfully"
        }
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Store Forgot Password Error")
        frappe.throw(_("Failed to send password reset email"))

def _get_first_available(doctype, preferred_names=None, extra_filters=None):
	if not frappe.db.exists("DocType", doctype):
		return None

	filters = extra_filters or {}

	if preferred_names:
		for name in preferred_names:
			name_filters = dict(filters)
			name_filters["name"] = name
			record = frappe.get_all(doctype, filters=name_filters, pluck="name", limit=1)
			if record:
				return record[0]

	records = frappe.get_all(doctype, filters=filters, pluck="name", limit=1)
	return records[0] if records else None


def _get_leaf_customer_group():
	return _get_first_available(
		"Customer Group",
		preferred_names=["Commercial", "Individual", "Retail"],
		extra_filters={"is_group": 0},
	)


def _get_leaf_territory():
	preferred = ["India", "Default Territory", "Telangana", "Hyderabad"]
	return _get_first_available(
		"Territory",
		preferred_names=preferred,
		extra_filters={"is_group": 0},
	)


def _ensure_walk_in_customer():
	walk_in_customer = frappe.db.exists("Customer", "Walk-in Customer")
	if walk_in_customer:
		return walk_in_customer

	if not frappe.db.exists("DocType", "Customer"):
		return None

	customer_group = _get_leaf_customer_group()
	territory = _get_leaf_territory()

	if not customer_group or not territory:
		return None

	customer_doc = frappe.get_doc(
		{
			"doctype": "Customer",
			"customer_name": "Walk-in Customer",
			"customer_group": customer_group,
			"territory": territory,
		}
	)
	customer_doc.insert(ignore_permissions=True)
	return customer_doc.name


def _get_default_customer():
	try:
		if frappe.db.exists("DocType", "Selling Settings") and frappe.db.has_column("Selling Settings", "customer"):
			customer = frappe.db.get_single_value("Selling Settings", "customer")
			if customer:
				return customer
	except frappe.db.TableMissingError:
		# Selling Settings table is not available in this site, fall back to customer defaults.
		pass

	walk_in_customer = _ensure_walk_in_customer()
	if walk_in_customer:
		return walk_in_customer

	customers = frappe.get_all("Customer", pluck="name", limit=1)
	return customers[0] if customers else None


def _get_default_company():
	if not frappe.db.exists("DocType", "Company"):
		return None

	default_company = None

	try:
		default_company = frappe.defaults.get_user_default("Company")
	except Exception:
		default_company = None

	if default_company and frappe.db.exists("Company", default_company):
		return default_company

	try:
		default_company = frappe.db.get_single_value("Global Defaults", "default_company")
	except Exception:
		default_company = None

	if default_company and frappe.db.exists("Company", default_company):
		return default_company

	companies = frappe.get_all("Company", pluck="name", limit=1)
	return companies[0] if companies else None


def _parse_items(items):
	"""Parse cart items from JSON/list into validated format."""
	if not items:
		return []
	try:
		if isinstance(items, str):
			items_list = json.loads(items)
		else:
			items_list = items
		parsed = []
		for row in items_list:
			item_code = row.get("item_code") or row.get("name")
			qty = flt(row.get("qty") or row.get("quantity") or 0)
			rate = flt(row.get("rate") or row.get("standard_rate") or 0)
			if item_code and qty > 0 and rate > 0:
				parsed.append({
					"item_code": item_code,
					"qty": qty,
					"rate": rate
				})
		return parsed
	except (json.JSONDecodeError, TypeError, ValueError):
		return []


def _resolve_customer(customer=None, customer_phone=None):
	if customer and frappe.db.exists("Customer", customer):
		return customer

	if customer:
		customer_match = frappe.get_all(
			"Customer",
			filters={"customer_name": customer},
			pluck="name",
			limit=1,
		)
		if customer_match:
			return customer_match[0]

	if customer_phone and frappe.db.has_column("Customer", "mobile_no"):
		customer_match = frappe.get_all(
			"Customer",
			filters={"mobile_no": customer_phone},
			pluck="name",
			limit=1,
		)
		if customer_match:
			return customer_match[0]

	return _get_default_customer()


def _get_dashboard_summary():
	today = nowdate()
	sales = frappe.get_all(
		"Sales Invoice",
		filters={"docstatus": 1, "posting_date": today},
		fields=["name", "customer", "grand_total", "posting_time", "total_qty"],
		order_by="modified desc",
		limit_page_length=0,
	)

	month_start = get_first_day(today)
	month_sales = frappe.get_all(
		"Sales Invoice",
		filters={"docstatus": 1, "posting_date": ["between", [month_start, today]]},
		fields=[{"SUM": "grand_total", "as": "total"}],
	)
	today_customers = frappe.db.count(
		"Customer", {"creation": ["between", [f"{today} 00:00:00", f"{today} 23:59:59"]]}
	)
	today_items = frappe.get_all(
		"Sales Invoice Item",
		filters={"docstatus": 1, "parent": ["in", [row.name for row in sales] or [""]]},
		fields=[{"SUM": "qty", "as": "qty"}],
	)

	trend = []
	for offset in range(-6, 1):
		day = add_days(today, offset)
		day_total = frappe.get_all(
			"Sales Invoice",
			filters={"docstatus": 1, "posting_date": day},
			fields=[{"SUM": "grand_total", "as": "total"}],
		)
		trend.append({"date": str(day), "total": flt(day_total[0].total if day_total else 0)})

	categories = frappe.get_all(
		"Sales Invoice Item",
		filters={"docstatus": 1, "creation": ["between", [f"{month_start} 00:00:00", f"{today} 23:59:59"]]},
		fields=["item_group as label", {"SUM": "base_net_amount", "as": "value"}],
		group_by="item_group",
		order_by="value desc",
		limit=5,
	)
	top_items = frappe.get_all(
		"Sales Invoice Item",
		filters={"docstatus": 1, "creation": ["between", [f"{month_start} 00:00:00", f"{today} 23:59:59"]]},
		fields=[
			"item_name",
			{"SUM": "qty", "as": "sold"},
			{"SUM": "base_net_amount", "as": "revenue"},
		],
		group_by="item_code, item_name",
		order_by="sold desc",
		limit=5,
	)
	recent_bills = frappe.get_all(
		"Sales Invoice",
		filters={"docstatus": 1},
		fields=["name", "customer", "grand_total", "posting_date", "posting_time", "total_qty"],
		order_by="posting_date desc, posting_time desc",
		limit=5,
	)

	return {
		"today_sales": round(sum(flt(row.grand_total) for row in sales), 2),
		"today_bills": len(sales),
		"today_customers": today_customers,
		"today_items_sold": flt(today_items[0].qty if today_items else 0),
		"month_sales": flt(month_sales[0].total if month_sales else 0),
		"recent_bills": recent_bills,
		"trend": trend,
		"categories": categories,
		"top_items": top_items,
	}


@frappe.whitelist()
def create_sample_dashboard_data():
	"""Create a small, clearly marked demo dataset for My Sales dashboards."""
	frappe.only_for("System Manager")

	existing = frappe.get_all(
		"Sales Invoice",
		filters={"remarks": ["like", "%My Sales Dashboard Demo%"], "docstatus": 1},
		pluck="name",
		limit_page_length=0,
	)
	if existing:
		return {"created": False, "invoices": existing, "message": _("Sample dashboard data already exists.")}

	company = _get_default_company()
	customer_group = _get_leaf_customer_group()
	territory = _get_leaf_territory()
	if not company or not customer_group or not territory:
		frappe.throw(_("Set up a Company, leaf Customer Group, and leaf Territory before creating sample data."))

	item_group = _get_first_available(
		"Item Group", preferred_names=["Products", "Groceries"], extra_filters={"is_group": 0}
	)
	if not item_group:
		frappe.throw(_("Create at least one leaf Item Group before creating sample data."))

	customers = []
	for customer_name in ["Walk-in Customer", "Ramesh Kumar (Demo)", "Priya Store (Demo)"]:
		customer = frappe.db.exists("Customer", customer_name)
		if not customer:
			customer_doc = frappe.get_doc(
				{
					"doctype": "Customer",
					"customer_name": customer_name,
					"customer_group": customer_group,
					"territory": territory,
				}
			)
			customer_doc.insert(ignore_permissions=True)
			customer = customer_doc.name
		customers.append(customer)

	items = []
	for code, item_name, rate, hsn_code in [
		("MYSALES-DEMO-OIL", "Oil", 100, "151219"),
		("MYSALES-DEMO-RICE", "Rice", 50, "100630"),
		("MYSALES-DEMO-SUGAR", "Sugar", 45, "170199"),
		("MYSALES-DEMO-FLOUR", "Wheat Flour", 35, "11010000"),
	]:
		if not frappe.db.exists("Item", code):
			frappe.get_doc(
				{
					"doctype": "Item",
					"item_code": code,
					"item_name": item_name,
					"item_group": item_group,
					"stock_uom": "Nos",
					"is_stock_item": 0,
					"is_sales_item": 1,
					"standard_rate": rate,
					"gst_hsn_code": hsn_code,
				}
			).insert(ignore_permissions=True)
		items.append((code, rate))

	created_invoices = []
	for index, offset in enumerate([-6, -5, -4, -3, -2, -1, 0]):
		first_item = items[index % len(items)]
		second_item = items[(index + 1) % len(items)]
		invoice = frappe.get_doc(
			{
				"doctype": "Sales Invoice",
				"company": company,
				"customer": customers[index % len(customers)],
				"posting_date": add_days(nowdate(), offset),
				"due_date": add_days(nowdate(), offset),
				"set_posting_time": 1,
				"posting_time": f"{9 + (index % 3):02d}:{10 + index * 5:02d}:00",
				"remarks": "My Sales Dashboard Demo",
				"items": [
					{"item_code": first_item[0], "qty": index + 2, "rate": first_item[1]},
					{"item_code": second_item[0], "qty": (index % 3) + 1, "rate": second_item[1]},
				],
			}
		)
		invoice.insert(ignore_permissions=True)
		invoice.submit()
		created_invoices.append(invoice.name)

	frappe.db.commit()
	return {
		"created": True,
		"invoices": created_invoices,
		"message": _("Created sample customers, items, and seven submitted invoices."),
	}


@frappe.whitelist()
def get_pos_bootstrap():
	items = frappe.get_all(
		"Item",
		filters={"disabled": 0, "is_sales_item": 1, "has_variants": 0},
		fields=[
			"name",
			"item_name",
			"item_group",
			"standard_rate",
			"image",
			"stock_uom",
			"description",
		],
		order_by="item_group asc, item_name asc",
		limit_page_length=0,
	)

	category_names = []
	for item in items:
		if item.item_group and item.item_group not in category_names:
			category_names.append(item.item_group)

	categories = [
		{
			"name": category_name,
			"color": CATEGORY_COLORS[index % len(CATEGORY_COLORS)],
		}
		for index, category_name in enumerate(category_names)
	]

	company = _get_default_company()

	return {
		"shop_name": company or _("Retail POS"),
		"company": company,
		"default_customer": _get_default_customer(),
		"categories": categories,
		"items": items,
		"summary": _get_dashboard_summary(),
	}


@frappe.whitelist()
def get_pos_categories():
	return get_pos_bootstrap().get("categories", [])


@frappe.whitelist()
def get_pos_items():
	return get_pos_bootstrap().get("items", [])


@frappe.whitelist()
def get_pos_items_by_barcode(query):
	if not query:
		return []

	# First try exact match
	barcodes = frappe.get_all(
		"Item Barcode",
		filters={"barcode": query},
		pluck="parent",
		limit_page_length=1,
	)

	# If no exact match, try partial match
	if not barcodes:
		barcodes = frappe.get_all(
			"Item Barcode",
			filters={"barcode": ["like", f"%{query}%"]},
			pluck="parent",
			limit_page_length=0,
		)

	if not barcodes:
		return []

	return frappe.get_all(
		"Item",
		filters={"name": ["in", barcodes], "disabled": 0},
		fields=[
			"name",
			"item_name",
			"item_group",
			"standard_rate",
			"image",
			"stock_uom",
			"description",
		],
		order_by="item_name asc",
		limit_page_length=0,
	)


@frappe.whitelist()
def create_pos_bill(
	customer=None,
	customer_phone=None,
	payment_method="Cash",
	payment_reference=None,
	items=None,
	additional_discount_amount=0,
	notes=None,
):
	cart_items = _parse_items(items)
	if not cart_items:
		frappe.throw(_("No items in cart"))

	invoice_items = []
	for row in cart_items:
		item_code = row.get("item_code") or row.get("name")
		qty = flt(row.get("qty") or row.get("quantity") or 0)
		rate = flt(row.get("rate") or row.get("standard_rate") or 0)

		if not item_code or qty <= 0:
			continue

		invoice_items.append(
			{
				"item_code": item_code,
				"qty": qty,
				"rate": rate,
			}
		)

	if not invoice_items:
		frappe.throw(_("No valid items found in cart"))

	customer_name = _resolve_customer(customer=customer, customer_phone=customer_phone)
	if not customer_name:
		frappe.throw(_("Please create at least one Customer in ERPNext before billing."))

	company = _get_default_company()
	if not company:
		frappe.throw(_("Please set a default Company in ERPNext before billing."))

	remarks = [f"Payment Mode: {payment_method}"]
	if notes:
		remarks.append(notes)
	if customer_phone:
		remarks.append(f"Customer Phone: {customer_phone}")

	invoice = frappe.get_doc(
		{
			"doctype": "Sales Invoice",
			"company": company,
			"customer": customer_name,
			"posting_date": nowdate(),
			"due_date": nowdate(),
			"remarks": " | ".join(remarks),
			"items": invoice_items,
			"apply_discount_on": "Grand Total",
			"additional_discount_amount": flt(additional_discount_amount),
		}
	)

	invoice.insert()
	invoice.submit()

	payment_entry = _create_and_submit_payment_entry(
		invoice,
		payment_method=payment_method,
		payment_reference=payment_reference,
	)
	frappe.enqueue(
		"store_management.api._attach_thermal_bill_job",
		queue="short",
		enqueue_after_commit=True,
		invoice_name=invoice.name,
	)

	return {
		"name": invoice.name,
		"customer": invoice.customer,
		"grand_total": invoice.grand_total,
		"rounded_total": invoice.rounded_total or invoice.grand_total,
		"posting_date": invoice.posting_date,
		"payment_entry": payment_entry.name,
		"bill_attachment_queued": True,
	}


def _create_and_submit_payment_entry(invoice, payment_method="Cash", payment_reference=None):
	from erpnext.accounts.doctype.payment_entry.payment_entry import get_payment_entry

	payment_entry = get_payment_entry("Sales Invoice", invoice.name)
	if frappe.db.exists("Mode of Payment", payment_method):
		payment_entry.mode_of_payment = payment_method

	payment_entry.reference_date = invoice.posting_date
	payment_entry.reference_no = payment_reference or invoice.name
	payment_entry.remarks = _("POS payment for Sales Invoice {0} via {1}").format(
		invoice.name,
		payment_method,
	)
	payment_entry.insert()
	payment_entry.submit()
	return payment_entry


def _attach_thermal_bill(invoice):
	from frappe.utils.file_manager import save_file
	from weasyprint import HTML

	file_name = f"{invoice.name}-thermal-receipt.pdf"
	receipt_html = frappe.get_print(
		"Sales Invoice",
		invoice.name,
		print_format="My Sales Thermal Receipt",
		as_pdf=False,
		no_letterhead=True,
	)
	pdf_content = HTML(string=receipt_html, base_url=frappe.utils.get_url()).write_pdf()
	return save_file(
		file_name,
		pdf_content,
		"Sales Invoice",
		invoice.name,
		is_private=1,
	)


def _attach_existing_thermal_bill(invoice_name):
	"""Attach the app receipt to an existing invoice; useful for repair and migration checks."""
	attachment = _attach_thermal_bill(frappe.get_doc("Sales Invoice", invoice_name))
	frappe.db.commit()
	return {"file_name": attachment.file_name, "file_url": attachment.file_url}


def _attach_thermal_bill_job(invoice_name):
	return _attach_thermal_bill(frappe.get_doc("Sales Invoice", invoice_name))


# Masters Management APIs

def _validate_mobile_master_doctype(doctype):
	if doctype not in MOBILE_MASTER_DOCTYPES:
		frappe.throw(_("{0} is not available in My Sales").format(doctype), frappe.PermissionError)


@frappe.whitelist()
def get_master_records(doctype):
	"""Get all records for a master doctype"""
	_validate_mobile_master_doctype(doctype)
	if not frappe.db.exists("DocType", doctype):
		frappe.throw(f"DocType {doctype} not found")
	
	return frappe.get_all(doctype, fields=["*"], order_by="name asc", limit_page_length=0)


@frappe.whitelist()
def get_master_link_records(doctype):
	"""Return safe link choices without exposing extra doctypes to master mutations."""
	if doctype not in MOBILE_LINK_DOCTYPES:
		frappe.throw(_("{0} is not available in My Sales").format(doctype), frappe.PermissionError)
	return frappe.get_all(doctype, fields=["name"], order_by="name asc", limit_page_length=0)


@frappe.whitelist()
def get_master_record(doctype, name):
	"""Get a single master record"""
	_validate_mobile_master_doctype(doctype)
	if not frappe.db.exists("DocType", doctype):
		frappe.throw(f"DocType {doctype} not found")
	
	if not frappe.db.exists(doctype, name):
		frappe.throw(f"{doctype} {name} not found")
	
	doc = frappe.get_doc(doctype, name)
	result = doc.as_dict()
	
	# For User doctype, include role profiles
	if doctype == "User":
		role_profiles = []
		if hasattr(doc, "role_profiles") and doc.role_profiles:
			role_profiles = [rp.role_profile for rp in doc.role_profiles]
		elif hasattr(doc, "user_roles") and doc.user_roles:
			# Get role profiles from assigned roles
			user_roles = [ur.role for ur in doc.user_roles]
			# Find role profiles that contain these roles
			all_profiles = frappe.get_all("Role Profile", pluck="name")
			for profile in all_profiles:
				try:
					profile_doc = frappe.get_doc("Role Profile", profile)
					profile_roles = [rp.role for rp in profile_doc.roles]
					if any(r in user_roles for r in profile_roles):
						role_profiles.append(profile)
				except:
					pass
		result["role_profiles"] = ",".join(role_profiles) if role_profiles else ""
	
	return result


@frappe.whitelist()
def create_master_record(doctype, **kwargs):
	"""Create a new master record"""
	_validate_mobile_master_doctype(doctype)
	if not frappe.db.exists("DocType", doctype):
		frappe.throw(f"DocType {doctype} not found")
	
# Handle role profiles for User doctype
	role_profiles_str = kwargs.pop("role_profiles", None) if doctype == "User" else None

	# Remove doctype from kwargs if present
	kwargs.pop("doctype", None)

	# For User doctype, set role_profile_name if role profiles were selected
	if doctype == "User" and role_profiles_str:
		profiles = [p.strip() for p in role_profiles_str.split(",") if p.strip()]
		if profiles:
			# Use first selected profile as role_profile_name
			kwargs["role_profile_name"] = profiles[0]

	doc = frappe.get_doc({
		"doctype": doctype,
		**kwargs
	})

	doc.insert()

# Add roles from ALL selected role profiles (including the first one)
	if doctype == "User" and role_profiles_str:
		profiles = [p.strip() for p in role_profiles_str.split(",") if p.strip()]
		if profiles:
			# Get existing roles from database to ensure we have the latest data
			existing_roles = set()
			if doc.roles:
				for role in doc.roles:
					existing_roles.add(role.role)

			# Add roles from ALL selected profiles
			for profile in profiles:
				if frappe.db.exists("Role Profile", profile):
					profile_doc = frappe.get_doc("Role Profile", profile)
					for rp in profile_doc.roles:
						if frappe.db.exists("Role", rp.role) and rp.role not in existing_roles:
							# Check if role is already assigned to user in database
							if not frappe.db.exists("Has Role", {"parent": doc.name, "role": rp.role}):
								frappe.get_doc({
									"doctype": "Has Role",
									"parent": doc.name,
									"parenttype": "User",
									"parentfield": "roles",
									"role": rp.role
								}).insert(ignore_permissions=True)
							existing_roles.add(rp.role)

		doc.reload()

	return {"name": doc.name}

import frappe

@frappe.whitelist()
def update_master_record(doctype, name, **kwargs):
	"""Update an existing master record"""
	_validate_mobile_master_doctype(doctype)

	if not frappe.db.exists("DocType", doctype):
		frappe.throw(f"DocType {doctype} not found")

	if not frappe.db.exists(doctype, name):
		frappe.throw(f"{doctype} {name} not found")

	kwargs.pop("doctype", None)
	kwargs.pop("name", None)

	role_profiles_str = kwargs.pop("role_profiles", None) if doctype == "User" else None

	doc = frappe.get_doc(doctype, name)

	# Update normal fields
	doc.update(kwargs)

	# Handle multiple role profiles (Frappe v16)
	if doctype == "User" and role_profiles_str:

		profiles = [p.strip() for p in role_profiles_str.split(",") if p.strip()]

		# Clear existing role profiles
		doc.set("role_profiles", [])

		existing_roles = {d.role for d in doc.roles}

		for profile in profiles:

			if frappe.db.exists("Role Profile", profile):

				# Add role profile row
				doc.append("role_profiles", {
					"role_profile": profile
				})

				# Fetch roles from profile
				profile_doc = frappe.get_doc("Role Profile", profile)

				for rp in profile_doc.roles:
					if rp.role not in existing_roles and frappe.db.exists("Role", rp.role):

						doc.append("roles", {
							"role": rp.role
						})

						existing_roles.add(rp.role)

	doc.save(ignore_permissions=True)
	return {"name": doc.name}
@frappe.whitelist()
def delete_master_record(doctype, name):
	"""Delete a master record"""
	_validate_mobile_master_doctype(doctype)
	if not frappe.db.exists("DocType", doctype):
		frappe.throw(f"DocType {doctype} not found")
	
	if not frappe.db.exists(doctype, name):
		frappe.throw(f"{doctype} {name} not found")
	
	frappe.delete_doc(doctype, name)
	return {"success": True}
