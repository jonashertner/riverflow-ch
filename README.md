# Water and ice in Switzerland

An open, evidence-led project to understand water through its whole cycle,
protect wetlands and other essential pathways, and support legal enforcement
where necessary.

**Live site:** https://opengovclimate.ch/riverflow/

The project keeps unlike evidence unlike. A current gauge reading, a model
estimate and a twenty-year-old register never share a label. Every figure states
its source, date and limits.

The north star is one connected account: precipitation, snow and ice, soil,
groundwater, rivers, lakes, storage, use, return flows and water crossing the
border. The current release is a rigorous surface-water foundation, not the
finished cycle. The work is meant to make protection enforceable: clear evidence,
primary law and reproducible methods that can support legal action when needed.

## What it shows

| Layer | Evidence |
|---|---|
| River flow | Current BAFU discharge where a station passes the live-data rules; indicative estimates elsewhere |
| Relative to mean | Current discharge divided by a modelled annual mean; not a drought index |
| Temperature | Current BAFU station readings |
| Water quality | The current prepared NAWA TREND release, reduced to station-year summaries with exact laboratory rows on demand |
| Reservoirs | Federally supervised dam structures and a separate weekly regional energy-storage series |
| Ice | Glacier area in six inventories: 1850, 1931, 1973, 2010, 2016 and 2023 |
| Residual flow | BAFU Q347 points and an illustrative Art. 31(1) calculation |
| Water use | Federal registers of hydropower, abstractions, nuclear sites and treatment plants |
| Wetlands | Five federal inventories of protected wetlands |
| Sources and groundwater | Groundwater bodies, headwaters, sub-catchments and drinking-water protection zones |
| Monitoring duties | Federal duties and a 26-canton public-evidence audit; evidence and freshness, not a compliance score |

This is not a forecast, a finding of breach or legal advice. It is also not a
complete account of Swiss water. Important omissions are listed on the
[Method page](https://opengovclimate.ch/riverflow/method.html#limits).

## Evidence rules

- A discharge is **current** only when its station timestamp is valid, no more
  than 30 minutes old, its value is finite and non-negative, and its unit is
  verified. Stale or invalid observations remain inspectable but drive nothing.
- The station and river files contain unique identifiers. Where several valid
  gauges share a model reach, the newest wins, then the closest snap, then the
  station identifier.
- Ungauged reaches use the first connected downstream gauge, or the closest
  connected upstream gauge. This scaling is not a mass balance and does not
  model storage, diversions or travel time.
- HydroRIVERS is a coarse global model. Its source threshold is 10 km² catchment
  or 0.1 m³/s modelled mean flow; this map is not a complete inventory of small
  streams.
- The Q347 layer applies only the arithmetic in Art. 31(1) GSchG. BAFU says
  model values generally need local measurement, and the canton determines the
  adequate residual flow after applying the rest of the statutory scheme.
- A quality result below its determination limit remains censored. It is never
  converted to zero or used in a median. Values are not interpolated between
  stations and the map does not invent a composite quality score.
- GSchG Art. 58 requires the cantonal surveys needed for implementation, not one
  identical national station and frequency checklist. The cantonal audit records
  what could be verified publicly and does not pronounce legal compliance.
- Historical registers remain useful evidence of what was recorded then. They
  are never presented as complete current inventories.

The full methods, transformations and limits are published on the
[Method](https://opengovclimate.ch/riverflow/method.html),
[Sources](https://opengovclimate.ch/riverflow/sources.html) and
[Law](https://opengovclimate.ch/riverflow/law.html) pages.

## Collaborate

This is a public collaborative project. Contributions are especially welcome
from:

- hydrologists, glaciologists, limnologists and water-quality scientists;
- geospatial and open-data engineers;
- Swiss water, environmental and administrative-law researchers;
- cantonal and federal data stewards;
- translators and accessibility reviewers.

The most valuable contribution is often a precise correction: the affected
place or claim, the primary source, its date, and the smallest defensible change.
See [CONTRIBUTING.md](CONTRIBUTING.md) for scientific and legal review standards.

Please use GitHub issues for data defects, source updates and research proposals.
Pull requests should keep the five language editions and the release checks in
sync.

The [roadmap](ROADMAP.md) defines the evidence needed to extend this foundation
through the full water cycle and into obligation-level monitoring and enforcement.

## Run locally

The publication is static and has no application backend.

```bash
cd site
python3 -m http.server 8899
```

Open http://127.0.0.1:8899/.

The map supports mouse, touch and keyboard. Use the wheel, pinch, or map buttons
to zoom; drag or use arrow keys to pan; press Home to fit Switzerland; press
Enter to inspect the feature at the centre. The country cannot be moved out of
view.

## Verify a release

```bash
npm ci
npm test
```

The release gate checks all five languages, links, metadata, accessibility,
translations, JavaScript and JSON syntax, dataset identities, units, time-series
order, data-derived publication facts, semantic invariants and artifact hashes.

## Rebuild data

The build uses Bash, curl, unzip and Node 22. Exact JavaScript and map-processing
dependencies are locked in `package-lock.json`.

```bash
npm ci
bash build/00-sources.sh
node build/01-stations.mjs
node build/02-network.mjs
node build/03-context.mjs
node build/04-glaciers.mjs
node build/05-users.mjs
node build/06-reservoirs.mjs
node build/07-residual.mjs
node build/09-icehistory.mjs
node build/10-names.mjs
node build/11-cantons.mjs
node build/12-wetlands.mjs
node build/13-basins.mjs
node build/17-quality.mjs
node build/18-monitoring.mjs
node build/08-vintage.mjs
python3 build/14-pages.py build
node build/15-social-card.mjs
node build/16-provenance.mjs
node scripts/verify-site.mjs
```

Raw source archives are downloaded outside the repository. The committed
provenance manifest records the source states, build scripts, artifact sizes,
counts and SHA-256 hashes. Upstream datasets retain their own licences; the
[Sources page](https://opengovclimate.ch/riverflow/sources.html) lists
each holder and term.

## Publication

GitHub Actions verifies every pull request and every push to `main`. A weekly job
builds federal and cantonal updates as a downloadable review patch. It never
writes directly to `main`. A maintainer applies the patch on a branch, reviews
the source and data diff, and opens a pull request. Deployment runs only for a
validated `main` revision and binds that revision into the deployed provenance.
The curated legal-evidence audit changes only after its primary records are
reviewed again.

The repository is the publication record. A map URL stores its layer, centre and
zoom so a view can be cited, but live observations still need their station time
and underlying BAFU source.

## Licence and governance

Code is available under the [MIT License](LICENSE). Original explanatory content
is available under [CC BY 4.0](CONTENT-LICENSE.md). Upstream datasets retain their
own terms and are never relicensed here. See [GOVERNANCE.md](GOVERNANCE.md) for
review and decision rules, [SECURITY.md](SECURITY.md) for private vulnerability
reports, and [CITATION.cff](CITATION.cff) for citation metadata.
