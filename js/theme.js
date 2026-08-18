/* ===== SunTrade theme switcher ===== */
(function () {
  'use strict';

  var STORAGE_KEY = 'suntrade_theme';
  var root = document.documentElement;

  function getSavedTheme() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'dark' || saved === 'light') return saved;
    } catch (e) {}
    return 'light';
  }

  function applyTheme(theme) {
    var next = theme === 'dark' ? 'dark' : 'light';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch (e) {}
    updateButtons(next);
    window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme: next } }));
  }

  function labels() {
    var lang = root.lang || 'en';
    var dark = {
      en: ['Light mode', 'Switch to light mode'], kz: ['Жарық режим', 'Жарық режимге ауысу'],
      ru: ['Светлая тема', 'Переключить на светлую тему'], de: ['Heller Modus', 'Zum hellen Modus wechseln'],
      fr: ['Mode clair', 'Passer au mode clair'], es: ['Modo claro', 'Cambiar al modo claro'],
      it: ['Modalità chiara', 'Passa alla modalità chiara'], tr: ['Açık mod', 'Açık moda geç'],
      pt: ['Modo claro', 'Mudar para o modo claro'], nl: ['Lichte modus', 'Naar lichte modus schakelen'],
      pl: ['Jasny motyw', 'Przełącz na jasny motyw'], ar: ['الوضع الفاتح', 'التبديل إلى الوضع الفاتح']
    };
    var light = {
      en: ['Dark mode', 'Switch to dark mode'], kz: ['Қараңғы режим', 'Қараңғы режимге ауысу'],
      ru: ['Тёмная тема', 'Переключить на тёмную тему'], de: ['Dunkler Modus', 'Zum dunklen Modus wechseln'],
      fr: ['Mode sombre', 'Passer au mode sombre'], es: ['Modo oscuro', 'Cambiar al modo oscuro'],
      it: ['Modalità scura', 'Passa alla modalità scura'], tr: ['Karanlık mod', 'Karanlık moda geç'],
      pt: ['Modo escuro', 'Mudar para o modo escuro'], nl: ['Donkere modus', 'Naar donkere modus schakelen'],
      pl: ['Ciemny motyw', 'Przełącz na ciemny motyw'], ar: ['الوضع الداكن', 'التبديل إلى الوضع الداكن']
    };
    return { dark: dark[lang] || dark.en, light: light[lang] || light.en };
  }

  function updateButtons(theme) {
    var copy = labels()[theme === 'dark' ? 'dark' : 'light'];
    document.querySelectorAll('.theme-toggle').forEach(function (button) {
      var isDark = theme === 'dark';
      button.setAttribute('aria-pressed', String(isDark));
      button.setAttribute('aria-label', copy[1]);
      button.title = copy[1];
      var text = button.querySelector('.theme-toggle-label');
      if (text) text.textContent = copy[0];
      var icon = button.querySelector('.theme-toggle-icon');
      if (icon) icon.innerHTML = isDark
        ? '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>'
        : '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
    });
  }

  // Apply before the first paint to avoid a light flash on dark-mode visits.
  applyTheme(getSavedTheme());

  document.addEventListener('DOMContentLoaded', function () {
    updateButtons(root.getAttribute('data-theme') || 'light');
    document.querySelectorAll('.theme-toggle').forEach(function (button) {
      button.addEventListener('click', function () {
        applyTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
      });
    });
  });

  window.addEventListener('langChanged', function () {
    updateButtons(root.getAttribute('data-theme') || 'light');
  });
})();
