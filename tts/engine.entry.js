/* 知岛 · 浏览器离线语音合成引擎（打包入口，无界面）
 *
 * 与 D:\aispace\zh-web-service 同源：Kokoro-82M-v1.1-zh-ONNX 跑在浏览器里，
 * 优先 WebGPU，不可用时回退 WASM。模型与音色全部从本站静态目录读取：
 *   模型 /tts/models/onnx-community/Kokoro-82M-v1.1-zh-ONNX/…
 *   音色 /tts/voices/<voice>.bin
 *   运行时 /tts/ort/*.wasm
 *
 * 打包产物：public/tts/kokoro-tts.js（由 build-tts.js 生成，不手改）。
 * 页面不直接 import 本文件：public/tts/kokoro-worker.js 在独立 Worker 里加载打包产物，
 * 分词 / 音素 / ONNX 初始化与合成都离开主线程。本文件保持无 DOM，便于那条 Worker 调用。
 * 暴露 window.ZhidaoTTS = { load, synthesize, status, voices }（仅在主线程回退路径上）。
 */
import { KokoroTTS } from '@uzen/kokoro-js';
/* 必须从 transformers.js 拿原始 env：kokoro-js 导出的 env 只是代理对象，
 * 只透传 cacheDir / allowLocalModels / wasmPaths，
 * localModelPath、allowRemoteModels 写在它上面不会生效（模型会跑去 Hugging Face）。 */
import { env } from '@huggingface/transformers';

const MODEL_ID = 'onnx-community/Kokoro-82M-v1.1-zh-ONNX';
const MODEL_PATH = '/tts/models/';
const VOICE_PATH = '/tts/voices/';
const ORT_PATH = typeof location !== 'undefined' ? new URL('/tts/ort/', location.href).href : '/tts/ort/';
const DTYPE = 'fp32';

/* 本地模型优先；本地缺文件时仍允许回落到 Hugging Face（首次联网下载后浏览器会缓存）。 */
env.allowLocalModels = true;
env.allowRemoteModels = true;
env.localModelPath = MODEL_PATH;
env.backends.onnx.wasm.wasmPaths = ORT_PATH;
/* 不用 Cache API 存模型：几百 MB 写进 Cache Storage 容易触发配额失败
 *（ERR_CACHE_WRITE_FAILURE）。模型由 HTTP 缓存（本站发 immutable）负责复用。 */
try { env.useBrowserCache = false; } catch { /* 老版本没有这个开关 */ }
/* Let lesson/API traffic take precedence over the large background transfer.
 * Reuse Transformers' fetch + streaming progress + normal HTTP cache; no second
 * prefetch request, cache-busting model URL, or duplicate 324 MB buffer. */
if (typeof env.fetch === 'function') {
  const fetchModelFile = env.fetch;
  env.fetch = (input, init = {}) => {
    const url = typeof input === 'string' ? input : String(input?.url || input);
    return fetchModelFile(input, /\.onnx(?:$|[?#])/.test(url)
      ? { ...init, priority: 'low' } : init);
  };
}
/* 没有 COOP/COEP 时不能用多线程 wasm；单线程足够，WebGPU 走 GPU 不受影响。 */
try { env.backends.onnx.wasm.numThreads = 1; } catch { /* 老版本没有这个开关 */ }

const state = {
  ready: false,
  loading: null,
  error: '',
  device: '',
  progress: 0,
  loaded: 0,
  total: 0,
  stage: 'idle',
  modelId: MODEL_ID,
  dtype: DTYPE,
  engine: null
};

const listeners = [];
function emit() {
  const snapshot = status();
  listeners.forEach(cb => { try { cb(snapshot); } catch { /* 单个订阅者出错不影响其它 */ } });
}

function status() {
  return {
    ready: state.ready,
    loading: Boolean(state.loading),
    error: state.error,
    device: state.device,
    progress: state.progress,
    loaded: state.loaded, total: state.total, stage: state.stage,
    modelId: state.modelId,
    dtype: state.dtype,
    version: '1.0.0'
  };
}

function onChange(cb) {
  if (typeof cb !== 'function') return () => {};
  listeners.push(cb);
  return () => { const i = listeners.indexOf(cb); if (i >= 0) listeners.splice(i, 1); };
}

async function pickDevice() {
  try {
    const adapter = await navigator.gpu?.requestAdapter?.();
    return adapter ? 'webgpu' : 'wasm';
  } catch { return 'wasm'; }
}

async function loadModel() {
  if (state.ready && state.engine) return state.engine;
  if (state.loading) return state.loading;
  state.error = '';
  state.progress = 0;
  state.loaded = 0;
  state.total = 0;
  state.stage = 'starting';
  state.loading = (async () => {
    const device = await pickDevice();
    state.device = device;
    emit();
    const options = {
      dtype: DTYPE,
      device,
      voicePath: VOICE_PATH,
      progress_callback: (info) => {
        // Transformers already streams the response with loaded/total bytes.
        // Only track ONNX: tiny tokenizer/config files must not reset the bar to 100%.
        if (!info || !/\.onnx(?:$|[?#])/.test(info.file || '')) return;
        if (info.status === 'initiate') {
          state.stage = 'downloading';
        } else if (info.status === 'progress') {
          state.loaded = Math.max(0, Number(info.loaded) || 0);
          state.total = Math.max(0, Number(info.total) || 0);
          state.progress = state.total > 0
            ? Math.min(100, state.loaded / state.total * 100) : 0;
          state.stage = state.total > 0 && state.loaded >= state.total ? 'initializing' : 'downloading';
        } else if (info.status === 'done') {
          state.progress = 100;
          state.stage = 'initializing';
        } else return;
        emit();
      }
    };
    let engine;
    try {
      engine = await KokoroTTS.from_pretrained(MODEL_ID, options);
    } catch (error) {
      if (device !== 'webgpu') throw error;
      // WebGPU 初始化失败 → 回退 WASM（更慢但能用）。
      state.device = 'wasm';
      emit();
      engine = await KokoroTTS.from_pretrained(MODEL_ID, { ...options, device: 'wasm' });
    }
    state.engine = engine;
    state.ready = true;
    state.stage = 'ready';
    state.progress = 100;
    state.loading = null;
    emit();
    return engine;
  })().catch(error => {
    state.loading = null;
    state.stage = 'failed';
    state.error = String((error && error.message) || error);
    emit();
    throw error;
  });
  return state.loading;
}

/**
 * 合成一段语音。调用方应先把长文切成短句；这里仍是「一段进、一段出」。
 * @returns {Promise<{samples: Float32Array, sampleRate: number, duration: number}>}
 */
async function synthesize(text, options = {}) {
  const content = String(text == null ? '' : text).trim();
  if (!content) throw new Error('没有可朗读的文本');
  const voice = String(options.voice || 'zf_001');
  const speed = Number(options.speed) || 1;
  const engine = await loadModel();
  const audio = await engine.generate(content, { voice, speed });
  const samples = audio && audio.audio;
  const sampleRate = Number(audio && audio.sampling_rate) || 24000;
  if (!samples || !samples.length) throw new Error('合成结果为空');
  return { samples, sampleRate, duration: samples.length / sampleRate };
}

const API = { load: loadModel, synthesize, status, onChange, MODEL_ID };
if (typeof window !== 'undefined') window.ZhidaoTTS = API;
export default API;
