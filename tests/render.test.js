// ============================================================================
// 渲染模块单元测试
// 覆盖：MaterialGrid 建模（质量/最小AABB/侵蚀/转化/附着生长）、相机缩放居中、
//       溶液颜色、渲染器与网格渲染冒烟（伪 ctx）。
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MaterialGrid, CELL_SIZE, CELL_MASS, renderGrid } from '../src/render/gridrender.js';
import { Camera } from '../src/render/camera.js';
import { Renderer } from '../src/render/renderer.js';
import { Solution } from '../src/chem/solution.js';
import { solutionColor } from '../src/render/liquidrender.js';
import { hexToRgb } from '../src/render/color.js';

const approx = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg ?? ''} ${a} vs ${b}`);

// ---- 1. 网格创建与质量 ---------------------------------------------------------
test('矩形/椭圆网格：尺寸与质量', () => {
  const rect = MaterialGrid.rect(50, 40, 'CuO'); // 10×8 格
  assert.equal(rect.cols, 10);
  assert.equal(rect.rows, 8);
  approx(rect.totalMass(), 8); // 80 格 × 0.1g
  approx(rect.avail('CuO'), 8);

  const ell = MaterialGrid.ellipse(50, 40, 'Fe');
  assert.ok(ell.totalMass() < 8, '椭圆填充格应少于外接矩形');
  assert.ok(ell.totalMass() > 3, '椭圆中心应被填充');
});

test('按质量生成：100g 玩家椭圆 ≈ 1000 格', () => {
  const p = MaterialGrid.ellipseForMass(100, 'NaOH');
  assert.ok(Math.abs(p.totalMass() - 100) < 8, `质量=${p.totalMass()}`);
});

// ---- 2. 最小外接 AABB ---------------------------------------------------------
test('最小外接 AABB', () => {
  const g = MaterialGrid.rect(25, 20, 'Fe'); // 5×4
  for (let y = 0; y < 4; y++) g.set(0, y, null); // 删整列 → 左移一格
  assert.deepEqual(g.minAABB(), { x: CELL_SIZE, y: 0, w: 4 * CELL_SIZE, h: 4 * CELL_SIZE });
  approx(g.totalMass(), 16 * CELL_MASS);
});

// ---- 3. 侵蚀（从外圈消耗） ---------------------------------------------------
test('侵蚀：从外圈消耗并缩小，耗尽后 AABB 为空', () => {
  const g = MaterialGrid.rect(25, 25, 'Cu'); // 5×5 = 2.5g
  const before = g.totalMass();
  const removed = g.consume('Cu', 0.5); // 5 格
  approx(removed, 0.5);
  approx(g.totalMass(), before - 0.5);
  assert.ok(g.isFilled(2, 2), '中心格应保留');
  assert.equal(g.minAABB().w, 5 * CELL_SIZE, '只删外圈 5 格，外接框不变');

  const gone = g.consume('Cu', 100); // 全部
  approx(gone, before - 0.5);
  approx(g.totalMass(), 0);
  assert.equal(g.minAABB(), null);
});

// ---- 4. 转化（反应产物附着） -------------------------------------------------
test('转化：边界格物质改变且质量不变', () => {
  const g = MaterialGrid.rect(15, 15, 'NaOH'); // 3×3 = 0.9g
  const converted = g.convert('NaOH', 'NaCl', 0.2); // 2 格
  approx(converted, 0.2);
  approx(g.totalMass(), 0.9);
  assert.ok(g.avail('NaOH') > 0);
  approx(g.avail('NaCl'), 0.2);
});

// ---- 5. 附着生长 ---------------------------------------------------------------
test('附着生长：底部新增一行格子', () => {
  const g = MaterialGrid.rect(15, 15, 'NaOH'); // 3×3
  const added = g.addEdge('Cu(OH)2', 0.3, 'bottom'); // 3 格 = 整行
  approx(added, 0.3);
  assert.equal(g.rows, 4);
  approx(g.avail('Cu(OH)2'), 0.3);
  for (let x = 0; x < 3; x++) assert.equal(g.get(x, 3), 'Cu(OH)2');
});

test('附着生长：先补满底行空位，再开新行（防越撑越大）', () => {
  const g = MaterialGrid.rect(15, 15, 'NaOH');
  g.set(1, 2, null); // 底行中间挖空
  const added = g.addEdge('CuO', 0.2, 'bottom');
  assert.equal(added, 0.2);
  assert.equal(g.get(1, 2), 'CuO', '底行空位应先被补满');
  assert.equal(g.get(0, 3), 'CuO', '剩余部分长出新行');
  assert.equal(g.get(1, 3), null);
  assert.equal(g.get(2, 3), null);
});

// ---- 6. 相机 -------------------------------------------------------------------
test('相机：等比缩放并居中', () => {
  const cam = new Camera({ worldW: 1000, worldH: 800 });
  const r = cam.compute(800, 600);
  assert.equal(r.scale, 0.75);
  assert.equal(r.offsetX, 25);
  assert.equal(r.offsetY, 0);

  const r2 = cam.compute(1200, 600);
  assert.equal(r2.scale, 0.75);
  assert.equal(r2.offsetX, 225);
  assert.equal(r2.offsetY, 0);

  const r3 = cam.compute(500, 500);
  assert.equal(r3.scale, 0.5);
  assert.equal(r3.offsetX, 0);
  assert.equal(r3.offsetY, 50);
});

test('相机：大世界跟随焦点滚动', () => {
  const cam = new Camera({ worldW: 2000, worldH: 800 });
  // 玩家在左端 → 视口靠在左
  const left = cam.compute(800, 600, { x: 100, y: 500, w: 40, h: 40 });
  assert.equal(left.ox, 0);
  // 玩家在中部 → 视口居中跟随
  const mid = cam.compute(800, 600, { x: 1000, y: 500, w: 40, h: 40 });
  assert.ok(mid.ox > 0 && mid.ox < 1000, `mid.ox=${mid.ox}`);
  // 玩家在右端 → 视口靠在右（钳制）
  const right = cam.compute(800, 600, { x: 1900, y: 500, w: 40, h: 40 });
  assert.equal(right.ox, 1000, '应钳制在右侧');
});

// ---- 7. 溶液颜色 ---------------------------------------------------------------
test('溶液颜色：无色→饱和平滑过渡', () => {
  const empty = solutionColor(new Solution({ volume: 300 }));
  assert.equal(empty.color, '#aaaaaa');
  assert.ok(empty.alpha < 0.15);

  const cu = solutionColor(new Solution({ volume: 300, solutes: { CuSO4: 150 } }));
  assert.equal(cu.color, '#00e7ff', '饱和显色应为离子色');
  assert.equal(cu.alpha, 0.85);

  const dilute = solutionColor(new Solution({ volume: 300, solutes: { CuSO4: 1.5 } }));
  // 极稀：接近无色（颜色应偏向 #aaa，透明度略高于无色）
  assert.ok(dilute.alpha > 0.12 && dilute.alpha < 0.85, `稀释透明度 ${dilute.alpha}`);
  const rgb = hexToRgb(dilute.color);
  const neutral = hexToRgb('#aaaaaa');
  const closeToNeutral = Math.abs(rgb.r - neutral.r) < 40 && Math.abs(rgb.b - neutral.b) < 40;
  assert.ok(closeToNeutral, '极稀溶液应接近无色');

  // 中等浓度：颜色介于无色与饱和之间
  const mid = solutionColor(new Solution({ volume: 300, solutes: { CuSO4: 30 } }));
  const ion = hexToRgb('#00e7ff');
  const mr = hexToRgb(mid.color);
  assert.ok(mr.b < ion.b && mr.b > neutral.b, `中等浓度蓝色应介于中间 ${mid.color}`);
});

// ---- 8. 渲染冒烟 -----------------------------------------------------------------
test('renderGrid：逐格填充，透明度随剩余质量', () => {
  const fills = [];
  const alphas = [];
  const ctx = {
    globalAlpha: 1,
    fillStyle: '',
    save() {},
    restore() {},
    fillRect(...args) { fills.push(args); },
    set globalAlpha(v) { alphas.push(v); this._a = v; },
    get globalAlpha() { return this._a; },
  };
  const grid = MaterialGrid.rect(15, 15, 'Fe'); // 3×3
  // 部分溶解一格 → 透明度应低于 1
  grid.cell(1, 1).set('Fe', 0.03);
  renderGrid(ctx, grid, 10, 20);
  // 游程合并：同色连续格合成一条填充（3×3 满格 + 中间半透一格 → 上/下行 1 段 + 中间行 3 段 = 5 次）
  assert.ok(fills.length <= 9 && fills.length >= 5, `合并后填充次数 ${fills.length}（原逐格 9）`);
  // 全覆盖校验：3×3 每格都被绘制（段合并后由矩形覆盖）
  const covered = new Set();
  for (const [fx, fy, fw, fh] of fills) {
    for (let cx = 0; cx < 3; cx++) {
      for (let cy = 0; cy < 3; cy++) {
        if (fx <= 10 + cx * CELL_SIZE && 10 + (cx + 1) * CELL_SIZE <= fx + fw && fy <= 20 + cy * CELL_SIZE && 20 + (cy + 1) * CELL_SIZE <= fy + fh) {
          covered.add(cx + ',' + cy);
        }
      }
    }
  }
  assert.equal(covered.size, 9, `9 格应全部被绘制（覆盖 ${covered.size}）`);
  assert.deepEqual(fills[0].slice(0, 2), [10, 20], '首段起点=网格原点');
  assert.ok(fills[0][2] >= CELL_SIZE, `首段宽度 ≥ 单格（同色行合并）: ${fills[0][2]}`);
  assert.ok(alphas.some((a) => a < 0.5), '半溶解格应半透明');
  assert.ok(alphas.some((a) => a > 0.9), '满格应不透明');
});

test('渲染器冒烟：清屏、缩放、逐对象渲染', () => {
  const calls = [];
  const fakeCtx = new Proxy({}, {
    get(t, prop) {
      if (prop in t) return t[prop];
      // 渐变方法返回带 addColorStop 的假渐变对象
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
        return () => ({ addColorStop: () => {} });
      }
      return (...args) => { calls.push([prop, args]); };
    },
    set(t, prop, v) { t[prop] = v; return true; },
  });
  const fakeCanvas = { width: 0, height: 0, getContext: () => fakeCtx };
  const renderer = new Renderer(fakeCanvas);
  renderer.resize(800, 600);

  let objRendered = false;
  const obj = { render: (ctx) => { objRendered = true; ctx.fillRect(1, 2, 3, 4); } };
  renderer.frame([obj]);

  assert.ok(objRendered, '对象 render 应被调用');
  assert.ok(calls.some(([m]) => m === 'clearRect'), '应清屏');
  assert.ok(calls.some(([m]) => m === 'setTransform'), '应设置相机变换');
  assert.ok(calls.some(([m, a]) => m === 'fillRect' && a[0] === 1), '对象应绘制');
});
