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
    addAppActions();
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
