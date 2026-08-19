(function () {
  "use strict";
  document.documentElement.classList.add("my-sales-app");

  const APP_NAME = "My Sales";
  const MOBILE_UI_VERSION = "20260820-2";
  let installPrompt = null;

  async function refreshInstalledAppCache() {
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
      <a href="/pos" class="sm-nav-link ${page === "home" ? "active" : ""}">${icons.home}<span>Dashboard</span></a>
      <a href="/pos#billing-panel" class="sm-nav-link ${page === "pos" ? "active" : ""}">${icons.pos}<span>POS</span></a>
      <a href="/reports?type=sales" class="sm-nav-link ${page === "reports" ? "active" : ""}">${icons.reports}<span>Reports</span></a>
      <a href="/masters?doctype=Item" class="sm-nav-link ${page === "masters" ? "active" : ""}">${icons.masters}<span>Masters</span></a>
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
      <a class="my-sales-mobile-brand" href="/pos"><b>M</b><span><strong>My Sales</strong><small>Mobile Store</small></span></a>
      <nav>
        <a href="/pos" data-section="dashboard">${icons.home}<span>Dashboard</span></a>
        <details open><summary>${icons.pos}<span>POS</span></summary><div class="my-sales-mobile-submenu"><a href="/pos#billing-panel">New Sale</a><a href="/reports?type=open-bills">Open Bills</a><a href="/masters?doctype=Customer">Customers</a></div></details>
        <details open><summary>${icons.reports}<span>Reports</span></summary><div class="my-sales-mobile-submenu"><a href="/reports?type=sales">Sales Report</a><a href="/reports?type=items">Item Report</a><a href="/reports?type=customers">Customer Report</a><a href="/reports?type=sales#day-closing">Day Closing</a></div></details>
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
    };
    toggle.addEventListener("click", () => setOpen(true));
    overlay.addEventListener("click", () => setOpen(false));
    drawer.querySelectorAll("a").forEach(link => link.addEventListener("click", () => setOpen(false)));
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
      <a class="my-sales-desktop-brand" href="/pos"><b>M</b><span><strong>My Sales</strong><small>Mobile Store</small></span></a>
      <nav>
        <a href="/pos" class="${active === "dashboard" ? "active" : ""}">${icons.home}<span>Dashboard</span></a>
        <div class="my-sales-menu-group"><button type="button" class="my-sales-menu-toggle" aria-expanded="true">${icons.pos}<span>POS</span><b>⌄</b></button>
          <div class="my-sales-menu-items"><a href="/pos#billing-panel">New Sale</a><a href="/reports?type=open-bills" class="${requestedReport === "open-bills" ? "active" : ""}">Open Bills</a></div>
        </div>
        <div class="my-sales-menu-group"><button type="button" class="my-sales-menu-toggle" aria-expanded="true">${icons.reports}<span>Reports</span><b>⌄</b></button>
          <div class="my-sales-menu-items"><a href="/reports?type=sales" class="${requestedReport === "sales" ? "active" : ""}">Sales Report</a>
          <a href="/reports?type=items" class="${requestedReport === "items" ? "active" : ""}">Item Wise Sales</a></div>
        </div>
        <div class="my-sales-menu-group"><button type="button" class="my-sales-menu-toggle" aria-expanded="true">${icons.masters}<span>Masters</span><b>⌄</b></button>
          <div class="my-sales-menu-items"><a href="/masters?doctype=Item" class="${active === "masters" && requestedMaster === "Item" ? "active" : ""}">Items</a>
          <a href="/masters?doctype=Item%20Group" class="${requestedMaster === "Item Group" ? "active" : ""}">Item Groups</a><a href="/masters?doctype=Customer" class="${requestedMaster === "Customer" ? "active" : ""}">Customers</a>
          <a href="/masters?doctype=Customer%20Group" class="${requestedMaster === "Customer Group" ? "active" : ""}">Customer Groups</a><a href="/masters?doctype=Item%20Tax%20Template" class="${requestedMaster === "Item Tax Template" ? "active" : ""}">Tax Templates</a>
          <a href="/masters?doctype=Company" class="${requestedMaster === "Company" ? "active" : ""}">Companies</a><a href="/masters?doctype=User" class="${requestedMaster === "User" ? "active" : ""}">Users</a></div>
        </div>
      </nav>
      <a class="my-sales-desktop-logout" href="/logout">↪ <span>Logout</span></a>
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

  function currency(value) {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(value || 0));
  }

  function buildTrendSvg(rows) {
    const values = rows.map(row => Number(row.total || 0));
    const max = Math.max(...values, 1);
    const points = values.map((value, index) => `${24 + index * 86},${155 - value / max * 120}`).join(" ");
    const area = `24,155 ${points} ${24 + Math.max(values.length - 1, 0) * 86},155`;
    return `<svg viewBox="0 0 570 180" preserveAspectRatio="none" aria-label="Seven day sales trend"><defs><linearGradient id="sales-fill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#119653" stop-opacity=".28"/><stop offset="1" stop-color="#119653" stop-opacity="0"/></linearGradient></defs><path d="M24 155H548M24 95H548M24 35H548" stroke="#e7ece9"/><polygon points="${area}" fill="url(#sales-fill)"/><polyline points="${points}" fill="none" stroke="#078545" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>${values.map((value,index) => `<circle cx="${24 + index*86}" cy="${155-value/max*120}" r="5" fill="#078545"/>`).join("")}</svg>`;
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
    const categoryTotal = categories.reduce((sum,row) => sum + Number(row.value || 0), 0);
    let angle = 0;
    const segments = categories.map((row,index) => {
      const start = angle; angle += categoryTotal ? Number(row.value || 0) / categoryTotal * 360 : 0;
      return `${categoryColors[index % categoryColors.length]} ${start}deg ${angle}deg`;
    }).join(",");
    const recentRows = (summary.recent_bills || []).map(row => `<tr><td>${row.name}</td><td>${row.customer}</td><td>${Number(row.total_qty || 0)}</td><td><b>${currency(row.grand_total)}</b></td><td>${String(row.posting_time || "").slice(0,5)}</td></tr>`).join("");
    const topRows = (summary.top_items || []).map(row => `<tr><td>${row.item_name}</td><td>${Number(row.sold || 0)}</td><td><b>${currency(row.revenue)}</b></td></tr>`).join("");
    const dashboard = document.createElement("section");
    dashboard.className = "my-sales-dashboard";
    dashboard.innerHTML = `
      <header><div><h1>Dashboard</h1><p>Welcome to My Sales Mobile Store</p></div><time>${new Intl.DateTimeFormat("en-IN",{dateStyle:"medium",timeStyle:"short"}).format(new Date())}</time></header>
      <div class="my-sales-kpis">
        <article><i>${icons.pos}</i><span>Today Sales<strong>${currency(summary.today_sales)}</strong><small>${summary.today_bills || 0} bills</small></span></article>
        <article><i>☷</i><span>Today Customers<strong>${summary.today_customers || 0}</strong><small>New Customers</small></span></article>
        <article><i>◇</i><span>Today Items Sold<strong>${Number(summary.today_items_sold || 0)}</strong><small>Items</small></span></article>
        <article><i>↗</i><span>Total Sales (Month)<strong>${currency(summary.month_sales)}</strong><small>Current month</small></span></article>
      </div>
      <div class="my-sales-dashboard-grid">
        <article class="my-sales-dash-card my-sales-trend"><h2>Sales Trend</h2>${buildTrendSvg(trend)}<div>${trend.map(row => `<span>${new Date(row.date).toLocaleDateString("en-IN",{day:"numeric",month:"short"})}</span>`).join("")}</div></article>
        <article class="my-sales-dash-card my-sales-categories"><h2>Sales by Category</h2><div class="my-sales-donut" style="background:conic-gradient(${segments || "#e8eeea 0 360deg"})"><span>${currency(categoryTotal)}</span></div><ul>${categories.map((row,index) => `<li><i style="background:${categoryColors[index%categoryColors.length]}"></i><span>${row.label || "Other"}</span><b>${categoryTotal ? Math.round(Number(row.value || 0)/categoryTotal*100) : 0}%</b></li>`).join("") || "<li>No sales this month</li>"}</ul></article>
        <article class="my-sales-dash-card my-sales-table"><h2>Recent Sales <a href="/reports">View All →</a></h2><table><thead><tr><th>Bill No</th><th>Customer</th><th>Items</th><th>Amount</th><th>Time</th></tr></thead><tbody>${recentRows || '<tr><td colspan="5">No sales today</td></tr>'}</tbody></table></article>
        <article class="my-sales-dash-card my-sales-table"><h2>Top Products <a href="/reports">View All →</a></h2><table><thead><tr><th>Item</th><th>Sold</th><th>Revenue</th></tr></thead><tbody>${topRows || '<tr><td colspan="3">No sales this month</td></tr>'}</tbody></table></article>
      </div>`;
    shell.prepend(dashboard);

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
    buildMobileDrawer();
    addAppActions();
    enhancePosHome();
    enhanceMasters();
    buildDesktopShell();
	addBackButton();
    enhanceDesktopDashboard();
    arrangeDesktopBilling();
    syncDesktopPosView();
    document.documentElement.classList.toggle("my-sales-offline", !navigator.onLine);
  });
  window.addEventListener("hashchange", () => {
    syncDesktopPosView();
    buildMobileNavigation();
  });

  if ("serviceWorker" in navigator && window.isSecureContext) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/my-sales-sw.js?v=15", { scope: "/" }).catch(error => {
        console.warn("My Sales offline support could not be enabled", error);
      });
    });
  }
})();
