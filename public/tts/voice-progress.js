/* Persistent, non-blocking progress shared by manual speech and automatic guides.
 * After first paint, idle warm-up shares the exact engine load used by speech. */
(() => {
  'use strict';
  const voice = window.ZhidaoVoice;
  if (!voice || !document.body) return;
  const panel = document.createElement('aside');
  panel.className = 'voice-load-hint';
  panel.hidden = true;
  panel.setAttribute('aria-label', '离线语音加载进度');
  panel.innerHTML = '<span class="voice-load-icon" aria-hidden="true">♪</span><div class="voice-load-content"><strong class="voice-load-title" role="status" aria-live="polite"></strong><div class="voice-load-details"><div class="voice-load-numbers"><span class="voice-load-bytes"></span><b class="voice-load-percent"></b></div><progress max="100" aria-label="语音模型下载进度"></progress><small>首次需要下载约 324 MB，之后会优先使用缓存。你可以继续看讲解。</small></div></div><button type="button" class="voice-load-close" aria-label="关闭语音加载提示" hidden>×</button>';
  document.body.appendChild(panel);
  const title = panel.querySelector('.voice-load-title');
  const bytes = panel.querySelector('.voice-load-bytes');
  const percent = panel.querySelector('.voice-load-percent');
  const progress = panel.querySelector('progress');
  const close = panel.querySelector('button');
  let expandTimer = null;
  let errorTimer = null;
  let failureKey = '';
  let active = false;
  let paintFrame = 0;
  let pendingSnapshot = null;
  function hide() {
    panel.hidden = true;
    panel.classList.remove('is-expanded', 'is-error');
    clearTimeout(expandTimer);
    clearTimeout(errorTimer);
    active = false;
  }
  close.addEventListener('click', hide);
  const mb = value => (value / 1048576).toFixed(1);
  function update(snapshot) {
    pendingSnapshot = snapshot;
    const state = snapshot && snapshot.offline || {};
    const failed = state.state === 'failed' || Boolean(state.error);
    const ready = state.state === 'ready' || state.stage === 'ready';
    if (failed || ready || state.state === 'idle') {
      if (paintFrame) {
        if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(paintFrame);
        else clearTimeout(paintFrame);
        paintFrame = 0;
      }
      paint(pendingSnapshot);
      return;
    }
    if (paintFrame) return;
    const schedule = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : cb => setTimeout(cb, 16);
    paintFrame = schedule(() => {
      paintFrame = 0;
      paint(pendingSnapshot);
    });
  }
  function paint(snapshot) {
    if (!snapshot) return;
    const state = snapshot.offline || {};
    const failed = state.state === 'failed' || Boolean(state.error);
    const busy = !failed && (state.state === 'loading' || state.preparing);
    document.body.classList.toggle('offline-voice-loading', Boolean(busy));
    document.querySelectorAll('.speech-play').forEach(button => {
      if (busy && button.classList.contains('is-speaking')) button.setAttribute('aria-busy', 'true');
      else button.removeAttribute('aria-busy');
    });
    if (failed) {
      const key = state.error || 'failed';
      if (failureKey === key) return;
      failureKey = key;
      hide();
      panel.hidden = false;
      panel.classList.add('is-error');
      close.hidden = false;
      title.textContent = '离线语音暂未准备好，将尝试其他朗读方式。可稍后重试。';
      errorTimer = setTimeout(hide, 10000);
      return;
    }
    failureKey = '';
    if (!busy) { hide(); return; }
    if (!active) {
      active = true;
      panel.hidden = false;
      close.hidden = true;
      // Cached loads get a light one-line hint, not a flashing large card.
      expandTimer = setTimeout(() => panel.classList.add('is-expanded'), 1600);
    }
    const preparing = state.stage === 'initializing' || state.state === 'ready';
    title.textContent = preparing ? '正在准备语音，马上开始朗读…' : '正在加载离线语音模型…';
    const known = state.total > 0;
    const value = Math.max(0, Math.min(100, Number(state.progress) || 0));
    bytes.textContent = known ? `已下载 ${mb(state.loaded)} / ${mb(state.total)} MB` : '首次加载可能需要几分钟，请稍等';
    percent.textContent = known ? `${Math.floor(value)}%` : '';
    if (known) progress.value = value;
    else progress.removeAttribute('value');
  }
  voice.onChange(update);
  update(voice.status());

  // Start only after DOM readiness + first paint, never in the rendering path.
  // ensureOfflineEngine deduplicates idle prefetch, manual speech and auto-guide.
  function warmUp() {
    if (voice.status().mode !== 'offline') return;
    voice.ensureOfflineEngine().catch(() => {}); // progress UI handles failure
  }
  function scheduleWarmUp() {
    const idle = () => {
      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(warmUp, { timeout: 2000 });
      } else window.setTimeout(warmUp, 800);
    };
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => window.requestAnimationFrame(idle));
    } else window.setTimeout(idle, 0);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleWarmUp, { once: true });
  } else scheduleWarmUp();
})();
