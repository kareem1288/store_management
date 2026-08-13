const CACHE_NAME = "my-sales-shell-v1";
const APP_SHELL = [
  "/offline",
  "/assets/store_management/css/store_management_ui.css",
  "/assets/store_management/css/my_sales_mobile.css",
  "/assets/store_management/js/my_sales_mobile.js",
  "/assets/store_management/images/my-sales-icon-192.png",
  "/assets/store_management/images/my-sales-icon-512.png",
  "/assets/store_management/images/my-sales-icon.svg",
  "/assets/store_management/my-sales.webmanifest"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
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
      caches.match(request).then(cached => cached || fetch(request).then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        return response;
      }))
    );
  }
});
