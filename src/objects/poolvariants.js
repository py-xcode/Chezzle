// ============================================================================
// 药品池变种：电解池 / 加热池 / 高温池。
// ----------------------------------------------------------------------------
// 继承 Pool（isPool 保持 true：导气管/提取器/放置吸附等仍按普通药品池对待），
// 额外向化学引擎提供一种"环境条件"：
//   Scene.variantPoolFor / conditionsFor 识别 isVariantPool && active(scene)，
//   按 mode 给 electric / heat / highTemp 条件——池自身与浸在池内的物体都获得。
// 开关控制：switchId 留空 = 常开；非空时由该 id 的 Switch/GasDetector 的
//   effectiveOpen(scene) 决定（只在编辑器里绑定；游戏内池子本身不可点击）。
// 渲染：先画普通池（液体/沉淀/化学式标注），再叠加"安装在池沿的专用装置"：
//   池沿金属包边/卡箍 + 三模式统一的大号黄铜铭牌（电解/加热/高温；屏幕最小 13.5px
//   保底、暗铜底+亮刻字+元素小图标）+ 各模式装置（电解：电极/绝缘座/电源盒/电缆；
//   加热/高温：燃烧栅排/火焰舌/热浪，高温只换配色与强度=白蓝银白火焰+冷白炽光+
//   白金栅排）。关闭态装置保留但灰暗、铭牌文字暗但仍可读、无火焰/无炽光；
//   动画全部为确定性 sin 相位，无随机闪烁。
// 电解产气定点（公开接口，Scene._gasPlume 消费）：
//   electrodeLayout()      左右电极几何（左=阴极(−)、右=阳极(+)，含各自水下点）
//   gasOriginPoint(gasId)  H2 → 左阴极；O2/Cl2 → 右阳极；其它气体 null
// ============================================================================

import { Pool } from './pool.js';
import { rr, clearText, screenTextScale, drawFlame } from '../render/theme.js';

// 变种配色（延续项目的暗紫/金"元素"视觉语言）：装置=黄铜/钢，状态=元素色霓虹
const ACCENT = {
  electric: {
    rim: '#6fe4ff', rimOff: '#4a5270',
    metal: '#c99a45', metalDark: '#6f5220', // 黄铜（卡箍/电极箍/接线端子）
    gem: '#7fe0ff', // 电源盒状态宝石
  },
  heat: {
    rim: '#ffb340', rimOff: '#5a4a34',
    metal: '#c99a45', metalDark: '#6f5220', // 黄铜（栅排卡箍/螺栓）
    spark: '#ff9a3d',
  },
  highTemp: {
    rim: '#cfe6ff', rimOff: '#44506a',
    metal: '#c8d2e6', metalDark: '#5f6a84', // 白金/钢色栅排（与加热池一眼区分）
    spark: '#a9ecff',
  },
};

// 池沿黄铜铭牌的刻字（三种池唯一允许的说明性文字，用户明确要求）
const NAME_LABEL = { electric: '电解', heat: '加热', highTemp: '高温' };

/** 十六进制色 + 透明度 → rgba 字符串（视觉层共用） */
function rgbaOf(hex, a) {
  const h = String(hex).replace('#', '');
  const n = h.length === 3
    ? [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)]
    : [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  return `rgba(${n[0]},${n[1]},${n[2]},${a})`;
}

/** 铭牌图标的极小泪滴形火焰路径（以 (x, baseY) 为焰底、h 为焰高；调用方负责 fill） */
function flameGlyph(ctx, x, baseY, h) {
  const w = h * 0.5;
  ctx.beginPath();
  ctx.moveTo(x, baseY - h);
  ctx.quadraticCurveTo(x + w, baseY - h * 0.4, x + w * 0.46, baseY);
  ctx.quadraticCurveTo(x, baseY + h * 0.1, x - w * 0.46, baseY);
  ctx.quadraticCurveTo(x - w, baseY - h * 0.4, x, baseY - h);
  ctx.closePath();
}

export class VariantPool extends Pool {
  constructor({ switchId = '', ...rest } = {}) {
    super(rest);
    this.switchId = String(switchId || ''); // 绑定的开关 id（空 = 常开）
    this.mode = 'none'; // 子类常量：'electric' | 'heat' | 'highTemp'
    // 渲染用的当前条件态：常开池开局即为真；开关控制的池等第一次 update 求值
    this._activeNow = !this.switchId;
  }

  /** 变种池标记（Scene.variantPoolFor 按此识别） */
  get isVariantPool() {
    return true;
  }

  /** 当前是否在提供条件：switchId 空 = 常开；否则读绑定开关的有效开启态 */
  active(scene) {
    if (!this.switchId) return true;
    const sw = scene?.byId?.[this.switchId];
    if (!sw || sw.hidden) return false;
    // 开关/气体探测器/钥匙都实现 effectiveOpen（"&"联锁的有效输出态）；其它可开合对象退化为 open
    if (typeof sw.effectiveOpen === 'function') return !!sw.effectiveOpen(scene);
    return !!sw.open;
  }

  update(dt, scene) {
    super.update(dt, scene); // 池内沉淀颗粒沉降等普通池逻辑
    this._activeNow = this.active(scene);
  }

  // ===========================================================================
  // 电解电极几何 / 产气点位（公开接口；Scene._gasPlume 用 gasOriginPoint 定点冒泡）
  // ===========================================================================

  /** 液体液面 y（与 Pool.render 的液面高度同一公式；无液体时=池底） */
  _waterSurfaceY(r) {
    const sol = this.solution;
    const vol = sol.volume > 0 ? sol.volume : Infinity;
    const lh = r.h * Math.max(0, Math.min(1, sol.totalMass() / vol));
    return r.y + r.h - lh;
  }

  /**
   * 电解池电极几何（公开；Scene 产气定点/测试用）。
   * 左 = 阴极(−)、右 = 阳极(+)。返回 null = 非电解池或池太小放不下装置
   * （与 _renderElectrolysis 的渲染门槛一致）。
   * 返回：{
   *   rodW, rimY, topY, botY, waterY,
   *   left:  { x, top, bottom, polarity:'-', underwater:{x,y} },
   *   right: { x, top, bottom, polarity:'+', underwater:{x,y} },
   * }
   * underwater 为电极上"水面以下、仍在池内"的取气点（随 innerRect/液面自适应）。
   */
  electrodeLayout() {
    if (this.mode !== 'electric') return null; // 只有电解池有电极
    const r = this.innerRect();
    if (r.w < 46 || r.h < 22) return null; // 太小放不下电极（渲染同门槛）
    const rodW = Math.max(4, Math.min(7, r.w * 0.032));
    const inset = Math.max(14, r.w * 0.26);
    const rimY = r.y + 2; // 池沿线（绝缘座所在）
    const topY = rimY - Math.max(12, Math.min(22, r.h * 0.34)); // 电极顶端（池沿以上）
    const botY = r.y + r.h - Math.max(6, r.h * 0.22); // 电极没入水下的底端
    const waterY = this._waterSurfaceY(r);
    const y = this._underwaterY(r, topY, botY, waterY);
    const mk = (x, polarity) => ({
      x,
      top: topY,
      bottom: botY,
      polarity,
      underwater: { x, y },
    });
    return {
      rodW,
      rimY,
      topY,
      botY,
      waterY,
      left: mk(r.x + inset, '-'), // 阴极（−）
      right: mk(r.x + r.w - inset, '+'), // 阳极（+）
    };
  }

  /** 取气点 y：液面下 6~12px（电极中下段）；池太浅/无水时贴池底上方（仍在池内） */
  _underwaterY(r, topY, botY, waterY) {
    const floorY = r.y + r.h - 3; // 池底内缘（水下点的下限）
    const want = waterY + Math.min(12, Math.max(6, (botY - topY) * 0.2));
    return Math.max(topY + 4, Math.min(want, Math.min(floorY, botY + 2)));
  }

  /**
   * 电解产气对应的电极点位（公开；Scene._gasPlume 用它把气泡柱/气泡定到正确电极）：
   *   H2 → 左阴极(−)；O2 / Cl2 → 右阳极(+)；其它气体/null = 不指定（由场景按原逻辑取点）。
   * @returns {{x:number,y:number}|null}
   */
  gasOriginPoint(gasId) {
    const layout = this.electrodeLayout();
    if (!layout) return null;
    // 阴极（左）：H2；阳极（右）：O2 / Cl2
    if (gasId === 'H2') return { ...layout.left.underwater };
    if (gasId === 'O2' || gasId === 'Cl2') return { ...layout.right.underwater };
    return null;
  }

  // ===========================================================================
  // 渲染
  // ===========================================================================

  render(ctx, opts) {
    super.render(ctx, opts); // 普通池外观：液体/沉淀颗粒/化学式标注（先画，保证可见）
    const r = this.innerRect();
    if (r.w <= 0 || r.h <= 0) return;
    const on = this._activeNow;
    const t = opts?.time ?? 0;
    const a = ACCENT[this.mode] ?? ACCENT.electric;
    ctx.save();
    // 池沿金属包边（所有变种共有）→ 卡箍 → 各模式专用装置 → 铭牌（最前，不被装置遮挡）
    this._renderRimBand(ctx, r, on, a);
    this._renderClamps(ctx, r, on, a);
    if (this.mode === 'electric') this._renderElectrolysis(ctx, r, on, a);
    else this._renderHeater(ctx, r, on, a, t, this.mode === 'highTemp');
    this._renderNameplate(ctx, r, on);
    ctx.restore();
  }

  /**
   * 池沿金属包边：深钢槽 + 钢亮面 + 高光细线 + 元素色内缘（开=发光/关=暗灰）。
   * 关闭态装置仍保留（灰暗），只是不发光。
   */
  _renderRimBand(ctx, r, on, a) {
    const bw = Math.max(3, Math.min(6, Math.round(r.w * 0.022))); // 包边厚度
    const x = r.x + bw / 2;
    const y = r.y + bw / 2;
    const w = r.w - bw;
    const h = r.h - bw;
    if (w <= 2 || h <= 2) return;
    ctx.save();
    // 外槽（暗钢）
    ctx.strokeStyle = 'rgba(18,16,40,0.85)';
    ctx.lineWidth = bw + 2.5;
    ctx.strokeRect(x, y, w, h);
    // 钢亮面
    ctx.strokeStyle = 'rgba(74,81,117,0.95)';
    ctx.lineWidth = bw;
    ctx.strokeRect(x, y, w, h);
    // 上缘高光细线
    ctx.strokeStyle = 'rgba(190,200,228,0.28)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - bw / 2 + 1, y - bw / 2 + 0.5);
    ctx.lineTo(x + w + bw / 2 - 1, y - bw / 2 + 0.5);
    ctx.stroke();
    // 元素色内缘（U 形：左/底/右；开=元素色霓虹发光，关=暗灰）
    ctx.strokeStyle = on ? a.rim : a.rimOff;
    ctx.lineWidth = on ? 1.6 : 1;
    if (on) {
      ctx.shadowColor = a.rim;
      ctx.shadowBlur = 9;
    }
    ctx.beginPath();
    ctx.moveTo(x - bw / 2, y + bw / 2);
    ctx.lineTo(x - bw / 2, y + h + bw / 2);
    ctx.lineTo(x + w + bw / 2, y + h + bw / 2);
    ctx.stroke();
    ctx.restore();
  }

  /** 池沿钢制卡箍/挂架（装置底座；关闭态也保留，开态黄铜/白金螺栓发亮） */
  _renderClamps(ctx, r, on, a) {
    const cw = Math.max(7, Math.min(12, r.w * 0.05));
    const ch = Math.max(6, Math.min(10, r.h * 0.16));
    ctx.save();
    for (const cx of [r.x + r.w * 0.14, r.x + r.w * 0.86]) {
      // 座块
      rr(ctx, cx - cw / 2, r.y - ch + 2, cw, ch, 2);
      ctx.fillStyle = on ? '#3f4562' : '#2c3044';
      ctx.fill();
      ctx.strokeStyle = 'rgba(14,12,30,0.8)';
      ctx.lineWidth = 1;
      ctx.stroke();
      // 黄铜/白金螺栓
      ctx.fillStyle = on ? a.metal : '#5a5648';
      ctx.beginPath();
      ctx.arc(cx, r.y - ch / 2 + 1.5, 1.4, 0, Math.PI * 2);
      ctx.fill();
      // 贴池沿的卡脚
      ctx.fillRect(cx - 1.2, r.y - 1, 2.4, Math.max(2, ch * 0.5));
    }
    ctx.restore();
  }

  /**
   * 铭牌布局（渲染与可读性测试共用）：尺寸/位置/字号。
   * 世界尺寸正常关卡尺度约 52~64 × 18~22（随池宽自适应）；窄池缩到约 44×16 起。
   * 位置：电解池架在电极接线帽上方（避开电极/跨接电缆/绝缘座）；加热/高温池骑在
   * 上侧池沿中央（避开两侧卡箍与池底栅排；公式标签在池下方，不会重叠）。
   */
  _nameplateLayout(ctx, r) {
    const text = NAME_LABEL[this.mode];
    if (!text) return null;
    // 世界字号基准 12px，按相机缩放补到屏幕上 ≥13.5px（上限 1.75：极端缩放时牌面不过大）
    const k = screenTextScale(ctx, 12, 13.5, 1.75);
    const fs = 12 * k;
    const textW = fs * text.length;
    const iconW = fs * 0.6;
    const gap = fs * 0.34;
    let w = Math.round(textW + iconW + gap + fs * 0.9 + 8);
    w = Math.max(44, Math.min(96, w)); // 放大：正常尺度 ≥52，窄池下限 44
    w = Math.min(w, Math.max(44, r.w - 4)); // 随池宽自适应（不小于 44）
    const h = Math.max(16, Math.min(34, Math.round(fs + 8)));
    const showIcon = w - textW >= iconW + gap + 12; // 牌面太窄时不画图标，保证文字完整
    const x = r.x + r.w / 2 - w / 2;
    let y;
    const layout = this.mode === 'electric' ? this.electrodeLayout() : null;
    if (layout) {
      // 架在电极接线帽上方（与 _renderElectrolysis 的帽高公式一致）
      const capFs = Math.max(6, Math.min(9, layout.rodW * 1.5));
      const capH = Math.max(5, Math.round(capFs * 0.9));
      y = layout.topY - capH - 3 - h;
    } else {
      y = r.y - h * 0.6; // 骑在上侧池沿
    }
    return { text, w, h, x, y, fs, iconW, gap, showIcon };
  }

  /**
   * 池沿黄铜铭牌（三种池统一）：暗黄铜/深紫底渐变 + 细金边 + 四角铆钉 + 极小元素
   *   图标（电解=闪电 / 加热=火焰 / 高温=双焰）+ 明亮刻字「电解/加热/高温」。
   *   clearText 的细暗描边保证文字与暗牌面高对比；开态亮铜+米白刻字，关态灰暗但
   *   文字用 #cfc6b0 仍可读。字号经 screenTextScale 补足屏幕最小 13.5px（真实关卡
   *   尺度可读，避免"黑牌糊字"）。最后绘制（不被装置遮挡）。
   */
  _renderNameplate(ctx, r, on) {
    const L = this._nameplateLayout(ctx, r);
    if (!L) return;
    const { text, w, h, x, y, fs, iconW, gap, showIcon } = L;
    ctx.save();
    // 投影（让铭牌从池沿/装置上"浮"出来）
    rr(ctx, x + 1, y + 2, w, h, 3);
    ctx.fillStyle = 'rgba(6,4,12,0.55)';
    ctx.fill();
    // 牌面：暗黄铜/深紫底渐变（开=暖铜，关=灰暗铜）——保持深底，衬托亮刻字
    rr(ctx, x, y, w, h, 3);
    const g = ctx.createLinearGradient(x, y, x, y + h);
    if (on) {
      g.addColorStop(0, '#4a3418');
      g.addColorStop(0.45, '#33230f');
      g.addColorStop(1, '#20150a');
    } else {
      g.addColorStop(0, '#3b352b');
      g.addColorStop(1, '#252220');
    }
    ctx.fillStyle = g;
    ctx.fill();
    // 细金边（开=亮金微光；关=暗金）
    ctx.strokeStyle = on ? '#ffd76a' : '#8a7a5a';
    ctx.lineWidth = 1.4;
    if (on) {
      ctx.shadowColor = '#ffb340';
      ctx.shadowBlur = 5;
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
    // 内圈凹刻线
    rr(ctx, x + 2, y + 2, w - 4, h - 4, 2);
    ctx.strokeStyle = on ? 'rgba(255,220,150,0.22)' : 'rgba(150,140,120,0.18)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    // 四角铆钉（亮金/灰色）
    const rv = Math.max(1.1, h * 0.07);
    const inset = Math.max(3.5, h * 0.16);
    for (const [rx, ry] of [
      [x + inset, y + inset], [x + w - inset, y + inset],
      [x + inset, y + h - inset], [x + w - inset, y + h - inset],
    ]) {
      ctx.fillStyle = on ? '#ffe08a' : '#90886f';
      ctx.beginPath();
      ctx.arc(rx, ry, rv, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(30,18,6,0.7)';
      ctx.beginPath();
      ctx.arc(rx, ry, rv * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
    // 内容区（左右避开铆钉列）
    const padIn = Math.max(7, h * 0.34);
    const contentL = x + padIn;
    const contentR = x + w - padIn;
    // 元素图标（极小；牌面太窄时省略）
    if (showIcon) {
      this._renderNameIcon(ctx, contentL + iconW / 2, y + h / 2 + h * 0.02, h * 0.5, on);
    }
    // 明亮刻字（clearText 细暗描边；开态米白/金，关态 #cfc6b0 仍可读）
    const textCX = showIcon
      ? contentL + iconW + gap + (contentR - (contentL + iconW + gap)) / 2
      : (contentL + contentR) / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    clearText(ctx, text, textCX, y + h * 0.54, on ? '#fff2cc' : '#cfc6b0', `bold ${Math.round(fs * 10) / 10}px monospace`);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  /** 铭牌上的极小元素图标：闪电（电解）/ 火焰（加热）/ 双焰（高温） */
  _renderNameIcon(ctx, cx, cy, h, on) {
    ctx.save();
    if (this.mode === 'electric') {
      // 闪电
      ctx.fillStyle = on ? '#ffe9a8' : '#cfc6b0';
      ctx.beginPath();
      ctx.moveTo(cx + h * 0.06, cy - h * 0.48);
      ctx.lineTo(cx + h * 0.36, cy - h * 0.48);
      ctx.lineTo(cx + h * 0.04, cy - h * 0.04);
      ctx.lineTo(cx + h * 0.3, cy - h * 0.04);
      ctx.lineTo(cx - h * 0.34, cy + h * 0.52);
      ctx.lineTo(cx - h * 0.04, cy + h * 0.02);
      ctx.lineTo(cx - h * 0.32, cy + h * 0.02);
      ctx.closePath();
      ctx.fill();
    } else if (this.mode === 'highTemp') {
      // 双焰：后一簇冷色小焰 + 前一簇亮白焰（"高温"一眼区分）
      ctx.fillStyle = on ? '#7fd8ff' : '#a89f8a';
      flameGlyph(ctx, cx + h * 0.24, cy + h * 0.34, h * 0.62);
      ctx.fill();
      ctx.fillStyle = on ? '#eafcff' : '#cfc6b0';
      flameGlyph(ctx, cx, cy + h * 0.46, h * 0.9);
      ctx.fill();
    } else {
      // 单焰（加热）
      ctx.fillStyle = on ? '#ffe9a8' : '#cfc6b0';
      flameGlyph(ctx, cx, cy + h * 0.46, h * 0.9);
      ctx.fill();
    }
    ctx.restore();
  }

  /**
   * 电解池：黄铜/石墨电极（陶瓷绝缘座 + 金夹箍 + 顶部接线端子 + −/+ 阴刻极标）+
   *   跨接铜排 + 池沿电源盒（青宝石状态灯）。无水下电弧/气泡（真实气泡由 Scene 按
   *   gasOriginPoint 从对应电极位置冒出）。关闭态：电极冷灰、宝石暗灰。
   */
  _renderElectrolysis(ctx, r, on, a) {
    const layout = this.electrodeLayout();
    if (!layout) return; // 太小放不下装置：只留池沿包边/卡箍/铭牌
    const { rodW, rimY, topY, botY, left, right } = layout;
    const x1 = left.x;
    const x2 = right.x;
    // ---- 池沿电源盒（左） ----
    const boxW = Math.max(18, Math.min(26, r.w * 0.2));
    const boxH = Math.max(12, Math.min(17, r.h * 0.3));
    const bx = r.x + 4;
    const by = rimY - boxH - 2;
    rr(ctx, bx, by, boxW, boxH, 2.5);
    const bg = ctx.createLinearGradient(bx, by, bx, by + boxH);
    bg.addColorStop(0, '#2a2350');
    bg.addColorStop(1, '#141029');
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.strokeStyle = on ? rgbaOf(a.metal, 0.75) : 'rgba(120,128,152,0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // 面板刻线
    ctx.strokeStyle = 'rgba(190,200,228,0.18)';
    ctx.beginPath();
    ctx.moveTo(bx + 3, by + boxH * 0.5);
    ctx.lineTo(bx + boxW * 0.52, by + boxH * 0.5);
    ctx.stroke();
    // 状态宝石（开=青宝石发光；关=暗灰）
    const gemX = bx + boxW * 0.74;
    const gemY = by + boxH * 0.5;
    const gemR = Math.max(2, boxH * 0.2);
    ctx.beginPath();
    ctx.arc(gemX, gemY, gemR, 0, Math.PI * 2);
    if (on) {
      ctx.fillStyle = a.gem;
      ctx.shadowColor = a.gem;
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath();
      ctx.arc(gemX - gemR * 0.3, gemY - gemR * 0.3, gemR * 0.38, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = '#3f4560';
      ctx.fill();
      ctx.strokeStyle = 'rgba(140,148,172,0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    // 电源盒 → 左电极的短电缆
    ctx.strokeStyle = '#241f38';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(bx + boxW, by + boxH * 0.5);
    ctx.quadraticCurveTo((bx + boxW + x1) / 2, by - 2, x1, topY + 3);
    ctx.stroke();
    ctx.lineCap = 'butt';
    // ---- 两根电极：陶瓷绝缘座 + 石墨棒 + 金夹箍 + 顶部金属帽（− / + 阴刻） ----
    const capFs = Math.max(6, Math.min(9, rodW * 1.5));
    const capH = Math.max(5, Math.round(capFs * 0.9));
    for (const [ex, polarity] of [[x1, left.polarity], [x2, right.polarity]]) {
      // 陶瓷绝缘座（池沿上）
      rr(ctx, ex - 6, rimY - 5, 12, 7, 2);
      ctx.fillStyle = on ? '#ded6c4' : '#b7b2a6';
      ctx.fill();
      ctx.strokeStyle = 'rgba(60,52,40,0.7)';
      ctx.lineWidth = 1;
      ctx.stroke();
      // 石墨电极棒（深色 + 冷色反光；关=更暗）
      const g = ctx.createLinearGradient(ex - rodW / 2, 0, ex + rodW / 2, 0);
      g.addColorStop(0, on ? '#2b3140' : '#23262e');
      g.addColorStop(0.45, on ? '#4a5468' : '#33373f');
      g.addColorStop(1, on ? '#20242f' : '#1c1e24');
      ctx.fillStyle = g;
      ctx.fillRect(ex - rodW / 2, topY, rodW, botY - topY);
      // 电极侧沿冷色反光（通电时轮廓更清楚；无辉光）
      ctx.fillStyle = on ? 'rgba(190,205,225,0.45)' : 'rgba(130,138,150,0.22)';
      ctx.fillRect(ex - rodW / 2 + 0.4, topY, 1.1, botY - topY);
      // 金夹箍（绝缘座下方的黄铜箍）
      ctx.fillStyle = on ? a.metal : '#6b6250';
      ctx.fillRect(ex - rodW / 2 - 1, rimY - 1, rodW + 2, 3);
      // 顶部金属帽（黄铜；极小的 − / + 阴刻标记：左=阴极、右=阳极）
      rr(ctx, ex - rodW * 1.3, topY - capH, rodW * 2.6, capH, 1.5);
      ctx.fillStyle = on ? a.metal : '#4c4a44';
      ctx.fill();
      ctx.strokeStyle = 'rgba(40,28,10,0.65)';
      ctx.lineWidth = 1;
      ctx.stroke();
      if (on) {
        ctx.fillStyle = 'rgba(255,232,160,0.5)';
        ctx.fillRect(ex - rodW * 0.9, topY - capH + 1, rodW * 1.8, 0.9);
      }
      // 阴刻极性符号（− / +）：深色小笔画（十字 = +，横杠 = −）
      const symColor = on ? 'rgba(38,24,8,0.9)' : 'rgba(34,32,26,0.8)';
      const arm = Math.max(2.4, capFs * 0.5);
      const th = Math.max(1, Math.round(capFs * 0.16));
      const sy = topY - capH / 2;
      ctx.fillStyle = symColor;
      ctx.fillRect(ex - arm / 2, sy - th / 2, arm, th); // 横杠（两种极性共有）
      if (polarity === '+') ctx.fillRect(ex - th / 2, sy - arm / 2, th, arm); // 竖杠 → +
    }
    // ---- 跨接铜排（两电极顶端之间的暗色电缆，略微下垂） ----
    ctx.strokeStyle = '#241f38';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, topY - 2);
    ctx.quadraticCurveTo((x1 + x2) / 2, topY + 5, x2, topY - 2);
    ctx.stroke();
    ctx.strokeStyle = on ? 'rgba(200,140,60,0.5)' : 'rgba(120,100,70,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x1 + 4, topY - 0.5);
    ctx.quadraticCurveTo((x1 + x2) / 2, topY + 5.5, x2 - 4, topY - 0.5);
    ctx.stroke();
    ctx.lineCap = 'butt';
  }

  /**
   * 加热池（intense=false）/ 高温池（intense=true）：**同一套结构**——
   *   池底金属燃烧栅排（栅缝透光）+ 栅缝上方火焰舌 + 池底向上的热辉光 + 热浪线。
   *   高温池只换配色与强度：白金/钢色栅排、白蓝/银白火焰、冷白炽光、更高更密的热浪；
   *   不再有独立的"厚钢箍 + 炉膛钢芯"造型。关闭态=冷灰装置、无火焰/无炽光。
   */
  _renderHeater(ctx, r, on, a, t, intense) {
    if (r.w < 40 || r.h < 18) return;
    const barH = Math.max(5, Math.min(9, r.h * 0.12)); // 燃烧排高度
    const barX = r.x + 3;
    const barW = r.w - 6;
    const barY = r.y + r.h - barH - 1; // 池底
    // ---- 池底燃烧栅排（黄铜 / 白金栅条 + 栅缝） ----
    rr(ctx, barX, barY, barW, barH, 2);
    const mg = ctx.createLinearGradient(barX, barY, barX, barY + barH);
    if (intense) {
      mg.addColorStop(0, on ? '#79839c' : '#343a4c');
      mg.addColorStop(1, on ? '#3c4356' : '#1e2130');
    } else {
      mg.addColorStop(0, on ? '#6a5a3c' : '#3c3a34');
      mg.addColorStop(1, on ? '#3a2f1e' : '#232220');
    }
    ctx.fillStyle = mg;
    ctx.fill();
    ctx.strokeStyle = on ? rgbaOf(a.metal, 0.8) : 'rgba(90,96,116,0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // 栅缝（开=透出火焰/炽光；关=暗缝）。垂直渐变对所有栅缝相同：只建一次复用
    const slots = Math.max(2, Math.floor(barW / 14));
    const slotGrad = on ? ctx.createLinearGradient(barX, barY, barX, barY + barH) : null;
    if (slotGrad) {
      slotGrad.addColorStop(0, intense ? 'rgba(246,253,255,0.95)' : 'rgba(255,220,140,0.95)');
      slotGrad.addColorStop(1, intense ? 'rgba(127,216,255,0.62)' : 'rgba(255,130,40,0.6)');
    }
    for (let i = 0; i < slots; i++) {
      const sx = barX + 4 + i * ((barW - 8) / slots);
      const sw = Math.max(2, ((barW - 8) / slots) * 0.45);
      if (slotGrad) {
        ctx.fillStyle = slotGrad;
        ctx.shadowColor = intense ? '#cfe6ff' : a.spark;
        ctx.shadowBlur = intense ? 11 : 7;
      } else {
        ctx.fillStyle = 'rgba(14,16,26,0.8)';
      }
      ctx.fillRect(sx, barY + 1.5, sw, barH - 3);
      ctx.shadowBlur = 0;
    }
    // 两端金属卡箍（黄铜 / 白金）
    for (const cx of [barX + 2, barX + barW - 2]) {
      ctx.fillStyle = on ? a.metal : '#5a5648';
      ctx.fillRect(cx - 2, barY - 1, 4, barH + 2);
    }
    if (!on) return; // 关闭态：装置保留但灰暗，无火焰/无炽光
    // ---- 开：池底向上的热辉光（加热=暖橙；高温=冷白炽光） ----
    const glow = ctx.createLinearGradient(r.x, r.y + r.h, r.x, r.y);
    if (intense) {
      glow.addColorStop(0, 'rgba(246,253,255,0.92)');
      glow.addColorStop(0.32, 'rgba(170,224,255,0.50)');
      glow.addColorStop(1, 'rgba(0,0,0,0)');
    } else {
      glow.addColorStop(0, 'rgba(255,150,55,0.42)');
      glow.addColorStop(0.35, 'rgba(255,110,35,0.18)');
      glow.addColorStop(1, 'rgba(0,0,0,0)');
    }
    ctx.fillStyle = glow;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    // ---- 栅缝上方的火焰舌（确定性摆动；高温更密更高、白蓝银白焰） ----
    const n = intense
      ? Math.max(3, Math.min(7, Math.floor(r.w / 34)))
      : Math.max(2, Math.min(6, Math.floor(r.w / 42)));
    for (let i = 0; i < n; i++) {
      const fx = r.x + ((i + 0.5) * r.w) / n;
      const fh = (intense ? 27 : 22) * (0.7 + 0.3 * Math.sin(t * (intense ? 10.5 : 9) + i * 1.7));
      ctx.save();
      ctx.globalAlpha = intense ? 0.95 : 0.9;
      drawFlame(ctx, fx, barY + 2, Math.max(8, fh), intense ? '#7fd8ff' : '#ff7a2d', intense ? '#eafcff' : '#ffe9a8', t + i * 1.3);
      ctx.restore();
    }
    // ---- 热浪线（确定性 sin；高温更密更强，但保持半透明不糊） ----
    const waves = intense ? Math.max(4, Math.floor(r.w / 26)) : Math.max(2, Math.min(5, Math.floor(r.w / 52)));
    ctx.strokeStyle = intense ? 'rgba(238,252,255,0.55)' : 'rgba(255,200,130,0.38)';
    ctx.lineWidth = intense ? 1.3 : 1.1;
    ctx.shadowColor = intense ? '#cfe6ff' : a.spark;
    ctx.shadowBlur = intense ? 11 : 6;
    for (let i = 0; i < waves; i++) {
      const x0 = r.x + ((i + 0.5) * r.w) / waves;
      const ph = t * (intense ? 2.2 : 1.5) + i * 0.9;
      ctx.globalAlpha = 0.22 + 0.16 * Math.sin(ph * 1.6 + i);
      ctx.beginPath();
      for (let k = 0; k <= 6; k++) {
        const yy = r.y + r.h - 3 - (k / 6) * (r.h * 0.85);
        const xx = x0 + Math.sin(ph + k * 0.85 + i * 1.3) * (intense ? 6 : 4);
        if (k === 0) ctx.moveTo(xx, yy);
        else ctx.lineTo(xx, yy);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }
}

/** 电解池：池内反应获得 electric 条件（常开或由 switchId 指向的开关控制） */
export class ElectrolysisPool extends VariantPool {
  get hoverLabel() {
    return '电解池';
  }

  constructor(opts = {}) {
    super(opts);
    this.mode = 'electric';
  }
}

/** 加热池：池内反应获得 heat 条件（常开或由 switchId 指向的开关控制） */
export class HeatingPool extends VariantPool {
  get hoverLabel() {
    return '加热池';
  }

  constructor(opts = {}) {
    super(opts);
    this.mode = 'heat';
  }
}

/** 高温池：池内反应获得 highTemp 条件（常开或由 switchId 指向的开关控制） */
export class HighTempPool extends VariantPool {
  get hoverLabel() {
    return '高温池';
  }

  constructor(opts = {}) {
    super(opts);
    this.mode = 'highTemp';
  }
}
