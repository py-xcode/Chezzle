// ============================================================================
// 官方示例插件：玩家轨迹（trail）—— 纯逻辑插件
// ----------------------------------------------------------------------------
// 功能：玩家移动时**持续**从**身后**喷出光点（比"稀疏尾迹"更频繁明显）：
//   - 移动中每 2 帧（~15 次/秒）喷 2 颗；
//   - 喷口在玩家中心往移动反方向偏移 8px（身后）；
//   - 光点沿反方向飘出 + 上浮，寿命 1.1s/0.8s，前段白亮后段变蓝，渐隐熄灭。
// 装饰纯视觉：Spark 无碰撞、不参与化学、自动清理。零配置（改常量即可调整）。
// 展示的能力：api.onTick、scene.player、引擎 Spark 视觉粒子（颜色/初速/寿命皆可控）。
// ============================================================================

// @@chezzle-plugin
// {
//   "name": "玩家轨迹",
//   "version": "1.1",
//   "api": 1,
//   "description": "玩家移动时身后持续喷出光点轨迹（纯装饰粒子，自动熄灭）"
// }
// @@end

Chezzle.Plugin.register('trail', {
  run(scene, api) {
    const RATE = 2;          // 每 N 帧喷一组（越小越密）
    const OFFSET = 8;        // 喷口离玩家中心的距离（越大越"身后"）
    const DRIFT = 46;        // 光点向后飘的初速
    let frame = 0;
    const last = { x: 0, y: 0, has: false };
    return api.onTick(() => {
      const p = scene.player;
      if (!p) return;
      const cx = p.x + p.w / 2;
      const cy = p.y + p.h / 2;
      const moved = last.has && (Math.abs(cx - last.x) > 1 || Math.abs(cy - last.y) > 1);
      if (moved && (frame % RATE === 0)) {
        const dx = cx - last.x;
        const dy = cy - last.y;
        const d = Math.hypot(dx, dy) || 1;
        const bx = cx - (dx / d) * OFFSET;   // 身后喷口
        const by = cy - (dy / d) * OFFSET;
        const spin = (Math.random() - 0.5) * 16;
        // 主光点：向后漂 + 上浮，长命
        scene.addObject(new Chezzle.Spark({
          x: bx, y: by,
          vx: -(dx / d) * DRIFT + spin,
          vy: -(dy / d) * DRIFT - 38 - Math.random() * 22,
          life: 1.1,
          color: '#9fe8ff',
        }));
        // 次光点：更近、更散、短命
        scene.addObject(new Chezzle.Spark({
          x: bx - (dx / d) * 5, y: by + 3,
          vx: -(dx / d) * (DRIFT * 0.5) + (Math.random() - 0.5) * 30,
          vy: -(dy / d) * (DRIFT * 0.5) - 24 - Math.random() * 26,
          life: 0.8,
          color: '#d0f2ff',
        }));
      }
      frame++;
      last.x = cx;
      last.y = cy;
      last.has = true;
    });
  },
});
