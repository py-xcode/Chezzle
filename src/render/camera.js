// ============================================================================
// 相机：逻辑视口（默认 1000×800）等比缩放居中；世界比视口大时跟随 focus 滚动。
// ============================================================================

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class Camera {
  constructor({ viewW = 1000, viewH = 800, worldW = 1000, worldH = 800 } = {}) {
    this.viewW = viewW;
    this.viewH = viewH;
    this.worldW = worldW;
    this.worldH = worldH;
    this._shake = 0; // 屏幕震动强度（px），每帧衰减
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

  /**
   * 计算缩放与屏幕偏移。focus 为可选跟随目标（{x,y,w,h}，通常是玩家）。
   * 世界 ≤ 视口时居中显示整个世界；世界 > 视口时跟随 focus 滚动（钳制在世界内）。
   */
  compute(vw, vh, focus = null) {
    const scale = Math.min(vw / this.viewW, vh / this.viewH);
    // 实际显示的世界窗口（单位：世界坐标）
    const vx = Math.min(this.worldW, this.viewW);
    const vy = Math.min(this.worldH, this.viewH);
    // 窗口原点 ox, oy
    let ox;
    let oy;
    if (focus) {
      const cx = focus.x + (focus.w ?? 0) / 2;
      const cy = focus.y + (focus.h ?? 0) / 2;
      ox = clamp(cx - vx / 2, 0, Math.max(0, this.worldW - vx));
      oy = clamp(cy - vy / 2, 0, Math.max(0, this.worldH - vy));
    } else {
      ox = (this.worldW - vx) / 2;
      oy = (this.worldH - vy) / 2;
    }
    // 屏幕偏移：把 vx×vy 窗口放到 vw×vh 画布中央
    const offsetX = (vw - vx * scale) / 2 - ox * scale;
    const offsetY = (vh - vy * scale) / 2 - oy * scale;
    return { scale, ox, oy, offsetX, offsetY };
  }

  /** 应用到 canvas 上下文（世界坐标 → 屏幕坐标；含震动偏移） */
  apply(ctx, vw, vh, focus = null) {
    const { scale, offsetX, offsetY } = this.compute(vw, vh, focus);
    const sh = this.shakeOffset();
    ctx.setTransform(scale, 0, 0, scale, offsetX + sh.x, offsetY + sh.y);
  }
}
