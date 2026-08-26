// ============================================================================
// 官方示例插件：显示牌（liveSign）—— v2 组件插件
// ----------------------------------------------------------------------------
// 功能：向编辑器注册一种新的可放置物体「显示牌」：可拖入画布、可缩放、可在属性
// 面板编辑文字；导出/试玩时由插件 construct 生成真实对象（继承 Chezzle.Obj）。
//
// 展示的能力：组件注册（components）、构造器继承引擎对象基类、自定义 render。
// 组件字段支持编辑器的全部输入类型：text/multiline/number/bool/select/color/
// substance/solutes/idref/rx —— 本示例用 text（多行）+ color 各一个。
// ============================================================================

// @@chezzle-plugin
// {
//   "name": "显示牌组件",
//   "version": "1.0",
//   "api": 1,
//   "description": "注册「显示牌」组件：摆一块可编辑文字的牌子（试试右上角的提示按钮和悬停溯源）",
//   "components": [
//     {
//       "type": "liveSign",
//       "label": "显示牌",
//       "color": "#8fe8a0",
//       "defW": 140,
//       "defH": 40,
//       "fields": [
//         { "key": "text", "label": "文字", "kind": "text", "def": "这里是显示牌", "multiline": true },
//         { "key": "border", "label": "边框色", "kind": "color", "def": "#8fe8a0" }
//       ]
//     }
//   ]
// }
// @@end

(function () {
  class LiveSign extends Chezzle.Obj {
    constructor(o = {}) {
      super({
        x: o.x ?? 0,
        y: o.y ?? 0,
        w: o.w ?? 140,
        h: o.h ?? 40,
        mass: 0,
        solid: false,          // 不挡人
        physicsKind: 'none',   // 区域物：不参与物理，只挂场景逻辑
        id: o.id ?? '',
        hidden: !!o.hidden,
      });
      this.typeName = 'LiveSign';
      this.text = o.text ?? '这里是显示牌';
      this.border = o.border ?? '#8fe8a0';
    }

    render(ctx, scene) {
      ctx.save();
      ctx.fillStyle = 'rgba(20,40,30,0.85)';
      ctx.strokeStyle = this.border;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(this.x, this.y, this.w, this.h, 5) : ctx.rect(this.x, this.y, this.w, this.h);
      ctx.fill();
      ctx.stroke();
      // 文字居中（自动换行简化：按宽度切行）
      ctx.fillStyle = '#d8ffe8';
      ctx.font = `${Math.max(10, Math.min(16, this.h / 3))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const lines = [];
      let cur = '';
      for (const ch of this.text ?? '') {
        if (ctx.measureText(cur + ch).width > this.w - 10 && cur) { lines.push(cur); cur = ch; }
        else cur += ch;
      }
      if (cur) lines.push(cur);
      const lh = 14;
      const y0 = this.y + this.h / 2 - (lines.length - 1) * lh / 2;
      lines.forEach((l, i) => ctx.fillText(l, this.x + this.w / 2, y0 + i * lh));
      ctx.restore();
    }
  }

  Chezzle.Plugin.register('liveSign', {
    components: [{
      type: 'liveSign',
      label: '显示牌',
      color: '#8fe8a0',
      defW: 140,
      defH: 40,
      fields: [
        { key: 'text', label: '文字', kind: 'text', def: '这里是显示牌', multiline: true },
        { key: 'border', label: '边框色', kind: 'color', def: '#8fe8a0' },
      ],
      construct: (o) => new LiveSign(o),
    }],
  });
})();
