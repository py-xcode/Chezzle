// ============================================================================
// 化学式/标签：暗底圆角 + 金色发光文字。
// 设计定论（多轮迭代后的最终形态，勿再引入"避让搬移"）：
//  - 标签永远居中锚定在物件标注点上，只做**画面内钳制**（长标签贴边收进来，
//    永不截断、永不飞远）；
//  - 二次绘制：renderFormula 只入队（屏幕坐标），Renderer 在世界物件画完后、
//    HUD 之前调 flushLabels 统一画出——标签**浮于物件之上、被 HUD 覆盖**
//    （信息卡/按钮/通关遮罩不被标签压住）。曾试过"避开 HUD 面板"的各种搬移
//    （上下翻转/推出边缘/粘性记忆），在面板又大又多的手机上全部产生新的错位
//    或"标签飞到天上"，已全部移除——分层（HUD 在上）比搬移更可靠；
//  - 字号按屏幕实际像素保底（低分手机不再糊）；
//  - 锚点在画面外的物件（不可见）不画标签。
// ============================================================================

import { THEME, rr } from './theme.js';

// ---- 二次绘制队列：世界 + HUD 画完 → flushLabels 统一画出 ----

const labelQueue = [];

/** 世界物件画完之后、HUD 之前调用：统一画出本帧入队的全部标签（浮于物件之上、HUD 之下） */
export function flushLabels(ctx) {
  const W = ctx.canvas ? ctx.canvas.width : 9999;
  const H = ctx.canvas ? ctx.canvas.height : 9999;
  for (const c of labelQueue) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0); // 命令存的是屏幕坐标
    // 入队后画布可能又 resize 过（转屏/分屏）：按当前画布尺寸再钳一次
    const bx = Math.max(4, Math.min(W - 4 - c.bw, c.bx));
    const by = Math.max(4, Math.min(H - 4 - c.bh, c.by));
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
  // 锚点（物件标注点）投影在画面外 → 标签不入队：物件都看不见，标签不该出现
  const W = ctx.canvas ? ctx.canvas.width : 9999;
  const H = ctx.canvas ? ctx.canvas.height : 9999;
  if (sx < -2 || sx > W + 2 || sy < -2 || sy > H + 2) return;
  // 画面内钳制：长标签贴边时收进来（这是唯一的位移——永不飞远、永不截断）
  const bx = Math.max(4, Math.min(W - 4 - bw, sx - bw / 2));
  const by = Math.max(4, Math.min(H - 4 - bh, sy - fs - 2 * s));
  if (labelQueue.length > 256) labelQueue.length = 0; // 兜底：异常帧不无限堆积
  labelQueue.push({ bx, by, bw, bh, text, fs: Math.round(fs * 10) / 10, color });
}
