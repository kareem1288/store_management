"""Read-only store assistant using permission-filtered ERP records."""

import frappe
from frappe import _
from frappe.utils import add_days, flt, getdate, nowdate
from frappe.rate_limiter import rate_limit


@frappe.whitelist()
@rate_limit(limit=30, seconds=60, methods=["POST"])
def ask(question):
	question = str(question or "").strip().lower()
	if not question or len(question) > 500:
		frappe.throw(_("Enter a question of up to 500 characters."))
	today = getdate(nowdate())
	start = getdate(add_days(today, -today.weekday())) if "week" in question else today
	if "stock" in question or "inventory" in question:
		rows = frappe.get_list("Bin", filters={"actual_qty": ["<=", 5]}, fields=["item_code", "warehouse", "actual_qty"], order_by="actual_qty asc", limit_page_length=10)
		text = "\n".join(f"{row.item_code} · {row.warehouse}: {flt(row.actual_qty):g}" for row in rows)
		return {"text": "Low-stock items (5 units or fewer):\n" + text if rows else "No low-stock items found in the inventory you can access."}
	if "top" in question or "selling" in question:
		invoices = frappe.get_list("Sales Invoice", filters={"docstatus": 1, "posting_date": ["between", [start, today]]}, pluck="name", limit_page_length=0)
		if not invoices:
			return {"text": "No sales found for this period in the records you can access."}
		rows = frappe.get_all("Sales Invoice Item", filters={"parent": ["in", invoices]}, fields=["item_name", {"SUM": "qty", "as": "sold"}], group_by="item_name", order_by="sold desc", limit_page_length=5)
		return {"text": "Top selling items for this period:\n" + "\n".join(f"{row.item_name}: {flt(row.sold):g} sold" for row in rows)}
	if "cash" in question:
		entries = frappe.get_list("Payment Entry", filters={"docstatus": 1, "payment_type": "Receive", "mode_of_payment": "Cash", "posting_date": today}, fields=["paid_amount"], limit_page_length=0)
		return {"text": f"Cash collected today ({today}): ₹{sum(flt(row.paid_amount) for row in entries):,.2f}"}
	if "sales" in question or "today" in question:
		rows = frappe.get_list("Sales Invoice", filters={"docstatus": 1, "posting_date": ["between", [start, today]]}, fields=["grand_total", "total_qty", "customer"], limit_page_length=0)
		return {"text": f"Sales summary: {start} – {today}", "metrics": {"Sales": f"₹{sum(flt(row.grand_total) for row in rows):,.2f}", "Bills": len(rows), "Items Sold": sum(flt(row.total_qty) for row in rows), "Customers": len({row.customer for row in rows})}}
	return {"text": "I can show today's sales, this week's sales, top selling items, low-stock items, and cash collected today. Use Reports for detailed or custom reports."}
