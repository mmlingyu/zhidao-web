/* A2UI 浏览器渲染器 · 零依赖
 *
 * 只做四件事：消息过闸 → 合并组件表/数据模型 → 白名单组件生成 DOM → 统一 action 分发。
 * 安全底线：模型输出的任何字符串都只经 textContent / setAttribute 落地，
 * 绝不解释为 HTML 或 JS；组件名必须先通过 catalog.validateMessage。
 *
 * P0 收在「诗文与名句 + 试着写一句」两个模块内，DOM 与现有手写模板等价，
 * 因此 CSS 一行不用改、截图逐像素对齐；失败时把 dynamic.js 的开关切回即可回退。
 */
'use strict';

(function (root) {
  const catalog = root && root.ZHIDAO_A2UI_CATALOG;
  if (!catalog) throw new Error('a2ui-render.js 需要在 a2ui-catalog.js 之后加载');

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const SAFE_CLASS = /^[A-Za-z0-9_\- ]*$/;
  const ICONS = new Set(['volume', 'pen', 'arrow', 'bulb', 'sparkles', 'check', 'target',
    'compass', 'refresh', 'face', 'brain', 'flame', 'info', 'clock', 'book', 'chevron']);

  function safeClass(value) {
    const text = String(value == null ? '' : value);
    return SAFE_CLASS.test(text) ? text : '';
  }
  function text(value) { return value == null ? '' : String(value); }
  function el(tag, className, content) {
    const node = document.createElement(tag);
    if (className !== undefined) node.className = safeClass(className);
    if (content !== undefined && content !== null) node.textContent = text(content);
    return node;
  }
  function svgIcon(name) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', '');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS(SVG_NS, 'use');
    use.setAttribute('href', `#i-${ICONS.has(name) ? name : 'volume'}`);
    svg.appendChild(use);
    return svg;
  }

  /** Renderer Function 白名单：与 a2ui-catalog.js 的 RENDERER_FUNCTIONS 一一对应。 */
  const FUNCTIONS = {
    speak(args = {}) {
      const value = text(args.text ?? args);
      if (!value.trim()) return false;
      if (typeof root.speakText === 'function') {
        // 带上当前学科：英语课的英文朗读用英语音色，语文/数学用中文音色。
        let subject = '';
        try {
          const V = root.ZhidaoVoice;
          const st = V && typeof V.status === 'function' ? V.status() : null;
          subject = (st && st.subject) || '';
        } catch { /* 语音模块异常则用默认口径 */ }
        root.speakText(value, subject ? { subject } : undefined);
        return true;
      }
      return false;
    },
    celebrate(args = {}) {
      const feedback = root.ZHIDAO_FEEDBACK;
      if (!feedback) return false;
      const level = text(args.level || 'correct');
      if (level === 'mastered' && feedback.mastered) feedback.mastered(args.origin || null);
      else if (level === 'wrong' && feedback.wrong) feedback.wrong(args.origin || null);
      else if (level === 'effort' && feedback.effort) feedback.effort(text(args.detail));
      else if (feedback.correct) feedback.correct(text(args.subject || 'chinese'), args.origin || null);
      return true;
    },
    recordEvidence(args = {}) {
      if (root.KNOWLEDGE && typeof root.KNOWLEDGE.record === 'function') {
        return root.KNOWLEDGE.record(args), true;
      }
      return false;
    },
    openPoint(args = {}) {
      const point = text(args.point ?? args);
      if (point && typeof root.startLesson === 'function') {
        const input = document.getElementById('topic-input');
        if (input) input.value = point;
        return root.startLesson(true), true;
      }
      return false;
    },
    /** IP 意图联动：只接受固定意图名，模型无法注入动作 / 样式 / 代码。 */
    ipIntent(args = {}) {
      const mascot = root.ZhidaoMascot;
      if (!mascot) return false;
      const allowed = ['idle', 'think', 'speak', 'happy', 'sad', 'focus', 'wave'];
      const intent = allowed.includes(text(args.intent)) ? text(args.intent) : 'think';
      const line = text(args.line);
      if (line && typeof mascot.say === 'function') mascot.say(line);
      if (typeof mascot.play === 'function') {
        mascot.play(intent, { intensity: 0.9, durationMs: intent === 'think' ? 1600 : 1800, line: line || undefined });
        return true;
      }
      return false;
    }
  };

  function createSurface(container, options = {}) {
    const handlers = new Set();
    const actions = new WeakMap();
    const binds = new WeakMap();
    const components = new Map();
    let model = {};
    let surfaceId = '';
    let destroyed = false;

    function resolve(value, locals) {
      return catalog.resolveValue(value, model, locals || {});
    }

    /** 把 action 定义登记到元素上；事件走容器级委托，重渲染后无需重新绑定。 */
    function attachAction(node, action, meta = {}) {
      if (!action || !node) return node;
      const name = text(action.event?.name || action.name || '');
      if (!name) return node;
      node.setAttribute('data-a2ui-action', name);
      if (meta.id) node.setAttribute('data-a2ui-id', text(meta.id));
      if (meta.component) node.setAttribute('data-a2ui-component', text(meta.component));
      if (meta.base) node.setAttribute('data-a2ui-base', text(meta.base));
      if (meta.index !== undefined) node.setAttribute('data-a2ui-index', String(meta.index));
      actions.set(node, action);
      return node;
    }

    function renderText(def) {
      const tag = ['p', 'small', 'span', 'div', 'strong', 'h4', 'h5'].includes(def.tag) ? def.tag : 'span';
      return el(tag, def.className || '', def.text);
    }

    function renderButton(def, locals) {
      const node = el('button', def.className || '');
      if (def.id) node.id = text(def.id);
      node.appendChild(document.createTextNode(text(def.label)));
      if (def.icon) node.appendChild(svgIcon(text(def.icon)));
      if (def.disabled) node.disabled = true;
      attachAction(node, def.action, { id: def.id, component: 'Button', ...locals });
      return node;
    }

    function renderTextField(def) {
      const isArea = def.tag === 'textarea';
      const node = el(isArea ? 'textarea' : 'input', def.className || '');
      if (def.id) node.id = text(def.id);
      if (isArea) node.placeholder = text(def.placeholder);
      else node.setAttribute('placeholder', text(def.placeholder));
      node.value = text(def.value);
      if (def.bind) {
        node.setAttribute('data-a2ui-bind', text(def.bind));
        binds.set(node, text(def.bind));
      }
      return node;
    }

    function renderWordChips(def, locals) {
      const node = el('div', def.className || 'word-chips');
      const items = Array.isArray(def.items) ? def.items : [];
      const listPath = text(def.wordsPath) || locals.base || '';
      items.forEach((item, index) => {
        const word = text(typeof item === 'string' ? item : item?.word);
        const active = def.active ? word === text(def.active) : index === 0;
        const button = el('button', active ? 'active' : '', word);
        button.setAttribute('data-ai-practice', String(index));
        // chipAction 的 {"@path":"word"} 需要指向当前词，否则会解析成 /word。
        const base = listPath ? `${listPath}/${index}` : '';
        attachAction(button, def.action, { id: `word_${index}`, component: 'WordChips', base, index });
        node.appendChild(button);
      });
      return node;
    }

    function renderFeedback(def) {
      const tone = text(def.tone);
      const cls = tone ? `practice-feedback show ${safeClass(tone)}` : (def.className || 'practice-feedback');
      const node = el('div', cls, def.text);
      if (def.id) node.id = text(def.id);
      return node;
    }

    function renderCardHeading(def, locals) {
      const node = el('div', def.className || 'card-heading');
      const titleWrap = el('div', 'card-title');
      titleWrap.appendChild(el('span', 'number', def.number));
      const inner = el('div', '');
      const h4 = el('h4', '');
      h4.appendChild(document.createTextNode(text(def.title) + (def.subtitle ? ' ' : '')));
      if (def.subtitle) h4.appendChild(el('small', '', def.subtitle));
      inner.appendChild(h4);
      titleWrap.appendChild(inner);
      node.appendChild(titleWrap);
      if (typeof def.action === 'string' && def.action) {
        const child = renderComponent(def.action, locals);
        if (child) node.appendChild(child);
      } else if (def.action && typeof def.action === 'object') {
        const btn = renderButton({ className: 'text-button', label: def.action.label, action: def.action }, locals);
        node.appendChild(btn);
      }
      if (def.trailingIcon) node.appendChild(svgIcon(text(def.trailingIcon)));
      return node;
    }

    function renderPoemLine(def, locals) {
      const node = el('article', def.className || 'poem-item');
      node.appendChild(el('blockquote', '', def.text));
      const footer = el('footer', '');
      footer.appendChild(el('span', '', def.source));
      footer.appendChild(el('span', '', def.tag));
      const button = el('button', 'poem-read');
      button.setAttribute('aria-label', '朗读这一句');
      button.appendChild(svgIcon('volume'));
      attachAction(button, def.speakAction, {
        id: `poem_${locals.index ?? 0}`, component: 'PoemLine', base: locals.base || '', index: locals.index
      });
      footer.appendChild(button);
      node.appendChild(footer);
      return node;
    }

    function renderWritingPad(def, locals) {
      const fragment = document.createDocumentFragment();
      fragment.appendChild(renderText({ tag: 'p', className: 'practice-task', text: def.task }));
      const words = Array.isArray(def.words) ? def.words : [];
      fragment.appendChild(renderWordChips({
        className: 'word-chips', items: words, wordsPath: def.wordsPath,
        active: def.activeWord, action: def.chipAction
      }, locals));
      fragment.appendChild(renderTextField({
        tag: 'textarea', className: 'practice-input', id: def.inputId,
        placeholder: def.placeholder, value: def.value, bind: def.inputBind
      }));
      fragment.appendChild(renderFeedback({
        id: def.feedbackId, text: def.feedback, tone: def.tone
      }));
      const footer = el('div', 'practice-footer');
      footer.appendChild(renderText({ tag: 'small', className: '', text: def.footerNote }));
      footer.appendChild(renderButton({
        className: 'primary-small', id: def.buttonId, label: def.button, icon: 'arrow', action: def.submitAction
      }, { id: def.buttonId, component: 'WritingPad' }));
      fragment.appendChild(footer);
      return fragment;
    }

    function renderList(def, locals) {
      const spec = def.children && !Array.isArray(def.children) ? def.children : null;
      const items = spec ? (catalog.pointerGet(model, text(spec.path)) || []) : [];
      if (!Array.isArray(items) || !items.length) {
        return el('div', 'stage-hint is-empty', def.emptyText || '');
      }
      const node = el('div', def.className || '');
      if (spec && spec.componentId) {
        items.forEach((_, index) => {
          const child = renderComponent(spec.componentId, {
            base: `${text(spec.path)}/${index}`, index
          });
          if (child) node.appendChild(child);
        });
      } else if (Array.isArray(def.children)) {
        for (const id of def.children) {
          const child = renderComponent(id, locals);
          if (child) node.appendChild(child);
        }
      }
      return node;
    }

    /* ---- 学科组件矩阵新增：练习 / 强化 / 迁移层 ---- */
    function renderChoiceQuiz(def, locals) {
      const wrap = el('div', def.className || 'k-quiz');
      wrap.appendChild(el('p', 'k-quiz-question', def.question));
      const options = Array.isArray(def.options) ? def.options : [];
      const row = el('div', 'k-choice-row');
      options.forEach((option, index) => {
        const label = text(typeof option === 'string' ? option : option?.label);
        const button = el('button', 'k-choice-button', label);
        button.appendChild(el('small', '', '选这个'));
        // 每个选项带自己的 choice，action 统一由容器委托，重渲染后无需重绑。
        const base = def.action || { event: { name: 'answer', context: {} } };
        const action = {
          event: {
            name: base.event?.name || 'answer',
            context: { ...(base.event?.context || {}), choice: label }
          }
        };
        attachAction(button, action, { id: `choice_${index}`, component: 'ChoiceQuiz', index, ...locals });
        row.appendChild(button);
      });
      wrap.appendChild(row);
      if (def.note) wrap.appendChild(el('small', 'k-quiz-note', def.note));
      wrap.appendChild(renderFeedback({ id: def.feedbackId || 'quiz_feedback', text: def.feedback, tone: def.tone }));
      return wrap;
    }

    function renderStepReveal(def, locals) {
      const steps = Array.isArray(def.steps) ? def.steps : [];
      const current = Math.min(Math.max(0, Number(def.current) || 0), steps.length);
      const wrap = el('div', def.className || 'k-steps');
      if (def.hint) wrap.appendChild(el('p', 'k-step-hint', def.hint));
      const list = el('ol', 'k-steps-list');
      steps.forEach((step, index) => {
        const cls = index < current ? 'k-step-done' : index === current ? 'k-step-current' : 'k-step-locked';
        // 全部步骤始终显示真实内容，只用颜色区分当前步：
        // 适龄是减负荷（一次只高亮一步），绝不是把知识藏起来——上一轮诗文 display:none 的教训。
        list.appendChild(el('li', cls, String(step)));
      });
      wrap.appendChild(list);
      const allShown = current >= steps.length;
      const button = el('button', 'primary-small', allShown ? '步骤已全部展开' : (def.button || '下一步'));
      if (allShown) button.disabled = true;
      const base = def.action || { event: { name: 'nextStep', context: {} } };
      attachAction(button, {
        event: { name: base.event?.name || 'nextStep', context: { ...(base.event?.context || {}), current } }
      }, { id: 'step_next', component: 'StepReveal', ...locals });
      wrap.appendChild(button);
      return wrap;
    }

    function renderFormulaBlock(def) {
      const wrap = el('div', def.className || 'k-formula');
      wrap.appendChild(el('div', 'k-formula-text', def.formula));
      if (def.note) wrap.appendChild(el('small', 'k-formula-note', def.note));
      return wrap;
    }

    /* ---- P2：知识卡 / 图示练习 / 进度组件 ----
     * 共同约束：一切来自模型的字符串只经 textContent / setAttribute 落地；
     * 形状、颜色、数值都从固定白名单或数值钳制产生，模型给不了 CSS 或 HTML。 */
    const SHAPE_COLORS = ['#8b6fe0', '#4c9f8a', '#e0a05a', '#6a8fd8', '#d2748c', '#7aa84c'];

    function renderIdiomCard(def) {
      const wrap = el('div', def.className || 'k-idiom');
      const top = el('div', 'k-idiom-top');
      top.appendChild(el('strong', 'k-idiom-word', def.word));
      if (def.pinyin) top.appendChild(el('small', 'k-idiom-pinyin', def.pinyin));
      wrap.appendChild(top);
      if (def.meaning) wrap.appendChild(el('p', 'k-idiom-meaning', def.meaning));
      if (def.example) wrap.appendChild(el('p', 'k-idiom-example', `例：${text(def.example)}`));
      const foot = el('div', 'k-idiom-foot');
      if (def.tag) foot.appendChild(el('span', 'k-idiom-tag', def.tag));
      if (def.level) foot.appendChild(el('span', 'k-idiom-level', def.level));
      const btn = el('button', 'k-idiom-speak');
      btn.setAttribute('aria-label', '朗读这个成语');
      btn.appendChild(svgIcon('volume'));
      attachAction(btn, def.action, { id: 'idiom_speak', component: 'IdiomCard' });
      foot.appendChild(btn);
      wrap.appendChild(foot);
      return wrap;
    }

    function renderWordCard(def) {
      const wrap = el('div', def.className || 'k-word-card');
      const top = el('div', 'k-word-top');
      top.appendChild(el('strong', 'k-word-title', def.word));
      if (def.phonetic) top.appendChild(el('small', 'k-word-phonetic', def.phonetic));
      wrap.appendChild(top);
      const examples = Array.isArray(def.examples) ? def.examples : [];
      if (examples.length) {
        const list = el('ul', 'k-word-examples');
        for (const item of examples) list.appendChild(el('li', '', item));
        wrap.appendChild(list);
      }
      if (def.tip) wrap.appendChild(el('p', 'k-word-tip', def.tip));
      const btn = el('button', 'k-word-speak');
      btn.setAttribute('aria-label', '朗读这个单词');
      btn.appendChild(svgIcon('volume'));
      attachAction(btn, def.action, { id: 'word_speak', component: 'WordCard' });
      wrap.appendChild(btn);
      return wrap;
    }

    function renderPictureChoice(def, locals) {
      const wrap = el('div', def.className || 'k-pictures');
      if (def.question) wrap.appendChild(el('p', 'k-pic-question', def.question));
      const options = Array.isArray(def.options) ? def.options : [];
      const grid = el('div', 'k-pic-grid');
      options.forEach((option, index) => {
        const label = text(typeof option === 'string' ? option : option?.label);
        const btn = el('button', 'k-pic-option');
        const shape = el('span', `k-pic-shape shape-${index % 4}`);
        shape.style.setProperty('--k-pic-color', SHAPE_COLORS[index % SHAPE_COLORS.length]);
        btn.appendChild(shape);
        btn.appendChild(el('span', 'k-pic-label', label));
        btn.appendChild(el('small', '', '点这个'));
        const base = def.action || { event: { name: 'answer', context: {} } };
        attachAction(btn, {
          event: { name: base.event?.name || 'answer',
            context: { ...(base.event?.context || {}), choice: label } }
        }, { id: `picture_${index}`, component: 'PictureChoice', index, ...locals });
        grid.appendChild(btn);
      });
      wrap.appendChild(grid);
      if (def.note) wrap.appendChild(el('small', 'k-pic-note', def.note));
      wrap.appendChild(renderFeedback({
        id: def.feedbackId || 'picture_feedback', text: def.feedback, tone: def.tone
      }));
      return wrap;
    }

    function renderMatchPairs(def, locals) {
      const wrap = el('div', def.className || 'k-pairs');
      if (def.hint) wrap.appendChild(el('p', 'k-pairs-hint', def.hint));
      const pairs = Array.isArray(def.pairs) ? def.pairs : [];
      const matched = Array.isArray(def.matched) ? def.matched.map(String) : [];
      const cols = el('div', 'k-pairs-cols');
      for (const side of ['left', 'right']) {
        const col = el('div', `k-pairs-col k-pairs-${side}`);
        col.appendChild(el('small', 'k-pairs-col-title', side === 'left' ? '左边' : '右边'));
        pairs.forEach((pair, index) => {
          const label = text(pair && typeof pair === 'object'
            ? (side === 'left' ? pair.left : pair.right) : (side === 'left' ? pair : ''));
          if (!label) return;
          const btn = el('button',
            matched.includes(label) ? 'k-pair-button is-matched' : 'k-pair-button', label);
          const base = def.action || { event: { name: 'selectPair', context: {} } };
          attachAction(btn, {
            event: { name: base.event?.name || 'selectPair',
              context: { ...(base.event?.context || {}), side, index, label } }
          }, { id: `pair_${side}_${index}`, component: 'MatchPairs', index, ...locals });
          col.appendChild(btn);
        });
        cols.appendChild(col);
      }
      wrap.appendChild(cols);
      wrap.appendChild(renderFeedback({
        id: def.feedbackId || 'pair_feedback', text: def.feedback, tone: def.tone
      }));
      return wrap;
    }

    function renderNumberLine(def) {
      const wrap = el('div', def.className || 'k-numberline');
      if (def.label) wrap.appendChild(el('p', 'k-numberline-label', def.label));
      const min = Number(def.min);
      const max = Number(def.max);
      const lo = Number.isFinite(min) ? min : 0;
      const hi = Number.isFinite(max) && max > lo ? max : lo + 10;
      const span = hi - lo || 1;
      const track = el('div', 'k-numberline-track');
      const marks = Array.isArray(def.marks) ? def.marks : [];
      const highlight = Number(def.highlight);
      marks.forEach(mark => {
        const value = Number(mark && typeof mark === 'object' ? mark.value : mark);
        if (!Number.isFinite(value)) return;
        const pct = Math.min(100, Math.max(0, ((value - lo) / span) * 100));
        const dot = el('span', 'k-numberline-mark');
        dot.style.left = `${pct}%`;
        if (Number.isFinite(highlight) && value === highlight) dot.className = 'k-numberline-mark is-current';
        const label = mark && typeof mark === 'object' && mark.label ? text(mark.label) : String(value);
        dot.appendChild(el('small', '', label));
        track.appendChild(dot);
      });
      wrap.appendChild(track);
      // 端点刻度已经标了 0 / 10 时不再重复写一次，避免「0 0」「10 10」叠在一起。
      const valueOf = mark => Number(mark && typeof mark === 'object' ? mark.value : mark);
      const hasLo = marks.some(mark => valueOf(mark) === lo);
      const hasHi = marks.some(mark => valueOf(mark) === hi);
      const ends = el('div', 'k-numberline-ends');
      ends.appendChild(el('small', '', hasLo ? '' : String(lo)));
      ends.appendChild(el('small', '', hasHi ? '' : String(hi)));
      wrap.appendChild(ends);
      if (def.note) wrap.appendChild(el('p', 'k-numberline-note', def.note));
      return wrap;
    }

    function renderMasteryRing(def) {
      const wrap = el('div', def.className || 'k-mastery');
      const raw = Number(def.mastery);
      const pct = Math.min(100, Math.max(0, Number.isFinite(raw) ? raw : 0));
      const radius = 34;
      const circumference = 2 * Math.PI * radius;
      const svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('viewBox', '0 0 88 88');
      svg.setAttribute('class', 'k-mastery-svg');
      svg.setAttribute('aria-hidden', 'true');
      for (const kind of ['bg', 'fg']) {
        const circle = document.createElementNS(SVG_NS, 'circle');
        circle.setAttribute('cx', '44'); circle.setAttribute('cy', '44');
        circle.setAttribute('r', String(radius));
        circle.setAttribute('class', `k-mastery-${kind}`);
        if (kind === 'fg') {
          circle.setAttribute('stroke-dasharray', String(circumference));
          circle.setAttribute('stroke-dashoffset', String(circumference * (1 - pct / 100)));
        }
        svg.appendChild(circle);
      }
      const ring = el('div', 'k-mastery-ring');
      ring.appendChild(svg);
      ring.appendChild(el('strong', 'k-mastery-value', `${Math.round(pct)}%`));
      wrap.appendChild(ring);
      const info = el('div', 'k-mastery-info');
      if (def.point) info.appendChild(el('b', '', def.point));
      if (def.label) info.appendChild(el('span', '', def.label));
      if (def.status) info.appendChild(el('small', '', def.status));
      wrap.appendChild(info);
      return wrap;
    }

    function renderTabs(def, locals) {
      const wrap = el('div', def.className || 'k-tabs');
      const tabs = Array.isArray(def.tabs) ? def.tabs : [];
      const labelOf = item => text(item && typeof item === 'object' ? item.label : item);
      const active = text(def.active);
      const current = tabs.find(item => labelOf(item) === active) || tabs[0] || null;
      const bar = el('div', 'k-tabs-bar');
      tabs.forEach((item, index) => {
        const label = labelOf(item);
        if (!label) return;
        const btn = el('button', label === labelOf(current) ? 'k-tab-button is-active' : 'k-tab-button', label);
        const base = def.action || { event: { name: 'switchTab', context: {} } };
        attachAction(btn, {
          event: { name: base.event?.name || 'switchTab',
            context: { ...(base.event?.context || {}), tab: label, index } }
        }, { id: `tab_${index}`, component: 'Tabs', index, ...locals });
        bar.appendChild(btn);
      });
      wrap.appendChild(bar);
      const body = current && typeof current === 'object' ? text(current.text) : text(current);
      wrap.appendChild(el('div', 'k-tabs-panel', body));
      if (def.note) wrap.appendChild(el('small', 'k-tabs-note', def.note));
      return wrap;
    }

    function renderMethodNote(def) {
      const wrap = el('div', def.className || 'k-method');
      if (def.title) wrap.appendChild(el('h5', 'k-method-title', def.title));
      wrap.appendChild(el('p', 'k-method-text', def.text));
      wrap.appendChild(renderTextField({
        className: 'k-method-input', id: def.inputId, placeholder: def.placeholder,
        value: def.noteValue, bind: def.noteBind
      }));
      return wrap;
    }

    /* ---- P3：游戏化关卡 / 语音引导 / 知知求助 ----
     * 同一套组件在五个认知阶段共用：差异来自编译器给出的文案、主题与组件组合，
     * 而不是「低龄隐藏一块、高龄多给一块」。模型字符串一律只进 textContent。 */
    function actionFor(def, fallbackName, context, meta) {
      const base = def && typeof def === 'object' ? def : null;
      return {
        event: {
          name: base?.event?.name || fallbackName,
          context: { ...(base?.event?.context || {}), ...(context || {}) }
        }
      };
    }

    function renderNumberGaps(def, locals) {
      const wrap = el('div', def.className || 'k-play k-gaps');
      const head = el('div', 'k-gaps-head');
      head.appendChild(el('h3', 'k-gaps-title', def.title));
      if (def.question) head.appendChild(el('p', 'k-gaps-question', def.question));
      wrap.appendChild(head);

      const slots = Array.isArray(def.slots) ? def.slots : [];
      const gaps = Array.isArray(def.gaps) ? def.gaps : [];
      const row = el('div', 'k-gap-row');
      slots.forEach((slot, index) => {
        const fixed = text(slot) !== '';
        const filled = text(gaps[index] ?? '') !== '';
        const value = fixed ? text(slot) : text(gaps[index] ?? '');
        const cls = fixed ? 'k-gap-slot is-fixed' : (filled ? 'k-gap-slot is-filled' : 'k-gap-slot is-empty');
        if (!fixed) {
          const btn = el('button', cls, value || '?');
          btn.setAttribute('aria-label', filled ? `取回第 ${index + 1} 格` : `第 ${index + 1} 格待填`);
          attachAction(btn, actionFor(def.clearAction, 'clearGap', { index }),
            { id: `gap_slot_${index}`, component: 'NumberGaps', index, ...locals });
          row.appendChild(btn);
        } else {
          row.appendChild(el('span', cls, value));
        }
      });
      wrap.appendChild(row);

      const bank = Array.isArray(def.bank) ? def.bank : [];
      if (bank.length) {
        wrap.appendChild(el('small', 'k-gap-bank-label', '点数字块，把它放进空格里'));
        const tray = el('div', 'k-gap-bank');
        bank.forEach((item, index) => {
          const value = text(item);
          const btn = el('button', 'k-gap-tile', value);
          attachAction(btn, actionFor(null, 'fillGap', { value, index }),
            { id: `gap_bank_${index}`, component: 'NumberGaps', index, ...locals });
          tray.appendChild(btn);
        });
        wrap.appendChild(tray);
      }

      const actions = el('div', 'k-gap-actions');
      const mk = (cls, label, icon, name, context) => {
        const btn = el('button', cls, label);
        if (icon) btn.appendChild(svgIcon(icon));
        attachAction(btn, actionFor(null, name, context || {}),
          { id: `gap_${name}`, component: 'NumberGaps', ...locals });
        actions.appendChild(btn);
        return btn;
      };
      mk('k-gap-btn is-reset', def.resetLabel || '重来一次', 'refresh', 'resetGaps');
      mk('k-gap-btn is-submit', def.submitLabel || '我填好啦', 'check', 'submitGaps');
      mk('k-gap-btn is-ask', def.askLabel || '我不会，找知知', 'volume', 'askIP');
      wrap.appendChild(actions);

      if (def.hint) wrap.appendChild(el('small', 'k-gaps-hint', def.hint));
      wrap.appendChild(renderFeedback({
        id: def.feedbackId || 'gaps_feedback', text: def.feedback, tone: def.tone
      }));
      return wrap;
    }

    function renderQuestHUD(def) {
      const wrap = el('div', def.className || 'k-quest');
      const top = el('div', 'k-quest-top');
      top.appendChild(el('strong', 'k-quest-level', def.level || '第 1 关'));
      if (def.label) top.appendChild(el('span', 'k-quest-label', def.label));
      const raw = Number(def.progress);
      const pct = Math.min(100, Math.max(0, Number.isFinite(raw) ? raw : 0));
      const bar = el('div', 'k-quest-bar');
      const fill = el('span', 'k-quest-fill');
      fill.style.width = `${pct}%`;
      bar.appendChild(fill);
      top.appendChild(bar);
      wrap.appendChild(top);
      const foot = el('div', 'k-quest-foot');
      const stars = Math.min(3, Math.max(0, Number(def.stars) || 0));
      const starRow = el('span', 'k-quest-stars');
      for (let i = 0; i < 3; i += 1) {
        starRow.appendChild(el('span', i < stars ? 'is-on' : '', '★'));
      }
      foot.appendChild(starRow);
      if (def.combo !== undefined && def.combo !== null && text(def.combo) !== '') {
        foot.appendChild(el('span', 'k-quest-combo', `连对 ${text(def.combo)} 次`));
      }
      if (def.note) foot.appendChild(el('small', 'k-quest-note', def.note));
      wrap.appendChild(foot);
      return wrap;
    }

    function buildIPAvatar() {
      const svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('viewBox', '0 0 72 72');
      svg.setAttribute('class', 'k-ip-avatar-svg');
      svg.setAttribute('aria-hidden', 'true');
      const add = (tag, attrs, parent) => {
        const node = document.createElementNS(SVG_NS, tag);
        for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
        (parent || svg).appendChild(node);
        return node;
      };
      add('circle', { cx: 36, cy: 36, r: 35, fill: '#f0d24a' });
      add('circle', { cx: 36, cy: 36, r: 31, fill: '#8b5fe0' });
      add('line', { x1: 36, y1: 16, x2: 36, y2: 6, stroke: '#4b3187', 'stroke-width': 2.5, 'stroke-linecap': 'round' });
      add('circle', { cx: 36, cy: 6, r: 4, fill: '#ffd85e', stroke: '#fff', 'stroke-width': 1 });
      add('rect', { x: 15, y: 21, width: 42, height: 34, rx: 13, fill: '#7568d8', stroke: '#4b3187', 'stroke-width': 1.2 });
      add('rect', { x: 20, y: 27, width: 32, height: 16, rx: 8, fill: '#eaf4ff' });
      add('circle', { cx: 29, cy: 35, r: 4.4, fill: '#28384a' });
      add('circle', { cx: 43, cy: 35, r: 4.4, fill: '#28384a' });
      add('circle', { cx: 27.5, cy: 33.5, r: 1.4, fill: '#fff' });
      add('circle', { cx: 41.5, cy: 33.5, r: 1.4, fill: '#fff' });
      add('circle', { cx: 20, cy: 48, r: 2.8, fill: '#f2a0af', opacity: '.85' });
      add('circle', { cx: 52, cy: 48, r: 2.8, fill: '#f2a0af', opacity: '.85' });
      add('ellipse', { cx: 36, cy: 49, rx: 6, ry: 3, fill: '#2b3a49', class: 'k-ip-mouth' });
      return svg;
    }

    function renderVoiceGuide(def, locals) {
      const wrap = el('div', def.className || 'k-voice');
      wrap.appendChild(el('span', 'k-voice-label', def.label || '听一听'));
      const makeBtn = (cls, icon, label, action, name, context, id) => {
        const btn = el('button', cls);
        btn.appendChild(svgIcon(icon));
        if (label) btn.appendChild(el('span', '', label));
        attachAction(btn, actionFor(action, name, context || {}),
          { id: `voice_${id || name}`, component: 'VoiceGuide', ...locals });
        wrap.appendChild(btn);
        return btn;
      };
      makeBtn('k-voice-btn is-play', 'volume', '', def.playAction, 'readGuide', { mode: 'question' }, 'play');
      makeBtn('k-voice-btn is-guide', 'bulb', '', def.guideAction, 'readGuide', { mode: 'guide' }, 'guide');
      makeBtn(def.muted ? 'k-voice-btn is-muted' : 'k-voice-btn', 'volume', '', def.muteAction,
        'readGuide', { mode: 'mute' }, 'mute');
      if (def.hint) wrap.appendChild(el('small', 'k-voice-hint', def.hint));
      return wrap;
    }

    function renderAskIP(def, locals) {
      const wrap = el('div', def.className || 'k-ip');
      if (def.compact) wrap.classList.add('is-compact');
      const avatar = el('div', 'k-ip-avatar');
      avatar.appendChild(buildIPAvatar());
      wrap.appendChild(avatar);
      const info = el('div', 'k-ip-info');
      info.appendChild(el('strong', 'k-ip-name', def.name || '知知'));
      info.appendChild(el('small', 'k-ip-status', def.status || '随时可以问我'));
      wrap.appendChild(info);
      const buttons = el('div', 'k-ip-buttons');
      const call = el('button', 'k-ip-round is-call');
      call.setAttribute('aria-label', def.callLabel || '语音问知知');
      call.appendChild(svgIcon('volume'));
      if (def.badge !== undefined && def.badge !== null && text(def.badge) !== '' && text(def.badge) !== '0') {
        call.appendChild(el('span', 'k-ip-badge', def.badge));
      }
      attachAction(call, actionFor(def.callAction, 'askIP', {}),
        { id: 'ip_call', component: 'AskIP', ...locals });
      buttons.appendChild(call);
      const chat = el('button', 'k-ip-round is-chat');
      chat.setAttribute('aria-label', def.chatLabel || '打字问知知');
      chat.appendChild(svgIcon('face'));
      attachAction(chat, actionFor(def.chatAction, 'askIP', {}),
        { id: 'ip_chat', component: 'AskIP', ...locals });
      buttons.appendChild(chat);
      wrap.appendChild(buttons);
      // 台词放最后并独占一行：窄侧栏里和名字挤同一列会重叠；
      // 按钮必须先于台词插入，否则跨行元素会把按钮挤到第三行。
      if (def.line) wrap.appendChild(el('p', 'k-ip-line', def.line));
      return wrap;
    }

    function renderQuickQuestions(def, locals) {
      const wrap = el('div', def.className || 'k-questions');
      wrap.appendChild(el('h4', 'k-questions-title', def.title || '问知知一个快问题'));
      const list = Array.isArray(def.questions) ? def.questions : [];
      const active = text(def.activeId);
      list.forEach((item, index) => {
        const obj = item && typeof item === 'object' ? item : { text: item };
        const id = text(obj.id ?? index);
        const label = text(obj.text);
        if (!label) return;
        const row = el('div', id === active ? 'k-question is-active' : 'k-question');
        row.appendChild(el('span', 'k-question-text', label));
        const speakBtn = el('button', 'k-question-icon');
        speakBtn.setAttribute('aria-label', '朗读这个问题');
        speakBtn.appendChild(svgIcon('volume'));
        attachAction(speakBtn, actionFor(def.questionAction, 'askQuestion', {
          id, speak: label, mode: 'speak'
        }), { id: `question_speak_${index}`, component: 'QuickQuestions', index, ...locals });
        row.appendChild(speakBtn);
        const askBtn = el('button', 'k-question-icon');
        askBtn.setAttribute('aria-label', '向知知提问');
        askBtn.appendChild(svgIcon('face'));
        attachAction(askBtn, actionFor(def.questionAction, 'askQuestion', {
          id, text: label, hint: text(obj.hint), mode: 'ask'
        }), { id: `question_ask_${index}`, component: 'QuickQuestions', index, ...locals });
        row.appendChild(askBtn);
        wrap.appendChild(row);
      });
      if (def.note) wrap.appendChild(el('small', 'k-questions-note', def.note));
      wrap.appendChild(renderFeedback({ text: def.feedback, tone: def.tone }));
      return wrap;
    }

    function renderHintLadder(def, locals) {
      const wrap = el('div', def.className || 'k-hints');
      if (def.title) wrap.appendChild(el('h4', 'k-hints-title', def.title));
      const steps = Array.isArray(def.steps) ? def.steps : [];
      const unlocked = Math.min(steps.length, Math.max(0, Number(def.unlocked) || 0));
      steps.forEach((step, index) => {
        const open = index < unlocked;
        const row = el('div', open ? 'k-hint-row is-open' : 'k-hint-row is-locked');
        row.appendChild(el('span', 'k-hint-index', String(index + 1)));
        row.appendChild(el('span', 'k-hint-text',
          open ? text(step) : `第 ${index + 1} 条提示 · 点下面的按钮解锁`));
        wrap.appendChild(row);
      });
      const actions = el('div', 'k-hint-actions');
      const reveal = el('button', 'k-hint-btn is-reveal', def.button || '再给一条提示');
      attachAction(reveal, actionFor(def.revealAction, 'revealHint', {}),
        { id: 'hint_reveal', component: 'HintLadder', ...locals });
      actions.appendChild(reveal);
      const voice = el('button', 'k-hint-btn is-voice');
      voice.setAttribute('aria-label', '让知知读一遍提示');
      voice.appendChild(svgIcon('volume'));
      attachAction(voice, actionFor(def.voiceAction, 'readGuide', {}),
        { id: 'hint_voice', component: 'HintLadder', ...locals });
      actions.appendChild(voice);
      wrap.appendChild(actions);
      if (def.note) wrap.appendChild(el('small', 'k-hints-note', def.note));
      wrap.appendChild(renderFeedback({ text: def.feedback, tone: def.tone }));
      return wrap;
    }

    /* ---- P4a · 选择器型游戏组件 ----
     * 共性原则：① 所有文案经 textContent 落地；② 组件不自持状态，一切读 @path；
     * ③ 每个可点元素只登记一个 action，由容器委托，重渲染后无需重新绑定；
     * ④ 选项的 choice 在渲染时才并入 base action，编译器不需要知道用户点了什么。 */
    function p4aAction(base, extra) {
      const src = base && typeof base === 'object' ? base : {};
      return {
        event: {
          name: text(src.event?.name || src.name || ''),
          context: { ...(src.event?.context || {}), ...(extra || {}) }
        }
      };
    }
    function p4aButton(label, className, base, extra, meta) {
      const btn = el('button', className, label);
      attachAction(btn, p4aAction(base, extra), meta);
      return btn;
    }
    function p4aHead(title, note) {
      const head = el('div', 'k-p4a-head');
      head.appendChild(el('strong', 'k-p4a-title', title));
      if (note) head.appendChild(el('small', 'k-p4a-note', note));
      return head;
    }
    function p4aFeedback(def) {
      return renderFeedback({ id: def.feedbackId, text: def.feedback, tone: def.tone });
    }
    function p4aIconButton(label, icon, base, extra, meta) {
      const btn = el('button', 'k-p4a-mini');
      if (icon) btn.appendChild(svgIcon(text(icon)));
      btn.appendChild(document.createTextNode(label));
      attachAction(btn, p4aAction(base, extra), meta);
      return btn;
    }

    function renderPoemChain(def) {
      const wrap = el('div', def.className || 'k-p4a');
      wrap.appendChild(p4aHead(def.title, def.note));
      const current = def.current && typeof def.current === 'object' ? def.current : {};
      const index = Math.max(0, Number(def.index) || 0);
      const total = Number(def.total) || 0;
      const solved = Array.isArray(def.solved) ? def.solved.map(Number) : [];
      wrap.appendChild(el('div', 'k-p4a-progress', `第 ${index + 1} / ${total} 联 · 已接对 ${solved.length} 联`));
      wrap.appendChild(el('p', 'k-p4a-line', current.upper));
      if (current.source) wrap.appendChild(el('small', 'k-p4a-source', current.source));
      const tools = el('div', 'k-p4a-tools');
      tools.appendChild(p4aIconButton('读上句', 'volume', def.readAction, {}, {
        id: 'poem_read', component: 'PoemChain'
      }));
      wrap.appendChild(tools);
      const row = el('div', 'k-p4a-options');
      (Array.isArray(current.options) ? current.options : []).forEach((option, i) => {
        const label = text(typeof option === 'string' ? option : option?.label);
        row.appendChild(p4aButton(label, 'k-p4a-option', def.pickAction, { choice: label },
          { id: `poem_pick_${i}`, component: 'PoemChain', index: i }));
      });
      wrap.appendChild(row);
      wrap.appendChild(p4aFeedback(def));
      wrap.appendChild(p4aButton(index + 1 < total ? '接下一联' : '已是最后一联',
        'primary-small', def.nextAction, { index, total },
        { id: 'poem_next', component: 'PoemChain' }));
      return wrap;
    }

    function renderImageryBoard(def) {
      const wrap = el('div', def.className || 'k-p4a');
      wrap.appendChild(p4aHead(def.title, def.note));
      wrap.appendChild(el('p', 'k-p4a-line', def.line));
      const grid = el('div', 'k-p4a-imagery');
      (Array.isArray(def.imagery) ? def.imagery : []).forEach((item, i) => {
        const label = text(typeof item === 'string' ? item : item?.label);
        const picked = text(def.picked) === label;
        const btn = el('button', picked ? 'k-p4a-image is-picked' : 'k-p4a-image');
        const shape = el('span', `k-p4a-shape shape-${i % 4}`);
        shape.style.setProperty('--k-p4a-color', SHAPE_COLORS[i % SHAPE_COLORS.length]);
        btn.appendChild(shape);
        btn.appendChild(el('span', 'k-p4a-image-label', label));
        attachAction(btn, p4aAction(def.pickAction, { choice: label }),
          { id: `imagery_${i}`, component: 'ImageryBoard', index: i });
        grid.appendChild(btn);
      });
      wrap.appendChild(grid);
      const tools = el('div', 'k-p4a-tools');
      tools.appendChild(p4aIconButton('读诗句', 'volume', def.readAction, {}, {
        id: 'imagery_read', component: 'ImageryBoard'
      }));
      wrap.appendChild(tools);
      wrap.appendChild(p4aFeedback(def));
      return wrap;
    }

    function renderStoryOrder(def) {
      const wrap = el('div', def.className || 'k-p4a');
      wrap.appendChild(p4aHead(def.title, def.note));
      if (def.hint) wrap.appendChild(el('p', 'k-p4a-hint', def.hint));
      const events = Array.isArray(def.events) ? def.events : [];
      const byId = new Map(events.map(item => [text(item?.id), text(item?.text)]));
      const order = Array.isArray(def.order) ? def.order.map(text) : [];
      const list = el('ol', 'k-p4a-order');
      order.forEach((id, i) => {
        const row = el('li', 'k-p4a-order-row');
        row.appendChild(el('span', 'k-p4a-order-no', String(i + 1)));
        row.appendChild(el('span', 'k-p4a-order-text', byId.get(id) || id));
        const controls = el('span', 'k-p4a-order-ctrl');
        controls.appendChild(p4aButton('↑', 'k-p4a-move', def.moveAction,
          { direction: 'up', index: i }, { id: `order_up_${i}`, component: 'StoryOrder', index: i }));
        controls.appendChild(p4aButton('↓', 'k-p4a-move', def.moveAction,
          { direction: 'down', index: i }, { id: `order_down_${i}`, component: 'StoryOrder', index: i }));
        controls.appendChild(p4aIconButton('读', 'volume', def.readAction,
          { text: byId.get(id) || id }, { id: `order_read_${i}`, component: 'StoryOrder', index: i }));
        row.appendChild(controls);
        list.appendChild(row);
      });
      wrap.appendChild(list);
      wrap.appendChild(p4aButton(def.checked ? '再检查一次' : '检查顺序', 'primary-small',
        def.checkAction, {}, { id: 'order_check', component: 'StoryOrder' }));
      wrap.appendChild(p4aFeedback(def));
      return wrap;
    }

    function renderLookAlike(def) {
      const wrap = el('div', def.className || 'k-p4a');
      wrap.appendChild(p4aHead(def.title, def.note));
      const current = def.current && typeof def.current === 'object' ? def.current : {};
      const index = Math.max(0, Number(def.index) || 0);
      const total = Number(def.total) || 0;
      wrap.appendChild(el('div', 'k-p4a-progress', `第 ${index + 1} / ${total} 组`));
      wrap.appendChild(el('p', 'k-p4a-line', current.context));
      const row = el('div', 'k-p4a-options');
      for (const side of ['a', 'b']) {
        const label = text(current[side]);
        if (!label) continue;
        row.appendChild(p4aButton(label,
          text(def.picked) === label ? 'k-p4a-option is-picked' : 'k-p4a-option',
          def.pickAction, { choice: label },
          { id: `char_${side}`, component: 'LookAlike' }));
      }
      wrap.appendChild(row);
      wrap.appendChild(p4aFeedback(def));
      wrap.appendChild(p4aButton(index + 1 < total ? '下一组' : '已是最后一组', 'primary-small',
        def.nextAction, { index, total }, { id: 'char_next', component: 'LookAlike' }));
      return wrap;
    }

    function renderRhetoricMatch(def) {
      const wrap = el('div', def.className || 'k-p4a');
      wrap.appendChild(p4aHead(def.title, def.note));
      const pairs = Array.isArray(def.pairs) ? def.pairs : [];
      const matched = Array.isArray(def.matched) ? def.matched.map(Number) : [];
      const cols = el('div', 'k-p4a-cols');
      for (const side of ['left', 'right']) {
        const col = el('div', `k-p4a-col k-p4a-${side}`);
        col.appendChild(el('small', 'k-p4a-col-title', side === 'left' ? '读一读左边' : '找到对应的右边'));
        pairs.forEach((pair, i) => {
          const label = text(side === 'left' ? pair?.sentence : pair?.device);
          if (!label) return;
          const active = side === 'right' && matched.includes(i);
          const selected = side === 'left' && Number(def.left) === i;
          const cls = `k-p4a-pair${active ? ' is-matched' : ''}${selected ? ' is-selected' : ''}`;
          col.appendChild(p4aButton(label, cls, def.pairAction, { side, index: i, label },
            { id: `rhetoric_${side}_${i}`, component: 'RhetoricMatch', index: i }));
          if (side === 'left') {
            col.appendChild(p4aIconButton('读', 'volume', def.readAction, { text: label },
              { id: `rhetoric_read_${i}`, component: 'RhetoricMatch', index: i }));
          }
        });
        cols.appendChild(col);
      }
      wrap.appendChild(cols);
      wrap.appendChild(p4aFeedback(def));
      return wrap;
    }

    function renderGrammarDoctor(def) {
      const wrap = el('div', def.className || 'k-p4a');
      wrap.appendChild(p4aHead(def.title, def.note));
      const sentence = text(def.sentence);
      const error = text(def.error);
      const line = el('p', 'k-p4a-line');
      const parts = error ? sentence.split(error) : [sentence];
      if (parts.length > 1) {
        parts.forEach((part, i) => {
          if (i) line.appendChild(el('mark', 'k-p4a-error', error));
          line.appendChild(document.createTextNode(part));
        });
      } else line.textContent = sentence;
      wrap.appendChild(line);
      const row = el('div', 'k-p4a-options');
      (Array.isArray(def.fixes) ? def.fixes : []).forEach((fix, i) => {
        const label = text(fix);
        row.appendChild(p4aButton(label,
          text(def.picked) === label ? 'k-p4a-option is-picked' : 'k-p4a-option',
          def.pickAction, { choice: label }, { id: `fix_${i}`, component: 'GrammarDoctor', index: i }));
      });
      wrap.appendChild(row);
      wrap.appendChild(p4aFeedback(def));
      const tools = el('div', 'k-p4a-tools');
      tools.appendChild(p4aIconButton('读订正后的句子', 'volume', def.readAction, {},
        { id: 'fix_read', component: 'GrammarDoctor' }));
      tools.appendChild(p4aIconButton('为什么', 'bulb', def.whyAction, {},
        { id: 'fix_why', component: 'GrammarDoctor' }));
      wrap.appendChild(tools);
      if (def.showWhy && def.explanation) wrap.appendChild(el('p', 'k-p4a-why', def.explanation));
      if (def.fixed) wrap.appendChild(el('p', 'k-p4a-fixed', `订正：${text(def.fixed)}`));
      return wrap;
    }

    /* ---- P4b / P4c / P4d：四组通用渲染器 ----
     * 19 个组件只对应 4 种交互范式（装配 / 分支 / 开放产出 / 图形情境），
     * 所以渲染层也是 4 个函数 + 一张分派表，避免 13 份重复 DOM 代码。
     * 复用上面的 p4aAction / p4aButton / p4aHead / p4aFeedback 工具函数。 */
    function gameMeta(def, id, index) {
      return { id, component: text(def.component), ...(index === undefined ? {} : { index }) };
    }

    /** P4b 装配台：槽位 + 候选块 + 可回退到任意一步的撤销条。 */
    function renderAssembly(def) {
      const wrap = el('div', def.className || 'k-game');
      wrap.appendChild(p4aHead(def.title, def.note));
      const slots = Array.isArray(def.slots) ? def.slots : [];
      const bank = Array.isArray(def.bank) ? def.bank : [];
      const placed = def.placed && typeof def.placed === 'object' ? def.placed : {};
      const byId = new Map(bank.map(item => [text(item?.id), text(item?.label)]));
      const used = new Set(Object.values(placed).map(text));
      const filled = slots.filter(slot => placed[slot.id]).length;
      wrap.appendChild(el('div', 'k-game-progress', `已放 ${filled} / ${slots.length} 块`));

      const slotRow = el('div', 'k-game-slots');
      slots.forEach((slot, i) => {
        const tileId = text(placed[slot.id]);
        const label = byId.get(tileId) || text(slot.label);
        const cls = tileId ? 'k-game-slot is-filled' : 'k-game-slot';
        const btn = el('button', cls, label);
        attachAction(btn, p4aAction(def.placeAction, { slotId: text(slot.id), tileId: text(def.selected) }),
          gameMeta(def, `slot_${i}`, i));
        slotRow.appendChild(btn);
      });
      wrap.appendChild(slotRow);

      const bankRow = el('div', 'k-game-bank');
      bank.forEach((tile, i) => {
        const id = text(tile?.id);
        const selected = text(def.selected) === id;
        const cls = `k-game-tile${selected ? ' is-selected' : ''}${used.has(id) ? ' is-used' : ''}`;
        const btn = el('button', cls, text(tile?.label));
        attachAction(btn, p4aAction(def.pickAction, { tileId: id }), gameMeta(def, `tile_${i}`, i));
        bankRow.appendChild(btn);
      });
      wrap.appendChild(bankRow);

      const history = Array.isArray(def.history) ? def.history : [];
      const tools = el('div', 'k-p4a-tools');
      tools.appendChild(p4aButton('撤销一步', 'k-p4a-mini', def.undoAction, {},
        gameMeta(def, 'assembly_undo')));
      history.forEach((_, i) => {
        tools.appendChild(p4aButton(`回到第 ${i} 步`, 'k-p4a-mini', def.undoAction, { step: i },
          gameMeta(def, `assembly_step_${i}`, i)));
      });
      tools.appendChild(p4aButton('重新拼', 'k-p4a-mini', def.resetAction, {}, gameMeta(def, 'assembly_reset')));
      tools.appendChild(p4aButton(def.checked ? '再检查一次' : '检查顺序', 'k-p4a-mini',
        def.checkAction, {}, gameMeta(def, 'assembly_check')));
      tools.appendChild(p4aButton('读一读', 'k-p4a-mini', def.readAction, {}, gameMeta(def, 'assembly_read')));
      wrap.appendChild(tools);
      wrap.appendChild(p4aFeedback(def));
      return wrap;
    }

    /** P4c 分支选择：开放产出，界面不显示对错，只显示选中后的结果文本。 */
    function renderBranch(def) {
      const wrap = el('div', def.className || 'k-game');
      wrap.appendChild(p4aHead(def.title, def.note));
      wrap.appendChild(el('p', 'k-p4a-line', def.scene));
      const list = el('div', 'k-game-choices');
      (Array.isArray(def.choices) ? def.choices : []).forEach((item, i) => {
        const id = text(item?.id);
        const label = text(item?.label);
        const cls = text(def.picked) === id ? 'k-game-choice is-picked' : 'k-game-choice';
        list.appendChild(p4aButton(label, cls, def.chooseAction, { id, label },
          gameMeta(def, `branch_${i}`, i)));
      });
      wrap.appendChild(list);
      if (def.outcome) wrap.appendChild(el('p', 'k-p4a-why', def.outcome));
      wrap.appendChild(p4aFeedback(def));
      const tools = el('div', 'k-p4a-tools');
      tools.appendChild(p4aIconButton('读一读', 'volume', def.readAction, {}, gameMeta(def, 'branch_read')));
      tools.appendChild(p4aIconButton('问问知知', 'bulb', def.askAction, {}, gameMeta(def, 'branch_ask')));
      wrap.appendChild(tools);
      if (def.reward && def.picked) wrap.appendChild(el('span', 'k-game-reward', '想得不错，继续讲下去'));
      return wrap;
    }

    /** P4c 语音 / 跟写：朗读可随时停止，停止后按钮与「正在朗读」状态都复位。 */
    function renderOpen(def) {
      const wrap = el('div', def.className || 'k-game');
      wrap.appendChild(p4aHead(def.title, def.note));
      const lines = Array.isArray(def.lines) ? def.lines : [];
      const active = Math.max(0, Number(def.active) || 0);
      const created = Array.isArray(def.created) ? def.created.map(Number) : [];
      const list = el('ol', 'k-game-lines');
      lines.forEach((line, i) => {
        const row = el('li', i === active ? 'k-game-line is-active' : 'k-game-line');
        row.appendChild(el('small', 'k-game-role', text(line?.role) || '旁白'));
        row.appendChild(el('span', 'k-game-line-text', text(line?.text)));
        if (created.includes(i)) row.appendChild(el('span', 'k-game-done', '已完成'));
        row.appendChild(p4aIconButton('读', 'volume', def.readAction,
          { index: i, text: text(line?.text) }, gameMeta(def, `voice_read_${i}`, i)));
        list.appendChild(row);
      });
      wrap.appendChild(list);
      const tools = el('div', 'k-p4a-tools');
      tools.appendChild(p4aButton(def.reading ? '停止朗读' : '朗读这一句', 'k-p4a-mini',
        def.reading ? def.stopAction : def.readAction,
        def.reading ? {} : { index: active, text: text(lines[active]?.text) },
        gameMeta(def, 'voice_main')));
      if (!def.reading) {
        tools.appendChild(p4aButton('停止 / 复位', 'k-p4a-mini', def.stopAction, {}, gameMeta(def, 'voice_stop')));
      }
      tools.appendChild(p4aButton('这一句读好了', 'k-p4a-mini', def.createAction,
        { index: active }, gameMeta(def, 'voice_done')));
      tools.appendChild(p4aButton('下一句', 'k-p4a-mini', def.nextAction,
        { index: active, total: lines.length }, gameMeta(def, 'voice_next')));
      wrap.appendChild(tools);
      wrap.appendChild(p4aFeedback(def));
      if (def.reward && created.length) wrap.appendChild(el('span', 'k-game-reward', `已完成 ${created.length} 句`));
      return wrap;
    }

    /** P4d 图形情境：形状只用固定 CSS class 渲染，绝不解释模型给的字符串为 HTML/SVG。 */
    function renderGraphic(def) {
      const wrap = el('div', def.className || 'k-game');
      wrap.appendChild(p4aHead(def.title, def.note));
      wrap.appendChild(el('p', 'k-p4a-line', def.question));
      const shapes = Array.isArray(def.shapes) ? def.shapes : [];
      if (shapes.length) {
        const row = el('div', 'k-game-shapes');
        shapes.forEach(item => {
          const kind = /^shape-[0-3]$/.test(text(item?.kind)) ? text(item.kind) : 'shape-0';
          row.appendChild(el('span', `k-game-shape ${kind}`));
        });
        wrap.appendChild(row);
      }
      const units = Array.isArray(def.units) ? def.units : [];
      if (units.length) {
        const row = el('div', 'k-game-units');
        units.forEach(item => {
          const value = Math.max(0, Math.min(10, Number(item?.value) || 0));
          const line = el('div', 'k-game-unit');
          line.appendChild(el('small', '', text(item?.label)));
          const bar = el('span', 'k-game-bar');
          bar.style.width = `${Math.max(8, value * 10)}%`;
          line.appendChild(bar);
          row.appendChild(line);
        });
        wrap.appendChild(row);
      }
      const index = Math.max(0, Number(def.index) || 0);
      const total = Number(def.total) || 1;
      // 只有轮次进度，没有倒计时 / 分数 / 排名。
      wrap.appendChild(el('div', 'k-game-progress',
        `第 ${index + 1} / ${total} 轮${def.allowTimer ? ' · 可自行计时' : ' · 不着急，慢慢来'}`));
      const row = el('div', 'k-p4a-options');
      (Array.isArray(def.options) ? def.options : []).forEach((option, i) => {
        const label = text(option);
        row.appendChild(p4aButton(label,
          text(def.picked) === label ? 'k-p4a-option is-picked' : 'k-p4a-option',
          def.pickAction, { choice: label, index }, gameMeta(def, `graphic_${i}`, i)));
      });
      wrap.appendChild(row);
      wrap.appendChild(p4aFeedback(def));
      const tools = el('div', 'k-p4a-tools');
      tools.appendChild(p4aIconButton('读题目', 'volume', def.readAction, {}, gameMeta(def, 'graphic_read')));
      tools.appendChild(p4aButton('下一轮', 'k-p4a-mini', def.stepAction, { index, total },
        gameMeta(def, 'graphic_next')));
      tools.appendChild(p4aButton('再看图', 'k-p4a-mini', def.unitAction, {}, gameMeta(def, 'graphic_units')));
      wrap.appendChild(tools);
      return wrap;
    }

    function renderContainer(def, tag, locals) {
      const node = el(tag, def.className || '');
      const children = Array.isArray(def.children) ? def.children : [];
      for (const id of children) {
        const child = renderComponent(id, locals);
        if (child) node.appendChild(child);
      }
      return node;
    }

    /** 组件渲染分派表：catalog 里登记但未实现的组件会显式报错，绝不静默吞掉。 */
    const RENDERERS = {
      Column: (def, locals) => renderContainer(def, 'div', locals),
      Row: (def, locals) => renderContainer(def, 'div', locals),
      Card: (def, locals) => renderContainer(def, 'section', locals),
      List: (def, locals) => renderList(def, locals),
      Text: def => renderText(def),
      Button: (def, locals) => renderButton(def, locals),
      TextField: def => renderTextField(def),
      WordChips: (def, locals) => renderWordChips(def, locals),
      Feedback: def => renderFeedback(def),
      EmptyState: def => el('div', def.className || 'stage-hint is-empty', def.text),
      CardHeading: (def, locals) => renderCardHeading(def, locals),
      HintBar: def => el('div', def.className || 'stage-hint', def.text),
      PoemLine: (def, locals) => renderPoemLine(def, locals),
      SpeakButton: (def, locals) => {
        const value = text(def.text);
        const node = el('button', def.className || 'text-button');
        if (def.icon) node.appendChild(svgIcon(text(def.icon)));
        node.appendChild(document.createTextNode(text(def.label)));
        if (!value) node.disabled = true;
        attachAction(node, def.action, { id: 'read_all', component: 'SpeakButton' });
        return node;
      },
      WritingPad: (def, locals) => renderWritingPad(def, locals),
      ChoiceQuiz: (def, locals) => renderChoiceQuiz(def, locals),
      StepReveal: (def, locals) => renderStepReveal(def, locals),
      FormulaBlock: def => renderFormulaBlock(def),
      IdiomCard: def => renderIdiomCard(def),
      WordCard: def => renderWordCard(def),
      PictureChoice: (def, locals) => renderPictureChoice(def, locals),
      MatchPairs: (def, locals) => renderMatchPairs(def, locals),
      NumberLine: def => renderNumberLine(def),
      MasteryRing: def => renderMasteryRing(def),
      Tabs: (def, locals) => renderTabs(def, locals),
      MethodNote: def => renderMethodNote(def),
      NumberGaps: (def, locals) => renderNumberGaps(def, locals),
      QuestHUD: def => renderQuestHUD(def),
      VoiceGuide: (def, locals) => renderVoiceGuide(def, locals),
      AskIP: (def, locals) => renderAskIP(def, locals),
      QuickQuestions: (def, locals) => renderQuickQuestions(def, locals),
      HintLadder: (def, locals) => renderHintLadder(def, locals),
      PoemChain: def => renderPoemChain(def),
      ImageryBoard: def => renderImageryBoard(def),
      StoryOrder: def => renderStoryOrder(def),
      LookAlike: def => renderLookAlike(def),
      RhetoricMatch: def => renderRhetoricMatch(def),
      GrammarDoctor: def => renderGrammarDoctor(def),
      // P4b 拼装型：6 个组件共用装配台渲染器（每行一条，便于回归逐项扫描）
      PoemTiles: def => renderAssembly(def),
      RadicalTiles: def => renderAssembly(def),
      SentenceBlocks: def => renderAssembly(def),
      LetterTiles: def => renderAssembly(def),
      ColumnArithmetic: def => renderAssembly(def),
      BalanceScale: def => renderAssembly(def),
      // P4c 分支 / 开放产出
      StoryBranch: def => renderBranch(def),
      TenseTimeline: def => renderBranch(def),
      RoleVoice: def => renderOpen(def),
      StrokeOrder: def => renderOpen(def),
      // P4d 图形与情境
      SpeedRound: def => renderGraphic(def),
      UnitStrip: def => renderGraphic(def),
      ShapeSplit: def => renderGraphic(def)
    };

    function renderComponent(id, locals = {}) {
      const def = components.get(id);
      if (!def) return null; // 流式：组件尚未到达时先跳过，后续消息补齐
      const renderer = RENDERERS[def.component];
      if (!renderer) throw new Error(`组件 ${def.component} 已登记但当前 renderer 未实现`);
      const resolved = resolve(def, locals);
      return renderer(resolved, locals);
    }

    function render() {
      if (destroyed) return;
      const rootDef = components.get('root');
      if (!rootDef) return;
      const resolvedRoot = resolve(rootDef, {});
      const active = document.activeElement;
      const activeId = active && active.id;
      const selectionStart = active && typeof active.selectionStart === 'number' ? active.selectionStart : null;
      // 容器本身就是 root 节点，避免多套一层 div 破坏 CSS 的 .two-column 网格。
      container.className = safeClass(resolvedRoot.className) || 'two-column';
      container.replaceChildren();
      const children = Array.isArray(resolvedRoot.children) ? resolvedRoot.children : [];
      for (const id of children) {
        const node = renderComponent(id, {});
        if (node) container.appendChild(node);
      }
      if (activeId) {
        const again = document.getElementById(activeId);
        if (again && container.contains(again)) {
          again.focus({ preventScroll: true });
          if (selectionStart !== null && typeof again.setSelectionRange === 'function') {
            try { again.setSelectionRange(selectionStart, selectionStart); } catch { /* input 类型不支持 */ }
          }
        }
      }
    }

    function resolveContext(context, locals) {
      const out = {};
      for (const [key, value] of Object.entries(context || {})) {
        out[key] = resolve(value, locals);
      }
      return out;
    }

    function dispatch(action, node, event) {
      const name = text(action?.event?.name || action?.name || '');
      if (!catalog.ACTION_EVENTS.includes(name)) return;
      const locals = {
        base: node.getAttribute('data-a2ui-base') || '',
        index: node.hasAttribute('data-a2ui-index') ? Number(node.getAttribute('data-a2ui-index')) : undefined
      };
      const context = resolveContext(action?.event?.context || {}, locals);
      // 朗读是 renderer function，不是业务动作：由协议层直接调，外部监听只做埋点。
      if ((name === 'readPoem' || name === 'readAll') && context.text) {
        callFunction('speak', { text: context.text });
      }
      // 语音引导 / IP 求助统一用 context.speak 声明「这段话要读出来」，
      // 值可以是 {"@path":"/play/question"}，在派发时才绑定，不渲染进 DOM。
      if (context.speak && !((name === 'readPoem' || name === 'readAll') && context.text === context.speak)) {
        callFunction('speak', { text: text(context.speak) });
      }
      const message = {
        id: node.getAttribute('data-a2ui-id') || node.id || '',
        component: node.getAttribute('data-a2ui-component') || '',
        action: { event: { name, context } }
      };
      for (const fn of handlers) {
        try { fn(message, { node, event, surface }); } catch (err) { console.warn('[a2ui] action handler', err); }
      }
    }

    function onClick(event) {
      let node = event.target;
      while (node && node !== container && !actions.has(node)) node = node.parentNode;
      if (!node || node === container || !actions.has(node)) return;
      event.stopPropagation();
      dispatch(actions.get(node), node, event);
    }
    function onInput(event) {
      const pointer = binds.get(event.target);
      if (!pointer) return;
      catalog.pointerSet(model, pointer, event.target.value);
    }
    container.addEventListener('click', onClick);
    container.addEventListener('input', onInput);

    function callFunction(name, args = {}) {
      if (!catalog.RENDERER_FUNCTIONS.includes(name)) {
        throw new Error(`未注册的 renderer function: ${name}`);
      }
      return FUNCTIONS[name](args);
    }

    function apply(message) {
      const check = catalog.validateMessage(message, options.capabilities);
      if (!check.ok) throw new Error(`A2UI 消息校验失败：${check.errors.join('；')}`);
      const body = message[check.type];
      if (check.type === 'createSurface') {
        surfaceId = body.surfaceId;
        components.clear();
        for (const item of body.components || []) components.set(item.id, item);
        model = JSON.parse(JSON.stringify(body.dataModel || {}));
      } else if (check.type === 'updateComponents') {
        for (const item of body.components || []) components.set(item.id, item);
      } else if (check.type === 'updateDataModel') {
        catalog.pointerSet(model, body.path, body.value);
      } else if (check.type === 'deleteSurface') {
        components.clear();
        container.replaceChildren();
      } else if (check.type === 'callRendererFunction') {
        return callFunction(body.name, body.args || {});
      }
      return undefined;
    }

    const surface = {
      /** 一次喂入多条消息：全部应用后只渲染一次，避免流式到达时闪屏。 */
      feed(messages) {
        const list = Array.isArray(messages) ? messages : [messages];
        for (const message of list) apply(message);
        render();
        return surface;
      },
      /** 本地更新数据模型（例如提交仿写后写回反馈文案）。 */
      setData(path, value, shouldRender = true) {
        catalog.pointerSet(model, path, value);
        if (shouldRender) render();
        return surface;
      },
      getData(path) { return catalog.pointerGet(model, path); },
      callFunction,
      onAction(fn) { if (typeof fn === 'function') handlers.add(fn); return () => handlers.delete(fn); },
      render,
      destroy() {
        destroyed = true;
        container.removeEventListener('click', onClick);
        container.removeEventListener('input', onInput);
        handlers.clear();
        components.clear();
      },
      get model() { return model; },
      get surfaceId() { return surfaceId; },
      get componentCount() { return components.size; }
    };
    return surface;
  }

  const API = { createSurface, FUNCTIONS, ICONS, safeClass, svgIcon };
  if (root) root.ZHIDAO_A2UI = API;
})(typeof window !== 'undefined' ? window : null);
