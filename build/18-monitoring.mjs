#!/usr/bin/env node
/* A cautious public-evidence audit of cantonal water monitoring.
 *
 * The station count is derived from the exact NAWA release used by the map. The
 * evidence records are curated because a canton page cannot be understood from
 * its URL or publication date alone. `checked` therefore moves only after a
 * human review of all 26 primary records; the weekly build must not imply that a
 * source was re-read when it was merely fetched again.
 *
 * `record` describes what the linked public page proves:
 *   results   a dated result, report or dataset was found
 *   programme a monitoring programme is described, but the latest result was
 *             not established from that page in this review
 *   partial   only a partial public record was established in this review
 *
 * None of these values means compliant or non-compliant. GSchG Art. 58 is a
 * functional duty, not one national parameter/station/frequency checklist.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const QUALITY = path.join(ROOT, 'site/data/quality.json');
const OUT = path.join(ROOT, 'site/data/canton-monitoring.json');
const CHECKED = '2026-08-21';

const evidence = [
  ['AG', 'Aargau', 'results', 2023, ['chemistry', 'biology', 'data'], 'https://www.ag.ch/de/themen/umwelt-natur/wasser-gewaesser/oberflaechengewaesser/zustand-fliessgewaesser/langzeitueberwachung-der-fliessgewaesser'],
  ['AI', 'Appenzell Innerrhoden', 'results', 2024, ['chemistry', 'biology', 'data'], 'https://ar.ch/fileadmin/user_upload/Departement_Bau_Volkswirtschaft/Amt_fuer_Umwelt/Umwelt/Publikationen/Merkblaetter/Umwelt/Fliessgewaesseruntersuchung_2024_FACHBERICHT_AR_AI.pdf'],
  ['AR', 'Appenzell Ausserrhoden', 'results', 2024, ['chemistry', 'biology', 'data'], 'https://ar.ch/fileadmin/user_upload/Departement_Bau_Volkswirtschaft/Amt_fuer_Umwelt/Umwelt/Publikationen/Merkblaetter/Umwelt/Fliessgewaesseruntersuchung_2024_FACHBERICHT_AR_AI.pdf'],
  ['BE', 'Bern', 'results', 2026, ['chemistry', 'biology', 'groundwater', 'lakes', 'data'], 'https://www.bvd.be.ch/de/start/themen/wasser/gewaesserqualitaet.html'],
  ['BL', 'Basel-Landschaft', 'results', 2025, ['chemistry', 'groundwater', 'data'], 'https://www.baselland.ch/politik-und-behorden/direktionen/bau-und-umweltschutzdirektion/umweltschutz-energie/wasser/grundwasser/ueberwachung-des-grundwassers/zustand-chemische-gewaesserqualitaet-der-baselbieter-gewaesser'],
  ['BS', 'Basel-Stadt', 'results', 2023, ['chemistry', 'biology', 'data'], 'https://www.bs.ch/publikationen/oberflaechengewaesserbericht-1993-2023'],
  ['FR', 'Fribourg', 'results', 2022, ['chemistry', 'biology', 'lakes', 'data'], 'https://www.fr.ch/energie-agriculture-et-environnement/eau/lacs-et-cours-deau/qualite-des-cours-deau/documentation-qualite-des-cours-deau'],
  ['GE', 'Genève', 'results', 2026, ['chemistry', 'biology', 'lakes', 'data'], 'https://www.ge.ch/suivi-qualite-eau-faune-flore-rivieres-du-lac'],
  ['GL', 'Glarus', 'programme', null, ['chemistry', 'data'], 'https://www.gl.ch/verwaltung/bau-und-umwelt/umwelt-wald-und-energie/umweltschutz-und-energie/gewaesserschutz/oberflaechengewaesser.html/8598'],
  ['GR', 'Graubünden', 'partial', 2020, ['groundwater', 'data'], 'https://www.gr.ch/DE/institutionen/verwaltung/ekud/anu/themen/Grundwasser/grundwasserqualitaet/Seiten/grundwasserqualitaet.aspx'],
  ['JU', 'Jura', 'results', 2024, ['chemistry', 'biology', 'data'], 'https://www.jura.ch/fr/Autorites/Administration/DEC/ENV/Eaux/Cours-d-eau/Qualite-des-eaux/Qualite-des-eaux.html'],
  ['LU', 'Luzern', 'programme', null, ['chemistry', 'biology', 'groundwater', 'data'], 'https://uwe.lu.ch/themen/gewaesser/gewaesserzustand'],
  ['NE', 'Neuchâtel', 'results', 2026, ['chemistry', 'biology', 'lakes', 'data'], 'https://www.ne.ch/uk/node/3714'],
  ['NW', 'Nidwalden', 'results', 2025, ['chemistry', 'biology', 'groundwater', 'data'], 'https://publikationen.nw.ch/90624123-fca6-4e6e-b146-7392edc791a2'],
  ['OW', 'Obwalden', 'programme', 2017, ['chemistry', 'biology'], 'https://www.ow.ch/_docn/119404/Geschaeftsbericht_2017.pdf'],
  ['SG', 'St. Gallen', 'programme', null, ['chemistry', 'biology', 'data'], 'https://www.sg.ch/umwelt-natur/wasser/fluesse---baeche/gewaesserqualitaet/messnetz---messprogramm.html'],
  ['SH', 'Schaffhausen', 'partial', 2025, ['chemistry', 'biology'], 'https://interkantlab.ch/CMS/Webseite/Interkantonales-Labor-15920742-DE.html'],
  ['SO', 'Solothurn', 'programme', null, ['chemistry', 'biology', 'data'], 'https://so.ch/verwaltung/bau-und-justizdepartement/amt-fuer-umwelt/wasser/oberflaechengewaesser/schutz/ap-pflanzenschutzmittel/chemische-wasserqualitaet/'],
  ['SZ', 'Schwyz', 'programme', null, ['chemistry', 'biology', 'data'], 'https://www.sz.ch/verwaltung/umweltdepartement/amt-fuer-gewaesser/gewaesserschutz/ueberwachung-und-qualitaet.html/8756-8758-8802-9447-9450-10712-10724'],
  ['TG', 'Thurgau', 'results', 2025, ['chemistry', 'biology', 'lakes', 'data'], 'https://data.tg.ch/explore/dataset/dbu-afu-1/'],
  ['TI', 'Ticino', 'programme', null, ['chemistry', 'biology', 'lakes', 'data'], 'https://www4.ti.ch/dt/da/spaas/upaai/temi/acqua-protezione-e-approvvigionamento/protezione-e-approvvigionamento/acque-superficiali/monitoraggi/corsi-dacqua/'],
  ['UR', 'Uri', 'results', 2024, ['chemistry', 'biology', 'groundwater', 'lakes', 'data'], 'https://www.ur.ch/dienstleistungen/4725'],
  ['VD', 'Vaud', 'results', 2025, ['chemistry', 'biology', 'lakes', 'data'], 'https://www.vd.ch/environnement/eaux/protection-des-eaux-epuration-pgee-agriculture-qualite-biologique-et-chimique-des-eaux'],
  ['VS', 'Valais', 'results', 2023, ['chemistry', 'biology', 'groundwater', 'lakes', 'data'], 'https://www.vs.ch/web/sen/qualite-des-eaux'],
  ['ZG', 'Zug', 'programme', null, ['chemistry', 'biology', 'data'], 'https://zg.ch/de/natur-umwelt-tiere/wasser-und-gewaesser/gewaesserqualitaet'],
  ['ZH', 'Zürich', 'results', 2024, ['chemistry', 'biology', 'groundwater', 'lakes', 'data'], 'https://www.zh.ch/de/umwelt-tiere/wasser-gewaesser/gewaesserschutz/gewaesserqualitaet.html'],
].map(([ct, name, record, year, scope, url]) => ({ ct, name, record, year, scope, url }));

const quality = JSON.parse(fs.readFileSync(QUALITY, 'utf8'));
const counts = new Map();
for (const station of quality.stations) {
  counts.set(station.canton, (counts.get(station.canton) ?? 0) + 1);
}

const codes = evidence.map(d => d.ct);
if (new Set(codes).size !== 26) throw new Error('Monitoring evidence must contain 26 unique cantons.');
const unknown = [...counts.keys()].filter(ct => !codes.includes(ct));
if (unknown.length) throw new Error(`NAWA contains unknown canton codes: ${unknown.join(', ')}`);

const cantons = evidence.map(d => ({ ...d, nawaStations: counts.get(d.ct) ?? 0 }));
const output = {
  meta: {
    checked: CHECKED,
    meaning: 'Public evidence and freshness audit; not a legal compliance determination.',
    nationalDataset: quality.meta.source,
    nationalVersion: quality.meta.sourceVersion,
    nationalModified: quality.meta.sourceModified,
    nationalSampleLast: quality.meta.sourceLast,
    nationalStations: quality.meta.stations,
    cantonsWithNationalStations: cantons.filter(d => d.nawaStations > 0).length,
    legalBasis: 'https://www.fedlex.admin.ch/eli/cc/1992/1860_1860_1860/de#art_58',
    programme: quality.meta.programme,
  },
  cantons,
};

fs.writeFileSync(OUT, JSON.stringify(output));
console.log(`monitoring: ${cantons.length} cantons, ${output.meta.cantonsWithNationalStations} with NAWA stations, ${output.meta.nationalStations} stations total`);
