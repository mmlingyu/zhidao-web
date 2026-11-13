/* Main-thread facade for offline Kokoro.
 * Prefetch, manual speech and auto-guide share this module's one load promise
 * and one worker. Synthesis audio is received as a transferred Float32Array.
 * If the worker cannot start, calls fall back to the same bundle on the page
 * thread so speech still has a path. */
const WORKER_URL = new URL('./kokoro-worker.js?v=20261113resp', import.meta.url);
const BUNDLE_URL = new URL('./kokoro-tts.js?v=20261113pre', import.meta.url);

const listeners = new Set();
const pending = new Map();
let worker = null;
let workerFailed = false;
let fallback = null;
let loadPromise = null;
let seq = 0;
let snapshot = {
  ready: false, loading: false, error: '', device: '', progress: 0,
  loaded: 0, total: 0, stage: 'idle', version: '1.0.0'
};

function emit() {
  const current = status();
  listeners.forEach(cb => { try { cb(current); } catch { /* 单个订阅者出错不影响其它 */ } });
}

function status() {
  return { ...snapshot, loading: Boolean(snapshot.loading), usingWorker: !workerFailed && !!worker };
}

function onChange(cb) {
  if (typeof cb !== 'function') return () => {};
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function abortError() {
  const error = new Error('cancelled');
  error.name = 'AbortError';
  return error;
}

function applySnapshot(next) {
  if (!next || typeof next !== 'object') return;
  snapshot = {
    ...snapshot,
    ...next,
    loading: Boolean(next.loading),
    progress: Number(next.progress) || 0,
    loaded: Number(next.loaded) || 0,
    total: Number(next.total) || 0
  };
  emit();
}

function settle(requestId, error, value) {
  const item = pending.get(requestId);
  if (!item) return;
  pending.delete(requestId);
  if (error) item.reject(error);
  else item.resolve(value);
}

function ensureWorker() {
  if (workerFailed || typeof Worker === 'undefined') return null;
  if (worker) return worker;
  try {
    worker = new Worker(WORKER_URL, { type: 'module', name: 'zhidao-kokoro' });
  } catch {
    workerFailed = true;
    worker = null;
    return null;
  }
  worker.onmessage = event => {
    const msg = event.data || {};
    if (msg.type === 'status' && msg.snapshot) {
      applySnapshot(msg.snapshot);
      return;
    }
    if (msg.type === 'loaded') {
      applySnapshot(msg.snapshot || { ready: true, stage: 'ready', loading: false, progress: 100 });
      settle(msg.requestId, null, true);
      return;
    }
    if (msg.type === 'audio') {
      const samples = msg.samples instanceof Float32Array ? msg.samples : new Float32Array(msg.samples || []);
      settle(msg.requestId, null, {
        samples,
        sampleRate: Number(msg.sampleRate) || 24000,
        duration: Number(msg.duration) || (samples.length / (Number(msg.sampleRate) || 24000))
      });
      return;
    }
    if (msg.type === 'cancelled') {
      settle(msg.requestId, abortError());
      return;
    }
    if (msg.type === 'error') {
      const error = new Error(msg.message || '离线语音合成失败');
      if (!msg.requestId) {
        workerFailed = true;
        for (const id of [...pending.keys()]) settle(id, error);
        return;
      }
      settle(msg.requestId, error);
    }
  };
  worker.onerror = event => {
    workerFailed = true;
    const error = new Error((event && event.message) || '语音线程故障');
    try { worker.terminate(); } catch { /* already dead */ }
    worker = null;
    loadPromise = null;
    for (const id of [...pending.keys()]) settle(id, error);
    snapshot = { ...snapshot, stage: 'failed', error: error.message, loading: false };
    emit();
  };
  return worker;
}

async function loadFallback() {
  if (fallback) return fallback;
  const mod = await import(BUNDLE_URL);
  fallback = (mod && (mod.default || mod)) || null;
  if (!fallback || typeof fallback.synthesize !== 'function') throw new Error('离线语音引擎加载失败');
  if (typeof fallback.onChange === 'function') fallback.onChange(next => applySnapshot(next));
  return fallback;
}

function load() {
  if (loadPromise) return loadPromise;
  snapshot = { ...snapshot, loading: true, stage: snapshot.stage === 'ready' ? 'ready' : 'starting', error: '' };
  emit();
  loadPromise = (async () => {
    const thread = ensureWorker();
    if (!thread) {
      const engine = await loadFallback();
      await engine.load();
      applySnapshot(typeof engine.status === 'function' ? engine.status() : { ready: true, stage: 'ready', loading: false, progress: 100 });
      return engine;
    }
    const requestId = ++seq;
    await new Promise((resolve, reject) => {
      pending.set(requestId, { resolve, reject, kind: 'load' });
      thread.postMessage({ type: 'load', requestId });
    });
    return true;
  })().catch(error => {
    loadPromise = null;
    snapshot = { ...snapshot, loading: false, stage: 'failed', error: String((error && error.message) || error) };
    emit();
    throw error;
  });
  return loadPromise;
}

async function synthesize(text, options = {}) {
  await load();
  const voice = options.voice;
  const speed = options.speed;
  if (workerFailed || !worker) {
    const engine = await loadFallback();
    return engine.synthesize(text, { voice, speed });
  }
  const requestId = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(requestId, { resolve, reject, kind: 'synthesize' });
    try {
      worker.postMessage({ type: 'synthesize', requestId, text, voice, speed });
    } catch (error) {
      pending.delete(requestId);
      reject(error);
    }
  });
}

function cancelSynthesize() {
  const ids = [];
  for (const [id, item] of pending) {
    if (item.kind !== 'synthesize') continue;
    ids.push(id);
    pending.delete(id);
    item.reject(abortError());
  }
  if (worker && ids.length) {
    try { worker.postMessage({ type: 'cancel', ids }); } catch { /* worker already gone */ }
  }
}

function reset() {
  cancelSynthesize();
  if (worker) {
    try { worker.terminate(); } catch { /* noop */ }
  }
  worker = null;
  workerFailed = false;
  fallback = null;
  loadPromise = null;
  snapshot = {
    ready: false, loading: false, error: '', device: '', progress: 0,
    loaded: 0, total: 0, stage: 'idle', version: '1.0.0'
  };
  emit();
}

const API = { load, synthesize, status, onChange, cancelSynthesize, reset, MODEL_ID: 'onnx-community/Kokoro-82M-v1.1-zh-ONNX' };
export default API;
