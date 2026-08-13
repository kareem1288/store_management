(function () {
  "use strict";
  document.documentElement.classList.add("my-sales-app");

  const APP_NAME = "My Sales";
  let installPrompt = null;

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
      <a class="my-sales-logout" href="/api/method/logout" aria-label="Log out of ${APP_NAME}">Log out</a>
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
    const page = location.pathname.includes("masters") ? "masters" : location.pathname.includes("reports") ? "reports" : "home";
    nav.innerHTML = `
      <a href="/pos" class="sm-nav-link ${page === "home" ? "active" : ""}">${icons.home}<span>Home</span></a>
      <a href="/masters" class="sm-nav-link ${page === "masters" ? "active" : ""}">${icons.masters}<span>Masters</span></a>
      <a href="/pos#billing-panel" class="sm-nav-link sm-nav-pos">${icons.pos}<span>POS</span></a>
      <a href="/reports" class="sm-nav-link ${page === "reports" ? "active" : ""}">${icons.reports}<span>Reports</span></a>
      <button type="button" class="sm-nav-link sm-nav-more" aria-label="More options">${icons.more}<span>More</span></button>
    `;
    nav.querySelector(".sm-nav-more").addEventListener("click", () => {
      const actions = document.querySelector(".my-sales-app-actions");
      actions?.classList.toggle("open");
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
        <a href="/masters" data-label="Customers"><span>☷</span>Customers</a>
        <a href="/masters" data-label="Items"><span>◇</span>Items</a>
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
    if (!sidebar || !shell || shell.querySelector(".my-sales-master-heading")) return;

    const heading = document.createElement("header");
    heading.className = "my-sales-master-heading";
    heading.innerHTML = `<div><h1>Masters</h1><p>Manage your master data</p></div><span aria-hidden="true">⌕</span>`;
    shell.prepend(heading);

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

  window.addEventListener("DOMContentLoaded", () => {
    buildMobileNavigation();
    addAppActions();
    enhancePosHome();
    enhanceMasters();
    document.documentElement.classList.toggle("my-sales-offline", !navigator.onLine);
  });

  if ("serviceWorker" in navigator && window.isSecureContext) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/my-sales-sw.js", { scope: "/" }).catch(error => {
        console.warn("My Sales offline support could not be enabled", error);
      });
    });
  }
})();
