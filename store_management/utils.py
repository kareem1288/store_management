import frappe
from werkzeug.wrappers import Response
from werkzeug.exceptions import HTTPException
from werkzeug.utils import redirect


ANDROID_PACKAGE_ID = "cloud.frappe.m.mysales.twa"
ANDROID_UPLOAD_CERT_SHA256 = "C7:F8:57:4A:B5:27:76:01:32:C2:00:1F:EC:F8:4D:70:FC:E4:81:E0:FF:5B:37:72:5F:AC:FF:E8:E1:6F:DD:F4"


def prevent_desk_routes():
    """Block direct access to /desk and /app routes and redirect users to allowed pages."""
    path = frappe.local.request.path or ""

    # Older PWA caches explicitly requested Standard. Keep every POS invoice
    # print route on the customer-facing thermal receipt during cache rollout.
    if (
        path == "/printview"
        and frappe.form_dict.get("doctype") == "Sales Invoice"
        and frappe.form_dict.get("format") in (None, "", "Standard")
    ):
        frappe.form_dict.format = "My Sales Thermal Receipt"
        frappe.form_dict.no_letterhead = 1

    if path == "/.well-known/assetlinks.json":
        payload = frappe.as_json([
            {
                "relation": ["delegate_permission/common.handle_all_urls"],
                "target": {
                    "namespace": "android_app",
                    "package_name": ANDROID_PACKAGE_ID,
                    "sha256_cert_fingerprints": [ANDROID_UPLOAD_CERT_SHA256],
                },
            }
        ])
        response = Response(payload, content_type="application/json; charset=utf-8")
        response.headers["Cache-Control"] = "public, max-age=3600"
        response.headers["Access-Control-Allow-Origin"] = "*"
        raise HTTPException(response=response)

    if path.startswith("/desk") or path.startswith("/app"):
        if  frappe.session.user == "Guest":
            redirect_location = "/store-login"
        else:
            redirect_location = "/masters"

        # raise HTTPException(response=redirect(redirect_location))
