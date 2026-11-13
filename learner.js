/* 学习者年级 · 前端形态控制器
 *
 * 职责：
 *   1. 决定「现在是谁在学」——登录学生用自己年级，家长/游客可手动选年级；
 *   2. 把年级画像落到 DOM（data-stage + CSS 变量），让 CSS 统一改变字号、密度、
 *      卡片数量、按钮尺寸、隐藏/显示高级模块；
 *   3. 让浏览器缓存与请求都带上年级，避免切换孩子后看到上一份讲解。
 *
 * 边界：不改动讲解内容本身（那是服务端提示词的事），只管「怎么呈现」。
 */
'use strict';

const LEARNER = (() => {
  const PICK_KEY = 'zhidao.learner.grade';
  const listeners = new Set();
  let manualGrade = '';
  let grades = [];
  let currentProfile = null;

  function readPicked() {
    try { return String(localStorage.getItem(PICK_KEY) || '').trim(); } catch { return ''; }
  }

  /** 当前生效年级：手动选择 > 登录学生自己的年级 > 空（通用）。 */
  function grade() {
    if (manualGrade) return manualGrade;
    const session = window.IDENTITY?.current?.();
    if (session?.user?.role === 'student' && session.user.grade) return session.user.grade;
    return '';
  }

  function profile() {
    return window.ZHIDAO_GRADE?.uiProfileForGrade?.(grade()) || null;
  }

  function stage() { return profile()?.id || 'generic'; }

  /** 取当前年级的栏目操作提示（诗文 / 写作）。未选年级时返回中性文案。 */
  function hint(key) {
    return window.ZHIDAO_GRADE?.hintForGrade?.(grade(), key) || null;
  }

  function gradeLabel() {
    const value = grade();
    if (!value) return '通用';
    return grades.find(item => item.id === value)?.label || window.ZHIDAO_GRADE?.stageForGrade?.(value)?.label || '通用';
  }

  /**
   * 把画像应用到文档根节点。
   * CSS 用 [data-stage="early"] 等选择器统一处理，避免每个组件各写一套判断。
   */
  function apply() {
    const p = profile();
    currentProfile = p;
    const root = document.documentElement;
    root.dataset.stage = p ? p.id : 'generic';
    root.dataset.density = p?.ui?.density || 'balanced';
    root.dataset.tone = p?.tone || 'child';
    root.dataset.celebration = p?.interaction?.celebration || 'medium';
    root.dataset.gesture = p?.interaction?.gesture || 'click';
    if (p) {
      root.style.setProperty('--zd-stage-font', String(p.ui.fontSize));
      root.style.setProperty('--zd-stage-cards', String(p.ui.cardsPerScreen));
      root.style.setProperty('--zd-mascot-amp', String(p.ui.mascotIntensity));
    } else {
      root.style.removeProperty('--zd-stage-font');
      root.style.removeProperty('--zd-stage-cards');
      root.style.removeProperty('--zd-mascot-amp');
    }
    // 反馈语气与年级同步：给初中生发「太棒啦」是负向激励。
    if (window.ZHIDAO_FEEDBACK) {
      window.ZHIDAO_FEEDBACK.setGrade(grade());
      const intensity = p?.interaction?.feedback || 'moderate';
      let muted = false;
      try { muted = localStorage.getItem('zhidao.feedback.muted') === '1'; } catch { /* 忽略 */ }
      window.ZHIDAO_FEEDBACK.setEnabled(!muted && intensity !== 'none');
      window.ZHIDAO_FEEDBACK.setVolume(intensity === 'rich' ? 0.36 : intensity === 'minimal' ? 0.16 : 0.26);
    }
    for (const fn of listeners) { try { fn(p); } catch { /* 单个监听失败不影响其它 */ } }
    return p;
  }

  function onChange(fn) {
    if (typeof fn === 'function') listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function setGrade(next) {
    const value = String(next || '').trim();
    manualGrade = value;
    try {
      if (value) localStorage.setItem(PICK_KEY, value);
      else localStorage.removeItem(PICK_KEY);
    } catch { /* 隐私模式下不持久化，本次会话仍生效 */ }
    renderPicker();
    apply();
    // 年级变化后清空浏览器课程缓存：同一知识点不同年级不是同一份课。
    try { localStorage.removeItem('zhidao-tutor-cache'); } catch { /* 忽略 */ }
    window.dispatchEvent(new CustomEvent('zhidao:learnerchange', { detail: { grade: value, profile: currentProfile } }));
  }

  /* ---------------- 顶栏年级选择器 ---------------- */

  function renderPicker() {
    const select = document.getElementById('learner-grade');
    if (!select || !grades.length) return;
    const active = grade();
    select.innerHTML = `<option value="">通用</option>` + grades
      .map(item => `<option value="${item.id}">${item.label}</option>`).join('');
    select.value = active;
    const hint = document.getElementById('learner-hint');
    if (hint) hint.textContent = currentProfile?.label || '通用';
  }

  function bindPicker() {
    const select = document.getElementById('learner-grade');
    if (!select) return;
    select.addEventListener('change', () => {
      setGrade(select.value);
      if (window.showToast) window.showToast(select.value ? `已切换为${gradeLabel()}的讲法` : '已切回通用讲解');
      // 当前已渲染的课程需要按新年级重新生成，否则「内容还是原来的」。
      window.dispatchEvent(new CustomEvent('zhidao:learnerrefresh'));
    });
  }

  async function init() {
    manualGrade = readPicked();
    try {
      const response = await fetch((typeof window.ZHIDAO_API_URL === "function" ? window.ZHIDAO_API_URL : (p => p))('/api/grades'), { headers: { Accept: 'application/json' } });
      const data = await response.json().catch(() => null);
      if (Array.isArray(data?.grades)) grades = data.grades;
    } catch { /* 离线时用画像自带的兜底 */ }
    if (!grades.length) {
      grades = (window.ZHIDAO_GRADE?.STAGES || []).flatMap(stage =>
        stage.grades.map((id, i) => ({ id, label: `${stage.label}${i ? '' : ''} · ${id}` })));
    }
    renderPicker();
    apply();
    bindPicker();
    // 登录状态变化时（人脸/口令登录、退出），学生年级可能变了。
    // 注意：手动选择的年级优先于会话年级，所以登录变化只重算，不覆盖用户选择。
    window.addEventListener('zhidao:identitychange', () => {
      renderPicker(); apply();
      // 登录/退出可能改变学生年级，已渲染课程的栏目提示需要跟着变。
      window.dispatchEvent(new CustomEvent('zhidao:learnerchange', { detail: { grade: grade(), profile: currentProfile } }));
    });
    return currentProfile;
  }

  return { init, apply, grade, gradeLabel, profile, stage, hint, setGrade, onChange, get grades() { return grades; } };
})();

if (typeof window !== 'undefined') window.LEARNER = LEARNER;
