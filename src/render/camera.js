// ============================================================================
// 相机：逻辑视口（默认 1000×800）等比缩放居中；世界比视口大时跟随 focus 滚动。
// 鸟瞰模式（overview）：忽略 focus，用自由视图 {scale, ox, oy}——整关缩放/平移
//   （灵魂出窍；由 Scene.setOverview 开关，pan/zoom 由鸟瞰输入管线驱动）。
// ============================================================================

import { CFG } from '../core/config.js';
import { getPrefs } from '../core/prefs.js';

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
    this.overviewMix = 0; // 0..1：鸟瞰进出动画进度（主循环每帧 tick；compute 与 HUD 共用）
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
    // ★ 保留 _ov：退出动画要从"用户当前鸟瞰视角"平滑缩回正常视角；
    //   清空会先跳回"整关适配"再缩，看起来像闪一下。
  }

  /** 鸟瞰进出动画推进（主循环每帧调用；鸟瞰时模拟暂停，也照常推进） */
  tickOverviewAnim(dt) {
    const target = this.overview ? 1 : 0;
    if (this.overviewMix === target) return;
    const speed = 1 / 0.36; // 约 360ms 完成
    const d = target - this.overviewMix;
    const stepLen = Math.min(Math.abs(d), Math.max(0.0001, (dt > 0 ? dt : 0.016) * speed));
    this.overviewMix += Math.sign(d) * stepLen;
    if (Math.abs(target - this.overviewMix) < 0.0015) {
      this.overviewMix = target;
      // 退出动画结束：释放保留的鸟瞰视图（进入时退出后会重新 fit）
      if (target === 0) this._ov = null;
    }
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
    // 鸟瞰视图：进入动画期间也要参与混合；退出动画保留旧 _ov（见 exitOverview）
    const ovActive = this.overview || this.overviewMix > 0;
    let ov = null;
    if (ovActive) {
      if (!this._ov) this._ov = this._ovFit(vw, vh);
      ov = this._ov;
      // 完全进入鸟瞰：直接返回自由视图（避免每帧多算一遍正常视图）
      if (this.overview && this.overviewMix >= 0.999) {
        return { scale: ov.scale, ox: ov.ox, oy: ov.oy, offsetX: -ov.ox * ov.scale, offsetY: -ov.oy * ov.scale };
      }
    }
    let viewW = this.viewW;
    let viewH = this.viewH;
    let biasY = 0;
    let padTop = viewH * CFG.touch.padTop; // 顶部探出量（双端；爬高时相机跟进天空）
    // 是否真的走"移动端横屏视野"（竖屏时移动端也沿用桌面逻辑 → 桌面缩放上限同样适用）
    const mobileView = this.mobileViewH > 0 && vw > 0 && vh > 0 && vh < vw;
    if (mobileView) {
      viewH = this.mobileViewH;
      viewW = Math.max(1, viewH * (vw / vh));
      biasY = viewH * CFG.touch.focusBias; // 视窗中心下移 → 玩家画在屏幕偏上
      padTop = viewH * CFG.touch.padTop;
    } else if (vw > 0 && vh > 0) {
      // ★ 桌面/未启用触控：视窗按**画布宽高比**展开——旧代码视窗固定 1000×800，
      //   扁屏（如 1204×400）上缩放被高度限死（0.5），世界只占画布中间一条、
      //   元素缩到一半（用户"比较扁的屏幕游戏显示特别小"）。
      //   现在：画布更扁 → 压低视窗高度（缩放交给宽度决定，铺满画布）；
      //        画布更高 → 收窄视窗宽度（同理铺满）。两边夹在 [viewMin, viewMax]，
      //        避免极端比例下可见范围大到糊/小到只剩一块。
      const aspect = vw / vh;
      if (aspect > viewW / viewH) {
        viewH = Math.min(CFG.camera.viewMax, Math.max(CFG.camera.viewMin, viewW / aspect));
      } else {
        viewW = Math.min(CFG.camera.viewMax, Math.max(CFG.camera.viewMin, viewH * aspect));
      }
      padTop = viewH * CFG.touch.padTop;
    }
    let scale = Math.min(vw / viewW, vh / viewH);
    // 桌面大屏：视野优先"把整关宽度装进窗口"（用户反馈大屏视角不够广）；
    // 纵向沿用原逻辑跟随玩家。缩放 = 画布宽/世界宽，夹在
    // [desktopScaleMin, desktopScaleMax]：窄窗口不把物体缩太小，超宽屏也不无限放大。
    // 放不下的尺寸转成更大视野，而不是更大的物体；HUD 文字另有 uiScaleOf 放大一档。
    const camCfg = CFG.camera;
    let capS = Infinity;
    if (!mobileView) {
      capS = camCfg.desktopFitWholeWidth === false
        ? (camCfg.desktopScaleMax || 1.85)
        : Math.max(camCfg.desktopScaleMin || 0.85,
          Math.min(camCfg.desktopScaleMax || 2.5, vw / Math.max(1, this.worldW)));
    }
    if (capS && scale > capS) {
      const f = scale / capS;
      viewW *= f;
      viewH *= f;
      padTop = viewH * CFG.touch.padTop;
      scale = capS;
    }
    // 设置里的「视角大小」：在自动适配结果上再乘用户缩放（>1 拉近 / <1 拉远）。
    // ★ 缩放后必须用**实际可见的世界窗口**（画布尺寸/缩放）重算 vx/vy，否则相机仍按
    //   缩放前的窗口算原点：桌面"整关宽度适配"时 vx 已等于世界宽度 → ox/oy 被钉死，
    //   视角就变成"以世界中心硬放大"，玩家跑出画面（用户反馈的显示问题）。
    const viewScale = getPrefs().viewScale;
    const zoom = Number.isFinite(viewScale) && viewScale > 0 ? viewScale : 1;
    if (zoom !== 1) scale *= zoom;
    const vx = Math.min(this.worldW, zoom !== 1 ? vw / scale : viewW);
    const vy = Math.min(this.worldH, zoom !== 1 ? vh / scale : viewH);
    if (zoom !== 1) {
      // 跟随偏置/顶部探出也按可见高度换算（否则放大后偏移量相对屏幕过大）
      biasY = mobileView ? vy * CFG.touch.focusBias : 0;
      padTop = vy * CFG.touch.padTop;
    }
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
    let offsetX = (vw - vx * scale) / 2 - ox * scale;
    let offsetY = (vh - vy * scale) / 2 - oy * scale;
    // 鸟瞰进出：在"正常视角"与"自由鸟瞰视角"之间插值（世界会平滑缩/放+平移）
    if (ov && this.overviewMix > 0) {
      const m = Math.max(0, Math.min(1, this.overviewMix));
      const e = m * m * (3 - 2 * m);
      scale += (ov.scale - scale) * e;
      ox += (ov.ox - ox) * e;
      oy += (ov.oy - oy) * e;
      offsetX += (-ov.ox * ov.scale - offsetX) * e;
      offsetY += (-ov.oy * ov.scale - offsetY) * e;
    }
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
