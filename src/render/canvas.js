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

/** 低档设备判定（触屏 / 无 hover / 小屏）：据此降低渲染开销。
 *  纯 Node（测试）环境返回 false。 */
export function lowTier() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    if (window.matchMedia('(pointer: coarse)').matches) return true;
    if (!window.matchMedia('(hover: hover)').matches) return true;
    const w = window.innerWidth || 9999;
    const h = window.innerHeight || 9999;
    return Math.min(w, h) < 620;
  } catch (e) {
    return false;
  }
}

/** 设备像素密度（钳制 1..3；低档设备钳到 2 —— 见下）。
 *  ★ dpr=3 时缓冲面积是 2x 的 2.25 倍：逻辑 1760×1120 的画布在 dpr=3 下是
 *    5280×3360 ≈ 17.7M 像素，每帧清屏 + 重绘全部内容，手机 GPU 直接被填满
 *    → 发烫、掉帧（用户手机实测）。手机上 2x 与 3x 肉眼几乎无差别。 */
export function canvasDpr() {
  if (typeof window === 'undefined' || !window.devicePixelRatio) return 1;
  const cap = lowTier() ? 2 : 3;
  return Math.max(1, Math.min(cap, Math.round(window.devicePixelRatio * 100) / 100));
}

/** 画布逻辑尺寸（CSS px）读取：HUD/标签/触控等"屏幕空间"UI 以逻辑像素布局与
 *  绘制（渲染基座乘 dpr），否则 dpr>1 的设备上 68px 按钮按物理像素结算 → 显示
 *  只有 34px（用户"移动端 HUD 明显偏小"）。世界坐标系仍以 canvas.width（物理
 *  网格）为准（相机 scale 与 dpr 互抵，视觉正确）。 */
export function canvasLW(canvas) {
  return canvas && Number.isFinite(canvas._lw) ? canvas._lw : (canvas ? canvas.width : 0);
}
export function canvasLH(canvas) {
  return canvas && Number.isFinite(canvas._lh) ? canvas._lh : (canvas ? canvas.height : 0);
}
/** 渲染基座 dpr（无可信值时 1） */
export function canvasTransformDpr(canvas) {
  return canvas && Number.isFinite(canvas._dpr) ? canvas._dpr : 1;
}

/** 设定画布：w/h = 逻辑尺寸（CSS px）；缓冲 = w×h×dpr，CSS 尺寸 = w×h。
 *  尺寸没变则不重设缓冲（重设会清空画布，避免无谓闪烁——同编辑器 ensureCanvasSize）。 */
export function setupCanvasSize(canvas, w, h) {
  let dpr = canvasDpr();
  // 大屏（2K/4K）铺满时，物理缓冲 = w×h×dpr² 很容易超过 1000 万像素：
  // 桌面 GPU 画 2D 还行，Retina 5K 会到 3000 万+（每帧清屏都很贵）。
  // 按**面积**再压一次 dpr（逻辑尺寸不变 → 布局/坐标完全不受影响，只是缓冲变少）。
  const MAX_BUF_PX = 11e6;
  if (w > 0 && h > 0) {
    const px = w * h * dpr * dpr;
    if (px > MAX_BUF_PX) dpr = Math.max(1, Math.round(Math.sqrt(MAX_BUF_PX / (w * h)) * 100) / 100);
  }
  const bw = Math.max(1, Math.round(w * dpr));
  const bh = Math.max(1, Math.round(h * dpr));
  if (canvas.width !== bw) canvas.width = bw;
  if (canvas.height !== bh) canvas.height = bh;
  canvas._dpr = dpr;
  canvas._lw = w; // ★ 逻辑尺寸记录：屏幕空间 UI（HUD/标签/触控）以它布局绘制
  canvas._lh = h; //   ——缺了它 canvasLW 回退物理值，UI 在基座 dpr 下再放大 → 只露左上角
  if (canvas.style) {
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
  }
  return canvas;
}

/** 窗口自适应视口上限（逻辑 px）：桌面大屏也铺满（4K 以内）。
 *  ★ 世界物体"放大到什么程度"由 CFG.camera.desktopScaleMax 限制，所以这里可以放心
 *    把画布铺满窗口——多出来的视野装更多关卡内容，而不是把一切等比放大。 */
export const MAX_VIEW_W = 3840;
export const MAX_VIEW_H = 2160;

/** 桌面端 HUD/文字放大系数（随窗口尺寸，1~1.6）。
 *  "游戏内容不一定要更大，但文字必须看得清"：HUD 与画布内 UI 比世界物体多放大一档；
 *  移动端已有自己的紧凑/放大逻辑 → 返回 1。 */
export function uiScaleOf(canvas) {
  const W = canvasLW(canvas);
  const H = canvasLH(canvas);
  if (!(W > 0 && H > 0)) return 1;
  if (typeof window !== 'undefined' && window.matchMedia) {
    try {
      if (window.matchMedia('(pointer: coarse)').matches) return 1; // 触屏：走原有移动端布局
    } catch (e) { /* 老内核 */ }
  }
  const base = Math.min(W / 1280, H / 720);
  return Math.max(1, Math.min(1.6, Math.round(base * 100) / 100));
}

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
