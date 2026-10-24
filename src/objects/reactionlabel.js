// ============================================================================
// 反应标签（调试模式）：在反应发生的位置飘出"反应式"，缓慢上浮后淡出。
// 调试模式下 scene.onReaction 在反应点生成。
// 视觉：暗紫玻璃小面板 + 细金边（新 Chezzle 语言）+ 发光字；入场 0.14s 内
//   从下往上轻推一点并淡入（确定性），不遮挡/不改反应逻辑。
// ============================================================================

import { Obj } from './obj.js';
import { rr, screenTextScale, clearText } from '../render/theme.js';

export class ReactionLabel extends Obj {
  constructor({ x, y, text, color = '#9fd8ff' }) {
    super({ x, y, w: 0, h: 0, solid: false, physicsKind: 'none' });
    this.text = text;
    this.color = color;
    this.age = 0;
    this.life = 1.8; // 秒
  }

  update(dt, scene) {
    this.age += dt;
    this.y -= 20 * dt; // 缓慢上浮
    if (this.age >= this.life) scene.removeObject(this);
  }

  render(ctx, opts = {}) {
    const a = Math.max(0, 1 - this.age / this.life);
    if (a <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = a;
    // 字号按"屏幕实际像素"保证（低分辨率手机上世界字号被相机缩小后糊）
    const k = screenTextScale(ctx, 11, 11, 1.6);
    const size = Math.round(Math.max(11, 11 * k));
    ctx.font = `bold ${size}px "Segoe UI", "Microsoft YaHei", monospace`;
    const w = ctx.measureText(this.text).width;
    // 入场：前 0.16s 从下方 5px 轻推到位（确定性 easeOut）
    const enter = Math.min(1, this.age / 0.16);
    const dy = (1 - (1 - Math.pow(1 - enter, 2))) * 5;
    const cx = this.x;
    const cy = this.y + dy;
    const padX = Math.max(6, size * 0.5);
    const boxW = w + padX * 2;
    const boxH = size + 8;
    // 面板：暗紫玻璃渐变 + 细金边 + 外发光
    rr(ctx, cx - boxW / 2, cy - boxH + 2, boxW, boxH, boxH * 0.32);
    const bg = ctx.createLinearGradient(0, cy - boxH + 2, 0, cy + 2);
    bg.addColorStop(0, 'rgba(40,32,80,0.92)');
    bg.addColorStop(1, 'rgba(14,10,36,0.92)');
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(232,184,75,0.55)';
    ctx.lineWidth = 1;
    ctx.shadowColor = 'rgba(232,184,75,0.35)';
    ctx.shadowBlur = 4;
    ctx.stroke();
    ctx.shadowBlur = 0;
    // 左侧色标（反应/物质色）——一小段竖线，不写文字
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - boxW / 2 + 3.5, cy - boxH * 0.62);
    ctx.lineTo(cx - boxW / 2 + 3.5, cy - boxH * 0.2);
    ctx.stroke();
    // 发光字
    ctx.save();
    ctx.font = `bold ${size}px "Segoe UI", "Microsoft YaHei", monospace`;
    ctx.fillStyle = this.color;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 5;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.text, cx, cy - boxH * 0.42 + 1);
    ctx.restore();
    // 暗色描边保证亮底/亮液体上也可读（clearText 自带细暗描边）
    clearText(ctx, this.text, cx, cy - boxH * 0.42 + 1, this.color, `bold ${size}px "Segoe UI", "Microsoft YaHei", monospace`);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }
}
