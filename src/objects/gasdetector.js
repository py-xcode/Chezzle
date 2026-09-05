// ============================================================================
// 气体探测器：和开关同理，但"开启条件"是大气中某气体含量超过阈值。
// 复用 Switch 的 onOpen/onClose 接线与 effectiveOpen（"&"联锁）逻辑。
// ============================================================================

import { Switch } from './switch.js';
import { THEME, rr, glowText, screenTextScale } from '../render/theme.js';

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
  }

  /** 检测开态：只有"反应产生的气体"超标 或 放入开启物质（任一满足即开；其余复用 Switch.update + "&"联锁）。
   *  不检测大气里预置的气体（如初始 atmosphere.add('H2', 8)），只检测反应正在产生的那种气体。 */
  _isOpenTarget(scene) {
    const gasOn = this.gas ? !!(scene._reactGas && scene._reactGas[this.gas] > this.threshold) : false;
    const openingOn = this.opening ? this.openingMass() > 0 : false;
    return gasOn || openingOn;
  }

  renderLabel(ctx) {
    // 标注文字屏幕最小字号保底（相机缩放后 10px 太小）
    const k = screenTextScale(ctx, 10, 12);
    const f10 = `bold ${Math.round(10 * k * 10) / 10}px monospace`;
    glowText(ctx, `${this.gas} > ${this.threshold}g`, this.x, this.y - 4 * k, THEME.water.light, f10, 4 * k);
    // 开启物质（若有）：显示在下方，剩余量实时更新（同开关）
    if (this.opening) {
      const m = this.openingMass();
      glowText(ctx, `${this.opening}${m > 0 ? ` ${m.toFixed(1)}g` : ''}`, this.x + this.w / 2, this.y + this.h + 12 * k, THEME.gold.text, f10, 4 * k);
    }
  }

  render(ctx, opts) {
    const scene = opts?.scene ?? null;
    const eff = this._lastEff ?? this.effectiveOpen(scene); // 有效输出态
    const phys = this.open; // 物理检测态（气体超标）
    const waiting = this.and && phys && !eff; // 已检测到气体但等待"&"配对
    const cx = this.x + this.w / 2;
    const cy = this.y + this.h / 2;
    ctx.save();
    // 蓝宝石底座（区别于普通金开关）
    const g = ctx.createLinearGradient(this.x, this.y, this.x, this.y + this.h);
    g.addColorStop(0, eff ? '#3a5a82' : '#2c4a6e');
    g.addColorStop(1, '#16263c');
    ctx.fillStyle = g;
    rr(ctx, this.x, this.y, this.w, this.h, 6);
    ctx.fill();
    // 边框：开=亮蓝发光，等=橙，关=暗（一眼可辨）
    const frame = eff ? THEME.water.light : waiting ? '#ffb340' : '#0e1a2c';
    ctx.strokeStyle = frame;
    ctx.lineWidth = eff ? 2 : waiting ? 1.5 : 1;
    ctx.shadowColor = eff ? THEME.water.light : waiting ? '#ffb340' : 'transparent';
    ctx.shadowBlur = eff ? 14 : waiting ? 8 : 0;
    ctx.stroke();
    ctx.shadowBlur = 0;
    // 状态珠：开=亮蓝白实心发光，等=橙，关=暗灰空心
    ctx.beginPath();
    ctx.arc(cx, cy, Math.min(this.w, 20) / 2, 0, Math.PI * 2);
    if (!eff && !waiting) {
      ctx.strokeStyle = 'rgba(130,160,200,0.6)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else {
      ctx.fillStyle = eff ? '#bfe6ff' : '#ffb340';
      ctx.shadowColor = eff ? THEME.water.light : '#ffb340';
      ctx.shadowBlur = eff ? 16 : waiting ? 12 : 0;
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    // 状态字：开 / 等 / 关（直接标在珠上）
    ctx.fillStyle = eff ? '#062a44' : waiting ? '#4a2a08' : 'rgba(150,180,210,0.6)';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(eff ? '开' : waiting ? '等' : '关', cx, cy + 3);
    ctx.textAlign = 'left';
    ctx.restore();
    this.renderLabel(ctx);
    // "&" 联锁连线（若配置了 and）
    if (this.and && scene) this.renderAndLink(ctx, scene, eff, waiting);
  }

  /** 与另一个 "&" 开关画连接线（金/蓝=双开，橙=已检测等配对，暗=未检测） */
  renderAndLink(ctx, scene, eff, waiting) {
    const other = scene.byId[this.and];
    if (!other) return;
    const ax = this.x + this.w / 2;
    const ay = this.y + this.h / 2;
    const bx = other.x + other.w / 2;
    const by = other.y + other.h / 2;
    const color = eff ? THEME.water.light : waiting ? '#ffb340' : 'rgba(120,140,170,0.35)';
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = eff || waiting ? color : 'transparent';
    ctx.shadowBlur = eff || waiting ? 6 : 0;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.setLineDash([]);
    // "&" 标记
    ctx.fillStyle = color;
    ctx.font = 'bold 12px serif';
    ctx.textAlign = 'center';
    ctx.fillText('&', (ax + bx) / 2, (ay + by) / 2 - 4);
    ctx.textAlign = 'left';
    ctx.restore();
  }
}
