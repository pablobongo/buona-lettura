/*
 * sync.js — Sincronizzazione Supabase v2
 * ═══════════════════════════════════════════════════════════════
 *
 * Approccio semplificato:
 * - Ogni operazione locale chiama esplicitamente pushLibro/pushImpostazione
 * - Nessuna intercettazione automatica (causa loop)
 * - Sync iniziale scarica tutto da Supabase e applica solo se più recente
 * - Realtime notifica modifiche dagli altri dispositivi
 * - Confronto timestamp via campo aggiornato_il (aggiunto a db.js)
 *
 * Dipende da: db.js
 * ═══════════════════════════════════════════════════════════════
 */

'use strict';

var SUPABASE_URL = 'https://uhrmszvobguyienburta.supabase.co';
var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVocm1zenZvYmd1eWllbmJ1cnRhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0NTY1NDYsImV4cCI6MjA5NzAzMjU0Nn0.n8l9lGyAu_1LRAYCSJGdLt_TVXwTL-rA6IZp1zAAa84';
var TABELLA     = 'bl_sync';
var _DBS        = null; /* inizializzato in inizializzaSync() */
var _syncAttivo = false;
var _ws         = null;

/* ══════════════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════════════ */

function inizializzaSync() {
  _DBS = window.BuonaLetturaDB;
  if (_syncAttivo || !_DBS) return;

  if (!navigator.onLine) {
    _indicatore('offline');
    window.addEventListener('online', inizializzaSync, { once: true });
    return;
  }

  _syncAttivo = true;
  console.log('[Sync] Avvio...');
  _indicatore('caricamento');

  _syncCompleto()
    .then(function() { _avviaRealtime(); })
    .catch(function(e) {
      console.error('[Sync] Errore init:', e);
      _indicatore('errore');
    });

  window.addEventListener('online', function() {
    _indicatore('caricamento');
    _syncCompleto();
  });
  window.addEventListener('offline', function() { _indicatore('offline'); });
}

/* ══════════════════════════════════════════════════════════════
   SYNC COMPLETO — scarica remoto, applica solo se più recente
══════════════════════════════════════════════════════════════ */

function _syncCompleto() {
  return _fetch('?select=*&order=aggiornato_il.desc')
    .then(function(righe) {
      if (!righe || righe.length === 0) {
        /* Nessun dato remoto — push tutto il locale */
        return _pushTuttoLocale();
      }
      return _applicaRemoto(righe);
    })
    .then(function() {
      _indicatore('ok');
      _ricaricaUI();
    });
}

function _applicaRemoto(righe) {
  return _DBS.leggiTuttiLibri().then(function(libriLocali) {
    var promesse = [];
    var idLocali = {};
    libriLocali.forEach(function(l) { idLocali[l.id] = l; });

    var idRemotiAttivi = [];

    righe.forEach(function(riga) {
      if (riga.tipo !== 'libro') return;

      if (riga.deleted) {
        /* Libro eliminato da remoto — elimina anche in locale */
        if (idLocali[riga.id]) {
          promesse.push(
            _DBS.eliminaLibro(riga.id).catch(function() {})
          );
        }
        return;
      }

      idRemotiAttivi.push(riga.id);
      var locale = idLocali[riga.id];
      var tsRemoto = new Date(riga.aggiornato_il).getTime();

      if (!locale) {
        /* Libro nuovo da remoto */
        promesse.push(
          _DBS.aggiungiLibro(riga.dati).catch(function() {})
        );
      } else {
        /* Confronta timestamp — vince il più recente */
        var tsLocale = new Date(locale.aggiornato_il || locale.dataInserimento || 0).getTime();
        if (tsRemoto > tsLocale) {
          promesse.push(
            _DBS.aggiornaLibro(riga.id, riga.dati).catch(function() {})
          );
        }
        /* Se locale più recente — non fare nulla, il push avverrà al prossimo salvataggio */
      }
    });

    /* Push libri locali non presenti su remoto */
    libriLocali.forEach(function(l) {
      if (!idRemotiAttivi.includes(l.id)) {
        var eliminatoRemoto = righe.find(function(r) {
          return r.id === l.id && r.deleted;
        });
        if (!eliminatoRemoto) {
          promesse.push(_pushLibro(l));
        }
      }
    });

    /* Applica impostazioni e generi remoti */
    return Promise.all(promesse).then(function() {
      return _applicaImpostazioniGeneriRemoti(righe);
    });
  });
}

function _applicaImpostazioniGeneriRemoti(righe) {
  var promesse = [];

  righe.forEach(function(riga) {
    if (riga.deleted) return;

    if (riga.tipo === 'impostazione') {
      var chiave = riga.id.replace('impost_', '');
      promesse.push(_DBS.scriviImpostazione(chiave, riga.dati.valore).catch(function() {}));
    }

    if (riga.tipo === 'genere') {
      promesse.push(
        _DBS.leggiGeneri().then(function(generi) {
          var esiste = generi.find(function(g) { return g.nome === riga.dati.nome; });
          if (!esiste) return _DBS.aggiungiGenere(riga.dati.nome);
        }).catch(function() {})
      );
    }
  });

  return Promise.all(promesse);
}

/* ══════════════════════════════════════════════════════════════
   PUSH ESPLICITO — chiamato da app.js dopo ogni modifica
══════════════════════════════════════════════════════════════ */

function pushLibro(libro) {
  if (!libro || !libro.id) return Promise.resolve();
  return _upsert({
    id:            libro.id,
    tipo:          'libro',
    dati:          libro,
    aggiornato_il: libro.aggiornato_il || new Date().toISOString(),
    deleted:       false,
  });
}

function pushEliminaLibro(id) {
  return _upsert({
    id:            id,
    tipo:          'libro',
    dati:          {},
    aggiornato_il: new Date().toISOString(),
    deleted:       true,
  });
}

function pushImpostazione(chiave, valore) {
  return _upsert({
    id:            'impost_' + chiave,
    tipo:          'impostazione',
    dati:          { valore: valore },
    aggiornato_il: new Date().toISOString(),
    deleted:       false,
  });
}

function pushGenere(id, nome) {
  return _upsert({
    id:            'genere_' + id,
    tipo:          'genere',
    dati:          { nome: nome, ordine: id },
    aggiornato_il: new Date().toISOString(),
    deleted:       false,
  });
}

function pushEliminaGenere(id) {
  return _upsert({
    id:            'genere_' + id,
    tipo:          'genere',
    dati:          {},
    aggiornato_il: new Date().toISOString(),
    deleted:       true,
  });
}

function _pushTuttoLocale() {
  return Promise.all([
    _DBS.leggiTuttiLibri(),
    _DBS.leggiTutteImpostazioni(),
    _DBS.leggiGeneri(),
  ]).then(function(risultati) {
    var promesse = [];
    risultati[0].forEach(function(l) { promesse.push(pushLibro(l)); });
    Object.keys(risultati[1]).forEach(function(k) {
      promesse.push(pushImpostazione(k, risultati[1][k]));
    });
    risultati[2].forEach(function(g) { promesse.push(pushGenere(g.id, g.nome)); });
    return Promise.all(promesse);
  });
}

/* ══════════════════════════════════════════════════════════════
   REALTIME
══════════════════════════════════════════════════════════════ */

function _avviaRealtime() {
  var wsUrl = SUPABASE_URL.replace('https://', 'wss://') +
    '/realtime/v1/websocket?apikey=' + SUPABASE_KEY + '&vsn=1.0.0';

  try {
    _ws = new WebSocket(wsUrl);

    _ws.onopen = function() {
      _ws.send(JSON.stringify({
        topic:   'realtime:public:' + TABELLA,
        event:   'phx_join',
        payload: { config: { broadcast: { self: false } } },
        ref:     '1',
      }));
      console.log('[Sync] Realtime connesso.');
    };

    _ws.onmessage = function(ev) {
      try {
        var msg = JSON.parse(ev.data);
        if (msg.event === 'INSERT' || msg.event === 'UPDATE') {
          _gestisciRemoto(msg.payload.record);
        }
        if (msg.event === 'DELETE') {
          var old = msg.payload.old_record;
          if (old && old.tipo === 'libro') {
            _DBS.eliminaLibro(old.id).then(_ricaricaUI).catch(function() {});
          }
        }
      } catch(e) {}
    };

    _ws.onclose = function() {
      console.log('[Sync] Realtime disconnesso — riconnetto tra 5s');
      setTimeout(_avviaRealtime, 5000);
    };

    _ws.onerror = function() { _ws.close(); };

  } catch(e) {
    console.warn('[Sync] WebSocket non disponibile, uso polling.');
    setInterval(function() {
      if (navigator.onLine) _syncCompleto();
    }, 60000);
  }
}

function _gestisciRemoto(riga) {
  if (!riga) return;

  if (riga.tipo === 'libro') {
    if (riga.deleted) {
      _DBS.eliminaLibro(riga.id).then(_ricaricaUI).catch(function() {});
      return;
    }
    _DBS.leggiLibro(riga.id).then(function(locale) {
      var tsRemoto = new Date(riga.aggiornato_il).getTime();
      if (!locale) {
        _DBS.aggiungiLibro(riga.dati).then(_ricaricaUI).catch(function() {});
      } else {
        var tsLocale = new Date(locale.aggiornato_il || locale.dataInserimento || 0).getTime();
        if (tsRemoto > tsLocale) {
          _DBS.aggiornaLibro(riga.id, riga.dati).then(_ricaricaUI).catch(function() {});
        }
      }
    });
  }

  if (riga.tipo === 'impostazione' && !riga.deleted) {
    var chiave = riga.id.replace('impost_', '');
    _DBS.scriviImpostazione(chiave, riga.dati.valore).then(function() {
      if (typeof aggiornaImpostazioni === 'function') aggiornaImpostazioni();
    }).catch(function() {});
  }

  if (riga.tipo === 'genere' && !riga.deleted) {
    _DBS.leggiGeneri().then(function(generi) {
      var esiste = generi.find(function(g) { return g.nome === riga.dati.nome; });
      if (!esiste) _DBS.aggiungiGenere(riga.dati.nome).catch(function() {});
    });
  }
}

/* ══════════════════════════════════════════════════════════════
   HTTP HELPERS
══════════════════════════════════════════════════════════════ */

function _fetch(qs) {
  return fetch(SUPABASE_URL + '/rest/v1/' + TABELLA + (qs || ''), {
    headers: {
      'apikey':        SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
    }
  }).then(function(r) { return r.ok ? r.json() : []; })
    .catch(function() { return []; });
}

function _upsert(corpo) {
  return fetch(SUPABASE_URL + '/rest/v1/' + TABELLA + '?on_conflict=id', {
    method:  'POST',
    headers: {
      'apikey':        SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type':  'application/json',
      'Prefer':        'resolution=merge-duplicates',
    },
    body: JSON.stringify(corpo),
  }).catch(function(e) {
    console.warn('[Sync] Push fallito:', e.message);
  });
}

/* ══════════════════════════════════════════════════════════════
   UI
══════════════════════════════════════════════════════════════ */

function _indicatore(stato) {
  var cfg = {
    ok:          { colore: 'var(--colore-successo)',       icona: 'ti-cloud-check', testo: 'Sincronizzato' },
    caricamento: { colore: 'var(--colore-accento)',        icona: 'ti-refresh',     testo: 'Sync…' },
    errore:      { colore: 'var(--colore-errore)',         icona: 'ti-cloud-x',     testo: 'Errore sync' },
    offline:     { colore: 'var(--colore-testo-fantasma)', icona: 'ti-cloud-off',   testo: 'Offline' },
  };
  var c = cfg[stato] || cfg.ok;
  var spin = stato === 'caricamento' ? 'animation:gira 1s linear infinite;' : '';
  var html = '<i class="ti ' + c.icona + '" style="font-size:14px;color:' + c.colore + ';' + spin + '"></i>' +
             '<span style="font-size:10px;color:' + c.colore + ';">' + c.testo + '</span>';
  ['syncIndicatore', 'syncIndicatoreImpost'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.innerHTML = html;
  });
}

function _ricaricaUI() {
  _indicatore('ok');
  if (typeof aggiornaHomeConDB  === 'function') aggiornaHomeConDB();
  if (typeof disegnaScaffale    === 'function') disegnaScaffale();
  if (typeof aggiornaClassifica === 'function') aggiornaClassifica();
}

function sincronizzaOra() {
  if (!navigator.onLine) { alert('Nessuna connessione disponibile.'); return; }
  _indicatore('caricamento');
  _syncCompleto();
}

/* ══════════════════════════════════════════════════════════════
   ESPOSIZIONE
══════════════════════════════════════════════════════════════ */
window.BuonaLetturaSync = {
  inizializza:    inizializzaSync,
  sincronizzaOra: sincronizzaOra,
  pushLibro:      pushLibro,
  pushEliminaLibro: pushEliminaLibro,
  pushImpostazione: pushImpostazione,
  pushGenere:     pushGenere,
  pushEliminaGenere: pushEliminaGenere,
};

Object.assign(window, { sincronizzaOra: sincronizzaOra });
