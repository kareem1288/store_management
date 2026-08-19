import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import validate_email_address


class SignUpDetails(Document):
	def validate(self):
		self.email_address = (self.email_address or "").strip().lower()
		self.full_name = (self.full_name or "").strip()
		self.store_name = (self.store_name or "").strip()
		if not validate_email_address(self.email_address):
			frappe.throw(_("Enter a valid email address."))
		if self.phone_number and not self.phone_number.replace("+", "").replace(" ", "").isdigit():
			frappe.throw(_("Enter a valid phone number."))

