/* Three formatters the map and the pages both need, kept in one place so a date
 * or an age is written the same way wherever it appears. The words come from the
 * catalogue in i18n.js, which is loaded first; the shapes do not, because a Swiss
 * date is 19.08.2026 in all five languages of the registers being cited. */

// Anything that goes into innerHTML and did not come from this repository.
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ISO in, Swiss out. Every date on this site is written 19.08.2026, because that
// is how the registers being cited write theirs.
const fmtDate = iso => {
  const [y, m, d] = String(iso).split('-');
  return `${d}.${m}.${y}`;
};

// The clock is 24-hour in every language, and the day keeps its four-digit year.
// Intl would give the English reader 08/20/26, 04:20 AM — month first, on a Swiss
// dataset — so the shape is written here rather than asked for.
const p2 = n => String(n).padStart(2, '0');
const fmtClock = d => `${p2(d.getHours())}:${p2(d.getMinutes())}`;
const fmtStamp = d =>
  `${p2(d.getDate())}.${p2(d.getMonth() + 1)}.${d.getFullYear()} ${fmtClock(d)}`;

// How old a source is, in the coarsest unit that still says something. Days up to
// six weeks, then months, then years to one decimal — because past a year the
// difference between 3.2 and 3.4 years is the difference between two federal
// releases, and rounding it to "3 years" hides that.
function ageText(days) {
  if (days === null || days === undefined) return T('src.live');
  if (days < 45) return Tn('age.day', days);
  if (days < 400) return T('age.months', { n: Math.round(days / 30.4) });
  return T('age.years', { n: nfd(days / 365.25, 1) });
}
