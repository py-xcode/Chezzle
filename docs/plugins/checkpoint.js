// ============================================================================
// 新手检查点（checkpoint）—— 死亡自动回到最近检查点复活（新手关防挫败神器）
// ----------------------------------------------------------------------------
// 原版机制：死亡 = 整关重开（R 刷新页面）。新手教程关里这是灾难——
// 玩家好不容易走到第五章，掉进酸池就从头再来，直接弃游。
// 本插件提供"检查点复活"：
//   - 关卡/编辑器配置 cfg.spawns：每个检查点 = 一个"登记区域"矩形 + 复活点；
//     玩家走进区域即登记（区域不重叠时自然按章节推进）。
//   - 死亡后 0.9 秒原地复活：回到最近检查点、回满血（核心物质补回）、
//     清速度/传送门冷却/残留气体，然后弹一条（随机的）幽默横幅。
// 用法（关卡脚本）：
//   Chezzle.Plugin.inject(scene, [{ name: 'checkpoint', cfg: {
//     spawns: [
//       { id: 'ch1', x: 0, y: 0, w: 640, h: 800, sx: 80, sy: 700, text: '复活！从第一章继续' },
//     ],
//     texts: ['复活！化学家从不回头看爆炸', '没事，NaOH 还有很多', '死亡是教学的一部分（才怪）'],
//   }}]);
//   注意：spawns 按 x 从小到大排列，重叠时取 x 更大的（走到新区域即"最新检查点"）。
// 编辑器里：加载本插件后，在关卡脚本（试玩）里通过插件配置或直接改代码使用。
// ============================================================================

// @@chezzle-plugin
// {
//   "name": "新手检查点",
//   "version": "1.0",
//   "api": 1,
//   "description": "死亡自动回到最近检查点并回满血，再弹一条幽默横幅——新手关不再因死亡从头再来。cfg.spawns=[{id,x,y,w,h,sx,sy,text}] 登记区域+复活点，cfg.texts=复活横幅文案（随机取一条）"
// }
// @@end

Chezzle.Plugin.register('checkpoint', {
  run(scene, api, cfg) {
    const spawns = Array.isArray(cfg.spawns) ? cfg.spawns.filter((s) => s && Number.isFinite(s.x)) : [];
    if (!spawns.length) return () => {};
    const texts = Array.isArray(cfg.texts) && cfg.texts.length ? cfg.texts : ['复活！从检查点继续'];
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
