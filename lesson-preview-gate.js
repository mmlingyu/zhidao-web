/* Early-lesson preview gate.
 * A parsed preview is shown once its banner title and description are both
 * present (the JSON strings are closed). English waits until that description
 * is a real sentence or the first module already has an item, so a cut-off
 * token does not replace the loading card or start auto-speech. */
(function (root) {
  'use strict';
  const isNode = typeof module !== 'undefined' && !!module.exports;

  function field(value) {
    return String(value == null ? '' : value).trim();
  }

  function bannerFieldsClosed(data) {
    if (!data || typeof data !== 'object') return false;
    return Boolean(field(data.bannerTitle || data.title) && field(data.description));
  }

  function englishPreviewReady(payload) {
    const data = payload && payload.data || {};
    if (!bannerFieldsClosed(data)) return false;
    const description = field(data.description);
    const items = Array.isArray(data.items) ? data.items : [];
    const hasModule = items.some(item => item && field(item.word || item.title || item.description));
    if (hasModule) return true;
    if (/[.!?。！？]$/.test(description)) return true;
    return description.length >= 24 && /[A-Za-z]/.test(description);
  }

  function previewReady(payload) {
    if (!payload || !payload.data || !payload.subject) return false;
    if (payload.subject === 'english') return englishPreviewReady(payload);
    return bannerFieldsClosed(payload.data);
  }

  const API = { bannerFieldsClosed, englishPreviewReady, previewReady };
  if (isNode) module.exports = API;
  if (root) root.ZHIDAO_PREVIEW_GATE = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
