const CACHE_NAME = "my-sales-shell-v46";
const APP_SHELL = [
  "/offline",
  "/assets/store_management/css/my_sales_design.css?v=20261007-1",
  "/assets/store_management/css/store_management_ui.css?v=20260911-1",
  "/assets/store_management/css/my_sales_mobile.css?v=20261007-1",
  "/assets/store_management/js/my_sales_mobile.js?v=20261007-3",
  "/assets/store_management/js/reports.js?v=20260820-11",
  "/assets/store_management/js/reports_bootstrap.js?v=20260820-11",
  "/api/method/store_management.api.get_brand_asset?name=my-sales-icon-192.png",
  "/api/method/store_management.api.get_brand_asset?name=my-sales-icon-512.png",
  "/api/method/store_management.api.get_brand_asset?name=my-sales-icon.svg",
  "/assets/store_management/my-sales.webmanifest"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith("my-sales-shell-") && key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/offline")));
    return;
  }

  if (url.pathname.startsWith("/assets/store_management/")) {
    event.respondWith(
      fetch(request, { cache: "no-cache" }).then(response => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(request, copy)));
        }
        return response;
      }).catch(() => caches.match(request))
    );
  }
});
