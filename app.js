const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const icon = (name, cls = '') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;

const lessons = {
  chinese: {
    id: 'chinese', subject: '语文', query: '开心', title: '一个词，也能写出画面感',
    bannerTitle: '开心', subtitle: 'kāi xīn', label: '语文 · 词语积累',
    description: '不只说“我很开心”，试着分辨快乐的程度，把心情写得具体、有画面。'
  },
  english: {
    id: 'english', subject: '英语', query: 'play / do / go', title: '三个“活动盟主”，一次分清',
    bannerTitle: 'play · do · go', subtitle: 'ACTIVITIES', label: '英语 · 语法辨析',
    description: '都是“做”，搭配却不同。从场景出发记规则，再用练习把感觉变成判断。'
  },
  math: {
    id: 'math', subject: '数学', query: 'x² - 5x + 6 = 0', title: '同一道题，看见不同的思维',
    bannerTitle: 'x² − 5x + 6 = 0', subtitle: '一元二次方程', label: '数学 · 解题思维',
    description: '答案只是终点，思路才是路径。换个站位，看看一般人、学霸和顶流怎么解。'
  }
};

const idioms = [
  { word: '眉开眼笑', pinyin: 'méi kāi yǎn xiào', type: 'gentle', tag: '微微开心', level: 1, meaning: '眉头舒展，眼含笑意，喜悦写在脸上。', example: '听到这个好消息，奶奶眉开眼笑，眼角的皱纹都舒展开了。', scene: '适合写神情：重点落在眉眼和表情的变化。' },
  { word: '心花怒放', pinyin: 'xīn huā nù fàng', type: 'strong', tag: '非常开心', level: 2, meaning: '心里高兴得像花儿盛开，形容极其高兴。', example: '捧着期待已久的录取通知书，他心花怒放，一路小跑回家。', scene: '适合写内心：把抽象的喜悦想象成盛开的花。' },
  { word: '欣喜若狂', pinyin: 'xīn xǐ ruò kuáng', type: 'strong', tag: '喜悦顶点', level: 3, meaning: '高兴得像发狂一样，形容喜悦到了极点。', example: '终场哨响，球队逆转夺冠，球迷们欣喜若狂，相拥欢呼。', scene: '适合写高潮：情绪强烈，常伴随欢呼、跳跃等动作。' },
  { word: '喜出望外', pinyin: 'xǐ chū wàng wài', type: 'surprise', tag: '意外之喜', level: 2, meaning: '因遇到意想不到的好事而特别高兴。', example: '本以为错过末班车，却看见父亲在站台等他，他顿时喜出望外。', scene: '适合写转折：先铺垫“不抱希望”，再写惊喜出现。' }
];

const poems = [
  { text: '春风得意马蹄疾，一日看尽长安花。', source: '唐 · 孟郊《登科后》', tag: '春风得意' },
  { text: '却看妻子愁何在，漫卷诗书喜欲狂。', source: '唐 · 杜甫《闻官军收河南河北》', tag: '欣喜若狂' },
  { text: '白日放歌须纵酒，青春作伴好还乡。', source: '唐 · 杜甫《闻官军收河南河北》', tag: '畅快喜悦' }
];

const quizData = [
  { sentence: 'I often ___ swimming on weekends.', cn: '我周末经常去游泳。', answer: 'go', explain: 'swimming 是 doing 形式，表示休闲活动，所以用 go swimming。' },
  { sentence: 'I ___ my homework after dinner.', cn: '我晚饭后做作业。', answer: 'do', explain: 'homework 是一项任务，学习、工作和任务通常用 do。' },
  { sentence: 'We ___ basketball after school.', cn: '我们放学后打篮球。', answer: 'play', explain: 'basketball 是有规则、可竞争的球类运动，所以用 play。' },
  { sentence: 'She ___ tai chi every morning.', cn: '她每天早上打太极。', answer: 'do', explain: 'do tai chi 是固定搭配，个人健身活动常用 do。' },
  { sentence: 'They ___ chess in the park.', cn: '他们在公园下棋。', answer: 'play', explain: 'chess 是有规则、双方对弈的游戏，所以用 play chess。' }
];

const mathMethods = [
  {
    name: '一般人', subtitle: '扎实通法', icon: 'target', badge: '',
    title: '因式分解：把方程变成熟悉的乘积', intro: '先找通法，一步一步来。核心是逆用乘法分配律。',
    quote: '把不会的，变成会的。',
    insight: '通法是最可靠的底座。看到一元二次方程，先观察能否因式分解；不行时，再使用求根公式。',
    steps: [
      { title: '观察方程结构', text: '方程已经是一般形式，二次项系数为 1，常数项是 6。', formula: 'a = 1，b = −5，c = 6' },
      { title: '寻找两个关键的数', text: '找两个数，使它们的乘积等于 6，和等于 −5。', formula: '(−2) × (−3) = 6，(−2) + (−3) = −5' },
      { title: '写成两个一次因式', text: '把中间项拆开，原方程就能写成两个一次式的乘积。', formula: '(x − 2)(x − 3) = 0' },
      { title: '分别令因式为零', text: '乘积为零，至少有一个因式为零，于是得到两个解。', formula: 'x = 2 或 x = 3' }
    ]
  },
  {
    name: '学霸', subtitle: '关系洞察', icon: 'brain', badge: 'scholar',
    title: '韦达定理：不解方程，先看见两根', intro: '不只盯着“怎么算”，还会利用系数与根之间的关系。',
    quote: '看见关系，比急着计算更快。',
    insight: '对于 x² + bx + c = 0，两根之和为 −b，两根之积为 c。数字简单时，根与系数的关系能大幅缩短路径。',
    steps: [
      { title: '先设两个根', text: '设方程的两个根为 p、q，先不急着展开计算。', formula: 'p + q = 5，p × q = 6' },
      { title: '用系数直接列关系', text: '一次项系数是 −5，所以两根之和是 5；常数项是 6。', formula: 'p + q = −(−5) = 5' },
      { title: '用数字直觉锁定答案', text: '2 和 3 同时满足和为 5、积为 6，直接锁定两个根。', formula: '{ p，q } = { 2，3 }' },
      { title: '代回快速检验', text: '把 2、3 分别代入原方程，结果都等于 0，答案成立。', formula: '2² − 5×2 + 6 = 0；3² − 5×3 + 6 = 0' }
    ]
  },
  {
    name: '顶流', subtitle: '结构视角', icon: 'crown', badge: 'top',
    title: '函数视角：从求根走向抛物线的对称', intro: '把方程看成函数图像与 x 轴的交点，用结构理解答案。',
    quote: '方程是静态问题，函数让它动起来。',
    insight: '方程的根就是函数 y = x² − 5x + 6 的零点。配方找到对称轴后，两个根只是在轴两侧等距分布。',
    steps: [
      { title: '把左边看成一个函数', text: '求方程的解，等价于寻找抛物线与 x 轴交点的横坐标。', formula: 'y = x² − 5x + 6' },
      { title: '配方，找到对称轴', text: '将函数写成顶点式，马上看出对称轴与最低点的位置。', formula: 'y = (x − 5/2)² − 1/4' },
      { title: '令 y = 0，利用平方结构', text: '顶点到 x 轴的距离是 1/4，开平方得到横向偏移量 1/2。', formula: '(x − 5/2)² = 1/4' },
      { title: '沿对称轴向两侧走', text: '两个零点关于 x = 5/2 对称，分别向左、向右移动 1/2。', formula: 'x = 5/2 ± 1/2 = 2 或 3' }
    ]
  }
];

const state = {
  topic: 'chinese', idiomFilter: 'all', selectedIdiom: '眉开眼笑', practiceWord: '眉开眼笑',
  quizIndex: 0, quizScore: 0, quizAnswered: false, quizDone: [], showEnglishTip: false,
  mathLevel: 0, mathProgress: [2, 1, 1], challengeVisible: false,
  favorites: readStorage('zhidao-favorites', []), history: readStorage('zhidao-history', []),
  detectLocked: false, lessonView: 'preview'
};

function readStorage(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
}
function writeStorage(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Local preview may disable storage. */ }
}
function escapeHTML(value) {
  return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}
function detectSubject(value) {
  const text = value.trim().toLowerCase();
  if (!text) return { label: '自动识别学科', cls: '' };
  if (/play|do\s*\/|go\s*\/|语法|英语/.test(text) && !/[0-9²=]/.test(text)) return { label: '识别为英语', cls: 'english' };
  if (/[0-9²=]/.test(text) || /方程|函数|数学|几何|计算/.test(text)) return { label: '识别为数学', cls: 'math' };
  if (/[a-z]/i.test(text)) return { label: '识别为英语', cls: 'english' };
  return { label: '识别为语文', cls: 'chinese' };
}
function resolveLesson(value) {
  const text = value.trim().toLowerCase().replace(/\s+/g, '');
  if (!text) return null;
  if (/开心|喜悦|快乐|心情/.test(text)) return 'chinese';
  if (/play.*do.*go|do.*play.*go|三大.*盟主/.test(text)) return 'english';
  if (/x²-5x\+6=0|x\^2-5x\+6=0|一元二次|二次方程/.test(text)) return 'math';
  return 'unknown';
}

function updateDetection() {
  if (state.detectLocked) return;
  const result = detectSubject($('#topic-input').value);
  const chip = $('#detect-chip');
  chip.className = `detect-chip ${result.cls}`;
  $('span', chip).textContent = result.label;
  // 识别到学科就同步给语音模块：英语课读英文时用英语音色，语文/数学用中文音色。
  if (['chinese', 'english', 'math'].includes(result.cls)) {
    try { window.ZhidaoVoice?.setSubject?.(result.cls); } catch { /* 语音模块异常不影响输入 */ }
  }
}

function renderTopicBanner(type) {
  const lesson = lessons[type];
  let art = '';
  if (type === 'chinese') art = `<span class="art-spark">✦</span><div class="mood-face"></div><span class="mood-tag">情绪 · 喜悦</span>`;
  if (type === 'english') art = `<div class="english-art"><b>play</b><b>do</b><b>go</b></div>`;
  if (type === 'math') art = `<div class="math-art"><span>f(x)</span></div>`;
  return `<div class="topic-banner ${type}">
    <div class="topic-info"><span class="topic-label">${lesson.label}</span><div class="topic-title-row"><h3>${lesson.bannerTitle}</h3><span>${lesson.subtitle}</span></div><p>${lesson.description}</p></div>
    <div class="topic-art">${art}</div>
  </div>`;
}

function renderChinese() {
  const filtered = state.idiomFilter === 'all' ? idioms : idioms.filter(item => item.type === state.idiomFilter);
  if (!filtered.some(item => item.word === state.selectedIdiom)) state.selectedIdiom = filtered[0].word;
  const selected = idioms.find(item => item.word === state.selectedIdiom);
  $('#lesson-content').innerHTML = renderTopicBanner('chinese') + `
    <div class="lesson-body">
      <section class="content-card">
        <div class="card-heading"><div class="card-title"><span class="number">01</span><div><h4>成语百宝箱 <small>同一种开心，不同的表达</small></h4></div></div><div class="filter-pills">
          ${[['all','全部'],['gentle','微微开心'],['strong','强烈喜悦'],['surprise','意外之喜']].map(([key,label]) => `<button data-filter="${key}" class="${state.idiomFilter === key ? 'active' : ''}">${label}</button>`).join('')}
        </div></div>
        <div class="idiom-grid">${filtered.map(item => `<button class="idiom-card ${item.word === selected.word ? 'active' : ''}" data-idiom="${item.word}">
          <span class="idiom-tag">${item.tag}</span><h5>${item.word}</h5><div class="pinyin">${item.pinyin}</div><p>${item.meaning}</p>
          <div class="intensity">${[1,2,3].map(n => `<i class="${n <= item.level ? 'on' : ''}"></i>`).join('')}<span>情绪强度</span></div>
        </button>`).join('')}</div>
        <div class="idiom-detail"><span class="detail-quote">“</span><div><strong>${selected.example}</strong><p>${icon('bulb')} ${selected.scene}</p></div><button class="audio-button" data-speak="${selected.word}。${selected.example}" aria-label="朗读例句">${icon('volume')}</button></div>
      </section>
      <div class="two-column">
        <section class="content-card"><div class="card-heading"><div class="card-title"><span class="number">02</span><div><h4>诗句里的开心 <small>把古人的喜悦读进心里</small></h4></div></div><button class="text-button" data-speak="${poems.map(p => p.text).join('')}">${icon('volume')}朗读</button></div>
          <div class="poem-list">${poems.map(poem => `<article class="poem-item"><blockquote>${poem.text}</blockquote><footer><span>${poem.source}</span><span>${poem.tag}</span></footer></article>`).join('')}</div>
        </section>
        <section class="content-card practice-card"><div class="card-heading"><div class="card-title"><span class="number">03</span><div><h4>试着写一句</h4></div></div>${icon('pen')}</div>
          <p>选一个成语，把“收到礼物很开心”改写成有画面的句子。</p>
          <div class="word-chips">${idioms.map(item => `<button data-practice-word="${item.word}" class="${state.practiceWord === item.word ? 'active' : ''}">${item.word}</button>`).join('')}</div>
          <textarea class="practice-input" id="practice-input" placeholder="例如：我拆开礼物，顿时喜出望外……"></textarea>
          <div class="practice-feedback" id="practice-feedback"></div>
          <div class="practice-footer"><small>小提示：加入动作或神情，画面会更鲜活</small><button class="primary-small" id="check-writing">看看写得怎样${icon('arrow')}</button></div>
        </section>
      </div>
    </div>`;
  bindChineseEvents();
}

function bindChineseEvents() {
  $$('[data-filter]').forEach(button => button.addEventListener('click', () => { state.idiomFilter = button.dataset.filter; renderChinese(); }));
  $$('[data-idiom]').forEach(button => button.addEventListener('click', () => { state.selectedIdiom = button.dataset.idiom; state.practiceWord = button.dataset.idiom; renderChinese(); }));
  $$('[data-practice-word]').forEach(button => button.addEventListener('click', () => {
    state.practiceWord = button.dataset.practiceWord;
    $$('[data-practice-word]').forEach(item => item.classList.toggle('active', item === button));
    $('#practice-input').focus();
  }));
  $('#check-writing').addEventListener('click', checkWriting);
  bindSpeech();
}

function checkWriting() {
  const text = $('#practice-input').value.trim();
  const feedback = $('#practice-feedback');
  feedback.className = 'practice-feedback show';
  if (!text) {
    feedback.classList.add('hint'); feedback.textContent = '先写一句吧。可以从“谁，因为什么，怎样开心”开始。'; return;
  }
  const usedIdiom = idioms.find(item => text.includes(item.word));
  if (!usedIdiom) {
    feedback.classList.add('hint'); feedback.textContent = `已经有自己的表达了！再试着加入「${state.practiceWord}」，让情绪更准确。`; return;
  }
  if (text.length < 16) {
    feedback.classList.add('hint'); feedback.textContent = `用上了「${usedIdiom.word}」，很棒！再补充一个动作或神情，画面会更完整。`; return;
  }
  feedback.classList.add('good'); feedback.textContent = `写得很有画面！「${usedIdiom.word}」用得准确，动作和情绪也连起来了。已收入今日学习记录。`;
  addHistory('chinese');
}

function renderEnglish() {
  const quiz = quizData[state.quizIndex] || {};
  const quizView = (typeof ZHIDAO_QUIZ !== 'undefined') ? ZHIDAO_QUIZ.normalizeQuiz(quiz) : { sentence: quiz.sentence || '请选择更合适的表达', cn: quiz.cn || '' };
  const sentence = (typeof ZHIDAO_QUIZ !== 'undefined')
    ? ZHIDAO_QUIZ.highlightBlanks(String(quizView.sentence).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'))
    : String(quizView.sentence || '').replace('___', '<span>___</span>');
  $('#lesson-content').innerHTML = renderTopicBanner('english') + `
    <div class="mnemonic"><span class="mnemonic-label">口诀记</span><p>多人完成常用 <b>play</b>，一人完成常用 <b>do</b>，见到 <b>doing</b> 就用 <b>go</b>。</p><small>先记场景，再记规则</small></div>
    <div class="lesson-body"><section class="content-card"><div class="card-heading"><div class="card-title"><span class="number">01</span><div><h4>漫画场景学 <small>三位“活动盟主”各管什么？</small></h4></div></div></div>
      <div class="grammar-grid">
        ${grammarCard('play', '多人 & 对抗', '有规则的游戏、球类运动，以及演奏乐器。', 'play', [['play football','踢足球'],['play chess','下国际象棋'],['play the piano','弹钢琴']], '多人完成常用 play', '💡 乐器前常有 the：play the guitar')}
        ${grammarCard('do', '个人 & 任务', '学习、工作、家务，以及个人健身活动。', 'do', [['do homework','做作业'],['do push-ups','做俯卧撑'],['do tai chi','打太极拳']], '一人完成常用 do', 'do 强调“完成一件事”，不是娱乐')}
        ${grammarCard('go', '出行 & 休闲', '后面接 doing，常指离开原地进行的休闲活动。', 'go', [['go fishing','去钓鱼'],['go shopping','去购物'],['go running','去跑步']], '见到 doing 就用 go', 'go + doing 通常已经是一套固定表达')}
      </div>
    </section>
    <section class="content-card" style="margin-top:16px"><div class="card-heading"><div class="card-title"><span class="number">02</span><div><h4>你来判一判 <small>选对搭配，马上理解</small></h4></div></div><span class="section-kicker" id="quiz-score">本轮答对 ${state.quizScore} 题</span></div>
      <div class="quiz-layout"><div class="quiz-question"><span class="question-label">QUICK PRACTICE · ${state.quizIndex + 1}/${quizData.length}</span><h4>${sentence}</h4><p>${quizView.cn || quiz.cn || ''}</p></div>
      <div><div class="choice-row">${['play','do','go'].map(word => `<button class="choice-button" data-answer="${word}" ${state.quizAnswered ? 'disabled' : ''}>${word}<small>选择这个搭配</small></button>`).join('')}</div>
      <div class="quiz-feedback" id="quiz-feedback">${state.quizAnswered ? `<strong>回答正确！</strong> ${quiz.explain}` : '凭直觉先选一次，再看看场景规则。'}</div>
      <div class="quiz-meta"><div class="quiz-dots">${quizData.map((_,i) => `<i class="${state.quizDone.includes(i) ? 'done' : i === state.quizIndex ? 'active' : ''}"></i>`).join('')}</div><button class="text-button" id="quiz-next" ${state.quizAnswered ? '' : 'hidden'}>下一题${icon('arrow')}</button></div></div></div>
    </section>
    <div class="difference-strip">${icon('info')}<p><strong>为什么不是 play swimming？</strong> 因为 swimming 在这里是“去游泳”这个活动名称，而不是一场对抗游戏。</p><button id="difference-button">${state.showEnglishTip ? '收起辨析' : '再看一组区别'}</button></div>
    ${state.showEnglishTip ? `<div class="difference-strip"><span class="mnemonic-label">进阶</span><p><strong>do exercise / play a game / go jogging。</strong> 口诀帮你入门，固定搭配帮你表达地道；遇到新词时，把它们放进完整短语里记。</p></div>` : ''}
    </div>`;
  bindEnglishEvents();
  bindSpeech();
}

function grammarCard(word, title, desc, cls, examples, tip, extra) {
  const iconName = word === 'play' ? 'target' : word === 'do' ? 'check' : 'compass';
  return `<article class="grammar-card ${cls}"><div class="grammar-head"><div><div class="grammar-word">${word}</div><span>${title}</span></div><div class="scene-icon">${icon(iconName)}</div></div><p>${desc}</p><div class="example-list">${examples.map(([en,cn]) => `<button class="example-item" data-speak="${en}" style="border:0;text-align:left;width:100%"><strong>${en}</strong><span>${cn} · 点读</span></button>`).join('')}</div><div class="grammar-tip">${icon('sparkles')}<span>${tip}<br>${extra}</span></div></article>`;
}

function bindEnglishEvents() {
  $$('[data-answer]').forEach(button => button.addEventListener('click', () => answerQuiz(button)));
  $('#quiz-next').addEventListener('click', nextQuiz);
  $('#difference-button').addEventListener('click', () => { state.showEnglishTip = !state.showEnglishTip; renderEnglish(); });
}
function answerQuiz(button) {
  if (state.quizAnswered) return;
  state.quizAnswered = true;
  const answer = button.dataset.answer;
  const quiz = quizData[state.quizIndex];
  const correct = answer === quiz.answer;
  $$('[data-answer]').forEach(item => {
    item.disabled = true;
    if (item.dataset.answer === quiz.answer) item.classList.add('correct');
    if (item === button && !correct) item.classList.add('wrong');
  });
  if (correct) { state.quizScore++; if (!state.quizDone.includes(state.quizIndex)) state.quizDone.push(state.quizIndex); }
  $('#quiz-feedback').innerHTML = correct ? `<strong>选对了！</strong> ${quiz.explain}` : `<strong style="color:#b76556">再看看场景。</strong> 正确答案是 <b>${quiz.answer}</b>。${quiz.explain}`;
  $('#quiz-score').textContent = `本轮答对 ${state.quizScore} 题`;
  $('#quiz-next').hidden = false;
  addHistory('english');
}
function nextQuiz() {
  state.quizIndex = (state.quizIndex + 1) % quizData.length;
  state.quizAnswered = false;
  if (state.quizIndex === 0) { state.quizScore = 0; state.quizDone = []; }
  renderEnglish();
}

function renderMath() {
  const method = mathMethods[state.mathLevel];
  const progress = state.mathProgress[state.mathLevel];
  const visibleSteps = method.steps.slice(0, progress);
  $('#lesson-content').innerHTML = renderTopicBanner('math') + `
    <div class="lesson-body"><div class="thinking-tabs">${mathMethods.map((item,index) => `<button class="thinking-tab ${state.mathLevel === index ? 'active' : ''}" data-level="${index}">${icon(item.icon)}<span>${item.name}<small>${item.subtitle}</small></span></button>`).join('')}</div>
      <div class="math-content"><section class="content-card"><div class="solution-intro"><span class="persona-badge ${method.badge}">${icon(method.icon)}</span><div><h4>${method.title}</h4><p>${method.intro}</p></div></div>
        <div class="steps">${visibleSteps.map((step,index) => `<article class="step done"><span class="step-index">${index + 1}</span><div><h5>${step.title}</h5><p>${step.text}</p><div class="math-formula">${step.formula}</div></div></article>`).join('')}
        ${progress < method.steps.length ? `<div class="step-locked">下一步已折叠，先想一想，再继续展开</div>` : ''}</div>
        <div class="solution-footer"><small>已展开 ${progress}/${method.steps.length} 步 · ${progress === method.steps.length ? '完整思路已解锁' : '先理解，再看下一步'}</small><button class="next-step" id="next-step" ${progress === method.steps.length ? 'disabled' : ''}>${progress === method.steps.length ? `${icon('check')}思路已完成` : `展开下一步${icon('arrow')}`}</button></div>
      </section>
      <aside class="content-card insight-card"><div class="card-heading"><div class="card-title"><span class="number">悟</span><div><h4>这一层，强在哪里？</h4></div></div></div><blockquote>“${method.quote}”</blockquote><p>${method.insight}</p>
        <div class="compare-box"><span>三种思路，没有高下，只有适合</span>${mathMethods.map((item,index) => `<div class="compare-row ${index === state.mathLevel ? 'current' : ''}"><i></i>${item.name} · ${['因式分解','根与系数','函数与对称'][index]}${index === state.mathLevel ? '<b style="margin-left:auto">当前</b>' : ''}</div>`).join('')}</div>
      </aside></div>
      <div class="challenge-card"><span class="challenge-icon">${icon('sparkles')}</span><div><h5>换一道，试试你的新思路</h5><p>解方程 x² − 7x + 6 = 0。你会先找两个数，还是先画出抛物线？</p></div><span class="challenge-result" id="challenge-result">x = 1 或 x = 6<br>因为 1 + 6 = 7，1 × 6 = 6</span><button class="challenge-answer" id="challenge-answer">${state.challengeVisible ? '收起答案' : '我想好了'}</button></div>
    </div>`;
  bindMathEvents();
}
function bindMathEvents() {
  $$('[data-level]').forEach(button => button.addEventListener('click', () => { state.mathLevel = Number(button.dataset.level); renderMath(); }));
  $('#next-step').addEventListener('click', () => {
    const level = state.mathLevel;
    if (state.mathProgress[level] < mathMethods[level].steps.length) state.mathProgress[level]++;
    if (state.mathProgress[level] === mathMethods[level].steps.length) addHistory('math');
    renderMath();
  });
  $('#challenge-answer').addEventListener('click', () => {
    state.challengeVisible = !state.challengeVisible;
    $('#challenge-result').style.display = state.challengeVisible ? 'block' : 'none';
    $('#challenge-answer').textContent = state.challengeVisible ? '收起答案' : '我想好了';
    if (state.challengeVisible) addHistory('math');
  });
  if (state.challengeVisible) $('#challenge-result').style.display = 'block';
}

function renderLesson(type, shouldScroll = false) {
  state.topic = type;
  const lesson = lessons[type];
  $('#lesson-heading').textContent = lesson.title;
  $('#topic-input').value = lesson.query;
  updateDetection();
  // 课程学科与语音口径保持一致：英语课的英文朗读自动走英语音色。
  try { window.ZhidaoVoice?.setSubject?.(type); } catch { /* 语音模块异常不影响讲解 */ }
  if (type === 'chinese') renderChinese();
  if (type === 'english') renderEnglish();
  if (type === 'math') renderMath();
  updateFavoriteButton();
  if (shouldScroll) $('#lesson-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function startLesson() {
  const value = $('#topic-input').value;
  const resolved = resolveLesson(value);
  if (resolved && resolved !== 'unknown') {
    addHistory(resolved);
    renderLesson(resolved, true);
  } else if (resolved === 'unknown') {
    showUnknown(value);
  } else {
    showToast('先输入一个你想弄懂的知识点');
    $('#topic-input').focus();
  }
}

function addHistory(type) {
  state.history = state.history.filter(item => item.id !== type);
  state.history.unshift({ id: type, time: new Date().toISOString() });
  state.history = state.history.slice(0, 12);
  writeStorage('zhidao-history', state.history);
  updateGoal();
}
function toggleFavorite() {
  const exists = state.favorites.includes(state.topic);
  state.favorites = exists ? state.favorites.filter(id => id !== state.topic) : [...state.favorites, state.topic];
  writeStorage('zhidao-favorites', state.favorites);
  updateFavoriteButton();
  showToast(exists ? '已取消收藏' : '已收藏，之后可以在「我的收藏」中找到');
}
function updateFavoriteButton() {
  const active = state.favorites.includes(state.topic);
  const button = $('#favorite-button');
  button.classList.toggle('active', active);
  $('span', button).textContent = active ? '已收藏' : '收藏';
  $('#favorite-count').textContent = state.favorites.length;
}
function updateGoal() {
  const count = Math.min(3, Math.max(1, state.history.length));
  $('#goal-progress').style.width = `${count / 3 * 100}%`;
  $('#goal-text').textContent = `${count}/3`;
}

let toastTimer;
function showToast(message) {
  const toast = $('#toast');
  $('span', toast).textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

function openModal(title, kicker, content) {
  $('#modal-title').textContent = title;
  $('#modal-kicker').textContent = kicker;
  $('#modal-body').innerHTML = content;
  $('#modal-backdrop').hidden = false;
  document.body.style.overflow = 'hidden';
  $('#modal-close').focus();
}
function closeModal() {
  $('#modal-backdrop').hidden = true;
  document.body.style.overflow = '';
}
function showCollection(kind) {
  const isFavorites = kind === 'favorites';
  const list = isFavorites ? state.favorites : state.history.map(item => item.id);
  const content = list.length ? `<div class="saved-list">${list.map(id => {
    const lesson = lessons[id];
    const historyItem = state.history.find(item => item.id === id);
    const meta = isFavorites ? `${lesson.subject} · 互动讲解` : `${lesson.subject} · ${formatTime(historyItem?.time)}`;
    return `<article class="saved-item"><span class="saved-icon ${id}">${icon(id === 'chinese' ? 'book' : id === 'english' ? 'language' : 'math')}</span><div><strong>${lesson.query}</strong><small>${meta}</small></div><button data-open-lesson="${id}">继续学习</button>${isFavorites ? `<button class="delete-saved" data-delete-favorite="${id}" aria-label="删除收藏">${icon('trash')}</button>` : ''}</article>`;
  }).join('')}</div>` : `<div class="empty-state"><span class="empty-icon">${icon(isFavorites ? 'bookmark' : 'clock')}</span><h3>${isFavorites ? '还没有收藏知识点' : '学习记录还是空的'}</h3><p>${isFavorites ? '遇到喜欢的讲解，点一下“收藏”，它就会留在这里。' : '完成一次练习或分步讲解后，足迹会自动记录。'}</p><button class="primary-small" data-open-lesson="${state.topic}">继续探索${icon('arrow')}</button></div>`;
  openModal(isFavorites ? '我的收藏' : '学习记录', '我的学习', content);
  $$('[data-open-lesson]').forEach(button => button.addEventListener('click', () => { closeModal(); renderLesson(button.dataset.openLesson, true); closeSidebar(); }));
  $$('[data-delete-favorite]').forEach(button => button.addEventListener('click', () => {
    state.favorites = state.favorites.filter(id => id !== button.dataset.deleteFavorite);
    writeStorage('zhidao-favorites', state.favorites); updateFavoriteButton(); showCollection('favorites');
  }));
}
function formatTime(iso) {
  if (!iso) return '最近学习';
  const date = new Date(iso);
  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
}
function showGuide() {
  openModal('三步，开始真正理解', '使用指南', `<div class="guide-list">
    <div class="guide-item"><span class="guide-number">1</span><div><h3>输入一个具体知识点</h3><p>一个情绪词、一组易混语法，或一道数学题。输入时会自动判断学科。</p></div></div>
    <div class="guide-item"><span class="guide-number">2</span><div><h3>用不同方式拆开它</h3><p>语文看成语和诗句，英语从场景规则到练习，数学比较三种解题路径。</p></div></div>
    <div class="guide-item"><span class="guide-number">3</span><div><h3>动手一次，留下自己的理解</h3><p>写一句话、做对一道搭配题、展开一条数学思路。收藏后可以随时回来。</p></div></div></div>
    <div class="guide-examples">试试这三组：「开心」 · 「play / do / go」 · 「x² - 5x + 6 = 0」</div>`);
}
function showUnknown(value) {
  const subject = detectSubject(value);
  openModal('这个知识点，正在生长', `${subject.label} · 暂未收录`, `<div class="empty-state"><span class="empty-icon">${icon('sparkles')}</span><h3>还没有「${escapeHTML(value.trim()).slice(0,40)}」的完整讲解</h3><p>先从下面这组课程开始体验，看看知识可以怎样被拆开。</p></div><div class="saved-list">${Object.values(lessons).map(lesson => `<article class="saved-item"><span class="saved-icon ${lesson.id}">${icon(lesson.id === 'chinese' ? 'book' : lesson.id === 'english' ? 'language' : 'math')}</span><div><strong>${lesson.query}</strong><small>${lesson.label}</small></div><button data-open-lesson="${lesson.id}">开始体验</button></article>`).join('')}</div>`);
  $$('[data-open-lesson]').forEach(button => button.addEventListener('click', () => { closeModal(); addHistory(button.dataset.openLesson); renderLesson(button.dataset.openLesson, true); }));
}

/* 朗读能力抽成独立函数：A2UI 的 renderer function `speak`、[data-speak] 按钮与
 * 游戏组件的连续朗读共用同一条链路。音色选择、口型同步、语种判断、证据上报、
 * Chromium 长文本保活与「服务不可用回退」全部由 voice.js 统一处理。
 * voice.js 未加载时保留最小可用的浏览器朗读，避免单个静态资源 404 让页面哑掉。 */
function speakText(value, opts) {
  const text = String(value || '');
  const options = opts || {};
  const done = () => { if (typeof options.onDone === 'function') options.onDone(); };
  if (!text.trim()) { done(); return false; }
  const voice = window.ZhidaoVoice;
  if (voice && typeof voice.speak === 'function') {
    const pending = voice.speak(text, options);
    pending.catch(() => {}).finally(done);
    return pending;
  }
  if (!('speechSynthesis' in window)) { showToast('当前浏览器暂不支持朗读'); done(); return false; }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  // 依据朗读文本本身判断语种：英文例句用英文语音，中文成语与诗句用中文语音。
  utterance.lang = /[a-zA-Z]/.test(text) && !/[\u4e00-\u9fa5]/.test(text) ? 'en-US' : 'zh-CN';
  utterance.rate = .86;
  utterance.onend = done;
  utterance.onerror = done;
  window.speechSynthesis.speak(utterance);
  showToast('正在朗读，知知会跟着一起说');
  return true;
}

let speechDelegated = false;
function bindSpeech() {
  if (speechDelegated) return;
  speechDelegated = true;
  // 事件委托：课程重渲染后不用再绑一遍，点喇叭、点模块、点小卡片都能读。
  document.addEventListener('click', event => {
    const speakBtn = event.target.closest('[data-speak]');
    if (speakBtn && speakBtn.dataset.speak != null) {
      event.preventDefault();
      event.stopPropagation();
      const line = speakBtn.dataset.speak || '';
      if (typeof window.speakGuide === 'function') {
        window.speakGuide(line, { key: 'attr:' + line, host: speakBtn.closest('.content-card, .grammar-card, .idiom-card, .mnemonic, .challenge-card, .step, article, section') || speakBtn });
      } else {
        speakText(line);
      }
      return;
    }
    const playBtn = event.target.closest('[data-speech-play]');
    if (playBtn && typeof window.speakLessonKey === 'function') {
      event.preventDefault();
      event.stopPropagation();
      const card = playBtn.closest('[data-speech-key], [data-speech-item], .content-card, .mnemonic, .challenge-card');
      window.speakLessonKey(playBtn.dataset.speechPlay, { host: card });
      return;
    }
    const item = event.target.closest('[data-speech-item]');
    if (item && typeof window.speakLessonKey === 'function' && !event.target.closest('[data-ai-idiom], [data-ai-answer], [data-ai-filter], [data-ai-level], [data-speak], [data-speech-play], a, input, textarea, select')) {
      // 预览里的成语卡本身就是 button；完整讲解的成语卡由 data-ai-idiom 处理器朗读，避免点一次读两遍又被停掉。
      const nested = event.target.closest('button');
      if (!nested || nested === item) {
        window.speakLessonKey(item.dataset.speechItem, { host: item });
      }
      return;
    }
    const heading = event.target.closest('.card-heading, .solution-intro');
    const section = heading && heading.closest('[data-speech-key]');
    if (section && typeof window.speakLessonKey === 'function' && !event.target.closest('button, a, input, textarea, select')) {
      window.speakLessonKey(section.dataset.speechKey, { host: section });
    }
  });
}

window.speakText = speakText;
function closeSidebar() { $('#sidebar').classList.remove('open'); $('#sidebar-mask').classList.remove('show'); }

$('#topic-input').addEventListener('input', updateDetection);
$('#topic-input').addEventListener('keydown', event => { if (event.key === 'Enter') startLesson(); });
$('#start-button').addEventListener('click', () => startLesson());
$$('[data-topic]').forEach(button => button.addEventListener('click', () => { $('#topic-input').value = button.dataset.topic; updateDetection(); startLesson(); }));
$('#favorite-button').addEventListener('click', () => toggleFavorite());
$('#share-button').addEventListener('click', async () => {
  const url = `${location.href.split('#')[0]}#lesson=${state.topic}`;
  try { await navigator.clipboard.writeText(url); showToast('讲解链接已复制，可以分享给同学'); }
  catch { showToast('当前讲解可通过页面链接分享'); }
  history.replaceState(null, '', `#lesson=${state.topic}`);
});
$$('[data-panel]').forEach(button => button.addEventListener('click', () => {
  if (button.dataset.panel === 'explore') { closeModal(); closeSidebar(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  else showCollection(button.dataset.panel);
}));
$('#guide-button').addEventListener('click', () => showGuide());
$('#modal-close').addEventListener('click', closeModal);
$('#modal-backdrop').addEventListener('click', event => { if (event.target === $('#modal-backdrop')) closeModal(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') { closeModal(); closeSidebar(); } });
$('#mobile-menu').addEventListener('click', () => { $('#sidebar').classList.add('open'); $('#sidebar-mask').classList.add('show'); });
$('#sidebar-mask').addEventListener('click', closeSidebar);
$('.brand').addEventListener('click', event => { event.preventDefault(); closeSidebar(); window.scrollTo({ top: 0, behavior: 'smooth' }); });

const initialTopic = location.hash.match(/lesson=(chinese|english|math)/)?.[1] || 'chinese';
renderLesson(initialTopic);
updateGoal();
