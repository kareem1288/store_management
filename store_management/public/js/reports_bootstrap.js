(function () {
  "use strict";

  function start() {
    if (typeof window.initializeReportsPage === "function") {
      window.initializeReportsPage();
      return;
    }

    const existing = document.querySelector('script[data-my-sales-report-engine]');
    if (existing) return;
    const script = document.createElement("script");
	script.src = "/assets/store_management/js/reports.js?v=20260820-8";
    script.defer = true;
    script.dataset.mySalesReportEngine = "1";
    script.onload = () => window.initializeReportsPage?.();
    script.onerror = () => {
      const status = document.getElementById("sales-register-status");
      if (status) status.textContent = "Unable to download the report controls. Check the connection and refresh.";
    };
    document.head.appendChild(script);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
