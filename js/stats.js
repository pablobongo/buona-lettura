/*
 * stats.js — Statistiche e grafici
 * ═══════════════════════════════════════════════════════════════
 *
 * Gestisce tutta la sezione Stats:
 *  - Selezione periodo (anno corrente, anno scorso, tutto, personalizzato)
 *  - Metriche numeriche (libri, pagine, voto medio, giorni medi)
 *  - Grafici Chart.js: barre mesi, linea pagine cumulative,
 *    donut generi, donut supporto, scatter voto/pagine
 *  - Heatmap annuale stile GitHub
 *  - Barra obiettivo annuale
 *  - Statistiche testuali (autore, editore, mese, striscia)
 *
 * Dipende da: db.js, Chart.js (CDN)
 * ═══════════════════════════════════════════════════════════════
 */

'use strict';

/* ── Riferimento al DB ─────────────────────────────────────────── */
const _DB = window.BuonaLetturaDB;

/* ── Istanze Chart.js attive — distrutte prima di ridisegnare ──── */
const _grafici = {};

/* ── Periodo selezionato ───────────────────────────────────────── */
let _periodo = {
  tipo:   'anno-corrente',
  anno:   new Date().getFullYear(),
  dal:    null,
  al:     null,
};

/* ── Colori palette "Sera di Velluto" ──────────────────────────── */
const PALETTE = {
  accento:       '#C8963C',
  accentoChiaro: '#E8C06A',
  accentoScuro:  '#A07828',
  sfondo:        '#1A1A2E',
  superficie:    'rgba(255,255,255,0.05)',
  bordo:         'rgba(200,150,60,0.2)',
  testo:         '#EDE8DC',
  testoTenue:    'rgba(237,232,220,0.45)',
  testoFantasma: 'rgba(237,232,220,0.2)',
  verde:         '#5CB88A',
  rosso:         '#E05C5C',
};

/* Colori per i donut — serie fissa */
const COLORI_DONUT = [
  '#C8963C', '#5C8BC8', '#5CB88A', '#C85C8B', '#8BC85C',
  '#8B5CC8', '#C8C85C', '#5CC8C8', '#C8735C', '#735CC8',
];

/* ═══════════════════════════════════════════════════════════════
   PUNTO DI INGRESSO
   aggiornaStats() — sovrascrive lo stub in app.html
   Chiamata ogni volta che si entra nella sezione Stats.
═══════════════════════════════════════════════════════════════ */
function aggiornaStats() {
  /* Carica Chart.js dal CDN se non ancora disponibile */
  if (typeof Chart === 'undefined') {
    caricaChartJS().then(function() {
      _inizializzaStats();
    });
  } else {
    _inizializzaStats();
  }
}

function caricaChartJS() {
  return new Promise(function(risolvi) {
    if (typeof Chart !== 'undefined') { risolvi(); return; }
    var script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
    script.onload = risolvi;
    document.head.appendChild(script);
  });
}

function _inizializzaStats() {
  _attivaListenerPeriodo();
  _caricaEDisegna();
}

/* ═══════════════════════════════════════════════════════════════
   GESTIONE PERIODO
═══════════════════════════════════════════════════════════════ */

function _attivaListenerPeriodo() {
  var chips = document.querySelectorAll('.periodo-chip');
  chips.forEach(function(chip) {
    /* Evita di aggiungere listener multipli */
    if (chip.dataset.listenerAttivo) return;
    chip.dataset.listenerAttivo = '1';

    chip.addEventListener('click', function() {
      chips.forEach(function(c) { c.classList.remove('attivo'); });
      chip.classList.add('attivo');

      var tipo = chip.dataset.periodo;
      _periodo.tipo = tipo;

      if (tipo === 'anno-corrente') {
        _periodo.anno = new Date().getFullYear();
        _periodo.dal  = null;
        _periodo.al   = null;
        _caricaEDisegna();

      } else if (tipo === 'anno-scorso') {
        _periodo.anno = new Date().getFullYear() - 1;
        _periodo.dal  = null;
        _periodo.al   = null;
        _caricaEDisegna();

      } else if (tipo === 'tutto') {
        _periodo.anno = null;
        _periodo.dal  = null;
        _periodo.al   = null;
        _caricaEDisegna();

      } else if (tipo === 'personalizzato') {
        _apriSelezioneIntervallo();
      }
    });
  });
}

function _apriSelezioneIntervallo() {
  var annoCorrente = new Date().getFullYear();
  apriOverlay(
    '<h2 style="font-family:var(--font-titolo);font-size:17px;font-weight:600;' +
    'color:var(--colore-testo);margin-bottom:20px;">Seleziona periodo</h2>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;">' +
      '<div>' +
        '<label style="display:block;font-size:11px;color:var(--colore-testo-tenue);margin-bottom:5px;">Dal</label>' +
        '<input id="statsDal" type="date" style="width:100%;background:var(--colore-superficie);' +
        'border:1px solid var(--colore-bordo-sottile);border-radius:var(--raggio-piccolo);' +
        'padding:10px 12px;font-size:13px;color:var(--colore-testo);font-family:var(--font-corpo);" />' +
      '</div>' +
      '<div>' +
        '<label style="display:block;font-size:11px;color:var(--colore-testo-tenue);margin-bottom:5px;">Al</label>' +
        '<input id="statsAl" type="date" style="width:100%;background:var(--colore-superficie);' +
        'border:1px solid var(--colore-bordo-sottile);border-radius:var(--raggio-piccolo);' +
        'padding:10px 12px;font-size:13px;color:var(--colore-testo);font-family:var(--font-corpo);" />' +
      '</div>' +
    '</div>' +
    '<div style="display:flex;gap:10px;">' +
      '<button class="btn-secondario" style="flex:1;" onclick="_chiudiOverlay()">Annulla</button>' +
      '<button class="btn-primario" style="flex:1;" onclick="applicaIntervallo()">Applica</button>' +
    '</div>'
  );
}

function applicaIntervallo() {
  var dal = document.getElementById('statsDal').value;
  var al  = document.getElementById('statsAl').value;
  if (!dal || !al) { alert('Seleziona entrambe le date.'); return; }
  _periodo.dal  = dal;
  _periodo.al   = al;
  _periodo.anno = null;
  _chiudiOverlay();
  _caricaEDisegna();
}

/* ═══════════════════════════════════════════════════════════════
   CARICAMENTO DATI E DISEGNO
═══════════════════════════════════════════════════════════════ */

function _caricaEDisegna() {
  _DB.leggiTuttiLibri().then(function(tuttiLibri) {
    _DB.leggiTutteImpostazioni().then(function(impost) {
      var libri = _filtraPerPeriodo(tuttiLibri);
      var terminati = libri.filter(function(l) { return l.stato === 'terminato'; });

      _aggiornaMmetriche(terminati);
      _aggiornaGraficoMesi(terminati);
      _aggiornaGraficoPagine(terminati);
      _aggiornaGraficiDonut(terminati);
      _aggiornaScatter(terminati);
      _aggiornaHeatmap(tuttiLibri);
      _aggiornaObiettivo(terminati, impost);
      _aggiornaCuriosita(terminati, tuttiLibri);
    });
  });
}

/*
 * _filtraPerPeriodo(libri)
 * Filtra i libri in base al periodo selezionato.
 */
function _filtraPerPeriodo(libri) {
  if (_periodo.tipo === 'tutto') return libri;

  return libri.filter(function(l) {
    var dataRif = l.dataFine || l.dataInizio || l.dataInserimento;
    if (!dataRif) return false;
    var data = new Date(dataRif);

    if (_periodo.anno) {
      return data.getFullYear() === _periodo.anno;
    }

    if (_periodo.dal && _periodo.al) {
      var dal = new Date(_periodo.dal);
      var al  = new Date(_periodo.al);
      return data >= dal && data <= al;
    }

    return true;
  });
}

/* ═══════════════════════════════════════════════════════════════
   METRICHE NUMERICHE
═══════════════════════════════════════════════════════════════ */

function _aggiornaMmetriche(terminati) {
  var totalePagine = terminati.reduce(function(s, l) { return s + (l.pagine || 0); }, 0);
  var votiValidi   = terminati.filter(function(l) { return l.voto; }).map(function(l) { return l.voto; });
  var votoMedio    = votiValidi.length
    ? (votiValidi.reduce(function(s, v) { return s + v; }, 0) / votiValidi.length).toFixed(1).replace('.', ',')
    : '—';

  /* Giorni medi per libro */
  var durate = terminati
    .filter(function(l) { return l.dataInizio && l.dataFine; })
    .map(function(l) {
      return Math.round((new Date(l.dataFine) - new Date(l.dataInizio)) / 86400000);
    })
    .filter(function(d) { return d >= 0; });
  var giorniMedi = durate.length
    ? Math.round(durate.reduce(function(s, d) { return s + d; }, 0) / durate.length)
    : null;

  _imposta('mLibri',  terminati.length);
  _imposta('mPagine', totalePagine.toLocaleString('it-IT'));
  _imposta('mVoto',   votoMedio);
  _imposta('mGiorni', giorniMedi !== null ? giorniMedi + ' gg' : '—');
}

/* ═══════════════════════════════════════════════════════════════
   GRAFICO BARRE — libri per mese
═══════════════════════════════════════════════════════════════ */

function _aggiornaGraficoMesi(terminati) {
  var canvas = document.getElementById('graficoMesi');
  if (!canvas) return;

  var conteggio = Array(12).fill(0);
  terminati.forEach(function(l) {
    if (l.dataFine) {
      conteggio[new Date(l.dataFine).getMonth()]++;
    }
  });

  var mesi = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
  var meseCorrente = new Date().getMonth();

  var colori = conteggio.map(function(_, i) {
    return i === meseCorrente ? PALETTE.accento : 'rgba(200,150,60,0.45)';
  });

  _distruggiGrafico('mesi');
  _grafici['mesi'] = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: mesi,
      datasets: [{
        data:            conteggio,
        backgroundColor: colori,
        borderRadius:    4,
        borderSkipped:   false,
      }]
    },
    options: _opzioniBase({
      scala: { suggestedMax: Math.max(...conteggio, 1) + 1 },
      tooltipSuffix: ' libri',
    })
  });
}

/* ═══════════════════════════════════════════════════════════════
   GRAFICO LINEA — pagine cumulative nel tempo
═══════════════════════════════════════════════════════════════ */

function _aggiornaGraficoPagine(terminati) {
  var canvas = document.getElementById('graficoPagine');
  if (!canvas) return;

  var ordinati = terminati
    .filter(function(l) { return l.dataFine && l.pagine; })
    .sort(function(a, b) { return new Date(a.dataFine) - new Date(b.dataFine); });

  var cumulo = 0;
  var punti  = ordinati.map(function(l) {
    cumulo += l.pagine;
    return { x: l.dataFine.split('T')[0], y: cumulo, titolo: l.titolo };
  });

  _distruggiGrafico('pagine');

  if (punti.length === 0) {
    _mostraVuotoGrafico(canvas, 'Nessun dato disponibile');
    return;
  }

  _grafici['pagine'] = new Chart(canvas, {
    type: 'line',
    data: {
      labels: punti.map(function(p) { return p.x; }),
      datasets: [{
        data:              punti.map(function(p) { return p.y; }),
        borderColor:       PALETTE.accento,
        backgroundColor:   'rgba(200,150,60,0.08)',
        borderWidth:       2,
        pointRadius:       3,
        pointBackgroundColor: PALETTE.accento,
        fill:              true,
        tension:           0.3,
      }]
    },
    options: _opzioniBase({
      tooltipSuffix: ' pagine',
      xType: 'category',
      mostraX: false,
    })
  });
}

/* ═══════════════════════════════════════════════════════════════
   GRAFICI DONUT — generi e supporto
═══════════════════════════════════════════════════════════════ */

function _aggiornaGraficiDonut(terminati) {
  /* Per genere */
  var distribGenere = {};
  terminati.forEach(function(l) {
    if (l.genere) distribGenere[l.genere] = (distribGenere[l.genere] || 0) + 1;
  });
  _disegnaDonut('graficoGeneri', distribGenere);

  /* Per supporto */
  var labelSupporto = { cartaceo: 'Cartaceo', kindle: 'Kindle', pdf: 'PDF', altro: 'Altro' };
  var distribSupporto = {};
  terminati.forEach(function(l) {
    var s = labelSupporto[l.supporto] || l.supporto || 'Altro';
    distribSupporto[s] = (distribSupporto[s] || 0) + 1;
  });
  _disegnaDonut('graficoSupporto', distribSupporto);
}

function _disegnaDonut(canvasId, distribuzione) {
  var canvas = document.getElementById(canvasId);
  if (!canvas) return;

  var voci   = Object.keys(distribuzione);
  var valori = Object.values(distribuzione);

  _distruggiGrafico(canvasId);

  if (voci.length === 0) {
    _mostraVuotoGrafico(canvas, '—');
    return;
  }

  _grafici[canvasId] = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels:   voci,
      datasets: [{
        data:            valori,
        backgroundColor: COLORI_DONUT.slice(0, voci.length),
        borderColor:     PALETTE.sfondo,
        borderWidth:     2,
        hoverOffset:     4,
      }]
    },
    options: {
      responsive:          true,
      maintainAspectRatio: true,
      cutout:              '65%',
      plugins: {
        legend: {
          position:  'bottom',
          labels: {
            color:     PALETTE.testoTenue,
            font:      { size: 9, family: "'Inter', sans-serif" },
            boxWidth:  10,
            padding:   8,
          }
        },
        tooltip: {
          backgroundColor: 'rgba(22,33,62,0.95)',
          titleColor:      PALETTE.testo,
          bodyColor:       PALETTE.testoTenue,
          borderColor:     PALETTE.bordo,
          borderWidth:     1,
          callbacks: {
            label: function(ctx) {
              var tot  = ctx.dataset.data.reduce(function(a, b) { return a + b; }, 0);
              var perc = Math.round((ctx.raw / tot) * 100);
              return ' ' + ctx.raw + ' libri (' + perc + '%)';
            }
          }
        }
      }
    }
  });
}

/* ═══════════════════════════════════════════════════════════════
   GRAFICO SCATTER — voto vs numero di pagine
═══════════════════════════════════════════════════════════════ */

function _aggiornaScatter(terminati) {
  var canvas = document.getElementById('graficoScatter');
  if (!canvas) return;

  var punti = terminati
    .filter(function(l) { return l.voto && l.pagine; })
    .map(function(l) { return { x: l.voto, y: l.pagine, titolo: l.titolo }; });

  _distruggiGrafico('scatter');

  if (punti.length < 2) {
    _mostraVuotoGrafico(canvas, 'Servono almeno 2 libri votati con pagine');
    return;
  }

  _grafici['scatter'] = new Chart(canvas, {
    type: 'scatter',
    data: {
      datasets: [{
        label:           'Libri',
        data:            punti,
        backgroundColor: 'rgba(200,150,60,0.6)',
        borderColor:     PALETTE.accento,
        borderWidth:     1,
        pointRadius:     5,
        pointHoverRadius: 7,
      }]
    },
    options: {
      responsive:          true,
      maintainAspectRatio: false,
      scales: {
        x: {
          min:   1,
          max:   10,
          ticks: {
            stepSize: 1,
            color:    PALETTE.testoFantasma,
            font:     { size: 9 },
          },
          grid:  { color: 'rgba(255,255,255,0.04)' },
          title: {
            display: true,
            text:    'Voto',
            color:   PALETTE.testoTenue,
            font:    { size: 10 },
          }
        },
        y: {
          ticks: {
            color:    PALETTE.testoFantasma,
            font:     { size: 9 },
            callback: function(v) { return v.toLocaleString('it-IT'); }
          },
          grid:  { color: 'rgba(255,255,255,0.04)' },
          title: {
            display: true,
            text:    'Pagine',
            color:   PALETTE.testoTenue,
            font:    { size: 10 },
          }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(22,33,62,0.95)',
          titleColor:      PALETTE.testo,
          bodyColor:       PALETTE.testoTenue,
          borderColor:     PALETTE.bordo,
          borderWidth:     1,
          callbacks: {
            title: function(items) {
              return punti[items[0].dataIndex].titolo;
            },
            label: function(ctx) {
              return ' Voto: ' + ctx.raw.x + '  |  Pagine: ' + ctx.raw.y.toLocaleString('it-IT');
            }
          }
        }
      }
    }
  });
}

/* ═══════════════════════════════════════════════════════════════
   HEATMAP ANNUALE — stile GitHub
═══════════════════════════════════════════════════════════════ */

function _aggiornaHeatmap(tuttiLibri) {
  var contenitore = document.getElementById('heatmapContenitore');
  if (!contenitore) return;

  var anno = _periodo.anno || new Date().getFullYear();

  /* Costruisce mappa data → conteggio */
  var mappa = {};
  tuttiLibri.forEach(function(l) {
    if (l.stato !== 'terminato' || !l.dataFine) return;
    var annoLibro = new Date(l.dataFine).getFullYear();
    if (annoLibro !== anno) return;
    var data = l.dataFine.split('T')[0];
    mappa[data] = (mappa[data] || 0) + 1;
  });

  if (Object.keys(mappa).length === 0) {
    contenitore.innerHTML =
      '<p style="font-size:12px;color:var(--colore-testo-fantasma);font-style:italic;">' +
      'Nessuna lettura registrata per ' + anno + '.</p>';
    return;
  }

  /* Genera la griglia — 53 settimane x 7 giorni */
  var inizioAnno = new Date(anno, 0, 1);
  var fineAnno   = new Date(anno, 11, 31);
  var giorno     = new Date(inizioAnno);

  /* Porta al lunedì precedente */
  var dowInizio = giorno.getDay();
  giorno.setDate(giorno.getDate() - (dowInizio === 0 ? 6 : dowInizio - 1));

  var settimane = [];
  var sett      = [];

  while (giorno <= fineAnno || sett.length > 0) {
    var dataStr = giorno.toISOString().split('T')[0];
    var count   = mappa[dataStr] || 0;
    var inAnno  = giorno.getFullYear() === anno;

    sett.push({ data: dataStr, count: count, inAnno: inAnno });

    if (sett.length === 7) {
      settimane.push(sett);
      sett = [];
    }

    giorno.setDate(giorno.getDate() + 1);

    if (giorno > fineAnno && sett.length === 0) break;
  }

  if (sett.length > 0) {
    while (sett.length < 7) sett.push({ data: '', count: 0, inAnno: false });
    settimane.push(sett);
  }

  /* Intensità colore basata sul conteggio */
  function coloreGiorno(count, inAnno) {
    if (!inAnno || count === 0) return 'rgba(255,255,255,0.04)';
    if (count >= 3)  return PALETTE.accento;
    if (count === 2) return 'rgba(200,150,60,0.65)';
    return 'rgba(200,150,60,0.35)';
  }

  var MESI = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
  var GIORNI = ['L','M','M','G','V','S','D'];

  /* Costruisce HTML */
  var html = '<div style="overflow-x:auto;padding-bottom:4px;">' +
    '<div style="display:flex;gap:2px;min-width:max-content;">' +

    /* Etichette giorni settimana */
    '<div style="display:flex;flex-direction:column;gap:1px;margin-right:4px;padding-top:18px;">' +
    GIORNI.map(function(g) {
      return '<div style="height:10px;width:10px;font-size:7px;color:' + PALETTE.testoFantasma + ';' +
             'display:flex;align-items:center;justify-content:center;">' + g + '</div>';
    }).join('') +
    '</div>' +

    settimane.map(function(sett, si) {
      /* Etichetta mese sopra la prima settimana del mese */
      var primoGiornoInAnno = sett.find(function(g) { return g.inAnno && g.data; });
      var etichettaMese = '';
      if (primoGiornoInAnno) {
        var d = new Date(primoGiornoInAnno.data);
        if (d.getDate() <= 7) {
          etichettaMese = MESI[d.getMonth()];
        }
      }

      return '<div style="display:flex;flex-direction:column;gap:1px;">' +
        '<div style="height:12px;font-size:7px;color:' + PALETTE.testoTenue + ';' +
             'white-space:nowrap;margin-bottom:2px;">' + etichettaMese + '</div>' +
        sett.map(function(g) {
          var titolo = g.data + (g.count > 0 ? ' — ' + g.count + ' libro' + (g.count > 1 ? 'i' : '') : '');
          return '<div title="' + titolo + '" style="width:10px;height:10px;border-radius:2px;' +
                 'background:' + coloreGiorno(g.count, g.inAnno) + ';cursor:' + (g.count > 0 ? 'pointer' : 'default') + ';">' +
                 '</div>';
        }).join('') +
      '</div>';
    }).join('') +
    '</div>' +

    /* Legenda */
    '<div style="display:flex;align-items:center;gap:4px;margin-top:8px;justify-content:flex-end;">' +
    '<span style="font-size:9px;color:' + PALETTE.testoFantasma + ';">Meno</span>' +
    ['rgba(255,255,255,0.04)','rgba(200,150,60,0.35)','rgba(200,150,60,0.65)',PALETTE.accento].map(function(c) {
      return '<div style="width:10px;height:10px;border-radius:2px;background:' + c + ';"></div>';
    }).join('') +
    '<span style="font-size:9px;color:' + PALETTE.testoFantasma + ';">Più</span>' +
    '</div>' +
    '</div>';

  contenitore.innerHTML = html;
}

/* ═══════════════════════════════════════════════════════════════
   BARRA OBIETTIVO ANNUALE
═══════════════════════════════════════════════════════════════ */

function _aggiornaObiettivo(terminati, impost) {
  var obiettivo = impost.obiettivoAnnuale || 0;
  var letti     = terminati.length;
  var perc      = obiettivo > 0 ? Math.min(Math.round((letti / obiettivo) * 100), 100) : 0;

  _imposta('statsObiettivoNumeri', letti + ' / ' + obiettivo + ' libri');
  _imposta('statsObiettivoPerc',   perc + '%');

  var barra = document.getElementById('statsObiettivoBarra');
  if (barra) barra.style.width = perc + '%';
}

/* ═══════════════════════════════════════════════════════════════
   STATISTICHE TESTUALI — curiosità
═══════════════════════════════════════════════════════════════ */

function _aggiornaCuriosita(terminati, tuttiLibri) {
  /* Autore più letto */
  var contAutori = {};
  terminati.forEach(function(l) {
    if (l.autore) contAutori[l.autore] = (contAutori[l.autore] || 0) + 1;
  });
  var autoreMax = _massimo(contAutori);
  _imposta('curAutore', autoreMax ? autoreMax.nome + ' (' + autoreMax.n + ')' : '—');

  /* Editore più letto */
  var contEditori = {};
  terminati.forEach(function(l) {
    if (l.editore) contEditori[l.editore] = (contEditori[l.editore] || 0) + 1;
  });
  var editoreMax = _massimo(contEditori);
  _imposta('curEditore', editoreMax ? editoreMax.nome + ' (' + editoreMax.n + ')' : '—');

  /* Mese più prolifico */
  var MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
              'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
  var contMesi = {};
  terminati.forEach(function(l) {
    if (l.dataFine) {
      var m = new Date(l.dataFine).getMonth();
      contMesi[m] = (contMesi[m] || 0) + 1;
    }
  });
  var meseMax = _massimo(contMesi);
  _imposta('curMese', meseMax ? MESI[meseMax.nome] + ' (' + meseMax.n + ')' : '—');

  /* Libro più lungo e più breve */
  var conPagine = terminati.filter(function(l) { return l.pagine; });
  if (conPagine.length > 0) {
    var lungo  = conPagine.reduce(function(m, l) { return l.pagine > m.pagine ? l : m; });
    var breve  = conPagine.reduce(function(m, l) { return l.pagine < m.pagine ? l : m; });
    _imposta('curLungo', _troncaTitolo(lungo.titolo) + ' (' + lungo.pagine.toLocaleString('it-IT') + ' pag.)');
    _imposta('curBreve', _troncaTitolo(breve.titolo) + ' (' + breve.pagine.toLocaleString('it-IT') + ' pag.)');
  } else {
    _imposta('curLungo', '—');
    _imposta('curBreve', '—');
  }

  /* Striscia di lettura — giorni consecutivi con almeno 1 libro terminato */
  var strisciaAttiva = _calcolaStriscia(tuttiLibri);
  _imposta('curStriscia', strisciaAttiva > 0 ? strisciaAttiva + ' libro/i di fila' : '—');
}

/*
 * _calcolaStriscia(libri)
 * Conta quanti libri consecutivi (per data di fine) senza interruzione
 * superiore a 30 giorni — striscia di lettura attiva.
 */
function _calcolaStriscia(libri) {
  var terminati = libri
    .filter(function(l) { return l.stato === 'terminato' && l.dataFine; })
    .sort(function(a, b) { return new Date(b.dataFine) - new Date(a.dataFine); });

  if (terminati.length === 0) return 0;

  var striscia = 1;
  for (var i = 1; i < terminati.length; i++) {
    var diff = (new Date(terminati[i-1].dataFine) - new Date(terminati[i].dataFine)) / 86400000;
    if (diff <= 30) {
      striscia++;
    } else {
      break;
    }
  }
  return striscia;
}

/* ═══════════════════════════════════════════════════════════════
   UTILITÀ
═══════════════════════════════════════════════════════════════ */

/* Imposta il testo di un elemento per id */
function _imposta(id, valore) {
  var el = document.getElementById(id);
  if (el) el.textContent = valore;
}

/* Trova il massimo in un oggetto conteggio */
function _massimo(obj) {
  var chiavi = Object.keys(obj);
  if (chiavi.length === 0) return null;
  var max = chiavi.reduce(function(m, k) { return obj[k] > obj[m] ? k : m; });
  return { nome: max, n: obj[max] };
}

/* Tronca titolo lungo */
function _troncaTitolo(titolo) {
  return titolo && titolo.length > 20 ? titolo.slice(0, 18) + '…' : (titolo || '—');
}

/* Distrugge un grafico Chart.js esistente prima di ridisegnarlo */
function _distruggiGrafico(chiave) {
  if (_grafici[chiave]) {
    _grafici[chiave].destroy();
    delete _grafici[chiave];
  }
}

/* Mostra messaggio vuoto dentro un canvas */
function _mostraVuotoGrafico(canvas, msg) {
  var ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = PALETTE.testoFantasma;
  ctx.font = '11px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(msg, canvas.width / 2, canvas.height / 2);
}

/*
 * _opzioniBase(config)
 * Genera le opzioni comuni a tutti i grafici a barre e linee.
 */
function _opzioniBase(config) {
  config = config || {};
  return {
    responsive:          true,
    maintainAspectRatio: false,
    scales: {
      x: {
        type:  config.xType || 'category',
        display: config.mostraX !== false,
        ticks: {
          color: PALETTE.testoFantasma,
          font:  { size: 9, family: "'Inter', sans-serif" },
          maxRotation: 0,
        },
        grid: { color: 'rgba(255,255,255,0.03)' }
      },
      y: {
        suggestedMax: config.scala ? config.scala.suggestedMax : undefined,
        ticks: {
          color:    PALETTE.testoFantasma,
          font:     { size: 9, family: "'Inter', sans-serif" },
          stepSize: 1,
          callback: function(v) { return Number.isInteger(v) ? v : ''; }
        },
        grid: { color: 'rgba(255,255,255,0.04)' }
      }
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(22,33,62,0.95)',
        titleColor:      PALETTE.testo,
        bodyColor:       PALETTE.testoTenue,
        borderColor:     PALETTE.bordo,
        borderWidth:     1,
        callbacks: {
          label: function(ctx) {
            return ' ' + ctx.raw + (config.tooltipSuffix || '');
          }
        }
      }
    }
  };
}

/* ═══════════════════════════════════════════════════════════════
   ESPORTA REPORT — chiamata dal pulsante download in header Stats
═══════════════════════════════════════════════════════════════ */

function esportaReport() {
  _DB.leggiTuttiLibri().then(function(libri) {
    _DB.leggiTutteImpostazioni().then(function(impost) {
      var terminati = libri.filter(function(l) { return l.stato === 'terminato'; });
      var anno      = new Date().getFullYear();
      var annoCorr  = terminati.filter(function(l) {
        return l.dataFine && new Date(l.dataFine).getFullYear() === anno;
      });

      var votiValidi = terminati.filter(function(l) { return l.voto; }).map(function(l) { return l.voto; });
      var votoMedio  = votiValidi.length
        ? (votiValidi.reduce(function(s, v) { return s + v; }, 0) / votiValidi.length).toFixed(1)
        : 'N/D';

      var report =
        'BUONA LETTURA — Report statistiche\n' +
        'Generato il: ' + new Date().toLocaleDateString('it-IT') + '\n' +
        '═'.repeat(40) + '\n\n' +
        'TOTALE LIBRI LETTI:     ' + terminati.length + '\n' +
        'LIBRI ANNO ' + anno + ':       ' + annoCorr.length + ' / ' + (impost.obiettivoAnnuale || '—') + '\n' +
        'VOTO MEDIO:             ' + votoMedio + '\n' +
        'PAGINE TOTALI:          ' + terminati.reduce(function(s, l) { return s + (l.pagine || 0); }, 0).toLocaleString('it-IT') + '\n\n' +
        '─'.repeat(40) + '\n' +
        'CLASSIFICA (per voto)\n' +
        '─'.repeat(40) + '\n';

      var classifica = terminati
        .filter(function(l) { return l.voto; })
        .sort(function(a, b) {
          if (b.voto !== a.voto) return b.voto - a.voto;
          return a.titolo.localeCompare(b.titolo, 'it');
        });

      classifica.forEach(function(l, i) {
        report += (i + 1) + '. ' + l.titolo + ' — ' + l.autore + '  [' + l.voto + '/10]\n';
      });

      var blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
      var url  = URL.createObjectURL(blob);
      var data = new Date().toISOString().split('T')[0];
      var a    = document.createElement('a');
      a.href   = url;
      a.download = 'buona-lettura-report-' + data + '.txt';
      a.click();
      URL.revokeObjectURL(url);
    });
  });
}

/* ═══════════════════════════════════════════════════════════════
   ESPOSIZIONE GLOBALE
═══════════════════════════════════════════════════════════════ */
Object.assign(window, {
  aggiornaStats,
  esportaReport,
  applicaIntervallo,
});
