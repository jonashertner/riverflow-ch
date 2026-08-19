#!/usr/bin/env bash
# Fetch the source geodata. Everything lands in /tmp: the repo keeps only the
# built files under site/data/. Re-run this before 01/02/03 on a clean machine.
set -euo pipefail
D=/tmp/riv
mkdir -p "$D"; cd "$D"

echo "HydroRIVERS v1.0, Europe (68 MB)"
[ -f hydrorivers_eu.zip ] || curl -fL -o hydrorivers_eu.zip \
  "https://data.hydrosheds.org/file/HydroRIVERS/HydroRIVERS_v10_eu_shp.zip"
unzip -oq hydrorivers_eu.zip

echo "Natural Earth 10m lakes, base and European supplement"
[ -f ne_lakes.zip ]    || curl -fL -o ne_lakes.zip    "https://naciscdn.org/naturalearth/10m/physical/ne_10m_lakes.zip"
[ -f ne_lakes_eu.zip ] || curl -fL -o ne_lakes_eu.zip "https://naciscdn.org/naturalearth/10m/physical/ne_10m_lakes_europe.zip"
[ -f ne_countries.zip ]|| curl -fL -o ne_countries.zip "https://naciscdn.org/naturalearth/10m/cultural/ne_10m_admin_0_countries.zip"
unzip -oq ne_lakes.zip -d ne_lakes
unzip -oq ne_lakes_eu.zip -d ne_lakes_eu
unzip -oq ne_countries.zip -d ne_countries

BB=5.8,45.7,10.6,48.0     # Switzerland with a border margin

echo "clip the river network"
npx -y mapshaper HydroRIVERS_v10_eu_shp/HydroRIVERS_v10_eu.shp \
  -clip bbox=$BB \
  -filter 'UPLAND_SKM >= 5' \
  -filter-fields HYRIV_ID,NEXT_DOWN,MAIN_RIV,ORD_STRA,ORD_CLAS,UPLAND_SKM,CATCH_SKM,DIS_AV_CMS,LENGTH_KM,DIST_DN_KM \
  -o "$D/rivers_ch.json" format=geojson precision=0.00001

echo "clip the lakes and the border"
npx -y mapshaper ne_lakes/ne_10m_lakes.shp -clip bbox=$BB -filter-fields name \
  -o "$D/lakes.json" format=geojson precision=0.00001
npx -y mapshaper ne_lakes_eu/ne_10m_lakes_europe.shp -clip bbox=$BB -filter-fields name \
  -o "$D/lakes_eu.json" format=geojson precision=0.00001
npx -y mapshaper ne_countries/ne_10m_admin_0_countries.shp -filter '"CHE"===ADM0_A3' -filter-fields ADM0_A3 \
  -o "$D/border.json" format=geojson precision=0.00001

echo "done. now run: node build/01-stations.mjs && node build/02-network.mjs && node build/03-context.mjs"

# ---- glaciers ---------------------------------------------------------------
# GLAMOS, the Swiss Glacier Monitoring Network. Every product carries a DOI.
# Licence: CC BY 4.0 on the DOI index; the length-change file header adds
# "scientific and non-commercial use". Both statements are reproduced on the page.
G=/tmp/gl
mkdir -p "$G"; cd "$G"
for f in inventory/inventory_sgi1850_r1992 \
         inventory/inventory_sgi2023_r2026 \
         lengthchange/lengthchange_2025_r2025; do
  n=$(basename $f)
  [ -f "$n.zip" ] || curl -fL -o "$n.zip" "https://doi.glamos.ch/data/$f.zip"
  mkdir -p "x/$n"; unzip -oq "$n.zip" -d "x/$n"
done

# The inventories are in CH1903+/LV95. mapshaper cannot read the Hotine oblique
# Mercator out of the .prj, so the source frame is given explicitly.
LV95='+proj=somerc +lat_0=46.9524055555556 +lon_0=7.43958333333333 +k_0=1 +x_0=2600000 +y_0=1200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs'

npx -y mapshaper x/inventory_sgi2023_r2026/SGI_2023_glaciers.shp \
  -proj from="$LV95" wgs84 \
  -filter-fields sgi-id,name,area_km2,length_km,masl_min,masl_max,year_acq \
  -simplify 6% keep-shapes \
  -o "$G/g2023.json" format=geojson precision=0.00001

npx -y mapshaper x/inventory_sgi1850_r1992/SGI_1850.shp \
  -proj from="$LV95" wgs84 \
  -filter-fields SGI,Shape_Area \
  -simplify 5% keep-shapes \
  -o "$G/g1850.json" format=geojson precision=0.00001

echo "glaciers ready. now run: node build/04-glaciers.mjs"
