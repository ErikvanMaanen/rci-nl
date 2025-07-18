let translations = {};

function loadTranslations() {
  const lang = (navigator.language || 'nl').slice(0,2).toLowerCase();
  const file = `lang/${lang}.json`;
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

// Load on startup
if (typeof window !== 'undefined') {
  loadTranslations();
}
