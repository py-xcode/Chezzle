// ============================================================================
// 固定步长主循环：tick 30/s，rAF 驱动渲染。
// scene 可以是 Scene 实例（单场景），也可以是 () => {scene, renderer, hud}（多场景管理器
// 用：每条循环只推进/渲染"当前激活"的场景，切换即热切换）。
// ============================================================================

import { CFG } from './config.js';

export function startLoop(scene, renderer, opts = {}) {
  const TICK = 1 / CFG.tickRate;
  let last = performance.now();
  let acc = 0;
  let raf = 0;

  const getActive = typeof scene === 'function' ? scene : () => ({ scene, renderer, hud: opts.hud });

  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.25);
    last = now;
    acc += dt;
    const active = getActive();
    if (active && active.scene) {
      const S = active.scene;
      let guard = 0;
      if (S.debugMode && S.debugPaused) {
        // 调试暂停：不推进 tick（保持画面），F6 手动步进一 tick
        if (S.debugStepOnce) {
          S.debugStepOnce = false;
          S.step(TICK);
        }
      } else {
        while (acc >= TICK && guard < 10) {
          S.step(TICK);
          acc -= TICK;
          guard++;
        }
        if (acc >= TICK) acc = 0; // 追不上就丢帧
      }
      const R = active.renderer ?? renderer;
      R.frame(S.objects, { hud: active.hud ?? opts.hud, time: S.time, scene: S, focus: S.player });
    }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}
