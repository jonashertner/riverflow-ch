# Water and ice in Switzerland

A map of Swiss rivers read live from the federal gauging network, of Swiss
glaciers across five dated surveys, of the water the country holds back behind
225 dams, and of who takes water out and who puts it back. It is built to be a
base layer for legal work: every figure carries its source, its class of evidence
and the date the source was last touched, and the page says what each number does
not prove.

Live at **https://jonashertner.github.io/riverflow-ch/**

## Run it

```bash
cd site && python3 -m http.server 8899   # then open http://127.0.0.1:8899/
```

The page has no backend. It fetches the gauge readings from the federal endpoint
in the browser; everything else is baked into `site/data/`. A view is written into
the URL hash as `#lon,lat,scale,layer`, so a link is a citation: this place, this
reading, this scale. A bare layer name works too — `#ice`, `#res`, `#residual`,
`#use` — and opens that layer at the country view.

## The eight layers

| Layer | What the colour carries | Class of evidence |
|---|---|---|
| Flow | Discharge in m³/s, log scale | Measured at 171 reaches, estimated at 5,004, absent at 3,541 |
| Against normal | Discharge now divided by the long-term mean of the same reach | Ratio of a measurement to a modelled annual mean |
| Temperature | Water temperature at the gauge, 0 to 25 °C | Measured, one sensor per point |
| Reservoirs | 225 dams sized by the volume they hold, tinted by their region's filling level in the week at the playhead | Register of structures; regional stored-energy statistic. Two different objects, kept apart |
| Ice | Five glacier inventories, 1850 · 1931 · 1973 · 2010 · 2023, played in their real intervals | Measured by survey. Area, not volume |
| Residual flow | Q<sub>347</sub> at 1,041 points and the minimum GSchG Art. 31(1) computes from it | Measured, station-derived or modelled — stated per point |
| Water use | Who takes the water out and who puts it back | Registered locations; one quantity, and that one derived |
| Water sources | Groundwater bodies, headwaters, sub-catchments, and the drinking-water protection zones in force | Three of the four are WMS images from a federal or cantonal server. Only the headwaters are this map's own data |

Two of the eight run on a time ribbon: the reservoir layer plays 1,390 weekly
readings from 3 January 2000 to the most recent week, and the ice layer plays the
five surveys held in proportion to their own intervals — 81, 42, 37 and 13 years —
so that 1850–1931 does not look as fast as 2010–2023.

## Rebuild the data

```bash
bash build/00-sources.sh          # download and clip, into /tmp/riv and /tmp/gl
node build/01-stations.mjs        # gauges, coordinates, per-station unit
node build/02-network.mjs         # river network, gauge-to-reach binding
node build/03-context.mjs         # lakes and the national border
node build/04-glaciers.mjs        # glacier bodies, length series, gauge downstream
node build/05-users.mjs           # abstractions, hydropower, nuclear, treatment plants
node build/06-reservoirs.mjs      # dam register and the weekly filling series
node build/07-residual.mjs        # Q347 and the Art. 31(1) minimum
node build/09-icehistory.mjs      # the five dated inventories
node build/10-names.mjs           # join swissNAMES3D to the network: names for the water
node build/11-cantons.mjs         # who has delivered the protection zones, and when
node build/08-vintage.mjs         # read every federal layer's Datenstand back
```

`08` reads `site/data/cantons.json`, so `11` runs before it. `10` needs the
swissNAMES3D CSV release in `/tmp/riv/names`:

```bash
mkdir -p /tmp/riv/names && cd /tmp/riv/names
curl -fLO https://data.geo.admin.ch/ch.swisstopo.swissnames3d/swissnames3d_2026/swissnames3d_2026_2056.csv.zip
unzip -oq swissnames3d_2026_2056.csv.zip
```

Only `site/data/*.json` is kept in the repository. The sources stay in `/tmp`.
`06`, `11` and `08` take everything they need off the network, so they also run in
CI: `.github/workflows/pages.yml` re-runs all three every Monday and commits the
result, which is what keeps the baked filling series, the cantonal delivery dates
and the vintage audit from going quietly stale. `10` is not in CI: swissNAMES3D is
an annual release and a 32 MB download, so it is rebuilt by hand when swisstopo
publishes a new year.

## How old is any of this, really

This was the question that changed the build. `map.geo.admin.ch` serves several
of these layers with no visible date, and some of them are much older than a
reader would assume. `build/08-vintage.mjs` reads each layer's `Datenstand` back
out of its own legend endpoint and writes `site/data/vintage.json`; the page shows
the table under **Sources and their age** and marks anything over three years old
as stale.

| Source | Data state | Age at build |
|---|---|---|
| Gauges (BAFU, through LINDAS) | live | ten minutes |
| Reservoir filling level (BFE) | 17.08.2026 | 2 days |
| WASTA hydropower statistic (BFE) | 31.12.2025 | 231 days |
| Glacier inventories and length change (GLAMOS) | 2026 release | 230 days |
| swissNAMES3D, the names of the water (swisstopo) | 09.03.2026 | 163 days |
| Sub-catchments, 2 km² (BAFU) | 01.06.2024 | 809 days |
| Dams under federal supervision (BFE) | 28.11.2023 | 995 days |
| Drinking-water protection zones (26 cantons via geodienste.ch) | 16.05.2023, the oldest cantonal delivery — NE | 1,191 days |
| Lakes and border (Natural Earth) | 2022 | 1,571 days |
| **Groundwater bodies (BAFU)** | 01.01.2017 | 3,517 days |
| **Nuclear power stations (BFE)** | 20.12.2019 | 2,434 days |
| **River network (HydroRIVERS v1.0)** | 2019 | 2,787 days |
| **Treatment plants, share at Q347 (BAFU)** | 01.01.2014, survey 2011 | 4,613 days |
| **Abstraction inventory (BAFU)** | 01.01.2004 | 8,266 days |
| **Basis for Q347 (BAFU)** | 01.01.2000 | 9,727 days |

Two of the old ones are worth pausing on.

The nuclear register still lists Mühleberg as a power station, and its data state
is the day Mühleberg was shut down. The page keeps the site, marks it closed since
20 December 2019, and shows the correction next to the register's own claim rather
than silently dropping the point.

The Q<sub>347</sub> layer is old in a way that is not simply a defect. GSchG
Art. 4(h) defines Q<sub>347</sub> as a ten-year average, and the decade in that
file, 1984–1993, is the decade the cantons made their determinations on. For the
legal question — what did the statute require here — the old figure is the right
one. For the factual question — how much water is in this brook in a dry year —
it describes a hydrology that has since moved. The layer's job is to show that
those two questions have drifted apart.

## Sources

| Layer | Source | Licence |
|---|---|---|
| River geometry, catchment area, long-term mean discharge | HydroRIVERS v1.0 (HydroSHEDS, WWF) | free for non-commercial and commercial use with attribution |
| Live discharge, water level, temperature, flood danger level | BAFU, through the federal Linked Data service LINDAS, `https://lindas.admin.ch/query`, graph `<https://lindas.admin.ch/foen/hydro>` | open government data, updated every ten minutes, no key |
| Discharge unit per station | `hydrodaten.admin.ch/plots/p_q_7days/<id>_p_q_7days_de.json` | same |
| Glacier outlines and areas, 1850 · 1931 · 1973 · 2010 · 2023 | GLAMOS, Swiss Glacier Inventories, doi:10.18750/inventory.sgi{1850.r1992, 1931.r2022, 1973.r1976, 2010.r2010, 2023.r2026} | CC BY 4.0 per the DOI index |
| Glacier tongue position, 1880 to 2025 | GLAMOS, Swiss Glacier Length Change, doi:10.18750/lengthchange.2025.r2025 | CC BY 4.0 per the DOI index; the file header adds "scientific and non-commercial use" |
| Dams under federal supervision | BFE, `ch.bfe.stauanlagen-bundesaufsicht`, data state 28.11.2023 | opendata.swiss, attribution |
| Filling level of the storage reservoirs, weekly since 2000 | BFE, `ogd17_fuellungsgrad_speicherseen.csv` | opendata.swiss, attribution |
| Basis for determining Q<sub>347</sub> | BAFU, `ch.bafu.hydrologie-q347`, federal data state 1.1.2000 | opendata.swiss, attribution |
| Abstractions subject to residual flow | BAFU, Restwasserkarte Schweiz, `ch.bafu.wasser-entnahme`, federal data state 1.1.2004 | opendata.swiss, attribution |
| Hydropower plants from 300 kW up | BFE, WASTA, `ch.bfe.statistik-wasserkraftanlagen`, statistic to 31.12.2025 | opendata.swiss, attribution |
| Nuclear power stations | BFE, `ch.bfe.kernkraftwerke`, data state 20.12.2019 | opendata.swiss, attribution |
| Wastewater treatment plants, share of the receiving water at Q<sub>347</sub> | BAFU, `ch.bafu.gewaesserschutz-klaeranlagen_anteilq347`, survey 2011, federal data state 1.1.2014 | opendata.swiss, attribution |
| Lakes, national border | Natural Earth 10m | public domain |
| Names of watercourses, lakes, glaciers, springs and waterfalls | swisstopo, swissNAMES3D 2026, `swissnames3d_2026_2056.csv` | open data, free use with source attribution |
| Groundwater bodies | BAFU, `ch.bafu.grundwasserkoerper`, WMS, federal data state 1.1.2017 | FSDI general terms of use |
| Sub-catchments of Switzerland, 2 km² | BAFU, `ch.bafu.wasser-teileinzugsgebiete_2`, WMS, federal data state 1.6.2024 | FSDI general terms of use |
| Drinking-water protection zones S1–S3, in force | the 26 cantons, harmonised to MGDM 130.1/131.1/132.1 and served by geodienste.ch, `planerischer_gewaesserschutz_v1_2_0` | per canton; all 26 currently publish this model freely |
| Relief shading, grey national map (optional ground) | swisstopo, `ch.swisstopo.swissalti3d-reliefschattierung`, `ch.swisstopo.pixelkarte-grau`, WMS | FSDI general terms of use |
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
- **The reservoir layer holds two registers that do not describe the same
  objects, and it must not let the eye slide between them.** The dam register is
  225 structures with the volume each holds when full, 4,016 million m³ in total;
  it carries no fill state and never has. The filling level is a weekly figure in
  gigawatt hours — stored electricity, not stored water — published for four
  regions only. So every dam in Valais carries the same tint, and all 54 of them
  move as one body. The page can say that Valais reservoirs held a given share of
  their usable energy last week. It cannot say how full the Grande Dixence is
  today, because nobody publishes that, and it says so in the legend, the tooltip
  and the panel.
- **The filling denominator is not constant.** Usable capacity was about 8,500 GWh
  in 2000 and is 8,895 GWh now, because Nant de Drance and several dam raisings
  were added. Every comparison across the 26 years is therefore in per cent of the
  capacity of its own week. Compared in raw GWh, a new pumped-storage plant reads
  as a wet year.
- **The percentile band on the reservoir ribbon is a computation on this site, not
  a federal statement.** It is the tenth to ninetieth percentile of the same
  calendar week across the complete years 2000–2025, computed from the BFE file.
- **The ice layer measures area.** Area is what an inventory measures and it is the
  honest quantity to animate from these files. It is not volume, and the two have
  not moved together: through recent decades Swiss glaciers thinned faster than
  they shrank in plan, because a glacier loses thickness over its whole surface
  before it loses its outline. The per-interval rates on the page — the fastest is
  1973–2010 at 9.9 km² a year — are rates of area loss and are labelled as such.
  Where the page says how fast the ice is going in volume, it cites the volume
  sources, which are separate work by separate methods.
- **Between two surveys the outline is interpolated.** What moves there is
  arithmetic, not a measurement, and the read-out says which two surveys the
  playhead sits between.
- **The 1850 and 2023 glacier outlines are not joined body to body.** Glaciers
  split as they shrink. Where the same SGI identifier appears in both inventories
  the pair is shown, for 1,053 of the 1,299 bodies, and it is labelled an
  identifier match rather than a hydrological identity. The national totals,
  1,788.3 km² against 861.3 km², do not depend on the join.
- **The Q<sub>347</sub> record carries three figures and they are not
  interchangeable.** `q_84_93` is the ten-year average for 1984–1993, the legally
  operative one; `qp` is the average over the station's own full record, a better
  description of the river but not the figure the determination was made on;
  `qmod` is a model value, which BAFU's own legend calls a rough estimate that
  generally still needs checking against a short measurement. The preference is
  `q_84_93`, then `qp`, then `qmod`, and every point states which one it used,
  because the answer changes with the choice. Of 1,041 points, 237 use `q_84_93`,
  265 use `qp`, 523 use `qmod` and 16 carry no figure.
- **Art. 31 does not bite on every abstraction on the map.** The residual-flow
  rules apply to new abstractions, and to existing ones only when the concession
  expires and has to be renewed; an existing abstraction is governed by the
  restoration regime of Art. 80 ff instead. A figure computed on this layer is
  what the statute would require of a *new* abstraction at that point. It is not a
  duty owed today by whoever is already taking water there.
- **The abstraction register has no volumes.** It is the cantonal inventory under
  GSchG Art. 80 ff, federal data state 1 January 2004. It gives the point, the
  watercourse and, for 1,282 of the 1,488 entries, a link to the cantonal report.
  206 entries carry no number and so no report, four of them on the Rhine at Basel.
- **The use layer shows one quantity, and it is derived.** Of the four registers only
  WASTA yields a discharge, and it yields it by arithmetic: Q = P/(ρgHη) with η at
  0.85. At Rheinfelden that gives 1,621 m³/s where the plant states it can take 1,500
  at the same 100 MW, so the method runs about eight per cent high there. A filled
  disc on the map therefore carries a number; an open ring carries a place.
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
- **A dam's region is a spatial assignment too.** The register carries no canton,
  so each dam is put to the canton polygon it falls in and the canton decides its
  BFE region. That step is exact. What is inexact is in the source, not here:
  BFE's fourth region is everything outside Valais, Grisons and Ticino, so it pools
  the Bernese Oberland with the Jura.

## Pictures, and things that are data

Everything on this map that carries a reading is data the page holds: it can be
queried, it can be dated, it can be checked. Three of the four things on the water
sources layer, and both optional basemaps, are not. They are WMS images —
somebody else's rendering, requested for the rectangle on screen and drawn under
the water. That is a real difference and the page keeps it visible: none of them
is on by default, each says whose it is, they are drawn softer than the water, and
the legend states in its first line that they are pictures.

The mechanics are simpler than they look, because of one lucky fact: this map's
own projection is Web Mercator, and both `wms.geo.admin.ch` and `geodienste.ch`
answer in `EPSG:3857`. So a `GetMap` for the current view needs no reprojection at
all — the image comes back in the frame the canvas is already in, and is drawn
into the rectangle it was asked for. One request per layer covers the viewport
with a 22 % margin, renewed only when the view leaves that margin or the scale
moves by a factor of 1.9.

Three of them are re-coloured, and each change is a decision rather than a
default:

- **The hillshade is inverted.** `swissalti3d-reliefschattierung` is drawn for
  white paper, where flat ground is a light tone. Composited straight onto a
  near-black plane it lifts the whole country to a grey slab and takes the
  discharge ramp's contrast with it — the first attempt did exactly that. Inverted
  and composited with `lighten`, flat ground falls back to the plane's own black
  and only the slopes are left, so terrain appears where there is terrain.
- **The grey national map is inverted too**, for the same reason: paper goes
  black, ink and place names come up light. That layer is there for one job — to
  find a specific site on the ground — and it does it well.
- **The protection zones are rotated to violet.** geodienste.ch renders S1, S2 and
  S3 in three blues, which on a map whose whole subject is water in blue reads as
  more water. The rotation is uniform, so the three zones keep their distinctions
  from each other and lose only their resemblance to the rivers. Violet because it
  is the one part of the wheel this map has not spent: blue is discharge, teal is
  stored water, orange is a taking, bone is a figure from the statute, amber is
  heat.

Nothing in this file ever reads pixels back off a canvas, which is what makes all
of this safe to do with cross-origin images.

### The protection zones have no single date

There is no federal layer for drinking-water protection zones. The zones are
cantonal, and what exists is geodienste.ch, a joint service of the cantons and
swisstopo that aggregates twenty-six cantonal deliveries of the minimal geodata
model *Planerischer Gewässerschutz* (MGDM 130.1, 131.1, 132.1) into one national
WMS. All twenty-six deliver, all twenty-six publish it freely, and all twenty-six
report full cantonal coverage.

But a national picture assembled from twenty-six deliveries is exactly as current
as the canton that delivered last, and the picture does not say who that is. So
`build/11-cantons.mjs` reads every canton's delivery date from the service's own
register and the page states the **oldest**, with the canton named: at the last
build, Neuchâtel on 16 May 2023. The newest was the same day as the build.

Only the zones **in force** are drawn. The service also carries planned zones and
future zones, and a planned zone is not a legal constraint — drawing the two in
one colour would put a restriction on the map that does not exist yet.

## The names, and where the join fails

HydroRIVERS is anonymous. It carries an ID, an upstream area and a modelled mean
discharge, and no name for anything. The names come from swissNAMES3D, swisstopo's
gazetteer of the official geographical names, and `build/10-names.mjs` joins the
two: 7,826 watercourse anchors, 1,555 lakes, 760 glaciers, 86 named springs and
157 named waterfalls.

swissNAMES3D gives a name and an anchor point per *placement*, not a named
geometry — the Rhine appears six times along its course, the Aare sixteen. Each
anchor is snapped to the nearest drawn reach, which gives it the two things a bare
point lacks: the size of the water it names, so the map can decide at which zoom
the name is worth its ink, and the local direction of the channel, so the name can
be set along the water rather than across it. Hydrography is set in italic, which
is not decoration but the convention on every topographic map printed in the last
two centuries.

Three numbers in that script were fought over, and all three are stated in the
code with the evidence that fixed them:

- **The snap radius is 500 m**, and it is the one number here that was tuned
  rather than derived. The two sources are drawn at different scales:
  swissNAMES3D is placed against 1:25,000, HydroRIVERS is a global product
  generalised far coarser. Measured against rivers whose size is known, the gap
  runs from 85 m on the Rhine at Schaffhausen through 254 m on the Ticino to
  1,097 m on the Reuss. Tighten it to 300 m and the Limmat, the Emme and the
  Sarine vanish without a word. Widen it to 1,200 m and the Äpelööbächlein comes
  out the fifth largest watercourse in Switzerland.
- **A name is ranked by its largest anchor, within a cluster.** Largest, because
  an anchor is placed wherever the label fits and only the top of a name's range
  says what the river is. Clustered at 25 km, because fourteen different brooks in
  this country are called Dorfbach and they are not one river.
- **A cluster of fewer than three placements takes its smallest reading instead.**
  A cluster the national mapping agency wrote three or more times along a course
  has enough of its own evidence for the largest to be corroborated; one written
  twice has nothing to check itself against. This is what stops the Erzbach, whose
  second placement fell 131 m from the Aare, from claiming 10,706 km².

**What it still gets wrong, and this is not fixable at this scale.** A canal
running alongside a big river within about 200 m cannot be told from it in a
network generalised this coarsely. The Rothkanal beside the Aare takes 9,917 km²
and the Aalte Rii 13,726, and they are drawn as though they were trunk rivers.
Roughly three names in 1,244 are affected. What saves the picture rather than the
data is that a stolen size is always stolen from a river standing right there, so
holding the labels a fixed distance apart in pixels gives the neighbourhood to
whichever name in it ranks highest — which is the trunk.

Names for water this map does not draw are dropped, not floated: HydroRIVERS is
clipped at 5 km² of upstream area, so 4,987 gazetteer anchors belong to brooks
with no line here, and a name over empty ground is a worse answer than no name.

## Live data only

The evidence bar and the source table have always said, in numbers, that most of
what this page draws is inference over registers that are years old. Saying it is
not the same as showing it.

**Live data only** strips the map back to what is actually current: the reaches
with a gauge on them, read minutes ago, and nothing else. The other 8,545 reaches
go. The particles stop running on estimated water. The four archival layers —
reservoirs, ice, residual flow, water use — are struck through in the switch and
cannot be selected, because a layer built on a 2004 register cannot stay on a
screen that says only live data is on it. River names go too: under this switch a
name over blank ground would claim water the map is no longer drawing.

The lakes and the border stay. They are geography, not a reading, and the mode is
about currency, not about erasing the country.

171 reaches out of 8,716 survive it. It is meant to be uncomfortable.

## The legal layer

The page carries a legal panel in nine sections, quoting the consolidated German
texts on fedlex.admin.ch in the versions in force on 19 August 2026. The main
provisions:

1. **GSchG Art. 31(1)** (SR 814.20), minimum residual flow, with Art. 4(h) for
   Q<sub>347</sub>, and a calculator that reproduces the table band by band.
2. **The floor moves in one direction only.** Art. 33 is titled *Erhöhung der
   Mindestrestwassermenge* and raises. Lowering is available only on the closed
   list of Art. 32 (BGE 145 II 140 E. 2).
3. **When Art. 31 bites**: Arts. 29 ff against the restoration regime of
   Arts. 80–83, the end-2012 deadline in Art. 81(2) and how the Federal Supreme
   Court has treated its expiry (1C_526/2015 E. 3.5.1; 1C_185/2016 E. 2.2.2).
4. **WRG** Arts. 43, 54, 58 and 66–67 (SR 721.80), the concession side.
5. **GSchV Annex 2 No. 12(4)** (SR 814.201), the 3 °C and 1.5 °C limits on thermal
   alteration and the 25 °C ceiling. No Federal Supreme Court decision enforcing
   this number was found, which the page states.
6. **GSchV Annex 3.3 No. 21(4)(b)** (SR 814.201). Above 25 °C the authority may
   permit an exception where the warming is at most 0.01 °C, *or where the
   discharge comes from an existing nuclear power station*. The carve-out is
   quoted verbatim on the temperature layer and in the panel for each of the four
   sites, because it is directly on point for both.
7. **GSchV Annex 1 No. 1(3)(a)**, the ecological goal of near-natural temperature
   conditions.
8. **Standing**: NHG Art. 12, USG Art. 55 and the VBO annex, with 1C_15/2023,
   BGE 140 II 262, BGE 126 II 283 and ZH VB.2011.00070.
9. **KlimaSeniorinnen v. Switzerland**, application 53600/20, and the Committee of
   Ministers supervision still running in 2026.

A datum on this map is a fact about a river, a reservoir or a glacier. It is not a
finding of breach. The step from one to the other needs the concession, the licence
and the site, and it is the lawyer's step, not the map's.

## Traps found in the source data

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
   through the segment midpoints, and the zoom is capped, because past that the
   geometry stops being honest.
4. **The glacier `.prj` files declare CH1903+/LV95 as a Hotine oblique Mercator**,
   which mapshaper reads but cannot project: it drops every vertex in silence and
   writes a file of 1,299 features with no geometry. The source frame is therefore
   given to mapshaper as an explicit proj4 string in `build/00-sources.sh`.
5. **The 1931 inventory is in the old national frame, LV03**, with a false origin
   of 600000/200000, while 1973 and 2010 are LV95 at 2600000/1200000. Reprojecting
   1931 with the LV95 string lands every glacier in the Mediterranean, silently.
6. **The 1931 inventory ships no area field.** Its area is computed from the
   geometry in the source frame, in square metres, *before* reprojection — a planar
   area taken after projecting to degrees is not an area. The method is checked
   against SGI1850, which carries both: computed 1788.3 km² against a stated
   1788.3 km².
7. **The BFE filling-level CSV allows only map.geo.admin.ch to read it from a
   browser.** It is therefore baked in at build time, and the Pages workflow
   rebuilds it weekly so the baked copy does not drift.

## The statute's own arithmetic

Art. 31(1) states a base figure at the foot of each band and a rate above it. The
two do not close. The rate above 500 l/s reaches 279.6 l/s where the table states
280, and the rate above 2500 l/s reaches 2497.5 l/s where the table states 2500.
Each band in the calculator starts from the stated figure and rises at the stated
rate. The gap is reproduced, not smoothed.

## Design

Dark surface only, one full-bleed canvas, all furniture floating over it.

**Three registers of type, one per kind of statement.** Prose is Archivo. Every
measured figure is IBM Plex Mono with tabular figures, so a column of readings
lines up and a number is never read as a word. Statutory text, and anything
computed from a statute, is a serif in bone (`#d9cbb0`). The reader can tell at a
glance whether a number came from an instrument or from a rule, which is the
distinction the whole project turns on.

**The evidence bar.** The title block carries the drawing's own composition by
class of evidence — 171 measured, 5,004 estimated, 3,541 with no basis — counted
from the reaches on every live read rather than written into the page as prose. It
is the one claim the page makes about itself: most of what you see is inference.
It appears where there is vertical room for it; the same figures are in the
sources panel at every size.

**Every colour was validated before it was used.** Discharge is one hue stepped by
lightness, so more water reads as brighter. Against-normal is a diverging ramp,
warm below the mean and blue above, grey at it — a river at its long-term mean is
not news. Water temperature is a single hue, dark to light: the earlier ramp ran
blue-green-yellow-red, which is a rainbow and reads as four categories rather than
one rising quantity. Flood danger levels use the fixed status palette on the gauge
rings, never on the water itself. The reservoir tint is its own teal ramp so a
filling level is never mistaken for a discharge. In the ice layer the 1850 outlines
are filled in warm ochre and the surveyed ice is drawn in white over them, so what
stays coloured is the ice that has gone.

**Water use is two hues, not four, and the axis is direction.** Taking water out
is `#d95926` and putting it in is `#199e70`, because direction is what the law
turns on: Art. 31 GSchG governs abstraction, GSchV Annex 2 No. 12(4) governs
thermal load. Three or more hues cannot clear the all-pairs colour-vision floors on
this surface; two clear them with room to spare (CVD ΔE 9.4, normal-vision ΔE
26.5). Which of the four registers a mark belongs to is carried by the form of the
mark instead — filled disc for a quantity, open ring for a place, a second ring for
the four nuclear sites — which the map needed anyway.

**A threshold is a status, not a value.** The 25 °C ceiling of GSchV Annex 2
No. 12(4) is drawn as a rim on the gauge and named in words in the legend. It is
never left to the ramp. A gauge with no temperature series is drawn hollow rather
than cold: an absent reading is not a low one.

**Four layout shapes.** Phone: a bottom sheet with three snap states, a
horizontally scrollable layer switch, and the map fitted into the strip left
between them. Narrow landscape and tablet: the layer switch moves to the foot of
the window, the legend keeps a left rail and the ribbon takes the room beside it.
Desktop from 1500 px: the switch returns to the top line beside the full title
block. Wide: the panels grow rather than the map stretching. The map re-fits
itself on rotation and resize, and a portrait window is fitted into the box the
furniture actually leaves rather than into the whole viewport.

Motion is data or it is off. Particles run at the reach's own discharge; the two
time ribbons play real series at their real intervals. `prefers-reduced-motion` is
respected, and the motion checkbox in the legend turns the particles off for good.

## Prior art

Seven sweeps found no public product, in Switzerland or in Europe, that puts live
river discharge on a river-network graph and annotates it with the statute that
governs it. The pieces exist separately and each is missing the one next to it.

- **hydrodaten.admin.ch** has the same BAFU ten-minute readings and even computes a
  day-of-year percentile against 1991–2020 — but it has no river network, no
  estimation onto ungauged reaches, no glaciers, no reservoirs, no water use and no
  legal text, and it does not publish the percentile as data, only as a rendered
  category.
- **map.geo.admin.ch** carries the dam register, WASTA and the Restwasserkarte as
  static togglable layers, with no discharge and no narrative.
- **energiedashboard.admin.ch** has reservoir filling as one national line chart,
  with no map and no per-reservoir figure.
- **GLAMOS's map viewer** is glacier-only. CH2025 and Hydro-CH2018 are scenario
  products, not monitoring.
- In Europe, **Copernicus EFAS and GloFAS** model discharge at roughly 5 km
  global-model resolution — GloFAS does treat reservoirs as a first-class layer,
  which is precedent for this one — and the **European Drought Observatory** is a
  coarse EU grid.
- The **EEA's WISE/WFD viewer** is the only European tool that pairs measurement
  with legal compliance status, but that is Water Framework Directive status under
  Arts. 4 and 8, a regime Switzerland is not bound by and takes part in only
  voluntarily and partially. The template exists; the Swiss instance of it does not.
- On the litigation side the gap is starker. No tool anywhere arms environmental
  litigants with live monitoring data against a threshold: EJAtlas catalogues
  conflicts, Global Forest Watch tracks tree cover, neither is a
  discharge-and-threshold instrument.
- Nothing found in Switzerland or Europe renders rivers, glaciers or reservoirs as
  genuine data-driven time playback. Everything is a static snapshot or a
  live-but-frozen dashboard. The closest methodological relative is **NOAA's
  National Water Model map**, which colours reaches by both absolute flow and
  anomaly-against-normal and gives a time slider — American, not transferable as
  data, but the right idiom.

Two things here appear to be this site's own construction rather than anyone's
published product: propagating gauge anomaly ratios onto an 8,716-reach ungauged
network for the whole country, and pairing live hydrology with GSchG and GSchV
citation.

## Next, if it is worth continuing

- **Day-of-year percentiles for discharge.** They would turn against-normal from
  "how much water" into "is this a lot for a 19 August". hydrodaten.admin.ch
  computes them against 1991–2020 but renders them rather than publishing them.
  This is the single change that would most improve the flow layers.
- **The 1,282 cantonal residual-flow reports.** They are PDFs and they hold what
  the register omits: the abstracted quantity, the Q<sub>347</sub> determined and
  the residual flow ordered. Read into a table, the abstraction points stop being
  places and become quantities. That is the largest step available from here, and
  the one with real work in it.
- **Glacier volume and mass balance.** GLAMOS publishes both, with DOIs. Volume is
  the quantity the area animation deliberately does not claim, and it would let
  the page say how fast the ice is going without changing instruments mid-sentence.
- **Better geometry.** swissTLM3D would remove the staircase inside Switzerland, at
  the cost of a second network that does not carry HydroRIVERS' topology.
- **The cantonal water-use registers.** Drinking water, industry, irrigation and
  snowmaking are licensed cantonally. There is no national set to fetch.
