const CACHE = 'sincerao-pwa-v22';
const APP_SHELL = [
  '/', '/index.html', '/manifest.webmanifest', '/supabase-config.js',
  '/css/base.css', '/css/login.css', '/css/dashboard.css', '/css/perfil.css', '/css/avaliacao.css', '/css/admin.css', '/css/responsive.css',
  '/js/core/constants.js', '/js/core/supabase-client.js', '/js/core/state.js', '/js/core/utils.js',
  '/js/dashboard/dashboard-module.js', '/js/gestao/gestao-module.js', '/js/perfil/perfil-module.js',
  '/js/avaliacao/avaliacao-core.js', '/js/avaliacao/etapa-texto.js', '/js/avaliacao/etapa-competencias.js?v=13', '/js/avaliacao/etapa-plano.js?v=15', '/js/avaliacao/etapa-parecer.js',
  '/js/admin/cargos-module.js', '/js/admin/setores-module.js', '/js/admin/competencias-module.js', '/js/admin/vinculo-module.js', '/js/admin/ciclos-module.js', '/js/admin/colaboradores-module.js', '/js/admin/auditoria-module.js', '/js/admin/admin-shell.js', '/js/auth/auth-module.js',
  '/assets/logo-b.png', '/assets/icon-192.png', '/assets/favicon-32.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || request.url.includes('/rest/v1/') || request.url.includes('/functions/v1/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/index.html')));
    return;
  }
  event.respondWith(caches.match(request, { ignoreSearch: true }).then((cached) => cached || fetch(request).then((response) => {
    if (new URL(request.url).origin === self.location.origin && response.ok) {
      const copy = response.clone(); caches.open(CACHE).then((cache) => cache.put(request, copy));
    }
    return response;
  })));
});
