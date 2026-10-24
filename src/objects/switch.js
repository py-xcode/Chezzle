// ============================================================================
// 开关：容器子类，存放"开启物质"（由玩家把沉淀放置进去）。
//   mode='chemical'：开启物质质量 > 0 即开，按 consumeRate g/s 消耗，耗尽自动关
//   mode='pressure'：有玩家/物块站在其上即开（不消耗）
// 打开/关闭时触发 onOpen/onClose（关卡接线联动门、灯等）。
// ============================================================================

import { Container } from './container.js';
import { THEME, rr, glowText, screenTextScale } from '../render/theme.js';
import { sfx } from '../core/audio.js';

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
    // ★ 可自动上台阶高度：开关本来就是"踩上去 / 把物块推上去"的小设备，
    //   默认 22px 高于全局 autoStepMax(14) → 玩家和物块都上不去（用户实测）。
    //   这里按自身高度给上限（留 4px 余量，并夹到 26 以免高开关被当成斜坡）。
    this.stepMax = Math.min(26, h + 4);
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
    // 纯视觉计时（数值很小，不参与任何玩法判定）：按压下沉/回弹 + 宝石呼吸
    this._pressT = 0; // 0=抬起 1=按下（随 open 指数趋近）
    this._pressKick = 0; // 状态切换冲击（1→0 约 0.16s 的回弹）
    this._animOpen = undefined; // 上一刻的视觉目标态（用于检测切换）
  }

  get isSwitch() {
    return true;
  }

  openingMass() {
    return this.opening ? this.precipitates.get(this.opening) ?? 0 : 0;
  }

  /** 玩家放入限制：有"开启物质"的开关只接受该物质（错误物质不能投入，保留在物品栏）；
   *  无 opening 的压力开关/纯气体探测器保持原有吸附行为。 */
  canAcceptSubstance(id) {
    return !this.opening || id === this.opening;
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

  /** 状态变化音效（Key 子类覆写为开锁音） */
  _sfxChange(eff) {
    sfx(eff ? 'switch.open' : 'switch.close');
  }

  update(dt, scene) {
    this.setOpen(this._isOpenTarget(scene));
    // ---- 视觉：按压下沉/回弹（开=按下、关=回弹，短促 0.15~0.2s，全部确定性）----
    const visualTarget = this.open ? 1 : 0;
    if (this._animOpen !== undefined && this._animOpen !== visualTarget) this._pressKick = 1;
    this._animOpen = visualTarget;
    this._pressT += (visualTarget - this._pressT) * (1 - Math.exp(-18 * dt));
    if (this._pressKick > 0) this._pressKick = Math.max(0, this._pressKick - dt / 0.16);
    // 输出按"有效开启态"变化触发："&"联锁时需两个开关都开才输出开
    const eff = this.effectiveOpen(scene);
    if (eff !== this._lastEff) {
      // 首次求值只记录状态，不发声：关卡开局"关着的开关"不能一起"啪"一声
      // （fire/开启动作照旧——初始就开的开关要触发 showId/igniteId/openId）
      const first = this._lastEff === undefined;
      this._lastEff = eff;
      if (!first) this._sfxChange(eff);
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

  // ---------------------------------------------------------------------------
  // 渲染（简洁版）：深紫石/深钢底座 + 黄铜细边 + 一块简踏板或药碟 + 一个状态灯；
  //   开/关切换的按压下沉 + 短促回弹（_pressT/_pressKick）保留；开=金、等=橙、关=暗。
  // ---------------------------------------------------------------------------
  render(ctx, opts) {
    const scene = opts?.scene ?? null;
    const t = opts?.time ?? 0;
    const eff = this._lastEff ?? this.effectiveOpen(scene); // 有效输出态（& 双开）
    const phys = this.open; // 物理激活态（自身被按下）
    // 三态：金色=输出开；橙色=已按下但等待"&"配对开关；暗=未按下
    const waiting = this.and && phys && !eff;
    const x = this.x;
    const y = this.y;
    const w = this.w;
    const h = this.h;
    const cx = x + w / 2;
    const sink = this._pressT * 2.2 + Math.sin(this._pressKick * Math.PI) * 1.2; // 下沉 + 切换回弹
    const accent = eff ? THEME.gold.light : waiting ? '#ffb340' : '#7a84a8';
    const breathe = 0.5 + 0.5 * Math.sin(t * 2.2 + x * 0.013); // 状态灯呼吸
    ctx.save();
    // 地面淡阴影
    ctx.fillStyle = 'rgba(4,3,12,0.3)';
    ctx.beginPath();
    ctx.ellipse(cx, y + h + 0.5, w * 0.46, Math.max(1.5, h * 0.14), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.translate(0, sink);
    // 深紫石/深钢底座
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
    // 黄铜细边（内嵌一线；开/等时轻微亮起，不加辉光）
    const pad = Math.max(1.4, Math.min(2.4, h * 0.07));
    rr(ctx, x + pad, y + pad, w - pad * 2, h - pad * 2, Math.max(2, br - 1));
    ctx.strokeStyle = eff ? 'rgba(255,215,106,0.7)' : waiting ? 'rgba(255,179,64,0.65)' : 'rgba(169,120,42,0.55)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // 模式装置：压力=一块简踏板；化学=一个内凹药碟（都只有一条轮廓线）
    if (this.mode === 'pressure') this._renderPedal(ctx, cx, y, w, h);
    else this._renderDish(ctx, cx, y, w, h);
    // 状态灯（一个圆灯：开=金、等=橙、关=暗；仅开/等时有克制呼吸辉光）
    const gr = Math.max(2.8, Math.min(6.5, Math.min(w, h) * 0.2));
    if (eff || waiting) {
      ctx.shadowColor = accent;
      ctx.shadowBlur = 5 + 4 * breathe;
    }
    ctx.fillStyle = eff ? THEME.gold.light : waiting ? '#ffb340' : 'rgba(120,130,160,0.55)';
    ctx.beginPath();
    ctx.arc(cx, y + h * 0.5, gr, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    // 状态字（小、克制，保留原有 开/等/关 语义）
    if (gr >= 4) {
      ctx.fillStyle = eff || waiting ? 'rgba(30,20,8,0.85)' : 'rgba(190,198,220,0.75)';
      ctx.font = `bold ${Math.max(7, Math.round(gr * 1.05 * 10) / 10)}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(eff ? '开' : waiting ? '等' : '关', cx, y + h * 0.5 + 0.5);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }
    ctx.restore();
    this.renderLabel(ctx);
    // "&" 联锁连线（若配置了 and）
    if (this.and && scene) this.renderAndLink(ctx, scene, eff, waiting);
  }

  /** 药碟（化学开关）：一个内凹圆 + 一条金环，无刻纹 */
  _renderDish(ctx, cx, y, w, h) {
    const r = Math.max(3, Math.min(w, h) * 0.36);
    if (r < 4) return;
    const cy = y + h * 0.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(10,8,28,0.35)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(169,120,42,0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  /** 踏板（压力开关）：一块简钢踏板（无弹簧/油缸/防滑刻线） */
  _renderPedal(ctx, cx, y, w, h) {
    const pw = Math.max(8, w * 0.62);
    const ph = Math.max(2.4, h * 0.2);
    const py = y + h * 0.52;
    rr(ctx, cx - pw / 2, py - ph / 2, pw, ph, 1.5);
    const pg = ctx.createLinearGradient(0, py - ph / 2, 0, py + ph / 2);
    pg.addColorStop(0, '#6a7392');
    pg.addColorStop(1, '#333a58');
    ctx.fillStyle = pg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(216,181,108,0.55)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  /** 与另一个 "&" 开关画联锁线 + 清晰的 & 徽章（保留简洁风格，但保证一眼可见） */
  renderAndLink(ctx, scene, eff, waiting) {
    const other = scene.byId[this.and];
    if (!other) return;
    const ax = this.x + this.w / 2;
    const ay = this.y + this.h / 2;
    const bx = other.x + other.w / 2;
    const by = other.y + other.h / 2;
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2;
    const lineColor = eff ? 'rgba(255,215,106,0.95)' : waiting ? 'rgba(255,179,64,0.9)' : 'rgba(216,204,170,0.6)';
    ctx.save();
    // 暗色底衬 + 亮虚线：浅色线在暗背景和装置缝隙里也看得清
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
    // 中央菱形徽章：深底 + 亮边 + 高对比 &，开态微光
    const k = screenTextScale(ctx, 11, 12, 1.35);
    const s = Math.max(13, Math.round(15 * k));
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(Math.PI / 4);
    rr(ctx, -s / 2, -s / 2, s, s, Math.max(2, s * 0.16));
    ctx.fillStyle = 'rgba(12,9,30,0.94)';
    ctx.fill();
    ctx.strokeStyle = eff ? '#ffe9b0' : waiting ? '#ffcf7a' : 'rgba(216,204,170,0.82)';
    ctx.lineWidth = eff ? 2 : 1.5;
    if (eff) {
      ctx.shadowColor = THEME.gold.light;
      ctx.shadowBlur = 8;
    }
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = eff ? '#fff1c4' : waiting ? '#ffd98c' : '#e6dfc8';
    ctx.font = `bold ${Math.max(12, Math.round(12 * k))}px "Segoe UI", "Microsoft YaHei", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (eff) {
      ctx.shadowColor = THEME.gold.light;
      ctx.shadowBlur = 6;
    }
    ctx.fillText('&', mx, my + 0.5);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }
}
