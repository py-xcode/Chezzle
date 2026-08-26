// ============================================================================
// 爆炸视觉 v2（从头构思）：
//  阶段1 白热闪核 → 阶段2 火团（12 片火焰瓣组成的翻涌边缘，非正圆）暖色渐变
//  阶段3 撕裂冲击环（快白环+慢橙环+径向光纹）→ 阶段4 带下坠的拖尾火星
//  全程 烟尘/余烬淡出。0.5s 后移除。
// 物理冲击（炸飞/碎裂）由 Scene.explode 处理；本对象只负责视觉反馈。
// ============================================================================

import { Obj } from './obj.js';

/** 确定性伪随机（mulberry32）：同一 Explosion 实例内每次渲染形状一致；不同实例不同形 */
function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Explosion extends Obj {
  constructor({ x, y, strength = 10, cause = null, flip = false }) {
    super({ x, y, w: 0, h: 0, solid: false, physicsKind: 'none', noLift: true });
    this.strength = strength;
    this.cause = cause; // 爆炸原因文本（调试：爆炸发生时显示）
    this.age = 0;
    this.life = 0.5;
    // 每次爆炸生成一套确定性形状参数（角度偏置/瓣数/火星轨迹），连续爆炸不雷同
    const rnd = mulberry32((flip ? 0x9e37 : 0x85eb) + (strength * 7919 | 0));
    this.rnd = [];
    for (let i = 0; i < 40; i++) this.rnd.push(rnd());
  }

  update(dt, scene) {
    this.age += dt;
    if (this.age >= this.life) scene.removeObject(this);
  }

  render(ctx, scene) {
    const rnd = this.rnd;
    const t = Math.min(1, this.age / this.life); // 0..1
    // 爆发曲线：前 35% 完成 ~80% 半径（瞬间炸开、缓慢收尾）
    const ease = 1 - Math.pow(1 - Math.min(1, t / 0.38), 2.1);
    const R = (16 + this.strength * 2.4) * (0.25 + 0.75 * ease);
    const alpha = Math.max(0, 1 - t);
    const x = this.x;
    const y = this.y;
    ctx.save();
    // ---- 白热闪核（前 18% 最亮，快速熄灭） ----
    const flash = Math.max(0, 1 - t / 0.18);
    if (flash > 0.02) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, R * 1.15);
      g.addColorStop(0, `rgba(255,255,252,${(flash * 0.95).toFixed(3)})`);
      g.addColorStop(0.35, `rgba(255,236,190,${(flash * 0.55).toFixed(3)})`);
      g.addColorStop(1, 'rgba(255,160,60,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, R * 1.15, 0, Math.PI * 2);
      ctx.fill();
    }
    // ---- 火团：12 片火焰瓣拼成翻涌边缘（非正圆，慢速旋转） ----
    const lobes = 12;
    const spin = t * 0.9 + (rnd[0] - 0.5) * 2;
    const wob = 1 + 0.05 * Math.sin(t * 9 + rnd[1] * 6); // 整体轻微呼吸
    ctx.beginPath();
    for (let i = 0; i < lobes; i++) {
      const ang = spin + (i / lobes) * Math.PI * 2;
      const rr = R * (0.6 + rnd[2 + i] * 0.34) * wob
        * (0.72 + 0.28 * Math.sin(t * 12 + rnd[2 + i] * 9)); // 每瓣自己抖动（火舌感）
      const px = x + Math.cos(ang) * rr * 0.92;
      const py = y + Math.sin(ang) * rr * 0.8; // 略扁：贴近地面的爆燃
      ctx.moveTo(px + R * 0.3, py);
      ctx.arc(px, py, R * 0.3, 0, Math.PI * 2);
    }
    const fireG = ctx.createRadialGradient(x, y, 0, x, y, R);
    fireG.addColorStop(0, `rgba(255,246,225,${(alpha * 0.95).toFixed(3)})`);
    fireG.addColorStop(0.45, `rgba(255,180,80,${(alpha * 0.7).toFixed(3)})`);
    fireG.addColorStop(0.8, `rgba(255,105,30,${(alpha * 0.4).toFixed(3)})`);
    fireG.addColorStop(1, 'rgba(180,60,20,0)');
    ctx.fillStyle = fireG;
    ctx.shadowColor = 'rgba(255,130,40,0.9)';
    ctx.shadowBlur = 24;
    ctx.fill();
    ctx.shadowBlur = 0;
    // ---- 撕裂冲击环：快白内环 + 慢橙外环（宽度逐帧收细、外环带"撕裂"缺口） ----
    ctx.lineCap = 'round';
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = 'rgba(255,240,215,0.9)';
    ctx.lineWidth = (1 - t) * 3.2 + 0.7;
    ctx.shadowColor = 'rgba(255,150,60,0.8)';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(x, y, R * (0.45 + 0.75 * ease), 0, Math.PI * 2);
    ctx.stroke();
    // 外环：一段段弧（撕裂感——按 rnd 开出 1~2 个缺口，随 t 旋转）
    const gapA = rnd[14] * Math.PI * 2 + t * 1.4;
    const gapB = gapA + 0.6 + rnd[15] * 0.9;
    ctx.strokeStyle = `rgba(255,150,70,${(alpha * 0.75).toFixed(3)})`;
    ctx.lineWidth = (1 - t) * 4.5 + 0.9;
    ctx.beginPath();
    ctx.arc(x, y, R * (0.75 + 1.05 * ease), gapB, gapA + Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    // ---- 径向光纹（爆炸方向的"刀光"，只在前 35% 短暂出现） ----
    if (t < 0.35) {
      const streakA = alpha * (1 - t / 0.35);
      ctx.strokeStyle = `rgba(255,210,150,${(streakA * 0.85).toFixed(3)})`;
      ctx.lineWidth = 1.6;
      for (let i = 0; i < 7; i++) {
        const ang = rnd[16 + i] * Math.PI * 2 + t * 0.6;
        const d0 = R * (0.62 + rnd[24 + i] * 0.2);
        const d1 = d0 + R * (0.3 + rnd[31 + i] * 0.35);
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(ang) * d0, y + Math.sin(ang) * d0 * 0.9);
        ctx.lineTo(x + Math.cos(ang) * d1, y + Math.sin(ang) * d1 * 0.9);
        ctx.stroke();
      }
    }
    // ---- 拖尾火星：带下坠感（传播方向 + 重力偏移） ----
    ctx.globalAlpha = 1;
    const n = 13;
    for (let i = 0; i < n; i++) {
      const ang = rnd[16 + i % 8] * Math.PI * 2 + t * 0.8;
      const fall = t * t * R * 1.35; // 越飞越坠
      const d0 = R * (0.3 + t * 0.9);
      const d1 = R * (0.4 + t * 1.35);
      const x0 = x + Math.cos(ang) * d0;
      const y0 = y + Math.sin(ang) * d0 * 0.88 + fall * 0.4;
      const x1 = x + Math.cos(ang) * d1;
      const y1 = y + Math.sin(ang) * d1 * 0.88 + fall;
      const a = Math.max(0, alpha * (1 - t * 0.8));
      ctx.globalAlpha = a;
      ctx.strokeStyle = i % 2 ? 'rgba(255,220,160,1)' : 'rgba(255,120,40,1)';
      ctx.lineWidth = 2.3 - t * 1.5;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      // 火星头（亮点）
      ctx.fillStyle = i % 2 ? '#fff3d8' : '#ff8c3d';
      ctx.beginPath();
      ctx.arc(x1, y1, Math.max(0.8, 2.6 - t * 2), 0, Math.PI * 2);
      ctx.fill();
    }
    // ---- 烟尘：深灰蓝团上升 + 余烬小亮点 ----
    for (let i = 0; i < 5; i++) {
      const px = x + Math.sin(rnd[5 + i] * 9 + t * 1.5) * R * (0.5 + rnd[10 + i] * 0.4);
      const py = y - (4 + i * 8) * (0.4 + t * 1.2);
      ctx.globalAlpha = alpha * 0.3 * (1 - t * 0.55);
      ctx.fillStyle = '#54596b';
      ctx.beginPath();
      ctx.arc(px, py, 2.6 + t * 8.5 + rnd[i] * 2, 0, Math.PI * 2);
      ctx.fill();
    }
    // 余烬：2 颗在下坠火星间闪烁
    for (let i = 0; i < 2; i++) {
      const ex = x + Math.sin(rnd[20 + i] * 20 + t * 4) * R * 0.8;
      const ey = y - 8 + t * t * R * 1.1;
      ctx.globalAlpha = alpha * (0.6 + 0.4 * Math.sin(t * 30 + i * 7));
      ctx.fillStyle = '#ffcf7a';
      ctx.beginPath();
      ctx.arc(ex, ey, Math.max(0.6, 1.8 - t), 0, Math.PI * 2);
      ctx.fill();
    }
    // ---- 爆炸原因文本（调试）：炸点上方弹出，逐帧上浮淡出 ----
    if (this.cause && this.age < 0.32) {
      ctx.globalAlpha = Math.min(1, (0.32 - this.age) * 4);
      ctx.font = 'bold 12px "Segoe UI", "Microsoft YaHei", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(8,14,26,0.72)';
      const ty = y - R * 0.9 - 10;
      const tw = ctx.measureText(this.cause).width;
      ctx.beginPath();
      ctx.roundRect(x - tw / 2 - 6, ty - 14, tw + 12, 20, 6);
      ctx.fill();
      ctx.fillStyle = '#ffe9b0';
      ctx.fillText(this.cause, x, ty - 1);
      ctx.textAlign = 'left';
    }
    ctx.restore();
  }
}
