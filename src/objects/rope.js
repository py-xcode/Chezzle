// ============================================================================
// 绳子：细线，悬挂一个物体。锚点可为固定坐标或跟随某物体（相对坐标）。
// 悬挂物体的位置完全由绳子决定（lateUpdate：物理结算后再定位，避免被推走）。
// 每刻检查：锚点物体不存在，或悬挂物体目标位置被实心体卡住 → 断绳。
// 断绳后绳子消失，悬挂物体恢复重力。
// 视觉：深钢绞绳 + 双股编织纹（交替斜纹）+ 一线暗金侧光 + 黄铜锚环/末端绳结；
//   只改绘制，绳子长度/锚点/悬挂物理完全不变。
// ============================================================================

import { Obj } from './obj.js';
import { overlaps } from '../physics/collision.js';
import { THEME } from '../render/theme.js';
import { sfx } from '../core/audio.js';

const TAU = Math.PI * 2;

export class Rope extends Obj {
  constructor({ x = 0, y = 0, length = 100, anchor, hanging, ...rest } = {}) {
    super({ x, y, w: 2, h: length, solid: false, physicsKind: 'none', ...rest });
    this.length = length;
    this.anchor = anchor; // {fixed:{x,y}} | {obj, dx?, dy?}
    this.hanging = hanging; // 悬挂物体（Obj）
    this.broken = false;
    // 悬挂期间物体不受重力，位置由绳子决定
    if (hanging) {
      hanging.gravity = 0;
      // 初始把悬挂物放到锚点+长度处，避免构造时的初始偏移被误判为"被推动"
      const a = this.anchorPoint();
      hanging.x = a.x - hanging.w / 2;
      hanging.y = a.y + length - hanging.h;
    }
  }

  anchorPoint() {
    if (this.anchor.fixed) return { x: this.anchor.fixed.x, y: this.anchor.fixed.y };
    const o = this.anchor.obj;
    return { x: o.x + (this.anchor.dx ?? 0), y: o.y + (this.anchor.dy ?? 0) };
  }

  lateUpdate(dt, scene) {
    if (this.broken || !this.hanging) return;
    // 锚点物体消失 → 断绳
    if (this.anchor.obj && !scene.byId[this.anchor.obj.id]) {
      this.break(scene);
      return;
    }
    // 悬挂物体被删除（如开关 deleteId 移除了它）→ 断绳
    if (!scene.byId[this.hanging.id]) {
      this.break(scene);
      return;
    }
    let a = this.anchorPoint();
    // 区分"推的是锚点"还是"推的是悬挂物"：
    //  - 锚点本 tick 移动（玩家推锚点）→ 悬挂物跟随即可，不平移锚点
    //  - 锚点没动但悬挂物被推离期望 → 平移锚点（绳子刚性，整个系统一起动）
    const anchorDx = a.x - (this._prevAnchorX ?? a.x);
    const tx = a.x - this.hanging.w / 2;
    const dx = this.hanging.x - tx;
    if (!(Math.abs(anchorDx) > 0.5) && this.anchor.obj && Math.abs(dx) > 0.5) {
      this.anchor.obj.x += dx;
      a.x += dx;
    }
    this._prevAnchorX = a.x;
    this.x = a.x;
    this.y = a.y;
    const nx = a.x - this.hanging.w / 2;
    const ny = a.y + this.length - this.hanging.h;
    this.hanging.x = nx;
    this.hanging.y = ny;
    this.hanging.vel = { x: 0, y: 0 };
    // 目标位置被实心体卡住 → 断绳
    for (const s of scene.statics) {
      if (overlaps(this.hanging, s)) {
        this.break(scene);
        return;
      }
    }
  }

  break(scene) {
    if (this.broken) return;
    this.broken = true;
    sfx('rope.break');
    if (this.hanging) this.hanging.gravity = 1;
    scene.removeObject(this);
  }

  /** 绳子绘制：深钢绞绳 + 编织斜纹 + 暗金侧光 + 黄铜锚环/绳结（纯视觉） */
  render(ctx) {
    const x = this.x;
    const y0 = this.y;
    const len = Math.max(0, this.length);
    if (len <= 0) return;
    ctx.save();
    ctx.lineCap = 'round';
    // 1) 绳芯：深钢底绳（外深内亮，读得出圆柱体积）
    ctx.strokeStyle = 'rgba(16,14,34,0.9)';
    ctx.lineWidth = 4.4;
    ctx.beginPath();
    ctx.moveTo(x, y0 + 2);
    ctx.lineTo(x, y0 + len - 2);
    ctx.stroke();
    ctx.strokeStyle = '#4a5175';
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(x, y0 + 2);
    ctx.lineTo(x, y0 + len - 2);
    ctx.stroke();
    // 2) 编织纹：交替斜向短纹（双股交织感）。按"偶/奇"两股各批成一条路径 → 每帧只 2 次
    //    stroke（长绳也不逐个 stroke）；段数按长度封顶（性能）。
    const step = Math.max(6, len / 50);
    const yEnd = y0 + len - 3;
    for (let parity = 0; parity < 2; parity++) {
      ctx.strokeStyle = parity ? 'rgba(186,200,232,0.72)' : 'rgba(116,128,166,0.72)';
      ctx.lineWidth = 1.9;
      ctx.beginPath();
      for (let i = parity, yy = y0 + 3 + parity * step; yy < yEnd; i += 2, yy += step * 2) {
        const dir = parity ? 1 : -1;
        const half = Math.min(step, yEnd - yy);
        ctx.moveTo(x - 2.3 * dir, yy);
        ctx.lineTo(x + 2.3 * dir, yy + half);
      }
      ctx.stroke();
    }
    // 3) 暗金侧光：贴左缘一条细暖金线（新 Chezzle 金语言；微微波动）
    ctx.strokeStyle = rgbaOf(THEME.gold.base, 0.55);
    ctx.lineWidth = 1;
    ctx.shadowColor = rgbaOf(THEME.gold.light, 0.45);
    ctx.shadowBlur = 3;
    ctx.beginPath();
    for (let k = 0; k <= 8; k++) {
      const yy = y0 + 4 + ((len - 8) * k) / 8;
      const xx = x - 2.6 + Math.sin(yy * 0.08) * 0.4;
      if (k === 0) ctx.moveTo(xx, yy);
      else ctx.lineTo(xx, yy);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
    // 4) 顶端黄铜锚环（外圈 + 亮内圈 + 高光点）
    ctx.beginPath();
    ctx.arc(x, y0, 3.6, 0, TAU);
    ctx.fillStyle = '#2a2340';
    ctx.fill();
    ctx.strokeStyle = rgbaOf(THEME.gold.base, 0.95);
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.strokeStyle = rgbaOf(THEME.gold.light, 0.7);
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.arc(x, y0, 2.2, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,246,214,0.85)';
    ctx.beginPath();
    ctx.arc(x - 1.1, y0 - 1.2, 0.8, 0, TAU);
    ctx.fill();
    // 5) 末端绳结：略粗的一小段缠绳 + 一滴金属坠（挂住悬挂物的视觉交代）
    const endY = y0 + len;
    ctx.strokeStyle = '#5a6288';
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(x - 2.6, endY - 5.5);
    ctx.lineTo(x + 2.6, endY - 2.5);
    ctx.moveTo(x - 2.6, endY - 2.5);
    ctx.lineTo(x + 2.6, endY - 5.5);
    ctx.stroke();
    ctx.fillStyle = rgbaOf(THEME.gold.deep, 0.95);
    ctx.beginPath();
    ctx.arc(x, endY - 1.2, 2.1, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,240,190,0.55)';
    ctx.beginPath();
    ctx.arc(x - 0.6, endY - 1.9, 0.7, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

/** 十六进制色 + 透明度 → rgba 字符串 */
function rgbaOf(hex, a) {
  const h = String(hex ?? '#ffffff').replace('#', '');
  const n = h.length === 3
    ? [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)]
    : [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  return `rgba(${n[0]},${n[1]},${n[2]},${Math.max(0, Math.min(1, a))})`;
}
