// ============================================================================
// 新手检查点（checkpoint）—— 死亡自动回到最近检查点复活（新手关防挫败神器）
// ----------------------------------------------------------------------------
// 原版机制：死亡 = 整关重开（R 刷新页面）。对新手是灾难——全关卡重来。
// 本插件提供"检查点复活"（支持多场景 / Multiscene）：
//   - cfg.spawns：每个检查点 = 登记区域矩形 + 复活点（脚底 y），可带 scene 字段
//     （多场景：只登记自己场景的检查点；单场景不需要）；
//   - 玩家走进登记区域即"打卡"（同帧多个满足取 x 最大 = 最新）；死亡后 0.9 秒
//     复活：回最近检查点、回满血（核心物质补回）、清速度/传送门冷却/残留反应气，
//     弹一条随机幽默横幅。
// 用法（关卡脚本）：
//   const M = new Chezzle.Multiscene(container, { width:1100, height:700, plugins: [{
//     name: 'checkpoint',
//     cfg: { M, spawns: [
//       { scene: 'plain',   id: 'c1', x: 0, y: 0, w: 600,  h: 800, sx: 80,  sy: 700 },
//       { scene: 'basin',   id: 'c5', x: 0, y: 0, w: 900,  h: 800, sx: 120, sy: 700 },
//     ], texts: ['复活！化学家从不回头看爆炸', ...] },
//   }]});
// ============================================================================

// @@chezzle-plugin
// {
//   "name": "新手检查点",
//   "version": "1.1",
//   "api": 1,
//   "description": "死亡自动回到最近检查点并回满血，再弹一条幽默横幅——新手关不用因死亡从头再来。cfg.spawns=[{scene?,id,x,y,w,h,sx,sy}]（scene=多场景的世界名），cfg.texts=复活横幅文案（随机取一条）。支持 Multiscene：死在哪世界回哪世界",
//   "enhance": []
// }
// @@end

Chezzle.Plugin.register('checkpoint', {
  // 编辑器侧：spawns/texts 存 editorState.checkpoint，经 pluginCfg 注入试玩/导出
  editor(ed) {
    const st = ed.state;
    st.spawns = st.spawns ?? [];
    st.texts = st.texts ?? ['复活！从检查点继续', '没事，再来一次'];
    const panel = ed.addPanel({
      title: '🗺 新手检查点',
      html: `<div class="tip-note">JSON 数组。每条：{scene?(多场景世界名), id, x, y, w, h, sx, sy}（登记区域 + 复活点脚底 y）。
      例：{"id":"c1","x":0,"y":0,"w":700,"h":800,"sx":140,"sy":700}
      下面第二框 = texts（复活横幅文案，随机取一条）。</div>
      <textarea id="ckSpawns" rows="12" style="width:100%;box-sizing:border-box;font:11px monospace"></textarea>
      <textarea id="ckTexts" rows="2" style="width:100%;box-sizing:border-box;font:11px monospace;margin-top:4px"></textarea>
      <button class="btn" id="ckSave" style="margin-top:4px">保存检查点</button>`,
    });
    const say = (s) => { const st2 = ed.$ && ed.$('#status'); if (st2) st2.textContent = s; };
    const render = () => {
      panel.querySelector('#ckSpawns').value = JSON.stringify(st.spawns, null, 1);
      panel.querySelector('#ckTexts').value = JSON.stringify(st.texts);
    };
    panel.querySelector('#ckSave').onclick = () => {
      try {
        const s = JSON.parse(panel.querySelector('#ckSpawns').value || '[]');
        const t = JSON.parse(panel.querySelector('#ckTexts').value || '[]');
        if (!Array.isArray(s)) return say('spawns 必须是 JSON 数组');
        st.spawns = s;
        if (Array.isArray(t) && t.length) st.texts = t;
        ed.save();
        render();
        say('检查点已保存 ' + s.length + ' 个');
      } catch (e) {
        say('JSON 解析失败：' + e.message);
      }
    };
    render();
    ed.onStateLoaded(() => render());
    ed.pluginCfg(() => ({ spawns: st.spawns, texts: st.texts }));
  },

  run(scene, api, cfg) {
    const rawM = cfg.M;
    const M = typeof rawM === 'function' ? rawM() : rawM; // 编辑器流程传 () => M（构造期引用兼容）
    const all = Array.isArray(cfg.spawns) ? cfg.spawns.filter((s) => s && Number.isFinite(s.x)) : [];
    if (!all.length) return () => {};
    const texts = Array.isArray(cfg.texts) && cfg.texts.length ? cfg.texts : ['复活！从检查点继续'];
    let myName = cfg.scene ?? null;
    if (!myName && M) {
      for (const [name, e] of M.scenes) {
        if (e.scene === scene) { myName = name; break; }
      }
    }
    // 多场景：只登记自己场景的检查点；单场景：全部
    const spawns = all.filter((s) => (myName ? s.scene === myName : !s.scene));
    if (!spawns.length) return () => {};
    let cur = null;
    const cancels = [];
    let reviving = false; // 复活进行中（setTimeout 等待期）：防重复触发

    // 检查点登记：玩家中心进入区域 → 记录（同帧多个满足取 x 最大 = 最新章节）
    const watch = () => {
      const p = scene.player;
      if (p && !p.hidden && p.w > 0) {
        const cx = p.x + p.w / 2;
        const cy = p.y + p.h / 2;
        let best = null;
        for (const s of spawns) {
          if (cx >= s.x && cx <= s.x + s.w && cy >= s.y && cy <= s.y + s.h && (!best || s.x > best.x)) best = s;
        }
        if (best && best !== cur) {
          cur = best;
          scene.fire('checkpoint', { id: best.id, x: best.sx, y: best.sy });
        }
      }
      cancels.push(scene.wait(0.25, watch));
    };
    watch();

    // 复活：死亡后（scene.time 冻结，wait 走不动）用真实时钟延迟复活
    scene.on('died', () => {
      if (reviving) return;
      reviving = true;
      setTimeout(() => {
        reviving = false;
        const p = scene.player;
        if (!p || !cur || scene.status !== 'died') return;
        // 回满血：核心物质补回（死亡多半是被反应吃光了）
        if (p.grid && p.maxHp) {
          const missing = Math.max(0, p.maxHp - p.hp);
          if (missing > 0.01) {
            p.grid.add(p.substance, missing);
            if (p.syncGrid) p.syncGrid();
          }
        }
        // 传回检查点：脚底对齐复活点、速度清零、传送门冷却清掉、残留反应气清掉
        p.x = (cur.sx ?? p.x) - (p.w ?? 0) / 2;
        p.y = (cur.sy ?? p.y) - (p.h ?? 0);
        p.vel = { x: 0, y: 0 };
        p._portalLast = null;
        if (scene._reactGas) scene._reactGas = {};
        scene.setStatus('running');
        scene.showBanner(texts[Math.floor(Math.random() * texts.length)], 2.6);
      }, 900);
    });

    return () => { for (const c of cancels) c(); };
  },
});
