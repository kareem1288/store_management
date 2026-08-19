import hashlib
import hmac
import json
import secrets

import frappe
from frappe import _
from frappe.rate_limiter import rate_limit


OTP_EXPIRY_SECONDS = 300
MAX_OTP_ATTEMPTS = 5


def _key(challenge_id):
	return f"my_sales_login_otp:{challenge_id}"


def _get_challenge(challenge_id):
	value = frappe.cache.get_value(_key(challenge_id))
	if not value:
		frappe.throw(_("This login verification has expired. Please sign in again."), frappe.AuthenticationError)
	return frappe._dict(json.loads(value) if isinstance(value, str) else value)


def _save_challenge(challenge_id, value):
	frappe.cache.set_value(_key(challenge_id), json.dumps(value), expires_in_sec=OTP_EXPIRY_SECONDS)


def _mask_email(email):
	name, domain = email.split("@", 1)
	return f"{name[:2]}{'*' * max(2, len(name) - 2)}@{domain}"


def _mask_mobile(number):
	digits = "".join(filter(str.isdigit, number or ""))
	return f"******{digits[-4:]}" if len(digits) >= 4 else "registered mobile"


@frappe.whitelist(allow_guest=True)
@rate_limit(key="email", limit=10, seconds=300, methods="POST")
def begin_otp_login(email, password):
	"""Validate credentials and return delivery choices without creating a session."""
	manager = frappe.local.login_manager
	manager.authenticate(user=(email or "").strip(), pwd=password or "")
	user = manager.user
	user_details = frappe.db.get_value("User", user, ["email", "mobile_no", "phone"], as_dict=True)
	mobile = user_details.mobile_no or user_details.phone
	challenge_id = secrets.token_urlsafe(24)
	_save_challenge(challenge_id, {"user": user, "password": password, "attempts": 0})
	return {
		"challenge_id": challenge_id,
		"email_available": bool(user_details.email),
		"mobile_available": bool(mobile),
		"masked_email": _mask_email(user_details.email) if user_details.email else None,
		"masked_mobile": _mask_mobile(mobile) if mobile else None,
	}


@frappe.whitelist(allow_guest=True)
@rate_limit(key="challenge_id", limit=5, seconds=300, methods="POST")
def send_login_otp(challenge_id, delivery):
	challenge = _get_challenge(challenge_id)
	user_details = frappe.db.get_value("User", challenge.user, ["email", "mobile_no", "phone"], as_dict=True)
	delivery = (delivery or "").lower()
	otp = f"{secrets.randbelow(1_000_000):06d}"
	challenge.otp_hash = hashlib.sha256(f"{challenge_id}:{otp}".encode()).hexdigest()
	challenge.attempts = 0
	challenge.delivery = delivery
	_save_challenge(challenge_id, challenge)

	if delivery == "email" and user_details.email:
		from store_management.brevo import send_otp_email
		send_otp_email(user_details.email, otp)
		masked = _mask_email(user_details.email)
	elif delivery == "mobile" and (user_details.mobile_no or user_details.phone):
		from store_management.brevo import send_otp_sms
		mobile = user_details.mobile_no or user_details.phone
		send_otp_sms(mobile, otp)
		masked = _mask_mobile(mobile)
	else:
		frappe.throw(_("The selected OTP delivery method is unavailable for this user."))
	return {"delivery": delivery, "masked_destination": masked, "expires_in": OTP_EXPIRY_SECONDS}


@frappe.whitelist(allow_guest=True)
@rate_limit(key="challenge_id", limit=10, seconds=300, methods="POST")
def verify_login_otp(challenge_id, otp):
	challenge = _get_challenge(challenge_id)
	if not challenge.get("otp_hash"):
		frappe.throw(_("Choose where to receive your OTP first."), frappe.AuthenticationError)
	if challenge.attempts >= MAX_OTP_ATTEMPTS:
		frappe.cache.delete_value(_key(challenge_id))
		frappe.throw(_("Too many incorrect attempts. Please sign in again."), frappe.AuthenticationError)
	provided_hash = hashlib.sha256(f"{challenge_id}:{(otp or '').strip()}".encode()).hexdigest()
	if not hmac.compare_digest(challenge.otp_hash, provided_hash):
		challenge.attempts += 1
		_save_challenge(challenge_id, challenge)
		frappe.throw(_("Incorrect verification code."), frappe.AuthenticationError)

	manager = frappe.local.login_manager
	manager.authenticate(user=challenge.user, pwd=challenge.password)
	frappe.cache.delete_value(_key(challenge_id))
	manager.post_login()
	return {"status": "Logged In", "redirect_to": "/pos"}
