/* AI course integration. Loaded after app.js so the built-in lessons remain an offline fallback. */
Object.assign(state, {
  currentId: state.topic,
  dynamic: null,
  dynamicLessons: readStorage('zhidao-dynamic-lessons', {}),
  aiChineseFilter: 'all',
  aiChineseSelected: 0,
  aiFollowupQuestion: '',
  aiFollowup: null,
  aiFollowupLoading: false,
  cacheVersion: readStorage('zhidao-cache-version', null),
  modelProvider: readStorage('zhidao-model-provider', null),
  strictModel: readStorage('zhidao-model-strict', false) === true,
  serverDefaultProvider: null,
  modelOptions: null,
  lastMetrics: '',
  pipeline: null,
  pipelineTimer: null
});

const e = value => escapeHTML(value ?? '');
const builtinRenderLesson = renderLesson;
let requestSequence = 0;
let activeController = null;
let a2uiSurface = null;  // 当前语文 surface；重渲染前先 destroy，避免事件委托残留

/* ---------------- 知识卡片语音引导 ----------------
 * 目标是「自然易用」：第一部分一出现就自动开讲，之后点哪个部分就听哪段。
 * 朗读文本按模块现算，不把长文塞进 data-speak，避免属性和转义把句子截断。
 * 同一课只自动引导一次；再点同一段是暂停，点另一段则换成那一段。 */
let guidedSpeechKey = '';
let spokenIntroText = '';
let activeSpeech = { key: '', token: 0 };

function joinSpeech(parts) {
  const chunks = [];
  for (const part of parts) {
    const text = String(part == null ? '' : part).replace(/\s+/g, ' ').trim();
    if (!text) continue;
    chunks.push(/[。！？.!?]$/.test(text) ? text : `${text}。`);
  }
  return chunks.join('');
}

function speechPlayButton(key, label) {
  return `<button type="button" class="audio-button speech-play" data-speech-play="${e(key)}" aria-label="${e(label || '朗读这一部分')}">${icon('volume')}</button>`;
}

function speechForEnglishItem(item) {
  if (!item) return '';
  const examples = (Array.isArray(item.examples) ? item.examples : []).map(example => {
    if (!example) return '';
    if (typeof example === 'string') return example;
    return [example.en, example.cn].filter(Boolean).join('，');
  }).filter(Boolean);
  return joinSpeech([
    [item.word, item.title].filter(Boolean).join('，'),
    item.description,
    examples.length ? `例如：${examples.join('。')}` : '',
    item.tip,
    item.extra
  ]);
}

function speechForEnglishModule1(data) {
  const items = Array.isArray(data?.items) ? data.items : [];
  return joinSpeech([
    data?.mnemonic ? `先记住：${data.mnemonic}` : '我们先来看场景对比',
    ...items.map(speechForEnglishItem)
  ]);
}

function speechForQuiz(quizView) {
  if (!quizView) return '';
  const choices = Array.isArray(quizView.choices) ? quizView.choices.filter(Boolean) : [];
  return joinSpeech([
    '来做一道练习',
    quizView.sentence,
    quizView.cn,
    choices.length ? `选项有：${choices.join('，')}。先想一想，再选` : '先想一想，再选'
  ]);
}

function speechForChineseIdiom(item) {
  if (!item) return '';
  return joinSpeech([
    item.word,
    item.pinyin,
    item.meaning,
    item.example ? `比如：${item.example}` : '',
    item.scene
  ]);
}

function speechForChineseModule1(data) {
  const list = Array.isArray(data?.idioms) ? data.idioms : [];
  if (!list.length) return '';
  const briefs = list.map(item => joinSpeech([item.word, item.pinyin, item.meaning]));
  const focus = list[0];
  return joinSpeech([
    '先来看看这些表达',
    ...briefs,
    focus?.example ? `我们先看「${focus.word}」。比如：${focus.example}` : '',
    focus?.scene
  ]);
}

function speechForMathMethod(method, steps) {
  if (!method) return '';
  const list = Array.isArray(steps) ? steps : (Array.isArray(method.steps) ? method.steps : []);
  return joinSpeech([
    method.title || method.name || '第一种思路',
    method.intro,
    ...list.map((step, index) => joinSpeech([
      `第${index + 1}步，${step.title || ''}`,
      step.text,
      step.formula
    ]))
  ]);
}

function speechForMathStep(step, index) {
  if (!step) return '';
  return joinSpeech([`第${index + 1}步，${step.title || ''}`, step.text, step.formula]);
}

function speechForInsight(method) {
  if (!method) return '';
  return joinSpeech(['这一层，强在哪里', method.quote, method.insight]);
}

function speechForChallenge(challenge, showAnswer) {
  if (!challenge) return '';
  return joinSpeech([
    '换一道，试试你的新思路',
    challenge.question,
    showAnswer && challenge.answer ? `答案是：${challenge.answer}` : '先自己想一想'
  ]);
}

function speechForIntro(result) {
  const data = result?.data || {};
  return joinSpeech([
    data.bannerTitle ? `先来看：${data.bannerTitle}` : '',
    data.description || ''
  ]);
}

function firstModuleSpeech(result) {
  const data = result?.data || {};
  if (result?.subject === 'english') return speechForEnglishModule1(data);
  if (result?.subject === 'chinese') return speechForChineseModule1(data);
  if (result?.subject === 'math') {
    const method = (Array.isArray(data.methods) ? data.methods : [])[0] || {};
    return speechForMathMethod(method, method.steps);
  }
  return '';
}

function speechTextForKey(key) {
  const data = state.dynamic?.data || {};
  const subject = state.dynamic?.subject;
  if (key === 'intro') return speechForIntro(state.dynamic);
  if (key === 'module-1') return firstModuleSpeech(state.dynamic);
  if (key === 'mnemonic') return joinSpeech([data.mnemonic ? `先记住：${data.mnemonic}` : '']);
  if (key === 'module-2' || key === 'quiz') {
    const quizzes = Array.isArray(data.quizzes) ? data.quizzes : [];
    const quiz = quizzes[state.quizIndex] || quizzes[0];
    if (!quiz) return '';
    const quizView = (typeof ZHIDAO_QUIZ !== 'undefined' ? ZHIDAO_QUIZ.normalizeQuiz(quiz) : {
      sentence: quiz.sentence || '请选择更合适的表达',
      cn: quiz.cn || '',
      choices: Array.isArray(quiz.choices) ? quiz.choices : []
    });
    return speechForQuiz(quizView);
  }
  if (key && key.startsWith('english-item-')) {
    const index = Number(key.slice('english-item-'.length));
    return speechForEnglishItem((data.items || [])[index]);
  }
  if (key && key.startsWith('idiom-')) {
    const index = Number(key.slice('idiom-'.length));
    const list = Array.isArray(data.idioms) ? data.idioms : [];
    const visible = state.aiChineseFilter === 'all' ? list : list.filter(item => item.tag === state.aiChineseFilter);
    return speechForChineseIdiom(visible[index] || list[index]);
  }
  if (key === 'math-method') {
    const methods = Array.isArray(data.methods) ? data.methods : [];
    const method = methods[state.mathLevel] || methods[0];
    const progress = state.mathProgress?.[state.mathLevel] || (method?.steps || []).length;
    const steps = (method?.steps || []).slice(0, progress);
    return speechForMathMethod(method, steps);
  }
  if (key && key.startsWith('math-step-')) {
    const index = Number(key.slice('math-step-'.length));
    const methods = Array.isArray(data.methods) ? data.methods : [];
    const method = methods[state.mathLevel] || methods[0] || {};
    return speechForMathStep((method.steps || [])[index], index);
  }
  if (key === 'insight') {
    const methods = Array.isArray(data.methods) ? data.methods : [];
    return speechForInsight(methods[state.mathLevel] || methods[0]);
  }
  if (key === 'challenge') return speechForChallenge(data.challenge || {}, state.challengeVisible);
  return '';
}

function clearSpeakingUI() {
  document.querySelectorAll('.is-speaking').forEach(node => node.classList.remove('is-speaking'));
}

function stopLessonSpeech(quiet) {
  activeSpeech = { key: '', token: 0 };
  clearSpeakingUI();
  try { window.ZhidaoVoice?.stop?.({ quiet: quiet !== false }); } catch { /* 停朗读失败不影响页面 */ }
  try { window.speechSynthesis?.cancel?.(); } catch { /* noop */ }
}

function speakGuide(text, opts) {
  const options = opts || {};
  const line = String(text || '').trim();
  if (!line) return false;
  const key = options.key || line;
  if (activeSpeech.key === key) {
    stopLessonSpeech(true);
    return false;
  }
  const token = Date.now();
  activeSpeech = { key, token };
  clearSpeakingUI();
  const host = options.host || (options.key ? document.querySelector(`[data-speech-key="${options.key}"]`) : null);
  if (host) {
    host.classList.add('is-speaking');
    const button = host.querySelector('[data-speech-play], .audio-button');
    if (button) button.classList.add('is-speaking');
  }
  const lessonSubject = options.subject || state.dynamic?.subject;
  const Voice = window.ZhidaoVoice;
  const hasHan = Voice && typeof Voice.detectLang === 'function'
    ? Voice.detectLang(line) === 'zh'
    : /[\u3400-\u9FFF]/.test(line);
  // 中英混合不能先切到英语学科，否则会把文本交给不支持汉字的 Phonon 音色。
  const subject = hasHan ? 'chinese' : lessonSubject;
  const voice = hasHan
    ? (Voice && typeof Voice.voiceForSpeech === 'function'
      ? Voice.voiceForSpeech(line, 'chinese')
      : (Voice && typeof Voice.chineseVoiceId === 'function' ? Voice.chineseVoiceId() : 'zf_001'))
    : (Voice && typeof Voice.voiceForSpeech === 'function' ? Voice.voiceForSpeech(line, lessonSubject) : '');
  try { Voice?.setSubject?.(subject); } catch { /* 音色失败仍朗读 */ }
  const finish = () => {
    if (activeSpeech.token !== token) return;
    activeSpeech = { key: '', token: 0 };
    clearSpeakingUI();
  };
  if (typeof speakText === 'function') {
    const result = speakText(line, { subject, voice: voice || undefined, onDone: finish });
    if (result && typeof result.finally === 'function') result.finally(finish);
    return true;
  }
  finish();
  return false;
}

function speakLessonKey(key, opts) {
  const options = opts || {};
  const text = speechTextForKey(key);
  if (!text) return false;
  const host = options.host || document.querySelector(`[data-speech-key="${key}"]`) || document.querySelector(`[data-speech-item="${key}"]`) || document.querySelector(`[data-speech-play="${key}"]`)?.closest('[data-speech-key], .content-card, .mnemonic, .challenge-card, .grammar-card, .idiom-card, .step');
  return speakGuide(text, { ...options, key, host });
}

function maybeAutoGuide(result) {
  if (!result) return;
  const input = result.input || $('#topic-input')?.value || '';
  const lessonKey = `${result.subject || ''}::${input}`;
  if (!lessonKey || guidedSpeechKey === lessonKey) return;
  const previewHost = document.querySelector('[data-speech-key="intro"]');
  const moduleHost = document.querySelector('[data-speech-key="module-1"]') || document.querySelector('[data-speech-key="math-method"]');
  const isPreview = Boolean(result.partial) || state.lessonView === 'preview';
  const text = isPreview || !moduleHost ? speechForIntro(result) : firstModuleSpeech(result);
  if (!text) return;
  guidedSpeechKey = lessonKey;
  if (isPreview) spokenIntroText = text;
  window.setTimeout(() => {
    if (guidedSpeechKey !== lessonKey) return;
    const host = (isPreview && previewHost) || moduleHost || previewHost;
    const key = (host && host.dataset.speechKey) || (isPreview ? 'intro' : 'module-1');
    speakGuide(text, { key, host, subject: result.subject });
  }, 360);
}

function resetSpeechGuide() {
  guidedSpeechKey = '';
  spokenIntroText = '';
  stopLessonSpeech(true);
}

function prepareVoiceForGuide() {
  try { window.ZhidaoVoice?.prepare?.(); } catch { /* 预热失败稍后仍可点读 */ }
  try { window.ZHIDAO_FEEDBACK?.unlock?.(); } catch { /* 反馈音频不是朗读的前提 */ }
}

window.speakLessonKey = speakLessonKey;
window.speakGuide = speakGuide;
window.resetSpeechGuide = resetSpeechGuide;


/* ---------------- API 地址自适应 ----------------
 * 页面可能由预览面板/代理或其它本地端口提供，此时相对路径 /api/* 会打到
 * 不提供接口的服务器并返回 404。启动时探测真实服务地址，之后所有请求复用。 */
let apiBase = '';
let apiBasePromise = null;

function apiCandidates() {
  const list = [];
  // 前后端分离部署时，可在 index.html 注入 window.ZHIDAO_API_BASE 指向 API 域名。
  const configured = String(window.ZHIDAO_API_BASE || '').trim().replace(/\/$/, '');
  if (configured) list.push(configured);
  list.push('');                                  // 同源（由知岛服务直接打开页面时的首选）
  // WorkBuddy / 本机实际监听 3100，.env 默认是 3000；预览面板在别的端口时要两边都试。
  const ports = ['3100', '3000'];
  if (location.protocol === 'http:' || location.protocol === 'https:') {
    const host = location.hostname;
    for (const port of ports) {
      if (String(location.port) !== port) list.push(`${location.protocol}//${host}:${port}`);
    }
  }
  for (const port of ports) {
    list.push(`http://127.0.0.1:${port}`, `http://localhost:${port}`);
  }
  return [...new Set(list)];
}
async function probeHealth(base) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(`${base}/api/health`, { cache: 'no-store', signal: controller.signal });
    const health = await response.json().catch(() => null);
    // 用本服务特有字段校验，避免把代理返回的其它 JSON 误当成健康响应。
    return response.ok && health?.ok === true && typeof health.cacheVersion === 'number' && health.jevProvider === 'liquid' ? health : null;
  } catch { return null; }
  finally { clearTimeout(timer); }
}
function detectApiBase() {
  if (apiBasePromise) return apiBasePromise;
  apiBasePromise = (async () => {
    for (const base of apiCandidates()) {
      const health = await probeHealth(base);
      if (health) { apiBase = base; return health; }
    }
    apiBase = String(window.ZHIDAO_API_BASE || '').trim().replace(/\/$/, '');
    return null;
  })();
  return apiBasePromise;
}
async function apiFetch(path, options = {}) {
  await detectApiBase();
  try {
    return await fetch(`${apiBase}${path}`, options);
  } catch (error) {
    if (options.signal?.aborted) throw error;
    // 服务重启或端口变化：重新探测一次后再试。
    apiBasePromise = null;
    await detectApiBase();
    return fetch(`${apiBase}${path}`, options);
  }
}
function apiErrorMessage(status, prefix = '模型服务') {
  if (status === 404) return '接口地址不可达，请检查 config.js 的 ZHIDAO_API_BASE 与后端路由';
  if (status === 405) return '接口请求方式不受支持，请检查前端 API 地址与反向代理配置';
  return `${prefix}返回 ${status}`;
}

/* ---------------- 浏览器侧缓存（L0）----------------
 * 服务端已有「内存 + 磁盘」两层缓存；浏览器再存一份最近结果，
 * 重复查询连网络请求都不发，直接渲染。版本随服务端 cacheVersion 失效。 */
const TUTOR_CACHE_KEY = 'zhidao-tutor-cache';
const TUTOR_CACHE_VERSION_KEY = 'zhidao-cache-version';
const TUTOR_CACHE_TTL = 7 * 86400000;
const TUTOR_CACHE_MAX = 30;
const MODEL_PROVIDER_KEY = 'zhidao-model-provider';
const MODEL_STRICT_KEY = 'zhidao-model-strict';

function normalizeTopic(value) {
  return String(value ?? '').normalize('NFKC').replace(/\s+/g, '').toLowerCase();
}
/**
 * 浏览器缓存键必须带年级画像。
 * 服务端已经按年级分开缓存了，浏览器这一层如果不区分，
 * 切换孩子后会直接命中上一个年级的讲解，年级适配就失效了。
 */
function tutorCacheKey(value) {
  return `${window.LEARNER?.stage?.() || 'generic'}:${normalizeTopic(value)}`;
}
function readTutorCache() {
  const data = readStorage(TUTOR_CACHE_KEY, {});
  return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
}
function getTutorCached(value) {
  if (state.cacheVersion === null) return null;
  const store = readTutorCache();
  const key = tutorCacheKey(value);
  const entry = store[key];
  if (!entry || !entry.result || entry.cacheVersion !== state.cacheVersion) return null;
  // 双保险：即使版本串未及时更新，也不允许把 A 模型的结果当成 B 模型展示。
  if (entry.provider !== currentProvider() || entry.strict !== state.strictModel) return null;
  if (Date.now() - Number(entry.savedAt) > TUTOR_CACHE_TTL) {
    delete store[key];
    writeStorage(TUTOR_CACHE_KEY, store);
    return null;
  }
  const result = entry.result;
  return { ...result, cached: true, cache: { ...(result.cache || {}), hit: true, source: 'browser' } };
}
function putTutorCached(value, result) {
  const store = readTutorCache();
  store[tutorCacheKey(value)] = {
    savedAt: Date.now(),
    // 版本含服务端缓存版本 + 生成模型指纹 + 用户选择：切换 provider 后浏览器缓存自动失效。
    cacheVersion: state.cacheVersion ?? result.cache?.version ?? 0,
    provider: currentProvider(), strict: state.strictModel,
    result
  };
  const entries = Object.entries(store)
    .sort((a, b) => Number(b[1].savedAt) - Number(a[1].savedAt))
    .slice(0, TUTOR_CACHE_MAX);
  writeStorage(TUTOR_CACHE_KEY, Object.fromEntries(entries));
}
function syncCacheVersion() {
  // 复用地址探测得到的健康响应，避免重复请求；探测失败时沿用上次已知版本。
  return detectApiBase().then(health => {
    if (!health) return;
    const version = `${Number(health.cacheVersion) || 0}|${health.generation?.cacheKey || 'unknown'}|${currentProvider()}|${state.strictModel ? 'strict' : 'fallback'}`;
    const previous = state.cacheVersion;
    state.cacheVersion = version;
    writeStorage(TUTOR_CACHE_VERSION_KEY, version);
    // 服务端提示词/模型版本变化时，丢弃所有旧版本地缓存。
    if (previous !== null && previous !== version) writeStorage(TUTOR_CACHE_KEY, {});
  }).catch(() => {});
}

/* ---------------- 用户可选生成模型 ----------------
 * 服务端默认 liquid；用户切换后写入 localStorage，请求带上 provider 与 allowFallback。
 * 服务端按白名单解析、按模型隔离缓存；「仅用所选模型」可关闭自动回退便于自测。 */
function currentProvider() {
  return state.modelProvider || state.serverDefaultProvider || 'liquid';
}
function currentModelLabel() {
  return currentProvider() === 'liquid' ? 'Liquid LFM3' : 'Qwen';
}
function renderModelPicker() {
  const active = currentProvider();
  $$('#model-switch [data-model-provider]').forEach(button => {
    const id = button.dataset.modelProvider;
    button.classList.toggle('active', id === active);
    const option = (state.modelOptions || []).find(item => item.provider === id);
    if (!option) return;
    const small = button.querySelector('small');
    if (small) small.textContent = option.model;
    button.dataset.unconfigured = option.configured ? 'false' : 'true';
    button.title = option.configured ? `${option.label} · ${option.model}` : `${option.label} 暂不可用`;
  });
  const toggle = $('#strict-model-toggle');
  if (toggle) toggle.checked = state.strictModel === true;
  const metrics = $('#model-metrics');
  if (metrics) {
    metrics.textContent = state.lastMetrics
      || `默认 ${currentModelLabel()} · 可随时切换${state.strictModel ? ' · 仅用所选模型' : ''}`;
  }
}
function formatGenerationMetrics(result) {
  const g = result?.generation;
  if (!g) return result?.cached ? '已缓存 · 秒开' : '';
  const secs = (Number(g.latencyMs) / 1000).toFixed(1);
  const tokens = Number(g.usage?.totalTokens) || 0;
  const cost = typeof g.costUSD === 'number' ? `$${g.costUSD.toFixed(6)}` : '—';
  const healed = g.repairs?.length ? ` · 已自动修复 ${g.repairs.length} 次` : '';
  const fallback = g.usedFallback ? ' · 已切换备用模型' : '';
  const cached = result.cached ? ' · 缓存命中' : '';
  // 指标条也分别给出两段响应时间，和底部进度面板一致。
  const t = result?.timings;
  const split = Number.isFinite(Number(t?.route?.latencyMs)) && Number.isFinite(Number(t?.lesson?.latencyMs))
    ? ` · 判断 ${formatDuration(t.route.latencyMs)} / 讲解 ${formatDuration(t.lesson.latencyMs)}` : '';
  return `本次：${g.provider === 'liquid' ? 'Liquid' : 'Qwen'} ${g.model} · ${secs}s · ${tokens} tok · ${cost}${split}${healed}${fallback}${cached}`;
}
function initModelPicker() {
  const switcher = $('#model-switch');
  if (!switcher) return;
  switcher.addEventListener('click', event => {
    const button = event.target.closest('[data-model-provider]');
    if (!button) return;
    const provider = button.dataset.modelProvider;
    if (provider === currentProvider()) return;
    state.modelProvider = provider;
    writeStorage(MODEL_PROVIDER_KEY, provider);
    state.lastMetrics = '';
    renderModelPicker();
    syncCacheVersion();
    showToast(`已切换到 ${provider === 'liquid' ? 'Liquid LFM3' : 'Qwen'}`);
  });
  const toggle = $('#strict-model-toggle');
  if (toggle) toggle.addEventListener('change', () => {
    state.strictModel = toggle.checked;
    writeStorage(MODEL_STRICT_KEY, state.strictModel);
    state.lastMetrics = '';
    renderModelPicker();
    syncCacheVersion();
    showToast(state.strictModel ? '已开启「仅用所选模型」' : '已恢复自动切换备用模型');
  });
  renderModelPicker();
  detectApiBase().then(health => {
    const g = health?.generation;
    if (!g) return;
    state.serverDefaultProvider = g.defaultProvider || g.provider;
    state.modelOptions = Array.isArray(g.available) ? g.available : null;
    renderModelPicker();
    syncCacheVersion(); // 服务端默认模型变化时校正本地缓存版本
  }).catch(() => {});
}

/* ---------------- 两阶段生成进度 ----------------
 * 学科决策（Liquid d1.1）与讲解分析（生成模型）严格串行，各自独立计时。
 * 服务端通过阶段事件流实时推送各阶段真实耗时，响应后用 timings 回填；
 * 缓存命中显示首次生成的分段耗时与本次响应速度。 */
function formatDuration(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value < 0) return '—';
  if (value === 0) return '<1ms';
  return value < 1000 ? `${Math.round(value)}ms` : `${(value / 1000).toFixed(1)}s`;
}
/* 当前活动阶段的独立计时：决策未结束只算阶段 1；决策结束后只算阶段 2。
 * 服务端同样是串行执行，阶段 2 不会与阶段 1 共用同一个总秒表。 */
function activeStageElapsed(p) {
  if (!p || p.phase !== 'loading') return { stage: null, ms: 0 };
  const now = Date.now();
  if (p.routeMs == null) return { stage: 'route', ms: Math.max(0, now - (p.routeStartedAt || now)) };
  if (p.lessonMs == null) return { stage: 'lesson', ms: p.lessonStartedAt ? Math.max(0, now - p.lessonStartedAt) : 0 };
  return { stage: null, ms: 0 };
}
function pipelineStage(key, status, statusText, timeText, modelText, width) {
  const stage = $(`.pipeline-stage[data-stage="${key}"]`);
  if (stage) {
    stage.dataset.status = status;
    const statusEl = $(`#pipeline-${key}-status`);
    const timeEl = $(`#pipeline-${key}-time`);
    const modelEl = $(`#pipeline-${key}-model`);
    const bar = $(`#pipeline-${key}-bar`);
    if (statusEl) statusEl.textContent = statusText;
    if (timeEl) timeEl.textContent = timeText;
    if (modelEl && modelText) modelEl.textContent = modelText;
    if (bar) bar.style.width = width;
  }
  // 加载卡片里的两阶段步骤条与底部面板保持同步。
  const step = $(`[data-loading-stage="${key}"]`);
  if (step) {
    step.classList.toggle('active', status === 'running' || status === 'done');
    const small = step.querySelector('small');
    if (small) small.textContent = status === 'running'
      ? formatDuration(activeStageElapsed(state.pipeline).ms)
      : status === 'done' ? timeText : status === 'error' ? '中断' : '等待';
  }
}
function renderPipeline() {
  const p = state.pipeline;
  if (!p || !$('#pipeline-panel')) return;
  const totalLabel = $('#pipeline-total-label');
  const totalTime = $('#pipeline-total-time');
  const note = $('#pipeline-note');
  if (p.phase === 'idle') {
    pipelineStage('route', 'idle', '等待开始', '—', '判断学科类型', '0%');
    pipelineStage('lesson', 'idle', '等待开始', '—', '生成讲解内容', '0%');
    if (totalLabel) totalLabel.textContent = '尚未生成';
    if (totalTime) totalTime.textContent = '—';
    if (note) note.textContent = '先判断学科，再生成讲解，两步分别计时。';
    return;
  }
  if (p.phase === 'loading') {
    const now = Date.now();
    const routeDone = p.routeMs != null;
    const routeElapsed = routeDone ? Number(p.routeMs) : Math.max(0, now - (p.routeStartedAt || now));
    const lessonDone = p.lessonMs != null;
    const lessonElapsed = lessonDone ? Number(p.lessonMs)
      : p.lessonStartedAt ? Math.max(0, now - p.lessonStartedAt) : 0;
    const routeName = p.routeSource === 'chat-fallback' ? '分类回退' : `Liquid ${p.routeModel || 'd1.1'}`;
    // 阶段 1：收到服务端事件前按约 1s 参考渐进（不会假 100%），收到后固定真实耗时并置满。
    const routeWidth = routeDone ? '100%' : `${Math.min(92, 8 + routeElapsed / 1000 * 84)}%`;
    pipelineStage('route', routeDone ? 'done' : 'running',
      routeDone ? `完成 · ${routeName}` : '判断学科中',
      routeDone ? formatDuration(p.routeMs) : `计时 ${formatDuration(routeElapsed)}`,
      routeDone ? `${routeName} · 判断学科类型` : '判断学科类型',
      routeWidth);
    // 阶段 2：只有阶段 1 结束才启动计时；此前恒为「等待 / — / 0%」，绝不与阶段 1 共用计时。
    const lessonWidth = lessonDone ? '100%'
      : routeDone ? `${Math.min(92, 6 + lessonElapsed / 20000 * 86)}%` : '0%';
    pipelineStage('lesson', lessonDone ? 'done' : routeDone ? 'running' : 'waiting',
      lessonDone ? `完成 · ${p.lessonModel || currentModelLabel()}`
        : routeDone ? `生成中 · ${currentModelLabel()}` : '等待判断结果',
      lessonDone ? formatDuration(p.lessonMs)
        : routeDone ? `计时 ${formatDuration(lessonElapsed)}` : '—',
      `${currentModelLabel()} · 生成讲解内容`, lessonWidth);
    if (totalLabel) totalLabel.textContent = routeDone ? '两步累计' : '第 1 步 · 判断学科';
    if (totalTime) totalTime.textContent = formatDuration(routeElapsed + lessonElapsed);
    if (note) note.textContent = routeDone
      ? '学科已判断完成，正在生成讲解。'
      : '正在判断学科，判断完成后才开始计时讲解。';
    return;
  }
  if (p.phase === 'error') {
    const routeDone = p.routeMs != null;
    pipelineStage('route', routeDone ? 'done' : 'error',
      routeDone ? '完成 · 决策已返回' : '未完成', routeDone ? formatDuration(p.routeMs) : '—', null,
      routeDone ? '100%' : '0%');
    pipelineStage('lesson', 'error', '未完成', p.lessonMs != null ? formatDuration(p.lessonMs) : '—', null, '0%');
    if (totalLabel) totalLabel.textContent = '生成失败';
    if (totalTime) totalTime.textContent = formatDuration(p.wallMs);
    if (note) note.textContent = `本次未完成：${p.error || '模型服务暂不可用'}；已等待 ${formatDuration(p.wallMs)}${routeDone ? `，其中学科判断 ${formatDuration(p.routeMs)}` : ''}。`;
    return;
  }
  const t = p.timings || {};
  const cached = p.phase === 'cached';
  const routeMs = Number(t.route?.latencyMs);
  const lessonMs = Number(t.lesson?.latencyMs);
  const hasSplit = Number.isFinite(routeMs) && Number.isFinite(lessonMs);
  const routeSource = t.route?.source || (t.route?.fallback ? 'chat-fallback' : 'd1');
  const routeRaw = t.route?.model && t.route.model !== 'mock' ? t.route.model : 'd1.1';
  const routeModel = routeSource === 'chat-fallback' ? `分类回退 ${routeRaw}` : `Liquid ${routeRaw}`;
  const lessonModel = t.lesson?.model && t.lesson.model !== 'mock' ? t.lesson.model : currentModelLabel();
  pipelineStage('route', hasSplit ? 'done' : 'error',
    hasSplit ? (t.route?.fallback ? '完成 · 分类回退' : `完成 · ${routeModel}`) : '暂无记录',
    hasSplit ? formatDuration(routeMs) : '—',
    `${routeModel} · 判断学科类型`,
    hasSplit ? '100%' : '0%');
  const extras = [t.lesson?.usedFallback ? '已切换备用模型' : ''].filter(Boolean).join(' · ');
  pipelineStage('lesson', hasSplit ? 'done' : 'error',
    hasSplit ? `完成 · ${lessonModel}${extras ? ` · ${extras}` : ''}` : '暂无记录',
    hasSplit ? formatDuration(lessonMs) : '—',
    `${lessonModel} · 生成讲解内容`,
    hasSplit ? '100%' : '0%');
  if (totalLabel) totalLabel.textContent = cached ? '缓存命中 · 本次响应' : '首次生成 · 总耗时';
  const totalMs = t.totalMs != null && Number.isFinite(Number(t.totalMs)) ? Number(t.totalMs) : routeMs + lessonMs;
  if (totalTime) totalTime.textContent = cached ? formatDuration(p.wallMs)
    : hasSplit ? formatDuration(totalMs) : '—';
  if (note) note.textContent = cached
    ? `已缓存，本次仅 ${formatDuration(p.wallMs)}；两段时间为首次生成的耗时。`
    : hasSplit
      ? `学科判断 ${formatDuration(routeMs)} + 讲解生成 ${formatDuration(lessonMs)} = 合计 ${formatDuration(routeMs + lessonMs)}。`
      : '这条缓存没有分段耗时，点「重新生成」即可看到两步各自用时。';
}
function stopPipelineTimer() {
  if (state.pipelineTimer) { clearInterval(state.pipelineTimer); state.pipelineTimer = null; }
}
function startPipeline() {
  stopPipelineTimer();
  state.pipeline = {
    phase: 'loading', routeStartedAt: Date.now(), lessonStartedAt: null,
    routeMs: null, lessonMs: null, elapsedMs: 0, wallMs: 0,
    routeModel: 'd1.1', routeSource: 'd1', routeFallback: false,
    routeD1Ms: null, routeFallbackMs: null,
    lessonModel: null, lessonRepairs: 0, lessonUsedFallback: false,
    timings: null, error: '', cacheSource: ''
  };
  renderPipeline();
  state.pipelineTimer = setInterval(() => {
    if (!state.pipeline || state.pipeline.phase !== 'loading') { stopPipelineTimer(); return; }
    state.pipeline.elapsedMs = activeStageElapsed(state.pipeline).ms;
    renderPipeline();
  }, 100);
}
/** 服务端 SSE 阶段事件：决策一结束就固定其真实耗时，讲解阶段才开始自己的计时。 */
const SUBJECT_NAMES = { chinese: '语文', english: '英语', math: '数学' };

/** 搜索栏识别位：输入预判、Jev 判断中、判断完成后的实时反馈都走这里。 */
function setDetectChip({ mode = 'idle', subject = '', confidence = 0, extra = '' } = {}) {
  const chip = $('#detect-chip');
  if (!chip) return;
  const label = $('span', chip);
  const name = SUBJECT_NAMES[subject] || '';
  const raw = Number(confidence);
  const conf = raw > 0 && raw <= 1 ? Math.round(raw * 100) : (raw > 1 ? Math.round(raw) : 0);
  const confText = conf ? ` · ${conf}%` : '';
  if (mode === 'pending') {
    chip.className = 'detect-chip is-pending';
    if (label) label.textContent = '正在判断学科…';
    return;
  }
  if (mode === 'generating' || mode === 'confirmed') {
    const generating = mode === 'generating';
    chip.className = `detect-chip ${subject || ''} is-confirmed${generating ? ' is-generating' : ''}`;
    if (label) {
      if (name && generating) label.textContent = `已识别为${name}${confText}`;
      else if (name) label.textContent = `识别为${name}${confText}${extra}`;
      else if (generating) label.textContent = '学科已确定，正在生成讲解';
      else label.textContent = extra || '已识别学科';
    }
    void chip.offsetWidth;
    chip.classList.add('is-pop');
    if (subject) {
      try { window.ZhidaoVoice?.setSubject?.(subject); } catch { /* 语音异常不影响识别反馈 */ }
    }
    return;
  }
  if (typeof updateDetection === 'function' && !state.detectLocked) updateDetection();
}

function updateLoadingAfterRoute(evt) {
  const subject = evt && evt.subject;
  const name = SUBJECT_NAMES[subject] || '';
  const loading = document.querySelector('.ai-loading');
  if (loading) {
    loading.classList.remove('is-chinese', 'is-english', 'is-math');
    if (subject) loading.classList.add(`is-${subject}`);
    loading.classList.add('is-routed');
    const h3 = loading.querySelector('h3');
    const p = loading.querySelector('p');
    if (h3) h3.textContent = name ? `正在生成${name}讲解` : '正在生成讲解';
    if (p) {
      p.textContent = name
        ? `已判断这是${name}，正在准备第一部分预览，完成后可先浏览再展开完整讲解。`
        : '学科已确定，正在组织讲解内容，完成后会先给出预览卡片。';
    }
  }
  const heading = $('#lesson-heading');
  if (heading) heading.textContent = name ? `正在生成${name}互动讲解` : '正在为你生成互动讲解';
}


function yieldToMain() {
  return new Promise(resolve => {
    const finish = () => resolve();
    if (typeof scheduler !== 'undefined' && typeof scheduler.yield === 'function') {
      scheduler.yield().then(finish);
      return;
    }
    setTimeout(finish, 0);
  });
}

function patchPreviewBanner(data) {
  const banner = document.querySelector('.topic-banner');
  if (!banner || !data) return false;
  const title = banner.querySelector('.topic-title-row h3');
  const sub = banner.querySelector('.topic-title-row span');
  const p = banner.querySelector('.topic-info > p');
  if (title && data.bannerTitle && title.textContent !== data.bannerTitle) title.textContent = data.bannerTitle;
  if (sub && data.subtitle && sub.textContent !== data.subtitle) sub.textContent = data.subtitle;
  if (p && data.description && p.textContent !== data.description) p.textContent = data.description;
  return true;
}

function applyEarlyLessonPreview(payload) {
  if (!payload || !payload.data || !payload.subject) return;
  // 完整课已到才忽略迟到的预览。上一课的完整结果不能挡住这一课的提前出卡：
  // 开始新生成时 setAILoading 已清掉 fullLessonReady 和 dynamic。
  if (state.fullLessonReady) {
    console.log('[preview-flow] 完整课已到，忽略迟到的预览', payload.subject);
    return;
  }
  const gate = window.ZHIDAO_PREVIEW_GATE;
  if (gate && typeof gate.previewReady === 'function' && !gate.previewReady(payload)) return;
  if (state.earlyPreviewShown && state.topic === payload.subject) {
    const prev = (state.dynamic && state.dynamic.data) || {};
    const next = payload.data || {};
    const same = prev.bannerTitle === next.bannerTitle && prev.subtitle === next.subtitle && prev.description === next.description;
    state.dynamic = {
      ...payload,
      partial: true,
      input: payload.input || state.dynamic?.input || $('#topic-input')?.value || '',
      data: { ...prev, ...next }
    };
    if (!same) patchPreviewBanner(next);
    return;
  }
  state.earlyPreviewShown = true;
  state.dynamic = { ...payload, partial: true, input: payload.input || $('#topic-input')?.value || '' };
  state.topic = payload.subject;
  state.lessonView = 'preview';
  state.fullLessonReady = false;
  setDetectChip({
    mode: 'confirmed',
    subject: payload.subject,
    confidence: payload.confidence || state.pipeline?.routeConfidence,
    extra: ' · 第一部分已就绪'
  });
  const heading = $('#lesson-heading');
  if (heading) heading.textContent = '第一部分已就绪，完整讲解仍在生成';
  renderEarlyPreview(state.dynamic);
  const loadingStep = document.querySelector('[data-loading-stage="lesson"] small');
  if (loadingStep) loadingStep.textContent = '第一部分已出，后半段生成中';
  const data = payload.data || {};
  console.log('[preview-flow] 页面已先渲染互动讲解卡', {
    subject: payload.subject,
    latencyMs: payload.latencyMs,
    title: data.bannerTitle || data.title || '',
    description: String(data.description || '').slice(0, 80),
    descLen: String(data.description || '').length
  });
}

function previewCtaHtml(ready) {
  if (ready) {
    return '<span class="lesson-preview-kicker">完整讲解已生成</span><strong>查看完整讲解</strong><small>练习、辨析和追问会渐变展开</small>';
  }
  return '<span class="lesson-preview-kicker">这是讲解的第一部分</span><strong><span class="button-spinner"></span>完整讲解正在生成</strong><small>可以先看概览，其余内容就绪后即可展开</small>';
}

function renderEarlyPreview(result) {
  const cta = `<button type="button" class="lesson-preview-cta is-waiting" id="early-preview-cta" disabled aria-expanded="false">${previewCtaHtml(false)}</button>`;
  const host = $('#lesson-content');
  if (!host) return;
  host.className = 'lesson-reveal-frame';
  host.dataset.view = 'preview';
  // 预览只展示顶部互动讲解，表达素材库等模块等完整课生成后再出现。
  host.innerHTML = renderDynamicBanner() + cta;
  if (typeof bindSpeech === 'function') bindSpeech();
  maybeAutoGuide(result);
}


/** 完整课到达时，用完整标题和导语替换预览卡；若朗读的是半截导语，立刻改读全文。 */
function refreshPreviewIntro(result) {
  if (!result || !result.data) return;
  const data = result.data;
  const banner = document.querySelector('.topic-banner');
  if (banner) {
    const title = banner.querySelector('.topic-title-row h3');
    const sub = banner.querySelector('.topic-title-row span');
    const p = banner.querySelector('.topic-info > p');
    if (title && data.bannerTitle) title.textContent = data.bannerTitle;
    if (sub && data.subtitle) sub.textContent = data.subtitle;
    if (p && data.description) p.textContent = data.description;
  }
  if (state.dynamic) {
    const prev = state.dynamic.data || {};
    state.dynamic = {
      ...state.dynamic,
      data: {
        ...prev,
        title: data.title || prev.title,
        bannerTitle: data.bannerTitle || prev.bannerTitle,
        subtitle: data.subtitle || prev.subtitle,
        description: data.description || prev.description
      }
    };
  }
  const next = speechForIntro(result);
  if (!next || next === spokenIntroText) return;
  const speakingIntro = activeSpeech.key === 'intro';
  if (!speakingIntro && !spokenIntroText) {
    spokenIntroText = next;
    return;
  }
  spokenIntroText = next;
  stopLessonSpeech(true);
  const host = document.querySelector('[data-speech-key="intro"]');
  speakGuide(next, { key: 'intro', host, subject: result.subject });
}

function markFullLessonReady(result) {
  console.log('[preview-flow] 完整课到达', {
    subject: result && result.subject,
    earlyPreviewShown: state.earlyPreviewShown,
    title: result && result.data && (result.data.bannerTitle || result.data.title)
  });
  state.pendingFullLesson = result;
  state.fullLessonReady = true;
  state.earlyPreviewShown = true;
  refreshPreviewIntro(result);
  const cta = document.getElementById('early-preview-cta') || document.querySelector('.lesson-preview-cta');
  if (!cta || !document.querySelector('.lesson-reveal-frame[data-view="preview"]')) {
    renderDynamicLesson(result);
    return;
  }
  cta.disabled = false;
  cta.classList.remove('is-waiting');
  cta.classList.add('is-ready');
  cta.innerHTML = previewCtaHtml(true);
  cta.setAttribute('aria-expanded', 'false');
  const heading = $('#lesson-heading');
  if (heading) heading.textContent = '完整讲解已生成，可以展开';
  const open = () => {
    const frame = document.querySelector('.lesson-reveal-frame');
    if (frame) frame.classList.add('is-fading');
    window.setTimeout(() => {
      renderDynamicLesson(result, null, true, { view: 'full' });
      const next = document.getElementById('lesson-content');
      if (next) {
        next.classList.add('lesson-detail-enter');
        window.requestAnimationFrame(() => next.classList.add('is-in'));
      }
    }, 180);
  };
  cta.addEventListener('click', open);
}

function applyLessonPreviewMode() {
  const host = document.getElementById('lesson-content');
  if (!host || host.querySelector('.lesson-reveal-more')) return;
  const body = host.querySelector('.lesson-body');
  if (!body) return;
  const cutAfter = body.querySelector('.math-content') || body.querySelector('.content-card');
  if (!cutAfter) return;
  const restInBody = [];
  let node = cutAfter.nextElementSibling;
  while (node) {
    const next = node.nextElementSibling;
    restInBody.push(node);
    node = next;
  }
  const restAfter = [];
  node = body.nextElementSibling;
  while (node) {
    const next = node.nextElementSibling;
    restAfter.push(node);
    node = next;
  }
  if (!restInBody.length && !restAfter.length) return;

  const more = document.createElement('div');
  more.className = 'lesson-reveal-more';
  const inner = document.createElement('div');
  inner.className = 'lesson-reveal-more-inner';
  restInBody.forEach(el => inner.appendChild(el));
  restAfter.forEach(el => inner.appendChild(el));
  more.appendChild(inner);

  const cta = document.createElement('button');
  cta.type = 'button';
  cta.className = 'lesson-preview-cta';
  cta.setAttribute('aria-expanded', 'false');
  cta.innerHTML = '<span class="lesson-preview-kicker">这是讲解的第一部分</span><strong>查看完整讲解</strong><small>练习、辨析和追问会在展开后出现</small>';
  cta.addEventListener('click', expandLessonDetail);

  body.appendChild(cta);
  body.appendChild(more);
  host.classList.add('lesson-reveal-frame');
  const view = state.lessonView === 'full' ? 'full' : 'preview';
  host.dataset.view = view;
  if (view === 'full') {
    cta.hidden = true;
    cta.setAttribute('aria-expanded', 'true');
  }
}

function expandLessonDetail() {
  state.lessonView = 'full';
  const host = document.getElementById('lesson-content');
  if (!host) return;
  host.dataset.view = 'full';
  const cta = host.querySelector('.lesson-preview-cta');
  if (cta) cta.setAttribute('aria-expanded', 'true');
}

function applyStageEvent(evt) {
  const p = state.pipeline;
  if (!p || p.phase !== 'loading' || !evt) return;
  if (evt.stage === 'route' && evt.status === 'done') {
    p.routeMs = Number(evt.latencyMs);
    p.routeModel = evt.model || 'd1.1';
    p.routeSource = evt.source || 'd1';
    p.routeFallback = Boolean(evt.fallback);
    p.routeD1Ms = Number.isFinite(Number(evt.d1Ms)) ? Number(evt.d1Ms) : null;
    p.routeFallbackMs = Number.isFinite(Number(evt.fallbackMs)) ? Number(evt.fallbackMs) : null;
    p.lessonStartedAt = Date.now();
    p.routeSubject = evt.subject || p.routeSubject || '';
    p.routeConfidence = evt.confidence;
    setDetectChip({ mode: 'generating', subject: evt.subject, confidence: evt.confidence });
    updateLoadingAfterRoute(evt);
  } else if (evt.stage === 'lesson' && evt.status === 'done') {
    p.lessonMs = Number(evt.latencyMs);
    p.lessonModel = evt.model || currentModelLabel();
    p.lessonRepairs = Number(evt.repairs) || 0;
    p.lessonUsedFallback = Boolean(evt.usedFallback);
  } else if (evt.stage === 'cached') {
    p.timings = evt.timings || null;
    const t = evt.timings || {};
    if (Number.isFinite(Number(t.route?.latencyMs))) p.routeMs = Number(t.route.latencyMs);
    if (Number.isFinite(Number(t.lesson?.latencyMs))) p.lessonMs = Number(t.lesson.latencyMs);
    p.lessonStartedAt = p.lessonStartedAt || Date.now();
    p.routeSubject = evt.subject || p.routeSubject || '';
    p.routeConfidence = evt.confidence;
    if (evt.subject) setDetectChip({ mode: 'confirmed', subject: evt.subject, confidence: evt.confidence, extra: ' · 已缓存' });
  }
  renderPipeline();
}
/** 请求带上知识卡片墙里该知识点的掌握度：服务端读不到 localStorage，
 *  但 P3 关卡的触发条件要用它（掌握度 >= 80 不再弹关卡）。 */
function currentMasteryFor(point) {
  try {
    const board = window.KNOWLEDGE?.board;
    const list = Array.isArray(board) ? board
      : Array.isArray(board?.cards) ? board.cards
        : Array.isArray(board?.items) ? board.items : [];
    const hit = list.find(card => card && (card.point === point || card.title === point));
    const value = Number(hit?.mastery ?? hit?.score ?? hit?.masteryScore ?? -1);
    return Number.isFinite(value) ? value : -1;
  } catch { return -1; }
}

/** 渐进预览：a2ui:chunk 一到就 feed，让组件区在课程生成期间一块块长出来。
 *  预览层挂在 #lesson-content 内，result 到达后立刻销毁，不进入最终 DOM。 */
function createStreamPreview() {
  const host = document.getElementById('lesson-content');
  const api = window.ZHIDAO_A2UI;
  const catalog = window.ZHIDAO_A2UI_CATALOG;
  if (!host || !api?.createSurface || !catalog) return null;
  const box = document.createElement('section');
  box.className = 'a2ui-bridge a2ui-stream-preview';
  box.id = 'a2ui-stream-preview';
  box.dataset.stage = 'preview';
  const inner = document.createElement('div');
  inner.className = 'a2ui-bridge-surface';
  box.appendChild(inner);
  host.appendChild(box);
  // 预览用「全实现」能力：服务端消息流可能经过能力收窄，不该被预览侧的
  // 阶段准入误判为非法组件（正式 surface 仍由桥接层按协商后的能力创建）。
  const caps = {
    ...catalog.rendererCapabilities(window.LEARNER?.grade?.() || ''),
    components: catalog.implementationCapabilities().implemented
  };
  const surface = api.createSurface(inner, { capabilities: caps });
  window.ZHIDAO_A2UI_STREAM_PREVIEW = surface;
  return { box, surface };
}

function dropStreamPreview(preview) {
  if (!preview) return;
  try { preview.surface.destroy(); } catch { /* 容器已被重绘 */ }
  try { preview.box.remove(); } catch { /* 同上 */ }
  if (window.ZHIDAO_A2UI_STREAM_PREVIEW === preview.surface) delete window.ZHIDAO_A2UI_STREAM_PREVIEW;
}

/** 解析 text/event-stream：stage 事件实时驱动进度，result 事件为最终课程 JSON。
 *  a2ui:chunk 先攒一批再渲染一次，并在批次之间把主线程交还浏览器。a2ui 仍是权威整包消息流。 */
async function readStageStream(response, onStage, onPreview, isCurrent) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '', result = null, streamError = null, a2ui = null, play = null;
  let preview = null, chunkCount = 0, renderedChunks = 0, a2uiBegin = null, a2uiEnd = null;
  let chunkBatch = [];
  let latestPreview = null;
  let processed = 0;
  const alive = () => typeof isCurrent !== 'function' || isCurrent();
  const flushChunks = () => {
    if (!chunkBatch.length) return;
    const messages = chunkBatch;
    chunkBatch = [];
    if (!preview || !preview.box || !preview.box.isConnected) return;
    try { preview.surface.feed(messages); renderedChunks += messages.length; }
    catch { /* 预览是增强通道，失败绝不影响课程主流程 */ }
  };
  const flushPreview = () => {
    if (!latestPreview || typeof onPreview !== 'function') return;
    const payload = latestPreview;
    latestPreview = null;
    try { onPreview(payload); }
    catch (error) { console.warn('early preview failed', error); }
  };
  for (;;) {
    if (!alive()) { try { reader.cancel(); } catch { /* 流已结束 */ } break; }
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split(/\r?\n\r?\n/);
    buffer = frames.pop() || '';
    for (const frame of frames) {
      let event = 'message', data = '';
      for (const line of frame.split(/\r?\n/)) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      if (!data) continue;
      let payload;
      try { payload = JSON.parse(data); } catch { continue; }
      if (event === 'stage') onStage(payload);
      else if (event === 'a2ui') a2ui = payload;
      else if (event === 'play') play = payload;
      else if (event === 'a2ui:begin') a2uiBegin = payload;
      else if (event === 'a2ui:chunk') {
        chunkCount++;
        try {
          const message = JSON.parse(payload.line);
          if (!preview && !state.earlyPreviewShown) preview = createStreamPreview();
          if (preview && preview.box && preview.box.isConnected) chunkBatch.push(message);
        } catch { /* 预览是增强通道，失败绝不影响课程主流程 */ }
      } else if (event === 'a2ui:end') a2uiEnd = payload;
      else if (event === 'preview') latestPreview = payload;
      else if (event === 'result') result = payload;
      else if (event === 'error') streamError = payload;
      processed += 1;
      if (processed % 6 === 0) {
        flushChunks();
        flushPreview();
        await yieldToMain();
        if (!alive()) { try { reader.cancel(); } catch { /* 流已结束 */ } break; }
      }
    }
  }
  if (alive()) {
    flushChunks();
    flushPreview();
  }
  // 预览层只属于生成阶段：正式渲染前销毁，保证最终 DOM 与视觉基线一致。
  dropStreamPreview(preview);
  window.ZHIDAO_A2UI_STREAM_STATS = {
    chunks: chunkCount, rendered: renderedChunks,
    total: a2uiEnd?.total || chunkCount, surfaceId: a2uiBegin?.surfaceId || '',
    mode: a2uiBegin?.mode || ''
  };
  if (streamError) throw new Error(streamError.error || '生成失败');
  if (!result) throw new Error('生成流未返回课程结果');
  // 消息流单独一条事件到达，这里合回课程结果，让「SSE 消费」与「普通 JSON 响应」
  // 下游看到的数据结构完全一致（result.a2ui.jsonl）。
  if (a2ui) result.a2ui = { ...(result.a2ui || {}), ...a2ui, jsonl: result.a2ui?.jsonl || a2ui.jsonl || '' };
  if (play) result.play = { ...(result.play || {}), ...play, jsonl: result.play?.jsonl || play.jsonl || '' };
  if (chunkCount) {
    result.a2ui = {
      ...(result.a2ui || {}),
      progressive: {
        chunks: chunkCount, rendered: renderedChunks,
        total: a2uiEnd?.total || chunkCount,
        surfaceId: a2uiBegin?.surfaceId || '', chunkSize: a2uiBegin?.chunkSize || 0
      }
    };
  }
  return result;
}
function finishPipeline(result, wallMs = 0, cacheSource = '') {
  stopPipelineTimer();
  const p = state.pipeline || {};
  state.pipeline = {
    ...p,
    phase: result?.cached ? 'cached' : 'done',
    elapsedMs: p.elapsedMs || wallMs,
    wallMs, timings: result?.timings || null,
    cacheSource: cacheSource || result?.cache?.source || ''
  };
  renderPipeline();
}
function failPipeline(error, wallMs = 0) {
  stopPipelineTimer();
  const p = state.pipeline || {};
  state.pipeline = { ...p, phase: 'error', wallMs, elapsedMs: activeStageElapsed({ ...p, phase: 'loading' }).ms || wallMs, error: error?.message || String(error || '') };
  renderPipeline();
}

function resetLessonInteraction() {
  state.quizIndex = 0; state.quizScore = 0; state.quizAnswered = false; state.quizDone = [];
  state.showEnglishTip = false; state.mathLevel = 0; state.mathProgress = [1, 1, 1];
  state.challengeVisible = false; state.aiChineseFilter = 'all'; state.aiChineseSelected = 0;
  state.aiFollowupQuestion = ''; state.aiFollowup = null; state.aiFollowupLoading = false;
}

renderLesson = function(type, shouldScroll = false) {
  state.dynamic = null;
  // 切回内置课程时撤掉 A2UI 组件区，避免旧课程的知识组件留在新页面上。
  window.ZHIDAO_A2UI_BRIDGE?.destroy();
  state.currentId = type;
  resetLessonInteraction();
  const badge = $('#cache-badge'); if (badge) badge.hidden = true;
  const modelBadge = $('#model-badge'); if (modelBadge) modelBadge.hidden = true;
  const timingBadge = $('#timing-badge'); if (timingBadge) timingBadge.hidden = true;
  const refresh = $('#refresh-button'); if (refresh) refresh.hidden = true;
  builtinRenderLesson(type, shouldScroll);
};

function lessonIdFor(result) {
  let hash = 0;
  const text = `${result.subject}:${result.input}`;
  for (let i = 0; i < text.length; i++) hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  return `ai-${result.subject}-${Math.abs(hash)}`;
}

function storeDynamicLesson(result, id) {
  state.dynamicLessons[id] = { ...result, id, createdAt: new Date().toISOString() };
  const entries = Object.entries(state.dynamicLessons).sort((a, b) => String(b[1].createdAt).localeCompare(String(a[1].createdAt)));
  state.dynamicLessons = Object.fromEntries(entries.slice(0, 12));
  writeStorage('zhidao-dynamic-lessons', state.dynamicLessons);
}

function renderDynamicLesson(result, existingId = null, shouldScroll = true, options = {}) {
  if (!result || !['chinese', 'english', 'math'].includes(result.subject) || !result.data) throw new Error('课程响应不完整');
  const id = existingId || lessonIdFor(result);
  state.dynamic = result;
  state.currentId = id;
  state.topic = result.subject;
  resetLessonInteraction();
  state.lessonView = (result.cached || options.view === 'full') ? 'full' : 'preview';
  storeDynamicLesson(result, id);
  $('#topic-input').value = result.input;
  const confidence = Number(result.route?.confidence || 0);
  state.detectLocked = false;
  setDetectChip({
    mode: 'confirmed',
    subject: result.subject,
    confidence,
    extra: result.cached ? ' · 已缓存' : ''
  });
  const badge = $('#cache-badge');
  const modelBadge = $('#model-badge');
  const refresh = $('#refresh-button');
  if (modelBadge) {
    const gp = result.generationProvider;
    const gm = result.generationModel || '';
    const label = gp === 'liquid' ? 'Liquid LFM3' : gp === 'qwen' ? 'Qwen' : '生成模型';
    modelBadge.hidden = !gm || gm === 'mock';
    modelBadge.textContent = gm && gm !== 'mock'
      ? `${label} · ${gm}${result.generation?.usedFallback ? ' · 备用模型' : ''}` : '';
  }
  state.lastMetrics = formatGenerationMetrics(result);
  renderModelPicker();
  const timingBadge = $('#timing-badge');
  if (timingBadge) {
    const t = result.timings;
    const hasSplit = Number.isFinite(Number(t?.route?.latencyMs)) && Number.isFinite(Number(t?.lesson?.latencyMs));
    timingBadge.hidden = !hasSplit;
    if (hasSplit) timingBadge.textContent = `判断 ${formatDuration(t.route.latencyMs)} · 讲解 ${formatDuration(t.lesson.latencyMs)}${result.cached ? ' · 首次生成' : ''}`;
  }
  if (badge) {
    badge.hidden = !result.cached;
    if (result.cached) badge.textContent = '已缓存 · 秒开';
  }
  if (refresh) refresh.hidden = false;
  $('#lesson-heading').textContent = result.data.title;
  if (result.subject === 'chinese') renderDynamicChinese();
  if (result.subject === 'english') renderDynamicEnglish();
  if (result.subject === 'math') renderDynamicMath();
  maybeAutoGuide(result);
  updateFavoriteButton();
  // 每次打开讲解都留一条「接触」证据；权重低，不会把卡片顶成已掌握。
  if (window.KNOWLEDGE?.record) {
    window.KNOWLEDGE.record({ type: 'lesson', subject: result.subject, title: result.input });
  }
  // 按年级画像调整界面形态（CSS 已通过 data-stage 处理，这里负责朗读引导）。
  // 第一部分的自动朗读由 maybeAutoGuide 完成，不再只用一句提示代替。
  if (shouldScroll) $('#lesson-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function rerenderCurrentDynamic() {
  if (state.dynamic?.subject === 'chinese') renderDynamicChinese();
  if (state.dynamic?.subject === 'english') renderDynamicEnglish();
  if (state.dynamic?.subject === 'math') renderDynamicMath();
}

/* 知识展示 ↔ A2UI：三学科渲染末尾都把同一份课程 JSON 交给桥接层。
 * 桥接层只新增 .two-column 之外的组件区，原有讲解卡片与 P0 surface 保持不动；
 * 任何编译失败都只降级为「不显示组件区」，绝不打断课程展示。 */
function mountKnowledgeBridge() {
  const bridge = window.ZHIDAO_A2UI_BRIDGE;
  if (!bridge || !state.dynamic) return;
  const lessonId = state.currentId;
  const input = state.dynamic.input;
  const subject = state.dynamic.subject;
  const run = () => {
    if (state.currentId !== lessonId || !state.dynamic) return;
    if (state.dynamic.input !== input || state.dynamic.subject !== subject) return;
    if (!document.getElementById('lesson-content')) return;
    try {
      // 把「本浏览器渲染得出哪些组件」一并交给桥接层（implemented，与年级无关）：
      // 服务端消息流若含本端画不了的组件，就丢弃并回退本地编译，避免出现空白格子。
      const rendererCaps = window.ZHIDAO_A2UI_CATALOG?.rendererCapabilities?.(window.LEARNER?.grade?.() || '');
      bridge.mount(state.dynamic, {
        quizIndex: Number(state.quizIndex) || 0,
        quizAnswered: state.quizAnswered || state.quizDone.length > 0,
        rendererComponents: rendererCaps?.implemented || rendererCaps?.components || null,
        // 与请求体带上服务端的掌握度同源，保证关卡触发结论不出现两端分歧。
        mastery: currentMasteryFor(state.dynamic?.input || ''),
        // 最终挂载只渲染一次。生成过程中的逐块预览已经在 SSE 里做过。
        stream: false
      });
    } catch (error) {
      console.warn('A2UI 组件区编译失败，已保留原有知识展示', error);
    }
  };
  const schedule = () => {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 450 });
    else setTimeout(run, 16);
  };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(schedule);
  else schedule();
}

function appendFollowup() {
  if (!state.dynamic) return;
  const result = state.aiFollowup;
  $('#lesson-content').insertAdjacentHTML('beforeend', `<section class="content-card ai-followup" id="ai-followup">
    <div class="card-heading"><div class="card-title"><span class="number">问</span><div><h4>继续追问 <small>基于这节课的内容继续提问</small></h4></div></div>${icon('quote')}</div>
    <p>不懂的地方可以直接问，例如“能再举一个例子吗”或“这一步为什么这样变形”。</p>
    <div class="followup-form"><textarea id="followup-input" placeholder="输入你的追问…">${e(state.aiFollowupQuestion)}</textarea><button class="primary-small" id="followup-button" ${state.aiFollowupLoading ? 'disabled' : ''}>${state.aiFollowupLoading ? '<span class="button-spinner"></span>思考中' : `继续追问${icon('arrow')}`}</button></div>
    <div class="followup-answer" id="followup-answer">${result ? (result.error ? `<div class="followup-error">${e(result.error)}</div>` : `<strong>${e(result.answer)}</strong>${result.cached ? '<small class="followup-cache-hint">已缓存 · 秒开</small>' : ''}${(result.points || []).map(point => `<div class="followup-point"><b>${e(point.title)}</b><span>${e(point.text)}</span></div>`).join('')}`) : ''}</div>
    ${result?.suggestions?.length ? `<div class="suggestion-chips">${result.suggestions.map(suggestion => `<button data-followup-suggestion="${e(suggestion)}">${e(suggestion)}</button>`).join('')}</div>` : ''}
  </section>`);
  const input = $('#followup-input');
  input.addEventListener('input', () => { state.aiFollowupQuestion = input.value; });
  input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submitFollowup(); } });
  $('#followup-button').addEventListener('click', submitFollowup);
  $$('[data-followup-suggestion]').forEach(button => button.addEventListener('click', () => {
    state.aiFollowupQuestion = button.dataset.followupSuggestion;
    submitFollowup();
  }));
}

async function submitFollowup() {
  if (!state.dynamic || state.aiFollowupLoading) return;
  const question = state.aiFollowupQuestion.trim();
  if (!question) { showToast('先输入你的追问'); $('#followup-input').focus(); return; }
  state.aiFollowupLoading = true;
  state.aiFollowup = null;
  rerenderCurrentDynamic();
  $('#ai-followup').scrollIntoView({ behavior: 'smooth', block: 'center' });
  if (window.KNOWLEDGE?.record) window.KNOWLEDGE.record({ type: 'asked', detail: question.slice(0, 120) });
  try {
    const response = await apiFetch('/api/followup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject: state.dynamic.subject, input: state.dynamic.input, lesson: state.dynamic.data, question, provider: currentProvider(), allowFallback: !state.strictModel, grade: window.LEARNER?.grade?.() || '' })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || apiErrorMessage(response.status, '追问服务'));
    state.aiFollowup = result;
  } catch (error) {
    state.aiFollowup = { error: error.message };
  } finally {
    state.aiFollowupLoading = false;
    rerenderCurrentDynamic();
  }
}

function renderDynamicBanner() {
  const result = state.dynamic;
  const data = result.data;
  const type = result.subject;
  const gp = result.generationProvider;
  const modelLabel = gp === 'liquid' ? 'Liquid LFM3' : gp === 'qwen' ? 'Qwen' : 'AI';
  const label = `${{ chinese: '语文', english: '英语', math: '数学' }[type]} · ${modelLabel} 互动讲解`;
  let art = '';
  if (type === 'chinese') art = `<span class="art-spark">✦</span><div class="mood-face"></div><span class="mood-tag">AI · 表达素材</span>`;
  if (type === 'english') art = `<div class="english-art">${(data.items || []).slice(0, 3).map(item => `<b>${e(item.word)}</b>`).join('')}</div>`;
  if (type === 'math') art = `<div class="math-art"><span>f(x)</span></div>`;
  return `<div class="topic-banner ${type}" data-speech-key="intro"><div class="topic-info"><span class="topic-label">${label}</span><div class="topic-title-row"><h3>${e(data.bannerTitle)}</h3><span>${e(data.subtitle || 'AI LESSON')}</span></div><p>${e(data.description)}</p></div><div class="topic-art">${art}</div>${speechPlayButton('intro', '朗读互动讲解')}</div>`;
}

function setAILoading(value) {
  const modelLabel = currentModelLabel();
  const button = $('#start-button');
  button.disabled = true;
  button.innerHTML = `<span class="button-spinner"></span>正在讲解`;
  state.detectLocked = true;
  state.earlyPreviewShown = false;
  state.fullLessonReady = false;
  state.pendingFullLesson = null;
  // 清掉上一课完整结果，否则预览会被当成「已有完整课」而丢掉。
  state.dynamic = null;
  if (typeof resetSpeechGuide === 'function') resetSpeechGuide();
  setDetectChip({ mode: 'pending' });
  $('#lesson-heading').textContent = '正在为你生成互动讲解';
  $('#lesson-content').innerHTML = `<div class="ai-loading"><div class="thinking-orbit">${icon('sparkles')}</div><h3>正在为你讲解</h3><p>先判断「${e(value.slice(0, 60))}」属于哪一科，再按对应方式展开讲解。</p><div class="loading-steps"><span class="active" data-loading-stage="route"><i></i>① 判断学科 <small>计时中</small></span><b></b><span data-loading-stage="lesson"><i></i>② 讲解分析 <small>等待</small></span></div><small>页面底部会分别显示两步用时</small></div>`;
}

function clearAILoading() {
  const button = $('#start-button');
  button.disabled = false;
  button.innerHTML = `开始讲解${icon('arrow')}`;
}

async function startLesson(forceRefresh = false) {
  const value = $('#topic-input').value.trim();
  if (!value) { showToast('先输入一个你想弄懂的知识点'); $('#topic-input').focus(); return; }
  // 必须在第一个 await 之前预热：用户手势过期后浏览器会拦截自动播放。
  if (typeof prepareVoiceForGuide === 'function') prepareVoiceForGuide();
  if (typeof resetSpeechGuide === 'function') resetSpeechGuide();
  const fallback = resolveLesson(value);
  if (location.protocol === 'file:') {
    if (fallback && fallback !== 'unknown') { renderLesson(fallback, true); addHistory(fallback); showToast('已为你打开内置课程；启动服务后可生成任意内容'); }
    else showServiceError(value, new Error('直接打开 HTML 无法安全调用模型，请启动本地 Node 服务'));
    return;
  }
  await syncCacheVersion();
  // 浏览器缓存命中：直接渲染，不发请求、不调用模型。
  if (!forceRefresh) {
    const local = getTutorCached(value);
    if (local) {
      if (activeController) activeController.abort();
      activeController = null;
      requestSequence += 1;
      clearAILoading();
      finishPipeline(local, 0, 'browser');
      renderDynamicLesson(local, null, true, { view: 'full' });
      addHistory(local.subject);
      $('#lesson-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
      showToast('已经学过这个知识点，直接打开缓存讲解');
      return;
    }
  }
  if (activeController) activeController.abort();
  const controller = new AbortController();
  activeController = controller;
  const sequence = ++requestSequence;
  setAILoading(value);
  const wallStarted = Date.now();
  startPipeline();
  $('#lesson-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
  try {
    // 渲染器能力协商：浏览器只宣告「我画得出哪些组件」（implemented，与年级无关），
    // 阶段准入由服务端按年级决定；客户端永远无法把一年级撑成「支持公式块」。
    const rendererCaps = window.ZHIDAO_A2UI_CATALOG?.rendererCapabilities?.(window.LEARNER?.grade?.() || '');
    const response = await apiFetch('/api/tutor', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: value, refresh: forceRefresh, provider: currentProvider(),
        allowFallback: !state.strictModel, stageEvents: true,
        // 服务端据此选择讲解深度；显式传空串表示「通用」，不会误用上一个孩子的年级。
        grade: window.LEARNER?.grade?.() || '',
        // P3 关卡触发条件之一：掌握度 >= 80 不再弹关卡。服务端读不到本机卡片墙，
        // 由前端把这一个数值带过去，编译与回退判定因此完全一致。
        mastery: currentMasteryFor(value),
        capabilities: rendererCaps ? {
          components: rendererCaps.implemented || rendererCaps.components,
          maxComponents: rendererCaps.maxComponents,
          textMaxLength: rendererCaps.textMaxLength
        } : undefined
      }), signal: controller.signal
    });
    // 新版服务端返回阶段事件流；旧服务 / 代理仍返回普通 JSON，两种都兼容。
    const isStageStream = (response.headers.get('content-type') || '').includes('text/event-stream');
    let result;
    if (isStageStream) {
      result = await readStageStream(response, applyStageEvent, applyEarlyLessonPreview, () => sequence === requestSequence && !controller.signal.aborted);
    } else {
      result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || apiErrorMessage(response.status));
    }
    putTutorCached(value, result);
    finishPipeline(result, Date.now() - wallStarted);
    if (state.earlyPreviewShown) markFullLessonReady(result);
    else renderDynamicLesson(result);
    addHistory(result.subject);
  } catch (error) {
    if (error.name === 'AbortError') return;
    state.detectLocked = false;
    failPipeline(error, Date.now() - wallStarted);
    if (fallback && fallback !== 'unknown') {
      renderLesson(fallback, true);
      addHistory(fallback);
      showToast('暂时无法生成，先为你打开内置课程');
    } else showServiceError(value, error);
  } finally {
    if (sequence === requestSequence) { clearAILoading(); activeController = null; stopPipelineTimer(); }
  }
}

function showServiceError(value, error) {
  renderLesson(state.topic, false);
  $('#topic-input').value = value;
  updateDetection();
  const message = error?.message || '服务暂时不可用';
  const isAddress = /接口地址不可达|请求方式不被|404|Failed to fetch|NetworkError|Load failed|无法连接/i.test(message);
  const advice = isAddress
    ? '<p>当前页面不是由知岛服务直接提供的（常见于预览面板或代理地址），接口请求落到了别的服务器。请直接打开 <a href="http://127.0.0.1:3100" target="_blank" rel="noopener">http://127.0.0.1:3100</a> 后重试；页面也会自动尝试连接本机服务。</p>'
    : '<p>可以稍后重试；若持续失败，请查看服务端日志确认模型密钥与网络是否正常。</p>';
  openModal(isAddress ? '接口地址没对上' : '暂时无法生成', '提示', `<div class="empty-state"><span class="empty-icon">${icon('sparkles')}</span><h3>暂时无法生成「${e(value.slice(0, 40))}」</h3><p>${e(message)}</p>${advice}</div>`);
}

let chineseSurfaceToken = 0;
function scheduleChineseSurface(data, list) {
  const token = ++chineseSurfaceToken;
  const lessonId = state.currentId;
  const run = () => {
    if (token !== chineseSurfaceToken || state.currentId !== lessonId) return;
    const host = $('#a2ui-surface');
    if (!host || !window.ZHIDAO_A2UI || !window.ZHIDAO_A2UI_COMPILER) return;
    const learnerGrade = window.LEARNER?.grade?.() || '';
    const a2uiCapabilities = window.ZHIDAO_A2UI_CATALOG?.rendererCapabilities?.(learnerGrade);
    let a2uiMessages = null;
    try {
      a2uiMessages = window.ZHIDAO_A2UI_COMPILER.compileLessonToA2UI(data, {
        grade: learnerGrade, subject: 'chinese', capabilities: a2uiCapabilities
      });
    } catch (error) {
      console.warn('A2UI 诗文区编译失败，已保留成语卡片', error);
      return;
    }
    if (token !== chineseSurfaceToken || !a2uiMessages) return;
    if (a2uiSurface) a2uiSurface.destroy();
    a2uiSurface = window.ZHIDAO_A2UI.createSurface(host, { capabilities: a2uiCapabilities });
    a2uiSurface.onAction((message, meta) => handleChineseA2UIAction(message, meta, list, a2uiSurface));
    a2uiSurface.feed(a2uiMessages);
    window.ZHIDAO_A2UI_SURFACE = a2uiSurface;
  };
  const schedule = () => {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 450 });
    else setTimeout(run, 16);
  };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(schedule);
  else schedule();
}

function renderDynamicChinese() {
  const data = state.dynamic.data;
  const list = Array.isArray(data.idioms) ? data.idioms : [];
  const tags = ['all', ...new Set(list.map(item => item.tag).filter(Boolean))];
  const filtered = state.aiChineseFilter === 'all' ? list : list.filter(item => item.tag === state.aiChineseFilter);
  if (!filtered.length) state.aiChineseFilter = 'all';
  const visible = state.aiChineseFilter === 'all' ? list : list.filter(item => item.tag === state.aiChineseFilter);
  let selected = visible[state.aiChineseSelected] || visible[0] || list[0];
  if (!selected) { showToast('课程没有返回成语内容'); return; }
  state.aiChineseSelected = Math.max(0, visible.indexOf(selected));
  /* 「诗文与名句 + 试着写一句」改由 A2UI 组件协议渲染（P0 试点）。
   * 年级提示、诗句朗读文本、完成门槛全部由确定性编译器从课程 JSON + 年级算出，
   * 浏览器不再手写模板字符串，也不再用 CSS 隐藏内容来做「适龄减负」。
   * 编译放到首屏卡片之后，避免和离线朗读抢同一段主线程。 */
  $('#lesson-content').innerHTML = renderDynamicBanner() + `<div class="lesson-body"><section class="content-card" data-speech-key="module-1">
    <div class="card-heading"><div class="card-title"><span class="number">01</span><div><h4>表达素材库 <small>围绕主题，找到更准确的表达</small></h4></div></div><div class="card-heading-actions">${speechPlayButton('module-1', '朗读表达素材')}<div class="filter-pills">${tags.map(tag => `<button data-ai-filter="${e(tag)}" class="${state.aiChineseFilter === tag ? 'active' : ''}">${tag === 'all' ? '全部' : e(tag)}</button>`).join('')}</div></div></div>
    <div class="idiom-grid">${visible.map((item, index) => `<button class="idiom-card ${index === state.aiChineseSelected ? 'active' : ''}" data-ai-idiom="${index}" data-speech-item="idiom-${index}"><span class="idiom-tag">${e(item.tag)}</span><h5>${e(item.word)}</h5><div class="pinyin">${e(item.pinyin)}</div><p>${e(item.meaning)}</p><div class="intensity">${[1,2,3].map(n => `<i class="${n <= Number(item.level || 1) ? 'on' : ''}"></i>`).join('')}<span>表达强度</span></div></button>`).join('')}</div>
    <div class="idiom-detail"><span class="detail-quote">“</span><div><strong>${e(selected.example)}</strong><p>${icon('bulb')} ${e(selected.scene)}</p></div>${speechPlayButton('idiom-' + state.aiChineseSelected, '朗读这条表达')}</div></section>
    <div class="two-column" id="a2ui-surface"></div></div>`;
  scheduleChineseSurface(data, list);
  $$('[data-ai-filter]').forEach(button => button.addEventListener('click', () => { state.aiChineseFilter = button.dataset.aiFilter; state.aiChineseSelected = 0; renderDynamicChinese(); }));
  $$('[data-ai-idiom]').forEach(button => button.addEventListener('click', () => {
    state.aiChineseSelected = Number(button.dataset.aiIdiom);
    renderDynamicChinese();
    speakLessonKey('idiom-' + state.aiChineseSelected);
  }));
  bindSpeech();
  appendFollowup();
  mountKnowledgeBridge();
  applyLessonPreviewMode();
}

/* A2UI action 统一分发：写/选词/朗读不再散落在各自按钮的 addEventListener 里。
 * 反馈文案通过 updateDataModel 写回，DOM 由 renderer 重绘，业务层不碰 DOM。 */
function handleChineseA2UIAction(message, meta, list, surface) {
  const { name, context } = message.action.event;
  if (name === 'selectWord') {
    surface.setData('/practice/word', context.word, false);
    $$('[data-ai-practice]').forEach(item => item.classList.toggle('active', item === meta.node));
    $('#practice-input')?.focus();
    return;
  }
  if (name !== 'write') return;
  const text = String(context.text || '').trim();
  const word = String(context.word || list[0]?.word || '');
  const minLength = Number(context.minLength) > 0 ? Number(context.minLength) : 16;
  let feedback = '';
  let tone = 'hint';
  if (!text) {
    feedback = minLength <= 1 ? '先说一句吧，不用写得长，说出来就算完成。' : '先写一句吧，不必追求完美，先让想法出现。';
  } else if (!text.includes(word)) {
    feedback = minLength <= 1 ? `把「${word}」放进你刚说的那句话里试试。` : `再试着加入「${word}」，让主题表达更准确。`;
  } else {
    // 完成门槛按年级递进：启蒙期说出来就算，青少年要写清做法。
    const done = text.length >= minLength;
    tone = done ? 'good' : 'hint';
    feedback = done
      ? (minLength >= 20 ? `用上了「${word}」，也写清了做法。已记录这次练习。` : `用上了「${word}」，表达完整而有画面。已记录这次练习。`)
      : (minLength <= 1 ? '说出来就很好，再补一点动作或神情会更具体。' : '成语用得准确，再补充动作、神情或环境细节会更好。');
    if (done) {
      addHistory('chinese');
      // 自己写出一句完整表达，是「独立完成」而非「听懂了」，权重更高。
      if (window.KNOWLEDGE?.practice) {
        window.KNOWLEDGE.practice(true, { subject: 'chinese', detail: `仿写用了「${word}」`, origin: meta.node });
      }
    }
  }
  surface.setData('/practice/feedback', feedback, false);
  surface.setData('/practice/tone', tone, true);
}

function dynamicGrammarCard(item, index) {
  const cls = ['play', 'do', 'go'][index];
  const icons = ['target', 'check', 'compass'];
  const examples = Array.isArray(item.examples) ? item.examples : [];
  return `<article class="grammar-card ${cls}" data-speech-item="english-item-${index}"><div class="grammar-head"><div><div class="grammar-word">${e(item.word)}</div><span>${e(item.title)}</span></div><div class="head-actions">${speechPlayButton('english-item-' + index, '朗读这一组')}<div class="scene-icon">${icon(icons[index])}</div></div></div><p>${e(item.description)}</p><div class="example-list">${examples.map(example => `<button class="example-item" data-speak="${e([example.en, example.cn].filter(Boolean).join('。'))}" style="border:0;text-align:left;width:100%"><strong>${e(example.en)}</strong><span>${e(example.cn)} · 点读</span></button>`).join('')}</div><div class="grammar-tip">${icon('sparkles')}<span>${e(item.tip)}<br>${e(item.extra)}</span></div></article>`;
}

function renderDynamicEnglish() {
  const data = state.dynamic.data;
  const quizzes = Array.isArray(data.quizzes) ? data.quizzes : [];
  if (!quizzes.length) { showToast('课程没有返回练习内容'); return; }
  state.quizIndex = Math.min(state.quizIndex, quizzes.length - 1);
  const quiz = quizzes[state.quizIndex];
  const quizView = (typeof ZHIDAO_QUIZ !== 'undefined' ? ZHIDAO_QUIZ.normalizeQuiz(quiz) : {
    sentence: quiz && quiz.sentence || '请选择更合适的表达',
    cn: quiz && quiz.cn || '',
    choices: Array.isArray(quiz && quiz.choices) ? quiz.choices : [],
    answer: quiz && quiz.answer || '',
    explain: quiz && quiz.explain || ''
  });
  const choices = quizView.choices;
  const difference = data.difference || {};
  const stemHtml = (typeof ZHIDAO_QUIZ !== 'undefined' ? ZHIDAO_QUIZ.highlightBlanks(e(quizView.sentence)) : e(quizView.sentence).replace('___', '<span>___</span>'));
  $('#lesson-content').innerHTML = renderDynamicBanner() + `${data.mnemonic ? `<div class="mnemonic" data-speech-key="mnemonic"><span class="mnemonic-label">先记住</span><p>${e(data.mnemonic)}</p><small>先记场景，再记规则</small>${speechPlayButton('mnemonic', '朗读记忆口诀')}</div>` : ''}<div class="lesson-body"><section class="content-card" data-speech-key="module-1"><div class="card-heading"><div class="card-title"><span class="number">01</span><div><h4>场景对比学 <small>相关联的语法与使用差别</small></h4></div></div>${speechPlayButton('module-1', '朗读场景对比')}</div><div class="grammar-grid">${(data.items || []).map(dynamicGrammarCard).join('')}</div></section>
    <section class="content-card" style="margin-top:16px" data-speech-key="module-2"><div class="card-heading"><div class="card-title"><span class="number">02</span><div><h4>你来判一判 <small>选对用法，马上理解</small></h4></div></div><div class="card-heading-actions"><span class="section-kicker" id="quiz-score">本轮答对 ${state.quizScore} 题</span>${speechPlayButton('module-2', '朗读这道练习')}</div></div><div class="quiz-layout"><div class="quiz-question"><span class="question-label">QUICK PRACTICE · ${state.quizIndex + 1}/${quizzes.length}</span><h4>${stemHtml}</h4><p>${e(quizView.cn)}</p></div><div><div class="choice-row">${choices.map(choice => `<button class="choice-button" data-ai-answer="${e(choice)}" ${state.quizAnswered ? 'disabled' : ''}>${e(choice)}<small>选择这个答案</small></button>`).join('')}</div><div class="quiz-feedback" id="quiz-feedback">凭直觉先选一次，再看看场景规则。</div><div class="quiz-meta"><div class="quiz-dots">${quizzes.map((_, i) => `<i class="${state.quizDone.includes(i) ? 'done' : i === state.quizIndex ? 'active' : ''}"></i>`).join('')}</div><button class="text-button" id="ai-quiz-next" hidden>下一题${icon('arrow')}</button></div></div></div></section>
    <div class="difference-strip">${icon('info')}<p><strong>${e(difference.question)}</strong> ${e(difference.answer)}</p><button id="ai-difference-button">${state.showEnglishTip ? '收起辨析' : '再看一条建议'}</button></div>${state.showEnglishTip ? `<div class="difference-strip"><span class="mnemonic-label">进阶</span><p>${e(data.advancedTip)}</p></div>` : ''}</div>`;
  $$('[data-ai-answer]').forEach(button => button.addEventListener('click', () => {
    if (state.quizAnswered) return;
    state.quizAnswered = true;
    const resolved = quizView.answerResolved !== false;
    const correct = resolved && button.dataset.aiAnswer === quizView.answer;
    $$('[data-ai-answer]').forEach(item => {
      item.disabled = true;
      if (resolved && item.dataset.aiAnswer === quizView.answer) item.classList.add('correct');
      if (item === button && !correct && resolved) item.classList.add('wrong');
    });
    if (correct) { state.quizScore++; state.quizDone.push(state.quizIndex); }
    let feedbackHtml;
    if (!resolved) {
      feedbackHtml = '<strong>这道题的标准答案和选项对不上，先看下一题。</strong> 我们会记下这道题，避免把你的选择错判。';
    } else if (correct) {
      feedbackHtml = `<strong>选对了！</strong> ${e(quizView.explain)}`;
    } else {
      feedbackHtml = `<strong style="color:#b76556">再注意用法差别。</strong> 正确答案是 <b>${e(quizView.answer)}</b>。${e(quizView.explain)}`;
    }
    $('#quiz-feedback').innerHTML = feedbackHtml;
    $('#quiz-score').textContent = `本轮答对 ${state.quizScore} 题`;
    $('#ai-quiz-next').hidden = false;
    addHistory('english');
    if (window.KNOWLEDGE?.practice) {
      window.KNOWLEDGE.practice(correct, {
        subject: 'english', detail: quizView.sentence, origin: button
      });
    }
  }));
  $('#ai-quiz-next').addEventListener('click', () => { state.quizIndex = (state.quizIndex + 1) % quizzes.length; state.quizAnswered = false; if (state.quizIndex === 0) { state.quizScore = 0; state.quizDone = []; } renderDynamicEnglish(); });
  $('#ai-difference-button').addEventListener('click', () => { state.showEnglishTip = !state.showEnglishTip; renderDynamicEnglish(); });
  bindSpeech();
  appendFollowup();
  mountKnowledgeBridge();
  applyLessonPreviewMode();
}

function renderDynamicMath() {
  const data = state.dynamic.data;
  const methods = Array.isArray(data.methods) ? data.methods : [];
  if (methods.length !== 3) { showToast('课程没有返回完整的三种思路'); return; }
  state.mathLevel = Math.min(state.mathLevel, 2);
  const method = methods[state.mathLevel];
  const steps = Array.isArray(method.steps) ? method.steps : [];
  state.mathProgress[state.mathLevel] = Math.min(state.mathProgress[state.mathLevel], steps.length);
  const progress = state.mathProgress[state.mathLevel];
  const methodIcons = ['target', 'brain', 'crown'];
  const badges = ['', 'scholar', 'top'];
  const challenge = data.challenge || {};
  $('#lesson-content').innerHTML = renderDynamicBanner() + `<div class="lesson-body"><div class="thinking-tabs">${methods.map((item, index) => `<button class="thinking-tab ${state.mathLevel === index ? 'active' : ''}" data-ai-level="${index}">${icon(methodIcons[index])}<span>${e(item.name || ['一般人','学霸','顶流'][index])}<small>${e(item.subtitle)}</small></span></button>`).join('')}</div><div class="math-content"><section class="content-card" data-speech-key="math-method"><div class="solution-intro"><span class="persona-badge ${badges[state.mathLevel]}">${icon(methodIcons[state.mathLevel])}</span><div><h4>${e(method.title)}</h4><p>${e(method.intro)}</p></div>${speechPlayButton('math-method', '朗读这一思路')}</div><div class="steps">${steps.slice(0, progress).map((step, index) => `<article class="step done" data-speech-item="math-step-${index}"><span class="step-index">${index + 1}</span><div><h5>${e(step.title)}</h5><p>${e(step.text)}</p><div class="math-formula">${e(step.formula)}</div></div></article>`).join('')}${progress < steps.length ? '<div class="step-locked">下一步已折叠，先想一想，再继续展开</div>' : ''}</div><div class="solution-footer"><small>已展开 ${progress}/${steps.length} 步 · ${progress === steps.length ? '完整思路已解锁' : '先理解，再看下一步'}</small><button class="next-step" id="ai-next-step" ${progress === steps.length ? 'disabled' : ''}>${progress === steps.length ? `${icon('check')}思路已完成` : `展开下一步${icon('arrow')}`}</button></div></section>
    <aside class="content-card insight-card" data-speech-key="insight"><div class="card-heading"><div class="card-title"><span class="number">悟</span><div><h4>这一层，强在哪里？</h4></div></div>${speechPlayButton('insight', '朗读这一层')}</div><blockquote>“${e(method.quote)}”</blockquote><p>${e(method.insight)}</p><div class="compare-box"><span>三种思路，没有高下，只有适合</span>${methods.map((item, index) => `<div class="compare-row ${index === state.mathLevel ? 'current' : ''}"><i></i>${e(item.name)} · ${e(item.subtitle)}${index === state.mathLevel ? '<b style="margin-left:auto">当前</b>' : ''}</div>`).join('')}</div></aside></div><div class="challenge-card" data-speech-key="challenge">${speechPlayButton('challenge', '朗读这道挑战')}<span class="challenge-icon">${icon('sparkles')}</span><div><h5>换一道，试试你的新思路</h5><p>${e(challenge.question)}</p></div><span class="challenge-result" id="challenge-result">${e(challenge.answer)}</span><button class="challenge-answer" id="ai-challenge-answer">${state.challengeVisible ? '收起答案' : '我想好了'}</button></div><p class="ai-disclaimer">AI 解题可能存在疏漏，重要作业与考试请再验算或对照标准答案。</p></div>`;
  $$('[data-ai-level]').forEach(button => button.addEventListener('click', () => { state.mathLevel = Number(button.dataset.aiLevel); renderDynamicMath(); }));
  $('#ai-next-step').addEventListener('click', () => {
    const level = state.mathLevel;
    if (state.mathProgress[level] < steps.length) state.mathProgress[level]++;
    if (state.mathProgress[level] === steps.length) {
      addHistory('math');
      // 完整走通一条思路算一次独立输出，但比「答对」弱，用 created 而非 correct。
      if (window.KNOWLEDGE?.record) window.KNOWLEDGE.record({ type: 'created', subject: 'math', detail: `走通${method.name || '一条'}思路` });
    }
    renderDynamicMath();
  });
  $('#ai-challenge-answer').addEventListener('click', () => {
    state.challengeVisible = !state.challengeVisible;
    $('#challenge-result').style.display = state.challengeVisible ? 'block' : 'none';
    $('#ai-challenge-answer').textContent = state.challengeVisible ? '收起答案' : '我想好了';
    if (state.challengeVisible) {
      addHistory('math');
      if (window.KNOWLEDGE?.record) window.KNOWLEDGE.record({ type: 'created', subject: 'math', detail: '完成变式挑战' });
    }
  });
  if (state.challengeVisible) $('#challenge-result').style.display = 'block';
  if (typeof bindSpeech === 'function') bindSpeech();
  appendFollowup();
  mountKnowledgeBridge();
  applyLessonPreviewMode();
}

function addHistory(type) {
  const id = state.currentId || type;
  state.history = state.history.filter(item => item.id !== id);
  state.history.unshift({ id, time: new Date().toISOString() });
  state.history = state.history.slice(0, 12);
  writeStorage('zhidao-history', state.history);
  updateGoal();
}

function toggleFavorite() {
  const id = state.currentId || state.topic;
  const exists = state.favorites.includes(id);
  state.favorites = exists ? state.favorites.filter(item => item !== id) : [...state.favorites, id];
  writeStorage('zhidao-favorites', state.favorites);
  updateFavoriteButton();
  showToast(exists ? '已取消收藏' : '已收藏，之后可以在「我的收藏」中找到');
}

function updateFavoriteButton() {
  const active = state.favorites.includes(state.currentId || state.topic);
  const button = $('#favorite-button');
  button.classList.toggle('active', active);
  $('span', button).textContent = active ? '已收藏' : '收藏';
  $('#favorite-count').textContent = state.favorites.length;
}

function lessonSummary(id) {
  if (lessons[id]) return { ...lessons[id], type: id };
  const record = state.dynamicLessons[id];
  if (!record) return null;
  return { id, type: record.subject, query: record.input, subject: { chinese: '语文', english: '英语', math: '数学' }[record.subject], label: 'AI 互动讲解' };
}

function openSavedLesson(id) {
  if (lessons[id]) { closeModal(); renderLesson(id, true); closeSidebar(); return; }
  const record = state.dynamicLessons[id];
  if (record) { closeModal(); renderDynamicLesson(record, id, true); closeSidebar(); }
  else showToast('这条课程内容已过期，请重新生成');
}

function showCollection(kind) {
  const isFavorites = kind === 'favorites';
  const list = isFavorites ? state.favorites : state.history.map(item => item.id);
  const content = list.length ? `<div class="saved-list">${list.map(id => {
    const lesson = lessonSummary(id);
    if (!lesson) return '';
    const historyItem = state.history.find(item => item.id === id);
    const meta = isFavorites ? `${lesson.subject} · ${lesson.label || '互动讲解'}` : `${lesson.subject} · ${formatTime(historyItem?.time)}`;
    return `<article class="saved-item"><span class="saved-icon ${lesson.type}">${icon(lesson.type === 'chinese' ? 'book' : lesson.type === 'english' ? 'language' : 'math')}</span><div><strong>${e(lesson.query)}</strong><small>${e(meta)}</small></div><button data-open-lesson="${e(id)}">继续学习</button>${isFavorites ? `<button class="delete-saved" data-delete-favorite="${e(id)}">${icon('trash')}</button>` : ''}</article>`;
  }).join('')}</div>` : `<div class="empty-state"><span class="empty-icon">${icon(isFavorites ? 'bookmark' : 'clock')}</span><h3>${isFavorites ? '还没有收藏知识点' : '学习记录还是空的'}</h3><p>${isFavorites ? '遇到喜欢的讲解，点一下“收藏”，它就会留在这里。' : '完成一次练习或分步讲解后，足迹会自动记录。'}</p></div>`;
  openModal(isFavorites ? '我的收藏' : '学习记录', '我的学习', content);
  $$('[data-open-lesson]').forEach(button => button.addEventListener('click', () => openSavedLesson(button.dataset.openLesson)));
  $$('[data-delete-favorite]').forEach(button => button.addEventListener('click', () => { state.favorites = state.favorites.filter(id => id !== button.dataset.deleteFavorite); writeStorage('zhidao-favorites', state.favorites); updateFavoriteButton(); showCollection('favorites'); }));
}

function showGuide() {
  openModal('三步，开始真正理解', '使用指南', `<div class="guide-list">
    <div class="guide-item"><span class="guide-number">1</span><div><h3>输入想弄懂的内容</h3><p>一个词、一组易混语法，或一道数学题。知岛会先自动判断它属于哪一科。</p></div></div>
    <div class="guide-item"><span class="guide-number">2</span><div><h3>按学科方式展开讲解</h3><p>语文给成语与诗句，英语辨语法与用法差别，数学对比三种解题思路。</p></div></div>
    <div class="guide-item"><span class="guide-number">3</span><div><h3>动手一次，留下理解</h3><p>写一句话、答一道题、展开一条思路。不懂的地方可以在课程底部继续追问。</p></div></div>
  </div><div class="guide-examples">生成模型可在搜索框下方切换；讲过的内容会被记住，重复提问直接秒开，想重讲点「重新生成」。<br>AI 内容请结合课本与标准答案核对。</div>`);
}

const oldShareButton = $('#share-button');
const newShareButton = oldShareButton.cloneNode(true);
oldShareButton.replaceWith(newShareButton);
newShareButton.addEventListener('click', async () => {
  const hash = state.dynamic ? `q=${encodeURIComponent(state.dynamic.input)}` : `lesson=${state.topic}`;
  const url = `${location.href.split('#')[0]}#${hash}`;
  try { await navigator.clipboard.writeText(url); showToast('讲解链接已复制，可以分享给同学'); }
  catch { showToast('可通过当前页面链接分享讲解'); }
  history.replaceState(null, '', `#${hash}`);
});

$('#refresh-button').addEventListener('click', () => {
  if (!$('#topic-input').value.trim()) { showToast('先输入一个知识点'); return; }
  startLesson(true);
});

// 页面加载即校准缓存版本，服务端模板/模型升级后自动丢弃旧本地缓存。
syncCacheVersion();
initModelPicker();
state.pipeline = {
  phase: 'idle', routeStartedAt: 0, lessonStartedAt: null, routeMs: null, lessonMs: null,
  elapsedMs: 0, wallMs: 0, timings: null, routeModel: 'd1.1', routeSource: 'd1',
  error: '', cacheSource: ''
};
renderPipeline();

const sharedQuery = location.hash.match(/^#q=(.+)$/)?.[1];
if (sharedQuery && location.protocol !== 'file:') {
  $('#topic-input').value = decodeURIComponent(sharedQuery);
  updateDetection();
  startLesson();
}

// 年级切换后，栏目操作提示必须立刻跟着变（此前 learnerrefresh 没有任何监听者）。
// 内容本身也随年级变化：服务端课程缓存键含 learnerStage，普通请求就会拿到对应讲法。
window.addEventListener('zhidao:learnerchange', () => {
  if (state.dynamic) rerenderCurrentDynamic();
});
window.addEventListener('zhidao:learnerrefresh', () => {
  if (!state.dynamic) return;
  rerenderCurrentDynamic();
  if ($('#topic-input').value.trim()) startLesson();
});
