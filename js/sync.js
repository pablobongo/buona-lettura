/*
 * sync.js — Sincronizzazione automatica con Supabase
 * ═══════════════════════════════════════════════════════════════
 *
 * Strategia: last-write-wins basata su timestamp aggiornato_il.
 * Ogni modifica locale viene inviata a Supabase in background.
 * Supabase Realtime notifica gli altri dispositivi in tempo reale.
 *
 * Struttura tabella bl_sync:
 *   id            — chiave primaria (es. libro.id, 'impost_tema', 'genere_1')
 *   tipo          — 'libro' | 'impostazione' | 'genere'
 *   dati          — JSON del record completo
 *   aggiornato_il — timestamp ISO per last-write-wins
 *   deleted       — soft delete
 *
 * Dipende da: db.js
 * ═══════════════════════════════════════════════════════════════
 */

'use strict';

/* ── Configurazione Supabase ───────────────────────────────────── */
var SUPABASE_URL  = 'https://uhrmszvobguyienburta.supabase.co';
var SUPABASE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVocm1zenZvYmd1eWllbmJ1cnRhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0NTY1NDYsImV4cCI6MjA5NzAzMjU0Nn0.n8l9lGyAu_1LRAYCSJGdLt_TVXwTL-rA6IZp1zAAa84';
var TABELLA       = 'bl_sync';

/* ── Riferimento DB locale ─────────────────────────────────────── */
var _DBS = window.BuonaLetturaDB;

/* ── Stato sync ────────────────────────────────────────────────── */
var _syncAttivo      = false;
var _realtimeCanale  = null;
var _ultimoSync      = null;
var _inSync          = false;

/* ══════════════════════════════════════════════════════════════════
   INIZIALIZZAZIONE
══════════════════════════════════════════════════════════════════ */

/*
 * inizializzaSync()
 * Punto di ingresso. Chiamata da app.html dopo l'init del DB.
 * 1. Esegue sync iniziale (scarica tutto da Supabase)
 * 2. Avvia listener Realtime per aggiornamenti in tempo reale
 * 3. Intercetta le funzioni DB per pushare ogni modifica locale
 */
function inizializzaSync() {
  if (_syncAttivo) return;

  /* Verifica connessione prima di procedere */
  if (!navigator.onLine) {
    console.log('[BL Sync] Offline — sync disabilitato fino alla connessione.');
    window.addEventListener('online', function() {
      inizializzaSync();
    }, { once: true });
    return;
  }

  console.log('[BL Sync] Inizializzazione...');
  _syncAttivo = true;

  /* 1. Sync iniziale — scarica tutto da remoto */
  _syncIniziale().then(function() {
    /* 2. Avvia Realtime */
    _avviaRealtime();
    /* 3. Intercetta funzioni DB */
    _interceptaDB();
    /* Aggiorna UI */
    _aggiornaIndicatoreSyncUI('ok');
    console.log('[BL Sync] Attivo.');
  }).catch(function(e) {
    console.error('[BL Sync] Errore inizializzazione:', e);
    _aggiornaIndicatoreSyncUI('errore');
    _syncAttivo = false;
  });

  /* Riconnetti quando torna online */
  window.addEventListener('online', function() {
    if (!_syncAttivo) inizializzaSync();
    else _syncIniziale();
  });

  window.addEventListener('offline', function() {
    _aggiornaIndicatoreSyncUI('offline');
  });
}

/* ══════════════════════════════════════════════════════════════════
   SYNC INIZIALE — scarica tutto da Supabase e unisce con locale
══════════════════════════════════════════════════════════════════ */

function _syncIniziale() {
  if (_inSync) return Promise.resolve();
  _inSync = true;
  _aggiornaIndicatoreSyncUI('caricamento');

  return _fetchTutti().then(function(righeRemote) {
    if (!righeRemote || righeRemote.length === 0) {
      /* Nessun dato remoto — push tutto il locale su Supabase */
      return _pushTuttoLocale();
    }
    /* Unisce remoto + locale con last-write-wins */
    return _unisciConLocale(righeRemote);
  }).then(function() {
    _ultimoSync = new Date().toISOString();
    _inSync = false;
    _aggiornaIndicatoreSyncUI('ok');
  }).catch(function(e) {
    _inSync = false;
    _aggiornaIndicatoreSyncUI('errore');
    throw e;
  });
}

/* ── Fetch tutti i record da Supabase ─────────────────────────── */
function _fetchTutti() {
  return _supabaseFetch('GET', '?select=*&deleted=eq.false&order=aggiornato_il.desc')
    .then(function(r) { return r.ok ? r.json() : []; });
}

/* ── Unisce dati remoti con locali (last-write-wins) ─────────── */
function _unisciConLocale(righeRemote) {
  return Promise.all([
    _DBS.leggiTuttiLibri(),
    _DBS.leggiTutteImpostazioni(),
    _DBS.leggiGeneri(),
  ]).then(function(risultati) {
    var libriLocali   = risultati[0];
    var impostLocali  = risultati[1];
    var generiLocali  = risultati[2];

    var promesse = [];

    righeRemote.forEach(function(riga) {
      var datiRemoti = riga.dati;
      var tsRemoto   = new Date(riga.aggiornato_il).getTime();

      if (riga.tipo === 'libro') {
        var locale = libriLocali.find(function(l) { return l.id === riga.id; });
        if (!locale) {
          /* Libro nuovo da remoto — inserisci in locale */
          promesse.push(_DBS.aggiungiLibro(datiRemoti).catch(function(){}));
        } else {
          var tsLocale = new Date(locale.dataInserimento || 0).getTime();
          if (tsRemoto > tsLocale) {
            /* Remoto più recente — aggiorna locale */
            promesse.push(_DBS.aggiornaLibro(riga.id, datiRemoti).catch(function(){}));
          }
        }
      }

      if (riga.tipo === 'impostazione') {
        var chiave   = riga.id.replace('impost_', '');
        var valLocale = impostLocali[chiave];
        if (valLocale === undefined || tsRemoto > (_ultimoSync ? new Date(_ultimoSync).getTime() : 0)) {
          promesse.push(_DBS.scriviImpostazione(chiave, datiRemoti.valore).catch(function(){}));
        }
      }

      if (riga.tipo === 'genere') {
        var esisteLocale = generiLocali.find(function(g) {
          return g.nome === datiRemoti.nome;
        });
        if (!esisteLocale) {
          promesse.push(_DBS.aggiungiGenere(datiRemoti.nome).catch(function(){}));
        }
      }
    });

    /* Push record locali non presenti in remoto */
    var idRemoti = righeRemote.map(function(r) { return r.id; });

    libriLocali.forEach(function(l) {
      if (!idRemoti.includes(l.id)) {
        promesse.push(_pushRecord('libro', l.id, l));
      }
    });

    Object.keys(impostLocali).forEach(function(chiave) {
      if (!idRemoti.includes('impost_' + chiave)) {
        promesse.push(_pushRecord('impostazione', 'impost_' + chiave, { valore: impostLocali[chiave] }));
      }
    });

    generiLocali.forEach(function(g) {
      if (!idRemoti.includes('genere_' + g.id)) {
        promesse.push(_pushRecord('genere', 'genere_' + g.id, g));
      }
    });

    return Promise.all(promesse);
  }).then(function() {
    /* Ricarica UI dopo la sincronizzazione */
    if (typeof aggiornaHomeConDB === 'function') aggiornaHomeConDB();
    if (typeof disegnaScaffale  === 'function') disegnaScaffale();
  });
}

/* ── Push tutto il locale su Supabase (primo avvio) ─────────── */
function _pushTuttoLocale() {
  return Promise.all([
    _DBS.leggiTuttiLibri(),
    _DBS.leggiTutteImpostazioni(),
    _DBS.leggiGeneri(),
  ]).then(function(risultati) {
    var libri      = risultati[0];
    var impost     = risultati[1];
    var generi     = risultati[2];
    var promesse   = [];

    libri.forEach(function(l) {
      promesse.push(_pushRecord('libro', l.id, l));
    });

    Object.keys(impost).forEach(function(chiave) {
      promesse.push(_pushRecord('impostazione', 'impost_' + chiave, { valore: impost[chiave] }));
    });

    generi.forEach(function(g) {
      promesse.push(_pushRecord('genere', 'genere_' + g.id, g));
    });

    return Promise.all(promesse);
  });
}

/* ══════════════════════════════════════════════════════════════════
   PUSH SINGOLO RECORD — upsert su Supabase
══════════════════════════════════════════════════════════════════ */

function _pushRecord(tipo, id, dati) {
  var corpo = {
    id:            id,
    tipo:          tipo,
    dati:          dati,
    aggiornato_il: new Date().toISOString(),
    deleted:       false,
  };

  return _supabaseFetch('POST',
    '?on_conflict=id',
    corpo,
    { 'Prefer': 'resolution=merge-duplicates' }
  ).then(function(r) {
    if (!r.ok) {
      return r.text().then(function(t) {
        console.warn('[BL Sync] Push fallito per ' + id + ':', t);
      });
    }
  }).catch(function(e) {
    console.warn('[BL Sync] Errore push ' + id + ':', e.message);
  });
}

/* ══════════════════════════════════════════════════════════════════
   REALTIME — WebSocket Supabase per aggiornamenti istantanei
══════════════════════════════════════════════════════════════════ */

function _avviaRealtime() {
  /* Supabase Realtime via WebSocket */
  var wsUrl = SUPABASE_URL.replace('https://', 'wss://') +
              '/realtime/v1/websocket?apikey=' + SUPABASE_KEY + '&vsn=1.0.0';

  try {
    var ws = new WebSocket(wsUrl);
    _realtimeCanale = ws;

    ws.onopen = function() {
      /* Sottoscrivi alla tabella bl_sync */
      ws.send(JSON.stringify({
        topic:   'realtime:public:' + TABELLA,
        event:   'phx_join',
        payload: { config: { broadcast: { self: false }, presence: { key: '' } } },
        ref:     '1',
      }));
      console.log('[BL Sync] Realtime connesso.');
    };

    ws.onmessage = function(evento) {
      try {
        var msg = JSON.parse(evento.data);
        if (msg.event === 'INSERT' || msg.event === 'UPDATE') {
          _gestisciAggiornamentoRemoto(msg.payload.record);
        }
        if (msg.event === 'DELETE') {
          _gestisciEliminazioneRemota(msg.payload.old_record);
        }
      } catch(e) { /* ignora messaggi di sistema */ }
    };

    ws.onclose = function() {
      console.log('[BL Sync] Realtime disconnesso — riconnetto in 5s...');
      _realtimeCanale = null;
      setTimeout(_avviaRealtime, 5000);
    };

    ws.onerror = function() {
      ws.close();
    };

  } catch(e) {
    console.warn('[BL Sync] WebSocket non disponibile:', e.message);
    /* Fallback: polling ogni 60 secondi */
    setInterval(function() {
      if (navigator.onLine) _syncIniziale();
    }, 60000);
  }
}

/* Gestisce un record aggiornato arrivato da remoto */
function _gestisciAggiornamentoRemoto(riga) {
  if (!riga || !riga.dati) return;
  var dati = riga.dati;

  if (riga.tipo === 'libro') {
    _DBS.leggiLibro(riga.id).then(function(locale) {
      if (!locale) {
        _DBS.aggiungiLibro(dati).then(_ricaricaUI);
      } else {
        var tsRemoto = new Date(riga.aggiornato_il).getTime();
        var tsLocale = new Date(locale.dataInserimento || 0).getTime();
        if (tsRemoto > tsLocale) {
          _DBS.aggiornaLibro(riga.id, dati).then(_ricaricaUI);
        }
      }
    });
  }

  if (riga.tipo === 'impostazione') {
    var chiave = riga.id.replace('impost_', '');
    _DBS.scriviImpostazione(chiave, dati.valore).then(function() {
      if (typeof aggiornaImpostazioni === 'function') aggiornaImpostazioni();
    });
  }

  if (riga.tipo === 'genere') {
    _DBS.leggiGeneri().then(function(generi) {
      var esiste = generi.find(function(g) { return g.nome === dati.nome; });
      if (!esiste) _DBS.aggiungiGenere(dati.nome);
    });
  }
}

/* Gestisce un record eliminato arrivato da remoto */
function _gestisciEliminazioneRemota(riga) {
  if (!riga) return;
  if (riga.tipo === 'libro') {
    _DBS.eliminaLibro(riga.id).then(_ricaricaUI);
  }
}

function _ricaricaUI() {
  if (typeof aggiornaHomeConDB === 'function') aggiornaHomeConDB();
  if (typeof disegnaScaffale  === 'function') disegnaScaffale();
  if (typeof aggiornaClassifica === 'function') aggiornaClassifica();
  _aggiornaIndicatoreSyncUI('ok');
}

/* ══════════════════════════════════════════════════════════════════
   INTERCETTA FUNZIONI DB — push automatico ad ogni modifica locale
══════════════════════════════════════════════════════════════════ */

function _interceptaDB() {
  /* Intercetta aggiungiLibro */
  var _aggiOriginal = _DBS.aggiungiLibro.bind(_DBS);
  _DBS.aggiungiLibro = function(dati) {
    return _aggiOriginal(dati).then(function(id) {
      _DBS.leggiLibro(id).then(function(libro) {
        if (libro) _pushRecord('libro', id, libro);
      });
      return id;
    });
  };

  /* Intercetta aggiornaLibro */
  var _aggiLibroOriginal = _DBS.aggiornaLibro.bind(_DBS);
  _DBS.aggiornaLibro = function(id, aggiornamenti) {
    return _aggiLibroOriginal(id, aggiornamenti).then(function(libro) {
      _pushRecord('libro', id, libro);
      return libro;
    });
  };

  /* Intercetta eliminaLibro */
  var _elimOriginal = _DBS.eliminaLibro.bind(_DBS);
  _DBS.eliminaLibro = function(id) {
    return _elimOriginal(id).then(function(ok) {
      /* Soft delete su Supabase */
      _supabaseFetch('PATCH', '?id=eq.' + encodeURIComponent(id), {
        deleted: true,
        aggiornato_il: new Date().toISOString(),
      });
      return ok;
    });
  };

  /* Intercetta scriviImpostazione */
  var _scriviOriginal = _DBS.scriviImpostazione.bind(_DBS);
  _DBS.scriviImpostazione = function(chiave, valore) {
    return _scriviOriginal(chiave, valore).then(function(ok) {
      _pushRecord('impostazione', 'impost_' + chiave, { valore: valore });
      return ok;
    });
  };

  /* Intercetta aggiungiGenere */
  var _genereOriginal = _DBS.aggiungiGenere.bind(_DBS);
  _DBS.aggiungiGenere = function(nome) {
    return _genereOriginal(nome).then(function(id) {
      _pushRecord('genere', 'genere_' + id, { nome: nome, ordine: id });
      return id;
    });
  };

  /* Intercetta eliminaGenere */
  var _elimGenereOriginal = _DBS.eliminaGenere.bind(_DBS);
  _DBS.eliminaGenere = function(id) {
    return _elimGenereOriginal(id).then(function(ok) {
      _supabaseFetch('PATCH', '?id=eq.genere_' + id, {
        deleted: true,
        aggiornato_il: new Date().toISOString(),
      });
      return ok;
    });
  };

  /* Intercetta resetTuttiDati */
  var _resetOriginal = _DBS.resetTuttiDati.bind(_DBS);
  _DBS.resetTuttiDati = function() {
    return _resetOriginal().then(function(ok) {
      /* Soft delete di tutti i libri su Supabase */
      _supabaseFetch('PATCH', '?tipo=eq.libro', {
        deleted: true,
        aggiornato_il: new Date().toISOString(),
      });
      return ok;
    });
  };
}

/* ══════════════════════════════════════════════════════════════════
   HTTP HELPER — chiamate REST Supabase
══════════════════════════════════════════════════════════════════ */

function _supabaseFetch(metodo, querystring, corpo, headersExtra) {
  var headers = {
    'apikey':        SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY,
    'Content-Type':  'application/json',
  };

  if (headersExtra) {
    Object.keys(headersExtra).forEach(function(k) {
      headers[k] = headersExtra[k];
    });
  }

  var opzioni = {
    method:  metodo,
    headers: headers,
  };

  if (corpo) {
    opzioni.body = JSON.stringify(corpo);
  }

  return fetch(
    SUPABASE_URL + '/rest/v1/' + TABELLA + (querystring || ''),
    opzioni
  );
}

/* ══════════════════════════════════════════════════════════════════
   INDICATORE SYNC UI — icona nell'header impostazioni
══════════════════════════════════════════════════════════════════ */

function _aggiornaIndicatoreSyncUI(stato) {
  var el = document.getElementById('syncIndicatore');
  if (!el) return;

  var config = {
    ok:           { colore: 'var(--colore-successo)',  icona: 'ti-cloud-check',    testo: 'Sincronizzato' },
    caricamento:  { colore: 'var(--colore-accento)',   icona: 'ti-refresh',        testo: 'Sync in corso…' },
    errore:       { colore: 'var(--colore-errore)',    icona: 'ti-cloud-x',        testo: 'Errore sync' },
    offline:      { colore: 'var(--colore-testo-fantasma)', icona: 'ti-cloud-off', testo: 'Offline' },
  };

  var c = config[stato] || config.ok;
  el.innerHTML = '<i class="ti ' + c.icona + '" style="font-size:14px;color:' + c.colore + ';' +
    (stato === 'caricamento' ? 'animation:gira 1s linear infinite;' : '') + '"></i>' +
    '<span style="font-size:10px;color:' + c.colore + ';">' + c.testo + '</span>';
}

/* Sincronizzazione manuale — esposta per pulsante in Impostazioni */
function sincronizzaOra() {
  if (!navigator.onLine) {
    alert('Nessuna connessione internet disponibile.');
    return;
  }
  _syncIniziale().then(function() {
    _ricaricaUI();
  });
}

/* ══════════════════════════════════════════════════════════════════
   ESPOSIZIONE GLOBALE
══════════════════════════════════════════════════════════════════ */
window.BuonaLetturaSync = {
  inizializza:   inizializzaSync,
  sincronizzaOra: sincronizzaOra,
};

Object.assign(window, {
  sincronizzaOra: sincronizzaOra,
});
