// ============================================================================
// 插件：破坏者（Destroyer）—— 可拾取工具
// 拾取后按自定义按键（默认 F），把一定范围内距离玩家最近的物块打碎成沉淀。
// 组件可在编辑器里放置；按键/范围/冷却在物体属性面板调整。
// ============================================================================

// @@chezzle-plugin
// {
//   "name": "破坏者",
//   "version": "1.0",
//   "api": 1,
//   "description": "可拾取工具：按自定义键把范围内最近的物块打碎成沉淀",
//   "components": [
//     {
//       "type": "destroyer",
//       "label": "破坏者",
//       "color": "#e8b84b",
//       "defW": 54,
//       "defH": 54,
//       "fields": [
//         { "key": "key", "label": "破坏按键", "kind": "text", "def": "KeyF" },
//         { "key": "radius", "label": "破坏范围", "kind": "number", "def": 180 },
//         { "key": "cooldown", "label": "冷却(秒)", "kind": "number", "def": 0.35 }
//       ]
//     }
//   ]
// }
// @@end

(function () {
  'use strict';

  const TAU = Math.PI * 2;

  class Destroyer extends Chezzle.Obj {
    constructor(o = {}) {
      super({
        x: o.x ?? 0,
        y: o.y ?? 0,
        w: o.w ?? 54,
        h: o.h ?? 54,
        mass: 0,
        solid: false,
        physicsKind: 'none',
        gravity: 0,
        id: o.id ?? '',
        hidden: !!o.hidden,
      });
      this.typeName = 'Destroyer';
      this.key = String(o.key || 'KeyF');
      this.radius = Math.max(20, Number(o.radius) || 180);
      this._used = false; // 消耗品：成功击碎一次后消失
    }

    get isCarryItem() { return 'destroyer'; }
    get hoverLabel() { return '破坏者'; }

    /** HUD 选中物品说明（core/render/hud.js 会优先调用它） */
    carryInfo() {
      return {
        title: '破坏者',
        comp: `${this.keyLabel()} · 击碎最近的物块`,
        mass: `范围 ${Math.round(this.radius)}`,
        color: '#ffd76a',
      };
    }

    keyLabel() {
      const m = /^Key([A-Z])$/.exec(this.key);
      if (m) return m[1];
      return this.key.replace(/^Digit/, '');
    }

    /** 破坏者是消耗品：成功击碎一次后从物品栏消失 */
    consumeItself(scene) {
      const inv = scene.player && scene.player.inventory;
      if (!inv || !Array.isArray(inv.slots)) return false;
      for (let i = 0; i < inv.slots.length; i++) {
        const s = inv.slots[i];
        if (s && s.obj === this) {
          inv.slots[i] = null;
          return true;
        }
      }
      return false;
    }

    /**
     * 把最近的物块打成沉淀：
     * - 先按网格真实成分收集质量（不凭空造物/丢质量）；
     * - 移除物块，再按每种成分 spawnParticles（可拾取的自由沉淀）；
     * - 尘雾/火花只做反馈。
     */
    shatterNearest(scene) {
      const p = scene.player;
      if (!p) return null;
      const px = p.x + p.w / 2;
      const py = p.y + p.h / 2;
      let best = null;
      let bestD = Infinity;
      for (const o of scene.objects) {
        if (!o || o === p || o.hidden || !o.solid) continue;
        if (o.constructor?.name !== 'Block' && o.typeName !== 'Block') continue;
        if (!o.grid || !(o.grid.totalMass() > 0)) continue;
        const d = Math.hypot((o.x + o.w / 2) - px, (o.y + o.h / 2) - py);
        if (d <= this.radius && d < bestD) { best = o; bestD = d; }
      }
      if (!best) return null;

      const masses = best.grid.masses ? best.grid.masses() : null;
      const point = { x: best.x + best.w / 2, y: best.y + best.h / 2 };
      const spread = Math.max(24, best.w * 0.7);
      const color = (() => {
        try {
          const ids = Object.keys(masses || {});
          const s = ids.length ? Chezzle.getSubstance(ids[0]) : null;
          return s?.solid?.[0] ?? '#c9b46a';
        } catch (e) { return '#c9b46a'; }
      })();
      scene.removeObject(best);
      const list = masses && Object.keys(masses).length
        ? masses
        : { [best.substance]: best.mass };
      for (const [id, mass] of Object.entries(list)) {
        if (!(mass > 1e-6)) continue;
        scene.spawnParticles(id, mass, point, true, false,
          { kind: 'destroy', text: `${id} 碎裂` }, spread);
      }
      // 纯视觉：物块中心的金属碎屑 + 金色冲击环
      try {
        Chezzle.puffFx(scene, point.x, point.y, {
          color: (() => {
            const h = String(color).replace('#', '');
            const n = h.length === 3
              ? [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)]
              : [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
            return `${n[0]},${n[1]},${n[2]}`;
          })(),
          r: 4.5, spread: Math.max(20, best.w * 0.55), life: 0.4, n: 8,
        });
        Chezzle.sparkleFx(scene, point.x, point.y, {
          color: '#ffd76a', n: 10, spread: Math.max(24, best.w * 0.55), rise: 18, life: 0.45, size: 2.2,
        });
        Chezzle.shockFx(scene, point.x, point.y, {
          color: 'rgba(232,184,75,0.75)', r0: 5, r1: Math.max(30, best.w * 0.7), life: 0.3, width: 2, flat: 0.5,
        });
      } catch (e) { /* 特效可选 */ }
      return best;
    }

    drawPickaxe(ctx, s = 1) {
      ctx.save();
      ctx.scale(s, s);
      ctx.rotate(-0.62);
      // 木柄
      const handle = ctx.createLinearGradient(-3, 24, 4, -22);
      handle.addColorStop(0, '#5a381c');
      handle.addColorStop(0.45, '#a86b32');
      handle.addColorStop(1, '#e0a45e');
      ctx.strokeStyle = handle;
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-2, 24);
      ctx.lineTo(2, -18);
      ctx.stroke();
      // 黄铜箍
      ctx.strokeStyle = '#e8b84b';
      ctx.lineWidth = 2.2;
      for (const y of [14, -8]) {
        ctx.beginPath();
        ctx.moveTo(-4, y);
        ctx.lineTo(4, y - 1);
        ctx.stroke();
      }
      // 镐头（钢色弧，尖端）
      const steel = ctx.createLinearGradient(-24, -26, 24, -8);
      steel.addColorStop(0, '#6f7d8f');
      steel.addColorStop(0.45, '#eef4ff');
      steel.addColorStop(1, '#8d9aac');
      ctx.fillStyle = steel;
      ctx.strokeStyle = 'rgba(20,24,38,0.85)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-27, -20);
      ctx.quadraticCurveTo(-10, -31, 0, -22);
      ctx.quadraticCurveTo(10, -31, 27, -20);
      ctx.quadraticCurveTo(10, -16, 0, -19);
      ctx.quadraticCurveTo(-10, -16, -27, -20);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // 刃口高光
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-22, -20.5);
      ctx.quadraticCurveTo(-8, -27.5, 0, -21.5);
      ctx.quadraticCurveTo(8, -27.5, 22, -20.5);
      ctx.stroke();
      // 柄底发光小块
      ctx.fillStyle = 'rgba(232,184,75,0.9)';
      ctx.beginPath();
      ctx.arc(-2, 24, 2.6, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    render(ctx) {
      const cx = this.x + this.w / 2;
      const cy = this.y + this.h / 2;
      ctx.save();
      ctx.translate(cx, cy);
      // 背光
      const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, this.w * 0.62);
      glow.addColorStop(0, 'rgba(232,184,75,0.18)');
      glow.addColorStop(1, 'rgba(232,184,75,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, this.w * 0.62, 0, TAU);
      ctx.fill();
      this.drawPickaxe(ctx, Math.min(this.w, this.h) / 58);
      ctx.restore();
    }

    drawHudIcon(ctx, cx, cy, size, k) {
      ctx.save();
      ctx.translate(cx, cy);
      this.drawPickaxe(ctx, Math.min(1.35, Math.max(0.65, k * 1.25)));
      ctx.restore();
    }
  }

  Chezzle.Plugin.register('destroyer', {
    components: [{
      type: 'destroyer',
      label: '破坏者',
      color: '#e8b84b',
      defW: 54,
      defH: 54,
      fields: [
        { key: 'key', label: '破坏按键', kind: 'text', def: 'KeyF' },
        { key: 'radius', label: '破坏范围', kind: 'number', def: 180 },
      ],
      construct: (o) => new Destroyer(o),
    }],
    run(scene, api) {
      const onKey = (e) => {
        if (!e || e.repeat) return false;
        const held = scene.player?.inventory?.selectedItem?.();
        if (!held || held.isCarryItem !== 'destroyer') return false;
        if (held._used) return true;
        if (e.code !== held.key) return false;
        const hit = held.shatterNearest(scene);
        // 消耗品：只有真正击碎物块才消失；范围内没有目标时不浪费。
        if (hit) {
          held._used = true;
          held.consumeItself(scene);
        }
        return true;
      };
      const off = api.onKeyDown(onKey);
      return () => { try { off(); } catch (e) { /* ignore */ } };
    },
  });
})();
