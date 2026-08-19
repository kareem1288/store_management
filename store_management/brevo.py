import requests

import frappe
from frappe import _


BREVO_API_URL = "https://api.brevo.com/v3"


def _configuration():
	if not frappe.db.exists("DocType", "Brevo OTP Settings"):
		frappe.throw(_("Brevo OTP Settings is not installed. Run bench migrate."))
	settings = frappe.get_single("Brevo OTP Settings")
	if not settings.enabled:
		frappe.throw(_("Brevo OTP delivery is disabled. Enable Brevo OTP Settings."))
	api_key = settings.get_password("api_key")
	if not api_key:
		frappe.throw(_("Configure the Brevo API key in Brevo OTP Settings."))
	return settings, api_key


def _post(path, payload):
	settings, api_key = _configuration()
	try:
		response = requests.post(
			f"{BREVO_API_URL}{path}",
			headers={"api-key": api_key, "accept": "application/json", "content-type": "application/json"},
			json=payload,
			timeout=15,
		)
	except requests.RequestException:
		frappe.log_error(frappe.get_traceback(), "Brevo OTP Delivery Error")
		frappe.throw(_("Brevo could not be reached. Please try again."))
	if response.status_code not in {200, 201, 202, 204}:
		try:
			detail = response.json().get("message")
		except (ValueError, AttributeError):
			detail = None
		frappe.log_error(f"Brevo status {response.status_code}: {response.text[:1000]}", "Brevo OTP Rejected")
		frappe.throw(detail or _("Brevo rejected the OTP delivery request."))
	return settings, response


def send_otp_sms(recipient, otp):
	settings = frappe.get_single("Brevo OTP Settings")
	payload = {
		"sender": settings.sms_sender,
		"recipient": "".join(filter(str.isdigit, recipient or "")),
		"content": _("{0} is your My Sales login code. It expires in 5 minutes. Do not share it.").format(otp),
		"type": "transactional",
	}
	_post("/transactionalSMS/send", payload)
