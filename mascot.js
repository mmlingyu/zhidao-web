/* 知知 ZhiBot · 知岛 IP 伴学形象
   结构参考「词根机器人动画工坊」：SVG 部件 + 意图动画 + 可换装外观。 */
(function () {
  'use strict';

  const LOOK_KEY = 'zhidao-mascot-look-v1';
  const INTENTS = ['idle', 'think', 'speak', 'happy', 'sad', 'sleep', 'focus', 'transform', 'wave', 'walk'];
  const INTENT_LABELS = {
    idle: '待机 · 轻轻呼吸', think: '思考 · 天线闪烁', speak: '朗读 · 口型同步',
    happy: '开心 · 蹦跳庆祝', sad: '难过 · 轻轻摇头', sleep: '休眠 · 打瞌睡',
    focus: '专注 · 眼睛发亮', transform: '变身 · 切换学科', wave: '挥手 · 打招呼', walk: '行走 · 迈步'
  };
  const INTENT_MS = { idle: 0, think: 0, speak: 0, happy: 1800, sad: 1400, sleep: 0, focus: 2000, transform: 900, wave: 1600, walk: 2000 };
  const ALIASES = {
    breathe: 'idle', ponder: 'idle', thinking: 'think', talk: 'speak', talking: 'speak',
    success: 'happy', celebrate: 'happy', error: 'sad', fail: 'sad', sleeping: 'sleep',
    learn: 'focus', morph: 'transform', greet: 'wave', step: 'walk'
  };
  const HATS = ['auto', 'none', 'book', 'cap', 'visor', 'crown', 'propeller', 'leaf', 'halo'];
  const HAT_LABELS = { auto: '随学科', none: '不戴', book: '书页帽', cap: '学士帽', visor: '探究镜', crown: '小皇冠', propeller: '竹蜻蜓', leaf: '叶子', halo: '光环' };
  const SHOES = ['cloud', 'book', 'sneaker', 'roller', 'rocket', 'boat'];
  const SHOE_LABELS = { cloud: '云朵', book: '书舟', sneaker: '运动鞋', roller: '滑轮', rocket: '火箭', boat: '小船' };
  const EYES = ['round', 'star', 'line'];
  const EYE_LABELS = { round: '圆圆眼', star: '星星眼', line: '认真眼' };
  const SIZES = ['small', 'middle', 'big'];
  const SIZE_LABELS = { small: '小', middle: '中', big: '大' };
  const PALETTE = ['#7568D8', '#D9A441', '#4E9E7E', '#E0736B', '#4E8FD8', '#D879B5', '#5B8D8A', '#8C7B5A'];
  const SUBJECTS = {
    chinese: { color: '#D9A441', hat: 'book', glyph: '诗', label: '语文', tag: '表达素材' },
    english: { color: '#7568D8', hat: 'cap', glyph: 'A', label: '英语', tag: '语法辨析' },
    math: { color: '#4E9E7E', hat: 'visor', glyph: '∑', label: '数学', tag: '解题思维' }
  };
  const DEFAULT_LOOK = {
    name: '知知', colorMode: 'subject', customColor: '#7568D8',
    hat: 'auto', shoes: 'cloud', eyes: 'round', size: 'middle', amp: 0.85
  };
  const LINES = {
    welcome: '你好，我是知知！今天想先弄懂哪一个知识点？',
    loading: '让我先看看它属于哪一科，再挑最合适的讲法…',
    subject: {
      chinese: '这个词不只有一个说法：成语分强度，诗句给画面。',
      english: '别急着翻译，先看场景、搭配，再比较使用差别。',
      math: '同一道题，我们换三种站位：通法、技巧、结构。'
    },
    idiom: '这个表达有它自己的分寸，读读例句找感觉。',
    filter: '把同类表达放在一起，差别就更清楚了。',
    speak: '听我读一遍，注意节奏和重音。',
    writeGood: '写得真有画面！动作和细节都到位了。',
    writeHint: '再补一点动作、神情或环境，画面会更清楚。',
    quizRight: '选对了！场景和搭配对上了。',
    quizWrong: '没关系，我们再看一眼正确答案的用法。',
    quizNext: '下一题，先想场景，再做选择。',
    mathLevel: ['先走通法，一步一步来最稳。', '试着看见系数和根之间的关系。', '站高一点，从函数和结构看这道题。'],
    step: '先把注意力放在刚展开的这一步。',
    stepDone: '完整思路解锁啦，试着自己复述一遍。',
    challenge: '答案揭晓，看看和你想的是不是一样。',
    favorite: '收好啦，之后随时能回来复习。',
    share: '把这份讲解分享给同学吧！',
    followup: '让我想想，结合刚才那节课回答你…',
    editor: '换好新造型啦，我会用这个样子陪你上课。'
  };

  const esc = value => escapeHTML(String(value ?? ''));
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  function shade(hex, amount) {
    const n = parseInt(String(hex).slice(1), 16);
    const c = v => Math.max(0, Math.min(255, v | 0));
    return '#' + ((1 << 24) + (c((n >> 16) + amount) << 16) + (c((n >> 8 & 255) + amount) << 8) + c((n & 255) + amount)).toString(16).slice(1);
  }
  function normalize(raw) {
    const out = { ...DEFAULT_LOOK };
    if (!raw || typeof raw !== 'object') return out;
    if (typeof raw.name === 'string' && raw.name.trim()) out.name = raw.name.trim().slice(0, 12);
    if (['subject', 'custom'].includes(raw.colorMode)) out.colorMode = raw.colorMode;
    if (/^#[0-9a-f]{6}$/i.test(raw.customColor || '')) out.customColor = raw.customColor;
    if (HATS.includes(raw.hat)) out.hat = raw.hat;
    if (SHOES.includes(raw.shoes)) out.shoes = raw.shoes;
    if (EYES.includes(raw.eyes)) out.eyes = raw.eyes;
    if (SIZES.includes(raw.size)) out.size = raw.size;
    if (Number.isFinite(Number(raw.amp))) out.amp = clamp(Number(raw.amp), 0.25, 1.25);
    return out;
  }

  let look = normalize(readStorage(LOOK_KEY, null));
  let subject = 'chinese';
  let currentIntent = 'idle';
  let currentAmp = look.amp;
  let timer = null;
  let onDone = null;
  let phase = '';
  let lessonKey = '';
  let lastFollowup = '';
  let lip = { active: false, text: '', count: 0, ticker: null, closeTimer: null, boundaryTimer: null };
  let speechToken = 0;
  let voiceUnsubscribe = null;

  /* ---------------- 角色造型 ---------------- */
  function hatSVG(kind, c2, c3) {
    switch (kind) {
      case 'book': return `<g class="hat-layer"><path d="M24 30 Q37 19 50 27 Q63 19 76 30 L76 35 Q63 26 50 33 Q37 26 24 35Z" fill="${c3}"/><path d="M27 30 Q38 22 50 29 Q62 22 73 30" fill="none" stroke="#fff" stroke-width="1.4" opacity=".85"/></g>`;
      case 'cap': return `<g class="hat-layer"><path d="M24 30 L50 19 L76 30 L50 41Z" fill="${c3}"/><path d="M34 35 Q50 41 66 35 L66 41 Q50 46 34 41Z" fill="${c3}"/><line x1="76" y1="30" x2="76" y2="44" stroke="#FFD60A" stroke-width="1.5"/><circle cx="76" cy="45" r="2.4" fill="#FFD60A"/></g>`;
      case 'visor': return `<g class="hat-layer"><rect x="23" y="29" width="54" height="9" rx="4" fill="#2f3a4a"/><rect x="27" y="31" width="46" height="4" rx="2" fill="#7BE0C0" opacity=".9"/></g>`;
      case 'crown': return `<g class="hat-layer" fill="#F2C94C"><path d="M28 33 L32 17 L42 28 L50 13 L58 28 L68 17 L72 33Z"/><circle cx="50" cy="13" r="2.5" fill="#E0736B"/></g>`;
      case 'propeller': return `<g class="hat-layer"><circle cx="50" cy="15" r="3.5" fill="#8993a3"/><rect x="27" y="13" width="46" height="4" rx="2" fill="#E88AB6" transform="rotate(-18 50 15)"/></g>`;
      case 'leaf': return `<g class="hat-layer"><path d="M50 27 Q38 12 30 20 Q34 31 50 27Z" fill="#6BBF84"/><path d="M50 27 Q62 12 70 20 Q66 31 50 27Z" fill="#4E9E7E"/></g>`;
      case 'halo': return `<g class="hat-layer" fill="none" stroke="#FFD873" stroke-width="3"><ellipse cx="50" cy="20" rx="22" ry="6"/></g>`;
      default: return '';
    }
  }
  function shoeSVG(kind, side, c2, c3) {
    const x = side === 'l' ? 32 : 58;
    const fill = { cloud: '#DCEBF6', book: c3, sneaker: '#F2CB58', roller: '#7568D8', rocket: '#E0736B', boat: '#8C7B5A' }[kind] || '#DCEBF6';
    if (kind === 'cloud') return `<g class="shoe-layer"><ellipse cx="${x + 7}" cy="146" rx="12" ry="7" fill="${fill}" stroke="#AFC9DC" stroke-width="1"/><ellipse cx="${x + 3}" cy="143" rx="6" ry="5" fill="#fff" opacity=".7"/></g>`;
    if (kind === 'roller') return `<g class="shoe-layer"><rect x="${x}" y="140" width="15" height="8" rx="3" fill="${fill}"/><circle cx="${x + 3}" cy="150" r="3" fill="#2f3a4a"/><circle cx="${x + 12}" cy="150" r="3" fill="#2f3a4a"/></g>`;
    if (kind === 'rocket') return `<g class="shoe-layer"><path d="M${x} 139 h15 l-2 12 h-11z" fill="${fill}"/><path d="M${x + 3} 151 l4 7 l4-7" fill="#FFD60A"/></g>`;
    if (kind === 'boat') return `<g class="shoe-layer"><path d="M${x - 2} 140 h19 l-4 10 h-11z" fill="${fill}"/><path d="M${x + 7} 140 v-9 h7 l-7 5" fill="#fff" stroke="${c2}" stroke-width="1"/></g>`;
    if (kind === 'book') return `<g class="shoe-layer"><path d="M${x - 1} 141 q7 -5 8 0 q1 -5 8 0 v8 q-7 -4 -8 0 q-1 -4 -8 0z" fill="#fff" stroke="${c3}" stroke-width="1.2"/></g>`;
    return `<g class="shoe-layer"><rect x="${x}" y="140" width="15" height="10" rx="3" fill="${fill}"/><rect x="${x - 2}" y="147" width="11" height="4" rx="1" fill="${shade(fill, -30)}"/></g>`;
  }
  function pupilSVG(style) {
    if (style === 'star') return `<path class="pupil" d="M0 -3.4 L1 -1.1 3.4 -.9 1.3 .9 0 3.4 -1.3 .9 -3.4 -.9 -1 -1.1Z" fill="#28384a"/><circle class="pupil hl" r=".8" cx="-.7" cy="-1" fill="#fff"/>`;
    if (style === 'line') return `<rect class="pupil" x="-3.2" y="-1.5" width="6.4" height="3" rx="1.5" fill="#28384a"/>`;
    return `<circle class="pupil" r="2.9" fill="#28384a"/><circle class="pupil hl" r=".9" cx="-1" cy="-1.2" fill="#fff"/>`;
  }
  function eyesSVG(style, c) {
    const eye = x => `<g transform="translate(${x} 46)"><ellipse rx="5.6" ry="6.1" fill="#E4F2FF" stroke="${shade(c, -40)}" stroke-width="1"/>${pupilSVG(style)}<ellipse class="lid" rx="5.9" ry="6.4" fill="${c}"/></g>`;
    return `<g class="eyes">${eye(40)}${eye(60)}</g>`;
  }
  function buildSVG() {
    const theme = SUBJECTS[subject] || SUBJECTS.chinese;
    const c = look.colorMode === 'custom' ? look.customColor : theme.color;
    const c2 = shade(c, 45);
    const c3 = shade(c, -50);
    const hat = look.hat === 'auto' ? theme.hat : look.hat;
    return `<div class="zd-scale s-${look.size}"><svg class="zd-svg ${currentIntent}" viewBox="0 0 100 160" preserveAspectRatio="xMidYMid meet" role="img" aria-label="知岛伴学形象知知">
  <ellipse cx="50" cy="154" rx="28" ry="4" fill="#4a4560" opacity=".14"/>
  <g class="rig">
    <g class="leg-l"><rect x="34" y="112" width="10" height="28" rx="4" fill="${c3}"/>${shoeSVG(look.shoes, 'l', c2, c3)}</g>
    <g class="leg-r"><rect x="56" y="112" width="10" height="28" rx="4" fill="${c3}"/>${shoeSVG(look.shoes, 'r', c2, c3)}</g>
    <g class="chest">
      <rect x="28" y="72" width="44" height="44" rx="11" fill="${c}"/>
      <rect x="33" y="78" width="34" height="27" rx="5" fill="#FBFDFF" stroke="${c2}" stroke-width="1.5"/>
      <circle class="chest-led" cx="41" cy="84" r="2" fill="#57C98A"/>
      <circle class="chest-led" cx="50" cy="84" r="2" fill="#F2CB58"/>
      <circle class="chest-led" cx="59" cy="84" r="2" fill="#E88A80"/>
      <text x="50" y="99" text-anchor="middle" font-size="11" font-weight="700" fill="${c3}" font-family="Georgia,serif">${theme.glyph}</text>
    </g>
    <g class="arm-l"><rect x="14" y="76" width="16" height="9" rx="4" fill="${c3}"/><circle cx="16" cy="80" r="5" fill="${c2}"/></g>
    <g class="arm-r"><rect x="70" y="76" width="16" height="9" rx="4" fill="${c3}"/><circle cx="84" cy="80" r="5" fill="${c2}"/></g>
    <g class="head-grp">
      <g class="antenna">
        <line x1="50" y1="28" x2="50" y2="13" stroke="${c3}" stroke-width="2.5" stroke-linecap="round"/>
        <g class="antenna-tip"><circle cx="50" cy="9" r="5" fill="#F2CB58" stroke="#fff" stroke-width="1"/><path d="M50 4 V1" stroke="#6E7A5A" stroke-width="1.2"/><path d="M50 1 l7 2.2 -7 2.2Z" fill="#E0736B"/></g>
      </g>
      ${hatSVG(hat, c2, c3)}
      <rect x="26" y="28" width="48" height="42" rx="14" fill="${c}"/>
      <rect x="26" y="28" width="48" height="42" rx="14" fill="none" stroke="${c3}" stroke-width="1.4" opacity=".45"/>
      <rect x="31" y="38" width="38" height="17" rx="7" fill="#EAF4FF" stroke="${c2}" stroke-width="1.2"/>
      ${eyesSVG(look.eyes, c)}
      <circle cx="33" cy="58" r="3" fill="#F2A0AF" opacity=".8"/>
      <circle cx="67" cy="58" r="3" fill="#F2A0AF" opacity=".8"/>
      <g class="jaw"><ellipse cx="50" cy="64" rx="7" ry="3.5" fill="#2b3a49"/></g>
      <g class="voice-wave" fill="none" stroke="${c2}" stroke-width="1.8" stroke-linecap="round"><path d="M77 57 q5 6 0 12"/><path d="M82 53 q9 10 0 20"/><path d="M87 49 q13 14 0 28"/></g>
    </g>
  </g>
  <g class="dots" fill="${c3}"><circle cx="78" cy="8" r="3"/><circle cx="88" cy="8" r="3"/><circle cx="98" cy="8" r="3"/></g>
  <text class="zz" x="78" y="22" font-size="14" fill="${c3}" font-weight="700">z</text>
  <g class="spark" fill="#F2CB58"><path d="M10 20 l2.5 6 6 2.5 -6 2.5 -2.5 6 -2.5-6 -6-2.5 6-2.5z"/><path d="M88 40 l2 4 4 2 -4 2 -2 4 -2-4 -4-2 4-2z"/><path d="M18 70 l1.5 3.5 3.5 1.5 -3.5 1.5 -1.5 3.5 -1.5-3.5 -3.5-1.5 3.5-1.5z"/></g>
  <g class="burst" fill="none" stroke="#F2CB58" stroke-width="2"><circle cx="50" cy="80" r="42"/></g>
</svg></div>`;
  }

  /* ---------------- 渲染与动画控制 ---------------- */
  function applyAmp(value) {
    currentAmp = clamp(value, 0.25, 1.25);
    document.documentElement.style.setProperty('--zd-amp', String(currentAmp));
    $$('.zd-svg').forEach(svg => svg.style.setProperty('--zd-amp', String(currentAmp)));
  }
  function renderHosts() {
    $$('[data-zd-host]').forEach(host => { host.innerHTML = buildSVG(); });
    applyAmp(currentAmp);
    updateNames();
  }
  function updateNames() {
    $$('.zd-name, #zd-dock-name').forEach(el => { el.textContent = look.name; });
  }
  function updateLabels() {
    $$('#zd-action-label').forEach(el => { el.textContent = INTENT_LABELS[currentIntent] || ''; });
  }
  function setIntentClass(intent) {
    currentIntent = INTENTS.includes(intent) ? intent : 'idle';
    $$('.zd-svg').forEach(svg => {
      INTENTS.forEach(key => svg.classList.remove(key));
      svg.classList.add(currentIntent);
    });
    updateLabels();
  }
  function say(text) {
    const line = String(text || '');
    $$('#zd-line').forEach(el => { el.textContent = line; });
    $$('#zd-dock-line').forEach(el => { el.textContent = line; });
  }

  /* ---------------- 朗读口型同步 ----------------
     真实朗读：SpeechSynthesisUtterance 的 onboundary 每读到一个词/字就驱动一次张合；
     不支持 boundary 的浏览器自动降级为按文本节拍的模拟口型，任何时候都有嘴部动作。 */
  function lipReset() {
    lip.active = false;
    if (lip.ticker) { clearInterval(lip.ticker); lip.ticker = null; }
    if (lip.closeTimer) { clearTimeout(lip.closeTimer); lip.closeTimer = null; }
    if (lip.boundaryTimer) { clearTimeout(lip.boundaryTimer); lip.boundaryTimer = null; }
    $$('.zd-svg').forEach(svg => {
      svg.classList.remove('lipsync', 'speaking-now');
      svg.querySelectorAll('.jaw').forEach(jaw => jaw.style.removeProperty('--zd-mouth'));
    });
  }
  function opennessAt(text, index) {
    const ch = String(text || '').charAt(Math.max(0, index)) || '';
    if (/[\s，。！？、,.!?;:；：—…\n]/.test(ch)) return 0.18;
    if (/[AEIOUaeiou]/.test(ch)) return 1.02 + Math.random() * 0.3;
    if (/[BMPFbmpf]/.test(ch)) return 0.3 + Math.random() * 0.12;
    return 0.58 + Math.random() * 0.42;
  }
  function lipOpen(value, holdMs) {
    $$('.zd-svg').forEach(svg => {
      svg.classList.add('lipsync', 'speaking-now');
      svg.querySelectorAll('.jaw').forEach(jaw => jaw.style.setProperty('--zd-mouth', String(value)));
    });
    clearTimeout(lip.closeTimer);
    lip.closeTimer = setTimeout(() => {
      $$('.zd-svg .jaw').forEach(jaw => jaw.style.setProperty('--zd-mouth', '.2'));
    }, holdMs || 115);
  }
  function startLipTicker() {
    if (lip.ticker || !lip.active) return;
    const text = lip.text || '知知正在为你朗读，注意节奏和重音';
    let i = 0;
    const tick = () => { lipOpen(opennessAt(text, i % Math.max(1, text.length)), 145); i += 1; };
    tick();
    lip.ticker = setInterval(tick, 165);
  }
  function armLip(text, simulated) {
    lipReset();
    lip.active = true;
    lip.text = String(text || '');
    lip.count = 0;
    if (simulated) startLipTicker();
    else lip.boundaryTimer = setTimeout(() => { if (lip.active && lip.count === 0) startLipTicker(); }, 800);
  }
  function lipBoundary(event, token) {
    if (!lip.active || (token && token !== speechToken)) return;
    lip.count += 1;
    if (lip.boundaryTimer) { clearTimeout(lip.boundaryTimer); lip.boundaryTimer = null; }
    if (lip.ticker) { clearInterval(lip.ticker); lip.ticker = null; }
    const index = Number.isFinite(event?.charIndex) ? event.charIndex : lip.count - 1;
    const hold = clamp(80 + (Number(event?.charLength) || 1) * 45, 85, 200);
    lipOpen(opennessAt(lip.text, index), hold);
  }
  function startSpeech(text, opts = {}) {
    speechToken += 1;
    interrupt();
    armLip(text, false);
    setIntentClass('speak');
    applyAmp(0.4 + clamp(opts.intensity ?? 0.9, 0, 1) * 0.85);
    if (opts.line) say(opts.line);
    return speechToken;
  }
  function stopSpeech(token, opts = {}) {
    if (token && token !== speechToken) return API;
    if (!lip.active) return API;
    lipReset();
    setIntentClass('idle');
    applyAmp(0.5);
    if (opts.line) say(opts.line);
    return API;
  }

  function play(intent, opts = {}) {
    const norm = INTENTS.includes(intent) ? intent : (ALIASES[intent] || 'idle');
    interrupt();
    lipReset();
    applyAmp(0.35 + clamp(opts.intensity ?? 0.85, 0, 1) * 0.9);
    setIntentClass(norm);
    $$('.zd-svg').forEach(svg => {
      svg.querySelectorAll('.rig, .head-grp, .jaw, .chest, .arm-l, .arm-r, .leg-l, .leg-r, .eyes, .antenna-tip, .spark, .burst, .dots circle, .zz').forEach(el => {
        el.style.animation = 'none';
        void el.getBoundingClientRect();
        el.style.animation = '';
      });
    });
    if (opts.line) say(opts.line);
    if (norm === 'speak') { lip.active = true; lip.text = String(opts.line || ''); lip.count = 0; startLipTicker(); }
    onDone = typeof opts.onDone === 'function' ? opts.onDone : null;
    const duration = opts.durationMs ?? INTENT_MS[norm];
    const loop = opts.loop === true || (opts.loop === undefined && duration === 0);
    if (!loop && duration > 0) {
      timer = setTimeout(() => {
        lipReset();
        setIntentClass('idle');
        applyAmp(0.5);
        const cb = onDone; onDone = null; cb && cb();
      }, duration);
    }
    return API;
  }
  function interrupt() {
    if (timer) { clearTimeout(timer); timer = null; }
    onDone = null;
    return API;
  }
  function setSubject(next) {
    if (!SUBJECTS[next]) return API;
    subject = next;
    const theme = SUBJECTS[next];
    $$('#zd-subject-tag').forEach(el => {
      el.className = `zd-subject-tag ${next === 'chinese' ? '' : next}`;
      el.textContent = `${theme.label} · ${theme.tag}`;
    });
    // 语音模块同步当前学科：英语课读英文时用英文音色，语文/数学用中文音色。
    try {
      const V = window.ZhidaoVoice;
      if (V && typeof V.setSubject === 'function') V.setSubject(next);
    } catch { /* 语音模块异常不影响形象切换 */ }
    renderHosts();
    return API;
  }
  function update(patch) {
    look = normalize({ ...look, ...patch });
    applyAmp(look.amp);
    renderHosts();
    writeStorage(LOOK_KEY, look);
    syncEditor();
    return API;
  }
  function reset() { return update({ ...DEFAULT_LOOK }); }
  function randomize() {
    const pick = arr => arr[Math.floor(Math.random() * arr.length)];
    return update({
      colorMode: Math.random() < 0.5 ? 'subject' : 'custom',
      customColor: pick(PALETTE), hat: pick(HATS), shoes: pick(SHOES),
      eyes: pick(EYES), size: pick(SIZES), amp: 0.7 + Math.random() * 0.5
    });
  }

  /* ---------------- 形象编辑器 ---------------- */
  const chipRow = (attr, items, current, labels) => `<div class="zd-chips">${items.map(key => `<button type="button" data-${attr}="${key}" class="${current === key ? 'on' : ''}">${labels[key]}</button>`).join('')}</div>`;

  /* 音色配置：全部男女音色来自 voice.js（服务在线时取实时清单，离线时取内置 103 个）。
   * 这里只负责展示与交互，播放与回退逻辑全部在 voice.js，保证全局朗读口径一致。
   * 学科音色：语文 / 数学只列中文音色，英语只列英文音色，避免出现「中文音色念英文」的搭配。 */
  function voiceOptionsHTML(st, groups) {
    const list = groups && groups.length ? groups : (st.groups || []);
    return list.map(group => `<optgroup label="${esc(group.label)}（${group.count}）">${group.items.map(item =>
      `<option value="${esc(item.id)}">${esc(item.label)} · ${esc(item.id)}</option>`).join('')}</optgroup>`).join('');
  }

  /** 学科槽位 → 试听用的一句代表性文本（英语槽位必须用英文句子才能听出音色差异）。 */
  const SUBJECT_SAMPLES = {
    chinese: '你好，我是知知，以后我会用这个声音陪你学语文。',
    english: "Hi, I'm ZhiZhi. I'll use this voice for your English lessons.",
    math: '你好，我是知知，这道题我们一步一步拆开来看。'
  };

  /** 某个学科的音色下拉内容：中文槽位可选「跟随默认音色」，英语槽位固定英文音色。 */
  function subjectVoiceOptionsHTML(st, key) {
    const V = window.ZhidaoVoice;
    const meta = (V && V.SUBJECTS) || {};
    const info = meta[key] || { label: key, lang: 'zh' };
    const groups = (st && st.subjectGroups && st.subjectGroups[key]) || [];
    const current = (st && st.subjectVoices && st.subjectVoices[key]) || 'auto';
    const defaultVoice = (st && st.voice) || 'zf_001';
    // 语文 / 数学允许「跟随默认音色」；英语固定英文音色（跟随默认会变成中文口音）。
    const head = info.follow === false ? '' :
      `<option value="auto"${current === 'auto' ? ' selected' : ''}>跟随默认音色（${esc(defaultVoice)}）</option>`;
    const ids = groups.flatMap(group => group.items.map(item => item.id));
    // 配置里的音色若不在当前语种分组内（例如服务升级改名），仍然保留可选项。
    const keep = current && current !== 'auto' && !ids.includes(current)
      ? `<option value="${esc(current)}" selected>${esc(current)}</option>` : '';
    return `${head}${keep}${groups.length ? voiceOptionsHTML(st, groups) : ''}`;
  }

  function subjectVoiceRows(st) {
    const V = window.ZhidaoVoice;
    const keys = V && V.SUBJECT_KEYS ? V.SUBJECT_KEYS : ['chinese', 'english', 'math'];
    const meta = (V && V.SUBJECTS) || {};
    return keys.map(key => {
      const info = meta[key] || { label: key, lang: 'zh' };
      return `<div class="zd-subject-voice" data-zd-subject-voice="${esc(key)}">
          <span class="zd-subject-voice-name">${esc(info.label)}</span>
          <select class="zd-voice-select zd-subject-voice-select" id="zd-subject-voice-${esc(key)}" data-zd-subject-voice-select="${esc(key)}" aria-label="${esc(info.label)}音色">${subjectVoiceOptionsHTML(st, key)}</select>
          <button type="button" class="zd-subject-voice-preview" data-zd-subject-preview="${esc(key)}">试听</button>
        </div>`;
    }).join('');
  }

  function syncVoiceEditor() {
    const body = $('#modal-body');
    if (!body || !$('#zd-voice-field', body)) return;
    const V = window.ZhidaoVoice;
    if (!V) {
      const offline = $('#zd-voice-hint', body);
      if (offline) offline.textContent = '语音模块未加载，当前使用浏览器默认音色。';
      return;
    }
    const st = V.status();
    $$('[data-zd-voice-mode]', body).forEach(b => b.classList.toggle('on', b.dataset.zdVoiceMode === st.mode));
    const select = $('#zd-voice-select', body);
    if (select) {
      const signature = `${st.count}|${st.voices.join(',')}`;
      if (select.dataset.signature !== signature) {
        select.innerHTML = voiceOptionsHTML(st);
        select.dataset.signature = signature;
      }
      if (st.voices.includes(st.voice)) select.value = st.voice;
      select.disabled = st.mode === 'browser';
    }
    // 学科音色下拉：清单随服务变化刷新，值跟随当前配置。
    $$('[data-zd-subject-voice-select]', body).forEach(node => {
      const key = node.dataset.zdSubjectVoiceSelect;
      const groups = (st.subjectGroups && st.subjectGroups[key]) || [];
      const signature = `${key}|${st.count}|${st.voice}|${groups.map(g => g.key).join(',')}`;
      if (node.dataset.signature !== signature) {
        node.innerHTML = subjectVoiceOptionsHTML(st, key);
        node.dataset.signature = signature;
      }
      const current = st.subjectVoices && st.subjectVoices[key];
      if (current && node.value !== current) node.value = current;
      node.disabled = st.mode === 'browser';
    });
    const base = $('#zd-voice-base', body);
    if (base && document.activeElement !== base && base.value !== st.base) base.value = st.base;
    const state = $('#zd-voice-state', body);
    if (state) state.textContent = voiceStateText(st);
    const hint = $('#zd-voice-hint', body);
    if (hint) {
      hint.textContent = voiceHintText(st);
      hint.classList.toggle('offline', st.mode !== 'browser' && st.effective === 'browser');
    }
    const subjectHint = $('#zd-voice-subject-hint', body);
    if (subjectHint) {
      subjectHint.textContent = '英语课用英语音色，语文与数学默认跟随上面的主音色；读到中文讲解时自动换回中文口音。';
      subjectHint.classList.remove('offline');
    }
  }

  /** 状态行：离线引擎与本地服务各说各的，别让用户猜当前到底谁来发声。 */
  function voiceStateText(st) {
    if (st.mode === 'browser') return '浏览器自带音色 · 无需任何服务';
    if (st.mode === 'offline') {
      const off = st.offline || {};
      if (off.state === 'ready') return `离线引擎就绪 · ${off.device || 'cpu'}`;
      if (off.state === 'loading') return `离线引擎加载中 ${Math.round(off.progress || 0)}%`;
      if (off.state === 'failed') return `离线引擎不可用 · 已回退${st.available ? '本地服务' : '浏览器默认'}`;
      return '离线引擎未加载 · 首次朗读时自动加载';
    }
    return st.available ? `语音服务已连接 · ${st.count} 个音色` : '语音服务未连接 · 已回退浏览器默认';
  }

  function voiceHintText(st) {
    if (st.mode === 'browser') return '当前用浏览器自带音色朗读，零依赖、零下载。';
    if (st.mode === 'offline') {
      const off = st.offline || {};
      if (off.state === 'failed') return `离线引擎不可用（${off.error || '未知原因'}），已自动切到${st.available ? '本地语音服务' : '浏览器默认音色'}。`;
      if (off.state === 'ready') return '知知在本机浏览器里合成语音，不联网、不依赖外部服务；模型已就绪，朗读零延迟等待。';
      if (off.state === 'loading') return `正在准备离线语音模型（${Math.round(off.progress || 0)}%），完成后立即可用。`;
      return '知知将在本机浏览器里合成语音：模型与音色都从本站读取，第一次朗读会先下载模型，之后完全离线。';
    }
    if (!st.available) return '没找到语音服务或地址不可达，朗读已自动切回浏览器默认音色。可修改服务地址后重试。';
    return st.effective === 'tts'
      ? '全局朗读都用这个音色（讲解、诗句、练习、游戏组件），改完立即生效；服务断开会自动切回默认。'
      : '当前用浏览器默认音色；切到「知知语音服务」并选好音色后全局生效。';
  }

  function editorHTML() {
    const V = window.ZhidaoVoice;
    const vst = V ? V.status() : null;
    const voiceSelect = vst ? voiceOptionsHTML(vst) : '<option value="zf_001">浏览器默认音色</option>';
    return `<div class="zd-ip-card"><h4>IP 设定 · 知知 ZhiBot</h4><p>住在书页里的小岛引路员，头顶是「知识小岛」天线，胸屏会随学科切换符号。性格：先思考，再开口；遇到你答对就开心蹦跳，答错会轻轻摇头陪你再看一遍。</p><div class="zd-ip-legend"><span>语文 · 墨金 / 诗 / 书页帽</span><span>英语 · 知岛紫 / A / 学士帽</span><span>数学 · 青绿 / ∑ / 探究镜</span></div></div>
    <div class="zd-editor">
      <div class="zd-editor-preview"><div class="zd-host" data-zd-host data-zd-size="editor"></div><small>实时预览 · 所有讲解页同步</small></div>
      <div class="zd-editor-form">
        <div class="zd-field"><label>名字 NAME</label><input type="text" id="zd-name-input" maxlength="12" value="${esc(look.name)}"></div>
        <div class="zd-field"><label>配色 COLOR</label>${chipRow('zd-color-mode', ['subject', 'custom'], look.colorMode, { subject: '随学科', custom: '自定义' })}
          <div class="zd-swatches" style="margin-top:8px">${PALETTE.map(color => `<button type="button" class="zd-swatch ${look.customColor.toLowerCase() === color.toLowerCase() ? 'on' : ''}" data-zd-color="${color}" style="background:${color}" aria-label="选择颜色"></button>`).join('')}<input class="zd-color-input" type="color" id="zd-color-picker" value="${esc(look.customColor)}" aria-label="自定义颜色"></div></div>
        <div class="zd-field"><label>头饰 HAT</label>${chipRow('zd-hat', HATS, look.hat, HAT_LABELS)}</div>
        <div class="zd-field"><label>鞋子 SHOES</label>${chipRow('zd-shoes', SHOES, look.shoes, SHOE_LABELS)}</div>
        <div class="zd-field"><label>眼睛 EYES</label>${chipRow('zd-eyes', EYES, look.eyes, EYE_LABELS)}</div>
        <div class="zd-field"><label>体型 SIZE</label>${chipRow('zd-size-choice', SIZES, look.size, SIZE_LABELS)}</div>
        <div class="zd-field"><label>动作强度 · <span id="zd-amp-value">${Math.round(look.amp * 100)}%</span></label><input class="zd-range" type="range" id="zd-amp-range" min="25" max="125" value="${Math.round(look.amp * 100)}"></div>
        <div class="zd-field"><label>动作预览 ACTION</label><div class="zd-chips">${INTENTS.map(key => `<button type="button" data-zd-intent="${key}">${INTENT_LABELS[key].split(' · ')[0]}</button>`).join('')}</div></div>
        <div class="zd-field" id="zd-voice-field"><label>音色 VOICE · <span id="zd-voice-state">正在检测语音服务…</span></label>
          <div class="zd-chips"><button type="button" data-zd-voice-mode="offline" class="${!vst || vst.mode !== 'tts' && vst.mode !== 'browser' ? 'on' : ''}">离线语音（浏览器合成）</button><button type="button" data-zd-voice-mode="tts" class="${vst && vst.mode === 'tts' ? 'on' : ''}">本地语音服务</button><button type="button" data-zd-voice-mode="browser" class="${vst && vst.mode === 'browser' ? 'on' : ''}">浏览器默认</button></div>
          <select class="zd-voice-select" id="zd-voice-select" aria-label="选择音色">${voiceSelect}</select>
          <div class="zd-voice-tools"><button type="button" data-zd-action="preview-voice">试听一下</button><button type="button" data-zd-action="preload-offline">预加载模型</button><input type="text" id="zd-voice-base" value="${esc(vst ? vst.base : 'http://127.0.0.1:8880')}" aria-label="语音服务地址" spellcheck="false"></div>
          <small class="zd-voice-hint" id="zd-voice-hint">正在检测语音服务，没连上会自动使用浏览器默认音色。</small>
          <div class="zd-subject-voices">
            <div class="zd-subject-voices-title">按学科配音 · 知知会随学科换口音</div>
            ${subjectVoiceRows(vst)}
            <small class="zd-voice-hint" id="zd-voice-subject-hint">英语课默认用英文音色，语文与数学默认跟随上面的主音色。</small>
          </div></div>
        <div class="zd-editor-note">形象保存在本机浏览器，换颜色、配件、体型后，页面上的伴学形象与动画会立即同步。「随学科」会在语文 / 英语 / 数学讲解时自动换色换帽。音色独立保存，对所有朗读入口生效；语音服务不可用时自动回退。</div>
        <div class="zd-editor-actions"><button type="button" class="primary" data-zd-action="save">保存形象</button><button type="button" data-zd-action="random">随机搭配</button><button type="button" data-zd-action="reset">恢复默认</button></div>
      </div>
    </div>`;
  }
  function syncEditor() {
    const body = $('#modal-body');
    if (!body || !$('.zd-editor', body)) return;
    $$('[data-zd-color-mode]', body).forEach(b => b.classList.toggle('on', b.dataset.zdColorMode === look.colorMode));
    $$('[data-zd-hat]', body).forEach(b => b.classList.toggle('on', b.dataset.zdHat === look.hat));
    $$('[data-zd-shoes]', body).forEach(b => b.classList.toggle('on', b.dataset.zdShoes === look.shoes));
    $$('[data-zd-eyes]', body).forEach(b => b.classList.toggle('on', b.dataset.zdEyes === look.eyes));
    $$('[data-zd-size-choice]', body).forEach(b => b.classList.toggle('on', b.dataset.zdSizeChoice === look.size));
    $$('[data-zd-color]', body).forEach(b => b.classList.toggle('on', b.dataset.zdColor.toLowerCase() === look.customColor.toLowerCase()));
    const nameInput = $('#zd-name-input', body);
    if (nameInput && nameInput.value !== look.name && document.activeElement !== nameInput) nameInput.value = look.name;
    const range = $('#zd-amp-range', body);
    if (range) { range.value = String(Math.round(look.amp * 100)); const label = $('#zd-amp-value', body); if (label) label.textContent = `${Math.round(look.amp * 100)}%`; }
    const picker = $('#zd-color-picker', body);
    if (picker && picker.value.toLowerCase() !== look.customColor.toLowerCase()) picker.value = look.customColor;
  }
  function openEditor() {
    openModal('形象工坊 · 我的知知', 'IP 形象编辑', editorHTML());
    renderHosts();
    syncEditor();
    syncVoiceEditor();
    // 语音模块状态变化（离线引擎加载进度、服务上下线）实时反映到工坊。
    const V = window.ZhidaoVoice;
    if (V && typeof V.onChange === 'function') {
      if (voiceUnsubscribe) voiceUnsubscribe();
      voiceUnsubscribe = V.onChange(() => syncVoiceEditor());
    }
    // 每次打开工坊重新探测一次，服务刚启动 / 刚关掉都能立刻反映到状态行。
    if (V && typeof V.refresh === 'function') V.refresh();
  }

  /* ---------------- 讲解联动 ---------------- */
  function syncFromDOM() {
    const content = $('#lesson-content');
    if (!content) return;
    if ($('.ai-loading', content)) {
      if (phase !== 'loading') {
        phase = 'loading';
        API.play('think', { loop: true, intensity: 0.9, line: LINES.loading });
      }
      return;
    }
    const banner = $('.topic-banner', content);
    if (banner) {
      const next = ['chinese', 'english', 'math'].find(key => banner.classList.contains(key)) || 'chinese';
      const title = ($('#lesson-heading')?.textContent || '').trim();
      const key = `${next}|${title}`;
      if (key !== lessonKey) {
        lessonKey = key;
        lastFollowup = '';
        API.setSubject(next);
        API.play('transform', {
          intensity: 1, line: LINES.subject[next], durationMs: 900,
          onDone: () => API.play('speak', { intensity: 0.8, durationMs: 3200 })
        });
      }
      phase = 'lesson';
    }
    const answerNode = $('#followup-answer', content);
    const answer = answerNode ? answerNode.textContent.trim() : '';
    if (answer && answer !== lastFollowup) {
      lastFollowup = answer;
      API.play('speak', { intensity: 0.85, durationMs: 3200, line: `结合这节课：${answer.slice(0, 56)}${answer.length > 56 ? '…' : ''}` });
    }
  }
  function onDocumentClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const hit = selector => target.closest(selector);

    const action = hit('[data-zd-action]');
    if (action) {
      const kind = action.dataset.zdAction;
      if (kind === 'save') { showToast('形象已保存，知知会用新造型陪你上课'); closeModal(); }
      if (kind === 'random') { randomize(); API.play('transform', { intensity: 1, durationMs: 900, line: '换一身新搭配，感觉怎么样？' }); }
      if (kind === 'reset') { reset(); showToast('已恢复知知的默认造型'); }
      if (kind === 'preview-voice') {
        const V = window.ZhidaoVoice;
        if (V && typeof V.speak === 'function') V.speak('你好，我是知知，以后我会用这个声音陪你上课。').catch(() => {});
        else showToast('语音模块未加载，无法试听');
      }
      if (kind === 'preload-offline') {
        const V = window.ZhidaoVoice;
        if (!V || typeof V.ensureOfflineEngine !== 'function') { showToast('语音模块未加载'); return; }
        showToast('正在准备离线语音模型，首次需要下载模型文件…');
        Promise.resolve(V.ensureOfflineEngine())
          .then(() => { showToast('离线语音模型已就绪，知知可以离线说话了'); syncVoiceEditor(); })
          .catch(error => { showToast(`离线模型准备失败：${(error && error.message) || error}`); syncVoiceEditor(); });
        return;
      }
      return;
    }
    const subjectPreview = hit('[data-zd-subject-preview]');
    if (subjectPreview) {
      const V = window.ZhidaoVoice;
      if (!V || typeof V.speak !== 'function') { showToast('语音模块未加载，无法试听'); return; }
      const key = subjectPreview.dataset.zdSubjectPreview;
      const voice = (V.status().subjectVoices || {})[key];
      const opts = voice && voice !== 'auto' ? { subject: key, voice } : { subject: key };
      V.speak(SUBJECT_SAMPLES[key] || SUBJECT_SAMPLES.chinese, opts).catch(() => {});
      return;
    }
    const voiceMode = hit('[data-zd-voice-mode]');
    if (voiceMode) {
      const V = window.ZhidaoVoice;
      const mode = voiceMode.dataset.zdVoiceMode;
      if (V && typeof V.configure === 'function') {
        V.configure({ mode });
        if (mode === 'tts') V.refresh();
        showToast(mode === 'offline' ? '已切换到离线语音，知知在本机浏览器里说话'
          : mode === 'tts' ? '已切换到本地语音服务' : '已切回浏览器默认音色');
      }
      return;
    }
    const colorMode = hit('[data-zd-color-mode]');
    if (colorMode) { update({ colorMode: colorMode.dataset.zdColorMode }); return; }
    const swatch = hit('[data-zd-color]');
    if (swatch) { update({ colorMode: 'custom', customColor: swatch.dataset.zdColor }); return; }
    const hat = hit('[data-zd-hat]'); if (hat) { update({ hat: hat.dataset.zdHat }); return; }
    const shoes = hit('[data-zd-shoes]'); if (shoes) { update({ shoes: shoes.dataset.zdShoes }); return; }
    const eyes = hit('[data-zd-eyes]'); if (eyes) { update({ eyes: eyes.dataset.zdEyes }); return; }
    const size = hit('[data-zd-size-choice]'); if (size) { update({ size: size.dataset.zdSizeChoice }); return; }
    const intentBtn = hit('[data-zd-intent]');
    if (intentBtn) { API.play(intentBtn.dataset.zdIntent, { intensity: 0.95 }); return; }
    if (hit('#zd-edit-button') || hit('[data-zd-open-editor]') || hit('#zd-top-editor')) { openEditor(); return; }
    if (hit('#zd-toggle-dock')) {
      const dock = $('#zd-dock');
      dock.classList.toggle('collapsed');
      const btn = $('#zd-toggle-dock');
      btn.textContent = dock.classList.contains('collapsed') ? '展开' : '收起';
      return;
    }

    if (hit('#start-button') || hit('[data-topic]')) { API.play('think', { loop: true, intensity: 0.9, line: LINES.loading }); return; }
    if (hit('#favorite-button')) { API.play('happy', { intensity: 0.9, line: LINES.favorite }); return; }
    if (hit('#share-button')) { API.play('wave', { intensity: 0.9, line: LINES.share }); return; }
    if (hit('[data-speak]')) {
      // 正常情况由 bindSpeech 的语音事件驱动口型；仅在浏览器完全不支持朗读时兜底。
      if (!('speechSynthesis' in window)) API.play('speak', { intensity: 0.85, durationMs: 1800, line: LINES.speak });
      return;
    }
    if (hit('[data-ai-idiom]') || hit('[data-idiom]')) { API.play('focus', { intensity: 0.85, durationMs: 1800, line: LINES.idiom }); return; }
    if (hit('[data-ai-filter]') || hit('[data-filter]')) { API.play('think', { intensity: 0.8, durationMs: 1600, line: LINES.filter }); return; }
    if (hit('#check-ai-writing') || hit('#check-writing')) {
      const feedback = $('#practice-feedback');
      const good = feedback && feedback.classList.contains('good');
      API.play(good ? 'happy' : 'think', { intensity: 0.85, durationMs: good ? 1800 : 1600, line: good ? LINES.writeGood : LINES.writeHint });
      return;
    }
    const answerBtn = hit('[data-ai-answer]') || hit('[data-answer]');
    if (answerBtn) {
      const correct = !answerBtn.classList.contains('wrong');
      API.play(correct ? 'happy' : 'sad', { intensity: 0.9, durationMs: correct ? 1800 : 1400, line: correct ? LINES.quizRight : LINES.quizWrong });
      return;
    }
    if (hit('#ai-quiz-next') || hit('#quiz-next')) { API.play('focus', { intensity: 0.8, durationMs: 1600, line: LINES.quizNext }); return; }
    const levelBtn = hit('[data-ai-level]') || hit('[data-level]');
    if (levelBtn) {
      const index = clamp(Number(levelBtn.dataset.aiLevel ?? levelBtn.dataset.level ?? 0), 0, 2);
      API.play('transform', { intensity: 0.95, durationMs: 900, line: LINES.mathLevel[index] });
      return;
    }
    if (hit('#ai-next-step') || hit('#next-step')) {
      const done = $('#ai-next-step')?.disabled || $('#next-step')?.disabled;
      API.play(done ? 'happy' : 'focus', { intensity: 0.85, durationMs: 1700, line: done ? LINES.stepDone : LINES.step });
      return;
    }
    if (hit('#ai-challenge-answer') || hit('#challenge-answer')) { API.play('happy', { intensity: 0.9, durationMs: 1700, line: LINES.challenge }); return; }
    if (hit('#followup-button') || hit('[data-followup-suggestion]')) { API.play('think', { loop: true, intensity: 0.9, line: LINES.followup }); return; }
  }
  function onDocumentInput(event) {
    const id = event.target && event.target.id;
    if (id === 'zd-name-input') { update({ name: event.target.value.trim().slice(0, 12) || '知知' }); }
    if (id === 'zd-amp-range') { update({ amp: Number(event.target.value) / 100 }); }
    if (id === 'zd-color-picker') { update({ colorMode: 'custom', customColor: event.target.value }); }
  }
  function onDocumentChange(event) {
    const target = event.target;
    const V = window.ZhidaoVoice;
    if (!target || !V || typeof V.configure !== 'function') return;
    if (target.id === 'zd-voice-select') {
      const st = V.configure({ mode: 'tts', voice: target.value });
      showToast(st.available ? `已切换到 ${target.value}，全局朗读立即生效` : '音色已记下，语音服务恢复后自动生效');
    }
    if (target.dataset && target.dataset.zdSubjectVoiceSelect) {
      const key = target.dataset.zdSubjectVoiceSelect;
      V.configure({ subjectVoices: { [key]: target.value } });
      const label = (V.SUBJECTS && V.SUBJECTS[key] && V.SUBJECTS[key].label) || key;
      showToast(target.value === 'auto'
        ? `${label}课改为跟随默认音色`
        : `${label}课将用 ${target.value} 朗读`);
    }
    if (target.id === 'zd-voice-base') {
      V.configure({ base: String(target.value || '').trim() || V.DEFAULT_BASE });
      showToast('正在重新检测语音服务…');
    }
  }

  /* ---------------- 初始化 ---------------- */
  const API = {
    intents: INTENTS.slice(),
    play, say, stop() { interrupt(); lipReset(); setIntentClass('idle'); applyAmp(0.5); return API; },
    startSpeech, speechBoundary: lipBoundary, stopSpeech,
    setSubject, update, reset, randomize, openEditor,
    getLook() { return { ...look, subject }; },
    getSubject() { return subject; },
    renderHosts
  };
  window.ZhidaoMascot = API;

  const initialSubject = ['chinese', 'english', 'math'].find(key => $('.topic-banner')?.classList.contains(key)) || (typeof state !== 'undefined' && SUBJECTS[state.topic] ? state.topic : 'chinese');
  setSubject(initialSubject);
  renderHosts();
  const initialBanner = $('.topic-banner');
  if (initialBanner) lessonKey = `${initialSubject}|${($('#lesson-heading')?.textContent || '').trim()}`;
  document.addEventListener('click', onDocumentClick);
  document.addEventListener('input', onDocumentInput);
  document.addEventListener('change', onDocumentChange);
  if (window.ZhidaoVoice && typeof window.ZhidaoVoice.onChange === 'function') {
    window.ZhidaoVoice.onChange(() => syncVoiceEditor());
  }
  document.addEventListener('keydown', event => {
    if (event.key === 'Enter' && event.target && event.target.id === 'topic-input') API.play('think', { loop: true, intensity: 0.9, line: LINES.loading });
  });
  if (window.MutationObserver) {
    const observer = new MutationObserver(() => syncFromDOM());
    const content = $('#lesson-content');
    if (content) observer.observe(content, { childList: true, subtree: true, characterData: true });
  }
  setInterval(() => {
    $$('.zd-svg:not(.sleep)').forEach(svg => {
      if (Math.random() < 0.14) {
        svg.querySelectorAll('.lid').forEach(lid => {
          lid.classList.remove('blink'); void lid.getBBox(); lid.classList.add('blink');
          setTimeout(() => lid.classList.remove('blink'), 200);
        });
      }
    });
  }, 520);
  document.addEventListener('mousemove', event => {
    $$('.zd-svg').forEach(svg => {
      const rect = svg.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const dx = event.clientX - (rect.left + rect.width / 2);
      const dy = event.clientY - (rect.top + rect.height / 2);
      const d = Math.hypot(dx, dy) || 1;
      const k = Math.min(2.8, d / 70);
      svg.querySelectorAll('.pupil').forEach(p => p.setAttribute('transform', `translate(${(dx / d * k).toFixed(2)} ${(dy / d * k).toFixed(2)})`));
    });
  });

  syncFromDOM();
  if (phase !== 'loading' && location.hash !== '#zd-editor') {
    API.play('wave', {
      intensity: 1, durationMs: 1500, line: LINES.welcome,
      onDone: () => API.play('idle', { loop: true, intensity: 0.5 })
    });
  }
  if (location.hash === '#zd-editor') openEditor();
})();
