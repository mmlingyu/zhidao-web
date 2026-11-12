/* 知识交互组件总览 · 问题类型 ↔ 配方 ↔ 组件（UMD，零依赖）
 *
 * 定位：这是「什么样的用户问什么样的问题，会看到什么样的 A2UI」的单一事实来源。
 * 文档 docs/A2UI-COMPONENT-ROADMAP.md 与可视化页 cache/shots/a2ui-roadmap.html
 * 都从本文件生成，后续新增组件时先在这里登记，再按 CHECKLIST 实现。
 *
 * 边界（务必遵守）：
 *  1. 这里只做「建议与描述」，不参与 /api/tutor 的实际编译，不改变任何现有渲染结果。
 *  2. modelFields 一律是知识内容字段；模型永远不给组件名、样式、动作、年级。
 *  3. 新组件在 catalog 里登记完成前，status 只能是 'designed'；实现后改 'implemented'。
 */
'use strict';

(function (root) {
  const isNode = typeof module !== 'undefined' && !!module.exports;
  const VERSION = '1.0';
  const MAP_ID = 'urn:zhidao:question-map:v1';

  function catalog() {
    if (isNode) {
      try { return require('./a2ui-catalog'); } catch { return null; }
    }
    return (root && root.ZHIDAO_A2UI_CATALOG) || null;
  }

  /* ---------------- 一、认知阶段与学习过程（与 matrix / grade-profile 对齐） ---------------- */

  const STAGES = [
    { id: 'early', label: '启蒙期', grades: '学前 / 1–2 年级', age: '3–8 岁', ui: '一次一件事 · 大按钮 · 听读优先 · 高庆祝' },
    { id: 'primary', label: '基础期', grades: '3–4 年级', age: '8–10 岁', ui: '可读一段话 · 允许简单规则 · 分步与配对' },
    { id: 'upper', label: '进阶期', grades: '5–6 年级', age: '10–12 岁', ui: '允许多步推理 · 变式与对照 · 庆祝收敛' },
    { id: 'teen', label: '青少年期', grades: '初中', age: '12–15 岁', ui: '浅色克制 · 要求写依据 · 不出现幼态奖励' },
    { id: 'senior', label: '高中期', grades: '高中', age: '15–18 岁', ui: '高密度信息 · 符号推导 · 无游戏化外壳' }
  ];

  const PHASES = [
    { id: 'learn', label: '初识 / 学习', goal: '看见、听懂、能复述', ui: '展示与朗读为主，游戏不打扰' },
    { id: 'practice', label: '练习', goal: '独立做一次', ui: '可交互、可判对错、给即时反馈' },
    { id: 'reinforce', label: '强化 / 巩固', goal: '隔一段时间还能做对', ui: '变式重现、间隔回忆、提示分级' },
    { id: 'transfer', label: '迁移 / 应用', goal: '换个情境仍会用', ui: '开放产出、不设唯一答案、写依据' }
  ];

  /* ---------------- 二、问题域 ---------------- */

  const DOMAINS = {
    poetry: { label: '诗词与名句', subject: 'chinese', color: '#7c5cd6', verb: '读 · 品 · 补' },
    story: { label: '故事与课文', subject: 'chinese', color: '#c2608c', verb: '听 · 排 · 想' },
    hanzi: { label: '汉字与字形', subject: 'chinese', color: '#d08a3c', verb: '拆 · 写 · 辨' },
    reading: { label: '阅读与表达', subject: 'chinese', color: '#8b6fc0', verb: '比 · 仿 · 用' },
    grammar: { label: '英语语法', subject: 'english', color: '#3f8fb0', verb: '摆 · 选 · 改' },
    vocab: { label: '词汇与听说', subject: 'english', color: '#3aa08a', verb: '听 · 拼 · 配' },
    calc: { label: '计算与等式', subject: 'math', color: '#d2574f', verb: '算 · 衡 · 验' },
    apply: { label: '应用与图形', subject: 'math', color: '#5b7fd0', verb: '摆 · 画 · 推' }
  };

  /* ---------------- 三、19 个待实现游戏组件规格 ----------------
   * modelFields：模型只给这些知识内容字段（缺字段时编译器走通用降级，绝不编造知识点）
   * derived：编译器确定性派生（乱序、路径、按钮文案、年级口气）
   * actions：组件发出的 action 名，一律走 updateDataModel，不允许组件自持状态
   * evidence：回写知识卡片的证据类型，必须落在 knowledge.js 的 EVIDENCE_TYPES 里
   * fallback：画不出来时降级到的「已实现」组件
   */
  const COMPONENT_SPECS = [
    // —— 诗词 ——
    {
      name: 'PoemTiles', label: '诗句拼图', domain: 'poetry', kind: 'assembly', batch: 'P4b', status: 'implemented',
      summary: '把一句诗拆成词块，点选放回原位；低龄一次只补一个空。',
      modelFields: ['lines: 诗句数组', 'distractors?: 干扰词块'],
      derived: ['乱序后的 tiles（按固定种子，不用随机，保证答案可复现）', '空格数、当前焦点、已用词块'],
      actions: ['placeTile', 'undoTile', 'checkPoem'],
      evidence: 'correct', fallback: 'WordChips', reuse: ['PoemLine', 'WordChips', 'SpeakButton', 'Feedback'],
      gradeNotes: { young: '一次只亮一个空，词块 ≤ 4', senior: '整句重排，要求写出排序依据' },
      risk: '中：需要新的 /poem/* 数据路径与撤销栈'
    },
    {
      name: 'PoemChain', label: '诗句接龙', domain: 'poetry', kind: 'selector', batch: 'P4a', status: 'implemented',
      summary: '给上句选下句 / 给下句补上句，答对后自动接下一联。',
      modelFields: ['couplets: [{upper, lower, source?}]', 'options?: 备选项'],
      derived: ['按阶段裁剪选项数（低龄 2 / 初中 4）', '接龙进度与已答联数'],
      actions: ['pickLine', 'nextCouplet', 'readLine'],
      evidence: 'correct', fallback: 'ChoiceQuiz', reuse: ['ChoiceQuiz', 'PoemLine', 'SpeakButton', 'QuestHUD'],
      gradeNotes: { young: '两选项 + 朗读跟读', senior: '四选项 + 出处与意象注释' },
      risk: '低：复用 ChoiceQuiz 骨架，只换数据形状'
    },
    {
      name: 'ImageryBoard', label: '意境配画', domain: 'poetry', kind: 'selector', batch: 'P4a', status: 'implemented',
      summary: '给诗句选对应的画面 / 意象标签，把抽象的文字变成可指认的具体事物。',
      modelFields: ['lines: 诗句数组', 'imagery: [{label, line, note?}]'],
      derived: ['画面卡片顺序', '配对结果', '朗读文案'],
      actions: ['pickImage', 'readLine'],
      evidence: 'correct', fallback: 'PictureChoice', reuse: ['PictureChoice', 'PoemLine', 'SpeakButton'],
      gradeNotes: { young: '用具体名词（月亮 / 小船 / 霜），不出抽象词', senior: '意象 + 情感基调对照' },
      risk: '低：不引入新交互范式'
    },
    // —— 故事 ——
    {
      name: 'StoryOrder', label: '情节排序', domain: 'story', kind: 'assembly', batch: 'P4a', status: 'implemented',
      summary: '把打乱的情节卡拖回正确顺序，理解「先发生什么、再发生什么」。',
      modelFields: ['events: [{id, text}]', 'correctOrder: id 数组'],
      derived: ['乱序事件列表', '当前顺序', '逐位对错'],
      actions: ['moveEvent', 'checkOrder', 'readEvent'],
      evidence: 'correct', fallback: 'MatchPairs', reuse: ['MatchPairs', 'WordChips', 'Feedback', 'HintLadder'],
      gradeNotes: { young: '3 张卡、只用「先 / 再 / 最后」', senior: '5–6 张卡 + 因果连线与依据' },
      risk: '低：排序结果仍是可判定的唯一答案'
    },
    {
      name: 'StoryBranch', label: '故事分支', domain: 'story', kind: 'stateful', batch: 'P4c', status: 'implemented',
      summary: '「如果你是主人公，你会怎么做」——分支选择没有标准答案，只给后果与追问。',
      modelFields: ['scene: 情境', 'choices: [{id, text, consequence, why}]', 'reflection?: 收束提问'],
      derived: ['当前分支路径', '已选后果', '追问列表'],
      actions: ['chooseBranch', 'askWhy', 'readScene'],
      evidence: 'created', fallback: 'QuickQuestions', reuse: ['QuickQuestions', 'AskIP', 'VoiceGuide', 'Feedback'],
      gradeNotes: { young: '两个大按钮 + 知知复述后果', senior: '四选项 + 写出选择依据' },
      risk: '中：开放题不能判对错，证据只能记 created / asked'
    },
    {
      name: 'RoleVoice', label: '角色朗读', domain: 'story', kind: 'voice', batch: 'P4c', status: 'implemented',
      summary: '分角色点读对话，朗读时同步驱动知知口型与角色高亮。',
      modelFields: ['roles: 角色名数组', 'lines: [{role, text}]'],
      derived: ['当前行、朗读按钮文案、口型时长'],
      actions: ['readLine', 'nextLine', 'replayLine'],
      evidence: 'recited', fallback: 'SpeakButton', reuse: ['SpeakButton', 'PoemLine', 'VoiceGuide'],
      gradeNotes: { young: '自动连读 + 大按钮', senior: '手动逐行 + 可关语音' },
      risk: '中：复用 speakText，但要处理连续朗读的中断与口型复位'
    },
    // —— 汉字 ——
    {
      name: 'RadicalTiles', label: '部件拼字', domain: 'hanzi', kind: 'assembly', batch: 'P4b', status: 'implemented',
      summary: '把偏旁部件拼成一个字，理解合体字的结构。',
      modelFields: ['char: 目标字', 'parts: [{part, label?}]', 'distractors?: 干扰部件'],
      derived: ['部件池、结构提示（左右 / 上下）、组合结果'],
      actions: ['combineParts', 'clearParts', 'checkChar'],
      evidence: 'correct', fallback: 'WordChips', reuse: ['WordChips', 'IdiomCard', 'Feedback'],
      gradeNotes: { young: '2 个部件、给结构图', senior: '3 个部件 + 形旁声旁说明' },
      risk: '中：部件文本要按字渲染，不能当普通词块截断'
    },
    {
      name: 'StrokeOrder', label: '笔顺跟写', domain: 'hanzi', kind: 'voice', batch: 'P4c', status: 'implemented',
      summary: '按笔顺逐笔点亮，跟读笔画名；低龄只认顺序，高龄判断错序。',
      modelFields: ['char: 目标字', 'strokes: 笔画名数组', 'total?: 笔画数'],
      derived: ['当前笔序、已点亮笔画、错误位置'],
      actions: ['nextStroke', 'resetStroke', 'readStroke'],
      evidence: 'created', fallback: 'HintLadder', reuse: ['HintLadder', 'VoiceGuide', 'Feedback'],
      gradeNotes: { young: '只跟读、不判错', senior: '给出错序提示并要求订正' },
      risk: '中：不画真实笔迹，用笔画名 + 序号，避免引入字体 / SVG 依赖'
    },
    {
      name: 'LookAlike', label: '形近字辨析', domain: 'hanzi', kind: 'selector', batch: 'P4a', status: 'implemented',
      summary: '在句子里选对形近字（「己 / 已 / 巳」），用语境而不是字形记忆。',
      modelFields: ['pairs: [{a, b, context, answer, why?}]'],
      derived: ['选项顺序、空格位置、逐题反馈'],
      actions: ['pickChar', 'nextPair'],
      evidence: 'correct', fallback: 'ChoiceQuiz', reuse: ['ChoiceQuiz', 'WordCard', 'Feedback'],
      gradeNotes: { young: '一次一组，配图提示', senior: '一次四组 + 释义辨析' },
      risk: '低'
    },
    // —— 阅读与表达 ——
    {
      name: 'RhetoricMatch', label: '手法配对', domain: 'reading', kind: 'selector', batch: 'P4a', status: 'implemented',
      summary: '把句子与它用的修辞 / 表达手法连起来，从「认得出」走到「说得出为什么」。',
      modelFields: ['pairs: [{sentence, device, why?}]'],
      derived: ['左右两列、已配对集合、反馈文案'],
      actions: ['selectPair', 'readSentence'],
      evidence: 'correct', fallback: 'MatchPairs', reuse: ['MatchPairs', 'PoemLine', 'MethodNote'],
      gradeNotes: { young: '只配 3 组常见手法（比喻 / 拟人 / 反复）', senior: '6 组 + 写出判断依据' },
      risk: '低：与已有 MatchPairs 同构'
    },
    // —— 英语语法 ——
    {
      name: 'TenseTimeline', label: '时态轴', domain: 'grammar', kind: 'diagram', batch: 'P4c', status: 'implemented',
      summary: '把句子放到「过去—现在—将来」的时间轴上，让时态变成看得见的位置。',
      modelFields: ['sentences: [{text, time, marker?}]', 'axis?: 时间点标签'],
      derived: ['时间轴刻度、句子卡位置、错位提示'],
      actions: ['placeOnAxis', 'checkAxis', 'readSentence'],
      evidence: 'correct', fallback: 'NumberLine', reuse: ['NumberLine', 'WordCard', 'Feedback'],
      gradeNotes: { young: '三段轴 + 大按钮，只出现 now / before / later', senior: '五段轴 + 时间状语与时态名称' },
      risk: '中：复用 NumberLine 但要换成语义刻度，别把时间当数字做运算'
    },
    {
      name: 'SentenceBlocks', label: '句子积木', domain: 'grammar', kind: 'assembly', batch: 'P4b', status: 'implemented',
      summary: '把打乱的单词块摆成正确语序，提交后生成自己的句子。',
      modelFields: ['tokens: 词块数组', 'answer: 正确语序', 'pattern?: 句型标签', 'distractors?: 多余词块'],
      derived: ['乱序词块、当前句子、句型提示'],
      actions: ['appendToken', 'removeToken', 'checkSentence', 'readSentence'],
      evidence: 'created', fallback: 'WritingPad', reuse: ['WritingPad', 'WordChips', 'SpeakButton', 'Feedback'],
      gradeNotes: { young: '3–4 块、只组 SVO', senior: '含从句 / 状语，要求说明语序理由' },
      risk: '中：语序可能有多种合法解，answer 必须允许同义答案数组'
    },
    {
      name: 'GrammarDoctor', label: '语法小医生', domain: 'grammar', kind: 'selector', batch: 'P4a', status: 'implemented',
      summary: '给一个病句挑错并选改法，错误处高亮、改完朗读正确句子。',
      modelFields: ['sentence: 原句', 'error: 错误片段', 'fixes: 候选改法', 'answer: 正确改法', 'explanation: 解释'],
      derived: ['高亮片段、选项、订正后整句'],
      actions: ['pickFix', 'readFixed', 'askWhy'],
      evidence: 'correct', fallback: 'ChoiceQuiz', reuse: ['ChoiceQuiz', 'WordCard', 'SpeakButton', 'AskIP'],
      gradeNotes: { young: '只判「对 / 不对」两选项，不出现语法术语', senior: '四选项 + 展示术语解释' },
      risk: '低'
    },
    // —— 词汇与听说 ——
    {
      name: 'LetterTiles', label: '字母拼词', domain: 'vocab', kind: 'assembly', batch: 'P4b', status: 'implemented',
      summary: '听发音，把字母块拼成单词，拼完自动朗读一遍。',
      modelFields: ['word: 目标词', 'letters: 字母数组', 'phonics?: 拼读提示'],
      derived: ['乱序字母池、当前拼写、拼读分段'],
      actions: ['appendLetter', 'removeLetter', 'checkWord', 'readWord'],
      evidence: 'correct', fallback: 'WritingPad', reuse: ['WordCard', 'WritingPad', 'SpeakButton'],
      gradeNotes: { young: '按音节分块，不逐字母', senior: '逐字母 + 词根提示' },
      risk: '中：与 RadicalTiles 共用一个「拼装台」内核更划算'
    },
    // —— 计算 ——
    {
      name: 'ColumnArithmetic', label: '竖式填空', domain: 'calc', kind: 'assembly', batch: 'P4b', status: 'implemented',
      summary: '按位填竖式（含进位 / 退位），每一步都能单独检查。',
      modelFields: ['operandA', 'operandB', 'operator', 'columns: 逐位答案', 'carry?: 进位'],
      derived: ['对齐的数位、每格路径、逐位对错、进位提示'],
      actions: ['fillColumn', 'checkSum', 'clearColumn'],
      evidence: 'correct', fallback: 'NumberGaps', reuse: ['NumberGaps', 'StepReveal', 'HintLadder', 'Feedback'],
      gradeNotes: { young: '只做不进位加法，格子放大', senior: '多位数乘除 + 进位标注' },
      risk: '中：数位对齐是纯 CSS，不能让模型生成 HTML'
    },
    {
      name: 'BalanceScale', label: '天平等式', domain: 'calc', kind: 'diagram', batch: 'P4b', status: 'implemented',
      summary: '往天平两边放砝码，直观理解「等号两边一样重」。',
      modelFields: ['left: 已知量', 'right: 已知量', 'unknown: 待求量', 'equation?'],
      derived: ['左右托盘、平衡状态、差额提示'],
      actions: ['placeWeight', 'checkBalance', 'askHint'],
      evidence: 'correct', fallback: 'NumberLine', reuse: ['NumberLine', 'PictureChoice', 'AskIP'],
      gradeNotes: { young: '只用整数颗糖果，不出现未知数符号', senior: '过渡到含 x 的等式' },
      risk: '中：低龄用图形、高龄用符号，是同一组件两套文案'
    },
    {
      name: 'SpeedRound', label: '口算闯关', domain: 'calc', kind: 'stateful', batch: 'P4d', status: 'implemented',
      summary: '连续几道口算组成一关，连对点亮星星；低龄不算时间。',
      modelFields: ['items: [{question, answer}]', 'hint?: 关卡提示'],
      derived: ['当前题号、连对数、星星数、关卡结算'],
      actions: ['answerRound', 'nextRound', 'askHint'],
      evidence: 'correct', fallback: 'ChoiceQuiz', reuse: ['ChoiceQuiz', 'QuestHUD', 'NumberGaps', 'AskIP'],
      gradeNotes: { young: '禁真实倒计时，只显示「第几关」与星星', senior: '可选计时，但错误不扣分、不排名' },
      risk: '高：时间压力对儿童不友好，必须先过年级规则评审'
    },
    // —— 应用与图形 ——
    {
      name: 'UnitStrip', label: '数量关系条', domain: 'apply', kind: 'diagram', batch: 'P4d', status: 'implemented',
      summary: '把应用题画成线段图，先看清「谁多谁少」再列式。',
      modelFields: ['quantities: [{label, value?}]', 'relation: 关系描述', 'question: 求什么'],
      derived: ['条带比例、未知段、列式入口'],
      actions: ['fillQuantity', 'checkRelation', 'showSteps'],
      evidence: 'correct', fallback: 'StepReveal', reuse: ['StepReveal', 'NumberLine', 'MethodNote'],
      gradeNotes: { young: '实物图 + 数一数，不出现线段', senior: '标准线段图 + 方程入口' },
      risk: '高：比例条需要绘制，且模型给的数值可能不齐'
    },
    {
      name: 'ShapeSplit', label: '图形切一切', domain: 'apply', kind: 'diagram', batch: 'P4d', status: 'implemented',
      summary: '在图形上选一条切割线 / 拼块，验证等分与面积。',
      modelFields: ['shape: 图形描述', 'pieces: 切块描述', 'target: 目标（如等分）'],
      derived: ['切块编号、选择结果、验证文案'],
      actions: ['pickCut', 'checkSplit', 'askHint'],
      evidence: 'correct', fallback: 'PictureChoice', reuse: ['PictureChoice', 'NumberLine', 'HintLadder'],
      gradeNotes: { young: '只用圆 / 方，点选二选一', senior: '多块拼接 + 面积守恒说明' },
      risk: '高：先做「文字描述 + 选块」，不引入 SVG 绘制'
    }
  ];

  /* ---------------- 四、用户问题类型 → UI（核心映射表） ---------------- */

  const QUESTION_TYPES = [
    {
      id: 'poem.complete', label: '补全 / 接龙 / 排序诗句', domain: 'poetry', subject: 'chinese',
      signals: ['下一句', '上一句', '上句', '下句', '补全', '接龙', '默写', '填空', '排列', '顺序', '排成'],
      examples: ['「床前明月光」的下一句是什么？', '把这几句诗排成正确的顺序'],
      phases: ['learn', 'practice', 'reinforce'], primary: 'PoemChain', support: ['PoemTiles', 'ImageryBoard'], batch: 'P4a'
    },
    {
      id: 'poem.assemble', label: '把打乱的诗句拼回原样', domain: 'poetry', subject: 'chinese',
      signals: ['拼', '碎片', '打乱', '复原', '排回', '拼图'],
      strong: ['拼图', '碎片', '打乱', '排回原样'],
      examples: ['把这几句诗碎片拼回原样', '这首诗被打乱了，帮我复原'],
      phases: ['practice', 'reinforce'], primary: 'PoemTiles',
      support: ['PoemChain', 'PoemLine'], batch: 'P4b'
    },
    {
      id: 'poem.imagery', label: '这首诗写了什么画面 / 意境', domain: 'poetry', subject: 'chinese',
      signals: ['意境', '画面', '写了什么', '想象', '描绘了', '描写', '意象', '什么季节', '这首诗'],
      examples: ['「孤舟蓑笠翁」写的是什么画面？', '这首诗描写的是春天还是秋天？'],
      phases: ['learn', 'practice'], primary: 'ImageryBoard', support: ['PoemLine', 'SpeakButton'], batch: 'P4a'
    },
    {
      id: 'story.sequence', label: '故事的先后顺序 / 情节梳理', domain: 'story', subject: 'chinese',
      signals: ['先', '然后', '接着', '最后', '顺序', '情节', '发生了什么', '复述'],
      examples: ['这个故事先发生了什么？', '帮我把课文的情节排个顺序'],
      phases: ['practice', 'reinforce'], primary: 'StoryOrder', support: ['RoleVoice'], batch: 'P4a'
    },
    {
      id: 'story.choice', label: '如果你是主人公 / 故事告诉我们什么', domain: 'story', subject: 'chinese',
      signals: ['如果你是', '你会怎么', '告诉我们', '道理', '为什么这么', '换成', '结局'],
      examples: ['如果你是小明，你会怎么做？', '这个故事告诉我们什么道理？'],
      phases: ['practice', 'transfer'], primary: 'StoryBranch', support: ['QuickQuestions', 'AskIP'], batch: 'P4c'
    },
    {
      id: 'story.dialogue', label: '分角色读 / 这段对话怎么读', domain: 'story', subject: 'chinese',
      signals: ['分角色', '朗读', '对话', '读一读', '语气'],
      examples: ['帮我把这段对话分角色读一遍', '这句话该用什么语气读？'],
      phases: ['learn', 'practice'], primary: 'RoleVoice', support: ['SpeakButton'], batch: 'P4c'
    },
    {
      id: 'hanzi.structure', label: '这个字怎么写 / 什么偏旁', domain: 'hanzi', subject: 'chinese',
      signals: ['偏旁', '部首', '怎么写', '笔顺', '几笔', '组成', '结构', '拆开', '加一笔', '一笔'],
      examples: ['「清」是什么偏旁？', '「日」加一笔能变成什么字？'],
      phases: ['learn', 'practice'], primary: 'RadicalTiles', support: ['StrokeOrder'], batch: 'P4b'
    },
    {
      id: 'hanzi.stroke', label: '笔顺跟写 / 一笔一笔写', domain: 'hanzi', subject: 'chinese',
      signals: ['笔顺', '一笔一笔', '跟写', '笔画顺序', '第几笔'],
      strong: ['笔顺', '一笔一笔', '跟写', '笔画顺序'],
      examples: ['这个字的笔顺是怎样？', '带我一笔一笔写这个字'],
      phases: ['learn', 'practice'], primary: 'StrokeOrder',
      support: ['RadicalTiles', 'HintLadder'], batch: 'P4c'
    },
    {
      id: 'hanzi.lookalike', label: '形近字 / 同音字怎么区分', domain: 'hanzi', subject: 'chinese',
      signals: ['形近', '长得像', '区分', '同音', '选哪个字', '用哪个', '还是'],
      examples: ['「己」和「已」怎么区分？', '这里该填「在」还是「再」？'],
      phases: ['practice', 'reinforce'], primary: 'LookAlike', support: ['IdiomCard'], batch: 'P4a'
    },
    {
      id: 'reading.device', label: '这句话用了什么修辞 / 手法', domain: 'reading', subject: 'chinese',
      signals: ['修辞', '比喻', '拟人', '手法', '表达方法', '这样写', '好处', '为什么这样'],
      examples: ['「月亮像小船」用了什么修辞？', '作者为什么这样写？'],
      phases: ['practice', 'transfer'], primary: 'RhetoricMatch', support: ['MethodNote'], batch: 'P4a'
    },
    {
      id: 'grammar.tense', label: '时态 / 时间状语怎么选', domain: 'grammar', subject: 'english',
      signals: ['时态', '过去式', '现在完成', '将来', 'yesterday', 'tomorrow', '动词形式'],
      examples: ['yesterday 后面动词要用什么形式？', '现在完成时和一般过去时有什么区别？'],
      phases: ['learn', 'practice', 'reinforce'], primary: 'TenseTimeline', support: ['GrammarDoctor'], batch: 'P4c'
    },
    {
      id: 'grammar.order', label: '语序 / 连词成句', domain: 'grammar', subject: 'english',
      signals: ['语序', '连词成句', '排顺序', '怎么说', '造句', '句子结构', '连成', '一句话', '顺序'],
      strong: ['连词成句', '造句', '语序', '这个顺序'],
      examples: ['用这几个词连成一句话', '「I like apples」为什么是这个顺序？'],
      phases: ['practice', 'transfer'], primary: 'SentenceBlocks', support: ['LetterTiles'], batch: 'P4b'
    },
    {
      id: 'grammar.fix', label: '改错 / 这句话对吗', domain: 'grammar', subject: 'english',
      signals: ['改错', '对吗', '哪里错', '病句', 'correct', '语法错误', '为什么错'],
      examples: ['He go to school 哪里错了？', '这句话的语法对吗？'],
      phases: ['practice', 'reinforce'], primary: 'GrammarDoctor', support: ['AskIP', 'HintLadder'], batch: 'P4a'
    },
    {
      id: 'vocab.spell', label: '单词怎么拼 / 听音写词', domain: 'vocab', subject: 'english',
      signals: ['怎么拼', '拼写', '字母', '听写', 'spell', '读音', '拼出来', '听发音', '单词拼'],
      examples: ['apple 怎么拼？', '听发音把单词拼出来'],
      phases: ['practice', 'reinforce'], primary: 'LetterTiles', support: ['WordCard', 'SpeakButton'], batch: 'P4b'
    },
    {
      id: 'calc.arithmetic', label: '算一算 / 竖式怎么列', domain: 'calc', subject: 'math',
      signals: ['等于', '加', '减', '乘', '除', '竖式', '计算', '进位', '退位', '算一算'],
      numeric: true,
      examples: ['27 + 45 等于多少？', '这道乘法竖式怎么列？'],
      phases: ['practice', 'reinforce'], primary: 'ColumnArithmetic', support: ['NumberGaps', 'HintLadder'], batch: 'P4b'
    },
    {
      id: 'calc.equation', label: '等式 / 天平 / 填未知数', domain: 'calc', subject: 'math',
      signals: ['等式', '两边', '平衡', '未知数', '填几', '解方程'],
      numeric: true,
      examples: ['3 + □ = 8，方框里填几？', '天平两边一样重，问号是几？'],
      phases: ['learn', 'practice', 'reinforce'], primary: 'BalanceScale', support: ['NumberGaps'], batch: 'P4b'
    },
    {
      id: 'calc.drill', label: '出几道口算练一练', domain: 'calc', subject: 'math',
      signals: ['练一练', '出几道', '口算', '闯关', '再来一题', '速算', '一组题'],
      strong: ['口算', '闯关', '练一练', '再来一题', '出几道'],
      examples: ['给我出 5 道加法口算', '再来一题口算练习'],
      phases: ['reinforce'], primary: 'SpeedRound', support: ['QuestHUD', 'ChoiceQuiz'], batch: 'P4d'
    },
    {
      id: 'calc.pattern', label: '找规律 / 数列填空（已有能力）', domain: 'calc', subject: 'math',
      signals: ['找规律', '规律', '数列', '接下来是', '第几个'],
      numeric: true,
      examples: ['2、4、6、8，接下来是几？', '找规律填数'],
      phases: ['practice', 'reinforce'], primary: 'NumberGaps', support: ['QuestHUD', 'HintLadder'], batch: 'done',
      note: '已由 P3 的 NumberGaps + 游戏化关卡覆盖，触发条件见 §17.4'
    },
    {
      id: 'apply.wordproblem', label: '应用题 / 谁多谁少', domain: 'apply', subject: 'math',
      signals: ['应用题', '一共', '还剩', '多多少', '少多少', '每人', '平均', '买了'],
      numeric: true,
      examples: ['小明有 5 颗糖，小红比他多 3 颗，一共几颗？', '把 12 个苹果平均分给 3 人'],
      phases: ['learn', 'practice', 'reinforce', 'transfer'], primary: 'UnitStrip', support: ['StepReveal'], batch: 'P4d'
    },
    {
      id: 'apply.geometry', label: '图形 / 等分 / 面积', domain: 'apply', subject: 'math',
      signals: ['图形', '等分', '面积', '周长', '切', '拼', '三角形', '正方形', '几块'],
      strong: ['图形', '等分', '面积', '周长', '平均分成', '几块'],
      examples: ['把圆平均分成 4 份怎么切？', '这个图形由几块组成？'],
      phases: ['learn', 'practice', 'reinforce'], primary: 'ShapeSplit', support: ['PictureChoice'], batch: 'P4d'
    }
  ];

  /* ---------------- 五、迭代批次与硬规则 ---------------- */

  const BATCHES = [
    {
      id: 'P4a', label: '选择器型', theme: '复用既有骨架，零新交互范式', risk: '低',
      components: ['PoemChain', 'ImageryBoard', 'StoryOrder', 'LookAlike', 'RhetoricMatch', 'GrammarDoctor'],
      goal: '先补「一眼能判对错」的问题类型，把覆盖率从 3 域抬到 6 域。',
      gate: '每个组件：1 张效果图 + 1 条 validateMessage 断言 + 1 条真实浏览器点击断言；DOM 基线零差异。'
    },
    {
      id: 'P4b', label: '拼装型', theme: '共用一套「拼装台」内核与撤销栈', risk: '中',
      components: ['PoemTiles', 'RadicalTiles', 'SentenceBlocks', 'LetterTiles', 'ColumnArithmetic', 'BalanceScale'],
      goal: '抽象出 AssemblyTray 通用数据路径，避免 6 个组件各写一套状态机。',
      gate: '6 个组件共用同一个 /assembly/* 数据契约；乱序使用固定种子，答案可复现；撤销可回退到任意一步。'
    },
    {
      id: 'P4c', label: '语音与开放产出', theme: '接 IP 口型、开放题不判对错', risk: '中',
      components: ['StoryBranch', 'RoleVoice', 'StrokeOrder', 'TenseTimeline'],
      goal: '把「说 / 读 / 想」这类没有唯一答案的过程也变成可观察的学习证据。',
      gate: '开放题只记 created / asked，绝不写 correct；连续朗读可中断且口型复位；青少年版无幼态奖励。'
    },
    {
      id: 'P4d', label: '图形与情境', theme: '先文字选项，后绘图', risk: '高',
      components: ['SpeedRound', 'UnitStrip', 'ShapeSplit'],
      goal: '补齐应用题与几何，但坚持「不引入绘图库」。',
      gate: '图形只由组件按数据用 CSS/固定图形渲染，模型不给 SVG/HTML；低龄禁真实倒计时；错误不扣分不排名。'
    }
  ];

  const RULES = [
    '模型只产知识 JSON：组件名、样式、动作、年级、乱序结果一律由编译器确定性派生。',
    '知识不删：新游戏组件只增加交互层，原有诗文、释义、步骤正文始终可见。',
    '正确答案不裁：低龄减小的是「选项数 / 单步任务量」，不是把正确答案从数据里拿掉。',
    '空态要有真实文案：宁可写一句「先自己试一次」，也不留白或用 display:none。',
    '动作统一：所有交互走 action → updateDataModel → 重渲染，组件不自持状态，为服务端化留路。',
    '证据回写唯一出口：correct / wrong / created / asked / recited 六类，开放题绝不记 correct。',
    '年级只换皮不删组件：低龄与青少年用的是同一棵组件树，差别在密度、口气、奖励强度。',
    '降级链必须存在：每个新组件都要有指向「已实现组件」的 fallback，画不出来就降级，不出现空白格子。',
    '触发条件克制：初识不打扰、掌握度 ≥ 80 不再刷、数学之外的学科不自动弹关卡。',
    '派生数据不进课程缓存：编译结果按内容做进程内 memo，UI 版本升级不能作废付费生成。'
  ];

  const CHECKLIST = [
    '在 a2ui-question-map.js 登记：问题类型 signals / examples / primary、组件规格与批次。',
    'a2ui-catalog.js：COMPONENTS[name].props、FALLBACKS[name]、ACTION_EVENTS、把名字加进对应 P4 分组与 implemented。',
    'a2ui-render.js：写 RENDERERS[name]（纯字符串渲染 + textContent，禁止 innerHTML 拼用户内容）与 knowledge.css 样式。',
    'a2ui-compiler.js / a2ui-matrix.js：从 lesson.data 的 modelFields 派生 props，按学科 × 过程 × 年级加入配方。',
    'a2ui-bridge.js：动作映射到 updateDataModel 路径与 KNOWLEDGE.practice 证据；服务端 compileA2UIForLesson 同步纳入。',
    '测试：test-a2ui-components 出效果图、test-a2ui-server 过 validateMessage、浏览器回归加点击与年级切换断言。',
    '交付：更新本文件 status 为 implemented、刷新 docs/A2UI-COMPONENT-ROADMAP.md 与 a2ui-roadmap.html、补工作日志。'
  ];

  /* ---------------- 六、可执行的查询函数 ---------------- */

  /** 按用户问题识别题型；只做建议，识别不了返回 null，让原配方兜底。 */
  function classifyQuestion(input, subject) {
    const text = String(input == null ? '' : input).trim();
    if (!text) return null;
    const wanted = ['chinese', 'english', 'math'].includes(subject) ? subject : '';
    const scored = [];
    for (const type of QUESTION_TYPES) {
      if (wanted && type.subject !== wanted) continue;
      let score = 0;
      let literalHits = 0;
      for (const signal of type.signals) {
        if (signal && text.toLowerCase().includes(String(signal).toLowerCase())) { score += 2; literalHits++; }
      }
      // 强信号 = 题型本身的叫法（「口算」「连词成句」「平均分成」），
      // 用来压过同一句里顺带出现的学科弱信号（「加」「平均」「怎么写」）。
      for (const signal of type.strong || []) {
        if (signal && text.toLowerCase().includes(String(signal).toLowerCase())) score += 4;
      }
      // 纯数字只是弱加权，且必须有文字信号：否则「<script>alert(1)</script>」也会被当成数学题。
      if (type.numeric && literalHits > 0 && /\d/.test(text)) score += 1;
      if (score > 0) scored.push({ type, score });
    }
    scored.sort((a, b) => b.score - a.score || a.type.id.localeCompare(b.type.id));
    if (!scored.length) return null;
    const type = scored[0].type;
    return {
      id: type.id, label: type.label, domain: type.domain, subject: type.subject,
      primary: type.primary, support: type.support.slice(), phases: type.phases.slice(),
      batch: type.batch, score: scored[0].score,
      alternatives: scored.slice(1, 3).map(item => item.type.id)
    };
  }

  /** 给定题型 + 过程 + 年级，给出组件建议与年级约束（不参与实际编译）。 */
  function componentsFor(question, phase, grade) {
    const q = typeof question === 'string'
      ? QUESTION_TYPES.find(item => item.id === question) : question;
    if (!q) return null;
    const spec = COMPONENT_SPECS.find(item => item.name === q.primary);
    const inPhase = q.phases.includes(phase);
    const notes = [];
    if (!inPhase) notes.push(`「${PHASES.find(p => p.id === phase)?.label || phase}」阶段不自动弹出游戏组件，走展示型配方`);
    const stage = stageOf(grade);
    if ((stage === 'early' || stage === 'primary') && q.primary === 'SpeedRound') {
      notes.push('启蒙 / 基础期禁用真实倒计时，只显示关卡与星星');
    }
    if ((stage === 'teen' || stage === 'senior') && spec) {
      notes.push('青少年 / 高中期改用克制主题，无星星与幼态庆祝，要求写出依据');
    }
    if (q.batch === 'done') notes.push('该题型已由 P3 的 NumberGaps 覆盖，无需新组件');
    return {
      question: q.id, phase, stage, allowed: inPhase, primary: q.primary,
      support: q.support.slice(), fallback: spec?.fallback || null,
      status: spec?.status || 'implemented', batch: q.batch, notes
    };
  }

  function stageOf(grade) {
    const value = String(grade || '').trim();
    if (!value) return 'generic';
    if (['preschool', 'grade1', 'grade2'].includes(value)) return 'early';
    if (['grade3', 'grade4'].includes(value)) return 'primary';
    if (['grade5', 'grade6'].includes(value)) return 'upper';
    if (['grade7', 'grade8', 'grade9'].includes(value)) return 'teen';
    if (['grade10', 'grade11', 'grade12'].includes(value)) return 'senior';
    return 'generic';
  }

  function specFor(name) {
    return COMPONENT_SPECS.find(item => item.name === name) || null;
  }

  /** 自检：给文档生成脚本与测试用，返回所有不一致项。 */
  function audit() {
    const c = catalog();
    const issues = [];
    const implementedNames = c ? Object.keys(c.COMPONENTS) : [];
    const evidence = ['lesson', 'correct', 'wrong', 'created', 'asked', 'recited'];
    const seen = new Set();
    for (const spec of COMPONENT_SPECS) {
      if (seen.has(spec.name)) issues.push(`组件重名：${spec.name}`);
      seen.add(spec.name);
      if (c && !implementedNames.includes(spec.fallback)) issues.push(`${spec.name} 的 fallback 未实现：${spec.fallback}`);
      for (const name of spec.reuse) {
        if (c && !implementedNames.includes(name)) issues.push(`${spec.name} 复用了未实现组件：${name}`);
      }
      if (!evidence.includes(spec.evidence)) issues.push(`${spec.name} 的证据类型非法：${spec.evidence}`);
      if (!BATCHES.some(batch => batch.id === spec.batch)) issues.push(`${spec.name} 的批次不存在：${spec.batch}`);
      if (spec.status === 'implemented' && c && !implementedNames.includes(spec.name)) {
        issues.push(`${spec.name} 标为已实现，但 catalog 里没有`);
      }
      if (spec.status === 'designed' && c && implementedNames.includes(spec.name)) {
        issues.push(`${spec.name} 已在 catalog 登记，status 应改为 implemented`);
      }
    }
    const batched = BATCHES.flatMap(batch => batch.components);
    for (const name of seen) {
      if (!batched.includes(name)) issues.push(`${name} 未分配批次`);
    }
    for (const name of batched) {
      if (!seen.has(name)) issues.push(`批次引用了不存在的组件：${name}`);
    }
    for (const type of QUESTION_TYPES) {
      if (!DOMAINS[type.domain]) issues.push(`题型 ${type.id} 的问题域不存在`);
      if (type.batch !== 'done' && !seen.has(type.primary)) issues.push(`题型 ${type.id} 的主组件未登记`);
      if (!type.phases.every(phase => PHASES.some(p => p.id === phase))) issues.push(`题型 ${type.id} 的过程非法`);
    }
    return { issues, componentCount: seen.size, implementedCount: c ? implementedNames.length : null };
  }

  const API = {
    VERSION, MAP_ID, STAGES, PHASES, DOMAINS, COMPONENT_SPECS, QUESTION_TYPES,
    BATCHES, RULES, CHECKLIST, classifyQuestion, componentsFor, stageOf, specFor, audit
  };

  if (isNode) module.exports = API;
  if (root) root.ZHIDAO_A2UI_QUESTION_MAP = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
