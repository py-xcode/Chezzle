// ============================================================================
// 鸟瞰模式输入（桌面端；移动端单指/双指在 touch.js 的 TouchUI 里处理）：
//  - 滚轮：以光标为锚缩放（光标下的世界点保持不动）；
//  - 左键拖动：平移视图（按下落在"返回"按钮上时不拖——让 click 事件去切换）。
// 仅在 scene.overview 时生效（其它时刻各处理器直接返回，不影响正常游戏管线）。
// 几何约定：overviewButtonRect（HUD 渲染与命中共用）在 level/click.js。
// ============================================================================

import { overviewButtonRect, hudTopOffset, touchInsetsOf } from '../level/click.js';
import { canvasLW, canvasLH } from '../render/canvas.js';

/**
 * 给画布绑定鸟瞰输入。
 * @param getActive () => { scene } | null（同 bindTouchUI 语义）
 * @returns unbind()
 */
export function bindOverviewInput(canvas, getActive) {
  // getActive 兼容两种形态：() => { scene }（标准）或 () => Scene（容错）——
  // 形态不匹配会让处理器静默失灵，这里统一收敛成 Scene
  const sceneOf = () => {
    const a = typeof getActive === 'function' ? getActive() : getActive;
    const s = a && a.scene ? a.scene : a;
    return s && typeof s.overview === 'boolean' ? s : null;
  };
  let pan = null; // { x, y } 拖动中（屏幕坐标）

  const onWheel = (e) => {
    const scene = sceneOf();
    if (!scene || !scene.overview || !scene.camera) return;
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    // 滚轮一格 ≈ 1.12×；deltaMode=1（行）时放大系数
    const step = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
    const factor = Math.pow(1.12, -step / 53);
    scene.camera.zoomOverview(factor, px, py, canvasLW(canvas), canvasLH(canvas));
  };

  const onDown = (e) => {
    const scene = sceneOf();
    if (!scene || !scene.overview) return;
    if (e.button !== 0) return;
    const r = canvas.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    // "返回"按钮：不进入拖动（click 事件负责切换）
    const b = overviewButtonRect(canvasLW(canvas), hudTopOffset(scene), touchInsetsOf(scene).right || 0);
    if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return;
    pan = { x: e.clientX, y: e.clientY };
  };

  const onMove = (e) => {
    if (!pan) return;
    const scene = sceneOf();
    if (!scene || !scene.overview || !scene.camera) {
      pan = null;
      return;
    }
    scene.camera.panOverview(e.clientX - pan.x, e.clientY - pan.y, canvasLW(canvas), canvasLH(canvas));
    pan = { x: e.clientX, y: e.clientY };
  };

  const onUp = () => {
    pan = null;
  };

  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('mousedown', onDown);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  window.addEventListener('blur', onUp);
  return () => {
    canvas.removeEventListener('wheel', onWheel);
    canvas.removeEventListener('mousedown', onDown);
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    window.removeEventListener('blur', onUp);
  };
}
