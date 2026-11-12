/* Service Worker：应用外壳缓存 + 网络优先的 API 策略。
 *
 * 定位说明：
 *  - 静态资源（HTML/CSS/JS/模型）缓存到本地，离线可打开界面；
 *  - API 一律走网络（讲解生成需要实时模型结果，不适合离线）；
 *  - 人脸模型与 wasm 体积大且内容不变：网络优先读取，离线时回退本地缓存（只缓存 2xx）。
 */
// v16：修正 /tts/ 大文件入缓存的判断（依赖 Content-Length，缺长度则跳过）。
const CACHE = 'zhidao-shell-v17-split';
const PRECACHE = [
  '/',
  '/config.js',
  '/api-config.js',
  '/styles.css',
  '/mascot.css',
  '/identity.css',
  '/knowledge.css',
  '/grade-profile.js',
  '/feedback.js',
  '/learner.js',
  '/knowledge-client.js',
  '/a2ui-catalog.js',
  '/a2ui-matrix.js',
  '/a2ui-question-map.js',
  '/a2ui-p4a.js',
  '/a2ui-p4b.js',
  '/a2ui-p4c.js',
  '/a2ui-p4d.js',
  '/a2ui-games.js',
  '/a2ui-compiler.js',
  '/a2ui-render.js',
  '/a2ui-play.js',
  '/a2ui-stream.js',
  '/a2ui-bridge.js',
  '/app.js',
  '/voice.js',
  '/dynamic.js',
  '/mascot.js',
  '/mascot-chat.js',
  '/face.js',
  '/identity.js',
  '/identity-ui.js',
  '/pwa.js',
  '/pwa.css',
  '/manifest.webmanifest',
  '/icon.svg',
  '/vendor/face-api.esm.js',
  '/vendor/tfjs-backend-wasm.wasm',
  '/vendor/tfjs-backend-wasm-simd.wasm',
  '/vendor/tfjs-backend-wasm-threaded-simd.wasm',
  '/model/tiny_face_detector_model-weights_manifest.json',
  '/model/tiny_face_detector_model.bin',
  '/model/face_recognition_model-weights_manifest.json',
  '/model/face_recognition_model.bin'
];

self.addEventListener('install', event => {
  // 单个资源失败不应让整个安装流程失败（例如某些环境取不到 wasm）。
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => Promise.allSettled(PRECACHE.map(url => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// 页面确认更新后，让等待中的新版本立即接管。
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;

  // API 请求永远走网络：讲解结果依赖实时模型，不能用缓存冒充。
  if (url.pathname.startsWith('/api/')) return;

  // 模型与 wasm：网络优先 + 离线回退。
  // 旧版用「缓存优先 + 无条件 cache.put」，一旦部署初期拿到 404，错误响应会被永久缓存，
  // 之后文件补齐也一直读不到。现在只缓存 2xx，且离线回退时同样过滤掉错误响应。
  if (url.pathname.startsWith('/model/') || url.pathname.startsWith('/vendor/')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then(cache => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() => caches.match(request)
          .then(hit => hit || caches.match(request, { ignoreSearch: true }))
          .then(hit => (hit && hit.ok ? hit : Response.error())))
    );
    return;
  }

  // 离线语音资源（/tts/）：引擎包、ONNX Runtime、音色、模型都是不可变内容，
  // 用缓存优先，避免每次朗读都重新拉几十 MB 的 wasm。
  // 超过 32MB 的大文件（模型本体 324MB）不进 Cache Storage，交给 HTTP 缓存处理，避免双份占盘。
  // 服务端已统一带 Content-Length；若某次响应拿不到长度（chunked），宁可跳过也不写缓存，
  // 否则 300MB+ 的模型会被整个塞进 Cache Storage，配额爆掉还会拖垮浏览器。
  if (url.pathname.startsWith('/tts/')) {
    const BIG_FILE_LIMIT = 32 * 1024 * 1024;
    event.respondWith(
      caches.match(request).then(hit => {
        if (hit) return hit;
        return fetch(request)
          .then(response => {
            const length = Number(response.headers.get('content-length') || 0);
            if (response.ok && length > 0 && length <= BIG_FILE_LIMIT) {
              const copy = response.clone();
              caches.open(CACHE).then(cache => cache.put(request, copy)).catch(() => {});
            }
            return response;
          })
          .catch(() => Response.error());
      })
    );
    return;
  }

  // 其余静态资源：网络优先，失败回退缓存（保证离线可打开界面）。
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(request, copy)).catch(() => {});
        }
        return response;
      })
      // index.html 给脚本加了 ?v= 版本号，离线回退时要忽略 query 才能命中预缓存条目。
      .catch(() => caches.match(request)
        .then(hit => hit || caches.match(request, { ignoreSearch: true }))
        .then(hit => hit || caches.match('/')))
  );
});
