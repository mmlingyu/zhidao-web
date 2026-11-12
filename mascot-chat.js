/* 点一点知知 · 首页 IP 形象语音提问（UMD 双端）
 *
 * 交互：直接点击首页顶栏或右下角的知知形象 → 立刻用**当前全局音色**随机朗读一句
 * 询问需求的话 → 弹出对话框显示这句话 → 用户把需求写进弹框 → 直接发起互动讲解。
 *
 * 语音只走一条链路：window.speakText → voice.js（TTS 音色 / 浏览器默认 / 自动回退），
 * 因此形象工坊里选中的音色、口型同步、stopVoice 中断规则在这里全部生效；
 * 语音服务不存在时 voice.js 会在同一次调用切回浏览器默认音色，不会出现点了没声音。
 *
 * 弹框只负责「说需求」，不自己生成课程：提交时把文本写回 #topic-input 并触发
 * #start-button，交给既有主流程（dynamic.js → /api/tutor），避免两条生成链路分叉。
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && !!module.exports;

  /** 通用问句池：每一句都在问用户「想学什么」，随机挑一句朗读。 */
  const GREETINGS = [
    '嗨，我是知知！今天想弄懂哪一个知识点？直接告诉我就好。',
    '你来啦！有什么想问的吗？语文、英语、数学都可以说给我听。',
    '想先学点什么？把你的问题写下来，我这就给你讲。',
    '有没有哪个知识点一直没弄明白？说出来，我们一起拆开看看。',
    '今天想让我陪你练什么？一道题、一个词语，或者一句诗都行。',
    '我先问问你：现在最想搞懂的是什么？',
    '要不要给我出个题？你说需求，我来准备互动讲解。',
    '悄悄告诉我，今天想学哪一科？我按你的年级挑讲法。'
  ];

  /** 认知阶段微调：低龄更短更童趣，青少年去掉幼态语气；其余走通用池。 */
  const STAGE_GREETINGS = {
    early: [
      '嗨呀，我是知知！今天想听什么故事、认哪个字呀？',
      '小手指点一点，告诉知知你想学什么好吗？',
      '今天想和知知一起玩哪一个知识游戏呀？'
    ],
    primary: [
      '你来啦！今天想先弄懂哪一个小问题？',
      '要不要给知知出一道题？我们一起把它拆开。'
    ],
    teen: [
      '有什么想弄清楚的知识点？直接说就行。',
      '需要我讲哪一块？把题目或概念发我。'
    ],
    senior: [
      '想从哪个问题开始？我按你的年级给讲法。',
      '把要弄懂的概念或题目写下来，我来展开。'
    ]
  };

  /** 英语学科：问句换成英文，配合语音模块的英语音色，问和读保持同一口音。 */
  const ENGLISH_GREETINGS = [
    "Hi, I'm ZhiZhi! Which English topic do you want to learn today?",
    "What would you like to explore in English? Tell me and I'll explain it.",
    "Ready for some English? Give me a word, a sentence, or a grammar question.",
    "Which English topic should we start with? I'm right here."
  ];

  /** 弹框里的快捷需求：点一下填进输入框，仍可继续编辑，不自动提交。 */
  const SUGGESTIONS = [
    '帮我讲讲《春晓》里「处处闻啼鸟」的画面感',
    '讲一下一般过去时和现在完成时的区别',
    '教我两位数加法的竖式怎么对齐',
    '「喜出望外」是什么意思？怎么用？'
  ];

  const state = {
    current: '',
    stage: 'generic',
    mounted: false
  };

  const esc = value => String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  /**
   * 年级 → 认知阶段。优先复用 A2UI 矩阵的 stageOf()，它就是配方使用的同一套口径；
   * 没有矩阵（例如单测或旧页面）时退回 generic，绝不因此阻断朗读。
   */
  function stageFor(grade) {
    const matrix = root && root.ZHIDAO_A2UI_MATRIX;
    if (matrix && typeof matrix.stageOf === 'function') {
      try {
        const id = matrix.stageOf(String(grade || ''));
        if (id) return String(id);
      } catch { /* 降级到 generic */ }
    }
    return 'generic';
  }

  /** 当前年级：未登录 / 通用学习者返回空串。 */
  function currentGrade() {
    try { return root && root.LEARNER && typeof root.LEARNER.grade === 'function' ? root.LEARNER.grade() : ''; }
    catch { return ''; }
  }

  /** 当前学科：语音模块记录的最新课程学科；取不到时返回空串。 */
  function currentSubject() {
    try {
      const V = root && root.ZhidaoVoice;
      const st = V && typeof V.status === 'function' ? V.status() : null;
      const key = st && st.subject;
      return key === 'english' || key === 'math' || key === 'chinese' ? key : '';
    } catch { return ''; }
  }

  /**
   * 随机挑一句，且尽量不与上一句重复。random 可注入，便于测试确定性。
   * 传入 1（Math.random 的上界外）也会被夹到最后一个索引，不会越界。
   * subject = 'english' 时走英文问句池，配合英语音色。
   */
  function pickGreeting({ stage = 'generic', random = Math.random, exclude = '', subject = '' } = {}) {
    const pool = subject === 'english'
      ? [...ENGLISH_GREETINGS]
      : [...(STAGE_GREETINGS[stage] || []), ...GREETINGS];
    const candidates = pool.filter(line => line !== exclude);
    const list = candidates.length ? candidates : pool;
    const raw = Number(random());
    const ratio = Number.isFinite(raw) ? Math.min(0.999999, Math.max(0, raw)) : 0;
    return list[Math.floor(ratio * list.length)] || GREETINGS[0];
  }

  /** 弹框状态行：把「当前用的是哪个音色」直接说清楚，配置是否生效一眼可见。 */
  function voiceLabel() {
    const V = root && root.ZhidaoVoice;
    if (!V || typeof V.status !== 'function') return '浏览器默认音色';
    try {
      const st = V.status();
      if (st.effective !== 'tts') return '浏览器默认音色';
      const subject = st.subject || '';
      const slot = (st.subjectVoices && st.subjectVoices[subject]) || '';
      const voice = !slot || slot === 'auto' ? st.voice : slot;
      const label = (st.subjects && st.subjects[subject] && st.subjects[subject].label) || '';
      return label ? `知知语音服务 · ${label} ${voice}` : `知知语音服务 · ${voice}`;
    } catch { return '浏览器默认音色'; }
  }

  /** 输入归一化：去首尾、压空白、限长；空串不会被送进生成链路。 */
  function normalizeRequest(raw) {
    const text = String(raw == null ? '' : raw).trim().replace(/\s+/g, ' ').slice(0, 200);
    return { ok: !!text, text };
  }

  /** 弹框内容。所有动态文本只经 esc()，不解释 HTML。 */
  function chatHTML(greeting, label) {
    return `
<div class="zd-chat" id="zd-chat">
  <div class="zd-chat-hero">
    <div class="zd-chat-mascot"><div class="zd-host" data-zd-host data-zd-size="chat"></div></div>
    <div class="zd-chat-bubble">
      <b>知知正在问你</b>
      <p id="zd-chat-line">${esc(greeting)}</p>
      <small id="zd-chat-voice">正在用 ${esc(label || '浏览器默认音色')} 问你</small>
    </div>
  </div>
  <label class="zd-chat-label" for="zd-chat-input">把你的需求告诉知知</label>
  <textarea id="zd-chat-input" class="zd-chat-input" rows="3" maxlength="200"
    placeholder="例如：帮我讲讲《春晓》里「处处闻啼鸟」的画面感"></textarea>
  <div class="zd-chat-suggestions">${SUGGESTIONS.map(item =>
      `<button type="button" data-zd-chat-suggestion="${esc(item)}">${esc(item)}</button>`).join('')}</div>
  <div class="zd-chat-actions">
    <button type="button" class="zd-chat-submit" data-zd-chat-action="submit">开始讲解</button>
    <button type="button" data-zd-chat-action="again">再听一遍</button>
    <button type="button" data-zd-chat-action="another">换一句问</button>
    <button type="button" data-zd-chat-action="stop">停止朗读</button>
  </div>
  <p class="zd-chat-note">按 Ctrl / ⌘ + Enter 也能直接开始；这句话用的是形象工坊里为当前学科选的音色，英语课自动用英语音色。</p>
</div>`;
  }

  /** 朗读统一委托 speakText（它内部走 voice.js，含口型、音色与自动回退）。 */
  function speak(text) {
    const line = String(text || '').trim();
    if (!line) return false;
    const subject = currentSubject();
    if (root && typeof root.speakText === 'function') { root.speakText(line, { subject }); return true; }
    const V = root && root.ZhidaoVoice;
    if (V && typeof V.speak === 'function') {
      try { const p = V.speak(line, { subject }); if (p && typeof p.catch === 'function') p.catch(() => {}); return true; }
      catch { return false; }
    }
    return false;
  }

  function dom() { return typeof document !== 'undefined' ? document : null; }

  function setLine(line, label) {
    const doc = dom();
    if (!doc) return;
    const p = doc.querySelector('#zd-chat-line');
    const small = doc.querySelector('#zd-chat-voice');
    if (p) p.textContent = line;
    if (small) small.textContent = `正在用 ${label || voiceLabel()} 问你`;
  }

  /** 打开弹框并立即朗读。grade 可注入，便于测试不同年级的问句。 */
  function openChat({ greeting, grade, subject } = {}) {
    const doc = dom();
    if (!doc || !root || typeof root.openModal !== 'function') return null;
    const stage = stageFor(grade != null ? grade : currentGrade());
    const current = subject || currentSubject();
    state.stage = stage;
    const line = greeting || pickGreeting({ stage, exclude: state.current, subject: current });
    state.current = line;
    root.openModal('知知想问你一句话', '点一点知知', chatHTML(line, voiceLabel()));
    // 弹框里的小形象由同一个渲染器产出，外观/颜色与首页保持同步。
    try { root.ZhidaoMascot?.renderHosts?.(); } catch { /* 形象模块未加载也不影响提问 */ }
    speak(line);
    return line;
  }

  /** 提交：写回首页输入框 + 触发原有开始按钮，不复制一套生成逻辑。 */
  function submit(raw) {
    const doc = dom();
    if (!doc) return false;
    const { ok, text } = normalizeRequest(raw);
    const field = doc.querySelector('#zd-chat-input');
    if (!ok) {
      if (field) field.focus();
      if (root && typeof root.showToast === 'function') root.showToast('先写下你想弄懂什么');
      return false;
    }
    const topic = doc.querySelector('#topic-input');
    const start = doc.querySelector('#start-button');
    if (!topic || !start) return false;
    topic.value = text;
    try { topic.dispatchEvent(new Event('input', { bubbles: true })); } catch { /* 旧浏览器忽略 */ }
    if (root && typeof root.closeModal === 'function') root.closeModal();
    start.click();
    if (root && typeof root.showToast === 'function') root.showToast('收到，知知这就开始讲');
    return true;
  }

  function stopSpeaking() {
    try { root?.ZhidaoVoice?.stop?.(); } catch { /* 无语音环境 */ }
    try { root?.speechSynthesis?.cancel?.(); } catch { /* 无语音环境 */ }
  }

  /* ---------------- 事件接线 ---------------- */

  // capture 阶段拦截 IP 形象点击：阻止 <a class="brand"> 的滚回顶部，
  // 也避免 mascot.js 的全局点击委托把这次点击当成别的互动。
  function onCaptureClick(event) {
    const target = event && event.target instanceof Element ? event.target : null;
    const host = target && target.closest ? target.closest('[data-zd-chat]') : null;
    if (!host || (host.closest && host.closest('#modal-backdrop'))) return;
    if (event.preventDefault) event.preventDefault();
    if (event.stopPropagation) event.stopPropagation();
    openChat();
  }

  function onCaptureKey(event) {
    if (!event || (event.key !== 'Enter' && event.key !== ' ')) return;
    const target = event.target instanceof Element ? event.target : null;
    const host = target && target.closest ? target.closest('[data-zd-chat]') : null;
    if (!host || (host.closest && host.closest('#modal-backdrop'))) return;
    if (event.preventDefault) event.preventDefault();
    if (event.stopPropagation) event.stopPropagation();
    openChat();
  }

  // 弹框内的按钮与快捷需求走冒泡委托；capture 处理器不会匹配这些元素。
  function onChatClick(event) {
    const target = event && event.target instanceof Element ? event.target : null;
    if (!target || !target.closest) return;
    const doc = dom();
    if (!doc) return;
    const chip = target.closest('[data-zd-chat-suggestion]');
    if (chip) {
      const field = doc.querySelector('#zd-chat-input');
      if (field) { field.value = chip.dataset.zdChatSuggestion || ''; field.focus(); }
      return;
    }
    const button = target.closest('[data-zd-chat-action]');
    if (!button) return;
    const kind = button.dataset.zdChatAction;
    if (kind === 'submit') { submit(doc.querySelector('#zd-chat-input')?.value || ''); return; }
    if (kind === 'again') { speak(state.current); return; }
    if (kind === 'another') {
      const line = pickGreeting({ stage: state.stage || 'generic', exclude: state.current });
      state.current = line;
      setLine(line);
      speak(line);
      return;
    }
    if (kind === 'stop') stopSpeaking();
  }

  // 弹框打开时，Ctrl / ⌘ + Enter 从任意焦点都能提交。
  function onChatKey(event) {
    if (!event || event.key !== 'Enter' || !(event.ctrlKey || event.metaKey)) return;
    const doc = dom();
    const field = doc && doc.querySelector('#zd-chat-input');
    if (!field) return;
    if (event.preventDefault) event.preventDefault();
    submit(field.value);
  }

  /** 给首页 IP 形象补可访问性属性；renderHosts() 只换 innerHTML，不会抹掉它们。 */
  function markHosts() {
    const doc = dom();
    if (!doc) return 0;
    let count = 0;
    doc.querySelectorAll('[data-zd-chat]').forEach(host => {
      host.setAttribute('role', 'button');
      host.setAttribute('tabindex', '0');
      host.setAttribute('aria-label', '点知知，说一说你想学什么');
      if (!host.title) host.title = '点一下，知知会问你想学什么';
      count++;
    });
    return count;
  }

  function mount() {
    const doc = dom();
    if (!doc || state.mounted) return state.mounted;
    state.mounted = true;
    markHosts();
    doc.addEventListener('click', onCaptureClick, true);
    doc.addEventListener('keydown', onCaptureKey, true);
    doc.addEventListener('click', onChatClick, false);
    doc.addEventListener('keydown', onChatKey, false);
    return true;
  }

  const API = {
    GREETINGS, STAGE_GREETINGS, ENGLISH_GREETINGS, SUGGESTIONS,
    esc, stageFor, currentGrade, currentSubject, pickGreeting, voiceLabel, normalizeRequest,
    chatHTML, speak, openChat, submit, stopSpeaking, markHosts, mount,
    getState() { return { ...state }; },
    _internal: { setLine, onCaptureClick, onCaptureKey, onChatClick, onChatKey }
  };

  if (isNode) module.exports = API;
  if (root) root.ZhidaoMascotChat = API;
  if (!isNode && root && root.document) mount();
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
