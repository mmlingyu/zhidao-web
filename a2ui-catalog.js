/* A2UI 协议契约层 · 前后端共用（UMD，零依赖）
 *
 * 定位：把散落在 models.js / dynamic.js / knowledge.css 里的三套隐性约定，
 * 收敛成一份可协商、可校验、可流式传输的组件协议。这里只定义「什么合法」，
 * 不负责生成，也不负责渲染。
 *
 * 严格遵守 A2UI v1.0 消息名：createSurface / updateComponents /
 * updateDataModel / deleteSurface。旧名 surfaceUpdate / dataModelUpdate /
 * beginRendering 一律拒绝（CopilotKit 样例与不少博客仍在用旧名，照抄会写出解析不了的 renderer）。
 */
'use strict';

(function (root) {
  const isNode = typeof module !== 'undefined' && !!module.exports;
  const gradeProfile = isNode ? require('./grade-profile') : (root && root.ZHIDAO_GRADE) || null;

  const VERSION = '1.0';
  const CATALOG_ID = 'urn:zhidao:catalog:knowledge:v1';

  const MESSAGE_TYPES = [
    'createSurface', 'updateComponents', 'updateDataModel', 'deleteSurface',
    'callRendererFunction', 'agentFunctionResponse'
  ];
  const AGENT_MESSAGES = new Set(MESSAGE_TYPES);
  const LEGACY_MESSAGES = {
    surfaceUpdate: 'updateComponents',
    dataModelUpdate: 'updateDataModel',
    beginRendering: 'createSurface'
  };

  /* ---------------- 组件目录 ----------------
   * props 是属性白名单：组件实例上出现白名单之外的键会被 validateMessage 拒绝，
   * 这是「模型输出永不解释为 HTML/JS」的第一道闸门。
   * kind=container 的组件可以引用其它组件 id；其余为叶子或复合组件。
   */
  /* 同批组件共用一份 props 白名单：门槛要求的「共用数据契约」在协议层也成立。 */
  const P4B_PROPS = ['title', 'note', 'mode', 'slots', 'bank', 'placed', 'answer',
    'selected', 'checked', 'history', 'feedback', 'tone', 'feedbackId',
    'pickAction', 'placeAction', 'undoAction', 'resetAction', 'checkAction',
    'readAction', 'className'];
  const P4C_BRANCH_PROPS = ['title', 'note', 'reward', 'feedback', 'tone', 'feedbackId',
    'scene', 'choices', 'picked', 'outcome', 'chooseAction', 'readAction', 'askAction', 'className'];
  const P4C_OPEN_PROPS = ['title', 'note', 'reward', 'feedback', 'tone', 'feedbackId',
    'lines', 'active', 'created', 'reading', 'readAction', 'stopAction',
    'createAction', 'nextAction', 'className'];
  const P4D_PROPS = ['title', 'note', 'mode', 'question', 'options', 'answer',
    'units', 'shapes', 'rounds', 'allowTimer', 'index', 'total', 'picked', 'solved',
    'feedback', 'tone', 'feedbackId', 'pickAction', 'stepAction', 'readAction',
    'unitAction', 'className'];

  const COMPONENTS = {
    // Basic catalog 子集（A2UI 标准）
    Column: { kind: 'container', props: ['className', 'children', 'gap'] },
    Card: { kind: 'container', props: ['className', 'children'] },
    Row: { kind: 'container', props: ['className', 'children'] },
    List: { kind: 'container', props: ['className', 'children', 'emptyText', 'itemComponent'] },
    Text: { props: ['text', 'tag', 'className'] },
    Button: { props: ['label', 'icon', 'className', 'id', 'action', 'disabled'] },
    TextField: { props: ['placeholder', 'value', 'bind', 'className', 'id'] },

    // 自定义知识组件（按认知动作分类，而不是按页面区块分类）
    CardHeading: { props: ['number', 'title', 'subtitle', 'action', 'trailingIcon', 'className'] },
    HintBar: { props: ['text', 'className'] },
    PoemLine: { props: ['text', 'source', 'tag', 'speakAction', 'className'] },
    SpeakButton: { props: ['text', 'label', 'icon', 'className', 'action'] },
    WritingPad: {
      props: ['task', 'words', 'wordsPath', 'placeholder', 'button', 'minLength', 'value', 'feedback',
        'tone', 'footerNote', 'activeWord', 'inputId', 'feedbackId', 'buttonId',
        'chipAction', 'submitAction', 'inputBind', 'className']
    },
    WordChips: { props: ['items', 'active', 'action', 'className', 'wordsPath'] },
    Feedback: { props: ['text', 'tone', 'className', 'id'] },
    EmptyState: { props: ['text', 'className'] },

    // 知识卡 / 练习 / 进度类组件（P2 全部实现渲染器）
    // props 是属性白名单：validateMessage 会拒绝实例上的任何额外键，
    // 因此新增渲染能力时必须同步扩这里，否则编译器产物会被协议层拒绝。
    IdiomCard: { props: ['word', 'pinyin', 'meaning', 'example', 'scene', 'tag', 'level', 'className', 'action'] },
    // 学科组件矩阵的练习/强化/迁移层组件
    ChoiceQuiz: { props: ['question', 'options', 'answer', 'explanation', 'note', 'feedback', 'tone',
      'feedbackId', 'action', 'className', 'optionsPath'] },
    StepReveal: { props: ['steps', 'current', 'button', 'action', 'className', 'hint', 'stepsPath', 'currentPath'] },
    FormulaBlock: { props: ['formula', 'highlight', 'note', 'className'] },
    WordCard: { props: ['word', 'phonetic', 'examples', 'tip', 'className', 'action'] },
    PictureChoice: { props: ['options', 'answer', 'question', 'note', 'feedback', 'tone',
      'feedbackId', 'action', 'className'] },
    MatchPairs: { props: ['pairs', 'hint', 'matched', 'feedback', 'tone', 'feedbackId', 'action', 'className'] },
    NumberLine: { props: ['min', 'max', 'marks', 'highlight', 'note', 'label', 'className'] },
    MasteryRing: { props: ['mastery', 'status', 'point', 'label', 'className'] },
    Tabs: { props: ['tabs', 'active', 'note', 'action', 'className'] },
    MethodNote: { props: ['text', 'placeholder', 'title', 'noteBind', 'noteValue', 'inputId', 'className'] },

    /* P3 · 游戏化关卡 / 语音引导 / IP 求助组件
     * 参考设计稿：深紫主练习区 + 缺数填空 + 候选块 + Reset/Submit/「我不会」，
     * 右侧 IP 求助卡与快捷提问，左下语音控制条。所有文案都按年级画像由编译器给出，
     * 模型只提供题目与知识点，永远不提供 HTML / CSS / 组件名。 */
    NumberGaps: { props: ['title', 'question', 'slots', 'gaps', 'bank', 'answer', 'hint',
      'feedback', 'tone', 'buttons', 'className', 'slotsPath', 'gapsPath', 'bankPath',
      'feedbackId', 'askAction', 'clearAction', 'resetLabel', 'submitLabel', 'askLabel'] },
    QuestHUD: { props: ['level', 'progress', 'stars', 'combo', 'label', 'note', 'className'] },
    VoiceGuide: { props: ['text', 'guideText', 'label', 'hint', 'autoRead', 'muted', 'className',
      'playAction', 'guideAction', 'muteAction'] },
    AskIP: { props: ['name', 'status', 'line', 'badge', 'callLabel', 'chatLabel', 'className',
      'callAction', 'chatAction', 'compact'] },
    QuickQuestions: { props: ['title', 'questions', 'note', 'activeId', 'className',
      'questionAction', 'feedback', 'tone'] },
    HintLadder: { props: ['title', 'steps', 'unlocked', 'note', 'button', 'className',
      'revealAction', 'voiceAction', 'feedback', 'tone'] },

    /* P4a · 选择器型游戏组件（问题类型 → 具体交互）。
     * 全部「一眼能判对错」，数据由 a2ui-p4a.js 从本课真实字段派生；
     * props 里的 state 相关字段都走 @path 绑定，组件不自持状态。 */
    PoemChain: { props: ['title', 'note', 'couplets', 'current', 'index', 'total', 'solved',
      'feedback', 'tone', 'feedbackId', 'pickAction', 'nextAction', 'readAction', 'className'] },
    ImageryBoard: { props: ['title', 'note', 'line', 'imagery', 'answer', 'picked',
      'feedback', 'tone', 'feedbackId', 'pickAction', 'readAction', 'className'] },
    StoryOrder: { props: ['title', 'note', 'events', 'order', 'checked', 'hint',
      'feedback', 'tone', 'feedbackId', 'moveAction', 'checkAction', 'readAction', 'className'] },
    LookAlike: { props: ['title', 'note', 'current', 'index', 'total', 'picked',
      'feedback', 'tone', 'feedbackId', 'pickAction', 'nextAction', 'className'] },
    RhetoricMatch: { props: ['title', 'note', 'pairs', 'left', 'matched',
      'feedback', 'tone', 'feedbackId', 'pairAction', 'readAction', 'className'] },
    GrammarDoctor: { props: ['title', 'note', 'sentence', 'error', 'fixes', 'answer',
      'explanation', 'picked', 'fixed', 'showWhy', 'feedback', 'tone', 'feedbackId',
      'pickAction', 'readAction', 'whyAction', 'className'] },

    /* P4b · 拼装型：6 个组件共用同一份 /assembly/* 数据契约与 props。 */
    PoemTiles: { props: P4B_PROPS }, RadicalTiles: { props: P4B_PROPS },
    SentenceBlocks: { props: P4B_PROPS }, LetterTiles: { props: P4B_PROPS },
    ColumnArithmetic: { props: P4B_PROPS }, BalanceScale: { props: P4B_PROPS },

    /* P4c · 语音与开放产出：分支选择型 / 朗读跟写型两套 props。 */
    StoryBranch: { props: P4C_BRANCH_PROPS }, TenseTimeline: { props: P4C_BRANCH_PROPS },
    RoleVoice: { props: P4C_OPEN_PROPS }, StrokeOrder: { props: P4C_OPEN_PROPS },

    /* P4d · 图形与情境：三个组件共用一份图形/数量契约，模型只给数字与文本。 */
    SpeedRound: { props: P4D_PROPS }, UnitStrip: { props: P4D_PROPS },
    ShapeSplit: { props: P4D_PROPS }
  };

  /** P2 新增的 8 个组件：供能力协商、文档与回归测试共用，避免清单散落。 */
  const P2_COMPONENTS = ['IdiomCard', 'WordCard', 'PictureChoice', 'MatchPairs',
    'NumberLine', 'MasteryRing', 'Tabs', 'MethodNote'];

  /** P3 游戏化与 IP 求助组件。所有年级都开放：认知差异由文案 / 主题 / 组件组合体现，
   * 不用「按年龄禁用」来减负（上一版 display:none 把诗句藏没了的教训）。 */
  const P3_COMPONENTS = ['NumberGaps', 'QuestHUD', 'VoiceGuide', 'AskIP',
    'QuickQuestions', 'HintLadder'];

  /** P4a 选择器型游戏组件。与 P3 一样所有年级都开放：年级只换文案密度与口气，
   * 不用「按年龄禁用」来减负（display:none 把诗句藏没了的教训）。
   * 是否出现由「用户提问命中题型 + 本课有足够真实数据」共同决定，见 a2ui-p4a.js。 */
  const P4A_COMPONENTS = ['PoemChain', 'ImageryBoard', 'StoryOrder',
    'LookAlike', 'RhetoricMatch', 'GrammarDoctor'];
  const P4B_COMPONENTS = ['PoemTiles', 'RadicalTiles', 'SentenceBlocks',
    'LetterTiles', 'ColumnArithmetic', 'BalanceScale'];
  const P4C_COMPONENTS = ['StoryBranch', 'RoleVoice', 'StrokeOrder', 'TenseTimeline'];
  const P4D_COMPONENTS = ['SpeedRound', 'UnitStrip', 'ShapeSplit'];
  /** 19 个游戏组件的总清单，供能力协商、文档与回归测试共用。 */
  const GAME_COMPONENTS = [...P4A_COMPONENTS, ...P4B_COMPONENTS,
    ...P4C_COMPONENTS, ...P4D_COMPONENTS];

  /** 组件降级表：能力协商时被禁用的组件改用等价的允许组件，而不是「藏起来」。 */
  const FALLBACKS = {
    Tabs: 'Column', MethodNote: 'Text', MasteryRing: 'Text', PictureChoice: 'WordChips',
    ChoiceQuiz: 'WritingPad', StepReveal: 'Column', FormulaBlock: 'Text',
    WordCard: 'PoemLine', IdiomCard: 'WordChips', MatchPairs: 'WritingPad',
    NumberLine: 'WritingPad', Card: 'Column', Row: 'Column', List: 'Column',
    // 内容型组件降级为纯文本，保证能力裁剪后知识仍然可见，而不是「生成了却藏起来」。
    PoemLine: 'Text', SpeakButton: 'Text', HintBar: 'Text', CardHeading: 'Text',
    WordChips: 'Text', Feedback: 'Text', EmptyState: 'Text',
    // 游戏化组件被外部能力裁剪时，仍保留题目与可操作入口，绝不整体消失。
    NumberGaps: 'WritingPad', QuestHUD: 'Text', VoiceGuide: 'SpeakButton',
    AskIP: 'HintBar', QuickQuestions: 'WordChips', HintLadder: 'HintBar',
    // P4a：画不出游戏卡时退回等价的「选择 / 配对」组件，题目与答案都不丢。
    PoemChain: 'ChoiceQuiz', ImageryBoard: 'PictureChoice', StoryOrder: 'MatchPairs',
    LookAlike: 'ChoiceQuiz', RhetoricMatch: 'MatchPairs', GrammarDoctor: 'ChoiceQuiz',
    // P4b–P4d：降级链与 docs/A2UI-COMPONENT-ROADMAP.md 的规格表逐项一致。
    PoemTiles: 'WordChips', RadicalTiles: 'WordChips', SentenceBlocks: 'WritingPad',
    LetterTiles: 'WritingPad', ColumnArithmetic: 'NumberGaps', BalanceScale: 'NumberLine',
    StoryBranch: 'QuickQuestions', RoleVoice: 'SpeakButton', StrokeOrder: 'HintLadder',
    TenseTimeline: 'NumberLine', SpeedRound: 'ChoiceQuiz', UnitStrip: 'StepReveal',
    ShapeSplit: 'PictureChoice'
  };

  /**
   * 阶段准入（「这个年级允许出现哪些组件」）的唯一事实来源是 a2ui-matrix.js。
   * catalog 只回答「协议是否合法 / 本端是否实现得出来」，不再自己判年级，
   * 否则 STAGE_EXTRAS 与矩阵配方会形成两套口径（曾把配方要求的组件误判为
   * 渲染器画不出来）。matrix 加载后通过 setStageProvider() 注入计算函数与表数据；
   * 未注入时（只加载 catalog 的独立页面）退化为「全部已实现组件」，绝不误降级。
   */
  let stageProvider = null;
  let stageTables = null;
  function setStageProvider(fn, tables) {
    if (typeof fn === 'function') stageProvider = fn;
    if (tables && typeof tables === 'object') stageTables = tables;
  }
  function ensureStageProvider() {
    if (stageProvider) return stageProvider;
    // 惰性加载打破 catalog ↔ matrix 的循环依赖：Node 下 catalog 已导出完整 API，
    // matrix require 它时拿到的是成品；浏览器下靠 index.html 的脚本顺序注入。
    if (isNode) {
      try { require('./a2ui-matrix'); } catch { /* 独立使用，落到安全默认 */ }
    }
    return stageProvider;
  }

  /** 纯实现能力：与年级/学科无关，只回答「本端画得出什么」。 */
  function implementationCapabilities() {
    return {
      catalogId: CATALOG_ID,
      version: VERSION,
      implemented: Object.keys(COMPONENTS),
      maxComponents: 48,
      textMaxLength: 60
    };
  }

  /** ipIntent：让知知做出「思考 / 说话 / 开心」等意图，并同步说一句引导语；
   * 只接受固定意图名，不接受模型给出的 CSS / HTML / 代码。 */
  const RENDERER_FUNCTIONS = ['speak', 'celebrate', 'recordEvidence', 'openPoint', 'ipIntent'];
  const ACTION_EVENTS = ['answer', 'write', 'readPoem', 'readAll', 'selectWord', 'nextStep',
    'switchGrade', 'flipCard', 'selectPair', 'switchTab',
    'fillGap', 'clearGap', 'resetGaps', 'submitGaps', 'askIP',
    'readGuide', 'askQuestion', 'revealHint',
    // P4a 选择器型游戏组件（清单与 a2ui-p4a.js 的 GAME_ACTIONS 有回归断言）。
    'pickLine', 'nextCouplet', 'readLine', 'pickImage', 'readSentence',
    'moveEvent', 'checkOrder', 'readEvent', 'pickChar', 'nextPair',
    'pairDevice', 'pickFix', 'readFixed', 'askWhy',
    // P4b 装配内核 / P4c 开放产出 / P4d 图形情境
    'pickTile', 'placeTile', 'undoAssembly', 'resetAssembly', 'checkAssembly', 'readAssembly',
    'chooseBranch', 'readScene', 'askBranch', 'readVoice', 'stopVoice',
    'markCreated', 'nextLine', 'traceStroke',
    'pickGraphic', 'nextRound', 'readGraphic', 'showUnits'];

  /** 组件 id / surfaceId 遵循 UAX #31：不允许连字符、空格、数字开头。 */
  const ID_PATTERN = /^[\p{XID_Start}_][\p{XID_Continue}]*$/u;
  const isValidId = value => typeof value === 'string' && ID_PATTERN.test(value);

  /**
   * 能力宣告（兼容 API）：components 是 matrix 阶段准入表的只读视图，
   * implemented 才是「本端画得出」的实现能力。能力协商一律用 implemented，
   * 拿阶段准入去协商会把配方要求的组件误判为画不出来（英语启蒙期曾降级成 WritingPad）。
   * 未挂载 matrix 时返回全实现组件，保证单独 require catalog 的脚本不会误裁知识。
   */
  function rendererCapabilities(grade) {
    const stage = gradeProfile && gradeProfile.stageForGrade
      ? gradeProfile.stageForGrade(grade).id : 'generic';
    const provider = ensureStageProvider();
    const caps = provider ? provider(grade) : null;
    if (caps && Array.isArray(caps.components)) {
      return {
        ...caps,
        stage: caps.stage || stage,
        catalogId: CATALOG_ID,
        implemented: Object.keys(COMPONENTS),
        version: VERSION,
        delegated: true
      };
    }
    return {
      ...implementationCapabilities(),
      stage,
      components: Object.keys(COMPONENTS),
      delegated: false
    };
  }

  function componentAllowed(name, capabilities) {
    if (!capabilities || !Array.isArray(capabilities.components)) return true;
    return capabilities.components.includes(name);
  }

  function fallbackFor(name, capabilities) {
    let current = name;
    const seen = new Set([current]);
    while (!componentAllowed(current, capabilities)) {
      const next = FALLBACKS[current];
      if (!next || seen.has(next)) return null;
      seen.add(next);
      current = next;
    }
    return current;
  }

  function validateComponents(components, capabilities, errors, label) {
    if (!Array.isArray(components)) {
      errors.push(`${label}: components 必须是数组`);
      return;
    }
    const ids = new Set();
    components.forEach((item, index) => {
      const at = `${label}[${index}]`;
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        errors.push(`${at}: 组件实例必须是对象`);
        return;
      }
      if (!isValidId(item.id)) errors.push(`${at}: id "${item.id}" 不符合 UAX #31`);
      if (ids.has(item.id)) errors.push(`${at}: id "${item.id}" 重复`);
      ids.add(item.id);
      if (!COMPONENTS[item.component]) errors.push(`${at}: 未知组件 "${item.component}"`);
      else if (!componentAllowed(item.component, capabilities)) {
        errors.push(`${at}: 组件 "${item.component}" 不在本年级能力白名单内`);
      }
      if (COMPONENTS[item.component]) {
        const allowed = new Set(['id', 'component', ...COMPONENTS[item.component].props]);
        for (const key of Object.keys(item)) {
          if (!allowed.has(key)) errors.push(`${at}: 属性 "${key}" 不在 ${item.component} 的 schema 内`);
        }
      }
    });
    return ids;
  }

  /**
   * 校验一条 Agent → Renderer 消息。
   * 返回 { ok, errors, type }。渲染器必须先用它过闸，再消费消息。
   */
  function validateMessage(message, capabilities) {
    const errors = [];
    if (!message || typeof message !== 'object' || Array.isArray(message)) {
      return { ok: false, errors: ['消息必须是对象'], type: null };
    }
    if (message.version !== undefined && message.version !== VERSION) {
      errors.push(`协议版本 ${message.version} 不受支持（需要 ${VERSION}）`);
    }
    const keys = Object.keys(message).filter(key => key !== 'version');
    if (keys.length !== 1) errors.push(`消息必须恰好一个消息键，实际 ${keys.length} 个：${keys.join(',')}`);
    const type = keys[0];
    if (type && LEGACY_MESSAGES[type]) {
      errors.push(`使用了 A2UI 旧版消息名 "${type}"，v1.0 应为 "${LEGACY_MESSAGES[type]}"`);
    }
    if (type && !AGENT_MESSAGES.has(type)) errors.push(`未知消息类型 "${type}"`);

    const body = type ? message[type] : null;
    if (type === 'createSurface') {
      if (!body || typeof body !== 'object') errors.push('createSurface 缺少内容');
      else {
        if (!isValidId(body.surfaceId)) errors.push(`surfaceId "${body.surfaceId}" 不符合 UAX #31`);
        if (body.catalogId !== CATALOG_ID) errors.push(`catalogId 应为 ${CATALOG_ID}`);
        const ids = validateComponents(body.components, capabilities, errors, 'createSurface.components');
        if (ids && !ids.has('root')) errors.push('createSurface.components 必须包含 id="root" 的组件');
      }
    }
    if (type === 'updateComponents') {
      if (!body || typeof body !== 'object') errors.push('updateComponents 缺少内容');
      else {
        if (!isValidId(body.surfaceId)) errors.push(`surfaceId "${body.surfaceId}" 不符合 UAX #31`);
        validateComponents(body.components, capabilities, errors, 'updateComponents.components');
      }
    }
    if (type === 'updateDataModel') {
      if (!body || typeof body !== 'object') errors.push('updateDataModel 缺少内容');
      else {
        if (typeof body.path !== 'string' || !body.path.startsWith('/')) {
          errors.push('updateDataModel.path 必须是 JSON Pointer（以 / 开头）');
        }
        if (!('value' in body)) errors.push('updateDataModel 缺少 value');
      }
    }
    if (type === 'deleteSurface' && (!body || !isValidId(body.surfaceId))) {
      errors.push('deleteSurface 需要合法的 surfaceId');
    }
    if (type === 'callRendererFunction') {
      if (!body || !RENDERER_FUNCTIONS.includes(body.name)) {
        errors.push(`callRendererFunction 只允许：${RENDERER_FUNCTIONS.join(', ')}`);
      }
    }
    return { ok: errors.length === 0, errors, type };
  }

  /** RFC 6901 JSON Pointer：支持 ~0 / ~1 转义。 */
  function pointerGet(model, pointer) {
    if (!pointer) return undefined;
    const parts = String(pointer).split('/').slice(1).map(part => part.replace(/~1/g, '/').replace(/~0/g, '~'));
    let node = model;
    for (const part of parts) {
      if (node === null || node === undefined || typeof node !== 'object') return undefined;
      node = node[part];
    }
    return node;
  }

  function pointerSet(model, pointer, value) {
    const parts = String(pointer || '').split('/').slice(1).map(part => part.replace(/~1/g, '/').replace(/~0/g, '~'));
    if (!parts.length) return model;
    let node = model;
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts[i];
      if (!node[key] || typeof node[key] !== 'object') node[key] = {};
      node = node[key];
    }
    if (value === null) delete node[parts[parts.length - 1]];
    else node[parts[parts.length - 1]] = value;
    return model;
  }

  /**
   * 解析 A2UI 动态绑定。
   *   {"@path":"/lesson/poems"}   → 数据模型取值
   *   {"@path":"text"}            → 列表模板内相对当前项
   *   {"@call":"@index"}          → 列表下标
   *   "@@literal"                 → 字面量 "@literal"（普通数据里的 @ 前缀要转义）
   */
  function resolveValue(value, model, locals = {}) {
    if (!value || typeof value !== 'object') {
      if (typeof value === 'string' && value.startsWith('@@')) return value.slice(1);
      return value;
    }
    if (Array.isArray(value)) return value.map(item => resolveValue(item, model, locals));
    if ('@path' in value) {
      const pointer = String(value['@path'] || '');
      const absolute = pointer.startsWith('/') ? pointer : `${locals.base || ''}/${pointer}`;
      return pointerGet(model, absolute);
    }
    if ('@call' in value) {
      if (value['@call'] === '@index') return locals.index;
      return undefined; // 其它函数调用只在 action 上下文里解释，避免渲染期执行
    }
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = key === 'action' || key.endsWith('Action') ? value[key] : resolveValue(item, model, locals);
    }
    return out;
  }

  const API = {
    VERSION, CATALOG_ID, COMPONENTS, FALLBACKS,
    P2_COMPONENTS, P3_COMPONENTS, P4A_COMPONENTS, P4B_COMPONENTS,
    P4C_COMPONENTS, P4D_COMPONENTS, GAME_COMPONENTS,
    MESSAGE_TYPES, AGENT_MESSAGES, LEGACY_MESSAGES, RENDERER_FUNCTIONS, ACTION_EVENTS,
    ID_PATTERN, isValidId, rendererCapabilities, implementationCapabilities,
    setStageProvider, componentAllowed, fallbackFor,
    validateMessage, validateComponents, pointerGet, pointerSet, resolveValue,
    stageSource: 'a2ui-matrix.js'
  };

  // 兼容旧调用方：准入表数据现在只有一份（matrix），这里仅暴露只读视图。
  Object.defineProperties(API, {
    BASE_COMPONENTS: {
      enumerable: true,
      get() { ensureStageProvider(); return stageTables ? stageTables.BASE_COMPONENTS.slice() : Object.keys(COMPONENTS); }
    },
    STAGE_EXTRAS: {
      enumerable: true,
      get() { ensureStageProvider(); return stageTables ? stageTables.STAGE_EXTRAS : {}; }
    }
  });

  if (isNode) module.exports = API;
  if (root) root.ZHIDAO_A2UI_CATALOG = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
