/* 知识组件矩阵 · 前后端共用（UMD，零依赖）
 *
 * 解决一个问题：同一份知识，给一年级和给初三、给「初识」和给「强化」，
 * 不该是同一套组件。这里把「学科 × 学习过程 × 认知阶段」收敛成一份配方表，
 * 编译器按配方选组件，renderer 只负责渲染白名单组件。
 *
 * 三层标尺：
 *   学科     决定用什么「认知动作」（语文读/品/仿写，英语听/选/辨，数学摆/推/验）
 *   学习过程 决定处在哪个环节（初识 → 练习 → 强化 → 迁移）
 *   认知阶段 决定形态（选项数、线性还是全展开、能否出现公式、信息密度、语气）
 *
 * 原则：年龄适配改变「怎么做」，绝不删除「学什么」。低年级不出现抽象组件，
 * 但知识点本身必须仍然可见；生成侧规则只约束表达方式，不截断内容。
 */
'use strict';

(function (root) {
  const isNode = typeof module !== 'undefined' && !!module.exports;
  const gradeProfile = isNode ? require('./grade-profile') : (root && root.ZHIDAO_GRADE);
  const catalog = isNode ? require('./a2ui-catalog') : (root && root.ZHIDAO_A2UI_CATALOG);

  const SUBJECTS = {
    chinese: { label: '语文', points: ['字词', '成语', '诗文', '表达', '阅读'], verb: '读 · 品 · 仿写' },
    english: { label: '英语', points: ['词汇', '语法', '情景', '听说', '辨析'], verb: '听 · 选 · 辨' },
    math: { label: '数学', points: ['概念', '公式', '分步解题', '变式', '应用'], verb: '摆 · 推 · 验' }
  };

  const PHASES = {
    learn: { label: '初识 / 学习', goal: '看见、听懂、能复述', index: 1 },
    practice: { label: '练习', goal: '独立做一次', index: 2 },
    reinforce: { label: '强化 / 巩固', goal: '隔一段时间还能做对', index: 3 },
    transfer: { label: '迁移 / 应用', goal: '换个情境仍会用', index: 4 }
  };

  const STAGE_LABEL = {
    early: '启蒙期（1–2 年级）', primary: '具体运算期（3–4 年级）',
    upper: '形式运算前期（5–6 年级）', teen: '青少年期（初中）',
    senior: '高中期', generic: '通用'
  };

  /* 认知阶段规则：低年级减组件、减选项、线性推进；高年级加抽象、加自检。 */
  const STAGE_RULES = {
    early: { optionCount: 2, stepMode: 'linear', allowFormula: false, allowAbstract: false, density: 'low', maxComponents: 5, tone: 'child' },
    primary: { optionCount: 3, stepMode: 'linear', allowFormula: false, allowAbstract: false, density: 'low', maxComponents: 6, tone: 'child' },
    upper: { optionCount: 3, stepMode: 'all', allowFormula: true, allowAbstract: false, density: 'balanced', maxComponents: 7, tone: 'neutral' },
    teen: { optionCount: 4, stepMode: 'all', allowFormula: true, allowAbstract: true, density: 'high', maxComponents: 8, tone: 'restrained' },
    senior: { optionCount: 4, stepMode: 'all', allowFormula: true, allowAbstract: true, density: 'high', maxComponents: 9, tone: 'restrained' },
    generic: { optionCount: 3, stepMode: 'all', allowFormula: true, allowAbstract: false, density: 'balanced', maxComponents: 7, tone: 'neutral' }
  };

  /* 基础配方：学科 × 学习过程。组件必须是 renderer 已实现的白名单组件。 */
  const BASE_RECIPES = {
    chinese: {
      learn: { title: '听一句，读一句', goal: '把诗句听清、读顺', components: ['HintBar', 'PoemLine', 'SpeakButton'], focus: '语音与节奏' },
      practice: { title: '试着写一句', goal: '用上刚学的表达', components: ['WordChips', 'WritingPad', 'Feedback'], focus: '仿写' },
      reinforce: { title: '隔几天再来一次', goal: '重新提取记忆', components: ['PoemLine', 'WordChips', 'WritingPad', 'Feedback'], focus: '间隔回忆' },
      transfer: { title: '换个情境迁移仿写', goal: '把手法用到新场景', components: ['WritingPad', 'Feedback', 'Text'], focus: '手法迁移' }
    },
    english: {
      learn: { title: '先听，再跟着说', goal: '建立声音与词义的连接', components: ['WordChips', 'SpeakButton', 'HintBar'], focus: '听音辨词' },
      practice: { title: '你来判一判', goal: '在情景里选对用法', components: ['ChoiceQuiz', 'SpeakButton', 'Feedback'], focus: '情景选择' },
      reinforce: { title: '易混辨析再练一次', goal: '排除典型干扰项', components: ['ChoiceQuiz', 'WordChips', 'Feedback'], focus: '辨析巩固' },
      transfer: { title: '自己造一个句子', goal: '把结构用到自己的话里', components: ['WritingPad', 'ChoiceQuiz', 'Feedback'], focus: '产出迁移' }
    },
    math: {
      learn: { title: '一步一步摆出来', goal: '看见解题的顺序', components: ['StepReveal', 'HintBar'], focus: '线性分步' },
      practice: { title: '自己走一遍思路', goal: '独立推进每一步', components: ['StepReveal', 'ChoiceQuiz', 'Feedback'], focus: '思路复现' },
      reinforce: { title: '公式 + 变式再验一次', goal: '从特例回到通法', components: ['FormulaBlock', 'ChoiceQuiz', 'StepReveal'], focus: '通法与变式' },
      transfer: { title: '换条件还能解吗', goal: '迁移到新情境', components: ['StepReveal', 'FormulaBlock', 'ChoiceQuiz', 'Text'], focus: '条件迁移' }
    }
  };

  /* 操作提示：同一过程在不同年级说不同的话。青少年禁用幼态化措辞。 */
  const PHASE_HINTS = {
    learn: {
      early: '点小喇叭听一句，跟着读一句就好',
      primary: '先听一遍，再挑一句读给自己听',
      upper: '读的时候想想，哪个词让画面动起来了',
      teen: '对照注释标出关键一处，不必逐字翻译',
      senior: '先自己概括大意，再核对注释',
      generic: '先听一遍，再自己读一遍'
    },
    practice: {
      early: '点一个大按钮，选一个就算完成',
      primary: '自己先试一次，卡住了再看提示',
      upper: '做完写一句：我为什么选它',
      teen: '提交前写出判断依据，再核对结论',
      senior: '给出推导过程并自检',
      generic: '先自己试一次，再看解析'
    },
    reinforce: {
      early: '隔几天再来，做对一次就点亮一颗星',
      primary: '这次不看提示，看看能不能独立做对',
      upper: '对比上次，找出还容易错的那一步',
      teen: '统计错因，针对性重做一遍',
      senior: '归纳同类题的通法',
      generic: '隔一段时间再做一次'
    },
    transfer: {
      early: '换个东西，照样说一句',
      primary: '把刚学的方法用到新题目里',
      upper: '换一个条件，结果会怎么变',
      teen: '迁移到陌生情境，并说明依据',
      senior: '推广到一般情形并给出证明思路',
      generic: '换个情境再试一次'
    }
  };

  /* 生成侧约束：喂给模型提示词，保证「内容」也按学科 × 过程 × 年级适配。 */
  const PROMPT_RULES = {
    chinese: {
      learn: '例句用身体动作和看得见的事物，句子短，避免抽象术语',
      practice: '仿写素材必须是该年级学过的常用词，不出现生僻典故',
      reinforce: '重复出现上次的核心表达，配一个不同语境的短例',
      transfer: '要求写出所用手法，并给一个生活化新场景'
    },
    english: {
      learn: '例句均为该年级词汇，配中文释义，一次只出现一个生词',
      practice: '选项含一个典型易错干扰项，解析用简体中文说明差别',
      reinforce: '把易混点并列呈现，各配一个短句',
      transfer: '给出句型框架，要求替换成自己的真实情境'
    },
    math: {
      learn: '用实物、图形或数轴描述，不先给公式',
      practice: '每步只做一个动作，步骤不超过该年级的负荷',
      reinforce: '先给通法再给变式，要求写出每一步依据',
      transfer: '改变一个条件，要求判断结论是否仍成立'
    }
  };

  /* P2 适龄组件：每组配方只追加 1 个，卡片总数可控；
   * 初识补学科内容卡，练习/强化/迁移按认知阶段从图示 → 配对 → 自检 → 分栏升级。
   * 不替换原有组件：知识点、正确答案、反馈链路全部保留。 */
  const CONTENT_CARD = { chinese: 'IdiomCard', english: 'WordCard', math: 'NumberLine' };
  const PRACTICE_CARD = {
    early: 'PictureChoice', primary: 'MatchPairs', upper: 'MatchPairs',
    teen: 'MethodNote', senior: 'MethodNote', generic: 'MatchPairs'
  };
  const PROGRESS_CARD = {
    early: 'PictureChoice', primary: 'MatchPairs', upper: 'MasteryRing',
    teen: 'MasteryRing', senior: 'Tabs', generic: 'MasteryRing'
  };

  function extraFor(subject, phase, stage) {
    if (phase === 'learn') return CONTENT_CARD[subject] || CONTENT_CARD.chinese;
    if (phase === 'practice') return PRACTICE_CARD[stage] || PRACTICE_CARD.generic;
    if (phase === 'reinforce' && subject === 'math' && (stage === 'early' || stage === 'primary')) {
      return 'NumberLine';
    }
    return PROGRESS_CARD[stage] || PROGRESS_CARD.generic;
  }

  const ABSTRACT_COMPONENTS = ['FormulaBlock', 'Text'];

  /* ---------------- 阶段准入 · 唯一事实来源 ----------------
   * 从 a2ui-catalog.js 迁来：catalog 只回答「实现得出来吗」（COMPONENTS schema），
   * 这里回答「这个年级允许出现什么」。此前两边各有一套阶段口径，
   * rendererCapabilities() 曾把准入表当渲染能力去协商，导致英语启蒙期
   * ChoiceQuiz 被误降级成 WritingPad。现在只有这一份表 + 这一处计算。
   * BASE 是 P0 内容组件，任何年级都不能裁掉（不靠 display:none 藏正文）。 */
  const BASE_COMPONENTS = [
    'Column', 'Card', 'Row', 'List', 'Text', 'Button', 'TextField',
    'CardHeading', 'HintBar', 'PoemLine', 'SpeakButton', 'WritingPad',
    'WordChips', 'Feedback', 'EmptyState'
  ];

  const P2 = catalog?.P2_COMPONENTS || ['IdiomCard', 'WordCard', 'PictureChoice',
    'MatchPairs', 'NumberLine', 'MasteryRing', 'Tabs', 'MethodNote'];
  const P3 = catalog?.P3_COMPONENTS || [];
  const ALL_GAMES = catalog?.GAME_COMPONENTS || [];
  const STAGE_EXTRAS = {
    // 启蒙期只放图示 / 实物 / 内容卡，抽象自检一律不放出。
    early: ['PictureChoice', 'NumberLine', 'IdiomCard', 'WordCard', 'MatchPairs', ...P3, ...ALL_GAMES],
    primary: ['PictureChoice', 'NumberLine', 'IdiomCard', 'WordCard', 'MatchPairs', ...P3, ...ALL_GAMES],
    upper: ['PictureChoice', 'NumberLine', 'IdiomCard', 'WordCard', 'MatchPairs',
      'ChoiceQuiz', 'MasteryRing', ...P3, ...ALL_GAMES],
    teen: ['ChoiceQuiz', 'StepReveal', ...P2, 'FormulaBlock', ...P3, ...ALL_GAMES],
    senior: ['ChoiceQuiz', 'StepReveal', ...P2, 'FormulaBlock', ...P3, ...ALL_GAMES],
    generic: ['IdiomCard', 'ChoiceQuiz', 'PictureChoice', 'MatchPairs', 'NumberLine', ...P3, ...ALL_GAMES]
  };
  const STAGE_IDS = ['early', 'primary', 'upper', 'teen', 'senior', 'generic'];

  /** 本阶段允许出现的组件清单（去重，BASE 永远在）。 */
  function stageComponents(stage) {
    return [...new Set([...BASE_COMPONENTS, ...(STAGE_EXTRAS[stage] || STAGE_EXTRAS.generic)])];
  }
  function stageLimits(stage) {
    return {
      maxComponents: stage === 'early' ? 24 : 48,
      // 只作为生成侧告警依据，绝不用于截断或隐藏正文。
      textMaxLength: stage === 'early' ? 12 : stage === 'primary' ? 20 : 60
    };
  }
  /** 阶段能力（不含学科配方）。catalog.rendererCapabilities() 是它的只读视图。 */
  function stageCapabilities(grade) {
    const stage = stageOf(grade);
    return {
      stage,
      catalogId: catalog?.CATALOG_ID || 'urn:zhidao:catalog:knowledge:v1',
      components: stageComponents(stage),
      implemented: catalog?.COMPONENTS ? Object.keys(catalog.COMPONENTS) : [],
      ...stageLimits(stage),
      version: catalog?.VERSION || '1.0'
    };
  }

  function stageOf(grade) {
    if (gradeProfile && gradeProfile.stageForGrade) {
      try { return gradeProfile.stageForGrade(grade).id; } catch { /* 落到 generic */ }
    }
    return 'generic';
  }

  /**
   * 取一份组件配方。
   * @returns {{key, subject, subjectLabel, phase, phaseLabel, stage, stageLabel,
   *           title, hint, goal, focus, components, density, optionCount,
   *           stepMode, minLength, rules, prompt, tone}}
   */
  function recipeFor(subject, phase, grade) {
    const sub = SUBJECTS[subject] ? subject : 'chinese';
    const ph = PHASES[phase] ? phase : 'learn';
    const stage = stageOf(grade);
    const rules = STAGE_RULES[stage] || STAGE_RULES.generic;
    const base = BASE_RECIPES[sub][ph];

    let components = base.components.slice();
    // 抽象组件（公式 / 长说明）被认知阶段排除时，统一降级为提示条承载「换个说法看这一步」：
    // 不直接删、不用 display:none 藏，避免重演诗文空白那一类事故。
    const removedAbstract = base.components.some(name =>
      (name === 'FormulaBlock' && !rules.allowFormula) || (name === 'Text' && !rules.allowAbstract));
    if (!rules.allowFormula) components = components.filter(name => name !== 'FormulaBlock');
    if (!rules.allowAbstract) components = components.filter(name => name !== 'Text');
    // 追加 1 个 P2 适龄组件；降级产生的 HintBar 排在最前，绝不被负荷裁剪挤掉。
    components.push(extraFor(sub, ph, stage));
    if (removedAbstract) components.unshift('HintBar');
    components = [...new Set(components)].slice(0, rules.maxComponents);

    const writingHint = gradeProfile && gradeProfile.hintForGrade
      ? gradeProfile.hintForGrade(grade, 'writing') : null;
    const minLength = Number(writingHint?.minLength) > 0 ? Number(writingHint.minLength) : 16;
    const hint = (PHASE_HINTS[ph] && PHASE_HINTS[ph][stage]) || PHASE_HINTS[ph].generic;
    const prompt = PROMPT_RULES[sub][ph];

    return {
      key: `${sub}.${ph}.${stage}`,
      subject: sub, subjectLabel: SUBJECTS[sub].label, subjectVerb: SUBJECTS[sub].verb,
      phase: ph, phaseLabel: PHASES[ph].label, phaseIndex: PHASES[ph].index,
      stage, stageLabel: STAGE_LABEL[stage] || STAGE_LABEL.generic,
      title: base.title, hint, goal: base.goal || PHASES[ph].goal, focus: base.focus,
      components, density: rules.density, optionCount: rules.optionCount,
      stepMode: rules.stepMode, minLength, tone: rules.tone,
      rules: [prompt, rules.allowFormula ? '允许出现公式与符号推导' : '不出现公式，用图形与语言描述'],
      prompt
    };
  }

  /** 能力集：阶段准入（本模块）+ 本配方要用的组件；禁用项仍由 applyCapabilities 降级。
   * 不再回问 catalog.rendererCapabilities()——那正是两套口径互相污染的入口。 */
  function capabilitiesFor(subject, phase, grade) {
    const recipe = recipeFor(subject, phase, grade);
    const caps = stageCapabilities(grade);
    const merged = [...new Set([...caps.components, ...recipe.components])];
    return { ...caps, components: merged, maxComponents: Math.max(caps.maxComponents || 48, merged.length + 2) };
  }

  /** 完整矩阵（供文档、家长看板、测试与生成侧预检使用）。 */
  function matrixRows() {
    const rows = [];
    for (const subject of Object.keys(SUBJECTS)) {
      for (const phase of Object.keys(PHASES)) {
        for (const stage of ['early', 'primary', 'upper', 'teen', 'senior']) {
          const grade = { early: 'grade1', primary: 'grade3', upper: 'grade5', teen: 'grade8', senior: 'senior2' }[stage];
          const r = recipeFor(subject, phase, grade);
          rows.push({
            subject, subjectLabel: r.subjectLabel, phase, phaseLabel: r.phaseLabel,
            stage, stageLabel: r.stageLabel, grade, title: r.title, hint: r.hint,
            components: r.components, optionCount: r.optionCount, stepMode: r.stepMode, density: r.density
          });
        }
      }
    }
    return rows;
  }

  const API = {
    SUBJECTS, PHASES, STAGE_RULES, STAGE_LABEL, BASE_RECIPES, PHASE_HINTS, PROMPT_RULES,
    CONTENT_CARD, PRACTICE_CARD, PROGRESS_CARD, extraFor,
    ABSTRACT_COMPONENTS, stageOf, recipeFor, capabilitiesFor, matrixRows,
    // 阶段准入的唯一出口
    BASE_COMPONENTS, STAGE_EXTRAS, STAGE_IDS,
    stageComponents, stageLimits, stageCapabilities
  };
  if (isNode) module.exports = API;
  if (root) root.ZHIDAO_A2UI_MATRIX = API;
  // 反向注入：让 catalog.rendererCapabilities() 变成 matrix 的只读视图。
  // 循环依赖是单向的（matrix 依赖已加载完的 catalog），浏览器靠脚本顺序保证。
  if (catalog && typeof catalog.setStageProvider === 'function') {
    catalog.setStageProvider(stageCapabilities, { BASE_COMPONENTS, STAGE_EXTRAS });
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
