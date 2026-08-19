# Prior art: does this already exist for Switzerland or Europe?

Checked 19 August 2026, 14:10 CEST. Sources fetched, not recalled.

## Switzerland: yes, at gauge level, and the official data is better than assumed

1. **BAFU live map.** https://www.hydrodaten.admin.ch/de/seen-und-fluesse/messstationen-zustand
   Shows current discharge and water level of Swiss rivers and lakes, classified by
   percentile. Page text: reference period is the norm period 1991-2020; below 10 years of
   record, no classification.

2. **The same layer is public GeoJSON.**
   `https://data.geo.admin.ch/ch.bafu.hydroweb-messstationen_zustand/ch.bafu.hydroweb-messstationen_zustand_de.json`
   199 features, refresh interval 300 s, WMS legend "Datenstand 19.08.2026 13:37".
   Property `quant-class`, values 0-5. Direction verified empirically against the readings in
   this repo: Rhein Basel 1, Rhein Rheinfelden 1, Reuss Luzern 1, Ticino Bellinzona 1,
   Thur Andelfingen 1, Rhone Sion 2, Rhone Porte du Scex 3. So 1 is the low end.
   Distribution 19.08: class 1 = 154, 2 = 13, 3 = 21, 4 = 4, 5 = 2, unclassified 0 = 5.

   CONSEQUENCE FOR THIS REPO: this is the official day-of-year statistic that the page
   currently lacks. The present reference mean is HydroRIVERS `DIS_AV_CMS`, modelled, marked
   not quotable. One fetch replaces it.

   **DISCREPANCY, NOT RESOLVED.** The map page says daily means against 1991-2020. The WMS
   legend for the same layer says MONTHLY percentiles of long-term HOURLY means, pooled from
   start of record to today. Two official descriptions of one layer that do not agree. Resolve
   before any class is quoted in a legal document.

3. **All four water-use registers already exist as map layers** on map.geo.admin.ch:
   `ch.bafu.wasser-entnahme`, `ch.bfe.statistik-wasserkraftanlagen`,
   `ch.bafu.gewaesserschutz-klaeranlagen_anteilq347`, `ch.bfe.kernkraftwerke`.
   Also present and relevant: `ch.bafu.hydrologie-q347` (basis for Q347),
   `ch.bafu.hydrologie-niedrigwasserstatistik`, `ch.bafu.hydrologie-hochwasserstatistik`.
   The layer stack in this repo is therefore not new data. 896 layers in the portal config.

### What is absent from the official products
- No propagation of the live measured value onto the river network. The federal map draws
  199 points. This repo draws 8,716 reaches and states which of three bases each one has.
- Flow and use are never on one canvas with a shared reading; they are separate toggles.
- The per-station unit resolution (LINDAS `isLiter` is wrong on all 190 rows) does not arise
  federally, because the portal does not aggregate across stations.

## Europe: no measured equivalent

- **National portals only**, one per country: PEGELONLINE (DE), Vigicrues / Hub'Eau (FR),
  Environment Agency (England), NVE (NO), eHYD (AT), hydrodaten (CH). This confirms the
  11:20 finding.
- **Copernicus EFAS / GloFAS**: reach-level discharge across the whole network, public
  viewers, operational since October 2012. **Modelled**, not measured.
- **JRC "National discharge / water level monitoring"**, dataset
  `05b48936-9a51-42fa-a860-3a7a04e97ccc`: discharge and water level of the past 24 hours as
  delivered by national providers across Europe, i.e. the EFAS observation feed.
  **Licence and access terms NOT verified** - both data.jrc.ec.europa.eu and data.europa.eu
  blocked automated fetch. This is the one item that would change the Europe project if the
  data is open. Check by hand.
- **EStreams** (Nature Scientific Data, 13.08.2024): 17,130 catchments, 41 countries.
  Historical catalogue, not live.
- **EEA WISE Freshwater** (water.europa.eu/freshwater): WFD state and pressure reporting,
  basin level, annual. Not live.
- **Hobby/commercial**: liveearthviewer.com/rivers - 24 world rivers from GloFAS plus 19 USGS
  gauges, 43 in all. Not Europe, not reach level.

## Verdict
Switzerland: the data exists officially and is authoritative; what this repo adds is the
propagation to reaches and the single canvas. Europe: nothing of this kind exists in measured
form, for the reason already logged - there is no single measured source.
