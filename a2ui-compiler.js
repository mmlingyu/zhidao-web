/* BUNDLED_A2UI_VALIDATE：与 a2ui-validate.js 同步。独立脚本若 404，本文件仍会挂上 ZHIDAO_A2UI_VALIDATE。 */
/* 知识组件校验层 · 编译之后、渲染之前
 *
 * 自我优化三步，纯函数、零 DOM，前后端共用：
 *   1. 充实 (fill)   — 空白字段从本课备用素材补齐（全部例句、诗句、步骤）
 *   2. 去重 (dedupe) — 与「上面已经展示的课程卡片」比对；选择题撞题时
 *                     改用下一道未展示的题，没有替补就丢掉，避免并排两道同样的题
 *   3. 收口 (prune)  — 补不齐的空白卡（例如只有「朗读」按钮没有文本）直接移除；
 *                     去掉空壳 Card；若整区被裁空，再用本课素材补一张互补练习
 *
 * 每一步写入 report，方便回归与现场排查。
 */
'use strict';

(function (root) {
  const isNode = typeof module !== 'undefined' && !!module.exports;

  function normalize(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[''`""''""]/g, '"')
      .replace(/\s+/g, ' ')
      .replace(/[，。！？、,.!?;:：；()（）[\]【】]/g, '')
      .trim();
  }

  function resolvePath(model, path) {
    if (!path) return undefined;
    const parts = String(path).replace(/^\//, '').split('/').filter(Boolean);
    let cur = model;
    for (const part of parts) {
      if (cur == null) return undefined;
      cur = cur[part];
    }
    return cur;
  }

  function resolve(model, value) {
    if (value && typeof value === 'object' && !Array.isArray(value) && value['@path']) {
      return resolvePath(model, value['@path']);
    }
    return value;
  }

  function asText(value) {
    if (value == null) return '';
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number') return String(value);
    if (Array.isArray(value)) return value.map(asText).filter(Boolean).join(' ');
    if (typeof value === 'object') {
      return ['text', 'sentence', 'question', 'en', 'cn', 'word', 'title', 'meaning', 'label']
        .map(key => asText(value[key])).filter(Boolean).join(' ');
    }
    return '';
  }

  function isEmptyValue(value) {
    if (value == null) return true;
    if (typeof value === 'string') return !value.trim();
    if (Array.isArray(value)) {
      return value.filter(item => {
        if (item == null) return false;
        if (typeof item === 'object') {
          return !isEmptyValue(item.text || item.word || item.en || item.label || item.sentence || item);
        }
        return String(item).trim();
      }).length === 0;
    }
    if (typeof value === 'object') return !asText(value);
    return false;
  }

  const CONTENT_KEYS = {
    SpeakButton: ['text'],
    ChoiceQuiz: ['question', 'options'],
    PictureChoice: ['question', 'options'],
    Feedback: ['text'],
    Text: ['text'],
    HintBar: ['text'],
    PoemLine: ['text'],
    WordChips: ['items'],
    WritingPad: ['task'],
    StepReveal: ['steps'],
    FormulaBlock: ['formula'],
    IdiomCard: ['word'],
    WordCard: ['word'],
    MatchPairs: ['pairs'],
    MethodNote: ['text', 'title'],
    NumberLine: ['label', 'note'],
    MasteryRing: ['point', 'label'],
    Tabs: ['tabs']
  };

  const PLACEHOLDER_FEEDBACK = [
    '先自己试一次，做完知知会告诉你结果。',
    '完成一次练习后，这里会给出结果与分析。',
    '答对啦，这一步你已经会了。'
  ].map(normalize);

  function isPlaceholderFeedback(value) {
    const text = normalize(asText(value));
    if (!text) return true;
    return PLACEHOLDER_FEEDBACK.some(item => text === item || text.includes(item) || item.includes(text));
  }

  function isBlank(component, dataModel) {
    if (component.component === 'Feedback') {
      return isPlaceholderFeedback(resolve(dataModel, component.text));
    }
    const keys = CONTENT_KEYS[component.component];
    if (!keys) return false;
    return keys.every(key => isEmptyValue(resolve(dataModel, component[key])));
  }

  function fingerprint(component, dataModel) {
    const keys = CONTENT_KEYS[component.component] || ['text', 'question'];
    return normalize(keys.map(key => asText(resolve(dataModel, component[key]))).join(' '));
  }

  function overlaps(fp, presented) {
    if (!fp || fp.length < 4) return false;
    const pool = [...(presented.questions || []), ...(presented.texts || [])]
      .map(normalize).filter(Boolean);
    for (const item of pool) {
      if (!item) continue;
      if (fp === item) return true;
      if (item.length >= 8 && fp.includes(item)) return true;
      if (fp.length >= 8 && item.includes(fp)) return true;
    }
    return false;
  }

  function collectSpeech(data, dataModel) {
    const chunks = [];
    const push = value => {
      const text = asText(value);
      if (text) chunks.push(text);
    };
    const knowledge = dataModel && dataModel.knowledge ? dataModel.knowledge : {};
    push(knowledge.speech);
    const pools = [data, knowledge].filter(Boolean);
    for (const pool of pools) {
      if (Array.isArray(pool.poems)) pool.poems.forEach(item => push(item && (item.text || item)));
      if (Array.isArray(pool.steps)) {
        pool.steps.forEach(item => push(typeof item === 'string' ? item : (item && (item.text || item.title))));
      }
      if (Array.isArray(pool.items)) {
        for (const item of pool.items) {
          if (!item) continue;
          if (Array.isArray(item.examples)) {
            item.examples.forEach(ex => push(ex && (ex.en || ex.text || ex.sentence || ex)));
          }
          push(item.speech || item.example || item.en || item.description || item.tip);
        }
      }
      if (Array.isArray(pool.wordCard && pool.wordCard.examples)) {
        pool.wordCard.examples.forEach(push);
      }
      // 例句不够时，口诀和辨析也可朗读，总比空白卡片好。
      push(pool.mnemonic);
      push(pool.note);
      push(pool.advancedTip);
      if (pool.difference) push(pool.difference.answer || pool.difference);
    }
    const seen = new Set();
    const unique = [];
    for (const chunk of chunks) {
      const key = normalize(chunk);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      unique.push(chunk);
    }
    // 朗读不宜过长：英文例句优先，最多三句。
    const english = unique.filter(text => /[a-z]/i.test(text));
    const picked = (english.length ? english : unique).slice(0, 3);
    const joiner = picked.some(text => /[a-z]/i.test(text) && !/[\u4e00-\u9fa5]/.test(text)) ? '. ' : '。';
    return picked.join(joiner);
  }

  function normalizeQuiz(quiz) {
    if (!quiz || typeof quiz !== 'object') return null;
    const sentence = String(quiz.sentence || quiz.question || '').trim();
    const choices = Array.isArray(quiz.choices) ? quiz.choices.map(String)
      : (Array.isArray(quiz.options) ? quiz.options.map(String) : []);
    const answer = String(quiz.answer || '');
    if (!sentence || choices.length < 2) return null;
    return { sentence, choices, answer };
  }

  function dropComponent(components, id, report, reason) {
    const target = components.find(item => item.id === id);
    const wrappers = components.filter(item =>
      item.component === 'Card' && Array.isArray(item.children) && item.children.includes(id));
    const dropIds = new Set([id, ...wrappers.map(item => item.id)]);
    const next = components.filter(item => !dropIds.has(item.id));
    for (const item of next) {
      if (Array.isArray(item.children)) {
        item.children = item.children.filter(child => !dropIds.has(child));
      }
    }
    report.push({
      action: 'drop',
      id,
      component: target && target.component,
      reason,
      message: `已移除${target ? target.component : '组件'}（${reason}）`
    });
    return next;
  }

  /**
   * @param {object} input
   * @param {Array}  input.components
   * @param {object} input.dataModel
   * @param {object} [input.presented]  { questions: string[], texts: string[] } 主界面已展示的内容
   * @param {object} [input.extras]     { quizzes, data, items }
   * @returns {{ components, dataModel, report, contentCount, empty }}
   */
  function optimize(input = {}) {
    const report = [];
    let list = Array.isArray(input.components) ? input.components.slice() : [];
    const model = input.dataModel && typeof input.dataModel === 'object' ? input.dataModel : {};
    if (!model.knowledge) model.knowledge = {};
    const presented = input.presented && typeof input.presented === 'object' ? input.presented : {};
    const extras = input.extras && typeof input.extras === 'object' ? input.extras : {};

    // 1. 充实空白朗读文本（不用已经出现在上方的题干去填，避免新的重复）
    if (!String(model.knowledge.speech || '').trim()) {
      const filled = collectSpeech(extras.data || extras, model);
      // 只避免用主界面当前题干去填；口诀、辨析拿来朗读是互补练习，可以保留。
      if (filled && !overlaps(normalize(filled), { questions: presented.questions || [], texts: [] })) {
        model.knowledge.speech = filled;
        report.push({
          action: 'fill', path: '/knowledge/speech', reason: 'blank',
          message: '已从本课例句补齐朗读文本'
        });
      }
    }

    // 2. 选择题与上方卡片撞题：换成未展示的题，否则丢掉
    const quizzes = (extras.quizzes || model.knowledge.quizzes || []).map(normalizeQuiz).filter(Boolean);
    const presentedQ = new Set((presented.questions || []).map(normalize).filter(Boolean));

    for (const comp of list.slice()) {
      if (comp.component !== 'ChoiceQuiz' && comp.component !== 'PictureChoice') continue;
      const question = asText(resolve(model, comp.question));
      const fp = normalize(question);
      if (!fp || (!presentedQ.has(fp) && !overlaps(fp, presented))) continue;
      const next = quizzes.find(quiz => {
        const key = normalize(quiz.sentence);
        return key && key !== fp && !presentedQ.has(key);
      });
      if (next) {
        model.knowledge.question = next.sentence;
        model.knowledge.options = next.choices;
        model.knowledge.answer = next.answer;
        presentedQ.add(normalize(next.sentence));
        report.push({
          action: 'replace', id: comp.id, component: comp.component, reason: 'duplicate',
          message: '选择题与上方卡片重复，已换成另一道未展示的题'
        });
      } else {
        list = dropComponent(list, comp.id, report, '与上方已展示的题目重复，且没有可替换的题目');
      }
    }

    // 同组卡片之间去重
    const seen = new Set();
    for (const comp of list.slice()) {
      if (comp.component === 'Card' || comp.component === 'Column') continue;
      const fp = fingerprint(comp, model);
      if (fp && seen.has(fp)) {
        list = dropComponent(list, comp.id, report, '与同组另一张卡片内容重复');
      } else if (fp) {
        seen.add(fp);
      }
    }

    // 3. 裁掉补不齐的空白（「朗读」标签不算内容；编译时尚未作答的 Feedback 也属空白）
    for (const comp of list.slice()) {
      if (comp.component === 'Card' || comp.component === 'Column') continue;
      if (isBlank(comp, model)) {
        list = dropComponent(list, comp.id, report, '内容为空');
      }
    }

    for (const comp of list.slice()) {
      if (comp.component === 'Card' && (!Array.isArray(comp.children) || !comp.children.length)) {
        const dropIds = new Set([comp.id]);
        list = list.filter(item => !dropIds.has(item.id));
        for (const item of list) {
          if (Array.isArray(item.children)) {
            item.children = item.children.filter(child => !dropIds.has(child));
          }
        }
        report.push({
          action: 'drop', id: comp.id, component: 'Card', reason: 'empty-card',
          message: '已移除没有内容的空卡片'
        });
      }
    }

    // 去重裁空后，尽量用本课素材补一张互补练习，避免年级组件区只剩标题。
    list = ensureComplement(list, model, extras, presented, report);

    const contentCount = list.filter(item => item.component !== 'Column' && item.component !== 'Card').length;
    return { components: list, dataModel: model, report, contentCount, empty: contentCount === 0 };
  }

  function ensureComplement(components, model, extras, presented, report) {
    const content = (components || []).filter(item => item.component !== 'Column' && item.component !== 'Card');
    if (content.length) return components;
    const data = extras.data || extras || {};
    if (!model.knowledge) model.knowledge = {};

    if (!String(model.knowledge.speech || '').trim()) {
      const filled = collectSpeech(data, model);
      if (filled && !overlaps(normalize(filled), { questions: presented.questions || [], texts: [] })) {
        model.knowledge.speech = filled;
      }
    }
    if (String(model.knowledge.speech || '').trim()) {
      return appendCard(components, {
        id: 'validate_speak', component: 'SpeakButton', label: '朗读',
        text: { '@path': '/knowledge/speech' }
      }, report, '已用本课例句补上一张朗读卡');
    }

    const items = Array.isArray(data.items) ? data.items : (Array.isArray(extras.items) ? extras.items : []);
    const first = items.find(item => item && (item.word || item.title));
    if (first) {
      model.knowledge.wordCard = {
        word: String(first.word || first.title || ''),
        phonetic: String(first.phonetic || ''),
        examples: Array.isArray(first.examples)
          ? first.examples.map(ex => asText(ex && (ex.en || ex.cn || ex))).filter(Boolean)
          : [],
        tip: String(first.tip || first.description || data.mnemonic || '')
      };
      if (model.knowledge.wordCard.word) {
        return appendCard(components, {
          id: 'validate_word', component: 'WordCard',
          word: { '@path': '/knowledge/wordCard/word' },
          phonetic: { '@path': '/knowledge/wordCard/phonetic' },
          examples: { '@path': '/knowledge/wordCard/examples' },
          tip: { '@path': '/knowledge/wordCard/tip' }
        }, report, '已用本课词条补上一张单词卡');
      }
    }

    const note = asText(data.mnemonic || data.note || (data.difference && data.difference.answer));
    if (note && !overlaps(normalize(note), { questions: presented.questions || [], texts: [] })) {
      model.knowledge.note = model.knowledge.note || note;
      return appendCard(components, {
        id: 'validate_note', component: 'Text',
        text: { '@path': '/knowledge/note' }
      }, report, '已用本课说明补上一张提示卡');
    }
    return components;
  }

  function appendCard(list, child, report, message) {
    const next = list.slice();
    let root = next.find(item => item.component === 'Column');
    if (!root) {
      root = { id: 'knowledge-surface', component: 'Column', children: [] };
      next.unshift(root);
    }
    if (!Array.isArray(root.children)) root.children = [];
    const cardId = 'card_' + child.id;
    root.children = root.children.concat(cardId);
    next.push({ id: cardId, component: 'Card', children: [child.id] }, child);
    report.push({
      action: 'fill', id: child.id, component: child.component, reason: 'complement',
      message: message
    });
    return next;
  }

  function optimizeMessages(messages, opts = {}) {
    if (!Array.isArray(messages) || !messages[0] || !messages[0].createSurface) return messages;
    const surface = messages[0].createSurface;
    const result = optimize({
      components: surface.components,
      dataModel: surface.dataModel,
      presented: opts.presented,
      extras: opts.extras || {}
    });
    surface.components = result.components;
    surface.dataModel = result.dataModel;
    if (surface.meta) surface.meta.componentCount = result.components.length;
    messages.warnings = [...(messages.warnings || []), ...result.report.map(item => item.message)];
    if (!messages.meta) messages.meta = {};
    messages.meta.componentCount = result.components.length;
    messages.meta.contentCount = result.contentCount;
    messages.meta.empty = result.empty;
    messages.meta.validation = result.report;
    return messages;
  }

  const API = { optimize, optimizeMessages, normalize, isBlank, collectSpeech };
  if (root) root.ZHIDAO_A2UI_VALIDATE = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
/* END_BUNDLED_A2UI_VALIDATE */
/* 知识 → A2UI 组件消息流 · 确定性编译器（前后端共用，零模型参与）
 *
 * 为什么是「确定性编译」：本项目默认模型 LFM3-1.7B 连数学题的合法 JSON 都要靠
 * models.js 自愈，让它生成组件树必然崩。模型继续只产教学内容，本文件把校验后的
 * 课程 JSON 翻译成组件；年级画像、栏目提示、能力协商都在这里收敛，浏览器只渲染。
 *
 * P0 边界：仍在浏览器本地编译，服务端 /api/tutor 的 JSON 响应与缓存完全不动。
 * 由于本文件不触碰 DOM、不读 window，未来原样搬到服务端即可切到 P1 的 SSE 流式。
 */
'use strict';

(function (root) {
  const isNode = typeof module !== 'undefined' && !!module.exports;
  const catalog = isNode ? require('./a2ui-catalog') : (root && root.ZHIDAO_A2UI_CATALOG);
  const gradeProfile = isNode ? require('./grade-profile') : (root && root.ZHIDAO_GRADE);
  const matrix = isNode ? require('./a2ui-matrix') : (root && root.ZHIDAO_A2UI_MATRIX);
  // 游戏组件是可插拔扩展：没有加载时编译器行为与 P1 完全一致（60 组配方原样）。
  const games = isNode ? require('./a2ui-games') : (root && root.ZHIDAO_A2UI_GAMES);
  let validator = null;
  try {
    validator = isNode ? require('./a2ui-validate') : (root && root.ZHIDAO_A2UI_VALIDATE);
  } catch { validator = null; }

  const DEFAULT_TASK = '选择一个素材，写一句有画面的话。';
  const DEFAULT_FOOTER = 'AI 生成内容建议结合课本核对';
  const EMPTY_POEMS = '这一课暂时没有配套诗句，先看看上面的表达素材吧。';

  function hintFor(grade, key, options) {
    const fromOptions = options.hints && options.hints[key];
    if (fromOptions) return fromOptions;
    if (gradeProfile && gradeProfile.hintForGrade) {
      const found = gradeProfile.hintForGrade(grade, key);
      if (found) return found;
    }
    return (gradeProfile && gradeProfile.GENERIC_HINTS && gradeProfile.GENERIC_HINTS[key]) || null;
  }

  function surfaceIdFor(lesson, capabilities) {
    const stage = String(capabilities.stage || 'generic').replace(/[^A-Za-z0-9_]/g, '_');
    return `zhidao_${String(lesson?.subject || 'chinese').replace(/[^A-Za-z0-9_]/g, '_')}_${stage}`;
  }

  /** 按能力白名单裁剪组件：被禁用的组件降级为等价允许组件，绝不「生成了却藏起来」。 */
  function applyCapabilities(components, capabilities, warnings) {
    const out = [];
    for (const item of components) {
      const target = catalog.fallbackFor(item.component, capabilities);
      if (!target) {
        warnings.push(`组件 ${item.id}(${item.component}) 无可用降级，已跳过`);
        continue;
      }
      if (target === item.component) { out.push(item); continue; }
      warnings.push(`组件 ${item.id}(${item.component}) 不在 ${capabilities.stage} 能力内，降级为 ${target}`);
      const allowed = new Set(catalog.COMPONENTS[target].props || []);
      const cleaned = { id: item.id, component: target };
      if (allowed.has('className')) cleaned.className = item.className;
      for (const [key, value] of Object.entries(item)) {
        // id / component 不能从原实例复制，否则会把降级后的目标组件名覆盖回去。
        if (key === 'id' || key === 'component') continue;
        if (allowed.has(key)) cleaned[key] = value;
      }
      out.push(cleaned);
    }
    // 丢弃的组件不能残留在父组件 children 里，否则 renderer 会渲染出空洞。
    const kept = new Set(out.map(item => item.id));
    for (const item of out) {
      if (Array.isArray(item.children)) item.children = item.children.filter(id => kept.has(id));
    }
    return out;
  }

  /**
   * @param {object} lesson    models.js 校验后的语文课程 JSON
   * @param {object} options   { grade, hints, capabilities, surfaceId }
   * @returns {Array} A2UI v1.0 消息数组；数组上挂 warnings / meta（JSONL 序列化时忽略）
   */
  function compileLessonToA2UI(lesson, options = {}) {
    if (!catalog) throw new Error('需要先加载 a2ui-catalog.js');
    const src = lesson && typeof lesson === 'object' ? lesson : {};
    const grade = String(options.grade || '').trim();
    const capabilities = options.capabilities || catalog.rendererCapabilities(grade);
    const warnings = [];

    const poemHint = hintFor(grade, 'poems', options) || { text: '点朗读听一遍，再自己读一遍。' };
    const writingHint = hintFor(grade, 'writing', options) || {
      title: '试着写一句', text: '选一个素材，写一句有画面的话。', button: '看看写得怎样',
      placeholder: '把你的理解写成一句具体、有画面的话……', minLength: 16
    };
    const minLength = Number(writingHint.minLength) > 0 ? Number(writingHint.minLength) : 16;

    const rawPoems = Array.isArray(src.poems) ? src.poems : [];
    // 显示文本保持原样；朗读串接去掉句末标点，避免出现「…有神。。问渠…」双重停顿。
    const poems = rawPoems
      .filter(item => item && typeof item === 'object' && String(item.text ?? '').trim())
      .map(item => ({
        text: String(item.text ?? ''),
        source: String(item.source ?? ''),
        tag: String(item.tag ?? '')
      }));
    const poemSpeech = rawPoems
      .map(item => String(item.text || '').trim().replace(/[。！？；，、\s]+$/, ''))
      .filter(Boolean).join('。') + (rawPoems.length ? '。' : '');

    const idioms = Array.isArray(src.idioms) ? src.idioms : [];
    const words = idioms
      .map(item => String(item?.word ?? '').trim())
      .filter(Boolean).map(word => ({ word }));

    for (const poem of poems) {
      if (poem.text.length > capabilities.textMaxLength) {
        // 只告警，绝不截断或隐藏：内容适配交给生成侧 hints.rule 约束。
        warnings.push(`诗句「${poem.text.slice(0, 12)}…」超出 ${capabilities.stage} 建议长度 ${capabilities.textMaxLength} 字，已保留全文`);
      }
    }

    const surfaceId = options.surfaceId || surfaceIdFor(src, capabilities);
    const P = path => ({ '@path': path });

    const rawComponents = [
      { id: 'root', component: 'Column', className: 'two-column', children: ['poems_card', 'writing_card'] },

      { id: 'poems_card', component: 'Card', className: 'content-card',
        children: ['poem_heading', 'poem_hint', 'poem_list'] },
      { id: 'poem_heading', component: 'CardHeading', number: '02',
        title: '诗文与名句', subtitle: '从经典表达中汲取灵感', action: 'poem_read_all' },
      { id: 'poem_read_all', component: 'SpeakButton', className: 'text-button',
        label: '朗读', icon: 'volume', text: P('/lesson/poemSpeech'),
        action: { event: { name: 'readAll', context: { text: P('/lesson/poemSpeech') } } } },
      { id: 'poem_hint', component: 'HintBar', text: P('/hints/poems') },
      { id: 'poem_list', component: 'List', className: 'poem-list', emptyText: EMPTY_POEMS,
        children: { path: '/lesson/poems', componentId: 'poem_tpl' } },
      { id: 'poem_tpl', component: 'PoemLine', text: P('text'), source: P('source'), tag: P('tag'),
        speakAction: { event: { name: 'readPoem', context: { text: P('text') } } } },

      { id: 'writing_card', component: 'Card', className: 'content-card practice-card',
        children: ['write_heading', 'write_hint', 'write_pad'] },
      { id: 'write_heading', component: 'CardHeading', number: '03',
        title: P('/practice/title'), trailingIcon: 'pen' },
      { id: 'write_hint', component: 'HintBar', text: P('/hints/writing') },
      { id: 'write_pad', component: 'WritingPad',
        task: P('/lesson/practicePrompt'), words: P('/practice/words'), wordsPath: '/practice/words',
        placeholder: P('/practice/placeholder'), button: P('/practice/button'),
        minLength: P('/practice/minLength'), value: P('/practice/text'),
        activeWord: P('/practice/word'), feedback: P('/practice/feedback'),
        tone: P('/practice/tone'), footerNote: P('/practice/footerNote'),
        inputId: 'practice-input', feedbackId: 'practice-feedback', buttonId: 'check-ai-writing',
        inputBind: '/practice/text',
        chipAction: { event: { name: 'selectWord', context: { word: P('word'), index: { '@call': '@index' } } } },
        submitAction: { event: { name: 'write', context: {
          text: P('/practice/text'), word: P('/practice/word'), minLength: P('/practice/minLength')
        } } } }
    ];

    const components = applyCapabilities(rawComponents, capabilities, warnings);
    const lateIds = new Set(['poem_list', 'poem_tpl']);
    const shell = components.filter(item => !lateIds.has(item.id));
    const late = components.filter(item => lateIds.has(item.id));

    const dataModel = {
      hints: { poems: String(poemHint.text || ''), writing: String(writingHint.text || '') },
      lesson: {
        poemSpeech,
        poems: [], // 由第三条 updateDataModel 注入，演示 UI 与数据分离
        practicePrompt: String(src.practicePrompt || DEFAULT_TASK)
      },
      practice: {
        title: String(writingHint.title || '试着写一句'),
        button: String(writingHint.button || '看看写得怎样'),
        placeholder: String(writingHint.placeholder || '把你的理解写成一句具体、有画面的话……'),
        minLength,
        words,
        text: '',
        word: words.length ? words[0].word : '',
        feedback: '',
        tone: '',
        footerNote: DEFAULT_FOOTER
      }
    };

    const messages = [
      {
        version: catalog.VERSION,
        createSurface: {
          surfaceId,
          catalogId: catalog.CATALOG_ID,
          meta: { stage: capabilities.stage, uiVersion: 'p0', componentCount: components.length },
          components: shell,
          dataModel
        }
      },
      { version: catalog.VERSION, updateComponents: { surfaceId, components: late } },
      { version: catalog.VERSION, updateDataModel: { surfaceId, path: '/lesson/poems', value: poems } }
    ];

    messages.warnings = warnings;
    messages.meta = { surfaceId, stage: capabilities.stage, componentCount: components.length, poemCount: poems.length };
    return messages;
  }

  /* ------------------------------------------------------------------ *
   * 学科组件矩阵编译：不同学科 / 学习过程 / 认知阶段 → 不同组件配方。
   * 与 P0 的 compileLessonToA2UI 完全独立，语文两个模块的逐像素等价不受影响。
   * ------------------------------------------------------------------ */
  const MATRIX_FOOTER = 'AI 生成内容建议结合课本核对';

  /** 把配方里的一个组件名翻译成合法的 A2UI 组件实例。 */
  function matrixComponent(name, id, P, dataKeys) {
    switch (name) {
      case 'HintBar':
        return { id, component: 'HintBar', text: P('/hints/main') };
      case 'Text':
        return { id, component: 'Text', tag: 'p', className: 'knowledge-note', text: P('/knowledge/note') };
      case 'PoemLine':
        return { id, component: 'PoemLine', className: 'poem-item',
          text: P('/knowledge/poems/0/text'), source: P('/knowledge/poems/0/source'), tag: P('/knowledge/poems/0/tag'),
          speakAction: { event: { name: 'readPoem', context: { text: P('/knowledge/poems/0/text') } } } };
      case 'SpeakButton':
        return { id, component: 'SpeakButton', className: 'text-button', label: '朗读', icon: 'volume',
          text: P('/knowledge/speech'),
          action: { event: { name: 'readAll', context: { text: P('/knowledge/speech') } } } };
      case 'WordChips':
        return { id, component: 'WordChips', className: 'word-chips',
          items: P('/practice/words'), wordsPath: '/practice/words', active: P('/practice/word'),
          action: { event: { name: 'selectWord', context: { word: P('word'), index: { '@call': '@index' } } } } };
      case 'Feedback':
        return { id, component: 'Feedback', className: 'practice-feedback',
          text: P('/practice/feedback'), tone: P('/practice/tone') };
      case 'WritingPad':
        return { id, component: 'WritingPad',
          task: P('/practice/prompt'), words: P('/practice/words'), wordsPath: '/practice/words',
          placeholder: P('/practice/placeholder'), button: P('/practice/button'),
          minLength: P('/practice/minLength'), value: P('/practice/text'),
          activeWord: P('/practice/word'), feedback: P('/practice/feedback'), tone: P('/practice/tone'),
          footerNote: P('/practice/footerNote'),
          inputId: 'matrix_practice_input', feedbackId: 'matrix_feedback', buttonId: 'matrix_submit',
          inputBind: '/practice/text',
          chipAction: { event: { name: 'selectWord', context: { word: P('word'), index: { '@call': '@index' } } } },
          submitAction: { event: { name: 'write', context: {
            text: P('/practice/text'), word: P('/practice/word'), minLength: P('/practice/minLength')
          } } } };
      case 'ChoiceQuiz':
        return { id, component: 'ChoiceQuiz', className: 'k-quiz',
          question: P('/knowledge/question'), options: P('/knowledge/options'),
          note: P('/knowledge/note'), feedback: P('/practice/feedback'), tone: P('/practice/tone'),
          action: { event: { name: 'answer', context: { answer: P('/knowledge/answer') } } } };
      case 'StepReveal':
        return { id, component: 'StepReveal', className: 'k-steps',
          steps: P('/knowledge/steps'), current: P('/knowledge/stepCurrent'),
          button: '下一步', hint: P('/hints/main'),
          action: { event: { name: 'nextStep', context: { current: P('/knowledge/stepCurrent'), total: P('/knowledge/stepTotal') } } } };
      case 'FormulaBlock':
        return { id, component: 'FormulaBlock', className: 'k-formula',
          formula: P('/knowledge/formula'), note: P('/knowledge/formulaNote') };
      case 'IdiomCard':
        return { id, component: 'IdiomCard', className: 'k-idiom',
          word: P('/knowledge/idiom/word'), pinyin: P('/knowledge/idiom/pinyin'),
          meaning: P('/knowledge/idiom/meaning'), example: P('/knowledge/idiom/example'),
          tag: P('/knowledge/idiom/tag'), level: P('/knowledge/idiom/level'),
          action: { event: { name: 'readAll', context: { text: P('/knowledge/idiom/speech') } } } };
      case 'WordCard':
        return { id, component: 'WordCard', className: 'k-word-card',
          word: P('/knowledge/wordCard/word'), phonetic: P('/knowledge/wordCard/phonetic'),
          examples: P('/knowledge/wordCard/examples'), tip: P('/knowledge/wordCard/tip'),
          action: { event: { name: 'readAll', context: { text: P('/knowledge/wordCard/speech') } } } };
      case 'PictureChoice':
        return { id, component: 'PictureChoice', className: 'k-pictures',
          question: P('/knowledge/question'), options: P('/knowledge/options'),
          answer: P('/knowledge/answer'), note: P('/knowledge/note'),
          feedback: P('/practice/feedback'), tone: P('/practice/tone'),
          action: { event: { name: 'answer', context: { answer: P('/knowledge/answer') } } } };
      case 'MatchPairs':
        return { id, component: 'MatchPairs', className: 'k-pairs',
          pairs: P('/knowledge/pairs'), matched: P('/practice/matchedPairs'),
          hint: P('/hints/main'), feedback: P('/practice/feedback'), tone: P('/practice/tone'),
          action: { event: { name: 'selectPair', context: {} } } };
      case 'NumberLine':
        return { id, component: 'NumberLine', className: 'k-numberline',
          min: P('/knowledge/numberLine/min'), max: P('/knowledge/numberLine/max'),
          marks: P('/knowledge/numberLine/marks'), highlight: P('/knowledge/numberLine/highlight'),
          label: P('/knowledge/numberLine/label'), note: P('/knowledge/numberLine/note') };
      case 'MasteryRing':
        return { id, component: 'MasteryRing', className: 'k-mastery',
          mastery: P('/knowledge/mastery/value'), status: P('/knowledge/mastery/status'),
          point: P('/knowledge/mastery/point'), label: P('/knowledge/mastery/label') };
      case 'Tabs':
        return { id, component: 'Tabs', className: 'k-tabs',
          tabs: P('/knowledge/tabs'), active: P('/knowledge/activeTab'), note: P('/knowledge/note'),
          action: { event: { name: 'switchTab', context: {} } } };
      case 'MethodNote':
        return { id, component: 'MethodNote', className: 'k-method',
          title: P('/knowledge/methodNote/title'), text: P('/knowledge/methodNote/text'),
          placeholder: P('/knowledge/methodNote/placeholder'),
          noteValue: P('/practice/methodNoteText'), noteBind: '/practice/methodNoteText',
          inputId: 'matrix_method_input' };
      default:
        return null;
    }
  }

  /**
   * @param {object} payload { subject, phase, grade, point, data }
   * @param {object} options { capabilities, surfaceId }
   * @returns {Array} A2UI v1.0 消息数组；数组上挂 warnings / meta.recipe
   */
  function compileKnowledgeToA2UI(payload, options = {}) {
    if (!catalog) throw new Error('需要先加载 a2ui-catalog.js');
    if (!matrix) throw new Error('需要先加载 a2ui-matrix.js');
    const src = payload && typeof payload === 'object' ? payload : {};
    const subject = matrix.SUBJECTS[src.subject] ? src.subject : 'chinese';
    const phase = matrix.PHASES[src.phase] ? src.phase : 'learn';
    const grade = String(src.grade || '').trim();
    const recipe = matrix.recipeFor(subject, phase, grade);
    const capabilities = options.capabilities || matrix.capabilitiesFor(subject, phase, grade);
    const data = src.data && typeof src.data === 'object' ? src.data : {};
    const warnings = [];
    const P = path => ({ '@path': path });

    const poems = (Array.isArray(data.poems) ? data.poems : [])
      .filter(item => item && String(item.text ?? '').trim())
      .map(item => ({ text: String(item.text ?? ''), source: String(item.source ?? ''), tag: String(item.tag ?? '') }));
    const words = (Array.isArray(data.words) ? data.words : [])
      .map(word => String(typeof word === 'string' ? word : word?.word ?? '').trim())
      .filter(Boolean).map(word => ({ word }));
    // 选项数按认知阶段裁剪：启蒙期 2 个、初中 4 个；只减负荷，不能把正确答案裁掉。
    const optionsAll = (Array.isArray(data.options) ? data.options : []).map(String);
    const answer = String(data.answer || '');
    let quizOptions = optionsAll.slice(0, recipe.optionCount);
    const answerIndex = answer ? optionsAll.findIndex(option => option === answer) : -1;
    if (answerIndex >= quizOptions.length) {
      // 正确答案排在后面时，用一个干扰项换进来，保证低年级孩子永远选得到对的那一项。
      quizOptions = [...quizOptions.slice(0, Math.max(0, quizOptions.length - 1)), optionsAll[answerIndex]];
      warnings.push(`${recipe.stageLabel} 保留正确答案「${answer}」并减到 ${quizOptions.length} 个选项`);
    }
    if (optionsAll.length > quizOptions.length) {
      warnings.push(`${recipe.stageLabel} 只呈现 ${quizOptions.length}/${optionsAll.length} 个选项（认知负荷裁剪）`);
    }
    const steps = (Array.isArray(data.steps) ? data.steps : []).map(String);
    // linear：从第一步开始高亮，逐步推进；all：高年级一次看全。
    const stepCurrent = recipe.stepMode === 'linear' ? 0 : steps.length;

    /* P2 组件数据：优先用调用方的知识 JSON；缺失时从已有字段重组，
     * 不凭空编造知识点，也不让组件渲染成空白。 */
    const note = String(data.note || '');
    const firstWord = words.length ? words[0].word : '';
    const idiomRaw = data.idiom && typeof data.idiom === 'object' ? data.idiom : {};
    const idiom = {
      word: String(idiomRaw.word || firstWord || String(src.point || '本课词语')),
      pinyin: String(idiomRaw.pinyin || ''),
      meaning: String(idiomRaw.meaning || note),
      example: String(idiomRaw.example || data.prompt || ''),
      scene: String(idiomRaw.scene || ''),
      tag: String(idiomRaw.tag || '字词'),
      level: String(idiomRaw.level || recipe.stageLabel),
      speech: String(idiomRaw.speech || idiomRaw.word || firstWord || '')
    };
    const wordCardRaw = data.wordCard && typeof data.wordCard === 'object' ? data.wordCard : {};
    const wordCard = {
      word: String(wordCardRaw.word || firstWord || 'word'),
      phonetic: String(wordCardRaw.phonetic || ''),
      examples: Array.isArray(wordCardRaw.examples)
        ? wordCardRaw.examples.map(String) : [note, String(data.prompt || '')].filter(Boolean),
      tip: String(wordCardRaw.tip || note),
      speech: String(wordCardRaw.speech || wordCardRaw.word || firstWord || '')
    };
    const pairRaw = Array.isArray(data.pairs) ? data.pairs : [];
    const leftPool = words.length ? words.map(item => item.word) : steps;
    const pairs = pairRaw.length
      ? pairRaw.map(item => ({
        left: String(item && typeof item === 'object' ? item.left ?? '' : item),
        right: String(item && typeof item === 'object' ? item.right ?? '' : '')
      }))
      : leftPool.slice(0, 3).map((value, index) => ({
        left: String(value), right: String(quizOptions[index] || '')
      }));
    const nlRaw = data.numberLine && typeof data.numberLine === 'object' ? data.numberLine : {};
    const numberLine = {
      min: Number.isFinite(Number(nlRaw.min)) ? Number(nlRaw.min) : 0,
      max: Number.isFinite(Number(nlRaw.max)) ? Number(nlRaw.max) : 10,
      marks: Array.isArray(nlRaw.marks) ? nlRaw.marks : [0, 3, 7, 10],
      highlight: nlRaw.highlight ?? 7,
      label: String(nlRaw.label || '在数轴上找到题目里的数'),
      note: String(nlRaw.note || data.formulaNote || note)
    };
    const masteryRaw = data.mastery && typeof data.mastery === 'object' ? data.mastery : {};
    const mastery = {
      value: Number(masteryRaw.value) || 0,
      status: String(masteryRaw.status || '待练习'),
      point: String(masteryRaw.point || src.point || recipe.focus),
      label: String(masteryRaw.label || '当前掌握度')
    };
    const tabsRaw = Array.isArray(data.tabs) ? data.tabs : [];
    const tabs = tabsRaw.length
      ? tabsRaw.map(item => ({ label: String(item?.label ?? ''), text: String(item?.text ?? '') }))
      : [
        { label: '知识讲解', text: String(note || data.formula || '') },
        { label: '练习提示', text: String(data.prompt || '') },
        { label: '解题步骤', text: steps.join(' → ') }
      ].filter(item => item.text);
    const activeTab = String(data.activeTab || (tabs[0] ? tabs[0].label : ''));
    const methodRaw = data.methodNote && typeof data.methodNote === 'object' ? data.methodNote : {};
    const methodNote = {
      title: String(methodRaw.title || '我的方法笔记'),
      text: String(methodRaw.text || note || data.formulaNote || recipe.rules[0]),
      placeholder: String(methodRaw.placeholder || '写下这一步的依据……')
    };

    const surfaceId = options.surfaceId || `zhidao_${subject}_${phase}_${recipe.stage}`;
    const PAD_HINT = gradeProfile && gradeProfile.hintForGrade
      ? gradeProfile.hintForGrade(grade, 'writing') : null;

    const rawComponents = [
      { id: 'root', component: 'Column', className: 'knowledge-surface', children: [] }
    ];
    recipe.components.forEach((name, index) => {
      const cardId = `card_${index}`;
      const componentId = `k_${index}_${name.toLowerCase().replace(/[^a-z0-9_]/g, '_')}`;
      const def = matrixComponent(name, componentId, P, data);
      if (!def) { warnings.push(`配方组件 ${name} 未实现，已跳过`); return; }
      rawComponents.push({ id: cardId, component: 'Card', className: 'content-card', children: [componentId] });
      rawComponents.push(def);
      rawComponents[0].children.push(cardId);
    });

    /* P4a：用户提问命中题型时，在 60 组配方**之外**追加一张游戏卡。
     * 四道闸门：题型已实现 / 过程允许 / 能力集允许 / 本课派生出了真实数据；
     * 任一不满足就完全不加，既有配方与视觉基线一字不动。 */
    let gameHit = null;
    const gameModels = {};
    if (games && options.enableQuestionGames !== false) {
      gameHit = games.selectGame({
        question: String(options.question ?? src.point ?? ''),
        subject, phase, grade, capabilities, data
      });
      if (gameHit) {
        try {
          const def = games.componentFor(gameHit.name, `game_${gameHit.key}_component`, P, gameHit.key);
          const model = games.serializable(games.createModel(gameHit.name, gameHit.game, recipe.stage));
          if (def && model) {
            const cardId = `game_${gameHit.key}_card`;
            rawComponents.push({ id: cardId, component: 'Card',
              className: 'content-card k-game-card', children: [def.id] });
            rawComponents.push(def);
            rawComponents[0].children.push(cardId);
            gameModels[gameHit.key] = model;
            warnings.push(`题型「${gameHit.question.label}」命中，追加 ${gameHit.name}（数据来源：${gameHit.game.source}）`);
          }
        } catch (error) {
          warnings.push(`游戏组件装配失败，已保留原配方：${error.message}`);
        }
      }
    }

    let components = applyCapabilities(rawComponents, capabilities, warnings);
    const dataModel = {
      game: gameModels,
      hints: { main: recipe.hint, title: recipe.title, goal: recipe.goal },
      knowledge: {
        poems: [], // 第三条消息注入，保持 UI 与数据分离
        speech: String(data.speech || ''),
        note: String(data.note || ''),
        question: String(data.question || ''),
        options: quizOptions,
        answer: String(data.answer || ''),
        steps,
        stepCurrent,
        stepTotal: steps.length,
        formula: String(data.formula || ''),
        formulaNote: String(data.formulaNote || ''),
        idiom, wordCard, pairs, numberLine, mastery, tabs, activeTab, methodNote
      },
      practice: {
        title: recipe.title,
        prompt: String(data.prompt || '按提示完成一次练习。'),
        button: String(PAD_HINT?.button || '看看写得怎样'),
        placeholder: String(PAD_HINT?.placeholder || '把你的想法写下来……'),
        minLength: recipe.minLength,
        words,
        text: '',
        word: words.length ? words[0].word : '',
        feedback: '',
        tone: '',
        matchedPairs: [],
        methodNoteText: '',
        footerNote: MATRIX_FOOTER
      }
    };

    // 校验层：充实空白、去掉与上方课程卡片重复的内容、裁掉空卡。
    let validation = null;
    if (validator && typeof validator.optimize === 'function') {
      validation = validator.optimize({
        components,
        dataModel,
        presented: options.presented || {},
        extras: { quizzes: data.quizzes, data, items: data.items }
      });
      components = validation.components;
      for (const item of validation.report || []) {
        if (item.message) warnings.push(item.message);
      }
    }
    const contentCount = (validation && validation.contentCount != null)
      ? validation.contentCount
      : components.filter(item => item.component !== 'Column' && item.component !== 'Card').length;

    const messages = [
      {
        version: catalog.VERSION,
        createSurface: {
          surfaceId,
          catalogId: catalog.CATALOG_ID,
          meta: {
            stage: recipe.stage, subject, phase, recipeKey: recipe.key,
            uiVersion: 'matrix-v1', componentCount: components.length
          },
          components,
          dataModel
        }
      },
      { version: catalog.VERSION, updateComponents: { surfaceId, components: [] } },
      { version: catalog.VERSION, updateDataModel: { surfaceId, path: '/knowledge/poems', value: poems } }
    ];
    messages.warnings = warnings;
    messages.meta = {
      surfaceId, stage: recipe.stage, subject, phase,
      componentCount: components.length,
      contentCount,
      empty: contentCount === 0,
      validation: validation ? validation.report : [],
      recipe,
      game: gameHit ? { name: gameHit.name, key: gameHit.key, question: gameHit.question.id,
        source: gameHit.game.source } : null
    };
    return messages;
  }

  /** JSONL：一行一条消息，天然适配 SSE 与未来的 /api/a2ui/stream。 */
  function compileToJSONL(lesson, options = {}) {
    return compileLessonToA2UI(lesson, options).map(message => JSON.stringify(message)).join('\n');
  }

  const API = {
    compileLessonToA2UI, compileKnowledgeToA2UI, compileToJSONL,
    surfaceIdFor, applyCapabilities, EMPTY_POEMS
  };
  if (isNode) module.exports = API;
  if (root) root.ZHIDAO_A2UI_COMPILER = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
