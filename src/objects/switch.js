// ============================================================================
// 开关：容器子类，存放"开启物质"（由玩家把沉淀放置进去）。
//   mode='chemical'：开启物质质量 > 0 即开，按 consumeRate g/s 消耗，耗尽自动关
//   mode='pressure'：有玩家/物块站在其上即开（不消耗）
// 打开/关闭时触发 onOpen/onClose（关卡接线联动门、灯等）。
// ============================================================================

import { Container } from './container.js';
import { THEME, rr, glowText, screenTextScale } from '../render/theme.js';

export class Switch extends Container {
  get hoverLabel() {
    return '开关';
  }

  constructor({
    x, y, w = 40, h = 22,
    opening = null, consumeRate = 0, mode = 'chemical',
    color = '#d8b000', and = null, deleteId = null, showId = null, igniteId = null, extinguishId = null, openId = null, onOpen, onClose, ...rest
  } = {}) {
    // 开关是干式机构（存放"开启物质"），内部不应有液体水（否则放进去的盐会被溶解掉、开关失效）
    super({ x, y, w, h, solid: true, physicsKind: 'static', water: 0, volume: 0, ...rest });
    this.opening = opening; // 开启物质 id
    this.consumeRate = consumeRate; // g/s（0 = 不消耗）
    this.mode = mode;
    this.color = color;
    this.and = and; // "&"联锁：另一个开关的 id，两个都开才输出开
    this.deleteId = deleteId; // 开启瞬间删除的物体 id（如移开挡路的墙）
    this.showId = showId; // 开启瞬间显现的物体 id（初始隐藏的物体在此刻出现）
    this.igniteId = igniteId; // 开启瞬间点燃的酒精灯 id
    this.extinguishId = extinguishId; // 关闭瞬间熄灭的酒精灯 id
    this.openId = openId; // 开启瞬间打开的门 id（钥匙开锁门）
    this.open = false; // 物理状态（压力/化学/气体检测）
    this._lastEff = false; // 上次输出的有效开启态（初始=关，触发 onOpen/onClose）
    this._handlers = {};
    if (onOpen) this._handlers.open = onOpen;
    if (onClose) this._handlers.close = onClose;
  }

  get isSwitch() {
    return true;
  }

  openingMass() {
    return this.opening ? this.precipitates.get(this.opening) ?? 0 : 0;
  }

  on(name, fn) {
    this._handlers[name] = fn;
    return this;
  }

  /** 打开时触发（快捷方法） */
  onOpen(fn) {
    this._handlers.open = fn;
    return this;
  }

  /** 关闭时触发（快捷方法） */
  onClose(fn) {
    this._handlers.close = fn;
    return this;
  }

  fire(name) {
    this._handlers[name]?.();
  }

  update(dt, scene) {
    this.setOpen(this._isOpenTarget(scene));
    // 输出按"有效开启态"变化触发："&"联锁时需两个开关都开才输出开
    const eff = this.effectiveOpen(scene);
    if (eff !== this._lastEff) {
      this._lastEff = eff;
      this.fire(eff ? 'open' : 'close');
      // 开启瞬间：删除物体 / 显现隐藏物体 / 点燃灯（只触发一次）
      if (eff) {
        if (this.deleteId) {
          const target = scene.byId[this.deleteId];
          if (target) scene.removeObject(target);
        }
        if (this.showId) scene.reveal(this.showId);
        if (this.igniteId) {
          const lamp = scene.byId[this.igniteId];
          if (lamp && typeof lamp.ignite === 'function') lamp.ignite();
        }
        if (this.openId) {
          const door = scene.byId[this.openId];
          if (door && typeof door.open === 'function') door.open();
        }
      } else if (this.extinguishId) {
        const lamp = scene.byId[this.extinguishId];
        if (lamp && typeof lamp.extinguish === 'function') lamp.extinguish();
      }
    }
    if (this.open && this.consumeRate > 0 && this.opening) {
      this.takePrecipitate(this.opening, this.consumeRate * dt);
    }
  }

  /** 物理开态检测（子类可覆写：压力/化学/气体检测等） */
  _isOpenTarget(scene) {
    return this.mode === 'pressure' ? this._onTop(scene) : this.openingMass() > 0;
  }

  /** 物理状态：检测结果（不直接触发输出） */
  setOpen(v) {
    this.open = v;
  }

  /** 有效开启态：无 and → 自身 open；有 and → 自身 && 关联开关均开 */
  effectiveOpen(scene) {
    if (!this.and) return this.open;
    const other = scene ? scene.byId[this.and] : null;
    return this.open && !!(other && other.open);
  }

  _onTop(scene) {
    for (const obj of scene.objects) {
      if (obj === this || !obj.solid || obj.physicsKind !== 'dynamic') continue; // 排除自身与静态物
      if (obj.amount !== undefined) continue; // 沉淀粒子不压压力开关（只有玩家/物块能压）
      // 重叠开关区域，且脚底贴近开关顶（站在其上/压在开关上；站在下方地面不算）。
      // 窗口按下界 -12 / 上界 开关全高+4 放宽：玩家被反应消耗体型会变小、跳落/自动上
      // 台阶等常见站位 bottom 都落在窗口内——"踩上去没反应"的根因。
      if (obj.right > this.x && obj.left < this.x + this.w &&
          obj.bottom >= this.y - 12 && obj.bottom <= this.y + (this.h ?? 22) + 4) return true;
    }
    return false;
  }

  /** 标注开启物质 + 剩余量（钥匙等子类复用） */
  renderLabel(ctx) {
    // 标注文字屏幕最小字号保底（11px 与路牌同档、上限 1.15——比路牌略小不抢戏）
    const k = screenTextScale(ctx, 10, 11);
    const f = (px) => `${Math.round(px * k * 10) / 10}px monospace`;
    if (this.mode === 'pressure') {
      // 压力开关：写明触发方式（与化学开关同位——化学开关标开启物，压力标"压力"）
      glowText(ctx, '压力', this.x, this.y - 4 * k, THEME.gold.text, `bold ${f(10)}`, 4 * k);
    } else if (this.opening) {
      glowText(ctx, this.opening, this.x, this.y - 4 * k, THEME.gold.text, `bold ${f(10)}`, 4 * k);
    } else if (this.mode === 'chemical') {
      // 化学开关没设开启物质：提示需要设置（否则永远不会开）
      glowText(ctx, '未设开启物', this.x, this.y - 4 * k, 'rgba(170,158,120,0.55)', `bold ${f(9)}`, 3 * k);
    }
    const m = this.openingMass();
    if (m > 0) {
      glowText(ctx, `${m.toFixed(1)}g`, this.x + this.w / 2, this.y + this.h + 12 * k, '#ffffff', `bold ${f(10)}`, 4 * k);
    }
  }

  render(ctx, opts) {
    const scene = opts?.scene ?? null;
    const eff = this._lastEff ?? this.effectiveOpen(scene); // 有效输出态（& 双开）
    const phys = this.open; // 物理激活态（自身被按下）
    // 三态：金色=输出开；橙色=已按下但等待"&"配对开关；暗=未按下
    const waiting = this.and && phys && !eff;
    const glowColor = eff ? THEME.gold.light : waiting ? '#ffb340' : 'rgba(90,80,60,0.6)';
    const glowBlur = eff ? 16 : waiting ? 12 : 3;
    ctx.save();
    // 石台底座
    const g = ctx.createLinearGradient(this.x, this.y, this.x, this.y + this.h);
    g.addColorStop(0, eff ? '#565c80' : '#4a4f70');
    g.addColorStop(1, '#22263f');
    ctx.fillStyle = g;
    rr(ctx, this.x, this.y, this.w, this.h, 6);
    ctx.fill();
    // 边框：开=金发光，等=橙，关=暗（一眼可辨）
    const frame = eff ? THEME.gold.light : waiting ? '#ffb340' : '#151830';
    ctx.strokeStyle = frame;
    ctx.lineWidth = eff ? 2 : waiting ? 1.5 : 1;
    ctx.shadowColor = eff ? THEME.gold.light : waiting ? '#ffb340' : 'transparent';
    ctx.shadowBlur = eff ? 14 : waiting ? 8 : 0;
    ctx.stroke();
    ctx.shadowBlur = 0;
    // 顶部符文珠（物理按下就亮：金=双开输出，橙=已按下等配对，暗=未按下）
    const cx = this.x + this.w / 2;
    const cy = this.y + 7;
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = glowBlur;
    ctx.fillStyle = eff ? THEME.gold.light : waiting ? '#ffb340' : 'rgba(120,110,90,0.55)';
    ctx.beginPath();
    ctx.arc(cx, cy, Math.min(this.w, 20) / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = eff ? '#3a2a08' : waiting ? '#4a2a08' : 'rgba(150,140,110,0.6)';
    ctx.font = `bold ${Math.round(9 * screenTextScale(ctx, 9, 10) * 10) / 10}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(eff ? '开' : waiting ? '等' : '关', cx, cy + 3);
    ctx.textAlign = 'left';
    ctx.restore();
    this.renderLabel(ctx);
    // "&" 联锁连线（若配置了 and）
    if (this.and && scene) this.renderAndLink(ctx, scene, eff, waiting);
  }

  /** 与另一个 "&" 开关画连接线 + 标记（金=双开，橙=已按下等配对，暗=未按下） */
  renderAndLink(ctx, scene, eff, waiting) {
    const other = scene.byId[this.and];
    if (!other) return;
    const ax = this.x + this.w / 2;
    const ay = this.y + this.h / 2;
    const bx = other.x + other.w / 2;
    const by = other.y + other.h / 2;
    const color = eff ? THEME.gold.light : waiting ? '#ffb340' : 'rgba(150,140,110,0.35)';
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
    // "&" 标记（居中于连线）
    ctx.fillStyle = color;
    ctx.font = `bold ${Math.round(12 * screenTextScale(ctx, 12, 11) * 10) / 10}px serif`;
    ctx.textAlign = 'center';
    ctx.fillText('&', (ax + bx) / 2, (ay + by) / 2 - 4);
    ctx.textAlign = 'left';
    ctx.restore();
  }
}
