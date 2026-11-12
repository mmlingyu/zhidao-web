/* 用户体系前端：登录（人脸 / 口令）、家长注册、成员管理。
 *
 * 与主应用的边界：学习功能保持「打开即用」，
 * 账号体系是可选增强 —— 未登录也能学习，登录后才有家庭空间与成员管理。
 */
'use strict';

const IDENTITY = (() => {
  const TOKEN_KEY = 'zhidao.session.token';
  const USER_KEY = 'zhidao.session.user';
  const FAMILY_KEY = 'zhidao.session.family';

  let session = null;      // { token, user, family }
  let grades = [];
  let gradesPromise = null; // 年级列表的加载中 Promise（并发调用共享）
  let camera = null;       // 摄像头句柄
  let onChange = null;     // 登录状态变化回调

  /* ---------------- 年级列表 ---------------- */

  /**
   * 拉取年级列表。
   *
   * 为什么必须单独加载：年级下拉在「注册家长」弹窗里，而注册对未登录用户开放；
   * 而 /api/me 需要令牌。早期版本只在登录后取年级，导致游客打开注册弹窗时
   * 下拉框里只有一个空值占位项，根本选不��任何年级。
   */
  async function ensureGrades() {
    if (grades.length) return grades;
    if (!gradesPromise) {
      gradesPromise = fetch(window.ZHIDAO_API_URL('/api/grades'), { headers: { Accept: 'application/json' } })
        .then(response => (response.ok ? response.json() : null))
        .then(data => {
          if (Array.isArray(data?.grades)) grades = data.grades;
          return grades;
        })
        .catch(() => grades)
        .finally(() => { gradesPromise = null; });
    }
    await gradesPromise;
    return grades;
  }

  /* ---------------- 会话 ---------------- */

  function readSession() {
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      const user = JSON.parse(localStorage.getItem(USER_KEY) || 'null');
      if (!token || !user) return null;
      return { token, user, family: JSON.parse(localStorage.getItem(FAMILY_KEY) || 'null') };
    } catch { return null; }
  }

  function saveSession(next) {
    session = next;
    if (next?.token) {
      localStorage.setItem(TOKEN_KEY, next.token);
      localStorage.setItem(USER_KEY, JSON.stringify(next.user));
      localStorage.setItem(FAMILY_KEY, JSON.stringify(next.family || null));
    } else {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem(FAMILY_KEY);
    }
    if (onChange) onChange(session);
    // 年级形态、知识库、反馈语气都要跟着登录身份变（学生登录后自动用自己的年级）。
    try { window.dispatchEvent(new CustomEvent('zhidao:identitychange', { detail: session })); } catch { /* 忽略 */ }
  }

  function current() { return session || readSession(); }
  function isLoggedIn() { return Boolean(current()?.token); }
  function isParent() { return current()?.user?.role === 'parent'; }

  /** 带会话令牌请求；未登录时直接抛错。 */
  async function api(path, { method = 'GET', body = null } = {}) {
    const active = current();
    // current() 要求同时有 token 与 user；恢复会话时可能只有 token，
    // 这里兜底读一次存储，保证请求能带上凭证。
    const token = active?.token || localStorage.getItem(TOKEN_KEY) || '';
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(window.ZHIDAO_API_URL(path), {
      method, headers, body: body ? JSON.stringify(body) : undefined
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || '操作失败，请稍后重试');
    return data;
  }

  /** 启动时校验本地令牌是否仍有效。 */
  async function restore() {
    const saved = readSession();
    // 只要令牌还在就尝试恢复：用户档案可以由 /api/me 重新取回。
    // （只存 token 不存 user 是常见情况 —— 例如清了站点的其他存储。）
    if (!saved?.token) {
      const token = localStorage.getItem(TOKEN_KEY);
      if (!token) return null;
      try {
        const data = await api('/api/me');
        saveSession({ token, user: data.user, family: data.family });
        grades = data.grades || [];
        return session;
      } catch {
        saveSession(null);
        return null;
      }
    }
    try {
      const data = await api('/api/me');
      saveSession({ token: saved.token, user: data.user, family: data.family });
      grades = data.grades || [];
      return session;
    } catch {
      // 令牌过期或被撤销：清掉本地状态，回到游客模式。
      saveSession(null);
      return null;
    }
  }

  async function logout() {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* 忽略 */ }
    saveSession(null);
  }

  /* ---------------- 界面构建 ---------------- */

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  /**
   * 生成年级下拉框。
   * @param {string} selected 预选年级 id
   * @param {boolean} loading 年级列表是否还在加载
   */
  function gradeOptions(selected = '', loading = false) {
    const select = el('select', 'id-field');
    select.innerHTML = loading
      ? '<option value="">正在加载年级…</option>'
      : '<option value="">请选择年级</option>';
    for (const grade of grades) {
      const option = el('option', '', grade.label);
      option.value = grade.id;
      if (grade.id === selected) option.selected = true;
      select.appendChild(option);
    }
    // 列表为空时禁用下拉，避免用户对着空控件发呆。
    if (!grades.length && !loading) {
      select.innerHTML = '<option value="">年级加载失败，请稍后重试</option>';
      select.disabled = true;
    }
    return select;
  }

  /** 人脸采集区：视频预览 + 状态提示 + 开始按钮。 */
  function facePanel({ title, hint, onCapture }) {
    const wrap = el('div', 'id-face-panel');
    wrap.innerHTML = `
      <div class="id-video-box">
        <video id="id-video" playsinline muted></video>
        <div class="id-video-idle" id="id-video-idle">
          <svg><use href="#i-face"></use></svg>
          <span>摄像头未开启</span>
        </div>
        <div class="id-face-ring" id="id-face-ring" hidden></div>
      </div>
      <p class="id-face-hint" id="id-face-hint">${hint}</p>
      <div class="id-face-actions">
        <button type="button" class="id-btn ghost" id="id-camera-toggle">开启摄像头</button>
        <button type="button" class="id-btn primary" id="id-capture" disabled>${title}</button>
      </div>`;
    return wrap;
  }

  async function ensureCamera(video, statusNode) {
    if (camera) return camera;
    statusNode.classList.remove('warn');
    statusNode.textContent = '正在加载人脸模型…';
    try {
      await FACE.load();
      camera = await FACE.openCamera(video);
      statusNode.textContent = '正对摄像头，采光要好';
      video.closest('.id-video-box')?.classList.add('live');
      return camera;
    } catch (error) {
      // 模型加载失败不再是笼统的「检查网络」：把具体原因和下一步动作展示出来，
      // 同时把口令路径顶到显眼位置 —— 人脸是可选增强，不能挡住注册/登录。
      const modelError = error?.code === 'FACE_MODEL';
      // hint 可能已包含在 message 里，避免把同一句指引重复展示两遍。
      const hint = modelError && error.hint && !error.message.includes(error.hint) ? `。${error.hint}` : '';
      statusNode.textContent = modelError
        ? `${error.message}${hint}`
        : (error.message || '无法开启摄像头');
      statusNode.classList.add('warn');
      if (modelError) {
        const captureBtn = document.getElementById('id-capture');
        if (captureBtn) captureBtn.disabled = true; // 模型没就绪时不允许采集
        const secretTab = document.getElementById('id-tab-secret');
        if (secretTab) {
          secretTab.textContent = '改用口令登录';
          secretTab.classList.add('highlight');
        }
        const toggle = document.getElementById('id-camera-toggle');
        if (toggle) {
          toggle.disabled = false;
          toggle.textContent = '重试加载模型';
        }
      }
      throw error;
    }
  }

  /** 摄像头不可用时给出替代路径：改用口令登录。 */
  function cameraFallbackNotice(statusNode) {
    const support = FACE.cameraSupport ? FACE.cameraSupport() : { ok: true };
    if (support.ok) return false;
    statusNode.textContent = support.reason;
    statusNode.classList.add('warn');
    // 非安全上下文（局域网 http 访问）在移动端最常见，直接提示切换到口令登录。
    const secretTab = document.getElementById('id-tab-secret');
    if (secretTab) {
      secretTab.textContent = '口令登录（摄像头不可用）';
      secretTab.classList.add('highlight');
    }
    return true;
  }

  function stopCamera() {
    if (camera) { camera.stop(); camera = null; }
    document.getElementById('id-video')?.closest('.id-video-box')?.classList.remove('live');
  }

  /* ---------------- 登录 / 注册弹窗 ---------------- */

  /**
   * 打开登录注册弹窗。
   * @param {object} options
   * @param {string} options.familyId 要登录的家庭（人脸登录需要）
   * @param {string[]} options.memberNames 家庭成员姓名（口令登录用）
   */
  function openAuthDialog({ familyId = '', memberNames = [] } = {}) {
    // 提前把年级拉回来：绝大多数情况下用户点开弹窗时列表已经就绪。
    ensureGrades();
    const backdrop = document.getElementById('modal-backdrop');
    const body = document.getElementById('modal-body');
    document.getElementById('modal-kicker').textContent = '知岛账号';
    document.getElementById('modal-title').textContent = familyId ? '人脸登录' : '开始使用知岛';
    body.innerHTML = '';

    const tabs = el('div', 'id-tabs');
    // id 必须唯一：两个标签按钮分别用 id-tab-face / id-tab-secret，
    // 否则 getElementById 只会命中第一个，后续逻辑拿不到第二个。
    const tabFace = el('button', 'id-tab active', familyId ? '人脸登录' : '注册家长');
    tabFace.id = 'id-tab-face';
    const tabSecret = el('button', 'id-tab', '口令登录');
    tabSecret.id = 'id-tab-secret';
    tabs.append(tabFace, tabSecret);
    body.appendChild(tabs);

    const panel = el('div', 'id-panel');
    body.appendChild(panel);

    const renderFace = () => {
      panel.innerHTML = '';
      const tip = el('p', 'id-lead');
      tip.textContent = familyId
        ? '对着摄像头，知岛会认出你。'
        : '创建一个家庭账号，之后可以添加孩子的学习空间。';      panel.appendChild(tip);

      const form = el('div', 'id-form');
      if (!familyId) {
        const nameField = el('label', 'id-label');
        nameField.append(el('span', '', '你的称呼'), (() => {
          const input = el('input', 'id-field');
          input.id = 'id-name';
          input.placeholder = '例如：王妈妈';
          input.maxLength = 24;
          return input;
        })());
        const gradeField = el('label', 'id-label');
        gradeField.append(el('span', '', '孩子年级'), gradeOptions('', !grades.length));
        gradeField.querySelector('select').id = 'id-grade';
        form.append(nameField, gradeField);

        const secretField = el('label', 'id-label');
        secretField.append(el('span', '', '登录口令（选填，用于摄像头不可用时登录）'), (() => {
          const input = el('input', 'id-field');
          input.id = 'id-secret';
          input.type = 'password';
          input.placeholder = '至少 4 位';
          return input;
        })());
        form.appendChild(secretField);
      }
      const capturePanel = facePanel({
        title: familyId ? '开始识别' : '采集人脸（选填）',
        hint: familyId
          ? '正对摄像头，识别仅在本机完成'
          : '录入人脸后可用摄像头直接登录；不录也能先用口令登录，之后随时补录'
      });

      // 注册模式下人脸是「可选增强」，账号本身必须能独立创建 ——
      // 否则非 HTTPS（摄像头不可用）的用户根本无法注册。
      // 提交按钮放在采集区之前：它是表单的主动作，不该被折叠在摄像头画面下面。
      let descriptors = null;
      const submit = familyId ? null : el('button', 'id-btn primary wide', '创建账号');
      if (submit) form.appendChild(submit);

      form.appendChild(capturePanel);
      panel.appendChild(form);

      // 年级列表可能还在路上：拿到后把下拉框重新填上，否则用户只能看到一个空控件。
      if (!familyId && !grades.length) {
        ensureGrades().then(list => {
          const select = document.getElementById('id-grade');
          if (!select || !list.length) return;
          const previous = select.value;
          select.innerHTML = '<option value="">请选择年级</option>';
          for (const grade of list) {
            const option = el('option', '', grade.label);
            option.value = grade.id;
            select.appendChild(option);
          }
          select.disabled = false;
          if (previous) select.value = previous;
        });
      }

      const video = capturePanel.querySelector('#id-video');
      const status = capturePanel.querySelector('#id-face-hint');
      const captureBtn = capturePanel.querySelector('#id-capture');
      const cameraBtn = capturePanel.querySelector('#id-camera-toggle');

      // 摄像头不可用（非 HTTPS / 浏览器不支持）时提前提示并引导改用口令。
      const blocked = cameraFallbackNotice(status);
      if (blocked) {
        captureBtn.disabled = true;
        cameraBtn.disabled = true;
        cameraBtn.textContent = '摄像头不可用';
      }

      cameraBtn.addEventListener('click', async () => {
        try {
          await ensureCamera(video, status);
          captureBtn.disabled = false;
          cameraBtn.textContent = '重新开启';
          status.classList.remove('warn');
          const secretTab = document.getElementById('id-tab-secret');
          if (secretTab) { secretTab.textContent = '口令登录'; secretTab.classList.remove('highlight'); }
        } catch (error) { showToast(error.message, 'error'); }
      });

      captureBtn.addEventListener('click', async () => {
        captureBtn.disabled = true;
        const original = captureBtn.textContent;
        captureBtn.textContent = '采集中…';
        try {
          if (familyId) {
            const one = await FACE.describe(video, { minScore: 0.5 });
            captureBtn.textContent = original;
            await submitAuth([one.descriptor]);
            return;
          }
          const multi = await FACE.describeMulti(video, { samples: 3, minScore: 0.5 });
          descriptors = multi.descriptors;
          captureBtn.textContent = '✓ 已采集';
          status.textContent = '人脸已采集，可以创建账号了';
          captureBtn.disabled = false;
        } catch (error) {
          captureBtn.textContent = original;
          captureBtn.disabled = false;
          status.textContent = error.message || '采集失败，请重试';
        }
      });

      if (submit) {
        submit.addEventListener('click', async () => {
          submit.disabled = true;
          try {
            await submitAuth(descriptors);
          } catch (error) {
            showToast(error.message, 'error');
            submit.disabled = false;
          }
        });
      }
    };

    const renderSecret = () => {
      panel.innerHTML = '';
      const tip = el('p', 'id-lead');
      tip.textContent = '用账号与口令登录。账号可以填你注册时的称呼。';
      panel.appendChild(tip);
      const form = el('div', 'id-form');
      const userField = el('label', 'id-label');
      // 用输入框而不是下拉：游客态没有成员列表，下拉永远是空的，等于没有登录入口。
      const userInput = el('input', 'id-field');
      userInput.id = 'id-user';
      userInput.placeholder = '例如：王妈妈';
      userInput.maxLength = 40;
      userInput.autocomplete = 'username';
      // 已知成员做成候选项，输入时能直接选中，不用逐字手打。
      if (memberNames.length) {
        const list = el('datalist', 'id-user-list');
        list.id = 'id-user-list';
        for (const name of memberNames) {
          const option = el('option');
          option.value = name;
          list.appendChild(option);
        }
        userInput.setAttribute('list', 'id-user-list');
        form.appendChild(list);
      }
      userField.append(el('span', '', '账号'), userInput);
      const secretField = el('label', 'id-label');
      secretField.append(el('span', '', '口令'), (() => {
        const input = el('input', 'id-field');
        input.id = 'id-secret-login';
        input.type = 'password';
        input.placeholder = '请输入口令';
        input.autocomplete = 'current-password';
        return input;
      })());
      form.append(userField, secretField);
      const submit = el('button', 'id-btn primary wide', '登录');
      form.appendChild(submit);
      panel.appendChild(form);
      submit.addEventListener('click', async () => {
        submit.disabled = true;
        try {
          const account = document.getElementById('id-user').value.trim();
          const secret = document.getElementById('id-secret-login').value;
          if (!account || !secret) throw new Error('请填写账号与口令');
          const data = await api('/api/auth/login/secret', { method: 'POST', body: { account, secret } });
          saveSession({ token: data.token, user: data.user, family: null });
          await refreshFamily();
          closeDialog();
          showToast(`欢迎回来，${data.user.name}`);
        } catch (error) {
          showToast(error.message, 'error');
          submit.disabled = false;
        }
      });
    };

    const submitAuth = async (descriptors) => {
      if (familyId) {
        const data = await api('/api/auth/login/face', { method: 'POST', body: { familyId, descriptor: descriptors } });
        saveSession({ token: data.token, user: data.user, family: null });
        await refreshFamily();
        closeDialog();
        showToast(`欢迎回来，${data.user.name}`);
        return;
      }
      const name = document.getElementById('id-name').value.trim();
      if (!name) throw new Error('请填写你的称呼');
      const grade = document.getElementById('id-grade').value;
      const secret = document.getElementById('id-secret').value;
      const data = await api('/api/auth/register', {
        method: 'POST',
        body: { name, grade, secret: secret || undefined, descriptor: descriptors }
      });
      saveSession({ token: data.token, user: data.user, family: data.family });
      grades = data.grades || grades;
      closeDialog();
      showToast('家庭已创建，去添加孩子吧');
      openMemberDialog();
    };

    tabFace.addEventListener('click', () => {
      tabFace.classList.add('active'); tabSecret.classList.remove('active');
      renderFace();
    });
    tabSecret.addEventListener('click', () => {
      tabSecret.classList.add('active'); tabFace.classList.remove('active');
      renderSecret();
    });

    backdrop.dataset.closable = '1';
    // 先渲染再显示，不阻塞首屏；年级列表没到位时下拉是「正在加载」占位，
    // 到位后由 ensureGrades 的回调填充（见上方 gradeOptions 调用处）。
    renderFace();
    backdrop.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeDialog() {
    const backdrop = document.getElementById('modal-backdrop');
    backdrop.hidden = true;
    delete backdrop.dataset.closable;
    // 与 app.js 的 closeModal 保持一致：恢复页面滚动。
    document.body.style.overflow = '';
    document.body.classList.remove('modal-open');
    stopCamera();
  }

  /* ---------------- 成员管理 ---------------- */

  async function refreshFamily() {
    const active = current();
    if (!active?.token) return null;
    try {
      const data = await api('/api/me');
      saveSession({ token: active.token, user: data.user, family: data.family });
      grades = data.grades || grades;
      return data.family;
    } catch { return null; }
  }

  /** 家长端：家庭成员管理弹窗。 */
  function openMemberDialog() {
    const active = current();
    if (!active?.token) { openAuthDialog({}); return; }
    if (!isParent()) { showToast('该操作仅家长可用', 'error'); return; }

    const backdrop = document.getElementById('modal-backdrop');
    const body = document.getElementById('modal-body');
    document.getElementById('modal-kicker').textContent = '家庭空间';
    document.getElementById('modal-title').textContent = '家庭成员';
    body.innerHTML = '';

    const list = el('div', 'id-member-list');
    body.appendChild(list);

    const addBtn = el('button', 'id-btn primary wide', '＋ 添加孩子');
    body.appendChild(addBtn);
    addBtn.addEventListener('click', () => openAddMemberDialog());

    // 账号信息：用户靠「称呼 + 口令」登录，同名时需要靠账号 ID 区分，
    // 所以把 ID 明示出来，避免用户卡在「登录不上去」却不知道原因。
    const account = current()?.user;
    if (account) {
      const hint = el('p', 'id-account-hint');
      hint.textContent = `登录账号：${account.name}（ID ${account.id}）`;
      body.appendChild(hint);
    }

    backdrop.dataset.closable = '1';
    backdrop.hidden = false;
    document.body.style.overflow = 'hidden';
    renderMembers(list);
  }

  async function renderMembers(list) {
    const family = current()?.family;
    list.innerHTML = '';
    if (!family?.members?.length) {
      list.appendChild(el('p', 'id-empty', '还没有成员，添加孩子后就能分别记录他们的学习。'));
      return;
    }
    for (const member of family.members) {
      const card = el('div', 'id-member');
      const avatar = el('span', 'id-member-avatar', member.name.slice(0, 1));
      const info = el('div', 'id-member-info');
      info.appendChild(el('strong', '', member.name));
      const meta = [];
      if (member.role === 'parent') meta.push('家长');
      if (member.gradeLabel) meta.push(member.gradeLabel);
      meta.push(member.hasFace ? '已录人脸' : '未录人脸');
      info.appendChild(el('small', '', meta.join(' · ')));
      card.append(avatar, info);

      const actions = el('div', 'id-member-actions');
      if (member.role === 'student') {
        const edit = el('button', 'id-chip', member.hasFace ? '重录人脸' : '录人脸');
        edit.addEventListener('click', () => openFaceEnrollDialog(member));
        const del = el('button', 'id-chip danger', '删除');
        del.addEventListener('click', async () => {
          if (!confirm(`确定删除「${member.name}」吗？该操作不可撤销。`)) return;
          try {
            const data = await api(`/api/family/members/${member.id}`, { method: 'DELETE' });
            saveSession({ ...current(), family: data.family });
            renderMembers(list);
            showToast('已删除');
          } catch (error) { showToast(error.message, 'error'); }
        });
        actions.append(edit, del);
      }
      card.appendChild(actions);
      list.appendChild(card);
    }
  }

  /** 添加学生成员：名称 + 年级 + 人脸采集。 */
  function openAddMemberDialog() {
    ensureGrades();
    const backdrop = document.getElementById('modal-backdrop');
    const body = document.getElementById('modal-body');
    document.getElementById('modal-kicker').textContent = '家庭空间';
    document.getElementById('modal-title').textContent = '添加孩子';
    body.innerHTML = '';

    const form = el('div', 'id-form');
    const nameField = el('label', 'id-label');
    nameField.append(el('span', '', '称呼'), (() => {
      const input = el('input', 'id-field');
      input.id = 'id-member-name';
      input.placeholder = '例如：王小明';
      input.maxLength = 24;
      return input;
    })());
    const gradeField = el('label', 'id-label');
    gradeField.append(el('span', '', '年级'), gradeOptions());
    gradeField.querySelector('select').id = 'id-member-grade';
    form.append(nameField, gradeField);

    // 孩子的登录口令（选填）：摄像头不可用时可以改用口令登录。
    const memberSecretField = el('label', 'id-label');
    memberSecretField.append(el('span', '', '登录口令（选填）'), (() => {
      const input = el('input', 'id-field');
      input.id = 'id-member-secret';
      input.type = 'password';
      input.placeholder = '至少 4 位';
      input.maxLength = 64;
      return input;
    })());
    form.append(memberSecretField);

    const capturePanel = facePanel({
      title: '采集人脸',
      hint: '采集 3 张不同角度的照片，人脸不会离开你的设备'
    });
    form.appendChild(capturePanel);

    const submit = el('button', 'id-btn primary wide', '保存成员');
    form.appendChild(submit);
    body.appendChild(form);

    const video = capturePanel.querySelector('#id-video');
    const status = capturePanel.querySelector('#id-face-hint');
    const captureBtn = capturePanel.querySelector('#id-capture');
    const cameraBtn = capturePanel.querySelector('#id-camera-toggle');
    let descriptors = null;

    cameraBtn.addEventListener('click', async () => {
      try { await ensureCamera(video, status); captureBtn.disabled = false; cameraBtn.textContent = '重新开启'; }
      catch (error) { showToast(error.message, 'error'); }
    });
    captureBtn.addEventListener('click', async () => {
      captureBtn.disabled = true;
      captureBtn.textContent = '采集中…';
      try {
        const multi = await FACE.describeMulti(video, { samples: 3, minScore: 0.5 });
        descriptors = multi.descriptors;
        captureBtn.textContent = '✓ 已采集';
        status.textContent = '可以保存了';
      } catch (error) {
        captureBtn.textContent = '采集人脸';
        captureBtn.disabled = false;
        status.textContent = error.message || '采集失败，请重试';
      }
    });

    submit.addEventListener('click', async () => {
      const name = document.getElementById('id-member-name').value.trim();
      if (!name) { showToast('请填写称呼', 'error'); return; }
      const grade = document.getElementById('id-member-grade').value;
      const secret = document.getElementById('id-member-secret').value;
      submit.disabled = true;
      try {
        const data = await api('/api/family/members', {
          method: 'POST', body: { name, grade, descriptor: descriptors, secret: secret || undefined }
        });
        saveSession({ ...current(), family: data.family });
        openMemberDialog();
        showToast(`已添加「${name}」`);
      } catch (error) {
        showToast(error.message, 'error');
        submit.disabled = false;
      }
    });

    backdrop.dataset.closable = '1';
    backdrop.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  /** 给已有成员重录人脸。 */
  function openFaceEnrollDialog(member) {
    const backdrop = document.getElementById('modal-backdrop');
    const body = document.getElementById('modal-body');
    document.getElementById('modal-kicker').textContent = '家庭空间';
    document.getElementById('modal-title').textContent = `${member.name} · 录入人脸`;
    body.innerHTML = '';

    const form = el('div', 'id-form');
    form.appendChild(el('p', 'id-lead', '采集 3 张不同角度的照片，人脸不会离开你的设备。'));
    const capturePanel = facePanel({ title: '采集人脸', hint: '正对摄像头，采光要好' });
    form.appendChild(capturePanel);
    const submit = el('button', 'id-btn primary wide', '保存');
    form.appendChild(submit);
    body.appendChild(form);

    const video = capturePanel.querySelector('#id-video');
    const status = capturePanel.querySelector('#id-face-hint');
    const captureBtn = capturePanel.querySelector('#id-capture');
    const cameraBtn = capturePanel.querySelector('#id-camera-toggle');
    let descriptors = null;

    cameraBtn.addEventListener('click', async () => {
      try { await ensureCamera(video, status); captureBtn.disabled = false; cameraBtn.textContent = '重新开启'; }
      catch (error) { showToast(error.message, 'error'); }
    });
    captureBtn.addEventListener('click', async () => {
      captureBtn.disabled = true;
      captureBtn.textContent = '采集中…';
      try {
        const multi = await FACE.describeMulti(video, { samples: 3, minScore: 0.5 });
        descriptors = multi.descriptors;
        captureBtn.textContent = '✓ 已采集';
        status.textContent = '可以保存了';
      } catch (error) {
        captureBtn.textContent = '采集人脸';
        captureBtn.disabled = false;
        status.textContent = error.message || '采集失败，请重试';
      }
    });

    submit.addEventListener('click', async () => {
      if (!descriptors) { showToast('请先采集人脸', 'error'); return; }
      submit.disabled = true;
      try {
        const data = await api(`/api/family/members/${member.id}`, {
          method: 'PATCH', body: { descriptor: descriptors }
        });
        saveSession({ ...current(), family: data.family });
        openMemberDialog();
        showToast('人脸已更新');
      } catch (error) {
        showToast(error.message, 'error');
        submit.disabled = false;
      }
    });

    backdrop.dataset.closable = '1';
    backdrop.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function showToast(message, type = 'ok') {
    // 复用主应用的 toast：app.js 已有同名全局函数，这里只补错误态样式。
    if (typeof window.showToast === 'function') {
      const toast = document.getElementById('toast');
      if (toast) toast.classList.toggle('error', type === 'error');
      window.showToast(message);
      setTimeout(() => document.getElementById('toast')?.classList.remove('error'), 2600);
      return;
    }
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.classList.toggle('error', type === 'error');
    const span = toast.querySelector('span');
    if (span) span.textContent = message;
    toast.classList.add('show');
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => toast.classList.remove('show'), 2600);
  }

  return {
    restore, logout, current, isLoggedIn, isParent, api, refreshFamily,
    openAuthDialog, openMemberDialog, closeDialog, showToast, ensureGrades,
    set onChange(handler) { onChange = handler; }
  };
})();

window.IDENTITY = IDENTITY;
