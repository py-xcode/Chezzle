/* ============================================================================
 * Chezzle · 本地存储守卫（storage-guard.js）
 * ----------------------------------------------------------------------------
 * 游戏的通关进度、新手引导标记、更新弹窗记录、偏好设置全部依赖 localStorage。
 * Safari 无痕/隐私模式、浏览器禁用"网站数据"、或配额耗尽时，localStorage
 * 会存在但 setItem() 抛异常：所有数据都写不进去 → 退出重进后进度全空、引导和
 * 更新弹窗反复出现（用户实际遇到的情况）。
 *
 * 本脚本在**每个页面加载最早期**执行一次真实探测（写 → 读 → 删一个随机 key）：
 *   · 可用 → 正常继续；
 *   · 不可用 → 铺全屏警告层、拦掉键盘/指针/触摸输入，禁止继续游玩。
 * 另外提供「跨会话存储测试」（设置面板按钮）：写入持久标记，用户完全退出浏览器
 * 再进入时若标记还在 → 弹「本地存储正常」；标记没了则不弹（测试前已提示用户
 * “没有弹窗 = 无法保存”）。这能验证 Chrome 无痕这种“能写、关窗才清”的情况。
 * 警告层挂在 <html> 下（body 之外）：首页/选关/关于页竖屏时旋转的是 body，
 * 警告不能跟着转 90°。
 *
 * 用法：在 <body> 后、其它脚本之前引入：
 *   <script src="storage-guard.js"></script>
 * ========================================================================== */
(function () {
  'use strict';
  if (window.__czStorageGuardLoaded) return;
  window.__czStorageGuardLoaded = true;

  var PROBE_KEY = '__cz_storage_probe__';

  /** 真实写→读→删探测。任何一步抛异常都视为不可用。 */
  function canStore() {
    try {
      var ls = window.localStorage;
      if (!ls) return false;
      ls.setItem(PROBE_KEY, '1');
      var ok = ls.getItem(PROBE_KEY) === '1';
      ls.removeItem(PROBE_KEY);
      return ok;
    } catch (e) {
      return false;
    }
  }

  function show() {
    if (typeof document === 'undefined' || !document.documentElement) return;
    if (document.getElementById('czStorageBlock')) return;
    var d = document.createElement('div');
    d.id = 'czStorageBlock';
    d.setAttribute('role', 'alertdialog');
    d.setAttribute('aria-modal', 'true');
    d.setAttribute('aria-labelledby', 'czStorageBlockTitle');
    d.innerHTML =
      '<style>' +
      '#czStorageBlock{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;' +
      '  padding:16px;box-sizing:border-box;background:radial-gradient(130% 95% at 50% 38%,rgba(21,17,52,.94),rgba(4,3,13,.985));' +
      '  font-family:"Segoe UI","Microsoft YaHei",sans-serif;color:#dfe8f2}' +
      '#czStorageBlock .czsg-card{box-sizing:border-box;width:min(460px,100%);max-height:calc(100vh - 32px);overflow:auto;' +
      '  padding:24px 28px 22px;text-align:center;border:1.5px solid rgba(232,184,75,.82);border-radius:14px;' +
      '  background:linear-gradient(180deg,#272150 0%,#120d30 56%,#0d0922 100%);' +
      '  box-shadow:0 0 30px rgba(232,184,75,.16),0 18px 46px rgba(0,0,0,.62)}' +
      '#czStorageBlock .czsg-kicker{font:bold 10px/1 ui-monospace,Consolas,monospace;letter-spacing:4px;color:rgba(232,184,75,.78)}' +
      '#czStorageBlock h2{margin:12px 0 0;font:bold 23px/1.25 "Segoe UI","Microsoft YaHei",sans-serif;' +
      '  letter-spacing:3px;color:#ffe9b0;text-shadow:0 0 16px rgba(255,215,106,.4)}' +
      '#czStorageBlock .czsg-rule{width:74%;height:1px;margin:14px auto;background:linear-gradient(90deg,transparent,rgba(232,184,75,.5),transparent)}' +
      '#czStorageBlock p{margin:9px 0 0;font-size:12.5px;line-height:1.8;color:#b9c6dd;text-align:left}' +
      '#czStorageBlock p b{color:#ffd76a;font-weight:bold}' +
      '#czStorageBlock .czsg-hint{margin-top:12px;padding:8px 10px;text-align:left;font-size:12px;line-height:1.7;' +
      '  color:#cfe0f5;border-left:2px solid rgba(232,184,75,.65);background:rgba(232,184,75,.06);border-radius:4px}' +
      '#czStorageBlock button{margin-top:18px;padding:10px 34px;border:0;cursor:pointer;' +
      '  font:bold 14px/1 "Segoe UI","Microsoft YaHei",sans-serif;letter-spacing:3px;color:#2a2000;' +
      '  background:linear-gradient(180deg,#ffe6a0,#e8b84b);' +
      '  clip-path:polygon(10px 0,100% 0,calc(100% - 10px) 100%,0 100%);' +
      '  filter:drop-shadow(0 0 12px rgba(232,184,75,.5))}' +
      '#czStorageBlock button:focus-visible{outline:2px solid #fff;outline-offset:3px}' +
      '@media (max-width:520px){#czStorageBlock .czsg-card{padding:20px 18px 18px}' +
      '  #czStorageBlock h2{font-size:20px;letter-spacing:1px}' +
      '  #czStorageBlock p{font-size:12px}}' +
      '</style>' +
      '<div class="czsg-card">' +
      '<div class="czsg-kicker">CHEZZLE · STORAGE</div>' +
      '<h2 id="czStorageBlockTitle">无法保存游戏数据</h2>' +
      '<div class="czsg-rule"></div>' +
      '<p>当前浏览器<b>不允许写入本地存储</b>。常见原因：无痕/隐私模式，或浏览器禁用了本站的网站数据。</p>' +
      '<p>通关进度、新手引导、更新记录和设置都依赖本地存储；在这种状态下继续游玩，退出后数据会全部丢失，所以游戏无法继续。</p>' +
      '<div class="czsg-hint">请关闭无痕模式，或允许本站保存数据，然后刷新页面。</div>' +
      '<button type="button" data-act="reload">刷新页面</button>' +
      '</div>';
    // 挂到 <html> 下：避开首页/选关页竖屏时 body 的 90° 旋转
    document.documentElement.appendChild(d);
    window.__CZ_STORAGE_BLOCKED = true;
    try {
      if (document.documentElement.style) document.documentElement.style.overflow = 'hidden';
      if (document.body && document.body.style) document.body.style.overflow = 'hidden';
    } catch (e) { /* 老内核 */ }
    // 拦掉所有输入：键盘在 window 捕获阶段直接吃掉，指针/触摸被遮罩挡住。
    // 只放行遮罩内部的指针操作（刷新按钮）；键盘始终不传给游戏（焦点在警告层按钮上时
    // 也照样拦，否则 Enter/空格等会落到游戏的 keydown 监听里）。Enter/空格由这里自己
    // 触发刷新，保留刷新按钮的键盘可达性。
    var reload = function () { location.reload(); };
    var block = function (e) {
      var t = e && e.target;
      var inPanel = false;
      try { inPanel = !!(t && t.closest && t.closest('#czStorageBlock')); } catch (err) { /* ignore */ }
      var key = e && e.key;
      if (inPanel && key && (key === 'Enter' || key === ' ' || key === 'Spacebar')) {
        if (e.cancelable) e.preventDefault();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        else if (e.stopPropagation) e.stopPropagation();
        reload();
        return;
      }
      if (inPanel && !(e && e.type === 'keydown')) return; // 遮罩内鼠标/触摸（刷新按钮）放行
      if (e && e.cancelable) e.preventDefault();
      if (e && e.stopImmediatePropagation) e.stopImmediatePropagation();
      else if (e && e.stopPropagation) e.stopPropagation();
    };
    var types = ['keydown', 'keyup', 'keypress', 'wheel', 'contextmenu',
      'pointerdown', 'pointermove', 'pointerup',
      'touchstart', 'touchmove', 'touchend',
      'mousedown', 'mousemove', 'mouseup', 'click', 'dblclick'];
    for (var i = 0; i < types.length; i++) window.addEventListener(types[i], block, true);
    var btn = d.querySelector ? d.querySelector('[data-act="reload"]') : null;
    if (btn) {
      btn.addEventListener('click', function () { location.reload(); });
      try { btn.focus(); } catch (e) { /* ignore */ }
    }
  }

  // ---------------------------------------------------------------------------
  // 跨会话存储测试（设置面板 →「测试本地存储」）
  // ---------------------------------------------------------------------------
  // 写入一个带 token 的标记；用户完全退出浏览器后再打开时：
  //   · 标记还在 → 说明 localStorage 跨会话存活 → 弹「本地存储正常」；
  //   · 标记没了 → 什么也不弹。设置面板里已提前告诉用户：没看到弹窗 = 无法保存。
  // Chrome 无痕「能写、关窗才清」，只有这种"退出重进后是否还在"的测试能验证。
  var TEST_KEY = 'chezzle-storage-test-v1';
  var TEST_COOKIE = 'cz_storage_test';
  // 会话 cookie：同一浏览器会话内跨标签共享（刷新/新标签不误判），浏览器退出后消失。
  // 注意：不要用 sessionStorage 判断"同一次会话"——Chrome 的「继续浏览上次打开的
  // 网页」会把 sessionStorage 一起恢复，但会话 cookie 会被清掉；用 sessionStorage
  // 会导致真正退出重进后不弹成功提示（用户实际遇到）。
  function readCookie(name) {
    try {
      var all = String(document.cookie || '').split(';');
      for (var i = 0; i < all.length; i++) {
        var p = all[i].replace(/^\s+/, '');
        if (p.indexOf(name + '=') === 0) {
          try { return decodeURIComponent(p.slice(name.length + 1)); } catch (e) { return p.slice(name.length + 1); }
        }
      }
    } catch (e) { /* ignore */ }
    return '';
  }
  function writeCookie(name, value, maxAge) {
    try {
      document.cookie = name + '=' + encodeURIComponent(value) + '; path=/; SameSite=Lax' +
        (maxAge == null ? '' : '; Max-Age=' + maxAge);
    } catch (e) { /* ignore */ }
  }

  function readTest() {
    try {
      var raw = window.localStorage.getItem(TEST_KEY);
      if (!raw) return null;
      var o = JSON.parse(raw);
      return o && typeof o === 'object' ? o : null;
    } catch (e) { return null; }
  }
  function testPending() { return !!readTest(); }
  function clearTest() {
    try { window.localStorage.removeItem(TEST_KEY); } catch (e) { /* ignore */ }
    writeCookie(TEST_COOKIE, '', 0);
  }
  /** 写入测试标记；返回写入时间戳（失败返回 0） */
  function markTest() {
    try {
      var at = Date.now();
      var token = String(at) + '-' + Math.random().toString(36).slice(2);
      window.localStorage.setItem(TEST_KEY, JSON.stringify({ v: 1, token: token, at: at }));
      writeCookie(TEST_COOKIE, token);
      return at;
    } catch (e) { return 0; }
  }

  /** 测试成功弹窗：标记跨会话保留下来了 */
  function showTestOk() {
    if (typeof document === 'undefined' || !document.documentElement) return;
    if (document.getElementById('czStorageTestOk')) return;
    var d = document.createElement('div');
    d.id = 'czStorageTestOk';
    d.innerHTML =
      '<style>' +
      '#czStorageTestOk{position:fixed;inset:0;z-index:2147482999;display:flex;align-items:center;justify-content:center;' +
      '  padding:16px;box-sizing:border-box;background:rgba(4,3,14,.72);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);' +
      '  font-family:"Segoe UI","Microsoft YaHei",sans-serif;color:#dfe8f2}' +
      '#czStorageTestOk .czst-card{box-sizing:border-box;width:min(400px,100%);padding:22px 24px 20px;text-align:center;' +
      '  border:1.5px solid rgba(150,232,176,.8);border-radius:14px;' +
      '  background:linear-gradient(180deg,#1c2f2a 0%,#0f1b20 58%,#0b1220 100%);' +
      '  box-shadow:0 0 28px rgba(150,232,176,.18),0 16px 40px rgba(0,0,0,.62)}' +
      '#czStorageTestOk h2{margin:8px 0 0;font:bold 22px/1.3 "Segoe UI","Microsoft YaHei",sans-serif;' +
      '  letter-spacing:3px;color:#d9ffe6;text-shadow:0 0 16px rgba(150,232,176,.45)}' +
      '#czStorageTestOk p{margin:12px 0 0;font-size:12.5px;line-height:1.75;color:#b9d6c9}' +
      '#czStorageTestOk button{margin-top:16px;padding:9px 30px;border:0;cursor:pointer;' +
      '  font:bold 13px/1 "Segoe UI","Microsoft YaHei",sans-serif;letter-spacing:2px;color:#10251b;' +
      '  background:linear-gradient(180deg,#c9ffdf,#7bd99e);' +
      '  clip-path:polygon(9px 0,100% 0,calc(100% - 9px) 100%,0 100%);' +
      '  filter:drop-shadow(0 0 12px rgba(150,232,176,.45))}' +
      '#czStorageTestOk button:focus-visible{outline:2px solid #fff;outline-offset:3px}' +
      '</style>' +
      '<div class="czst-card" role="dialog" aria-modal="true" aria-labelledby="czStorageTestOkTitle">' +
      '<h2 id="czStorageTestOkTitle">本地存储正常</h2>' +
      '<p>上次写入的测试标记已经保留下来。<br>数据可以跨浏览器会话保存，可以正常游玩。</p>' +
      '<button type="button" data-act="ok">知道了</button>' +
      '</div>';
    document.documentElement.appendChild(d);
    var close = function () {
      try { if (d.parentNode) d.parentNode.removeChild(d); } catch (e) { /* ignore */ }
      try { document.removeEventListener('keydown', onKey); } catch (e) { /* ignore */ }
    };
    var onKey = function (e) { if (e && e.key === 'Escape') close(); };
    var btn = d.querySelector ? d.querySelector('[data-act="ok"]') : null;
    if (btn) btn.addEventListener('click', close);
    d.addEventListener('click', function (e) { if (e.target === d) close(); });
    try { document.addEventListener('keydown', onKey); } catch (e) { /* ignore */ }
    if (btn && btn.focus) { try { btn.focus(); } catch (e) { /* ignore */ } }
  }

  /** 页面加载时判定上一次跨会话测试的结果（只在顶层页面做，SPA iframe 不重复弹） */
  function maybeShowTestResult() {
    if (typeof window === 'undefined' || window.parent !== window) return;
    var m = readTest();
    if (!m) return;
    var cookieToken = readCookie(TEST_COOKIE);
    // 同一浏览器会话（刷新 / 新标签 / 本次会话内跳转）→ 还没完成"退出重进"，
    // 不弹并保留标记。会话 cookie 在浏览器退出后被清掉，此时才判定为新会话。
    if (cookieToken && m.token && cookieToken === m.token) return;
    clearTest();
    showTestOk();
  }

  var ok = canStore();
  window.ChezzleStorageGuard = {
    canStore: canStore, show: show, blocked: !ok,
    markTest: markTest, clearTest: clearTest, testPending: testPending,
  };
  if (!ok) show();
  else maybeShowTestResult();
})();
