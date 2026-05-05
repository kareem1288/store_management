import frappe
from werkzeug.exceptions import HTTPException
from werkzeug.utils import redirect


def prevent_desk_routes():
    """Block direct access to /desk and /app routes and redirect users to allowed pages."""
    path = frappe.local.request.path or ""

    if path.startswith("/desk") or path.startswith("/app"):
        if  frappe.session.user == "Guest":
            redirect_location = "/store-login"
        else:
            redirect_location = "/masters"

        # raise HTTPException(response=redirect(redirect_location))
