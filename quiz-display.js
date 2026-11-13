/* 练习题题干与选项的通用归一化。
 * 模型/缓存经常不用 sentence+choices+cn，而是 question+options 等别名；
 * 情景判断题也可能没有填空句。渲染层统一从此处取可见题干，避免「只看到标签看不到题目」。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ZHIDAO_QUIZ = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const STEM_KEYS = ['sentence', 'question', 'prompt', 'stem', 'ask', 'title', 'text', 'q', 'quiz'];
  const CN_KEYS = ['cn', 'translation', 'zh', 'hint', 'instruction', 'note', 'subtitle', 'desc', 'description'];
  const CHOICE_KEYS = ['choices', 'options', 'answers', 'candidates', 'items'];
  const ANSWER_KEYS = ['answer', 'correct', 'correctAnswer', 'key', 'right'];
  const EXPLAIN_KEYS = ['explain', 'explanation', 'reason', 'feedback', 'analysis', 'why'];
  const ITEM_TEXT_KEYS = ['text', 'label', 'en', 'cn', 'value', 'choice', 'option', 'sentence', 'content', 'word'];
  const DEFAULT_STEM = '请选择更合适的表达';
  function blankRe() { return /_{2,}|＿{2,}/g; }

  function text(value) {
    if (value == null) return '';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return String(value).trim();
    }
    return '';
  }

  function firstText(obj, keys) {
    if (!obj || typeof obj !== 'object') return '';
    for (const key of keys) {
      const value = text(obj[key]);
      if (value) return value;
    }
    return '';
  }

  function itemText(item) {
    const direct = text(item);
    if (direct) return direct;
    if (item && typeof item === 'object') return firstText(item, ITEM_TEXT_KEYS);
    return '';
  }

  function choiceList(obj) {
    if (!obj || typeof obj !== 'object') return [];
    for (const key of CHOICE_KEYS) {
      const value = obj[key];
      if (!Array.isArray(value) || !value.length) continue;
      return value.map(itemText).filter(Boolean);
    }
    return [];
  }

  function highlightBlanks(escapedHtml) {
    const html = escapedHtml == null ? '' : String(escapedHtml);
    return html.replace(blankRe(), '<span>___</span>');
  }

  /** 判题用归一：大小写、引号、空白、中英文标点。 */
  function fold(value) {
    return String(value || '')
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[''`""''""]/g, '"')
      .replace(/\s+/g, ' ')
      .replace(/[，。！？、,.!?;:：；()（）[\]【】]/g, '')
      .trim();
  }

  /** 去掉选项或答案开头的 A. / A、 / (A) / 1. 这类标号。 */
  const LABEL_RE = /^\s*[\(（]?\s*([A-Da-d1-4Ａ-Ｄ１-４])\s*[\)）.．、。:：]\s*/;

  function stripLabel(value) {
    return String(value || '').replace(LABEL_RE, '').trim();
  }

  /**
   * 答案只是字母或数字时，映射到对应选项下标。
   * 「B」「B.」「(B)」→ 第 2 项；「2」「2.」→ 第 2 项；「0」按从 0 起的下标。
   * 整段「B. 看公交牌」不是纯标号，返回 -1，交给后面的文本比对。
   */
  function letterIndex(answer, count) {
    const raw = String(answer || '').trim().normalize('NFKC');
    if (!raw || !count) return -1;
    const letter = raw.match(/^\s*[\(（]?\s*([A-Da-dＡ-Ｄ])\s*[\)）.．、。:：]?\s*$/);
    if (letter) {
      const i = letter[1].toUpperCase().charCodeAt(0) - 65;
      return i >= 0 && i < count ? i : -1;
    }
    const num = raw.match(/^\s*[\(（]?\s*([0-9０-９]+)\s*[\)）.．、。:：]?\s*$/);
    if (num) {
      const n = parseInt(num[1], 10);
      if (n >= 1 && n <= count) return n - 1;
      if (n === 0 && count > 0) return 0;
    }
    return -1;
  }

  /**
   * 把模型给的答案对齐到某一选项的原文。
   * 顺序：原文相等 → 归一后相等 → 纯字母/数字标号 → 去掉标号后相等 → 唯一包含。
   * 对不上时 index 为 -1，调用方不要把所有选项都判错。
   */
  function resolveAnswer(choices, answer) {
    const list = Array.isArray(choices) ? choices.map(item => String(item == null ? '' : item)) : [];
    const raw = text(answer);
    if (!raw || !list.length) return { choice: raw, index: -1, method: 'none' };

    let i = list.findIndex(item => item === raw);
    if (i >= 0) return { choice: list[i], index: i, method: 'exact' };

    const folded = fold(raw);
    i = list.findIndex(item => fold(item) === folded);
    if (i >= 0) return { choice: list[i], index: i, method: 'fold' };

    const byLabel = letterIndex(raw, list.length);
    if (byLabel >= 0) return { choice: list[byLabel], index: byLabel, method: 'label' };

    const strippedRaw = fold(stripLabel(raw));
    if (strippedRaw) {
      const hits = [];
      list.forEach((item, index) => {
        if (fold(stripLabel(item)) === strippedRaw) hits.push(index);
      });
      if (hits.length === 1) return { choice: list[hits[0]], index: hits[0], method: 'strip' };
    }

    if (strippedRaw && strippedRaw.length >= 2) {
      const hits = [];
      list.forEach((item, index) => {
        const s = fold(stripLabel(item));
        if (!s) return;
        if (s.includes(strippedRaw) || strippedRaw.includes(s)) hits.push(index);
      });
      if (hits.length === 1) return { choice: list[hits[0]], index: hits[0], method: 'contain' };
    }

    return { choice: raw, index: -1, method: 'unresolved' };
  }

  function isCorrectChoice(picked, answer, choices) {
    const list = Array.isArray(choices) && choices.length ? choices.map(String) : [String(picked || '')];
    const resolved = resolveAnswer(list, answer);
    if (resolved.index < 0) return false;
    const pickedText = String(picked || '');
    return pickedText === resolved.choice || fold(pickedText) === fold(resolved.choice);
  }

  function normalizeQuiz(quiz, fallbackStem) {
    const raw = quiz && typeof quiz === 'object' && !Array.isArray(quiz) ? quiz : {};
    const stem = firstText(raw, STEM_KEYS);
    let cn = firstText(raw, CN_KEYS);
    if (cn && cn === stem) cn = '';
    const choices = choiceList(raw);
    const rawAnswer = firstText(raw, ANSWER_KEYS);
    const explain = firstText(raw, EXPLAIN_KEYS);
    const sentence = stem || text(fallbackStem) || DEFAULT_STEM;
    const resolved = resolveAnswer(choices, rawAnswer);
    return {
      sentence,
      rawStem: stem,
      cn,
      choices,
      answer: resolved.index >= 0 ? resolved.choice : rawAnswer,
      rawAnswer,
      answerResolved: resolved.index >= 0,
      answerMethod: resolved.method,
      explain,
      hasBlank: blankRe().test(sentence)
    };
  }

  function normalizeQuizzes(quizzes, fallbackStem) {
    return (Array.isArray(quizzes) ? quizzes : []).map((quiz) => {
      const view = normalizeQuiz(quiz, fallbackStem);
      const base = quiz && typeof quiz === 'object' ? quiz : {};
      return Object.assign({}, base, {
        sentence: view.sentence,
        cn: view.cn || base.cn || '',
        choices: view.choices.length ? view.choices : (Array.isArray(base.choices) ? base.choices : []),
        answer: view.answer || base.answer || '',
        explain: view.explain || base.explain || ''
      });
    });
  }

  return {
    STEM_KEYS, DEFAULT_STEM,
    firstText, choiceList, highlightBlanks, fold, stripLabel, letterIndex,
    resolveAnswer, isCorrectChoice, normalizeQuiz, normalizeQuizzes
  };
}));
