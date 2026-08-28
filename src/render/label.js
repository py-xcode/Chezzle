// ============================================================================
// 化学式/标签：暗底圆角 + 金色发光文字。
//  - 居中锚定：标签盒以传入点为水平中心（不再从锚点向右歪）；
//  - 二次绘制：renderFormula 只把绘制命令入队，Renderer 在世界物件全部画完
//    之后调用 flushLabels 统一画出——标签浮在地板/物块之上，不会被盖住；
//  - 字号按屏幕实际像素保底（低分手机不再糊）；
//  - 避让：只上下翻转（保持居中）+ 画面内钳制（不再跑出屏幕），HUD 面板
//    压住时翻到面板外；有粘性记忆，走路时不横跳。
// ============================================================================

import { THEME, rr } from './theme.js';
import { hudTopOffset, inventorySlotRects, uiMargins, touchInsetsOf } from '../level/click.js';
import { joyGeom, touchButtonRects } from '../core/touch.js';

/** HUD 常驻面板在画布坐标上的占位矩形（标签/悬浮物的避让依据，保守取整）。
 *  weight = 遮挡权重：实心面板 2；摇杆是 7% 透明度的幽灵圈（0.3，压住大半也可读）。 */
export function hudOccluders(scene, W, H) {
  const rects = [];
  if (!scene || scene.overview) return rects; // 鸟瞰：HUD 只剩顶栏小按钮
  const ins = touchInsetsOf(scene);
  const left = ins.left || 0;
  const right = ins.right || 0;
  const top = hudTopOffset(scene);
  // 右上按钮排（⛶/鸟瞰/提示；刘海横屏时让出右缘安全区）
  rects.push({ x: W - right - 226, y: top - 6, w: 218, h: 52, weight: 2 });
  if (scene.player) {
    // 左上信息卡
    rects.push({ x: 6 + left, y: top - 6, w: 292, h: 216, weight: 2 });
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
      // 物品栏一行（贴底）
      rects.push({ x: x0 - 8, y: y0 - 8, w: W - x0 + 16, h: H - y0 + 16, weight: 2 });
      const t = scene._touchUI;
      if (t && typeof t.enabled === 'function' && t.enabled()) {
        // 触屏：按钮块与选中物品面板条各自成矩形——中间的空地不算遮挡，
        // 否则池子标签会被保守大包络整个推飞（用户实测'飞到天上去'）
        const btns = touchButtonRects(W, H, inv.slots, t.insets || {});
        if (btns.length) {
          let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
          for (const b of btns) {
            bx0 = Math.min(bx0, b.x);
            by0 = Math.min(by0, b.y);
            bx1 = Math.max(bx1, b.x + b.size);
            by1 = Math.max(by1, b.y + b.size);
          }
          rects.push({ x: bx0 - 8, y: by0 - 8, w: bx1 - bx0 + 16, h: by1 - by0 + 16, weight: 2 });
          rects.push({ x: bx0 - 8, y: by0 - 58, w: bx1 - bx0 + 16, h: 52, weight: 2 });
        }
      } else {
        // 桌面：选中物品面板带（物品栏上方一条）
        rects.push({ x: x0 - 8, y: y0 - 62, w: W - x0 + 16, h: 56, weight: 2 });
      }
      // 摇杆（左下半圆带容差；透明幽灵圈，权重轻）
      if (t && typeof t.enabled === 'function' && t.enabled()) {
        const g = joyGeom(W, H, t.insets || {});
        rects.push({ x: g.cx - g.R - 14, y: g.cy - g.R - 14, w: 2 * (g.R + 14), h: g.R + 14, weight: 0.3 });
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

// 落点粘性记忆（key → 上次偏移）：走路时相机移动，标签在面板边缘会一帧挪一帧
// 回——记住上次的落点并给粘性加分，只有明显更优才换位。tick 老化防泄漏。
const _lastPlace = new Map();
let _placeTick = 0;

/**
 * 为标签挑一个落点（只上下翻转，保持水平居中；最后画面内钳制）。
 * @param rect 标签盒（画布坐标，原位）
 * @param key  粘性记忆键（同标签跨帧不横跳）
 * @returns { dx, dy } 屏幕像素偏移
 */
export function labelPlacement(ctx, scene, rect, key = null) {
  _placeTick++;
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const occ = hudOccluders(scene, W, H);
  const rawPrev = key ? _lastPlace.get(key) : null;
  const prev = rawPrev && Math.abs(rawPrev.dx) <= 240 && Math.abs(rawPrev.dy) <= 240 ? rawPrev : null;
  if (!occ.length) {
    if (prev && (prev.dx || prev.dy)) _lastPlace.delete(key);
    // 空地也做画面内钳制（长标签贴边时收进来）
    const cx = Math.max(4 - rect.x, Math.min(0, W - 4 - rect.w - rect.x));
    const cy = Math.max(4 - rect.y, Math.min(0, H - 4 - rect.h - rect.y));
    return { dx: cx, dy: cy };
  }
  const area = rect.w * rect.h;

  const score = (r, dx, dy) => {
    let ov = 0;
    for (const o of occ) ov += overlapArea(r, o) * (o.weight ?? 2);
    // 越界重罚（×20）：挪出画布外 = 彻底看不见，比压在半透明面板上更糟
    let oob = 0;
    if (r.x < 4) oob += 4 - r.x;
    if (r.y < 4) oob += 4 - r.y;
    if (r.x + r.w > W - 4) oob += r.x + r.w - (W - 4);
    if (r.y + r.h > H - 4) oob += r.y + r.h - (H - 4);
    // 挪得越远越不优先（居中原位永远最优先）；与上次落点一致 → 粘性加分
    let sc = ov + oob * 20 + Math.hypot(dx, dy) * 0.35;
    if (prev && Math.abs(dx - prev.dx) <= 2 && Math.abs(dy - prev.dy) <= 2) sc -= 80;
    return sc;
  };

  // 候选：居中原位 → 竖直翻/远移（保持水平居中）
  const cands = [[0, 0]];
  for (const k of [1, 2.1]) {
    for (const sg of [-1, 1]) cands.push([0, sg * (rect.h + 8) * k]);
  }
  // 原位被压住过 1/3 → 追加"推出面板边缘"的竖直候选（水平仍居中）
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
      // 推出面板边缘的候选带距离上限（240px）：超远即说明该尺寸下面板布局
      // 异常，宁可贴着面板半遮也不把标签送到离物件很远的地方
      const esc = [
        [0, worst.y - rect.h - 6 - rect.y], // 推到面板上缘之上
        [0, worst.y + worst.h + 6 - rect.y], // 推到面板下缘之下
        [worst.x - rect.w - 6 - rect.x, 0], // 推到面板左缘之左
        [worst.x + worst.w + 6 - rect.x, 0], // 推到面板右缘之右
      ];
      for (const c of esc) {
        if (Math.abs(c[0]) <= 240 && Math.abs(c[1]) <= 240) cands.push(c);
      }
    }
  }

  let best = null;
  for (const [dx, dy] of cands) {
    const r = { x: rect.x + dx, y: rect.y + dy, w: rect.w, h: rect.h };
    const sc = score(r, dx, dy);
    if (!best || sc < best.sc) best = { sc, dx, dy };
  }
  // 水平/竖直钳制：越出画布就拉回边缘内（区间钳制——旧写法 min(0,…) 只会往
  // 左上拉，向右/下越界时直接把偏移清零，标签冲出屏幕没人管）
  if (best.dx + rect.x < 4) best.dx = 4 - rect.x;
  else if (best.dx + rect.x + rect.w > W - 4) best.dx = W - 4 - rect.w - rect.x;
  if (best.dy + rect.y < 4) best.dy = 4 - rect.y;
  else if (best.dy + rect.y + rect.h > H - 4) best.dy = H - 4 - rect.h - rect.y;
  if (key) {
    _lastPlace.set(key, { dx: best.dx, dy: best.dy, tick: _placeTick });
    if (_lastPlace.size > 96) {
      for (const [k, v] of _lastPlace) if (_placeTick - v.tick > 240) _lastPlace.delete(k);
    }
  }
  return { dx: best.dx, dy: best.dy };
}

// ---- 二次绘制队列：世界物件画完 → flushLabels 统一画出（浮在物件之上） ----

const labelQueue = [];

/** 世界渲染完成后调用：统一画出本帧入队的全部标签（屏幕坐标，居中盒） */
export function flushLabels(ctx) {
  for (const c of labelQueue) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0); // 命令存的是屏幕坐标
    // 入队后画布可能又 resize 过（转屏/分屏）：按当前画布尺寸再钳一次，
    // 防止用旧尺寸算出的坐标画出错位标签
    const cw = ctx.canvas ? ctx.canvas.width : 9999;
    const ch = ctx.canvas ? ctx.canvas.height : 9999;
    const bx = Math.max(4, Math.min(cw - 4 - c.bw, c.bx));
    const by = Math.max(4, Math.min(ch - 4 - c.bh, c.by));
    ctx.font = `bold ${c.fs}px monospace`;
    ctx.fillStyle = 'rgba(12,9,34,0.72)';
    rr(ctx, bx, by, c.bw, c.bh, 5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(232,184,75,0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // 清晰小字：细暗描边保证可读，不发光
    ctx.fillStyle = c.color;
    ctx.lineWidth = 3;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeText(c.text, bx + c.bw / 2, by + c.bh / 2);
    ctx.fillText(c.text, bx + c.bw / 2, by + c.bh / 2);
    ctx.restore();
  }
  labelQueue.length = 0;
}

/** 测试/工具用：清空未渲染的标签队列 */
export function clearLabelQueue() {
  labelQueue.length = 0;
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
  const fs = size * s; // 屏幕字号
  const color = opts.color ?? THEME.gold.text;
  // 居中锚定：盒以 (x, y) 的屏幕投影为水平中心、文字基线为竖直基准
  const sx = m ? m.a * x + m.c * y + m.e : x;
  const sy = m ? m.b * x + m.d * y + m.f : y;
  let textW = 0;
  try {
    ctx.font = `bold ${size}px monospace`;
    textW = ctx.measureText(text).width * s;
  } catch (e) {
    textW = text.length * fs * 0.62;
  }
  const bw = textW + 12 * s;
  const bh = fs + 7 * s;
  const rect = { x: sx - bw / 2, y: sy - fs - 2 * s, w: bw, h: bh };
  // 避让：只上下翻转（保持水平居中）+ 画面内钳制
  let dx = 0;
  let dy = 0;
  if (opts.scene && s > 0.01) {
    ({ dx, dy } = labelPlacement(ctx, opts.scene, rect, opts.id));
  }
  const W = ctx.canvas ? ctx.canvas.width : 9999;
  const H = ctx.canvas ? ctx.canvas.height : 9999;
  // 锚点在画面外（物件不可见）→ 标签直接不入队：钳制会把画面外物件的标签
  // 拉回屏幕边缘，看起来就像'东西不在屏幕内、标签却跑进来了'（用户实测）
  if (sx < -2 || sx > W + 2 || sy < -2 || sy > H + 2) return;
  const bx = Math.max(4, Math.min(W - 4 - bw, rect.x + dx));
  const by = Math.max(4, Math.min(H - 4 - bh, rect.y + dy));
  if (labelQueue.length > 256) labelQueue.length = 0; // 兜底：异常帧不无限堆积
  labelQueue.push({ bx, by, bw, bh, text, fs: Math.round(fs * 10) / 10, color });
}
