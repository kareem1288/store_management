"""Local Ollama assistant with permission-filtered store report shortcuts."""

import json
import re
from urllib.parse import urlparse

import requests
import frappe
from frappe import _
from frappe.utils import add_days, flt, getdate, nowdate
from frappe.rate_limiter import rate_limit


@frappe.whitelist()
@rate_limit(limit=30, seconds=60, methods=["POST"])
def ask(question, history=None):
	original_question = str(question or "").strip()
	if not original_question or len(original_question) > 4000:
		frappe.throw(_("Enter a question of up to 4,000 characters."))
	question = re.sub(r"[?!.,]+$", "", original_question.lower()).strip()
	shortcuts = {
		"show today's sales", "today's sales summary", "show today’s sales summary", "show today's sales summary",
		"today's sales", "show this week's sales", "this week's sales",
		"top 5 selling items", "top selling items", "which items are low in stock",
		"low stock items", "cash collected today",
	}
	if question not in shortcuts:
		return _ask_general(original_question, history)

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
		rows = frappe.get_list("Sales Invoice", filters={"docstatus": 1, "posting_date": ["between", [start, today]]}, fields=["grand_total", "total_qty", "customer", "posting_time"], limit_page_length=0)
		hourly = {}
		for row in rows:
			time_label = str(row.get("posting_time") or "00:00:00")
			hour = time_label.split(":")[0]
			hourly[hour] = hourly.get(hour, 0) + flt(row.grand_total)
		trend = [{"label": f"{hour}:00", "value": round(value, 2)} for hour, value in sorted(hourly.items())]
		return {"text": f"Sales summary: {start} – {today}", "trend": trend, "metrics": {"Sales": f"₹{sum(flt(row.grand_total) for row in rows):,.2f}", "Bills": len(rows), "Items Sold": sum(flt(row.total_qty) for row in rows), "Customers": len({row.customer for row in rows})}}
	return _ask_general(original_question, history)


def _conversation_history(history):
	if isinstance(history, str):
		try:
			history = json.loads(history)
		except (TypeError, ValueError):
			frappe.throw(_("Invalid conversation history."))
	if history is None:
		return []
	if not isinstance(history, list) or len(history) > 12:
		frappe.throw(_("Conversation history must contain at most 12 messages."))
	clean = []
	for message in history:
		if not isinstance(message, dict) or message.get("role") not in {"user", "assistant"}:
			frappe.throw(_("Invalid conversation message."))
		content = message.get("content")
		if not isinstance(content, str) or len(content) > 8000:
			frappe.throw(_("Invalid conversation message length."))
		clean.append({"role": message["role"], "content": content})
	if sum(len(message["content"]) for message in clean) > 24000:
		frappe.throw(_("Conversation history is too long. Start a new chat."))
	return clean


def _ask_general(question, history=None):
	settings = frappe.get_single("MSA Settings")
	if not settings.enabled:
		return {"text": _("Ask an administrator to enable general answers and configure Ollama in MSA Settings. No API key is required.")}
	return _ask_ollama(question, history, settings)


def _ask_ollama(question, history, settings):
	model = (settings.get("local_model") or "").strip()
	if not model:
		return {"text": _("Enter the downloaded Ollama model name in MSA Settings. No API key is required.")}
	if model.endswith("-cloud"):
		frappe.throw(_("Choose a downloaded local model, not an Ollama cloud model."))
	base_url = (settings.get("ollama_url") or "http://127.0.0.1:11434").strip().rstrip("/")
	parsed = urlparse(base_url)
	if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
		frappe.throw(_("Configure a valid Ollama server URL without credentials in MSA Settings."))
	messages = [{"role": "system", "content": (
		"You are MSA, a helpful general-purpose assistant. Answer questions on any topic and match the user's language. "
		"You have no direct access to ERP records or live web search. Use verified store metrics in the conversation "
		"when provided, but never invent store data or pretend to search the internet or perform actions. "
		"Be transparent about uncertainty for current facts. Keep answers clear. Today is " + nowdate() + "."
	)}] + _conversation_history(history) + [{"role": "user", "content": question}]
	try:
		response = requests.post(
			base_url + "/api/chat",
			json={"model": model, "messages": messages, "stream": False, "options": {"num_predict": 2000}},
			timeout=(10, 90), allow_redirects=False,
		)
	except requests.RequestException:
		frappe.throw(_("MSA cannot reach Ollama. Start the model server and check its URL in MSA Settings."))
	if response.status_code == 404:
		frappe.throw(_("The Ollama model was not found. Download it and check its name in MSA Settings."))
	if not response.ok or 300 <= response.status_code < 400:
		frappe.throw(_("Ollama could not answer. Check the server and downloaded model configuration."))
	try:
		answer = response.json().get("message", {}).get("content", "").strip()
	except (ValueError, AttributeError, TypeError):
		frappe.throw(_("Ollama returned an invalid response. Please try again."))
	if not answer:
		frappe.throw(_("Ollama returned no answer. Please try again."))
	return {"text": answer, "sources": []}
