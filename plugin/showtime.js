// ============================================================================
// 演出编排（showtime）—— 声明式关卡演出模组
// ----------------------------------------------------------------------------
// 一个剧本表驱动整关演出（横幅/震屏/彩焰烟花/彩蛋），全部走引擎公开 API：
//   scene.showBanner / camera.shake / scene.explode(带焰色) / scene.wait。
// 触发器：enter（玩家进入本场景）/ open（某开关开启）/ pos（玩家进入区域）/
//          win（通关）/ at（世界时间到点）。
// 动作：{kind:'banner', text, dur} {kind:'shake', n} {kind:'fireworks', n, colors}
//       {kind:'flash', n}（白光闪）+ 开关接线提醒（showtime 用轮询，不覆盖关卡
//       自己的 onOpen 接线）。
// ----------------------------------------------------------------------------
// 用法（关卡脚本）：
//   const M = new Chezzle.Multiscene(container, {
//     width: 1100, height: 700,
//     plugins: [{
//       name: 'showtime',
//       cfg: {
//         M, // Multiscene 实例（取当前激活场景用）
//         plays: [
//           // on 由 ref 精确定位：enter 无需 ref；open/pos/win 需要
//           { scene: 'plain', on: 'enter', act: [
//               { kind: 'banner', text: '第 1 世界 · 苏醒草原\n先学会走路', dur: 2.6 },
//               ... ] },
//           { scene: 'plain', on: 'pos', ref: 'o2Zone', act: [
//               { kind: 'banner', text: '空气里有氧气 O₂……' } ] },
//           { scene: 'crater', on: 'win', act: [
//               { kind: 'fireworks', n: 26 }, { kind: 'banner', text: '🎉 恭喜通关！', dur: 999 } ] },
//         ],
//       },
//     }],
//   });
//   M.scene('plain', { worldW: 2200, worldH: 800 }).floor(...)...;
//   M.buildAll(); M.start('plain');
// 注：pos 区域的 id（ref）需要写到玩家身上？不需要——pos 的 ref 就是剧本里写的区域
// 矩形，跟物体无关（scene:id = 区域 id，字段 x/y/w/h 直接写在 play 上）。
// ============================================================================

// @@chezzle-plugin
// {
//   "name": "演出编排",
//   "version": "1.1",
//   "api": 1,
//   "description": "声明式关卡演出：enter/open/pos/win/at 触发器 × 横幅/震屏/彩焰烟花动作。cfg.plays=[{scene,on,ref?,at?,x?,y?,w?,h?,act:[{kind,...}]}]",
//   "enhance": []
// }
// @@end

Chezzle.Plugin.register('showtime', {
  // 编辑器侧：剧本存 editorState.showtime.plays，经 pluginCfg 注入试玩/导出（HTML/JSON 通用）。
  // 🎬 演出剧本面板 = 表单化编辑器（点「＋ 添加剧本」弹层编辑，不手拧 JSON）。
  editor(ed) {
    const st = ed.state;
    st.plays = st.plays ?? [];

    const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const say = (s) => { const st2 = document.getElementById('status'); if (st2) st2.textContent = s; };

    // ---- 弹层样式（一次性注入）----
    if (!document.getElementById('shModCss')) {
      const css = document.createElement('style');
      css.id = 'shModCss';
      css.textContent = `
        #shModal { position: fixed; inset: 0; background: rgba(4,6,18,.72); z-index: 310; display: none; align-items: center; justify-content: center; }
        #shModal .sh-box { width: min(700px, 94vw); max-height: 92vh; display: flex; flex-direction: column; background: #0d1330; border: 1px solid #3a4178; border-radius: 12px; padding: 12px 14px; box-shadow: 0 12px 60px rgba(0,0,0,.6); }
        #shModal h3 { margin: 0 0 8px; color: #7fe0ff; font-size: 14px; }
        #shModal .sh-scroll { overflow-y: auto; flex: 1; min-height: 0; padding-right: 2px; }
        #shModal .sh-row { display: flex; align-items: center; gap: 5px; margin: 6px 0; flex-wrap: wrap; }
        #shModal .sh-row label { color: #9fb2c8; font-size: 11px; }
        #shModal .sh-row input, #shModal .sh-row select, #shModal .sh-row textarea { background: #121a3e; color: #fff; border: 1px solid #3a4178; padding: 3px 5px; font-size: 12px; }
        #shModal .sh-row input.num60 { width: 60px; }
        #shModal .sh-act { background: #0e1432; border: 1px solid #232a55; border-radius: 6px; padding: 6px 8px; margin: 6px 0; }
        #shModal .sh-act-head { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
        #shModal .sh-act-head button { background: #2a3060; color: #fff; border: 1px solid #3a4178; border-radius: 3px; cursor: pointer; font-size: 10px; padding: 1px 5px; }
        #shModal .sh-act-head .sh-del { background: #5a2a2a; color: #ffd9d9; border-color: #7a3a3a; }
        #shModal .sh-act .sh-act-title { color: #7fe0ff; font-size: 11px; flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        #shModal .sh-foot { display: flex; gap: 8px; margin-top: 10px; align-items: center; }
        #shModal .sh-note { color: #6a7a96; font-size: 11px; }
        .sh-item { display: flex; gap: 4px; align-items: center; padding: 4px 2px; border-top: 1px solid var(--edge, #232a55); font-size: 11px; }
        .sh-item:first-child { border-top: none; }
        .sh-item .sh-i { color: #6a7a96; flex-shrink: 0; }
        .sh-item .sh-t { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #9fe8ff; }
        .sh-item button { background: #2a3060; color: #fff; border: 1px solid #3a4178; border-radius: 3px; cursor: pointer; font-size: 10px; padding: 1px 5px; flex-shrink: 0; }
        .sh-item .sh-del { background: #5a2a2a; color: #ffd9d9; border-color: #7a3a3a; }
      `;
      document.head.appendChild(css);
    }

    // ---- 数据来源：场景下拉（chapters 插件的场景列表）/ 物体 id（画布上的 id） ----
    const sceneIds = () => {
      const sel = document.getElementById('chSceneSel');
      const ids = sel ? [...sel.options].map((o) => o.value).filter(Boolean) : [];
      return [...new Set(ids)];
    };
    const objIds = () => {
      const gs = ed.getState;
      const ids = (gs()?.placed ?? []).map((p) => p.obj?.id).filter(Boolean);
      return [...new Set(ids)];
    };
    const KIND = { banner: '横幅', shake: '震屏', fireworks: '彩色烟花', flash: '白光闪', goto: '切场景' };
    const trigText = (p) => {
      if (p.on === 'enter') return '进入场景';
      if (p.on === 'open') return `开关「${p.ref ?? '?'}」开启`;
      if (p.on === 'pos') return `走到 (${p.x ?? 0},${p.y ?? 0}) ${p.w ?? 0}×${p.h ?? 0}`;
      if (p.on === 'win') return '通关';
      if (p.on === 'at') return `T+${p.at ?? 0}s`;
      return p.on ?? '?';
    };
    const sumText = (p) => (p.act ?? []).map((a) => {
      if (a.kind === 'banner') return '横幅「' + String(a.text ?? '').split('\n')[0].slice(0, 10) + '」';
      if (a.kind === 'goto') return '→' + (a.scene ?? '?');
      if (a.kind === 'fireworks') return '烟花×' + (a.n ?? 12);
      if (a.kind === 'shake') return '震屏×' + (a.n ?? 6);
      if (a.kind === 'flash') return '白光';
      return a.kind ?? '?';
    }).join(' · ') || '（无动作）';

    // ---- 侧栏面板：剧本列表（行 = 一条剧本） ----
    const panel = ed.addPanel({
      title: '🎬 演出剧本',
      html: `<div style="color:#6a7a96;font-size:10px;margin-bottom:6px">触发器 × 动作（试玩/导出同款）。点行编辑：可增删、调顺序、改参数。</div>
        <div id="shList"></div>
        <button class="btn" id="shAdd" style="width:100%;margin-top:6px">＋ 添加剧本</button>`,
    });
    const listBox = panel.querySelector('#shList');
    function renderList() {
      if (!st.plays.length) { listBox.innerHTML = '<div style="color:#6a7a96;font-size:11px">（还没有剧本——点下面「＋ 添加剧本」）</div>'; return; }
      listBox.innerHTML = st.plays.map((p, i) => `
        <div class="sh-item" title="场景 ${esc(p.scene ?? '（所有场景）')} · ${esc(trigText(p))}&#10;${esc(sumText(p))}">
          <span class="sh-i">#${String(i + 1).padStart(2, '0')}</span>
          <span class="sh-t">${esc(p.scene ?? '—')}｜${esc(trigText(p))}｜${esc(sumText(p))}</span>
          <button data-e="${i}" title="编辑该条剧本">✎</button>
          <button data-up="${i}" title="上移">↑</button>
          <button data-dn="${i}" title="下移">↓</button>
          <button data-del="${i}" class="sh-del" title="删除（再点一次确认）">✕</button>
        </div>`).join('');
    }
    let armedDel = -1;
    panel.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.e !== undefined) return openEdit(+b.dataset.e);
      if (b.dataset.up !== undefined) return movePlay(+b.dataset.up, -1);
      if (b.dataset.dn !== undefined) return movePlay(+b.dataset.dn, 1);
      if (b.dataset.del !== undefined) {
        const i = +b.dataset.del;
        if (armedDel === i) {
          armedDel = -1;
          st.plays.splice(i, 1);
          ed.save(); renderList();
          say('已删除剧本 #' + (i + 1) + '（还剩 ' + st.plays.length + ' 条）');
        } else {
          armedDel = i;
          setTimeout(() => { if (armedDel === i) armedDel = -1; }, 3000);
          say('再点一次 ✕ 确认删除剧本 #' + (i + 1));
        }
      }
    });
    function movePlay(i, d) {
      const j = i + d;
      if (j < 0 || j >= st.plays.length) return;
      const [p] = st.plays.splice(i, 1);
      st.plays.splice(j, 0, p);
      ed.save(); renderList();
    }
    panel.querySelector('#shAdd').onclick = () => openEdit(-1);

    // ---- 编辑弹层（新建 i=-1 / 编辑第 i 条） ----
    let modal = document.getElementById('shModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'shModal';
      modal.innerHTML = `<div class="sh-box">
        <h3 id="shTitle">🎬 编辑剧本</h3>
        <div class="sh-scroll">
          <div class="sh-row"><label>场景</label>
            <input id="shScene" list="shSceneList" style="width:110px" placeholder="如 plain（留空=所有场景）">
            <datalist id="shSceneList"></datalist>
            <span class="sh-note">场景名来自章节插件顶部「场景」下拉</span></div>
          <div class="sh-row"><label>触发</label><select id="shOn">
            <option value="enter">进入场景(enter)</option>
            <option value="open">开关开启(open)</option>
            <option value="pos">走到区域(pos)</option>
            <option value="win">通关(win)</option>
            <option value="at">时间到点(at)</option>
          </select><span id="shCond"></span></div>
          <div class="sh-note">触发后播一次（相同触发不重复）；条目之间互不影响。重复触发的场景用「时间到点(at)」排秒数。</div>
          <div id="shActs"></div>
          <button class="btn" id="shAddAct" style="margin-top:4px">＋ 添加动作</button>
          <div class="sh-note" style="margin-top:6px">动作：横幅=大屏幕字幕 · 震屏=抖一下相机 · 彩色烟花=特效爆炸串烧 · 白光闪=提醒 · 切场景=换世界（回头路/传送门用）</div>
        </div>
        <div class="sh-foot">
          <button class="btn primary" id="shSave">💾 保存</button>
          <button class="btn" id="shCancel">关闭 (Esc)</button>
          <span class="sh-note" id="shMsg"></span>
        </div>
      </div>`;
      document.body.appendChild(modal);
      modal.querySelector('#shCancel').onclick = () => { modal.style.display = 'none'; };
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.style.display === 'flex') { modal.style.display = 'none'; }
      }, true);
      // 触发类型切换 → 重渲染条件区（先收集当前输入，别把半填的丢了）
      const onSel = modal.querySelector('#shOn');
      const condBox = modal.querySelector('#shCond');
      const readCond = () => {
        const on = onSel.value;
        const v = (id) => modal.querySelector('#' + id)?.value ?? '';
        const n = (id) => { const s = v(id); return s.trim() === '' ? null : (+s || 0); };
        const c = {};
        if (on === 'open') { const r = v('shRef').trim(); if (r) c.ref = r; }
        else if (on === 'pos') {
          const x = n('shPx'), y = n('shPy'), w = n('shPw'), h = n('shPh');
          if (x != null) c.x = x; if (y != null) c.y = y; if (w != null) c.w = w; if (h != null) c.h = h;
          const r = v('shReq').trim(); if (r) c.require = r;
        } else if (on === 'at') { const t = n('shAt'); if (t != null) c.at = t; }
        return c;
      };
      const fillCond = (p) => {
        const on = onSel.value;
        if (on === 'open') condBox.innerHTML = `<label>开关</label><input id="shRef" list="shObjList" style="width:130px" placeholder="开关 id（如 sw1）" value="${esc(p.ref ?? '')}">`;
        else if (on === 'pos') condBox.innerHTML = `
          <label>x</label><input type="number" class="num60" id="shPx" value="${p.x ?? ''}">
          <label>y</label><input type="number" class="num60" id="shPy" value="${p.y ?? ''}">
          <label>宽</label><input type="number" class="num60" id="shPw" value="${p.w ?? ''}">
          <label>高</label><input type="number" class="num60" id="shPh" value="${p.h ?? ''}">
          <label>需开关</label><input id="shReq" list="shObjList" style="width:100px" placeholder="留空=无需" value="${esc(p.require ?? '')}">`;
        else if (on === 'at') condBox.innerHTML = `<label>T+</label><input type="number" class="num60" id="shAt" step="0.1" value="${p.at ?? 0.5}"><label>秒</label>`;
        else condBox.innerHTML = `<span style="color:#6a7a96;font-size:10px">无需条件</span>`;
      };
      onSel.addEventListener('change', () => {
        Object.assign(currentPlay ?? {}, readCond()); // 保住切换前输入
        fillCond(currentPlay ?? {});
      });
      // 动作行渲染
      const actsBox = modal.querySelector('#shActs');
      const actHTML = (a) => {
        const kind = a.kind ?? 'banner';
        const head = `<div class="sh-act-head">
          <select class="sh-act-kind">
            ${Object.entries(KIND).map(([k, l]) => `<option value="${k}" ${k === kind ? 'selected' : ''}>${l}(${k})</option>`).join('')}
          </select>
          <span class="sh-act-title" data-title></span>
          <button class="sh-up" title="上移">↑</button>
          <button class="sh-dn" title="下移">↓</button>
          <button class="sh-del" title="删除动作">✕</button>
        </div>`;
        let body = '';
        if (kind === 'banner') body = `<div class="sh-row" style="margin-top:4px"><textarea class="sh-bt" rows="2" style="width:100%;box-sizing:border-box" placeholder="横幅文字（可多行）">${esc(a.text ?? '')}</textarea></div>
          <div class="sh-row"><label>显示</label><input type="number" class="num60 sh-bd" step="0.1" value="${a.dur ?? 3}"><label>秒</label></div>`;
        else if (kind === 'shake') body = `<div class="sh-row"><label>强度</label><input type="number" class="num60 sh-sn" step="1" value="${a.n ?? 6}"></div>`;
        else if (kind === 'fireworks') body = `<div class="sh-row"><label>发数</label><input type="number" class="num60 sh-fn" step="1" value="${a.n ?? 12}"><label>颜色</label><input class="sh-fc" style="width:170px" value="${esc((a.colors ?? []).join(','))}" placeholder="留空=默认色板（如 #ffd23f,#c78bff）"></div>`;
        else if (kind === 'goto') body = `<div class="sh-row"><label>去场景</label><input class="sh-gs" list="shSceneList" style="width:110px" value="${esc(a.scene ?? '')}"><label>落点x</label><input type="number" class="num60 sh-gx" value="${a.spawn?.x ?? ''}"><label>y</label><input type="number" class="num60 sh-gy" value="${a.spawn?.y ?? ''}"><span class="sh-note">留空=场景默认出生点</span></div>`;
        else body = `<div class="sh-row sh-note">白光闪：提醒注意当前；无参数</div>`;
        return `<div class="sh-act">${head}<div class="sh-act-body">${body}</div></div>`;
      };
      const readAct = (row) => {
        const kind = row.querySelector('.sh-act-kind').value;
        const a = { kind };
        if (kind === 'banner') {
          const t = row.querySelector('.sh-bt').value;
          if (t.trim()) a.text = t;
          const d = parseFloat(row.querySelector('.sh-bd').value);
          if (Number.isFinite(d)) a.dur = d;
        } else if (kind === 'shake') {
          const n = Math.round(parseFloat(row.querySelector('.sh-sn').value) || 0);
          if (n > 0) a.n = n;
        } else if (kind === 'fireworks') {
          const n = Math.round(parseFloat(row.querySelector('.sh-fn').value) || 0);
          if (n > 0) a.n = n;
          const cs = row.querySelector('.sh-fc').value.split(',').map((s) => s.trim()).filter(Boolean);
          if (cs.length) a.colors = cs;
        } else if (kind === 'goto') {
          const sc = row.querySelector('.sh-gs').value.trim();
          if (sc) a.scene = sc;
          const sx = row.querySelector('.sh-gx').value.trim();
          const sy = row.querySelector('.sh-gy').value.trim();
          const spawn = {};
          if (sx !== '') spawn.x = +sx;
          if (sy !== '') spawn.y = +sy;
          if (Object.keys(spawn).length) a.spawn = spawn;
        }
        return a;
      };
      const walkTitle = (row) => {
        const a = readAct(row);
        row.querySelector('[data-title]').textContent = a ? Object.entries(a).map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' ') : '';
      };
      const renderAct = (row, a) => {
        // 整行重建（用 a 填充）
        const div = document.createElement('div');
        div.innerHTML = actHTML(a);
        row.parentNode.replaceChild(div.firstChild, row);
        bindAct(div.firstChild);
      };
      const bindAct = (row) => {
        row.querySelector('.sh-act-kind').addEventListener('change', () => {
          renderAct(row, { kind: row.querySelector('.sh-act-kind').value });
        });
        row.querySelector('.sh-up').onclick = () => { const pa = row.parentNode; const pv = pa.children; const i = [...pv].indexOf(row); if (i > 0) pa.insertBefore(row, pv[i - 1]); refreshActTitles(); };
        row.querySelector('.sh-dn').onclick = () => { const pa = row.parentNode; const pv = pa.children; const i = [...pv].indexOf(row); if (i < pv.length - 1) pa.insertBefore(row, pv[i + 2]); refreshActTitles(); };
        row.querySelector('.sh-del').onclick = () => { row.remove(); refreshActTitles(); };
        // 实时更新行标题（横幅文字等）
        row.addEventListener('input', () => row.querySelector('[data-title]') && walkTitle(row));
        walkTitle(row);
      };
      const refreshActTitles = () => { for (const r of actsBox.querySelectorAll('.sh-act')) walkTitle(r); };
      modal.querySelector('#shAddAct').onclick = () => {
        const div = document.createElement('div');
        div.innerHTML = actHTML({ kind: 'banner', dur: 3 });
        const row = div.firstChild;
        actsBox.appendChild(row);
        bindAct(row);
      };
      // 保存/编辑数据
      let currentPlay = null; // 编辑中的 play（条件区切换时暂存用）
      const openEdit = (i) => {
        currentPlay = i >= 0 ? { ...(st.plays[i] ?? {}) } : { on: 'enter', act: [] };
        modal.querySelector('#shTitle').textContent = i >= 0 ? `🎬 编辑剧本 #${i + 1}（${esc(currentPlay.scene ?? '所有场景')} · ${trigText(currentPlay)}）` : '🎬 新增剧本';
        modal.querySelector('#shMsg').textContent = '';
        modal.querySelector('#shScene').value = currentPlay.scene ?? '';
        const onSel2 = modal.querySelector('#shOn');
        onSel2.value = currentPlay.on ?? 'enter';
        fillCond(currentPlay);
        // 场景/物体 datalist
        modal.querySelector('#shSceneList').innerHTML = sceneIds().map((s) => `<option value="${esc(s)}">`).join('');
        modal.querySelector('#shObjList')?.remove();
        const dl = document.createElement('datalist');
        dl.id = 'shObjList';
        dl.innerHTML = objIds().map((s) => `<option value="${esc(s)}">`).join('');
        modal.appendChild(dl);
        // 动作行
        actsBox.innerHTML = '';
        for (const a of currentPlay.act ?? []) {
          const div = document.createElement('div');
          div.innerHTML = actHTML(a);
          actsBox.appendChild(div.firstChild);
        }
        for (const r of actsBox.querySelectorAll('.sh-act')) bindAct(r);
        modal.style.display = 'flex';
        modal.querySelector('#shScene').focus();
      };
      modal.querySelector('#shSave').onclick = () => {
        const p = { ...(currentPlay ?? {}) };
        p.on = onSel.value; // 触发类型以表单为准（change 时 currentPlay 可能还是旧值）
        Object.assign(p, readCond());
        const sc = modal.querySelector('#shScene').value.trim();
        if (sc) p.scene = sc; else delete p.scene;
        const acts = [];
        let skipped = 0;
        for (const row of actsBox.querySelectorAll('.sh-act')) {
          const a = readAct(row);
          if (a.kind === 'banner' && !a.text) { skipped++; continue; }
          if (a.kind === 'goto' && !a.scene) { skipped++; continue; }
          acts.push(a);
        }
        p.act = acts;
        if (!acts.length) { say('⚠ 剧本"无动作"：先加一个动作（或删除本剧本）'); return; }
        const editIdx = modal.dataset.i !== undefined && modal.dataset.i !== '' ? +modal.dataset.i : -1;
        if (editIdx >= 0) st.plays[editIdx] = p; else st.plays.push(p);
        ed.save();
        modal.style.display = 'none';
        renderList();
        say(sc ? `已保存剧本（场景${sc} · ${trigText(p)}）${skipped ? '，跳过 ' + skipped + ' 个空动作' : ''}` : '已保存剧本');
      };
      // openEdit 需要 modal.dataset.i（编辑目标）——放进 modal 上的入口
      Object.defineProperty(modal, '__openEdit', { value: (i) => { modal.dataset.i = String(i); openEdit(i); } });
      window.__shOpen = (i) => modal.__openEdit(i); // 测试/调试后门
    }

    const openEdit = (i) => {
      if (!modal || !modal.parentNode) return say('演出剧本面板未就绪');
      modal.__openEdit(i);
    };

    renderList();
    ed.onStateLoaded(() => renderList());
    ed.pluginCfg(() => ({ plays: st.plays }));
    // 卸载/重载清理：移除弹层与样式
    return () => { document.getElementById('shModal')?.remove(); document.getElementById('shModCss')?.remove(); };
  },

  run(scene, api, cfg) {
    const rawM = cfg.M;
    const M = typeof rawM === 'function' ? rawM() : rawM; // 编辑器流程传 () => M（构造期引用兼容）
    const all = Array.isArray(cfg.plays) ? cfg.plays : [];
    const cancels = [];
    // 本场景名：在 Multiscene 里找自己（inject 后 M.scenes 已就绪）
    let myName = cfg.scene ?? null;
    if (!myName && M) {
      for (const [name, e] of M.scenes) {
        if (e.scene === scene) { myName = name; break; }
      }
    }
    const plays = all.filter((p) => !p.scene || p.scene === myName);
    if (!plays.length) return () => {};

    const act = (fn) => {
      try { fn(); } catch (e) { /* 演出失败不影响游戏 */ }
    };
    const doActions = (list) => {
      for (const a of list ?? []) {
        if (a.kind === 'banner') act(() => scene.showBanner(a.text, a.dur ?? 3));
        else if (a.kind === 'shake') act(() => { if (scene.camera) scene.camera.shake(a.n ?? 6); });
        else if (a.kind === 'flash') act(() => scene.explode({ x: scene.worldW / 2, y: scene.worldH * 0.4 }, 6, '白光', ['#ffffff']));
        else if (a.kind === 'fireworks') act(() => fireworks(a.n ?? 12, a.colors, a.area));
        else if (a.kind === 'goto') act(() => {
          // 场景切换：pos 触发用它（"出口到达"——墙删后玩家走进门后区域即传送；
          // 传送门/回头路同理）。单场景关卡无 M：忽略。
          if (M && a.scene && typeof M.switchTo === 'function') {
            M.switchTo(a.scene, a.spawn ? { spawn: a.spawn } : undefined);
          }
        });
      }
    };

    // 彩焰烟花：场景上半空连环爆炸（焰色染色=发布彩色），一次演出 0.35s 一发
    const COLORS = ['#ffd23f', '#c78bff', '#4dff5f', '#ff5fd0', '#ff5f2e', '#4fb6ff', '#b8ff4f', '#ff3d6a'];
    function fireworks(n, colors, area) {
      const cs = colors ?? COLORS;
      let done = 0;
      const one = () => {
        if (done >= n) return;
        done++;
        const p = scene.player;
        const cx = p ? p.x + p.w / 2 : scene.worldW / 2;
        const [ox, oy, ow, oh] = area ?? [cx - 500, scene.worldH * 0.12, 1000, 260];
        const x = ox + Math.random() * ow;
        const y = oy + Math.random() * oh;
        const c = cs[Math.floor(Math.random() * cs.length)];
        act(() => scene.explode({ x, y }, 6 + Math.random() * 4, '🎆', [c]));
        cancels.push(scene.wait(0.28 + Math.random() * 0.2, one));
      };
      one();
    }

    // ---- 触发器 ----
    const fireOnce = (p) => { if (p._fired) return; p._fired = true; doActions(p.act); };

    // ① enter：Multiscene switchTo 会 fire('enter')
    for (const p of plays) {
      if (p.on === 'enter') scene.on('enter', () => fireOnce(p));
    }
    // ② win
    for (const p of plays) {
      if (p.on === 'win') scene.on('win', () => fireOnce(p));
    }
    // ③ open：轮询开关开态边沿（不覆盖关卡自己的 onOpen 接线——Switch 的 open
    //    handler 是单值，showtime 不与之抢）
    const openRefs = plays.filter((p) => p.on === 'open' && p.ref);
    const openWatch = () => {
      for (const p of openRefs) {
        const sw = scene.byId[p.ref];
        if (!sw || p._fired) continue;
        const eff = typeof sw.effectiveOpen === 'function' ? sw.effectiveOpen(scene) : !!sw.open;
        if (eff && !sw._shLast) fireOnce(p);
        sw._shLast = eff;
      }
      cancels.push(scene.wait(0.2, openWatch));
    };
    if (openRefs.length) openWatch();
    // ④ pos：玩家中心进入矩形（一次；触发后停轮询）。require=开关 id：开关有效开启才触发
    //   （传送门"被开关承认才亮"——没过门的门不能传）。
    for (const p of plays) {
      if (p.on !== 'pos' || !(Number.isFinite(p.x) && Number.isFinite(p.w))) continue;
      const check = () => {
        if (p._fired) return;
        let ok = true;
        if (p.require) {
          const sw = scene.byId[p.require];
          const open = sw ? (typeof sw.effectiveOpen === 'function' ? sw.effectiveOpen(scene) : !!sw.open) : true;
          ok = !!open;
        }
        if (ok) {
          const pl = scene.player;
          if (pl && !pl.hidden) {
            const cx = pl.x + pl.w / 2;
            const cy = pl.y + pl.h / 2;
            if (cx >= p.x && cx <= p.x + p.w && cy >= p.y && cy <= p.y + p.h) fireOnce(p);
          }
        }
        cancels.push(scene.wait(0.2, check));
      };
      check();
    }
    // ⑤ at：世界时间到点（一次）
    for (const p of plays) {
      if (p.on === 'at' && Number.isFinite(p.at)) {
        cancels.push(scene.wait(p.at, () => fireOnce(p)));
      }
    }

    return () => { for (const c of cancels) c(); };
  },
});
