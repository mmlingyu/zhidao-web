/* A2UI P4a · 选择器型游戏组件的数据契约与状态机（UMD，双端纯函数）
 *
 * 定位：这是「题型 → 游戏组件」这一批（P4a）的可插拔扩展层，刻意不写 DOM、
 * 不读 window，服务端与浏览器共用同一份派生与判定逻辑，保证：
 *   - 模型只产知识 JSON：组件名、选项顺序、乱序结果、文案、动作全部由这里确定性给出；
 *   - 知识不造：游戏数据只从本课已有字段重组（诗句、例句、成语、题目、选项、释义）；
 *     重排/挖空/切分都不引入新的知识点，答案一定能在原文里核对；
 *   - 派生不出来就不挂：宁可这一课只有原来的 60 组配方，也不渲染一张空白游戏卡；
 *   - 动作统一：组件只派发 action，本文件返回「新状态 + 朗读文本 + 证据」，
 *     由 a2ui-bridge.js 写成 updateDataModel / KNOWLEDGE.practice。
 *
 * 与 a2ui-question-map.js 的关系：映射表回答「什么问法该出什么组件」（设计事实来源），
 * 本文件回答「这一课有没有足够数据把那个组件填实」（运行事实来源）。两者缺一不可。
 */
'use strict';

(function (root) {
  const isNode = typeof module !== 'undefined' && !!module.exports;
  const qmap = isNode ? require('./a2ui-question-map') : (root && root.ZHIDAO_A2UI_QUESTION_MAP);

  const VERSION = 'p4a-1.0';
  const P4A_COMPONENTS = [
    'PoemChain', 'ImageryBoard', 'StoryOrder', 'LookAlike', 'RhetoricMatch', 'GrammarDoctor'
  ];
  const KEY_BY_COMPONENT = {
    PoemChain: 'poemChain', ImageryBoard: 'imageryBoard', StoryOrder: 'storyOrder',
    LookAlike: 'lookAlike', RhetoricMatch: 'rhetoricMatch', GrammarDoctor: 'grammarDoctor'
  };
  const COMPONENT_BY_KEY = Object.fromEntries(
    Object.entries(KEY_BY_COMPONENT).map(([name, key]) => [key, name])
  );
  /** 组件派发的动作名；必须与 a2ui-catalog.js 的 ACTION_EVENTS 同步（有回归断言）。 */
  const GAME_ACTIONS = [
    'pickLine', 'nextCouplet', 'readLine',
    'pickImage', 'readSentence',
    'moveEvent', 'checkOrder', 'readEvent',
    'pickChar', 'nextPair',
    'pairDevice',
    'pickFix', 'readFixed', 'askWhy'
  ];

  const str = value => value == null ? '' : String(value);
  const clean = value => str(value).trim();
  const uniq = list => [...new Set(list.filter(Boolean))];
  const LIMIT = (value, max) => clean(value).slice(0, max);

  /* ------------------------------------------------------------------ *
   * 一、从课程原始 JSON 派生游戏数据
   * 所有返回值都带 source：'provided' = 课程直接给了契约字段；'derived' = 从已有内容重组。
   * ------------------------------------------------------------------ */

  /** 诗句拆上下联：只按原有标点切，不改写任何一个字。 */
  function derivePoemChain(data) {
    const provided = data.poemChain || data.games?.poemChain;
    if (provided && Array.isArray(provided.couplets) && provided.couplets.length) {
      const couplets = provided.couplets
        .map(item => ({ upper: clean(item.upper), lower: clean(item.lower), source: clean(item.source) }))
        .filter(item => item.upper && item.lower);
      if (couplets.length) return { couplets, source: 'provided' };
    }
    const poems = Array.isArray(data.poems) ? data.poems : [];
    const couplets = poems.map(item => {
      const text = clean(typeof item === 'string' ? item : item?.text).replace(/[。！？；\s]+$/, '');
      const parts = text.split(/[，,、？?！!；;]/).map(clean).filter(Boolean);
      if (parts.length < 2) return null;
      return { upper: parts[0], lower: parts.slice(1).join('，'), source: clean(item?.source) };
    }).filter(Boolean);
    if (!couplets.length) return null;
    return { couplets, source: 'derived' };
  }

  /** 意境配画：候选标签是同一课其它诗句里的真实片段，正确答案一定出现在当前诗句里。 */
  function deriveImageryBoard(data) {
    const provided = data.imageryBoard || data.games?.imageryBoard;
    if (provided && Array.isArray(provided.imagery) && provided.imagery.length >= 2) {
      const imagery = provided.imagery
        .map(item => ({ label: clean(item.label), line: clean(item.line), note: clean(item.note) }))
        .filter(item => item.label);
      const answer = clean(provided.answer) || imagery[0].label;
      if (imagery.length >= 2) {
        return { line: clean(provided.line) || imagery[0].line, imagery, answer, source: 'provided' };
      }
    }
    const poems = (Array.isArray(data.poems) ? data.poems : [])
      .map(item => clean(typeof item === 'string' ? item : item?.text)).filter(Boolean);
    if (!poems.length) return null;
    // 片段取每句按标点切开后的前 4 字；只做切分，不生成新词。
    const fragment = line => clean(line.split(/[，,。？?！!；;、]/)[0]).slice(0, 4);
    const own = fragment(poems[0]);
    const others = uniq(poems.slice(1).map(fragment)).filter(item => item && item !== own);
    const idioms = (Array.isArray(data.idioms) ? data.idioms : [])
      .map(item => clean(typeof item === 'string' ? item : item?.word)).filter(Boolean);
    // 干扰项优先用别的诗句，实在不够才用本课词语（仍是真实内容）。
    const distractors = uniq([...others, ...idioms.map(word => word.slice(0, 4))])
      .filter(item => item && item !== own).slice(0, 3);
    if (!own || distractors.length < 1) return null;
    const imagery = [{ label: own, line: poems[0], note: '这句诗里真的出现了它' }]
      .concat(distractors.map(label => ({ label, line: '', note: '' })));
    return { line: poems[0], imagery, answer: own, source: 'derived' };
  }

  /** 情节排序：事件就是本课已有的句子/例句/步骤，正确顺序 = 它们在课程里的原始顺序。 */
  function deriveStoryOrder(data) {
    const provided = data.storyOrder || data.games?.storyOrder;
    if (provided && Array.isArray(provided.events) && provided.events.length >= 3 && Array.isArray(provided.correctOrder)) {
      const events = provided.events
        .map((item, i) => ({ id: clean(item.id) || `e${i}`, text: clean(item.text) }))
        .filter(item => item.text);
      if (events.length >= 3) return { events, correctOrder: provided.correctOrder.map(str), source: 'provided' };
    }
    const pool = (Array.isArray(data.poems) ? data.poems : [])
      .map(item => clean(typeof item === 'string' ? item : item?.text))
      .concat((Array.isArray(data.idioms) ? data.idioms : []).map(item => clean(item?.example)))
      .concat((Array.isArray(data.steps) ? data.steps : []).map(item => clean(typeof item === 'string' ? item : item?.text)))
      .filter(Boolean);
    const texts = uniq(pool).slice(0, 5);
    if (texts.length < 3) return null;
    const events = texts.map((text, i) => ({ id: `e${i}`, text }));
    return { events, correctOrder: events.map(item => item.id), source: 'derived' };
  }

  /** 形近字辨析（兜底为「同课词语选填空」）：把例句里真实出现的词挖空，答案唯一。 */
  function deriveLookAlike(data) {
    const provided = data.lookAlike || data.games?.lookAlike;
    if (provided && Array.isArray(provided.pairs) && provided.pairs.length) {
      const pairs = provided.pairs.map(item => ({
        a: clean(item.a), b: clean(item.b), context: clean(item.context),
        answer: clean(item.answer), why: clean(item.why)
      })).filter(item => item.a && item.b && item.context && item.answer);
      if (pairs.length) return { pairs, source: 'provided' };
    }
    const idioms = (Array.isArray(data.idioms) ? data.idioms : [])
      .map(item => ({
        word: clean(typeof item === 'string' ? item : item?.word),
        example: clean(item?.example), meaning: clean(item?.meaning), tag: clean(item?.tag)
      })).filter(item => item.word);
    if (idioms.length < 2) return null;
    const pairs = idioms.slice(0, 3).map((item, index) => {
      const other = idioms[(index + 1) % idioms.length].word;
      const example = item.example || `请用「${item.word}」说一句话。`;
      if (!example.includes(item.word)) return null;
      return {
        a: item.word, b: other,
        context: example.split(item.word).join('（　）'),
        answer: item.word, why: item.meaning || item.tag
      };
    }).filter(Boolean);
    return pairs.length ? { pairs, source: 'derived' } : null;
  }

  /** 手法配对：优先用课程给的 sentence/device；没有时用「表达 → 作用」配对，标题随来源变化。 */
  function deriveRhetoricMatch(data) {
    const provided = data.rhetoricMatch || data.games?.rhetoricMatch;
    if (provided && Array.isArray(provided.pairs) && provided.pairs.length >= 2) {
      const pairs = provided.pairs.map(item => ({
        sentence: clean(item.sentence), device: clean(item.device), why: clean(item.why)
      })).filter(item => item.sentence && item.device);
      if (pairs.length >= 2) return { pairs, mode: 'rhetoric', source: 'provided' };
    }
    const idioms = (Array.isArray(data.idioms) ? data.idioms : [])
      .map(item => ({
        word: clean(typeof item === 'string' ? item : item?.word),
        example: clean(item?.example), tag: clean(item?.tag), meaning: clean(item?.meaning)
      })).filter(item => item.word && item.tag);
    if (idioms.length < 2) return null;
    const pairs = uniq(idioms.map(item => item.tag)).slice(0, 4)
      .map(tag => {
        const hit = idioms.find(item => item.tag === tag);
        return { sentence: hit.example || `「${hit.word}」用在什么场合？`, device: tag, why: hit.meaning };
      });
    return pairs.length >= 2 ? { pairs, mode: 'expression', source: 'derived' } : null;
  }

  /** 语法小医生：英语 quizzes 里的挖空句 + 候选 + 答案 + 解释，天然是「挑错改法」。 */
  function deriveGrammarDoctor(data) {
    const provided = data.grammarDoctor || data.games?.grammarDoctor;
    if (provided && Array.isArray(provided.fixes) && provided.fixes.length >= 2) {
      return {
        sentence: clean(provided.sentence), error: clean(provided.error) || '___',
        fixes: provided.fixes.map(str), answer: clean(provided.answer),
        explanation: clean(provided.explanation), source: 'provided'
      };
    }
    const quizzes = Array.isArray(data.quizzes) ? data.quizzes : [];
    for (const quiz of quizzes) {
      const sentence = clean(quiz?.sentence);
      const fixes = (Array.isArray(quiz?.choices) ? quiz.choices : []).map(str).filter(Boolean);
      const answer = clean(quiz?.answer);
      if (!sentence || !fixes.includes(answer) || fixes.length < 2) continue;
      if (!/_{2,}|＿{2,}|□|（\s*）/.test(sentence)) continue;
      return {
        sentence, error: /_{2,}/.exec(sentence)?.[0] || '___',
        fixes, answer, explanation: clean(quiz.explain) || clean(quiz.cn), source: 'derived'
      };
    }
    return null;
  }

  const DERIVERS = {
    poemChain: derivePoemChain, imageryBoard: deriveImageryBoard, storyOrder: deriveStoryOrder,
    lookAlike: deriveLookAlike, rhetoricMatch: deriveRhetoricMatch, grammarDoctor: deriveGrammarDoctor
  };

  /** 三科归一前调用：只用原始课程 data，绝不碰模型提示词与校验链。 */
  function deriveGames(subject, data) {
    const raw = data && typeof data === 'object' ? data : {};
    const keys = subject === 'chinese'
      ? ['poemChain', 'imageryBoard', 'storyOrder', 'lookAlike', 'rhetoricMatch']
      : subject === 'english' ? ['grammarDoctor'] : [];
    const out = {};
    for (const key of keys) {
      try {
        const game = DERIVERS[key](raw);
        if (game) out[key] = { ...game, key };
      } catch { /* 单科某个游戏派生失败不影响其它游戏与课程本身 */ }
    }
    return out;
  }

  /* ------------------------------------------------------------------ *
   * 二、数据模型：静态游戏数据 + 交互状态；组件只靠 @path 读取，不自持状态。
   * ------------------------------------------------------------------ */

  /** 固定乱序：不用 Math.random，服务端与浏览器、刷新前后完全一致。 */
  function shuffleIds(ids) {
    const out = ids.slice();
    if (out.length < 2) return out;
    [out[0], out[out.length - 1]] = [out[out.length - 1], out[0]];
    if (out.length > 3) {
      const mid = Math.floor(out.length / 2);
      [out[1], out[mid]] = [out[mid], out[1]];
    }
    return out;
  }

  function young(stage) { return stage === 'early' || stage === 'primary' || stage === 'upper'; }

  function createModel(name, game, stage) {
    const key = KEY_BY_COMPONENT[name];
    const base = { key, component: name, source: game.source || 'derived' };
    if (name === 'PoemChain') {
      const couplets = game.couplets;
      const first = couplets[0];
      const distractors = uniq(couplets.slice(1).map(item => item.lower).concat(couplets.slice(1).map(item => item.upper)));
      const optionCount = young(stage) ? 2 : 4;
      const optionsFor = index => uniq([couplets[index].lower, ...distractors.filter(item => item !== couplets[index].lower)])
        .slice(0, Math.max(2, Math.min(optionCount, distractors.length + 1)));
      return {
        ...base,
        title: '诗句接龙', note: young(stage) ? '读一读上句，点出下一句。' : '按原诗补出下句，注意出处与意象。',
        couplets, total: couplets.length,
        current: { ...first, options: optionsFor(0), answer: first.lower },
        state: { index: 0, solved: [], picked: '', feedback: '先读上句，再选出它的下一句。', tone: 'hint' },
        optionsFor
      };
    }
    if (name === 'ImageryBoard') {
      return {
        ...base,
        title: '意境配画', note: young(stage) ? '这句诗里有哪一样事物？点一点。' : '辨认诗句中的意象，想想它带来的感觉。',
        line: game.line, imagery: game.imagery, answer: game.answer,
        state: { picked: '', solved: false, feedback: '读一遍诗句，再点出诗里出现的事物。', tone: 'hint' }
      };
    }
    if (name === 'StoryOrder') {
      const events = game.events;
      return {
        ...base,
        title: '情节排序', note: young(stage) ? '按「先 / 再 / 最后」把卡片排好。' : '按事情发展的因果顺序排列，并说出依据。',
        events, correctOrder: game.correctOrder,
        hint: young(stage) ? '先发生什么？接着呢？最后呢？' : '留意表示先后与因果的词。',
        state: { order: shuffleIds(game.correctOrder), checked: false, feedback: '用「上移 / 下移」把顺序排好，再检查一次。', tone: 'hint' }
      };
    }
    if (name === 'LookAlike') {
      return {
        ...base,
        title: '形近字辨析', note: young(stage) ? '读一读句子，选该用的那个词。' : '结合语境辨析，答对后看看为什么。',
        pairs: game.pairs, total: game.pairs.length, current: game.pairs[0],
        state: { index: 0, picked: '', feedback: '把句子读完整，再选一个填进去。', tone: 'hint' }
      };
    }
    if (name === 'RhetoricMatch') {
      return {
        ...base,
        title: game.mode === 'expression' ? '表达与作用配对' : '手法配对',
        note: young(stage) ? '左边点一下，右边找到它的好朋友。' : '先选左边的句子，再选出对应的手法。',
        pairs: game.pairs,
        state: { left: -1, matched: [], feedback: '先点左边一句，再点右边对应的答案。', tone: 'hint' }
      };
    }
    // GrammarDoctor
    return {
      ...base,
      title: '语法小医生', note: young(stage) ? '这句话少了一个词，选对就好。' : '指出错误处并选出正确改法，再看解释。',
      sentence: game.sentence, error: game.error, fixes: game.fixes,
      answer: game.answer, explanation: game.explanation,
      state: { picked: '', fixed: '', showWhy: false, feedback: '看看空格里该放哪一个。', tone: 'hint' }
    };
  }

  /** 供编译器把模型里的函数字段去掉（dataModel 必须是纯 JSON）。 */
  function serializable(model) {
    const out = { ...model };
    delete out.optionsFor;
    return out;
  }

  /* ------------------------------------------------------------------ *
   * 三、组件实例：属性必须严格落在 catalog 的 props 白名单内。
   * ------------------------------------------------------------------ */

  function componentFor(name, id, P, key) {
    const b = `/game/${key}`;
    const act = (actionName, context) => ({ event: { name: actionName, context } });
    const common = { id, component: name, className: `k-p4a k-p4a-${key}`,
      title: P(`${b}/title`), note: P(`${b}/note`),
      feedback: P(`${b}/state/feedback`), tone: P(`${b}/state/tone`),
      feedbackId: `p4a_${key}_feedback` };
    switch (name) {
      case 'PoemChain': return {
        ...common,
        couplets: P(`${b}/couplets`), current: P(`${b}/current`),
        index: P(`${b}/state/index`), total: P(`${b}/total`), solved: P(`${b}/state/solved`),
        pickAction: act('pickLine', { answer: P(`${b}/current/answer`), index: P(`${b}/state/index`) }),
        nextAction: act('nextCouplet', { index: P(`${b}/state/index`), total: P(`${b}/total`) }),
        readAction: act('readLine', { text: P(`${b}/current/upper`) })
      };
      case 'ImageryBoard': return {
        ...common,
        line: P(`${b}/line`), imagery: P(`${b}/imagery`), answer: P(`${b}/answer`),
        picked: P(`${b}/state/picked`),
        pickAction: act('pickImage', { answer: P(`${b}/answer`) }),
        readAction: act('readSentence', { text: P(`${b}/line`) })
      };
      case 'StoryOrder': return {
        ...common,
        events: P(`${b}/events`), order: P(`${b}/state/order`),
        checked: P(`${b}/state/checked`), hint: P(`${b}/hint`),
        moveAction: act('moveEvent', {}),
        checkAction: act('checkOrder', { order: P(`${b}/state/order`), correctOrder: P(`${b}/correctOrder`) }),
        readAction: act('readEvent', {})
      };
      case 'LookAlike': return {
        ...common,
        current: P(`${b}/current`), index: P(`${b}/state/index`), total: P(`${b}/total`),
        picked: P(`${b}/state/picked`),
        pickAction: act('pickChar', { answer: P(`${b}/current/answer`), why: P(`${b}/current/why`) }),
        nextAction: act('nextPair', { index: P(`${b}/state/index`), total: P(`${b}/total`) })
      };
      case 'RhetoricMatch': return {
        ...common,
        pairs: P(`${b}/pairs`), left: P(`${b}/state/left`), matched: P(`${b}/state/matched`),
        pairAction: act('pairDevice', {}),
        readAction: act('readSentence', {})
      };
      case 'GrammarDoctor': return {
        ...common,
        sentence: P(`${b}/sentence`), error: P(`${b}/error`), fixes: P(`${b}/fixes`),
        answer: P(`${b}/answer`), explanation: P(`${b}/explanation`),
        picked: P(`${b}/state/picked`), fixed: P(`${b}/state/fixed`), showWhy: P(`${b}/state/showWhy`),
        pickAction: act('pickFix', { answer: P(`${b}/answer`) }),
        readAction: act('readFixed', { text: P(`${b}/state/fixed`) }),
        whyAction: act('askWhy', {})
      };
      default: return null;
    }
  }

  /* ------------------------------------------------------------------ *
   * 四、题型识别 → 是否真的挂组件
   * 触发条件（缺一不可）：命中题型 / 主组件属于已实现的 P4a / 学习过程允许 /
   * 能力集允许 / 本课派生出了足够的真实数据。识别不了返回 null，60 组配方原样。
   * ------------------------------------------------------------------ */
  function selectGame({ question, subject, phase, grade, capabilities, data, enabled = true }) {
    if (!enabled || !qmap || !qmap.classifyQuestion) return null;
    const hit = qmap.classifyQuestion(question, subject);
    if (!hit || hit.batch !== 'P4a') return null;
    const spec = qmap.specFor(hit.primary);
    if (!spec || spec.status !== 'implemented') return null;
    const advice = qmap.componentsFor(hit, phase, grade);
    if (!advice || !advice.allowed) return null;
    if (!P4A_COMPONENTS.includes(hit.primary)) return null;
    if (capabilities && Array.isArray(capabilities.components)
      && !capabilities.components.includes(hit.primary)) return null;
    const key = KEY_BY_COMPONENT[hit.primary];
    const game = data?.games?.[key];
    if (!game) return null;
    return { name: hit.primary, key, game, question: hit, advice };
  }

  /* ------------------------------------------------------------------ *
   * 五、动作状态机：输入 (组件名, 动作名, 已解析 context, 当前 model)，
   * 输出 { updates, speak, evidence }。全部是纯数据，bridge 负责落盘与上报。
   * ------------------------------------------------------------------ */

  const okText = (stage, youngText, seniorText) => young(stage) ? youngText : seniorText;

  function applyAction(name, actionName, context, model, stage = 'generic') {
    const c = context && typeof context === 'object' ? context : {};
    const state = { ...(model.state || {}) };
    const updates = {};
    let speak = null;
    let evidence = null;
    const result = (feedback, tone) => { state.feedback = feedback; state.tone = tone; };
    const detail = text => `${model.title} · ${LIMIT(text, 48)}`;

    switch (`${name}:${actionName}`) {
      case 'PoemChain:pickLine': {
        const choice = clean(c.choice);
        const answer = clean(c.answer);
        const correct = !!answer && choice === answer;
        state.picked = choice;
        state.solved = correct && !state.solved.includes(Number(c.index))
          ? state.solved.concat(Number(c.index)) : state.solved;
        result(correct ? '接对了！再读一遍这一联。' : `再看看上句，正确下句是「${answer}」。`,
          correct ? 'good' : 'warn');
        evidence = { correct, detail: detail(choice) };
        break;
      }
      case 'PoemChain:nextCouplet': {
        const next = Math.min(Number(model.total) - 1, (Number(c.index) || 0) + 1);
        state.index = next;
        state.picked = '';
        const couplets = Array.isArray(model.couplets) ? model.couplets : [];
        const distractors = uniq(couplets.filter((_, i) => i !== next).flatMap(item => [item.lower, item.upper]));
        const count = young(stage) ? 2 : 4;
        const current = couplets[next] || {};
        updates.current = {
          ...current,
          options: uniq([current.lower, ...distractors.filter(item => item !== current.lower)])
            .slice(0, Math.max(2, Math.min(count, distractors.length + 1))),
          answer: current.lower || ''
        };
        result(`第 ${next + 1} 联：读上句，选出下一句。`, 'hint');
        break;
      }
      case 'PoemChain:readLine': speak = clean(c.text); break;

      case 'ImageryBoard:pickImage': {
        const choice = clean(c.choice);
        const correct = !!clean(c.answer) && choice === clean(c.answer);
        state.picked = choice;
        state.solved = correct;
        result(correct ? '找到了，这个事物就写在诗句里。' : `再读一遍诗句，找找「${clean(c.answer)}」。`,
          correct ? 'good' : 'warn');
        evidence = { correct, detail: detail(choice) };
        break;
      }
      case 'ImageryBoard:readSentence': speak = clean(c.text); break;

      case 'StoryOrder:moveEvent': {
        const order = Array.isArray(state.order) ? state.order.slice() : [];
        const from = Number(c.index);
        const to = c.direction === 'up' ? from - 1 : from + 1;
        if (Number.isInteger(from) && to >= 0 && to < order.length) {
          [order[from], order[to]] = [order[to], order[from]];
          state.order = order;
          result('顺序调整过了，检查一下对不对。', 'hint');
        }
        break;
      }
      case 'StoryOrder:checkOrder': {
        const order = Array.isArray(c.order) ? c.order.map(str) : [];
        const correctOrder = Array.isArray(c.correctOrder) ? c.correctOrder.map(str) : [];
        const wrongAt = correctOrder.findIndex((id, i) => order[i] !== id);
        const correct = wrongAt === -1 && order.length === correctOrder.length;
        state.checked = true;
        result(correct ? '顺序完全正确，事情就是这样一步步发生的。'
          : `第 ${wrongAt + 1} 张还不太对，再看看哪件事先发生。`,
        correct ? 'good' : 'warn');
        evidence = { correct, detail: detail(correct ? '顺序正确' : `第 ${wrongAt + 1} 位`) };
        break;
      }
      case 'StoryOrder:readEvent': speak = clean(c.text); break;

      case 'LookAlike:pickChar': {
        const choice = clean(c.choice);
        const correct = !!clean(c.answer) && choice === clean(c.answer);
        state.picked = choice;
        result(correct
          ? (clean(c.why) ? `填对了。${clean(c.why)}` : '填对了，句子读起来就通了。')
          : `这里该用「${clean(c.answer)}」，把句子再读一遍。`,
        correct ? 'good' : 'warn');
        evidence = { correct, detail: detail(choice) };
        break;
      }
      case 'LookAlike:nextPair': {
        const next = Math.min(Number(model.total) - 1, (Number(c.index) || 0) + 1);
        state.index = next;
        state.picked = '';
        updates.current = (Array.isArray(model.pairs) ? model.pairs : [])[next] || {};
        result(`第 ${next + 1} 组：读句子，选该用的词。`, 'hint');
        break;
      }

      case 'RhetoricMatch:pairDevice': {
        const index = Number(c.index);
        const side = clean(c.side);
        const matched = Array.isArray(state.matched) ? state.matched.slice() : [];
        if (side === 'left') {
          state.left = index;
          result('选好左边了，再点右边对应的答案。', 'hint');
        } else if (side === 'right') {
          const correct = Number.isInteger(state.left) && state.left === index;
          if (correct && !matched.includes(index)) matched.push(index);
          state.matched = matched;
          state.left = -1;
          result(correct ? '配对了，说说你是怎么判断的。' : '这两张还不是一对，再想一想。',
            correct ? 'good' : 'warn');
          evidence = { correct, detail: detail(clean(c.label)) };
        }
        break;
      }
      case 'RhetoricMatch:readSentence': speak = clean(c.text); break;

      case 'GrammarDoctor:pickFix': {
        const choice = clean(c.choice);
        const answer = clean(c.answer);
        const correct = !!answer && choice === answer;
        state.picked = choice;
        state.fixed = correct
          ? clean(model.sentence).split(clean(model.error)).join(answer)
          : '';
        result(correct ? '改对了，点「读一读」听完整句子。' : `再看一眼空格，正确改法是「${answer}」。`,
          correct ? 'good' : 'warn');
        evidence = { correct, detail: detail(choice) };
        break;
      }
      case 'GrammarDoctor:readFixed':
        speak = clean(c.text) || clean(state.fixed);
        if (!speak) result('先选出正确改法，才能读订正后的句子。', 'warn');
        break;
      case 'GrammarDoctor:askWhy':
        state.showWhy = true;
        result(clean(model.explanation) || '先看句子里的固定搭配，再判断。', 'hint');
        break;

      default: return null;
    }
    updates.state = state;
    return { updates, speak, evidence };
  }

  const API = {
    VERSION, BATCH: 'P4a', COMPONENTS: P4A_COMPONENTS, P4A_COMPONENTS,
    KEY_BY_COMPONENT, COMPONENT_BY_KEY, GAME_ACTIONS,
    deriveGames, createModel, serializable, componentFor, selectGame, applyAction,
    // 导出内部派生函数供回归测试逐条断言「答案确实来自原文」。
    _derive: DERIVERS, shuffleIds
  };
  if (isNode) module.exports = API;
  if (root) root.ZHIDAO_A2UI_P4A = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
