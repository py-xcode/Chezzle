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
//   "version": "1.0",
//   "api": 1,
//   "description": "声明式关卡演出：enter/open/pos/win/at 触发器 × 横幅/震屏/彩焰烟花动作。cfg.plays=[{scene,on,ref?,at?,x?,y?,w?,h?,act:[{kind,...}]}]",
//   "enhance": []
// }
// @@end

Chezzle.Plugin.register('showtime', {
  // 编辑器侧：剧本存 editorState.showtime.plays，经 pluginCfg 注入试玩/导出（HTML/JSON 通用）
  editor(ed) {
    const st = ed.state;
    st.plays = st.plays ?? [];
    const panel = ed.addPanel({
      title: '🎬 演出剧本',
      html: `<div class="tip-note">JSON 数组。每条：{scene, on:'enter|open|pos|win|at', ref?, at?, x?, y?, w?, h?, act:[{kind:'banner'|'shake'|'fireworks'|'flash',...}]}
      例：{"scene":"plain","on":"at","at":0.5,"act":[{"kind":"banner","text":"嘿！你好！","dur":2.2}]}</div>
      <textarea id="shPlays" rows="14" style="width:100%;box-sizing:border-box;font:11px monospace"></textarea>
      <button class="btn" id="shSave" style="margin-top:4px">保存剧本</button>`,
    });
    const ta = panel.querySelector('#shPlays');
    const say = (s) => { const st2 = ed.$ && ed.$('#status'); if (st2) st2.textContent = s; };
    const render = () => { ta.value = JSON.stringify(st.plays, null, 1); };
    panel.querySelector('#shSave').onclick = () => {
      try {
        const v = JSON.parse(ta.value || '[]');
        if (!Array.isArray(v)) return say('剧本必须是 JSON 数组');
        st.plays = v;
        ed.save();
        render();
        say('剧本已保存 ' + v.length + ' 条');
      } catch (e) {
        say('剧本 JSON 解析失败：' + e.message);
      }
    };
    render();
    ed.onStateLoaded(() => render());
    ed.pluginCfg(() => ({ plays: st.plays }));
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
