/*
 * SERVICE WORKER — Buona Lettura
 * ═══════════════════════════════════════════════════════════════
 *
 * Strategia adottata: Cache-First con fallback di rete
 * ─────────────────────────────────────────────────────
 * Per i file statici (HTML, CSS, JS, font, icone):
 *   → si serve prima dalla cache; se non trovato, si scarica dalla rete
 *     e si salva in cache per la prossima volta.
 *
 * Per le richieste API esterne (Open Library, Google Fonts):
 *   → si tenta prima la rete; se offline, si serve dalla cache.
 *     Se nemmeno la cache ha una risposta, si restituisce un errore pulito.
 *
 * Perché questa scelta:
 *   L'app è offline-first per definizione (PWA su Windows).
 *   I dati dell'utente (libri, voti, statistiche) vivono in IndexedDB
 *   e non passano dal service worker — sono sempre disponibili offline.
 *   Solo le copertine e i suggerimenti richiedono rete.
 *
 * ═══════════════════════════════════════════════════════════════
 */

/* ── VERSIONE CACHE ─────────────────────────────────────────────
   Incrementare VERSIONE_CACHE ad ogni deploy per forzare
   il rinnovo della cache sui client già installati.
   Formato: 'bl-v{major}.{minor}.{patch}'
─────────────────────────────────────────────────────────────── */
const VERSIONE_CACHE        = 'bl-v1.5.0';
const VERSIONE_CACHE_API    = 'bl-api-v1.5.0';

/* ── FILE DA PRECARICARE ALL'INSTALLAZIONE ─────────────────────
   Questi file vengono scaricati e messi in cache durante l'evento
   'install', prima che il service worker diventi attivo.
   Se anche uno solo fallisce, l'installazione viene annullata.
─────────────────────────────────────────────────────────────── */
const FILE_STATICI = [
  './',
  './index.html',
  './app.html',
  './manifest.json',
  './css/style.css',
  './js/db.js',
  './js/app.js',
  './js/stats.js',
  './js/covers.js',
  './js/sync.js',
  './assets/icons/icon-192.svg',
  './assets/icons/icon-512.svg',
];

/* URL base GitHub Pages — usato per confronti nei path */
const BASE_URL = 'https://pablobongo.github.io/buona-lettura';

/* File dell'app — usa Network-First durante sviluppo
   così le modifiche sono sempre visibili senza svuotare la cache */
const FILE_APP = [
  './app.html',
  './index.html',
  './css/style.css',
  './js/db.js',
  './js/app.js',
  './js/stats.js',
  './js/covers.js',
  './js/sync.js',
];

/* ── DOMINI ESTERNI DA GESTIRE CON STRATEGIA RETE-FIRST ────────
   Font Google, CDN icone, API Open Library.
   Per questi la rete ha la priorità; la cache è solo il fallback.
─────────────────────────────────────────────────────────────── */
const DOMINI_RETE_FIRST = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdn.jsdelivr.net',
  'openlibrary.org',
  'covers.openlibrary.org',
  'api.anthropic.com',
  'supabase.co',
  'uhrmszvobguyienburta.supabase.co',
];

/* ═══════════════════════════════════════════════════════════════
   EVENTO: INSTALL
   Eseguito una volta sola quando il service worker viene installato.
   Precaricare i file statici in cache.
═══════════════════════════════════════════════════════════════ */
self.addEventListener('install', (evento) => {
  console.log('[BL Service Worker] Installazione — versione:', VERSIONE_CACHE);

  evento.waitUntil(
    caches.open(VERSIONE_CACHE).then((cache) => {
      console.log('[BL Service Worker] Precaricamento file statici in cache…');
      return cache.addAll(FILE_STATICI);
    }).then(() => {
      /*
       * skipWaiting() forza l'attivazione immediata del nuovo service worker
       * senza aspettare la chiusura di tutte le tab aperte.
       * Utile per aggiornamenti rapidi durante lo sviluppo.
       */
      return self.skipWaiting();
    }).catch((errore) => {
      console.error('[BL Service Worker] Errore durante il precaricamento:', errore);
    })
  );
});

/* ═══════════════════════════════════════════════════════════════
   EVENTO: ACTIVATE
   Eseguito quando il service worker diventa attivo.
   Pulisce le vecchie versioni della cache.
═══════════════════════════════════════════════════════════════ */
self.addEventListener('activate', (evento) => {
  console.log('[BL Service Worker] Attivazione — pulizia cache obsolete…');

  evento.waitUntil(
    caches.keys().then((nomiCache) => {
      return Promise.all(
        nomiCache
          /* Conserva solo le cache della versione corrente */
          .filter(nome => nome !== VERSIONE_CACHE && nome !== VERSIONE_CACHE_API)
          .map(nomeVecchio => {
            console.log('[BL Service Worker] Eliminazione cache obsoleta:', nomeVecchio);
            return caches.delete(nomeVecchio);
          })
      );
    }).then(() => {
      /*
       * clients.claim() fa sì che il service worker attivato prenda
       * il controllo immediato di tutte le tab aperte, senza ricaricare.
       */
      return self.clients.claim();
    })
  );
});

/* ═══════════════════════════════════════════════════════════════
   EVENTO: FETCH
   Intercetta ogni richiesta di rete e decide come rispondere.
═══════════════════════════════════════════════════════════════ */
self.addEventListener('fetch', (evento) => {
  const url = new URL(evento.request.url);

  /* Ignora richieste non-GET (POST, PUT, ecc.) — non cacheabili */
  if (evento.request.method !== 'GET') return;

  /* Ignora richieste chrome-extension o altre non-http */
  if (!url.protocol.startsWith('http')) return;

  /* File dell'app: Network-First (aggiornamenti immediati) */
  const pathRelativo = url.pathname;
  const eFileApp = FILE_APP.some(function(f) {
    return pathRelativo.endsWith(f.replace('./', '/')) ||
           pathRelativo === '/' ||
           pathRelativo.endsWith('/app.html') ||
           pathRelativo.endsWith('/index.html');
  });

  if (DOMINI_RETE_FIRST.some(dominio => url.hostname.includes(dominio))) {
    evento.respondWith(strategiaReteFirst(evento.request));
  } else if (eFileApp) {
    /* Network-First per HTML e JS dell'app */
    evento.respondWith(strategiaReteFirst(evento.request));
  } else {
    evento.respondWith(strategiaCacheFirst(evento.request));
  }
});

/* ═══════════════════════════════════════════════════════════════
   STRATEGIA: CACHE-FIRST
   Per file statici dell'app (HTML, CSS, JS, icone).
   1. Cerca in cache
   2. Se trovato → restituisce la risposta dalla cache
   3. Se non trovato → scarica dalla rete, salva in cache, restituisce
═══════════════════════════════════════════════════════════════ */
async function strategiaCacheFirst(richiesta) {
  try {
    /* Cerca in cache */
    const rispostaCached = await caches.match(richiesta);
    if (rispostaCached) {
      return rispostaCached;
    }

    /* Non trovato in cache — scarica dalla rete */
    const rispostaRete = await fetch(richiesta);

    /* Salva in cache solo risposte valide (status 200) */
    if (rispostaRete && rispostaRete.status === 200) {
      const cache = await caches.open(VERSIONE_CACHE);
      /* clone() è obbligatorio — la risposta può essere letta una sola volta */
      cache.put(richiesta, rispostaRete.clone());
    }

    return rispostaRete;

  } catch (errore) {
    /* Offline e non in cache — restituisci la pagina offline se esiste */
    console.warn('[BL Service Worker] Risorsa non disponibile:', richiesta.url);
    const paginaOffline = await caches.match('./index.html');
    return paginaOffline || new Response(
      '<h1 style="font-family:serif;text-align:center;padding:40px;color:#EDE8DC;background:#1A1A2E;min-height:100vh;margin:0;">Offline — riapri l\'app quando sei connesso.</h1>',
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
}

/* ═══════════════════════════════════════════════════════════════
   STRATEGIA: RETE-FIRST
   Per API esterne e font (Open Library, Google Fonts, CDN).
   1. Tenta la rete
   2. Se riuscito → salva in cache, restituisce
   3. Se offline → cerca in cache
   4. Se non in cache → restituisce risposta di errore pulita
═══════════════════════════════════════════════════════════════ */
async function strategiaReteFirst(richiesta) {
  try {
    /* Tenta la rete con timeout di 5 secondi */
    const rispostaRete = await Promise.race([
      fetch(richiesta),
      new Promise((_, rifiuta) =>
        setTimeout(() => rifiuta(new Error('Timeout')), 5000)
      )
    ]);

    /* Salva in cache API solo risposte valide */
    if (rispostaRete && rispostaRete.status === 200) {
      const cache = await caches.open(VERSIONE_CACHE_API);
      cache.put(richiesta, rispostaRete.clone());
    }

    return rispostaRete;

  } catch (errore) {
    /* Rete non disponibile — cerca in cache API */
    const rispostaCached = await caches.match(richiesta, { cacheName: VERSIONE_CACHE_API });
    if (rispostaCached) {
      console.log('[BL Service Worker] Serve da cache API (offline):', richiesta.url);
      return rispostaCached;
    }

    /* Nemmeno la cache ha una risposta — errore pulito in JSON */
    return new Response(
      JSON.stringify({
        errore: true,
        messaggio: 'Risorsa non disponibile offline.',
        url: richiesta.url
      }),
      {
        status: 503,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'X-BL-Offline': 'true'
        }
      }
    );
  }
}

/* ═══════════════════════════════════════════════════════════════
   EVENTO: MESSAGE
   Canale di comunicazione tra l'app e il service worker.
   Permette all'app di:
   - Forzare un aggiornamento immediato della cache
   - Chiedere la versione corrente
   - Invalidare risorse specifiche
═══════════════════════════════════════════════════════════════ */
self.addEventListener('message', (evento) => {
  const { tipo, dati } = evento.data || {};

  switch (tipo) {

    /* L'app chiede di aggiornare subito alla nuova versione */
    case 'FORZA_AGGIORNAMENTO':
      self.skipWaiting();
      break;

    /* L'app chiede quale versione è in esecuzione */
    case 'CHIEDI_VERSIONE':
      evento.source.postMessage({
        tipo: 'RISPOSTA_VERSIONE',
        versione: VERSIONE_CACHE
      });
      break;

    /* L'app chiede di svuotare la cache (es. dopo reset dati) */
    case 'SVUOTA_CACHE_API':
      caches.delete(VERSIONE_CACHE_API).then(() => {
        evento.source.postMessage({ tipo: 'CACHE_API_SVUOTATA' });
      });
      break;

    /* L'app segnala che un file è stato aggiornato — elimina dalla cache */
    case 'INVALIDA_RISORSA':
      if (dati?.url) {
        caches.open(VERSIONE_CACHE).then(cache => cache.delete(dati.url));
      }
      break;

    default:
      console.log('[BL Service Worker] Messaggio non riconosciuto:', tipo);
  }
});

/* ═══════════════════════════════════════════════════════════════
   EVENTO: NOTIFICATIONCLICK
   Gestione click sulle notifiche push (promemoria lettura).
   Apre l'app se non è già aperta, altrimenti porta in primo piano.
═══════════════════════════════════════════════════════════════ */
self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();

  evento.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((listaClient) => {
      /* Se l'app è già aperta, porta quella tab in primo piano */
      for (const client of listaClient) {
        if (client.url.includes('app.html') && 'focus' in client) {
          return client.focus();
        }
      }
      /* Altrimenti apri una nuova finestra */
      if (clients.openWindow) {
        return clients.openWindow('./app.html');
      }
    })
  );
});
