/* A2UI P4d · 图形与情境游戏组件（UMD 双端纯函数）
 *
 * 完成门槛（docs/A2UI-COMPONENT-ROADMAP.md §六）：
 *   ① 图形只由组件按数据用 CSS / 固定形状渲染，模型不给 SVG / HTML；
 *   ② 低龄禁真实倒计时（allowTimer=false，且任何年级都不启动计时器）；
 *   ③ 错误不扣分不排名：答错只给鼓励反馈、不写证据，答对才记 correct；
 *      界面只有「第 n / m 轮」，没有分数、星星或排行榜。
 *
 * 三个组件共用一份「图形情境」数据契约，差别只在 shapes / units / options 的形状，
 * 所有数字与句子都来自本课 challenge / methods / steps 的真实内容。
 */
'use strict';

(function (root) {
  const isNode = typeof module !== 'undefined' && !!module.exports;

  const COMPONENTS = ['SpeedRound', 'UnitStrip', 'ShapeSplit'];
  const KEY_BY_COMPONENT = { SpeedRound: 'speedRound', UnitStrip: 'unitStrip', ShapeSplit: 'shapeSplit' };
  const GAME_ACTIONS = ['pickGraphic', 'nextRound', 'readGraphic', 'showUnits'];
  const BATCH = 'P4d';

  const str = value => value == null ? '' : String(value);
  const clean = value => str(value).trim();
  const numbers = text => (String(text).match(/\d+/g) || []).map(Number).filter(Number.isFinite);

  function rawMath(raw) {
    const methods = Array.isArray(raw.methods) ? raw.methods : [];
    const steps = methods.flatMap(item => Array.isArray(item.steps) ? item.steps : []);
    const challenge = raw.challenge && typeof raw.challenge === 'object' ? raw.challenge : {};
    const question = clean(challenge.question) || clean(steps[0]?.text) || '';
    return { methods, steps, challenge, question };
  }

  function deriveSpeedRound(raw) {
    const p = raw.speedRound || raw.games?.speedRound;
    if (p && Array.isArray(p.rounds) && p.rounds.length) {
      const rounds = p.rounds.map((item, i) => ({
        id: clean(item.id) || `r${i}`, question: clean(item.question),
        options: (Array.isArray(item.options) ? item.options : []).map(str),
        answer: clean(item.answer)
      })).filter(item => item.question && item.options.length >= 2 && item.answer);
      if (rounds.length) return { rounds, source: 'provided' };
    }
    const { methods, question } = rawMath(raw);
    const names = methods.map(item => clean(item.name)).filter(Boolean);
    if (names.length < 2 || !question) return null;
    const rounds = methods.slice(0, 3).map((item, i) => ({
      id: `r${i}`,
      question: `${question}（第 ${i + 1} 轮：哪种思路先看清已知条件？）`,
      options: names.slice(0, 4),
      answer: clean(item.name)
    }));
    return { rounds, source: 'derived' };
  }

  function deriveUnitStrip(raw) {
    const p = raw.unitStrip || raw.games?.unitStrip;
    if (p && Array.isArray(p.units) && p.units.length >= 2) {
      const units = p.units.map((item, i) => ({
        id: clean(item.id) || `u${i}`, label: clean(item.label),
        value: Math.max(0, Math.min(10, Number(item.value) || 0))
      })).filter(item => item.label);
      if (units.length >= 2) return { units, source: 'provided', question: clean(p.question) };
    }
    const { question, challenge, steps } = rawMath(raw);
    // 数字来源只取本课真实字段：题目、答案、第一步算式、课程标题。
    const values = numbers(`${question} ${clean(challenge.answer)} ${clean(steps[0]?.formula)} ${clean(raw.title)}`).slice(0, 4);
    if (values.length < 2) return null;
    const units = values.map((value, i) => ({
      id: `u${i}`, label: `第 ${i + 1} 个数量`, value: Math.max(1, Math.min(10, value))
    }));
    return { units, question, source: 'derived' };
  }

  function deriveShapeSplit(raw) {
    const p = raw.shapeSplit || raw.games?.shapeSplit;
    if (p && Array.isArray(p.shapes) && p.shapes.length >= 2) {
      const shapes = p.shapes.map((item, i) => ({ id: clean(item.id) || `p${i}`, kind: clean(item.kind) }));
      return { shapes, source: 'provided', question: clean(p.question) };
    }
    const { question, steps } = rawMath(raw);
    const values = numbers(`${question} ${clean(steps[0]?.formula)}`);
    if (!values.length) return null;
    const count = Math.max(2, Math.min(8, values[0]));
    const shapes = Array.from({ length: count }, (_, i) => ({ id: `p${i}`, kind: `shape-${i % 4}` }));
    return { shapes, question, source: 'derived' };
  }

  function deriveGames(subject, raw) {
    if (subject !== 'math') return {};
    const data = raw || {};
    const out = {};
    const plan = [['speedRound', deriveSpeedRound], ['unitStrip', deriveUnitStrip], ['shapeSplit', deriveShapeSplit]];
    for (const [key, fn] of plan) {
      try {
        const game = fn(data);
        if (game) out[key] = { ...game, key };
      } catch { /* 单组件派生失败不影响其它组件 */ }
    }
    return out;
  }

  function createModel(name, game, stage) {
    const key = KEY_BY_COMPONENT[name];
    const young = ['early', 'primary'].includes(stage);
    const titles = { SpeedRound: '口算闯关', UnitStrip: '数量关系条', ShapeSplit: '图形切一切' };
    const notes = {
      SpeedRound: young ? '一轮一轮来，不着急。' : '按顺序完成，错了也可以再试。',
      UnitStrip: young ? '比比哪一条更长。' : '看清每一条代表的数量，再作答。',
      ShapeSplit: young ? '数一数被分成了几块。' : '观察等分后的块数，说出判断依据。'
    };
    const base = {
      key, component: name, source: game.source || 'derived',
      title: titles[name], note: notes[name],
      // 低龄禁真实倒计时；高龄也只显示「第 n / m 轮」，不启动计时器、不排名。
      allowTimer: !young, mode: key,
      state: { index: 0, picked: '', solved: [], feedback: '先看图，再点一个答案。', tone: 'hint' }
    };
    if (name === 'SpeedRound') {
      const rounds = game.rounds;
      return { ...base, rounds, total: rounds.length,
        current: rounds[0], question: rounds[0].question,
        options: rounds[0].options, answer: rounds[0].answer, shapes: [], units: [] };
    }
    if (name === 'UnitStrip') {
      const units = game.units;
      const values = units.map(item => item.value);
      const answer = String(Math.max(...values));
      return { ...base, units, shapes: [], rounds: [], total: 1,
        question: game.question || '点一点：哪一条代表的数量最多？',
        options: units.map(item => `${item.label}：${item.value}`),
        answer: units.find(item => String(item.value) === answer)?.label
          ? `${units.find(item => String(item.value) === answer).label}：${answer}` : answer };
    }
    const shapes = game.shapes;
    const count = shapes.length;
    return { ...base, shapes, units: [], rounds: [], total: 1,
      question: game.question || '这个图形被分成了几块？',
      options: [String(count), String(count + 1), String(Math.max(1, count - 1))],
      answer: String(count) };
  }

  function componentFor(name, id, P, key) {
    const b = `/game/${key}`;
    const act = (actionName, context) => ({ event: { name: actionName, context } });
    return {
      id, component: name, className: `k-game k-game-graphic k-game-${key}`,
      title: P(`${b}/title`), note: P(`${b}/note`), mode: P(`${b}/mode`),
      question: P(`${b}/question`), options: P(`${b}/options`), answer: P(`${b}/answer`),
      units: P(`${b}/units`), shapes: P(`${b}/shapes`), rounds: P(`${b}/rounds`),
      allowTimer: P(`${b}/allowTimer`),
      index: P(`${b}/state/index`), total: P(`${b}/total`),
      picked: P(`${b}/state/picked`), solved: P(`${b}/state/solved`),
      feedback: P(`${b}/state/feedback`), tone: P(`${b}/state/tone`),
      feedbackId: `game_${key}_feedback`,
      pickAction: act('pickGraphic', { answer: P(`${b}/answer`) }),
      stepAction: act('nextRound', { index: P(`${b}/state/index`), total: P(`${b}/total`) }),
      readAction: act('readGraphic', { text: P(`${b}/question`) }),
      unitAction: act('showUnits', {})
    };
  }

  function applyAction(name, actionName, context, model, stage) {
    const c = context && typeof context === 'object' ? context : {};
    const state = { ...(model.state || {}) };
    const updates = { state };
    let speak = null;
    let evidence = null;
    const say = (text, tone) => { state.feedback = text; state.tone = tone; };

    switch (actionName) {
      case 'pickGraphic': {
        const choice = clean(c.choice);
        const answer = clean(c.answer);
        const correct = !!answer && choice === answer;
        state.picked = choice;
        if (correct) {
          state.solved = Array.isArray(state.solved) && !state.solved.includes(Number(c.index))
            ? state.solved.concat(Number(c.index)) : (state.solved || []);
          say('看对了，图里的关系就是这样的。', 'good');
          evidence = { correct: true, detail: `${model.title} · ${choice}` };
        } else {
          // 门槛：错误不扣分、不排名、不写证据，只给一句可再试的反馈。
          say('再看一眼图，数一数、比一比，随时可以重选。', 'warn');
        }
        break;
      }
      case 'nextRound': {
        const rounds = Array.isArray(model.rounds) ? model.rounds : [];
        const total = rounds.length || Number(model.total) || 1;
        const next = Math.min(total - 1, (Number(c.index) || 0) + 1);
        state.index = next;
        state.picked = '';
        if (rounds[next]) {
          updates.question = rounds[next].question;
          updates.options = rounds[next].options;
          updates.answer = rounds[next].answer;
          updates.current = rounds[next];
        }
        say(`第 ${next + 1} / ${total} 轮，慢慢来。`, 'hint');
        break;
      }
      case 'readGraphic': speak = clean(c.text) || clean(model.question); break;
      case 'showUnits':
        say('点一条看清它代表的数量，再点下面的答案。', 'hint');
        break;
      default: return null;
    }
    return { updates, speak, evidence };
  }

  const API = {
    BATCH, COMPONENTS, KEY_BY_COMPONENT, GAME_ACTIONS,
    deriveGames, createModel, componentFor, applyAction, numbers
  };
  if (isNode) module.exports = API;
  if (root) root.ZHIDAO_A2UI_P4D = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
