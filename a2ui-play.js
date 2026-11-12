/* 游戏化知识关卡 · 组件编译器 + 交互控制器（UMD，零依赖）
 *
 * 设计来源：参考稿的「数列填空 + 候选块 + Reset/Submit/I don't know this +
 * IP 求助卡 + 快捷提问 + 语音控制条」。这里不复制它的视觉，而是把每个区域
 * 抽象成可编排的 A2UI 组件，并按五个认知阶段换文案、换主题、换求助策略。
 *
 * 两条硬规则：
 *   1) 模型只提供题目与知识点（slots / bank / answers / hints），
 *      组件名、文案、动作、样式全部由这里确定性生成，模型给不了 HTML/CSS/JS。
 *   2) 求助不是「点一下直接给答案」：至少两级引导后才揭晓，
 *      且每一级都能语音播报，知知全程陪着说一句话。
 *
 * 编译结果仍是标准 A2UI v1.0 消息流，服务端化时可直接走 SSE JSONL。
 */
'use strict';

(function (root) {
  const isNode = typeof module !== 'undefined' && !!module.exports;
  const catalog = isNode ? require('./a2ui-catalog') : (root && root.ZHIDAO_A2UI_CATALOG);
  const gradeProfile = isNode ? require('./grade-profile') : (root && root.ZHIDAO_GRADE);

  /* ---------------- 年级文案与认知策略 ----------------
   * 低龄：口语、一次一步、星星与即时庆祝、语音优先、求助按钮醒目。
   * 高龄：术语准确、克制、不哄不夸、求助改名「查看思路提示」。
   * 同一份组件树，差异全部落在数据模型与 className 上。 */
  const PLAY_PROFILES = {
    early: {
      level: '第 1 关 · 数字排队', label: '做对一次就点亮一颗星', note: '一次只看这一题',
      title: '哪两个数字躲起来了？', question: '4、7、8 都在，中间少了谁？',
      guide: '先点左下角的小喇叭听题目，再点下面的数字块，把它放进空格里。',
      resetLabel: '重来一次', submitLabel: '我填好啦', askLabel: '我不会，找知知',
      voiceLabel: '听一听', voiceHint: '听题目 / 听做法',
      ipName: '知知', ipStatus: '随时可以问我', ipLine: '别急，我们一起一个一个数。',
      questionsTitle: '问问知知',
      questions: [
        { id: 'q1', text: '为什么有的格子空空的？', speech: '为什么有的格子空空的？',
          hint: '空格子是故意留给你填的，先读出旁边已经有的数字。' },
        { id: 'q2', text: '我怎么知道下一个数是几？', speech: '我怎么知道下一个数是几？',
          hint: '从 4 开始，一个一个往后数：4 后面是 5。' }
      ],
      hintsTitle: '知知的小提示',
      hints: [
        '先大声读出已经有的数字：4、7、8。',
        '从 4 往后一个一个数，数到 7 之前停一下。',
        '答案揭晓：4、5、6、7、8。跟着知知读一遍就记住啦。'
      ],
      hintButton: '再给一条提示', hintNote: '前两条先自己试，第三条才揭晓答案。',
      correct: '全对啦！星星亮了一颗，知知为你鼓掌。', wrong: '差一点点，我们再一起数一遍。',
      almost: '还有空格没填，找一找亮着边的格子。',
      full: '空格都填满啦，点一下填好的数字可以取回。',
      compact: false, stars: 1, badge: 1
    },
    primary: {
      level: '第 2 关 · 找规律', label: '连续做对 2 次点亮一颗星', note: '先做，再看提示',
      title: '补全这排数字', question: '看看 4、7、8，中间少了哪两个数？',
      guide: '先自己数一遍，不确定就点「找知知」，提示会一条一条出来。',
      resetLabel: '重来一次', submitLabel: '填好了，检查一下', askLabel: '我不会，找知知',
      voiceLabel: '听一听', voiceHint: '听题目 / 听做法',
      ipName: '知知', ipStatus: '先想想，我在这儿', ipLine: '先说说你是怎么数的，我再给提示。',
      questionsTitle: '问问知知',
      questions: [
        { id: 'q1', text: '相邻两个数差多少？', speech: '相邻两个数差多少？',
          hint: '拿 7 和 8 比一比，再看 4 到 7 中间隔了几格。' },
        { id: 'q2', text: '怎么检查填得对不对？', speech: '怎么检查填得对不对？',
          hint: '填完从头读一遍，每次只多 1 就对了。' }
      ],
      hintsTitle: '知知的小提示',
      hints: [
        '已知数字是 4、7、8，先看 7 到 8 多了几。',
        '每次多 1，从 4 往后数两格试试。',
        '答案揭晓：4、5、6、7、8，再读一遍验证。'
      ],
      hintButton: '再给一条提示', hintNote: '提示按顺序给，最后一条才揭晓。',
      correct: '填对了！规律找得很准。', wrong: '再数一遍，注意每次多了几。',
      almost: '还有空格空着，先把它补上。', full: '都填满啦，点数字可以取回重放。',
      compact: false, stars: 1, badge: 1
    },
    upper: {
      level: '练习 2 / 5', label: '本组正确率 75%', note: '先写思路，再看解析',
      title: '补全数列', question: '观察 4, _, _, 7, 8，补全缺项并说明你用的规律。',
      guide: '先判断相邻项的关系，需要时查看分级提示。',
      resetLabel: '重置', submitLabel: '提交并核对', askLabel: '找知知要提示',
      voiceLabel: '语音', voiceHint: '读题目 / 读引导',
      ipName: '知知', ipStatus: '可以问思路', ipLine: '先说你的判断依据，我再补一条提示。',
      questionsTitle: '问知知一个问题',
      questions: [
        { id: 'q1', text: '相邻已知项的差是多少？', speech: '相邻已知项的差是多少？',
          hint: '用 8 − 7 得到公差，再检查 4 到 7 的间隔是否一致。' },
        { id: 'q2', text: '缺项是唯一的吗？', speech: '缺项是唯一的吗？',
          hint: '在等差约束下，两个缺项由首项和公差唯一确定。' }
      ],
      hintsTitle: '分级提示',
      hints: [
        '先算相邻已知项 7 与 8 的差。',
        '用同一个差从 4 往后推两格。',
        '答案揭晓：5 与 6；代回原序列验证单调性。'
      ],
      hintButton: '查看下一条提示', hintNote: '提示按顺序展开，最后一条才给结论。',
      correct: '规律与缺项都正确，已记入练习记录。', wrong: '结论不符，先核对公差再代入。',
      almost: '还有缺项未填，补完再提交。', full: '缺项已填满，点数字可取回。',
      compact: false, stars: 0, badge: 1
    },
    teen: {
      level: '练习 2 / 5', label: '正确率 80%', note: '独立推导优先',
      title: '补全数列', question: '观察 4, _, _, 7, 8 的相邻关系，补全缺项并写出依据。',
      guide: '先独立完成推导；需要时再展开分级提示。',
      resetLabel: '重置', submitLabel: '提交并核对', askLabel: '查看思路提示',
      voiceLabel: '朗读', voiceHint: '题目 / 引导',
      ipName: '知知', ipStatus: '思路提示', ipLine: '先写出判断依据，再对照提示核对。',
      questionsTitle: '思路核对',
      questions: [
        { id: 'q1', text: '相邻项的差是否恒定？', speech: '相邻项的差是否恒定？',
          hint: '检查已给三项之间的差，确认是否满足等差条件。' },
        { id: 'q2', text: '缺项是否唯一确定？', speech: '缺项是否唯一确定？',
          hint: '在等差约束下，由首项与公差可唯一确定两个缺项。' }
      ],
      hintsTitle: '分级提示',
      hints: [
        '计算相邻已知项的差并说明所用条件。',
        '以该公差为首项推导两个缺项。',
        '结论：缺项为 5、6；代回原序列核对公差与单调性。'
      ],
      hintButton: '查看下一条提示', hintNote: '提示不替代推导过程，按需要逐级展开。',
      correct: '推导正确，已记入掌握证据。', wrong: '结论不符，检查公差设定与代入过程。',
      almost: '缺项未补全，补完后再提交。', full: '缺项已填满，点数字可取回。',
      compact: true, stars: 0, badge: 0
    },
    senior: {
      level: '练习 2 / 5', label: '正确率 80%', note: '核对边界条件',
      title: '数列缺项', question: '给定 4, _, _, 7, 8，求缺项并说明约束条件。',
      guide: '先写约束，再求解；提示仅在核对边界时使用。',
      resetLabel: '重置', submitLabel: '提交', askLabel: '核对提示',
      voiceLabel: '朗读', voiceHint: '题目 / 约束',
      ipName: '知知', ipStatus: '思路核对', ipLine: '给出约束与求解步骤，再对照结论。',
      questionsTitle: '条件核对',
      questions: [
        { id: 'q1', text: '公差由哪两项确定？', speech: '公差由哪两项确定？',
          hint: '公差只能由相邻已知项确定，注意信息不足时的多解风险。' },
        { id: 'q2', text: '结论需要满足哪些边界？', speech: '结论需要满足哪些边界？',
          hint: '验证单调性、整数性与代回后的相邻差一致。' }
      ],
      hintsTitle: '分级提示',
      hints: [
        '由 7、8 确定公差，并检查 4 到 7 的间隔。',
        '在等差约束下解出两个缺项。',
        '结论：5、6；代回验证公差恒定且序列单调递增。'
      ],
      hintButton: '查看下一条提示', hintNote: '提示仅用于核对，不替代完整推导。',
      correct: '结论与边界核对通过。', wrong: '结论不符，复核公差与边界条件。',
      almost: '缺项未补全。', full: '缺项已填满。',
      compact: true, stars: 0, badge: 0
    }
  };
  PLAY_PROFILES.generic = { ...PLAY_PROFILES.upper, level: '练习', label: '进行中' };

  /** 默认关卡：模型未给题目时也能完整演示，不产生空白组件。 */
  const DEFAULT_PUZZLE = {
    point: '相邻数 / 等差',
    slots: ['4', '', '', '7', '8'],
    bank: ['5', '6', '7', '3', '4'],
    answers: ['5', '6'],
    question: 'Which numbers are missing?',
    hints: []
  };

  function stageKey(grade) {
    if (gradeProfile && gradeProfile.stageForGrade) {
      return gradeProfile.stageForGrade(grade).id;
    }
    return 'generic';
  }

  function normalizePuzzle(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const slots = Array.isArray(src.slots) && src.slots.length ? src.slots.map(String) : DEFAULT_PUZZLE.slots.slice();
    const bank = Array.isArray(src.bank) && src.bank.length ? src.bank.map(String) : DEFAULT_PUZZLE.bank.slice();
    const answers = Array.isArray(src.answers) && src.answers.length
      ? src.answers.map(String) : DEFAULT_PUZZLE.answers.slice();
    return {
      point: String(src.point || DEFAULT_PUZZLE.point),
      slots, bank, answers,
      question: String(src.question || DEFAULT_PUZZLE.question)
    };
  }

  /**
   * 把一份关卡数据编译成 A2UI v1.0 消息流。
   * @param {object} payload { grade, puzzle, level, progress, combo, stars }
   * @returns {Array} 消息数组，附 warnings / meta
   */
  function compilePlayStageToA2UI(payload = {}, options = {}) {
    if (!catalog) throw new Error('需要先加载 a2ui-catalog.js');
    const src = payload && typeof payload === 'object' ? payload : {};
    const grade = String(src.grade || '').trim();
    const stage = stageKey(grade);
    const profile = PLAY_PROFILES[stage] || PLAY_PROFILES.generic;
    const puzzle = normalizePuzzle(src.puzzle);
    const hints = Array.isArray(src.puzzle?.hints) && src.puzzle.hints.length
      ? src.puzzle.hints.map(String) : profile.hints.slice();
    const surfaceId = String(options.surfaceId || `zhidao_play_${stage}`).replace(/[^A-Za-z0-9_]/g, '_');
    const capabilities = options.capabilities || catalog.rendererCapabilities(grade);
    const warnings = [];

    // 空格位下标由 slots 决定；gaps 与 slots 等长，固定格用 null。
    const gaps = puzzle.slots.map(() => null);
    // 题干本身也按年级改写：低龄口语化、高龄术语化；模型只提供 slots/bank/answers。
    const questionText = String(src.question || profile.question || puzzle.question);

    const dataModel = {
      play: {
        title: profile.title,
        question: questionText,
        guide: profile.guide,
        slots: puzzle.slots,
        gaps,
        bank: puzzle.bank,
        answers: puzzle.answers,
        point: puzzle.point,
        feedback: '',
        tone: '',
        hints,
        hintUnlocked: 0,
        hintVoice: '',
        questions: profile.questions.map(item => ({ ...item })),
        activeQuestion: '',
        level: src.level || profile.level,
        progress: Number.isFinite(Number(src.progress)) ? Number(src.progress) : 20,
        stars: Number.isFinite(Number(src.stars)) ? Number(src.stars) : profile.stars,
        combo: Number.isFinite(Number(src.combo)) ? Number(src.combo) : 0,
        label: profile.label,
        note: profile.note,
        ipName: profile.ipName,
        ipStatus: profile.ipStatus,
        ipLine: profile.ipLine,
        ipBadge: profile.badge,
        muted: false
      }
    };

    const P = pointer => ({ '@path': pointer });
    const components = [
      { id: 'root', component: 'Column', className: 'gallery-root', children: ['scene'] },
      { id: 'scene', component: 'Row', className: 'k-play-scene', children: ['main', 'side'] },
      { id: 'main', component: 'Card', className: 'k-play-main', children: ['hud', 'gaps', 'voice'] },
      { id: 'side', component: 'Column', className: 'k-play-side', children: ['ip', 'questions', 'hints'] },
      {
        id: 'hud', component: 'QuestHUD', className: 'k-quest',
        level: P('/play/level'), progress: P('/play/progress'), stars: P('/play/stars'),
        combo: P('/play/combo'), label: P('/play/label'), note: P('/play/note')
      },
      {
        id: 'gaps', component: 'NumberGaps', className: 'k-play k-gaps',
        title: P('/play/title'), question: P('/play/question'),
        slots: P('/play/slots'), gaps: P('/play/gaps'), bank: P('/play/bank'),
        feedback: P('/play/feedback'), tone: P('/play/tone'), feedbackId: 'play_feedback',
        hint: profile.voiceHint, resetLabel: profile.resetLabel,
        submitLabel: profile.submitLabel, askLabel: profile.askLabel
      },
      {
        id: 'voice', component: 'VoiceGuide', className: 'k-voice',
        label: profile.voiceLabel, hint: profile.voiceHint, muted: P('/play/muted'),
        playAction: { event: { name: 'readGuide', context: { mode: 'question', speak: P('/play/question') } } },
        guideAction: { event: { name: 'readGuide', context: { mode: 'guide', speak: P('/play/guide') } } },
        muteAction: { event: { name: 'readGuide', context: { mode: 'mute' } } }
      },
      {
        id: 'ip', component: 'AskIP', className: 'k-ip',
        name: P('/play/ipName'), status: P('/play/ipStatus'), line: P('/play/ipLine'),
        badge: P('/play/ipBadge'), callLabel: '语音问知知', chatLabel: '打字问知知',
        compact: profile.compact,
        callAction: { event: { name: 'askIP', context: { mode: 'call' } } },
        chatAction: { event: { name: 'askIP', context: { mode: 'chat' } } }
      },
      {
        id: 'questions', component: 'QuickQuestions', className: 'k-questions',
        title: profile.questionsTitle, questions: P('/play/questions'),
        activeId: P('/play/activeQuestion'), note: '点小喇叭听问题，点气泡让知知回答。',
        questionAction: { event: { name: 'askQuestion', context: {} } },
        feedback: P('/play/feedback'), tone: P('/play/tone')
      },
      {
        id: 'hints', component: 'HintLadder', className: 'k-hints',
        title: profile.hintsTitle, steps: P('/play/hints'), unlocked: P('/play/hintUnlocked'),
        note: profile.hintNote, button: profile.hintButton,
        revealAction: { event: { name: 'revealHint', context: {} } },
        voiceAction: { event: { name: 'readGuide', context: { mode: 'hint', speak: P('/play/hintVoice') } } },
        feedback: '', tone: ''
      }
    ];

    const safe = [];
    for (const item of components) {
      const target = catalog.fallbackFor(item.component, capabilities);
      if (!target) { warnings.push(`${item.id}(${item.component}) 无可用降级`); continue; }
      if (target !== item.component) {
        warnings.push(`${item.id}(${item.component}) 降级为 ${target}`);
        const allowed = new Set(catalog.COMPONENTS[target].props || []);
        const cleaned = { id: item.id, component: target, className: item.className };
        // children 必须保留：否则 Row/Card 降级后整个主区与侧栏会渲染成空白。
        for (const [key, value] of Object.entries(item)) {
          if (key === 'id' || key === 'component' || key === 'className') continue;
          if (allowed.has(key)) cleaned[key] = value;
        }
        safe.push(cleaned);
      } else safe.push(item);
    }
    const kept = new Set(safe.map(item => item.id));
    for (const item of safe) {
      if (Array.isArray(item.children)) item.children = item.children.filter(id => kept.has(id));
    }

    const messages = [{
      version: catalog.VERSION,
      createSurface: {
        surfaceId,
        catalogId: catalog.CATALOG_ID,
        meta: { stage, uiVersion: 'play-v1', componentCount: safe.length, point: puzzle.point },
        components: safe,
        dataModel
      }
    }];
    messages.warnings = warnings;
    messages.meta = { surfaceId, stage, profile, componentCount: safe.length };
    return messages;
  }

  /* ---------------- 浏览器交互控制器 ----------------
   * 组件本身不持有状态：所有点击都走 action → 控制器 → updateDataModel → 重渲染。
   * 这样服务端化时只需把控制器搬到 agent 侧，组件树完全不用改。 */
  function createPlayController(surface, options = {}) {
    if (!surface || typeof surface.onAction !== 'function') throw new Error('需要 A2UI surface');
    const stage = String(options.stage || 'generic');
    const profile = PLAY_PROFILES[stage] || PLAY_PROFILES.generic;
    const log = [];
    const record = (name, detail) => {
      log.push({ name, detail, at: Date.now() });
      if (typeof options.onEvent === 'function') options.onEvent({ name, detail });
    };

    /** 批量写数据模型，只在最后渲染一次，避免连续写入闪屏。 */
    const patch = updates => {
      for (const [path, value] of Object.entries(updates)) surface.setData(path, value, false);
      surface.render();
    };
    const model = () => (surface.model && surface.model.play) || {};
    const call = (name, args) => {
      try { return surface.callFunction(name, args || {}); } catch { return false; }
    };
    const cue = (intent, line) => {
      patch({ '/play/ipLine': line || profile.ipLine });
      call('ipIntent', { intent, line: line || profile.ipLine });
    };
    const say = (message, tone) => patch({ '/play/feedback': message, '/play/tone': tone || 'info' });

    function emptyGapIndexes() {
      const m = model();
      const slots = Array.isArray(m.slots) ? m.slots : [];
      const gaps = Array.isArray(m.gaps) ? m.gaps : [];
      return slots.map((slot, index) => (String(slot || '') === '' ? index : -1))
        .filter(index => index >= 0);
    }

    function revealHint() {
      const m = model();
      const hints = Array.isArray(m.hints) ? m.hints : [];
      const next = Math.min(hints.length, (Number(m.hintUnlocked) || 0) + 1);
      const text = next > 0 ? String(hints[next - 1]) : '';
      patch({
        '/play/hintUnlocked': next,
        '/play/hintVoice': text,
        '/play/ipBadge': 0,
        '/play/ipLine': next >= hints.length ? '答案揭晓啦，再自己读一遍就记住了。' : '给你一条提示，先自己试一试。',
        '/play/feedback': text,
        '/play/tone': next >= hints.length ? 'good' : 'info'
      });
      call('ipIntent', { intent: 'think', line: model().ipLine });
      if (text) call('speak', { text });
      record('revealHint', { level: next, text });
    }

    function submit() {
      const m = model();
      const indexes = emptyGapIndexes();
      const gaps = Array.isArray(m.gaps) ? m.gaps : [];
      const answers = Array.isArray(m.answers) ? m.answers : [];
      if (indexes.some(index => !String(gaps[index] ?? '').trim())) {
        say(profile.almost, 'warn');
        cue('think', '还有空格没填，找一个数字放进去。');
        record('submit', { result: 'incomplete' });
        return;
      }
      const correct = indexes.every((index, order) => String(gaps[index]).trim() === String(answers[order] ?? '').trim());
      if (correct) {
        patch({
          '/play/feedback': profile.correct,
          '/play/tone': 'good',
          '/play/stars': Math.min(3, (Number(m.stars) || 0) + 1),
          '/play/combo': (Number(m.combo) || 0) + 1,
          '/play/progress': Math.min(100, (Number(m.progress) || 0) + 20),
          '/play/ipLine': profile.correct
        });
        call('celebrate', { level: 'correct', subject: options.subject || 'math' });
        call('ipIntent', { intent: 'happy', line: profile.correct });
        call('recordEvidence', { type: 'quiz', correct: true, point: m.point || '' });
        record('submit', { result: 'correct' });
      } else {
        patch({
          '/play/feedback': profile.wrong, '/play/tone': 'warn',
          '/play/combo': 0, '/play/ipLine': '先别改答案，找知知要一条提示再想想。'
        });
        call('celebrate', { level: 'wrong' });
        call('ipIntent', { intent: 'think', line: model().ipLine });
        record('submit', { result: 'wrong' });
      }
    }

    const off = surface.onAction(message => {
      const name = message?.action?.event?.name || '';
      const context = message?.action?.event?.context || {};
      const m = model();
      switch (name) {
        case 'fillGap': {
          const indexes = emptyGapIndexes();
          const gaps = Array.isArray(m.gaps) ? m.gaps.slice() : [];
          const target = indexes.find(index => !String(gaps[index] ?? '').trim());
          if (target === undefined) { say(profile.full, 'info'); break; }
          gaps[target] = String(context.value ?? '');
          patch({ '/play/gaps': gaps, '/play/feedback': '放好啦！再看看下一个空格。', '/play/tone': 'info' });
          cue('focus', '放得很好，我们再看下一个空格。');
          record('fillGap', { index: target, value: context.value });
          break;
        }
        case 'clearGap': {
          const index = Number(context.index);
          if (!Number.isInteger(index) || index < 0) break;
          const gaps = Array.isArray(m.gaps) ? m.gaps.slice() : [];
          gaps[index] = null;
          patch({ '/play/gaps': gaps, '/play/feedback': '取回来啦，换一个数字试试。', '/play/tone': 'info' });
          record('clearGap', { index });
          break;
        }
        case 'resetGaps': {
          const gaps = (Array.isArray(m.slots) ? m.slots : []).map(() => null);
          patch({ '/play/gaps': gaps, '/play/feedback': '重新开始，不着急。', '/play/tone': 'info',
            '/play/hintUnlocked': 0, '/play/hintVoice': '', '/play/activeQuestion': '' });
          cue('wave', '没关系，我们从头再来一次。');
          record('resetGaps', {});
          break;
        }
        case 'submitGaps': submit(); break;
        case 'askIP': {
          const mode = String(context.mode || 'call');
          cue('think', mode === 'chat' ? '把你的想法说给我听，我陪你一步步找。' : '我在听，先说说你卡在哪一步。');
          // 求助也要走分级提示：不一点就给答案，先给第一级引导。
          revealHint();
          record('askIP', { mode });
          break;
        }
        case 'revealHint': revealHint(); break;
        case 'askQuestion': {
          const mode = String(context.mode || 'ask');
          const questions = Array.isArray(m.questions) ? m.questions : [];
          const hit = questions.find(item => String(item.id) === String(context.id));
          if (mode === 'speak') {
            cue('speak', '我读给你听，注意听清楚问题。');
            record('askQuestion', { mode, id: context.id });
            break;
          }
          const answer = String(hit?.hint || '先说说你自己的想法，我再一起看。');
          patch({
            '/play/activeQuestion': String(context.id || ''),
            '/play/feedback': answer, '/play/tone': 'info',
            '/play/ipLine': answer, '/play/ipBadge': 0
          });
          call('ipIntent', { intent: 'think', line: answer });
          call('speak', { text: answer });
          record('askQuestion', { mode, id: context.id, answer });
          break;
        }
        case 'readGuide': {
          const mode = String(context.mode || 'question');
          if (mode === 'mute') {
            patch({ '/play/muted': !m.muted });
            record('readGuide', { mode, muted: !m.muted });
            break;
          }
          if (mode === 'question') cue('speak', '听我把题目读一遍，再动手。');
          if (mode === 'guide') cue('speak', '听一遍做法，跟着做就行。');
          if (mode === 'hint') cue('speak', '这条提示我再读一遍。');
          record('readGuide', { mode });
          break;
        }
        default: break;
      }
    });

    return {
      surface, stage, profile,
      get log() { return log.slice(); },
      revealHint, submit,
      destroy() { if (typeof off === 'function') off(); }
    };
  }

  const API = {
    PLAY_PROFILES, DEFAULT_PUZZLE, stageKey, normalizePuzzle,
    compilePlayStageToA2UI, createPlayController,
    toJSONL: payload => compilePlayStageToA2UI(payload).map(item => JSON.stringify(item)).join('\n')
  };
  if (isNode) module.exports = API;
  if (root) root.ZHIDAO_PLAY = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
