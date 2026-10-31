// ============================================================================
// 气室（GasChamber）对象测试
// ----------------------------------------------------------------------------
// 对象级测试：用 Scene 实例 + 直接 seed 验证独立大气/独占预设/矩形重叠/渲染冒烟，
// 不依赖尚未完成的 Scene 区域边界集成。
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene } from '../src/core/scene.js';
import { Obj } from '../src/objects/obj.js';
import { GasChamber } from '../src/objects/gaschamber.js';
import { Block } from '../src/objects/block.js';
import { Lamp } from '../src/objects/lamp.js';

const TICK = 1 / 30;

/** 假 canvas 上下文（同 tests/render.test.js：任意方法 noop，渐变返回 addColorStop 桩） */
function fakeCtx() {
  const calls = [];
  const ctx = new Proxy({}, {
    get(t, prop) {
      if (prop in t) return t[prop];
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
        return () => ({ addColorStop: () => {} });
      }
      return (...args) => { calls.push([prop, args]); };
    },
    set(t, prop, v) { t[prop] = v; return true; },
  });
  ctx._calls = calls;
  return ctx;
}

// ---- 1. 默认大气 = 关卡外部大气；无碰撞、不参与物理 ---------------------------
test('默认大气：seed 复制外部大气的组成与基准总质量', () => {
  const scene = new Scene({ worldW: 1600, worldH: 800 });
  scene.atmosphere.preset({ N2: 1500, O2: 500 }); // 关卡大气（外部大气才是"默认"）
  const chamber = new GasChamber({ x: 200, y: 300, id: 'gc1' });
  scene.addObject(chamber);

  // 无碰撞：不挡人、不进物理索引
  assert.equal(chamber.solid, false, '气室不实心');
  assert.equal(chamber.physicsKind, 'none', '气室不参与物理');
  assert.ok(!scene.statics.includes(chamber) && !scene.dynamics.includes(chamber), '气室不进物理索引');
  assert.ok(scene.objects.includes(chamber), '气室应进入场景 objects（渲染/逻辑）');
  // 类型标签
  assert.equal(chamber.isGasChamber, true);
  assert.equal(chamber.hoverLabel, '气室');

  assert.equal(chamber._seeded, false, '构造后尚未 seed');
  chamber.seed(scene);
  assert.equal(chamber._seeded, true);
  assert.equal(chamber.atmosphere.mass('N2'), 1500, 'N2 应复制外部大气');
  assert.equal(chamber.atmosphere.mass('O2'), 500, 'O2 应复制外部大气');
  assert.equal(chamber.atmosphere.total(), 2000, '总质量 = 外部大气总质量');
  assert.equal(chamber.atmosphere._baseTotal, scene.atmosphere._baseTotal, '基准总质量一并复制');
  // 主成分 N2 没有 gasColor → 缺省青灰（与集气瓶一致）
  assert.equal(chamber.dominantGas()[0], 'N2');
  assert.equal(chamber.gasColor(), '#78dcff');
  // 内部 Map 与外部 Map 是两份独立数据
  assert.notEqual(chamber.atmosphere.gas, scene.atmosphere.gas, '内部大气是独立的一份 Map');
});

test('update 首刻幂等 seed：Scene 未显式调用 seed 时也能独立初始化', () => {
  const scene = new Scene();
  scene.atmosphere.preset({ CO2: 400, N2: 100 });
  const chamber = new GasChamber({ x: 0, y: 0 });
  scene.addObject(chamber);

  chamber.update(TICK, scene);
  assert.equal(chamber._seeded, true, '首刻 update 应完成 seed');
  assert.equal(chamber.atmosphere.mass('CO2'), 400);

  // 幂等：内部已有变化时再次 update 不会重新复制外部大气/清掉内部气体
  chamber.atmosphere.add('CO2', 50);
  scene.atmosphere.preset({ O2: 999 });
  chamber.update(TICK, scene);
  assert.equal(chamber.atmosphere.mass('CO2'), 450, '内部变化应保留（不重复 seed）');
  assert.equal(chamber.atmosphere.mass('O2'), 0, '外部大气变化不再同步进已 seed 的气室');
});

// ---- 2. seed 之后内外大气互不影响 ---------------------------------------------
test('seed 之后：改外部大气不影响气室；气室内变化也不回灌外部', () => {
  const scene = new Scene();
  scene.atmosphere.preset({ N2: 1500, O2: 500 });
  const chamber = new GasChamber({ x: 0, y: 0 });
  chamber.seed(scene);

  // 外部大气：加气、减气、重新 preset 都不应影响气室
  scene.atmosphere.add('CO2', 300);
  scene.atmosphere.remove('O2', 200);
  scene.atmosphere.preset({ N2: 10 });
  assert.equal(chamber.atmosphere.mass('N2'), 1500, '气室 N2 不变');
  assert.equal(chamber.atmosphere.mass('O2'), 500, '气室 O2 不变');
  assert.equal(chamber.atmosphere.mass('CO2'), 0, '外部新增 CO2 不应进入气室');

  // 反向：气室内加气不影响外部大气
  chamber.atmosphere.add('H2', 5);
  chamber.atmosphere.remove('N2', 100);
  assert.equal(scene.atmosphere.mass('H2'), 0, '气室产气不应进外部大气');
  assert.equal(scene.atmosphere.mass('N2'), 10, '气室消耗不应扣外部大气');
});

// ---- 3. 配置 gases：preset 独占语义 ------------------------------------------
test('气室纯 Cl2 中 Cu 可被点燃燃烧：Cu + Cl2 → CuCl2（不需要 O2）', () => {
  const scene = new Scene({ worldW: 1000, worldH: 800 });
  const chamber = new GasChamber({ x: 100, y: 100, w: 360, h: 320, gases: { Cl2: 200 }, id: 'gccl2' });
  scene.addObject(chamber);
  const cu = new Block({ x: 200, y: 240, w: 60, h: 60, substance: 'Cu', mass: 20, id: 'cu' });
  scene.addObject(cu);
  const lamp = new Lamp({ x: 200, y: 300, w: 80, h: 20, autoOn: true, id: 'lamp' });
  scene.addObject(lamp);
  scene.status = 'running';
  const before = cu.grid.avail('Cu');
  for (let i = 0; i < 180; i++) scene.step(TICK);
  assert.ok(cu.grid.avail('Cu') < before - 0.05, `Cu 应被 Cl2 消耗：${before} → ${cu.grid.avail('Cu')}`);
  assert.ok(chamber.atmosphere.mass('Cl2') < 200, '气室内 Cl2 应被消耗');
  assert.ok(cu.grid.avail('CuCl2') > 0.01 || scene.particles.some((p) => p.substance === 'CuCl2'), '应生成 CuCl2');
});

test('配置 gases：独占语义（没配置 = 没有，配置 0 = 0g，不清空成外部大气）', () => {
  const scene = new Scene();
  scene.atmosphere.preset({ N2: 1500, O2: 500 });
  const chamber = new GasChamber({ x: 0, y: 0, gases: { CO2: 300, O2: 0 } });
  chamber.seed(scene);

  assert.equal(chamber.atmosphere.mass('CO2'), 300, '配置的 CO2 = 300g');
  assert.equal(chamber.atmosphere.mass('O2'), 0, '配置 O2:0 → 氧气为 0');
  assert.equal(chamber.atmosphere.mass('N2'), 0, '没配置的 N2 = 0（不是复制外部大气的 1500）');
  assert.equal(chamber.atmosphere.total(), 300, '总质量 = 配置气体之和');
  assert.equal(chamber.dominantGas()[0], 'CO2');
});

test('gases 为空对象/null：视为不配置 → 复制外部大气', () => {
  const scene = new Scene();
  scene.atmosphere.preset({ N2: 1500, O2: 500 });
  for (const gases of [null, {}]) {
    const chamber = new GasChamber({ x: 0, y: 0, gases });
    chamber.seed(scene);
    assert.equal(chamber.atmosphere.mass('N2'), 1500, `gases=${JSON.stringify(gases)} 应复制外部 N2`);
    assert.equal(chamber.atmosphere.mass('O2'), 500, `gases=${JSON.stringify(gases)} 应复制外部 O2`);
  }
});

// ---- 4. 内部判定：矩形重叠（用户定案） ---------------------------------------
test('containsPoint：矩形内（含边界）为真，外部为假', () => {
  const c = new GasChamber({ x: 200, y: 300, w: 160, h: 120 }); // 覆盖 [200,360]×[300,420]
  assert.ok(c.containsPoint(280, 360), '中心点在内部');
  assert.ok(c.containsPoint(200, 300), '左上角（含边界）在内部');
  assert.ok(c.containsPoint(360, 420), '右下角（含边界）在内部');
  assert.ok(c.containsPoint(200.1, 300.1), '边界内一点点在内部');
  assert.ok(!c.containsPoint(199.9, 360), '左侧外为假');
  assert.ok(!c.containsPoint(360.1, 360), '右侧外为假');
  assert.ok(!c.containsPoint(280, 299.9), '上方外为假');
  assert.ok(!c.containsPoint(280, 420.1), '下方外为假');
  assert.ok(!c.containsPoint(-100, 360), '远处为假');
});

test('overlapsRect：有重叠即算相交；仅边贴边/完全在外不算', () => {
  const c = new GasChamber({ x: 200, y: 300, w: 160, h: 120 });
  assert.ok(c.overlapsRect({ x: 220, y: 320, w: 40, h: 40 }), '完全在内 → 相交');
  assert.ok(c.overlapsRect({ x: 150, y: 330, w: 100, h: 20 }), '只压左边缘一部分 → 相交');
  assert.ok(c.overlapsRect({ x: 100, y: 100, w: 400, h: 400 }), '把气室包住 → 相交');
  assert.ok(!c.overlapsRect({ x: 360, y: 300, w: 40, h: 40 }), '右边缘贴边（无面积重叠）→ 不相交');
  assert.ok(!c.overlapsRect({ x: 380, y: 300, w: 40, h: 40 }), '完全在右外 → 不相交');
});

test('containsObj：与气室有重叠即视为在内部（部分压边也算）', () => {
  const c = new GasChamber({ x: 200, y: 300, w: 160, h: 120 }); // 右边界 360、下边界 420
  const inside = new Obj({ x: 250, y: 350, w: 20, h: 20 });
  const pressLeft = new Obj({ x: 190, y: 350, w: 30, h: 20 }); // 一半压在左边缘上
  const pressTop = new Obj({ x: 280, y: 280, w: 20, h: 40 }); // 一半压在顶边上
  const outside = new Obj({ x: 400, y: 350, w: 20, h: 20 });
  const touchRight = new Obj({ x: 360, y: 350, w: 20, h: 20 }); // 左边贴住气室右边界
  const touchBottom = new Obj({ x: 280, y: 420, w: 20, h: 20 }); // 顶边贴住气室下边界
  assert.ok(c.containsObj(inside), '完全在内 → 内部');
  assert.ok(c.containsObj(pressLeft), '部分压在左边缘（有面积重叠）→ 内部');
  assert.ok(c.containsObj(pressTop), '部分压在顶边（有面积重叠）→ 内部');
  assert.ok(!c.containsObj(outside), '完全在右外 → 外部');
  assert.ok(!c.containsObj(touchRight), '仅贴右边界（无面积重叠）→ 外部');
  assert.ok(!c.containsObj(touchBottom), '仅贴下边界（无面积重叠）→ 外部');
});

// ---- 5. 编辑器命中：只认边框带 + 四角括号，内部让给腔内物体 -------------------
test('editorHit：边框 10px 带/四角括号可选中，内部与远处不可选中', () => {
  const c = new GasChamber({ x: 200, y: 300, w: 160, h: 120 });
  assert.ok(c.editorHit(200, 360), '左边框带可选中');
  assert.ok(c.editorHit(280, 300), '上边框带可选中');
  assert.ok(c.editorHit(360, 360), '右边框带可选中');
  assert.ok(c.editorHit(280, 420), '下边框带可选中');
  assert.ok(c.editorHit(206, 306), '四角括号区域可选中');
  assert.ok(c.editorHit(354, 414), '四角括号区域可选中');
  assert.ok(c.editorHit(196, 360), '边框带外侧 4px（抓边）可选中');
  assert.ok(!c.editorHit(280, 360), '正中内部不可选中（让给腔内物体）');
  assert.ok(!c.editorHit(300, 380), '内部远离边框不可选中');
  assert.ok(!c.editorHit(189, 360), '边框带外 11px 不可选中');
});

// ---- 6. 渲染冒烟：假 ctx + 无 scene（编辑器预览）都不抛错 ---------------------
test('render：假 ctx / 无 scene / 无 opts 均不抛错，save-restore 配平', () => {
  const ctx = fakeCtx();
  const chamber = new GasChamber({ x: 100, y: 100, gases: { CO2: 300 } });

  // 编辑器预览：无 scene、未 seed 也照常画静态框（不抛错）
  assert.doesNotThrow(() => chamber.render(ctx, { time: 0 }), '无 scene 静态框渲染');
  assert.doesNotThrow(() => chamber.render(ctx, { scene: null, time: 1.2 }), 'scene=null 渲染');
  assert.doesNotThrow(() => chamber.render(ctx), '无 opts 渲染');

  // 游戏内：seed 后按当前大气主成分色填充（Cl2 声明了 gasColor；未配置 gases → 复制外部大气）
  const scene = new Scene();
  scene.atmosphere.preset({ Cl2: 200 });
  const fresh = new GasChamber({ x: 0, y: 0 });
  fresh.seed(scene);
  assert.equal(fresh.gasColor(), '#b8e01f', '主成分 Cl2 的黄绿色');
  assert.doesNotThrow(() => fresh.render(ctx, { scene, time: 2.5 }), '有 scene 渲染');

  const calls = ctx._calls;
  assert.ok(calls.some(([m]) => m === 'fill'), '应绘制腔体/气体填充');
  assert.ok(calls.some(([m]) => m === 'stroke'), '应绘制边框/四角括号');
  const saves = calls.filter(([m]) => m === 'save').length;
  const restores = calls.filter(([m]) => m === 'restore').length;
  assert.equal(saves, restores, `save/restore 应配平：${saves}/${restores}`);
});
