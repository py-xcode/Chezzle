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
  function backLink() {
    if (document.getElementById('czl-back')) return;
    const a = document.createElement('a');
    a.id = 'czl-back';
    a.href = BASE + 'select.html';
    a.setAttribute('aria-label', '返回选关');
    a.title = '返回选关';
    a.style.cssText = [
      'position:fixed;top:10px;left:10px;z-index:40;display:inline-flex;align-items:center;gap:6px;',
      'padding:7px 12px;border-radius:8px;border:1px solid #2b3047;background:rgba(20,26,64,.88);',
      'color:#dfe8f2;font:13px "Segoe UI","Microsoft YaHei",sans-serif;text-decoration:none;',
      'transition:border-color .18s,color .18s,box-shadow .18s;backdrop-filter:blur(2px)',
    ].join('');
    a.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M15 5l-7 7 7 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
      </svg><span style="opacity:.85">返回选关</span>`;
    layoutBack(a);
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

    /** 通关浮层（游戏风格面板；不污染画布，纯 DOM）。why = 未识别 id 时的具体原因 */
    overlay(id, total, why) {
      if (document.getElementById('czl-win')) return;
      const d = document.createElement('div');
      d.id = 'czl-win';
      d.setAttribute('role', 'dialog');
      d.setAttribute('aria-label', '通关');
      d.style.cssText = [
        'position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;',
        'background:rgba(6,9,26,0.72);backdrop-filter:blur(3px);',
      ].join('');
      const title = id === 'tutorial' ? '引导完成' : '通关！';
      d.innerHTML = `
        <div style="position:relative;min-width:300px;max-width:420px;padding:28px 34px 24px;text-align:center;
          background:linear-gradient(180deg,#1b1650,#100c2e);border:1.5px solid #e8b84b;color:#dfe8f2;
          font:15px 'Segoe UI','Microsoft YaHei',sans-serif;
          filter:drop-shadow(0 0 26px rgba(232,184,75,.4)) drop-shadow(0 16px 36px rgba(0,0,0,.55));
          clip-path:polygon(16px 0, calc(100% - 16px) 0, 100% 16px, 100% calc(100% - 16px), calc(100% - 16px) 100%, 16px 100%, 0 calc(100% - 16px), 0 16px)">
          <svg width="46" height="46" viewBox="0 0 24 24" aria-hidden="true" style="display:block;margin:0 auto 10px">
            <circle cx="12" cy="12" r="10.5" fill="none" stroke="#e8b84b" stroke-width="1.6"/>
            <path d="M7.2 12.4l3.1 3.1 6.4-6.9" fill="none" stroke="#ffd76a" stroke-width="2.2"
              stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <div style="font:bold 24px 'Segoe UI','Microsoft YaHei',sans-serif;color:#ffd76a;text-shadow:0 0 14px rgba(255,215,106,.6)">${title}</div>
          <div style="margin:8px 0 20px;color:#9fb2c8;font-size:13px">
            关卡进度已保存：<b style="color:#ffd76a">${id || '未识别关卡 id'}</b> · 累计 ${total ?? 0} 关
            <br><span style="font-size:11.5px;color:#7f8db0">${id
              ? '进度按关卡 id 记录；改 id 请同步改 levels/levels.json'
              : '没认出本页是哪个关卡' + (why ? '：' + why : '') +
                '<br>修法（二选一）：① 本关卡脚本里加 ChezzleReport.bind(scene, \'关卡id\')；' +
                '② 在 levels/levels.json 里把该关的 file 写成 ' + hereRaw() + '（.html 可省）'}</span>
          </div>
          <div style="display:flex;justify-content:center">
            <button class="czl-btn" data-act="select" style="cursor:pointer;padding:11px 40px;border:0;font-weight:bold;font-size:15px;
              background:linear-gradient(180deg,#ffd76a,#e8b84b);color:#2a2000;letter-spacing:3px;
              filter:drop-shadow(0 0 16px rgba(232,184,75,.55));
              clip-path:polygon(10px 0, calc(100% - 10px) 0, 100% 10px, 100% calc(100% - 10px), calc(100% - 10px) 100%, 10px 100%, 0 calc(100% - 10px), 0 10px)">返回选关</button>
          </div>
        </div>`;
      document.body.appendChild(d);
      // 进场动画：遮罩淡入 + 面板上浮放大（尊重 prefers-reduced-motion）
      const panel = d.firstElementChild;
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches && panel.animate) {
        d.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: 'ease-out' });
        panel.animate(
          [{ opacity: 0, transform: 'translateY(22px) scale(.94)' }, { opacity: 1, transform: 'none' }],
          { duration: 380, easing: 'cubic-bezier(.2,.9,.3,1.25)', delay: 60 },
        );
      }
      const go = (href) => {
        if (!matchMedia('(prefers-reduced-motion: reduce)').matches && d.animate) {
          d.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: 'ease-in' });
          setTimeout(() => { location.href = href; }, 200);
        } else location.href = href;
      };
      d.querySelector('[data-act="select"]').addEventListener('click', () => go(BASE + 'select.html'));
    },
  };
})();
