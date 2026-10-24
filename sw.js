/* Pick Verify offline cache: app files network-first, AI reader files cache-first */
var CACHE = 'pickverify-web-v1';
var CORE = ['./', 'index.html', 'app.js', 'engine.js', 'web-native.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png',
  'lib/tesseract.min.js', 'lib/worker.min.js', 'lib/zxing.min.js'];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(CORE); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;      // Google Sheet calls go straight to network
  if (u.pathname.indexOf('/lib/') !== -1) {
    e.respondWith(caches.match(e.request).then(function (hit) {
      return hit || fetch(e.request).then(function (r) { var cp = r.clone(); caches.open(CACHE).then(function (c) { c.put(e.request, cp); }); return r; });
    }));
    return;
  }
  e.respondWith(fetch(e.request).then(function (r) {
    var cp = r.clone(); caches.open(CACHE).then(function (c) { c.put(e.request, cp); }); return r;
  }).catch(function () { return caches.match(e.request).then(function (hit) { return hit || caches.match('index.html'); }); }));
});
