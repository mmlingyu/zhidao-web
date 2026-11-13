/* Early-lesson preview gate.
 * The live Nov 13 page rendered every preview event. These named checks stay
 * stricter than that page: an explicit bannerFieldsClosed:false or an English
 * description that does not end a sentence cannot replace the loading card.
 * A 24-character length shortcut is intentionally absent, so a cut-off English
 * fragment cannot pass as a full preview. */
(function (root) {
  'use strict';
  const isNode = typeof module !== 'undefined' && !!module.exports;

  function field(value) {
    return String(value == null ? '' : value).trim();
  }

  function bannerFieldsClosed(data, payload) {
    const source = payload && typeof payload === 'object' ? payload : null;
    if (source && source.bannerFieldsClosed === false) return false;
    if (!data || typeof data !== 'object') return false;
    if (data.bannerFieldsClosed === false) return false;
    return Boolean(field(data.bannerTitle || data.title) && field(data.description));
  }

  function sentenceClosed(description) {
    return /[.!?。！？]["'”’)]*$/.test(description);
  }

  function englishPreviewReady(payload) {
    const data = payload && payload.data || {};
    if (!bannerFieldsClosed(data, payload)) return false;
    if (payload.fullEnglishPreview === false || payload.englishPreviewComplete === false) return false;
    const description = field(data.description);
    const items = Array.isArray(data.items) ? data.items : [];
    const hasModule = items.some(item => item && field(item.word || item.title || item.description));
    /* Full English preview: a finished sentence, or the first module together
     * with a finished sentence. A bare word list or a long fragment is not enough. */
    if (!sentenceClosed(description)) return false;
    if (hasModule) return true;
    return description.length >= 12 && /[A-Za-z]/.test(description);
  }

  function previewReady(payload) {
    if (!payload || !payload.data || !payload.subject) return false;
    if (payload.subject === 'english') return englishPreviewReady(payload);
    return bannerFieldsClosed(payload.data, payload);
  }

  const API = { bannerFieldsClosed, englishPreviewReady, previewReady };
  if (isNode) module.exports = API;
  if (root) root.ZHIDAO_PREVIEW_GATE = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
