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
  if (isNode) module.exports = API;
  else if (root) root.ZHIDAO_A2UI_VALIDATE = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
