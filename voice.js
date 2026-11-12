/* 全局语音 · 音色配置与朗读（UMD 双端）
 *
 * 一条链路管住所有朗读入口：[data-speak] 按钮、A2UI renderer function `speak`、
 * 游戏组件的连续朗读，以及 a2ui-bridge 的 stopVoice 中断。
 *
 *   mode = 'offline' → 浏览器内离线合成（默认）：Kokoro ONNX 跑在本机浏览器，
 *                       模型与音色都从本站静态目录读取，不依赖任何外部服务。
 *   mode = 'tts'     → 本机 Kokoro TTS 服务（/v1/audio/speech，直接返回 audio/mpeg）
 *   mode = 'browser' → 浏览器 speechSynthesis（零依赖，兜底）
 *
 * 回退顺序：离线引擎 → 本地服务 → 浏览器默认音色。
 * 离线引擎不可用（模型缺失 / 浏览器不支持 WebGPU 与 WASM）时自动切到本地服务，
 * 服务也不可用时切回浏览器默认音色，任何一步都不会让朗读变成「点了没反应」。
 *
 * 音色可以**按学科**配置：语文 / 英语 / 数学各一个音色，默认英语用英文音色（af_maple），
 * 语文与数学用中文音色（zf_001）。朗读时先看当前学科，再看文本语种：
 *   英语课读英文例句 → 英语音色；英语课读中文讲解 → 回落中文音色（不让中文被英文音色念）。
 * 文本语种与学科不匹配时按语种回退，保证「读什么用什么口音」。
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && !!module.exports;
  const DEFAULT_BASE = 'http://127.0.0.1:8880';
  const STORE_KEY = 'zhidao-voice-settings-v1';
  const VOICE_ID = /^[a-z]{2}_[a-z0-9]+$/i;

  /** 学科 → 音色槽位。lang 决定该学科默认用哪种语言的音色；follow 表示可选「跟随默认音色」。 */
  const SUBJECTS = {
    chinese: { label: '语文', lang: 'zh', default: 'auto', follow: true },
    english: { label: '英语', lang: 'en', default: 'af_maple', follow: false },
    math: { label: '数学', lang: 'zh', default: 'auto', follow: true }
  };
  const SUBJECT_KEYS = Object.keys(SUBJECTS);
  const AUTO = 'auto';
  const DEFAULT_SUBJECT_VOICES = SUBJECT_KEYS.reduce((acc, key) => {
    acc[key] = SUBJECTS[key].default;
    return acc;
  }, {});
  const DEFAULT_SETTINGS = {
    mode: 'offline', voice: 'zf_001', base: DEFAULT_BASE, speed: 1,
    subjectVoices: { ...DEFAULT_SUBJECT_VOICES }
  };
  const MODES = ['offline', 'tts', 'browser'];

  /* 服务 /v1/audio/voices 的 103 个音色。服务暂时不可用时仍可完整展示清单，
   * 服务可用时以实时返回为准（服务升级新增音色不需要改这里）。 */
  const BUILTIN_VOICES = (
    'af_maple,af_sol,bf_vale,' +
    'zf_001,zf_002,zf_003,zf_004,zf_005,zf_006,zf_007,zf_008,zf_017,zf_018,zf_019,' +
    'zf_021,zf_022,zf_023,zf_024,zf_026,zf_027,zf_028,zf_032,zf_036,zf_038,zf_039,' +
    'zf_040,zf_042,zf_043,zf_044,zf_046,zf_047,zf_048,zf_049,zf_051,zf_059,zf_060,' +
    'zf_067,zf_070,zf_071,zf_072,zf_073,zf_074,zf_075,zf_076,zf_077,zf_078,zf_079,' +
    'zf_083,zf_084,zf_085,zf_086,zf_087,zf_088,zf_090,zf_092,zf_093,zf_094,zf_099,' +
    'zm_009,zm_010,zm_011,zm_012,zm_013,zm_014,zm_015,zm_016,zm_020,zm_025,zm_029,' +
    'zm_030,zm_031,zm_033,zm_034,zm_035,zm_037,zm_041,zm_045,zm_050,zm_052,zm_053,' +
    'zm_054,zm_055,zm_056,zm_057,zm_058,zm_061,zm_062,zm_063,zm_064,zm_065,zm_066,' +
    'zm_068,zm_069,zm_080,zm_081,zm_082,zm_089,zm_091,zm_095,zm_096,zm_097,zm_098,zm_100'
  ).split(',');

  const FAMILY = {
    zf: { gender: 'female', lang: 'zh', label: '中文女声', group: 'zh-female' },
    zm: { gender: 'male', lang: 'zh', label: '中文男声', group: 'zh-male' },
    af: { gender: 'female', lang: 'en', label: '美式女声', group: 'en-us-female' },
    bf: { gender: 'female', lang: 'en', label: '英式女声', group: 'en-gb-female' }
  };
  const GROUPS = [
    { key: 'zh-female', gender: 'female', label: '女声 · 中文普通话' },
    { key: 'en-us-female', gender: 'female', label: '女声 · 美式英语' },
    { key: 'en-gb-female', gender: 'female', label: '女声 · 英式英语' },
    { key: 'zh-male', gender: 'male', label: '男声 · 中文普通话' },
    { key: 'other', gender: 'other', label: '其他音色' }
  ];

  function classifyVoice(id) {
    const prefix = String(id || '').slice(0, 2).toLowerCase();
    const family = FAMILY[prefix];
    const tail = String(id || '').slice(3);
    return {
      id: String(id || ''),
      gender: family ? family.gender : 'other',
      lang: family ? family.lang : '',
      group: family ? family.group : 'other',
      label: `${family ? family.label : '音色'} · ${tail || id}`
    };
  }

  /** 音色属于哪种语言（zh / en）；未知音色返回空串。 */
  function voiceLang(id) {
    const family = FAMILY[String(id || '').slice(0, 2).toLowerCase()];
    return family ? family.lang : '';
  }

  /**
   * 文本语种判定：纯拉丁字母 → 英文；含中日韩统一表意文字 → 中文；
   * 中英混排时按字符数量多数决。英文例句与英文单词都会被判成英文。
   */
  function detectLang(text) {
    const source = String(text == null ? '' : text);
    const cjk = source.match(/[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/g) || [];
    const latin = source.match(/[a-zA-Z]/g) || [];
    if (!cjk.length && !latin.length) return 'zh';
    if (!cjk.length) return 'en';
    if (!latin.length) return 'zh';
    return latin.length > cjk.length ? 'en' : 'zh';
  }

  function groupVoices(ids) {
    const seen = new Set();
    const buckets = new Map(GROUPS.map(g => [g.key, []]));
    for (const raw of ids || []) {
      if (typeof raw !== 'string' || !VOICE_ID.test(raw) || seen.has(raw)) continue;
      seen.add(raw);
      const info = classifyVoice(raw);
      buckets.get(info.group).push({ id: raw, label: info.label });
    }
    return GROUPS.map(g => ({
      key: g.key, gender: g.gender, label: g.label,
      count: buckets.get(g.key).length, items: buckets.get(g.key)
    })).filter(g => g.count > 0);
  }

  function normalize(raw) {
    const out = { ...DEFAULT_SETTINGS, subjectVoices: { ...DEFAULT_SUBJECT_VOICES } };
    if (!raw || typeof raw !== 'object') return out;
    if (MODES.includes(raw.mode)) out.mode = raw.mode;
    if (typeof raw.voice === 'string' && VOICE_ID.test(raw.voice)) out.voice = raw.voice;
    if (typeof raw.base === 'string') {
      try {
        const url = new URL(raw.base.trim());
        if ((url.protocol === 'http:' || url.protocol === 'https:') && raw.base.length < 200) {
          out.base = url.origin + url.pathname.replace(/\/$/, '');
        }
      } catch { /* 非法地址用默认值 */ }
    }
    const speed = Number(raw.speed);
    if (Number.isFinite(speed)) out.speed = Math.max(0.5, Math.min(2, speed));
    // 学科音色：逐个学科校验，缺哪个补哪个的默认值（老配置没有这一项也能平滑升级）。
    // 'auto' 表示「跟随默认音色」，其余必须是合法音色 id。
    const slots = raw.subjectVoices;
    if (slots && typeof slots === 'object') {
      for (const key of SUBJECT_KEYS) {
        const value = slots[key];
        if (value === AUTO) out.subjectVoices[key] = AUTO;
        else if (typeof value === 'string' && VOICE_ID.test(value)) out.subjectVoices[key] = value;
      }
    }
    return out;
  }

  /* 依赖集中在一处，Node 回归可以注入替身，不需要真的开浏览器 / 起服务。 */
  const deps = {
    fetch: typeof fetch === 'function' ? (...args) => fetch(...args) : null,
    storage: (() => { try { return root && root.localStorage; } catch { return null; } })(),
    Audio: typeof Audio !== 'undefined' ? Audio : null,
    createObjectURL: typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' ? b => URL.createObjectURL(b) : null,
    revokeObjectURL: typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function' ? u => URL.revokeObjectURL(u) : null,
    speechSynthesis: () => (root && root.speechSynthesis) || null,
    SpeechSynthesisUtterance: () => (root && root.SpeechSynthesisUtterance) || null,
    mascot: () => (root && root.ZhidaoMascot) || null,
    toast: msg => { try { if (root && typeof root.showToast === 'function') root.showToast(msg); } catch { /* noop */ } },
    evidence: text => {
      try { if (root && root.KNOWLEDGE && typeof root.KNOWLEDGE.record === 'function') root.KNOWLEDGE.record({ type: 'recited', detail: String(text).slice(0, 80) }); } catch { /* 离线不影响朗读 */ }
    },
    // 离线引擎按需加载：第一次朗读时才拉 4.7MB 的引擎包，之后浏览器缓存。
    loadOfflineEngine: async () => {
      if (typeof document === 'undefined') throw new Error('离线语音引擎只能在浏览器里运行');
      const mod = await import('/tts/kokoro-tts.js');
      const engine = (mod && (mod.default || mod)) || (root && root.ZhidaoTTS);
      if (!engine || typeof engine.synthesize !== 'function') throw new Error('离线语音引擎加载失败');
      return engine;
    },
    audioContext: () => (root && (root.AudioContext || root.webkitAudioContext)) || null
  };

  /* 离线引擎状态：idle 未加载 / loading 加载中 / ready 可用 / failed 不可用。 */
  const offline = {
    engine: null, loading: null, state: 'idle', error: '', device: '', progress: 0, ctx: null
  };

  function offlineStatus() {
    return {
      state: offline.state, error: offline.error, device: offline.device,
      progress: offline.progress, ready: offline.state === 'ready'
    };
  }

  function setDeps(patch) { Object.assign(deps, patch || {}); return API; }

  function readSettings() {
    try {
      const raw = deps.storage && deps.storage.getItem(STORE_KEY);
      return normalize(raw ? JSON.parse(raw) : null);
    } catch { return normalize(null); }
  }
  function writeSettings() {
    try { if (deps.storage) deps.storage.setItem(STORE_KEY, JSON.stringify(settings)); } catch { /* 隐私模式下不落盘，本次会话仍生效 */ }
  }

  let settings = readSettings();
  let service = {
    available: false, voices: BUILTIN_VOICES.slice(), count: BUILTIN_VOICES.length,
    checkedAt: 0, error: ''
  };
  const listeners = [];
  let current = null;
  let fallbackToken = 0;
  let currentSubject = 'chinese';

  function emit() {
    const snapshot = status();
    listeners.forEach(cb => { try { cb(snapshot); } catch { /* 单个订阅者出错不影响其它 */ } });
  }

  /** 按语言过滤分组：语文/数学只给中文音色，英语只给英文音色。 */
  function groupsForLang(lang) {
    const groups = groupVoices(service.voices);
    if (lang === 'en') return groups.filter(g => g.key.indexOf('en-') === 0);
    if (lang === 'zh') return groups.filter(g => g.key.indexOf('zh-') === 0);
    return groups;
  }

  /**
   * 解析一次朗读该用哪个音色。
   * 优先级：学科专用音色（语种要对）→ 默认音色（语种要对）→ 其它语种匹配的学科音色。
   * 槽位为 'auto' 表示跟随默认音色；语种对不上时按文本语种回落，
   * 避免「英语课读中文却用英文音色念」这类别扭结果。
   */
  function resolveVoice(text, subject) {
    const lang = detectLang(text);
    const slots = settings.subjectVoices || {};
    const key = SUBJECTS[subject] ? subject : '';
    const slot = key ? slots[key] : '';
    const usable = id => typeof id === 'string' && id !== AUTO && VOICE_ID.test(id);
    if (usable(slot) && voiceLang(slot) === lang) return slot;
    if (usable(settings.voice) && voiceLang(settings.voice) === lang) return settings.voice;
    for (const other of SUBJECT_KEYS) {
      if (usable(slots[other]) && voiceLang(slots[other]) === lang) return slots[other];
    }
    return usable(slot) ? slot : settings.voice;
  }

  function status() {
    const subjectGroups = {};
    for (const key of SUBJECT_KEYS) subjectGroups[key] = groupsForLang(SUBJECTS[key].lang);
    return {
      mode: settings.mode, voice: settings.voice, base: settings.base, speed: settings.speed,
      available: service.available, count: service.count, checkedAt: service.checkedAt, error: service.error,
      effective: effectiveMode(),
      voices: service.voices.slice(), groups: groupVoices(service.voices),
      defaultVoice: DEFAULT_SETTINGS.voice, builtinCount: BUILTIN_VOICES.length,
      subject: currentSubject, subjectVoices: { ...settings.subjectVoices },
      subjectGroups, subjects: SUBJECTS,
      offline: offlineStatus(), modes: MODES.slice()
    };
  }

  /** 真正会用到的朗读通道：离线引擎不可用才退到本地服务，再不行退到浏览器默认。 */
  function effectiveMode() {
    if (settings.mode === 'browser') return 'browser';
    if (settings.mode === 'offline') {
      if (offline.state === 'failed') return service.available ? 'tts' : 'browser';
      return 'offline';
    }
    return service.available ? 'tts' : 'browser';
  }

  async function probe(base) {
    if (typeof deps.fetch !== 'function') throw new Error('没有 fetch 能力');
    let timer = null;
    let signal;
    if (typeof AbortController !== 'undefined') {
      const ctrl = new AbortController();
      signal = ctrl.signal;
      timer = setTimeout(() => ctrl.abort(), 2500);
    }
    try {
      const res = await deps.fetch(`${base}/v1/audio/voices`, { method: 'GET', signal });
      if (!res || !res.ok) throw new Error(`HTTP ${res ? res.status : '无响应'}`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data && data.voices) || [];
      const ids = list.map(v => (typeof v === 'string' ? v : v && v.id))
        .filter(id => typeof id === 'string' && VOICE_ID.test(id));
      if (!ids.length) throw new Error('音色列表为空');
      return ids;
    } finally { if (timer) clearTimeout(timer); }
  }

  /** 探测语音服务；失败时保留内置 103 个音色供展示，但标记不可用 → 朗读回退。 */
  async function refresh() {
    try {
      const ids = await probe(settings.base);
      service = { available: true, voices: ids, count: ids.length, checkedAt: Date.now(), error: '' };
    } catch (error) {
      service = {
        available: false, voices: BUILTIN_VOICES.slice(), count: BUILTIN_VOICES.length,
        checkedAt: Date.now(), error: String((error && error.message) || error)
      };
    }
    emit();
    return status();
  }

  function configure(patch) {
    const previousBase = settings.base;
    const input = { ...settings, ...(patch || {}) };
    // 学科音色是逐项覆盖：只传一个学科时，其它学科保持原样。
    if (patch && patch.subjectVoices && typeof patch.subjectVoices === 'object') {
      input.subjectVoices = { ...settings.subjectVoices, ...patch.subjectVoices };
    }
    settings = normalize(input);
    writeSettings();
    emit();
    if (settings.base !== previousBase) refresh();
    return status();
  }

  /** 记录当前学科（语文 / 英语 / 数学），后续朗读按它选音色。 */
  function setSubject(subject) {
    if (!SUBJECTS[subject]) return currentSubject;
    currentSubject = subject;
    return currentSubject;
  }

  function onChange(cb) {
    if (typeof cb !== 'function') return () => {};
    listeners.push(cb);
    return () => { const i = listeners.indexOf(cb); if (i >= 0) listeners.splice(i, 1); };
  }

  /* ---------------- 朗读 ---------------- */

  function beginSpeech(text) {
    const mascot = deps.mascot();
    const line = `正在朗读：「${text.slice(0, 22)}${text.length > 22 ? '…' : ''}」`;
    if (mascot && typeof mascot.startSpeech === 'function') return mascot.startSpeech(text, { line });
    return ++fallbackToken;
  }

  function endSpeech(token, line) {
    const mascot = deps.mascot();
    if (mascot && typeof mascot.stopSpeech === 'function') {
      try { mascot.stopSpeech(token, { line: line || '读完啦，要不要再听一遍？' }); } catch { /* noop */ }
    }
  }

  function finish(token, ok, line) {
    const c = current;
    if (!c || c.token !== token) return;
    current = null;
    if (c.ticker) clearInterval(c.ticker);
    if (c.keepAlive) clearInterval(c.keepAlive);
    if (c.url && deps.revokeObjectURL) { try { deps.revokeObjectURL(c.url); } catch { /* noop */ } }
    endSpeech(token, line);
    if (!ok) deps.toast('朗读未完成，已恢复默认状态');
  }

  /** 外部中断（P4c 的 stopVoice 等）：远程音频与浏览器语音一起停，口型回 idle。 */
  function stop(opts) {
    const options = opts || {};
    const c = current;
    if (c) {
      current = null;
      if (c.ticker) clearInterval(c.ticker);
      if (c.keepAlive) clearInterval(c.keepAlive);
      if (c.source) {
        // 离线引擎走 Web Audio：必须停 source，否则音频会继续播。
        try { c.source.stop(); c.source.disconnect(); } catch { /* 已结束 */ }
      }
      if (c.audio) {
        try { c.audio.pause(); c.audio.removeAttribute && c.audio.removeAttribute('src'); c.audio.load && c.audio.load(); } catch { /* noop */ }
      }
      if (c.url && deps.revokeObjectURL) { try { deps.revokeObjectURL(c.url); } catch { /* noop */ } }
      if (!options.quiet) endSpeech(c.token, options.line || '已停止朗读');
    }
    try { const synth = deps.speechSynthesis(); if (synth && synth.cancel) synth.cancel(); } catch { /* noop */ }
    return true;
  }

  /** 浏览器默认音色：保留原有的语种判断、boundary 口型、长文本保活与证据上报。 */
  function speakBrowser(text, token) {
    const synth = deps.speechSynthesis();
    const Utterance = deps.SpeechSynthesisUtterance();
    if (!synth || !Utterance) {
      finish(token, false);
      deps.toast('当前浏览器暂不支持朗读');
      return false;
    }
    const utterance = new Utterance(text);
    // 语种判定与 TTS 路径共用 detectLang：读什么用什么口音，中英混排按多数决。
    utterance.lang = detectLang(text) === 'en' ? 'en-US' : 'zh-CN';
    utterance.rate = 0.86;
    const mascot = deps.mascot();
    utterance.onboundary = ev => {
      if (mascot && typeof mascot.speechBoundary === 'function') mascot.speechBoundary(ev, token);
    };
    utterance.onend = () => finish(token, true);
    utterance.onerror = () => finish(token, false);
    try { synth.speak(utterance); }
    catch { finish(token, false); deps.toast('朗读启动失败，请检查浏览器语音设置'); return false; }
    const session = { token, keepAlive: null };
    current = session;
    // 部分 Chromium 版本会在长文本约 15 秒后自动暂停，轻微 pause/resume 保持朗读与口型不中断。
    session.keepAlive = setInterval(() => {
      if (current !== session) { clearInterval(session.keepAlive); return; }
      if (!synth.speaking) { clearInterval(session.keepAlive); session.keepAlive = null; return; }
      synth.pause(); synth.resume();
    }, 9000);
    deps.evidence(text);
    deps.toast('正在朗读，知知会跟着一起说');
    return true;
  }

  /** 远程音色：POST 拿 audio/mpeg → Audio 播放；按音频时长模拟 boundary 驱动口型。 */
  async function speakRemote(text, token, voiceId) {
    if (!deps.Audio || !deps.createObjectURL) throw new Error('当前环境不支持音频播放');
    let timer = null;
    let signal;
    if (typeof AbortController !== 'undefined') {
      const ctrl = new AbortController();
      signal = ctrl.signal;
      timer = setTimeout(() => ctrl.abort(), 20000);
    }
    let blob;
    try {
      const res = await deps.fetch(`${settings.base}/v1/audio/speech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'kokoro', input: text, voice: voiceId || settings.voice,
          response_format: 'mp3', stream: false, return_timestamps: false,
          speed: settings.speed
        }),
        signal
      });
      if (!res || !res.ok) throw new Error(`语音服务 HTTP ${res ? res.status : '无响应'}`);
      blob = await res.blob();
    } finally { if (timer) clearTimeout(timer); }
    if (!blob || blob.size < 512) throw new Error('语音服务返回的音频为空');
    if (blob.type && /json|text|html/i.test(blob.type)) throw new Error('语音服务返回的不是音频');

    const url = deps.createObjectURL(blob);
    const audio = new deps.Audio(url);
    audio.preload = 'auto';
    const mascot = deps.mascot();
    const chars = Math.max(1, Array.from(text).length);
    current = { token, audio, url, ticker: null };
    audio.onended = () => finish(token, true);
    audio.onerror = () => finish(token, false, '读完啦，要不要再听一遍？');
    try {
      const playing = audio.play();
      if (playing && typeof playing.catch === 'function') await playing;
    } catch (error) {
      finish(token, false);
      throw error;
    }
    // 极短文本可能已经播完（onended 先清掉了 current），此时不必再装口型 ticker。
    const session = current;
    if (!session || session.token !== token) return true;
    // 远程音频没有 onboundary，按实际时长把文本进度喂给口型同步接口。
    const durationMs = Number.isFinite(audio.duration) && audio.duration > 0
      ? audio.duration * 1000 : chars * 190;
    const tickMs = 130;
    const charsPerTick = Math.max(1, Math.ceil(chars / Math.max(1, durationMs / tickMs)));
    let index = 0;
    session.ticker = setInterval(() => {
      if (current !== session) { clearInterval(session.ticker); return; }
      index = Math.min(chars, index + charsPerTick);
      if (mascot && typeof mascot.speechBoundary === 'function') {
        mascot.speechBoundary({ charIndex: index, charLength: 1 }, token);
      }
      if (index >= chars) { clearInterval(session.ticker); session.ticker = null; }
    }, tickMs);
    deps.evidence(text);
    deps.toast('正在朗读（知知音色），知知会跟着一起说');
    return true;
  }

  /** 加载离线引擎（懒加载：第一次朗读时才拉引擎包），并等模型真正就绪。 */
  async function ensureOfflineEngine() {
    if (offline.engine && offline.state === 'ready') return offline.engine;
    if (offline.loading) return offline.loading;
    offline.state = 'loading';
    offline.error = '';
    emit();
    offline.loading = (async () => {
      const engine = await deps.loadOfflineEngine();
      offline.engine = engine;
      if (typeof engine.onChange === 'function') {
        engine.onChange(snapshot => {
          if (!snapshot) return;
          if (snapshot.device) offline.device = snapshot.device;
          if (typeof snapshot.progress === 'number') offline.progress = snapshot.progress;
          if (snapshot.error) offline.error = snapshot.error;
          emit();
        });
      }
      // 引擎包加载完还不算数：模型本体要单独下载/初始化（首次几百 MB），
      // 等它就绪，状态行与进度才准确。
      if (typeof engine.load === 'function') await engine.load();
      offline.state = 'ready';
      offline.loading = null;
      emit();
      return engine;
    })().catch(error => {
      offline.loading = null;
      offline.state = 'failed';
      offline.error = String((error && error.message) || error);
      emit();
      throw error;
    });
    return offline.loading;
  }

  /** 离线合成 + Web Audio 播放；口型按音频时长同步。失败返回 false，交给上层回退。 */
  async function speakOffline(text, token, voiceId) {
    let engine;
    try {
      engine = await ensureOfflineEngine();
    } catch { return false; }
    let result;
    try {
      result = await engine.synthesize(text, { voice: voiceId || settings.voice, speed: settings.speed });
    } catch (error) {
      offline.error = String((error && error.message) || error);
      emit();
      return false;
    }
    const samples = result && result.samples;
    const sampleRate = Number(result && result.sampleRate) || 24000;
    if (!samples || !samples.length) return false;
    const Ctor = deps.audioContext();
    if (!Ctor) return false;
    const ctx = offline.ctx || (offline.ctx = new Ctor());
    if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      try { await ctx.resume(); } catch { /* 自动播放被拦截时浏览器会拒绝 */ }
    }
    const buffer = ctx.createBuffer(1, samples.length, sampleRate);
    if (typeof buffer.copyToChannel === 'function') buffer.copyToChannel(samples, 0);
    else { const channel = buffer.getChannelData(0); channel.set(samples); }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    const session = { token, source, ctx, ticker: null };
    current = session;
    source.onended = () => finish(token, true);
    source.start();
    // 口型：离线音频没有 boundary 事件，按音频时长把文本进度喂给口型接口。
    const mascot = deps.mascot();
    const chars = Math.max(1, Array.from(text).length);
    const durationMs = Math.max(200, (Number(result.duration) || samples.length / sampleRate) * 1000);
    const tickMs = 130;
    const charsPerTick = Math.max(1, Math.ceil(chars / Math.max(1, durationMs / tickMs)));
    let index = 0;
    session.ticker = setInterval(() => {
      if (current !== session) { clearInterval(session.ticker); return; }
      index = Math.min(chars, index + charsPerTick);
      if (mascot && typeof mascot.speechBoundary === 'function') {
        mascot.speechBoundary({ charIndex: index, charLength: 1 }, token);
      }
      if (index >= chars) { clearInterval(session.ticker); session.ticker = null; }
    }, tickMs);
    deps.evidence(text);
    deps.toast('正在朗读（离线合成），知知会跟着一起说');
    return true;
  }

  /** 学科音色不在服务清单里（例如服务升级后音色改名）→ 回落通用音色。 */
  function pickAvailable(id) {
    if (!id || id === AUTO) return '';
    if (service.voices.includes(id) || BUILTIN_VOICES.includes(id)) return id;
    if (settings.voice && (service.voices.includes(settings.voice) || BUILTIN_VOICES.includes(settings.voice))) return settings.voice;
    return '';
  }

  /**
   * 全局朗读入口。返回 Promise<boolean>：
   * 离线引擎 → 本地服务 → 浏览器默认，逐级回退，任何一步失败都不会「点了没反应」。
   * opts.subject 显式指定学科（不传就用当前学科），opts.voice 可强制指定音色。
   */
  async function speak(value, opts) {
    const options = opts || {};
    const text = String(value == null ? '' : value);
    if (!text.trim()) return false;
    stop({ quiet: true });
    const token = beginSpeech(text);
    const subject = SUBJECTS[options.subject] ? options.subject : currentSubject;
    const forced = options.voice && options.voice !== AUTO ? options.voice : '';
    const preferred = forced || resolveVoice(text, subject);
    const voiceId = pickAvailable(preferred) || preferred;

    // 1) 离线引擎（默认）：模型与音色都在本机浏览器里，不依赖任何服务。
    if (settings.mode === 'offline') {
      const ok = await speakOffline(text, token, voiceId);
      if (ok) return true;
      deps.toast('离线语音不可用，已切换到本地语音服务');
    }

    // 2) 本地 Kokoro 服务。
    const usable = settings.mode !== 'browser' && service.available
      && (service.voices.includes(voiceId) || BUILTIN_VOICES.includes(voiceId));
    if (usable) {
      try {
        return await speakRemote(text, token, voiceId);
      } catch (error) {
        service.available = false;
        service.error = String((error && error.message) || error);
        emit();
        deps.toast('语音服务不可用，已切回浏览器默认音色');
        // 口型会话延续同一个 token，浏览器朗读会重建 current。
      }
    }

    // 3) 浏览器默认音色。
    return speakBrowser(text, token);
  }

  /** 重置离线引擎（重新加载模型 / 换设备 / 出错后重试）。 */
  function resetOffline() {
    offline.engine = null;
    offline.loading = null;
    offline.state = 'idle';
    offline.error = '';
    offline.progress = 0;
    if (offline.ctx && typeof offline.ctx.close === 'function') {
      try { offline.ctx.close(); } catch { /* 忽略 */ }
    }
    offline.ctx = null;
    emit();
    return offlineStatus();
  }

  const API = {
    DEFAULT_BASE, STORE_KEY, BUILTIN_VOICES: BUILTIN_VOICES.slice(),
    SUBJECTS, SUBJECT_KEYS, DEFAULT_SUBJECT_VOICES, MODES,
    classifyVoice, groupVoices, groupsForLang, normalize,
    detectLang, voiceLang, resolveVoice, pickAvailable,
    status, refresh, probe, configure, onChange, setDeps, setSubject,
    offlineStatus, effectiveMode, ensureOfflineEngine, resetOffline,
    speak, stop, speakBrowser, speakRemote, speakOffline
  };
  if (isNode) module.exports = API;
  if (root) root.ZhidaoVoice = API;

  // 页面加载时轻量探测一次；服务不存在只影响标记，朗读始终可用。
  if (!isNode && root && typeof root.document !== 'undefined') setTimeout(() => { refresh(); }, 0);
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
