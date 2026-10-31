// ============================================================================
// 存档点（Checkpoint）——原版关卡对象（不再是插件）
// ----------------------------------------------------------------------------
// 玩家中心进入矩形区域时自动存档（on:'pos'，默认）；也可设为 on:'enter'：
// 进入本场景/关卡时自动存档（章节入口）。只有放置了至少一个存档点的关卡才会
// 自动存档——没有存档点的关卡不会产生任何内存存档。
//
// 视觉：区域上方悬着一个向下的金色三角标记（已触发后实心发光）——玩家一眼能看出
// "这里是检查点"。区域本身不参与碰撞、不可拾取。
//
// 编辑器/JSON：类型 `checkpoint`，字段 x/y/w/h/id/on。导出的 HTML 会生成
//   .checkpoint(x, y, w, h, { id, on })
// ============================================================================

import { Obj } from './obj.js';
import { Savepoint } from '../core/savepoint.js';

export class Checkpoint extends Obj {
  constructor({ x, y, w = 220, h = 160, id = '', on = 'pos', label = '', ...rest } = {}) {
    super({ x, y, w, h, id, solid: false, physicsKind: 'none', ...rest });
    this.isCheckpoint = true;
    this.checkpointId = String(id || '');
    this.saveOn = on === 'enter' ? 'enter' : 'pos';
    this.label = String(label || '');
    this._inside = false;
    this._enterSaved = false;
    this._saved = false;
    this._pulse = 0;
  }

  get hoverLabel() {
    return '存档点';
  }

  _save(scene) {
    const ok = Savepoint.save(scene, { id: this.checkpointId || null, force: true });
    if (ok) {
      this._saved = true;
      this._pulse = 1;
    }
  }

  update(dt, scene) {
    this._pulse = Math.max(0, (this._pulse || 0) - dt);
    if (!scene || scene.status !== 'running' || !scene.player || this.hidden) return;
    const blocked = Savepoint.isRestoring() || Savepoint.restoredRecently();
    if (this.saveOn === 'enter') {
      if (!this._enterSaved) {
        this._enterSaved = true;
        if (!blocked) this._save(scene);
      }
      return;
    }
    const p = scene.player;
    const cx = p.x + (p.w ?? 0) / 2;
    const cy = p.y + (p.h ?? 0) / 2;
    const inside = cx >= this.x && cx <= this.x + this.w && cy >= this.y && cy <= this.y + this.h;
    if (inside && !this._inside && !blocked) this._save(scene);
    this._inside = inside;
  }

  /** 只画"悬在上方的倒三角"标记；不画区域框，避免遮挡关卡内容 */
  render(ctx, opts = {}) {
    const time = opts.time ?? 0;
    const cx = this.x + this.w / 2;
    const top = this.y;
    const pulse = 0.5 + 0.5 * Math.sin(time * 2.2 + this.x * 0.01);
    const bob = Math.sin(time * 1.6 + this.x * 0.02) * 2;
    const y = top - 20 + bob;
    ctx.save();
    ctx.translate(cx, y);
    ctx.shadowColor = this._saved ? 'rgba(150,232,176,.85)' : 'rgba(255,215,106,.85)';
    ctx.shadowBlur = 10 + pulse * (this._pulse > 0 ? 10 : 3);
    ctx.beginPath();
    ctx.moveTo(-8, -7);
    ctx.lineTo(8, -7);
    ctx.lineTo(0, 7);
    ctx.closePath();
    if (this._saved) {
      ctx.fillStyle = `rgba(150,232,176,${0.85 + 0.15 * pulse})`;
      ctx.fill();
      ctx.strokeStyle = 'rgba(220,255,235,.95)';
    } else {
      ctx.fillStyle = `rgba(255,215,106,${0.16 + 0.12 * pulse})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(255,215,106,${0.75 + 0.25 * pulse})`;
    }
    ctx.lineWidth = 1.6;
    ctx.stroke();
    // 触发脉冲：三角外扩一圈
    if (this._pulse > 0.01) {
      ctx.globalAlpha = this._pulse * 0.8;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, 0, 12 + (1 - this._pulse) * 18, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}
