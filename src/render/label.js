// ============================================================================
// 化学式/标签：暗底圆角 + 金色发光文字。
// 标签画在世界变换里，字号按屏幕实际像素保底（低分手机不再糊）；
// 同时会自动避让 HUD 面板（左上信息卡/右下物品栏+按钮/摇杆/顶栏按钮）——
// 压住时在附近挑一个不被挡的位置，不挪远处的物体、不改字号。
// ============================================================================

import { THEME, rr } from './theme.js';
import { hudTopOffset, inventorySlotRects, uiMargins } from '../level/click.js';
import { joyGeom, touchButtonRects } from '../core/touch.js';

/** HUD 常驻面板在画布坐标上的占位矩形（标签/悬浮物的避让依据，保守取整）。
 *  w = 遮挡权重：实心面板 2；摇杆是 7% 透明度的幽灵圈，压到一点无伤（1）。 */
export function hudOccluders(scene, W, H) {
  const rects = [];
  if (!scene || scene.overview) return rects; // 鸟瞰：HUD 只剩顶栏小按钮
  const top = hudTopOffset(scene);
  // 右上按钮排（⛶/鸟瞰/提示）
  rects.push({ x: W - 226, y: top - 6, w: 218, h: 52, weight: 2 });
  if (scene.player) {
    // 左上信息卡
    rects.push({ x: 6, y: top - 6, w: 292, h: 216, weight: 2 });
    // 右下整块：物品栏 + 触屏按钮块 + 选中物品面板
    const inv = scene.player.inventory;
    if (inv && Array.isArray(inv.slots) && inv.slots.length) {
      const ms = uiMargins(scene);
      const rs = inventorySlotRects(W, H, inv.slots, ms);
      let x0 = Infinity;
      let y0 = Infinity;
      for (const r of rs) {
        x0 = Math.min(x0, r.x);
        y0 = Math.min(y0, r.y);
      }
      let bandTop = y0 - 62; // 桌面：选中物品面板带
      const t = scene._touchUI;
      if (t && typeof t.enabled === 'function' && t.enabled()) {
        for (const b of touchButtonRects(W, H, inv.slots, t.insets || {})) bandTop = Math.min(bandTop, b.y);
        bandTop -= 52; // 触屏端选中物品面板再往上
      }
      rects.push({ x: x0 - 10, y: bandTop - 6, w: W - x0 + 18, h: H - bandTop + 12, weight: 2 });
      // 摇杆（左下半圆带容差；透明幽灵圈，权重轻）
      if (t && typeof t.enabled === 'function' && t.enabled()) {
        const g = joyGeom(W, H, t.insets || {});
        rects.push({ x: g.cx - g.R - 14, y: g.cy - g.R - 14, w: 2 * (g.R + 14), h: g.R + 14, weight: 1 });
      }
    }
  }
  return rects;
}

function overlapArea(a, b) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * 为标签挑一个不被 HUD 挡住的落点。
 * @param rect 标签盒（画布坐标，原位）
 * @returns { dx, dy } 屏幕像素偏移（应转回世界偏移后应用）
 */
export function labelPlacement(ctx, scene, rect) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const occ = hudOccluders(scene, W, H);
  if (!occ.length) return { dx: 0, dy: 0 };
  const area = rect.w * rect.h;
  const cx0 = rect.x + rect.w / 2;
  const cy0 = rect.y + rect.h / 2;

  const score = (r, dx, dy) => {
    let ov = 0;
    for (const o of occ) ov += overlapArea(r, o) * (o.weight ?? 2);
    // 越界重罚（×8）：挪出画布外 = 彻底看不见，比压在半透明面板上更糟
    let oob = 0;
    if (r.x < 4) oob += 4 - r.x;
    if (r.y < 4) oob += 4 - r.y;
    if (r.x + r.w > W - 4) oob += r.x + r.w - (W - 4);
    if (r.y + r.h > H - 4) oob += r.y + r.h - (H - 4);
    // 挪得越远越不优先（贴着锚点的原位永远最优先）
    return ov + oob * 20 + Math.hypot(dx, dy) * 0.35;
  };

  // 候选：原位 → 竖直翻/远移 → 左右半宽/全宽 → 斜向组合
  const cands = [[0, 0]];
  for (const k of [1, 2.1]) {
    for (const sg of [-1, 1]) cands.push([0, sg * (rect.h + 8) * k]);
  }
  for (const sg of [-1, 1]) {
    cands.push([sg * rect.w * 0.62, 0]);
    cands.push([sg * rect.w * 1.45, 0]);
  }
  cands.push([-rect.w * 0.62, -(rect.h + 8)]);
  cands.push([rect.w * 0.62, -(rect.h + 8)]);

  // 原位被压住过 1/3 → 追加"推出面板边缘"的候选（左/右/上/下，钳在画布内），
  // 与其它候选同一打分竞争——离屏候选有 ×8 越界重罚，赢不过它们
  const baseOv = occ.reduce((sum, o) => sum + overlapArea(rect, o) * (o.weight ?? 2), 0);
  if (baseOv > area * 0.35) {
    let worst = null;
    let worstOv = 0;
    for (const o of occ) {
      const ov = overlapArea(rect, o) * (o.weight ?? 2);
      if (ov > worstOv) {
        worstOv = ov;
        worst = o;
      }
    }
    if (worst) {
      const escapes = [
        [worst.x - rect.w - 6, rect.y],
        [worst.x + worst.w + 6, rect.y],
        [rect.x, worst.y - rect.h - 6],
        [rect.x, worst.y + worst.h + 6],
      ];
      for (const [ex, ey] of escapes) {
        cands.push([Math.max(4, Math.min(W - 4 - rect.w, ex)) - rect.x, Math.max(4, Math.min(H - 4 - rect.h, ey)) - rect.y]);
      }
    }
  }

  let best = null;
  for (const [dx, dy] of cands) {
    const r = { x: rect.x + dx, y: rect.y + dy, w: rect.w, h: rect.h };
    const sc = score(r, dx, dy);
    if (!best || sc < best.sc) best = { sc, dx, dy, r };
  }
  return { dx: best.dx, dy: best.dy };
}

export function renderFormula(ctx, x, y, text, opts = {}) {
  // 字号按"屏幕实际像素"保证：标签画在世界变换里，低分辨率手机上会被相机
  // 缩到 6-7px（糊成一团）——从当前变换读出缩放，把字号补足到屏幕上至少
  // 12px（封顶 22 世界像素，免得鸟瞰/大缩放时标签大得离谱）
  let size = opts.size ?? 12;
  let m = null;
  try {
    m = ctx.getTransform ? ctx.getTransform() : null;
  } catch (e) { /* 老浏览器 */ }
  const s = m ? Math.hypot(m.a, m.b) : 1;
  if (s > 0.01 && !opts.size) size = Math.max(size, Math.min(22, Math.round(12 / s)));
  const color = opts.color ?? THEME.gold.text;
  ctx.save();
  ctx.font = `bold ${size}px monospace`;
  ctx.textAlign = 'left';
  const w = ctx.measureText(text).width + 12;
  // HUD 避让：算出标签盒的屏幕位置，被面板压住就在附近挪一个不被挡的落点
  if (opts.scene && s > 0.01) {
    const wx = x - 4;
    const wy = y - size - 2;
    const sx = m.a * wx + m.c * wy + m.e;
    const sy = m.b * wx + m.d * wy + m.f;
    const rect = { x: sx, y: sy, w: w * s, h: (size + 7) * s };
    const { dx, dy } = labelPlacement(ctx, opts.scene, rect);
    if (dx || dy) {
      x += dx / s;
      y += dy / s;
    }
  }
  ctx.fillStyle = 'rgba(12,9,34,0.72)';
  rr(ctx, x - 4, y - size - 2, w, size + 7, 5);
  ctx.fill();
  ctx.strokeStyle = 'rgba(232,184,75,0.4)';
  ctx.lineWidth = 1;
  ctx.stroke();
  // 清晰小字：细暗描边保证可读，不发光
  ctx.fillStyle = color;
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(8,6,24,0.9)';
  ctx.strokeText(text, x + 2, y);
  ctx.fillText(text, x + 2, y);
  ctx.restore();
}
