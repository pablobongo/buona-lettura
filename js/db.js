/*
 * db.js — Gestione IndexedDB
 * ═══════════════════════════════════════════════════════════════
 *
 * Questo file è l'unico punto di contatto con IndexedDB.
 * Tutti gli altri file JS leggono e scrivono dati SOLO attraverso
 * le funzioni esportate qui. Mai aprire il db altrove.
 *
 * STRUTTURA DEL DATABASE
 * ─────────────────────────────────────────────
 * Nome DB : 'BuonaLettura'
 * Versione: 1 (incrementare ad ogni modifica strutturale)
 *
 * Object Store (tabelle):
 *
 *   libri
 *   ├── id          (keyPath, auto-generato: 'bl_' + timestamp + random)
 *   ├── titolo      (string, obbligatorio)
 *   ├── autore      (string, obbligatorio)
 *   ├── editore     (string)
 *   ├── anno        (number — anno di pubblicazione)
 *   ├── pagine      (number)
 *   ├── genere      (string — da lista personalizzabile)
 *   ├── supporto    (string: 'cartaceo' | 'kindle' | 'pdf' | 'altro')
 *   ├── stato       (string: 'in-corso' | 'terminato' | 'sospeso' | 'da-leggere')
 *   ├── dataInizio  (string ISO 8601, es. '2026-01-15')
 *   ├── dataFine    (string ISO 8601)
 *   ├── voto        (number 1-10, opzionale — solo per terminati)
 *   ├── commento    (string — note personali di Igor)
 *   ├── avanzamento (number 0-100 — percentuale, solo per in-corso)
 *   ├── paginaCorrente (number — usato per calcolare avanzamento)
 *   ├── colore      (string hex — colore dorso sullo scaffale)
 *   ├── copertina   (string URL — da Open Library o caricata)
 *   ├── isbn        (string)
 *   ├── lingua      (string, default 'it')
 *   ├── tags        (array di string — etichette libere)
 *   └── dataInserimento (string ISO — quando è stato aggiunto all'app)
 *
 *   impostazioni
 *   ├── chiave      (keyPath — es. 'obiettivoAnnuale', 'tema', 'font')
 *   └── valore      (any)
 *
 *   generi
 *   ├── id          (keyPath, auto-increment)
 *   ├── nome        (string — es. 'Narrativa', 'Saggistica')
 *   └── ordine      (number — per l'ordinamento nella lista)
 *
 * ═══════════════════════════════════════════════════════════════
 */

'use strict';

/* ── COSTANTI ──────────────────────────────────────────────────── */
const DB_NOME     = 'BuonaLettura';
const DB_VERSIONE = 1;

/* Generi letterari predefiniti — modificabili da Impostazioni */
const GENERI_DEFAULT = [
  'Narrativa',
  'Narrativa storica',
  'Romanzo',
  'Saggio',
  'Saggistica',
  'Biografia',
  'Autobiografia',
  'Fantascienza',
  'Fantasy',
  'Thriller',
  'Giallo',
  'Horror',
  'Poesia',
  'Teatro',
  'Fumetto',
  'Divulgazione',
  'Filosofia',
  'Storia',
  'Scienza',
  'Economia',
  'Psicologia',
  'Spiritualità',
  'Classico',
  'Altro',
];

/* Impostazioni predefinite */
const IMPOSTAZIONI_DEFAULT = {
  obiettivoAnnuale:   24,
  tema:               'scuro',
  font:               'Lora',
  votoMinimoConsigliato: 7,
  promemoria:         false,
  lingua:             'it',
  cartellaSalvataggio: '',
  dataInstallazione:  new Date().toISOString(),
};

/* Colori predefiniti per i dorsi dei libri —
   assegnati automaticamente in rotazione */
const COLORI_DORSI = [
  '#5C3D2E', '#2C4251', '#4A3728', '#3B4A3D', '#6B3A2A',
  '#2D4B5C', '#4E3156', '#3E5C3B', '#5C4A2A', '#3A2D5C',
  '#5C2D2D', '#2E4A3B', '#4A2C3D', '#5C4A1A', '#1A3D5C',
  '#3D2E4A', '#4A3A2A', '#2A4A3A', '#5C3A1A', '#3A1A5C',
  '#2E3D5C', '#5C3D1A', '#3D5C2E', '#5C1A1A', '#1A4A5C',
];

/* ── ISTANZA DATABASE ──────────────────────────────────────────── */
/* Unica istanza del db — riutilizzata da tutte le funzioni */
let _db = null;

/* ═══════════════════════════════════════════════════════════════
   apriDB() — Apre (o crea) il database
   Restituisce una Promise che si risolve con l'istanza IDBDatabase.
   Se il db è già aperto, restituisce l'istanza esistente.
═══════════════════════════════════════════════════════════════ */
function apriDB() {
  /* Se già aperto, restituisce subito */
  if (_db) return Promise.resolve(_db);

  return new Promise((risolvi, rifiuta) => {
    const richiesta = indexedDB.open(DB_NOME, DB_VERSIONE);

    /* ── onupgradeneeded: eseguito solo quando si crea o aggiorna il db ── */
    richiesta.onupgradeneeded = (evento) => {
      const db      = evento.target.result;
      const vecchiaVersione = evento.oldVersion;

      console.log(
        `[BL DB] Aggiornamento schema: v${vecchiaVersione} → v${DB_VERSIONE}`
      );

      /* ── Creazione dalla versione 0 (primo avvio) ── */
      if (vecchiaVersione < 1) {

        /* Store: libri */
        const storeLibri = db.createObjectStore('libri', { keyPath: 'id' });
        /* Indici per query veloci */
        storeLibri.createIndex('per_stato',        'stato',       { unique: false });
        storeLibri.createIndex('per_autore',       'autore',      { unique: false });
        storeLibri.createIndex('per_genere',       'genere',      { unique: false });
        storeLibri.createIndex('per_voto',         'voto',        { unique: false });
        storeLibri.createIndex('per_supporto',     'supporto',    { unique: false });
        storeLibri.createIndex('per_dataFine',     'dataFine',    { unique: false });
        storeLibri.createIndex('per_dataInizio',   'dataInizio',  { unique: false });
        storeLibri.createIndex('per_titolo',       'titolo',      { unique: false });
        storeLibri.createIndex('per_anno',         'anno',        { unique: false });

        /* Store: impostazioni (chiave-valore) */
        db.createObjectStore('impostazioni', { keyPath: 'chiave' });

        /* Store: generi personalizzabili */
        const storeGeneri = db.createObjectStore('generi', {
          keyPath: 'id',
          autoIncrement: true
        });
        storeGeneri.createIndex('per_nome',   'nome',   { unique: true });
        storeGeneri.createIndex('per_ordine', 'ordine', { unique: false });

        console.log('[BL DB] Schema v1 creato: stores libri, impostazioni, generi.');
      }

      /* ── Migrazioni future ─────────────────────────────────────
         Aggiungere qui i blocchi per versioni successive:

         if (vecchiaVersione < 2) {
           // es. aggiungere campo 'serie' allo store libri
           // Non si può modificare uno store esistente con addIndex su di esso
           // durante upgrade, ma si possono aggiungere indici:
           const storeLibri = evento.target.transaction.objectStore('libri');
           storeLibri.createIndex('per_serie', 'serie', { unique: false });
         }
      ─────────────────────────────────────────────────────────── */
    };

    richiesta.onsuccess = (evento) => {
      _db = evento.target.result;
      console.log('[BL DB] Database aperto:', DB_NOME, 'v' + DB_VERSIONE);

      /* Gestisce la chiusura inaspettata del db (es. quota superata) */
      _db.onversionchange = () => {
        _db.close();
        _db = null;
        console.warn('[BL DB] Database chiuso per aggiornamento versione.');
      };

      risolvi(_db);
    };

    richiesta.onerror = (evento) => {
      console.error('[BL DB] Errore apertura database:', evento.target.error);
      rifiuta(evento.target.error);
    };

    richiesta.onblocked = () => {
      console.warn('[BL DB] Apertura bloccata — chiudi le altre tab dell\'app.');
    };
  });
}

/* ═══════════════════════════════════════════════════════════════
   INIZIALIZZAZIONE — popola i dati di default al primo avvio
═══════════════════════════════════════════════════════════════ */
async function inizializzaDB() {
  const db = await apriDB();

  /* Controlla se è il primo avvio leggendo un'impostazione sentinella */
  const dataInst = await leggiImpostazione('dataInstallazione');
  if (dataInst !== null) {
    /* Non è il primo avvio — db già inizializzato */
    return;
  }

  console.log('[BL DB] Primo avvio — inserimento dati di default…');

  /* Inserisce impostazioni di default */
  const tx = db.transaction(['impostazioni', 'generi'], 'readwrite');

  const storeImpost = tx.objectStore('impostazioni');
  for (const [chiave, valore] of Object.entries(IMPOSTAZIONI_DEFAULT)) {
    storeImpost.put({ chiave, valore });
  }

  /* Inserisce generi di default — put con id esplicito */
  const storeGeneri = tx.objectStore('generi');
  GENERI_DEFAULT.forEach((nome, indice) => {
    storeGeneri.put({ id: indice + 1, nome, ordine: indice });
  });

  return new Promise((risolvi, rifiuta) => {
    tx.oncomplete = () => {
      console.log('[BL DB] Dati di default inseriti.');
      /* Aggiorna anche localStorage per lo splash screen */
      aggiornaStatisticheLS();
      risolvi();
    };
    tx.onerror = (e) => rifiuta(e.target.error);
  });
}

/* ═══════════════════════════════════════════════════════════════
   LIBRI — funzioni CRUD
═══════════════════════════════════════════════════════════════ */

/*
 * aggiungiLibro(datiLibro)
 * ─────────────────────────────────────────────
 * Aggiunge un nuovo libro al database.
 * Genera automaticamente: id, colore dorso, dataInserimento.
 * Restituisce l'id del libro creato.
 */
async function aggiungiLibro(dati) {
  const db = await apriDB();

  /* Conta i libri esistenti per scegliere il colore in rotazione */
  const totale = await contaLibri();
  const coloreAuto = COLORI_DORSI[totale % COLORI_DORSI.length];

  /* Costruisce il record completo con valori di default */
  const libro = {
    id:               'bl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    titolo:           (dati.titolo || '').trim(),
    autore:           (dati.autore || '').trim(),
    editore:          (dati.editore || '').trim(),
    anno:             dati.anno    || null,
    pagine:           dati.pagine  || null,
    genere:           dati.genere  || '',
    supporto:         dati.supporto || 'cartaceo',
    stato:            dati.stato   || 'da-leggere',
    dataInizio:       dati.dataInizio  || null,
    dataFine:         dati.dataFine    || null,
    voto:             dati.voto        || null,
    commento:         (dati.commento   || '').trim(),
    avanzamento:      dati.avanzamento || 0,
    paginaCorrente:   dati.paginaCorrente || null,
    colore:           dati.colore   || coloreAuto,
    copertina:        dati.copertina || null,
    isbn:             (dati.isbn || '').trim(),
    lingua:           dati.lingua   || 'it',
    tags:             dati.tags     || [],
    dataInserimento:  new Date().toISOString(),
    aggiornato_il:    new Date().toISOString(),
  };

  /* Validazione minima */
  if (!libro.titolo) throw new Error('Il titolo è obbligatorio.');
  if (!libro.autore) throw new Error('L\'autore è obbligatorio.');

  return new Promise((risolvi, rifiuta) => {
    const tx      = db.transaction('libri', 'readwrite');
    const riquest = tx.objectStore('libri').add(libro);

    riquest.onsuccess = () => {
      aggiornaStatisticheLS();
      risolvi(libro.id);
    };
    riquest.onerror = (e) => rifiuta(e.target.error);
  });
}

/*
 * leggiLibro(id)
 * ─────────────────────────────────────────────
 * Restituisce un singolo libro per id.
 * Restituisce null se non trovato.
 */
async function leggiLibro(id) {
  const db = await apriDB();

  return new Promise((risolvi, rifiuta) => {
    const tx      = db.transaction('libri', 'readonly');
    const riquest = tx.objectStore('libri').get(id);

    riquest.onsuccess = (e) => risolvi(e.target.result || null);
    riquest.onerror   = (e) => rifiuta(e.target.error);
  });
}

/*
 * leggiTuttiLibri(filtri)
 * ─────────────────────────────────────────────
 * Restituisce tutti i libri, con filtri opzionali.
 * filtri: { stato, genere, supporto, anno, votoMin, votoMax }
 * Ordinamento di default: per dataInserimento decrescente.
 */
async function leggiTuttiLibri(filtri = {}) {
  const db = await apriDB();

  return new Promise((risolvi, rifiuta) => {
    const tx      = db.transaction('libri', 'readonly');
    const store   = tx.objectStore('libri');
    const libri   = [];
    let cursore;

    /* Usa un indice se è stato specificato un filtro primario */
    if (filtri.stato) {
      cursore = store.index('per_stato').openCursor(IDBKeyRange.only(filtri.stato));
    } else if (filtri.genere) {
      cursore = store.index('per_genere').openCursor(IDBKeyRange.only(filtri.genere));
    } else if (filtri.supporto) {
      cursore = store.index('per_supporto').openCursor(IDBKeyRange.only(filtri.supporto));
    } else {
      cursore = store.openCursor();
    }

    cursore.onsuccess = (e) => {
      const cur = e.target.result;
      if (!cur) {
        /* Fine cursore — applica filtri secondari e ordina */
        let risultati = libri;

        if (filtri.anno) {
          risultati = risultati.filter(l => {
            const dataRif = l.dataFine || l.dataInizio;
            return dataRif && new Date(dataRif).getFullYear() === filtri.anno;
          });
        }

        if (filtri.votoMin !== undefined) {
          risultati = risultati.filter(l => l.voto !== null && l.voto >= filtri.votoMin);
        }

        if (filtri.votoMax !== undefined) {
          risultati = risultati.filter(l => l.voto !== null && l.voto <= filtri.votoMax);
        }

        /* Ordinamento */
        const ordine = filtri.ordine || 'dataInserimento-desc';
        risultati = ordinaLibri(risultati, ordine);

        risolvi(risultati);
        return;
      }

      libri.push(cur.value);
      cur.continue();
    };

    cursore.onerror = (e) => rifiuta(e.target.error);
  });
}

/*
 * ordinaLibri(libri, criterio)
 * ─────────────────────────────────────────────
 * Ordina un array di libri secondo il criterio specificato.
 * Criteri: 'az', 'za', 'voto-desc', 'voto-asc',
 *          'dataFine-desc', 'dataFine-asc',
 *          'dataInserimento-desc', 'pagine-desc'
 */
function ordinaLibri(libri, criterio) {
  const copia = [...libri];

  switch (criterio) {
    case 'az':
      return copia.sort((a, b) => a.titolo.localeCompare(b.titolo, 'it'));
    case 'za':
      return copia.sort((a, b) => b.titolo.localeCompare(a.titolo, 'it'));
    case 'voto-desc':
      return copia.sort((a, b) => {
        if (b.voto === null) return -1;
        if (a.voto === null) return 1;
        if (b.voto !== a.voto) return b.voto - a.voto;
        /* A parità di voto: ordine alfabetico per titolo */
        return a.titolo.localeCompare(b.titolo, 'it');
      });
    case 'voto-asc':
      return copia.sort((a, b) => {
        if (a.voto === null) return 1;
        if (b.voto === null) return -1;
        if (a.voto !== b.voto) return a.voto - b.voto;
        return a.titolo.localeCompare(b.titolo, 'it');
      });
    case 'dataFine-desc':
      return copia.sort((a, b) =>
        new Date(b.dataFine || 0) - new Date(a.dataFine || 0)
      );
    case 'dataFine-asc':
      return copia.sort((a, b) =>
        new Date(a.dataFine || 0) - new Date(b.dataFine || 0)
      );
    case 'pagine-desc':
      return copia.sort((a, b) => (b.pagine || 0) - (a.pagine || 0));
    case 'dataInserimento-desc':
    default:
      return copia.sort((a, b) =>
        new Date(b.dataInserimento || 0) - new Date(a.dataInserimento || 0)
      );
  }
}

/*
 * aggiornaLibro(id, aggiornamenti)
 * ─────────────────────────────────────────────
 * Aggiorna i campi specificati di un libro esistente.
 * Non sovrascrive i campi non inclusi in aggiornamenti.
 */
async function aggiornaLibro(id, aggiornamenti) {
  const db    = await apriDB();
  const libro = await leggiLibro(id);

  if (!libro) throw new Error(`Libro non trovato: ${id}`);

  /* Unisce i dati esistenti con gli aggiornamenti */
  const libroAggiornato = { ...libro, ...aggiornamenti, id, aggiornato_il: new Date().toISOString() };

  /* Se il libro viene terminato adesso, calcola avanzamento al 100% */
  if (aggiornamenti.stato === 'terminato') {
    libroAggiornato.avanzamento = 100;
    if (!libroAggiornato.dataFine) {
      libroAggiornato.dataFine = new Date().toISOString().split('T')[0];
    }
  }

  return new Promise((risolvi, rifiuta) => {
    const tx      = db.transaction('libri', 'readwrite');
    const riquest = tx.objectStore('libri').put(libroAggiornato);

    riquest.onsuccess = () => {
      aggiornaStatisticheLS();
      risolvi(libroAggiornato);
    };
    riquest.onerror = (e) => rifiuta(e.target.error);
  });
}

/*
 * eliminaLibro(id)
 * ─────────────────────────────────────────────
 * Elimina un libro dal database.
 * Operazione irreversibile — chiamare solo dopo conferma utente.
 */
async function eliminaLibro(id) {
  const db = await apriDB();

  return new Promise((risolvi, rifiuta) => {
    const tx      = db.transaction('libri', 'readwrite');
    const riquest = tx.objectStore('libri').delete(id);

    riquest.onsuccess = () => {
      aggiornaStatisticheLS();
      risolvi(true);
    };
    riquest.onerror = (e) => rifiuta(e.target.error);
  });
}

/*
 * contaLibri(filtri)
 * ─────────────────────────────────────────────
 * Conta i libri senza scaricarli tutti in memoria.
 * Più efficiente di leggiTuttiLibri().length
 */
async function contaLibri(filtri = {}) {
  const db = await apriDB();

  return new Promise((risolvi, rifiuta) => {
    const tx    = db.transaction('libri', 'readonly');
    const store = tx.objectStore('libri');
    let riquest;

    if (filtri.stato) {
      riquest = store.index('per_stato').count(IDBKeyRange.only(filtri.stato));
    } else {
      riquest = store.count();
    }

    riquest.onsuccess = (e) => risolvi(e.target.result);
    riquest.onerror   = (e) => rifiuta(e.target.error);
  });
}

/* ═══════════════════════════════════════════════════════════════
   STATISTICHE — funzioni di aggregazione
═══════════════════════════════════════════════════════════════ */

/*
 * calcolaStatistiche(anno)
 * ─────────────────────────────────────────────
 * Calcola le statistiche aggregate per un anno specifico
 * o per tutto il tempo (anno = null).
 * Usata da stats.js e dallo splash screen.
 */
async function calcolaStatistiche(anno = null) {
  const filtri = anno
    ? { stato: 'terminato' }
    : { stato: 'terminato' };

  const libri = await leggiTuttiLibri(filtri);

  /* Filtra per anno se richiesto */
  const libriAnno = anno
    ? libri.filter(l => l.dataFine && new Date(l.dataFine).getFullYear() === anno)
    : libri;

  const votiValidi = libriAnno.filter(l => l.voto !== null).map(l => l.voto);
  const votoMedio  = votiValidi.length
    ? votiValidi.reduce((s, v) => s + v, 0) / votiValidi.length
    : null;

  const totalePagine = libriAnno.reduce((s, l) => s + (l.pagine || 0), 0);

  /* Autore più letto */
  const conteggioAutori = {};
  libriAnno.forEach(l => {
    if (l.autore) conteggioAutori[l.autore] = (conteggioAutori[l.autore] || 0) + 1;
  });
  const autoreMax = Object.entries(conteggioAutori)
    .sort((a, b) => b[1] - a[1])[0];

  /* Editore più letto */
  const conteggioEditori = {};
  libriAnno.forEach(l => {
    if (l.editore) conteggioEditori[l.editore] = (conteggioEditori[l.editore] || 0) + 1;
  });
  const editoreMax = Object.entries(conteggioEditori)
    .sort((a, b) => b[1] - a[1])[0];

  /* Mese più prolifico */
  const conteggioMesi = {};
  libriAnno.forEach(l => {
    if (l.dataFine) {
      const mese = new Date(l.dataFine).getMonth();
      conteggioMesi[mese] = (conteggioMesi[mese] || 0) + 1;
    }
  });
  const mesePiu = Object.entries(conteggioMesi)
    .sort((a, b) => b[1] - a[1])[0];
  const NOMI_MESI = [
    'Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
    'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'
  ];

  /* Libro più lungo e più breve */
  const conPagine = libriAnno.filter(l => l.pagine);
  const piu_lungo = conPagine.length
    ? conPagine.reduce((max, l) => l.pagine > max.pagine ? l : max)
    : null;
  const piu_breve = conPagine.length
    ? conPagine.reduce((min, l) => l.pagine < min.pagine ? l : min)
    : null;

  /* Distribuzione per genere */
  const distribGenere = {};
  libriAnno.forEach(l => {
    if (l.genere) distribGenere[l.genere] = (distribGenere[l.genere] || 0) + 1;
  });

  /* Distribuzione per supporto */
  const distribSupporto = {};
  libriAnno.forEach(l => {
    if (l.supporto) distribSupporto[l.supporto] = (distribSupporto[l.supporto] || 0) + 1;
  });

  /* Libri per mese (array di 12 valori) */
  const libriPerMese = Array(12).fill(0);
  libriAnno.forEach(l => {
    if (l.dataFine) {
      libriPerMese[new Date(l.dataFine).getMonth()]++;
    }
  });

  /* Pagine cumulative nel tempo (array ordinato per data) */
  const pagineCumulative = libriAnno
    .filter(l => l.dataFine && l.pagine)
    .sort((a, b) => new Date(a.dataFine) - new Date(b.dataFine))
    .reduce((acc, l) => {
      const tot = acc.length > 0 ? acc[acc.length - 1].totale : 0;
      acc.push({
        data:   l.dataFine,
        titolo: l.titolo,
        totale: tot + l.pagine
      });
      return acc;
    }, []);

  /* Tempo medio di lettura in giorni */
  const durateGiorni = libriAnno
    .filter(l => l.dataInizio && l.dataFine)
    .map(l => Math.round(
      (new Date(l.dataFine) - new Date(l.dataInizio)) / (1000 * 60 * 60 * 24)
    ))
    .filter(d => d >= 0);
  const giorniMedi = durateGiorni.length
    ? Math.round(durateGiorni.reduce((s, d) => s + d, 0) / durateGiorni.length)
    : null;

  return {
    totaleLibri:     libriAnno.length,
    totalePagine,
    votoMedio,
    giorniMedi,
    autoreMax:       autoreMax  ? { nome: autoreMax[0],  n: autoreMax[1] }  : null,
    editoreMax:      editoreMax ? { nome: editoreMax[0], n: editoreMax[1] } : null,
    mesePiu:         mesePiu    ? { nome: NOMI_MESI[mesePiu[0]], n: mesePiu[1] } : null,
    piuLungo:        piu_lungo,
    piuBreve:        piu_breve,
    distribGenere,
    distribSupporto,
    libriPerMese,
    pagineCumulative,
    libriSospesi:    await contaLibri({ stato: 'sospeso' }),
    libriInCorso:    await contaLibri({ stato: 'in-corso' }),
  };
}

/*
 * aggiornaStatisticheLS()
 * ─────────────────────────────────────────────
 * Aggiorna il localStorage con le statistiche aggregate.
 * Chiamata dopo ogni modifica ai libri.
 * Usata dallo splash screen per mostrare i numeri reali.
 */
async function aggiornaStatisticheLS() {
  try {
    const stats = await calcolaStatistiche(null);
    localStorage.setItem('bl_statistiche', JSON.stringify({
      totaleLibri:  stats.totaleLibri,
      totalePagine: stats.totalePagine,
      votoMedio:    stats.votoMedio,
    }));
  } catch (e) {
    /* Non critico — lo splash mostrerà i vecchi dati */
    console.warn('[BL DB] Impossibile aggiornare statistiche localStorage:', e);
  }
}

/* ═══════════════════════════════════════════════════════════════
   IMPOSTAZIONI — lettura e scrittura chiave-valore
═══════════════════════════════════════════════════════════════ */

/*
 * leggiImpostazione(chiave)
 * Restituisce il valore di una impostazione, o null se non esiste.
 */
async function leggiImpostazione(chiave) {
  const db = await apriDB();

  return new Promise((risolvi, rifiuta) => {
    const tx      = db.transaction('impostazioni', 'readonly');
    const riquest = tx.objectStore('impostazioni').get(chiave);

    riquest.onsuccess = (e) => {
      risolvi(e.target.result ? e.target.result.valore : null);
    };
    riquest.onerror = (e) => rifiuta(e.target.error);
  });
}

/*
 * scriviImpostazione(chiave, valore)
 * Salva o aggiorna un'impostazione.
 */
async function scriviImpostazione(chiave, valore) {
  const db = await apriDB();

  return new Promise((risolvi, rifiuta) => {
    const tx      = db.transaction('impostazioni', 'readwrite');
    const riquest = tx.objectStore('impostazioni').put({ chiave, valore });

    riquest.onsuccess = () => risolvi(true);
    riquest.onerror   = (e) => rifiuta(e.target.error);
  });
}

/*
 * leggiTutteImpostazioni()
 * Restituisce un oggetto con tutte le impostazioni { chiave: valore }.
 */
async function leggiTutteImpostazioni() {
  const db = await apriDB();

  return new Promise((risolvi, rifiuta) => {
    const tx    = db.transaction('impostazioni', 'readonly');
    const store = tx.objectStore('impostazioni');
    const risultato = {};
    const cursore = store.openCursor();

    cursore.onsuccess = (e) => {
      const cur = e.target.result;
      if (!cur) { risolvi(risultato); return; }
      risultato[cur.value.chiave] = cur.value.valore;
      cur.continue();
    };

    cursore.onerror = (e) => rifiuta(e.target.error);
  });
}

/* ═══════════════════════════════════════════════════════════════
   GENERI — lettura e gestione lista personalizzabile
═══════════════════════════════════════════════════════════════ */

/*
 * leggiGeneri()
 * Restituisce la lista dei generi ordinata per campo 'ordine'.
 */
async function leggiGeneri() {
  const db = await apriDB();

  return new Promise((risolvi, rifiuta) => {
    const tx      = db.transaction('generi', 'readonly');
    const store   = tx.objectStore('generi');
    const generi  = [];
    const cursore = store.index('per_ordine').openCursor();

    cursore.onsuccess = (e) => {
      const cur = e.target.result;
      if (!cur) { risolvi(generi); return; }
      generi.push(cur.value);
      cur.continue();
    };

    cursore.onerror = (e) => rifiuta(e.target.error);
  });
}

/*
 * aggiungiGenere(nome)
 * Aggiunge un nuovo genere in fondo alla lista.
 */
async function aggiungiGenere(nome) {
  const db     = await apriDB();
  const generi = await leggiGeneri();
  const ordine = generi.length;

  return new Promise((risolvi, rifiuta) => {
    const tx      = db.transaction('generi', 'readwrite');
    const riquest = tx.objectStore('generi').add({
      nome: nome.trim(),
      ordine
    });

    riquest.onsuccess = (e) => risolvi(e.target.result);
    riquest.onerror   = (e) => rifiuta(e.target.error);
  });
}

/*
 * eliminaGenere(id)
 * Elimina un genere per id.
 */
async function eliminaGenere(id) {
  const db = await apriDB();

  return new Promise((risolvi, rifiuta) => {
    const tx      = db.transaction('generi', 'readwrite');
    const riquest = tx.objectStore('generi').delete(id);

    riquest.onsuccess = () => risolvi(true);
    riquest.onerror   = (e) => rifiuta(e.target.error);
  });
}

/* ═══════════════════════════════════════════════════════════════
   BACKUP E RIPRISTINO — esportazione e importazione dati
═══════════════════════════════════════════════════════════════ */

/*
 * esportaTuttiDati()
 * ─────────────────────────────────────────────
 * Restituisce un oggetto con tutti i dati del database.
 * Usato da app.js per generare il file JSON di backup.
 */
async function esportaTuttiDati() {
  const libri        = await leggiTuttiLibri();
  const impostazioni = await leggiTutteImpostazioni();
  const generi       = await leggiGeneri();

  return {
    versione:    '1.0.0',
    esportato:   new Date().toISOString(),
    app:         'BuonaLettura',
    libri,
    impostazioni,
    generi,
  };
}

/*
 * importaDatiBackup(dati)
 * ─────────────────────────────────────────────
 * Importa un backup JSON nel database.
 * ATTENZIONE: sovrascrive tutti i dati esistenti.
 * Chiamare solo dopo doppia conferma utente.
 */
async function importaDatiBackup(dati) {
  if (!dati || !Array.isArray(dati.libri)) {
    throw new Error('File di backup non valido o corrotto.');
  }

  const db = await apriDB();

  return new Promise((risolvi, rifiuta) => {
    const tx = db.transaction(['libri', 'impostazioni', 'generi'], 'readwrite');

    /* Svuota tutti gli store prima di importare */
    tx.objectStore('libri').clear();
    tx.objectStore('impostazioni').clear();
    tx.objectStore('generi').clear();

    /* Reinserisce i dati dal backup */
    const storeLibri    = tx.objectStore('libri');
    const storeImpost   = tx.objectStore('impostazioni');
    const storeGeneri   = tx.objectStore('generi');

    dati.libri.forEach(l => storeLibri.add(l));

    if (dati.impostazioni) {
      Object.entries(dati.impostazioni).forEach(([chiave, valore]) => {
        storeImpost.put({ chiave, valore });
      });
    }

    if (Array.isArray(dati.generi) && dati.generi.length > 0) {
      /* Usa put con id esplicito progressivo — evita conflitti con unique index */
      dati.generi.forEach((g, idx) => {
        storeGeneri.put({ id: idx + 1, nome: g.nome, ordine: g.ordine !== undefined ? g.ordine : idx });
      });
    } else {
      /* Nessun genere nel backup — reinserisce i default */
      GENERI_DEFAULT.forEach((nome, idx) => {
        storeGeneri.put({ id: idx + 1, nome: nome, ordine: idx });
      });
    }

    tx.oncomplete = () => {
      aggiornaStatisticheLS();
      risolvi(dati.libri.length);
    };

    tx.onerror = (e) => rifiuta(e.target.error);
  });
}

/*
 * importaCSVGoodreads(testo)
 * ─────────────────────────────────────────────
 * Importa le letture da un file CSV esportato da Goodreads.
 * Goodreads export: My Books → Import/Export → Export Library
 * Campi CSV Goodreads: Title, Author, My Rating, Date Read, Bookshelves, ecc.
 *
 * Restituisce { importati, saltati, errori }
 */
async function importaCSVGoodreads(testo) {
  const righe = testo.trim().split('\n');
  if (righe.length < 2) throw new Error('File CSV vuoto o non valido.');

  /* Analizza l'intestazione per trovare le colonne */
  const intestazione = righe[0].split(',').map(c => c.replace(/"/g, '').trim());

  const idx = {
    titolo:    intestazione.indexOf('Title'),
    autore:    intestazione.indexOf('Author'),
    voto:      intestazione.indexOf('My Rating'),
    dataFine:  intestazione.indexOf('Date Read'),
    stato:     intestazione.indexOf('Exclusive Shelf'),
    pagine:    intestazione.indexOf('Number of Pages'),
    isbn:      intestazione.indexOf('ISBN13'),
    editore:   intestazione.indexOf('Publisher'),
    anno:      intestazione.indexOf('Year Published'),
  };

  let importati = 0, saltati = 0;
  const errori  = [];

  for (let i = 1; i < righe.length; i++) {
    /* Parser CSV semplice che gestisce le virgole nei valori tra virgolette */
    const campi = parsaRigaCSV(righe[i]);
    if (campi.length < 3) { saltati++; continue; }

    const leggi = (indice) => indice >= 0 ? (campi[indice] || '').replace(/"/g, '').trim() : '';

    /* Mappa lo stato Goodreads allo stato interno */
    const statoGr = leggi(idx.stato).toLowerCase();
    let stato = 'terminato';
    if (statoGr === 'currently-reading') stato = 'in-corso';
    else if (statoGr === 'to-read')       stato = 'da-leggere';

    /* Converte il voto Goodreads (1-5) in scala 1-10 */
    const votoGr  = parseInt(leggi(idx.voto), 10);
    const voto    = votoGr > 0 ? votoGr * 2 : null;

    /* Normalizza la data (Goodreads usa YYYY/MM/DD) */
    const dataRaw = leggi(idx.dataFine).replace(/\//g, '-');

    const datiLibro = {
      titolo:   leggi(idx.titolo),
      autore:   leggi(idx.autore),
      editore:  leggi(idx.editore),
      anno:     parseInt(leggi(idx.anno), 10) || null,
      pagine:   parseInt(leggi(idx.pagine), 10) || null,
      isbn:     leggi(idx.isbn).replace(/[^0-9X]/gi, ''),
      stato,
      voto,
      dataFine: stato === 'terminato' && dataRaw ? dataRaw : null,
    };

    if (!datiLibro.titolo || !datiLibro.autore) { saltati++; continue; }

    try {
      await aggiungiLibro(datiLibro);
      importati++;
    } catch (e) {
      errori.push(`Riga ${i + 1}: ${e.message}`);
      saltati++;
    }
  }

  return { importati, saltati, errori };
}

/*
 * parsaRigaCSV(riga)
 * Parser CSV minimale che gestisce virgolette e virgole nei campi.
 */
function parsaRigaCSV(riga) {
  const campi  = [];
  let corrente = '';
  let inVirgol = false;

  for (let i = 0; i < riga.length; i++) {
    const c = riga[i];
    if (c === '"') {
      inVirgol = !inVirgol;
    } else if (c === ',' && !inVirgol) {
      campi.push(corrente);
      corrente = '';
    } else {
      corrente += c;
    }
  }
  campi.push(corrente);
  return campi;
}

/*
 * resetTuttiDati()
 * ─────────────────────────────────────────────
 * Cancella tutti i dati dell'utente.
 * IRREVERSIBILE — chiamare solo dopo doppia conferma.
 * Non cancella le impostazioni di configurazione,
 * solo i libri. (Opinione: è quello che l'utente si aspetta)
 */
async function resetTuttiDati() {
  const db = await apriDB();

  return new Promise((risolvi, rifiuta) => {
    const tx = db.transaction('libri', 'readwrite');
    tx.objectStore('libri').clear();

    tx.oncomplete = () => {
      localStorage.setItem('bl_statistiche', JSON.stringify({
        totaleLibri: 0, totalePagine: 0, votoMedio: null
      }));
      risolvi(true);
    };

    tx.onerror = (e) => rifiuta(e.target.error);
  });
}

/* ═══════════════════════════════════════════════════════════════
   HEATMAP — dati per il grafico a calendario
═══════════════════════════════════════════════════════════════ */

/*
 * datiHeatmap(anno)
 * ─────────────────────────────────────────────
 * Restituisce un oggetto { 'YYYY-MM-DD': conteggioLibri }
 * per tutti i giorni in cui almeno un libro è stato terminato.
 * Usato da stats.js per disegnare la heatmap stile GitHub.
 */
async function datiHeatmap(anno) {
  const libri = await leggiTuttiLibri({ stato: 'terminato' });

  const mappa = {};

  libri.forEach(l => {
    if (!l.dataFine) return;
    const annoLibro = new Date(l.dataFine).getFullYear();
    if (anno && annoLibro !== anno) return;

    /* Normalizza la data al formato YYYY-MM-DD */
    const data = l.dataFine.split('T')[0];
    mappa[data] = (mappa[data] || 0) + 1;
  });

  return mappa;
}

/* ═══════════════════════════════════════════════════════════════
   ESPORTAZIONE MODULO
   Rende disponibili le funzioni agli altri file JS.
   Usato come: const DB = window.BuonaLetturDB;
═══════════════════════════════════════════════════════════════ */
window.BuonaLetturaDB = {
  /* Inizializzazione */
  inizializza: inizializzaDB,

  /* Libri */
  aggiungiLibro,
  leggiLibro,
  leggiTuttiLibri,
  aggiornaLibro,
  eliminaLibro,
  contaLibri,
  ordinaLibri,

  /* Statistiche */
  calcolaStatistiche,
  datiHeatmap,

  /* Impostazioni */
  leggiImpostazione,
  scriviImpostazione,
  leggiTutteImpostazioni,

  /* Generi */
  leggiGeneri,
  aggiungiGenere,
  eliminaGenere,

  /* Backup */
  esportaTuttiDati,
  importaDatiBackup,
  importaCSVGoodreads,
  resetTuttiDati,

  /* Costanti esposte — usate da app.js per i form */
  COLORI_DORSI,
  GENERI_DEFAULT,
};
