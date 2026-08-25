import frappe


def execute():
	"""Move existing uploaded files from public storage into private storage."""
	public_files = frappe.get_all(
		"File",
		filters={"is_folder": 0, "is_private": 0, "file_url": ["like", "/files/%"]},
		pluck="name",
	)
	for file_name in public_files:
		file_doc = frappe.get_doc("File", file_name)
		file_doc.is_private = 1
		file_doc.save(ignore_permissions=True)
