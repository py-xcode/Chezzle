// ============================================================================
// 钥匙：开关子类，开启物质不消耗（一旦开启永久打开）。
// 渲染为简洁的黄铜钥匙本体（开启时一层淡金光）。
// 开启后通常联动打开通关口（关卡接线 key.onOpen(() => door.open())）。
// ============================================================================

import { Switch } from './switch.js';
import { THEME } from '../render/theme.js';
import { sfx } from '../core/audio.js';

export class Key extends Switch {
  get hoverLabel() {
    return '钥匙';
  }
  constructor({ color = '#ff6a3d', consumeRate = 0, ...rest } = {}) {
    super({ consumeRate, color, ...rest });
  }

  /** 开锁音（Key = 永久开启的开关；异常关闭按普通开关闭合音） */
  _sfxChange(eff) {
    sfx(eff ? 'key.open' : 'switch.close');
  }

  // ---------------------------------------------------------------------------
  // 渲染（简洁版）：黄铜钥匙本体（杆 + 两齿 + 圆环），开锁时只有一层很淡的金光；
  //   无展示牌/漂浮/闪光等装饰。
  // ---------------------------------------------------------------------------
  render(ctx) {
    const cy = this.y + this.h / 2;
    const open = !!this.open;
    const bowR = Math.min(9, this.h * 0.34);
    const metal = ctx.createLinearGradient(this.x, cy - bowR, this.x + this.w, cy + bowR);
    metal.addColorStop(0, open ? '#ffe9b0' : '#d8b56c');
    metal.addColorStop(1, open ? '#a9782a' : '#7a5a20');
    ctx.save();
    ctx.strokeStyle = metal;
    ctx.lineWidth = Math.max(2.2, this.h * 0.1);
    ctx.lineCap = 'round';
    ctx.shadowColor = open ? THEME.gold.light : '#a9722a';
    ctx.shadowBlur = open ? 4 : 1.5;
    // 钥匙杆
    ctx.beginPath();
    ctx.moveTo(this.x + bowR + 2, cy);
    ctx.lineTo(this.x + this.w - 2, cy);
    ctx.stroke();
    // 齿（两枚）
    const toothY = Math.min(this.h * 0.34, 9);
    ctx.beginPath();
    ctx.moveTo(this.x + this.w * 0.72, cy);
    ctx.lineTo(this.x + this.w * 0.72, cy + toothY);
    ctx.moveTo(this.x + this.w * 0.9, cy);
    ctx.lineTo(this.x + this.w * 0.9, cy + toothY + 1);
    ctx.stroke();
    // 钥匙头圆环
    ctx.beginPath();
    ctx.arc(this.x + bowR + 1, cy, bowR, 0, Math.PI * 2);
    ctx.stroke();
    // 开锁微光（只一层很淡的金，关态不画）
    if (open) {
      ctx.fillStyle = 'rgba(255,233,176,0.26)';
      ctx.beginPath();
      ctx.arc(this.x + bowR + 1, cy, bowR * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    this.renderLabel(ctx);
  }
}
