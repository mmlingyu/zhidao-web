/* 知识展示 ↔ A2UI 桥接层（UMD，零依赖）
 *
 * 解决的问题：此前 compileKnowledgeToA2UI() / compilePlayStageToA2UI() 只在案例页、
 * 画廊与测试脚本里被调用，主流程 /api/tutor 的语英数三科仍是手写模板字符串。
 * 本层把「课程 JSON」变成主流程里真实存在的一块 A2UI 界面：
 *
 *   课程 JSON（server.js /api/tutor）
 *     → knowledgeFromLesson() 抽取同一份知识数据
 *     → phaseFor() 决定学习过程（初识 / 练习 / 强化 / 迁移）
 *     → matrix.capabilitiesFor() 按「学科 × 过程 × 年级」算能力集
 *     → compiler.compileKnowledgeToA2UI() 产出 A2UI v1.0 消息
 *     → JSONL 逐条交给 surface.feed()（与未来 SSE 推流同构）
 *     → renderer 白名单组件渲染；action 回写数据模型与知识卡片证据
 *     → 数学且满足条件时，同一容器再挂游戏化关卡 + createPlayController()
 *
 * 保持不变：语文「诗文与名句 + 试着写一句」的 P0 surface 在原 .two-column 里，
 * 本层容器挂在 .two-column 之外，视觉等价基线与既有浏览器断言不受影响。
 * 模型只提供课程内容；组件名、文案、动作、样式、年级判定全部由确定性代码给出。
 */
'use strict';

(function (root) {
  const isNode = typeof module !== 'undefined' && !!module.exports;
  const G = isNode ? null : root;
  const gradeProfile = isNode ? require('./grade-profile') : G?.ZHIDAO_GRADE;
  const catalog = isNode ? require('./a2ui-catalog') : G?.ZHIDAO_A2UI_CATALOG;
  const matrix = isNode ? require('./a2ui-matrix') : G?.ZHIDAO_A2UI_MATRIX;
  const compiler = isNode ? require('./a2ui-compiler') : G?.ZHIDAO_A2UI_COMPILER;
  const renderer = isNode ? null : G?.ZHIDAO_A2UI;
  const play = isNode ? null : G?.ZHIDAO_PLAY;
  // 19 个游戏组件（P4a–P4d）的数据派生与动作状态机，双端共用，保证服务端/浏览器同构。
  const games = isNode ? require('./a2ui-games') : G?.ZHIDAO_A2UI_GAMES;

  const SECTION_ID = 'a2ui-bridge';
  const SURFACE_ID = 'a2ui-bridge-surface';
  const PLAY_ID = 'a2ui-bridge-play';

  const STAGE_SHORT = {
    early: '低龄', primary: '小学中段', upper: '小学高段',
    teen: '初中', senior: '高中', generic: '通用'
  };
  const PLAY_KEYWORDS = /数列|规律|填空|找规律|补|计算|加减|等式|方程|算式|数字|多少|第几|接着|依次/;

  const state = {
    mounted: false,
    key: '',
    result: null,
    options: {},
    subject: '', phase: '', stage: '', grade: '',
    surface: null, playSurface: null, controller: null,
    messages: [], playMessages: [], warnings: [], recipe: null,
    source: '', playSource: '', uiVersion: '', playUiVersion: '',
    lastEvent: ''
  };

  function stageOf(grade) {
    if (matrix?.stageOf) return matrix.stageOf(grade);
    if (gradeProfile?.stageForGrade) {
      const p = gradeProfile.stageForGrade(grade);
      return String(p?.id || p || 'generic');
    }
    return 'generic';
  }

  function currentGrade(result) {
    if (!isNode && G?.LEARNER?.grade) {
      const value = G.LEARNER.grade();
      if (value) return String(value);
    }
    return String(result?.learner?.grade || '');
  }

  /** 学习过程：语文 P0 已覆盖「初识」，桥接补「练习」；英语按是否已作答；数学落在强化。 */
  function phaseFor(result, options = {}) {
    if (options.phase && matrix?.PHASES?.[options.phase]) return options.phase;
    const subject = result?.subject;
    if (subject === 'chinese') return 'practice';
    if (subject === 'english') return options.quizAnswered ? 'reinforce' : 'practice';
    return 'reinforce';
  }

  /**
   * 从课程 JSON 抽取矩阵编译器需要的知识数据。
   * 三科字段完全不同，这里做一次归一；绝不凭空编造知识点，全部来自 lesson.data。
   */
  function knowledgeFromLesson(result) {
    const subject = ['chinese', 'english', 'math'].includes(result?.subject) ? result.subject : 'chinese';
    const data = result?.data && typeof result.data === 'object' ? result.data : {};
    const point = String(result?.input || data.title || '本课知识点');
    const out = { subject, point, data: {} };

    if (subject === 'chinese') {
      const idioms = Array.isArray(data.idioms) ? data.idioms : [];
      const poems = Array.isArray(data.poems) ? data.poems : [];
      const first = idioms[0] || {};
      const word = String(first.word || '这个词');
      out.data = {
        poems,
        words: idioms.map(item => String(item.word || '')).filter(Boolean),
        speech: poems.map(item => item.text).filter(Boolean).join('。'),
        note: String(first.meaning || data.description || ''),
        question: `哪个词最适合形容「${point}」？`,
        options: idioms.map(item => String(item.word || '')).filter(Boolean),
        answer: word,
        steps: idioms.map(item => `${item.word}：${item.meaning || ''}`),
        prompt: String(data.practicePrompt || `用上「${word}」写一句话。`),
        formulaNote: String(data.description || ''),
        idiom: {
          word, pinyin: String(first.pinyin || ''), meaning: String(first.meaning || ''),
          example: String(first.example || ''), tag: String(first.tag || '字词'),
          level: String(first.level || ''), speech: word
        },
        pairs: idioms.slice(0, 3).map(item => ({
          left: String(item.word || ''), right: String(item.meaning || '')
        })),
        tabs: [
          { label: '诗句', text: poems.map(item => item.text).filter(Boolean).join('；') },
          { label: '词语', text: idioms.map(item => item.word).filter(Boolean).join('、') },
          { label: '仿写', text: String(data.practicePrompt || '') }
        ].filter(item => item.text)
      };
      out.data.games = games ? games.deriveGames(subject, data) : {};
      return out;
    }

    if (subject === 'english') {
      const items = Array.isArray(data.items) ? data.items : [];
      const quizzes = Array.isArray(data.quizzes) ? data.quizzes : [];
      const quiz = quizzes[0] || {};
      const quizLib = (typeof ZHIDAO_QUIZ !== 'undefined' && ZHIDAO_QUIZ)
        || (typeof require === 'function' ? require('./quiz-display') : null);
      const quizView = quizLib && quizLib.normalizeQuiz
        ? quizLib.normalizeQuiz(quiz, '选一选，哪个词放进句子里最合适？')
        : { sentence: String(quiz.sentence || '选一选，哪个词放进句子里最合适？'), choices: Array.isArray(quiz.choices) ? quiz.choices.map(String) : [], answer: String(quiz.answer || ''), explain: String(quiz.explain || '') };
      const choices = (quizView.choices || []).map(String);
      const difference = data.difference || {};
      const first = items[0] || {};
      const examples = items.flatMap(item => Array.isArray(item.examples) ? item.examples : []);
      const firstExamples = Array.isArray(first.examples) ? first.examples : [];
      const quizList = quizzes.map(item => {
        if (quizLib && quizLib.normalizeQuiz) return quizLib.normalizeQuiz(item, '');
        return {
          sentence: String(item.sentence || item.question || ''),
          choices: Array.isArray(item.choices) ? item.choices.map(String)
            : (Array.isArray(item.options) ? item.options.map(String) : []),
          answer: String(item.answer || ''),
          explain: String(item.explain || '')
        };
      }).filter(item => item.sentence);
      out.data = {
        words: items.map(item => String(item.word || '')).filter(Boolean),
        speech: examples.map(item => String(item.en || item.text || '')).filter(Boolean).join('. '),
        note: String(difference.answer || data.mnemonic || ''),
        question: String(quizView.sentence || '选一选，哪个词放进句子里最合适？'),
        options: choices,
        quizzes: quizList,
        answer: String(quizView.answer || quiz.answer || ''),
        steps: items.map(item => `${item.word}：${item.description || ''}`),
        prompt: String(quizView.explain || quiz.explain || '把搭配放进句子里读一遍。'),
        formulaNote: String(difference.question || ''),
        wordCard: {
          word: String(first.word || 'word'),
          phonetic: '',
          examples: firstExamples.map(item => `${item.en || ''} · ${item.cn || ''}`),
          tip: String(first.tip || data.mnemonic || ''),
          speech: firstExamples.map(item => String(item.en || '')).filter(Boolean).join('. ')
        },
        pairs: items.slice(0, 3).map(item => ({
          left: String(item.word || ''), right: String(item.title || item.description || '')
        })),
        tabs: [
          { label: '场景', text: String(data.mnemonic || '') },
          { label: '例句', text: examples.map(item => item.en).filter(Boolean).join('；') },
          { label: '辨析', text: String(difference.answer || '') }
        ].filter(item => item.text)
      };
      out.data.games = games ? games.deriveGames(subject, data) : {};
      return out;
    }

    const methods = Array.isArray(data.methods) ? data.methods : [];
    const method = methods[0] || {};
    const steps = Array.isArray(method.steps) ? method.steps : [];
    const challenge = data.challenge || {};
    const answer = String(challenge.answer || '');
    out.data = {
      words: methods.map(item => String(item.name || '')).filter(Boolean),
      speech: steps.map(item => String(item.text || '')).filter(Boolean).join('。'),
      note: String(method.insight || data.description || ''),
      question: String(challenge.question || `这道题的关键一步是什么？`),
      options: methods.map(item => String(item.name || '')).filter(Boolean),
      answer: methods.length ? String(methods[0].name || '') : '',
      steps: steps.map(item => `${item.title || ''}：${item.text || ''}`),
      formula: steps.length ? String(steps[0].formula || '') : '',
      formulaNote: String(challenge.answer || method.quote || ''),
      prompt: String(challenge.question || '说出这道题的已知条件与目标。'),
      point,
      pairs: steps.slice(0, 3).map((item, index) => ({
        left: `第 ${index + 1} 步`, right: String(item.title || '')
      })),
      numberLine: {
        min: 0, max: 10, marks: [0, 3, 7, 10], highlight: 7,
        label: '在数轴上找到题目里的数',
        note: String(challenge.question || '')
      },
      mastery: { value: 0, status: '待练习', point, label: '本课掌握度' },
      tabs: methods.map(item => ({
        label: String(item.name || '思路'),
        text: `${item.title || ''} · ${item.insight || ''}`
      })).filter(item => item.text.trim()),
      methodNote: {
        title: '我的方法笔记',
        text: String(method.insight || ''),
        placeholder: '写下这一步的依据……'
      }
    };
    out.data.games = games ? games.deriveGames(subject, data) : {};
    return out;
  }


  /** 主界面当前正在展示的题干与说明，交给校验层去重。
   * 只避开「你来判一判」此刻这一道（quizIndex），把其余题留给年级组件区换题；
   * 若把全部 quizzes 都标成已展示，换题失败后整区会被裁空。 */
  function presentedFrom(result, opts = {}) {
    const data = result && result.data && typeof result.data === 'object' ? result.data : {};
    const quizzes = Array.isArray(data.quizzes) ? data.quizzes : [];
    const index = Number.isInteger(opts.quizIndex) && opts.quizIndex >= 0 ? opts.quizIndex : 0;
    const current = quizzes[index] || quizzes[0] || {};
    const currentStem = String(current.sentence || current.question || data.question || data.sentence || '').trim();
    const questions = [];
    if (currentStem) questions.push(currentStem);
    if (data.challenge && data.challenge.question) questions.push(String(data.challenge.question));
    const texts = [
      data.title, data.bannerTitle, data.description,
      data.difference && data.difference.question
    ].filter(Boolean).map(item => String(item));
    return { questions, texts, quizIndex: index };
  }

  /**
   * 游戏化关卡的触发条件（对应设计说明里的 5 条）：
   *   学科=数学、处于练习/强化、题目是可拆成数字格子的题、该知识点未掌握。
   * 年级不用来「禁用」，只决定主题（低龄深紫游戏化 / 高龄浅色克制）。
   */
  function shouldShowPlay(ctx = {}) {
    const {
      subject, phase, grade, point = '', data = {}, mastery = -1, force = false
    } = ctx;
    if (force) return true;
    if (subject !== 'math') return false;
    if (phase !== 'practice' && phase !== 'reinforce') return false;
    if (Number(mastery) >= 80) return false;
    if (data.puzzle) return true;
    const text = `${point} ${String(data.question || '')} ${(Array.isArray(data.steps) ? data.steps : []).join(' ')}`;
    return /\d/.test(text) || PLAY_KEYWORDS.test(text);
  }

  /** 关卡数据：题目本身作为知识点名，数字格子用内置关卡（模型未来可直接给 data.puzzle）。 */
  function puzzleFor(result) {
    const custom = result?.data?.puzzle;
    if (custom && Array.isArray(custom.slots) && Array.isArray(custom.answers)) {
      return { ...custom, point: String(result?.input || '本课知识点') };
    }
    return { point: String(result?.input || '本课知识点') };
  }

  function currentMastery(point) {
    if (isNode) return -1;
    try {
      const board = G?.KNOWLEDGE?.board;
      const list = Array.isArray(board) ? board
        : Array.isArray(board?.cards) ? board.cards
          : Array.isArray(board?.items) ? board.items : [];
      const hit = list.find(card => card && (card.point === point || card.title === point));
      const value = Number(hit?.mastery ?? hit?.score ?? hit?.masteryScore ?? -1);
      return Number.isFinite(value) ? value : -1;
    } catch { return -1; }
  }

  function keyFor(result, grade) {
    const phase = phaseFor(result, state.options);
    return `${result?.subject || ''}|${phase}|${grade}|${String(result?.input || '')}`;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = String(text);
    return node;
  }

  /** 未作答时反馈卡片不能是纯空白（上一版诗句空白事故的教训）。
   * 不删组件、不用 display:none，而是把一句真实的等待文案写进数据模型；
   * 组件仍由 renderer 按白名单渲染，交互后会正常被真实反馈覆盖。 */
  function primeEmptyFeedback(messages, recipe) {
    const practice = Array.isArray(messages) ? messages[0]?.createSurface?.dataModel?.practice : null;
    if (!practice || practice.feedback) return 0;
    practice.feedback = recipe?.tone === 'restrained'
      ? '完成一次练习后，这里会给出结果与分析。'
      : '先自己试一次，做完知知会告诉你结果。';
    practice.tone = 'hint';
    return 1;
  }

  /** 把已经校验过的消息一次交给 renderer。
   *  过去 stream=true 会逐条 feed，每条都整树重绘，课程 JSONL 一到就把主线程占满。
   *  渐进预览由 SSE 侧分批负责；这里挂载最终界面只渲染一次。参数 stream 保留给旧调用方。 */
  function feedJSONL(surface, messages) {
    const list = Array.isArray(messages) ? messages : [];
    surface.feed(list);
    return list.length;
  }

  /**
   * 消费服务端下发的消息流（P1）：校验通过就逐条 feed，任何一处不对就返回 null
   * 交回本地编译——「宁可重编一次，也不渲染一份不可信或年级错位的组件树」。
   * 校验项：JSONL 可解析、surfaceId 一致、逐条过 catalog 闸、学科/过程/阶段与服务端判定一致。
   */
  function takeServerSurface(payload, ctx) {
    if (!payload || typeof payload !== 'object' || !payload.jsonl) return null;
    if (!catalog?.validateMessage) return null;
    const capabilities = payload.capabilities && Array.isArray(payload.capabilities.components)
      ? payload.capabilities : null;
    if (!capabilities) return null;
    // 浏览器侧只认「自己画得出」的组件；服务端已按同一份能力收窄，这里再兜一层。
    if (Array.isArray(ctx.rendererComponents)) {
      const mine = new Set(ctx.rendererComponents);
      if (!capabilities.components.every(name => mine.has(name))) return null;
    }
    let messages;
    try {
      messages = String(payload.jsonl).split('\n').filter(Boolean).map(line => JSON.parse(line));
    } catch { return null; }
    if (!messages.length) return null;
    const surfaceId = messages[0]?.createSurface?.surfaceId;
    if (!surfaceId) return null;
    for (const message of messages) {
      const type = Object.keys(message).find(key => key !== 'version');
      const body = type ? message[type] : null;
      if (!body || typeof body !== 'object') return null;
      if (body.surfaceId !== surfaceId) return null;
      if (!catalog.validateMessage(message, capabilities).ok) return null;
    }
    // 年级/过程必须与服务端编译时一致，否则页面其余部分按本地年级渲染会出现错位。
    if (payload.subject && payload.subject !== ctx.subject) return null;
    if (payload.phase && payload.phase !== ctx.phase) return null;
    if (payload.stage && ctx.stage && payload.stage !== ctx.stage) return null;
    return {
      messages, capabilities, surfaceId,
      uiVersion: String(payload.uiVersion || ''),
      warnings: Array.isArray(payload.warnings) ? payload.warnings.slice() : [],
      componentCount: Number(payload.componentCount) || 0,
      recipeKey: String(payload.recipeKey || '')
    };
  }

  /**
   * 消费服务端编译的 P3 关卡（P3 服务端化）：与主消息流一样先逐条过闸，
   * 任何一处不合法就返回 null 交回浏览器本地编译，绝不渲染半坏的关卡。
   */
  function takeServerPlay(payload, ctx = {}) {
    if (!payload || typeof payload !== 'object' || !payload.jsonl) return null;
    if (!catalog?.validateMessage) return null;
    const capabilities = payload.capabilities && Array.isArray(payload.capabilities.components)
      ? payload.capabilities : null;
    if (!capabilities) return null;
    if (Array.isArray(ctx.rendererComponents)) {
      const mine = new Set(ctx.rendererComponents);
      if (!capabilities.components.every(name => mine.has(name))) return null;
    }
    let messages;
    try {
      messages = String(payload.jsonl).split('\n').filter(Boolean).map(line => JSON.parse(line));
    } catch { return null; }
    if (!messages.length) return null;
    const surfaceId = messages[0]?.createSurface?.surfaceId;
    if (!surfaceId) return null;
    if (payload.surfaceId && payload.surfaceId !== surfaceId) return null;
    for (const message of messages) {
      const type = Object.keys(message).find(key => key !== 'version');
      const body = type ? message[type] : null;
      if (!body || typeof body !== 'object' || body.surfaceId !== surfaceId) return null;
      if (!catalog.validateMessage(message, capabilities).ok) return null;
    }
    if (payload.subject && ctx.subject && payload.subject !== ctx.subject) return null;
    if (payload.stage && ctx.stage && payload.stage !== ctx.stage) return null;
    return {
      messages, capabilities, surfaceId,
      uiVersion: String(payload.uiVersion || ''),
      componentCount: Number(payload.componentCount) || 0,
      mastery: Number(payload.mastery)
    };
  }

  /** action 统一回写：反馈走 updateDataModel，证据走 KNOWLEDGE，业务层不碰 DOM。 */
  function bindActions(surface, ctx) {
    const { subject, point, recipe } = ctx;
    surface.onAction((message, meta) => {
      const event = message?.action?.event || {};
      const name = String(event.name || '');
      const c = event.context || {};
      const write = (path, value, render) => surface.setData(path, value, render);
      const evidence = (correct, detail) => {
        try {
          if (!isNode && G?.KNOWLEDGE?.practice) {
            G.KNOWLEDGE.practice(correct, { subject, detail, origin: meta?.node });
          }
        } catch { /* 离线 / 未登录时证据上报失败不影响交互 */ }
      };

      // 19 个游戏组件（P4a–P4d）统一动作出口：
      //   applyAction 返回纯数据 → 逐项写回 /game/<key> → 一次重渲染；
      //   证据走 KNOWLEDGE.practice / recordEvidence，朗读走 renderer function speak。
      // 组件本身不自持状态，服务端消息流与浏览器本地编译走的是同一段逻辑。
      if (games && games.GAME_ACTIONS.includes(name)) {
        const rootGame = surface.getData('/game') || {};
        const wanted = games.KEY_BY_COMPONENT[message.component];
        const key = (wanted && rootGame[wanted])
          ? wanted
          : Object.keys(rootGame).find(item => games.COMPONENT_BY_KEY[item] === message.component);
        const component = key ? games.COMPONENT_BY_KEY[key] : '';
        if (key && component) {
          const model = surface.getData(`/game/${key}`) || {};
          const out = games.applyAction(component, name, c, model, ctx.stage || 'generic');
          if (out) {
            for (const [field, value] of Object.entries(out.updates || {})) {
              write(`/game/${key}/${field}`, value, false);
            }
            surface.render();
            if (out.stop) {
              // P4c 门槛：中断连续朗读并让知知的口型回到 idle，不残留「正在说话」。
              // 远程音色的 Audio 不受 speechSynthesis.cancel 影响，必须一起停。
              try { G?.ZhidaoVoice?.stop?.(); } catch { /* 无语音环境 */ }
              try { G?.speechSynthesis?.cancel?.(); } catch { /* 无语音环境 */ }
              try { G?.ZhidaoMascot?.play?.('idle'); } catch { /* 形象未加载 */ }
            }
            if (out.speak) {
              try { surface.callFunction('speak', { text: String(out.speak) }); } catch { /* 无语音环境 */ }
            }
            const ev = out.evidence;
            if (ev && typeof ev.correct === 'boolean') {
              evidence(ev.correct, ev.detail);
              if (ev.correct && !ev.noCelebrate) {
                try { surface.callFunction('celebrate', { level: 'correct', subject }); } catch { /* noop */ }
              }
            } else if (ev && ev.type) {
              // 开放题 / 求助 / 朗读：只记 created / asked / recited，绝不写 correct。
              try {
                surface.callFunction('recordEvidence', {
                  type: ev.type, subject, detail: ev.detail, point
                });
              } catch { /* 离线不影响交互 */ }
            }
          }
        }
        return;
      }

      if (name === 'selectWord') {
        write('/practice/word', String(c.word || ''), true);
        return;
      }
      if (name === 'switchTab') {
        write('/knowledge/activeTab', String(c.tab || ''), true);
        return;
      }
      if (name === 'selectPair') {
        const matched = Array.isArray(surface.getData('/practice/matchedPairs'))
          ? surface.getData('/practice/matchedPairs').slice() : [];
        const label = String(c.label || '');
        if (label && !matched.includes(label)) matched.push(label);
        write('/practice/matchedPairs', matched, true);
        return;
      }
      if (name === 'nextStep') {
        const current = Number(c.current) || 0;
        const total = Number(c.total) || 0;
        write('/knowledge/stepCurrent', Math.min(total, current + 1), true);
        return;
      }
      if (name === 'answer') {
        const choice = String(c.choice || '').trim();
        const answer = String(c.answer || surface.getData('/knowledge/answer') || '').trim();
        const options = surface.getData('/knowledge/options') || [];
        const quizApi = G?.ZHIDAO_QUIZ;
        const correct = quizApi && typeof quizApi.isCorrectChoice === 'function'
          ? quizApi.isCorrectChoice(choice, answer, options)
          : (!!answer && choice === answer);
        const resolved = quizApi && typeof quizApi.resolveAnswer === 'function'
          ? quizApi.resolveAnswer(options, answer)
          : { choice: answer, index: (Array.isArray(options) ? options : []).indexOf(answer) };
        const shown = resolved.index >= 0 ? resolved.choice : answer;
        const feedback = correct
          ? '答对啦，这一步你已经会了。'
          : (resolved.index >= 0 ? `再试一次，正确答案是「${shown}」。`
            : (answer ? '这道题的标准答案和选项对不上，先换一题看看。' : '先想一想，再选一次。'));
        write('/practice/feedback', feedback, false);
        write('/practice/tone', correct ? 'good' : 'warn', true);
        if (correct) {
          try { surface.callFunction('celebrate', { level: 'correct', subject }); } catch { /* noop */ }
        }
        evidence(correct, `${point} · ${choice || '未选择'}`);
        return;
      }
      if (name === 'write') {
        const text = String(c.text || '').trim();
        const word = String(c.word || '');
        const minLength = Number(c.minLength) > 0 ? Number(c.minLength) : (recipe?.minLength || 16);
        let feedback = '';
        let tone = 'hint';
        let correct = false;
        if (!text) feedback = '先写下你的想法，不用一次写到最好。';
        else if (word && !text.includes(word)) feedback = `试着把「${word}」放进这句话里。`;
        else if (text.length < minLength) feedback = '已经很好了，再补一点细节就更完整。';
        else {
          correct = true; tone = 'good';
          feedback = `写得完整，已记录这次${subject === 'math' ? '推导' : '练习'}。`;
        }
        write('/practice/feedback', feedback, false);
        write('/practice/tone', tone, true);
        if (correct) {
          try { surface.callFunction('celebrate', { level: 'correct', subject }); } catch { /* noop */ }
        }
        evidence(correct, `${point} · ${text.slice(0, 40)}`);
      }
    });
  }

  function setHead(section, info) {
    const label = section.querySelector('.a2ui-bridge-label');
    if (!label) return;
    const bits = [
      `知识组件 · ${info.subjectLabel} · ${info.phaseLabel} · ${STAGE_SHORT[info.stage] || info.stage}`,
      `${info.componentCount} 个白名单组件`,
      // 消息流来源对家长可见：服务端编译 = 与课程同源下发；本地编译 = 旧服务或年级切换后的重编。
      info.source === 'server' ? '消息流来自服务端' : '浏览器本地编译'
    ];
    if (info.play) bits.push('游戏化关卡已开启');
    if (state.lastEvent) bits.push(state.lastEvent);
    label.textContent = bits.join(' · ');
  }

  /**
   * 主入口：把一份课程响应挂成主流程里的 A2UI 界面。
   * 由 dynamic.js 的三学科渲染函数末尾调用；重复调用幂等（先销毁旧 surface）。
   */
  function mount(result, options = {}) {
    if (isNode || typeof document === 'undefined') return null;
    if (!result || !result.data) return null;
    if (!renderer?.createSurface || !compiler?.compileKnowledgeToA2UI || !catalog || !matrix) return null;
    const host = options.host || document.getElementById('lesson-content');
    if (!host) return null;

    destroy();
    state.options = options;
    state.result = result;
    const grade = options.grade != null ? String(options.grade) : currentGrade(result);
    const subject = ['chinese', 'english', 'math'].includes(result.subject) ? result.subject : 'chinese';
    const phase = phaseFor(result, options);
    const stage = stageOf(grade);
    const knowledge = knowledgeFromLesson(result);
    // P1：服务端已把消息流编译好（result.a2ui.jsonl），校验通过就直接喂给 renderer；
    // 校验不通过（旧服务 / 年级错位 / 消息被改动）才回退本地编译，两条路径产出同构数据。
    const served = takeServerSurface(result.a2ui, {
      subject, phase, stage,
      rendererComponents: Array.isArray(options.rendererComponents) ? options.rendererComponents : null
    });
    const capabilities = served?.capabilities
      || options.capabilities
      || matrix.capabilitiesFor(subject, phase, grade);
    const messages = served
      ? served.messages
      : compiler.compileKnowledgeToA2UI(
        { subject, phase, grade, point: knowledge.point, data: knowledge.data },
        {
          capabilities, surfaceId: `zhidao_bridge_${subject}_${phase}`,
          presented: presentedFrom(result, { quizIndex: options.quizIndex })
        }
      );
    const recipe = matrix.recipeFor(subject, phase, grade);
    // 服务端编译时已经补过空态文案；本地编译才需要补（函数本身幂等）。
    if (!served) primeEmptyFeedback(messages, recipe);
    // 服务端消息流也过一遍校验层（与主界面题干去重）；本地编译已经在 compiler 里跑过，再跑一次幂等。
    const validate = G?.ZHIDAO_A2UI_VALIDATE;
    if (validate && typeof validate.optimizeMessages === 'function') {
      validate.optimizeMessages(messages, {
        presented: presentedFrom(result, { quizIndex: options.quizIndex }),
        extras: { quizzes: knowledge.data.quizzes, data: knowledge.data, items: knowledge.data.items }
      });
    }
    // 服务端若按「全部题已展示」把组件裁空，这里改走本地编译，换一道当前没在展示的题。
    let source = served ? 'server' : 'client';
    if (served && messages.meta && messages.meta.empty) {
      const local = compiler.compileKnowledgeToA2UI(
        { subject, phase, grade, point: knowledge.point, data: knowledge.data },
        {
          capabilities, surfaceId: `zhidao_bridge_${subject}_${phase}`,
          presented: presentedFrom(result, { quizIndex: options.quizIndex })
        }
      );
      if (local && !(local.meta && local.meta.empty)) {
        messages.splice(0, messages.length, ...local);
        messages.meta = local.meta;
        messages.warnings = local.warnings;
        source = 'client';
        primeEmptyFeedback(messages, recipe);
        if (validate && typeof validate.optimizeMessages === 'function') {
          validate.optimizeMessages(messages, {
            presented: presentedFrom(result, { quizIndex: options.quizIndex }),
            extras: { quizzes: knowledge.data.quizzes, data: knowledge.data, items: knowledge.data.items }
          });
        }
      }
    }
    const componentCount = (messages.meta && messages.meta.componentCount) || served?.componentCount || 0;

    const section = el('section', 'a2ui-bridge');
    section.id = SECTION_ID;
    section.dataset.subject = subject;
    section.dataset.phase = phase;
    section.dataset.stage = stage;
    const head = el('div', 'a2ui-bridge-head');
    head.appendChild(el('h4', '', '按你的年级生成的知识组件'));
    head.appendChild(el('span', 'a2ui-bridge-label'));
    const note = el('p', 'a2ui-bridge-note',
      '同一份课程 JSON → 学科 × 学习过程 × 年级配方 → A2UI 消息流；点组件即可练习，结果会记进知识卡片。');
    const surfaceEl = el('div', 'a2ui-bridge-surface');
    surfaceEl.id = SURFACE_ID;
    section.append(head, note, surfaceEl);
    host.appendChild(section);

    const surface = renderer.createSurface(surfaceEl, { capabilities });
    bindActions(surface, { subject, point: knowledge.point, recipe, stage });
    feedJSONL(surface, messages, options.stream === true);

    let playSurface = null;
    let controller = null;
    let playMessages = [];
    let playSource = '';
    let playUiVersion = '';
    const rendererComponents = Array.isArray(options.rendererComponents)
      ? options.rendererComponents : null;
    const playOn = shouldShowPlay({
      subject, phase, grade, point: knowledge.point, data: knowledge.data,
      mastery: options.mastery != null ? Number(options.mastery) : currentMastery(knowledge.point),
      force: options.forcePlay === true
    }) && play?.compilePlayStageToA2UI && play?.createPlayController;

    if (playOn) {
      const playEl = el('div', 'a2ui-bridge-play');
      playEl.id = PLAY_ID;
      section.appendChild(playEl);
      // P3 服务端化：优先消费服务端下发的关卡消息流，校验不过才本地编译。
      const servedPlay = takeServerPlay(result.play, { subject, stage, rendererComponents });
      playSource = servedPlay ? 'server' : 'client';
      playUiVersion = servedPlay?.uiVersion || '';
      const playCaps = servedPlay?.capabilities || capabilities;
      playMessages = servedPlay
        ? servedPlay.messages
        : play.compilePlayStageToA2UI(
          { grade, puzzle: puzzleFor(result), level: 1, progress: 20 },
          { capabilities: playCaps, surfaceId: `zhidao_bridge_play_${stage}` }
        );
      playSurface = renderer.createSurface(playEl, { capabilities: playCaps });
      feedJSONL(playSurface, playMessages, false);
      controller = play.createPlayController(playSurface, {
        stage, subject,
        onEvent: evt => {
          state.lastEvent = String(evt?.name || '');
          setHead(section, {
            subjectLabel: matrix.SUBJECTS[subject].label,
            phaseLabel: matrix.PHASES[phase].label,
            stage, componentCount, play: true, source
          });
        }
      });
    }

    Object.assign(state, {
      mounted: true, key: keyFor(result, grade),
      subject, phase, stage, grade,
      surface, playSurface, controller,
      messages, playMessages, source, playSource, playUiVersion,
      uiVersion: served?.uiVersion || '',
      warnings: [...(messages.warnings || []), ...(playMessages.warnings || []), ...(served?.warnings || [])],
      recipe, lastEvent: ''
    });
    setHead(section, {
      subjectLabel: matrix.SUBJECTS[subject].label,
      phaseLabel: matrix.PHASES[phase].label,
      stage, componentCount, play: !!playSurface, source
    });
    // 校验层裁掉全部卡片后，不要留下一块空白的「知识组件」标题区。
    if (messages.meta && messages.meta.empty) {
      section.classList.add('a2ui-bridge-empty');
      if (!playSurface) section.hidden = true;
    }
    if (!isNode) {
      G.ZHIDAO_A2UI_BRIDGE_SURFACE = surface;
      if (playSurface) G.ZHIDAO_A2UI_BRIDGE_PLAY_SURFACE = playSurface;
      else delete G.ZHIDAO_A2UI_BRIDGE_PLAY_SURFACE;
    }
    return status();
  }

  /** 年级切换 / 外部事件后重编译；若 dynamic.js 已用同一份数据挂载则跳过，避免重复渲染。 */
  function refresh() {
    if (isNode || !state.result) return null;
    const grade = currentGrade(state.result);
    const key = keyFor(state.result, grade);
    if (state.mounted && key === state.key) return status();
    return mount(state.result, state.options);
  }

  function destroy() {
    if (isNode) return;
    try { state.controller?.off?.(); } catch { /* noop */ }
    try { state.surface?.destroy(); } catch { /* noop */ }
    try { state.playSurface?.destroy(); } catch { /* noop */ }
    // 年级切换时 learnerchange / learnerrefresh 会连续触发重编译，
    // 用全量移除保证任何中间态都不会留下两个同 ID 的组件区。
    document.querySelectorAll(`#${SECTION_ID}`).forEach(node => node.remove());
    Object.assign(state, {
      mounted: false, key: '', surface: null, playSurface: null, controller: null,
      messages: [], playMessages: [], warnings: [], recipe: null, lastEvent: '',
      source: '', playSource: '', uiVersion: '', playUiVersion: ''
    });
    if (G?.ZHIDAO_A2UI_BRIDGE_SURFACE) delete G.ZHIDAO_A2UI_BRIDGE_SURFACE;
    if (G?.ZHIDAO_A2UI_BRIDGE_PLAY_SURFACE) delete G.ZHIDAO_A2UI_BRIDGE_PLAY_SURFACE;
  }

  function status() {
    return {
      mounted: state.mounted,
      // server / client：消息流是服务端编译下发，还是浏览器兜底编译。
      source: state.source || '', uiVersion: state.uiVersion || '',
      subject: state.subject, phase: state.phase, stage: state.stage, grade: state.grade,
      surfaceId: state.surface?.surfaceId || '',
      componentCount: state.surface?.componentCount || 0,
      recipeKey: state.recipe?.key || '',
      components: Array.isArray(state.recipe?.components) ? state.recipe.components.slice() : [],
      messageCount: state.messages.length,
      play: !!state.playSurface,
      playSource: state.playSource || '',
      playUiVersion: state.playUiVersion || '',
      playComponentCount: state.playSurface?.componentCount || 0,
      playSurfaceId: state.playSurface?.surfaceId || '',
      warnings: state.warnings.slice(),
      lastEvent: state.lastEvent
    };
  }

  const API = {
    mount, refresh, destroy, status,
    phaseFor, knowledgeFromLesson, presentedFrom, shouldShowPlay, puzzleFor, stageOf,
    primeEmptyFeedback, feedJSONL, takeServerSurface, takeServerPlay, bindActions,
    SECTION_ID, SURFACE_ID, PLAY_ID
  };
  if (isNode) module.exports = API;
  if (!isNode && G) {
    G.ZHIDAO_A2UI_BRIDGE = API;
    // dynamic.js 的年级监听已会重渲染三学科；这里补一层幂等兜底，
    // 保证外部直接派发 zhidao:learnerchange 时组件区也跟着换形态。
    for (const name of ['zhidao:learnerchange', 'zhidao:learnerrefresh']) {
      G.addEventListener?.(name, () => refresh());
    }
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
