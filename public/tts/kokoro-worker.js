/* Dedicated Kokoro worker. Tokenizer, phonemizer, ONNX init and synthesis run
 * here so the page can paint, scroll and accept input during a lesson.
 * Audio buffers go back as transferable Float32Arrays. The model loads once. */
'use strict';

if (typeof self.window === 'undefined') self.window = self;

const ENGINE_URL = new URL('./kokoro-tts.js?v=20261113pre', import.meta.url);
let modelFetches = 0;
const modelFetchUrls = [];
const onnxLoads = new Map();
const nativeFetch = self.fetch.bind(self);
function onnxKey(url) {
  return String(url || '').split('#')[0].split('?')[0];
}
self.fetch = (input, init) => {
  const url = typeof input === 'string' ? input : String((input && input.url) || input || '');
  if (!/\.onnx(?:$|[?#])/.test(url)) return nativeFetch(input, init);
  const key = onnxKey(url);
  const existing = onnxLoads.get(key);
  if (existing) return existing.blob.then(blob => new Response(blob, {
    status: 200,
    headers: { 'content-type': 'application/octet-stream', 'content-length': String(blob.size) }
  }));
  modelFetches += 1;
  if (modelFetchUrls.length < 8) modelFetchUrls.push(key.split('/').slice(-3).join('/'));
  let resolveBlob;
  let rejectBlob;
  const blob = new Promise((resolve, reject) => { resolveBlob = resolve; rejectBlob = reject; });
  onnxLoads.set(key, { blob });
  return nativeFetch(input, init).then(response => {
    if (!response.ok || !response.body) throw new Error('语音模型请求失败 ' + response.status);
    const copies = response.body.tee();
    new Response(copies[1]).blob().then(resolveBlob, error => {
      onnxLoads.delete(key);
      rejectBlob(error);
    });
    return new Response(copies[0], { status: response.status, headers: response.headers });
  }).catch(error => {
    onnxLoads.delete(key);
    rejectBlob(error);
    throw error;
  });
};

let enginePromise = null;
let loadPromise = null;
let queue = null;
let statusTimer = null;
let pendingStatus = null;

function flushStatus() {
  if (!pendingStatus) return;
  const body = pendingStatus;
  pendingStatus = null;
  self.postMessage({ type: 'status', snapshot: body });
}

function postStatus(snapshot, force) {
  if (!snapshot) return;
  pendingStatus = { ...snapshot, modelFetches, modelFetchUrls: modelFetchUrls.slice() };
  if (force) {
    if (statusTimer) { clearTimeout(statusTimer); statusTimer = null; }
    flushStatus();
    return;
  }
  if (statusTimer) return;
  statusTimer = setTimeout(() => {
    statusTimer = null;
    flushStatus();
  }, 100);
}

function getEngine() {
  if (!enginePromise) {
    enginePromise = import(ENGINE_URL).then(mod => {
      const engine = (mod && (mod.default || mod)) || null;
      if (!engine || typeof engine.synthesize !== 'function' || typeof engine.load !== 'function') {
        throw new Error('离线语音引擎加载失败');
      }
      if (typeof engine.onChange === 'function') {
        engine.onChange(snapshot => postStatus(snapshot, snapshot && (snapshot.ready || snapshot.stage === 'failed' || snapshot.error)));
      }
      return engine;
    }).catch(error => {
      enginePromise = null;
      throw error;
    });
  }
  return enginePromise;
}

function loadModel() {
  if (!loadPromise) {
    loadPromise = (async () => {
      const engine = await getEngine();
      await engine.load();
      postStatus(typeof engine.status === 'function' ? engine.status() : { ready: true, stage: 'ready' }, true);
      return engine;
    })().catch(error => {
      loadPromise = null;
      throw error;
    });
  }
  return loadPromise;
}

function toTransferable(samples) {
  if (!samples || !samples.length) throw new Error('合成结果为空');
  const out = new Float32Array(samples.length);
  out.set(samples);
  return out;
}

async function ensureQueue() {
  if (queue) return queue;
  const mod = await import('./synth-queue.mjs');
  queue = mod.createSynthQueue(async job => {
    const engine = await loadModel();
    const audio = await engine.synthesize(job.text, { voice: job.voice, speed: job.speed });
    const samples = toTransferable(audio && audio.samples);
    return {
      sampleRate: Number(audio && audio.sampleRate) || 24000,
      duration: Number(audio && audio.duration) || samples.length / 24000,
      samples
    };
  });
  return queue;
}

function fail(requestId, error) {
  self.postMessage({
    type: 'error',
    requestId: requestId || 0,
    message: String((error && error.message) || error || '语音线程故障')
  });
}

self.onmessage = event => {
  const msg = event.data || {};
  if (msg.type === 'load') {
    loadModel()
      .then(engine => {
        self.postMessage({
          type: 'loaded',
          requestId: msg.requestId,
          snapshot: typeof engine.status === 'function' ? engine.status() : { ready: true, stage: 'ready' }
        });
      })
      .catch(error => fail(msg.requestId, error));
    return;
  }
  if (msg.type === 'synthesize') {
    ensureQueue()
      .then(q => {
        q.enqueue({
          requestId: msg.requestId,
          text: msg.text,
          voice: msg.voice,
          speed: msg.speed,
          onResult: result => {
            self.postMessage({
              type: 'audio',
              requestId: msg.requestId,
              sampleRate: result.sampleRate,
              duration: result.duration,
              samples: result.samples
            }, [result.samples.buffer]);
          },
          onError: error => fail(msg.requestId, error),
          onCancel: () => self.postMessage({ type: 'cancelled', requestId: msg.requestId })
        });
      })
      .catch(error => fail(msg.requestId, error));
    return;
  }
  if (msg.type === 'cancel') {
    if (queue) queue.cancel(msg.ids || []);
  }
};

self.addEventListener('unhandledrejection', event => {
  fail(0, event.reason);
});
