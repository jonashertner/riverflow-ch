'use strict';
/* Night, day, and the third setting that is neither.
 *
 * This file runs in <head>, before the first paint, so that a reader who has asked
 * for a light interface never sees the dark one flash past first. It sets two
 * attributes on <html> and they mean different things:
 *
 *   data-theme  the surface actually in force, "night" or "day". The only thing the
 *               palette in tokens.css keys on.
 *   data-pref   what the reader asked for, "night", "day" or "auto". The only thing
 *               the button's icon keys on, because under "auto" the control has to
 *               say that it is following the system rather than which way the
 *               system happens to point today.
 *
 * The choice is remembered per browser, not per page. Anything that has to repaint
 * when the surface changes listens for the themechange event; the map's two
 * canvases do, because a canvas keeps no stylesheet of its own.
 */
(function () {
  var KEY = 'riverflow.theme';
  var root = document.documentElement;
  var mq = window.matchMedia('(prefers-color-scheme: light)');
  var pref = 'auto';
  try {
    var stored = localStorage.getItem(KEY);
    if (stored === 'day' || stored === 'night' || stored === 'auto') pref = stored;
  } catch (e) { /* private mode: the choice simply does not outlive the tab */ }

  // The three labels are the only words this file writes, and they are written in
  // the page's own language. i18n.js is loaded first, in the same <head>, so the
  // catalogue is there before the first paint; a page served without it keeps the
  // English label rather than none.
  function label(p) {
    return typeof T === 'function' ? T('theme.' + p) : {
      night: 'Night. Switch to day.',
      day:   'Day. Follow the system instead.',
      auto:  'Following the system. Switch to night.',
    }[p];
  }

  function apply() {
    var theme = pref === 'auto' ? (mq.matches ? 'day' : 'night') : pref;
    root.setAttribute('data-theme', theme);
    root.setAttribute('data-pref', pref);
    // The browser chrome around the page is part of the surface on a phone.
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', theme === 'day' ? '#e8ecf0' : '#0d0d0d');
    var bs = document.querySelectorAll('.themeBtn');
    for (var i = 0; i < bs.length; i++) {
      bs[i].setAttribute('title', label(pref));
      bs[i].setAttribute('aria-label', label(pref));
    }
    window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: theme, pref: pref } }));
  }

  window.setTheme = function (p) {
    pref = p;
    try { localStorage.setItem(KEY, p); } catch (e) { /* nothing to do */ }
    apply();
  };
  // Night, then day, then back to whatever the system says. Three states on one
  // button, because a segmented control costs more width than a map header on a
  // 360 px phone has to spare.
  window.cycleTheme = function () {
    window.setTheme(pref === 'night' ? 'day' : pref === 'day' ? 'auto' : 'night');
  };

  apply();
  mq.addEventListener('change', function () { if (pref === 'auto') apply(); });
  document.addEventListener('DOMContentLoaded', function () {
    var bs = document.querySelectorAll('.themeBtn');
    for (var i = 0; i < bs.length; i++) bs[i].addEventListener('click', window.cycleTheme);
    apply();
  });
})();
