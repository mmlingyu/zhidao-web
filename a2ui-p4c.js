/* A2UI P4c · 语音与开放产出游戏组件（UMD 双端纯函数）
 *
 * 完成门槛（docs/A2UI-COMPONENT-ROADMAP.md §六）：
 *   ① 开放题只记 created / asked / recited，绝不写 correct；
 *   ② 连续朗读可中断且口型复位（stopVoice → speechSynthesis.cancel + 知知 idle）；
 *   ③ 青少年版无幼态奖励（createModel 在 teen/senior 把 reward 关掉）。
 *
 * 两类组件共用两份 props：分支选择（StoryBranch / TenseTimeline）与
 * 语音开放产出（RoleVoice / StrokeOrder）。所有文本来自本课真实字段，
 * 模型给不了动作、样式、角色代码。
 */
'use strict';

(function (root) {
  const isNode = typeof module !== 'undefined' && !!module.exports;

  const COMPONENTS = ['StoryBranch', 'RoleVoice', 'StrokeOrder', 'TenseTimeline'];
  const KEY_BY_COMPONENT = {
    StoryBranch: 'storyBranch', RoleVoice: 'roleVoice',
    StrokeOrder: 'strokeOrder', TenseTimeline: 'tenseTimeline'
  };
  const GAME_ACTIONS = ['chooseBranch', 'readScene', 'askBranch',
    'readVoice', 'stopVoice', 'markCreated', 'nextLine', 'traceStroke'];
  const BATCH = 'P4c';
  const BRANCH = new Set(['StoryBranch', 'TenseTimeline']);

  const str = value => value == null ? '' : String(value);
  const clean = value => str(value).trim();

  function provided(raw, key) {
    const p = raw[key] || raw.games?.[key];
    if (!p) return null;
    if (BRANCH.has(key === 'storyBranch' ? 'StoryBranch' : 'TenseTimeline')) return null;
    return null;
  }

  function deriveBranch(key, raw) {
    const p = raw[key] || raw.games?.[key];
    if (p && Array.isArray(p.choices) && p.choices.length >= 2) {
      const choices = p.choices.map((item, i) => ({
        id: clean(item.id) || `c${i}`, label: clean(item.label), outcome: clean(item.outcome)
      })).filter(item => item.label);
      if (choices.length >= 2) {
        return { scene: clean(p.scene), choices, source: 'provided' };
      }
    }
    const poems = (Array.isArray(raw.poems) ? raw.poems : [])
      .map(item => clean(typeof item === 'string' ? item : item?.text)).filter(Boolean);
    const idioms = Array.isArray(raw.idioms) ? raw.idioms : [];
    const quizzes = Array.isArray(raw.quizzes) ? raw.quizzes : [];
    if (key === 'tenseTimeline') {
      const scene = clean(quizzes[0]?.sentence) || clean(poems[0]);
      const choices = quizzes.slice(0, 3).map((item, i) => ({
        id: `c${i}`, label: clean(item.sentence) || `第 ${i + 1} 句`,
        outcome: clean(item.explain) || clean(item.cn) || clean(item.answer)
      })).filter(item => item.label);
      return scene && choices.length >= 2 ? { scene, choices, source: 'derived' } : null;
    }
    const scene = clean(poems[0]) || clean(idioms[0]?.example);
    const choices = idioms.slice(0, 3).map((item, i) => ({
      id: `c${i}`, label: `用「${clean(item.word ?? item)}」接着讲`,
      outcome: clean(item.example) || clean(item.meaning) || clean(item.word ?? item)
    })).filter(item => item.outcome);
    return scene && choices.length >= 2 ? { scene, choices, source: 'derived' } : null;
  }

  function deriveOpen(key, raw) {
    const p = raw[key] || raw.games?.[key];
    if (p && Array.isArray(p.lines) && p.lines.length) {
      const lines = p.lines.map((item, i) => ({
        id: clean(item.id) || `l${i}`, text: clean(typeof item === 'string' ? item : item?.text),
        role: clean(item?.role)
      })).filter(item => item.text);
      if (lines.length) return { lines, source: 'provided' };
    }
    const poems = (Array.isArray(raw.poems) ? raw.poems : [])
      .map(item => clean(typeof item === 'string' ? item : item?.text)).filter(Boolean);
    const idiom = (Array.isArray(raw.idioms) ? raw.idioms : [])[0] || {};
    // 角色名走固定白名单，模型给不了角色代码 / 动画名。
    const ROLES = ['旁白', '知知', '我来读'];
    if (key === 'roleVoice') {
      const texts = poems.concat([clean(idiom.example)]).filter(Boolean).slice(0, 4);
      if (texts.length < 2) return null;
      return { lines: texts.map((text, i) => ({ id: `l${i}`, text, role: ROLES[i % ROLES.length] })),
        source: 'derived' };
    }
    const word = clean(idiom.word ?? idiom);
    if (!word) return null;
    return { lines: word.split('').map((char, i) => ({
      id: `l${i}`, text: `第 ${i + 1} 笔：${char}`, role: '跟着写'
    })), source: 'derived' };
  }

  function deriveGames(subject, raw) {
    const out = {};
    const data = raw || {};
    const plan = subject === 'chinese'
      ? [['storyBranch', deriveBranch], ['roleVoice', deriveOpen], ['strokeOrder', deriveOpen]]
      : subject === 'english' ? [['tenseTimeline', deriveBranch]] : [];
    for (const [key, fn] of plan) {
      try {
        const game = fn(key, data);
        if (game) out[key] = { ...game, key };
      } catch { /* 单组件派生失败不影响其它组件 */ }
    }
    return out;
  }

  function createModel(name, game, stage) {
    const key = KEY_BY_COMPONENT[name];
    const senior = stage === 'teen' || stage === 'senior';
    const titles = {
      StoryBranch: '故事分支', RoleVoice: '角色朗读',
      StrokeOrder: '笔顺跟写', TenseTimeline: '时态轴'
    };
    const notes = {
      StoryBranch: senior ? '选一种讲法，写出你的依据。' : '如果你是主人公，接下来会怎样？',
      RoleVoice: senior ? '按语气把这段读一遍。' : '点小喇叭，跟着知知读一读。',
      StrokeOrder: senior ? '按笔顺临写，写完自检结构。' : '跟着一笔一笔写，写完点「我写好了」。',
      TenseTimeline: senior ? '把句子放到时间轴合适的位置，说明理由。' : '这些句子分别发生在什么时候？'
    };
    const base = {
      key, component: name, source: game.source || 'derived',
      title: titles[name], note: notes[name],
      // 青少年 / 高中期不显示幼态奖励（星星、欢呼），只保留克制的文字反馈。
      reward: !senior
    };
    if (BRANCH.has(name)) {
      return {
        ...base,
        scene: game.scene, choices: game.choices,
        state: { picked: '', outcome: '', feedback: '读一读上面的内容，再选一种讲法。', tone: 'hint' }
      };
    }
    return {
      ...base,
      lines: game.lines,
      state: { active: 0, created: [], reading: false,
        feedback: name === 'RoleVoice' ? '点朗读听一句，也可以点停止换下一句。' : '按笔顺跟写，写完记一次练习。',
        tone: 'hint' }
    };
  }

  function componentFor(name, id, P, key) {
    const b = `/game/${key}`;
    const act = (actionName, context) => ({ event: { name: actionName, context } });
    const common = {
      id, component: name, className: `k-game k-game-${key}`,
      title: P(`${b}/title`), note: P(`${b}/note`), reward: P(`${b}/reward`),
      feedback: P(`${b}/state/feedback`), tone: P(`${b}/state/tone`),
      feedbackId: `game_${key}_feedback`
    };
    if (BRANCH.has(name)) {
      return {
        ...common,
        scene: P(`${b}/scene`), choices: P(`${b}/choices`),
        picked: P(`${b}/state/picked`), outcome: P(`${b}/state/outcome`),
        chooseAction: act('chooseBranch', {}),
        readAction: act('readScene', { text: P(`${b}/scene`) }),
        askAction: act('askBranch', {})
      };
    }
    return {
      ...common,
      lines: P(`${b}/lines`), active: P(`${b}/state/active`),
      created: P(`${b}/state/created`), reading: P(`${b}/state/reading`),
      readAction: act('readVoice', { text: P(`${b}/lines`) }),
      stopAction: act('stopVoice', {}),
      createAction: act(name === 'StrokeOrder' ? 'traceStroke' : 'markCreated',
        { index: P(`${b}/state/active`) }),
      nextAction: act('nextLine', { index: P(`${b}/state/active`), total: P(`${b}/lines`) })
    };
  }

  function applyAction(name, actionName, context, model, stage) {
    const c = context && typeof context === 'object' ? context : {};
    const state = { ...(model.state || {}) };
    const updates = { state };
    let speak = null;
    let stop = false;
    let evidence = null;
    const say = (text, tone) => { state.feedback = text; state.tone = tone; };
    const lines = Array.isArray(c.lines) ? c.lines : (Array.isArray(model.lines) ? model.lines : []);
    const lineAt = index => clean(lines[Number(index)]?.text ?? lines[Number(index)]);

    switch (actionName) {
      case 'chooseBranch': {
        const choice = (Array.isArray(model.choices) ? model.choices : [])
          .find(item => item.id === clean(c.id)) || null;
        if (!choice) break;
        state.picked = choice.id;
        state.outcome = clean(choice.outcome);
        say('这是一种讲法。想听听知知怎么说，可以点「问问知知」。', 'hint');
        // 开放题：只记 created，绝不写 correct。
        evidence = { type: 'created', detail: `${model.title} · ${clean(choice.label)}` };
        break;
      }
      case 'askBranch':
        say(clean(model.note) || '先读一遍，再说说你的理由。', 'hint');
        evidence = { type: 'asked', detail: `${model.title} · 向知知求助` };
        break;
      case 'readScene':
        speak = clean(c.text) || clean(model.scene);
        evidence = { type: 'recited', detail: `${model.title} · ${speak.slice(0, 40)}` };
        break;

      case 'readVoice': {
        const index = Number(c.index != null ? c.index : state.active) || 0;
        speak = clean(c.text) || lineAt(index);
        state.reading = !!speak;
        state.active = index;
        if (speak) evidence = { type: 'recited', detail: `${model.title} · ${speak.slice(0, 40)}` };
        else say('这一句暂时没有可朗读的内容。', 'warn');
        break;
      }
      case 'stopVoice':
        // 关键门槛：中断当前朗读并让知知口型回到 idle，不残留「正在说话」状态。
        stop = true;
        state.reading = false;
        say('已停止朗读，可以换一句再读。', 'hint');
        break;
      case 'nextLine': {
        const total = lines.length;
        state.active = Math.min(Math.max(0, total - 1), (Number(c.index) || 0) + 1);
        state.reading = false;
        say(`第 ${state.active + 1} 句，读一读吧。`, 'hint');
        break;
      }
      case 'markCreated':
      case 'traceStroke': {
        const index = Number(c.index) || 0;
        state.created = Array.isArray(state.created) ? state.created.slice() : [];
        if (!state.created.includes(index)) state.created.push(index);
        say(name === 'StrokeOrder' ? '这一笔写好了，继续下一笔。' : '读完啦，已记下这次朗读。', 'good');
        evidence = { type: 'created', detail: `${model.title} · 第 ${index + 1} 项` };
        break;
      }
      default: return null;
    }
    return { updates, speak, evidence, stop };
  }

  const API = {
    BATCH, COMPONENTS, KEY_BY_COMPONENT, GAME_ACTIONS, BRANCH,
    deriveGames, createModel, componentFor, applyAction
  };
  if (isNode) module.exports = API;
  if (root) root.ZHIDAO_A2UI_P4C = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
