// Ninebeat Studio - Service Worker.
//
// Wird bei jedem `vite build` aus dieser Vorlage neu geschrieben
// (ninebeatServiceWorkerPlugin in vite.config.ts ersetzt die beiden
// Platzhalter fuer Cache-Name und Precache-Liste weiter unten und legt das
// Ergebnis als dist/service-worker.js ab) - diese Datei selbst wird nie
// ausgeliefert, bearbeitet wird stattdessen diese Vorlage hier.
//
// Strategie: App-Shell + WASM-Engine-Dateien werden beim Installieren vorab
// gecacht und danach cache-first (mit Hintergrund-Update) ausgeliefert.
// Alles andere laeuft network-first mit Cache-Fallback fuer Offline-Betrieb.
// Der Cache-Name traegt einen Build-Hash aus dem tatsaechlichen Byteinhalt
// aller vorab gecachten Dateien - jede neue Version raeumt beim Aktivieren
// alle aelteren "ninebeat-shell-*"-Caches weg, damit Alt-Cache und neues
// Bundle nie auseinanderlaufen (siehe react-app/CLAUDE.md, Abschnitt 8.2 -
// genau diese Fehlerklasse hat dort schon einmal die Drum-Machine verstummen
// lassen).

const CACHE_NAME = 'ninebeat-shell-v6ba6d8c80e37';
const PRECACHE_URLS = [
  "./index.html",
  "./manifest.json",
  "./icon.svg",
  "./icon-512.png",
  "./icon-1024.png",
  "./ninebeat_web_engine.js",
  "./ninebeat_web_engine.wasm",
  "./ninebeat-processor.js",
  "./capture-tap-processor.js",
  "./environment-shim.js",
  "./assets/index-BYncYYsM.css",
  "./assets/index-qJT5zTI4.js",
  "./assets/NinebeatView-DuBA7psG.js",
  "./assets/AcidLine3View-CRPzf8P8.js",
  "./assets/clipboard-check-CObK0rlk.js",
  "./assets/SamplerView-DHLbL-XC.js",
  "./assets/repeat-DRnJubWU.js",
  "./assets/copy-BBTiU4D4.js",
  "./assets/Poly6View-DwMFpPMz.js",
  "./assets/funnel-DL2qKZWC.js",
  "./assets/InstrumentRecButton-D0ASc16E.js",
  "./assets/music-CxB4z-s8.js",
  "./assets/PadRecordingModal-CXuwqH2Y.js",
  "./assets/StudioMixer-Bow2dm2K.js",
  "./assets/disc-3-BxBMh731.js",
  "./assets/flame-DI6YsPwo.js",
  "./assets/CRTView-Drp7NeFv.js",
  "./assets/zoom-in-CLJOttMS.js",
  "./assets/layers-CT9ez0eD.js",
  "./assets/useTabKeys-DmlSckh_.js",
  "./assets/ElementsBackground-Dy9WDjna.js"
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names
          .filter((name) => name.startsWith('ninebeat-shell-') && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Nur GET, nur same-origin - alles andere (POST, cross-origin) unveraendert
  // durchlassen. Ein Service Worker, der fremde oder schreibende Requests
  // anfasst, ist ein haeufiger Grund fuer schwer reproduzierbare Fehler.
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  // Navigationsanfragen (Adressleiste, Neuladen, Store-Start) zeigen fast nie
  // woertlich auf "index.html" - diese Single-Page-App hat aber nur eine
  // Shell-Seite. Offline muss trotzdem genau die vorab gecachte index.html
  // antworten, sonst bliebe der Start beim geringsten Netzausfall dunkel.
  // Der Entwicklungs-/Vorschau-Server schickt "Vary: Origin" auf allen
  // Antworten; ein "crossorigin"-Skript-/Style-Tag loest dadurch eine
  // Anfrage aus, deren Vary-relevante Kopfzeilen nicht mehr zu der beim
  // Installieren gecachten Antwort passen - eine wortgleiche URL faellt an
  // dieser Stelle sonst trotzdem durch den Cache-Treffer (gemessen: der
  // Offline-Nachweis in [29] scheiterte genau daran, bis `ignoreVary` hier
  // stand). Fuer eine bewusst vorab gecachte, bekannte Fassung ist das
  // exakt das gewuenschte Verhalten - Vary dient hier keinem Zweck.
  const matchOptions = { ignoreVary: true };

  if (request.mode === 'navigate') {
    const shellUrl = new URL('./index.html', self.location).toString();
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            caches.open(CACHE_NAME).then((cache) => cache.put(shellUrl, response.clone()));
          }
          return response;
        })
        .catch(() => caches.match(shellUrl, matchOptions))
    );
    return;
  }

  event.respondWith(
    caches.match(request, matchOptions).then((cached) => {
      if (cached) {
        // App-Shell/WASM-Treffer: sofort aus dem Cache antworten, im
        // Hintergrund auffrischen (bewusst nicht awaited - der Nutzer
        // bekommt den Cache-Treffer ohne Wartezeit).
        event.waitUntil(
          fetch(request)
            .then((response) => {
              if (response && response.ok) {
                return caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
              }
            })
            .catch(() => {
              // Kein Netz: der bereits ausgelieferte Cache-Treffer bleibt gueltig.
            })
        );
        return cached;
      }

      // Alles Uebrige: network-first, mit Cache-Fallback fuer Offline-Betrieb.
      return fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request, matchOptions));
    })
  );
});
