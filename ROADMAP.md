# Roadmap to a connected water account

The project’s goal is not a larger pile of layers. It is one traceable account
of how water enters Switzerland, moves, is stored and used, supports wetlands,
crosses borders, and is protected or harmed.

## Publication standard

A new layer is ready only when it has:

- a primary source, holder, licence, data date and refresh cadence;
- a clear evidence class: measurement, survey, register, model or inference;
- units, identifiers, spatial and temporal coverage, and missingness;
- a reproducible transformation and an accessible non-map view;
- scientific review, and legal review where the display implies a duty;
- five-language copy that states the result and its limit briefly.

## Water-cycle coverage

| Pathway | Current state | Next evidence needed |
|---|---|---|
| Precipitation | Named in the cycle; not mapped | MeteoSwiss gridded precipitation and station provenance |
| Snow | Named; glacier ice mapped | Operational snow-water equivalent and uncertainty |
| Glacier ice | Six dated inventories | Annual mass balance and basin contribution |
| Soil and infiltration | Gap disclosed | Soil moisture and an explicit recharge model |
| Groundwater | Bodies shown as WMS context | NAQUA levels and quality, spring discharge, recharge |
| Rivers | Live gauges plus network estimates | Small streams, travel time, diversions and uncertainty |
| Lakes | Context only | Levels, profiles, quality and residence time |
| Wetlands | Five federal inventories | Hydrological condition, buffer pressures and restoration |
| Storage and use | Reservoir series and registers | Current permits, withdrawals, return flows and concessions |
| Evapotranspiration | Gap disclosed | Observed or modelled basin water loss |
| Borders | Swiss context | Upstream and downstream basin continuity |

## Monitoring and enforcement

The present canton record establishes what public evidence was found; it does
not grade legal compliance. The next audit is obligation-led:

1. identify the actor and operational role;
2. cite the applicable federal, cantonal, permit or concession duty;
3. record required parameter, site, interval, method and reporting route;
4. locate the raw result and authority assessment;
5. classify only as `evidence found`, `not published`, `not assessed`, or
   `apparent gap requiring legal review`;
6. preserve correspondence and enforcement evidence separately from inference.

Commune coverage begins with water suppliers, wastewater operators and bathing
water authorities because federal duties follow those roles, not the commune’s
name. Apparent non-compliance is never published without independent legal and
factual review.

## Near-term research packages

- Cantonal surface-water datasets beyond NAWA, with station-level downloads.
- Groundwater levels and quality from NAQUA and cantonal networks.
- Current abstraction permits, hydropower concessions and residual-flow orders.
- Wastewater effluent and receiving-water monitoring.
- Wetland hydrology, restoration measures and enforceable protection aims.
- Cross-border Rhine, Rhône, Inn, Ticino and Doubs basin continuity.

Each package should be proposed as an issue before implementation so scientific,
legal, geospatial and accessibility reviewers can agree on the evidence contract.
