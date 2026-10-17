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

    /** 通关统一入口：记录 + 浮层。场景没显式 bind 过也能用（引擎会直接调它，见 scene.js），
     *  此时按"页面级 id → 当前文件名反查 levels.json"的顺序兜底。 */
    async onWin(scene, explicitId) {
      const id = explicitId || ID_OF.get(scene) || pageId || await resolveIdByFile() || '';
      let total = 0;
      try {
        if (id) ChezzleReport.record(id);
        total = load().cleared.length;
        console.log('[ChezzleReport] 通关记录 → id=' + (id || '(未识别)') + '，累计 ' + total + ' 关，key=' + KEY +
          (id ? '' : '；原因：' + idWhy));
      } catch (e) { console.warn('[ChezzleReport] 记录失败：' + e.message); }
      ChezzleReport.overlay(id, total, id ? '' : idWhy);
    },

    /** 通关浮层样式：只注入一次（与 HUD 同一套圆角深紫面板 + 金描边风格） */
    _winStyle(doc) {
      if (doc.getElementById('czl-win-style')) return;
      const s = doc.createElement('style');
      s.id = 'czl-win-style';
      s.textContent = [
        '#czl-win{position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;',
        '  background:radial-gradient(120% 90% at 50% 42%, rgba(18,14,46,.62), rgba(5,4,16,.88));',
        '  opacity:0;transition:opacity .28s ease}',
        '#czl-win.in{opacity:1}',
        '#czl-win .czw-card{position:relative;width:min(400px,86vw);padding:20px 30px 20px;text-align:center;color:#dfe8f2;',
        '  background:linear-gradient(180deg,#282050 0%,#120d30 55%,#0e0a24 100%);',
        '  border:1.5px solid rgba(232,184,75,.8);border-radius:12px;',
        '  box-shadow:0 0 20px rgba(232,184,75,.18),0 16px 38px rgba(0,0,0,.55);',
        '  transform:translateY(14px);opacity:0;transition:transform .36s cubic-bezier(.2,.9,.3,1.05),opacity .3s ease}',
        '#czl-win.in .czw-card{transform:none;opacity:1}',
        '#czl-win .czw-kicker{font:bold 10px/1 ui-monospace,Consolas,monospace;letter-spacing:3px;color:rgba(232,184,75,.75)}',
        '#czl-win .czw-divider{width:70%;height:1px;margin:9px auto 12px;',
        '  background:linear-gradient(90deg,transparent,rgba(232,184,75,.45),transparent)}',
        '#czl-win .czw-emblem{display:block;width:62px;height:40px;margin:0 auto 2px;overflow:visible}',
        '#czl-win .czw-tile{fill:rgba(18,14,46,.9);stroke:rgba(232,184,75,.85);stroke-width:1.4}',
        '#czl-win .czw-check{fill:none;stroke:#ffe9b0;stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round;',
        '  stroke-dasharray:36;stroke-dashoffset:36;filter:drop-shadow(0 0 5px rgba(255,215,106,.5))}',
        '#czl-win.in .czw-check{animation:czwDraw .42s cubic-bezier(.3,.7,.2,1) .16s forwards}',
        '@keyframes czwDraw{to{stroke-dashoffset:0}}',
        '#czl-win .czw-title{margin-top:8px;font:bold 24px/1.2 "Segoe UI","Microsoft YaHei",sans-serif;',
        '  letter-spacing:8px;color:#ffe9b0;text-shadow:0 0 12px rgba(255,215,106,.45)}',
        '#czl-win .czw-meta{margin-top:8px;font-size:12px;letter-spacing:1px;color:#9fb2c8}',
        '#czl-win .czw-meta b{color:#ffd76a;font-weight:bold;letter-spacing:1px}',
        '#czl-win .czw-dot{display:inline-block;width:4px;height:4px;margin:0 10px 2px;border-radius:50%;',
        '  background:rgba(232,184,75,.65)}',
        '#czl-win .czw-note{margin-top:10px;font-size:11px;line-height:1.6;color:#8a94b5;text-align:left;',
        '  padding:7px 9px;border-left:2px solid rgba(232,184,75,.45);background:rgba(232,184,75,.05);border-radius:4px}',
        '#czl-win .czw-btn{margin-top:16px;padding:10px 34px;border:0;cursor:pointer;',
        '  font:bold 15px/1 "Segoe UI","Microsoft YaHei",sans-serif;letter-spacing:4px;color:#2a2000;',
        '  background:linear-gradient(180deg,#ffe6a0,#e8b84b);',
        '  clip-path:polygon(12px 0,100% 0,calc(100% - 12px) 100%,0 100%);',
        '  filter:drop-shadow(0 0 14px rgba(232,184,75,.5));transition:filter .18s ease,transform .18s ease}',
        '#czl-win .czw-btn:hover{filter:drop-shadow(0 0 22px rgba(232,184,75,.8));transform:translateY(-1px)}',
        '#czl-win .czw-btn:active{transform:translateY(1px)}',
        '#czl-win .czw-btn:focus-visible{outline:2px solid #fff;outline-offset:3px}',
        '@media (prefers-reduced-motion: reduce){#czl-win,#czl-win .czw-card{transition:none}',
        '  #czl-win.in .czw-check{animation:none;stroke-dashoffset:0}}',
        // 大屏同步放大（与画布 HUD 的 uiScaleOf 同向：2K≈1.2×、超宽≈1.4×）
        '@media (min-width:1600px){#czl-win .czw-card{zoom:1.2}}',
        '@media (min-width:2100px){#czl-win .czw-card{zoom:1.42}}',
      ].join('');
      doc.head.appendChild(s);
    },

    /** 通关浮层（与 HUD 同款圆角深紫面板 + 金描边；小平行四边形徽记 + 勾线动画）。
     *  why = 未识别关卡 id 时的具体原因 */
    overlay(id, total, why) {
      if (document.getElementById('czl-win')) return;
      const esc = (s) => String(s == null ? '' : s)
        .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
      this._winStyle(document);
      const d = document.createElement('div');
      d.id = 'czl-win';
      d.setAttribute('role', 'dialog');
      d.setAttribute('aria-label', '通关');
      const title = id === 'tutorial' ? '引导完成' : '通关';
      const note = id ? '' : (
        '<div class="czw-note">没认出本页是哪个关卡' + (why ? '：' + esc(why) : '') +
        '<br>修法（二选一）：① 本关脚本里加 ChezzleReport.bind(scene, \'关卡id\')；' +
        '② 在 levels/levels.json 里把该关的 file 写成 ' + esc(hereRaw()) + '（.html 可省）</div>');
      d.innerHTML =
        '<div class="czw-card">' +
        '<div class="czw-kicker">CHEZZLE · ' + title + '</div>' +
        '<div class="czw-divider"></div>' +
        '<svg class="czw-emblem" viewBox="0 0 96 64" aria-hidden="true">' +
        '<path class="czw-tile" d="M18 6 H92 L78 58 H4 Z"/>' +
        '<path class="czw-check" d="M34 33 L46 45 L66 21"/>' +
        '</svg>' +
        '<div class="czw-title">' + title + '</div>' +
        '<div class="czw-meta">关卡 <b>' + esc(id || '未识别') + '</b>' +
        '<span class="czw-dot"></span>累计 <b>' + (total ?? 0) + '</b> 关</div>' +
        note +
        '<button class="czw-btn" data-act="select" type="button">返回选关</button>' +
        '</div>';
      document.body.appendChild(d);
      // 进场：遮罩淡入 + 面板上浮（CSS transition；勾线用 keyframes）
      requestAnimationFrame(() => d.classList.add('in'));
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
