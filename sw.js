/* Learners Track — trabajador de servicio.
 *
 * Para que la plataforma abra aunque el colegio se quede sin internet: se
 * guarda una copia de la pagina y de las librerias, y se sirve esa copia
 * cuando la red no responde. Los datos no dependen de esto: ya viven en el
 * dispositivo, y Firestore se encarga de subir lo pendiente al volver la senal.
 */
const VERSION = 'learners-track-v1';

// Lo minimo para que la aplicacion arranque sin red.
const BASE = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable.png'
];

// Librerias externas. Van con version fija, asi que una vez guardadas no
// cambian; si alguna no se deja guardar, no se cae la instalacion entera.
const LIBRERIAS = [
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.28/jspdf.plugin.autotable.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://www.gstatic.com/firebasejs/12.16.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore-compat.js'
];

// Lo que NUNCA se guarda: son conversaciones con el servidor, no archivos.
// Ojo con fonts.googleapis.com, que sí es un archivo y sí queremos guardarlo.
function esTraficoDeServidor(url){
  const h = url.hostname;
  if (h === 'fonts.googleapis.com' || h === 'fonts.gstatic.com') return false;
  return h.endsWith('googleapis.com')
      || h.endsWith('firebaseio.com')
      || h.endsWith('google-analytics.com')
      || h.endsWith('googletagmanager.com')
      || h.endsWith('firebaseinstallations.googleapis.com');
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(BASE).catch(err => console.warn('[sw] base', err));
    await Promise.all(LIBRERIAS.map(u => cache.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const claves = await caches.keys();
    await Promise.all(claves.filter(k => k !== VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data === 'saltar-espera') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  if (esTraficoDeServidor(url)) return;

  // La pagina: primero la red, para que una version nueva llegue sola en
  // cuanto haya senal; si no hay, se abre la copia guardada.
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        const cache = await caches.open(VERSION);
        cache.put('./index.html', res.clone());
        return res;
      } catch (err) {
        const cache = await caches.open(VERSION);
        return (await cache.match('./index.html'))
            || (await cache.match('./'))
            || new Response('Sin conexión', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }
    })());
    return;
  }

  // Librerias, iconos y tipografias: primero lo guardado, que no cambia.
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const guardado = await cache.match(req);
    if (guardado) return guardado;
    try {
      const res = await fetch(req);
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
      return res;
    } catch (err) {
      return new Response('', { status: 504 });
    }
  })());
});
