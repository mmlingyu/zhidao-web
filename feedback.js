/* 多感官反馈引擎 · 视觉 + 听觉 + 心理
 *
 * 设计前提：孩子的动力不是被"分数"驱动的，而是被"我变强了"这件事驱动的。
 * 所以反馈分三层同时工作，缺一层就会失效：
 *
 *   视觉层 —— 立刻可感、无需阅读。答对时按钮弹一下、掌握度环涨一格、
 *              卡片翻面点亮。0.1 秒内必须有反应，否则孩子会以为没点到。
 *   听觉层 —— 有音高、有节奏，不依赖文字。答对是一声上行铃，
 *              连击时音高逐级爬升，形成"越对越脆"的爽感。
 *   心理层 —— 决定反馈是"奖励"还是"压力"。归因于过程而非天赋，
 *              允许休整不惩罚，用成长叙事替代分数叙事。
 *
 * 两处关键取舍：
 * 1. 答错绝不用"惩罚音"。低沉但柔和的一声，配"再想想"，让孩子想再试一次。
 * 2. 小学生与青少年用不同的语气。给初中生发"太棒啦小宝贝"是负向激励，
 *    反而会让人退出。这里按年级切换语气量表。
 */
'use strict';

/* ---------------- 语气量表：按年龄切换反馈强度 ---------------- */

const TONES = {
  child: {
    // 小学：外显、具体、夸张一点的即时反馈
    correct: ['答对啦！', '就是厉害！', '这题拿下了！', '漂亮！'],
    wrong: ['差一点点，再想想～', '没关系，看看提示', '快要想到了！'],
    mastered: ['这个知识点你真的会啦！', '太棒了，又拿下一个！'],
    effort: ['你刚才试了 3 种方法，很会想办法', '这次没有放弃，一直在想', '你自己把它讲明白了，很厉害'],
    combo: ['连对 {n} 次，手感真好', '{n} 连击，状态来了'],
    rest: ['今天先歇一歇，明天接着来', '休息也是学习的一部分']
  },
  teen: {
    // 初中及以上：克制、尊重、给空间，不喊口号
    correct: ['对', '就是这个思路', '嗯，掌握了', '没问题'],
    wrong: ['再想一步', '看看提示里的那条线索', '差在细节上'],
    mastered: ['这个可以算你的了', '掌握确认', '这一块你拿下了'],
    effort: ['你换了三种解法，这比一次做对更有价值', '过程比答案更值得记下来'],
    combo: ['连对 {n} 次，状态不错', '{n} 连击，手感在线'],
    rest: ['今天到这儿，休息也是策略', '进度不会因为休息清零']
  }
};

/** 根据年级选择语气。初中及以上用克制风格。 */
function toneForGrade(grade) {
  const index = ['grade7', 'grade8', 'grade9', 'senior1', 'senior2', 'senior3'].indexOf(grade);
  return index >= 0 ? TONES.teen : TONES.child;
}

function pick(list, seed = Date.now()) {
  if (!Array.isArray(list) || !list.length) return '';
  const index = Math.abs(Math.round(seed)) % list.length;
  return list[index];
}

/* ---------------- 听觉层：Web Audio 合成 ---------------- */

class AudioFeedback {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.volume = 0.32;
    this.combo = 0;
    this.unlocked = false;
  }

  /** 浏览器要求音频上下文在用户手势后才能启动。 */
  unlock() {
    if (this.unlocked) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!this.ctx) {
        this.ctx = new Ctx();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.volume;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      this.unlocked = true;
    } catch { /* 音频不可用时静默降级 */ }
  }

  setVolume(value) {
    this.volume = Math.max(0, Math.min(1, Number(value) || 0));
    if (this.master) this.master.gain.value = this.volume;
  }

  setEnabled(flag) {
    this.enabled = Boolean(flag);
  }

  /**
   * 单个音符。
   * @param {number} freq 频率
   * @param {number} start 相对起始时间（秒）
   * @param {number} dur 时长
   * @param {string} type 波形
   * @param {number} gain 音量倍率
   */
  note(freq, start = 0, dur = 0.18, type = 'sine', gain = 1) {
    if (!this.enabled || !this.ctx) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    // 指数衰减包络：起音快、收尾柔，避免"哔"一样的刺耳感
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain * 0.35), t0 + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(env);
    env.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  /** 答对：上行双音，音高随连击数逐级升高（形成"越对越脆"的爽感）。 */
  correct(subject = 'math', combo = 0) {
    this.unlock();
    if (!this.ctx) return;
    // 连击每 3 次升一个半音阶，封顶避免刺耳
    const step = Math.min(10, Math.floor(combo / 3));
    const base = 523.25 * Math.pow(2, step / 12);
    const timbre = { chinese: 'triangle', english: 'sine', math: 'sine' }[subject] || 'sine';
    this.note(base, 0, 0.16, timbre, 1);
    this.note(base * 1.5, 0.075, 0.26, timbre, 0.85);
    if (combo > 0 && combo % 5 === 0) {
      // 每 5 连击加一层上行三音，给个"破纪录"的听觉标记
      this.note(base * 2, 0.15, 0.2, timbre, 0.6);
      this.note(base * 2.5, 0.21, 0.22, timbre, 0.5);
    }
  }

  /** 答错：低沉柔和两音，不刺耳、不惩罚感。 */
  wrong() {
    this.unlock();
    if (!this.ctx) return;
    this.note(330, 0, 0.2, 'sine', 0.5);
    this.note(247, 0.09, 0.26, 'sine', 0.42);
  }

  /** 掌握达成：一段小琶音，像解锁。 */
  mastered() {
    this.unlock();
    if (!this.ctx) return;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, index) => this.note(freq, index * 0.085, 0.42, 'triangle', 0.75));
  }

  /** 卡片翻面：轻短的一声"哒"。 */
  flip() {
    this.unlock();
    if (!this.ctx) return;
    this.note(880, 0, 0.07, 'triangle', 0.32);
  }

  /** 连续学习提醒：极轻的呼吸感提示，不打断注意力。 */
  breathe() {
    this.unlock();
    if (!this.ctx) return;
    this.note(196, 0, 0.5, 'sine', 0.22);
  }
}

/* ---------------- 视觉层：DOM 反馈编排 ---------------- */

class VisualFeedback {
  constructor(root = document.body) {
    this.root = root;
    this.layer = null;
  }

  ensureLayer() {
    if (this.layer && document.body.contains(this.layer)) return this.layer;
    const layer = document.createElement('div');
    layer.className = 'zf-layer';
    layer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(layer);
    this.layer = layer;
    return layer;
  }

  /**
   * 元素级反馈：答对弹一下 + 泛光，答错轻晃。
   * 纯 transform/filter，不触发布局，保证动画不卡。
   */
  pulse(element, kind = 'correct') {
    if (!element) return;
    const cls = kind === 'correct' ? 'zf-pop' : 'zf-shake';
    element.classList.remove('zf-pop', 'zf-shake');
    // 强制重排以便重复触发同一动画
    void element.offsetWidth;
    element.classList.add(cls);
    setTimeout(() => element.classList.remove(cls), kind === 'correct' ? 620 : 520);
  }

  /** 掌握瞬间：从卡片中心散出一圈光点。 */
  burst(origin = null) {
    const layer = this.ensureLayer();
    const rect = origin?.getBoundingClientRect?.();
    const cx = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const cy = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
    const colors = ['#f2cb58', '#7568d8', '#4e7b63', '#e8736b', '#4e8fd8'];
    for (let i = 0; i < 14; i += 1) {
      const dot = document.createElement('i');
      dot.className = 'zf-spark';
      const angle = (Math.PI * 2 * i) / 14 + Math.random() * 0.5;
      const dist = 40 + Math.random() * 70;
      dot.style.left = `${cx}px`;
      dot.style.top = `${cy}px`;
      dot.style.background = colors[i % colors.length];
      dot.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
      dot.style.setProperty('--dy', `${Math.sin(angle) * dist}px`);
      layer.appendChild(dot);
      setTimeout(() => dot.remove(), 900);
    }
  }

  /** 顶部飘字：短促有力，不遮挡内容。 */
  float(text, kind = 'correct') {
    const layer = this.ensureLayer();
    const node = document.createElement('div');
    node.className = `zf-float ${kind}`;
    node.textContent = text;
    layer.appendChild(node);
    setTimeout(() => node.remove(), 1800);
  }

  /** 掌握度环增长动画。 */
  growRing(ring) {
    if (!ring) return;
    ring.classList.remove('zf-ring-grow');
    void ring.offsetWidth;
    ring.classList.add('zf-ring-grow');
    setTimeout(() => ring.classList.remove('zf-ring-grow'), 800);
  }
}

/* ---------------- 心理层：成长叙事 ---------------- */

/**
 * 把一次学习行为翻译成心理层面的反馈。
 *
 * 关键取舍：
 * - 归因于过程（"你换了三种方法"）而不是天赋（"你真聪明"）。
 *   天赋归因会让孩子回避难题 —— 一旦做不出，"聪明"的标签就成了威胁。
 * - 连击中断时说"休整"而不是"断了"。惩罚性的语言会让连续学习变成压力。
 * - 掌握时给的是"这个知识点你拿下了"而不是"你很棒"。
 *   前者指向能力成长，后者指向人设评价，只有前者能迁移。
 */
class PsyFeedback {
  constructor(audio, visual) {
    this.audio = audio;
    this.visual = visual;
    this.combo = 0;
    this.grade = '';
    this.lastWrong = false;
  }

  setGrade(grade) { this.grade = grade || ''; }

  tone() { return toneForGrade(this.grade); }

  /** 答对。 */
  onCorrect(subject = 'math', origin = null) {
    this.combo += 1;
    this.lastWrong = false;
    this.audio.correct(subject, this.combo);
    this.visual.pulse(origin, 'correct');
    const tone = this.tone();
    const line = this.combo >= 2 ? pick(tone.combo, this.combo).replace('{n}', this.combo) : pick(tone.correct, this.combo);
    this.visual.float(line, 'correct');
    return { line, combo: this.combo };
  }

  /** 答错。柔和处理，不清零连击，只提示继续。 */
  onWrong(origin = null) {
    this.lastWrong = true;
    this.audio.wrong();
    this.visual.pulse(origin, 'wrong');
    const line = pick(this.tone().wrong, Date.now());
    this.visual.float(line, 'wrong');
    return { line, combo: this.combo };
  }

  /** 掌握达成：视觉爆发 + 解锁音 + 心理宣告。 */
  onMastered(origin = null) {
    this.audio.mastered();
    this.visual.burst(origin);
    const line = pick(this.tone().mastered, Date.now());
    this.visual.float(line, 'mastered');
    return { line };
  }

  /** 连击中断 —— 换一种说法。 */
  onBreak() {
    const broken = this.combo;
    this.combo = 0;
    const line = pick(this.tone().rest, Date.now());
    this.visual.float(line, 'rest');
    return { line, broken };
  }

  /** 努力致谢：在孩子尝试了多种方法或坚持追问时调用。 */
  praiseEffort(detail = '') {
    const line = pick(this.tone().effort, Date.now());
    this.visual.float(line, 'effort');
    return { line, detail };
  }
}

/* ---------------- 统一入口 ---------------- */

const Feedback = {
  audio: null,
  visual: null,
  psy: null,

  init(options = {}) {
    this.audio = this.audio || new AudioFeedback();
    this.visual = this.visual || new VisualFeedback();
    this.psy = this.psy || new PsyFeedback(this.audio, this.visual);
    if (options.grade) this.psy.setGrade(options.grade);
    if (options.volume !== undefined) this.audio.setVolume(options.volume);
    if (options.enabled !== undefined) this.audio.setEnabled(options.enabled);
    return this;
  },

  setGrade(grade) { this.init(); this.psy.setGrade(grade); return this; },
  setVolume(value) { this.init(); this.audio.setVolume(value); return this; },
  setEnabled(flag) { this.init(); this.audio.setEnabled(flag); return this; },
  unlock() { this.init(); this.audio.unlock(); return this; },

  correct(subject, origin) { this.init(); return this.psy.onCorrect(subject, origin); },
  wrong(origin) { this.init(); return this.psy.onWrong(origin); },
  mastered(origin) { this.init(); return this.psy.onMastered(origin); },
  effort(detail) { this.init(); return this.psy.praiseEffort(detail); },
  breakCombo() { this.init(); return this.psy.onBreak(); },
  flip() { this.init(); this.audio.flip(); return this; }
};

if (typeof window !== 'undefined') window.ZHIDAO_FEEDBACK = Feedback;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    Feedback, AudioFeedback, VisualFeedback, PsyFeedback,
    TONES, toneForGrade, pick
  };
}
