// ============================================================================
// 钥匙：开关子类，开启物质不消耗（一旦开启永久打开）。
// 渲染为神话金钥匙（开启时发光）。
// 开启后通常联动打开通关口（关卡接线 key.onOpen(() => door.open())）。
// ============================================================================

import { Switch } from './switch.js';
import { THEME } from '../render/theme.js';

export class Key extends Switch {
  get hoverLabel() {
    return '钥匙';
  }
  constructor({ color = '#ff6a3d', consumeRate = 0, ...rest } = {}) {
    super({ consumeRate, color, ...rest });
  }

  render(ctx) {
    const cx = this.x + this.w / 2;
    const cy = this.y + this.h / 2;
    ctx.save();
    ctx.shadowColor = this.open ? THEME.gold.light : '#a9722a';
    ctx.shadowBlur = this.open ? 18 : 6;
    ctx.strokeStyle = this.open ? THEME.gold.light : '#c9a45a';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    // 钥匙杆
    ctx.beginPath();
    ctx.moveTo(this.x + 6, cy);
    ctx.lineTo(this.x + this.w, cy);
    ctx.stroke();
    // 齿
    ctx.beginPath();
    ctx.moveTo(this.x + this.w * 0.72, cy);
    ctx.lineTo(this.x + this.w * 0.72, cy + 8);
    ctx.moveTo(this.x + this.w * 0.9, cy);
    ctx.lineTo(this.x + this.w * 0.9, cy + 9);
    ctx.stroke();
    // 圆环（钥匙头）
    ctx.beginPath();
    ctx.arc(this.x + 6, cy, 9, 0, Math.PI * 2);
    ctx.stroke();
    // 钥匙头内亮
    ctx.fillStyle = this.open ? 'rgba(255,240,190,0.35)' : 'rgba(120,90,40,0.25)';
    ctx.beginPath();
    ctx.arc(this.x + 6, cy, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    this.renderLabel(ctx);
  }
}
