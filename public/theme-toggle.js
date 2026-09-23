// Shared light/dark/system theme toggle, used by every standalone tool page.
// Each page inlines a tiny synchronous bootstrap at the top of <head> (same
// few lines, duplicated on purpose) that sets data-theme-mode before first
// paint so there's no flash of the wrong theme; this file only needs to
// handle later changes and the toggle widget itself.
(function () {
  var KEY = 'ua_theme';

  function getPref() {
    try { return localStorage.getItem(KEY) || 'system'; } catch (e) { return 'system'; }
  }
  function resolve(pref) {
    return pref === 'system'
      ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : pref;
  }
  function apply(pref) {
    var mode = resolve(pref);
    document.documentElement.setAttribute('data-theme-mode', mode);
    document.documentElement.setAttribute('data-theme-pref', pref);
    document.querySelectorAll('.theme-toggle').forEach(paint);
  }
  function setPref(pref) {
    try { localStorage.setItem(KEY, pref); } catch (e) {}
    apply(pref);
  }

  var ICONS = {
    light: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>',
    dark: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/></svg>',
    system: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>'
  };
  var LABELS = { light: 'Light', dark: 'Dark', system: 'System' };

  function build(el) {
    el.innerHTML = ['light', 'dark', 'system'].map(function (k) {
      return '<button type="button" class="tt-btn" data-mode="' + k + '" title="' + LABELS[k] + ' mode" aria-label="' + LABELS[k] + ' mode">' + ICONS[k] + '</button>';
    }).join('');
    el.querySelectorAll('.tt-btn').forEach(function (b) {
      b.addEventListener('click', function () { setPref(b.dataset.mode); });
    });
  }
  function paint(el) {
    if (!el.dataset.built) { build(el); el.dataset.built = '1'; }
    var pref = getPref();
    el.querySelectorAll('.tt-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.mode === pref);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { apply(getPref()); });
  } else {
    apply(getPref());
  }

  var mq = matchMedia('(prefers-color-scheme: dark)');
  var onChange = function () { if (getPref() === 'system') apply('system'); };
  if (mq.addEventListener) mq.addEventListener('change', onChange); else mq.addListener(onChange);

  window.UATheme = { get: getPref, set: setPref };
})();
