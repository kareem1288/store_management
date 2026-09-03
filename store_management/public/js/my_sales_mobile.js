(function () {
  "use strict";
  document.documentElement.classList.add("my-sales-app");

  const APP_NAME = "My Sales";
  const MOBILE_UI_VERSION = "20260903-11";
  let installPrompt = null;

  const appLanguage = window.frappe?.boot?.lang || window.frappe?.boot?.user?.language || "en";
  document.documentElement.lang = appLanguage;

  function translateCustomInterface(root = document.body) {
    if (appLanguage === "en" || typeof window.__ !== "function" || !root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
      if (node.parentElement?.closest("script,style,textarea") || !node.nodeValue.trim()) return;
      const leading = node.nodeValue.match(/^\s*/)[0];
      const trailing = node.nodeValue.match(/\s*$/)[0];
      const source = node.nodeValue.trim();
      const translated = window.__(source);
      if (translated !== source) node.nodeValue = `${leading}${translated}${trailing}`;
    });
    root.querySelectorAll?.("[placeholder],[title],[aria-label]").forEach(element => {
      ["placeholder", "title", "aria-label"].forEach(attribute => {
        const source = element.getAttribute(attribute);
        if (source) element.setAttribute(attribute, window.__(source));
      });
    });
  }

  function watchInterfaceTranslations() {
    translateCustomInterface();
    if (appLanguage === "en") return;
    let queued = false;
    new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; translateCustomInterface(); });
    }).observe(document.body, { childList: true, subtree: true });
  }

  async function refreshInstalledAppCache() {
	try {
		if (localStorage.getItem("my-sales-ui-version") === MOBILE_UI_VERSION) return false;
		if ("caches" in window) {
			const keys = await caches.keys();
			await Promise.all(keys.filter(key => key.startsWith("my-sales-shell-")).map(key => caches.delete(key)));
		}
		if ("serviceWorker" in navigator) {
			const registrations = await navigator.serviceWorker.getRegistrations();
			await Promise.all(registrations.map(registration => registration.update()));
		}
		localStorage.setItem("my-sales-ui-version", MOBILE_UI_VERSION);
		return true;
	} catch (error) {
		console.warn("My Sales cache refresh was skipped", error);
		return false;
	}
  }

  const section = location.pathname.includes("masters")
    ? "Masters"
    : location.pathname.includes("reports") ? "Reports" : "Billing";
  document.title = `${section} · ${APP_NAME}`;

  const markStandalone = () => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
    document.documentElement.classList.toggle("my-sales-standalone", Boolean(standalone));
  };
  markStandalone();
  window.matchMedia("(display-mode: standalone)").addEventListener?.("change", markStandalone);

  function showStatus(message, type) {
    let toast = document.getElementById("my-sales-app-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "my-sales-app-toast";
      toast.className = "my-sales-app-toast";
      toast.setAttribute("role", "status");
      toast.setAttribute("aria-live", "polite");
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.dataset.type = type || "info";
    toast.classList.add("visible");
    window.clearTimeout(showStatus.timer);
    showStatus.timer = window.setTimeout(() => toast.classList.remove("visible"), 3200);
  }

  function setupChartTooltips() {
    if (document.querySelector(".my-sales-chart-tooltip")) return;
    const tooltip = document.createElement("div");
    tooltip.className = "my-sales-chart-tooltip";
    tooltip.setAttribute("role", "tooltip");
    document.body.appendChild(tooltip);
    const show = (target, event) => {
      tooltip.textContent = target.dataset.chartValue;
      tooltip.classList.add("visible");
      const rect = target.getBoundingClientRect();
      const left = event?.clientX || rect.left + rect.width / 2;
      const top = event?.clientY || rect.top;
      tooltip.style.left = `${Math.min(window.innerWidth - 12, Math.max(12, left))}px`;
      tooltip.style.top = `${Math.max(12, top - 12)}px`;
    };
    document.addEventListener("pointerover", event => {
      const target = event.target.closest?.("[data-chart-value]");
      if (target) show(target, event);
    });
    document.addEventListener("pointermove", event => {
      const target = event.target.closest?.("[data-chart-value]");
      if (target) show(target, event);
    });
    document.addEventListener("pointerout", event => {
      if (event.target.closest?.("[data-chart-value]")) tooltip.classList.remove("visible");
    });
    document.addEventListener("focusin", event => {
      const target = event.target.closest?.("[data-chart-value]");
      if (target) show(target);
    });
    document.addEventListener("focusout", event => {
      if (event.target.closest?.("[data-chart-value]")) tooltip.classList.remove("visible");
    });
  }

  function updateConnection() {
    document.documentElement.classList.toggle("my-sales-offline", !navigator.onLine);
    showStatus(
      navigator.onLine ? "Back online" : "You are offline. Saved server data needs a connection.",
      navigator.onLine ? "online" : "offline"
    );
  }

  function addAppActions() {
    const topNav = document.querySelector(".sm-top-nav");
    if (!topNav || document.querySelector(".my-sales-app-actions")) return;

    const actions = document.createElement("div");
    actions.className = "my-sales-app-actions";
    actions.innerHTML = `
      <button class="my-sales-install" type="button" hidden aria-label="Install ${APP_NAME}">Install App</button>
      <span class="my-sales-connection" aria-label="Connection status"></span>
      ${window.matchMedia("(max-width: 900px)").matches ? `<a class="my-sales-logout" href="/logout" aria-label="Log out of ${APP_NAME}">Log out</a>` : ""}
    `;
    topNav.appendChild(actions);

    actions.querySelector(".my-sales-install").addEventListener("click", async () => {
      if (!installPrompt) return;
      installPrompt.prompt();
      await installPrompt.userChoice;
      installPrompt = null;
      actions.querySelector(".my-sales-install").hidden = true;
    });
  }

  function addBackButton() {
	const topNav = document.querySelector(".sm-top-nav");
	if (location.pathname === "/pos" && !location.hash) return;
	if (!topNav || topNav.querySelector(".my-sales-back")) return;
	const button = document.createElement("button");
	button.type = "button";
	button.className = "my-sales-back";
	button.setAttribute("aria-label", "Go back");
	button.innerHTML = '<span aria-hidden="true">←</span><b>Back</b>';
	button.addEventListener("click", () => {
		if (history.length > 1) history.back();
		else location.href = "/pos";
	});
	topNav.insertAdjacentElement("afterbegin", button);
  }

  const icons = {
    home: '<svg viewBox="0 0 24 24"><path d="M3 11.5 12 4l9 7.5v8a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
    masters: '<svg viewBox="0 0 24 24"><path d="M4 5h6v6H4zm10 0h6v6h-6zM4 15h6v4H4zm10 0h6v4h-6z"/></svg>',
    pos: '<svg viewBox="0 0 24 24"><path d="M6 3h12l1 6H5zm0 8h12v9H6zm3 3h6m-6 3h3"/></svg>',
    reports: '<svg viewBox="0 0 24 24"><path d="M4 19V9m5 10V5m5 14v-7m5 7V3"/></svg>',
    more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>'
  };

  function buildMobileNavigation() {
    const nav = document.querySelector(".sm-nav-primary");
    if (!nav) return;
    const page = location.pathname.includes("masters") ? "masters" : location.pathname.includes("reports") ? "reports" : location.hash === "#billing-panel" ? "pos" : "home";
    nav.innerHTML = `
      <a href="/pos" class="sm-nav-link ${page === "home" ? "active" : ""}">${icons.home}<span>Home</span></a>
      <a href="/pos#billing-panel" class="sm-nav-link ${page === "pos" ? "active" : ""}">${icons.pos}<span>POS</span></a>
      <a href="/reports?type=sales" class="sm-nav-link ${page === "reports" ? "active" : ""}">${icons.pos}<span>Sales</span></a>
      <a href="/reports?type=items" class="sm-nav-link">${icons.reports}<span>Reports</span></a>
      <a href="/masters?doctype=Item" class="sm-nav-link ${page === "masters" ? "active" : ""}">${icons.more}<span>More</span></a>
    `;
  }

  function buildMobileDrawer() {
    if (!window.matchMedia("(max-width: 768px)").matches || document.querySelector(".my-sales-mobile-drawer")) return;
    const app = document.querySelector(".sm-page-app");
    const top = app?.querySelector(".sm-top-nav");
    if (!top) return;
    const reportTitles = { sales: "Sales Report", items: "Item Report", customers: "Customer Report", "open-bills": "Open Bills" };
    const reportType = new URLSearchParams(location.search).get("type") || "sales";
    const title = location.pathname.includes("reports") ? (reportTitles[reportType] || "Reports") : location.pathname.includes("masters") ? "Masters" : location.hash === "#billing-panel" ? "POS" : "Dashboard";
    top.insertAdjacentHTML("afterbegin", `<button class="my-sales-mobile-menu" type="button" aria-label="Open navigation" aria-expanded="false">☰</button><strong class="my-sales-mobile-title">${title}</strong>`);

    const overlay = document.createElement("button");
    overlay.type = "button";
    overlay.className = "my-sales-mobile-overlay";
    overlay.setAttribute("aria-label", "Close navigation");
    const drawer = document.createElement("aside");
    drawer.className = "my-sales-mobile-drawer";
    drawer.innerHTML = `
      <a class="my-sales-mobile-brand" href="/pos"><b><img src="/api/method/store_management.api.get_brand_asset?name=my-sales-logo.svg" alt=""></b><span><strong>My Sales</strong><small>Retail Billing</small></span></a>
      <nav>
        <a href="/pos" data-section="dashboard">${icons.home}<span>Dashboard</span></a>
        <details open><summary>${icons.pos}<span>POS</span></summary><div class="my-sales-mobile-submenu"><a href="/pos#billing-panel">New Sale</a><a href="/reports?type=open-bills">Open Bills</a><a href="/masters?doctype=Customer">Customers</a></div></details>
        <details open><summary>${icons.reports}<span>Reports</span></summary><div class="my-sales-mobile-submenu my-sales-report-links"><a href="/reports?type=sales">Sales Report</a><a href="/reports?type=items">Item Report</a><a href="/reports?type=customers">Customer Report</a></div></details>
        <details open><summary>${icons.masters}<span>Masters</span></summary><div class="my-sales-mobile-submenu"><a href="/masters?doctype=Item">Items</a><a href="/masters?doctype=Item%20Group">Item Groups</a><a href="/masters?doctype=Customer">Customers</a><a href="/masters?doctype=Item%20Tax%20Template">Tax Templates</a><a href="/masters?doctype=Company">Companies</a><a href="/masters?doctype=User">Users</a></div></details>
        <a href="/masters?doctype=Company" data-section="settings">${icons.more}<span>Settings</span></a>
      </nav>
      <a class="my-sales-mobile-drawer-logout" href="/logout">↪ <span>Logout</span></a>`;
    document.body.append(overlay, drawer);
    const currentPath = `${location.pathname}${location.search}${location.hash}`;
    drawer.querySelectorAll("a[href]").forEach(link => {
      const target = new URL(link.href, location.origin);
      const exactMatch = `${target.pathname}${target.search}${target.hash}` === currentPath;
      const dashboardMatch = link.dataset.section === "dashboard" && location.pathname === "/pos" && !location.hash;
      if (exactMatch || dashboardMatch) {
        link.classList.add("active");
        link.closest("details")?.setAttribute("open", "");
      }
    });
    const toggle = top.querySelector(".my-sales-mobile-menu");
    const setOpen = open => {
      document.documentElement.classList.toggle("my-sales-mobile-nav-open", open);
      toggle.setAttribute("aria-expanded", String(open));
	  drawer.setAttribute("aria-hidden", String(!open));
    };
	drawer.setAttribute("aria-hidden", "true");
    toggle.addEventListener("click", () => setOpen(true));
    overlay.addEventListener("click", () => setOpen(false));
    drawer.querySelectorAll("a").forEach(link => link.addEventListener("click", () => setOpen(false)));
	document.addEventListener("keydown", event => {
	  if (event.key === "Escape" && document.documentElement.classList.contains("my-sales-mobile-nav-open")) {
		setOpen(false);
		toggle.focus();
	  }
	});
  }

  function enhancePosHome() {
    const home = document.querySelector(".sm-pos-app .sm-home-column");
    if (!home || home.querySelector(".my-sales-quick-actions")) return;
    home.classList.add("my-sales-home-card");

    const quickActions = document.createElement("section");
    quickActions.className = "my-sales-quick-actions";
    quickActions.innerHTML = `
      <h2>Quick Actions</h2>
      <div>
        <a href="/masters?doctype=Customer" data-label="Customers"><span>☷</span>Customers</a>
        <a href="/masters?doctype=Item" data-label="Items"><span>◇</span>Items</a>
        <a href="/reports"><span>╱</span>Reports</a>
        <button type="button" class="my-sales-settings"><span>⚙</span>Settings</button>
      </div>
    `;
    home.after(quickActions);
    quickActions.querySelector(".my-sales-settings").addEventListener("click", () => {
      document.querySelector(".my-sales-app-actions")?.classList.toggle("open");
    });

    const start = document.querySelector(".sm-cta-primary");
    if (start) start.innerHTML = `${icons.pos}<span>Start Billing</span>`;
  }

  function enhanceMasters() {
    const sidebar = document.querySelector(".sm-masters-sidebar");
    const shell = document.querySelector(".sm-masters-shell");
    if (!sidebar || !shell) return;

    const descriptions = {
      "Item": "Manage product items", "Item Group": "Manage item categories",
      "Customer": "Manage customers", "Customer Group": "Manage customer groups",
      "Item Tax Template": "Manage tax templates", "Company": "Manage companies", "User": "Manage system users"
    };
    sidebar.querySelectorAll(".sm-nav-item").forEach((button, index) => {
      const type = button.dataset.doctype;
      button.innerHTML = `<span class="my-sales-master-icon">${["◇","📁","☷","☷","◈","▥","☺"][index] || "◇"}</span><span><strong>${button.textContent.trim()}</strong><small>${descriptions[type] || "Manage records"}</small></span><b>›</b>`;
    });
  }

  function buildDesktopShell() {
    if (window.matchMedia("(max-width: 900px)").matches || document.querySelector(".my-sales-desktop-sidebar")) return;
    const app = document.querySelector(".sm-page-app");
    if (!app) return;
    const active = location.pathname.includes("masters") ? "masters" : location.pathname.includes("reports") ? "reports" : "dashboard";
    const requestedMaster = new URLSearchParams(location.search).get("doctype") || "Item";
    const requestedReport = new URLSearchParams(location.search).get("type") || "sales";
    const sidebar = document.createElement("aside");
    sidebar.className = "my-sales-desktop-sidebar";
    sidebar.innerHTML = `
      <a class="my-sales-desktop-brand" href="/pos"><b><img src="/api/method/store_management.api.get_brand_asset?name=my-sales-logo.svg" alt=""></b><span><strong>My Sales</strong><small>Retail Billing</small></span></a>
      <nav>
        <a href="/pos" class="${active === "dashboard" ? "active" : ""}">${icons.home}<span>Dashboard</span></a>
        <div class="my-sales-menu-group collapsed"><button type="button" class="my-sales-menu-toggle" aria-expanded="false">${icons.pos}<span>POS</span><b>⌄</b></button>
          <div class="my-sales-menu-items"><a href="/pos#billing-panel">New Sale</a><a href="/reports?type=open-bills" class="${requestedReport === "open-bills" ? "active" : ""}">Open Bills</a></div>
        </div>
        <div class="my-sales-menu-group collapsed"><button type="button" class="my-sales-menu-toggle" aria-expanded="false">${icons.reports}<span>Sales</span><b>⌄</b></button>
          <div class="my-sales-menu-items my-sales-report-links"><a href="/reports?type=sales" class="${requestedReport === "sales" ? "active" : ""}">Sales Report</a>
          <a href="/reports?type=items" class="${requestedReport === "items" ? "active" : ""}">Item Wise Sales</a></div>
        </div>
        <a href="/reports">${icons.reports}<span>Reports</span></a>
        <div class="my-sales-menu-group collapsed"><button type="button" class="my-sales-menu-toggle" aria-expanded="false">${icons.masters}<span>Masters</span><b>⌄</b></button>
          <div class="my-sales-menu-items"><a href="/masters?doctype=Item" class="${active === "masters" && requestedMaster === "Item" ? "active" : ""}">Masters</a>
          <a href="/masters?doctype=Item%20Group" class="${requestedMaster === "Item Group" ? "active" : ""}">Item Groups</a><a href="/masters?doctype=Customer" class="${requestedMaster === "Customer" ? "active" : ""}">Customers</a>
          <a href="/masters?doctype=Customer%20Group" class="${requestedMaster === "Customer Group" ? "active" : ""}">Customer Groups</a><a href="/masters?doctype=Item%20Tax%20Template" class="${requestedMaster === "Item Tax Template" ? "active" : ""}">Tax Templates</a>
          <a href="/masters?doctype=Company" class="${requestedMaster === "Company" ? "active" : ""}">Companies</a><a href="/masters?doctype=User" class="${requestedMaster === "User" ? "active" : ""}">Users</a></div>
        </div>
        <a href="/masters?doctype=Company">${icons.masters}<span>Store Management</span></a>
        <a href="/reports?type=expenses">${icons.reports}<span>Expenses</span></a>
        <a href="/masters?doctype=Company">${icons.more}<span>Settings</span></a>
      </nav>
      <div class="my-sales-sidebar-promo"><strong>♛ &nbsp; Go Premium</strong><p>Unlock powerful reports and advanced features.</p><a href="/contact">Upgrade Now</a></div>
      <div class="my-sales-sidebar-help"><strong>◉ &nbsp; Need Help?</strong><p>Our support team is here to help you.</p><a href="mailto:support@mysales.app">Contact Support</a></div>
    `;
    document.body.appendChild(sidebar);

    sidebar.querySelectorAll(".my-sales-menu-toggle").forEach(toggle => {
      toggle.addEventListener("click", () => {
        const group = toggle.closest(".my-sales-menu-group");
        const collapsed = group.classList.toggle("collapsed");
        toggle.setAttribute("aria-expanded", String(!collapsed));
      });
    });

    const top = app.querySelector(".sm-top-nav");
    if (top) {
      const title = active === "dashboard" ? "Dashboard" : active[0].toUpperCase() + active.slice(1);
      top.querySelector(".sm-brand-lockup")?.remove();
      top.querySelector(".sm-nav-primary")?.remove();
      top.insertAdjacentHTML("afterbegin", `<button class="my-sales-sidebar-toggle" type="button">☰</button><div class="my-sales-desktop-title">${icons[active] || icons.home}<strong>${title}</strong></div>`);
      top.querySelector(".my-sales-sidebar-toggle")?.addEventListener("click", () => document.documentElement.classList.toggle("my-sales-sidebar-collapsed"));
    }
  }

  async function refreshReportNavigation() {
    if (!window.frappe?.call) return;
    frappe.call({
      method: "store_management.api.get_report_sidebar",
      silent: true,
      callback(response) {
        const reports = (response.message?.reports || []).filter(report => Number(report.is_visible));
        const current = new URLSearchParams(location.search).get("type") || "sales";
        const html = reports.map(report => `<a href="/reports?type=${encodeURIComponent(report.route_key)}" class="${current === report.route_key ? "active" : ""}">${String(report.report_name).replace(/[&<>"']/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[character])}</a>`).join("");
        document.querySelectorAll(".my-sales-report-links").forEach(container => { container.innerHTML = html; });
      }
    });
  }
  window.refreshMySalesReportNavigation = refreshReportNavigation;

  function currency(value) {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(value || 0));
  }

  function buildTrendSvg(rows) {
    const values = rows.map(row => Number(row.total || 0));
    const max = Math.max(...values, 1);
    const x = index => 24 + index * 524 / Math.max(values.length - 1, 1);
    const points = values.map((value, index) => `${x(index)},${155 - value / max * 120}`).join(" ");
    const area = `24,155 ${points} ${x(Math.max(values.length - 1, 0))},155`;
    return `<svg viewBox="0 0 570 180" preserveAspectRatio="none" aria-label="Sales trend for selected month"><defs><linearGradient id="sales-fill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#10b981" stop-opacity=".38"/><stop offset=".55" stop-color="#38bdf8" stop-opacity=".13"/><stop offset="1" stop-color="#6366f1" stop-opacity="0"/></linearGradient><linearGradient id="sales-line" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#059669"/><stop offset=".52" stop-color="#0ea5e9"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs><path d="M24 155H548M24 95H548M24 35H548" stroke="#e7edf4" stroke-dasharray="5 5"/><polygon points="${area}" fill="url(#sales-fill)"/><polyline points="${points}" fill="none" stroke="url(#sales-line)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>${values.map((value,index) => `<circle tabindex="0" data-chart-value="${rows[index]?.date || ''}: ${currency(value)}" cx="${x(index)}" cy="${155-value/max*120}" r="${values.length > 16 ? 3.5 : 6}" fill="#fff" stroke="${index === values.length-1 ? '#6366f1' : '#0b9a68'}" stroke-width="${values.length > 16 ? 2.5 : 4}"/>`).join("")}</svg>`;
  }

  function buildDonutChart(rows, colors, total, centerLabel = "Total") {
    const circumference = 263.89;
    let offset = 0;
    const segments = rows.map((row, index) => {
      const value = Number(row.value || 0);
      const percent = total ? value / total * 100 : 0;
      const length = circumference * percent / 100;
      const dashOffset = -offset;
      offset += length;
      const label = String(row.label || "Other").replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;");
      return `<circle tabindex="0" data-chart-value="${label}: ${currency(value)} (${Math.round(percent)}%)" cx="50" cy="50" r="42" fill="none" stroke="${colors[index % colors.length]}" stroke-width="16" stroke-dasharray="${length} ${circumference - length}" stroke-dashoffset="${dashOffset}"/>`;
    }).join("");
    return `<div class="my-sales-donut"><svg viewBox="0 0 100 100" aria-label="${centerLabel}"><circle cx="50" cy="50" r="42" fill="none" stroke="#e8eeea" stroke-width="16"/>${segments}</svg><span>${currency(total)}<small>${centerLabel}</small></span></div>`;
  }

  function buildSparkline(rows) {
    const values = rows.map(row => Number(row.total || 0));
    const max = Math.max(...values, 1);
    const points = values.map((value, index) => `${index * 100 / Math.max(values.length - 1, 1)},${27 - value / max * 22}`).join(" ");
    return `<svg class="my-sales-sparkline" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><polyline points="${points}" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
  }

  function buildWeeklyOverviewChart(rows) {
    const max = Math.max(...rows.map(row => Number(row.total || 0)), 1);
    return `<div class="my-sales-weekly-chart"><svg viewBox="0 0 320 165" preserveAspectRatio="none" aria-label="Weekly sales bar chart"><path d="M10 125H314M10 82H314M10 39H314" stroke="#e7eee9" stroke-dasharray="4 5"/>${rows.map((row, index) => {
      const date = new Date(`${row.date}T00:00:00`);
      const height = Math.max(3, Number(row.total || 0) / max * 82);
      const x = 20 + index * 43;
      return `<text x="${x + 11}" y="${Math.max(12, 120 - height)}" text-anchor="middle" class="chart-value">${currency(row.total).replace(".00", "")}</text><rect x="${x}" y="${125 - height}" width="22" height="${height}" rx="4" tabindex="0" data-chart-value="${date.toLocaleDateString("en-IN", {day:"numeric", month:"short"})}: ${currency(row.total)}"/><text x="${x + 11}" y="142" text-anchor="middle" class="chart-day">${date.toLocaleDateString("en-IN", {weekday:"short"})}</text><text x="${x + 11}" y="154" text-anchor="middle" class="chart-date">${date.toLocaleDateString("en-IN", {day:"numeric", month:"short"})}</text>`;
    }).join("")}</svg></div>`;
  }

  function buildMonthlySummaryChart(rows) {
    const max = Math.max(...rows.flatMap(row => [Number(row.sales || 0), Number(row.profit || 0)]), 1);
    return `<div class="my-sales-month-chart"><svg viewBox="0 0 300 120" preserveAspectRatio="none" aria-label="Monthly sales and profit bar chart"><path d="M8 95H294M8 55H294M8 15H294" stroke="#e7eee9" stroke-dasharray="4 5"/>${rows.map((row,index) => {
      const salesHeight = Math.max(3, Number(row.sales || 0) / max * 76);
      const profitHeight = Math.max(3, Number(row.profit || 0) / max * 76);
      const x = 25 + index * 55;
      return `<rect class="sales-bar" x="${x}" y="${95-salesHeight}" width="13" height="${salesHeight}" rx="3" tabindex="0" data-chart-value="${row.month} sales: ${currency(row.sales)}"/><rect class="profit-bar" x="${x+16}" y="${95-profitHeight}" width="13" height="${profitHeight}" rx="3" tabindex="0" data-chart-value="${row.month} profit: ${currency(row.profit)}"/><text x="${x+14}" y="110" text-anchor="middle">${row.month}</text>`;
    }).join("")}</svg><footer><span><i></i>Sales (₹)</span><span><i></i>Profit (₹)</span></footer></div>`;
  }

  function enhanceDesktopDashboard(providedBootstrap) {
    if (!document.querySelector(".sm-pos-app")) return;
    const shell = document.querySelector(".sm-pos-shell");
    let bootstrap = providedBootstrap || {};
    const rawBootstrap = document.getElementById("sm-pos-bootstrap")?.textContent || "{}";
    if (!providedBootstrap) {
      try {
        bootstrap = typeof window.parseBootstrapPayload === "function"
          ? window.parseBootstrapPayload(rawBootstrap)
          : JSON.parse(rawBootstrap);
      } catch (error) {
        console.warn("My Sales dashboard bootstrap could not be parsed", error);
      }
    }
    const summary = bootstrap.summary || {};
    if (!shell) return;
    const existingDashboard = shell.querySelector(".my-sales-dashboard");
    if (existingDashboard && !providedBootstrap) return;
    existingDashboard?.remove();
    const trend = summary.trend || [];
    const categoryColors = ["#07914c", "#2186e8", "#ffad14", "#6846dd", "#15a6a1"];
    const categories = summary.categories || [];
	const weekTotal = trend.reduce((sum, row) => sum + Number(row.total || 0), 0);
    const categoryTotal = categories.reduce((sum,row) => sum + Number(row.value || 0), 0);
    const paymentColors = ["#07914c", "#2186e8", "#ff7a18", "#8254e8", "#ef476f"];
    const paymentMethods = summary.payment_methods || [];
    const paymentTotal = paymentMethods.reduce((sum, row) => sum + Number(row.value || 0), 0);
    const hourly = summary.sales_by_hour || [];
    const maxHourly = Math.max(...hourly.map(row => Number(row.value || 0)), 1);
    const storeSales = summary.sales_by_store || [];
    const maxStore = Math.max(...storeSales.map(row => Number(row.value || 0)), 1);
    const orderStatus = summary.order_status || {};
    const orderTotal = Number(orderStatus.completed || 0) + Number(orderStatus.pending || 0) + Number(orderStatus.cancelled || 0);
    const orderRows = [
      {label: "Completed", value: Number(orderStatus.completed || 0)},
      {label: "Pending", value: Number(orderStatus.pending || 0)},
      {label: "Cancelled", value: Number(orderStatus.cancelled || 0)},
    ];
    const orderColors = ["#07914c", "#2186e8", "#ff7a18"];
    const recentRows = (summary.recent_bills || []).map(row => `<tr><td>${row.name}</td><td>${row.customer}</td><td>${Number(row.total_qty || 0)}</td><td><b>${currency(row.grand_total)}</b></td><td>${String(row.posting_time || "").slice(0,5)}</td></tr>`).join("");
    const topRows = (summary.top_items || []).map(row => `<tr><td>${row.item_name}</td><td>${Number(row.sold || 0)}</td><td><b>${currency(row.revenue)}</b></td></tr>`).join("");
	const insightsUrl = document.querySelector(".sm-pos-app")?.dataset.insightsDashboard || "/insights";
    const now = new Date();
    const selectedMonth = Number(summary.period?.month || now.getMonth() + 1);
    const selectedYear = Number(summary.period?.year || now.getFullYear());
    const selectedCompany = summary.period?.company || "";
    const stores = summary.stores || [];
    const selectedFrom = summary.period?.start || `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-01`;
    const selectedTo = summary.period?.end || now.toISOString().slice(0, 10);
    const shortDate = value => new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {day: "2-digit", month: "short", year: "numeric"});
    const periodLabel = `${shortDate(selectedFrom)} – ${shortDate(selectedTo)}`;
    const tickStep = Math.max(1, Math.ceil(trend.length / 7));
    const trendTicks = trend.filter((_, index) => index === 0 || index === trend.length - 1 || index % tickStep === 0);
    const topItem = (summary.top_items || [])[0];
    const dailyTargetPercent = Math.min(100, Math.round(Number(summary.today_sales || 0) / Math.max(Number(summary.daily_target || 2000), 1) * 100));
    const monthlyTargetPercent = Math.min(100, Math.round(Number(summary.period_sales || 0) / Math.max(Number(summary.monthly_target || 5000), 1) * 100));
    const weeklyTrend = summary.weekly_trend || trend.slice(-7);
    const weeklyMax = Math.max(...weeklyTrend.map(row => Number(row.total || 0)), 1);
    const weeklyBars = `<div class="my-sales-week-bars">${weeklyTrend.map((row,index) => `<i tabindex="0" data-chart-value="${row.date || ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][index]}: ${currency(row.total)}" style="height:${Math.max(8, Number(row.total || 0)/weeklyMax*100)}%"><small>${["M","T","W","T","F","S","S"][index] || ""}</small></i>`).join("")}</div>`;
    const dashboard = document.createElement("section");
    dashboard.className = "my-sales-dashboard";
    dashboard.innerHTML = `
      <header><div><span class="my-sales-live">● Live analytics</span><h1>Business Dashboard</h1><p>Sales, customers and product performance at a glance</p></div><div class="my-sales-dashboard-actions"><form class="my-sales-period-filter" aria-label="Dashboard filters"><label><span>Store</span><select name="company"><option value="">All Stores</option>${stores.map(store => `<option value="${store}" ${store === selectedCompany ? "selected" : ""}>${store}</option>`).join("")}</select></label><label><span>From Date</span><input name="from_date" type="date" value="${selectedFrom}"></label><label><span>To Date</span><input name="to_date" type="date" value="${selectedTo}"></label></form><a class="my-sales-insights-link" href="${insightsUrl}">↗ Frappe Insights</a></div></header>
      <div class="my-sales-kpis">
        <article data-tone="green"><i>${icons.pos}</i><span>Today's Sales<strong>${currency(summary.today_sales)}</strong><small>↑ Current day</small></span><footer><b class="my-sales-target-ring" tabindex="0" data-chart-value="Daily target: ${currency(summary.today_sales)} of ${currency(summary.daily_target)} (${dailyTargetPercent}%)" style="--target:${dailyTargetPercent * 3.6}deg">${dailyTargetPercent}%</b><span><strong>${dailyTargetPercent}%</strong><small>of ${currency(summary.daily_target)} daily target</small></span></footer></article>
        <article data-tone="purple"><i>▣</i><span>Weekly Sales<strong>${currency(summary.weekly_sales)}</strong><small>↑ Last 7 days</small></span><footer>${weeklyBars}</footer></article>
        <article data-tone="blue"><i>↗</i><span>Total Sales<strong>${currency(summary.period_sales ?? summary.month_sales)}</strong><small>↑ Selected period</small></span><footer><span><strong>${currency(summary.period_sales)} / ${currency(summary.monthly_target)}</strong><em tabindex="0" data-chart-value="Monthly target: ${currency(summary.period_sales)} of ${currency(summary.monthly_target)} (${monthlyTargetPercent}%)"><u style="width:${monthlyTargetPercent}%"></u></em><small>${monthlyTargetPercent}% of monthly target</small></span></footer></article>
        <article data-tone="orange"><i>▤</i><span>Total Bills<strong>${summary.period_bills || 0}</strong><small>↑ Selected period</small></span><footer><b>▤</b><span><small>Avg. Bill Value</small><strong>${currency(summary.average_bill_value)}</strong></span></footer></article>
        <article data-tone="pink"><i>◇</i><span>Items Sold<strong>${Number(summary.period_items_sold || 0)}</strong><small>↑ Selected period</small></span><footer><b>☆</b><span><small>Top Item</small><strong>${topItem ? `${topItem.item_name} · ${Number(topItem.sold || 0)} sold` : "No sales"}</strong></span></footer></article>
        <article data-tone="teal"><i>♙</i><span>Customers<strong>${summary.active_customers || 0}</strong><small>↑ Active customers</small></span><footer class="my-sales-customer-split"><span><strong>${summary.new_customers || 0}</strong><small>New</small></span><span><strong>${summary.returning_customers || 0}</strong><small>Returning</small></span></footer></article>
      </div>
      <div class="my-sales-dashboard-grid">
        <article class="my-sales-dash-card my-sales-trend"><h2><span>Sales Trend<small>${periodLabel}</small></span><b>${currency(weekTotal)}</b></h2>${buildTrendSvg(trend)}<div style="grid-template-columns:repeat(${Math.max(trendTicks.length, 1)},1fr)">${trendTicks.map(row => `<span>${new Date(`${row.date}T00:00:00`).toLocaleDateString("en-IN",{day:"numeric",month:"short"})}</span>`).join("")}</div></article>
        <article class="my-sales-dash-card my-sales-categories"><h2><span>Sales by Category<small>${periodLabel}</small></span></h2>${buildDonutChart(categories, categoryColors, categoryTotal)}<ul>${categories.map((row,index) => { const percent = categoryTotal ? Math.round(Number(row.value || 0)/categoryTotal*100) : 0; return `<li tabindex="0" data-chart-value="${row.label || "Other"}: ${currency(row.value)} (${percent}%)"><i style="background:${categoryColors[index%categoryColors.length]}"></i><span>${row.label || "Other"}<em><u style="width:${percent}%;background:${categoryColors[index%categoryColors.length]}"></u></em></span><b>${percent}%</b></li>`; }).join("") || `<li>No sales in ${periodLabel}</li>`}</ul></article>
        <article class="my-sales-dash-card my-sales-categories my-sales-payments"><h2><span>Payment Methods<small>${periodLabel}</small></span></h2>${buildDonutChart(paymentMethods, paymentColors, paymentTotal)}<ul>${paymentMethods.map((row,index) => { const percent = paymentTotal ? Math.round(Number(row.value || 0)/paymentTotal*100) : 0; return `<li tabindex="0" data-chart-value="${row.label || "Other"}: ${currency(row.value)} (${percent}%)"><i style="background:${paymentColors[index%paymentColors.length]}"></i><span>${row.label || "Other"}</span><b>${percent}%</b></li>`; }).join("") || `<li>No payment data</li>`}</ul></article>
        <article class="my-sales-dash-card my-sales-hourly"><h2><span>Sales by Hour<small>${periodLabel}</small></span></h2><div class="my-sales-bars">${hourly.map((row,index) => `<span><i tabindex="0" data-chart-value="${row.hour % 12 || 12}${row.hour < 12 ? " AM" : " PM"}: ${currency(row.value)}" style="height:${Math.max(3, Number(row.value || 0) / maxHourly * 100)}%;--bar-index:${index}"></i><small>${row.hour % 12 || 12}${row.hour < 12 ? "a" : "p"}</small><b>${currency(row.value)}</b></span>`).join("")}</div></article>
        <article class="my-sales-dash-card my-sales-table my-sales-top-products"><h2>Top Products <a href="/reports">View All →</a></h2><table><thead><tr><th>Item</th><th>Sold</th><th>Revenue</th></tr></thead><tbody>${topRows || `<tr><td colspan="3">No sales in ${periodLabel}</td></tr>`}</tbody></table></article>
        <article class="my-sales-dash-card my-sales-stores"><h2><span>Sales by Store<small>${periodLabel}</small></span></h2><div>${storeSales.map((row,index) => `<p><span>${row.label}</span><i><u tabindex="0" data-chart-value="${row.label}: ${currency(row.value)}" style="width:${Number(row.value || 0) / maxStore * 100}%;--store-index:${index}"></u></i><b>${currency(row.value)}</b></p>`).join("") || "<p>No store sales</p>"}</div></article>
        <article class="my-sales-dash-card my-sales-table my-sales-recent"><h2>Recent Sales <a href="/reports">View All →</a></h2><table><thead><tr><th>Bill No</th><th>Customer</th><th>Items</th><th>Amount</th><th>Time</th></tr></thead><tbody>${recentRows || `<tr><td colspan="5">No sales in ${periodLabel}</td></tr>`}</tbody></table></article>
        <article class="my-sales-dash-card my-sales-weekly-overview"><h2><span>Weekly Summary (Current Week)<small>${periodLabel}</small></span></h2><div class="my-sales-week-summary"><span><i>🛒</i><b>${currency(summary.weekly_sales)}</b><small>Total Sales</small></span><span><i>▣</i><b>${weeklyTrend.reduce((sum,row) => sum + (Number(row.total || 0) > 0 ? 1 : 0), 0)}</b><small>Active Days</small></span><span><i>▤</i><b>${currency(summary.average_bill_value)}</b><small>Avg. Order Value</small></span></div>${buildWeeklyOverviewChart(weeklyTrend)}</article>
        <article class="my-sales-dash-card my-sales-month-summary"><h2><span>Monthly Summary (Current Month)<small>${periodLabel}</small></span></h2><div class="my-sales-summary-metrics"><span><i>▧</i><small>Total Sales</small><b>${currency(summary.period_sales)}</b></span><span><i>▣</i><small>Total Orders</small><b>${summary.period_bills || 0}</b></span><span><i>▤</i><small>Total Expenses</small><b>${currency(summary.period_expenses)}</b></span><span><i>⌘</i><small>Net Profit</small><b>${currency(Number(summary.period_sales || 0)-Number(summary.period_expenses || 0))}</b></span></div>${buildMonthlySummaryChart(summary.monthly_overview || [])}</article>
        <article class="my-sales-dash-card my-sales-orders"><h2><span>Order Status<small>${periodLabel}</small></span></h2>${buildDonutChart(orderRows, orderColors, orderTotal, "Total Orders")}<ul>${orderRows.map((row,index) => { const percent = orderTotal ? Math.round(row.value/orderTotal*100) : 0; return `<li tabindex="0" data-chart-value="${row.label}: ${row.value} (${percent}%)"><i style="background:${orderColors[index]}"></i>${row.label} <b>${row.value}</b></li>`; }).join("")}</ul></article>
      </div>`;
    shell.prepend(dashboard);
    if (window.matchMedia("(min-width: 901px)").matches) {
      const topNav = document.querySelector(".sm-pos-app .sm-top-nav");
      topNav?.querySelector(".my-sales-period-filter")?.remove();
      const toolbarFilter = dashboard.querySelector(".my-sales-period-filter");
      if (topNav && toolbarFilter) topNav.insertBefore(toolbarFilter, topNav.querySelector(".my-sales-app-actions, .sm-user-chip"));
    }
    document.querySelectorAll(".my-sales-period-filter select, .my-sales-period-filter input").forEach(control => control.addEventListener("change", () => {
      const form = control.closest(".my-sales-period-filter");
      form.classList.add("loading");
      form.querySelectorAll("select, input").forEach(field => { field.disabled = true; });
      frappe.call({
        method: "store_management.api.get_dashboard_summary",
        args: {from_date: form.elements.from_date.value, to_date: form.elements.to_date.value, company: form.elements.company.value},
        callback(response) { if (response.message) enhanceDesktopDashboard({summary: response.message}); },
        error(error) {
          form.classList.remove("loading");
          form.querySelectorAll("select, input").forEach(field => { field.disabled = false; });
          showStatus("Could not load dashboard data for that period.", "offline");
          console.error("Unable to filter My Sales dashboard", error);
        }
      });
    }));

    const hasDashboardData = Number(summary.today_bills || 0) > 0
      || Number(summary.month_sales || 0) > 0
      || (summary.trend || []).some(row => Number(row.total || 0) > 0);
    if (!providedBootstrap && !hasDashboardData && window.frappe?.call) {
      frappe.call({
        method: "store_management.api.get_pos_bootstrap",
        callback(response) {
          if (response.message) enhanceDesktopDashboard(response.message);
        },
        error(error) {
          console.error("Unable to refresh My Sales dashboard", error);
        }
      });
    }
  }

  function syncDesktopPosView() {
    if (!document.querySelector(".sm-pos-app")) return;
    const billing = location.hash === "#billing-panel";
    document.documentElement.classList.toggle("my-sales-desktop-billing", billing);
    document.documentElement.classList.toggle("my-sales-mobile-billing", billing);
  }

  function arrangeDesktopBilling() {
    const workspace = document.querySelector(".sm-pos-workspace");
    const bill = document.querySelector(".sm-current-bill");
    if (workspace && bill && !workspace.contains(bill)) workspace.appendChild(bill);
  }

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    installPrompt = event;
    const button = document.querySelector(".my-sales-install");
    if (button) button.hidden = false;
  });

  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    document.querySelector(".my-sales-install")?.setAttribute("hidden", "");
    showStatus(`${APP_NAME} installed`, "online");
  });

  window.addEventListener("online", updateConnection);
  window.addEventListener("offline", updateConnection);

  window.addEventListener("DOMContentLoaded", async () => {
	if (await refreshInstalledAppCache()) {
		location.replace(`${location.pathname}${location.search}${location.search ? "&" : "?"}ui=${MOBILE_UI_VERSION}${location.hash}`);
		return;
	}
    buildMobileNavigation();
    setupChartTooltips();
    buildMobileDrawer();
    addAppActions();
    enhancePosHome();
    enhanceMasters();
    buildDesktopShell();
	refreshReportNavigation();
	addBackButton();
    enhanceDesktopDashboard();
    arrangeDesktopBilling();
    syncDesktopPosView();
    document.documentElement.classList.toggle("my-sales-offline", !navigator.onLine);
    watchInterfaceTranslations();
  });
  window.addEventListener("hashchange", () => {
    syncDesktopPosView();
    buildMobileNavigation();
  });

  if ("serviceWorker" in navigator && window.isSecureContext) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/my-sales-sw.js?v=18", { scope: "/" }).catch(error => {
        console.warn("My Sales offline support could not be enabled", error);
      });
    });
  }
})();
