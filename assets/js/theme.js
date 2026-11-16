// ═══════════════ THEME ═══════════════
// The chosen theme is applied pre-paint by the inline script in <head>; this
// file only owns the toggle button and persistence.

var THEME_KEY = 'eb_theme';

function getTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

function setTheme(name) {
  var theme = name === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', theme);
  try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
  syncThemeButton();
}

function toggleTheme() {
  setTheme(getTheme() === 'light' ? 'dark' : 'light');
}

function syncThemeButton() {
  var btn = document.getElementById('themeBtn');
  if (!btn) return;
  var light = getTheme() === 'light';
  btn.title = light ? 'Switch to dark theme' : 'Switch to light theme';
  btn.setAttribute('aria-label', btn.title);
  btn.innerHTML = light
    ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>'
    : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>';
}

document.addEventListener('DOMContentLoaded', function() {
  syncThemeButton();
  var btn = document.getElementById('themeBtn');
  if (btn) btn.addEventListener('click', toggleTheme);
});
