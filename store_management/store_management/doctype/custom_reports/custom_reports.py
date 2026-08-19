# Copyright (c) 2026, Khaja Kareem Shaik and contributors
# For license information, please see license.txt

import re

import frappe
from frappe.model.document import Document


class CustomReports(Document):
	def validate(self):
		if not self.route_key:
			self.route_key = re.sub(r"[^a-z0-9]+", "-", self.report_name.lower()).strip("-")
		if not self.route_key:
			frappe.throw("Select a valid report.")
