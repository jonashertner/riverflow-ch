# Abfluss Schweiz — live streamflow map

A map of live discharge in Swiss rivers. Colour and width give cubic metres per
second on a log scale. The motion along each river points downstream.

Built 19 August 2026, after the American reference at
`norway-charts.netlify.app/river_flow_map_usa/`.

## Run it

```bash
cd site && python3 -m http.server 8899   # then open http://127.0.0.1:8899/
```

The page has no backend. It fetches the gauge readings from the federal endpoint
in the browser. A shareable view is written into the URL hash as `#lon,lat,scale`.

## Rebuild the data

```bash
bash build/00-sources.sh          # download and clip, into /tmp/riv
node build/01-stations.mjs        # gauges, coordinates, per-station unit
node build/02-network.mjs         # river network, gauge-to-reach binding
node build/03-context.mjs         # lakes and the national border
```

Only `site/data/*.json` is kept in the repository. The sources stay in `/tmp`.

## Sources

| Layer | Source | Licence |
|---|---|---|
| River geometry, catchment area, long-term mean discharge | HydroRIVERS v1.0 (HydroSHEDS, WWF) | free for non-commercial and commercial use with attribution |
| Live discharge, water level, temperature, flood danger level | BAFU, through the federal Linked Data service LINDAS, `https://lindas.admin.ch/query`, graph `<https://lindas.admin.ch/foen/hydro>` | open government data, updated every ten minutes, no key |
| Discharge unit per station | `hydrodaten.admin.ch/plots/p_q_7days/<id>_p_q_7days_de.json` | same |
| Lakes, national border | Natural Earth 10m | public domain |

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

A gauge reading proves what the gauge measured. It does not prove what the river
is doing a kilometre downstream. That is why the three classes are drawn apart.

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

## Design

Dark surface only. The discharge ramp is a single hue stepped by lightness, from
the reference data-viz palette, so more water reads as brighter. Flood danger
levels use the fixed status palette on the gauge rings, never on the water itself.

## Next, if it is worth continuing

- **Flow against normal.** BAFU publishes day-of-year percentiles. That turns the
  map from "how much water" into "is this a lot for a 19 August", which is the
  more interesting question and the one the American map answers.
- **Europe.** There is no USGS. Either stitch the national feeds (PEGELONLINE,
  Hub'Eau, the Environment Agency, NVE, eHYD) or take modelled discharge from
  Copernicus EFAS. The first gives measurements and a dozen schemas; the second
  gives one schema and no measurements.
- **Better geometry.** swissTLM3D would remove the staircase inside Switzerland,
  at the cost of a second network that does not carry HydroRIVERS' topology.
