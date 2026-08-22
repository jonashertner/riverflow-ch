'use strict';
/* A deliberately narrow legal screen.
 *
 * The live federal feed contains several quantities, but only water temperature
 * can presently be compared with a national numeric requirement without joining
 * the reading to a site-specific permit. Even that comparison is a review trigger:
 * GSchV Annex 2 No. 12(4) concerns anthropogenic temperature change after
 * substantial mixing. A gauge reading contains neither attribution nor mixing,
 * reference-state, permit or exception evidence.
 */
(function exposeLegalScreen(root) {
  const TEMPERATURE_LIMIT_C = 25;
  const DEFAULT_MAX_AGE_MS = 30 * 60 * 1000;
  const DEFAULT_FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

  function evaluateTemperature(readings, options = {}) {
    const now = Number.isFinite(options.now) ? options.now : Date.now();
    const maxAgeMs = Number.isFinite(options.maxAgeMs) ? options.maxAgeMs : DEFAULT_MAX_AGE_MS;
    const futureToleranceMs = Number.isFinite(options.futureToleranceMs)
      ? options.futureToleranceMs : DEFAULT_FUTURE_TOLERANCE_MS;
    const eligible = [];

    for (const reading of Array.isArray(readings) ? readings : []) {
      // Do not coerce. In JavaScript Number(null) is zero, which would turn a
      // missing thermometer into an apparently valid cold reading.
      const temperature = reading?.temperature;
      const observedAt = Date.parse(reading?.observedAt ?? '');
      if (!Number.isFinite(temperature) || !Number.isFinite(observedAt)) continue;
      if (observedAt > now + futureToleranceMs || now - observedAt > maxAgeMs) continue;
      eligible.push({
        id: String(reading.id ?? ''),
        name: String(reading.name ?? reading.id ?? ''),
        temperature,
        observedAt: new Date(observedAt).toISOString(),
      });
    }

    const order = (a, b) => b.temperature - a.temperature ||
      b.observedAt.localeCompare(a.observedAt) ||
      a.name.localeCompare(b.name) || a.id.localeCompare(b.id, 'en', { numeric: true });
    eligible.sort(order);

    return Object.freeze({
      limitC: TEMPERATURE_LIMIT_C,
      eligible: Object.freeze(eligible),
      above: Object.freeze(eligible.filter(reading => reading.temperature > TEMPERATURE_LIMIT_C)),
      at: Object.freeze(eligible.filter(reading => reading.temperature === TEMPERATURE_LIMIT_C)),
    });
  }

  root.RiverflowLegalScreen = Object.freeze({
    TEMPERATURE_LIMIT_C,
    DEFAULT_MAX_AGE_MS,
    DEFAULT_FUTURE_TOLERANCE_MS,
    evaluateTemperature,
  });
})(globalThis);
