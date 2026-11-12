/* A2UI 渐进式消息流 · UMD 双端纯函数（零依赖）
 *
 * 解决的问题：编译器以前一次性产出 3 条消息（createSurface 带全量组件 +
 * 空的 updateComponents + 一条 updateDataModel），必须等课程生成完才能下发。
 * 这里把同一份编译结果**重排**成 A2UI v1.0 原生支持的渐进序列：
 *
 *   1. createSurface        只含 root + 一张「知知正在摆好这一课」骨架卡
 *   2. updateComponents × N  把完整组件表按固定大小切片逐批补齐
 *   3. updateDataModel × M  按 dataModel 顶层键逐条注入，诗句最后注入
 *
 * 扁平邻接表允许「父组件先引用还没到的子组件」，renderer 逐条 feed 时会
 * 跳过缺失引用、下一批到达后重绘，所以用户看到的是界面一块块长出来。
 *
 * 硬规则：
 *   - 只有第一条是 createSurface。renderer 的 apply() 遇到 createSurface 会
 *     clear() 组件表并重置 dataModel，第二条再来就会把前面全部抹掉。
 *   - 正文数据一条不删：所有组件、所有 dataModel 键、原第三条 /knowledge/poems
 *     都必须出现在渐进序列里，reassemble() 可以逐字段验证。
 *   - 模型仍然一次返回整段课程 JSON；这里的「分块」是编译产物的分块下发，
 *     不是模型 token 级增量解析（后者要改 models.js 的生成链，见文档 §21）。
 */
'use strict';

(function (root) {
  const isNode = typeof module !== 'undefined' && !!module.exports;
  const catalog = isNode ? require('./a2ui-catalog') : (root && root.ZHIDAO_A2UI_CATALOG);

  const DEFAULT_CHUNK_SIZE = 5;
  const SKELETON_ID = 'skeleton_hint';
  const SKELETON_TEXT = '知知正在把这一课摆好，先看看已经准备好的部分…';

  function version() { return catalog?.VERSION || '1.0'; }
  function catalogId() { return catalog?.CATALOG_ID || 'urn:zhidao:catalog:knowledge:v1'; }

  /** 把编译器产出的消息数组 / JSONL 统一成消息数组（去掉数组上的 meta / warnings 属性）。 */
  function normalize(input) {
    if (Array.isArray(input)) return input.map(item => ({ ...item }));
    if (typeof input === 'string') {
      return String(input).split('\n').filter(Boolean).map(line => JSON.parse(line));
    }
    if (input && typeof input === 'object') return [input];
    return [];
  }

  function toJSONL(messages) {
    return normalize(messages).map(item => JSON.stringify(item)).join('\n');
  }

  /** 骨架：决策一完成就能推，不依赖任何课程内容。 */
  function skeletonMessage(surfaceId, text) {
    return {
      version: version(),
      createSurface: {
        surfaceId,
        catalogId: catalogId(),
        meta: { progressive: true, skeleton: true },
        components: [
          { id: 'root', component: 'Column', className: 'a2ui-stream-skeleton', children: [SKELETON_ID] },
          { id: SKELETON_ID, component: 'HintBar', text: String(text || SKELETON_TEXT) }
        ],
        dataModel: {}
      }
    };
  }

  /**
   * 把完整消息流重排为渐进序列。
   * @param {Array|string} complete 编译器产出的完整消息数组或 JSONL
   * @param {object} options { surfaceId, chunkSize, skeletonText }
   * @returns {Array} 渐进消息数组（可直接逐条 feed / 逐条 SSE 下发）
   */
  function toProgressiveMessages(complete, options = {}) {
    const source = normalize(complete);
    if (!source.length) return [];
    const first = source[0];
    const create = first?.createSurface;
    if (!create) throw new Error('渐进序列需要第一条为 createSurface');
    const surfaceId = String(options.surfaceId || create.surfaceId || 'zhidao_lesson_preview');
    const chunkSize = Math.max(1, Number(options.chunkSize) || DEFAULT_CHUNK_SIZE);
    const components = Array.isArray(create.components) ? create.components : [];
    const dataModel = create.dataModel && typeof create.dataModel === 'object' ? create.dataModel : {};

    const out = [skeletonMessage(surfaceId, options.skeletonText)];
    // root 必须在第一批到达，否则骨架的 root 会一直指向不存在的提示条。
    const ordered = components.slice().sort((a, b) => (a?.id === 'root' ? -1 : 0) - (b?.id === 'root' ? -1 : 0));
    for (let i = 0; i < ordered.length; i += chunkSize) {
      const batch = ordered.slice(i, i + chunkSize);
      if (!batch.length) continue;
      out.push({ version: version(), updateComponents: { surfaceId, components: batch } });
    }
    // dataModel 顶层键逐条注入；值原样保留，绝不截断内容。
    for (const [key, value] of Object.entries(dataModel)) {
      out.push({ version: version(), updateDataModel: { surfaceId, path: `/${key}`, value } });
    }
    // 原始消息流里 createSurface 之后的补充消息（例如 /knowledge/poems）原样追加。
    for (const message of source.slice(1)) {
      const type = Object.keys(message).find(key => key !== 'version');
      if (!type || !message[type] || typeof message[type] !== 'object') continue;
      if (type === 'updateComponents' && !(message[type].components || []).length) continue;
      out.push({ version: message.version || version(), [type]: { ...message[type], surfaceId } });
    }
    out.meta = {
      progressive: true,
      surfaceId,
      chunkSize,
      originalCount: source.length,
      componentCount: components.length,
      updateComponentMessages: out.filter(m => m.updateComponents).length,
      updateDataModelMessages: out.filter(m => m.updateDataModel).length
    };
    return out;
  }

  /** SSE 逐条事件：index / total / type / line，line 就是一条完整 JSON 消息。 */
  function chunkEvents(complete, options = {}) {
    const messages = toProgressiveMessages(complete, options);
    const total = messages.length;
    return messages.map((message, index) => ({
      index, total,
      type: Object.keys(message).find(key => key !== 'version') || '',
      line: JSON.stringify(message)
    }));
  }

  /**
   * 语义等价校验：按 renderer.apply() 的规则重放一批消息，
   * 返回最终组件表与 dataModel。完整流与渐进流重放结果应逐字段一致。
   */
  function reassemble(messages) {
    let components = new Map();
    let model = {};
    for (const message of normalize(messages)) {
      const type = Object.keys(message).find(key => key !== 'version');
      const body = message[type];
      if (!body || typeof body !== 'object') continue;
      if (type === 'createSurface') {
        components = new Map();
        for (const item of body.components || []) components.set(item.id, item);
        model = JSON.parse(JSON.stringify(body.dataModel || {}));
      } else if (type === 'updateComponents') {
        for (const item of body.components || []) components.set(item.id, item);
      } else if (type === 'updateDataModel') {
        const parts = String(body.path || '').split('/').slice(1);
        let node = model;
        for (let i = 0; i < parts.length - 1; i++) {
          const key = parts[i].replace(/~1/g, '/').replace(/~0/g, '~');
          if (!node[key] || typeof node[key] !== 'object') node[key] = {};
          node = node[key];
        }
        if (parts.length) node[parts[parts.length - 1].replace(/~1/g, '/').replace(/~0/g, '~')] = body.value;
      }
    }
    return { components: Object.fromEntries(components), dataModel: model };
  }

  /** 逐字段比较两份重放结果，返回差异说明数组（空数组表示等价）。 */
  function diff(complete, progressive) {
    const a = reassemble(complete);
    const b = reassemble(progressive);
    const errors = [];
    const ids = new Set([...Object.keys(a.components), ...Object.keys(b.components)]);
    for (const id of ids) {
      if (id === SKELETON_ID) continue; // 骨架占位卡不在正式组件表里，允许残留
      if (JSON.stringify(a.components[id]) !== JSON.stringify(b.components[id])) {
        errors.push(`组件 ${id} 不一致`);
      }
    }
    if (JSON.stringify(a.dataModel) !== JSON.stringify(b.dataModel)) errors.push('dataModel 不一致');
    return errors;
  }

  /** 校验一批渐进消息是否遵守协议（可直接用 catalog.validateMessage 再过一遍）。 */
  function validate(messages, capabilities) {
    if (!catalog?.validateMessage) return { ok: true, errors: [] };
    const errors = [];
    for (const [index, message] of normalize(messages).entries()) {
      const check = catalog.validateMessage(message, capabilities);
      if (!check.ok) errors.push(`#${index}: ${check.errors.join('；')}`);
    }
    return { ok: errors.length === 0, errors };
  }

  const API = {
    DEFAULT_CHUNK_SIZE, SKELETON_ID, SKELETON_TEXT,
    normalize, toJSONL, skeletonMessage, toProgressiveMessages,
    chunkEvents, reassemble, diff, validate
  };
  if (isNode) module.exports = API;
  if (root) root.ZHIDAO_A2UI_STREAM = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
