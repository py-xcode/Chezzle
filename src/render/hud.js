// ============================================================================
// HUD（神话·元素风）：
// 左上 玩家面板（物质 + 血量药瓶）、空气计（O2/CO2）；
// 右上 提示按钮；右下 5 格宝石物品栏（选中发光）；通关/死亡神话遮罩。
// ============================================================================

import { THEME, rr, panel, glowText, clearText } from './theme.js';
import { getSubstance, acidLabelOf } from '../chem/substances.js';
import { MIN_ENTRY } from '../chem/solution.js';
import { solutionColor } from './liquidrender.js';
import { CFG } from '../core/config.js';
import { GasColumn } from '../objects/gascolumn.js';
import { Block } from '../objects/block.js';
import { inventorySlotRects } from '../level/click.js';

/** 质量短格式：1.2g / 0.30g / 12g（空气计百分比旁同显质量） */
function fmtMass(m) {
  if (!Number.isFinite(m) || m <= 0) return '';
  if (m >= 100) return Math.round(m) + 'g';
  if (m >= 10) return m.toFixed(0) + 'g';
  return m.toFixed(2).replace(/0+$/, '').replace(/\.$/, '') + 'g';
}

// 溯源 kind → 中文（调试悬停显示物体"为何存在"）
const ORIGIN_LABELS = {
  level: '关卡生成',
  reaction: '反应生成',
  explosion: '爆炸掉落',
  place: '玩家放置',
  shell: '移动脱落',
  dissolve: '溶解',
};

export class Hud {
  constructor(scene) {
    this.scene = scene;
    this.showTip = false;
    this.slotSize = 46; // 旧版统一槽宽（现为兼容字段；实际几何走 inventorySlotRects）
  }

  render(ctx, time = 0) {
    const scene = this.scene;
    const p = scene.player;
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    if (p) {
      this.playerPanel(ctx, p, time);
      this.compositionPanel(ctx, p);
      this.reactionPanel(ctx, p);
      this.airPanel(ctx, scene, time);
      this.inventory(ctx, p, W, H, time);
    }
    this.debugPanel(ctx, scene, W, H, time);
    if (scene.debugMode) this.hoverPanel(ctx, scene, W, H);
    this.tipButton(ctx, W, H, time);
    this.overlay(ctx, scene, W, H);
    ctx.restore();
  }

  // ---- 调试模式面板（F5 暂停/继续，F6 步进；显示玩家附近的每个反应 + 最近爆炸原因）----
  debugPanel(ctx, scene, W, H, time) {
    if (!scene.debugMode) return;
    const p = scene.player;
    const barW = 250;
    const px = W - barW - 10;
    // 右上角状态条（堆叠面板的当前顶 y）
    let top = 10;
    panel(ctx, px, top, barW, 22, THEME.gold.deep, 8);
    clearText(ctx, `调试 ${scene.debugPaused ? '[暂停] F5继续 F6步进' : '[运行] F5暂停'}·悬停查源·X切换`, px, top + 11, scene.debugPaused ? '#ffd23f' : '#7fe0ff', 'bold 11px "Segoe UI", sans-serif');
    top += 28;
    // 最近爆炸原因（爆炸发生后 4s 内显示）
    if (scene._lastExplosion && time - scene._lastExplosion.t < 4) {
      panel(ctx, px, top, barW, 20, THEME.fire.base, 8);
      clearText(ctx, `💥 ${scene._lastExplosion.cause}`, px + 4, top + 14, '#ffd9a0', 'bold 11px monospace');
      top += 26;
    }
    // 附近反应面板（玩家周围 300px 内最近发生的反应，去重显示每种反应）
    if (scene.debugReactions && p) {
      const nearAll = scene.debugReactions.filter((r) => r.x != null && Math.abs(r.x - p.x) < 300 && Math.abs((r.y ?? 0) - (p.y + p.h / 2)) < 400);
      // 去重：每种反应保留最近一条（避免同一反应刷屏）
      const near = [];
      const seen = new Set();
      for (const r of nearAll) {
        if (seen.has(r.text)) continue;
        seen.add(r.text);
        near.push(r);
        if (near.length >= 8) break;
      }
      if (near.length > 0) {
        const shown = near.length;
        const panelW = 320;
        const panelH = 22 + shown * 16;
        panel(ctx, W - panelW - 10, top, panelW, panelH, THEME.gold.deep, 8);
        clearText(ctx, `附近反应 (${near.length})`, W - panelW + 2, top + 15, THEME.gold.text, 'bold 11px "Segoe UI", sans-serif');
        let y = top + 29;
        for (const r of near.slice(0, shown)) {
          clearText(ctx, `› ${r.text}`, W - panelW + 2, y + 5, '#dfe8f2', '10px monospace');
          y += 16;
        }
        top += panelH + 8;
      }
    }
    // 大气气体变化（产生/消耗原因——最近 6 条；+绿/消耗橙红，← 原因方程式）
    if (scene.gasLog && scene.gasLog.length) {
      const shown = Math.min(6, scene.gasLog.length);
      const panelW = 380;
      const panelH = 22 + shown * 15;
      const gx = W - panelW - 10;
      panel(ctx, gx, top, panelW, panelH, THEME.toxic.base, 8);
      clearText(ctx, `气体变化 (${scene.gasLog.length})`, gx + 12, top + 15, THEME.toxic.light, 'bold 11px "Segoe UI", sans-serif');
      let gy = top + 28;
      for (let i = 0; i < shown; i++) {
        const g = scene.gasLog[i];
        // 小量精确显示：≥0.01g 显示 2 位，≥0.001g 显示 4 位，更小显示毫克
        const absD = Math.abs(g.delta);
        const sign = g.delta >= 0 ? '+' : '-';
        const dStr = absD >= 0.01 ? `${sign}${absD.toFixed(2)}g` : absD >= 0.001 ? `${sign}${absD.toFixed(4)}g` : `${sign}${(absD * 1000).toFixed(1)}mg`;
        const color = g.delta >= 0 ? '#a6ff9a' : '#ff9a6b';
        clearText(ctx, `${g.id} ${dStr}`, gx + 12, gy + 5, color, 'bold 10px monospace');
        const cause = g.cause ?? '未知';
        clearText(ctx, `← ${cause.slice(0, 30)}`, gx + 90, gy + 5, '#9fb2c8', '9px monospace');
        gy += 15;
      }
    }
  }

  // ---- 调试模式：鼠标悬停显示物体"为何存在"（来源溯源；X 键循环切换重叠目标）----
  hoverPanel(ctx, scene, W, H) {
    const m = scene.mouse;
    if (!m || !m.on) return;
    const cam = scene.renderer ? scene.renderer.camera : null;
    if (!cam) return;
    // 屏幕坐标 → 世界坐标（相机缩放/平移；忽略每帧随机震动，悬停无需精确到像素）
    const { scale, offsetX, offsetY } = cam.compute(W, H, scene.player);
    const wx = (m.x - offsetX) / scale;
    const wy = (m.y - offsetY) / scale;
    // 鼠标移动 → 重置候选与索引
    if (!this._hoverAt || Math.abs(this._hoverAt.x - m.x) > 1 || Math.abs(this._hoverAt.y - m.y) > 1) {
      this._hoverAt = { x: m.x, y: m.y };
      this._hoverIdx = 0;
    }
    const cands = this.collectHover(scene, wx, wy);
    if (cands.length === 0) return;
    // X 键（scene.debugHoverCycle）：在重叠物体间循环切换
    if (scene.debugHoverCycle) {
      scene.debugHoverCycle = false;
      this._hoverIdx = (this._hoverIdx + 1) % cands.length;
    }
    if (this._hoverIdx >= cands.length) this._hoverIdx = 0;
    const info = cands[this._hoverIdx];
    this.renderHoverTip(ctx, info, m.x, m.y, W, H, cands.length > 1 ? { idx: this._hoverIdx + 1, total: cands.length } : null);
  }

  /**
   * 命中检测：收集鼠标下所有重叠物体的来源信息（按优先级排序——
   * 玩家>沉淀>池内颗粒>物块>气流>容器/静态）。默认显示第 0 个，X 键循环切换。
   */
  collectHover(scene, wx, wy) {
    const out = [];
    const hitRect = (o) => o && wx >= o.x && wx <= o.x + o.w && wy >= o.y && wy <= o.y + o.h;
    const inCircle = (cx, cy, r) => {
      const dx = wx - cx;
      const dy = wy - cy;
      return dx * dx + dy * dy <= r * r;
    };

    // 1. 玩家（核心+附着的壳：NaOH 关卡生成，Na2CO3/BaCO3 壳反应生成）
    const p = scene.player;
    if (p && hitRect(p)) {
      const info = this.objInfo(p, p.substance);
      const bd = this.gridBreakdown(p);
      if (bd && bd.length > 1) info.breakdown = bd;
      out.push(info);
    }

    // 2. 自由沉淀粒子（小圆；同种且重叠的合并为一条候选——与渲染聚类一致，
    //    否则掉落的一簇 20 颗叠在一起 → 悬停显示 20 条候选"20 个粒子叠在一起"）
    const hitParts = [];
    for (const pt of scene.particles) {
      if (pt.amount <= 1e-9) continue;
      if (inCircle(pt.x + pt.w / 2, pt.y + pt.h / 2, pt.w / 2 + 1)) hitParts.push(pt);
    }
    const merged = new Map(); // substance → { count, pt }
    for (const pt of hitParts) {
      const e = merged.get(pt.substance);
      if (e) { e.count++; continue; }
      merged.set(pt.substance, { count: 1, pt });
    }
    for (const [substance, e] of merged) {
      const info = this.objInfo(e.pt, e.count > 1 ? `${substance}×${e.count}` : substance);
      out.push(info);
    }

    // 3. 容器内沉淀颗粒（池/灯上的某一颗沉淀）
    for (const c of scene.containers) {
      for (const g of c.grains) {
        if (inCircle(g.x, g.y, g.r + 1)) {
          const origin = c.precipOrigins.get(g.id) ?? null;
          out.push({ label: '沉淀', name: `${g.id}（${c.hoverLabel ?? '容器'}内）`, origin });
        }
      }
    }

    // 4. 物块（动态固体；含多种物质时逐物质显示来源——初始=关卡生成、反应附着=反应生成）
    for (const o of scene.dynamics) {
      if (!(o instanceof Block) || !hitRect(o)) continue;
      const info = this.objInfo(o, o.grid ? o.grid.ids().join('+') : o.substance);
      const bd = this.gridBreakdown(o);
      if (bd && bd.length > 1) info.breakdown = bd;
      out.push(info);
    }

    // 5. 气流柱（反应产气的气流——显示是哪个反应生成的）
    for (const o of scene.objects) {
      if (!(o instanceof GasColumn) || !hitRect(o)) continue;
      out.push(this.objInfo(o, o.gasId ?? o.label ?? ''));
    }

    // 6. 容器/灯/静态元素（池、灯、开关、地板、路标、钥匙、门…）
    for (const o of scene.objects) {
      if (!o.hoverLabel || o instanceof GasColumn || o instanceof Block || o === p) continue;
      if (!hitRect(o)) continue;
      const info = this.objInfo(o, (o.opening ?? o.substance ?? ''));
      // 容器/灯：逐物质显示来源（某物质关卡生成、某物质反应生成…）
      if (o.solution || o.precipitates) info.breakdown = this.contentBreakdown(o);
      out.push(info);
    }
    return out;
  }

  /** 容器/灯内各物质及其来源（溶质 + 沉淀 + 水，按质量降序）——悬停药品池显示每样多少克 */
  contentBreakdown(c) {
    const out = [];
    for (const [id, mass] of c.solution.solutes) {
      if (mass < MIN_ENTRY) continue; // 微量溶质不显示：防"0.0g ↔ 无"的条目抖动
      // 酸类标注浓/稀（≥300 g/L = 浓，与引擎判定一致）
      const note = acidLabelOf(id, mass, c.solution.volume / 1000);
      out.push({ id, mass, origin: c.solOrigins?.get(id) ?? null, note });
    }
    for (const [id, mass] of c.precipitates) {
      if (mass < MIN_ENTRY) continue;
      // 沉淀标注合并数（几颗 0.5g 合并显示）：与自由沉淀粒子同规则
      out.push({ id, mass, origin: c.precipOrigins?.get(id) ?? null, note: `↓×${Math.max(1, Math.ceil(mass / CFG.maxParticleMass))}` });
    }
    if (c.solution.water > 0) out.push({ id: 'H2O', mass: c.solution.water, origin: { kind: 'solvent' } });
    return out.sort((a, b) => b.mass - a.mass);
  }

  /** 物块/玩家网格内各物质及其来源（初始=关卡生成，反应附着=反应生成） */
  gridBreakdown(o) {
    const masses = o.grid ? o.grid.masses() : null;
    if (!masses) return null;
    const out = [];
    for (const [id, mass] of Object.entries(masses)) {
      if (mass <= 1e-6) continue;
      out.push({ id, mass, origin: o.gridOrigins?.get(id) ?? null });
    }
    return out.sort((a, b) => b.mass - a.mass);
  }

  /** 组装提示信息 */
  objInfo(obj, name, origin = null) {
    return { label: obj.hoverLabel ?? '元素', name, origin: origin ?? obj.origin ?? null };
  }

  /** 容器内容标签（溶质 + 沉淀） */
  containerName(c) {
    const parts = [];
    for (const [id] of c.solution.solutes) parts.push(id);
    for (const [id] of c.precipitates) parts.push(`${id}(↓)`);
    if (parts.length === 0 && c.solution.water > 0) parts.push('H2O');
    return parts.join('+') || '空';
  }

  /** 来源短标签（只给种类，如"关卡生成/反应生成"） */
  originShort(origin) {
    if (!origin) return '未知';
    return ORIGIN_LABELS[origin.kind] ?? origin.kind;
  }

  /** 来源文本行（反应生成给出具体方程式，超长自动换行） */
  originLines(origin) {
    if (!origin) return ['来源：未知'];
    const head = ORIGIN_LABELS[origin.kind] ?? origin.kind;
    if (origin.kind === 'reaction' && origin.text) {
      return [`来源：${head}`, ...this.wrapCJK(origin.text, 34)];
    }
    if (origin.text) return [`来源：${head}（${origin.text}）`];
    return [`来源：${head}`];
  }

  /** 按字符宽度换行（中英混排按字符数截断） */
  wrapCJK(text, maxLen) {
    const out = [];
    for (let i = 0; i < text.length; i += maxLen) out.push(text.slice(i, i + maxLen));
    return out;
  }

  /** 渲染悬停提示框（鼠标附近，钳在画布内）；multi = {idx,total} 表示重叠目标循环切换 */
  renderHoverTip(ctx, info, sx, sy, W, H, multi = null) {
    let lines;
    if (info.breakdown && info.breakdown.length) {
      // 容器/灯/物块：逐物质显示来源 + 质量（各物质名 + 克数 + 来源，反应给方程式）
      lines = [`${info.label}（${info.breakdown.length} 种）`];
      const shown = info.breakdown.slice(0, 8);
      for (const it of shown) {
        const isWater = it.id === 'H2O';
        const tag = it.note ? `(${it.note})` : '';
        lines.push(`  ${it.id}${tag} ${it.mass.toFixed(1)}g · ${isWater ? '溶剂' : this.originShort(it.origin)}`);
        if (it.origin && it.origin.kind === 'reaction' && it.origin.text) {
          lines.push(...this.wrapCJK(it.origin.text, 30).map((s) => '    ' + s));
        }
      }
      if (info.breakdown.length > shown.length) lines.push(`  …另有 ${info.breakdown.length - shown.length} 种`);
    } else {
      lines = [`${info.label} ${info.name}`, ...this.originLines(info.origin)];
    }
    if (multi) lines.push(`⟨ ${multi.idx}/${multi.total} · 按 X 切换 ⌦`);
    const font = '11px monospace';
    ctx.save();
    ctx.font = font;
    const pad = 8;
    const lh = 17;
    const maxW = Math.min(320, Math.max(...lines.map((ln) => ctx.measureText(ln).width)));
    const boxW = maxW + pad * 2;
    const boxH = lines.length * lh + 8;
    // 位置：鼠标右下偏移 14/20，越界则翻到鼠标另一侧/上侧
    let bx = sx + 14;
    let by = sy + 20;
    if (bx + boxW > W - 6) bx = sx - boxW - 14;
    if (by + boxH > H - 6) by = sy - boxH - 20;
    bx = Math.max(6, bx);
    by = Math.max(6, by);
    // 面板 + 发光描边
    panel(ctx, bx, by, boxW, boxH, THEME.water.base, 6);
    ctx.font = font;
    let y = by + 15;
    for (let i = 0; i < lines.length; i++) {
      // 标题行金色加粗，方程式行青色，来源行白色
      const color = i === 0 ? THEME.gold.text : i === 1 ? '#dfe8f2' : '#9fd8ff';
      clearText(ctx, lines[i], bx + pad, y, color, i === 0 ? 'bold 11px monospace' : font);
      y += lh;
    }
    ctx.restore();
  }

  // ---- 玩家面板（物质 + 血量药瓶）----
  playerPanel(ctx, p, time) {
    panel(ctx, 10, 10, 232, 66, THEME.gold.deep, 12);
    const sub = getSubstance(p.substance);
    const color = sub?.solid?.[0] ?? '#7fe0ff';
    const ratio = p.maxHp ? Math.max(0, Math.min(1, p.hp / p.maxHp)) : 0;
    this.vial(ctx, 24, 20, 34, 44, ratio, color, time);
    clearText(ctx, p.substance, 70, 34, THEME.gold.text, 'bold 16px "Segoe UI", sans-serif');
    clearText(ctx, `${p.hp.toFixed(1)} g 体质`, 70, 56, '#ffffff', 'bold 12px monospace');
  }

  /** 血量药瓶：玻璃烧瓶 + 发光液体填充 */
  vial(ctx, x, y, w, h, ratio, color, time) {
    ctx.save();
    rr(ctx, x, y, w, h, w / 2.4);
    ctx.fillStyle = 'rgba(190,225,255,0.10)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(200,235,255,0.6)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // 液体
    const lh = h * Math.max(0.06, Math.min(1, ratio));
    ctx.save();
    rr(ctx, x + 1.5, y + h - lh, w - 3, lh, w / 3);
    ctx.clip();
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, '#d8f6ff');
    g.addColorStop(0.5, color);
    g.addColorStop(1, '#0e2a44');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
    // 液面辉光（随血量轻微脉动）
    const pulse = 6 + 4 * Math.sin(time * 3);
    ctx.globalCompositeOperation = 'lighter';
    ctx.shadowColor = color;
    ctx.shadowBlur = pulse;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(x + 1, y + h - lh, w - 2, 2);
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }

  // ---- 身体组成面板（玩家身上多物质时：色点 + 化学式 + 占比条 + 克数）----
  compositionPanel(ctx, p) {
    const masses = p.grid ? p.grid.masses() : null;
    if (!masses) return;
    const entries = Object.entries(masses).filter(([, m]) => m > 1e-6).sort((a, b) => b[1] - a[1]);
    if (entries.length <= 1) return; // 单物质身体不显示（就是血量）
    const total = entries.reduce((s, [, m]) => s + m, 0);
    const shown = Math.min(5, entries.length);
    const W = 264;
    const H = 20 + shown * 22 + (entries.length > 5 ? 16 : 0);
    this._compH = H; // 供反应日志面板定位
    panel(ctx, 10, 136, W, H, THEME.water.base, 10);
    clearText(ctx, '身体组成', 22, 148, THEME.gold.text, 'bold 11px "Segoe UI", sans-serif');
    let y = 162;
    for (const [id, m] of entries.slice(0, shown)) {
      const sub = getSubstance(id);
      const color = sub?.solid?.[0] ?? '#7fe0ff';
      const frac = m / total;
      const isCore = id === p.substance;
      // 色点
      ctx.save();
      if (isCore) {
        ctx.shadowColor = THEME.gold.text;
        ctx.shadowBlur = 6;
      }
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(28, y + 8, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      // 占比条
      ctx.fillStyle = 'rgba(255,255,255,0.09)';
      ctx.fillRect(120, y + 5, 100, 7);
      ctx.fillStyle = color;
      ctx.fillRect(120, y + 5, 100 * frac, 7);
      // 化学式 + 克数
      ctx.textAlign = 'right';
      clearText(ctx, id, 112, y + 8, isCore ? THEME.gold.text : '#dfe8f2', isCore ? 'bold 10px monospace' : '10px monospace');
      ctx.textAlign = 'left';
      clearText(ctx, `${m.toFixed(1)}g`, 226, y + 8, '#9fb2c8', '9px monospace');
      y += 22;
    }
    if (entries.length > 5) {
      clearText(ctx, `…另有 ${entries.length - 5} 种`, 22, y + 9, '#9fb2c8', '10px monospace');
    }
  }

  // ---- 玩家反应日志（最近发生在玩家身上的反应）----
  reactionPanel(ctx, p) {
    if (!p.reactions || p.reactions.length === 0) return;
    const shown = Math.min(4, p.reactions.length);
    const W = 264;
    const H = 22 + shown * 17;
    const top = 136 + (this._compH ?? 0) + 4;
    panel(ctx, 10, top, W, H, THEME.gold.deep, 10);
    clearText(ctx, '最近反应', 22, top + 12, THEME.gold.text, 'bold 11px "Segoe UI", sans-serif');
    let y = top + 26;
    for (let i = 0; i < shown; i++) {
      clearText(ctx, `› ${p.reactions[i]}`, 22, y + 6, '#dfe8f2', '10px monospace');
      y += 17;
    }
  }

  // ---- 空气计（O2/CO2 常驻；其它反应气有质量才显示，避免"生成了却看不到"）----
  airPanel(ctx, scene, time) {
    const atm = scene.atmosphere;
    if (!atm) return;
    const o2 = atm.fraction('O2') * 100;
    const co2 = atm.fraction('CO2') * 100;
    // 颜色：燃料气 + 氮氧化物 + 其它
    const GAS_COLORS = {
      CO: '#ffb86b', H2: '#9adcff', CH4: '#a8ff9a', H2S: '#ffd9a0',
      NO: '#cfe3f7', NO2: '#e08b57', SO2: '#ffd98a', Cl2: '#b9f26b', NH3: '#b9a9ff',
    };
    const extras = ['CO', 'H2', 'CH4', 'H2S', 'NO', 'NO2', 'SO2', 'Cl2', 'NH3']
      .map((id) => ({ id, mass: atm.mass(id), frac: atm.fraction(id) * 100 }))
      .filter((g) => g.mass > 0.01);
    const H = 46 + (extras.length ? 22 : 0);
    panel(ctx, 10, 82, 264, H, THEME.water.base, 10);
    // 第一行：氧（青）+ 二氧化碳（金）
    ctx.fillStyle = THEME.water.glow;
    ctx.beginPath();
    ctx.arc(26, 100, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = THEME.water.light;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(26, 100, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    clearText(ctx, `O2  ${o2.toFixed(1)}%  ${fmtMass(atm.mass('O2'))}`, 38, 104, '#aeeaff', 'bold 11px monospace');
    ctx.fillStyle = THEME.gold.dim;
    ctx.beginPath();
    ctx.arc(104, 100, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = THEME.gold.light;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(104, 100, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    // 少量 CO2 时如实显示"微量"，避免面板显示 0.0% 却仍在发生碳化反应的误解
    const co2Mass = atm.mass('CO2');
    const co2Text = co2 >= 0.05 ? `${co2.toFixed(1)}%` : co2Mass > 1e-6 ? '<0.1%' : '0%';
    clearText(ctx, `CO2  ${co2Text}  ${co2Mass > 1e-6 ? fmtMass(co2Mass) : ''}`, 116, 104, '#ffe9b0', 'bold 11px monospace');
    // 第二行：其它燃料气（CO/H2/CH4/H2S）——有质量才显示，爆鸣预警
    if (extras.length) {
      let gx = 18;
      for (const g of extras) {
        const color = GAS_COLORS[g.id] ?? '#ffffff';
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 5;
        ctx.beginPath();
        ctx.arc(gx + 6, 123, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        const t = g.frac >= 0.05 ? `${g.frac.toFixed(1)}%` : '<0.1%';
        const label = `${g.id} ${t} ${fmtMass(g.mass)}`;
        clearText(ctx, label, gx + 14, 127, color, 'bold 10px monospace');
        gx += 14 + label.length * 6.4 + 8;
      }
    }
  }

  // ---- 物品栏（宝石槽）：装物品的格子放大 + 内容物溶质显示 + 获取弹跳 ----
  inventory(ctx, p, W, H, time) {
    const slots = p.inventory.slots;
    const rects = inventorySlotRects(W, H, slots);
    if (!this._pop) this._pop = {}; // 物品格弹跳计时 {i:{sig,t}}
    let minTop = Infinity;
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      const x = r.x;
      const sy = r.y;
      const size = r.size;
      minTop = Math.min(minTop, sy);
      const sel = i === p.inventory.selected;
      // 弹跳：物品格内容变化（新装/吸液/倒出/收气）时缩放脉冲一下
      const s = slots[i];
      let sc = 1;
      if (s && s.item) {
        const o = s.obj;
        const sig = s.item === 'beaker' ? `${o.solution ? o.solution.totalMass() : 0}`
          : s.item === 'dropper' ? `${o.liquid}${o.substance}`
            : `${o.totalGas()}${o.gases.size}`;
        const rec = this._pop[i];
        if (!rec || rec.sig !== sig) this._pop[i] = { sig, t: time };
        const pt = time - this._pop[i].t;
        sc = 1 + 0.2 * Math.sin(Math.min(1, pt / 0.32) * Math.PI) * (1 - pt / 0.32);
      }
      ctx.save();
      if (sc > 1.001) {
        ctx.translate(x + size / 2, sy + size / 2);
        ctx.scale(sc, sc);
        ctx.translate(-(x + size / 2), -(sy + size / 2));
      }
      ctx.save();
      rr(ctx, x, sy, size, size, 12);
      const g = ctx.createLinearGradient(x, sy, x, sy + size);
      g.addColorStop(0, sel ? 'rgba(70,50,16,0.96)' : 'rgba(30,26,62,0.92)');
      g.addColorStop(1, sel ? 'rgba(32,22,8,0.96)' : 'rgba(12,9,32,0.92)');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = sel ? THEME.gold.light : 'rgba(232,184,75,0.35)';
      ctx.lineWidth = sel ? 2 : 1.2;
      ctx.shadowColor = THEME.gold.light;
      ctx.shadowBlur = sel ? 10 + 4 * Math.sin(time * 4) : 0;
      ctx.stroke();
      ctx.restore();

      if (s) {
        if (s.item) {
          this.drawItemIcon(ctx, s, r, time);
        } else {
          this.drawSubstanceSlot(ctx, s, x, sy, size, sel);
        }
      } else {
        // 空槽：淡符文环
        ctx.strokeStyle = 'rgba(232,184,75,0.22)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x + size / 2, sy + size / 2, 7, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
    // 选中物品时显示操作提示（C 吸液 · X 倒出/通气 · Shift 放置 · 拖动滴管）
    const selItem = p.inventory.selectedItem();
    if (selItem) {
      const hints = selItem.isCarryItem === 'beaker'
        ? 'C吸液20g/次 · X倒出10g/次 · Shift放置'
        : selItem.isCarryItem === 'dropper'
          ? 'C吸液5g/次·同液续吸至50g · Shift放置 · 点击滴液·附近按住拖动'
          : '按住C收集气泡柱气体 · 按住X通入溶液 · Shift放置';
      ctx.font = 'bold 11px "Segoe UI", "Microsoft YaHei", sans-serif';
      ctx.fillStyle = 'rgba(255,233,176,0.9)';
      ctx.shadowColor = 'rgba(232,184,75,0.6)';
      ctx.shadowBlur = 5;
      ctx.fillText(hints, rects[0].x, minTop - 8);
      ctx.shadowBlur = 0;
    }
  }

  /** 物质格：元素色圆点 + 名称 + 质量 */
  drawSubstanceSlot(ctx, s, x, sy, size, sel) {
    const sub = getSubstance(s.substance);
    const c = sub?.solid?.[0] ?? '#c8c8c8';
    ctx.save();
    ctx.fillStyle = c;
    ctx.shadowColor = c;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(x + size / 2, sy + 22, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = sel ? '#fff6dd' : THEME.gold.text;
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(s.substance, x + size / 2, sy + 15);
    ctx.font = '10px monospace';
    ctx.fillStyle = '#ffffff';
    const m = Number.isFinite(s.mass) ? s.mass : 0; // NaN 质量显示 0，不显示 NaN
    ctx.fillText(`${m.toFixed(1)}g`, x + size / 2, sy + size - 8);
    ctx.textAlign = 'left';
  }

  /** 容器内容物一行字（主要溶质/溶剂），最多 2 种；超出截断加省略号 */
  _contentLine(entries, emptyText = '') {
    const list = entries.filter(([, m]) => m > 0.05).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([id]) => id);
    if (!list.length) return emptyText;
    let str = list.join('+');
    if (str.length > 11) str = `${str.slice(0, 10)}…`;
    return str;
  }

  /** 物品格图标（烧杯/滴管/集气瓶——不堆叠，一物一格）。
   *  格子更大（itemSlotPx），并把**里面的液体/气体成分**一并显示出来。 */
  drawItemIcon(ctx, s, r, time) {
    const o = s.obj;
    const size = r.size;
    const k = size / 46; // 相对旧 46 格的放大系数
    const cx = r.x + size / 2;
    const cy = r.y + size / 2;
    const bottomY = r.y + size - 5;
    const midY = r.y + size - 16; // 内容物行
    ctx.save();
    ctx.textAlign = 'center';
    if (s.item === 'beaker') {
      // 迷你烧杯：U 形玻璃 + 按液量比例的液面 + 主要溶质
      const bw = Math.round(18 * Math.max(1, k - 0.15));
      const bh = Math.round(22 * Math.max(1, k - 0.15));
      const bx = cx - bw / 2;
      const by = cy - bh / 2 + 3;
      const { color, alpha } = o.solution ? solutionColor(o.solution) : { color: '#9adcff', alpha: 0.2 };
      const vol = o.solution && o.solution.volume > 0 ? o.solution.volume : CFG.item.beakerCapacity;
      const total = o.solution ? o.solution.totalMass() : 0;
      const frac = Math.max(0, Math.min(1, total / vol));
      const lh = Math.max(0.01, (bh - 3) * frac);
      if (frac > 0.01) {
        ctx.globalAlpha = Math.max(alpha, 0.35);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.roundRect(bx + 1, by + bh - 1 - lh, bw - 2, lh, 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = 'rgba(225,245,255,0.85)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(bx + 0.5, by);
      ctx.lineTo(bx + 0.5, by + bh - 3);
      ctx.quadraticCurveTo(bx + 0.5, by + bh - 0.5, bx + 3, by + bh - 0.5);
      ctx.lineTo(bx + bw - 3, by + bh - 0.5);
      ctx.quadraticCurveTo(bx + bw - 0.5, by + bh - 0.5, bx + bw - 0.5, by + bh - 3);
      ctx.lineTo(bx + bw - 0.5, by);
      ctx.stroke();
      ctx.fillStyle = '#fff6dd';
      ctx.font = 'bold 8px "Microsoft YaHei", sans-serif';
      ctx.fillText('烧杯', cx, r.y + 10);
      // 内容物行：主要溶质（无有效溶质显示"水"，空杯显示"空"）
      const entries = o.solution ? [...o.solution.solutes.entries()] : [];
      ctx.font = 'bold 7.5px monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.fillText(this._contentLine(entries, total > 0.05 ? '水' : '空'), cx, midY);
      ctx.font = '9px monospace';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(`${total.toFixed(0)}g`, cx, bottomY);
    } else if (s.item === 'dropper') {
      // 迷你滴管：胶头 + 细管 + 管内液体 + 管内物质名
      const dw = 7;
      const dh = Math.round(26 * Math.max(1, k - 0.15));
      const dx = cx - dw / 2;
      const dy = cy - dh / 2 + 2;
      ctx.fillStyle = '#c0303a';
      ctx.beginPath();
      ctx.ellipse(cx, dy, 4.8, 5.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(215,235,255,0.85)';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(dx, dy + 4, dw, dh - 7);
      const frac = Math.max(0, Math.min(1, o.liquid / o.capacity));
      if (frac > 0.01) {
        const { color, alpha } = o.liquidColor();
        const lh = (dh - 10) * frac;
        ctx.globalAlpha = Math.max(alpha, 0.4);
        ctx.fillStyle = color;
        ctx.fillRect(dx + 0.6, dy + 4 + (dh - 7) - lh, dw - 1.2, lh);
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = '#fff6dd';
      ctx.font = 'bold 8px "Microsoft YaHei", sans-serif';
      ctx.fillText('滴管', cx, r.y + 10);
      // 管内物质（水→"水"；空管"空"）
      ctx.font = 'bold 7.5px monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.fillText(o.liquid > 1e-9 ? (o.substance === 'H2O' ? '水' : o.substance) : '空', cx, midY);
      ctx.font = '9px monospace';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(o.liquid > 1e-9 ? `${o.liquid.toFixed(1)}g` : '', cx, bottomY);
    } else if (s.item === 'bottle') {
      // 迷你集气瓶：玻璃瓶 + 气体填充 + 盖板线 + 气体成分
      const bw = Math.round(17 * Math.max(1, k - 0.15));
      const bh = Math.round(24 * Math.max(1, k - 0.15));
      const bx = cx - bw / 2;
      const by = cy - bh / 2 + 3;
      const frac = Math.max(0, Math.min(1, o.totalGas() / o.capacity));
      const color = o.gasColor();
      if (frac > 0.01) {
        const hex = color.replace('#', '');
        const cr = parseInt(hex.slice(0, 2), 16);
        const cg = parseInt(hex.slice(2, 4), 16);
        const cb = parseInt(hex.slice(4, 6), 16);
        ctx.globalAlpha = 0.45 + 0.2 * frac;
        ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
        ctx.shadowColor = color;
        ctx.shadowBlur = 5;
        ctx.beginPath();
        ctx.roundRect(bx + 1, by + bh - 12 * frac, bw - 2, 12 * frac, 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = 'rgba(215,235,255,0.85)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, 3);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(bx + 4, by);
      ctx.lineTo(bx + 5, by - 4);
      ctx.lineTo(bx + bw - 5, by - 4);
      ctx.lineTo(bx + bw - 4, by);
      ctx.stroke();
      // 玻璃盖板（横杠盖在口上）
      ctx.strokeStyle = 'rgba(240,250,255,0.95)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(bx + 1.5, by - 5);
      ctx.lineTo(bx + bw - 1.5, by - 5);
      ctx.stroke();
      ctx.fillStyle = '#fff6dd';
      ctx.font = 'bold 8px "Microsoft YaHei", sans-serif';
      ctx.fillText(o.totalGas() > 1e-9 ? o.gasLabel() : '集气瓶', cx, r.y + 10);
      // 瓶内气体成分（最多 2 种名；混合由 gasLabel 标题给"等"）
      const entries = [...o.gases.entries()];
      ctx.font = 'bold 7.5px monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.fillText(o.totalGas() > 1e-9 ? this._contentLine(entries, '') : '空', cx, midY);
      ctx.font = '9px monospace';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(o.totalGas() > 1e-9 ? `${o.totalGas().toFixed(1)}g/${o.capacity.toFixed(0)}g` : '', cx, bottomY);
    }
    ctx.restore();
  }

  // ---- 提示按钮 ----
  tipButton(ctx, W, H, time) {
    const x = W - 72;
    const y = 10;
    ctx.save();
    rr(ctx, x, y, 62, 28, 8);
    const g = ctx.createLinearGradient(x, y, x, y + 28);
    g.addColorStop(0, '#7a5a20');
    g.addColorStop(1, '#4a3410');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = THEME.gold.light;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = THEME.gold.light;
    ctx.shadowBlur = this.showTip ? 12 : 4;
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#ffe9b0';
    ctx.font = 'bold 13px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('提示', x + 31, y + 20);
    ctx.textAlign = 'left';
    if (this.showTip && this.scene.tip) {
      ctx.save();
      rr(ctx, 10, 44, Math.min(W - 20, 430), 88, 10);
      ctx.fillStyle = THEME.panel;
      ctx.fill();
      ctx.strokeStyle = THEME.gold.deep;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = THEME.gold.text;
      ctx.font = 'bold 12px "Segoe UI", sans-serif';
      const lines = this.scene.tip.split('\n');
      for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], 22, 66 + i * 16);
    }
  }

  // ---- 通关 / 死亡遮罩 ----
  overlay(ctx, scene, W, H) {
    if (scene.status !== 'win' && scene.status !== 'died') return;
    ctx.save();
    ctx.fillStyle = 'rgba(6,5,20,0.72)';
    ctx.fillRect(0, 0, W, H);
    const win = scene.status === 'win';
    const c = win ? THEME.portal.light : '#ff7f7f';
    const cx = W / 2;
    const cy = H / 2 - 10;
    // 光环
    ctx.save();
    ctx.strokeStyle = c;
    ctx.lineWidth = 3;
    ctx.shadowColor = c;
    ctx.shadowBlur = 30;
    ctx.beginPath();
    ctx.arc(cx, cy, 46, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    // 图标符文
    ctx.fillStyle = c;
    ctx.font = '34px serif';
    ctx.textAlign = 'center';
    ctx.fillText(win ? '✦' : '✧', cx, cy + 12);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 34px "Segoe UI", sans-serif';
    ctx.fillText(win ? '通关！' : '死亡', cx, cy + 58);
    ctx.fillStyle = '#e8d8b0';
    ctx.font = '15px "Segoe UI", sans-serif';
    ctx.fillText('按 R 重开', cx, cy + 90);
    ctx.textAlign = 'left';
    ctx.restore();
  }
}
