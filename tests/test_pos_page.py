"""Regression coverage for ERP field types in the POS bootstrap."""
from datetime import date, datetime, timedelta
from decimal import Decimal
import json
import unittest
from unittest.mock import patch

try:
	import frappe
	from store_management.www.pos.page import get_context
except ModuleNotFoundError:
	frappe = None


@unittest.skipIf(frappe is None, "Requires the Frappe Python environment")
class PosBootstrapSerializationTest(unittest.TestCase):
	def test_recent_invoice_database_types_are_serializable(self):
		payload = {"summary": {"recent_bills": [frappe._dict(
			posting_date=date(2026, 10, 7),
			posting_time=timedelta(hours=12, minutes=30),
			modified=datetime(2026, 10, 7, 12, 30),
			grand_total=Decimal("283.50"),
		)]}}
		context = frappe._dict()
		with patch.object(frappe, "session", frappe._dict(user="cashier@example.com")), patch.object(frappe, "get_installed_apps", return_value=[]), patch("store_management.api.get_pos_bootstrap", return_value=payload):
			get_context(context)
		row = json.loads(context.pos_bootstrap_json)["summary"]["recent_bills"][0]
		self.assertEqual(row["posting_date"], "2026-10-07")
		self.assertEqual(row["posting_time"], "12:30:00")
		self.assertEqual(row["modified"], "2026-10-07 12:30:00")
		self.assertEqual(row["grand_total"], 283.5)


if __name__ == "__main__":
	unittest.main()
