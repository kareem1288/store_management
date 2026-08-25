import frappe
from frappe.handler import upload_file


@frappe.whitelist(allow_guest=True, methods=["POST"])
def upload_private_file():
	"""Run Frappe's standard uploader while enforcing private file storage."""
	frappe.form_dict.is_private = 1
	file_doc = upload_file()

	# The standard handler can inherit visibility from a file selected from the
	# library. Enforce the policy again on the returned File document.
	if getattr(file_doc, "doctype", None) == "File" and not file_doc.is_private:
		file_doc.is_private = 1
		file_doc.save(ignore_permissions=True)

	return file_doc
