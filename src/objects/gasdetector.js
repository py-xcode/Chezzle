// ============================================================================
// 气体探测器：和开关同理，但"开启条件"是大气中某气体含量超过阈值。
// 复用 Switch 的 onOpen/onClose 接线与 effectiveOpen（"&"联锁）逻辑。
// ============================================================================

import { Switch } from './switch.js';
import { THEME, rr, glowText, screenTextScale } from '../render/theme.js';
import { getSubstance } from '../chem/substances.js';

export class GasDetector extends Switch {
  get hoverLabel() {
    return '气体探测器';
  }

  constructor({
    x, y, w = 40, h = 22,
    gas = 'H2', threshold = 0.5,
    color = '#3fa8e0', onOpen, onClose, ...rest
  } = {}) {
    super({ x, y, w, h, mode: 'chemical', color, onOpen, onClose, ...rest });
    this.gas = gas; // 检测的气体 id
    this.threshold = threshold; // 触发阈值（g）
    // 纯视觉：指针摆动/气量条缓动（0..1，确定性，不参与判定）
    this._level = 0;
    this._needle = 0;
  }

  /** 当前检测到的目标气体质量（含气室分区语义；render/update 共用） */
  _gasMass(scene) {
    const reactGas = scene && typeof scene.reactGasFor === 'function'
      ? scene.reactGasFor(this)
      : (scene && scene._reactGas) || {};
    return this.gas ? reactGas[this.gas] ?? 0 : 0;
  }

  /** 视觉计时：指针/气量条缓动（关闭回落、激活摆到高位）——约 0.3s 短过渡 */
  update(dt, scene) {
    super.update(dt, scene);
    const m = this._gasMass(scene);
    const target = this.gas ? Math.max(0, Math.min(1, m / Math.max(1e-3, this.threshold))) : 0;
    this._level += (target - this._level) * (1 - Math.exp(-9 * dt));
    // 激活（含放入开启物质）→ 指针至少摆到高位；关闭 → 回落到真实气量
    const nTarget = this.open ? Math.max(0.75, this._level) : this._level * 0.35;
    this._needle += (nTarget - this._needle) * (1 - Math.exp(-8 * dt));
  }

  /** 检测开态：只有"反应产生的气体"超标 或 放入开启物质（任一满足即开；其余复用 Switch.update + "&"联锁）。
   *  不检测大气里预置的气体（如初始 atmosphere.add('H2', 8)），只检测反应正在产生的那种气体。
   *  气室内部：只读取该气室内部的产气（外部产气不会激活内部探测器，反之亦然）。 */
  _isOpenTarget(scene) {
    const gasOn = this.gas ? this._gasMass(scene) > this.threshold : false;
    const openingOn = this.opening ? this.openingMass() > 0 : false;
    return gasOn || openingOn;
  }

  renderLabel(ctx) {
    // 标注文字屏幕最小字号保底（11px 与路牌同档、上限 1.15）
    const k = screenTextScale(ctx, 10, 11);
    const f10 = `bold ${Math.round(10 * k * 10) / 10}px monospace`;
    glowText(ctx, `${this.gas} > ${this.threshold}g`, this.x, this.y - 4 * k, THEME.water.light, f10, 4 * k);
    // 开启物质（若有）：显示在下方，剩余量实时更新（同开关）
    if (this.opening) {
      const m = this.openingMass();
      glowText(ctx, `${this.opening}${m > 0 ? ` ${m.toFixed(1)}g` : ''}`, this.x + this.w / 2, this.y + this.h + 12 * k, THEME.gold.text, f10, 4 * k);
    }
  }

  // ---------------------------------------------------------------------------
  // 渲染（简洁版）：深钢仪表壳 + 黄铜细边 + 一块简仪表窗（水平气量条 + 指针标记）+
  //   气体色状态光；指针缓动保留（约 0.3s）。无刻度环/铆钉/玻璃罩等装饰。
  // ---------------------------------------------------------------------------
  render(ctx, opts) {
    const scene = opts?.scene ?? null;
    const eff = this._lastEff ?? this.effectiveOpen(scene); // 有效输出态
    const phys = this.open; // 物理检测态（气体超标）
    const waiting = this.and && phys && !eff; // 已检测到气体但等待"&"配对
    const x = this.x;
    const y = this.y;
    const w = this.w;
    const h = this.h;
    const level = Math.max(0, Math.min(1, this._level ?? 0));
    const needle = Math.max(0, Math.min(1, this._needle ?? 0));
    const gasColor = (this.gas && getSubstance(this.gas)?.gasColor) || THEME.water.light;
    ctx.save();
    // 地面淡阴影
    ctx.fillStyle = 'rgba(4,3,12,0.3)';
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h + 0.5, w * 0.46, Math.max(1.5, h * 0.14), 0, 0, Math.PI * 2);
    ctx.fill();
    // 深钢仪表壳
    const br = Math.max(3, Math.min(8, h * 0.3));
    rr(ctx, x, y, w, h, br);
    const base = ctx.createLinearGradient(x, y, x, y + h);
    base.addColorStop(0, '#3a3f5c');
    base.addColorStop(1, '#191d36');
    ctx.fillStyle = base;
    ctx.fill();
    ctx.strokeStyle = 'rgba(8,6,24,0.9)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // 黄铜细边（内嵌一线；激活时轻微亮起，不加辉光）
    const pad = Math.max(1.4, Math.min(2.4, h * 0.07));
    rr(ctx, x + pad, y + pad, w - pad * 2, h - pad * 2, Math.max(2, br - 1));
    ctx.strokeStyle = eff ? 'rgba(255,215,106,0.7)' : waiting ? 'rgba(255,179,64,0.65)' : 'rgba(169,120,42,0.55)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // 简仪表窗（深紫玻璃面 + 一道细边）
    const wx = x + Math.max(4, w * 0.1);
    const wy = y + Math.max(3, h * 0.22);
    const ww = Math.max(6, w - (wx - x) * 2);
    const wh = Math.max(4, h - (wy - y) * 2);
    rr(ctx, wx, wy, ww, wh, Math.max(1.5, wh * 0.25));
    ctx.fillStyle = 'rgba(16,12,38,0.95)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(150,170,210,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // 气体色状态光（窗口内从左向右随气量淡入）
    if (level > 0.01) {
      ctx.save();
      rr(ctx, wx, wy, ww, wh, Math.max(1.5, wh * 0.25));
      ctx.clip();
      ctx.globalAlpha = 0.18 + 0.3 * level;
      ctx.fillStyle = gasColor;
      ctx.fillRect(wx, wy, ww * level, wh);
      ctx.globalAlpha = 1;
      ctx.restore();
    }
    // 气量条（窗口底部一条细条：轨道 + 气体色填充）
    const barH = Math.max(1.6, wh * 0.16);
    const barY = wy + wh - barH - Math.max(1, wh * 0.12);
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(wx + 1, barY, ww - 2, barH);
    if (level > 0.005) {
      ctx.fillStyle = gasColor;
      ctx.fillRect(wx + 1, barY, (ww - 2) * level, barH);
    }
    // 指针标记（竖线，位置由缓动的 _needle 决定；激活时金/气体色，关态灰）
    const mx = wx + ww * needle;
    ctx.strokeStyle = eff ? '#ffe9b0' : waiting ? '#ffb340' : '#aab4d0';
    ctx.lineWidth = Math.max(1, ww * 0.022 + 0.6);
    ctx.beginPath();
    ctx.moveTo(mx, wy + Math.max(1.5, wh * 0.12));
    ctx.lineTo(mx, barY - Math.max(1.5, wh * 0.1));
    ctx.stroke();
    ctx.restore();
    this.renderLabel(ctx);
    // "&" 联锁连线（若配置了 and）
    if (this.and && scene) this.renderAndLink(ctx, scene, eff, waiting);
  }

  /** 与另一个 "&" 装置画联锁线 + 清晰的 & 徽章（与开关同语言，使用探测器青色） */
  renderAndLink(ctx, scene, eff, waiting) {
    const other = scene.byId[this.and];
    if (!other) return;
    const ax = this.x + this.w / 2;
    const ay = this.y + this.h / 2;
    const bx = other.x + other.w / 2;
    const by = other.y + other.h / 2;
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2;
    const lineColor = eff ? 'rgba(127,224,255,0.95)' : waiting ? 'rgba(255,179,64,0.9)' : 'rgba(150,190,225,0.6)';
    ctx.save();
    ctx.strokeStyle = 'rgba(8,6,20,0.6)';
    ctx.lineWidth = 3.6;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1.8;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.setLineDash([]);
    const k = screenTextScale(ctx, 11, 12, 1.35);
    const s = Math.max(13, Math.round(15 * k));
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(Math.PI / 4);
    rr(ctx, -s / 2, -s / 2, s, s, Math.max(2, s * 0.16));
    ctx.fillStyle = 'rgba(10,14,30,0.94)';
    ctx.fill();
    ctx.strokeStyle = eff ? '#bfe6ff' : waiting ? '#ffcf7a' : 'rgba(150,190,225,0.82)';
    ctx.lineWidth = eff ? 2 : 1.5;
    if (eff) {
      ctx.shadowColor = THEME.water.light;
      ctx.shadowBlur = 8;
    }
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = eff ? '#e8f8ff' : waiting ? '#ffd98c' : '#dbe8f4';
    ctx.font = `bold ${Math.max(12, Math.round(12 * k))}px "Segoe UI", "Microsoft YaHei", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (eff) {
      ctx.shadowColor = THEME.water.light;
      ctx.shadowBlur = 6;
    }
    ctx.fillText('&', mx, my + 0.5);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }
}
