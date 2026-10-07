"""Controller for the /pos index template."""

from store_management.www.pos.page import get_context

# Frappe reads module properties before rendering the template.
no_cache = 1
