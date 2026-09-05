// ============================================================================
// 文字标签：关卡内显示说明文字（帮助玩家理解每个区域的机制）
// 渲染为神秘石板 + 金色发光文字。
// ============================================================================

import { Obj } from './obj.js';
import { rr, screenTextScale } from '../render/theme.js';

export class Sign extends Obj {
  get hoverLabel() {
    return '路标';
  }
  constructor({ x, y, text = '', color = '#ffe9b0', size = 12, ...rest } = {}) {
    // 石板尺寸按文字估算（构造期无 ctx 测量；中文字符宽≈size，西文字符≈0.6×size）
    const lines = String(text ?? '').split('\n');
    let maxChars = 0;
    for (const l of lines) maxChars = Math.max(maxChars, l.length);
    super({
      x, y,
      w: Math.max(14, Math.round(maxChars * size * 0.68) + 14),
      h: lines.length * (size + 6) + 18,
      solid: false,
      physicsKind: 'none',
      ...rest,
    });
    this.text = text;
    this.color = color;
    this.size = size;
  }

  render(ctx) {
    const lines = this.text.split('\n');
    const size = this.size;
    // 屏幕最小字号保底：相机缩放后路牌字过小（移动端小视口 ~0.85×）。
    // ★ 保底取 12px（与药品标签同档）且 k 上限 1.15：路牌是**世界摆位**的文字
    //   （编辑器按原字号排布），放大过猛会让相邻路牌互相压叠（用户截图复现：
    //   13px 保底后两牌重叠、文案互相打架）——收敛幅度兼顾可读与摆位。
    const k = Math.min(1.15, screenTextScale(ctx, size, 12));
    const s2 = size * k;
    const lh = s2 + 4 * k; // 紧凑行距（省高度：多行牌更少占屏）
    ctx.save();
    ctx.font = `${s2}px "Segoe UI", sans-serif`;
    const maxW = Math.max(...lines.map((ln) => ctx.measureText(ln).width));
    // 盒模型：this.y = 石板顶（与编辑器选中框一致）；文字基线 = 顶 + size + 8
    const baseY = this.y + s2 + 6 * k;
    // 石板底：顶边在文字上方留出 padding（整块等比 k，更轻薄的底）
    ctx.fillStyle = 'rgba(14,10,38,0.66)';
    rr(ctx, this.x - 5 * k, this.y, maxW + 10 * k, lines.length * lh + 14 * k, 6 * k);
    ctx.fill();
    ctx.strokeStyle = 'rgba(232,184,75,0.45)';
    ctx.lineWidth = 1;
    ctx.shadowColor = 'rgba(232,184,75,0.3)';
    ctx.shadowBlur = 4;
    ctx.stroke();
    ctx.shadowBlur = 0;
    // 金色发光文字
    ctx.fillStyle = this.color;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 5;
    lines.forEach((ln, i) => ctx.fillText(ln, this.x, baseY + i * lh));
    ctx.restore();
  }
}
