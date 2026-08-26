// ============================================================================
// 容器基类：持有溶液 + 沉淀粒子，化学引擎以 SolutionMaterial 与之交互。
// 容器本体不是实心（液体可穿入），其几何（池的盆壁/盆底、烧杯壁）由子类提供。
// ============================================================================

import { Obj } from './obj.js';
import { Solution, SolutionMaterial, MIN_ENTRY } from '../chem/solution.js';
import { ContainerMaterial } from './material.js';
import { renderFormula } from '../render/label.js';
import { getSubstance, acidLabelOf } from '../chem/substances.js';
import { renderPrecipitateBall, splitPile, particleSizeOf } from './particle.js';

const GRAIN_MAX = 140; // 容器内沉淀的视觉颗粒上限（超出按 1.5g 合并，与自由粒子同规则）

export class Container extends Obj {
  constructor({ x, y, w, h, volume, solutes, water, ...rest } = {}) {
    super({ x, y, w, h, solid: false, physicsKind: 'none', ...rest });
    this.solution = new Solution({ volume: volume ?? 100, solutes: solutes ?? {}, water: water ?? volume ?? 100 });
    this.solutionMat = new SolutionMaterial(this.solution, this);
    this.mat = new ContainerMaterial(this); // 溶液 + 沉淀的完整材料（沉淀可参与反应）
    this.precipitates = new Map(); // substanceId → g（沉淀/内含物，化学真相）
    this.precipOrigins = new Map(); // substanceId → origin（调试悬停显示每类沉淀的来源）
    this.solOrigins = new Map(); // 溶质 substanceId → origin（调试悬停显示每类溶质的来源）
    // 关卡预设的初始溶质 = 关卡生成（反应产物/溶解物在加入时覆盖为对应来源）
    for (const [id] of this.solution.solutes) this.solOrigins.set(id, { kind: 'level' });
    this.grains = []; // 视觉颗粒（世界坐标；反应点生成 + 物理堆叠）
    this.useGrains = true; // 池/烧杯用颗粒；酒精灯等用自定义渲染（见 lamp）
    this.clipGrains = true; // 是否按 grainRegion 裁剪渲染（酒精灯关掉，让颗粒自然堆成小山）
    this.formulaVisible = true; // 是否显示化学式
    this.spillSides = false; // 灯等开放平台：颗粒可滚出左右边缘（堆不下从两侧滚落）
  }

  get hoverLabel() {
    return '容器';
  }

  /** 显示容器当前内容（溶液溶质 + 沉淀；纯水显示 H2O），供子类 render 调用 */
  renderContentsLabel(ctx) {
    if (this.formulaVisible === false) return;
    const parts = [];
    for (const [id, mass] of this.solution.solutes) {
      if (mass >= MIN_ENTRY) {
        // 酸类标注浓/稀（阈值：≥300 g/L = 浓，与引擎"浓酸"判定一致——MnO2+浓盐酸制氯气等）
        const c = acidLabelOf(id, mass, this.solution.volume / 1000);
        parts.push(c ? `${id}(${c})` : id); // 微量溶质不显示化学式（防"出现/消失"闪烁）
      }
    }
    for (const [id] of this.precipitates) parts.push(`${id}(↓)`);
    if (parts.length === 0 && this.solution.water > 0) parts.push('H2O'); // 只有水的池子
    // 含指示剂时显示 pH 数值（石蕊/酚酞加入后即可读数）
    if (this.solution && this.solution.pH) {
      let hasIndicator = false;
      for (const [id] of this.solution.solutes) {
        if (getSubstance(id).indicator) {
          hasIndicator = true;
          break;
        }
      }
      if (hasIndicator) parts.push(`pH=${this.solution.pH().toFixed(1)}`);
    }
    if (parts.length) renderFormula(ctx, this.x + this.w / 2, this.y + this.h + 14, parts.join(' + '));
  }

  get material() {
    return this.mat;
  }

  get containerMaterial() {
    return this.mat;
  }

  /** 颗粒的沉降区域（世界坐标）；池/烧杯=内区，酒精灯=火焰附近 */
  grainRegion() {
    return this.innerRect();
  }

  /**
   * 增加沉淀（g）。point 为反应/放置位置（世界坐标）+ 生成宽幅；
   * 之后把颗粒数对账到与质量一致（避免逐次舍入导致收集后残留）。
   */
  addPrecipitate(id, mass, point, origin = null) {
    this.precipitates.set(id, (this.precipitates.get(id) ?? 0) + mass);
    // 记录该沉淀的生成来源（反应/放置/关卡预设），供调试悬停显示；未指明时保留已有来源或默认关卡生成
    if (origin) this.precipOrigins.set(id, origin);
    else if (!this.precipOrigins.has(id)) this.precipOrigins.set(id, { kind: 'level' });
    if (this.useGrains && mass > 0) this._syncGrains(id, point);
  }

  /** 记录溶质来源（反应/溶解/关卡预设），供调试悬停显示；未指明时保留已有来源或默认关卡生成 */
  noteSolOrigin(id, origin = null) {
    if (typeof origin === 'string' && origin) origin = { kind: 'reaction', text: origin }; // 引擎传回的方程式字符串归一化
    if (!origin) {
      if (!this.solOrigins.has(id)) this.solOrigins.set(id, { kind: 'level' });
      return;
    }
    this.solOrigins.set(id, origin);
  }

  takePrecipitate(id, mass) {
    const cur = this.precipitates.get(id) ?? 0;
    const r = Math.min(cur, mass);
    const n = cur - r;
    if (n <= 1e-9) {
      this.precipitates.delete(id);
      this.precipOrigins.delete(id); // 沉淀耗尽，来源一并清除
    } else this.precipitates.set(id, n);
    if (this.useGrains) this._syncGrains(id); // 移除多余颗粒
    return r;
  }

  /** 把某物质的视觉颗粒对账到"合并颗粒数"（与自由粒子同规则：
   *  常规 0.5g/颗，超出 GRAIN_MAX 按 1.5g（3×0.5g）合并——外观与自由粒子完全一致） */
  _syncGrains(id, point) {
    const mass = this.precipitates.get(id) ?? 0;
    let target = 0;
    let size = 5;
    if (mass > 1e-9) {
      const s = splitPile(mass, GRAIN_MAX); // { n, per }
      target = s.n;
      size = particleSizeOf(s.per); // 尺寸与自由粒子同公式（0.5g→5px；1.5g→7.5px）
    }
    let count = 0;
    for (const g of this.grains) if (g.id === id) count++;
    // 移除多余（从数组尾部删，即最近生成的）
    if (count > target) {
      let rm = count - target;
      for (let i = this.grains.length - 1; i >= 0 && rm > 0; i--) {
        if (this.grains[i].id === id) {
          this.grains.splice(i, 1);
          rm--;
        }
      }
      return;
    }
    // 补不足：从反应点生成；无反应点（预置沉淀）在区域内散落，让物理自然堆成小山
    const rg = this.grainRegion();
    const bx = point ? point.x : rg.x + rg.w / 2;
    // 生成 y 限制在沉降区域内（反应点常取玩家脚底，可能在池底线之下，直接钳回区内避免被裁剪）
    const spawnY = point
      ? Math.max(rg.y + 2, Math.min(point.y, rg.y + rg.h - 4))
      : rg.y + Math.random() * rg.h * 0.5; // 预置沉淀：区域上部散落，落下堆成小山
    const spread = point && point.spread ? point.spread : 16;
    const add = target - count;
    // 宽幅（玩家）时偏向两侧生成：从玩家左右两边冒出，不在中心、也不落在身体里
    // （spread=玩家宽，半宽=0.5×spread，所以偏移要 >0.5×spread 才在身体外）
    const edgeBias = spread > 40;
    for (let i = 0; i < add; i++) {
      // 无反应点（预置）：每颗在区域内随机 x，避免全部挤在同一点
      const sx0 = point
        ? (edgeBias
          ? bx + (Math.random() < 0.5 ? -1 : 1) * (spread * 0.55 + Math.random() * spread * 0.3)
          : bx + (Math.random() - 0.5) * spread)
        : rg.x + Math.random() * rg.w;
      // 生成 x 也钳回区域内（反应点靠池壁时避免生成帧即越界）
      const sx = Math.max(rg.x + 3, Math.min(rg.x + rg.w - 3, sx0));
      this.grains.push({
        id,
        x: sx,
        y: spawnY + (Math.random() - 0.5) * 4,
        vx: (Math.random() - 0.5) * 20,
        vy: 2,
        rest: false,
        r: size / 2, // 与自由粒子同尺寸（视觉完全一致，无随机大小）
      });
    }
    if (this.grains.length > GRAIN_MAX) this.grains.splice(0, this.grains.length - GRAIN_MAX);
  }

  /** 内部液体区域（默认整个区域；子类可覆盖，如池扣除盆壁） */
  innerRect() {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }

  /** 物体是否在容器内 */
  containsObj(obj) {
    const r = this.innerRect();
    return obj.right > r.x && obj.left < r.x + r.w && obj.bottom > r.y && obj.top < r.y + r.h;
  }

  update(dt, scene) {
    // 颗粒 = 圆形沙粒的接触动力学（冲量 + 摩擦 + 少量位置修正）：
    //  重力全程作用；接触时速度冲量抵消法向（不反弹、不抖），摩擦阻尼切向（堆能立住）；
    //  位置修正只处理重叠的一小部分（≤5px/帧），不整量瞬移；
    //  睡眠颗粒是不可动锚点（invMass=0），新颗粒架在它们上面，堆自然往上长；
    //  支撑丢失（被挖开/下方被推走）→ 唤醒下落。
    if (!this.useGrains || this.grains.length === 0) return;
    const rg = this.grainRegion();
    const floorY = rg.y + rg.h - 3;
    const G = 900;
    const MAX_FALL = 320;
    const grains = this.grains;
    // 玩家碰撞形状（当作容器内的"墙"：堆的压力与玩家边界在同一求解器里平衡，
    // 颗粒停在玩家轮廓外，不会在脚边被堆顶回去来回振荡）。腐蚀空洞无形状 → 颗粒可进入。
    const p = scene.player;
    const pShapes = p && p.solid && p.w > 0
      && p.x + p.w + 24 > rg.x && p.x - 24 < rg.x + rg.w && p.y + p.h + 24 > rg.y && p.y - 24 < rg.y + rg.h
      ? (p.getShapes ? p.getShapes() : [p.collider()])
      : null;

    // 1) 重力（非睡眠）
    for (const g of grains) {
      if (g.rest) continue;
      g.vy += G * dt;
      if (g.vy > MAX_FALL) g.vy = MAX_FALL;
      g.x += g.vx * dt;
      g.y += g.vy * dt;
    }

    // 2) 位置修正（多迭代，防重叠；睡眠=不可动锚点）+ 区域边界（硬）。
    //    每颗粒每帧总位移 ≤CAP（深嵌的弹出摊到多帧，不一次爆出去）
    const CAP = 8;
    const moved = new Float32Array(grains.length);
    for (let iter = 0; iter < 6; iter++) {
      for (let i = 0; i < grains.length; i++) {
        if (moved[i] >= CAP) continue;
        const a = grains[i];
        for (let j = i + 1; j < grains.length; j++) {
          if (moved[j] >= CAP) continue;
          const b = grains[j];
          if (a.rest && b.rest) continue;
          const ia = a.rest ? 0 : 1;
          const ib = b.rest ? 0 : 1;
          const tot = ia + ib;
          if (tot === 0) continue;
          const dx = b.x - a.x, dy = b.y - a.y;
          const d2 = dx * dx + dy * dy;
          const minD = a.r + b.r;
          if (d2 >= minD * minD || d2 < 1e-8) continue;
          const d = Math.sqrt(d2);
          const nx = dx / d, ny = dy / d;
          const corr = Math.min(minD - d, 5) / tot;
          let ax = -nx * corr * ia, ay = -ny * corr * ia;
          let bx = nx * corr * ib, by = ny * corr * ib;
          let ma = Math.hypot(ax, ay);
          if (moved[i] + ma > CAP && ma > 1e-9) { const k = (CAP - moved[i]) / ma; ax *= k; ay *= k; ma = Math.hypot(ax, ay); }
          let mb = Math.hypot(bx, by);
          if (moved[j] + mb > CAP && mb > 1e-9) { const k = (CAP - moved[j]) / mb; bx *= k; by *= k; mb = Math.hypot(bx, by); }
          a.x += ax; a.y += ay;
          b.x += bx; b.y += by;
          moved[i] += ma;
          moved[j] += mb;
        }
      }
      // 区域边界（硬）
      for (let gi = 0; gi < grains.length; gi++) {
        const g = grains[gi];
        // 开放平台（灯）：滚出平台左右边缘后不再贴"地板"，自由下落（由灯 update 移除）
        const onPlatform = !this.spillSides || (g.x + g.r > rg.x && g.x - g.r < rg.x + rg.w);
        if (g.y + g.r > floorY && onPlatform) { g.y = floorY - g.r; if (g.vy > 0) g.vy = 0; }
        if (g.y - g.r < rg.y) { g.y = rg.y + g.r; if (g.vy < 0) g.vy = 0; }
        if (!this.spillSides) {
          if (g.x - g.r < rg.x) { g.x = rg.x + g.r; if (g.vx < 0) g.vx *= -0.3; }
          else if (g.x + g.r > rg.x + rg.w) { g.x = rg.x + rg.w - g.r; if (g.vx > 0) g.vx *= -0.3; }
        }
        // 玩家形状当墙：把颗粒推出玩家身体（圆 vs AABB；与堆的压力在同一求解器平衡）
        if (pShapes) {
          for (const sh of pShapes) {
            const cx = Math.max(sh.x, Math.min(g.x, sh.x + sh.w));
            const cy = Math.max(sh.y, Math.min(g.y, sh.y + sh.h));
            const dx = g.x - cx, dy = g.y - cy;
            const d2 = dx * dx + dy * dy;
            if (d2 >= g.r * g.r) continue;
            let px = 0, py = 0, pm;
            if (dx === 0 && dy === 0) {
              // 圆心在形状内：沿最近面推出；脚底贴容器底 → 向两侧挤开
              const dl = g.x - sh.x, dr = sh.x + sh.w - g.x;
              const dt2 = g.y - sh.y, db = sh.y + sh.h - g.y;
              const m = Math.min(dl, dr, dt2, db);
              if (m === db && g.y + g.r >= floorY - 1) {
                px = g.x < sh.x + sh.w / 2 ? -1 : 1;
                pm = Math.min(dl, dr) + g.r;
              } else if (m === dl) { px = -1; pm = m + g.r; }
              else if (m === dr) { px = 1; pm = m + g.r; }
              else if (m === dt2) { py = -1; pm = m + g.r; }
              else { py = 1; pm = m + g.r; }
            } else {
              const d = Math.sqrt(d2);
              px = dx / d; py = dy / d;
              pm = g.r - d;
            }
            const mv = Math.min(Math.max(0, pm), 5 - moved[gi]);
            if (mv > 0) { g.x += px * mv; g.y += py * mv; moved[gi] += mv; }
            g.rest = false;
            break;
          }
        }
      }
    }

    // 3) 速度冲量：法向抵消（恢复 0，不弹起）+ 切向摩擦（阻尼相对滑速，堆立得住）
    for (let i = 0; i < grains.length; i++) {
      const a = grains[i];
      for (let j = i + 1; j < grains.length; j++) {
        const b = grains[j];
        if (a.rest && b.rest) continue;
        const ia = a.rest ? 0 : 1;
        const ib = b.rest ? 0 : 1;
        const tot = ia + ib;
        if (tot === 0) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        const minD = a.r + b.r;
        if (d2 >= minD * minD || d2 < 1e-8) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d, ny = dy / d;
        const rvn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rvn < 0) {
          const j = -rvn / tot;
          a.vx -= nx * j * ia;
          a.vy -= ny * j * ia;
          b.vx += nx * j * ib;
          b.vy += ny * j * ib;
        }
        // 切向摩擦：去掉 60% 相对切向速度（上限防过冲）
        const tx = -ny, ty = nx;
        const rvt = (b.vx - a.vx) * tx + (b.vy - a.vy) * ty;
        const cap = 50 / tot;
        const jt = Math.max(-cap, Math.min(cap, rvt * 0.6 / tot));
        a.vx += tx * jt * ia;
        a.vy += ty * jt * ia;
        b.vx -= tx * jt * ib;
        b.vy -= ty * jt * ib;
      }
    }

    // 4) 摩擦 + 睡眠/唤醒
    const SLEEP_SPEED = 18;
    for (const g of grains) {
      // 开放平台（灯）堆满到区域顶：顶部颗粒向两侧溢出滚落（小堆不触发，只有堆满才溢）
      const spillTop = this.spillSides && g.y - g.r <= rg.y + 1.5;
      if (spillTop && !g.rest) {
        g.vx += (g.x < rg.x + rg.w / 2 ? -1 : 1) * 30;
        g.sleepT = 0;
      }
      const floorSupport = g.y + g.r >= floorY - 0.5;
      let supported = floorSupport;
      if (!supported) {
        const gB = g.y + g.r;
        for (const o of grains) {
          if (o === g || o.y <= g.y) continue;
          const oTop = o.y - o.r;
          if (gB >= oTop - 1 && gB <= oTop + 6 && Math.abs(o.x - g.x) < (g.r + o.r) * 0.7) {
            supported = true;
            break;
          }
        }
      }
      if (g.rest) {
        // 睡眠颗粒：失去支撑 → 唤醒，防悬浮
        if (!supported) { g.rest = false; g.vy = 0; }
        continue;
      }
      // 入睡：速度低 + 有支撑 + 持续片刻（睡眠=不可动锚点，供后续颗粒架住）。
      // 残留的浅重叠（1.5-3px）允许入睡，由下面第 5 步的睡眠松弛单调化解（不造成跳动）
      if (supported && !spillTop && Math.hypot(g.vx, g.vy) < SLEEP_SPEED) {
        g.sleepT = (g.sleepT ?? 0) + dt;
        if (g.sleepT > 0.2) { g.rest = true; g.vx = 0; g.vy = 0; }
      } else {
        g.sleepT = 0;
      }
      // 全局阻尼（空气/滚动）：水平强（堆积稳定），垂直弱（重力主导）
      g.vx *= Math.max(0, 1 - 4 * dt);
      g.vy *= Math.max(0, 1 - 1 * dt);
    }

    // 5) 睡眠松弛：已睡着的颗粒若仍有**深度**重叠（>2.5px），每帧只互推 ≤1px（单调收敛），
    //    化解深重叠但不造成跳动；浅接触（≤2.5px）保留，堆保持紧凑不散平。
    //    水平重叠：两边各推一半；垂直堆叠：只把上面的推上去（下面有支撑，不动，避免地板振荡）
    for (let iter = 0; iter < 3; iter++) {
      for (let i = 0; i < grains.length; i++) {
        const a = grains[i];
        if (!a.rest) continue;
        for (let j = i + 1; j < grains.length; j++) {
          const b = grains[j];
          if (!b.rest) continue;
          const dx = b.x - a.x, dy = b.y - a.y;
          const d = Math.hypot(dx, dy);
          const minD = a.r + b.r;
          const pen = minD - d;
          if (pen < 2.5 || d < 1e-6) continue;
          if (Math.abs(dy) >= Math.abs(dx)) {
            // 上下堆叠：把上面的颗粒往上推
            const upper = a.y < b.y ? a : b;
            upper.y -= Math.min(pen - 1, 1);
          } else {
            const push = Math.min(pen - 1, 1) * 0.5;
            const nx = dx / d;
            a.x -= nx * push;
            b.x += nx * push;
          }
        }
      }
    }
    // 松弛后钳回沉降区域（松弛可能把靠墙颗粒横向推出；开放平台允许滚出左右边缘）
    for (const g of grains) {
      if (!this.spillSides) g.x = Math.max(rg.x + g.r, Math.min(rg.x + rg.w - g.r, g.x));
      g.y = Math.max(rg.y + g.r, Math.min(floorY - g.r, g.y));
    }
  }

  /**
   * 物理结算后：玩家与颗粒的碰撞（圆 vs 玩家碰撞形状的 AABB）。
   *  - 推出**有单帧位移上限**（不整量瞬移出体）：颗粒被玩家平滑地推开，多帧内完全让开；
   *  - 圆心在形状内 → 沿最近面推出；圆心在形状外但边缘重叠 → 沿法线推出；
   *  - 完全腐蚀掉的部分（无形状）颗粒可以进入停留；
   *  - 被推的颗粒唤醒 + 温和踢开（顺着玩家速度 + 侧向，不猛烈上抛）；
   *  - 密集堆按穿透量给玩家阻力 → 明显减速/挡路，稀疏堆可轻松穿过。
   */
  lateUpdate(dt, scene) {
    if (!this.useGrains || this.grains.length === 0) return;
    const rg = this.grainRegion();
    const floorY = rg.y + rg.h - 3;
    const p = scene.player;
    if (!p || !p.solid || p.w <= 0) return;
    // 快速排除：玩家不在容器附近
    if (p.x + p.w + 24 < rg.x || p.x - 24 > rg.x + rg.w || p.y + p.h + 24 < rg.y || p.y - 24 > rg.y + rg.h) return;
    const shapes = p.getShapes ? p.getShapes() : [p.collider()];
    const moving = Math.abs(p.vel.x) > 20;
    let resist = 0;
    for (const g of this.grains) {
      let hit = false;
      let penMax = 0;
      for (const sh of shapes) {
        // 圆 vs AABB：最近点
        const cx = Math.max(sh.x, Math.min(g.x, sh.x + sh.w));
        const cy = Math.max(sh.y, Math.min(g.y, sh.y + sh.h));
        const dx = g.x - cx;
        const dy = g.y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 >= g.r * g.r) continue; // 未接触
        const d = Math.sqrt(Math.max(d2, 1e-9));
        const pen = g.r - d;
        if (pen > penMax) penMax = Math.min(pen, 6);
        if (dx === 0 && dy === 0) {
          // 圆心在形状内：沿最近面推出
          const dl = g.x - sh.x, dr = sh.x + sh.w - g.x;
          const dt2 = g.y - sh.y, db = sh.y + sh.h - g.y;
          const m = Math.min(dl, dr, dt2, db);
          // 最近面是下底面且已贴容器底：向下会被地板挡回（玩家脚底伸进沉淀堆时）→ 向两侧挤开
          if (m === db && g.y + g.r >= floorY - 1) {
            const mv = Math.min(Math.min(dl, dr) + g.r, 8);
            g.x += (dl < dr ? -1 : 1) * mv;
          } else {
            const mv = Math.min(m + g.r, 8);
            if (m === dl) g.x -= mv;
            else if (m === dr) g.x += mv;
            else if (m === dt2) g.y -= mv;
            else g.y += mv;
          }
        } else {
          // 圆心在形状外但边缘重叠：沿法线推出
          const nx = dx / d, ny = dy / d;
          const mv = Math.min(pen, 8);
          g.x += nx * mv;
          g.y += ny * mv;
        }
        g.rest = false;
        // 温和踢开：顺着玩家速度 + 侧向，不猛烈上抛
        if (moving) {
          g.vx = p.vel.x * 0.25 + (g.x < sh.x + sh.w / 2 ? -30 : 30);
          g.vy = Math.min(g.vy, -12);
        } else {
          g.vx += g.x < sh.x + sh.w / 2 ? -18 : 18;
          g.vy = Math.min(g.vy, -4);
        }
        hit = true;
        break; // 一次处理一个形状（其余下帧继续）
      }
      if (hit) {
        // 限制在沉降区域内（开放平台不挡左右：允许滚出边缘由灯处理滚落）
        if (!this.spillSides) g.x = Math.max(rg.x + g.r, Math.min(rg.x + rg.w - g.r, g.x));
        g.y = Math.max(rg.y + g.r, Math.min(floorY - g.r, g.y));
      }
      // 阻力：与穿透量成正比 → 密集堆显著减速（挡路），稀疏/少量轻微（可进池）
      resist += penMax * 0.004;
    }
    if (resist > 0) p._grainResist = (p._grainResist ?? 0) + Math.min(0.9, resist);
  }

  /** 颗粒裁剪路径（默认矩形；酒精灯覆写为拱形小山） */
  grainClip(ctx, rg) {
    ctx.beginPath();
    ctx.rect(rg.x, rg.y, rg.w, rg.h);
  }

  /** 渲染视觉颗粒：与自由沉淀粒子同一绘制（辉光/高光/深色白色光晕），
   *  按 grainClip 裁剪（clipGrains=false 时不裁剪）——两套沉淀外观完全一致 */
  renderGrains(ctx) {
    if (!this.useGrains) return;
    const rg = this.grainRegion();
    ctx.save();
    if (this.clipGrains) {
      this.grainClip(ctx, rg);
      ctx.clip();
    }
    for (const g of this.grains) {
      const sub = getSubstance(g.id);
      const c = sub.solid && sub.solid.length ? sub.solid[0] : '#c9b46a';
      renderPrecipitateBall(ctx, g.x, g.y, g.r * 2, c);
    }
    ctx.restore();
  }
}
