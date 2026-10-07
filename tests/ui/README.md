Run the browser checks from the app directory using the Frappe environment Python:

```bash
MY_SALES_TEST_CHROME=/path/to/chrome ../../env/bin/python tests/ui/check_screens.py
```

The harness requires Jinja2 and websockets. It serves local templates with mocked
ERP responses on port 8876 and controls headless Chrome on port 9336. It checks
320px, 390px, 768px, 844px landscape, and 1440px layouts, including product browsing,
cart, Cash/UPI/Card/Split payment panels, receipt success, master editors, reports,
login/signup, and assistant responses. It fails on JavaScript errors, page overflow,
or application panels extending beyond the viewport. Results and screenshots are
written to `/tmp`.

These checks do not contact production, process payments, create real invoices,
or validate Android hardware features or ERP accounting configuration.
