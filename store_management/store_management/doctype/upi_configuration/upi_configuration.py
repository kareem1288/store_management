# Copyright (c) 2026, Khaja Kareem Shaik and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class UPIConfiguration(Document):
	def validate(self):
		if self.status == "Live" and self.payment_api_url and not self.payment_api_url.startswith("https://"):
			self.payment_api_url = ""
			self.throw_invalid_live_url()

	def throw_invalid_live_url(self):
		import frappe

		frappe.throw("Payment API URL must use HTTPS in Live mode.")
