/* A2UI 游戏组件聚合层（UMD，双端纯函数）
 *
 * 为什么需要这一层：19 个组件按 P4a–P4d 四批迭代，若每批都去改编译器 / 桥接层，
 * 会把「题型识别 → 数据派生 → 组件实例 → 动作状态机」这条链复制四份。
 * 本层把四批实现注册成同一份接口，编译器与桥接层只认识一个 games 对象：
 *
 *   deriveGames(subject, 课程原始 data)   → 本课能填实的游戏数据
 *   selectGame(...)                      → 该不该挂、挂哪个（含四道闸门）
 *   createModel / componentFor           → 数据模型与组件实例
 *   applyAction(...)                    → 新状态 + 朗读文本 + 学习证据
 *
 * 新增一批组件只要写一个新的 a2ui-p4x.js 并登记到 BATCH_FILES，
 * 编译器、服务端、桥接层、渲染分派表都不用再动（渲染器仍需实现）。
 */
'use strict';

(function (root) {
  const isNode = typeof module !== 'undefined' && !!module.exports;
  const qmap = isNode ? require('./a2ui-question-map') : (root && root.ZHIDAO_A2UI_QUESTION_MAP);

  const BATCH_FILES = ['./a2ui-p4a', './a2ui-p4b', './a2ui-p4c', './a2ui-p4d'];
  const BATCHES = [];
  for (const file of BATCH_FILES) {
    try {
      const mod = isNode ? require(file) : (root && {
        './a2ui-p4a': root.ZHIDAO_A2UI_P4A,
        './a2ui-p4b': root.ZHIDAO_A2UI_P4B,
        './a2ui-p4c': root.ZHIDAO_A2UI_P4C,
        './a2ui-p4d': root.ZHIDAO_A2UI_P4D
      })[file];
      if (mod && Array.isArray(mod.COMPONENTS)) BATCHES.push(mod);
    } catch (error) {
      // 某一批尚未交付（或浏览器脚本没加载）时，其余批次照常工作，不影响课程。
      if (isNode && typeof console !== 'undefined') console.warn(`[a2ui] ${file} 未加载：${error.message}`);
    }
  }

  const NAME_TO_BATCH = {};
  const KEY_BY_COMPONENT = {};
  const COMPONENT_BY_KEY = {};
  const COMPONENTS = [];
  const GAME_ACTIONS = [];
  for (const batch of BATCHES) {
    for (const name of batch.COMPONENTS) {
      NAME_TO_BATCH[name] = batch;
      COMPONENTS.push(name);
      const key = batch.KEY_BY_COMPONENT[name];
      KEY_BY_COMPONENT[name] = key;
      COMPONENT_BY_KEY[key] = name;
    }
    for (const action of batch.GAME_ACTIONS || []) GAME_ACTIONS.push(action);
  }

  function batchFor(name) { return NAME_TO_BATCH[name] || null; }

  /** 合并四批派生结果；某一批抛错不影响其它批。 */
  function deriveGames(subject, data) {
    const out = {};
    for (const batch of BATCHES) {
      try {
        const part = batch.deriveGames(subject, data);
        if (part && typeof part === 'object') Object.assign(out, part);
      } catch { /* 单个游戏派生失败不影响上课 */ }
    }
    return out;
  }

  /**
   * 四道闸门（缺一不挂）：
   *   ① 用户提问命中已实现题型；② 学习过程允许；③ 能力集允许；
   *   ④ 本课派生出了足够真实数据。识别不了 → null → 60 组配方原样。
   */
  function selectGame({ question, subject, phase, grade, capabilities, data, enabled = true } = {}) {
    if (!enabled || !qmap || !qmap.classifyQuestion) return null;
    const hit = qmap.classifyQuestion(question, subject);
    if (!hit) return null;
    const spec = qmap.specFor(hit.primary);
    if (!spec || spec.status !== 'implemented') return null;
    const batch = batchFor(hit.primary);
    if (!batch) return null;
    const advice = qmap.componentsFor(hit, phase, grade);
    if (!advice || !advice.allowed) return null;
    if (capabilities && Array.isArray(capabilities.components)
      && !capabilities.components.includes(hit.primary)) return null;
    const key = batch.KEY_BY_COMPONENT[hit.primary];
    const game = data?.games?.[key];
    if (!game) return null;
    return { name: hit.primary, key, game, question: hit, advice, batch: batch.BATCH };
  }

  function createModel(name, game, stage) {
    const batch = batchFor(name);
    return batch ? batch.createModel(name, game, stage) : null;
  }
  /** dataModel 必须是纯 JSON：函数字段统一在 JSON 往返里丢弃。 */
  function serializable(model) { return JSON.parse(JSON.stringify(model || {})); }
  function componentFor(name, id, P, key) {
    const batch = batchFor(name);
    return batch ? batch.componentFor(name, id, P, key) : null;
  }
  function applyAction(name, actionName, context, model, stage) {
    const batch = batchFor(name);
    return batch ? batch.applyAction(name, actionName, context, model, stage) : null;
  }

  const API = {
    BATCHES, COMPONENTS, NAME_TO_BATCH, KEY_BY_COMPONENT, COMPONENT_BY_KEY,
    GAME_ACTIONS, deriveGames, selectGame, createModel, serializable,
    componentFor, applyAction, batchFor
  };
  if (isNode) module.exports = API;
  if (root) root.ZHIDAO_A2UI_GAMES = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
