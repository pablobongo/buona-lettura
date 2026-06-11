/*
 * covers.js — Copertine e suggerimenti personalizzati
 * ═══════════════════════════════════════════════════════════════
 *
 * COPERTINE:
 *   Cerca la copertina di un libro su Open Library usando ISBN
 *   oppure titolo + autore. Salva l'URL nel record del libro in IndexedDB.
 *   Richiede connessione internet.
 *
 * SUGGERIMENTI:
 *   Analizza i libri con voto >= soglia, costruisce un profilo gusti
 *   (generi preferiti, autori letti, voti medi per genere) e interroga
 *   Open Library per trovare libri simili non ancora letti.
 *   Genera la motivazione testuale tramite Claude API (claude-sonnet-4-20250514).
 *   Richiede connessione internet per entrambi i passaggi.
 *
 * Dipende da: db.js
 * ═══════════════════════════════════════════════════════════════
 */

'use strict';

const _DBC = window.BuonaLetturaDB;

/* ── URL base API ──────────────────────────────────────────────── */
const OL_BASE        = 'https://openlibrary.org';
const OL_COVERS      = 'https://covers.openlibrary.org/b';
const OL_SEARCH      = OL_BASE + '/search.json';

/* ── Cache locale suggerimento corrente ────────────────────────── */
let _suggerimentoCorrente = null;

/* ═══════════════════════════════════════════════════════════════
   COPERTINE — Open Library
═══════════════════════════════════════════════════════════════ */

/*
 * cercaCopertina(libro)
 * Cerca la copertina di un libro su Open Library.
 * Prova prima per ISBN, poi per titolo+autore.
 * Restituisce l'URL dell'immagine o null.
 */
function cercaCopertina(libro) {
  /* Prova per ISBN se disponibile */
  if (libro.isbn && libro.isbn.length >= 10) {
    var isbn = libro.isbn.replace(/[^0-9X]/gi, '');
    var urlIsbn = OL_COVERS + '/isbn/' + isbn + '-M.jpg?default=false';
    return _verificaImmagine(urlIsbn).then(function(ok) {
      if (ok) return urlIsbn;
      return _cercaPerTitoloAutore(libro);
    });
  }
  return _cercaPerTitoloAutore(libro);
}

/*
 * _cercaPerTitoloAutore(libro)
 * Cerca su Open Library per titolo + autore.
 */
function _cercaPerTitoloAutore(libro) {
  var query = encodeURIComponent(libro.titolo + ' ' + (libro.autore || ''));
  var url   = OL_SEARCH + '?q=' + query + '&fields=cover_i,title,author_name&limit=1';

  return fetch(url, { signal: AbortSignal.timeout(5000) })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data.docs || data.docs.length === 0) return null;
      var doc = data.docs[0];
      if (!doc.cover_i) return null;
      return OL_COVERS + '/id/' + doc.cover_i + '-M.jpg';
    })
    .catch(function() { return null; });
}

/*
 * _verificaImmagine(url)
 * Verifica che un URL immagine risponda con 200.
 */
function _verificaImmagine(url) {
  return fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(3000) })
    .then(function(r) { return r.ok; })
    .catch(function() { return false; });
}

/*
 * aggiornaCopertinaLibro(idLibro)
 * Cerca e salva la copertina per un libro specifico.
 * Chiamata dopo aver aggiunto o modificato un libro.
 */
function aggiornaCopertinaLibro(idLibro) {
  _DBC.leggiLibro(idLibro).then(function(libro) {
    if (!libro || libro.copertina) return; /* già ha una copertina */
    cercaCopertina(libro).then(function(url) {
      if (url) {
        _DBC.aggiornaLibro(idLibro, { copertina: url });
      }
    });
  });
}

/* ═══════════════════════════════════════════════════════════════
   SUGGERIMENTI PERSONALIZZATI
═══════════════════════════════════════════════════════════════ */

/*
 * nuovoSuggerimento()
 * Sovrascrive lo stub in app.js.
 * Genera un nuovo suggerimento basato sui gusti di Igor.
 */
function nuovoSuggerimento() {
  var pannello = document.getElementById('pannelloSuggerimenti');
  if (!pannello || !pannello.classList.contains('attivo')) return;

  _DBC.leggiTuttiLibri().then(function(libri) {
    var terminati = libri.filter(function(l) {
      return l.stato === 'terminato' && l.voto;
    });

    if (terminati.length < 3) {
      _mostraSuggerimentoVuoto('Aggiungi almeno 3 libri votati per ricevere suggerimenti personalizzati.');
      return;
    }

    _mostraCaricamentoSuggerimento();

    var profilo  = _costruisciProfilo(terminati);
    var titoliLetti = libri.map(function(l) { return l.titolo.toLowerCase(); });

    _DBC.leggiImpostazione('votoMinimoConsigliato').then(function(soglia) {
      soglia = soglia || 7;
      _cercaSuggerimentoOL(profilo, titoliLetti, soglia).then(function(candidato) {
        if (!candidato) {
          _mostraSuggerimentoVuoto('Nessun suggerimento trovato. Riprova.');
          return;
        }
        _generaMotivazione(candidato, profilo).then(function(motivazione) {
          _suggerimentoCorrente = candidato;
          _mostraSuggerimento(candidato, motivazione);
        });
      }).catch(function() {
        _mostraSuggerimentoVuoto('Connessione non disponibile. Riprova quando sei online.');
      });
    });
  });
}

/*
 * _costruisciProfilo(terminati)
 * Analizza i libri letti e costruisce un profilo gusti.
 * Restituisce: { generiOrdinati, autoriLetti, votoMedioPerGenere, topGenere }
 */
function _costruisciProfilo(terminati) {
  var generiVoti   = {};
  var generiCount  = {};
  var autoriLetti  = new Set();

  terminati.forEach(function(l) {
    if (l.autore) autoriLetti.add(l.autore.toLowerCase());
    if (l.genere && l.voto) {
      if (!generiVoti[l.genere])  generiVoti[l.genere]  = [];
      if (!generiCount[l.genere]) generiCount[l.genere] = 0;
      generiVoti[l.genere].push(l.voto);
      generiCount[l.genere]++;
    }
  });

  /* Voto medio per genere */
  var votoMedioPerGenere = {};
  Object.keys(generiVoti).forEach(function(g) {
    var voti = generiVoti[g];
    votoMedioPerGenere[g] = voti.reduce(function(s, v) { return s + v; }, 0) / voti.length;
  });

  /* Ordina generi per voto medio decrescente */
  var generiOrdinati = Object.keys(votoMedioPerGenere).sort(function(a, b) {
    return votoMedioPerGenere[b] - votoMedioPerGenere[a];
  });

  return {
    generiOrdinati:    generiOrdinati,
    topGenere:         generiOrdinati[0] || '',
    autoriLetti:       Array.from(autoriLetti),
    votoMedioPerGenere: votoMedioPerGenere,
    generiCount:       generiCount,
    totaleLibri:       terminati.length,
  };
}

/*
 * _cercaSuggerimentoOL(profilo, titoliLetti, soglia)
 * Interroga Open Library cercando libri del genere preferito
 * non ancora letti da Igor.
 */
function _cercaSuggerimentoOL(profilo, titoliLetti, soglia) {
  /* Traduce il genere italiano in una query per Open Library */
  var queryGenere = _tradiciGenere(profilo.topGenere || 'narrativa');
  var url = OL_SEARCH + '?subject=' + encodeURIComponent(queryGenere) +
            '&fields=title,author_name,number_of_pages_median,subject,cover_i,first_publish_year,key' +
            '&limit=20&sort=rating';

  return fetch(url, { signal: AbortSignal.timeout(6000) })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data.docs || data.docs.length === 0) return null;

      /* Filtra libri già letti e senza copertina */
      var candidati = data.docs.filter(function(doc) {
        if (!doc.title || !doc.author_name) return false;
        var titoloBasso = doc.title.toLowerCase();
        /* Escludi se già letto */
        if (titoliLetti.some(function(t) { return t.includes(titoloBasso) || titoloBasso.includes(t); })) return false;
        return true;
      });

      if (candidati.length === 0) return null;

      /* Scegli un candidato casuale tra i primi 10 per varietà */
      var pool = candidati.slice(0, 10);
      var scelto = pool[Math.floor(Math.random() * pool.length)];

      return {
        titolo:    scelto.title,
        autore:    scelto.author_name ? scelto.author_name[0] : 'Autore sconosciuto',
        pagine:    scelto.number_of_pages_median || null,
        anno:      scelto.first_publish_year || null,
        genere:    profilo.topGenere,
        copertina: scelto.cover_i
          ? OL_COVERS + '/id/' + scelto.cover_i + '-M.jpg'
          : null,
        soggetti:  (scelto.subject || []).slice(0, 4),
        olKey:     scelto.key || '',
      };
    });
}

/*
 * _tradiciGenere(genere)
 * Converte il genere italiano in una keyword per Open Library.
 */
function _tradiciGenere(genere) {
  var mappa = {
    'narrativa':          'fiction',
    'narrativa storica':  'historical fiction',
    'romanzo':            'fiction',
    'saggio':             'essays',
    'saggistica':         'nonfiction',
    'biografia':          'biography',
    'autobiografia':      'autobiography',
    'fantascienza':       'science fiction',
    'fantasy':            'fantasy',
    'thriller':           'thriller',
    'giallo':             'mystery',
    'horror':             'horror',
    'poesia':             'poetry',
    'filosofia':          'philosophy',
    'storia':             'history',
    'scienza':            'science',
    'psicologia':         'psychology',
    'classico':           'classics',
  };
  var chiave = genere.toLowerCase();
  return mappa[chiave] || genere;
}

/*
 * _generaMotivazione(candidato, profilo)
 * Chiama Claude API per generare una motivazione personalizzata.
 * Se la chiamata fallisce, genera una motivazione di fallback locale.
 */
function _generaMotivazione(candidato, profilo) {
  var prompt =
    'Sei un consulente letterario personale. ' +
    'Devi spiegare in massimo 2 frasi perché consiglio "' + candidato.titolo +
    '" di ' + candidato.autore + ' a un lettore che ama ' + profilo.topGenere +
    ' con una media voto di ' + (profilo.votoMedioPerGenere[profilo.topGenere] || 7).toFixed(1) + '/10. ' +
    'Sii diretto, concreto e letterariamente preciso. Niente frasi generiche.';

  return fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 200,
      messages:   [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(8000),
  })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    if (data.content && data.content[0] && data.content[0].text) {
      return data.content[0].text.trim();
    }
    return _motivazioneFallback(candidato, profilo);
  })
  .catch(function() {
    return _motivazioneFallback(candidato, profilo);
  });
}

/*
 * _motivazioneFallback(candidato, profilo)
 * Motivazione generata localmente se Claude API non è disponibile.
 */
function _motivazioneFallback(candidato, profilo) {
  var votoMedio = profilo.votoMedioPerGenere[profilo.topGenere] || 7;
  return 'Basato sui tuoi ' + profilo.totaleLibri + ' libri letti e la tua preferenza per ' +
    profilo.topGenere + ' (voto medio ' + votoMedio.toFixed(1) + '/10), ' +
    '"' + candidato.titolo + '" di ' + candidato.autore +
    ' potrebbe essere la tua prossima lettura ideale.';
}

/* ═══════════════════════════════════════════════════════════════
   UI SUGGERIMENTI — aggiornamento pannello
═══════════════════════════════════════════════════════════════ */

/*
 * aggiornaSuggerimentoUI()
 * Sovrascrive lo stub in app.js.
 * Chiamata quando si apre il tab Suggerimenti.
 */
function aggiornaSuggerimentoUI() {
  _DBC.leggiTuttiLibri().then(function(libri) {
    var terminati = libri.filter(function(l) { return l.stato === 'terminato' && l.voto; });

    var elMotiv = document.getElementById('suggMotivazioneTestp');
    if (elMotiv) {
      if (terminati.length < 3) {
        elMotiv.textContent = 'Aggiungi almeno 3 libri votati per ricevere suggerimenti personalizzati.';
      } else {
        var profilo = _costruisciProfilo(terminati);
        elMotiv.textContent = 'Profilo attivo: ami ' + profilo.topGenere +
          ' (voto medio ' + (profilo.votoMedioPerGenere[profilo.topGenere] || 0).toFixed(1) + '/10) · ' +
          terminati.length + ' libri votati.';
      }
    }

    /* Se non c'è già un suggerimento mostrato e ci sono abbastanza libri */
    var cardSugg = document.getElementById('cardSuggerimento');
    if (cardSugg && terminati.length >= 3 && !_suggerimentoCorrente) {
      nuovoSuggerimento();
    }
  });
}

function _mostraCaricamentoSuggerimento() {
  var card = document.getElementById('cardSuggerimento');
  if (!card) return;
  card.innerHTML =
    '<div style="display:flex;flex-direction:column;align-items:center;padding:24px;gap:12px;">' +
      '<div style="width:32px;height:32px;border:2px solid var(--colore-accento);' +
           'border-top-color:transparent;border-radius:50%;' +
           'animation:gira 0.8s linear infinite;"></div>' +
      '<p style="font-size:12px;color:var(--colore-testo-tenue);font-style:italic;">Cerco il libro giusto per te…</p>' +
    '</div>' +
    '<style>@keyframes gira{to{transform:rotate(360deg)}}</style>';
}

function _mostraSuggerimentoVuoto(msg) {
  var card = document.getElementById('cardSuggerimento');
  if (!card) return;
  card.innerHTML =
    '<div class="stato-vuoto" style="padding:20px 0;">' +
      '<div class="stato-vuoto-icona"><i class="ti ti-sparkles" aria-hidden="true"></i></div>' +
      '<p class="stato-vuoto-titolo">Nessun suggerimento</p>' +
      '<p class="stato-vuoto-testo">' + msg + '</p>' +
    '</div>';
}

function _mostraSuggerimento(candidato, motivazione) {
  var card = document.getElementById('cardSuggerimento');
  if (!card) return;

  var tags = (candidato.soggetti || []).slice(0, 3).map(function(s) {
    return '<span style="font-size:9px;padding:2px 6px;border-radius:3px;' +
           'background:rgba(255,255,255,0.08);color:rgba(237,232,220,0.6);">' +
           s.slice(0, 20) + '</span>';
  }).join('');

  card.innerHTML =
    '<div style="background:#2C4A38;border-radius:10px 10px 0 0;padding:14px 12px;' +
         'display:flex;gap:10px;align-items:flex-start;">' +
      /* Copertina */
      '<div style="width:52px;height:72px;border-radius:3px;background:#1B4332;' +
           'display:flex;align-items:center;justify-content:center;' +
           'border:1px solid rgba(255,255,255,0.1);flex-shrink:0;overflow:hidden;">' +
        (candidato.copertina
          ? '<img src="' + candidato.copertina + '" alt="Copertina" ' +
            'style="width:100%;height:100%;object-fit:cover;" ' +
            'onerror="this.style.display=\'none\'" />'
          : '<i class="ti ti-book" style="font-size:22px;color:rgba(200,150,60,0.5);"></i>') +
      '</div>' +
      /* Info */
      '<div style="flex:1;min-width:0;">' +
        '<span style="font-size:9px;background:var(--colore-accento);color:var(--colore-primario);' +
              'border-radius:3px;padding:1px 6px;display:inline-block;' +
              'margin-bottom:5px;font-weight:500;">Suggerito per te</span>' +
        '<p style="font-family:var(--font-titolo);font-size:14px;font-weight:600;' +
             'color:#EDE8DC;margin-bottom:3px;line-height:1.3;">' + candidato.titolo + '</p>' +
        '<p style="font-size:11px;color:rgba(237,232,220,0.6);margin-bottom:6px;">' +
          candidato.autore +
          (candidato.anno ? ' · ' + candidato.anno : '') +
        '</p>' +
        '<div style="display:flex;gap:3px;flex-wrap:wrap;">' +
          (candidato.genere
            ? '<span style="font-size:9px;padding:2px 6px;border-radius:3px;' +
              'background:rgba(200,150,60,0.2);color:var(--colore-accento);">' +
              candidato.genere + '</span>'
            : '') +
          (candidato.pagine
            ? '<span style="font-size:9px;padding:2px 6px;border-radius:3px;' +
              'background:rgba(255,255,255,0.08);color:rgba(237,232,220,0.6);">' +
              candidato.pagine + ' pag.</span>'
            : '') +
          tags +
        '</div>' +
      '</div>' +
    '</div>' +
    /* Motivazione */
    '<div style="padding:10px 12px;border-top:1px solid rgba(255,255,255,0.06);">' +
      '<p style="font-size:11px;color:var(--colore-testo-tenue);line-height:1.65;' +
           'font-style:italic;font-family:var(--font-titolo);">' +
        '"' + motivazione + '"' +
      '</p>' +
    '</div>';

  /* Aggiorna pulsante Amazon */
  var btnAmazon = document.getElementById('btnAmazonSugg');
  if (btnAmazon) {
    btnAmazon.disabled = false;
    btnAmazon.onclick  = function() { apriAmazon(); };
  }
}

/*
 * apriAmazon()
 * Sovrascrive lo stub in app.js.
 * Apre Amazon.it con la ricerca del libro suggerito.
 */
function apriAmazon() {
  if (!_suggerimentoCorrente) return;
  var query = encodeURIComponent(_suggerimentoCorrente.titolo + ' ' + _suggerimentoCorrente.autore);
  window.open('https://www.amazon.it/s?k=' + query, '_blank', 'noopener');
}

/* ═══════════════════════════════════════════════════════════════
   RICERCA COPERTINA AL SALVATAGGIO LIBRO
   Agganciata al flusso di salvaLibro() in app.js
═══════════════════════════════════════════════════════════════ */

/*
 * Intercetta il salvataggio del libro per avviare la ricerca copertina
 * in background — non blocca il flusso principale.
 */
var _salvalibroOriginale = window.salvaLibro;
if (typeof _salvalibroOriginale === 'function') {
  window.salvaLibro = function(id) {
    var promessa = _salvalibroOriginale(id);
    /* Dopo il salvataggio, cerca la copertina in background */
    if (promessa && typeof promessa.then === 'function') {
      promessa.then(function() {
        _DBC.leggiTuttiLibri().then(function(libri) {
          var ultimo = libri.sort(function(a, b) {
            return new Date(b.dataInserimento) - new Date(a.dataInserimento);
          })[0];
          if (ultimo && !ultimo.copertina) {
            aggiornaCopertinaLibro(ultimo.id);
          }
        });
      });
    }
    return promessa;
  };
}

/* ═══════════════════════════════════════════════════════════════
   ESPOSIZIONE GLOBALE
═══════════════════════════════════════════════════════════════ */
Object.assign(window, {
  nuovoSuggerimento,
  aggiornaSuggerimentoUI,
  apriAmazon,
  cercaCopertina,
  aggiornaCopertinaLibro,
});
