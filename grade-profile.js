/* 年级认知画像 · 前后端共用同一份标尺
 *
 * 为什么必须共用：生成侧按年级决定「用什么词、举什么例子、讲多深」，
 * 展示/交互侧按年级决定「一屏放几张卡、字多大、要不要语音、怎么表扬」。
 * 如果两边各用一套标准，会出现「给一年级讲函数视角，却配了满屏大按钮」的错位。
 *
 * 认知分期的依据（简化后可直接用于产品）：
 *   学前~二年级  前运算 / 具体形象：只靠看得见摸得着的东西理解，一次只能处理一个任务
 *   三~四年级    具象向半抽象过渡：能接受简单类比，开始理解规则
 *   五~六年级    初步抽象：能谈关系和结构，但仍需要具体例子托底
 *   初~高中      形式运算：能谈多解、迁移、结构；最反感被当成小孩哄
 *
 * 最容易做错的一点：青少年的激励不是「更夸张的表扬」，而是「更克制、更尊重」。
 * 给初中生发「太棒啦小宝贝」会直接让他关掉页面。所以 tone 在初中切换为 teen。
 */
'use strict';

const STAGES = [
  {
    id: 'early',
    label: '启蒙期',
    grades: ['preschool', 'grade1', 'grade2'],
    age: '3–8 岁',
    tone: 'child',
    cognition: '只靠具体事物理解；一次只能处理一个任务；需要听和看，不适合长文字',
    // 生成侧：注入到模型 system prompt 的约束
    prompt: [
      '学习者是学龄前或小学低年级儿童。请像蹲下来跟孩子说话一样讲解。',
      '只用生活中看得见、摸得着的东西举例：小猫、糖果、皮球、下雨、排队、分饼干。禁止出现抽象术语、概念定义、公式推导和价值判断。',
      '每个句子不超过 12 个字，一段最多 2 句。用「先…再…」「像…一样」这种顺序句式。',
      '每个知识点只讲「是什么」和「怎么用一次」，不要讲为什么、不要讲多种方法、不要做比较。',
      '语气温暖、具体，多用叠词和画面感，但不要说「小朋友真聪明」这类空泛夸奖。',
      '数学只描述分一分、数一数、摆一摆的过程，不要出现方程、函数、结构、视角这类词。'
    ].join(''),
    // 展示侧：一屏信息量与呈现方式
    ui: {
      density: 'sparse',        // 稀疏：卡片大、间距大
      fontSize: 1.18,           // 字号放大系数
      cardsPerScreen: 1,        // 一次只呈现 1 个主卡片
      showAdvanced: false,      // 隐藏进阶辨析 / 顶流方法
      showTabs: false,          // 隐藏多方法切换
      showFormulas: false,      // 隐藏公式块
      showChallenge: false,     // 隐藏变式挑战
      showPoems: true,          // 内容必须可见：低年级只改呈现（大字/朗读优先），不删诗句
      showWriting: true,        // 内容必须可见：低年级改为「说一句」，仍保留输入框供家长代打
      linearSteps: true,        // 线性「下一步」代替自由切换
      audioFirst: true,         // 朗读按钮优先、默认显著
      mascotIntensity: 1.15     // IP 形象动作幅度
    },
    interaction: {
      gesture: 'tap',           // 大按钮点按
      feedback: 'rich',         // 视觉+听觉+心理全开
      celebration: 'high',      // 掌握时强庆祝
      parentAssist: true,       // 提示「可以请爸爸妈妈一起读」
      autoRead: true,           // 新卡片出现时主动朗读
      stepHint: '一次只看一步'
    }
  },
  {
    id: 'primary',
    label: '基础期',
    grades: ['grade3', 'grade4'],
    age: '8–10 岁',
    tone: 'child',
    cognition: '能读一段话、能接受简单类比，开始理解「规则」，但抽象关系仍需例子托底',
    prompt: [
      '学习者是小学三、四年级学生。讲清楚、讲具体，一步一个结论。',
      '用校园、家庭、游戏、天气这类熟悉场景举例，可以用「像…一样」的类比，但每个类比都要落到具体画面。',
      '每个句子不超过 20 个字，一段最多 3 句。先说怎么做，再说为什么。',
      '允许讲两种做法的差别，但必须各配一个能直接照着做的例子。不要引入术语或符号化表达。',
      '语气轻快、鼓励尝试，多说「试试看」「再看一眼」，少下结论。',
      '数学用分步算术和画图思路，可以提到「换个算法」，但不要用函数、配方、对称性等高阶视角。'
    ].join(''),
    ui: {
      density: 'comfortable', fontSize: 1.08, cardsPerScreen: 2,
      showAdvanced: false, showTabs: true, showFormulas: true,
      showChallenge: true, showPoems: true, showWriting: true,
      linearSteps: true, audioFirst: true, mascotIntensity: 1
    },
    interaction: {
      gesture: 'tap', feedback: 'rich', celebration: 'high',
      parentAssist: false, autoRead: false, stepHint: '先做，再看答案'
    }
  },
  {
    id: 'upper',
    label: '过渡期',
    grades: ['grade5', 'grade6'],
    age: '10–12 岁',
    tone: 'child',
    cognition: '开始能谈关系和结构，喜欢「为什么」，可以接受多解比较，但需要具体例子支撑',
    prompt: [
      '学习者是小学高年级学生。可以讲清楚来龙去脉，允许比较不同做法。',
      '举例兼顾生活场景与学科场景，可以引入简单的关系说明（「因为…所以…」），但每个抽象说法后面紧跟一个具体例子。',
      '句子可以稍长，但一段不超过 4 句。先给结论，再给依据，最后给一个可以自己验证的小练习。',
      '可以讲同一问题的不同解法并说明各自适合什么时候用，但不要使用中学以上的专业术语。',
      '语气平等、像同伴随手讲题，不要哄、不要夸张表扬。'
    ].join(''),
    ui: {
      density: 'balanced', fontSize: 1, cardsPerScreen: 3,
      showAdvanced: true, showTabs: true, showFormulas: true,
      showChallenge: true, showPoems: true, showWriting: true,
      linearSteps: false, audioFirst: false, mascotIntensity: 0.9
    },
    interaction: {
      gesture: 'tap', feedback: 'moderate', celebration: 'medium',
      parentAssist: false, autoRead: false, stepHint: '先看思路，再动手'
    }
  },
  {
    id: 'teen',
    label: '青少年期',
    grades: ['grade7', 'grade8', 'grade9'],
    age: '12–15 岁',
    tone: 'teen',
    cognition: '能进行抽象推理和多解迁移；自我意识强，在意被尊重，厌恶幼稚化和被评判',
    prompt: [
      '学习者是初中生。请按中学课堂的严谨程度讲解，术语准确、逻辑完整。',
      '可以讲结构、函数、几何视角、词源和语体差别，允许引入学科术语，但每个术语首次出现时用一句话说明。',
      '先给问题结构，再给多种路径，最后说明各路径的适用条件和可迁移到哪类题。',
      '语气克制、平等、就事论事。禁止使用叠词、儿化语、「小朋友」「宝贝」「太棒啦」等低龄化表达，禁止空泛夸奖和励志口号。',
      '不要替学习者下「你应该」的判断，用「可以这样看」「这里的区别是」陈述事实。'
    ].join(''),
    ui: {
      density: 'dense', fontSize: 0.96, cardsPerScreen: 4,
      showAdvanced: true, showTabs: true, showFormulas: true,
      showChallenge: true, showPoems: true, showWriting: true,
      linearSteps: false, audioFirst: false, mascotIntensity: 0.7
    },
    interaction: {
      gesture: 'click', feedback: 'subtle', celebration: 'low',
      parentAssist: false, autoRead: false, stepHint: '自己先想，再看解析'
    }
  },
  {
    id: 'senior',
    label: '成熟期',
    grades: ['senior1', 'senior2', 'senior3'],
    age: '15–18 岁',
    tone: 'teen',
    cognition: '完整抽象能力，追求效率和准确性，把界面当工具而非陪伴',
    prompt: [
      '学习者是高中生。请按高考学科标准讲解，定义准确、条件完整、结论可验证。',
      '优先给结构化解法、通用模型和易错边界，明确指出常见误解与适用条件。',
      '表达紧凑，信息密度高，不要铺陈铺垫，不要复述题干，不要鼓励性语句。',
      '语气专业、中立，只陈述学科内容。'
    ].join(''),
    ui: {
      density: 'dense', fontSize: 0.94, cardsPerScreen: 4,
      showAdvanced: true, showTabs: true, showFormulas: true,
      showChallenge: true, showPoems: true, showWriting: true,
      linearSteps: false, audioFirst: false, mascotIntensity: 0.55
    },
    interaction: {
      gesture: 'click', feedback: 'minimal', celebration: 'none',
      parentAssist: false, autoRead: false, stepHint: '先看结构，再核对细节'
    }
  }
];

const DEFAULT_STAGE = 'upper';

/* ---------------- 栏目操作提示 · 一份文案两处使用 ----------------
 * text / title / button / placeholder  → 给孩子和家长看的界面文本；
 * rule                                → 注入模型提示词，约束生成的诗文与练习任务本身。
 *
 * 为什么要单独一层：上一版靠 CSS 隐藏内容来做「减负」，结果诗句听得到、看不到，
 * 「试着写一句」连输入框都没有。真正的年龄适配不是删掉内容，而是换一种做法：
 *   启蒙期   不会写字 → 说一句、跟着读一句，不设字数门槛
 *   基础期   刚能成句 → 写一句带画面的话
 *   过渡期   能谈理由 → 仿写并写出动作/神情/环境
 *   青少年期 反感幼稚 → 迁移仿写 + 说明手法，语气克制、不哄不夸
 *   成熟期   追求效率 → 自检结构与语体
 * minLength 是「算完成」的最短字数，随认知能力递增，避免低年级被 16 字门槛卡住。
 */
const GENERIC_HINTS = {
  poems: {
    text: '点朗读听一遍，再自己读一遍。',
    rule: '诗句短小、朗朗上口，出处真实准确'
  },
  writing: {
    title: '试着写一句',
    text: '选一个素材，写一句有画面的话。',
    button: '看看写得怎样',
    placeholder: '把你的理解写成一句具体、有画面的话……',
    minLength: 16,
    rule: '一道可独立完成的仿写任务'
  }
};

const HINTS = {
  early: {
    poems: {
      text: '点右边的小喇叭，听一句，跟着读一句。',
      rule: '每句不超过 10 个字，只用常见字，选朗朗上口的短句，不要长篇古文或生僻字'
    },
    writing: {
      title: '说一句',
      text: '不用写字：选一个词，说一句话给爸爸妈妈听，说完点「我说好啦」。',
      button: '我说好啦',
      placeholder: '想说的话，也可以请爸爸妈妈帮你打在这里……',
      minLength: 1,
      rule: '改写成口头表达任务，用「说一句话」而不是「写一段」，不要求使用任何修辞术语或字数'
    }
  },
  primary: {
    poems: {
      text: '先点朗读听一遍，再挑一句最喜欢的读给自己听。',
      rule: '选五言、七言这类短句，出处用书名或作者名，不要出现生僻典故'
    },
    writing: {
      title: '试着写一句',
      text: '选一个词，写一句有动作或画面的话，写完点「看看写得怎样」。',
      button: '看看写得怎样',
      placeholder: '比如：他笑得眼睛弯成了小月牙……',
      minLength: 12,
      rule: '要求写一句完整的话，提示加入动作或看得见的画面，不要讲术语'
    }
  },
  upper: {
    poems: {
      text: '读一读，想想诗人用了哪个词让画面动起来。',
      rule: '可选含动作或意象的名句，出处准确，适合讨论用词，但不要求做手法分析'
    },
    writing: {
      title: '试着写一句',
      text: '选一个素材仿写一句，试着把动作、神情或环境写进去。',
      button: '看看写得怎样',
      placeholder: '把你的理解写成一句具体、有画面的话……',
      minLength: 16,
      rule: '仿写任务，提示写出动作、神情或环境细节，可要求说明为什么这样写'
    }
  },
  teen: {
    poems: {
      text: '对照诗句的表达手法，标出你认为是关键的一处。',
      rule: '选真实名句并保留出处，可从意象、句法或语体角度切入，不要只做字词翻译'
    },
    writing: {
      title: '迁移仿写',
      text: '仿写一句，并说明沿用了哪种表达手法、为什么适用。',
      button: '提交并自检',
      placeholder: '先写仿写句，再补一句手法说明……',
      minLength: 20,
      rule: '要求一次迁移仿写并说明所用手法及适用条件，不要鼓励性语句'
    }
  },
  senior: {
    poems: {
      text: '从意象、句法或语体角度核对这句的表达效果。',
      rule: '选可分析结构或语体的名句，出处准确，避免浅层赏析套话'
    },
    writing: {
      title: '迁移仿写',
      text: '完成一次迁移仿写，并自检是否保留原句的结构与语体特征。',
      button: '提交并自检',
      placeholder: '仿写句 + 结构与语体自检……',
      minLength: 20,
      rule: '要求结构化迁移仿写与易错边界自检，表述紧凑、中立'
    }
  }
};

/** 取某年级某栏目的操作提示；未填年级走中性档，不做幼态化假设。 */
function hintForGrade(grade, key) {
  const key2 = String(key || '').trim();
  const table = String(grade || '').trim() ? (HINTS[stageForGrade(grade).id] || GENERIC_HINTS) : GENERIC_HINTS;
  return table[key2] || GENERIC_HINTS[key2] || null;
}

/** 生成侧字段级约束：让「诗文与名句 / 试着写一句」的内容本身也符合年级。 */
function lessonFieldPrompt(grade, subject) {
  if (subject !== 'chinese' || !String(grade || '').trim()) return '';
  const poems = hintForGrade(grade, 'poems');
  const writing = hintForGrade(grade, 'writing');
  return `\n【语文栏目年级适配】poems 的 text：${poems.rule}；practicePrompt：${writing.rule}。`;
}

/* 账号里的真实年级 id → 首页只读「虚拟阶段」。
 * 一年级是一阶，二年级是二阶，一路到九年级九阶；高中接在后面。
 * 学前和未知年级不编造阶段。课程请求仍使用原来的 grade id，不用这串文案。 */
const VIRTUAL_STAGES = {
  grade1: '一阶',
  grade2: '二阶',
  grade3: '三阶',
  grade4: '四阶',
  grade5: '五阶',
  grade6: '六阶',
  grade7: '七阶',
  grade8: '八阶',
  grade9: '九阶',
  senior1: '十阶',
  senior2: '十一阶',
  senior3: '十二阶'
};

function virtualStageForGrade(grade) {
  const key = String(grade || '').trim();
  if (!key || key === 'preschool') return null;
  return VIRTUAL_STAGES[key] || null;
}

/** 课程与界面画像只用登录学生账号上的年级，不读首页手动选择。 */
function accountGrade(session) {
  const user = session && session.user;
  if (!user || user.role !== 'student') return '';
  return String(user.grade || '').trim();
}

/** 年级 → 认知阶段。未知/未填年级时取一个中性档，不做幼态化假设。 */
function stageForGrade(grade) {
  const key = String(grade || '').trim();
  if (!key) return STAGES.find(stage => stage.id === DEFAULT_STAGE);
  return STAGES.find(stage => stage.grades.includes(key)) || STAGES.find(stage => stage.id === DEFAULT_STAGE);
}

/** 给模型提示词用的年级约束片段。 */
function promptForGrade(grade) {
  return stageForGrade(grade).prompt;
}

/** 给前端 UI 用的画像（只含必要字段，避免把提示词整段发到浏览器也无所谓，但保持干净）。 */
function uiProfileForGrade(grade) {
  const stage = stageForGrade(grade);
  return {
    id: stage.id,
    label: stage.label,
    age: stage.age,
    tone: stage.tone,
    grades: stage.grades,
    cognition: stage.cognition,
    ui: stage.ui,
    interaction: stage.interaction,
    hints: { poems: hintForGrade(grade, 'poems'), writing: hintForGrade(grade, 'writing') }
  };
}

/** 全部阶段摘要，供接口/文档使用。 */
function stageSummary() {
  return STAGES.map(stage => ({
    id: stage.id, label: stage.label, age: stage.age,
    grades: stage.grades, tone: stage.tone, cognition: stage.cognition
  }));
}

const API = {
  STAGES, DEFAULT_STAGE, HINTS, GENERIC_HINTS, VIRTUAL_STAGES,
  stageForGrade, promptForGrade, uiProfileForGrade,
  hintForGrade, lessonFieldPrompt, stageSummary,
  virtualStageForGrade, accountGrade
};

if (typeof window !== 'undefined') window.ZHIDAO_GRADE = API;
if (typeof module !== 'undefined' && module.exports) module.exports = API;
