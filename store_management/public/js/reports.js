let CONFIGURED_REPORTS = [];
try {
	CONFIGURED_REPORTS = JSON.parse(document.getElementById("my-sales-report-config")?.textContent || "[]");
} catch (error) {
	console.error("Unable to parse My Sales report configuration", error);
}
const DEFAULT_REPORT_TYPES = {
	sales: {
		title: "Sales Report", reportName: "Sales Register",
		subtitle: "Review invoices, taxable sales and collected revenue.", accent: "#168650"
	},
	items: {
		title: "Item Wise Sales", reportName: "Item-wise Sales Register",
		subtitle: "See item quantities, rates and sales performance.", accent: "#2878c8"
	},
	customers: {
		title: "Customer Report", reportName: "Customer Ledger Summary",
		subtitle: "Track customer billing, payments and outstanding balances.", accent: "#7b5cc7"
	},
	"open-bills": {
		title: "Open Bills", reportName: "Accounts Receivable",
		subtitle: "Monitor unpaid invoices, due dates and outstanding amounts.", accent: "#d27a2d"
	},
	"profit-and-loss": {
		title: "Profit and Loss Statement", reportName: "Profit and Loss Statement",
		subtitle: "Compare income, expenses and net profit across the selected period.", accent: "#e45756"
	},
	"general-ledger": {
		title: "General Ledger", reportName: "General Ledger",
		subtitle: "Review account-wise debits, credits, vouchers and running balances.", accent: "#0f9d91"
	},
	"trial-balance": {
		title: "Trial Balance", reportName: "Trial Balance",
		subtitle: "Compare opening, debit, credit and closing balances for every account.", accent: "#7c5ce5"
	}
};
const REPORT_TYPES = { ...DEFAULT_REPORT_TYPES, ...Object.fromEntries(CONFIGURED_REPORTS.map(report => [report.route_key, {
	title: report.report_name,
	reportName: report.report_name,
	subtitle: "Interactive ERPNext report with graphical analysis.",
	accent: report.accent_color || "#168650"
}])) };
Object.entries(DEFAULT_REPORT_TYPES).forEach(([key, value]) => {
	if (REPORT_TYPES[key]) REPORT_TYPES[key] = { ...value, ...REPORT_TYPES[key], title: value.title };
});
const requestedReportType = new URLSearchParams(window.location.search).get("type") || "sales";
const activeReport = REPORT_TYPES[requestedReportType] || REPORT_TYPES.sales || DEFAULT_REPORT_TYPES.sales;
const VISIBLE_REPORT_FILTERS = {
	sales: ["from_date", "to_date", "customer", "company", "mode_of_payment"],
	items: ["from_date", "to_date", "item_code", "item_group", "company"],
	"open-bills": ["company", "report_date", "party", "ageing_based_on"],
	"profit-and-loss": ["company", "filter_based_on", "period_start_date", "period_end_date", "from_fiscal_year", "to_fiscal_year", "periodicity", "accumulated_values"],
	"general-ledger": ["company", "from_date", "to_date", "account", "party_type", "party", "voucher_no", "cost_center"],
	"trial-balance": ["company", "fiscal_year", "from_date", "to_date", "cost_center", "project", "include_default_book_entries", "show_net_values"]
};
let defaultReportCompany = document.getElementById("sm-reports-app")?.dataset.defaultCompany || "";

function clearStaleReportOverlay() {
	document.getElementById("freeze")?.remove();
	if (window.frappe?.dom) window.frappe.dom.freeze_count = 0;
}

function installReportOverlayGuard() {
	const body = document.getElementById("body") || document.body;
	if (!body || body.dataset.reportOverlayGuard === "1") return;
	body.dataset.reportOverlayGuard = "1";
	new MutationObserver(() => {
		const freeze = document.getElementById("freeze");
		if (freeze) clearStaleReportOverlay();
	}).observe(body, { childList: true, subtree: true });
}

clearStaleReportOverlay();
installReportOverlayGuard();

function resolveDefaultReportCompany() {
	if (defaultReportCompany) return Promise.resolve(defaultReportCompany);
	return new Promise(resolve => {
		frappe.call({
			method: "store_management.api.get_pos_bootstrap",
			silent: true,
			callback(response) {
				defaultReportCompany = response.message?.company || "";
				resolve(defaultReportCompany);
			},
			error() { resolve(""); }
		});
	});
}

// State management
const smReportsState = {
	report: {
		loaded: false,
		loading: false,
		filters: [],
		data: null
	}
};

// Utility functions
function escapeHtml(text) {
	const div = document.createElement('div');
	div.textContent = text;
	return div.innerHTML;
}

function escapeSelectorValue(value) {
	return value.replace(/"/g, '\\"');
}

function getToday() {
	return new Date().toISOString().slice(0, 10);
}

function addMonths(dateStr, months) {
	const date = new Date(dateStr);
	date.setMonth(date.getMonth() + months);
	return date.toISOString().slice(0, 10);
}

function setReportStatus(message) {
	const statusEl = document.getElementById("sales-register-status");
	if (statusEl) statusEl.textContent = message;
}

function exportCurrentReport() {
	const data = smReportsState.report.data;
	if (!data?.columns?.length) return setReportStatus("Run the report before exporting.");
	const columns = data.columns;
	const rows = normalizeResultRows(data);
	const quote = value => `"${String(value ?? "").replace(/"/g, '""')}"`;
	const csv = [columns.map(col => quote(col.label || col.fieldname)).join(",")]
		.concat(rows.map(row => columns.map(col => quote(row[col.fieldname])).join(","))).join("\n");
	const link = document.createElement("a");
	link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
	link.download = `${requestedReportType}-report.csv`;
	link.click();
	URL.revokeObjectURL(link.href);
}

// Report functions
function loadSalesRegisterReport() {
	if (smReportsState.report.loaded || smReportsState.report.loading) return;

	smReportsState.report.loading = true;
	setReportStatus(`Loading ${activeReport.title.toLowerCase()} filters...`);
	installReportScriptSupport();

	frappe.call({
		method: "frappe.desk.query_report.get_script",
		silent: true,
		freeze: false,
		args: { report_name: activeReport.reportName },
		callback: function(response) {
			const settings = response.message || {};
			try {
				if (settings.script) {
					frappe.dom?.eval ? frappe.dom.eval(settings.script) : eval(settings.script);
				}

				const reportSettings = frappe.query_reports?.[activeReport.reportName] || {};
				smReportsState.report.filters = normalizeReportFilters(reportSettings.filters || settings.filters || []);
				smReportsState.report.loaded = true;
				renderSalesRegisterFilters();
				runSalesRegisterReport();
			} catch (error) {
				console.error(`Unable to load ${activeReport.reportName} script`, error);
				useFallbackSalesRegisterFilters();
			} finally {
				smReportsState.report.loading = false;
			}
		},
		error: function(error) {
			console.error(`Unable to fetch ${activeReport.reportName} script`, error);
			smReportsState.report.loading = false;
			useFallbackSalesRegisterFilters();
		}
	});
}

function installReportScriptSupport() {
	window.__ = window.__ || (value => value);
	window.frappe = window.frappe || {};
	frappe.query_reports = frappe.query_reports || {};
	frappe.datetime = frappe.datetime || {
		get_today: () => new Date().toISOString().slice(0, 10),
		add_months: (dateValue, months) => {
			const date = new Date(dateValue);
			date.setMonth(date.getMonth() + Number(months || 0));
			return date.toISOString().slice(0, 10);
		}
	};
	frappe.defaults = frappe.defaults || {
		get_user_default: () => ""
	};

	window.erpnext = window.erpnext || {};
	erpnext.utils = erpnext.utils || {};
	if (!erpnext.utils.get_fiscal_year) {
		erpnext.utils.get_fiscal_year = function(dateValue, asArray) {
			const date = new Date(dateValue || getToday());
			const startYear = date.getMonth() < 3 ? date.getFullYear() - 1 : date.getFullYear();
			const values = [`${startYear}-${startYear + 1}`, `${startYear}-04-01`, `${startYear + 1}-03-31`];
			return asArray ? values : values[0];
		};
	}
	if (!erpnext.utils.add_dimensions) {
		erpnext.utils.add_dimensions = function(reportName, index) {
			frappe.call({
				method: "erpnext.accounts.doctype.accounting_dimension.accounting_dimension.get_dimensions",
				callback: function(response) {
					const filters = frappe.query_reports?.[reportName]?.filters || [];
					const dimensions = response.message?.[0] || [];
					dimensions.forEach(dimension => {
						if (filters.some(row => row.fieldname === dimension.fieldname)) return;

						filters.splice(index, 0, {
							fieldname: dimension.fieldname,
							label: __(dimension.label),
							fieldtype: "MultiSelectList",
							options: dimension.document_type
						});
					});

					if (reportName === activeReport.reportName) {
						smReportsState.report.filters = normalizeReportFilters(filters);
						renderSalesRegisterFilters();
					}
				}
			});
		};
	}
}

function useFallbackSalesRegisterFilters() {
	const today = getToday();
	const fiscalStartYear = new Date(today).getMonth() < 3 ? new Date(today).getFullYear() - 1 : new Date(today).getFullYear();
	if (requestedReportType === "profit-and-loss") {
		smReportsState.report.filters = normalizeReportFilters([
			{ fieldname: "company", label: "Company", fieldtype: "Link", options: "Company", default: defaultReportCompany },
			{ fieldname: "filter_based_on", label: "Filter Based On", fieldtype: "Select", options: "Fiscal Year\nDate Range", default: "Date Range" },
			{ fieldname: "period_start_date", label: "From Date", fieldtype: "Date", default: `${fiscalStartYear}-04-01` },
			{ fieldname: "period_end_date", label: "To Date", fieldtype: "Date", default: today },
			{ fieldname: "periodicity", label: "Periodicity", fieldtype: "Select", options: "Monthly\nQuarterly\nHalf-Yearly\nYearly", default: "Monthly" },
			{ fieldname: "accumulated_values", label: "Accumulated Values", fieldtype: "Check", default: 0 }
		]);
		smReportsState.report.loaded = true;
		renderSalesRegisterFilters();
		runSalesRegisterReport();
		return;
	}
	if (requestedReportType === "trial-balance") {
		smReportsState.report.filters = normalizeReportFilters([
			{ fieldname: "company", label: "Company", fieldtype: "Link", options: "Company", default: defaultReportCompany },
			{ fieldname: "fiscal_year", label: "Fiscal Year", fieldtype: "Link", options: "Fiscal Year", default: `${fiscalStartYear}-${fiscalStartYear + 1}` },
			{ fieldname: "from_date", label: "From Date", fieldtype: "Date", default: `${fiscalStartYear}-04-01` },
			{ fieldname: "to_date", label: "To Date", fieldtype: "Date", default: today },
			{ fieldname: "show_net_values", label: "Show Net Values", fieldtype: "Check", default: 0 }
		]);
		smReportsState.report.loaded = true;
		renderSalesRegisterFilters();
		runSalesRegisterReport();
		return;
	}
	const commonFilters = [
		{ fieldname: "from_date", label: "From Date", fieldtype: "Date", default: addMonths(getToday(), -1) },
		{ fieldname: "to_date", label: "To Date", fieldtype: "Date", default: getToday() },
		{ fieldname: "company", label: "Company", fieldtype: "Link", options: "Company", default: frappe.defaults?.get_user_default?.("Company") || "" }
	];
	const specificFilters = requestedReportType === "items"
		? [{ fieldname: "item_group", label: "Item Group", fieldtype: "Link", options: "Item Group" }, { fieldname: "item_code", label: "Item", fieldtype: "Link", options: "Item" }]
		: [{ fieldname: "customer", label: "Customer", fieldtype: "Link", options: "Customer" }, { fieldname: "customer_group", label: "Customer Group", fieldtype: "Link", options: "Customer Group" }];
	smReportsState.report.filters = normalizeReportFilters([...commonFilters, ...specificFilters]);
	smReportsState.report.loaded = true;
	renderSalesRegisterFilters();
	runSalesRegisterReport();
}

function normalizeReportFilters(filters) {
	return (filters || [])
		.filter(filter => filter && filter.fieldname && !["Section Break", "Column Break"].includes(filter.fieldtype))
		.map(filter => {
			const resolvedDefault = resolveReportDefault(filter.default);
			return {
				...filter,
				label: filter.label || filter.fieldname,
				default: filter.fieldname === "company" && !resolvedDefault ? defaultReportCompany : resolvedDefault
			};
		});
}

function resolveReportDefault(defaultValue) {
	if (typeof defaultValue === "function") {
		try {
			return defaultValue();
		} catch (error) {
			return "";
		}
	}
	return defaultValue ?? "";
}

function renderSalesRegisterFilters() {
	const filtersWrap = document.getElementById("sales-register-filters");
	if (!filtersWrap) return;
	const visibleFields = VISIBLE_REPORT_FILTERS[requestedReportType];
	const visibleFilters = (visibleFields
		? smReportsState.report.filters.filter(filter => visibleFields.includes(filter.fieldname))
		: smReportsState.report.filters.filter(filter => !filter.hidden).slice(0, 10));

	filtersWrap.innerHTML = visibleFilters.map(filter => {
		const value = filter.default ?? "";
		const label = escapeHtml(filter.label);
		const fieldname = escapeHtml(filter.fieldname);

		if (filter.fieldtype === "Check") {
			const isLedger = fieldname === "include_payments";
			return `
				<label class="sm-report-field sm-report-field-check ${isLedger ? 'sm-ledger-toggle' : ''}">
					<span>${label}</span>
					<div class="sm-report-check ${isLedger ? 'sm-toggle-switch' : ''}">
						<input data-report-filter="${fieldname}" type="checkbox" ${Number(value) ? "checked" : ""}>
						<span class="sm-toggle-slider"></span>
					</div>
				</label>
			`;
		}

		if (filter.fieldtype === "Select") {
			const options = String(filter.options || "").split("\n").filter(Boolean);
			return `
				<label class="sm-report-field">
					<span>${label}</span>
					<select data-report-filter="${fieldname}">
						<option value=""></option>
						${options.map(option => `<option value="${escapeHtml(option)}" ${option === value ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}
					</select>
				</label>
			`;
		}

		const inputType = filter.fieldtype === "Date" ? "date" : filter.fieldtype === "Int" || filter.fieldtype === "Float" || filter.fieldtype === "Currency" ? "number" : "text";
		const placeholder = filter.fieldtype === "MultiSelectList"
			? `Select ${filter.options || filter.label} values separated by comma`
			: filter.options || filter.label || "";

		return `
			<label class="sm-report-field">
				<span>${label}</span>
				<input data-report-filter="${fieldname}" type="${inputType}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}">
			</label>
		`;
	}).join("");

	// Add auto-refresh on filter change
	document.querySelectorAll('[data-report-filter]').forEach(input => {
		input.addEventListener('change', () => runSalesRegisterReport());
	});
}

function collectSalesRegisterFilters() {
	const filters = {};
	smReportsState.report.filters.forEach(filter => {
		const element = document.querySelector(`[data-report-filter="${escapeSelectorValue(filter.fieldname)}"]`);
		if (!element) return;

		if (filter.fieldtype === "Check") {
			filters[filter.fieldname] = element.checked ? 1 : 0;
			return;
		}

		if (filter.fieldtype === "MultiSelectList") {
			filters[filter.fieldname] = element.value.split(",").map(v => v.trim()).filter(Boolean);
			return;
		}

		filters[filter.fieldname] = element.value;
	});
	if (!filters.company && defaultReportCompany) filters.company = defaultReportCompany;
	return filters;
}

function runSalesRegisterReport() {
	if (!defaultReportCompany) {
		setReportStatus("Finding your default company...");
		resolveDefaultReportCompany().then(company => {
			if (company) runSalesRegisterReport();
			else setReportStatus("No company is configured. Set a default Company before running reports.");
		});
		return;
	}
	setReportStatus(`Running ${activeReport.title.toLowerCase()}...`);
	const filters = collectSalesRegisterFilters();

	frappe.call({
		method: "store_management.api.run_my_sales_report",
		silent: true,
		freeze: false,
		args: {
			report_type: requestedReportType,
			filters: filters
		},
		callback: function(response) {
			try {
				const data = response.message || {};
				smReportsState.report.data = data;
				renderSalesRegisterTable(data);
				renderReportSummary(data);
				renderReportVisuals(data);
				setReportStatus(`Report loaded with ${data.result?.length || 0} rows.`);
			} catch (error) {
				console.error(`Unable to render ${activeReport.title}`, error);
				setReportStatus("The report data loaded, but a visual could not be rendered. Refresh to try again.");
			} finally {
				window.setTimeout(clearStaleReportOverlay, 0);
			}
		},
		error: function(error) {
			console.error("Unable to run Sales Register report", error);
			setReportStatus("Error loading report. Please try again.");
			window.setTimeout(clearStaleReportOverlay, 0);
		}
	});
}

function openReportManager() {
	frappe.call({ method: "store_management.api.get_report_sidebar", args: { include_catalog: 1 }, callback(response) {
		renderReportManager(response.message || { reports: [], catalog: [] });
		document.getElementById("report-manager").showModal();
	}});
}

function closeReportManager() { document.getElementById("report-manager").close(); }

function renderReportManager(data) {
	document.getElementById("configured-report-list").innerHTML = (data.reports || []).map(report => `
		<label><span><strong>${escapeHtml(report.report_name)}</strong>${report.is_default ? "<small>Default report</small>" : "<small>Added report</small>"}</span>
		<input type="checkbox" data-report-visibility="${encodeURIComponent(report.report_name)}" ${Number(report.is_visible) ? "checked" : ""}></label>`).join("");
	document.querySelectorAll("[data-report-visibility]").forEach(input => input.addEventListener("change", () => setReportVisibility(decodeURIComponent(input.dataset.reportVisibility), input.checked)));
	document.getElementById("report-catalog").innerHTML = '<option value="">Select an existing report…</option>' +
		(data.catalog || []).map(report => `<option value="${escapeHtml(report.name)}">${escapeHtml(report.name)} · ${escapeHtml(report.ref_doctype || "")}</option>`).join("");
}

function setReportVisibility(reportName, visible) {
	frappe.call({ method: "store_management.api.set_report_sidebar_visibility", args: { report_name: reportName, visible: visible ? 1 : 0 }, callback(response) {
		renderReportManager(response.message || {});
		window.refreshMySalesReportNavigation?.();
	}});
}

function addSelectedReport() {
	const reportName = document.getElementById("report-catalog").value;
	if (!reportName) return frappe.show_alert({ message: "Select a report to add", indicator: "orange" });
	frappe.call({ method: "store_management.api.add_report_to_sidebar", args: { report_name: reportName }, callback(response) {
		renderReportManager(response.message || {});
		window.refreshMySalesReportNavigation?.();
	}});
}

function normalizeResultRows(data) {
	const columns = data.columns || [];
	return (data.result || []).map(row => {
		if (!Array.isArray(row)) return row || {};
		return Object.fromEntries(columns.map((column, index) => [column.fieldname, row[index]]));
	});
}

function getNumericValue(row) {
	const fields = requestedReportType === "items"
		? ["amount", "net_amount", "total", "base_net_amount"]
		: requestedReportType === "open-bills"
			? ["outstanding", "outstanding_amount", "invoiced", "invoice_grand_total"]
			: ["grand_total", "net_total", "invoiced", "total", "amount"];
	const expandedFields = [...fields, "debit", "credit", "balance", "closing_debit", "closing_credit", "net_profit_loss"];
	const field = expandedFields.find(name => row[name] !== undefined && row[name] !== null && row[name] !== "");
	if (field) return Number(row[field]) || 0;
	const numeric = Object.entries(row).filter(([key, value]) => key !== "indent" && value !== null && value !== "" && Number.isFinite(Number(value)));
	return numeric.length ? Number(numeric[numeric.length - 1][1]) : 0;
}

function renderReportVisuals(data) {
	const rows = normalizeResultRows(data).filter(row => row && typeof row === "object");
	const chart = document.getElementById("report-trend-chart");
	if (!chart) return;
	const values = rows.slice(0, 24).map(getNumericValue);
	const max = Math.max(...values.map(value => Math.abs(value)), 1);
	const width = 720;
	const points = values.map((value, index) => `${20 + index * ((width - 40) / Math.max(values.length - 1, 1))},${175 - value / max * 135}`).join(" ");
	const useBars = ["profit-and-loss", "trial-balance"].includes(requestedReportType);
	chart.innerHTML = values.length && useBars ? `
		<svg viewBox="0 0 720 205" preserveAspectRatio="none" aria-label="${escapeHtml(activeReport.title)} comparison">
			<path d="M20 175H700M20 108H700M20 40H700" stroke="#e8eee9"/>
			${values.map((value,index) => { const barWidth = Math.max(8, 620 / Math.max(values.length,1) * .62); const x = 35 + index * (650 / Math.max(values.length,1)); const height = Math.min(135, Math.abs(value) / max * 135); return `<rect x="${x}" y="${175-height}" width="${barWidth}" height="${height}" rx="5" fill="${value < 0 ? '#e45756' : (index % 2 ? activeReport.accent : '#2f80ed')}"><title>${value}</title></rect>`; }).join("")}
		</svg>` : values.length ? `
		<svg viewBox="0 0 720 205" preserveAspectRatio="none" aria-label="${escapeHtml(activeReport.title)} trend">
			<defs><linearGradient id="report-area" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${activeReport.accent}" stop-opacity=".23"/><stop offset="1" stop-color="${activeReport.accent}" stop-opacity="0"/></linearGradient></defs>
			<path d="M20 175H700M20 108H700M20 40H700" stroke="#e8eee9"/>
			<polygon points="20,175 ${points} 700,175" fill="url(#report-area)"/>
			<polyline points="${points}" fill="none" stroke="${activeReport.accent}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
			${values.map((value,index) => `<circle cx="${20 + index * ((width - 40) / Math.max(values.length - 1, 1))}" cy="${175-value/max*135}" r="3.5" fill="${activeReport.accent}"/>`).join("")}
		</svg>` : '<div class="sm-chart-empty">No trend data for these filters</div>';

	const groupFields = requestedReportType === "items" ? ["item_group", "item_name", "item_code"]
		: requestedReportType === "open-bills" ? ["status", "customer_name", "party"]
		: ["account", "account_name", "voucher_type", "customer_group", "customer_name", "customer"];
	const groups = {};
	rows.forEach(row => {
		const field = groupFields.find(name => row[name]);
		const label = field ? row[field] : "Other";
		groups[label] = (groups[label] || 0) + Math.abs(getNumericValue(row));
	});
	const entries = Object.entries(groups).sort((a,b) => b[1]-a[1]).slice(0,6);
	const total = entries.reduce((sum, entry) => sum + entry[1], 0);
	const colors = [activeReport.accent, "#2f80ed", "#f4a340", "#7559c7", "#16a6a1", "#e85d75"];
	let angle = 0;
	const segments = entries.map((entry,index) => { const start = angle; angle += total ? entry[1]/total*360 : 0; return `${colors[index]} ${start}deg ${angle}deg`; }).join(",");
	const money = value => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", notation: "compact", maximumFractionDigits: 1 }).format(value || 0);
	const donut = document.getElementById("report-donut");
	donut.style.background = `conic-gradient(${segments || "#e7ece9 0 360deg"})`;
	donut.innerHTML = `<span>${money(total)}</span>`;
	document.getElementById("report-breakdown-title").textContent = requestedReportType === "items" ? "Sales by Item" : requestedReportType === "open-bills" ? "Bills Breakdown" : "Sales by Customer";
	document.getElementById("report-breakdown-list").innerHTML = entries.map((entry,index) => { const percent = total ? Math.round(entry[1]/total*100) : 0; return `<li><i style="background:${colors[index]}"></i><span title="${escapeHtml(String(entry[0]))}">${escapeHtml(String(entry[0]))}<em><u style="width:${percent}%;background:${colors[index]}"></u></em></span><b>${percent}%</b></li>`; }).join("") || "<li>No breakdown data</li>";
	document.getElementById("report-row-count").textContent = `${rows.length} record${rows.length === 1 ? "" : "s"}`;
}

function renderReportSummary(data) {
	const summary = document.getElementById("report-summary");
	if (!summary) return;
	const rows = normalizeResultRows(data).filter(row => row && typeof row === "object");
	const totalFor = names => rows.reduce((sum, row) => {
		const key = names.find(name => row[name] !== undefined && row[name] !== null && row[name] !== "");
		return sum + (key ? Number(row[key]) || 0 : 0);
	}, 0);
	const money = value => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value || 0);
	const primaryTotal = totalFor(["grand_total", "net_total", "invoiced", "total", "amount"]);
	const outstanding = totalFor(["outstanding", "outstanding_amount", "balance"]);
	const average = rows.length ? primaryTotal / rows.length : 0;
	const highest = rows.reduce((maximum, row) => Math.max(maximum, Math.abs(getNumericValue(row))), 0);
	summary.innerHTML = `
		<article><i>₹</i><div><span>${requestedReportType === "open-bills" ? "Total Outstanding" : "Total Sales"}</span><strong>${money(requestedReportType === "open-bills" ? outstanding : primaryTotal)}</strong><small>Selected period</small></div></article>
		<article><i>▤</i><div><span>Total Records</span><strong>${rows.length}</strong><small>Matching entries</small></div></article>
		<article><i>◇</i><div><span>Average Value</span><strong>${money(average)}</strong><small>Per record</small></div></article>
		<article><i>↗</i><div><span>Highest Value</span><strong>${money(highest)}</strong><small>Top result</small></div></article>`;
}

function renderSalesRegisterTable(data) {
	const headEl = document.getElementById("sales-register-head");
	const bodyEl = document.getElementById("sales-register-body");
	if (!headEl || !bodyEl) return;

	const columns = data.columns || [];
	const result = data.result || [];

	headEl.innerHTML = `<tr>${columns.map(col => `<th>${escapeHtml(col.label)}</th>`).join("")}</tr>`;
	bodyEl.innerHTML = result.map(row => {
		if (Array.isArray(row)) {
			return `<tr>${row.map(cell => `<td>${escapeHtml(String(cell || ""))}</td>`).join("")}</tr>`;
		} else if (typeof row === "object") {
			return `<tr>${columns.map(col => `<td>${escapeHtml(String(row[col.fieldname] || ""))}</td>`).join("")}</tr>`;
		}
		return "";
	}).join("");
}

// Initialize reliably whether Frappe rendered the page before or after DOMContentLoaded.
let reportPageInitialized = false;
function bindReportActions() {
	if (document.documentElement.dataset.reportActionsBound) return;
	document.documentElement.dataset.reportActionsBound = "1";
	document.getElementById("manage-reports-button")?.addEventListener("click", openReportManager);
	document.getElementById("export-report-button")?.addEventListener("click", exportCurrentReport);
	document.getElementById("refresh-report-button")?.addEventListener("click", runSalesRegisterReport);
	document.getElementById("close-report-manager")?.addEventListener("click", closeReportManager);
	document.getElementById("add-report-button")?.addEventListener("click", addSelectedReport);
	document.getElementById("sales-register-filters")?.addEventListener("submit", event => {
		event.preventDefault();
		runSalesRegisterReport();
	});
}

async function initializeReportsPage() {
	if (reportPageInitialized) return;
	if (!document.getElementById("report-title") || !document.getElementById("sales-register-filters")) {
		window.setTimeout(initializeReportsPage, 50);
		return;
	}
	if (!window.frappe?.call) {
		setReportStatus("Connecting to the report service…");
		window.setTimeout(initializeReportsPage, 100);
		return;
	}
	reportPageInitialized = true;
	bindReportActions();
	clearStaleReportOverlay();
	document.getElementById("report-title").textContent = activeReport.title;
	document.getElementById("report-subtitle").textContent = activeReport.subtitle;
	document.documentElement.style.setProperty("--sm-report-accent", activeReport.accent);
	document.title = `${activeReport.title} · My Sales`;
	setReportStatus("Preparing your report...");
	await resolveDefaultReportCompany();
	loadSalesRegisterReport();
}

initializeReportsPage();
