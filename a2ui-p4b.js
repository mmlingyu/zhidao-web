/* A2UI P4b · 拼装型游戏组件（6 个共用一套装配内核，UMD 双端纯函数）
 *
 * 完成门槛（docs/A2UI-COMPONENT-ROADMAP.md §六）：
 *   ① 6 个组件共用同一个 /game/<key>/assembly/* 数据契约；
 *   ② 乱序使用固定种子，答案可复现（同一课程任何时候编译结果一致）；
 *   ③ 撤销可回退到任意一步（history 存完整快照，undo 接受目标步索引）。
 *
 * 六个组件只是「取哪一段真实课文内容来切块」不同：
 *   PoemTiles 诗句 / RadicalTiles 汉字 / SentenceBlocks 英语句子 /
 *   LetterTiles 单词字母 / ColumnArithmetic 算式 / BalanceScale 等式两边。
 * 切块只做 split，不生成新知识；正确答案永远等于原始顺序。
 */
'use strict';

(function (root) {
  const isNode = typeof module !== 'undefined' && !!module.exports;

  const COMPONENTS = ['PoemTiles', 'RadicalTiles', 'SentenceBlocks',
    'LetterTiles', 'ColumnArithmetic', 'BalanceScale'];
  const KEY_BY_COMPONENT = {
    PoemTiles: 'poemTiles', RadicalTiles: 'radicalTiles', SentenceBlocks: 'sentenceBlocks',
    LetterTiles: 'letterTiles', ColumnArithmetic: 'columnArithmetic', BalanceScale: 'balanceScale'
  };
  const GAME_ACTIONS = ['pickTile', 'placeTile', 'undoAssembly', 'resetAssembly',
    'checkAssembly', 'readAssembly'];
  const BATCH = 'P4b';

  const str = value => value == null ? '' : String(value);
  const clean = value => str(value).trim();
  const uniq = list => [...new Set(list.filter(Boolean))];

  /** 固定种子乱序：与 P4a 的 shuffleIds 同策略，不用 Math.random。 */
  function shuffleSeeded(list) {
    const out = list.slice();
    if (out.length < 2) return out;
    [out[0], out[out.length - 1]] = [out[out.length - 1], out[0]];
    if (out.length > 3) {
      const mid = Math.floor(out.length / 2);
      [out[1], out[mid]] = [out[mid], out[1]];
    }
    return out;
  }

  /** 模型若直接给 data.<key> 契约字段，优先采用；否则从已有课文内容切块。 */
  function provided(raw, key) {
    const p = raw[key] || raw.games?.[key];
    if (!p || !Array.isArray(p.slots) || !Array.isArray(p.bank)) return null;
    const slots = p.slots.map((item, i) => ({
      id: clean(item.id) || `s${i}`, label: clean(item.label), expected: clean(item.expected)
    })).filter(item => item.label && item.expected);
    const bank = p.bank.map((item, i) => ({
      id: clean(item.id) || `t${i}`, label: clean(item.label)
    })).filter(item => item.label);
    if (slots.length < 2 || bank.length < slots.length) return null;
    return { slots, bank, source: 'provided' };
  }

  function tokensFrom(text, splitter) {
    return uniq(String(text).split(splitter).map(clean)).filter(Boolean);
  }

  function deriveOne(key, raw) {
    const hit = provided(raw, key);
    if (hit) return hit;
    const poems = Array.isArray(raw.poems) ? raw.poems : [];
    const idioms = Array.isArray(raw.idioms) ? raw.idioms : [];
    const quizzes = Array.isArray(raw.quizzes) ? raw.quizzes : [];
    const items = Array.isArray(raw.items) ? raw.items : [];
    const methods = Array.isArray(raw.methods) ? raw.methods : [];
    const steps = methods.flatMap(item => Array.isArray(item.steps) ? item.steps : []);
    const challenge = raw.challenge && typeof raw.challenge === 'object' ? raw.challenge : {};
    let parts = [];
    let splitter = /[\s，。？！；、,]/;

    if (key === 'poemTiles') {
      const line = clean(poems[0]?.text ?? poems[0]);
      parts = line.split(/[，,。？?！!；;]/).map(clean).filter(Boolean);
    } else if (key === 'radicalTiles') {
      const word = clean(idioms[0]?.word ?? idioms[0]);
      parts = word.split('');
    } else if (key === 'sentenceBlocks') {
      const quiz = quizzes[0] || {};
      const sentence = clean(quiz.sentence).replace(/_{2,}|＿{2,}/g, clean(quiz.answer));
      parts = sentence.split(/\s+/).map(clean).filter(Boolean);
    } else if (key === 'letterTiles') {
      parts = clean(items[0]?.word ?? items[0]).split('');
    } else if (key === 'columnArithmetic') {
      const expr = clean(steps[0]?.formula) || clean(challenge.question);
      parts = tokensFrom(expr.replace(/^原题[:：]/, ''), /(\d+|[+\-×÷=x²X])/).length
        ? clean(expr.replace(/^原题[:：]/, '')).match(/\d+|[+\-×÷=]|[a-zA-Z]\d*/g) || []
        : [];
      parts = uniq(parts.map(clean)).slice(0, 6);
    } else if (key === 'balanceScale') {
      const expr = clean(steps[0]?.formula) || clean(challenge.question);
      parts = clean(expr.replace(/^原题[:：]/, '')).split('=').map(clean).filter(Boolean);
      if (parts.length < 2) parts = tokensFrom(expr, /(\d+|[+\-×÷=])/).slice(0, 4);
    }
    parts = uniq(parts.map(clean)).filter(Boolean).slice(0, 7);
    if (parts.length < 2) return null;
    const slots = parts.map((label, i) => ({ id: `s${i}`, label: '第 ' + (i + 1) + ' 块', expected: `t${i}` }));
    const bank = parts.map((label, i) => ({ id: `t${i}`, label }));
    return { slots, bank: shuffleSeeded(bank), source: 'derived' };
  }

  function deriveGames(subject, raw) {
    const keys = subject === 'chinese' ? ['poemTiles', 'radicalTiles']
      : subject === 'english' ? ['sentenceBlocks', 'letterTiles']
        : subject === 'math' ? ['columnArithmetic', 'balanceScale'] : [];
    const out = {};
    for (const key of keys) {
      const game = deriveOne(key, raw || {});
      if (game) out[key] = { ...game, key };
    }
    return out;
  }

  function createModel(name, game, stage) {
    const key = KEY_BY_COMPONENT[name];
    const young = ['early', 'primary', 'upper'].includes(stage);
    const titles = {
      PoemTiles: '诗句拼图', RadicalTiles: '部件拼字', SentenceBlocks: '句子积木',
      LetterTiles: '字母拼词', ColumnArithmetic: '竖式填空', BalanceScale: '天平等式'
    };
    const notes = {
      PoemTiles: young ? '把诗句碎片拖回原来的顺序。' : '按原诗顺序复原，并说明依据。',
      RadicalTiles: young ? '点一点字块，把这个字拼回来。' : '按字形结构拼合，注意部件位置。',
      SentenceBlocks: young ? '把词块排成一句通顺的话。' : '按英语语序排列词块，读一遍检查。',
      LetterTiles: young ? '把字母排成学过的单词。' : '按拼写顺序复原单词，再读一遍。',
      ColumnArithmetic: young ? '把数字块放进算式里。' : '按竖式计算顺序排列，写出每一步依据。',
      BalanceScale: young ? '让天平两边一样重。' : '按等式两边的关系摆放，说明为什么相等。'
    };
    return {
      key, component: name, source: game.source || 'derived',
      title: titles[name], note: notes[name], mode: key,
      assembly: {
        slots: game.slots, bank: game.bank, placed: {}, selected: '',
        answer: game.slots.map(item => item.expected),
        history: [], checked: false
      },
      state: { feedback: '先点一个候选块，再点要放进去的位置。', tone: 'hint' }
    };
  }

  function componentFor(name, id, P, key) {
    const a = `/game/${key}/assembly`;
    const b = `/game/${key}`;
    const act = (actionName, context) => ({ event: { name: actionName, context } });
    return {
      id, component: name, className: `k-game k-game-assembly k-game-${key}`,
      title: P(`${b}/title`), note: P(`${b}/note`), mode: P(`${b}/mode`),
      slots: P(`${a}/slots`), bank: P(`${a}/bank`), placed: P(`${a}/placed`),
      answer: P(`${a}/answer`), selected: P(`${a}/selected`),
      checked: P(`${a}/checked`), history: P(`${a}/history`),
      feedback: P(`${b}/state/feedback`), tone: P(`${b}/state/tone`),
      feedbackId: `game_${key}_feedback`,
      pickAction: act('pickTile', {}),
      placeAction: act('placeTile', {}),
      undoAction: act('undoAssembly', { history: P(`${a}/history`) }),
      resetAction: act('resetAssembly', {}),
      checkAction: act('checkAssembly', {
        placed: P(`${a}/placed`), answer: P(`${a}/answer`), slots: P(`${a}/slots`)
      }),
      readAction: act('readAssembly', {
        placed: P(`${a}/placed`), slots: P(`${a}/slots`), bank: P(`${a}/bank`)
      })
    };
  }

  /** 快照只存可变的三个字段，撤销时整体还原；history 自身不重复叠加。 */
  function snapshot(assembly) {
    return {
      placed: { ...(assembly.placed || {}) },
      selected: assembly.selected || '',
      checked: !!assembly.checked
    };
  }

  function applyAction(name, actionName, context, model, stage) {
    const c = context && typeof context === 'object' ? context : {};
    const assembly = JSON.parse(JSON.stringify(model.assembly || {}));
    const state = { ...(model.state || {}) };
    const updates = {};
    let speak = null;
    let evidence = null;
    const say = (text, tone) => { state.feedback = text; state.tone = tone; };
    const remember = () => { assembly.history = (assembly.history || []).concat(snapshot(assembly)); };

    switch (actionName) {
      case 'pickTile':
        // 选中候选块；已放进槽位的块不能再选，避免重复。
        if (clean(c.tileId) && !Object.values(assembly.placed || {}).includes(clean(c.tileId))) {
          assembly.selected = clean(c.tileId);
          say('选好了，点一个空位置把它放进去。', 'hint');
        }
        break;
      case 'placeTile': {
        const slotId = clean(c.slotId);
        const tileId = clean(c.tileId) || assembly.selected;
        const slot = (assembly.slots || []).find(item => item.id === slotId);
        if (!slot || !tileId) break;
        remember();
        assembly.placed = { ...(assembly.placed || {}) };
        // 同一个块不能占两个槽：先清掉旧位置。
        for (const [key, value] of Object.entries(assembly.placed)) {
          if (value === tileId) delete assembly.placed[key];
        }
        assembly.placed[slotId] = tileId;
        assembly.selected = '';
        assembly.checked = false;
        say('放好了，可以撤销，也可以继续拼。', 'hint');
        break;
      }
      case 'undoAssembly': {
        const history = Array.isArray(assembly.history) ? assembly.history.slice() : [];
        if (!history.length) { say('还没有可以撤销的步骤。', 'hint'); break; }
        // step 允许回退到任意一步；不传则回退一步。
        const wanted = Number.isInteger(Number(c.step)) && c.step !== '' && c.step != null
          ? Math.min(Math.max(0, Number(c.step)), history.length - 1)
          : history.length - 1;
        const snap = history[wanted];
        assembly.placed = { ...(snap.placed || {}) };
        assembly.selected = snap.selected || '';
        assembly.checked = !!snap.checked;
        assembly.history = history.slice(0, wanted);
        say(`已回到第 ${wanted} 步。`, 'hint');
        break;
      }
      case 'resetAssembly':
        remember();
        assembly.placed = {};
        assembly.selected = '';
        assembly.checked = false;
        say('已清空，重新拼一次吧。', 'hint');
        break;
      case 'checkAssembly': {
        const slots = Array.isArray(c.slots) ? c.slots : (assembly.slots || []);
        const placed = c.placed && typeof c.placed === 'object' ? c.placed : (assembly.placed || {});
        const answer = Array.isArray(c.answer) ? c.answer : (assembly.answer || []);
        const wrongAt = slots.findIndex((slot, i) => placed[slot.id] !== answer[i]);
        const correct = wrongAt === -1 && slots.every(slot => placed[slot.id]);
        assembly.checked = true;
        say(correct ? '拼对了，读一遍完整的句子。'
          : `第 ${wrongAt + 1} 块还不对，可以撤销再试。`, correct ? 'good' : 'warn');
        evidence = { correct, detail: `${model.title} · ${correct ? '顺序正确' : '第 ' + (wrongAt + 1) + ' 块'}` };
        break;
      }
      case 'readAssembly': {
        const slots = Array.isArray(c.slots) ? c.slots : (assembly.slots || []);
        const placed = c.placed && typeof c.placed === 'object' ? c.placed : (assembly.placed || {});
        const bank = Array.isArray(c.bank) ? c.bank : (assembly.bank || []);
        const byId = new Map(bank.map(item => [str(item.id), str(item.label)]));
        speak = slots.map(slot => byId.get(placed[slot.id]) || '').filter(Boolean).join('');
        if (!speak) say('先把块放进去，才能读出来。', 'warn');
        else evidence = { type: 'recited', detail: `${model.title} · ${speak.slice(0, 40)}` };
        break;
      }
      default: return null;
    }
    updates.assembly = assembly;
    updates.state = state;
    return { updates, speak, evidence };
  }

  const API = {
    BATCH, COMPONENTS, KEY_BY_COMPONENT, GAME_ACTIONS,
    deriveGames, createModel, componentFor, applyAction, shuffleSeeded, _deriveOne: deriveOne
  };
  if (isNode) module.exports = API;
  if (root) root.ZHIDAO_A2UI_P4B = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
