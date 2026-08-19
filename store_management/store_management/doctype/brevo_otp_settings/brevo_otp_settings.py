import frappe
from frappe import _
from frappe.model.document import Document


class BrevoOTPSettings(Document):
	def validate(self):
		if self.enabled and not self.api_key:
			frappe.throw(_("Enter the Brevo API Key."))
		if self.sms_sender and len(self.sms_sender) > 11:
			frappe.throw(_("The SMS sender must contain at most 11 characters."))
