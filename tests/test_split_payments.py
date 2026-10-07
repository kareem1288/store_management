"""Validate split-payment input without requiring a running Frappe site."""
import ast
import json
import math
from pathlib import Path
from types import SimpleNamespace
import unittest


class SplitPaymentValidationTest(unittest.TestCase):
	@classmethod
	def setUpClass(cls):
		source = Path(__file__).resolve().parents[1] / "store_management/api.py"
		function = next(node for node in ast.parse(source.read_text()).body if isinstance(node, ast.FunctionDef) and node.name == "_validate_split_payments")
		def fail(message):
			raise ValueError(message)
		namespace = {"frappe": SimpleNamespace(throw=fail), "_": lambda text: text, "flt": float, "math": math, "json": json}
		exec(compile(ast.Module(body=[function], type_ignores=[]), str(source), "exec"), namespace)
		cls.validate = staticmethod(namespace["_validate_split_payments"])

	def test_exact_total(self):
		parts = [{"method": "Cash", "amount": 100}, {"method": "Card", "amount": 183.50}]
		self.assertEqual(self.validate(json.dumps(parts), 283.50), parts)

	def test_invalid_totals_and_methods(self):
		for parts in [
			[{"method": "Cash", "amount": 10}, {"method": "Card", "amount": 10}],
			[{"method": "Cash", "amount": 100}, {"method": "Cash", "amount": 183.50}],
			[{"method": "UPI", "amount": 100}, {"method": "Card", "amount": 183.50}],
		]:
			with self.subTest(parts=parts), self.assertRaises(ValueError):
				self.validate(parts, 283.50)

	def test_nonfinite_negative_and_zero_amounts(self):
		for amount in [float("nan"), float("inf"), -1, 0, 0.001, "invalid", None]:
			with self.subTest(amount=amount), self.assertRaises(ValueError):
				self.validate([{"method": "Cash", "amount": amount}, {"method": "Card", "amount": 283.50}], 283.50)

	def test_invalid_structure(self):
		for value in [None, {}, [], [1, 2]]:
			with self.subTest(value=value), self.assertRaises(ValueError):
				self.validate(value, 100)


if __name__ == "__main__":
	unittest.main()
