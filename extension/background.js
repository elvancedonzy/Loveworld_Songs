// Service Worker — handles cross-origin Bible API calls for the content script

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'fetchBible') {
    fetchBibleVerse(msg.reference, msg.translation || 'kjv')
      .then(data => sendResponse({ ok: true, data }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true; // keep channel open for async response
  }
});

// Translations bible-api.com supports (as of 2026-09). Others fall back to KJV.
const BIBLE_API_TRANSLATIONS = new Set([
  'kjv', 'web', 'oeb-cw', 'clementine', 'almeida', 'rccv',
  'asv', 'bbe', 'dra', 'ylt'
]);

async function fetchBibleVerse(reference, translation) {
  const encoded = encodeURIComponent(reference.trim());
  const req = (translation || 'kjv').toLowerCase();
  const supported = BIBLE_API_TRANSLATIONS.has(req) ? req : 'kjv';

  const resp = await fetch(`https://bible-api.com/${encoded}?translation=${supported}`);
  if (!resp.ok) throw new Error(`Bible API ${resp.status}`);
  const data = await resp.json();
  // Report the translation that was actually used (upper-case for display)
  data._requestedTranslation = (translation || 'KJV').toUpperCase();
  data._actualTranslation = supported.toUpperCase();
  return data;
}
