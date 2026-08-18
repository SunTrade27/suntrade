// i18n - Multi-language system
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

async function loadTranslations(lang) {
  const loadVersion = ++languageLoadVersion;
  try {
    const response = await fetch(`/locales/${lang}.json`);
    const nextTranslations = await response.json();
    // A slower response from an older selection must not roll the site back
    // after the visitor has already selected another language.
    if (loadVersion !== languageLoadVersion) return;
    translations = nextTranslations;
    currentLang = lang;
    localStorage.setItem('suntrade_lang', lang);
    document.documentElement.lang = lang;
    if (lang === 'ar') {
      document.documentElement.dir = 'rtl';
    } else {
      document.documentElement.dir = 'ltr';
    }
    applyTranslations();
    updateLangSwitcher();
    // Dispatch custom event for language change
    window.dispatchEvent(new CustomEvent('langChanged', { detail: { lang } }));
  } catch (e) {
    console.error('Failed to load translations:', lang, e);
  }
}

function t(key) {
  return translations[key] || key;
}

function applyTranslations() {
  // Re-render dynamic content that uses t() in JS FIRST. If we translated
  // first, the re-render (e.g. renderFeaturedProducts rebuilding product
  // cards) would clobber the translated text with fresh English defaults
  // and the data-i18n pass below would never see the new elements.
  // Wrapped in try/catch so a failing re-render can never block the
  // data-i18n pass below.
  try {
    if (typeof renderCheckoutItems === 'function') renderCheckoutItems();
    if (typeof renderCartPage === 'function') renderCartPage();
    if (typeof renderFeaturedProducts === 'function') renderFeaturedProducts();
    if (typeof loadProducts === 'function' && document.getElementById('products-grid')) loadProducts();
    // Note: Individual pages handle re-rendering via their own
    // langChanged event listeners (e.g. renderProduct in product.html,
    // renderCategories + renderFeaturedProducts in index.html, etc.)
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
  // Update meta tags
  const titleEl = document.querySelector('title[data-i18n]');
  if (titleEl) titleEl.textContent = t(titleEl.getAttribute('data-i18n'));
  const metaDesc = document.querySelector('meta[name="description"][data-i18n]');
  if (metaDesc) metaDesc.content = t(metaDesc.getAttribute('data-i18n'));
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

// Auto-detect browser language
function detectLanguage() {
  const saved = localStorage.getItem('suntrade_lang');
  if (saved && SUPPORTED_LANGS.includes(saved)) return saved;
  const browserLang = navigator.language.split('-')[0].toLowerCase();
  if (SUPPORTED_LANGS.includes(browserLang)) return browserLang;
  return 'en';
}

document.addEventListener('DOMContentLoaded', () => {
  const lang = detectLanguage();
  loadTranslations(lang);
  initLangSwitcher();
});
