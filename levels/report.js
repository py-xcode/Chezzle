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

  // 常驻悬浮"返回选关"（左上角，不遮挡游戏画面）
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

    /** 监听通关：记录 + 弹出浮层（返回选关 / 再玩一次） */
    bind(scene, id) {
      if (!scene || typeof scene.on !== 'function') return;
      scene.on('win', () => {
        ChezzleReport.record(id);
        ChezzleReport.overlay(id);
      });
    },

    /** 通关浮层（游戏风格面板；不污染画布，纯 DOM） */
    overlay(id) {
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
          <div style="margin:8px 0 18px;color:#9fb2c8;font-size:13px">
            关卡进度已保存，同位素格变得更亮了
          </div>
          <div style="display:flex;gap:10px;justify-content:center">
            <button class="czl-btn" data-act="select" style="cursor:pointer;padding:9px 22px;border:0;font-weight:bold;font-size:14px;
              background:linear-gradient(180deg,#ffd76a,#e8b84b);color:#2a2000;letter-spacing:1px;
              filter:drop-shadow(0 0 14px rgba(232,184,75,.5));
              clip-path:polygon(8px 0, calc(100% - 8px) 0, 100% 8px, 100% calc(100% - 8px), calc(100% - 8px) 100%, 8px 100%, 0 calc(100% - 8px), 0 8px)">返回选关</button>
            <button class="czl-btn" data-act="again" style="cursor:pointer;padding:9px 22px;border:1px solid #3a4178;font-size:14px;
              background:#1c2350;color:#dfe8f2;
              clip-path:polygon(8px 0, calc(100% - 8px) 0, 100% 8px, 100% calc(100% - 8px), calc(100% - 8px) 100%, 8px 100%, 0 calc(100% - 8px), 0 8px)">再玩一次</button>
          </div>
          <div style="margin-top:12px;color:#6a7a96;font-size:11px">选关页：元素周期表 · 同位素全通关整格发光</div>
        </div>`;
      document.body.appendChild(d);
      d.querySelector('[data-act="select"]').addEventListener('click', () => {
        location.href = BASE + 'select.html';
      });
      d.querySelector('[data-act="again"]').addEventListener('click', () => location.reload());
    },
  };
})();
