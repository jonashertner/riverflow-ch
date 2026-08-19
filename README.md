# Water and ice in Switzerland

A map of Swiss rivers, read live from the federal gauging network, and of Swiss
glaciers as they were in 1850 against what is left in 2023. It is built to be a
base layer for legal work: every figure carries its source and its class of
evidence, and the page says what each number does not prove.

Live at **https://jonashertner.github.io/riverflow-ch/**

## Run it

```bash
cd site && python3 -m http.server 8899   # then open http://127.0.0.1:8899/
```

The page has no backend. It fetches the gauge readings from the federal endpoint
in the browser. A view is written into the URL hash as `#lon,lat,scale,layer`, so
a link is a citation: this place, this reading, this scale. `#ice` alone opens the
glacier layer at the country view.

## The five layers

| Layer | What the colour carries | Class of evidence |
|---|---|---|
| Flow | Discharge in m³/s, log scale | Measured at 171 reaches, modelled at 5,004, absent at 3,541 |
| Against normal | Discharge now divided by the long-term mean of the same reach | Ratio of a measurement to a modelled annual mean |
| Temperature | Water temperature at the gauge, 0 to 25 °C | Measured, one sensor per point |
| Ice | Glacier outlines, 1850 under 2023 | Measured by survey, 173 years apart |
| Water use | Who takes the water out and who puts it back | Registered locations; one quantity, and that one derived |

## Rebuild the data

```bash
bash build/00-sources.sh          # download and clip, into /tmp/riv and /tmp/gl
node build/01-stations.mjs        # gauges, coordinates, per-station unit
node build/02-network.mjs         # river network, gauge-to-reach binding
node build/03-context.mjs         # lakes and the national border
node build/04-glaciers.mjs        # glacier bodies, length series, gauge downstream
```

Only `site/data/*.json` is kept in the repository. The sources stay in `/tmp`.

## Sources

| Layer | Source | Licence |
|---|---|---|
| River geometry, catchment area, long-term mean discharge | HydroRIVERS v1.0 (HydroSHEDS, WWF) | free for non-commercial and commercial use with attribution |
| Live discharge, water level, temperature, flood danger level | BAFU, through the federal Linked Data service LINDAS, `https://lindas.admin.ch/query`, graph `<https://lindas.admin.ch/foen/hydro>` | open government data, updated every ten minutes, no key |
| Discharge unit per station | `hydrodaten.admin.ch/plots/p_q_7days/<id>_p_q_7days_de.json` | same |
| Glacier outlines and areas, 1850 | GLAMOS, Swiss Glacier Inventory 1850, doi:10.18750/inventory.sgi1850.r1992 | CC BY 4.0 per the DOI index |
| Glacier outlines and areas, 2023 | GLAMOS, Swiss Glacier Inventory 2023, doi:10.18750/inventory.sgi2023.r2026 | CC BY 4.0 per the DOI index |
| Glacier tongue position, 1880 to 2025 | GLAMOS, Swiss Glacier Length Change, doi:10.18750/lengthchange.2025.r2025 | CC BY 4.0 per the DOI index; the file header adds "scientific and non-commercial use" |
| Abstractions subject to residual flow | BAFU, Restwasserkarte Schweiz, `ch.bafu.wasser-entnahme`, federal data state 1.1.2004 | opendata.swiss, attribution |
| Hydropower plants from 300 kW up | BFE, WASTA, `ch.bfe.statistik-wasserkraftanlagen`, statistic to 31.12.2025 | opendata.swiss, attribution |
| Nuclear power stations | BFE, `ch.bfe.kernkraftwerke` | opendata.swiss, attribution |
| Wastewater treatment plants, share of the receiving water at Q347 | BAFU, ARA database, `ch.bafu.gewaesserschutz-klaeranlagen_anteilq347`, survey 2011, federal data state 1.1.2014 | opendata.swiss, attribution |
| Lakes, national border | Natural Earth 10m | public domain |
| Statutory text | fedlex.admin.ch, consolidated German versions in force on 19 August 2026 | federal law |

The two GLAMOS licence statements do not agree. Both are shown on the page.
Anyone putting this to commercial use should settle the point with GLAMOS first.

## What the map shows, and what it does not

- **171 reaches are measured.** A BAFU gauge sits on the reach; the figure is the
  reading, converted to m³/s where the station reports in litres per second.
- **5,004 reaches are estimated.** They take the long-term mean discharge of the
  reach (HydroRIVERS `DIS_AV_CMS`) scaled by the anomaly ratio of the nearest
  gauge downstream, or failing that, of the largest gauged river above them.
  Estimates are drawn dimmer.
- **3,541 reaches have no basis.** They drain out of the country without passing a
  Swiss gauge and no gauge stands above them. They carry the long-term mean and
  nothing more, and are drawn in neutral grey, not on the discharge ramp. Inside
  the Swiss border only 87 reaches out of 3,935 fall in this class.
- **The against-normal layer divides by an annual mean.** `DIS_AV_CMS` is a
  long-term mean over the whole year, not a normal for the day. A reading below
  100 % in August is in part the season. It is a ratio, not a drought index. BAFU
  publishes day-of-year statistics, but not through any endpoint the browser can
  reach, so the honest fallback stands until that changes.
- **A temperature reading is one sensor.** On 19 August 2026 the gauge at
  Neuhausen read 31.8 °C while Rheinau, ten kilometres down the same river, read
  24.6. Opening a gauge shows it against the five nearest gauges that also report
  temperature, so a value outside their spread declares itself.
- **The 1850 and 2023 glacier outlines are not joined body to body.** Glaciers
  split as they shrink. Where the same SGI identifier appears in both inventories
  the pair is shown, for 1,053 of the 1,299 bodies, and it is labelled an
  identifier match rather than a hydrological identity. The national totals,
  1,788.3 km² against 861.3 km², do not depend on the join.
- **The use layer shows one quantity, and it is derived.** Of the four registers only
  WASTA yields a discharge, and it yields it by arithmetic: Q = P/(ρgHη) with η at
  0.85. At Rheinfelden that gives 1,621 m³/s where the plant states it can take 1,500
  at the same 100 MW, so the method runs about eight per cent high there. A filled
  disc on the map therefore carries a number; an open ring carries a place.
- **The residual-flow register has no volumes and is old.** It is the cantonal
  inventory under GSchG Art. 80 ff, and the federal data state is 1 January 2004. It
  gives the point, the watercourse and, for 1,282 of the 1,488 entries, a link to the
  cantonal report. 206 entries carry no number and so no report, four of them on the
  Rhine at Basel. Q347 is not in it either, so the Art. 31 calculator still has to be
  fed by hand.
- **A run-of-river plant is not a consumer.** It passes the water on. A storage or
  pumped-storage plant releases water that often came from another catchment. The
  layer keeps the plant types apart for that reason, and no ratio of use to flow is
  computed anywhere: dividing a derived design discharge by a live reading would
  multiply an assumption by a routing error and land next to a finding of breach.
- **Four registers are not all the users.** There is no federal open register of
  drinking-water abstraction, of industrial abstraction (the Basel chemical works take
  Rhine water under cantonal permits), of irrigation, or of snowmaking. Those figures
  sit with the cantons and with the operators. The biggest single users of Swiss river
  water that this map cannot show are therefore named here rather than left to be
  inferred from an empty space.
- **No cooling volume is published for the four nuclear sites.** The dataset gives the
  site and the operator. Abstraction and thermal load sit in the cantonal concession
  and in the operator's own environmental reporting.
- **The gauge named under a glacier is a spatial assignment.** It is the first
  BAFU station downstream of the mapped reach nearest to the ice. It is not a
  routing model. It answers which gauge would see this water, and nothing finer.

## The legal layer

Three provisions are quoted on the page from the consolidated German texts on
fedlex.admin.ch, in the versions in force on 19 August 2026:

1. **GSchG Art. 31(1)** (SR 814.20), minimum residual flow, with Art. 4(h) for
   Q<sub>347</sub>. The page computes the minimum from a Q<sub>347</sub> you
   enter. It is not read off the map, because Q<sub>347</sub> is not published per
   gauge in the live federal feed.
2. **GSchV Annex 2 No. 12(4)** (SR 814.201), the 3 °C and 1.5 °C limits on thermal
   alteration and the 25 °C ceiling that goes with them.
3. **GSchV Annex 1 No. 1(3)(a)** (SR 814.201), the ecological goal of near-natural
   temperature conditions.

A datum on this map is a fact about a river or a glacier. It is not a finding of
breach. The step from one to the other needs the concession, the licence and the
site, and it is the lawyer's step, not the map's.

## Three traps found in the source data

1. **The LINDAS cube gives no usable unit.** It carries a predicate
   `<http://example.com/isLiter>` which is set `true` on every one of the 190
   discharge rows, including the Rhine at Basel. Nine stations really do report in
   litres per second. Taking the flag at face value, or ignoring it, both give a
   wrong map. The unit is therefore read at build time from each station's own
   plot axis on hydrodaten.admin.ch and baked into `stations.json`.
   Verified 19.08.2026: station 2492 (Bürglen, EW Altdorf) reads 751 l/s, station
   2289 (Basel, Rheinhalle) reads 512 m³/s.
2. **Five stations have no plot page**, so their unit is unknown. They are shown
   but never drive an estimate.
3. **HydroRIVERS is traced from a 15 arc-second grid.** Its polylines carry the
   staircase of the raster. The renderer rounds interior corners with a quadratic
   through the segment midpoints, and the zoom is capped at ten times the country
   view, because past that the geometry stops being honest.

A fourth trap sits in the glacier data. The `.prj` files declare CH1903+/LV95 as a
Hotine oblique Mercator, which mapshaper reads but cannot project: it drops every
vertex in silence and writes a file of 1,299 features with no geometry. The source
frame is therefore given to mapshaper as an explicit proj4 string in
`build/00-sources.sh`.

## The statute's own arithmetic

Art. 31(1) states a base figure at the foot of each band and a rate above it. The
two do not close. The rate above 500 l/s reaches 279.6 l/s where the table states
280, and the rate above 2500 l/s reaches 2497.5 l/s where the table states 2500.
Each band in the calculator starts from the stated figure and rises at the stated
rate. The gap is reproduced, not smoothed.

## Design

Dark surface only. Discharge is one hue stepped by lightness, so more water reads
as brighter. Against-normal is a diverging ramp, warm below the mean and blue
above, grey at it. Flood danger levels use the fixed status palette on the gauge
rings, never on the water itself. In the ice layer the 1850 outlines are filled in
the low colour of the diverging ramp and the 2023 bodies are drawn in white over
them, so what stays coloured is the ice that has gone.

## Next, if it is worth continuing

- **Day-of-year percentiles.** They would turn against-normal from "how much
  water" into "is this a lot for a 19 August". BAFU holds them. They are not on
  any endpoint found so far.
- **Q<sub>347</sub> per gauge.** With it, Art. 31 stops being a calculator and
  becomes a layer.
- **Glacier volume and mass balance.** GLAMOS publishes both, with DOIs, and both
  speak to the same question with a different instrument.
- **Better geometry.** swissTLM3D would remove the staircase inside Switzerland,
  at the cost of a second network that does not carry HydroRIVERS' topology.
- **The 1,282 cantonal residual-flow reports.** They are PDFs and they hold the
  figures the register omits: the abstracted quantity, Q347 and the residual flow
  ordered. Read into a table, the abstraction points stop being places and become
  quantities, and Art. 31 becomes a layer rather than a calculator. That is the single
  largest step available from here, and it is the one with real work in it.
- **The cantonal water-use registers.** Drinking water, industry, irrigation and
  snowmaking are licensed cantonally. There is no national set to fetch.
