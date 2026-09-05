// ============================================================================
// 设备像素密度画布工具（高清适配）
// ----------------------------------------------------------------------------
// 问题：游戏画布缓冲曾固定 1100×700。高分屏（dpr=2/3）上浏览器把缓冲按
// CSS 尺寸放大到物理像素 → 每画布像素被拉伸成 2-3 物理像素 → 糊。
// 做法：逻辑尺寸（CSS px）与物理缓冲（×devicePixelRatio）分离——
//   canvas.width/height = 逻辑 × dpr（物理像素）
//   canvas.style.width/height = 逻辑 px
// 引擎全局以 canvas.width/height（物理网格）为坐标系：相机 scale、HUD 布局、
// 点击坐标换算全部不变（上下文均乘以同一 dpr，缩放互为倒数），显示时浏览器
// 把缓冲缩回 CSS 尺寸 → 视觉尺寸与改造前完全一致，清晰度按设备像素密度提升。
// 与 tools/leveleditor.html 编辑器已用的 dpr 方案同构。
// ============================================================================

/** 设备像素密度（钳制 1..3：4K 双缩放等极端值不再无脑放大，保护 fillrate） */
export function canvasDpr() {
  if (typeof window === 'undefined' || !window.devicePixelRatio) return 1;
  return Math.max(1, Math.min(3, Math.round(window.devicePixelRatio * 100) / 100));
}

/** 设定画布：w/h = 逻辑尺寸（CSS px）；缓冲 = w×h×dpr，CSS 尺寸 = w×h。
 *  尺寸没变则不重设缓冲（重设会清空画布，避免无谓闪烁——同编辑器 ensureCanvasSize）。 */
export function setupCanvasSize(canvas, w, h) {
  const dpr = canvasDpr();
  const bw = Math.max(1, Math.round(w * dpr));
  const bh = Math.max(1, Math.round(h * dpr));
  if (canvas.width !== bw) canvas.width = bw;
  if (canvas.height !== bh) canvas.height = bh;
  canvas._dpr = dpr;
  if (canvas.style) {
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
  }
  return canvas;
}

/** 窗口自适应视口上限（逻辑 px）≈ 原参考视口 1100×700 的 1.6 倍：
 *  超大窗口（4K/超宽屏 dpr=1）不再无脑放大——世界内容会变成 2.7 倍怪大。 */
export const MAX_VIEW_W = 1760;
export const MAX_VIEW_H = 1120;

/** 逻辑尺寸 = 窗口可用尺寸（扣 pad）但不超过上限；返回 {w,h}（由 setupCanvasSize 应用）。
 *  无 window（Node 测试）→ 直接使用上限值。 */
export function fitCanvasToWindow(canvas, { maxW = MAX_VIEW_W, maxH = MAX_VIEW_H, pad = 0 } = {}) {
  let w = maxW;
  let h = maxH;
  if (typeof window !== 'undefined') {
    const dw = (typeof document !== 'undefined' && document.documentElement && document.documentElement.clientWidth) || window.innerWidth || 0;
    const dh = (typeof document !== 'undefined' && document.documentElement && document.documentElement.clientHeight) || window.innerHeight || 0;
    if (dw > 0) w = Math.min(dw - pad * 2, maxW);
    if (dh > 0) h = Math.min(dh - pad * 2, maxH);
  }
  const lw = Math.max(64, Math.round(w));
  const lh = Math.max(64, Math.round(h));
  setupCanvasSize(canvas, lw, lh);
  return { w: lw, h: lh };
}
