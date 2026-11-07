// ============================================================================
// 选关系统：通关进度存储 + 通关上报 + 通关浮层。
// 关卡页面用法：
//   <script src="report.js"></script>
//   ...（L.build() 之后）
//   ChezzleReport.bind(scene, 'H-1');   // 通关时记录 + 弹浮层
// 数据（localStorage 'chezzle-progress-v1'）= { cleared: ['tutorial','H-1',...] }
// 解锁规则由 levels/levels.js 的 unlocks 在选关页推导。
// ============================================================================
(function () {
  const KEY = 'chezzle-progress-v1';
  // 关卡文件位于 levels/ 下，选关/主页在上级目录
  const BASE = location.pathname.includes('/levels/') ? '../' : '';
  /** SPA 外壳内嵌模式（外壳用 iframe 加载关卡页，?spa=1）：
   *  返回按钮/通关浮层的"返回选关"不再跳页，而是发消息给外壳做同文档转场。 */
  const SPASHELL = (function () {
    try {
      if (/[?&]spa=1/.test(location.search)) return true;
      return window.parent !== window && !!window.parent.__CZ_SPA__;
    } catch (e) { return false; }
  })();

  // 场景 → 关卡 id（bind 时登记）；未登记时按"当前文件名"到 levels.json 反查，
  // 这样即使关卡页忘了写 ChezzleReport.bind(...) 也能记录进度。
  const ID_OF = new WeakMap();
  let idCache = null;
  let idWhy = '';
  /** 页面级 id：只要本页出现过 `ChezzleReport.bind(某个场景, '关卡id')`（哪怕那个场景
   *  句柄是 undefined / 传错），也把 id 记在**页面**上。多场景关卡里"在某条支线通关"
   *  时，bind 只登记了起始场景 → 以前会退化成"未识别"（用户 Pages 上复现）。 */
  let pageId = '';
  /** 关卡文件名规范化（关键！）：Cloudflare Pages / Netlify 等托管默认开 **clean URL**，
   *  `/levels/tutorial.html` 会被 301 成 `/levels/tutorial`（扩展名被剥掉），甚至变成目录形式
   *  `/levels/tutorial/`。旧代码直接拿 `location.pathname` 的最后一段和 levels.json 里的
   *  `"tutorial.html"` 比 → 永远不相等 → 部署后通关提示"未识别关卡 id · 累计 0 关"，
   *  而本地（python -m http.server 保留 .html）一切正常 —— 用户复现的就是这个。
   *  这里两边都：去皮解编码 → 去扩展名 → 去尾斜杠 → 统一小写，再比。 */
  const normName = (p) => {
    const raw = String(p || '').split('?')[0].split('#')[0].replace(/\/+$/, '');
    const seg = raw.split('/');
    const last = (seg[seg.length - 1] || seg[seg.length - 2] || '').trim();
    let dec = last;
    try { dec = decodeURIComponent(last); } catch (e) { /* 原样 */ }
    return dec.replace(/\.html?$/i, '').toLowerCase();
  };
  /** 本页文件名（规范化，用于比对） */
  const here = () => normName(location.pathname);
  /** 本页文件名（原始，用于提示信息里显示） */
  const hereRaw = () => {
    const raw = String(location.pathname || '').replace(/\/+$/, '').split('/');
    const last = raw[raw.length - 1] || raw[raw.length - 2] || '';
    try { return decodeURIComponent(last) || location.pathname; } catch (e) { return last || location.pathname; }
  };
  /** 按当前文件名到 levels.json 反查关卡 id；返回 '' 表示没找到，idWhy 说明原因 */
  async function resolveIdByFile() {
    if (idCache !== null) return idCache;
    const file = here();
    // 关卡页在 levels/ 下，json 与它同级；两套相对路径都试（部署到子目录/自定义域也稳）
    const urls = [BASE + 'levels/levels.json', 'levels.json', '../levels/levels.json'];
    let cfg = null, lastErr = '';
    for (const u of urls) {
      try {
        const r = await fetch(u, { cache: 'no-cache' });
        if (!r.ok) { lastErr = u + ' → HTTP ' + r.status; continue; }
        cfg = await r.json();
        break;
      } catch (e) { lastErr = u + ' → ' + e.message; }
    }
    if (!cfg) {
      idCache = '';
      idWhy = '读不到关卡表（' + lastErr + '）';
      return idCache;
    }
    const all = [...(cfg.tutorial ? [cfg.tutorial] : []), ...Object.values(cfg.levels || {}).flat()];
    const hit = all.find((l) => l && l.file && normName(l.file) === file);
    idCache = hit ? hit.id : '';
    idWhy = hit ? '' : '关卡表里没有文件名为「' + hereRaw() + '」的关卡（本级地址 ' + location.pathname +
      '；levels.json 里的 file 是 ' + all.filter((l) => l && l.file).map((l) => l.file).join(' / ') + '）';
    return idCache;
  }

  function load() {
    try {
      const p = JSON.parse(localStorage.getItem(KEY) || '{"cleared":[]}');
      return { cleared: Array.isArray(p.cleared) ? p.cleared : [] };
    } catch (e) {
      return { cleared: [] };
    }
  }

  function save(p) {
    try {
      localStorage.setItem(KEY, JSON.stringify(p));
    } catch (e) { /* 隐私模式等忽略 */ }
  }

  // ---- 通关页：时间 / 新解锁关卡 ----
  /** 关卡表缓存（levels.json 可能比关卡页加载慢；找不到就只显示已有信息） */
  let cfgCache;
  let cfgPromise = null;
  function loadLevelsConfig() {
    if (cfgCache !== undefined) return Promise.resolve(cfgCache);
    if (cfgPromise) return cfgPromise; // 提前读取与通关补数据共用同一次请求
    cfgPromise = (async () => {
      const urls = [BASE + 'levels/levels.json', 'levels/levels.json', '../levels/levels.json'];
      for (const u of urls) {
        try {
          const r = await fetch(u, { cache: 'no-cache' });
          if (!r.ok) continue;
          cfgCache = await r.json();
          return cfgCache;
        } catch (e) { /* 继续下一个路径 */ }
      }
      cfgCache = null;
      return null;
    })();
    return cfgPromise;
  }
  // 调试通关开关：**只有 levels/levels.json 里 debugClickWin: true 才生效**（默认关闭）。
  // 页面加载时提前读取；关卡内点击由引擎检查 window.__CZ_DEBUG_CLICK_WIN。
  window.__CZ_DEBUG_CLICK_WIN = false;
  loadLevelsConfig().then((cfg) => {
    window.__CZ_DEBUG_CLICK_WIN = !!(cfg && cfg.debugClickWin === true);
  }).catch(() => { window.__CZ_DEBUG_CLICK_WIN = false; });
  const allLevelsOf = (cfg) => {
    const out = [];
    if (!cfg) return out;
    if (cfg.tutorial) out.push({ ...cfg.tutorial, sym: 'tutorial' });
    for (const [sym, list] of Object.entries(cfg.levels || {})) {
      for (const it of list || []) out.push({ ...it, sym });
    }
    return out;
  };
  function unlockedIds(cfg, clearedSet) {
    if (!cfg) return new Set();
    const all = allLevelsOf(cfg);
    if (cfg.debugUnlockAll === true) return new Set(all.map((x) => x.id));
    const set = new Set();
    for (const lv of all) {
      const req = lv.requires || [];
      if (req.length === 0 || req.every((r) => clearedSet.has(r))) set.add(lv.id);
    }
    if (cfg.tutorial) set.add(cfg.tutorial.id);
    return set;
  }
  /** 秒 → mm:ss.cc */
  function formatTime(sec) {
    if (!Number.isFinite(sec) || sec < 0) return '';
    const cs = Math.floor(sec * 100);
    const m = Math.floor(cs / 6000);
    const s = Math.floor((cs % 6000) / 100);
    const c = cs % 100;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
  }
  const escHtml = (s) => String(s == null ? '' : s)
    .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  /** 新解锁关卡卡组（data 每次异步补上时也会重新渲染这一块） */
  function newlyHtml(newly) {
    if (!newly || !newly.length) return '<span class="czw-none">没有新的关卡解锁</span>';
    return newly.map((n, i) =>
      '<span class="czw-new" style="--d:' + (80 + i * 70) + 'ms">' +
      '<b>' + escHtml(n.name || n.id) + '</b>' + (n.sym ? '<i>' + escHtml(n.sym) + '</i>' : '') + '</span>').join('');
  }
  function whyNoteHtml(why) {
    return '没认出本页是哪个关卡' + (why ? '：' + escHtml(why) : '') +
      '<br>修法（二选一）：① 本关脚本里加 ChezzleReport.bind(scene, \'关卡id\')；' +
      '② 在 levels/levels.json 里把该关的 file 写成 ' + escHtml(hereRaw()) + '（.html 可省）';
  }

  // 常驻悬浮"返回选关"（左上角）。
  // 移动端避让：游戏 HUD 卡片在触屏设备整体下移（touch.hudTop=48）——返回钮
  // 保持贴顶 10px 恰好落在让出的空档里；全屏时 iOS 会在左上角挂系统关闭按钮，
  // 返回钮与游戏 HUD 再一起下移（游戏侧 touch.hudTopFs=92 / 这里 52）。
  function isTouchLike() {
    try {
      if (/[?&]touch=1/.test(location.search)) return true;
      if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return true;
      return navigator.maxTouchPoints > 0 && Math.min(innerWidth, innerHeight) < 500;
    } catch (e) { return false; }
  }
  function isFs() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  }
  function layoutBack(a) {
    const touch = isTouchLike();
    const top = touch && isFs() ? 52 : 10;
    a.style.top = top + 'px';
    applyInset(top);
  }
  /** 告诉游戏侧：左上角这块被悬浮钮占了，HUD 请往下让开。
   *  画布自高清改造后由 fitCanvasToWindow 铺满窗口，左上角不再有页面留白，
   *  桌面端若仍按默认的 top=10 排 HUD，悬浮钮就会压住 HUD 卡片（用户截图复现）。 */
  function applyInset(top) {
    const h = document.getElementById('czl-back');
    const height = (h && h.offsetHeight) || 30;
    window.CHEZZLE_HUD_TOP_INSET = top + height + 6;   // 引擎 hudTopOffset 读它
  }
  /**
   * 离场转场：一块斜切面板从右侧扫入（与选关页同一套"平行四边形"视觉），
   * 面板压满屏幕的瞬间再跳转 —— 进关卡有加载过场，出关卡也要有收场，不能"啪"地切页。
   * 返回 false 表示没做动画（调用方按原方式跳转）。
   */
  function leaveWithWipe(href, color) {
    if (!href || document.getElementById('czl-out')) return false;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    const c = color || '232,184,75';
    const w = document.createElement('div');
    w.id = 'czl-out';
    w.style.cssText = 'position:fixed;inset:0;z-index:1200;pointer-events:none;overflow:hidden';
    const panel = document.createElement('i');
    panel.style.cssText = 'position:absolute;top:-12%;bottom:-12%;left:0;width:132%;' +
      'transform:translateX(112%) skewX(-14deg);will-change:transform;' +
      'background:linear-gradient(96deg,rgba(' + c + ',.1) 0%,#07051a 26%,#07051a 100%)';
    // 前缘只留一条亮线（不再有辉光，和主站的扫屏一致）
    const edge = document.createElement('b');
    edge.style.cssText = 'position:absolute;top:0;bottom:0;left:0;width:2px;background:#fff;opacity:.9';
    panel.appendChild(edge);
    w.appendChild(panel);
    document.body.appendChild(w);
    requestAnimationFrame(() => {
      panel.style.transition = 'transform .44s cubic-bezier(.66,0,.24,1)';
      panel.style.transform = 'translateX(-6%) skewX(-14deg)';
    });
    setTimeout(() => { location.href = href; }, 420);
    return true;
  }
  function backLink() {
    if (document.getElementById('czl-back')) return;
    // 桌面大屏：按窗口尺寸放大返回按钮（2K 上 13px 太小；与画布 HUD 同向放大）
    let uiK = 1;
    try {
      if (!matchMedia('(pointer: coarse)').matches) {
        uiK = Math.max(1, Math.min(1.5, Math.min(innerWidth / 1280, innerHeight / 720)));
      }
    } catch (e) { /* 忽略 */ }
    const a = document.createElement('a');
    a.id = 'czl-back';
    a.dataset.sfx = 'ui.back'; // audio.js 的 UI 点击自动接线（返回选关音）
    // SPA 外壳的选关路由（hash 直达；`../#/select` 从 /levels/ 解析到根路由，
    // 绕开 Cloudflare 的 .html → clean URL 301 链）
    a.href = BASE + '#/select';
    a.setAttribute('aria-label', '返回选关');
    a.title = '返回选关';
    a.style.cssText = [
      'position:fixed;top:10px;left:10px;z-index:40;display:inline-flex;align-items:center;gap:6px;',
      'padding:' + Math.round(7 * uiK) + 'px ' + Math.round(12 * uiK) + 'px;border-radius:8px;',
      'border:1px solid #2b3047;background:rgba(20,26,64,.88);',
      'color:#dfe8f2;font:' + Math.round(13 * uiK) + 'px "Segoe UI","Microsoft YaHei",sans-serif;',
      'text-decoration:none;',
      'transition:border-color .18s,color .18s,box-shadow .18s,opacity .45s ease;backdrop-filter:blur(2px)',
      'opacity:0',
    ].join('');
    a.innerHTML = `
      <svg width="${Math.round(13 * uiK)}" height="${Math.round(13 * uiK)}" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M15 5l-7 7 7 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
      </svg><span style="opacity:.85">返回选关</span>`;
    layoutBack(a);
    // 关卡启动层（boot.js）还在时先别露头；启动画面揭开后再淡入。
    // SPA 内嵌模式（外壳负责加载层）→ 直接显示。
    const docEl = (typeof document !== 'undefined' && document.documentElement) || null;
    const bootedNow = () => !!(docEl && docEl.classList && docEl.classList.contains('czlBooted'));
    const appear = () => { a.style.opacity = '1'; };
    if (SPASHELL) setTimeout(appear, 700);
    else if (bootedNow()) setTimeout(appear, 420);
    else {
      const t = setInterval(() => {
        if (bootedNow()) { clearInterval(t); setTimeout(appear, 420); }
      }, 120);
      setTimeout(() => { clearInterval(t); appear(); }, 4000); // 极端情况（启动层没跑）也别一直隐身
    }
    document.addEventListener('fullscreenchange', () => layoutBack(a));
    document.addEventListener('webkitfullscreenchange', () => layoutBack(a));
    a.addEventListener('mouseenter', () => {
      a.style.borderColor = '#e8b84b';
      a.style.color = '#ffd76a';
      a.style.boxShadow = '0 0 10px rgba(232,184,75,.3)';
    });
    a.addEventListener('mouseleave', () => {
      a.style.borderColor = '#2b3047';
      a.style.color = '#dfe8f2';
      a.style.boxShadow = 'none';
    });
    a.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      if (SPASHELL) {
        try { parent.postMessage({ type: 'cz:leave' }, '*'); } catch (err) { location.href = a.href; }
        return;
      }
      if (!leaveWithWipe(a.href, '232,184,75')) location.href = a.href;
    });
    document.body.appendChild(a);
  }
  backLink();

  window.ChezzleReport = {
    load,

    /** 记录通关（幂等） */
    record(id) {
      const p = load();
      if (p.cleared.includes(id)) return;
      p.cleared.push(id);
      save(p);
    },

    /** 监听通关：记录进度 + 弹出浮层（面板下方是「返回选关」按钮，带进出场动画） */
    bind(scene, id) {
      // ★ 先记"页面级 id"再做场景校验：多场景关卡里 bind 只给了起始场景，
      //   在别的场景通关时 ID_OF 查不到 → 以前会整个退化成"未识别"。
      if (id) pageId = id;
      if (!scene || typeof scene.on !== 'function') return;
      ID_OF.set(scene, id || pageId);           // 记下来，onWin 的兜底路径要用
      const fire = () => ChezzleReport.onWin(scene, id || pageId);
      scene.on('win', fire);
      // ★ 兜底轮询：万一把 win 事件吞了（旧内核 / 脚本直接改 status / 事件被覆盖），
      //   状态轮询也能补上记录与浮层（record / overlay 都是幂等的）
      let n = 0;
      const timer = setInterval(() => {
        if (scene.status === 'win') { clearInterval(timer); fire(); }
        else if (++n > 7200) clearInterval(timer);
      }, 250);
    },

    /** 显式声明"本页是哪个关卡"（多场景关卡/自动导出用；比按文件名反查可靠） */
    setLevelId(id) { if (id) pageId = String(id); return pageId; },
    getLevelId() { return pageId; },

    /** 通关统一入口：**先同步**记录进度 + 立刻建结算浮层，再异步补「本次新解锁」等
     *  需要 levels.json 的数据。场景没显式 bind 过也能用（引擎会直接调它，见 scene.js），
     *  此时按"页面级 id → 当前文件名反查 levels.json"的顺序兜底。
     *
     *  为什么必须先同步：
     *   · 画布 HUD 每帧检查 #czl-win 决定是否只铺暗场；以前浮层排在 fetch 后面，
     *     网络慢时会先画出画布版「通关」面板，然后又被 DOM 结算页盖掉（两段式）。
     *   · 进度写入同样排在 fetch 后面：玩家看到第一屏就退出时，这一关根本没记上。 */
    onWin(scene, explicitId) {
      const elapsed = scene && Number.isFinite(scene.time) ? scene.time : null;
      const knownId = explicitId || ID_OF.get(scene) || pageId || '';
      const before = load().cleared;
      if (knownId) ChezzleReport.record(knownId);
      const total = load().cleared.length;
      // 多路触发（bind 事件 / 引擎直调 / 250ms 轮询）时只让第一路建浮层并解析，
      // 后面的调用只负责补记进度（record 幂等）。
      const already = !!document.getElementById('czl-win');
      ChezzleReport.overlay(knownId, total, knownId ? '' : idWhy, { elapsed, newly: [] });
      if (already) return;
      return this._winFill({ knownId, before, elapsed });
    },

    /** onWin 的异步收尾：读关卡表 → 解析未知 id → 补记进度 → 用真实数据刷新结算浮层 */
    async _winFill(info) {
      const beforeSet = new Set(info.before || []);
      let id = info.knownId;
      let newly = [];
      let total = load().cleared.length;
      try {
        const cfg = await loadLevelsConfig();
        if (!id) id = await resolveIdByFile() || '';
        if (!info.knownId && id) ChezzleReport.record(id);
        total = load().cleared.length;
        if (cfg && id) {
          const beforeUnlocked = unlockedIds(cfg, beforeSet);
          const afterUnlocked = unlockedIds(cfg, new Set(load().cleared));
          const all = allLevelsOf(cfg);
          newly = [...afterUnlocked]
            .filter((x) => {
              if (beforeUnlocked.has(x) || beforeSet.has(x)) return false;
              const lv = all.find((l) => l.id === x);
              return !!(lv && lv.file);
            })
            .map((x) => {
              const lv = all.find((l) => l.id === x);
              return lv ? { id: lv.id, name: lv.name || lv.id, sym: lv.sym || '' } : { id: x, name: x, sym: '' };
            });
        }
        console.log('[ChezzleReport] 通关记录 → id=' + (id || '(未识别)') + '，累计 ' + total + ' 关，key=' + KEY +
          (id ? '' : '；原因：' + idWhy));
      } catch (e) { console.warn('[ChezzleReport] 记录失败：' + e.message); }
      ChezzleReport._fillWin({ id, total, why: id ? '' : idWhy, newly });
    },

    /** 结算浮层已经显示后，用最终数据刷新标题/关卡/累计/新解锁（不存在则跳过） */
    _fillWin({ id, total, why, newly }) {
      const d = document.getElementById('czl-win');
      if (!d || !d.querySelector) return;
      const titleEl = d.querySelector('.czw-title em');
      if (titleEl) titleEl.textContent = id === 'tutorial' ? '引导完成' : 'CLEAR';
      const subEl = d.querySelector('.czw-sub');
      if (subEl) {
        subEl.innerHTML = '关卡 <b>' + escHtml(id || '未识别') + '</b> · 累计 <b>' + (total ?? 0) + '</b> 关';
      }
      const listEl = d.querySelector('.czw-new-list');
      if (listEl) listEl.innerHTML = newlyHtml(newly);
      const noteEl = d.querySelector('.czw-note');
      if (noteEl) {
        if (id) noteEl.remove();
        else noteEl.innerHTML = whyNoteHtml(why);
      }
      if (d.setAttribute) d.setAttribute('aria-label', id === 'tutorial' ? '引导完成' : '通关');
    },

    /** 通关浮层样式：只注入一次（Phigros 风：深色结算面板 + 大号用时 + 新解锁关卡卡组） */
    _winStyle(doc) {
      if (doc.getElementById('czl-win-style')) return;
      const s = doc.createElement('style');
      s.id = 'czl-win-style';
      s.textContent = [
        '#czl-win{position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;padding:16px;',
        '  background:radial-gradient(130% 95% at 50% 38%, rgba(21,17,52,.72), rgba(4,3,13,.92));',
        '  opacity:0;transition:opacity .3s ease}',
        '#czl-win.in{opacity:1}',
        // 卡片用 border-box + 100% 上限：以前是 content-box 的 max-height:92vh，
        // 在小视口/带缩放的屏幕上，外框（padding+border）比视口还高，卡片被上下裁掉，
        // 底部的「返回选关」永远够不到。现在卡片本身限制在视口内，内容区滚动、按钮常驻。
        '#czl-win .czw-card{position:relative;box-sizing:border-box;display:flex;flex-direction:column;',
        '  width:min(540px,100%);max-height:calc(100vh - 32px);overflow:hidden;padding:0;',
        '  text-align:center;color:#dfe8f2;background:linear-gradient(180deg,#272150 0%,#120d30 56%,#0d0922 100%);',
        '  border:1.5px solid rgba(232,184,75,.78);border-radius:14px;',
        '  box-shadow:0 0 30px rgba(232,184,75,.16),0 18px 46px rgba(0,0,0,.62);',
        '  transform:translateY(18px) scale(.97);opacity:0;transition:transform .4s cubic-bezier(.2,.9,.3,1.05),opacity .3s ease}',
        '#czl-win.in .czw-card{transform:none;opacity:1}',
        '#czl-win .czw-body{min-height:0;overflow:auto;overscroll-behavior:contain;padding:24px 30px 0}',
        '#czl-win .czw-foot{flex:none;padding:16px 30px 22px}',
        '#czl-win .czw-kicker{font:bold 10px/1 ui-monospace,Consolas,monospace;letter-spacing:4px;color:rgba(232,184,75,.78)}',
        '#czl-win .czw-title{margin-top:10px;font:bold 38px/1.05 "Segoe UI","Microsoft YaHei",sans-serif;',
        '  letter-spacing:16px;padding-left:16px;color:#ffe9b0;text-shadow:0 0 22px rgba(255,215,106,.55)}',
        '#czl-win .czw-title em{font-style:normal;color:#fff;text-shadow:0 0 26px rgba(255,255,255,.55)}',
        '#czl-win .czw-sub{margin-top:9px;font-size:11px;letter-spacing:1.5px;color:#93a3c1}',
        '#czl-win .czw-sub b{color:#ffd76a;font-weight:bold;letter-spacing:1px}',
        '#czl-win .czw-divider{width:78%;height:1px;margin:13px auto 0;',
        '  background:linear-gradient(90deg,transparent,rgba(232,184,75,.5),transparent)}',
        '#czl-win .czw-timebox{display:flex;align-items:baseline;justify-content:center;gap:13px;margin:16px auto 0;',
        '  width:max-content;max-width:100%;padding:10px 22px;',
        '  border:1px solid rgba(232,184,75,.28);background:rgba(232,184,75,.055);',
        '  clip-path:polygon(12px 0,100% 0,calc(100% - 12px) 100%,0 100%)}',
        '#czl-win .czw-tlabel{font:10px/1 ui-monospace,Consolas,monospace;letter-spacing:2px;color:#8fa1c0}',
        '#czl-win .czw-time{font:bold 31px/1 ui-monospace,Consolas,monospace;letter-spacing:2px;color:#fff;',
        '  text-shadow:0 0 16px rgba(232,184,75,.45)}',
        '#czl-win .czw-unlock{margin-top:16px;padding-top:13px;border-top:1px solid rgba(232,184,75,.16);text-align:left}',
        '#czl-win .czw-unlock h4{margin:0 0 9px;font:bold 11px/1.2 "Segoe UI","Microsoft YaHei",sans-serif;letter-spacing:2px;',
        '  color:#9fb2c8}',
        '#czl-win .czw-unlock h4::before{content:"";display:inline-block;width:5px;height:5px;margin-right:7px;',
        '  background:#ffd76a;transform:rotate(45deg) translateY(-1px)}',
        '#czl-win .czw-new-list{display:flex;flex-wrap:wrap;gap:7px}',
        '#czl-win .czw-new{display:inline-flex;align-items:center;gap:8px;padding:7px 11px;min-width:112px;',
        '  border:1px solid rgba(150,232,176,.42);background:rgba(22,55,44,.55);color:#d9ffe6;',
        '  clip-path:polygon(8px 0,100% 0,calc(100% - 8px) 100%,0 100%);',
        '  opacity:0;transform:translateY(7px);animation:czwNewIn .34s cubic-bezier(.2,.9,.3,1.1) forwards;',
        '  animation-delay:var(--d,0ms)}',
        '#czl-win .czw-new b{font-size:12px;font-weight:bold;letter-spacing:1px}',
        '#czl-win .czw-new i{font:normal 9px/1 ui-monospace,Consolas,monospace;color:#96e8b0;letter-spacing:1px}',
        '@keyframes czwNewIn{to{opacity:1;transform:none}}',
        '#czl-win .czw-none{font-size:11px;letter-spacing:1px;color:#6f7b96;padding:3px 0}',
        '#czl-win .czw-note{margin-top:13px;font-size:11px;line-height:1.6;color:#8a94b5;text-align:left;',
        '  padding:7px 9px;border-left:2px solid rgba(232,184,75,.45);background:rgba(232,184,75,.05);border-radius:4px}',
        '#czl-win .czw-btn{margin-top:0;padding:10px 40px;border:0;cursor:pointer;',
        '  font:bold 15px/1 "Segoe UI","Microsoft YaHei",sans-serif;letter-spacing:4px;color:#2a2000;',
        '  background:linear-gradient(180deg,#ffe6a0,#e8b84b);',
        '  clip-path:polygon(12px 0,100% 0,calc(100% - 12px) 100%,0 100%);',
        '  filter:drop-shadow(0 0 14px rgba(232,184,75,.5));transition:filter .18s ease,transform .18s ease}',
        '#czl-win .czw-btn:hover{filter:drop-shadow(0 0 22px rgba(232,184,75,.8));transform:translateY(-1px)}',
        '#czl-win .czw-btn:active{transform:translateY(1px)}',
        '#czl-win .czw-btn:focus-visible{outline:2px solid #fff;outline-offset:3px}',
        '@media (prefers-reduced-motion: reduce){#czl-win,#czl-win .czw-card{transition:none}',
        '  #czl-win .czw-new{animation:none;opacity:1;transform:none}}',
        '@media (max-width:520px){#czl-win .czw-body{padding:20px 18px 0}',
        '  #czl-win .czw-foot{padding:16px 18px 18px}',
        '  #czl-win .czw-title{font-size:30px;letter-spacing:11px;padding-left:11px}',
        '  #czl-win .czw-time{font-size:25px}}',
        // 大屏同步放大（与画布 HUD 的 uiScaleOf 同向：2K≈1.2×、超宽≈1.4×）。
        // zoom 会把 max-height 一起放大，所以上限要按同样倍率折回去：
        // (100vh - 32px) / 1.2 = 83.3333vh - 26.6667px，1.42 同理。
        '@media (min-width:1600px){#czl-win .czw-card{zoom:1.2;max-height:calc(83.3333vh - 26.6667px)}}',
        '@media (min-width:2100px){#czl-win .czw-card{zoom:1.42;max-height:calc(70.4225vh - 22.5352px)}}',
        // 移动端点地址栏会吃掉 vh 的下半截：支持 dvh 就按真实可见高度算。
        '@supports (height:100dvh){#czl-win .czw-card{max-height:calc(100dvh - 32px)}}',
        '@media (min-width:1600px){@supports (height:100dvh){#czl-win .czw-card{max-height:calc(83.3333dvh - 26.6667px)}}}',
        '@media (min-width:2100px){@supports (height:100dvh){#czl-win .czw-card{max-height:calc(70.4225dvh - 22.5352px)}}}',
      ].join('');
      doc.head.appendChild(s);
    },

    /** 通关浮层：大号通关标题 + 本次用时（滚动增长）+ 本次新解锁的关卡（逐个滑入）。
     *  why = 未识别关卡 id 时的具体原因；opts = { elapsed, newly:[{id,name,sym}] } */
    overlay(id, total, why, opts = {}) {
      if (document.getElementById('czl-win')) return;
      this._winStyle(document);
      const d = document.createElement('div');
      d.id = 'czl-win';
      d.setAttribute('role', 'dialog');
      d.setAttribute('aria-label', '通关');
      const title = id === 'tutorial' ? '引导完成' : '通关';
      const elapsed = Number.isFinite(opts.elapsed) ? Math.max(0, opts.elapsed) : null;
      const newly = Array.isArray(opts.newly) ? opts.newly : [];
      const timeHtml = elapsed == null ? '' :
        '<div class="czw-timebox"><span class="czw-tlabel">本次用时</span>' +
        '<span class="czw-time" id="czwTime">' + formatTime(0) + '</span></div>';
      const note = id ? '' : '<div class="czw-note">' + whyNoteHtml(why) + '</div>';
      d.innerHTML =
        '<div class="czw-card">' +
        '<div class="czw-body">' +
        '<div class="czw-kicker">CHEZZLE · RESULT</div>' +
        '<div class="czw-title"><em>' + (title === '通关' ? 'CLEAR' : title) + '</em></div>' +
        '<div class="czw-sub">关卡 <b>' + escHtml(id || '未识别') + '</b> · 累计 <b>' + (total ?? 0) + '</b> 关</div>' +
        '<div class="czw-divider"></div>' +
        timeHtml +
        '<div class="czw-unlock"><h4>本次新解锁</h4><div class="czw-new-list">' + newlyHtml(newly) + '</div></div>' +
        note +
        '</div>' +
        '<div class="czw-foot"><button class="czw-btn" data-act="select" type="button" data-sfx="ui.back">返回选关</button></div>' +
        '</div>';
      document.body.appendChild(d);
      // 进场：遮罩淡入 + 面板上浮
      requestAnimationFrame(() => d.classList.add('in'));
      // 用时从 0 滚到实际值（短促的结算数字动画）
      const timeEl = d.querySelector('#czwTime');
      if (timeEl && elapsed != null) {
        const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduce) timeEl.textContent = formatTime(elapsed);
        else {
          const DUR = 640;
          const t0 = performance.now();
          const tick = (now) => {
            const k = Math.min(1, (now - t0) / DUR);
            const e = 1 - Math.pow(1 - k, 3);
            timeEl.textContent = formatTime(elapsed * e);
            if (k < 1) requestAnimationFrame(tick);
            else timeEl.textContent = formatTime(elapsed);
          };
          requestAnimationFrame(tick);
        }
      }
      const go = (href) => {
        if (SPASHELL) {
          // 外壳内嵌：淡出浮层后发消息，由外壳做"关卡 → 选关"的同文档转场
          d.classList.remove('in');
          if (d.animate && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
            d.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: 'ease-in' });
          }
          setTimeout(() => {
            try { parent.postMessage({ type: 'cz:leave' }, '*'); } catch (err) { location.href = href; }
          }, 180);
          return;
        }
        if (!matchMedia('(prefers-reduced-motion: reduce)').matches && d.animate) {
          d.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: 'ease-in' });
          setTimeout(() => {
            if (!leaveWithWipe(href, '232,184,75')) location.href = href;
          }, 200);
        } else if (!leaveWithWipe(href, '232,184,75')) location.href = href;
      };
      d.querySelector('[data-act="select"]').addEventListener('click', () => go(BASE + '#/select'));
    },
  };
})();
