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
  const logged = new Set(); // 帧异常去重（同一消息只报一次，防刷屏）

  function frame(now) {
    try {
      const dt = Math.min((now - last) / 1000, 0.25);
      last = now;
      acc += dt;
      const active = getActive();
      if (active && active.scene) {
        const S = active.scene;
        let guard = 0;
        if (S.overview) {
          // 鸟瞰（灵魂出窍）：暂停推进（保持画面），自由缩放/平移由输入管线驱动
          acc = 0;
        } else if (S.debugMode && S.debugPaused) {
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
        R.frame(S.objects, { hud: active.hud ?? opts.hud, time: S.time, scene: S, focus: S.player ?? S.cameraFocus ?? null });
      }
    } catch (e) {
      // ★ 单帧异常不杀循环：任意一个对象的 step/render 抛异常只会让这一帧残缺，
      //   绝不能因此整局冻结（用户"传送后画面里没有玩家"= 压力提取器渲染异常
      //   杀死 rAF 链，游戏从此一帧都不再跑——画面停在半空，玩家永远不可见）。
      //   记录（同消息一次）并继续下一帧，画面在下一帧恢复。
      if (typeof console !== 'undefined' && e && !logged.has(e.message)) {
        logged.add(e.message);
        console.error('[loop] 帧异常已拦截（游戏继续）:', e);
      }
    }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}
