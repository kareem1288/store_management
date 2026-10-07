"""Controller for the /store-login index template."""

from importlib import import_module

get_context = import_module(f"{__package__}.page").get_context
no_cache = 1
