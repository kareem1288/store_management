(function () {
  "use strict";

  function startReports() {
    const status = document.getElementById("sales-register-status");
    if (!status) return;
    if (typeof window.initializeReportsPage === "function") {
      window.initializeReportsPage();
      return;
    }
    status.textContent = "The report controls could not load. Refresh the page to try again.";
    status.dataset.state = "error";
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startReports, { once: true });
  } else {
    startReports();
  }
})();
