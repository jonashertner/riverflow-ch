/* Five languages, one catalogue.
 *
 * The site is written in English and published in Swiss German, French, Italian
 * and Rumantsch Grischun. The prose lives in per-language HTML files under /de,
 * /fr, /it and /rm; everything a script writes at runtime lives here, keyed by a
 * short name, with the English text carried in the same table rather than left in
 * the code. A missing key falls back to English and says so in the console, so a
 * half-finished translation degrades to a readable page instead of a blank one.
 *
 * Romansh is Rumantsch Grischun, the standardised written form the Confederation
 * uses for federal texts. The five idioms are living languages and this is not a
 * ranking; it is the register a page of federal law and federal data belongs in.
 *
 * German is Standard German in Swiss orthography: no eszett, «guillemets», and the
 * apostrophe group separator the federal registers themselves use. It is not
 * dialect, because no register quoted on this site is written in one.
 */

// Which language the page is, and where the shared assets are relative to it. Both
// are stated on the <html> element rather than guessed from the URL, so a page
// moved to a different path keeps working.
const LANG = (document.documentElement.getAttribute('lang') || 'en').slice(0, 2);
const ROOT = document.documentElement.dataset.root || './';

// The locale is not the language. Swiss French writes a space where Swiss German
// writes an apostrophe, and a figure quoted from a Swiss register should be written
// the way the reader's own administration writes it.
const LOCALES = { en: 'de-CH', de: 'de-CH', fr: 'fr-CH', it: 'it-CH', rm: 'rm-CH' };
const LOCALE = LOCALES[LANG] ?? 'de-CH';

const LANG_NAMES = { en: 'English', de: 'Deutsch', fr: 'Français', it: 'Italiano', rm: 'Rumantsch' };

// Number words, for the two or three places where a count is read out in prose
// rather than set as a figure. Only the range a count on this site can land in.
const NUMWORDS = {
  en: ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
       'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen',
       'nineteen', 'twenty'],
  de: ['keine', 'ein', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn',
       'elf', 'zwölf', 'dreizehn', 'vierzehn', 'fünfzehn', 'sechzehn', 'siebzehn', 'achtzehn',
       'neunzehn', 'zwanzig'],
  fr: ['aucun', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix',
       'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit',
       'dix-neuf', 'vingt'],
  it: ['nessuno', 'uno', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove', 'dieci',
       'undici', 'dodici', 'tredici', 'quattordici', 'quindici', 'sedici', 'diciassette',
       'diciotto', 'diciannove', 'venti'],
  rm: ['nagin', 'in', 'dus', 'trais', 'quatter', 'tschintg', 'sis', 'set', 'otg', 'nov', 'diesch',
       'endesch', 'dudesch', 'tredesch', 'quattordesch', 'quindesch', 'sedesch', 'deschset',
       'deschdotg', 'deschnov', 'ventg'],
};
const numWord = n => (NUMWORDS[LANG] ?? NUMWORDS.en)[n] ?? String(n);

const STR = Object.create(null);

/* T('key') returns the string for the current language, falling back to English.
 * T('key', {n: 3}) fills {n} placeholders. Values are inserted verbatim, so a value
 * that came from outside this repository must be escaped by the caller — the same
 * rule that governs every other innerHTML on this site. */
function T(key, vars) {
  const row = STR[key];
  if (!row) { console.warn('i18n: no such key', key); return key; }
  let s = row[LANG] ?? row.en;
  if (s === undefined) { console.warn('i18n: no English for', key); return key; }
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  return s;
}

// Plural in five languages, for the two counts this site actually inflects. Every
// language here happens to take the same shape — one form for 1, one for the rest —
// which is why this is a helper and not a plural-rules engine.
const Tn = (key, n, vars) => T(n === 1 ? key + '.one' : key + '.other', { n, ...vars });

/* ---- the words that arrive with the data -----------------------------------
 * A figure on this site travels with words: the name of the register it came
 * from, the cadence it is refreshed at, the type a federal register assigns to a
 * dam. Those words live in the data files rather than in this catalogue, because
 * the build writes them, and they are either this site's own English or the
 * German of the register that published them. D() translates one of them by its
 * own text and returns it unchanged when nothing is on file, so a source added to
 * the build shows up in every language on the day it is added — in English, but
 * shown — instead of not at all.
 *
 * Keyed by the string itself, the way build/pages/*.json keys a paragraph by the
 * paragraph. A key that stops matching stops translating and says so in the
 * console, which is the way this site prefers to fail.
 */
const DSTR = Object.create(null);
const DMISS = new Set();
function D(s) {
  if (typeof s !== 'string' || !s) return s;
  const row = DSTR[s];
  if (row && row[LANG]) return row[LANG];
  if (LANG !== 'en' && !row && !DMISS.has(s)) { DMISS.add(s); console.warn('i18n: no data string for', s); }
  return s;
}

/* Numbers. Every figure on this site is a quantity read off a register, so it is
 * written with the register's own separators and never with the model's default.
 *
 * Browsers ship no CLDR data for Romansh. Asked for rm-CH, Intl does not fail: it
 * quietly falls back to the browser's own locale and writes a Swiss figure the
 * American way, 41,128.5. So the locale handed to Intl is one every engine has,
 * and the two marks a Romansh reader should see &mdash; a narrow no-break space
 * between the thousands and a comma before the decimals, which is how the federal
 * texts in Romansh set a figure &mdash; are put back from the parts afterwards. */
const INTL = Intl.NumberFormat.supportedLocalesOf([LOCALE]).length ? LOCALE : 'de-CH';
const SEP = INTL === LOCALE ? null
          : LANG === 'rm' ? { group: '\u202f', decimal: ',' }
          : null;

function fmtNum(v, opts) {
  const f = new Intl.NumberFormat(INTL, opts);
  if (!SEP) return f.format(v);
  return f.formatToParts(v).map(p => SEP[p.type] ?? p.value).join('');
}

const nf = (v, max = 0) => fmtNum(v, { maximumFractionDigits: max });

// The same, where the number of decimals is itself the statement: a ratio of 2.00
// says two significant places were read, and 2 does not.
const nfd = (v, d) => fmtNum(Number(v), { minimumFractionDigits: d, maximumFractionDigits: d });

/* ---- the language switcher -------------------------------------------------
 * A row of five links, not a select, because a select hides four of the five
 * choices behind a gesture and there are only five. The current one is marked and
 * not a link. Each page states its own alternates in <link rel="alternate">, and
 * the switcher is built from those, so a page that exists in three languages
 * offers three and does not offer a fourth that would 404. */
function buildLangSwitch() {
  for (const host of document.querySelectorAll('[data-langswitch]')) {
    const alts = [...document.querySelectorAll('link[rel="alternate"][hreflang]')]
      .map(l => ({ lang: l.getAttribute('hreflang'), href: l.getAttribute('href') }))
      .filter(a => a.lang !== 'x-default');
    if (!alts.length) continue;
    // Two letters, not the full name: five full names do not fit a phone header and
    // the codes are the ones printed on every federal form. The full name is on the
    // control for anyone who needs it, and for anyone reading with their ears.
    host.innerHTML = alts.map(a => {
      const name = LANG_NAMES[a.lang] ?? a.lang;
      const code = a.lang.toUpperCase();
      return a.lang === LANG
        ? `<b lang="${a.lang}" aria-current="true" title="${name}"><abbr title="${name}">${code}</abbr></b>`
        : `<a lang="${a.lang}" href="${a.href}" hreflang="${a.lang}" title="${name}" aria-label="${name}">${code}</a>`;
    }).join('');
    host.setAttribute('aria-label', T('nav.language'));
  }
}
document.addEventListener('DOMContentLoaded', buildLangSwitch);

/* ---- the catalogue ---------------------------------------------------------
 * One row per string. English first, because English is the fallback and reading
 * down the file should read as the site does. Placeholders are {named}, never
 * positional, so a language that reorders a sentence can reorder it.
 */
Object.assign(STR, {

  // ---- the vintage spine, on the sources page ----
  'src.loadFail': {
    en: 'The source list failed to load: {e}',
    de: 'Die Quellenliste konnte nicht geladen werden: {e}',
    fr: 'La liste des sources n’a pas pu être chargée : {e}',
    it: 'L’elenco delle fonti non ha potuto essere caricato: {e}',
    rm: 'La glista da las funtaunas na pudeva betg vegnir chargiada: {e}',
  },
  'src.noState': {
    en: 'no data state published',
    de: 'kein Datenstand publiziert',
    fr: 'aucun état des données publié',
    it: 'nessuno stato dei dati pubblicato',
    rm: 'nagin status da datas publitgà',
  },
  'src.live': { en: 'live', de: 'live', fr: 'en direct', it: 'in diretta', rm: 'en direct' },
  'src.notStated': { en: 'not stated', de: 'nicht angegeben', fr: 'non indiqué', it: 'non indicato', rm: 'betg inditgà' },
  'src.readLive': { en: 'read live', de: 'live gelesen', fr: 'lu en direct', it: 'letto in diretta', rm: 'legì en direct' },
  'src.thSource': { en: 'Source', de: 'Quelle', fr: 'Source', it: 'Fonte', rm: 'Funtauna' },
  'src.thClass': { en: 'Class', de: 'Klasse', fr: 'Classe', it: 'Classe', rm: 'Classa' },
  'src.thState': { en: 'Data state', de: 'Datenstand', fr: 'État des données', it: 'Stato dei dati', rm: 'Status da las datas' },
  'src.thAge': { en: 'Age', de: 'Alter', fr: 'Âge', it: 'Età', rm: 'Vegliadetgna' },
  'src.licence': { en: 'Licence: {l}.', de: 'Lizenz: {l}.', fr: 'Licence : {l}.', it: 'Licenza: {l}.', rm: 'Licenza: {l}.' },
  'src.seeSource': { en: 'see source', de: 'siehe Quelle', fr: 'voir la source', it: 'vedi la fonte', rm: 'vesair la funtauna' },
  'src.linkSource': { en: 'source', de: 'Quelle', fr: 'source', it: 'fonte', rm: 'funtauna' },
  'src.built': {
    en: 'Data states read from the federal legend endpoints on <b>{d}</b>. <b>{n} of {total} sources are more than five years old.</b> Nothing here is a forecast and nothing here is a finding of breach.',
    de: 'Datenstände am <b>{d}</b> von den Legenden-Endpunkten des Bundes gelesen. <b>{n} von {total} Quellen sind älter als fünf Jahre.</b> Nichts davon ist eine Prognose und nichts davon ist die Feststellung einer Verletzung.',
    fr: 'États des données lus le <b>{d}</b> depuis les points d’accès aux légendes de la Confédération. <b>{n} sources sur {total} ont plus de cinq ans.</b> Rien ici n’est une prévision et rien ici n’est le constat d’une violation.',
    it: 'Stati dei dati letti il <b>{d}</b> dagli endpoint delle legende federali. <b>{n} fonti su {total} hanno più di cinque anni.</b> Nulla di quanto segue è una previsione e nulla è l’accertamento di una violazione.',
    rm: 'Status da las datas legì ils <b>{d}</b> dals puncts d’access da las legendas federalas. <b>{n} da {total} funtaunas èn pli veglias che tschintg onns.</b> Nagut qua n’è ina prognosa e nagut qua n’è la constataziun d’ina violaziun.',
  },

  // Three lines for one fact, because how the dates on this page were obtained is
  // itself part of what the page reports: read here and now, read here and now
  // except for the ones that did not answer, or standing as the build left them.
  'src.builtLive': {
    en: 'Data states read from the federal legend endpoints just now, in this browser — all {layers} layers answered. <b>{n} of {total} sources are more than five years old.</b> Nothing here is a forecast and nothing here is a finding of breach.',
    de: 'Datenstände soeben in diesem Browser von den Legenden-Endpunkten des Bundes gelesen — alle {layers} Ebenen haben geantwortet. <b>{n} von {total} Quellen sind älter als fünf Jahre.</b> Nichts davon ist eine Prognose und nichts davon ist die Feststellung einer Verletzung.',
    fr: 'États des données lus à l’instant, dans ce navigateur, depuis les points d’accès aux légendes de la Confédération — les {layers} couches ont toutes répondu. <b>{n} sources sur {total} ont plus de cinq ans.</b> Rien ici n’est une prévision et rien ici n’est le constat d’une violation.',
    it: 'Stati dei dati letti or ora, in questo browser, dagli endpoint delle legende federali — tutti i {layers} livelli hanno risposto. <b>{n} fonti su {total} hanno più di cinque anni.</b> Nulla di quanto segue è una previsione e nulla è l’accertamento di una violazione.',
    rm: 'Status da las datas legì gist ussa, en quest browser, dals puncts d’access da las legendas federalas — tut ils {layers} nivels han respundì. <b>{n} da {total} funtaunas èn pli veglias che tschintg onns.</b> Nagut qua n’è ina prognosa e nagut qua n’è la constataziun d’ina violaziun.',
  },
  'src.builtPart': {
    en: 'Data states: {r} of {layers} federal layers answered just now, in this browser; the rest stand as read on <b>{d}</b>. <b>{n} of {total} sources are more than five years old.</b> Nothing here is a forecast and nothing here is a finding of breach.',
    de: 'Datenstände: {r} von {layers} Ebenen des Bundes haben soeben in diesem Browser geantwortet; die übrigen stehen so, wie sie am <b>{d}</b> gelesen wurden. <b>{n} von {total} Quellen sind älter als fünf Jahre.</b> Nichts davon ist eine Prognose und nichts davon ist die Feststellung einer Verletzung.',
    fr: 'États des données : {r} des {layers} couches fédérales ont répondu à l’instant, dans ce navigateur ; les autres restent telles qu’elles ont été lues le <b>{d}</b>. <b>{n} sources sur {total} ont plus de cinq ans.</b> Rien ici n’est une prévision et rien ici n’est le constat d’une violation.',
    it: 'Stati dei dati: {r} dei {layers} livelli federali hanno risposto or ora, in questo browser; gli altri restano come sono stati letti il <b>{d}</b>. <b>{n} fonti su {total} hanno più di cinque anni.</b> Nulla di quanto segue è una previsione e nulla è l’accertamento di una violazione.',
    rm: 'Status da las datas: {r} dals {layers} nivels federals han respundì gist ussa, en quest browser; ils auters restan uschia sco els èn vegnids legids ils <b>{d}</b>. <b>{n} da {total} funtaunas èn pli veglias che tschintg onns.</b> Nagut qua n’è ina prognosa e nagut qua n’è la constataziun d’ina violaziun.',
  },

  // ---- the twenty-six cantonal deliveries ----
  'ct.loadFail': {
    en: 'The cantonal delivery list failed to load: {e}',
    de: 'Die Liste der kantonalen Lieferungen konnte nicht geladen werden: {e}',
    fr: 'La liste des livraisons cantonales n’a pas pu être chargée : {e}',
    it: 'L’elenco delle consegne cantonali non ha potuto essere caricato: {e}',
    rm: 'La glista da las furniziuns chantunalas na pudeva betg vegnir chargiada: {e}',
  },
  'ct.note': {
    en: 'Delivery dates from the geodienste.ch service register, read on {d}. All <b>{covered}</b> cantons deliver the model and all <b>{free}</b> publish it freely. The oldest delivery is <b>{oldCt}</b>, {old}; the newest {new}. Marked in amber: a delivery more than three years behind the newest one.',
    de: 'Lieferdaten aus dem Dienstregister von geodienste.ch, gelesen am {d}. Alle <b>{covered}</b> Kantone liefern das Modell und alle <b>{free}</b> publizieren es frei. Die älteste Lieferung ist <b>{oldCt}</b>, {old}; die neueste {new}. Bernsteinfarben markiert: eine Lieferung, die mehr als drei Jahre hinter der neuesten liegt.',
    fr: 'Dates de livraison tirées du registre de services geodienste.ch, lues le {d}. Les <b>{covered}</b> cantons livrent tous le modèle et tous les <b>{free}</b> le publient librement. La livraison la plus ancienne est celle de <b>{oldCt}</b>, {old} ; la plus récente {new}. En ambre : une livraison en retard de plus de trois ans sur la plus récente.',
    it: 'Date di consegna dal registro dei servizi geodienste.ch, lette il {d}. Tutti i <b>{covered}</b> cantoni consegnano il modello e tutti i <b>{free}</b> lo pubblicano liberamente. La consegna più vecchia è quella di <b>{oldCt}</b>, {old}; la più recente {new}. In ambra: una consegna in ritardo di oltre tre anni rispetto alla più recente.',
    rm: 'Datas da furniziun ord il register da servetschs geodienste.ch, legidas ils {d}. Tut ils <b>{covered}</b> chantuns furneschan il model e tut ils <b>{free}</b> al publitgeschan liberamain. La furniziun la pli veglia è quella da <b>{oldCt}</b>, {old}; la pli nova {new}. En ambra: ina furniziun che tarda dapli che trais onns sin la pli nova.',
  },

  // ---- where Swiss water goes, on the about page ----
  'bs.loadFail': {
    en: 'The basin derivation failed to load: {e}',
    de: 'Die Herleitung der Einzugsgebiete konnte nicht geladen werden: {e}',
    fr: 'La dérivation des bassins n’a pas pu être chargée : {e}',
    it: 'La derivazione dei bacini non ha potuto essere caricata: {e}',
    rm: 'La derivaziun dals bogns na pudeva betg vegnir chargiada: {e}',
  },
  'bs.gauged': {
    en: 'gauged at the frontier',
    de: 'an der Grenze gemessen',
    fr: 'mesuré à la frontière',
    it: 'misurato al confine',
    rm: 'mesirà a la frontiera',
  },
  'bs.ungauged': {
    en: 'not gauged at the frontier',
    de: 'an der Grenze nicht gemessen',
    fr: 'non mesuré à la frontière',
    it: 'non misurato al confine',
    rm: 'betg mesirà a la frontiera',
  },
  'bs.thReaches': { en: 'Reaches', de: 'Erreicht', fr: 'Atteint', it: 'Raggiunge', rm: 'Cuntanscha' },
  'bs.thShare': { en: 'Share', de: 'Anteil', fr: 'Part', it: 'Quota', rm: 'Part' },
  'bs.thGauge': { en: 'Last Swiss gauge', de: 'Letzte Schweizer Messstelle', fr: 'Dernière station suisse', it: 'Ultima stazione svizzera', rm: 'Ultima staziun svizra' },
  'bs.thMean': { en: 'Modelled mean', de: 'Modelliertes Mittel', fr: 'Moyenne modélisée', it: 'Media modellata', rm: 'Media modelada' },
  'bs.thNow': { en: 'Now', de: 'Jetzt', fr: 'Maintenant', it: 'Ora', rm: 'Ussa' },
  'bs.via': { en: 'via {via}', de: 'über {via}', fr: 'par {via}', it: 'per {via}', rm: 'via {via}' },
  'bs.through': { en: 'Through {states}.', de: 'Durch {states}.', fr: 'À travers {states}.', it: 'Attraverso {states}.', rm: 'Tras {states}.' },
  'bs.kmFromBorder': { en: '{km} km from the border', de: '{km} km von der Grenze', fr: '{km} km de la frontière', it: '{km} km dal confine', rm: '{km} km da la frontiera' },
  'bs.notAtFrontier': { en: ' &mdash; not at the frontier', de: ' &mdash; nicht an der Grenze', fr: ' &mdash; pas à la frontière', it: ' &mdash; non al confine', rm: ' &mdash; betg a la frontiera' },
  'bs.reading': { en: 'reading&#8230;', de: 'wird gelesen&#8230;', fr: 'lecture&#8230;', it: 'lettura&#8230;', rm: 'vegn legì&#8230;' },
  'bs.noReading': { en: 'no reading', de: 'keine Messung', fr: 'pas de mesure', it: 'nessuna misura', rm: 'nagina mesiraziun' },
  'bs.readFailed': { en: 'read failed', de: 'Lesen fehlgeschlagen', fr: 'échec de la lecture', it: 'lettura fallita', rm: 'la lectura è fallida' },
  'bs.xModelled': { en: '{r}&#215; modelled', de: '{r}&#215; modelliert', fr: '{r}&#215; la modélisation', it: '{r}&#215; il modellato', rm: '{r}&#215; il modelà' },
  'bs.meanNote': {
    en: 'The mean is HydroRIVERS <code>DIS_AV_CMS</code> at the reach the gauge is snapped to: <b>modelled, and natural</b> &mdash; it is what the reach would carry with nothing taken out of it. The right-hand column is read live from LINDAS when this page loads.',
    de: 'Das Mittel ist HydroRIVERS <code>DIS_AV_CMS</code> auf dem Abschnitt, dem die Messstelle zugeordnet ist: <b>modelliert und natürlich</b> &mdash; es ist, was der Abschnitt führen würde, wenn ihm nichts entnommen würde. Die rechte Spalte wird beim Laden dieser Seite live aus LINDAS gelesen.',
    fr: 'La moyenne est HydroRIVERS <code>DIS_AV_CMS</code> sur le tronçon auquel la station est rattachée : <b>modélisée et naturelle</b> &mdash; c’est ce que le tronçon porterait si rien n’en était prélevé. La colonne de droite est lue en direct depuis LINDAS au chargement de la page.',
    it: 'La media è HydroRIVERS <code>DIS_AV_CMS</code> sul tratto a cui la stazione è agganciata: <b>modellata e naturale</b> &mdash; è ciò che il tratto porterebbe se non gli fosse prelevato nulla. La colonna di destra è letta in diretta da LINDAS al caricamento della pagina.',
    rm: 'La media è HydroRIVERS <code>DIS_AV_CMS</code> sin la partida da flum a la quala la staziun è colliada: <b>modelada e natirala</b> &mdash; quai che la partida purtass sche nagut na vegniss prendì ora. La colonna a dretga vegn legida en direct da LINDAS cun chargiar questa pagina.',
  },
  'bs.liveNote': {
    en: 'The right-hand column was read from LINDAS at <b>{d}, {time}</b>: the discharge passing that gauge at that moment, as published, unvalidated. The mean it is set against is HydroRIVERS <code>DIS_AV_CMS</code> at the reach the gauge is snapped to, which is <b>modelled, and natural</b> &mdash; what the reach would carry with nothing taken out of it. A ratio far below one is therefore as likely to be an abstraction as a drought, and on the Inn it is.',
    de: 'Die rechte Spalte wurde am <b>{d}, {time}</b> aus LINDAS gelesen: der Abfluss, der in diesem Moment durch die Messstelle geht, wie publiziert, ungeprüft. Das Mittel, gegen das er gestellt ist, ist HydroRIVERS <code>DIS_AV_CMS</code> auf dem zugeordneten Abschnitt und damit <b>modelliert und natürlich</b> &mdash; was der Abschnitt führen würde, wenn ihm nichts entnommen würde. Ein Verhältnis weit unter eins ist deshalb ebenso wahrscheinlich eine Entnahme wie eine Trockenheit, und am Inn ist es eine.',
    fr: 'La colonne de droite a été lue depuis LINDAS le <b>{d}, {time}</b> : le débit passant à cette station à cet instant, tel que publié, non validé. La moyenne à laquelle il est comparé est HydroRIVERS <code>DIS_AV_CMS</code> sur le tronçon rattaché, donc <b>modélisée et naturelle</b> &mdash; ce que le tronçon porterait si rien n’en était prélevé. Un rapport très inférieur à un est dès lors aussi bien un prélèvement qu’une sécheresse, et sur l’Inn c’en est un.',
    it: 'La colonna di destra è stata letta da LINDAS il <b>{d}, {time}</b>: la portata che passa a quella stazione in quel momento, così come pubblicata, non validata. La media a cui è rapportata è HydroRIVERS <code>DIS_AV_CMS</code> sul tratto agganciato, quindi <b>modellata e naturale</b> &mdash; ciò che il tratto porterebbe se non gli fosse prelevato nulla. Un rapporto molto inferiore a uno è perciò tanto un prelievo quanto una siccità, e sull’Inn lo è.',
    rm: 'La colonna a dretga è vegnida legida da LINDAS ils <b>{d}, {time}</b>: la quantitad d’aua che passa quella staziun en quel mument, sco publitgada, betg validada. La media cun la quala ella vegn cumparada è HydroRIVERS <code>DIS_AV_CMS</code> sin la partida colliada, pia <b>modelada e natirala</b> &mdash; quai che la partida purtass sche nagut na vegniss prendì ora. Ina relaziun fitg sut in è perquai tuttina bain ina prelevaziun sco ina setgira, e sin l’En è ella ina prelevaziun.',
  },
  'bs.iceNote': {
    en: 'Upper bar: the 1850 outlines. Lower bar: the 2023 inventory. Both on one axis. The 2023 areas are the inventory’s own and sum to its published <b>{now} km&#178;</b>. The 1850 areas are measured here from the outlines by the shoelace and sum to <b>{pastSum} km&#178;</b> against the inventory’s published <b>{past} km&#178;</b>, {excess}&#8201;% high, because a hole inside a glacier outline is counted here as ice. Each body is assigned to a basin by its own centroid.',
    de: 'Obere Leiste: die Umrisse von 1850. Untere Leiste: das Inventar 2023. Beide auf einer Achse. Die Flächen von 2023 stammen aus dem Inventar selbst und summieren sich auf die publizierten <b>{now} km&#178;</b>. Die Flächen von 1850 werden hier aus den Umrissen mit der Gauss’schen Trapezformel gemessen und summieren sich auf <b>{pastSum} km&#178;</b> gegenüber den publizierten <b>{past} km&#178;</b>, {excess}&#8201;% zu hoch, weil ein Loch im Umriss eines Gletschers hier als Eis zählt. Jeder Körper wird über seinen eigenen Schwerpunkt einem Einzugsgebiet zugeordnet.',
    fr: 'Barre supérieure : les contours de 1850. Barre inférieure : l’inventaire de 2023. Les deux sur un même axe. Les surfaces de 2023 sont celles de l’inventaire et totalisent les <b>{now} km&#178;</b> publiés. Les surfaces de 1850 sont mesurées ici sur les contours par la formule du lacet et totalisent <b>{pastSum} km&#178;</b> contre les <b>{past} km&#178;</b> publiés, soit {excess}&#8201;% de trop, parce qu’un trou à l’intérieur d’un contour est compté ici comme de la glace. Chaque corps est rattaché à un bassin par son propre centroïde.',
    it: 'Barra superiore: i contorni del 1850. Barra inferiore: l’inventario del 2023. Entrambe su un solo asse. Le superfici del 2023 sono quelle dell’inventario e sommano ai <b>{now} km&#178;</b> pubblicati. Le superfici del 1850 sono misurate qui dai contorni con la formula dell’area di Gauss e sommano a <b>{pastSum} km&#178;</b> contro i <b>{past} km&#178;</b> pubblicati, {excess}&#8201;% in più, perché un foro all’interno di un contorno è qui contato come ghiaccio. Ogni corpo è assegnato a un bacino dal proprio centroide.',
    rm: 'Bara survart: ils cuntuorns dal 1850. Bara sutvart: l’inventari dal 2023. Omadus sin ina singula assa. Las surfatschas dal 2023 èn quellas da l’inventari e dattan ensemen ils <b>{now} km&#178;</b> publitgads. Las surfatschas dal 1850 vegnan mesiradas qua sin ils cuntuorns cun la formla da Gauss e dattan ensemen <b>{pastSum} km&#178;</b> cunter ils <b>{past} km&#178;</b> publitgads, {excess}&#8201;% memia bler, perquai ch’in fora en in cuntuorn vegn quintà qua sco glatsch. Mintga corp vegn attribuì ad in bogn tras ses agen center.',
  },

  // ---- Art. 31(1) GSchG, the reader's own figure ----
  'calc.zero': {
    en: 'Enter a Q<sub>347</sub> above zero. At zero there is no permanent flow and Art. 31 does not apply.',
    de: 'Geben Sie ein Q<sub>347</sub> über null ein. Bei null besteht keine ständige Wasserführung und Art. 31 ist nicht anwendbar.',
    fr: 'Entrez un Q<sub>347</sub> supérieur à zéro. À zéro il n’y a pas d’écoulement permanent et l’art. 31 ne s’applique pas.',
    it: 'Inserire un Q<sub>347</sub> superiore a zero. A zero non vi è deflusso permanente e l’art. 31 non si applica.',
    rm: 'Endatai in Q<sub>347</sub> sur nulla. Tar nulla n’datti nagin deflus permanent e l’art. 31 n’è betg applitgabel.',
  },
  'calc.result': {
    en: 'Minimum residual flow <b>{r} l/s</b> ({m} m&#179;/s), which is {p}&#8201;% of Q<sub>347</sub>.',
    de: 'Mindestrestwassermenge <b>{r} l/s</b> ({m} m&#179;/s), das sind {p}&#8201;% von Q<sub>347</sub>.',
    fr: 'Débit résiduel minimal <b>{r} l/s</b> ({m} m&#179;/s), soit {p}&#8201;% du Q<sub>347</sub>.',
    it: 'Deflusso residuale minimo <b>{r} l/s</b> ({m} m&#179;/s), pari al {p}&#8201;% del Q<sub>347</sub>.',
    rm: 'Quantitad minimala d’aua restanta <b>{r} l/s</b> ({m} m&#179;/s), quai fa {p}&#8201;% dal Q<sub>347</sub>.',
  },
  'calc.ceiling': {
    en: ' Q<sub>347</sub> is above 60 000 l/s, so the table is at its ceiling.',
    de: ' Q<sub>347</sub> liegt über 60 000 l/s, die Tabelle ist damit an ihrer Obergrenze.',
    fr: ' Le Q<sub>347</sub> dépasse 60 000 l/s : le tableau est à son plafond.',
    it: ' Il Q<sub>347</sub> supera i 60 000 l/s: la tabella è al suo massimo.',
    rm: ' Il Q<sub>347</sub> è sur 60 000 l/s, la tabella è pia tar sia limita.',
  },

  // ---- ages, in the coarsest unit that still says something ----
  'age.min.one':  { en: '{n} minute', de: '{n} Minute', fr: '{n} minute', it: '{n} minuto', rm: '{n} minuta' },
  'age.min.other':{ en: '{n} minutes', de: '{n} Minuten', fr: '{n} minutes', it: '{n} minuti', rm: '{n} minutas' },
  'age.hour.one': { en: '{n} hour', de: '{n} Stunde', fr: '{n} heure', it: '{n} ora', rm: '{n} ura' },
  'age.hour.other':{ en: '{n} hours', de: '{n} Stunden', fr: '{n} heures', it: '{n} ore', rm: '{n} uras' },
  'age.day.one': { en: '{n} day', de: '{n} Tag', fr: '{n} jour', it: '{n} giorno', rm: '{n} di' },
  'age.day.other': { en: '{n} days', de: '{n} Tage', fr: '{n} jours', it: '{n} giorni', rm: '{n} dis' },
  'age.months': { en: '{n} months', de: '{n} Monate', fr: '{n} mois', it: '{n} mesi', rm: '{n} mais' },
  'age.years': { en: '{n} years', de: '{n} Jahre', fr: '{n} ans', it: '{n} anni', rm: '{n} onns' },
  // ---- the two-canvas surface control, written by theme.js ----
  'theme.night': {
    en: 'Night. Switch to day.',
    de: 'Nacht. Auf Tag umschalten.',
    fr: 'Nuit. Passer au jour.',
    it: 'Notte. Passare al giorno.',
    rm: 'Notg. Midar sin di.',
  },
  'theme.day': {
    en: 'Day. Follow the system instead.',
    de: 'Tag. Stattdessen dem System folgen.',
    fr: 'Jour. Suivre plutôt le système.',
    it: 'Giorno. Seguire invece il sistema.',
    rm: 'Di. Suandar plitost il sistem.',
  },
  'theme.auto': {
    en: 'Following the system. Switch to night.',
    de: 'Folgt dem System. Auf Nacht umschalten.',
    fr: 'Suit le système. Passer à la nuit.',
    it: 'Segue il sistema. Passare alla notte.',
    rm: 'Suonda il sistem. Midar sin notg.',
  },
  'nav.language': { en: 'Language', de: 'Sprache', fr: 'Langue', it: 'Lingua', rm: 'Lingua' },

  // ---- the Rhine derivation box ----
  'bs.derLast': {
    en: 'mean at {name}, the last Swiss gauge',
    de: 'Mittel bei {name}, der letzten Schweizer Messstelle',
    fr: 'moyenne à {name}, la dernière station suisse',
    it: 'media a {name}, l’ultima stazione svizzera',
    rm: 'media a {name}, l’ultima staziun svizra',
  },
  'bs.derDown': {
    en: 'mean at {place}',
    de: 'Mittel bei {place}',
    fr: 'moyenne à {place}',
    it: 'media a {place}',
    rm: 'media a {place}',
  },
  'bs.derShare': {
    en: 'of the Rhine’s mean flow',
    de: 'des mittleren Abflusses des Rheins',
    fr: 'du débit moyen du Rhin',
    it: 'della portata media del Reno',
    rm: 'da la quantitad media d’aua dal Rain',
  },
  'bs.derArea': {
    en: 'of the basin lies in Switzerland',
    de: 'des Einzugsgebiets liegen in der Schweiz',
    fr: 'du bassin se trouvent en Suisse',
    it: 'del bacino si trovano in Svizzera',
    rm: 'dal bogn èn en Svizra',
  },
  'bs.derBasin': {
    en: 'is the basin',
    de: 'misst das Einzugsgebiet',
    fr: 'est la surface du bassin',
    it: 'è la superficie del bacino',
    rm: 'è la surfatscha dal bogn',
  },
  'bs.derPct': {
    en: 'of its area',
    de: 'seiner Fläche',
    fr: 'de sa surface',
    it: 'della sua superficie',
    rm: 'da sia surfatscha',
  },
  'bs.derCite': {
    en: 'Swiss mean: HydroRIVERS <code>DIS_AV_CMS</code> at the reach gauge {id} stands on &mdash; modelled, not the federal statistic. Downstream mean and basin area: {src}, which states the area as &laquo;circa&raquo; and is rounded to here. Swiss area in the basin: the grid on this page.',
    de: 'Schweizer Mittel: HydroRIVERS <code>DIS_AV_CMS</code> auf dem Abschnitt, auf dem die Messstelle {id} steht &mdash; modelliert, nicht die Bundesstatistik. Mittel unterhalb und Fläche des Einzugsgebiets: {src}; dort ist die Fläche mit «circa» angegeben und wird hier darauf gerundet. Schweizer Fläche im Einzugsgebiet: das Raster auf dieser Seite.',
    fr: 'Moyenne suisse : HydroRIVERS <code>DIS_AV_CMS</code> sur le tronçon où se trouve la station {id} &mdash; modélisée, et non la statistique fédérale. Moyenne à l’aval et surface du bassin : {src}, qui indique la surface comme «&nbsp;circa&nbsp;» et à laquelle on arrondit ici. Surface suisse dans le bassin : la grille de cette page.',
    it: 'Media svizzera: HydroRIVERS <code>DIS_AV_CMS</code> sul tratto su cui sorge la stazione {id} &mdash; modellata, non la statistica federale. Media a valle e superficie del bacino: {src}, che indica la superficie come «circa» e a cui qui si arrotonda. Superficie svizzera nel bacino: la griglia di questa pagina.',
    rm: 'Media svizra: HydroRIVERS <code>DIS_AV_CMS</code> sin la partida da flum sin la quala stat la staziun {id} &mdash; modelada, betg la statistica federala. Media pli giu ed surfatscha dal bogn: {src}, che inditgescha la surfatscha sco «circa» e vi da la quala vegn arrundà qua. Surfatscha svizra en il bogn: la grilla sin questa pagina.',
  },
  'bs.liveFail': {
    en: 'The live read failed: {e}. The long-term means stand.',
    de: 'Die Live-Abfrage ist fehlgeschlagen: {e}. Die langjährigen Mittel bleiben bestehen.',
    fr: 'La lecture en direct a échoué : {e}. Les moyennes de longue durée subsistent.',
    it: 'La lettura in diretta è fallita: {e}. Le medie di lungo periodo restano valide.',
    rm: 'La lectura en direct è fallida: {e}. Las medias da lunga durada restan.',
  },
  'bs.icePast': { en: '1850: {v} km&#178;', de: '1850: {v} km&#178;', fr: '1850 : {v} km&#178;', it: '1850: {v} km&#178;', rm: '1850: {v} km&#178;' },
  'bs.iceNow': { en: '2023: {v} km&#178;', de: '2023: {v} km&#178;', fr: '2023 : {v} km&#178;', it: '2023: {v} km&#178;', rm: '2023: {v} km&#178;' },
});
