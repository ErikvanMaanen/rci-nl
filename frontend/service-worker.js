self.addEventListener('install', event => {
  event.waitUntil(
    caches.open('ribs-cache').then(cache => cache.addAll([
      './',
      'index.html',
      'device.html',
      'style.css',
      'main.js',
      'device.js',
      'manifest.json',
      'i18n.js',
      'lang/en.json',
      'lang/nl.json'
    ]))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});
