// ============================================================================
// 官方示例插件：蹦床（trampoline）—— 组件插件
// ----------------------------------------------------------------------------
// 向编辑器注册新的可放置物体「蹦床」：拖入画布、可缩放、属性面板可调弹跳倍率/垫色；
// 玩家落到垫子上会被高高弹起（倍率可调）。引擎侧实现 = 继承 Chezzle.Obj 的静态物。
// 展示的能力：组件注册（components）、construct、自定义 render、simple 引擎逻辑
// （update 里检测玩家落垫 → 反弹）。字段类型：number + color。
// ============================================================================

// @@chezzle-plugin
// {
//   "name": "蹦床组件",
//   "version": "1.0",
//   "api": 1,
//   "description": "注册「蹦床」组件：落上去会被弹起（弹跳倍率/垫色在属性面板调整）",
//   "components": [
//     {
//       "type": "trampoline",
//       "label": "蹦床",
//       "color": "#ff5a4a",
//       "defW": 80,
//       "defH": 20,
//       "fields": [
//         { "key": "bounce", "label": "弹跳倍率", "kind": "number", "def": 1.7 },
//         { "key": "pad", "label": "垫子色", "kind": "color", "def": "#ff5a4a" }
//       ]
//     }
//   ]
// }
// @@end

(function () {
  class Trampoline extends Chezzle.Obj {
    constructor(o = {}) {
      super({
        x: o.x ?? 0,
        y: o.y ?? 0,
        w: o.w ?? 80,
        h: o.h ?? 20,
        mass: 0,
        solid: true,
        pushable: false,
        physicsKind: 'static',
        id: o.id ?? '',
        hidden: !!o.hidden,
      });
      this.typeName = 'Trampoline';
      this.bounce = Number(o.bounce) || 1.7;
      this.pad = o.pad ?? '#ff5a4a';
      this._cd = 0; // 触发冷却（防同帧重复）
    }

    // 物理前检测（update）：玩家仍持有下落/起跳速度。
    // 规则：① 快速坠落（高处摔下，≈0.4s 自由落体速度）→ 大弹；
    //       ② 在垫上按跳（jump）→ 蹦床弹跳（高于普通跳）；
    //       ③ 正常走上来/停在上面 → 不弹（只有跳与摔才有"弹"）。
    update(dt, scene) {
      this._cd = Math.max(0, (this._cd ?? 0) - dt);
      if (this._cd > 0) return;
      const p = scene.player;
      if (!p) return;
      const onPad = p.x + p.w > this.x && p.x < this.x + this.w &&
        p.bottom >= this.y - 18 && p.bottom <= this.y + 10; // 早 18px 预判接触（物理前）
      if (!onPad) return;
      const jumpVel = Chezzle.CFG.player.jumpVel;
      const v = jumpVel * this.bounce;
      // ① 快速坠落 → 大弹
      if (p.vel.y > 150) {
        p.vel.y = -v;
        this._cd = 0.3;
        this.sparks(scene);
        return;
      }
      // ② 在垫上起跳（长按 jump，且未在下落）→ 换成蹦床弹速
      if (scene.control.has('jump') && p.vel.y <= 0) {
        p.vel.y = -v;
        this._cd = 0.3;
        this.sparks(scene);
      }
    }

    sparks(scene) {
      for (let i = 0; i < 5; i++) {
        scene.addObject(new Chezzle.Spark({
          x: this.x + Math.random() * this.w,
          y: this.y,
          vx: (Math.random() - 0.5) * 120,
          vy: -60 - Math.random() * 130,
          life: 0.5,
          color: this.pad,
        }));
      }
    }

    render(ctx) {
      const { x, y, w, h } = this;
      ctx.save();
      // 四根小腿 + 横梁
      ctx.strokeStyle = '#3c4058';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x + 8, y + h); ctx.lineTo(x + 8, y + h + 6);
      ctx.moveTo(x + w - 8, y + h); ctx.lineTo(x + w - 8, y + h + 6);
      ctx.moveTo(x + 8, y + h + 6); ctx.lineTo(x + w - 8, y + h + 6);
      ctx.stroke();
      // 垫子（圆角厚垫 + 高光 + 弹性弧度）
      const sag = 3; // 轻"受压"弧度（静态装饰）
      ctx.fillStyle = this.pad;
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x + 1, y + h - sag);
      ctx.quadraticCurveTo(x + w / 2, y + h - sag - 5, x + w - 1, y + h - sag);
      ctx.lineTo(x + w - 1, y + 3);
      ctx.quadraticCurveTo(x + w / 2, y - 3, x + 1, y + 3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // 顶部高光
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.moveTo(x + 3, y + 3);
      ctx.quadraticCurveTo(x + w / 2, y - 3 + 3, x + w - 3, y + 3);
      ctx.lineTo(x + w - 3, y + 6);
      ctx.quadraticCurveTo(x + w / 2, y + 4, x + 3, y + 6);
      ctx.closePath();
      ctx.fill();
      // 侧边"弹力感"小圆点
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath();
      ctx.arc(x + w / 2 - 9, y + h / 2 + 3, 2, 0, Math.PI * 2);
      ctx.arc(x + w / 2 + 9, y + h / 2 + 3, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  Chezzle.Plugin.register('trampoline', {
    components: [{
      type: 'trampoline',
      label: '蹦床',
      color: '#ff5a4a',
      defW: 80,
      defH: 20,
      fields: [
        { key: 'bounce', label: '弹跳倍率', kind: 'number', def: 1.7 },
        { key: 'pad', label: '垫子色', kind: 'color', def: '#ff5a4a' },
      ],
      construct: (o) => new Trampoline(o),
    }],
  });
})();
