// Minimal service worker for ASCIICKER XPEdit PWA shell (Tier C)
// Cache-first for static assets, network-first for API requests.

var CACHE_NAME = 'xpedit-v1';

var STATIC_ASSETS = [
  '/workbench.html',
  '/styles.css',
  '/workbench.js',
  '/workbench-template-gating.js',
  '/whole-sheet-init.js',
  '/persistence.mjs',
  '/touch-gestures.mjs',
  '/manifest.json',
  '/rexpaint-editor/canvas.js',
  '/rexpaint-editor/cp437-font.js',
  '/rexpaint-editor/editor-app.js',
  '/rexpaint-editor/glyph-picker.js',
  '/rexpaint-editor/keyboard-handler.js',
  '/rexpaint-editor/layer-stack.js',
  '/rexpaint-editor/palette.js',
  '/rexpaint-editor/styles.css',
  '/rexpaint-editor/undo-stack.js',
  '/rexpaint-editor/xp-file-reader.js',
  '/rexpaint-editor/xp-file-writer.js'
];

// Install: pre-cache core static assets
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(STATIC_ASSETS);
    })
  );
});

// Activate: clean up old caches
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.filter(function(name) {
          return name !== CACHE_NAME;
        }).map(function(name) {
          return caches.delete(name);
        })
      );
    })
  );
});

// Fetch: network-first for API, cache-first for same-origin static assets
self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  // Network-first for API requests
  if (url.pathname.indexOf('/api/') === 0) {
    event.respondWith(
      fetch(event.request).catch(function() {
        return caches.match(event.request);
      })
    );
    return;
  }

  // Skip cross-origin requests
  if (url.origin !== self.location.origin) {
    return;
  }

  // Cache-first for same-origin static assets
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      return cached || fetch(event.request).then(function(response) {
        // Cache successful GET responses for future offline use
        if (response.ok && event.request.method === 'GET') {
          var responseClone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      });
    })
  );
});
