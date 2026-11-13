/* 知识库前端 · 家长可视化卡片墙 + 学习证据采集
 *
 * 两个身份看同一份数据，但问题不同：
 *   家长问「他到底会了什么、还差什么」→ 四包卡片墙 + 掌握率 + 目录空白
 *   孩子问「我刚才做对了吗」→ 视觉/听觉/心理三层即时反馈
 *
 * 数据来自 /api/cards/*，服务端按家庭成员隔离；未登录时静默降级为游客模式，
 * 不记录、不弹错，保证「打开即用」的原有体验不被账号体系破坏。
 */
'use strict';

const KNOWLEDGE = (() => {
  const SUBJECT_LABEL = { chinese: '语文', english: '英语', math: '数学' };
  const STATUS_LABEL = {
    new: '新知识', learning: '学习中', mastered: '已掌握', review: '需巩固'
  };
  const EVIDENCE_LABEL = {
    lesson: '听过讲解', correct: '练习答对', wrong: '练习答错',
    created: '独立完成', asked: '主动追问', recited: '朗读复述'
  };

  let board = null;
  let member = '';
  let subjectFilter = '';
  let opened = false;
  let lastCardStatus = new Map();

  const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));


  function apiUrl(path) {
    const fallback = () => {
      const base = String(window.ZHIDAO_API_BASE || '').trim().replace(/\/$/, '');
      return base + path;
    };
    try {
      if (typeof window.ZHIDAO_API_URL === 'function') return window.ZHIDAO_API_URL(path);
    } catch { /* 旧页面可能把这个名字占成别的值，走同源拼接 */ }
    return fallback();
  }
  function sessionToken() {
    try { return localStorage.getItem('zhidao.session.token') || ''; } catch { return ''; }
  }

  async function api(path, options = {}) {
    const token = sessionToken();
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(apiUrl(path), { ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || '操作失败，请稍后再试');
    return data;
  }

  function loggedIn() {
    return Boolean(sessionToken() && window.IDENTITY?.current?.()?.user);
  }

  /* ---------------- 学习证据采集 ---------------- */

  /**
   * 上报一条学习证据。fire-and-forget：记录失败绝不打断上课。
   * @param {object} payload { type, subject, title, point, detail }
   */
  async function record(payload = {}) {
    if (!loggedIn()) return null;
    try {
      const data = await api('/api/cards/record', {
        method: 'POST',
        body: JSON.stringify({
          type: payload.type || 'lesson',
          subject: payload.subject || stateSubject(),
          title: payload.title || stateTitle(),
          point: payload.point || payload.title || stateTitle(),
          detail: payload.detail || '',
          grade: window.LEARNER?.grade?.() || ''
        })
      });
      const card = data.card;
      if (card) {
        const before = lastCardStatus.get(card.id);
        // 状态跃迁到「已掌握」的瞬间，给一次完整的解锁反馈。
        if (card.status === 'mastered' && before && before !== 'mastered' && window.ZHIDAO_FEEDBACK) {
          window.ZHIDAO_FEEDBACK.mastered(payload.origin);
        }
        lastCardStatus.set(card.id, card.status);
      }
      return card;
    } catch { return null; }
  }

  // app.js / dynamic.js 的 state 是脚本顶层 const，不在 window 上，
  // 但同页脚本共享全局词法环境，用 typeof 安全读取即可。
  function appState() { return typeof state !== 'undefined' ? state : null; }
  function stateSubject() {
    const s = appState();
    return s?.dynamic?.subject || (['chinese', 'english', 'math'].includes(s?.topic) ? s.topic : 'chinese');
  }
  function stateTitle() { return appState()?.dynamic?.input || ''; }

  /** 一次练习结果：同时驱动反馈与证据。 */
  function practice(correct, options = {}) {
    const feedback = window.ZHIDAO_FEEDBACK;
    if (feedback) {
      if (correct) feedback.correct(options.subject || stateSubject(), options.origin);
      else feedback.wrong(options.origin);
    }
    return record({
      type: correct ? 'correct' : 'wrong',
      subject: options.subject || stateSubject(),
      title: options.title || stateTitle(),
      detail: options.detail || ''
    });
  }

  /* ---------------- 看板渲染 ---------------- */

  function createOverlay() {
    let root = document.getElementById('zk-overlay');
    if (root) return root;
    root = document.createElement('div');
    root.id = 'zk-overlay';
    root.className = 'zk-overlay';
    root.hidden = true;
    root.innerHTML = `<div class="zk-shell" role="dialog" aria-modal="true" aria-label="知识库卡片墙">
      <header class="zk-head">
        <div><span class="section-kicker">KNOWLEDGE LIBRARY</span><h2>知识库卡片墙</h2><p id="zk-sub">看得见的「会了」与「还差一点」</p></div>
        <div class="zk-head-actions">
          <label class="zk-field"><span>孩子</span><select id="zk-member"></select></label>
          <label class="zk-field"><span>学科</span><select id="zk-subject"><option value="">全部</option><option value="chinese">语文</option><option value="english">英语</option><option value="math">数学</option></select></label>
          <button class="icon-button" id="zk-close" aria-label="关闭"><svg><use href="#i-close"></use></svg></button>
        </div>
      </header>
      <div class="zk-body" id="zk-body"></div>
    </div>`;
    document.body.appendChild(root);
    root.querySelector('#zk-close').addEventListener('click', close);
    root.addEventListener('click', event => { if (event.target === root) close(); });
    root.querySelector('#zk-member').addEventListener('change', event => {
      member = event.target.value; load();
    });
    root.querySelector('#zk-subject').addEventListener('change', event => {
      subjectFilter = event.target.value; render();
    });
    return root;
  }

  function renderMemberPicker() {
    const select = document.querySelector('#zk-member');
    if (!select) return;
    const family = window.IDENTITY?.current?.()?.family;
    const members = family?.members?.filter(item => item.role === 'student') || [];
    if (!members.length) {
      select.innerHTML = '<option value="">自己</option>';
      select.disabled = true;
      return;
    }
    select.disabled = false;
    const valid = members.some(item => item.id === member);
    if (!valid) member = members[0].id;
    select.innerHTML = members.map(item =>
      `<option value="${esc(item.id)}">${esc(item.name)}${item.gradeLabel ? ` · ${esc(item.gradeLabel)}` : ''}</option>`).join('');
    select.value = member;
  }

  function open() {
    if (!loggedIn()) {
      if (window.IDENTITY?.openAuthDialog) window.IDENTITY.openAuthDialog({});
      else if (window.showToast) window.showToast('登录后家长就能看到孩子的知识库');
      return;
    }
    createOverlay();
    opened = true;
    document.getElementById('zk-overlay').hidden = false;
    document.body.classList.add('zk-open');
    renderMemberPicker();
    load();
  }

  function close() {
    opened = false;
    const root = document.getElementById('zk-overlay');
    if (root) root.hidden = true;
    document.body.classList.remove('zk-open');
  }

  async function load() {
    const body = document.getElementById('zk-body');
    if (!body) return;
    body.innerHTML = '<div class="zk-loading">正在取回孩子的知识卡片…</div>';
    try {
      const params = new URLSearchParams();
      if (member) params.set('member', member);
      const data = await api(`/api/cards/board?${params.toString()}`);
      board = data;
      for (const card of data.cards || []) lastCardStatus.set(card.id, card.status);
      render();
    } catch (error) {
      body.innerHTML = `<div class="zk-empty"><h3>暂时打不开知识库</h3><p>${esc(error.message)}</p></div>`;
    }
  }

  function filtered(cards) {
    return subjectFilter ? cards.filter(card => card.subject === subjectFilter) : cards;
  }

  function render() {
    const body = document.getElementById('zk-body');
    if (!body || !board) return;
    const cards = filtered(board.cards || []);
    const summary = summarize(cards);
    const packs = (board.packs || []).map(pack => ({ ...pack, cards: filtered(pack.cards) }))
      .filter(pack => pack.cards.length);
    const pending = (board.pending || []).filter(item => !subjectFilter || item.subject === subjectFilter);

    const parts = [];
    parts.push(`<section class="zk-overview">
      <div class="zk-metric"><span>知识卡片</span><b>${summary.total}</b><small>孩子碰过的知识点</small></div>
      <div class="zk-metric mastered"><span>已掌握</span><b>${summary.mastered}</b><small>能独立做对</small></div>
      <div class="zk-metric review"><span>需巩固</span><b>${summary.review}</b><small>该回来练一次</small></div>
      <div class="zk-rate"><div class="zk-rate-head"><span>掌握率</span><b>${summary.masteryRate}%</b></div>
        <div class="zk-rate-track"><span style="width:${summary.masteryRate}%"></span></div>
        <small>已掌握 / 已经学过的知识点</small></div>
    </section>`);

    if (!cards.length && !pending.length) {
      parts.push(`<div class="zk-empty"><h3>知识库还是空的</h3>
        <p>孩子每学完一个知识点、每做对一道练习，这里就会长出一张卡片。<br>不用手动登记，用着用着就满了。</p></div>`);
    }

    for (const pack of packs) {
      parts.push(`<section class="zk-pack zk-pack-${pack.color}">
        <header class="zk-pack-head"><div><span class="zk-pack-dot"></span><h3>${esc(pack.title)}</h3>
          <span class="zk-pack-count">${pack.cards.length} 张</span></div>
          <p>${esc(pack.subtitle)}</p></header>
        <div class="zk-grid">${pack.cards.map(cardHTML).join('')}</div>
      </section>`);
    }

    if (pending.length) {
      parts.push(`<section class="zk-pack zk-pack-new">
        <header class="zk-pack-head"><div><span class="zk-pack-dot"></span><h3>接下来可以学</h3>
          <span class="zk-pack-count">${pending.length} 个</span></div>
          <p>按年级课标列出，孩子还没碰过的知识点</p></header>
        <div class="zk-pending">${pending.slice(0, 12).map(item =>
          `<button class="zk-pending-item" data-zk-topic="${esc(item.title)}">
            <i class="zk-subject-dot ${esc(item.subject)}"></i>
            <span><strong>${esc(item.title)}</strong><small>${esc(item.subjectLabel)} · ${esc((item.tags || []).join(' / '))}</small></span>
            <svg><use href="#i-arrow"></use></svg></button>`).join('')}</div>
      </section>`);
    }

    body.innerHTML = parts.join('');
    bindCards(body);
  }

  function summarize(cards) {
    const by = { new: 0, learning: 0, mastered: 0, review: 0 };
    for (const card of cards) if (by[card.status] !== undefined) by[card.status] += 1;
    const attempted = cards.length - by.new;
    return { ...by, total: cards.length, masteryRate: attempted ? Math.round(by.mastered / attempted * 100) : 0 };
  }

  function cardHTML(card) {
    const mastery = Math.round(Number(card.mastery || 0) * 100);
    const subject = SUBJECT_LABEL[card.subject] || '综合';
    const evidence = (card.evidence || []).slice(-4).reverse();
    const last = card.updatedAt ? new Date(card.updatedAt) : null;
    const when = last ? `${last.getMonth() + 1}月${last.getDate()}日` : '';
    return `<article class="zk-card zk-status-${esc(card.status)}" data-zk-card="${esc(card.id)}">
      <div class="zk-card-inner">
        <div class="zk-card-face zk-card-front">
          <div class="zk-card-top"><i class="zk-subject-dot ${esc(card.subject)}"></i><span>${esc(subject)}</span>
            <b class="zk-badge">${esc(STATUS_LABEL[card.status] || card.status)}</b></div>
          <h4>${esc(card.title || card.point)}</h4>
          <p class="zk-card-reason">${esc(card.reason || '')}</p>
          <div class="zk-card-foot">
            <div class="zk-ring" style="--pct:${mastery}"><span>${mastery}</span></div>
            <div class="zk-card-meta"><small>${esc(when)}</small><span>答对 ${Number(card.correctCount || 0)} 次</span></div>
            <button type="button" class="zk-continue" data-zk-continue="${esc(card.title || card.point)}">继续学习</button>
          </div>
        </div>
        <div class="zk-card-face zk-card-back">
          <h4>${esc(card.title || card.point)}</h4>
          <div class="zk-timeline">${evidence.length ? evidence.map(item =>
            `<div class="zk-tl-item"><i></i><span>${esc(item.meta || EVIDENCE_LABEL[item.type] || item.type)}</span>
              <small>${new Date(item.at).toLocaleDateString('zh-CN')}</small></div>`).join('') : '<p class="zk-tl-empty">还没有学习记录</p>'}</div>
          <div class="zk-card-actions">
            <button type="button" class="zk-continue" data-zk-continue="${esc(card.title || card.point)}">继续学习</button>
            <button class="zk-mark" data-zk-mark="1" data-zk-id="${esc(card.id)}">我确认他掌握了</button>
            <button class="zk-mark ghost" data-zk-mark="0" data-zk-id="${esc(card.id)}">还需练习</button>
          </div>
        </div>
      </div>
    </article>`;
  }

  /** 关闭知识库，打开首页该知识点的讲解详情（有缓存则秒开）。 */
  function continueLearning(topic) {
    const query = String(topic || '').trim();
    if (!query) return;
    const input = document.getElementById('topic-input');
    if (input) {
      input.value = query;
      if (typeof updateDetection === 'function') {
        try { updateDetection(); } catch { /* noop */ }
      }
    }
    close();
    if (typeof closeSidebar === 'function') {
      try { closeSidebar(); } catch { /* noop */ }
    }
    const start = (typeof window !== 'undefined' && typeof window.startLesson === 'function')
      ? window.startLesson
      : (typeof startLesson === 'function' ? startLesson : null);
    if (start) start();
    else if (window.showToast) window.showToast('请在首页搜索框打开这节讲解');
    const section = document.getElementById('lesson-section');
    if (section) {
      try { section.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch { /* noop */ }
    }
  }

  function bindCards(body) {
    body.querySelectorAll('[data-zk-card]').forEach(card => {
      card.addEventListener('click', event => {
        if (event.target.closest('[data-zk-mark], [data-zk-continue]')) return;
        card.classList.toggle('flipped');
        if (window.ZHIDAO_FEEDBACK) window.ZHIDAO_FEEDBACK.flip();
      });
    });
    body.querySelectorAll('[data-zk-continue]').forEach(button => {
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        continueLearning(button.dataset.zkContinue);
      });
    });
    body.querySelectorAll('[data-zk-mark]').forEach(button => {
      button.addEventListener('click', async event => {
        event.stopPropagation();
        const id = button.dataset.zkId;
        const mastered = button.dataset.zkMark === '1';
        button.disabled = true;
        try {
          const params = new URLSearchParams();
          if (member) params.set('member', member);
          await api(`/api/cards/${encodeURIComponent(id)}/mark?${params.toString()}`, {
            method: 'POST', body: JSON.stringify({ mastered })
          });
          if (mastered && window.ZHIDAO_FEEDBACK) window.ZHIDAO_FEEDBACK.mastered(button);
          if (window.showToast) window.showToast(mastered ? '已标记为掌握' : '已放回练习区');
          await load();
        } catch (error) {
          button.disabled = false;
          if (window.showToast) window.showToast(error.message, 'error');
        }
      });
    });
    body.querySelectorAll('[data-zk-topic]').forEach(button => {
      button.addEventListener('click', () => {
        const input = document.getElementById('topic-input');
        if (input) input.value = button.dataset.zkTopic;
        close();
        if (window.startLesson) window.startLesson();
        else document.getElementById('zk-overlay')?.remove();
      });
    });
  }

  /** 顶栏/侧栏入口绑定。 */
  function bindEntry() {
    const entry = document.getElementById('knowledge-entry');
    if (entry) entry.addEventListener('click', open);
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && opened) close();
    });
    window.addEventListener('zhidao:learnerchange', () => { if (opened) load(); });
  }

  function init() {
    bindEntry();
    // 学生登录后自动同步反馈语气
    LEARNER.onChange(profile => {
      if (window.ZHIDAO_FEEDBACK && profile) window.ZHIDAO_FEEDBACK.setGrade(LEARNER.grade());
    });
  }

  return { init, open, close, load, record, practice, render, get board() { return board; } };
})();

if (typeof window !== 'undefined') window.KNOWLEDGE = KNOWLEDGE;
