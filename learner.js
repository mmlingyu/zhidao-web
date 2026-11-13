/* 学习者年级 · 前端形态控制器
 *
 * 职责：
 *   1. 决定「现在是谁在学」——只用登录学生账号里保存的年级；
 *   2. 把年级画像落到 DOM（data-stage + CSS 变量），让 CSS 统一改变字号、密度、
 *      卡片数量、按钮尺寸、隐藏/显示高级模块；
 *   3. 让浏览器缓存与请求都带上年级，避免切换孩子后看到上一份讲解。
 *
 * 边界：不改动讲解内容本身（那是服务端提示词的事），只管「怎么呈现」。
 */
'use strict';

const LEARNER = (() => {
  const listeners = new Set();
  let grades = [];
  let currentProfile = null;
  let appliedGrade = null;

  /** 当前生效年级：登录学生账号上的年级 id。空字符串表示未设置。 */
  function grade() {
    const fromProfile = window.ZHIDAO_GRADE?.accountGrade?.(window.IDENTITY?.current?.());
    if (typeof fromProfile === 'string') return fromProfile;
    const session = window.IDENTITY?.current?.();
    const user = session && session.user;
    if (user && user.role === 'student' && user.grade) return String(user.grade).trim();
    return '';
  }

  function virtualStageLabel() {
    return window.ZHIDAO_GRADE?.virtualStageForGrade?.(grade()) || '';
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

  /* ---------------- 顶栏只读阶段 ---------------- */

  function renderStage() {
    const host = document.getElementById('learner-stage');
    const label = document.getElementById('learner-stage-label');
    const setup = document.getElementById('learner-stage-setup');
    if (!host || !label) return;
    const value = grade();
    const virtual = virtualStageLabel();
    const session = window.IDENTITY?.current?.();
    const role = session?.user?.role || '';
    host.classList.toggle('is-missing', !virtual);
    if (virtual) {
      label.textContent = virtual;
      host.title = `当前阶段 ${virtual}，由账号年级决定`;
      host.setAttribute('aria-label', `当前学习阶段 ${virtual}`);
      if (setup) setup.hidden = true;
      return;
    }
    if (setup) setup.hidden = false;
    if (value) {
      label.textContent = '暂无对应阶段';
      host.title = '当前年级还没有对应的学习阶段';
      host.setAttribute('aria-label', '暂无对应阶段');
      if (setup) setup.hidden = true;
    } else if (role === 'parent') {
      label.textContent = '未设置年级';
      host.title = '在家庭空间为孩子填写年级';
      host.setAttribute('aria-label', '未设置年级，可在家庭空间为孩子填写');
    } else {
      label.textContent = '未设置年级';
      host.title = '登录学生账号后显示学习阶段';
      host.setAttribute('aria-label', '未设置年级，去登录或创建账号');
    }
  }

  function bindStage() {
    const setup = document.getElementById('learner-stage-setup');
    if (!setup || setup.dataset.bound === '1') return;
    setup.dataset.bound = '1';
    setup.addEventListener('click', () => {
      document.getElementById('id-entry')?.click();
    });
  }

  function publish(refreshLesson) {
    const next = grade();
    const changed = appliedGrade !== null && next !== appliedGrade;
    appliedGrade = next;
    renderStage();
    apply();
    if (changed) {
      try { localStorage.removeItem('zhidao-tutor-cache'); } catch { /* 忽略 */ }
      window.dispatchEvent(new CustomEvent('zhidao:learnerchange', { detail: { grade: next, profile: currentProfile } }));
      if (refreshLesson) window.dispatchEvent(new CustomEvent('zhidao:learnerrefresh'));
    }
  }

  async function init() {
    try {
      const response = await fetch((typeof window.ZHIDAO_API_URL === "function" ? window.ZHIDAO_API_URL : (p => p))('/api/grades'), { headers: { Accept: 'application/json' } });
      const data = await response.json().catch(() => null);
      if (Array.isArray(data?.grades)) grades = data.grades;
    } catch { /* 离线时用画像自带的兜底 */ }
    if (!grades.length) {
      grades = (window.ZHIDAO_GRADE?.STAGES || []).flatMap(stage =>
        stage.grades.map(id => ({ id, label: id })));
    }
    bindStage();
    appliedGrade = grade();
    renderStage();
    apply();
    // 登录、退出或家庭资料更新后，只跟账号里的年级走。
    window.addEventListener('zhidao:identitychange', () => publish(true));
    return currentProfile;
  }

  return { init, apply, grade, gradeLabel, profile, stage, hint, virtualStage: virtualStageLabel, onChange, get grades() { return grades; } };
})();

if (typeof window !== 'undefined') window.LEARNER = LEARNER;
