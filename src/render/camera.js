// ============================================================================
// 相机：逻辑视口（默认 1000×800）等比缩放居中；世界比视口大时跟随 focus 滚动。
// 鸟瞰模式（overview）：忽略 focus，用自由视图 {scale, ox, oy}——整关缩放/平移
//   （灵魂出窍；由 Scene.setOverview 开关，pan/zoom 由鸟瞰输入管线驱动）。
// ============================================================================

import { CFG } from '../core/config.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class Camera {
  constructor({ viewW = 1000, viewH = 800, worldW = 1000, worldH = 800 } = {}) {
    this.viewW = viewW;
    this.viewH = viewH;
    this.mobileViewH = 0; // 移动端视野高度（0 = 桌面默认）；由 touchui 按设备设置
    this.worldW = worldW;
    this.worldH = worldH;
    this._shake = 0; // 屏幕震动强度（px），每帧衰减
    // 鸟瞰（自由视图）：_ov = {scale, ox, oy}（scale = 屏幕px/世界px；ox/oy = 视窗左上角世界坐标）
    this.overview = false;
    this._ov = null; // 惰性初始化（首次 compute 时按当前画布尺寸适配整关）
  }

  /** 触发屏幕震动（爆炸/剧烈反应） */
  shake(amount) {
    this._shake = Math.min(18, Math.max(this._shake, amount));
  }

  /** 当前震动偏移（随机，随帧衰减） */
  shakeOffset() {
    if (this._shake <= 0.05) return { x: 0, y: 0 };
    const a = this._shake;
    this._shake *= 0.86;
    const ang = Math.random() * Math.PI * 2;
    return { x: Math.cos(ang) * a, y: Math.sin(ang) * a * 0.6 };
  }

  // ---- 鸟瞰（灵魂出窍）：自由缩放/平移 ------------------------------------

  enterOverview() {
    this.overview = true;
    this._ov = null; // 下一帧按当前画布尺寸重新适配整关
  }

  exitOverview() {
    this.overview = false;
    this._ov = null;
  }

  /** 鸟瞰初始视图：整个世界适配进画布并居中 */
  _ovFit(vw, vh) {
    const scale = Math.min(vw / this.worldW, vh / this.worldH);
    return this._ovClamp({ scale, ox: 0, oy: 0 }, vw, vh);
  }

  /** 把鸟瞰视图钳制在世界内（视图大于世界 → 居中） */
  _ovClamp(v, vw, vh) {
    const viewW = vw / v.scale;
    const viewH = vh / v.scale;
    v.ox = viewW >= this.worldW ? (this.worldW - viewW) / 2 : clamp(v.ox, 0, this.worldW - viewW);
    v.oy = viewH >= this.worldH ? (this.worldH - viewH) / 2 : clamp(v.oy, 0, this.worldH - viewH);
    return v;
  }

  /** 鸟瞰平移（屏幕像素位移 → 世界位移） */
  panOverview(dxScreen, dyScreen, vw, vh) {
    if (!this.overview) return;
    if (!this._ov) this._ov = this._ovFit(vw, vh);
    this._ov.ox -= dxScreen / this._ov.scale;
    this._ov.oy -= dyScreen / this._ov.scale;
    this._ovClamp(this._ov, vw, vh);
  }

  /** 鸟瞰缩放：factor 缩放比，(px,py) = 缩放中心（屏幕像素，光标/双指中点——该世界点保持不动） */
  zoomOverview(factor, px, py, vw, vh) {
    if (!this.overview || !(factor > 0)) return;
    if (!this._ov) this._ov = this._ovFit(vw, vh);
    const minS = Math.min(vw / this.worldW, vh / this.worldH); // 最远 = 整关一屏
    const maxS = Math.max(minS * 16, 3); // 最近 = 放大到能看清细节
    const ns = clamp(this._ov.scale * factor, minS, maxS);
    // 保持 (px,py) 下的世界点不动：wx = ox + px/s → ox' = wx - px/ns
    const wx = this._ov.ox + px / this._ov.scale;
    const wy = this._ov.oy + py / this._ov.scale;
    this._ov.scale = ns;
    this._ov.ox = wx - px / ns;
    this._ov.oy = wy - py / ns;
    this._ovClamp(this._ov, vw, vh);
  }

  /**
   * 计算缩放与屏幕偏移。focus 为可选跟随目标（{x,y,w,h}，通常是玩家）。
   * 世界 ≤ 视口时居中显示整个世界；世界 > 视口时跟随 focus 滚动（钳制在世界内）。
   * 移动端（mobileViewH>0 且横屏）：高度按 mobileViewH 收窄 → 世界内容按屏幕
   * 比例变宽（跟随玩家），玩家在手机上不再缩成小点；同时视窗中心按 focusBias
   * 下移——玩家画在屏幕中上部，不被左上面板/右下触控控件遮挡。
   * 鸟瞰模式（overview）：忽略 focus，用自由视图。
   */
  compute(vw, vh, focus = null) {
    if (this.overview) {
      if (!this._ov) this._ov = this._ovFit(vw, vh);
      const { scale, ox, oy } = this._ov;
      return { scale, ox, oy, offsetX: -ox * scale, offsetY: -oy * scale };
    }
    let viewW = this.viewW;
    let viewH = this.viewH;
    let biasY = 0;
    let padTop = viewH * CFG.touch.padTop; // 顶部探出量（双端；爬高时相机跟进天空）
    if (this.mobileViewH > 0 && vw > 0 && vh > 0 && vh < vw) {
      viewH = this.mobileViewH;
      viewW = Math.max(1, viewH * (vw / vh));
      biasY = viewH * CFG.touch.focusBias; // 视窗中心下移 → 玩家画在屏幕偏上
      padTop = viewH * CFG.touch.padTop;
    }
    const scale = Math.min(vw / viewW, vh / viewH);
    // 实际显示的世界窗口（单位：世界坐标）
    const vx = Math.min(this.worldW, viewW);
    const vy = Math.min(this.worldH, viewH);
    // 窗口原点 ox, oy。下缘钳位放宽 biasY：玩家永远贴着世界底部走（地板在
    // worldH 附近），若只把期望值下移会被底缘钳位吞掉——放宽后视窗探到世界
    // 底边之下（空背景，正被摇杆/按钮控件盖住），玩家才能真的画到屏幕中上部。
    // 上缘钳位放宽 padTop（负方向）：玩家爬到世界顶时相机继续上移探出顶边
    // （上方是空天空），玩家不被钉在屏幕顶缘、上方环境不被 HUD 卡片盖住。
    let ox;
    let oy;
    if (focus) {
      const cx = focus.x + (focus.w ?? 0) / 2;
      const cy = focus.y + (focus.h ?? 0) / 2;
      ox = clamp(cx - vx / 2, 0, Math.max(0, this.worldW - vx));
      oy = clamp(cy - vy / 2 + biasY, -padTop, Math.max(-padTop, this.worldH - vy + biasY));
    } else {
      ox = (this.worldW - vx) / 2;
      oy = (this.worldH - vy) / 2;
    }
    // 屏幕偏移：把 vx×vy 窗口放到 vw×vh 画布中央
    const offsetX = (vw - vx * scale) / 2 - ox * scale;
    const offsetY = (vh - vy * scale) / 2 - oy * scale;
    return { scale, ox, oy, offsetX, offsetY };
  }

  /** 应用到 canvas 上下文（世界坐标 → 屏幕坐标；含震动偏移）。
   *  vw/vh = 逻辑视口（CSS px）；基座乘 dpr → 物理像素 1:1 渲染。 */
  apply(ctx, vw, vh, focus = null) {
    const { scale, offsetX, offsetY } = this.compute(vw, vh, focus);
    const sh = this.shakeOffset();
    const cnv = ctx && ctx.canvas && typeof ctx.canvas === 'object' ? ctx.canvas : null;
    const dpr = cnv && Number.isFinite(cnv._dpr) ? cnv._dpr : 1;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * (offsetX + sh.x), dpr * (offsetY + sh.y));
  }
}
