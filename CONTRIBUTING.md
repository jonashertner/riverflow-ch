# Contributing

Thank you for helping make Swiss water evidence clearer and more reliable.

The project welcomes corrections, new sources, method reviews, translations and
accessibility work. Small, well-supported changes are preferred to broad claims.

The public contribution routes are explained on the
[collaboration page](https://opengovclimate.ch/riverflow/collaborate.html). Use
the local-observation form for something you saw and the public-record form for
an official instrument, plan, dataset, consultation or decision. Scientific and
legal review use their own forms because those reviews answer different questions.

## Local observations and public records

A local observation should state the place and time, describe visible facts
before interpretation, and identify any device or method used. It can start a
review; it does not establish cause, responsibility or a legal breach.

An official record should identify its issuer, exact title, date, stable link,
reuse terms where relevant, and the smallest proposition it supports. The record
establishes what its issuer published. It does not automatically verify every
statement within it.

Issues are public. Do not publish personal data, private correspondence, access
credentials, exact locations of sensitive species or material whose disclosure
could cause harm. Remove unnecessary image metadata. Use the repository’s
private security-reporting channel when a safe public version cannot be made.

## Scientific and data review

A useful scientific report states:

1. the affected layer, station, reach or place;
2. what is wrong or missing;
3. the primary source and its data state;
4. the expected unit, range or method;
5. a reproducible check, where possible.

Please distinguish measurement, survey, register, model output and inference.
Proposed model changes should state uncertainty, failure modes and whether they
preserve topology or mass balance.

## Legal review

A useful legal report states:

1. the exact proposition to change;
2. jurisdiction and legal context;
3. the official text, judgment or decision;
4. the version or decision date;
5. whether the source establishes the proposition or only supports an inference.

Prefer Fedlex, published court decisions, official cantonal material, BAFU and
Council of Europe sources. Avoid categorical claims where a permit, concession,
site inspection or cantonal determination is missing.

Legal contributions can strengthen enforcement and support legal action. The
project publishes evidence and research; it does not provide legal advice or
representation.

## Code and copy

- Keep copy short, plain and precise.
- Put the limit beside the claim, not on a distant page only.
- Never present an old register as a current inventory.
- Never label a model result as measured.
- Add a domain validation when fixing a data defect.
- Keep English source pages and all four translation catalogues in sync.
- Preserve keyboard, touch and reduced-motion behavior.
- Keep measurements, field observations, official records, models and inferences
  labelled separately throughout review and publication.

Run before opening a pull request:

```bash
python3 build/14-pages.py build
node build/16-provenance.mjs
node scripts/verify-site.mjs
```

For map changes, also test a narrow phone, a tablet and a desktop viewport. Check
wheel, pinch, buttons, keyboard zoom, panning limits and the evidence panel.

## Pull requests

Describe the evidence problem first, then the change. Link the primary source and
list the checks you ran. Keep unrelated changes separate.

Generated files under `site/data/` and translated pages may be committed when the
source or generator changed. Do not hand-edit translated HTML; edit the English
page and translation catalogues, then rebuild it.

Upstream datasets retain their own licences. Do not add data unless its source,
date, holder and reuse terms can be published on the Sources page.
