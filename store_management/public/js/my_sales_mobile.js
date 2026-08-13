(function () {
  "use strict";
  document.documentElement.classList.add("my-sales-app");

  const section = location.pathname.includes("masters")
    ? "Masters"
    : location.pathname.includes("reports") ? "Reports" : "Billing";
  document.title = `${section} · My Sales`;

  const markStandalone = () => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
    document.documentElement.classList.toggle("my-sales-standalone", Boolean(standalone));
  };
  markStandalone();
  window.matchMedia("(display-mode: standalone)").addEventListener?.("change", markStandalone);
})();
