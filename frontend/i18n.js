let translations = {};
let currentLang = 'nl';

function loadTranslations(lang) {
  const selected = lang || localStorage.getItem('lang') || (navigator.language || 'nl').slice(0,2).toLowerCase();
  currentLang = selected;
  const file = `lang/${selected}.json`;
  return fetch(file)
    .then(r => r.ok ? r.json() : fetch('lang/en.json').then(rr => rr.json()))
    .then(data => {
      translations = data;
      applyTranslations();
    })
    .catch(() => {
      fetch('lang/en.json')
        .then(r => r.json())
        .then(data => {
          translations = data;
          applyTranslations();
        });
    });
}

function t(key) {
  return translations[key] || key;
}

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (translations[key]) {
      el.textContent = translations[key];
    }
  });
  if (translations.title) {
    document.title = translations.title;
  }
}

function setLanguage(lang) {
  localStorage.setItem('lang', lang);
  loadTranslations(lang);
}

// Load on startup
if (typeof window !== 'undefined') {
  loadTranslations();
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.lang-switch button').forEach(btn => {
      btn.addEventListener('click', () => setLanguage(btn.getAttribute('data-lang')));
    });
  });
}
