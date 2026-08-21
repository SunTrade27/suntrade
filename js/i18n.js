// i18n - Multi-language system with instant localStorage cache
const SUPPORTED_LANGS = ['en', 'kz', 'ru', 'de', 'fr', 'es', 'it', 'tr', 'pt', 'nl', 'pl', 'ar'];
const LANG_NAMES = {
  en: 'English', kz: 'Қазақша', ru: 'Русский', de: 'Deutsch',
  fr: 'Français', es: 'Español', it: 'Italiano', tr: 'Türkçe',
  pt: 'Português', nl: 'Nederlands', pl: 'Polski', ar: 'العربية'
};
const LANG_FLAGS = {
  en: '🇬🇧', kz: '🇰🇿', ru: '🇷🇺', de: '🇩🇪', fr: '🇫🇷', es: '🇪🇸',
  it: '🇮🇹', tr: '🇹🇷', pt: '🇵🇹', nl: '🇳🇱', pl: '🇵🇱', ar: '🇸🇦'
};

let currentLang = localStorage.getItem('suntrade_lang') || 'en';
let translations = {};
let languageLoadVersion = 0;

// ===== INSTANT TRANSLATION FROM CACHE =====
// When user visits any page, translations are applied immediately from
// localStorage before any network fetch happens. No more 1-second flash.

function getCachedTranslations(lang) {
  try {
    const data = localStorage.getItem('suntrade_translations_' + lang);
    return data ? JSON.parse(data) : null;
  } catch { return null; }
}

function setCachedTranslations(lang, data) {
  try {
    localStorage.setItem('suntrade_translations_' + lang, JSON.stringify(data));
  } catch {}
}

async function loadTranslations(lang) {
  const loadVersion = ++languageLoadVersion;

  // Step 1: Apply cached translations INSTANTLY (no flash)
  const cached = getCachedTranslations(lang);
  if (cached && Object.keys(cached).length > 0) {
    translations = cached;
    currentLang = lang;
    localStorage.setItem('suntrade_lang', lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    applyTranslations();
    updateLangSwitcher();
    window.dispatchEvent(new CustomEvent('langChanged', { detail: { lang } }));
  }

  // Step 2: Fetch fresh translations in background (for updates)
  try {
    const response = await fetch(`/locales/${lang}.json`, { cache: 'force-cache' });
    const nextTranslations = await response.json();
    if (loadVersion !== languageLoadVersion) return;

    // Save to cache for instant load next time
    setCachedTranslations(lang, nextTranslations);

    // Update if different from cached
    const cachedStr = JSON.stringify(cached || {});
    const freshStr = JSON.stringify(nextTranslations);
    if (cachedStr !== freshStr) {
      translations = nextTranslations;
      currentLang = lang;
      applyTranslations();
      updateLangSwitcher();
      window.dispatchEvent(new CustomEvent('langChanged', { detail: { lang } }));
    }
  } catch (e) {
    // Cached version already shown — no flash
    console.warn('Translation fetch failed (cache used):', lang);
  }
}

function t(key) {
  return translations[key] || key;
}

function applyTranslations() {
  // Re-render dynamic content that uses t() in JS FIRST
  try {
    if (typeof renderCheckoutItems === 'function') renderCheckoutItems();
    if (typeof renderCartPage === 'function') renderCartPage();
    if (typeof renderFeaturedProducts === 'function') renderFeaturedProducts();
    if (typeof loadProducts === 'function' && document.getElementById('products-grid')) loadProducts();
    if (typeof loadHomepageReviews === 'function') loadHomepageReviews();
    if (typeof doHeroSearch === 'function' && document.getElementById('hero-search-input')?.value) doHeroSearch();
  } catch (e) {
    console.warn('applyTranslations re-render error:', e);
  }

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (translations[key]) {
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.placeholder = translations[key];
      } else {
        el.textContent = translations[key];
      }
    }
  });
  document.querySelectorAll('[data-i18n-html]').forEach(el => {
    const key = el.getAttribute('data-i18n-html');
    if (translations[key]) el.innerHTML = translations[key];
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    if (translations[key]) el.title = translations[key];
  });
  const titleEl = document.querySelector('title[data-i18n]');
  if (titleEl) titleEl.textContent = t(titleEl.getAttribute('data-i18n'));
  const metaDesc = document.querySelector('meta[name="description"][data-i18n]');
  if (metaDesc) metaDesc.content = t(metaDesc.getAttribute('data-i18n'));

  // Signal that translations are applied — show all hidden elements
  document.body.classList.add('i18n-ready');
}

function updateLangSwitcher() {
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === currentLang);
  });
  const toggle = document.getElementById('lang-toggle');
  if (toggle) {
    toggle.innerHTML = '<svg class="icon icon-md" style="vertical-align:middle"><use href="#icon-globe"/></svg> ' + currentLang.toUpperCase();
    toggle.setAttribute('aria-label', 'Change language');
    toggle.setAttribute('title', LANG_NAMES[currentLang] || 'Change language');
  }
}

function initLangSwitcher() {
  const dropdown = document.getElementById('lang-dropdown');
  if (!dropdown) return;
  dropdown.innerHTML = '';
  SUPPORTED_LANGS.forEach(lang => {
    const btn = document.createElement('button');
    btn.className = 'lang-option' + (lang === currentLang ? ' active' : '');
    btn.innerHTML = `${LANG_FLAGS[lang]} ${LANG_NAMES[lang]}`;
    btn.onclick = () => {
      loadTranslations(lang);
      dropdown.classList.remove('show');
    };
    dropdown.appendChild(btn);
  });
  const toggle = document.getElementById('lang-toggle');
  if (toggle) {
    toggle.onclick = (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('show');
    };
  }
  document.addEventListener('click', () => dropdown.classList.remove('show'));
}

function detectLanguage() {
  const saved = localStorage.getItem('suntrade_lang');
  if (saved && SUPPORTED_LANGS.includes(saved)) return saved;
  const browserLang = navigator.language.split('-')[0].toLowerCase();
  if (SUPPORTED_LANGS.includes(browserLang)) return browserLang;
  return 'en';
}

// ===== INIT: Instant from cache, then refresh =====
(function initI18n() {
  const lang = detectLanguage();
  const cached = getCachedTranslations(lang);
  if (cached && Object.keys(cached).length > 0) {
    translations = cached;
    currentLang = lang;
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }

  function onReady() {
    if (cached && Object.keys(cached).length > 0) {
      applyTranslations();
      updateLangSwitcher();
      window.dispatchEvent(new CustomEvent('langChanged', { detail: { lang } }));
    }
    initLangSwitcher();
    loadTranslations(lang);
  }

  // DOMContentLoaded may have already fired if i18n.js loads late in <body>
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady);
  } else {
    // DOM already interactive/complete — run immediately
    requestAnimationFrame(onReady);
  }
})();
