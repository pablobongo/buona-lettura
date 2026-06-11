/*
 * app.js — Logica principale dell'applicazione
 * ═══════════════════════════════════════════════════════════════
 *
 * Questo file implementa tutte le funzioni stub definite in app.html:
 *  - Scaffale libri: rendering dorsi, filtri, ordinamento
 *  - Form aggiunta/modifica libro
 *  - Scheda libro completa con copertina, dati, voto, link esterni
 *  - Classifica perpetua
 *  - Sezione impostazioni: tema, font, obiettivo, generi, backup
 *  - Aggiornamento Home con dati reali dal DB
 *
 * Dipende da: db.js (deve essere caricato prima)
 * ═══════════════════════════════════════════════════════════════
 */

'use strict';

/* Riferimento breve al modulo DB */
const DB = window.BuonaLetturaDB;

/* ═══════════════════════════════════════════════════════════════
   SCAFFALE — rendering e filtri
═══════════════════════════════════════════════════════════════ */

/* Filtro e ordinamento attivi nello scaffale */
let filtroAttivo  = 'tutti';
let ordineAttivo  = 'dataInserimento-desc';

/*
 * aggiornaLibreria()
 * Sovrascrive lo stub in app.html.
 * Carica i libri dal DB, applica filtri e disegna lo scaffale.
 */
async function aggiornaLibreria() {
  await disegnaScaffale();
  await aggiornaSuggerimentoUI();
}

/*
 * disegnaScaffale()
 * Genera i dorsi dei libri suddivisi in ripiani.
 * Ogni ripiano contiene al massimo LIBRI_PER_RIPIANO libri.
 */
async function disegnaScaffale() {
  const LIBRI_PER_RIPIANO = 8;

  const contenitore = document.getElementById('scaffalePiani');
  const vuoto       = document.getElementById('scaffaleVuoto');
  if (!contenitore) return;

  /* Costruisce i filtri da passare al DB */
  const filtri = costruisciFiltri();
  let libri;
  try {
    libri = await DB.leggiTuttiLibri(filtri);
  } catch (e) {
    console.error('[BL] Errore caricamento libreria:', e);
    return;
  }

  if (libri.length === 0) {
    contenitore.innerHTML = '';
    if (vuoto) vuoto.style.display = 'flex';
    return;
  }

  if (vuoto) vuoto.style.display = 'none';

  /* Suddivide i libri in gruppi da LIBRI_PER_RIPIANO */
  const ripiani = [];
  for (let i = 0; i < libri.length; i += LIBRI_PER_RIPIANO) {
    ripiani.push(libri.slice(i, i + LIBRI_PER_RIPIANO));
  }

  contenitore.innerHTML = ripiani.map(gruppo => `
    <div class="ripiano">
      <div class="libri-fila">
        ${gruppo.map(libro => generaDorso(libro)).join('')}
      </div>
      <div class="mensola"></div>
    </div>
  `).join('');

  /* Aggiunge i listener click sui dorsi */
  contenitore.querySelectorAll('.libro-dorso').forEach(el => {
    el.addEventListener('click', () => apriScheda(el.dataset.id));
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') apriScheda(el.dataset.id);
    });
  });
}

/*
 * generaDorso(libro)
 * Genera l'HTML di un singolo dorso libro per lo scaffale.
 * Altezza variabile in base al numero di pagine (3 taglie).
 */
function generaDorso(libro) {
  /* Altezza dorso basata sul numero di pagine */
  /* Altezza dorso basata sul numero di pagine — taglie aumentate */
  let altezza = 100;
  if (libro.pagine) {
    if      (libro.pagine > 500) altezza = 130;
    else if (libro.pagine > 300) altezza = 112;
    else                         altezza = 90;
  } else {
    const seed = libro.id.charCodeAt(libro.id.length - 1);
    altezza = 90 + (seed % 3) * 20;
  }

  /* Larghezza aumentata per migliore leggibilità */
  const seed2  = libro.id.charCodeAt(3) || 0;
  const larghe = 26 + (seed2 % 3) * 3; /* 26, 29 o 32px */

  /* Titolo troncato per il dorso */
  const titoloBordo = libro.titolo.length > 18
    ? libro.titolo.slice(0, 16) + '…'
    : libro.titolo;

  /* Indicatore stato — puntino colorato in cima al dorso */
  const coloreStato = {
    'in-corso':   '#E8C06A',
    'terminato':  'transparent',
    'sospeso':    '#E05C5C',
    'da-leggere': 'rgba(255,255,255,0.2)',
  }[libro.stato] || 'transparent';

  return `
    <div class="libro-dorso"
         data-id="${libro.id}"
         role="button"
         tabindex="0"
         aria-label="${libro.titolo} di ${libro.autore}"
         style="width:${larghe}px; height:${altezza}px; background:${libro.colore || '#4A3728'};">
      ${coloreStato !== 'transparent'
        ? `<div style="position:absolute;top:3px;left:50%;transform:translateX(-50%);
                       width:5px;height:5px;border-radius:50%;
                       background:${coloreStato};"></div>`
        : ''}
      <span class="dorso-testo">${titoloBordo}</span>
    </div>`;
}

/*
 * costruisciFiltri()
 * Converte filtroAttivo e ordineAttivo in oggetto filtri per DB.leggiTuttiLibri()
 */
function costruisciFiltri() {
  const filtri = { ordine: ordineAttivo };

  switch (filtroAttivo) {
    case 'in-corso':   filtri.stato    = 'in-corso';   break;
    case 'terminato':  filtri.stato    = 'terminato';  break;
    case 'sospeso':    filtri.stato    = 'sospeso';    break;
    case 'da-leggere': filtri.stato    = 'da-leggere'; break;
    case 'kindle':     filtri.supporto = 'kindle';     break;
    case 'cartaceo':   filtri.supporto = 'cartaceo';   break;
    case 'pdf':        filtri.supporto = 'pdf';        break;
    case 'az':
      filtri.ordine = 'az';
      break;
    case 'voto':
      filtri.ordine = 'voto-desc';
      filtri.stato  = 'terminato';
      break;
    default: /* 'tutti' — nessun filtro */ break;
  }

  return filtri;
}

/*
 * Gestione click sui chip filtro della libreria
 */
document.addEventListener('DOMContentLoaded', () => {
  const barraFiltri = document.getElementById('barraFiltri');
  if (barraFiltri) {
    barraFiltri.addEventListener('click', async (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;

      barraFiltri.querySelectorAll('.chip').forEach(c => c.classList.remove('attivo'));
      chip.classList.add('attivo');
      filtroAttivo = chip.dataset.filtro;
      await disegnaScaffale();
    });
  }

  /* Popola i generi nel form dopo che il DOM è pronto */
  inizializzaApp();
});

/*
 * inizializzaApp()
 * Punto di ingresso principale — chiamata dopo DOMContentLoaded.
 */
async function inizializzaApp() {
  /* Aggiorna la home con dati reali */
  await aggiornaHomeConDB();
}

/* ═══════════════════════════════════════════════════════════════
   HOME — aggiornamento con dati reali dal DB
═══════════════════════════════════════════════════════════════ */

/*
 * aggiornaHomeConDB()
 * Sostituisce la logica stub in app.html con dati reali da IndexedDB.
 */
async function aggiornaHomeConDB() {
  try {
    const anno   = new Date().getFullYear();
    const stats  = await DB.calcolaStatistiche(anno);
    const impost = await DB.leggiTutteImpostazioni();
    const tutti  = await DB.leggiTuttiLibri();

    /* Obiettivo annuale */
    const obiettivo = impost.obiettivoAnnuale || 0;
    const letti     = stats.totaleLibri;
    const perc      = obiettivo > 0 ? Math.min(Math.round((letti / obiettivo) * 100), 100) : 0;

    const elObiEt  = document.getElementById('obiettivoEtichetta');
    const elObiNum = document.getElementById('obiettivoNumeri');
    const elObiPer = document.getElementById('obiettivoPerc');
    const elObiFil = document.getElementById('obiettivoFill');

    if (elObiEt)  elObiEt.textContent  = `Obiettivo ${anno}`;
    if (elObiNum) elObiNum.textContent  = `${letti} letti su ${obiettivo}`;
    if (elObiPer) elObiPer.textContent  = `${perc}%`;
    if (elObiFil) elObiFil.style.width  = `${perc}%`;

    /* Statistiche rapide */
    const elLibri  = document.getElementById('statLibriAnno');
    const elPagine = document.getElementById('statPagineAnno');
    const elVoto   = document.getElementById('statVotoAnno');

    if (elLibri)  elLibri.textContent  = stats.totaleLibri;
    if (elPagine) elPagine.textContent = (stats.totalePagine || 0).toLocaleString('it-IT');
    if (elVoto)   elVoto.textContent   = stats.votoMedio
      ? stats.votoMedio.toFixed(1).replace('.', ',')
      : '—';

    /* Libro in corso */
    const inCorso = tutti.find(l => l.stato === 'in-corso');
    aggiornaCardInCorso(inCorso);

    /* Ultimi libri terminati */
    const terminati = tutti
      .filter(l => l.stato === 'terminato' && l.dataFine)
      .sort((a, b) => new Date(b.dataFine) - new Date(a.dataFine));
    aggiornaListaRecenti(terminati, ultimiN);

  } catch (e) {
    console.error('[BL] Errore aggiornamento home:', e);
  }
}

/* ═══════════════════════════════════════════════════════════════
   FORM AGGIUNTA / MODIFICA LIBRO
═══════════════════════════════════════════════════════════════ */

/*
 * apriAggiungiLibro()
 * Sovrascrive lo stub in app.html.
 * Apre il form nella sheet modale per aggiungere un nuovo libro.
 */
async function apriAggiungiLibro() {
  const generi = await DB.leggiGeneri();
  const html   = await generaFormLibro(null, generi);
  apriOverlay(html);
  /* Dopo il render, attiva i listener del form */
  setTimeout(() => attivaListenerForm(null), 50);
}

/*
 * apriModificaLibro(id)
 * Apre il form precompilato con i dati del libro da modificare.
 */
async function apriModificaLibro(id) {
  const libro  = await DB.leggiLibro(id);
  const generi = await DB.leggiGeneri();
  if (!libro) return;
  const html = await generaFormLibro(libro, generi);
  apriOverlay(html);
  setTimeout(() => attivaListenerForm(libro), 50);
}

/*
 * generaFormLibro(libro, generi)
 * Genera l'HTML del form. Se libro è null → form vuoto (aggiunta).
 * Se libro è un oggetto → form precompilato (modifica).
 */
async function generaFormLibro(libro, generi) {
  const v = libro || {};
  const titoloForm = libro ? 'Modifica libro' : 'Aggiungi libro';

  const opzioniGeneri = generi.map(g =>
    `<option value="${g.nome}" ${v.genere === g.nome ? 'selected' : ''}>${g.nome}</option>`
  ).join('');

  const opzioniSupporto = ['cartaceo', 'kindle', 'pdf', 'altro'].map(s =>
    `<option value="${s}" ${(v.supporto || 'cartaceo') === s ? 'selected' : ''}>
      ${{ cartaceo: 'Cartaceo', kindle: 'Kindle', pdf: 'PDF', altro: 'Altro' }[s]}
    </option>`
  ).join('');

  const opzioniStato = [
    { val: 'da-leggere', label: 'Da leggere' },
    { val: 'in-corso',   label: 'In lettura' },
    { val: 'terminato',  label: 'Terminato' },
    { val: 'sospeso',    label: 'Sospeso' },
  ].map(s =>
    `<option value="${s.val}" ${(v.stato || 'da-leggere') === s.val ? 'selected' : ''}>${s.label}</option>`
  ).join('');

  /* Selettore colore dorso */
  const selectorColori = DB.COLORI_DORSI.map(c =>
    `<div class="colore-dorso-opt ${(v.colore || DB.COLORI_DORSI[0]) === c ? 'selezionato' : ''}"
          data-colore="${c}"
          style="background:${c};"
          role="radio"
          aria-label="Colore ${c}"
          tabindex="0"></div>`
  ).join('');

  return `
    <h2 style="font-family:var(--font-titolo);font-size:18px;font-weight:600;
               color:var(--colore-testo);margin-bottom:20px;">${titoloForm}</h2>

    <div id="erroreForm" style="display:none; background:rgba(224,92,92,0.1);
         border:1px solid rgba(224,92,92,0.3); border-radius:8px;
         padding:10px 14px; margin-bottom:14px; font-size:12px; color:#E05C5C;"></div>

    <!-- ISBN + pulsante Cerca (precompila titolo, autore e altri dati) -->
    <div class="campo-form">
      <label class="label-form" for="fIsbn">
        ISBN
        <span style="font-size:10px;color:var(--colore-testo-fantasma);font-weight:400;margin-left:4px;">
          — inserisci per precompilare i campi automaticamente
        </span>
      </label>
      <div style="display:flex; gap:8px; align-items:center;">
        <input class="input-form" type="text" id="fIsbn"
               value="${v.isbn || ''}" placeholder="Es. 9788811683117"
               autocomplete="off" style="flex:1;"
               inputmode="numeric" />
        <button type="button" id="btnCercaLibro"
                onclick="cercaSuGoogleBooks()"
                style="flex-shrink:0; padding:0 14px; height:40px;
                       background:var(--colore-accento); border:none;
                       border-radius:var(--raggio-piccolo); cursor:pointer;
                       color:var(--colore-primario); font-size:11px;
                       font-weight:500; font-family:var(--font-corpo);
                       white-space:nowrap; transition:background var(--transizione);">
          <i class="ti ti-search" aria-hidden="true"></i> Cerca
        </button>
      </div>
      <div id="risultatiCerca" style="margin-top:6px;"></div>
    </div>

    <!-- Titolo -->
    <div class="campo-form">
      <label class="label-form" for="fTitolo">Titolo <span style="color:var(--colore-errore)">*</span></label>
      <input class="input-form" type="text" id="fTitolo"
             value="${v.titolo || ''}" placeholder="Es. A sangue freddo"
             autocomplete="off" />
    </div>

    <!-- Autore -->
    <div class="campo-form">
      <label class="label-form" for="fAutore">Autore <span style="color:var(--colore-errore)">*</span></label>
      <input class="input-form" type="text" id="fAutore"
             value="${v.autore || ''}" placeholder="Es. Truman Capote"
             autocomplete="off" />
    </div>

    <!-- Editore + Anno pubblicazione -->
    <div style="display:grid; grid-template-columns:1fr 100px; gap:10px;">
      <div class="campo-form">
        <label class="label-form" for="fEditore">Editore</label>
        <input class="input-form" type="text" id="fEditore"
               value="${v.editore || ''}" placeholder="Es. Bompiani" />
      </div>
      <div class="campo-form">
        <label class="label-form" for="fAnno">Anno</label>
        <input class="input-form" type="number" id="fAnno"
               value="${v.anno || ''}" placeholder="1980" min="1000" max="2099" />
      </div>
    </div>

    <!-- Pagine + Genere -->
    <div style="display:grid; grid-template-columns:100px 1fr; gap:10px;">
      <div class="campo-form">
        <label class="label-form" for="fPagine">Pagine</label>
        <input class="input-form" type="number" id="fPagine"
               value="${v.pagine || ''}" placeholder="544" min="1" />
      </div>
      <div class="campo-form">
        <label class="label-form" for="fGenere">Genere</label>
        <select class="input-form" id="fGenere">
          <option value="">— Seleziona —</option>
          ${opzioniGeneri}
        </select>
      </div>
    </div>

    <!-- Supporto + Stato -->
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
      <div class="campo-form">
        <label class="label-form" for="fSupporto">Supporto</label>
        <select class="input-form" id="fSupporto">${opzioniSupporto}</select>
      </div>
      <div class="campo-form">
        <label class="label-form" for="fStato">Stato</label>
        <select class="input-form" id="fStato" id="fStato">${opzioniStato}</select>
      </div>
    </div>

    <!-- Date -->
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
      <div class="campo-form">
        <label class="label-form" for="fDataInizio">Inizio lettura</label>
        <input class="input-form" type="date" id="fDataInizio"
               value="${v.dataInizio || ''}" />
      </div>
      <div class="campo-form" id="campoDataFine">
        <label class="label-form" for="fDataFine">Fine lettura</label>
        <input class="input-form" type="date" id="fDataFine"
               value="${v.dataFine || ''}" />
      </div>
    </div>

    <!-- Voto (solo se terminato) -->
    <div class="campo-form" id="campoVoto" style="${(v.stato || '') !== 'terminato' ? 'display:none' : ''}">
      <label class="label-form">Voto (1–10)</label>
      <div class="selettore-voto" role="group" aria-label="Seleziona voto">
        ${Array.from({length: 10}, (_, i) => i + 1).map(n => `
          <button type="button"
                  class="btn-voto ${(v.voto || 0) === n ? 'attivo' : ''}"
                  data-voto="${n}"
                  aria-label="Voto ${n}"
                  aria-pressed="${(v.voto || 0) === n}">${n}</button>
        `).join('')}
      </div>
    </div>

    <!-- Avanzamento (solo se in-corso) -->
    <div class="campo-form" id="campoAvanzamento"
         style="${(v.stato || '') !== 'in-corso' ? 'display:none' : ''}">
      <label class="label-form" for="fAvanzamento">
        Avanzamento: <span id="avanzamentoVal">${v.avanzamento || 0}</span>%
      </label>
      <input type="range" id="fAvanzamento"
             min="0" max="100" value="${v.avanzamento || 0}"
             style="width:100%; accent-color:var(--colore-accento); margin-top:6px;" />
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:8px;">
        <div>
          <label class="label-form" for="fPaginaCorrente" style="font-size:10px;">Pagina corrente</label>
          <input class="input-form" type="number" id="fPaginaCorrente"
                 value="${v.paginaCorrente || ''}" placeholder="Es. 234"
                 style="padding:7px 10px; font-size:12px;" />
        </div>
      </div>
    </div>

    <!-- Commento personale -->
    <div class="campo-form">
      <label class="label-form" for="fCommento">Note personali</label>
      <textarea class="input-form" id="fCommento" rows="3"
                placeholder="Impressioni, citazioni, perché l'ho letto…"
                style="resize:vertical; min-height:70px;">${v.commento || ''}</textarea>
    </div>

    <!-- Colore dorso -->
    <div class="campo-form">
      <label class="label-form">Colore dorso</label>
      <div class="griglia-colori" role="radiogroup" aria-label="Colore dorso libro">
        ${selectorColori}
      </div>
      <input type="hidden" id="fColore" value="${v.colore || DB.COLORI_DORSI[0]}" />
    </div>

    <!-- Pulsanti azione -->
    <div style="display:flex; gap:10px; margin-top:24px;">
      <button class="btn-secondario" style="flex:1;" onclick="_chiudiOverlay()">
        Annulla
      </button>
      <button class="btn-primario" style="flex:1;"
              onclick="salvaLibro('${libro ? libro.id : ''}')">
        <i class="ti ti-check" aria-hidden="true"></i>
        ${libro ? 'Salva modifiche' : 'Aggiungi libro'}
      </button>
    </div>

    <style>
      .campo-form { margin-bottom: 14px; }
      .label-form {
        display: block;
        font-size: 11px;
        font-weight: 500;
        color: var(--colore-testo-tenue);
        margin-bottom: 5px;
        letter-spacing: 0.03em;
      }
      .input-form {
        width: 100%;
        background: var(--colore-superficie);
        border: 1px solid var(--colore-bordo-sottile);
        border-radius: var(--raggio-piccolo);
        padding: 10px 12px;
        font-size: 13px;
        color: var(--colore-testo);
        font-family: var(--font-corpo);
        transition: border-color var(--transizione);
        min-height: 40px;
      }
      .input-form:focus {
        outline: none;
        border-color: var(--colore-accento);
      }
      .input-form option { background: var(--colore-secondario); }
      .selettore-voto {
        display: flex;
        gap: 5px;
        flex-wrap: wrap;
      }
      .btn-voto {
        width: 36px; height: 36px;
        border-radius: 50%;
        background: var(--colore-superficie);
        border: 1px solid var(--colore-bordo-sottile);
        color: var(--colore-testo-tenue);
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: all var(--transizione);
        font-family: var(--font-corpo);
      }
      .btn-voto:hover { border-color: var(--colore-accento); color: var(--colore-accento); }
      .btn-voto.attivo {
        background: var(--colore-accento);
        border-color: var(--colore-accento);
        color: var(--colore-primario);
        font-weight: 600;
      }
      .griglia-colori {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 4px;
      }
      .colore-dorso-opt {
        width: 24px; height: 24px;
        border-radius: 4px;
        cursor: pointer;
        border: 2px solid transparent;
        transition: transform var(--transizione), border-color var(--transizione);
      }
      .colore-dorso-opt:hover { transform: scale(1.15); }
      .colore-dorso-opt.selezionato {
        border-color: var(--colore-accento);
        transform: scale(1.2);
      }
    </style>
  `;
}

/*
 * attivaListenerForm(libro)
 * Aggiunge i listener interattivi al form dopo il render.
 */
function attivaListenerForm(libro) {
  /* Mostra/nasconde campi in base allo stato */
  const selectStato = document.getElementById('fStato');
  if (selectStato) {
    selectStato.addEventListener('change', () => {
      const stato = selectStato.value;
      const campoVoto  = document.getElementById('campoVoto');
      const campoAv    = document.getElementById('campoAvanzamento');
      if (campoVoto) campoVoto.style.display  = stato === 'terminato' ? '' : 'none';
      if (campoAv)   campoAv.style.display    = stato === 'in-corso'  ? '' : 'none';
    });
  }

  /* Selettore voto */
  document.querySelectorAll('.btn-voto').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-voto').forEach(b => {
        b.classList.remove('attivo');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('attivo');
      btn.setAttribute('aria-pressed', 'true');
    });
  });

  /* Slider avanzamento */
  const slider = document.getElementById('fAvanzamento');
  const valEl  = document.getElementById('avanzamentoVal');
  if (slider && valEl) {
    slider.addEventListener('input', () => {
      valEl.textContent = slider.value;
    });
    /* Calcolo automatico avanzamento da pagina corrente */
    const fPagCor = document.getElementById('fPaginaCorrente');
    const fPagine = document.getElementById('fPagine');
    if (fPagCor && fPagine) {
      fPagCor.addEventListener('input', () => {
        const pag = parseInt(fPagine.value, 10);
        const cor = parseInt(fPagCor.value, 10);
        if (pag > 0 && cor > 0) {
          const perc = Math.min(Math.round((cor / pag) * 100), 100);
          slider.value        = perc;
          valEl.textContent   = perc;
        }
      });
    }
  }

  /* Selettore colore dorso */
  document.querySelectorAll('.colore-dorso-opt').forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('.colore-dorso-opt').forEach(o => o.classList.remove('selezionato'));
      opt.classList.add('selezionato');
      const fColore = document.getElementById('fColore');
      if (fColore) fColore.value = opt.dataset.colore;
    });
    opt.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') opt.click();
    });
  });
}

/*
 * salvaLibro(id)
 * Raccoglie i dati dal form e salva nel DB (aggiunta o modifica).
 */
async function salvaLibro(id) {
  const erroreEl = document.getElementById('erroreForm');

  /* Raccoglie i valori */
  const dati = {
    titolo:         (document.getElementById('fTitolo')?.value || '').trim(),
    autore:         (document.getElementById('fAutore')?.value || '').trim(),
    editore:        (document.getElementById('fEditore')?.value || '').trim(),
    anno:           parseInt(document.getElementById('fAnno')?.value, 10) || null,
    pagine:         parseInt(document.getElementById('fPagine')?.value, 10) || null,
    genere:         document.getElementById('fGenere')?.value || '',
    supporto:       document.getElementById('fSupporto')?.value || 'cartaceo',
    stato:          document.getElementById('fStato')?.value || 'da-leggere',
    dataInizio:     document.getElementById('fDataInizio')?.value || null,
    dataFine:       document.getElementById('fDataFine')?.value || null,
    avanzamento:    parseInt(document.getElementById('fAvanzamento')?.value, 10) || 0,
    paginaCorrente: parseInt(document.getElementById('fPaginaCorrente')?.value, 10) || null,
    isbn:           (document.getElementById('fIsbn')?.value || '').trim(),
    commento:       (document.getElementById('fCommento')?.value || '').trim(),
    colore:         document.getElementById('fColore')?.value || DB.COLORI_DORSI[0],
    copertina:      document.getElementById('fColore')?.dataset?.copertina || null,
  };

  /* Voto dal selettore */
  const btnVotoAttivo = document.querySelector('.btn-voto.attivo');
  dati.voto = btnVotoAttivo ? parseInt(btnVotoAttivo.dataset.voto, 10) : null;

  /* Validazione */
  if (!dati.titolo) {
    mostraErroreForm('Il titolo è obbligatorio.'); return;
  }
  if (!dati.autore) {
    mostraErroreForm('L\'autore è obbligatorio.'); return;
  }
  if (dati.stato === 'terminato' && !dati.voto) {
    mostraErroreForm('Inserisci un voto per i libri terminati.'); return;
  }

  /* Salva nel DB */
  try {
    if (id) {
      await DB.aggiornaLibro(id, dati);
    } else {
      await DB.aggiungiLibro(dati);
    }

    _chiudiOverlay();

    /* Ricarica la sezione attiva */
    await aggiornaHomeConDB();
    await disegnaScaffale();
    await aggiornaClassifica();

  } catch (e) {
    mostraErroreForm('Errore durante il salvataggio: ' + e.message);
  }
}

function mostraErroreForm(msg) {
  const el = document.getElementById('erroreForm');
  if (el) {
    el.textContent   = msg;
    el.style.display = 'block';
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

/* ═══════════════════════════════════════════════════════════════
   SCHEDA LIBRO — visualizzazione completa
═══════════════════════════════════════════════════════════════ */

/*
 * apriScheda(id)
 * Sovrascrive lo stub in app.html.
 * Apre la scheda completa del libro nella sheet modale.
 */
async function apriScheda(id) {
  const libro = await DB.leggiLibro(id);
  if (!libro) return;

  /* Costruisce URL Amazon e Libraccio */
  const query       = encodeURIComponent(`${libro.titolo} ${libro.autore}`);
  const urlAmazon   = `https://www.amazon.it/s?k=${query}`;
  const urlIBS = `https://www.ibs.it/search/?ts=as&query=${query}`;

  /* Stelle voto (cerchi pieni/vuoti) */
  const cerchiVoto = libro.voto
    ? Array.from({length: 10}, (_, i) =>
        `<span style="
          display:inline-block;
          width:14px; height:14px;
          border-radius:50%;
          background:${i < libro.voto ? 'var(--colore-accento)' : 'var(--colore-bordo-sottile)'};
          margin-right:3px;
          vertical-align:middle;
        "></span>`
      ).join('')
    : '<span style="color:var(--colore-testo-fantasma);font-size:12px;">Non votato</span>';

  /* Dati formattati */
  const dataInizioFmt = libro.dataInizio
    ? new Date(libro.dataInizio).toLocaleDateString('it-IT', {day:'numeric', month:'long', year:'numeric'})
    : '—';
  const dataFineFmt = libro.dataFine
    ? new Date(libro.dataFine).toLocaleDateString('it-IT', {day:'numeric', month:'long', year:'numeric'})
    : '—';

  /* Durata lettura in giorni */
  let durata = '—';
  if (libro.dataInizio && libro.dataFine) {
    const gg = Math.round(
      (new Date(libro.dataFine) - new Date(libro.dataInizio)) / (1000 * 60 * 60 * 24)
    );
    durata = gg === 1 ? '1 giorno' : `${gg} giorni`;
  }

  const etichettaStato = {
    'terminato':  'Terminato',
    'in-corso':   'In lettura',
    'sospeso':    'Sospeso',
    'da-leggere': 'Da leggere',
  }[libro.stato] || libro.stato;

  const coloreStato = {
    'terminato':  'var(--colore-successo)',
    'in-corso':   'var(--colore-accento)',
    'sospeso':    'var(--colore-errore)',
    'da-leggere': 'var(--colore-testo-fantasma)',
  }[libro.stato];

  const html = `
    <!-- Intestazione con dorso colorato -->
    <div style="display:flex; gap:14px; align-items:flex-start; margin-bottom:20px;">
      <div style="
        width:52px; min-height:74px;
        background:${libro.colore || '#4A3728'};
        border-radius:3px 6px 6px 3px;
        display:flex; align-items:center; justify-content:center;
        flex-shrink:0;
        box-shadow:3px 3px 10px rgba(0,0,0,0.4);
        position:relative; overflow:hidden;">
        ${libro.copertina
          ? `<img src="${libro.copertina}" alt="Copertina ${libro.titolo}"
                  style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;" />`
          : `<i class="ti ti-book" style="font-size:20px;color:rgba(255,255,255,0.25);" aria-hidden="true"></i>`
        }
      </div>
      <div style="flex:1; min-width:0;">
        <div style="margin-bottom:6px;">
          <span style="
            font-size:10px; padding:2px 8px; border-radius:20px;
            background:${coloreStato}22;
            color:${coloreStato};
            border:1px solid ${coloreStato}44;
          ">${etichettaStato}</span>
        </div>
        <h2 style="
          font-family:var(--font-titolo); font-size:17px; font-weight:600;
          color:var(--colore-testo); margin-bottom:4px; line-height:1.3;">
          ${libro.titolo}
        </h2>
        <p style="font-size:13px; color:var(--colore-testo-tenue);">${libro.autore}</p>
        ${libro.editore
          ? `<p style="font-size:11px; color:var(--colore-testo-fantasma); margin-top:2px;">
               ${libro.editore}${libro.anno ? ` · ${libro.anno}` : ''}
             </p>`
          : ''}
      </div>
    </div>

    <!-- Voto -->
    ${libro.stato === 'terminato' ? `
      <div style="margin-bottom:16px;">
        <p style="font-size:11px; color:var(--colore-testo-fantasma); margin-bottom:6px;">Voto</p>
        <div style="display:flex; align-items:center; gap:10px;">
          <div>${cerchiVoto}</div>
          ${libro.voto ? `
            <span style="
              font-family:var(--font-titolo); font-size:22px; font-weight:600;
              color:var(--colore-accento);">${libro.voto}/10</span>
          ` : ''}
        </div>
      </div>
    ` : ''}

    <!-- Avanzamento (se in-corso) -->
    ${libro.stato === 'in-corso' ? `
      <div style="margin-bottom:16px;">
        <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
          <p style="font-size:11px; color:var(--colore-testo-fantasma);">Avanzamento</p>
          <span style="font-size:12px; font-weight:500; color:var(--colore-accento);">
            ${libro.avanzamento || 0}%
          </span>
        </div>
        <div style="height:5px; background:var(--colore-bordo-sottile); border-radius:3px;">
          <div style="height:100%; width:${libro.avanzamento || 0}%;
                      background:var(--colore-accento); border-radius:3px;"></div>
        </div>
        ${libro.paginaCorrente && libro.pagine
          ? `<p style="font-size:10px; color:var(--colore-testo-fantasma); margin-top:4px;">
               Pag. ${libro.paginaCorrente} di ${libro.pagine}
             </p>`
          : ''}
      </div>
    ` : ''}

    <!-- Dati libro -->
    <div style="
      background:var(--colore-superficie);
      border:1px solid var(--colore-bordo-sottile);
      border-radius:var(--raggio); padding:2px 0; margin-bottom:16px;">
      ${[
        ['Genere',   libro.genere   || '—'],
        ['Pagine',   libro.pagine   ? libro.pagine.toLocaleString('it-IT') : '—'],
        ['Supporto', { cartaceo:'Cartaceo', kindle:'Kindle', pdf:'PDF', altro:'Altro' }[libro.supporto] || '—'],
        ['Inizio',   dataInizioFmt],
        ['Fine',     dataFineFmt],
        ['Durata',   durata],
        ['ISBN',     libro.isbn || '—'],
        ['Lingua',   libro.lingua === 'it' ? 'Italiano' : libro.lingua || '—'],
      ].map(([label, val]) => `
        <div style="
          display:flex; justify-content:space-between; align-items:center;
          padding:9px 14px; border-bottom:1px solid var(--colore-bordo-sottile);">
          <span style="font-size:12px; color:var(--colore-testo-fantasma);">${label}</span>
          <span style="font-size:12px; font-weight:500; color:var(--colore-testo);">${val}</span>
        </div>
      `).join('')}
    </div>

    <!-- Commento personale -->
    ${libro.commento ? `
      <div style="
        background:var(--colore-superficie);
        border:1px solid var(--colore-bordo-sottile);
        border-radius:var(--raggio); padding:12px 14px; margin-bottom:16px;">
        <p style="font-size:10px; color:var(--colore-testo-fantasma); margin-bottom:6px; text-transform:uppercase; letter-spacing:0.08em;">Note personali</p>
        <p style="font-size:13px; color:var(--colore-testo-tenue); line-height:1.65;
                  font-family:var(--font-titolo); font-style:italic;">"${libro.commento}"</p>
      </div>
    ` : ''}

    <!-- Link esterni -->
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:14px;">
      <a href="${urlAmazon}" target="_blank" rel="noopener"
         style="display:flex; align-items:center; justify-content:center; gap:6px;
                padding:10px; background:var(--colore-superficie);
                border:1px solid var(--colore-bordo-sottile); border-radius:var(--raggio-piccolo);
                font-size:12px; color:var(--colore-testo-tenue); text-decoration:none;
                transition:background var(--transizione);">
        <i class="ti ti-brand-amazon" aria-hidden="true"></i> Amazon.it
      </a>
      <a href="${urlIBS}" target="_blank" rel="noopener"
         style="display:flex; align-items:center; justify-content:center; gap:6px;
                padding:10px; background:var(--colore-superficie);
                border:1px solid var(--colore-bordo-sottile); border-radius:var(--raggio-piccolo);
                font-size:12px; color:var(--colore-testo-tenue); text-decoration:none;
                transition:background var(--transizione);">
        <i class="ti ti-book-2" aria-hidden="true"></i> IBS.it
      </a>
    </div>

    <!-- Pulsanti azione -->
    <div style="display:flex; gap:8px;">
      <button class="btn-secondario" style="flex:1;"
              onclick="apriModificaLibro('${libro.id}')">
        <i class="ti ti-pencil" aria-hidden="true"></i> Modifica
      </button>
      <button class="btn-secondario" style="color:var(--colore-errore);border-color:rgba(224,92,92,0.2);"
              onclick="confermaEliminaLibro('${libro.id}', '${libro.titolo.replace(/'/g, "\\'")}')">
        <i class="ti ti-trash" aria-hidden="true"></i>
      </button>
    </div>
  `;

  apriOverlay(html);
}

/*
 * confermaEliminaLibro(id, titolo)
 * Mostra conferma prima di eliminare.
 */
async function confermaEliminaLibro(id, titolo) {
  const html = `
    <div style="text-align:center; padding:10px 0;">
      <div style="width:56px;height:56px;background:rgba(224,92,92,0.1);
                  border-radius:16px;display:flex;align-items:center;
                  justify-content:center;margin:0 auto 16px;">
        <i class="ti ti-trash" style="font-size:24px;color:var(--colore-errore);" aria-hidden="true"></i>
      </div>
      <h2 style="font-family:var(--font-titolo);font-size:17px;font-weight:600;
                 color:var(--colore-testo);margin-bottom:8px;">Elimina libro</h2>
      <p style="font-size:13px;color:var(--colore-testo-tenue);line-height:1.6;margin-bottom:24px;">
        Stai per eliminare <strong style="color:var(--colore-testo);">${titolo}</strong>.<br>
        Questa operazione è irreversibile.
      </p>
      <div style="display:flex;gap:10px;">
        <button class="btn-secondario" style="flex:1;" onclick="_chiudiOverlay()">Annulla</button>
        <button class="btn-primario"
                style="flex:1;background:var(--colore-errore);"
                onclick="eseguiEliminaLibro('${id}')">
          Elimina
        </button>
      </div>
    </div>`;
  apriOverlay(html);
}

async function eseguiEliminaLibro(id) {
  try {
    await DB.eliminaLibro(id);
    _chiudiOverlay();
    await aggiornaHomeConDB();
    await disegnaScaffale();
    await aggiornaClassifica();
  } catch (e) {
    console.error('[BL] Errore eliminazione libro:', e);
  }
}

/* ═══════════════════════════════════════════════════════════════
   CLASSIFICA PERPETUA
═══════════════════════════════════════════════════════════════ */

/*
 * aggiornaClassifica()
 * Sovrascrive lo stub in app.html.
 * Carica tutti i libri terminati e li ordina per voto desc, poi alfabetico.
 */
async function aggiornaClassifica() {
  const lista = document.getElementById('listaClassifica');
  if (!lista) return;

  try {
    const libri = await DB.leggiTuttiLibri({
      stato:  'terminato',
      ordine: 'voto-desc',
    });

    const conVoto = libri.filter(l => l.voto !== null);

    if (conVoto.length === 0) {
      lista.innerHTML = `
        <div class="stato-vuoto">
          <div class="stato-vuoto-icona"><i class="ti ti-award" aria-hidden="true"></i></div>
          <p class="stato-vuoto-titolo">Classifica vuota</p>
          <p class="stato-vuoto-testo">Termina e vota almeno un libro per vedere la classifica.</p>
        </div>`;
      return;
    }

    lista.innerHTML = conVoto.map((libro, idx) => {
      const pos = idx + 1;
      const classePos = pos === 1 ? 'pos-oro' : pos === 2 ? 'pos-argento' : pos === 3 ? 'pos-bronzo' : 'pos-altro';
      const emojiPos  = pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : pos;
      const larghBarra = `${(libro.voto / 10) * 100}%`;

      return `
        <div class="classifica-voce" onclick="apriScheda('${libro.id}')"
             role="button" tabindex="0" aria-label="${pos}. ${libro.titolo}">
          <div class="classifica-posizione ${classePos}">${emojiPos}</div>
          <div class="classifica-info">
            <p class="classifica-titolo">${libro.titolo}</p>
            <p class="classifica-autore">${libro.autore}</p>
            <div class="classifica-barra">
              <div class="classifica-barra-fill" style="width:${larghBarra}"></div>
            </div>
          </div>
          <div class="classifica-barra-wrap">
            <span class="classifica-voto">${libro.voto}</span>
          </div>
        </div>`;
    }).join('');

  } catch (e) {
    console.error('[BL] Errore aggiornamento classifica:', e);
  }
}

/* ═══════════════════════════════════════════════════════════════
   IMPOSTAZIONI
═══════════════════════════════════════════════════════════════ */

/*
 * aggiornaImpostazioni()
 * Sovrascrive lo stub in app.html.
 * Legge le impostazioni dal DB e aggiorna i valori visualizzati.
 */
async function aggiornaImpostazioni() {
  try {
    const impost = await DB.leggiTutteImpostazioni();

    /* Aggiorna i valori visualizzati nelle righe */
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = `${val} <i class="ti ti-chevron-right" aria-hidden="true"></i>`;
    };

    set('valTema',    { scuro: 'Scuro', chiaro: 'Chiaro', sistema: 'Sistema' }[impost.tema] || 'Scuro');
    set('valFont',    impost.font || 'Lora');
    set('valObiettivo', `${impost.obiettivoAnnuale || 0} libri`);
    set('valVotoMin', impost.votoMinimoConsigliato || 7);

    /* Conta generi */
    const generi = await DB.leggiGeneri();
    set('valGeneri', `${generi.length} generi`);

    /* Toggle promemoria */
    const toggle = document.getElementById('togglePromemoria');
    if (toggle) {
      const attivo = impost.promemoria || false;
      toggle.classList.toggle('attivo', attivo);
      toggle.setAttribute('aria-pressed', attivo);
    }

  } catch (e) {
    console.error('[BL] Errore aggiornamento impostazioni:', e);
  }
}

/*
 * apriObiettivoAnnuale()
 * Sheet per modificare l'obiettivo letture.
 */
function apriObiettivoAnnuale() {
  DB.leggiImpostazione('obiettivoAnnuale').then(function(val) {
    val = val || 24;
    apriOverlay(
      '<h2 style="font-family:var(--font-titolo);font-size:17px;font-weight:600;color:var(--colore-testo);margin-bottom:20px;">Obiettivo annuale</h2>' +
      '<p style="font-size:13px;color:var(--colore-testo-tenue);margin-bottom:16px;line-height:1.6;">Quanti libri vuoi leggere quest&#39;anno?<br>Questo numero appare nella Home e nelle Statistiche.</p>' +
      '<div style="margin-bottom:14px;">' +
        '<label style="display:block;font-size:11px;font-weight:500;color:var(--colore-testo-tenue);margin-bottom:5px;">Numero di libri</label>' +
        '<input id="inputObiettivo" type="number" min="1" max="365" value="' + val + '" style="width:100%;background:var(--colore-superficie);border:1px solid var(--colore-bordo-sottile);border-radius:var(--raggio-piccolo);padding:14px;font-size:24px;font-family:var(--font-titolo);text-align:center;color:var(--colore-testo);" />' +
      '</div>' +
      '<div style="display:flex;gap:10px;margin-top:20px;">' +
        '<button class="btn-secondario" style="flex:1;" onclick="_chiudiOverlay()">Annulla</button>' +
        '<button class="btn-primario" style="flex:1;" onclick="salvaObiettivo()">Salva</button>' +
      '</div>'
    );
  });
}

function salvaObiettivo() {
  var val = parseInt(document.getElementById('inputObiettivo').value, 10);
  if (!val || val < 1) return;
  DB.scriviImpostazione('obiettivoAnnuale', val).then(function() {
    _chiudiOverlay();
    aggiornaImpostazioni();
    aggiornaHomeConDB();
  });
}

function apriSceltaTema() {
  DB.leggiImpostazione('tema').then(function(corrente) {
    corrente = corrente || 'scuro';
    var temi = [
      { val: 'scuro',   label: 'Scuro' },
      { val: 'chiaro',  label: 'Chiaro' },
      { val: 'sistema', label: 'Segui sistema' }
    ];
    var html = '<h2 style="font-family:var(--font-titolo);font-size:17px;font-weight:600;color:var(--colore-testo);margin-bottom:20px;">Tema</h2>';
    temi.forEach(function(t) {
      var attivo = corrente === t.val;
      var bordo  = attivo ? 'var(--colore-accento)' : 'var(--colore-bordo-sottile)';
      var check  = attivo ? '<i class="ti ti-check" style="color:var(--colore-accento);"></i>' : '';
      html += '<div onclick="salvaTema(\'' + t.val + '\')" style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;background:var(--colore-superficie);border:1px solid ' + bordo + ';border-radius:var(--raggio-piccolo);margin-bottom:8px;cursor:pointer;">' +
        '<span style="font-size:13px;color:var(--colore-testo);">' + t.label + '</span>' + check +
      '</div>';
    });
    apriOverlay(html);
  });
}

function salvaTema(tema) {
  DB.scriviImpostazione('tema', tema).then(function() {
    if (tema === 'scuro') {
      document.documentElement.removeAttribute('data-tema');
    } else {
      document.documentElement.setAttribute('data-tema', tema);
    }
    _chiudiOverlay();
    aggiornaImpostazioni();
  });
}

function apriSceltaFont() {
  DB.leggiImpostazione('font').then(function(corrente) {
    corrente = corrente || 'Lora';
    var fonts = ['Lora', 'Playfair Display', 'EB Garamond'];
    var html = '<h2 style="font-family:var(--font-titolo);font-size:17px;font-weight:600;color:var(--colore-testo);margin-bottom:20px;">Font titoli</h2>';
    fonts.forEach(function(f) {
      var attivo = corrente === f;
      var bordo  = attivo ? 'var(--colore-accento)' : 'var(--colore-bordo-sottile)';
      var check  = attivo ? '<i class="ti ti-check" style="color:var(--colore-accento);"></i>' : '';
      html += '<div onclick="salvaFont(\'' + f + '\')" style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px;background:var(--colore-superficie);border:1px solid ' + bordo + ';border-radius:var(--raggio-piccolo);margin-bottom:8px;cursor:pointer;">' +
        '<span style="font-family:\'' + f + '\',serif;font-size:17px;color:var(--colore-testo);">' + f + ' - Buona Lettura</span>' + check +
      '</div>';
    });
    apriOverlay(html);
  });
}

function salvaFont(font) {
  DB.scriviImpostazione('font', font).then(function() {
    document.documentElement.style.setProperty('--font-titolo', "'" + font + "', Georgia, serif");
    _chiudiOverlay();
    aggiornaImpostazioni();
  });
}

function apriVotoMinimo() {
  DB.leggiImpostazione('votoMinimoConsigliato').then(function(val) {
    val = val || 7;
    var html = '<h2 style="font-family:var(--font-titolo);font-size:17px;font-weight:600;color:var(--colore-testo);margin-bottom:12px;">Voto minimo consigliato</h2>' +
      '<p style="font-size:13px;color:var(--colore-testo-tenue);margin-bottom:20px;line-height:1.6;">I libri con voto uguale o superiore a questa soglia verranno marcati come consigliati.</p>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:24px;">';
    for (var n = 1; n <= 10; n++) {
      var attivo = val === n;
      html += '<button onclick="salvaVotoMin(' + n + ')" style="width:44px;height:44px;border-radius:50%;' +
        'background:' + (attivo ? 'var(--colore-accento)' : 'var(--colore-superficie)') + ';' +
        'border:1px solid ' + (attivo ? 'var(--colore-accento)' : 'var(--colore-bordo-sottile)') + ';' +
        'color:' + (attivo ? 'var(--colore-primario)' : 'var(--colore-testo-tenue)') + ';' +
        'font-size:14px;font-weight:500;cursor:pointer;font-family:var(--font-corpo);">' + n + '</button>';
    }
    html += '</div>';
    apriOverlay(html);
  });
}

function salvaVotoMin(val) {
  DB.scriviImpostazione('votoMinimoConsigliato', val).then(function() {
    _chiudiOverlay();
    aggiornaImpostazioni();
  });
}

function apriGestisciGeneri() {
  DB.leggiGeneri().then(function(generi) {
    var html = '<h2 style="font-family:var(--font-titolo);font-size:17px;font-weight:600;color:var(--colore-testo);margin-bottom:16px;">Generi letterari</h2>' +
      '<div id="listaGeneriImpost" style="margin-bottom:16px;max-height:300px;overflow-y:auto;">';
    generi.forEach(function(g) {
      var nomeEsc = g.nome.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:var(--colore-superficie);border:1px solid var(--colore-bordo-sottile);border-radius:var(--raggio-piccolo);margin-bottom:6px;">' +
        '<span style="font-size:13px;color:var(--colore-testo);">' + g.nome + '</span>' +
        '<button onclick="eliminaGenereUI(' + g.id + ',\'' + nomeEsc + '\')" style="background:none;border:none;cursor:pointer;color:var(--colore-testo-fantasma);padding:4px;min-height:36px;">X</button>' +
      '</div>';
    });
    html += '</div>' +
      '<div style="display:flex;gap:8px;">' +
        '<input id="nuovoGenereInput" type="text" placeholder="Nuovo genere..." style="flex:1;background:var(--colore-superficie);border:1px solid var(--colore-bordo-sottile);border-radius:var(--raggio-piccolo);padding:10px 12px;font-size:13px;color:var(--colore-testo);font-family:var(--font-corpo);" />' +
        '<button class="btn-primario" onclick="aggiungiGenereUI()" style="padding:10px 16px;">+</button>' +
      '</div>';
    apriOverlay(html);
  });
}

function aggiungiGenereUI() {
  var input = document.getElementById('nuovoGenereInput');
  var nome  = input ? input.value.trim() : '';
  if (!nome) return;
  DB.aggiungiGenere(nome).then(function() {
    apriGestisciGeneri();
  }).catch(function(e) {
    alert('Errore: ' + e.message);
  });
}

function eliminaGenereUI(id, nome) {
  if (!confirm('Eliminare il genere "' + nome + '"?')) return;
  DB.eliminaGenere(id).then(function() {
    apriGestisciGeneri();
  });
}

function esportaJSON() {
  DB.esportaTuttiDati().then(function(dati) {
    var json = JSON.stringify(dati, null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var url  = URL.createObjectURL(blob);
    var data = new Date().toISOString().split('T')[0];
    var a    = document.createElement('a');
    a.href   = url;
    a.download = 'buona-lettura-backup-' + data + '.json';
    a.click();
    URL.revokeObjectURL(url);
  }).catch(function(e) { alert('Errore esportazione: ' + e.message); });
}

function esportaCSV() {
  DB.leggiTuttiLibri().then(function(libri) {
    var campi = ['titolo','autore','editore','anno','pagine','genere','supporto','stato','dataInizio','dataFine','voto','commento','isbn'];
    var righe = libri.map(function(l) {
      return campi.map(function(c) {
        var val = l[c] != null ? String(l[c]) : '';
        val = val.replace(/"/g, '""');
        return (val.indexOf(',') >= 0 || val.indexOf('"') >= 0) ? '"' + val + '"' : val;
      }).join(',');
    });
    var csv  = [campi.join(',')].concat(righe).join('\n');
    var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    var url  = URL.createObjectURL(blob);
    var data = new Date().toISOString().split('T')[0];
    var a    = document.createElement('a');
    a.href   = url;
    a.download = 'buona-lettura-' + data + '.csv';
    a.click();
    URL.revokeObjectURL(url);
  }).catch(function(e) { alert('Errore CSV: ' + e.message); });
}

function importaBackup() {
  var input  = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = function(e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(ev) {
      try {
        var dati = JSON.parse(ev.target.result);
        if (!dati.libri || !dati.app) throw new Error('File non riconosciuto.');
        if (!confirm('Importare ' + dati.libri.length + ' libri? I dati esistenti verranno sovrascritti.')) return;
        DB.importaDatiBackup(dati).then(function(n) {
          alert('Importati ' + n + ' libri con successo.');
          aggiornaHomeConDB();
          disegnaScaffale();
        });
      } catch(err) { alert('Errore: ' + err.message); }
    };
    reader.readAsText(file);
  };
  input.click();
}

function importaGoodreads() {
  var input  = document.createElement('input');
  input.type = 'file';
  input.accept = '.csv';
  input.onchange = function(e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(ev) {
      DB.importaCSVGoodreads(ev.target.result).then(function(r) {
        alert('Importazione completata.\nLibri importati: ' + r.importati + '\nSaltati: ' + r.saltati);
        aggiornaHomeConDB();
        disegnaScaffale();
      }).catch(function(err) { alert('Errore: ' + err.message); });
    };
    reader.readAsText(file);
  };
  input.click();
}

function resetDati() {
  apriOverlay(
    '<div style="text-align:center;padding:10px 0;">' +
    '<h2 style="font-family:var(--font-titolo);font-size:17px;font-weight:600;color:var(--colore-testo);margin-bottom:8px;">Reset completo</h2>' +
    '<p style="font-size:13px;color:var(--colore-testo-tenue);line-height:1.6;margin-bottom:8px;">Stai per eliminare tutti i libri dalla libreria. Operazione irreversibile.</p>' +
    '<p style="font-size:12px;color:var(--colore-testo-fantasma);margin-bottom:24px;">Le impostazioni e i generi verranno conservati.</p>' +
    '<div style="display:flex;gap:10px;">' +
      '<button class="btn-secondario" style="flex:1;" onclick="_chiudiOverlay()">Annulla</button>' +
      '<button class="btn-primario" style="flex:1;background:var(--colore-errore);" onclick="confermaResetDati()">Elimina tutto</button>' +
    '</div></div>'
  );
}

function confermaResetDati() {
  DB.resetTuttiDati().then(function() {
    _chiudiOverlay();
    aggiornaHomeConDB();
    disegnaScaffale();
    aggiornaClassifica();
  }).catch(function(e) { alert('Errore reset: ' + e.message); });
}

/* ═══════════════════════════════════════════════════════════════
   RICERCA
═══════════════════════════════════════════════════════════════ */

async function apriRicerca() {
  apriOverlay(`
    <h2 style="font-family:var(--font-titolo);font-size:17px;font-weight:600;
               color:var(--colore-testo);margin-bottom:16px;">Cerca nella libreria</h2>
    <input class="input-form" type="search" id="inputRicerca"
           placeholder="Titolo, autore, genere…"
           autofocus
           style="width:100%;background:var(--colore-superficie);
                  border:1px solid var(--colore-bordo-sottile);
                  border-radius:var(--raggio-piccolo);padding:12px 14px;
                  font-size:14px;color:var(--colore-testo);
                  font-family:var(--font-corpo);margin-bottom:14px;" />
    <div id="risultatiRicerca"></div>
  `);
  setTimeout(() => {
    const input = document.getElementById('inputRicerca');
    if (input) {
      input.addEventListener('input', eseguiRicerca);
      input.focus();
    }
  }, 80);
}

async function eseguiRicerca() {
  const query     = document.getElementById('inputRicerca')?.value.toLowerCase().trim();
  const risultati = document.getElementById('risultatiRicerca');
  if (!risultati) return;

  if (!query || query.length < 2) {
    risultati.innerHTML = '';
    return;
  }

  const libri  = await DB.leggiTuttiLibri();
  const filtro = libri.filter(l =>
    l.titolo?.toLowerCase().includes(query)  ||
    l.autore?.toLowerCase().includes(query)  ||
    l.genere?.toLowerCase().includes(query)  ||
    l.editore?.toLowerCase().includes(query)
  );

  if (filtro.length === 0) {
    risultati.innerHTML = `
      <p style="font-size:13px;color:var(--colore-testo-fantasma);text-align:center;padding:20px 0;">
        Nessun risultato per "${query}"
      </p>`;
    return;
  }

  risultati.innerHTML = filtro.slice(0, 20).map(l => `
    <div onclick="apriScheda('${l.id}')"
         style="display:flex;align-items:center;gap:10px;padding:10px 12px;
                background:var(--colore-superficie);border:1px solid var(--colore-bordo-sottile);
                border-radius:var(--raggio-piccolo);margin-bottom:6px;cursor:pointer;">
      <div style="width:28px;height:38px;background:${l.colore||'#4A3728'};
                  border-radius:2px 4px 4px 2px;flex-shrink:0;"></div>
      <div style="flex:1;min-width:0;">
        <p style="font-size:13px;font-weight:500;color:var(--colore-testo);
                  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${l.titolo}</p>
        <p style="font-size:10px;color:var(--colore-testo-fantasma);">${l.autore}</p>
      </div>
      ${l.voto ? `<span style="font-size:12px;font-weight:500;color:var(--colore-accento);">${l.voto}</span>` : ''}
    </div>`).join('');
}

/* ═══════════════════════════════════════════════════════════════
   SUGGERIMENTI — placeholder, implementato in covers.js
═══════════════════════════════════════════════════════════════ */

async function aggiornaSuggerimentoUI() {
  /* Implementato in covers.js */
}

async function nuovoSuggerimento() {
  /* Implementato in covers.js */
}

function apriAmazon() {
  /* Implementato in covers.js */
}


/* ═══════════════════════════════════════════════════════════════
   RICERCA GOOGLE BOOKS — precompila il form automaticamente
═══════════════════════════════════════════════════════════════ */

function cercaSuGoogleBooks() {
  var isbn   = (document.getElementById('fIsbn')?.value   || '').trim().replace(/[^0-9X]/gi, '');
  var titolo = (document.getElementById('fTitolo')?.value || '').trim();
  var autore = (document.getElementById('fAutore')?.value || '').trim();
  var risultatiEl = document.getElementById('risultatiCerca');

  if (!isbn && !titolo) {
    if (risultatiEl) risultatiEl.innerHTML =
      '<p style="font-size:11px;color:var(--colore-errore);">Inserisci ISBN o titolo per cercare.</p>';
    return;
  }

  if (risultatiEl) risultatiEl.innerHTML =
    '<p style="font-size:11px;color:var(--colore-testo-fantasma);font-style:italic;">Ricerca in corso…</p>';

  if (isbn) {
    /* ── Via ISBN: Open Library ISBN API — risposta diretta e precisa ── */
    var urlISBN = 'https://openlibrary.org/api/books?bibkeys=ISBN:' + isbn +
                  '&format=json&jscmd=data';
    fetch(urlISBN, { signal: AbortSignal.timeout(8000) })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var chiave = 'ISBN:' + isbn;
        if (data[chiave]) {
          _selezionaDaOpenLibraryISBN(data[chiave], isbn);
        } else {
          /* Fallback: ricerca per titolo su Open Library */
          if (titolo) {
            _cercaOLTitolo(titolo, autore, risultatiEl);
          } else {
            if (risultatiEl) risultatiEl.innerHTML =
              '<p style="font-size:11px;color:var(--colore-testo-fantasma);">ISBN non trovato. Prova ad aggiungere anche il titolo.</p>';
          }
        }
      })
      .catch(function() {
        if (titolo) {
          _cercaOLTitolo(titolo, autore, risultatiEl);
        } else {
          if (risultatiEl) risultatiEl.innerHTML =
            '<p style="font-size:11px;color:var(--colore-errore);">Connessione non disponibile.</p>';
        }
      });
  } else {
    /* ── Solo titolo: ricerca Open Library ── */
    _cercaOLTitolo(titolo, autore, risultatiEl);
  }
}

/*
 * _selezionaDaOpenLibraryISBN(dati, isbn)
 * Precompila direttamente il form dai dati ISBN di Open Library.
 * Non mostra lista — risultato univoco.
 */
function _selezionaDaOpenLibraryISBN(dati, isbn) {
  var autori  = (dati.authors  || []).map(function(a) { return a.name; }).join(', ');
  var editore = (dati.publishers || []).map(function(p) { return p.name; }).join(', ');
  var anno    = dati.publish_date ? parseInt(dati.publish_date.match(/\d{4}/)?.[0], 10) : null;
  var pagine  = dati.number_of_pages || null;
  var titolo  = dati.title || '';
  var copertina = dati.cover ? (dati.cover.large || dati.cover.medium || dati.cover.small || '') : '';

  var set = function(id, val) {
    var el = document.getElementById(id);
    if (el && val) el.value = val;
  };

  set('fTitolo',  titolo);
  set('fAutore',  autori);
  set('fEditore', editore);
  set('fAnno',    anno);
  set('fPagine',  pagine);

  if (copertina) {
    var fColore = document.getElementById('fColore');
    if (fColore) fColore.dataset.copertina = copertina;
  }

  var risultatiEl = document.getElementById('risultatiCerca');
  if (risultatiEl) {
    risultatiEl.innerHTML =
      '<p style="font-size:11px;color:var(--colore-successo);padding:6px 0;">' +
      '<i class="ti ti-check" style="margin-right:4px;"></i>' +
      'Trovato: <strong>' + (titolo || isbn) + '</strong> — campi precompilati.' +
      '</p>';
  }
}

/*
 * _cercaOLTitolo(titolo, autore, risultatiEl)
 * Ricerca per titolo su Open Library — mostra lista risultati.
 */
function _cercaOLTitolo(titolo, autore, risultatiEl) {
  var q   = encodeURIComponent(titolo + (autore ? ' ' + autore : ''));
  var url = 'https://openlibrary.org/search.json?q=' + q +
            '&fields=title,author_name,first_publish_year,number_of_pages_median,isbn,cover_i,publisher&limit=5';

  fetch(url, { signal: AbortSignal.timeout(8000) })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data.docs || data.docs.length === 0) {
        if (risultatiEl) risultatiEl.innerHTML =
          '<p style="font-size:11px;color:var(--colore-testo-fantasma);">Nessun risultato trovato.</p>';
        return;
      }
      _mostraRisultatiOL(data.docs);
    })
    .catch(function() {
      if (risultatiEl) risultatiEl.innerHTML =
        '<p style="font-size:11px;color:var(--colore-errore);">Connessione non disponibile.</p>';
    });
}

/*
 * _mostraRisultatiOL(docs)
 * Mostra la lista risultati da Open Library search.
 */
function _mostraRisultatiOL(docs) {
  var risultatiEl = document.getElementById('risultatiCerca');
  if (!risultatiEl) return;

  window._olDocs = docs;

  var html = '<div style="border:1px solid var(--colore-bordo-sottile);border-radius:var(--raggio-piccolo);overflow:hidden;margin-top:4px;">';

  docs.slice(0, 4).forEach(function(doc, idx) {
    var titolo   = doc.title || '—';
    var autori   = (doc.author_name || []).join(', ');
    var anno     = doc.first_publish_year || '';
    var pagine   = doc.number_of_pages_median || '';
    var editore  = (doc.publisher || [])[0] || '';
    var isbn13   = (doc.isbn || []).find(function(i) { return i.length === 13; }) || '';
    var copertina = doc.cover_i
      ? 'https://covers.openlibrary.org/b/id/' + doc.cover_i + '-S.jpg'
      : '';

    var bordo = idx > 0 ? 'border-top:1px solid var(--colore-bordo-sottile);' : '';

    html += '<div onclick="_selezionaRisultatoOL(' + idx + ')" ' +
      'style="display:flex;gap:8px;align-items:center;padding:8px 10px;' +
      'background:var(--colore-superficie);cursor:pointer;' + bordo + '">' +
      (copertina
        ? '<img src="' + copertina + '" style="width:28px;height:38px;object-fit:cover;border-radius:2px;flex-shrink:0;" onerror="this.style.display=String.fromCharCode(110,111,110,101)">'
        : '<div style="width:28px;height:38px;background:var(--colore-bordo-sottile);border-radius:2px;flex-shrink:0;"></div>') +
      '<div style="flex:1;min-width:0;">' +
        '<p style="font-size:11px;font-weight:500;color:var(--colore-testo);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + titolo + '</p>' +
        '<p style="font-size:10px;color:var(--colore-testo-tenue);">' +
          (autori ? autori.slice(0, 30) + ' · ' : '') + (anno || '') +
          (pagine ? ' · ' + pagine + ' pag.' : '') +
        '</p>' +
      '</div>' +
      '<i class="ti ti-chevron-right" style="font-size:14px;color:var(--colore-testo-fantasma);flex-shrink:0;"></i>' +
    '</div>';
  });

  html += '</div>';
  risultatiEl.innerHTML = html;
}

function _selezionaRisultatoOL(idx) {
  var docs = window._olDocs || [];
  if (!docs[idx]) return;
  var doc    = docs[idx];
  var autori  = (doc.author_name || []).join(', ');
  var isbn13  = (doc.isbn || []).find(function(i) { return i.length === 13; }) || '';
  var editore = (doc.publisher || [])[0] || '';
  var copertina = doc.cover_i
    ? 'https://covers.openlibrary.org/b/id/' + doc.cover_i + '-L.jpg'
    : '';

  var set = function(id, val) {
    var el = document.getElementById(id);
    if (el && val) el.value = val;
  };

  set('fTitolo',  doc.title);
  set('fAutore',  autori);
  set('fEditore', editore);
  set('fAnno',    doc.first_publish_year);
  set('fPagine',  doc.number_of_pages_median);
  set('fIsbn',    isbn13);

  if (copertina) {
    var fColore = document.getElementById('fColore');
    if (fColore) fColore.dataset.copertina = copertina;
  }

  var risultatiEl = document.getElementById('risultatiCerca');
  if (risultatiEl) {
    risultatiEl.innerHTML =
      '<p style="font-size:11px;color:var(--colore-successo);padding:6px 0;">' +
      '<i class="ti ti-check" style="margin-right:4px;"></i>' +
      'Dati precompilati — controlla e correggi se necessario.' +
      '</p>';
  }
}

/* _mostraRisultatiGoogleBooks e _selezionaLibroGB sostituiti da funzioni Open Library */

/* ═══════════════════════════════════════════════════════════════
   ESPOSIZIONE GLOBALE
   Con 'use strict' le funzioni non sono automaticamente su window.
   Le esponiamo esplicitamente così gli onclick dell'HTML le trovano.
═══════════════════════════════════════════════════════════════ */
Object.assign(window, {
  /* Navigazione e layout */
  aggiornaLibreria,
  aggiornaClassifica,
  aggiornaImpostazioni,

  /* Scaffale e libri */
  apriAggiungiLibro,
  apriModificaLibro,
  apriScheda,
  salvaLibro,
  confermaEliminaLibro,
  eseguiEliminaLibro,
  apriRicerca,

  /* Impostazioni */
  apriObiettivoAnnuale,
  salvaObiettivo,
  apriSceltaTema,
  salvaTema,
  apriSceltaFont,
  salvaFont,
  apriVotoMinimo,
  salvaVotoMin,
  apriGestisciGeneri,
  aggiungiGenereUI,
  eliminaGenereUI,

  /* Backup */
  esportaJSON,
  esportaCSV,
  importaBackup,
  importaGoodreads,
  resetDati,
  confermaResetDati,

  /* Suggerimenti */
  nuovoSuggerimento,
  apriAmazon,
});
