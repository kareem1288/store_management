import frappe


def prevent_desk_routes():
    """Block direct access to /desk and /app routes and redirect users to allowed pages."""
    path = frappe.local.request.path or ""

    if path.startswith("/desk") or path.startswith("/app"):
        if frappe.session.user and frappe.session.user != "Guest":
            redirect_location = "/masters"
        else:
            redirect_location = "/"

        frappe.flags.redirect_location = redirect_location
        raise frappe.Redirect(302)
