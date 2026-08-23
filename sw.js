// ============================================================
// Service Worker — Foodi-Foodou
//
// IMPORTANT : CACHE_VERSION doit être identique à APP_VERSION
// dans js/version.js. Incrémenter les DEUX à chaque mise à jour
// publiée : c'est ce qui force la mise à jour du cache et donc
// la mise à jour de l'app installée sur le téléphone.
// ============================================================
const CACHE_VERSION = "1.6.2";
const CACHE_NAME = `foodifoodou-cache-v${CACHE_VERSION}`;

// Les chemins ci-dessous sont relatifs à la position de ce fichier,
// ce qui permet de fonctionner aussi bien à la racine d'un domaine
// que dans un sous-dossier (ex: https://user.github.io/mon-repo/).
const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./js/app.js",
  "./js/router.js",
  "./js/db.js",
  "./js/ui.js",
  "./js/icons.js",
  "./js/version.js",
  "./js/gdrive.js",
  "./js/pages/home.js",
  "./js/pages/week.js",
  "./js/pages/recipes.js",
  "./js/pages/recipe-detail.js",
  "./js/pages/recipe-edit.js",
  "./js/pages/settings.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-192.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./fonts/Caveat-Bold.woff2",
  "./fonts/Caveat-SemiBold.woff2",
  "./fonts/PatrickHand-Regular.woff2",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.filter((n) => (n.startsWith("foodifoodou-cache-") || n.startsWith("moncarnet-cache-")) && n !== CACHE_NAME).map((n) => caches.delete(n))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // On ne gère/cache que les requêtes vers notre propre origine et notre app
  // (les appels réseau ponctuels vers des sites tiers — import de recette,
  // transcription vidéo — passent directement par le réseau, sans cache).
  if (url.origin !== self.location.origin) {
    return; // laisse le navigateur gérer normalement
  }

  if (req.method !== "GET") return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) {
        // Cache d'abord (garantie offline), avec rafraîchissement silencieux en tâche de fond.
        fetch(req)
          .then((fresh) => {
            if (fresh && fresh.ok) caches.open(CACHE_NAME).then((c) => c.put(req, fresh));
          })
          .catch(() => {});
        return cached;
      }
      return fetch(req)
        .then((fresh) => {
          if (fresh && fresh.ok) {
            const clone = fresh.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, clone));
          }
          return fresh;
        })
        .catch(() => {
          // Hors ligne et pas en cache : pour une navigation, on retombe sur l'app shell.
          if (req.mode === "navigate") return caches.match("./index.html");
          return caches.match(req);
        });
    })
  );
});
