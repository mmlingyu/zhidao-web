/* 人脸采集与比对（浏览器端）
 *
 * 全流程在浏览器完成：加载模型 → 摄像头取帧 → 检测人脸 → 提取 128 维特征。
 * 人脸图像不会上传，只有特征向量会发给服务端；服务端也不存原图。
 *
 * 为什么放在前端：
 *  1. 无需云端人脸 API 密钥，也不需要额外计费；
 *  2. 原始人脸图像不出设备，隐私风险最低；
 *  3. 服务端只做向量比对，不引入 ML 运行时，保持轻量。
 */
'use strict';

const FACE = (() => {
  const MODEL_BASE = '/model';
  const WASM_BASE = '/vendor/';
  // 绝对路径：动态 import 用相对路径时，页面一旦带路径前缀就会指向不存在的地址。
  const FACE_API_URL = '/vendor/face-api.esm.js';
  // 与 build-face.js 的复制清单、sw.js 的预缓存清单保持一致。
  const REQUIRED_ASSETS = [
    '/vendor/face-api.esm.js',
    '/vendor/tfjs-backend-wasm.wasm',
    '/vendor/tfjs-backend-wasm-simd.wasm',
    '/vendor/tfjs-backend-wasm-threaded-simd.wasm',
    '/model/tiny_face_detector_model-weights_manifest.json',
    '/model/tiny_face_detector_model.bin',
    '/model/face_recognition_model-weights_manifest.json',
    '/model/face_recognition_model.bin'
  ];
  let faceapi = null;
  let backend = null;
  let loadPromise = null;
  let loadError = null;
  let retryNote = '';

  /** 构造带定位信息的错误：调用方可以直接告诉用户下一步做什么。 */
  function faceError(stage, url, status, cause, serverHasFile, extra) {
    const label = { vendor: '识别程序', model: '模型文件', backend: '计算后端', ready: '运行时' }[stage] || '资源';
    let message;
    if (status === 404) {
      message = `人脸${label}缺失：${url} 返回 404`;
    } else if (status === 0 && !serverHasFile) {
      message = `人脸${label}无法连接（${url}），请检查网络后重试`;
    } else if (serverHasFile) {
      message = `人脸${label}读取失败：服务端已有 ${url}，但浏览器取到的是失效缓存或网络已断开${extra ? `（${extra}）` : ''}`;
    } else {
      message = `人脸${label}加载失败（${url}${status ? ` · HTTP ${status}` : ''}），请检查网络后重试`;
    }
    const error = new Error(message);
    error.code = 'FACE_MODEL';
    error.stage = stage;
    error.url = url;
    error.status = status;
    error.cause = cause;
    error.hint = status === 404
      ? '执行 npm run build:face 并重启服务'
      : stage === 'backend'
        ? '人脸功能暂不可用，可先用口令登录'
        : '刷新页面重试；仍失败请检查网络或改用口令登录';
    return error;
  }

  /** 服务端自检：区分「部署缺文件」与「浏览器读不到」。 */
  async function checkAssets() {
    try {
      const assets = await Promise.all(REQUIRED_ASSETS.map(async url => {
        const response = await fetch(url, { method: 'HEAD', cache: 'no-store' });
        return { url, ok: response.ok, size: Number(response.headers.get('content-length') || 0) };
      }));
      const missing = assets.filter(asset => !asset.ok).map(asset => asset.url);
      return { ok: true, ready: missing.length === 0, missing, assets };
    } catch (error) {
      return null;
    }
  }

  /**
   * 把底层异常翻译成可执行的原因。
   * loadFromUri 内部可能因为 .bin 分片失败而报错，因此优先用服务端清单找出真正缺的那个文件。
   */
  async function failure(stage, url, cause) {
    const prefix = stage === 'vendor' ? '/vendor/' : '/model/';
    let report = null;
    try { report = await checkAssets(); } catch (error) { /* 诊断失败不影响主流程 */ }
    const missing = report?.missing?.find(item => item.startsWith(prefix));
    if (missing) return faceError(stage, missing, 404, cause, false);

    let status = 0;
    let serverHasFile = false;
    try {
      // HEAD 请求不会被 sw.js 拦截（它只接管 GET），能绕过旧缓存看到服务端真实状态。
      const probe = await fetch(url, { method: 'HEAD', cache: 'no-store' });
      status = probe.status;
      serverHasFile = probe.ok;
    } catch (error) { /* 离线时保持 status=0 */ }
    if (report?.ready) serverHasFile = true;
    return faceError(stage, url, status || 0, cause, serverHasFile, cause?.message || '');
  }

  /**
   * 清掉 Service Worker 里 /model、/vendor 的缓存条目。
   * 旧版本曾把 404 / 半成品响应永久缓存下来，导致文件补齐后仍旧「加载失败」。
   * 只在失败重试时调用；成功后 sw.js 会重新缓存 2xx 响应，离线能力不受影响。
   */
  async function purgeAssetCache({ onlyBad = false } = {}) {
    if (!('caches' in window)) return 0;
    let removed = 0;
    try {
      for (const key of await caches.keys()) {
        const cache = await caches.open(key);
        for (const request of await cache.keys()) {
          const target = new URL(request.url, location.href);
          if (target.origin !== location.origin) continue;
          if (!target.pathname.startsWith('/model/') && !target.pathname.startsWith('/vendor/')) continue;
          if (onlyBad) {
            const hit = await cache.match(request);
            if (hit?.ok !== false) continue; // 正常响应要留给离线模式
          }
          if (await cache.delete(request)) removed += 1;
        }
      }
    } catch (error) { /* 缓存 API 不可用时退化成普通重试 */ }
    return removed;
  }

  async function importFaceApi(bust) {
    // 加查询参数可让缓存优先策略直接落空，绕开被污染的同名缓存条目。
    const url = bust ? `${FACE_API_URL}?f=${Date.now()}` : FACE_API_URL;
    const module = await import(url);
    if (!module?.tf || !module?.nets?.tinyFaceDetector) throw new Error('face-api 模块不完整');
    return module;
  }

  /** wasm 优先，失败自动降级到 webgl / cpu，避免个别浏览器没有 SIMD 或 WebGL 就直接不可用。 */
  async function initBackend(api) {
    const failures = [];
    for (const name of ['wasm', 'webgl', 'cpu']) {
      try {
        if (name === 'wasm') api.tf.setWasmPaths(WASM_BASE); // 末尾斜杠不能省，wasm 文件名会被直接拼接
        const ok = await api.tf.setBackend(name);
        if (!ok) throw new Error(`${name} 后端返回 false`);
        await api.tf.ready();
        backend = name;
        return name;
      } catch (error) {
        failures.push(`${name}: ${error.message}`);
      }
    }
    throw faceError('backend', WASM_BASE, 0, new Error(failures.join('；')), false, failures.join('；'));
  }

  async function loadModels(api) {
    const nets = [
      { net: api.nets.tinyFaceDetector, url: `${MODEL_BASE}/tiny_face_detector_model-weights_manifest.json` },
      { net: api.nets.faceRecognitionNet, url: `${MODEL_BASE}/face_recognition_model-weights_manifest.json` }
    ];
    for (const item of nets) {
      try {
        await item.net.loadFromUri(MODEL_BASE);
      } catch (cause) {
        throw await failure('model', item.url, cause);
      }
    }
  }

  async function loadOnce(bust) {
    let api;
    try {
      api = await importFaceApi(bust);
    } catch (cause) {
      throw await failure('vendor', FACE_API_URL, cause);
    }
    faceapi = api;
    await initBackend(api);
    await loadModels(api);
    return true;
  }

  /**
   * 加载 face-api 与计算后端；并发调用共享同一个 Promise。
   * 首次失败会清掉资源缓存并带 cache-busting 参数重试一次，成功后不再重复加载。
   */
  async function load({ retry = true } = {}) {
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      try {
        // 先只清掉历史遗留的错误响应；正常缓存保留，离线仍能加载。
        await purgeAssetCache({ onlyBad: true });
        await loadOnce(false);
        loadError = null;
        return true;
      } catch (firstError) {
        if (retry) {
          const removed = await purgeAssetCache();
          retryNote = `已清理 ${removed} 条旧缓存并自动重试`;
          faceapi = null;
          backend = null;
          try {
            await loadOnce(true);
            loadError = null;
            console.info('[face] 首次失败后重试成功', firstError.message, retryNote);
            return true;
          } catch (secondError) {
            loadError = secondError;
            loadPromise = null;
            throw secondError;
          }
        }
        loadError = firstError;
        loadPromise = null;
        throw firstError;
      }
    })();
    return loadPromise;
  }

  function isLoaded() { return Boolean(faceapi && backend); }
  function getError() { return loadError; }
  function status() {
    return {
      loaded: isLoaded(),
      backend,
      requiredAssets: REQUIRED_ASSETS.slice(),
      retryNote,
      lastError: loadError ? {
        code: loadError.code, stage: loadError.stage, url: loadError.url,
        status: loadError.status, message: loadError.message, hint: loadError.hint
      } : null
    };
  }

  /**
   * 从视频元素采集人脸特征。
   * @param {HTMLVideoElement} video 已播放的摄像头画面
   * @param {object} options
   * @returns {Promise<{descriptor:number[], score:number, box:object}>}
   */
  async function describe(video, { minScore = 0.5, inputSize = 320 } = {}) {
    if (!faceapi) throw new Error('人脸模型尚未加载');
    // detectSingleFace 直接返回结果对象（含 box / score），不像 detectAllFaces 那样包一层 detection。
    const result = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({
      inputSize, scoreThreshold: 0.3
    }));
    if (!result) throw new Error('没有检测到人脸，请正对摄像头');
    if (result.score < minScore) throw new Error('人脸不够清晰，请调整光线后重试');
    const descriptor = await faceapi.nets.faceRecognitionNet.computeFaceDescriptor(video, result);
    return {
      descriptor: Array.from(descriptor),
      score: Number(result.score.toFixed(4)),
      box: result.box
    };
  }

  /** 从静态图片（dataURL）提取特征，用于上传头像场景。 */
  async function describeImage(imageSource, { minScore = 0.4 } = {}) {
    if (!faceapi) throw new Error('人脸模型尚未加载');
    const result = await faceapi.detectSingleFace(imageSource, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.25 }));
    if (!result) throw new Error('图片中没有检测到人脸');
    if (result.score < minScore) throw new Error('人脸不够清晰，请换一张更清晰的正面照');
    const descriptor = await faceapi.nets.faceRecognitionNet.computeFaceDescriptor(imageSource, result);
    return {
      descriptor: Array.from(descriptor),
      score: Number(result.score.toFixed(4)),
      box: result.box
    };
  }

  /**
   * 简单的活体检测：要求连续若干帧都检测到人脸，且人脸框位置有轻微变化。
   * 目的不是防住专业攻击（那需要云端活体服务），而是挡住"举照片对着屏幕"这种常见情况。
   * @returns {Promise<{descriptor:number[], score:number, liveness:number}>}
   */
  async function captureLive(video, { frames = 5, minScore = 0.5, minMove = 0.6 } = {}) {
    const seen = [];
    for (let i = 0; i < frames; i += 1) {
      // 等待下一帧，确保拿到的是新的画面而不是同一帧。
      await new Promise(resolve => requestAnimationFrame(() => resolve()));
      const found = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.3 }));
      if (found) seen.push(found.box);
    }
    if (seen.length < Math.max(2, Math.ceil(frames / 2))) {
      throw new Error('未能持续捕捉到人脸，请保持正对摄像头');
    }
    // 人脸框中心位移越大，越像真人在动。
    const first = seen[0];
    let maxMove = 0;
    for (const box of seen) {
      const dx = box.x + box.width / 2 - (first.x + first.width / 2);
      const dy = box.y + box.height / 2 - (first.y + first.height / 2);
      maxMove = Math.max(maxMove, Math.sqrt(dx * dx + dy * dy));
    }
    if (maxMove < minMove) {
      throw new Error('请轻微晃动头部，确认是本人操作');
    }
    const result = await describe(video, { minScore });
    return { ...result, liveness: Number(maxMove.toFixed(2)) };
  }

  /**
   * 采集多张人脸特征（注册时用）。
   *
   * 为什么要多张：单张特征对采集条件敏感 —— 实测同一人仅因缩放不同，欧氏距离就能到 0.334；
   * 而异人的最小距离是 0.335，两者几乎没有间隙。注册时采集 3 个不同角度/光线的样本，
   * 登录时跨样本集取最小距离，可把同人距离压到 0.22 以内，安全间隙扩大到 0.11。
   *
   * @param {HTMLVideoElement} video
   * @param {object} options
   * @returns {Promise<{descriptors:number[][], best:number[]}>}
   */
  async function describeMulti(video, { samples = 3, minScore = 0.5, onProgress = null } = {}) {
    const descriptors = [];
    const seen = [];
    for (let i = 0; i < samples; i += 1) {
      // 每采一张，短暂等待并轻微提示用户换个角度。
      await new Promise(resolve => setTimeout(resolve, 220));
      const result = await describe(video, { minScore });
      // 特征过于相似说明用户没动，重复采样没有额外信息。
      const tooSimilar = seen.some(prev => {
        let sum = 0;
        for (let k = 0; k < prev.length; k += 1) sum += (prev[k] - result.descriptor[k]) ** 2;
        return Math.sqrt(sum) < 0.06;
      });
      if (!tooSimilar) {
        descriptors.push(result.descriptor);
        seen.push(result.descriptor);
      }
      if (onProgress) onProgress(descriptors.length, samples);
    }
    if (!descriptors.length) throw new Error('没有采集到人脸，请正对摄像头');
    return { descriptors, best: descriptors[0] };
  }

  /** 打开摄像头。返回 { video, stop }。 */
  async function openCamera(videoEl, { facingMode = 'user' } = {}) {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('当前浏览器不支持摄像头，请使用 HTTPS 或本机地址访问');
    }
    // 摄像头在非安全上下文（http 局域网地址）下不可用，这里提前给出可操作的提示。
    if (!window.isSecureContext) {
      throw new Error('摄像头需要 HTTPS 环境，请用 https:// 或本机 localhost 访问');
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode, width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false
    });
    videoEl.srcObject = stream;
    // iOS Safari 必须有 playsinline 与 muted，否则会强制全屏播放。
    videoEl.setAttribute('playsinline', '');
    videoEl.setAttribute('webkit-playsinline', '');
    videoEl.muted = true;
    await videoEl.play();
    return {
      video: videoEl,
      stop() { stream.getTracks().forEach(track => track.stop()); videoEl.srcObject = null; }
    };
  }

  /** 摄像头是否可用（HTTPS、权限、硬件都满足）。 */
  function cameraSupport() {
    // 先判安全上下文：非安全上下文下 navigator.mediaDevices 整个都不存在，
    // 若先判它会报「浏览器不支持摄像头」，把「缺 HTTPS」误说成浏览器问题。
    if (!window.isSecureContext) {
      return { ok: false, reason: '需要 HTTPS 环境才能使用摄像头' };
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      return { ok: false, reason: '当前浏览器不支持摄像头' };
    }
    return { ok: true, reason: '' };
  }

  return {
    load, isLoaded, getError, status, checkAssets, purgeAssetCache,
    describe, describeImage, describeMulti, captureLive, openCamera, cameraSupport
  };
})();

window.FACE = FACE;
