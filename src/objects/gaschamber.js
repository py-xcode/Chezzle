// ============================================================================
// 气室（GasChamber）：无碰撞的独立大气区域。
// ----------------------------------------------------------------------------
// - 不参与物理：solid=false、physicsKind='none'——不进 statics/dynamics 索引，
//   不挡玩家/物块，也没有碰撞箱（与导气管的罩子同一套"纯逻辑区域"约定）。
// - 独立大气：内部持有自己的一份 Atmosphere，与场景外部大气互不影响。
//   · 未配置 gases（null / 空对象）→ seed 时复制关卡外部大气（气体组成 + _baseTotal），
//     即"气室默认就是关卡大气"；
//   · 配置了 gases → 走 Atmosphere.preset 的**独占语义**（先清空再按配置设置：
//     写了的=配置值，没写的=没有；空表才会保持默认，这里已由上面的分支拦掉）。
// - 内部判定按**矩形重叠**（用户定案）：与气室矩形有任何重叠就算在气室内，
//   不要求中心/整体进入。
// - 视觉：密闭玻璃培养舱——深钢机械外框 + 细金内缘 + 四角黄铜加固件/铆钉 +
//   暗紫玻璃腔体（腔内按主成分气体色的淡雾/漂移气团）+ 底座裙边法兰 +
//   顶部小黄铜通气帽 + 右上角无文字小压力表；无 scene（编辑器预览）时照常画。
// - 气室进出气/内部反应路由由 Scene 集成负责（Scene.gasChambers），本文件只提供
//   数据与视觉；气室内"反应产生的气体"另记在 _reactGas（气体探测器用，同场景 _reactGas）。
// ============================================================================

import { Obj } from './obj.js';
import { Atmosphere } from '../chem/atmosphere.js';
import { getSubstance } from '../chem/substances.js';
import { THEME, rr } from '../render/theme.js';
import { hexToRgb } from '../render/color.js';

const DEFAULT_GAS_COLOR = '#78dcff'; // 主成分气体未声明 gasColor 时的缺省色（青灰，同集气瓶）
const NEUTRAL_HAZE = '#9aa3c8'; // 无色气体（N2/O2/CO2…）/常压：腔内中性灰紫雾（提亮过，读得出玻璃腔）

export class GasChamber extends Obj {
  get hoverLabel() {
    return '气室';
  }

  get isGasChamber() {
    return true;
  }

  constructor({ x = 0, y = 0, w = 160, h = 120, gases = null, id = '', ...rest } = {}) {
    super({ x, y, w, h, solid: false, physicsKind: 'none', id, ...rest });
    this.atmosphere = new Atmosphere(); // 气室内部大气（独立于 scene.atmosphere）
    this._initialGases = gases; // { 气体id: 质量g }；null/空对象 = 不配置 → 复制外部大气
    this._seeded = false; // 幂等初始化标记（Scene 首刻前 seed；update 里补一次）
    this._reactGas = {}; // 气室内反应产气累积：gasId → 质量g（同 scene._reactGas）
  }

  /**
   * 初始化内部大气（幂等，由 Scene 在首次 step 前后调用；update 里也会补一次）。
   *  - 配置过 gases → Atmosphere.preset 独占语义（先清空再按配置设置）；
   *  - 否则复制场景外部大气：气体组成 entries + _baseTotal（默认与关卡大气一致）。
   */
  seed(scene) {
    if (this._seeded) return;
    const gases = this._initialGases;
    if (gases && Object.keys(gases).length > 0) {
      this.atmosphere.preset(gases); // 独占：没写的气体 = 没有，写 0 的 = 0g
    } else {
      const src = scene.atmosphere;
      this.atmosphere.gas.clear();
      for (const [id, mass] of src.gas) this.atmosphere.gas.set(id, mass);
      this.atmosphere._baseTotal = src._baseTotal;
    }
    this._seeded = true;
  }

  update(dt, scene) {
    // 幂等 seed：Scene 集成会在首刻前显式调用；没接上时这里补一次（已 seed 过的不会重复制）
    if (!this._seeded) this.seed(scene);
  }

  /** 点是否在气室内（含边界） */
  containsPoint(x, y) {
    return x >= this.x && x <= this.x + this.w && y >= this.y && y <= this.y + this.h;
  }

  /** 矩形是否与气室相交（有重叠即算；仅边贴边不算） */
  overlapsRect(r) {
    return r.x < this.x + this.w && r.x + r.w > this.x && r.y < this.y + this.h && r.y + r.h > this.y;
  }

  /** 物体是否与气室重叠（部分重叠即视为在气室内——用户定案） */
  containsObj(obj) {
    return obj.right > this.x && obj.left < this.x + this.w && obj.bottom > this.y && obj.top < this.y + this.h;
  }

  /** 内部当前质量最大的气体（主成分）：[id, mass] 或 null（空腔） */
  dominantGas() {
    let best = null;
    for (const [id, mass] of this.atmosphere.gas) {
      if (!(mass > 1e-9)) continue;
      if (!best || mass > best[1]) best = [id, mass];
    }
    return best;
  }

  /** 主成分气体色（内部淡填充用；气体未声明 gasColor → 青灰） */
  gasColor() {
    const d = this.dominantGas();
    return (d && getSubstance(d[0])?.gasColor) || DEFAULT_GAS_COLOR;
  }

  // ---------------------------------------------------------------------------
  // 渲染：密闭玻璃培养舱
  //   深钢机械外框（细金内缘/倒角高光）+ 暗紫玻璃腔体 + 主成分气体淡雾/漂移气团 +
  //   四角黄铜加固件与铆钉 + 底座裙边法兰 + 顶部黄铜通气帽 + 右上角无文字小压力表。
  //   动画只用确定性 sin 相位（缓慢呼吸/飘移），无随机闪烁；不画任何文字。
  // ---------------------------------------------------------------------------
  render(ctx, opts = {}) {
    const time = opts?.time ?? 0;
    const x = this.x;
    const y = this.y;
    const w = this.w;
    const h = this.h;
    if (!(w > 0 && h > 0)) return;
    const dom = this.dominantGas();
    const declared = dom ? getSubstance(dom[0])?.gasColor : null; // 只有声明了颜色的气体才染色
    const haze = declared ?? NEUTRAL_HAZE; // 无色气体/常压 → 中性灰紫
    const colored = !!declared;
    const breathe = 0.5 + 0.5 * Math.sin(time * 0.9); // 0..1 缓慢呼吸（确定性）
    const small = w < 64 || h < 48; // 太小只保留最简外观
    const frame = Math.max(3.5, Math.min(9, Math.min(w, h) * 0.055)); // 机械框厚度
    const cornerR = Math.max(4, Math.min(10, Math.min(w, h) * 0.07));
    const ix = x + frame;
    const iy = y + frame;
    const iw = w - frame * 2;
    const ih = h - frame * 2;

    ctx.save();
    const cavR = Math.max(2, cornerR - 2);
    const hasCavity = iw > 4 && ih > 4;
    // ---- 顶部黄铜通气帽（先画：短柱被外框压住，只露出帽头） ----
    if (!small && iw > 36) this._renderVentCaps(ctx, x, y, w, frame);

    // ---- 1) 玻璃腔体：全部半透明（先画，腔内物体照样看得见，只是隔一层暗紫玻璃）----
    if (hasCavity) {
      const glass = ctx.createLinearGradient(ix, iy, ix, iy + ih);
      glass.addColorStop(0, 'rgba(92,78,156,0.40)');
      glass.addColorStop(0.5, 'rgba(52,42,100,0.36)');
      glass.addColorStop(1, 'rgba(26,20,58,0.48)');
      rr(ctx, ix, iy, iw, ih, cavR);
      ctx.fillStyle = glass;
      ctx.fill();
      // ---- 顶部顶光（自上而下的柔光渐变：玻璃腔的受光感）----
      const topLight = ctx.createLinearGradient(ix, iy, ix, iy + ih * 0.6);
      topLight.addColorStop(0, 'rgba(198,188,255,0.12)');
      topLight.addColorStop(1, 'rgba(198,188,255,0)');
      rr(ctx, ix, iy, iw, ih, cavR);
      ctx.fillStyle = topLight;
      ctx.fill();
      // ---- 腔口内阴影：只沿内缘压一圈（不整面压暗内部，保证腔内物体可见）----
      ctx.save();
      ctx.strokeStyle = 'rgba(8,6,24,0.55)';
      ctx.lineWidth = Math.max(2.5, frame * 0.55);
      rr(ctx, ix, iy, iw, ih, cavR);
      ctx.stroke();
      ctx.restore();

      // ---- 腔内气体雾（裁剪在玻璃腔内）----
      ctx.save();
      rr(ctx, ix, iy, iw, ih, cavR);
      ctx.clip();
      const baseA = colored ? 0.18 : 0.095; // 有色气体更明显；常压=可辨认的灰紫玻璃腔
      const body = ctx.createLinearGradient(ix, iy, ix, iy + ih);
      body.addColorStop(0, rgbaOf(haze, baseA * 0.32));
      body.addColorStop(0.5, rgbaOf(haze, baseA * (0.62 + 0.12 * breathe)));
      body.addColorStop(1, rgbaOf(haze, baseA * 1.35)); // 气体沉在腔底更浓
      ctx.fillStyle = body;
      ctx.fillRect(ix, iy, iw, ih);
      // 两缕缓慢漂移的气团（确定性 sin，纯视觉）
      const minSide = Math.min(iw, ih);
      for (let i = 0; i < 2; i++) {
        const px = ix + iw * (0.3 + i * 0.4 + 0.09 * Math.sin(time * 0.33 + i * 2.1));
        const py = iy + ih * (0.36 + 0.26 * Math.sin(time * 0.19 + i * 1.7));
        const pr = Math.max(8, minSide * (0.26 + i * 0.07));
        const hazeG = ctx.createRadialGradient(px, py, 1, px, py, pr);
        hazeG.addColorStop(0, rgbaOf(haze, colored ? 0.11 : 0.07));
        hazeG.addColorStop(1, rgbaOf(haze, 0));
        ctx.fillStyle = hazeG;
        ctx.fillRect(px - pr, py - pr, pr * 2, pr * 2);
      }
      // 底部内阴影（玻璃厚度感）
      const shade = ctx.createLinearGradient(ix, iy + ih * 0.7, ix, iy + ih);
      shade.addColorStop(0, 'rgba(0,0,0,0)');
      shade.addColorStop(1, 'rgba(0,0,0,0.30)');
      ctx.fillStyle = shade;
      ctx.fillRect(ix, iy + ih * 0.7, iw, ih * 0.3);
      // 左上斜向玻璃反光
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.lineWidth = Math.max(2, Math.min(7, iw * 0.045));
      ctx.beginPath();
      ctx.moveTo(ix - 4, iy + ih * 0.34);
      ctx.lineTo(ix + iw * 0.34, iy - 4);
      ctx.stroke();
      ctx.restore();
    }

    // ---- 2) 机械外框：只填充"环"（even-odd），内孔留给玻璃腔，绝不盖住腔内物体 ----
    const frameGrad = ctx.createLinearGradient(x, y, x, y + h);
    frameGrad.addColorStop(0, '#565d7e');
    frameGrad.addColorStop(0.35, '#3a3f5c');
    frameGrad.addColorStop(1, '#20243c');
    ctx.beginPath();
    roundedTrail(ctx, x, y, w, h, cornerR);
    if (hasCavity) roundedTrail(ctx, ix, iy, iw, ih, cavR);
    ctx.fillStyle = frameGrad;
    if (hasCavity) ctx.fill('evenodd');
    else ctx.fill();
    ctx.strokeStyle = 'rgba(12,10,30,0.92)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // 细金外缘（呼吸）
    ctx.save();
    ctx.strokeStyle = rgbaOf(THEME.gold.base, 0.30 + 0.14 * breathe);
    ctx.lineWidth = 1;
    ctx.shadowColor = rgbaOf(THEME.gold.light, 0.45);
    ctx.shadowBlur = 3;
    rr(ctx, x + 1.6, y + 1.6, w - 3.2, h - 3.2, Math.max(2, cornerR - 1));
    ctx.stroke();
    ctx.restore();
    // 顶部倒角高光
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + cornerR, y + 2.2);
    ctx.lineTo(x + w - cornerR, y + 2.2);
    ctx.stroke();

    if (hasCavity) {
      // ---- 3) 金内缘：压在"钢框内孔 / 玻璃腔"交界线上（最后画，边缘干净）----
      ctx.save();
      ctx.strokeStyle = rgbaOf(THEME.gold.base, 0.42 + 0.18 * breathe);
      ctx.lineWidth = 1.2;
      ctx.shadowColor = rgbaOf(THEME.gold.light, 0.4);
      ctx.shadowBlur = 4;
      rr(ctx, ix + 0.6, iy + 0.6, iw - 1.2, ih - 1.2, cavR);
      ctx.stroke();
      ctx.restore();
      // ---- 右上角小压力表（金圈+深紫面+气体色指针，无文字）----
      if (!small && w >= 110 && h >= 80) {
        const gr = Math.max(6, Math.min(9, Math.min(w, h) * 0.06));
        this._renderGauge(ctx, x + w - frame - gr - 4, y + frame + gr + 4, gr, declared, time);
      }
      // ---- 四角黄铜加固件 + 外框铆钉 + 底座裙边 ----
      if (!small && w >= 56 && h >= 42) {
        this._renderCornerPlates(ctx, x, y, w, h, frame);
        if (frame >= 4.5) this._renderFrameRivets(ctx, x, y, w, h, frame);
        this._renderSkirt(ctx, x, y, w, h);
      }
    } else {
      // 极小气室：钢框 + 金内缘（不塞装饰，保持可辨认）
      ctx.strokeStyle = rgbaOf(THEME.gold.base, 0.45);
      ctx.lineWidth = 1;
      rr(ctx, x + 2, y + 2, Math.max(2, w - 4), Math.max(2, h - 4), 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** 顶部两个小黄铜通气帽（装饰：暗示密闭结构可接导管；先画，短柱被外框遮住） */
  _renderVentCaps(ctx, x, y, w, frame) {
    const bw = Math.max(5, frame * 0.9); // 帽身宽
    const capH = Math.max(3, frame * 0.5);
    for (const fx of [0.3, 0.68]) {
      const cx = Math.round(x + w * fx);
      // 短柱（钢 + 侧向螺栓）
      ctx.fillStyle = '#3a3f5c';
      ctx.fillRect(cx - bw / 2, y - capH * 2.4, bw, capH * 2.6);
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.fillRect(cx - bw / 2, y - capH * 2.4, 1.2, capH * 2.6);
      ctx.fillStyle = 'rgba(226,232,244,0.5)';
      for (const dy of [-capH * 1.9, -capH * 1.15]) {
        ctx.fillRect(cx + bw / 2 - 1.2, y + dy, 1.8, 1.1);
      }
      // 黄铜帽（六角/倒角感：底座一层 + 收窄顶盖）
      rr(ctx, cx - bw * 0.85, y - capH * 3.15, bw * 1.7, capH * 1.3, capH * 0.35);
      ctx.fillStyle = '#8a6420';
      ctx.fill();
      ctx.strokeStyle = '#4a320e';
      ctx.lineWidth = 0.9;
      ctx.stroke();
      rr(ctx, cx - bw * 0.62, y - capH * 3.45, bw * 1.24, capH * 0.85, capH * 0.3);
      ctx.fillStyle = '#c09241';
      ctx.fill();
      ctx.strokeStyle = '#5a3f14';
      ctx.lineWidth = 0.9;
      ctx.stroke();
      // 帽顶高光 + 中心小凹点 + 横纹
      ctx.fillStyle = 'rgba(255,232,160,0.6)';
      ctx.fillRect(cx - bw * 0.5, y - capH * 3.32, bw, 1);
      ctx.fillStyle = 'rgba(40,26,8,0.6)';
      ctx.beginPath();
      ctx.arc(cx, y - capH * 2.88, Math.max(0.6, capH * 0.14), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(40,26,8,0.5)';
      ctx.fillRect(cx - bw * 0.6, y - capH * 2.28, bw * 1.2, 1.1);
    }
  }

  /** 四角黄铜加固件（L 形贴角）+ 两颗铆钉 */
  _renderCornerPlates(ctx, x, y, w, h, frame) {
    const s = Math.max(8, Math.min(22, Math.min(w, h) * 0.14)); // 角件臂长
    const t = Math.max(2.2, Math.min(frame * 0.45, s * 0.45)); // 角件臂厚
    const corners = [
      [x, y, 1, 1],
      [x + w, y, -1, 1],
      [x, y + h, 1, -1],
      [x + w, y + h, -1, -1],
    ];
    ctx.save();
    for (const [cx, cy, sx, sy] of corners) {
      // L 形黄铜板（沿两条外框边）
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + sx * s, cy);
      ctx.lineTo(cx + sx * s, cy + sy * t);
      ctx.lineTo(cx + sx * t, cy + sy * t);
      ctx.lineTo(cx + sx * t, cy + sy * s);
      ctx.lineTo(cx, cy + sy * s);
      ctx.closePath();
      ctx.fillStyle = '#a9782a';
      ctx.fill();
      ctx.strokeStyle = 'rgba(44,28,10,0.75)';
      ctx.lineWidth = 1;
      ctx.stroke();
      // 黄铜亮边（内折角一线）
      ctx.strokeStyle = rgbaOf(THEME.gold.light, 0.5);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx + sx * (t + 1), cy + sy * (t + 1));
      ctx.lineTo(cx + sx * (s - 1), cy + sy * (t + 1));
      ctx.stroke();
      // 两颗铆钉（沿两臂）
      for (const [rx, ry] of [[s * 0.62, t * 0.5], [t * 0.5, s * 0.62]]) {
        const px = cx + sx * rx;
        const py = cy + sy * ry;
        ctx.fillStyle = '#f0d493';
        ctx.beginPath();
        ctx.arc(px, py, 1.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(60,40,10,0.8)';
        ctx.beginPath();
        ctx.arc(px, py, 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /** 外框铆钉（顶/左/右三边中点；底边被裙边盖住） */
  _renderFrameRivets(ctx, x, y, w, h, frame) {
    if (w < 40 || h < 32) return;
    const m = frame * 0.5;
    const pts = [
      [x + w * 0.5, y + m],
      [x + m, y + h * 0.5],
      [x + w - m, y + h * 0.5],
    ];
    ctx.save();
    for (const [px, py] of pts) {
      ctx.fillStyle = '#c9a75f';
      ctx.beginPath();
      ctx.arc(px, py, Math.max(1.2, Math.min(2.2, frame * 0.28)), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,240,190,0.55)';
      ctx.beginPath();
      ctx.arc(px - 0.5, py - 0.5, Math.max(0.5, Math.min(0.9, frame * 0.13)), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(50,32,8,0.8)';
      ctx.beginPath();
      ctx.arc(px + 0.4, py + 0.4, Math.max(0.4, Math.min(0.7, frame * 0.1)), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /**
   * 右上角小压力表：金圈 + 深紫表盘 + 气体色指针（无刻度文字）。
   * 指针角度 = 缓慢漂移的确定性 sin（不是随机闪烁）；有色气体时用其 gasColor 作指针色。
   */
  _renderGauge(ctx, cx, cy, r, gasTint, time) {
    ctx.save();
    // 表盘（深紫玻璃面）
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(26,20,54,0.95)';
    ctx.fill();
    // 金圈（暗金外圈 + 亮金内圈）
    ctx.strokeStyle = '#7a5a20';
    ctx.lineWidth = Math.max(2, r * 0.28);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(232,184,75,0.85)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 1.4, 0, Math.PI * 2);
    ctx.stroke();
    // 三枚刻度（极简，不画字）
    ctx.strokeStyle = 'rgba(210,220,245,0.4)';
    ctx.lineWidth = 1;
    for (const ang of [-2.3, -1.75, -1.2]) {
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * (r - 2.2), cy + Math.sin(ang) * (r - 2.2));
      ctx.lineTo(cx + Math.cos(ang) * (r - 4.2), cy + Math.sin(ang) * (r - 4.2));
      ctx.stroke();
    }
    // 气体色指针（缓慢漂移；有色气体=gasColor，无色=金）
    const needle = gasTint || THEME.gold.light;
    const ang = -Math.PI * 0.82 + Math.sin(time * 0.5) * 0.16;
    ctx.strokeStyle = needle;
    ctx.shadowColor = needle;
    ctx.shadowBlur = 4;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(ang) * (r - 3), cy + Math.sin(ang) * (r - 3));
    ctx.stroke();
    ctx.shadowBlur = 0;
    // 中心轴
    ctx.fillStyle = '#e8d29a';
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(0.9, r * 0.18), 0, Math.PI * 2);
    ctx.fill();
    // 表面高光弧
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.7, Math.PI * 1.1, Math.PI * 1.55);
    ctx.stroke();
    ctx.restore();
  }

  /** 底部裙边/法兰：与舱体底边贴合（上沿压在边框上、略窄于框架、薄一点）+ 金上沿 + 三铆钉 */
  _renderSkirt(ctx, x, y, w, h) {
    const sh = Math.max(3, Math.min(6, Math.min(w, h) * 0.045)); // 裙边厚（收薄）
    const skX = x + 1; // 比框架窄 2px
    const skW = w - 2;
    const sy = y + h - sh - 1; // 上沿压在底边框上，与舱体连成一体
    const g = ctx.createLinearGradient(skX, sy, skX, sy + sh + 3);
    g.addColorStop(0, 'rgba(84,91,128,0.95)');
    g.addColorStop(0.55, 'rgba(58,64,94,0.95)');
    g.addColorStop(1, 'rgba(26,30,52,0.95)');
    rr(ctx, skX, sy, skW, sh + 3, 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(12,10,30,0.85)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // 金色上沿（与边框呼应，位置压进舱体底框内）
    ctx.strokeStyle = rgbaOf(THEME.gold.base, 0.38);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(skX + 2, sy + 1.1);
    ctx.lineTo(skX + skW - 2, sy + 1.1);
    ctx.stroke();
    // 底部铆钉（两下角 + 中央）
    ctx.save();
    for (const fx of [0.2, 0.5, 0.8]) {
      const px = skX + skW * fx;
      const py = sy + sh + 0.6;
      ctx.fillStyle = '#c9a75f';
      ctx.beginPath();
      ctx.arc(px, py, 1.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(50,32,8,0.8)';
      ctx.beginPath();
      ctx.arc(px, py, 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /**
   * 编辑器命中检测：只认边框 10px 带 + 四角括号——内部空间返回 false，
   * 让腔内物体（池/烧杯/物块等）仍能被编辑器选中。
   */
  editorHit(wx, wy) {
    const BAND = 10;
    if (wx < this.x - BAND || wx > this.x + this.w + BAND || wy < this.y - BAND || wy > this.y + this.h + BAND) return false;
    // 四条边框的 10px 带（含外侧一点，方便抓边缩放）
    if (wx <= this.x + BAND || wx >= this.x + this.w - BAND || wy <= this.y + BAND || wy >= this.y + this.h - BAND) return true;
    // 四角括号：角部 L 形区域（比边框带稍微向内延伸一点）
    const L = Math.max(8, Math.min(18, this.w * 0.16, this.h * 0.2)) + 4;
    const nearX = wx <= this.x + L || wx >= this.x + this.w - L;
    const nearY = wy <= this.y + L || wy >= this.y + this.h - L;
    return nearX && nearY;
  }
}

/** 十六进制色 + 透明度 → rgba 字符串（视觉层共用） */
function rgbaOf(hex, a) {
  const c = hexToRgb(hex);
  return `rgba(${c.r},${c.g},${c.b},${a})`;
}

/** 向当前路径追加一段圆角矩形（不自开新路径：供 even-odd "框环" 填充组合子路径用） */
function roundedTrail(ctx, x, y, w, h, r) {
  const r2 = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.moveTo(x + r2, y);
  ctx.arcTo(x + w, y, x + w, y + h, r2);
  ctx.arcTo(x + w, y + h, x, y + h, r2);
  ctx.arcTo(x, y + h, x, y, r2);
  ctx.arcTo(x, y, x + w, y, r2);
  ctx.closePath();
}
