# My Sales — Store Management

My Sales is a retail billing application built on **Frappe and ERPNext**. It provides a desktop web interface, a responsive mobile interface, an installable Progressive Web App (PWA), and an Android Trusted Web Activity wrapper. Billing, customers, inventory records, and reports use the connected ERPNext site.

- **Repository:** [kareem1288/store_management](https://github.com/kareem1288/store_management)
- **Application name:** `store_management`
- **Publisher:** Khaja Kareem Shaik
- **Application URL configured for Android:** [mysales.m.frappe.cloud/pos](https://mysales.m.frappe.cloud/pos)

The repository contains the application source and Android project. A working installation requires a configured Frappe/ERPNext site; it is not a standalone Python or static web application.

## Contents

- [Features](#features)
- [Screens and routes](#screens-and-routes)
- [Requirements](#requirements)
- [Installation](#installation)
- [Initial configuration](#initial-configuration)
- [Billing and payments](#billing-and-payments)
- [Reports](#reports)
- [Signup, login, and trials](#signup-login-and-trials)
- [MSA with Ollama](#msa-with-ollama)
- [Install the web or mobile app](#install-the-web-or-mobile-app)
- [Android application](#android-application)
- [Updating an installation](#updating-an-installation)
- [Development and testing](#development-and-testing)
- [Project structure](#project-structure)
- [Troubleshooting](#troubleshooting)
- [License](#license)

## Features

### Dashboard

The dashboard shows sales, bills, items sold, customer counts, sales by store, top products, recent sales, target indicators, and order status. The mobile dashboard includes the complete set of cards and summaries in a scrolling layout.

The main date filters default to the **first and last dates of the current month**. Users can select another range and filter by store. **Weekly Summary** independently uses the current Monday–Sunday calendar week; **Monthly Summary** independently uses the complete current calendar month. These two summaries retain their own dates when the main date range changes, while respecting the store selection. Their daily charts include dates with no sales.

### Retail POS and receipts

- Browse products by category, search by item name or code, and look up barcodes.
- Scan barcodes through the device camera when the browser and device support it.
- Add products to a cart, change quantities, clear the cart, and apply a percentage discount.
- Enter optional customer details or use the default walk-in customer.
- Hold one cart on the current device session and resume it later.
- Record Cash, UPI, Card, or Cash + Card split payments.
- Create and submit ERPNext Sales Invoices and Payment Entries.
- View generated bills, print/save them through the browser, and share bill links.
- Queue PDF receipt attachments using the **My Sales Thermal Receipt** print format.

### Masters, reports, and assistant

Manage Items, Item Groups, Customers, Customer Groups, Item Tax Templates, Companies, and Users. The item list includes code, name, group, UOM, selling price, status, search, and group/status filters.

Reports include sales, item-wise sales, customer ledger, receivables, and accounting reports. **MSA — My Sales Assistant** provides store-report shortcuts and general conversational answers through a locally hosted Ollama model, without AI API keys.

## Screens and routes

| Route | Purpose |
| --- | --- |
| `/store-login` | Password login, optional OTP verification, and mobile welcome screen |
| `/login` | Routes to the My Sales login page |
| `/store-login/forgot-password` | Password reset |
| `/store-signup` | Account and business registration |
| `/pos` | Dashboard |
| `/pos#billing-panel` | Product browsing and new sale |
| `/pos#cart` | Cart; a separate screen on mobile |
| `/masters` | Master navigation on mobile and master records on desktop |
| `/masters?doctype=Item` | Item management; other supported masters use the same parameter |
| `/reports` | Report navigation on mobile and default report on desktop |
| `/reports?type=sales` | Sales Register |
| `/assistant` | MSA chat |
| `/more` | Mobile account, store management, expenses, settings, MSA, and logout |
| `/offline` | Offline fallback page |
| `/app/msa-settings` | Administrator configuration for the local assistant |

POS, masters, reports, MSA, and More use authenticated sessions. Administration settings require appropriate Frappe roles. Bill links remain subject to invoice access permissions.

## Requirements

| Component | Requirement |
| --- | --- |
| Python | **3.14 or newer**, as declared in `pyproject.toml` |
| Frappe | **Version 16**; declared range `>=16.0.0-dev,<17.0.0` |
| ERPNext | Required Bench app; this project uses ERPNext doctypes and reports |
| Bench services | Database, Redis, web process, background workers, and scheduler configured for the site |
| Browser | JavaScript enabled; HTTPS for production installation and camera features |
| PDF rendering | Native Pango/font dependencies required by WeasyPrint |
| General MSA answers | Reachable Ollama server with a downloaded local model |
| Android builds | Java/Android build toolchain and the project’s Gradle wrapper; Bubblewrap for TWA resource generation |

All external Python packages used by the app and its browser test harness are listed in **[requirements.txt](requirements.txt)**:

| Package | Use |
| --- | --- |
| `segno` | QR code generation |
| `requests` | Ollama, UPI gateway, and Brevo HTTP requests |
| `Werkzeug` | Web responses and redirects |
| `weasyprint` | Invoice PDF generation |
| `Jinja2` | Local browser-test template rendering |
| `websockets` | Browser-test communication with Chrome |

Frappe and ERPNext are installed and managed through Bench, rather than through this requirements file. Ollama and Chrome/Chromium are separate programs; they are not Python packages. Runtime dependencies are also declared in `pyproject.toml` for Bench installation.

## Installation

Start with a working Frappe 16 Bench and an ERPNext site. Replace `your-site.example` below with the actual site name. Run these commands from the **Bench directory**:

```bash
bench get-app https://github.com/kareem1288/store_management.git
./env/bin/python -m pip install -r apps/store_management/requirements.txt
bench --site your-site.example install-app store_management
bench --site your-site.example migrate
bench build --app store_management
bench --site your-site.example clear-cache
```

Restart the web and worker processes using the deployment’s process manager after installing or updating Python code. For a development Bench, start the services with `bench start`.

Migration installs/updates the app’s doctypes, Company application-language field, available default report definitions, OTP role configuration, UPI payment mode, and **My Sales Thermal Receipt** print format. It also makes that format the default for Sales Invoices. The file-privacy patch converts eligible previously uploaded public files to private files.

## Initial configuration

1. Configure an ERPNext Company with its chart of accounts, currency, warehouses, and accounting defaults.
2. Set the user’s default Company. POS falls back to the global default Company and then an available Company when a user default is absent.
3. Create sales Items with groups, UOMs, selling rates, and optional images/barcodes. Configure stock and tax records through ERPNext as required.
4. Create a Customer or allow the application’s walk-in customer setup to use valid customer-group and territory records.
5. Configure payment accounts and Modes of Payment for the payment methods being used.
6. Give users the required ERPNext roles and Company permissions. MSA’s store queries use permission-filtered records; some provisioning and master-management paths use elevated writes and should be reviewed against your access requirements.
7. Ensure background workers and the site scheduler are running.

**Application language** is configured through the Company’s `custom_application_language` field. Company-linked users are synchronized to that language, and the custom interface uses Frappe translations where available.

Optional administrator settings include:

| Doctype | Purpose |
| --- | --- |
| **MSA Settings** | Enable general answers, set Ollama URL, and select the downloaded model |
| **UPI Configuration** | Choose Testing/Live mode and configure a merchant/gateway |
| **Brevo OTP Settings** | Configure mobile OTP delivery |
| **Custom Reports** | Configure visible reports, route keys, order, and accent colours |
| **Sign Up Details** | Registration, provisioned user/company, and trial dates/status |

## Billing and payments

A successful checkout creates a submitted Sales Invoice and one or more submitted Payment Entries. PDF attachment generation runs on the `short` queue after the transaction commits.

| Payment method | Application behaviour |
| --- | --- |
| Cash | Requires cash received to cover the cart total; displays change |
| UPI | Generates a test QR or requests a payment URI from the configured live gateway |
| Card | Collects card-entry details for checkout validation and records a Card Payment Entry |
| Split | Requires positive Cash and Card amounts adding up to the invoice total; creates separate payment entries |

**Card checkout records a payment; it does not implement a card-acquiring processor.** Card details are not included in the invoice API request. Confirm external payment receipt before recording the transaction.

UPI **Testing** mode generates a non-payment QR and does not request the original amount. **Live** mode requires a merchant UPI ID, HTTPS gateway URL, API key, and API secret in **UPI Configuration**. The gateway request sends the amount, currency, reference, and redirect URL; its response must include `payment_uri`, `upi_uri`, or `payment_url`. It can also return a transaction ID and QR code. The current flow creates a payment request and records checkout confirmation; it does not implement a gateway settlement webhook.

A held cart is stored in browser `sessionStorage`, keyed by user. It is not a server-side draft invoice, does not synchronize across devices, and may disappear when the browser session ends. The **Open Bills** link shows receivables reports, rather than the locally held cart.

Receipts use the app’s branded screen layout and an **80 mm thermal print layout**. Sharing a bill link does not make a private invoice public; the recipient needs access. Browser print supports saving a PDF where the browser provides that option.

## Reports

| Report | Route parameter |
| --- | --- |
| Sales Register | `sales` |
| Item-wise Sales Register | `items` |
| Customer Ledger Summary | `customers` |
| Accounts Receivable | `open-bills` |
| Profit and Loss Statement | `profit-and-loss` |
| General Ledger | `general-ledger` |
| Trial Balance | `trial-balance` |

Report filters come from ERPNext report definitions. The interface provides result summaries, charts, tabular results, and CSV export. Mobile Sales Register and receivables results have compact record cards. **Custom Reports** can add/configure additional ERPNext reports; default reports are seeded only when the corresponding ERPNext Report exists.

If the optional **Insights** app is installed and the expected workbooks/dashboards exist, My Sales exposes the available Insights dashboard links. Insights is not a required dependency.

## Signup, login, and trials

Signup collects account, business, address, language, currency, tax, and optional logo information. It provisions an ERPNext Company and System User, assigns available sales/stock/accounts roles, creates a default Company permission, and starts a **20-day trial**.

Users can sign in with a password or request OTP verification after their credentials are validated. Email OTP requires a configured outgoing **Email Account**. Mobile OTP requires enabled **Brevo OTP Settings**, a server-side Brevo API key, and a suitable SMS sender. OTPs expire after five minutes and have an incorrect-attempt limit.

The daily scheduler expires eligible trials, disables the linked user, and updates the registration status. Session creation also checks trial expiry. Expired-trial messaging uses the contact configured in `store_management/trial.py`; operators should review that value for their deployment.

The no-API-key MSA configuration does not remove credentials required by optional external SMS or live UPI services.

## MSA with Ollama

MSA answers general questions and follow-up questions through **locally hosted Ollama**. It sends **no AI API key or Authorization header**. Gemini and OpenAI are not used by the current assistant implementation.

To enable it:

1. Install and start Ollama on infrastructure reachable by the Frappe server.
2. Download a local model suitable for the server’s available memory and compute.
3. Run `ollama list` to obtain the exact downloaded model name.
4. Run the site migration after deploying the app.
5. As a System Manager, open `/app/msa-settings`.
6. Set **Ollama Server URL**, enter **Downloaded Ollama Model**, and enable **General Answers**.

The default URL is `http://127.0.0.1:11434`. **Localhost means the Frappe server**, not the customer’s phone or laptop. A hosted Frappe site needs a model server reachable from that hosting environment. Keep an unauthenticated Ollama service on a private network. Cloud-model names ending in `-cloud` are rejected by MSA.

General requests use Ollama’s `/api/chat` endpoint. Conversation text and previously displayed store metrics may be included for follow-up questions. History is kept in browser memory and cleared with **New Chat**. General prompts are limited to 4,000 characters, and conversation history is bounded.

The fixed store shortcuts retrieve today’s sales, this week’s sales, top-selling items, low-stock items, and cash collected today using ERP permissions. They continue to work without Ollama. General answers require a running model server and **do not have live web search**. The assistant cannot infer undisclosed live ERP figures or execute arbitrary business actions.

## Install the web or mobile app

1. Open your My Sales site over HTTPS and sign in.
2. In a mobile browser, use the **Install app?** dialog with My Sales branding, Cancel, and Install. Desktop browsers retain the **Install App** button.
3. When available, accept the browser’s native installation prompt.
4. If the prompt is unavailable, follow the displayed browser-menu instructions. On iPhone/iPad, use **Share → Add to Home Screen** when supported.

### Mobile installation dialog

In the mobile browser interface, the header install button is replaced by an automatically offered **Install app?** dialog. It shows the My Sales icon, application name, current site hostname, **Cancel**, **Install**, and a close control.

- **Install** opens the browser's native prompt when the browser has supplied one. Otherwise, it opens instructions for the browser menu or Add to Home Screen.
- **Cancel**, the close control, or dismissing the dialog suppresses the offer for **seven days** on that browser. Completing the dialog's Install action also closes this offer.
- The offer does not appear in standalone mode or while another application dialog is open.
- A previously recorded installation suppresses automatic offers unless the browser signals that installation is available again. This browser-local record is not a complete inventory of apps installed on the phone.
- Desktop browsers continue to show the **Install App** button.

The application dialog is styled by My Sales; the final native installation prompt and installation permission are controlled by the browser.

The installed PWA starts at `/pos?source=pwa`. The install button is hidden in standalone mode or after an installation event. Native installation availability depends on the browser and whether the application is already installed.

The service worker maintains versioned app-shell assets and an offline fallback. **Offline billing is not supported:** ERP data, login, invoices, reports, and assistant requests require their servers. There is no offline transaction queue or automatic offline-to-online invoice synchronization.

### Updating an installed PWA

The web manifest uses relative URLs and preserves the application ID `/pos`. Existing PWA installations receive the site's updated web screens and versioned app-shell assets under the same identity. Users should reopen or reload the installed app after a deployment; a separate installation is normally unnecessary.

Changing site files does not forcibly reinstall, duplicate, or overwrite an operating-system application. Keep the manifest identity stable and update cached asset versions and the service-worker cache version when changing shared UI assets.

## Android application

The [android/](android/) project wraps the same hosted web application as a **Trusted Web Activity**. It shares the responsive web screens rather than maintaining a separate native billing implementation.

Current configuration (Android version code/name **3**):

- Package ID: `cloud.frappe.m.mysales.twa`
- Host: `mysales.m.frappe.cloud`
- Start URL: `/pos?source=pwa`

From the `android` directory, build a debug APK with:

```bash
./gradlew assembleDebug
```

The output is `app/build/outputs/apk/debug/app-debug.apk`.

After changing TWA configuration, regenerate resources with Bubblewrap:

```bash
npx --yes @bubblewrap/cli update
npx --yes @bubblewrap/cli build --skipSigning
```

Production signing requires your own securely configured upload key. Configure `android/twa-manifest.json` for your deployment rather than relying on its existing host or local signing-key path. Fullscreen TWA verification requires matching package/certificate information in `/.well-known/assetlinks.json`; the app serves this through `store_management/utils.py`. Review those values when changing the host or signing certificate.

### Replacing an existing Android installation

The source project now declares **version code 3** and **version name 3** in both `android/app/build.gradle` and `android/twa-manifest.json`. These values prepare an update; editing them does not build, sign, distribute, or install an APK.

To update an existing Android installation, build and sign a release using the **same package ID and signing certificate** as the installed app, with a **higher version code** than that installed version. Distribute it through the deployment's normal Android update channel and complete the platform's installation confirmation when required.

The website cannot silently overwrite an installed Android app. A debug APK or an APK signed with a different certificate is not a replacement for an existing release-signed installation. The TWA's hosted web screens receive site updates independently of a new Android package.

See [android/README.md](android/README.md) for build details. Do not commit signing keys or passwords.

## Updating an installation

Deploy the reviewed source changes through your normal hosting or Git workflow. Then, from the Bench directory:

```bash
./env/bin/python -m pip install -r apps/store_management/requirements.txt
bench --site your-site.example migrate
bench build --app store_management
bench --site your-site.example clear-cache
```

Restart web and worker processes through the deployment’s process manager. Migration is particularly important after changing doctypes, administrator settings, receipt templates, or report defaults.

For a hosted service, use its deployment controls to execute the equivalent steps. Updating repository files alone does not deploy them to the hosted site or rebuild/sign an Android package.

## Development and testing

Run the Python regression tests from the app directory using the Bench environment:

```bash
../../env/bin/python -m unittest discover -s tests -p 'test_*.py'
```

The tests cover POS serialization of ERP date/time/decimal values, split-payment validation, and Ollama routing, history, configuration, and connection errors. Provider tests use mocks and do not require an API key or running model server.

For responsive browser checks, install Chrome/Chromium and set its executable path:

```bash
MY_SALES_TEST_CHROME=/path/to/chrome ../../env/bin/python tests/ui/check_screens.py
```

The harness serves mocked local templates on port **8876** and controls Chrome on port **9336**. It checks phone, tablet, landscape, and desktop widths, including dashboard visibility, install-button behaviour, carts, payment panels, invoice previews, master editors, reports, MSA, More, and resizing. Results and screenshots are written to `/tmp`.

These checks do not validate production login, real payment settlement, live Ollama responses, Android camera hardware, or an installation on a physical device. See [tests/ui/README.md](tests/ui/README.md) for the browser harness details.

## Project structure

```text
store_management/
├── api.py                      # Dashboard, POS, QR/payment, report and master endpoints
├── assistant.py                # Local Ollama chat and store-report shortcuts
├── otp_auth.py                 # Password and OTP login
├── signup.py                   # Company/user provisioning and signup
├── trial.py                    # Trial expiry and session checks
├── setup.py                    # Migration setup, default reports and receipt format
├── uploads.py                  # Private upload handling
├── language.py                 # Company/user language synchronization
├── public/
│   ├── css/                    # Shared, desktop, mobile and authentication styles
│   ├── js/                     # Shared UI, phone UI, reporting and signup logic
│   └── my-sales.webmanifest    # PWA configuration
├── www/                        # Login, signup, POS, masters, reports, MSA and More pages
├── print_formats/              # Branded thermal receipt template
├── patches/                    # Data migration patches
└── store_management/doctype/   # Application settings and custom doctypes
android/                        # Android Trusted Web Activity project
tests/                          # Python regression and browser checks
requirements.txt                # Single external Python requirements file
pyproject.toml                  # Python package and Bench dependency metadata
```

## Troubleshooting

| Symptom | Checks |
| --- | --- |
| Login returns to the login page | Confirm the account is enabled, the trial is active, session cookies are allowed, and the deployed `index.py` controllers exist; inspect server authentication logs |
| POS returns a date-serialization error | Deploy the current POS controller, which uses `frappe.as_json`, and restart the web process |
| Missing or outdated mobile dashboard panels | Confirm the latest phone CSS/JS were built and deployed; refresh the browser or installed app so the versioned shell updates |
| Mobile install dialog is not appearing | Check standalone mode, the seven-day dismissal record, a previously recorded installation, and other open dialogs; the mobile header button is intentionally hidden |
| Native install prompt is unavailable | Use HTTPS, check the manifest/icon/service-worker requests, and follow the install help; an already installed or unsupported browser may not offer a native prompt |
| Android update will not replace the installed app | Check matching package ID and signing certificate, a higher version code, and that a signed release was actually built and distributed |
| No products or company available | Check sales-item flags, rates, company defaults, customer setup, and ERP permissions |
| A report is missing | Check that the ERPNext Report exists and its Custom Reports entry is visible; run migration to seed available defaults |
| Receipt PDF attachment is missing | Check the `short` queue worker, job logs, WeasyPrint/Pango dependencies, and the installed receipt print format |
| UPI QR does not charge money | Check whether UPI Configuration is in Testing mode; only a configured Live gateway creates a chargeable request |
| OTP delivery fails | Check outgoing Email Account settings or enabled Brevo credentials/sender and delivery service availability |
| MSA cannot reach Ollama | Check the server URL from the Frappe host, model-server status, network access, and exact downloaded model name |
| General MSA answers are unavailable | Enable MSA Settings and configure a downloaded local model; store-report shortcuts do not require the model server |

## License

See [LICENSE](LICENSE) for the repository’s license text.
