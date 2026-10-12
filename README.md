# My Sales

My Sales is a mobile-friendly retail and billing application for Frappe/ERPNext.
It includes POS billing with barcode scanning, item and customer master management,
company/user/tax setup, and Sales Register reporting.

## Mobile installation

1. Open `https://mysales.frappe.cloud/` in Chrome, Edge, or Safari and sign in.
2. On Android, tap **Install App** in the My Sales header (or use the browser's
   **Add to Home screen** action).
3. On iPhone/iPad, use **Share > Add to Home Screen**.

The installed app opens directly to POS. Store data and transactions always use
the authenticated Frappe site; an offline screen is shown when the server cannot
be reached.

## MSA with Ollama (no API authentication)

MSA uses locally hosted Ollama for general questions and follow-up conversations.
It sends no API key or Authorization header. Store report shortcuts retain ERP
permissions. Gemini and OpenAI integrations are no longer used.

After deployment, run `bench --site <site-name> migrate`. Install and start Ollama
on infrastructure reachable by the Frappe server and download a local model.
As a System Manager, open `/app/msa-settings`, set **Ollama Server URL** (default
`http://127.0.0.1:11434`), enter the exact model name from `ollama list` in
**Downloaded Ollama Model**, and enable **General Answers**.

Localhost refers to the Frappe server, not the user's phone or laptop. For hosted
Frappe, provide a reachable private Ollama server. Model requests include the
conversation and previously displayed store metrics; do not expose an
unauthenticated Ollama service publicly. Local mode has no live web search.
Chat context stays in browser memory and is cleared by **New Chat**.
