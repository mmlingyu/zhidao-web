/* PWA 安装引导：把网页变成「装在手机桌面上」的 App。
 *
 * 覆盖三种情况：
 *  1. Android / 桌面 Chrome：监听 beforeinstallprompt，给出「立即安装」按钮；
 *  2. iOS Safari：没有安装事件，只能手动「分享 → 添加到主屏幕」，用图文步骤引导；
 *  3. 已安装（standalone）：不再打扰。
 *
 * 另有「有新版本」提示：Service Worker 更新后提示用户刷新，避免用户停留在旧版本。
 */
'use strict';

(function initPwa() {
  const STORAGE_KEY = 'zhidao.install.dismissed';
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;

  // 已是桌面 App 或用户明确关掉过引导，都不再显示
  function dismissed() {
    try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
  }
  function rememberDismissed() {
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* 隐私模式下忽略 */ }
  }

  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  // 安装引导只在移动端出现：桌面浏览器自带安装入口，弹窗只会变成打扰。
  const isNarrow = () => window.matchMedia('(max-width: 820px)').matches;

  let deferredPrompt = null;
  const host = document.createElement('div');
  host.id = 'pwa-hint';

  function dismiss() {
    host.classList.remove('show');
    rememberDismissed();
  }

  const CLOSE_SVG = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const SHARE_SVG = '<svg viewBox="0 0 24 24"><path d="M12 16V4M8 8l4-4 4 4M5 14v5h14v-5"/></svg>';
  const PLUS_SVG = '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>';

  /** 页面是否有模态弹窗打开（注册/登录、收藏、指南等共用 modal-backdrop）。 */
  function modalOpen() {
    const backdrop = document.getElementById('modal-backdrop');
    return Boolean(backdrop && !backdrop.hidden);
  }

  function render(options) {
    const { icon, title, desc, actionText, onAction, onClose } = options;
    host.innerHTML = `
      <div class="pwa-hint-icon">${icon}</div>
      <div class="pwa-hint-text">
        <strong>${title}</strong>
        <span>${desc}</span>
      </div>
      <button class="pwa-hint-action" type="button">${actionText}</button>
      <button class="pwa-hint-close" type="button" aria-label="关闭">${CLOSE_SVG}</button>`;
    host.querySelector('.pwa-hint-action').addEventListener('click', async () => {
      await onAction();
      dismiss();
    });
    host.querySelector('.pwa-hint-close').addEventListener('click', () => {
      onClose?.();
      dismiss();
    });
    host.classList.add('show');
  }

  // —— 1. 窄屏设备引导「添加到主屏幕」——
// 有 beforeinstallprompt 时按钮可直接调起安装；没有时给出可照做的步骤
// （iOS Safari 只能手动添加；部分安卓浏览器也走菜单路径）。
function showInstallHint() {
    if (isStandalone || dismissed() || !isNarrow()) return;
    if (host.classList.contains('show')) return;
    // 有弹窗打开时不再打扰：提示条压在模态层上面会挡住标题与按钮。
    if (modalOpen()) return;

    if (deferredPrompt) {
      render({
        icon: PLUS_SVG,
        title: '把知岛装到桌面',
        desc: '打开更快，还能像 App 一样全屏使用。',
        actionText: '立即安装',
        onAction: async () => {
          deferredPrompt.prompt();
          await deferredPrompt.userChoice;
          deferredPrompt = null;
        }
      });
      return;
    }

    render({
      icon: SHARE_SVG,
      title: '把知岛添加到主屏幕',
      desc: isIos
        ? '点底部分享按钮，选择「添加到主屏幕」，就能像 App 一样打开。'
        : '点浏览器菜单，选择「安装应用 / 添加到主屏幕」，就能像 App 一样打开。',
      actionText: '知道了',
      onAction: async () => {}
    });
  }

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt = event;
    showInstallHint();
  });

  // 弹窗打开时收起引导条，关闭后再补回来。
  // 引导条是 fixed 定位，压在模态层上方会挡住弹窗标题和按钮。
  const backdrop = document.getElementById('modal-backdrop');
  if (backdrop) {
    const syncWithModal = () => {
      if (modalOpen()) {
        host.classList.remove('show');
      } else {
        showInstallHint();
      }
    };
    new MutationObserver(syncWithModal).observe(backdrop, { attributes: true, attributeFilter: ['hidden'] });
  }

  // 事件可能在宽屏时先触发，等到用户缩窄窗口（转手机/平板尺寸）再补展示。
  window.addEventListener('resize', () => {
    if (isNarrow()) {
      showInstallHint();
    } else {
      // 回到宽屏时收起引导（不记为「已关闭」，缩回窄屏仍可再看到）。
      host.classList.remove('show');
    }
  });

  // —— 2. iOS Safari：只能手动添加，showInstallHint 已覆盖各平台文案 ——

  // —— 3. 新版本可用：提示刷新 ——
  function showUpdateHint(onReload) {
    host.innerHTML = `
      <div class="pwa-hint-icon">${PLUS_SVG}</div>
      <div class="pwa-hint-text">
        <strong>知岛更新好了</strong>
        <span>刷新一下，用上最新的版本。</span>
      </div>
      <button class="pwa-hint-action" type="button">立即刷新</button>
      <button class="pwa-hint-close" type="button" aria-label="关闭">${CLOSE_SVG}</button>`;
    host.querySelector('.pwa-hint-action').addEventListener('click', () => {
      onReload();
    });
    host.querySelector('.pwa-hint-close').addEventListener('click', () => {
      host.classList.remove('show');
    });
    host.classList.add('show');
  }

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then(registration => {
          // 发现新版本时提示刷新，而不是静默替换（避免用户正在看的页面被换掉）
          registration.addEventListener('updatefound', () => {
            const worker = registration.installing;
            if (!worker) return;
            worker.addEventListener('statechange', () => {
              if (worker.state === 'installed' && navigator.serviceWorker.controller) {
                showUpdateHint(() => {
                  worker.postMessage({ type: 'SKIP_WAITING' });
                  location.reload();
                });
              }
            });
          });
        })
        .catch(() => { /* 注册失败不影响主功能 */ });

      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloading) return;
        reloading = true;
        location.reload();
      });
    });
  }

  // 窄屏时延后到页面加载完再给引导，避免影响首屏。
  window.addEventListener('load', () => {
    setTimeout(showInstallHint, 1200);
  });

  document.body.appendChild(host);
})();
