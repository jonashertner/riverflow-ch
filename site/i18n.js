/* Five languages, one catalogue.
 *
 * The site is written in English and published in Swiss German, French, Italian
 * and Rumantsch Grischun. The prose lives in per-language HTML files under /de,
 * /fr, /it and /rm; everything a script writes at runtime lives here, keyed by a
 * short name. The German map is published at / and the English one at /en/; the
 * English reading pages keep their stable root URLs. A missing key falls back to
 * English and says so in the console, so a
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

  // ---- the public evidence audit of cantonal monitoring ----
  'audit.loadFail': {
    en: 'The monitoring audit failed to load: {e}', de: 'Das Monitoring-Audit konnte nicht geladen werden: {e}',
    fr: 'L’audit de la surveillance n’a pas pu être chargé : {e}', it: 'Non è stato possibile caricare l’audit del monitoraggio: {e}',
    rm: 'L’audit dal monitoring na pudeva betg vegnir chargià: {e}',
  },
  'audit.thCanton': { en: 'Canton', de: 'Kanton', fr: 'Canton', it: 'Cantone', rm: 'Chantun' },
  'audit.thNawa': { en: 'NAWA stations', de: 'NAWA-Messstellen', fr: 'Stations NAWA', it: 'Stazioni NAWA', rm: 'Staziuns NAWA' },
  'audit.thEvidence': { en: 'Public evidence found', de: 'Öffentlicher Nachweis', fr: 'Preuve publique trouvée', it: 'Riscontro pubblico trovato', rm: 'Cumprova publica chattada' },
  'audit.thScope': { en: 'Scope shown', de: 'Ausgewiesener Umfang', fr: 'Portée indiquée', it: 'Ambito indicato', rm: 'Extensiun mussada' },
  'audit.record.results.year': { en: 'dated results · {y}', de: 'datierte Ergebnisse · {y}', fr: 'résultats datés · {y}', it: 'risultati datati · {y}', rm: 'resultats datads · {y}' },
  'audit.record.results': { en: 'dated results', de: 'datierte Ergebnisse', fr: 'résultats datés', it: 'risultati datati', rm: 'resultats datads' },
  'audit.record.programme.year': { en: 'programme record · {y}', de: 'Programmnachweis · {y}', fr: 'trace du programme · {y}', it: 'riscontro del programma · {y}', rm: 'cumprova dal program · {y}' },
  'audit.record.programme': { en: 'programme described', de: 'Programm beschrieben', fr: 'programme décrit', it: 'programma descritto', rm: 'program descrit' },
  'audit.record.partial.year': { en: 'partial record · {y}', de: 'Teilnachweis · {y}', fr: 'trace partielle · {y}', it: 'riscontro parziale · {y}', rm: 'cumprova parziala · {y}' },
  'audit.record.partial': { en: 'partial record', de: 'Teilnachweis', fr: 'trace partielle', it: 'riscontro parziale', rm: 'cumprova parziala' },
  'audit.official': { en: 'Official record ↗', de: 'Amtlicher Nachweis ↗', fr: 'Source officielle ↗', it: 'Fonte ufficiale ↗', rm: 'Cumprova uffiziala ↗' },
  'audit.zero': { en: 'none in this release', de: 'keine in dieser Ausgabe', fr: 'aucune dans cette version', it: 'nessuna in questa versione', rm: 'naginas en questa versiun' },
  'audit.scope.chemistry': { en: 'chemistry', de: 'Chemie', fr: 'chimie', it: 'chimica', rm: 'chemia' },
  'audit.scope.biology': { en: 'biology', de: 'Biologie', fr: 'biologie', it: 'biologia', rm: 'biologia' },
  'audit.scope.groundwater': { en: 'groundwater', de: 'Grundwasser', fr: 'eaux souterraines', it: 'acque sotterranee', rm: 'aua sutterrana' },
  'audit.scope.lakes': { en: 'lakes', de: 'Seen', fr: 'lacs', it: 'laghi', rm: 'lais' },
  'audit.scope.data': { en: 'results/data', de: 'Ergebnisse/Daten', fr: 'résultats/données', it: 'risultati/dati', rm: 'resultats/datas' },
  'audit.note': {
    en: 'National count: BAFU NAWA TREND {version}, <b>{stations}</b> stations in <b>{covered} of 26</b> cantons. Cantonal links and evidence type checked <b>{checked}</b>. A row records what was publicly verified; it is not a finding of legal compliance.',
    de: 'Nationale Zählung: BAFU NAWA TREND {version}, <b>{stations}</b> Messstellen in <b>{covered} von 26</b> Kantonen. Kantonale Links und Nachweisart geprüft am <b>{checked}</b>. Eine Zeile hält fest, was öffentlich verifiziert wurde; sie ist keine Feststellung der Rechtskonformität.',
    fr: 'Décompte national : NAWA TREND de l’OFEV {version}, <b>{stations}</b> stations dans <b>{covered} cantons sur 26</b>. Liens cantonaux et type de preuve vérifiés le <b>{checked}</b>. Une ligne consigne ce qui a pu être vérifié publiquement ; elle ne constate pas la conformité au droit.',
    it: 'Conteggio nazionale: NAWA TREND dell’UFAM {version}, <b>{stations}</b> stazioni in <b>{covered} cantoni su 26</b>. Link cantonali e tipo di riscontro verificati il <b>{checked}</b>. Ogni riga registra ciò che è stato verificato pubblicamente; non accerta la conformità giuridica.',
    rm: 'Dumbraziun naziunala: NAWA TREND da l’UFAM {version}, <b>{stations}</b> staziuns en <b>{covered} da 26</b> chantuns. Colliaziuns chantunalas e tip da cumprova controllads ils <b>{checked}</b>. Ina lingia registrescha quai ch’è vegnì verifitgà publicamain; ella na constatescha betg la conformitad giuridica.',
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

  // ---- the water budget page ----
  'bg.loadFail': {
    en: 'The water budget failed to load: {e}',
    de: 'Die Wasserbilanz konnte nicht geladen werden: {e}',
    fr: 'Le bilan hydrique n’a pas pu être chargé : {e}',
    it: 'Il bilancio idrico non ha potuto essere caricato: {e}',
    rm: 'La bilantscha d’aua na pudeva betg vegnir chargiada: {e}',
  },
  'bg.dateline': {
    en: 'Annual balance for {y}, BAFU table of {stamp}. Monthly indicators to {m}; drought platform data of {upd}.',
    de: 'Jahresbilanz {y}, BAFU-Tabelle vom {stamp}. Monatliche Indikatoren bis {m}; Daten der Trockenheitsplattform vom {upd}.',
    fr: 'Bilan annuel {y}, tableau de l’OFEV de {stamp}. Indicateurs mensuels jusqu’à {m} ; données de la plateforme sécheresse du {upd}.',
    it: 'Bilancio annuale {y}, tabella dell’UFAM di {stamp}. Indicatori mensili fino a {m}; dati della piattaforma siccità del {upd}.',
    rm: 'Bilantscha annuala {y}, tabella da l’UFAM da {stamp}. Indicaturs mensils fin {m}; datas da la plattafurma da sitgira dals {upd}.',
  },
  'bg.tOut': { en: 'Outflow, Rhine and Rhône', de: 'Abfluss, Rhein und Rhone', fr: 'Écoulement, Rhin et Rhône', it: 'Deflusso, Reno e Rodano', rm: 'Defluss, Rain e Rodan' },
  'bg.tOutSub': {
    en: '{m}: {q} against a mean of {n}&#8239;m&#179;/s',
    de: '{m}: {q} gegenüber einem Mittel von {n}&#8239;m&#179;/s',
    fr: '{m} : {q} contre une moyenne de {n}&#8239;m&#179;/s',
    it: '{m}: {q} contro una media di {n}&#8239;m&#179;/s',
    rm: '{m}: {q} cunter ina media da {n}&#8239;m&#179;/s',
  },
  'bg.tGw': { en: 'Groundwater sites below normal', de: 'Grundwassermessstellen unter normal', fr: 'Stations d’eaux souterraines sous la normale', it: 'Stazioni delle acque sotterranee sotto la norma', rm: 'Staziuns d’aua sutterrana sut la norma' },
  'bg.tLake': { en: 'Lakes below normal', de: 'Seen unter normal', fr: 'Lacs sous la normale', it: 'Laghi sotto la norma', rm: 'Lais sut la norma' },
  'bg.tGwSub': { en: '{m}; {high} above normal', de: '{m}; {high} über normal', fr: '{m} ; {high} au-dessus de la normale', it: '{m}; {high} sopra la norma', rm: '{m}; {high} sur la norma' },
  'bg.tLakeSub': { en: '{m}; {high} above normal', de: '{m}; {high} über normal', fr: '{m} ; {high} au-dessus de la normale', it: '{m}; {high} sopra la norma', rm: '{m}; {high} sur la norma' },
  'bg.tDry': { en: 'Drought regions at level 4 or 5', de: 'Trockenheitsregionen auf Stufe 4 oder 5', fr: 'Régions de sécheresse au niveau 4 ou 5', it: 'Regioni di siccità al livello 4 o 5', rm: 'Regiuns da sitgira sin il stgalim 4 u 5' },
  'bg.tDrySub': {
    en: 'Week of {d}; median soil moisture {soil}&#8239;% of usable field capacity',
    de: 'Woche vom {d}; Median der Bodenfeuchte {soil}&#8239;% der nutzbaren Feldkapazität',
    fr: 'Semaine du {d} ; humidité du sol médiane {soil}&#8239;% de la capacité au champ utile',
    it: 'Settimana del {d}; umidità del suolo mediana {soil}&#8239;% della capacità di campo utile',
    rm: 'Emna dals {d}; median da l’umiditad dal terren {soil}&#8239;% da la capacitad da champ utilisabla',
  },
  'bg.tRes': { en: 'Storage lakes, filling', de: 'Speicherseen, Füllungsgrad', fr: 'Lacs d’accumulation, remplissage', it: 'Laghi artificiali, riempimento', rm: 'Lais d’accumulaziun, emplenida' },
  'bg.tResSub': {
    en: 'Week of {d}, in stored energy; {rank} for the week (BFE)',
    de: 'Woche vom {d}, als gespeicherte Energie; {rank} für die Woche (BFE)',
    fr: 'Semaine du {d}, en énergie stockée ; {rank} pour la semaine (OFEN)',
    it: 'Settimana del {d}, in energia accumulata; {rank} per la settimana (UFE)',
    rm: 'Emna dals {d}, en energia accumulada; {rank} per l’emna (UFE)',
  },
  'bg.tIce': { en: 'Glacier volume, {y}', de: 'Gletschervolumen, {y}', fr: 'Volume des glaciers, {y}', it: 'Volume dei ghiacciai, {y}', rm: 'Volumen dals glatschers, {y}' },
  'bg.tIceSub': {
    en: '{loss}&#8239;km&#179; of ice lost in the year; {left}&#8239;km&#179; left (GLAMOS)',
    de: '{loss}&#8239;km&#179; Eis im Jahr verloren; {left}&#8239;km&#179; verbleiben (GLAMOS)',
    fr: '{loss}&#8239;km&#179; de glace perdus dans l’année ; il en reste {left}&#8239;km&#179; (GLAMOS)',
    it: '{loss}&#8239;km&#179; di ghiaccio persi nell’anno; ne restano {left}&#8239;km&#179; (GLAMOS)',
    rm: '{loss}&#8239;km&#179; glatsch pers durant l’onn; i restan {left}&#8239;km&#179; (GLAMOS)',
  },
  'bg.outAria': {
    en: 'Monthly outflow of the Rhine at Basel and the Rhône at Chancy as a share of the 1991–2020 mean, {from} to {to}',
    de: 'Monatlicher Abfluss des Rheins bei Basel und der Rhone bei Chancy als Anteil am Mittel 1991–2020, {from} bis {to}',
    fr: 'Écoulement mensuel du Rhin à Bâle et du Rhône à Chancy en part de la moyenne 1991–2020, de {from} à {to}',
    it: 'Deflusso mensile del Reno a Basilea e del Rodano a Chancy in quota della media 1991–2020, da {from} a {to}',
    rm: 'Defluss mensil dal Rain a Basilea e dal Rodan a Chancy sco part da la media 1991–2020, da {from} fin {to}',
  },
  'bg.keyBelow': { en: 'Below the mean', de: 'Unter dem Mittel', fr: 'Sous la moyenne', it: 'Sotto la media', rm: 'Sut la media' },
  'bg.keyAbove': { en: 'At or above the mean', de: 'Am oder über dem Mittel', fr: 'À la moyenne ou au-dessus', it: 'Pari o sopra la media', rm: 'Tar u sur la media' },
  'bg.outNote': {
    en: 'In the twelve months from {from} to {to} the two rivers carried {v}&#8239;km&#179; out of the country, against {n}&#8239;km&#179; in an average year: {p}&#8239;%.',
    de: 'In den zwölf Monaten von {from} bis {to} führten die beiden Flüsse {v}&#8239;km&#179; aus dem Land, gegenüber {n}&#8239;km&#179; in einem mittleren Jahr: {p}&#8239;%.',
    fr: 'Pendant les douze mois de {from} à {to}, les deux fleuves ont emporté {v}&#8239;km&#179; hors du pays, contre {n}&#8239;km&#179; une année moyenne : {p}&#8239;%.',
    it: 'Nei dodici mesi da {from} a {to} i due fiumi hanno portato fuori dal Paese {v}&#8239;km&#179;, contro {n}&#8239;km&#179; in un anno medio: {p}&#8239;%.',
    rm: 'En ils dudesch mais da {from} fin {to} han ils dus flums purtà {v}&#8239;km&#179; ord il pajais, cunter {n}&#8239;km&#179; en in onn mesaun: {p}&#8239;%.',
  },
  'bg.showNumbers': { en: 'Show the numbers', de: 'Zahlen anzeigen', fr: 'Afficher les chiffres', it: 'Mostra i numeri', rm: 'Mussar las cifras' },
  'bg.thMonth': { en: 'Month', de: 'Monat', fr: 'Mois', it: 'Mese', rm: 'Mais' },
  'bg.thMeanMonth': { en: 'Mean 1991–2020, both', de: 'Mittel 1991–2020, beide', fr: 'Moyenne 1991–2020, les deux', it: 'Media 1991–2020, entrambi', rm: 'Media 1991–2020, omadus' },
  'bg.thShare': { en: 'Share of mean', de: 'Anteil am Mittel', fr: 'Part de la moyenne', it: 'Quota della media', rm: 'Part da la media' },
  'bg.dryAria': {
    en: 'Number of drought regions at each level of the combined drought index, weekly, {from} to {to}',
    de: 'Anzahl Trockenheitsregionen je Stufe des kombinierten Trockenheitsindex, wöchentlich, {from} bis {to}',
    fr: 'Nombre de régions de sécheresse par niveau de l’indice de sécheresse combiné, par semaine, du {from} au {to}',
    it: 'Numero di regioni di siccità per livello dell’indice di siccità combinato, settimanale, dal {from} al {to}',
    rm: 'Dumber da regiuns da sitgira per stgalim da l’index da sitgira cumbinà, mintg’emna, dals {from} fin {to}',
  },
  'bg.cdi1': { en: 'Level 1, not dry', de: 'Stufe 1, nicht trocken', fr: 'Niveau 1, pas sec', it: 'Livello 1, non secco', rm: 'Stgalim 1, betg sitg' },
  'bg.cdi2': { en: 'Level 2', de: 'Stufe 2', fr: 'Niveau 2', it: 'Livello 2', rm: 'Stgalim 2' },
  'bg.cdi3': { en: 'Level 3', de: 'Stufe 3', fr: 'Niveau 3', it: 'Livello 3', rm: 'Stgalim 3' },
  'bg.cdi4': { en: 'Level 4', de: 'Stufe 4', fr: 'Niveau 4', it: 'Livello 4', rm: 'Stgalim 4' },
  'bg.cdi5': { en: 'Level 5, extremely dry', de: 'Stufe 5, extrem trocken', fr: 'Niveau 5, extrêmement sec', it: 'Livello 5, estremamente secco', rm: 'Stgalim 5, extremamain sitg' },
  'bg.dryList': { en: 'Regions at level 5 in the week of {d}:', de: 'Regionen auf Stufe 5 in der Woche vom {d}:', fr: 'Régions au niveau 5 la semaine du {d} :', it: 'Regioni al livello 5 nella settimana del {d}:', rm: 'Regiuns sin il stgalim 5 en l’emna dals {d}:' },
  'bg.nowNote': {
    en: 'Outflow, groundwater, lakes and the drought index are read from the numeric data of the federal drought platform (BAFU, MeteoSwiss, swisstopo). Sites without a reading in the last month, or with fewer than {min} years of 1991–2020 record for the month, are left out: {gw} groundwater sites and {lk} lake sites.',
    de: 'Abfluss, Grundwasser, Seen und Trockenheitsindex stammen aus den numerischen Daten der Trockenheitsplattform des Bundes (BAFU, MeteoSwiss, swisstopo). Messstellen ohne Wert im letzten Monat oder mit weniger als {min} Jahren 1991–2020 für den Monat sind weggelassen: {gw} beim Grundwasser und {lk} bei den Seen.',
    fr: 'Écoulement, eaux souterraines, lacs et indice de sécheresse proviennent des données numériques de la plateforme fédérale sur la sécheresse (OFEV, MétéoSuisse, swisstopo). Les stations sans valeur le mois dernier, ou avec moins de {min} ans de 1991–2020 pour le mois, sont écartées : {gw} pour les eaux souterraines et {lk} pour les lacs.',
    it: 'Deflusso, acque sotterranee, laghi e indice di siccità provengono dai dati numerici della piattaforma federale sulla siccità (UFAM, MeteoSvizzera, swisstopo). Le stazioni senza valore nell’ultimo mese, o con meno di {min} anni di 1991–2020 per il mese, sono escluse: {gw} per le acque sotterranee e {lk} per i laghi.',
    rm: 'Defluss, aua sutterrana, lais e l’index da sitgira derivan da las datas numericas da la plattafurma federala da sitgira (UFAM, MeteoSvizra, swisstopo). Staziuns senza valur l’ultim mais, u cun main che {min} onns da 1991–2020 per il mais, èn laschadas davent: {gw} tar l’aua sutterrana e {lk} tar ils lais.',
  },
  'bg.P': { en: 'Precipitation', de: 'Niederschlag', fr: 'Précipitations', it: 'Precipitazioni', rm: 'Precipitaziun' },
  'bg.E': { en: 'Evaporation', de: 'Verdunstung', fr: 'Évaporation', it: 'Evaporazione', rm: 'Evaporaziun' },
  'bg.R': { en: 'Runoff from Swiss land', de: 'Abfluss aus der Schweiz', fr: 'Écoulement issu du territoire suisse', it: 'Deflusso dal territorio svizzero', rm: 'Defluss dal territori svizzer' },
  'bg.dS': { en: 'Change in storage', de: 'Speicheränderung', fr: 'Variation des réserves', it: 'Variazione delle riserve', rm: 'Midada da las reservas' },
  'bg.inflow': { en: 'Inflow from abroad', de: 'Zufluss aus dem Ausland', fr: 'Apports de l’étranger', it: 'Afflusso dall’estero', rm: 'Affluenza da l’exteriur' },
  'bg.outflow': { en: 'Outflow abroad', de: 'Abfluss ins Ausland', fr: 'Écoulement vers l’étranger', it: 'Deflusso verso l’estero', rm: 'Defluss a l’exteriur' },
  'bg.draw': { en: 'Taken from storage', de: 'Aus Speichern entnommen', fr: 'Prélevé sur les réserves', it: 'Prelevato dalle riserve', rm: 'Prendì da las reservas' },
  'bg.gain': { en: 'Added to storage', de: 'In Speicher eingelagert', fr: 'Ajouté aux réserves', it: 'Aggiunto alle riserve', rm: 'Agiuntà a las reservas' },
  'bg.periodPick': { en: 'Period', de: 'Zeitraum', fr: 'Période', it: 'Periodo', rm: 'Perioda' },
  'bg.yearN': { en: 'Year {y}', de: 'Jahr {y}', fr: 'Année {y}', it: 'Anno {y}', rm: 'Onn {y}' },
  'bg.meanN': { en: 'Mean {p}', de: 'Mittel {p}', fr: 'Moyenne {p}', it: 'Media {p}', rm: 'Media {p}' },
  'bg.in': { en: 'In', de: 'Ein', fr: 'Entrées', it: 'Entrate', rm: 'Entradas' },
  'bg.out': { en: 'Out', de: 'Aus', fr: 'Sorties', it: 'Uscite', rm: 'Sortidas' },
  'bg.balSum': {
    en: 'Both bars come to {t}, or {k}, over political Switzerland.',
    de: 'Beide Balken ergeben {t} oder {k} über der politischen Schweiz.',
    fr: 'Les deux barres totalisent {t}, soit {k}, sur la Suisse politique.',
    it: 'Entrambe le barre sommano a {t}, ossia {k}, sulla Svizzera politica.',
    rm: 'Omaduas trav fan {t}, u {k}, sur la Svizra politica.',
  },
  'bg.thTerm': { en: 'Term', de: 'Grösse', fr: 'Terme', it: 'Termine', rm: 'Termin' },
  'bg.balNote': {
    en: 'In {y} precipitation was {p}&#8239;% and runoff {r}&#8239;% of the 1991–2020 mean. Source: <a href="{url}">BAFU, water balance table</a>; method: <a href="{m}">Zappa et al. 2017</a>.',
    de: '{y} betrug der Niederschlag {p}&#8239;% und der Abfluss {r}&#8239;% des Mittels 1991–2020. Quelle: <a href="{url}">BAFU, Tabelle Wasserhaushalt</a>; Methode: <a href="{m}">Zappa et al. 2017</a>.',
    fr: 'En {y}, les précipitations ont atteint {p}&#8239;% et l’écoulement {r}&#8239;% de la moyenne 1991–2020. Source : <a href="{url}">OFEV, tableau du bilan hydrique</a> ; méthode : <a href="{m}">Zappa et al. 2017</a>.',
    it: 'Nel {y} le precipitazioni sono state il {p}&#8239;% e il deflusso il {r}&#8239;% della media 1991–2020. Fonte: <a href="{url}">UFAM, tabella del bilancio idrico</a>; metodo: <a href="{m}">Zappa et al. 2017</a>.',
    rm: 'Il {y} è la precipitaziun stada {p}&#8239;% ed il defluss {r}&#8239;% da la media 1991–2020. Funtauna: <a href="{url}">UFAM, tabella da la bilantscha d’aua</a>; metoda: <a href="{m}">Zappa et al. 2017</a>.',
  },
  'bg.thCatch': { en: 'Catchment', de: 'Einzugsgebiet', fr: 'Bassin versant', it: 'Bacino imbrifero', rm: 'Bogn da derivaziun' },
  'bg.normDs': { en: '1991–2020: {v}', de: '1991–2020: {v}', fr: '1991–2020 : {v}', it: '1991–2020: {v}', rm: '1991–2020: {v}' },
  'bg.catchNote': {
    en: 'The smaller figure under each value is its share of the catchment’s own 1991–2020 mean. Each catchment is named after the gauge that closes it; some are the area between two gauges, such as the Aare from Bern to Brügg.',
    de: 'Die kleinere Zahl unter jedem Wert ist sein Anteil am eigenen Mittel 1991–2020 des Einzugsgebiets. Jedes Gebiet ist nach der Messstation benannt, die es abschliesst; manche sind Zwischengebiete zwischen zwei Stationen, etwa die Aare von Bern bis Brügg.',
    fr: 'Le petit chiffre sous chaque valeur est sa part de la moyenne 1991–2020 du bassin lui-même. Chaque bassin porte le nom de la station qui le ferme ; certains sont la surface entre deux stations, comme l’Aar de Berne à Brügg.',
    it: 'La cifra più piccola sotto ogni valore è la sua quota della media 1991–2020 del bacino stesso. Ogni bacino porta il nome della stazione che lo chiude; alcuni sono l’area tra due stazioni, come l’Aare da Berna a Brügg.',
    rm: 'La cifra pli pitschna sut mintga valur è sia part da la media 1991–2020 dal bogn sez. Mintga bogn porta il num da la staziun che al serra; intgins èn la surfatscha tranter duas staziuns, sco l’Aara da Berna fin Brügg.',
  },
  'bg.st.groundwater': { en: 'Groundwater', de: 'Grundwasser', fr: 'Eaux souterraines', it: 'Acque sotterranee', rm: 'Aua sutterrana' },
  'bg.st.lakes': { en: 'Lakes', de: 'Seen', fr: 'Lacs', it: 'Laghi', rm: 'Lais' },
  'bg.st.glaciers': { en: 'Glacier ice', de: 'Gletschereis', fr: 'Glace des glaciers', it: 'Ghiaccio dei ghiacciai', rm: 'Glatsch dals glatschers' },
  'bg.st.soil': { en: 'Soil water', de: 'Bodenwasser', fr: 'Eau du sol', it: 'Acqua del suolo', rm: 'Aua dal terren' },
  'bg.st.reservoirs': { en: 'Reservoirs, dam register', de: 'Stauanlagen, Register', fr: 'Retenues, registre des barrages', it: 'Bacini, registro degli sbarramenti', rm: 'Bacins, register da las serras' },
  'bg.stn.groundwater': { en: 'An estimate from 2012, not a measured stock.', de: 'Eine Schätzung von 2012, kein gemessener Vorrat.', fr: 'Une estimation de 2012, pas un stock mesuré.', it: 'Una stima del 2012, non una riserva misurata.', rm: 'Ina stima da 2012, betg ina reserva mesirada.' },
  'bg.stn.lakes': { en: 'Includes the foreign parts of the border lakes.', de: 'Schliesst die ausländischen Teile der Grenzseen ein.', fr: 'Inclut les parties étrangères des lacs frontaliers.', it: 'Include le parti estere dei laghi di confine.', rm: 'Cuntegna las parts estras dals lais da cunfin.' },
  'bg.stn.glaciers': { en: 'Ice volume, not water equivalent.', de: 'Eisvolumen, nicht Wasseräquivalent.', fr: 'Volume de glace, pas équivalent en eau.', it: 'Volume di ghiaccio, non equivalente in acqua.', rm: 'Volumen da glatsch, betg equivalent d’aua.' },
  'bg.stn.soil': { en: 'An upper bound; the amount present varies through the year.', de: 'Eine Obergrenze; die vorhandene Menge schwankt über das Jahr.', fr: 'Une limite supérieure ; la quantité présente varie au fil de l’année.', it: 'Un limite superiore; la quantità presente varia durante l’anno.', rm: 'In limit superiur; la quantitad preschenta varia durant l’onn.' },
  'bg.stn.reservoirs': { en: 'Sum of dam volumes. The weekly level is reported in energy, not water.', de: 'Summe der Stauvolumen. Der wöchentliche Stand wird als Energie gemeldet, nicht als Wasser.', fr: 'Somme des volumes de retenue. Le niveau hebdomadaire est publié en énergie, pas en eau.', it: 'Somma dei volumi d’invaso. Il livello settimanale è pubblicato in energia, non in acqua.', rm: 'Summa dals volumens da retegnida. Il nivel da mintg’emna vegn publitgà en energia, betg en aua.' },
  'bg.flowP': { en: 'Precipitation in {y}, for scale', de: 'Niederschlag {y}, zum Vergleich', fr: 'Précipitations {y}, pour comparaison', it: 'Precipitazioni {y}, per confronto', rm: 'Precipitaziun {y}, per cumparegliar' },
  'bg.flowOut': { en: 'Outflow abroad in {y}, for scale', de: 'Abfluss ins Ausland {y}, zum Vergleich', fr: 'Écoulement vers l’étranger {y}, pour comparaison', it: 'Deflusso verso l’estero {y}, per confronto', rm: 'Defluss a l’exteriur {y}, per cumparegliar' },
  'bg.upTo': { en: 'up to', de: 'bis zu', fr: 'jusqu’à', it: 'fino a', rm: 'fin a' },
  'bg.storeNote': {
    en: 'The pale extension of the glacier bar is the ice lost since {y0}, when the volume was {v0}&#8239;km&#179;. The last two bars are flows over one year, not stores; they are drawn on the same axis only to show scale.',
    de: 'Die blasse Verlängerung des Gletscherbalkens ist das seit {y0} verlorene Eis; damals betrug das Volumen {v0}&#8239;km&#179;. Die beiden letzten Balken sind Flüsse über ein Jahr, keine Speicher; sie stehen nur zum Grössenvergleich auf derselben Achse.',
    fr: 'Le prolongement pâle de la barre des glaciers est la glace perdue depuis {y0}, quand le volume était de {v0}&#8239;km&#179;. Les deux dernières barres sont des flux sur une année, pas des réserves ; elles figurent sur le même axe pour l’échelle seulement.',
    it: 'Il prolungamento chiaro della barra dei ghiacciai è il ghiaccio perso dal {y0}, quando il volume era di {v0}&#8239;km&#179;. Le ultime due barre sono flussi su un anno, non riserve; stanno sullo stesso asse solo per dare la scala.',
    rm: 'La prolungaziun pallida da la trav dals glatschers è il glatsch pers dapi {y0}, cura ch’il volumen era {v0}&#8239;km&#179;. Las ultimas duas travs èn flussiuns sur in onn, betg reservas; ellas stattan sin il medem axa mo per mussar la proporziun.',
  },
  'bg.thStore': { en: 'Store', de: 'Speicher', fr: 'Réserve', it: 'Riserva', rm: 'Reserva' },
  'bg.thSize': { en: 'Size', de: 'Grösse', fr: 'Taille', it: 'Dimensione', rm: 'Grondezza' },
  'bg.thSource': { en: 'Source', de: 'Quelle', fr: 'Source', it: 'Fonte', rm: 'Funtauna' },
  'bg.usableYr': { en: '{v}&#8239;km&#179; a year sustainably usable', de: '{v}&#8239;km&#179; pro Jahr nachhaltig nutzbar', fr: '{v}&#8239;km&#179; par an utilisables durablement', it: '{v}&#8239;km&#179; all’anno utilizzabili in modo sostenibile', rm: '{v}&#8239;km&#179; per onn utilisabels a moda persistenta' },
  'bg.usableCap': { en: '{v}&#8239;km&#179; usable capacity', de: '{v}&#8239;km&#179; Nutzinhalt', fr: '{v}&#8239;km&#179; de volume utile', it: '{v}&#8239;km&#179; di volume utile', rm: '{v}&#8239;km&#179; volumen utilisabel' },
  'bg.fillNow': { en: '{p}&#8239;% full in energy on {d}', de: 'am {d} zu {p}&#8239;% gefüllt, als Energie', fr: 'rempli à {p}&#8239;% en énergie le {d}', it: 'pieno al {p}&#8239;% in energia il {d}', rm: 'emplenì per {p}&#8239;% en energia ils {d}' },
  'bg.useLead': {
    en: 'In {y} public supply delivered {mio} million m&#179; of drinking water, or {v}&#8239;km&#179;: {share}&#8239;% of the precipitation of {py}, and {lpd} litres per person a day, households and businesses together.',
    de: '{y} lieferte die öffentliche Versorgung {mio} Millionen m&#179; Trinkwasser, also {v}&#8239;km&#179;: {share}&#8239;% des Niederschlags von {py} und {lpd} Liter pro Person und Tag, Haushalte und Betriebe zusammen.',
    fr: 'En {y}, la distribution publique a fourni {mio} millions de m&#179; d’eau potable, soit {v}&#8239;km&#179; : {share}&#8239;% des précipitations de {py}, et {lpd} litres par personne et par jour, ménages et entreprises ensemble.',
    it: 'Nel {y} l’approvvigionamento pubblico ha fornito {mio} milioni di m&#179; di acqua potabile, ossia {v}&#8239;km&#179;: il {share}&#8239;% delle precipitazioni del {py} e {lpd} litri per persona al giorno, economie domestiche e aziende insieme.',
    rm: 'Il {y} ha il provediment public furnì {mio} milliuns m&#179; aua da baiver, pia {v}&#8239;km&#179;: {share}&#8239;% da la precipitaziun dal {py} e {lpd} liters per persuna ed di, chasadas e manaschis ensemen.',
  },
  'bg.thYear': { en: 'Year', de: 'Jahr', fr: 'Année', it: 'Anno', rm: 'Onn' },
  'bg.thTotal': { en: 'Total, million m&#179;', de: 'Total, Mio. m&#179;', fr: 'Total, millions de m&#179;', it: 'Totale, milioni di m&#179;', rm: 'Total, milliuns m&#179;' },
  'bg.thSpring': { en: 'Springs', de: 'Quellen', fr: 'Sources', it: 'Sorgenti', rm: 'Funtaunas' },
  'bg.thGround': { en: 'Groundwater', de: 'Grundwasser', fr: 'Eaux souterraines', it: 'Acque sotterranee', rm: 'Aua sutterrana' },
  'bg.thLake': { en: 'Lakes', de: 'Seen', fr: 'Lacs', it: 'Laghi', rm: 'Lais' },
  'bg.thLpd': { en: 'Litres per person a day', de: 'Liter pro Person und Tag', fr: 'Litres par personne et par jour', it: 'Litri per persona al giorno', rm: 'Liters per persuna ed di' },
  'bg.useNote': {
    en: 'Federal Statistical Office, table T 02.03.01.01, from the SVGW; the latest year is an extrapolation from a sample of suppliers. <a href="{url}">Table</a>, changed {d}.',
    de: 'Bundesamt für Statistik, Tabelle T 02.03.01.01, nach SVGW; das jüngste Jahr ist eine Hochrechnung aus einer Stichprobe von Versorgern. <a href="{url}">Tabelle</a>, geändert am {d}.',
    fr: 'Office fédéral de la statistique, tableau T 02.03.01.01, d’après la SSIGE ; la dernière année est une extrapolation à partir d’un échantillon de distributeurs. <a href="{url}">Tableau</a>, modifié le {d}.',
    it: 'Ufficio federale di statistica, tabella T 02.03.01.01, secondo la SSIGA; l’ultimo anno è un’estrapolazione da un campione di aziende. <a href="{url}">Tabella</a>, modificata il {d}.',
    rm: 'Uffizi federal da statistica, tabella T 02.03.01.01, tenor la SSIGA; l’ultim onn è ina extrapolaziun ord ina selecziun da furniturs. <a href="{url}">Tabella</a>, midada ils {d}.',
  },
  'bg.thUse': { en: 'Use', de: 'Nutzung', fr: 'Utilisation', it: 'Utilizzo', rm: 'Utilisaziun' },
  'bg.thVolume': { en: 'Volume', de: 'Menge', fr: 'Volume', it: 'Volume', rm: 'Volumen' },
  'bg.mio': { en: 'million m&#179;', de: 'Mio. m&#179;', fr: 'millions de m&#179;', it: 'milioni di m&#179;', rm: 'milliuns m&#179;' },
  'bg.noYear': { en: 'no year given', de: 'ohne Jahr', fr: 'sans année', it: 'senza anno', rm: 'senza onn' },
  'bg.u.industry': { en: 'Industry and services, own supply', de: 'Industrie und Gewerbe, Eigenversorgung', fr: 'Industrie et services, approvisionnement propre', it: 'Industria e servizi, approvvigionamento proprio', rm: 'Industria e servetschs, provediment agen' },
  'bg.u.nuclear': { en: 'Cooling of nuclear power plants', de: 'Kühlung der Kernkraftwerke', fr: 'Refroidissement des centrales nucléaires', it: 'Raffreddamento delle centrali nucleari', rm: 'Sfradentaziun da las ovras nuclearas' },
  'bg.u.agriculture': { en: 'Agriculture', de: 'Landwirtschaft', fr: 'Agriculture', it: 'Agricoltura', rm: 'Agricultura' },
  'bg.u.snow': { en: 'Artificial snow', de: 'Technische Beschneiung', fr: 'Enneigement technique', it: 'Innevamento tecnico', rm: 'Naiv artifiziala' },
  'bg.un.industry': { en: 'About two thirds for cooling and air conditioning.', de: 'Rund zwei Drittel für Kühlung und Klimatisierung.', fr: 'Environ deux tiers pour le refroidissement et la climatisation.', it: 'Circa due terzi per raffreddamento e climatizzazione.', rm: 'Var dus terzs per sfradentar e climatisar.' },
  'bg.un.nuclear': { en: 'River water passed through and mostly returned, warmer.', de: 'Flusswasser, das durchläuft und grösstenteils wärmer zurückfliesst.', fr: 'Eau de rivière qui transite et revient en majeure partie, plus chaude.', it: 'Acqua di fiume che transita e torna in gran parte, più calda.', rm: 'Aua da flum che passa e returna per gronda part, pli chauda.' },
  'bg.un.agriculture': { en: 'About one third for irrigation; measured in only a few cantons.', de: 'Rund ein Drittel für Bewässerung; nur in wenigen Kantonen gemessen.', fr: 'Environ un tiers pour l’irrigation ; mesuré dans quelques cantons seulement.', it: 'Circa un terzo per l’irrigazione; misurato solo in pochi cantoni.', rm: 'Var in terz per l’irrigaziun; mesirà mo en paucs chantuns.' },
  'bg.un.snow': { en: 'Water used to make snow on ski runs.', de: 'Wasser zur Beschneiung von Skipisten.', fr: 'Eau utilisée pour enneiger les pistes de ski.', it: 'Acqua usata per innevare le piste da sci.', rm: 'Aua duvrada per far naiv sin las pistas da skis.' },
  'bg.otherNote': {
    en: 'BAFU, <a href="{url}">water use</a>, page of {d}. National estimates, not measured abstraction.',
    de: 'BAFU, <a href="{url}">Wassernutzung</a>, Seite vom {d}. Nationale Schätzungen, keine gemessenen Entnahmen.',
    fr: 'OFEV, <a href="{url}">utilisation de l’eau</a>, page du {d}. Estimations nationales, pas des prélèvements mesurés.',
    it: 'UFAM, <a href="{url}">utilizzo dell’acqua</a>, pagina del {d}. Stime nazionali, non prelievi misurati.',
    rm: 'UFAM, <a href="{url}">utilisaziun da l’aua</a>, pagina dals {d}. Stimaziuns naziunalas, betg prelevaziuns mesiradas.',
  },
});
