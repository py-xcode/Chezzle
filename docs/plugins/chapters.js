// ============================================================================
// 官方示例插件：章节场景（chapters）—— 编辑器插件（"改编编辑器"示范）
// ----------------------------------------------------------------------------
// 功能（全部在顶边栏，不占侧栏）：
//   - 「场景」下拉 + ＋/✕：管理多个场景（章节地图），自动保存（无"存为场景"按钮）；
//   - ★：把当前场景设为**初始场景**（导出 M.start 与"试玩整关"从它开始）；
//   - 「大气」框：设置**当前场景**的大气物质（`CO2:8, O2:15`），随场景快照持久化；
//   - 试玩接管：编辑器「试玩」按钮 = 整关（初始场景开始）；场景下拉切换时自动保存；
//    试玩中「▶当前」变「⏹ 退出」（点它就结束试玩，与顶部退出按钮等效）。
// 导出钩子：多场景时改写为 Multiscene + 开关「切到场景(id)」接线（`?.` 防失效引用）；
// 单场景关卡完全不干预（默认导出不变）。开关的「切到场景(id)」由 enhance 提供。
// ============================================================================

// @@chezzle-plugin
// {
//   "name": "章节场景",
//   "version": "2.0",
//   "api": 1,
//   "description": "编辑器插件：一关多场景（章节地图）；顶边栏管理，★设初始场景，开关「切到场景(id)」即传送，可设每场景大气",
//   "enhance": [
//     {
//       "types": ["switch"],
//       "fields": [
//         { "key": "sceneTo", "label": "切到场景(id)", "kind": "text", "def": "" }
//       ]
//     }
//   ]
// }
// @@end

Chezzle.Plugin.register('chapters', {
  editor(ed) {
    const st = ed.state;
    st.scenes = st.scenes ?? []; // [{ id, snap }]；snap = { worldW, worldH, rx, atm, objects }
    st.current = st.current ?? null;
    st.start = st.start ?? null; // 初始场景 id

    const ST = ed.getState;
    const nextId = () => {
      const used = new Set(st.scenes.map((s) => s.id));
      for (const c of 'abcdefghijklmnopqrstuvwxyz') if (!used.has(c)) return c;
      let n = 1;
      while (used.has('s' + n)) n++;
      return 's' + n;
    };
    const saveCurrent = () => {
      if (!st.current) return;
      const s = st.scenes.find((x) => x.id === st.current);
      if (s) s.snap = ed.snapshot();
    };
    const applyScene = (i) => {
      saveCurrent();
      const s = st.scenes[i];
      if (!s) return;
      st.current = s.id;
      ed.applySnapshot(s.snap);
      refresh();
    };
    const addScene = () => {
      saveCurrent();
      const id = nextId();
      st.scenes.push({ id, snap: { worldW: 3000, worldH: 800, rx: [], atm: {}, objects: [] } });
      st.current = id;
      ed.applySnapshot({ worldW: 3000, worldH: 800, rx: [], atm: {}, objects: [] });
      refresh();
    };
    let armDel = -1;
    const removeScene = (i) => {
      const s = st.scenes[i];
      if (!s) return;
      if (armDel === i) {
        armDel = -1;
        const wasCur = st.current === s.id;
        st.scenes.splice(i, 1);
        if (st.start === s.id) st.start = st.scenes.length ? st.scenes[0].id : null;
        if (wasCur) {
          const k = st.scenes[Math.max(0, i - 1)];
          st.current = k ? k.id : null;
          if (k) ed.applySnapshot(k.snap);
          else ed.applySnapshot({ worldW: 3000, worldH: 800, rx: [], atm: {}, objects: [] });
        }
        refresh();
      } else {
        armDel = i;
        setTimeout(() => { armDel = -1; refresh(); }, 3000);
        refresh();
      }
    };
    let armDelNote = '';
    const setStart = () => {
      st.start = st.current;
      refresh();
    };

    // ---- 顶边栏控件 ----
    const wrap = document.createElement('span');
    wrap.style.cssText = 'display:flex;gap:4px;align-items:center;white-space:nowrap';
    wrap.innerHTML = `
      <label style="color:#9fb2c8">场景
        <select id="chSceneSel" title="切换场景（自动保存当前）" style="width:72px"></select>
        <button class="btn" id="chAdd" title="新建场景（章节地图）" style="padding:1px 6px">＋</button>
        <button class="btn" id="chDel" title="删除当前场景（再点一次确认）" style="padding:1px 6px">✕</button>
        <button class="btn" id="chStart" title="把当前场景设为初始场景（导出/试玩从这里开始）" style="padding:1px 6px">★</button>
      </label>
      <button class="btn" id="chPlayCur" title="只试玩当前场景" style="padding:1px 6px">▶当前</button>`;
    ed.addToolbarElement(wrap);

    function refresh() {
      const sel = wrap.querySelector('#chSceneSel');
      sel.innerHTML = st.scenes.map((s) => `<option value="${s.id}">${s.id}${st.start === s.id ? '★' : ''}${st.current === s.id ? '（编辑中）' : ''}</option>`).join('');
      sel.value = st.current ?? '';
      sel.disabled = st.scenes.length === 0;
    }

    wrap.querySelector('#chSceneSel').onchange = (e) => {
      const idx = e.target.selectedIndex;
      if (idx >= 0) applyScene(idx);
    };
    wrap.querySelector('#chAdd').onclick = addScene;
    wrap.querySelector('#chDel').onclick = () => removeScene(st.scenes.findIndex((s) => s.id === st.current));
    wrap.querySelector('#chStart').onclick = () => setStart();
    const chPlayCur = wrap.querySelector('#chPlayCur');
    // 试玩中：把「▶当前」变成「⏹ 退出」——点它直接结束试玩（与顶部「退出试玩」等效）
    const applyPlayUi = (playing) => {
      chPlayCur.textContent = playing ? '⏹ 退出' : '▶当前';
      chPlayCur.title = playing ? '结束试玩，回到编辑器' : '只试玩当前场景';
      chPlayCur.onclick = playing
        ? () => { const b = document.getElementById('btnPlay'); if (b) b.click(); }
        : () => {
          // 只试玩当前场景（切换试玩方向走编辑器「试玩」按钮）
          ed.setPlayMode('current');
          const b = document.getElementById('btnPlay'); if (b) b.click();
          ed.setPlayMode('all'); // 下次恢复整关（初始场景）
        };
    };
    applyPlayUi(false); // 初始（编辑器态）
    ed.onPlayState(applyPlayUi);

    // 初始化：空则登记当前画布为场景 a
    if (st.scenes.length === 0) {
      st.scenes.push({ id: 'a', snap: ed.snapshot() });
      st.current = 'a';
    } else if (!st.scenes.some((s) => s.id === st.current)) {
      st.current = st.scenes[0].id;
    }
    // ★ 初始场景缺省 = 第一个
    if (!st.start || !st.scenes.some((s) => s.id === st.start)) st.start = st.scenes[0].id;
    refresh();
    ed.onStateLoaded(() => refresh());

    // ---- 试玩接管（current=仅当前场景；all=整关从初始场景开始；单场景不接管） ----
    function buildAndPlay(scenesGo, startId) {
      if (!scenesGo.length) return null;
      // 试玩窗口内嵌编辑区（不盖工具栏：编辑器「⏹ 退出试玩」按钮始终可点）；
      // 无内置退出按钮——试玩时「▶当前」会变成「⏹ 退出」（ed.onPlayState 同步）
      const wrap = document.getElementById('canvasWrap');
      wrap.style.position = 'relative';
      const holder = document.createElement('div');
      holder.style.cssText = 'position:absolute;inset:0;z-index:60;background:#0b0e28;display:flex;align-items:center;justify-content:center;';
      const box = document.createElement('div');
      box.style.cssText = 'position:relative;width:100%;max-width:1100px;height:calc(100% - 8px);';
      holder.appendChild(box);
      wrap.appendChild(holder);
      const hint = document.createElement('div');
      hint.textContent = 'A/D 移动 · 空格跳 · Q 收集 · Shift 放置 · 顶部「⏹ 退出试玩」返回编辑器';
      hint.style.cssText = 'position:absolute;top:10px;left:50%;transform:translateX(-50%);z-index:70;color:#6a7a96;font-size:11px;font-family:system-ui,sans-serif;';
      holder.appendChild(hint);
      const M = new Chezzle.Multiscene(box, {
        width: 1100,
        height: 700,
        // 插件 cfg 注入 M（惰性函数——showtime/checkpoint 做场景匹配用）
        plugins: ed.getActivePlugins().map((p) => ({ ...p, cfg: { ...(p.cfg ?? {}), M: () => M } })),
      });
      for (const s of scenesGo) {
        const b = M.scene(s.id, { worldW: s.snap.worldW, worldH: s.snap.worldH });
        for (const p of ed.objectsFrom(s.snap)) {
          if (p.type === 'rope') continue;
          if (p.obj) b.add(p.obj);
        }
        for (const rxc of s.snap.rx ?? []) {
          const rule = Chezzle.parseReactionStr(rxc);
          if (rule) b.scene.customReactions.push(rule);
        }
      }
      M.buildAll();
      // 绳子 + 大气预设（buildAll 后）
      for (const s of scenesGo) {
        const sc = M.byName(s.id);
        if (!sc) continue;
        for (const p of ed.objectsFrom(s.snap)) {
          if (p.type === 'rope' && p.obj) sc.addObject(p.obj);
        }
        for (const [gid, mass] of Object.entries(s.snap.atm ?? {})) {
          if (Number.isFinite(mass) && mass > 0) sc.atmosphere.setGas(gid, mass);
        }
      }
      // 开关「切到场景」→ switchTo（目标场景玩家位置=入口）
      for (const s of scenesGo) {
        for (const p of ed.objectsFrom(s.snap)) {
          if (p.type !== 'switch' || !p.obj.sceneTo || !p.obj.id) continue;
          const target = scenesGo.find((t) => t.id === p.obj.sceneTo);
          if (!target) continue;
          let spawn = { x: Math.round((target.snap.worldW ?? 3000) / 2), y: Math.round((target.snap.worldH ?? 800) / 2) };
          const pp = (target.snap.objects ?? []).find((o) => o.type === 'player');
          if (pp) spawn = { x: Math.round(pp.opts.x ?? 0), y: Math.round((pp.opts.y ?? 0) + 10) };
          M.byId(s.id, p.obj.id)?.onOpen(() => M.switchTo(target.id, { spawn }));
        }
      }
      M.start(startId);
      return () => { M.stop(); holder.remove(); };
    }

    ed.onPlay(() => {
      saveCurrent(); // 当前编辑内容先进快照（试玩/导出永远基于最新场景）
      const scenes = st.scenes.filter((s) => s.snap);
      if (scenes.length <= 1) return null; // 单场景：编辑器默认试玩
      const startId = st.scenes.some((s) => s.id === st.start) ? st.start : scenes[0].id;
      return buildAndPlay(scenes, startId);
    }, 'all');

    ed.onPlay(() => {
      saveCurrent();
      const s = st.scenes.find((x) => x.id === st.current);
      if (!s?.snap) return null;
      return buildAndPlay([s], s.id);
    }, 'current');

    // ---- 导出钩子：多场景 → Multiscene + 开关接线 + 大气预设 + 初始场景 ----
    ed.onExport((lines, ctx) => {
      saveCurrent(); // 当前编辑内容先进快照
      const scenes = st.scenes.filter((s) => s.snap);
      if (scenes.length <= 1) return; // 单场景：交给默认导出（LevelBuilder）
      const q = ctx.safeJson;
      const startId = st.scenes.some((s) => s.id === st.start) ? st.start : scenes[0].id;
      lines.length = 0;
      lines.push("const canvas = document.getElementById('game');");
      lines.push('canvas.width = 1100;');
      lines.push('canvas.height = 700;');
      // 插件（含编辑器配置的 cfg：演出剧本/检查点等）；构造后再补 M 惰性引用
      lines.push(`const PLUGINS = ${ctx.safeJson(ed.getActivePlugins())};`);
      lines.push('const M = new Chezzle.Multiscene(canvas, { width: 1100, height: 700, plugins: PLUGINS });');
      lines.push('for (const p of PLUGINS) if (p.cfg && typeof p.cfg === "object") p.cfg.M = () => M;');
      const post = [];
      for (const s of scenes) {
        const d = ed.sceneDsl(s.snap, s.id);
        lines.push(...d.chain);
        post.push(...d.post);
        for (const p of d.placed) {
          if (p.type !== 'switch' || !p.obj.sceneTo || !p.obj.id) continue;
          const target = scenes.find((t) => t.id === p.obj.sceneTo);
          if (!target) continue;
          let spawn = { x: Math.round((target.snap.worldW ?? 3000) / 2), y: Math.round((target.snap.worldH ?? 800) / 2) };
          const pp = (target.snap.objects ?? []).find((o) => o.type === 'player');
          if (pp) spawn = { x: Math.round(pp.opts.x ?? 0), y: Math.round((pp.opts.y ?? 0) + 10) };
          lines.push(`// 🚪 ${s.id}.${p.obj.id} → ${target.id}`);
          lines.push(`M.byId(${q(s.id)}, ${q(p.obj.id)})?.onOpen(() => M.switchTo(${q(target.id)}, { spawn: { x: ${spawn.x}, y: ${spawn.y} } }));`);
        }
      }
      lines.push('', 'M.buildAll();');
      lines.push(...post);
      lines.push('', `M.start(${q(startId)});`); // ★ 初始场景
      const lid = (document.getElementById('inLevelId')?.value || '').trim();
      if (lid) {
        lines.push(`ChezzleReport.bind(M.byName(${q(startId)}), '${lid.replace(/[^0-9A-Za-z\u4e00-\u9fff-]/g, '')}');`);
      } else {
        lines.push("// ChezzleReport.bind(M.byName('a'), 'H-1');");
      }
    });
  },
});
