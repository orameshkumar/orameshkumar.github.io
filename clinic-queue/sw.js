const CACHE_NAME = "clinic-queue-v62";
const SHELL_FILES = [
  "./index.html", "./reception.html", "./doctor.html", "./board.html",
  "./self-service.html", "./admin.html", "./patients.html", "./billing.html",
  "./patient-card.html", "./backup.html",
  "./css/styles.css", "./css/board.css", "./manifest.json",
  "./assets/icon.svg", "./assets/icon-192.png", "./assets/icon-512.png",
  "./assets/self-service-qr.svg", "./js/qrcode-lib.js", "./js/barcode-scanner.js",
  "./js/theme.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
});

// Network-first for everything: this app's whole purpose is live data,
// so we should never silently serve a stale cached page while online.
// Cache is purely a fallback for the app shell when offline.
self.addEventListener("fetch", (event) => {
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
