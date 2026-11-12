/* 把用户体系接到主界面：顶栏入口、侧边栏身份、登录态联动。
 * 与 dynamic.js 解耦：本文件只负责「账号相关」的界面同步。 */
'use strict';

(function initIdentityUI() {
  const entry = document.getElementById('id-entry');
  const entryName = document.getElementById('id-entry-name');
  const profileAvatar = document.getElementById('profile-avatar');
  const profileName = document.getElementById('profile-name');
  const profileSub = document.getElementById('profile-sub');

  /** 根据登录态刷新界面上的身份信息。 */
  function renderIdentity() {
    const session = IDENTITY.current();
    if (!session?.user) {
      entryName.textContent = '登录';
      entry.title = '登录或创建家庭账号';
      profileAvatar.textContent = '知';
      profileName.textContent = '同学，你好';
      profileSub.textContent = '保持好奇，天天进步';
      return;
    }
    const user = session.user;
    entryName.textContent = user.name;
    entry.title = user.role === 'parent' ? '家庭成员管理' : '我的账号';
    profileAvatar.textContent = user.name.slice(0, 1);
    profileName.textContent = user.name;
    const family = session.family;
    if (user.role === 'parent') {
      const count = family?.members?.filter(m => m.role === 'student').length || 0;
      profileSub.textContent = count ? `家长 · 已添加 ${count} 位孩子` : '家长 · 去添加孩子';
    } else {
      profileSub.textContent = user.gradeLabel ? `学生 · ${user.gradeLabel}` : '学生';
    }
  }

  IDENTITY.onChange = renderIdentity;

  entry?.addEventListener('click', () => {
    const session = IDENTITY.current();
    if (!session?.user) {
      // 游客：引导注册家庭账号
      IDENTITY.openAuthDialog({});
      return;
    }
    if (session.user.role === 'parent') {
      IDENTITY.openMemberDialog();
      return;
    }
    // 学生端：展示自己的账号信息与退出
    IDENTITY.openAuthDialog({ familyId: session.family?.id, memberNames: [session.user.name] });
  });

  // 启动时恢复会话（校验本地令牌是否还有效）
  IDENTITY.restore().then(session => {
    renderIdentity();
    if (session?.user?.role === 'parent' && session.family) {
      // 家长登录后自动刷新家庭信息，保证成员数量是最新的
      IDENTITY.refreshFamily().then(renderIdentity);
    }
  });

  // 页面从后台切回时校验一次会话，避免令牌过期后仍显示为已登录
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (!IDENTITY.isLoggedIn()) return;
    IDENTITY.refreshFamily().then(renderIdentity);
  });

  renderIdentity();
})();
