import json

import frappe
from frappe import _
from frappe.utils import flt, nowdate


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


def _parse_items(items):
	if not items:
		return []

	if isinstance(items, str):
		items = json.loads(items)

	return items if isinstance(items, list) else []


def _get_default_company():
	return frappe.defaults.get_defaults().get("company") or frappe.db.get_single_value(
		"Global Defaults", "default_company"
	)


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
		fields=["name", "customer", "grand_total", "posting_time"],
		order_by="modified desc",
		limit=5,
	)

	return {
		"today_sales": round(sum(flt(row.grand_total) for row in sales), 2),
		"today_bills": len(sales),
		"recent_bills": sales,
	}


@frappe.whitelist(allow_guest=True)
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


@frappe.whitelist(allow_guest=True)
def get_pos_categories():
	return get_pos_bootstrap().get("categories", [])


@frappe.whitelist(allow_guest=True)
def get_pos_items():
	return get_pos_bootstrap().get("items", [])


@frappe.whitelist(allow_guest=True)
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

	return {
		"name": invoice.name,
		"customer": invoice.customer,
		"grand_total": invoice.grand_total,
		"rounded_total": invoice.rounded_total or invoice.grand_total,
		"posting_date": invoice.posting_date,
	}


# Masters Management APIs

@frappe.whitelist(allow_guest=True)
def get_master_records(doctype):
	"""Get all records for a master doctype"""
	if not frappe.db.exists("DocType", doctype):
		frappe.throw(f"DocType {doctype} not found")
	
	return frappe.get_all(doctype, fields=["*"], order_by="name asc", limit_page_length=0)


@frappe.whitelist(allow_guest=True)
def get_master_record(doctype, name):
	"""Get a single master record"""
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
	if not frappe.db.exists("DocType", doctype):
		frappe.throw(f"DocType {doctype} not found")
	
	if not frappe.db.exists(doctype, name):
		frappe.throw(f"{doctype} {name} not found")
	
	frappe.delete_doc(doctype, name)
	return {"success": True}
