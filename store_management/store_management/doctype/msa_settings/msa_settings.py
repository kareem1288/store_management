import frappe
from frappe import _
from frappe.model.document import Document


class MSASettings(Document):
	def validate(self):
		self.provider = "Ollama"
		self.ollama_url = (self.ollama_url or "http://127.0.0.1:11434").strip().rstrip("/")
		self.local_model = (self.local_model or "").strip()
		if self.enabled and not self.local_model:
			frappe.throw(_("Enter the downloaded Ollama model name."))
