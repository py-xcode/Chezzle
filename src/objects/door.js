// ============================================================================
// 通关口：钥匙开启后由关卡接线 open()。玩家靠近且门开 → 通关。
// ============================================================================

import { Obj } from './obj.js';
import { THEME } from '../render/theme.js';
import { sfx } from '../core/audio.js';
import { puffFx } from './fx.js';

export class Door extends Obj {
  get hoverLabel() {
    return '门';
  }
  constructor({ x, y, w = 30, h = 80, color = '#ff6a3d', ...rest } = {}) {
    super({ x, y, w, h, solid: false, physicsKind: 'none', ...rest });
    this.color = color;
    this.isOpen = false;
    this.key = null; // 关联钥匙（可选，供检查）
    // 纯视觉：闸门升起的平滑进度（0..1，约 0.3s；通关判定只看 isOpen，立即生效）
    this._openT = 0;
    this._seenOpen = false; // 检测 false→true 的瞬间（开启动画起点，用于扬尘）
  }

  get isDoor() {
    return true;
  }

  open() {
    if (this.isOpen) return; // 已开的门再 open() 不是状态变化
    this.isOpen = true;
    sfx('door.open');
  }

  /** 视觉动画推进（纯表现层：门板升起 + 尘雾；不影响碰撞/通关时机） */
  update(dt, scene) {
    const target = this.isOpen ? 1 : 0;
    // 开 ~0.32s、关 ~0.4s（指数趋近；近目标时直接落定，避免无限尾数）
    const k = 1 - Math.exp(-(this.isOpen ? 9 : 7.5) * dt);
    this._openT += (target - this._openT) * k;
    if (Math.abs(this._openT - target) < 0.004) this._openT = target;
    if (this.isOpen && !this._seenOpen) {
      this._seenOpen = true;
      // 开门瞬间：门底两侧扬起一点石尘（复用 B 组 fx.puffFx；纯视觉）
      if (scene && typeof scene.addObject === 'function') {
        puffFx(scene, this.x + this.w * 0.28, this.y + this.h - 3, { color: '198,180,255', spread: 16, r: 5, n: 5, life: 0.4 });
        puffFx(scene, this.x + this.w * 0.72, this.y + this.h - 3, { color: '198,180,255', spread: 16, r: 5, n: 5, life: 0.4 });
      }
    } else if (!this.isOpen) {
      this._seenOpen = false;
    }
  }

  // ---------------------------------------------------------------------------
  // 渲染（简洁版）：深紫石/钢拱框 + 一条细金内缘 + 升降闸门（深钢门板 + 2 道钢带）：
  //   门板平滑升起、底部光缝随之上扫；开=暖金透光，关=暗。无符文/拱心石/光尘装饰。
  // ---------------------------------------------------------------------------
  render(ctx) {
    const W = this.w;
    const H = this.h;
    if (!(W > 0 && H > 0)) return;
    const x = this.x;
    const y = this.y;
    const cx = x + W / 2;
    const openT = Math.max(0, Math.min(1, this._openT ?? (this.isOpen ? 1 : 0)));
    const ease = openT * openT * (3 - 2 * openT); // smoothstep
    const frame = Math.max(2, Math.min(5, Math.floor(Math.min(W, H) * 0.12))); // 门框厚度
    ctx.save();
    // ---- 1) 门洞内容（裁剪在拱内）----
    ctx.save();
    this._arch(ctx, frame);
    ctx.clip();
    // 暗腔
    ctx.fillStyle = 'rgba(5,4,16,0.95)';
    ctx.fillRect(x, y, W, H);
    // 开启透光：上金下紫的竖渐变（强度随 ease）
    if (ease > 0.01) {
      const lg = ctx.createLinearGradient(0, y, 0, y + H);
      lg.addColorStop(0, `rgba(255,226,160,${(0.5 * ease).toFixed(3)})`);
      lg.addColorStop(0.55, `rgba(255,205,110,${(0.72 * ease).toFixed(3)})`);
      lg.addColorStop(1, `rgba(150,100,240,${(0.42 * ease).toFixed(3)})`);
      ctx.fillStyle = lg;
      ctx.fillRect(x, y, W, H);
    }
    // ---- 2) 升降闸门（裁剪在拱内；升起时滑出拱顶）----
    const inset = frame + 1;
    const pw = Math.max(2, W - inset * 2);
    const ph = Math.max(2, H - inset * 2);
    const rise = ease * (ph + frame + 4);
    ctx.save();
    this._arch(ctx, inset);
    ctx.clip();
    ctx.translate(0, -rise);
    // 门板主体（深钢）
    const pg = ctx.createLinearGradient(x + inset, 0, x + inset + pw, 0);
    pg.addColorStop(0, '#565d7e');
    pg.addColorStop(0.4, '#3a3f5c');
    pg.addColorStop(1, '#20243c');
    ctx.fillStyle = pg;
    ctx.fillRect(x + inset, y + inset, pw, ph);
    ctx.strokeStyle = 'rgba(8,6,22,0.9)';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(x + inset, y + inset, pw, ph);
    // 横向钢带（2 条，仅一道亮面）
    for (let i = 0; i < 2; i++) {
      const by = y + inset + (ph * (i + 0.5)) / 2;
      const bh = Math.max(1.2, ph * 0.03);
      const bg = ctx.createLinearGradient(0, by - bh, 0, by + bh);
      bg.addColorStop(0, '#7a84a8');
      bg.addColorStop(1, '#252a44');
      ctx.fillStyle = bg;
      ctx.fillRect(x + inset, by - bh, pw, bh * 2);
      ctx.strokeStyle = 'rgba(8,6,22,0.55)';
      ctx.lineWidth = 0.8;
      ctx.strokeRect(x + inset, by - bh, pw, bh * 2);
    }
    // 门板下缘光缝（关门时微弱；开门时随门板上升扫过——"光缝扫过"）
    const seamY = y + inset + ph;
    const seamA = 0.25 + 0.75 * ease;
    ctx.strokeStyle = `rgba(255,240,190,${(0.55 * seamA).toFixed(3)})`;
    ctx.lineWidth = Math.max(1, frame * 0.4);
    ctx.shadowColor = THEME.gold.light;
    ctx.shadowBlur = 4 + 6 * ease;
    ctx.beginPath();
    ctx.moveTo(x + inset, seamY);
    ctx.lineTo(x + W - inset, seamY);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore(); // 门板裁剪结束
    ctx.restore(); // 门洞裁剪结束

    // ---- 3) 门框：深紫石/钢拱环 + 一条细金内缘（无符文/拱心石/铆钉）----
    ctx.beginPath();
    this._archTrail(ctx, 0);
    this._archTrail(ctx, frame);
    const stone = ctx.createLinearGradient(x, y, x, y + H);
    stone.addColorStop(0, '#545a80');
    stone.addColorStop(0.5, '#3a3f5c');
    stone.addColorStop(1, '#22263f');
    ctx.fillStyle = stone;
    ctx.fill('evenodd');
    ctx.strokeStyle = 'rgba(8,6,22,0.92)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    this._archTrail(ctx, 0);
    ctx.stroke();
    // 细金内缘（开=稍亮，无辉光）
    ctx.beginPath();
    this._arch(ctx, frame + 0.5);
    ctx.strokeStyle = ease > 0.03 ? 'rgba(255,233,176,0.75)' : THEME.gold.deep;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
  }

  /** 拱形路径（独立 beginPath；inset 为向内缩进） */
  _arch(ctx, inset) {
    ctx.beginPath();
    this._archTrail(ctx, inset);
    ctx.closePath();
  }

  /** 向当前路径追加拱形轮廓（不自开路径：供 even-odd「门框环」组合子路径用） */
  _archTrail(ctx, inset) {
    const x = this.x + inset;
    const y = this.y + inset;
    const w = this.w - inset * 2;
    const h = this.h - inset * 2;
    const r = w / 2;
    ctx.moveTo(x, y + h);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
  }
}
