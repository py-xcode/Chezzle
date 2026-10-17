// 推物块上小设备（开关/提取器）：玩家与物块都应能自动上台阶
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene } from '../src/core/scene.js';
import { Player } from '../src/objects/player.js';
import { Block } from '../src/objects/block.js';
import { Floor } from '../src/objects/floor.js';
import { Switch } from '../src/objects/switch.js';
import { Extractor } from '../src/objects/extractor.js';
import { Lamp } from '../src/objects/lamp.js';
import { BlastLamp } from '../src/objects/blastlamp.js';
import { CFG } from '../src/core/config.js';

/** 地面 + 待越过的设备；推的时候记录"玩家/物块最大抬升"，证明两者都越过了设备高度 */
function pushScene(device) {
  const sc = new Scene({ worldW: 1500, worldH: 800 });
  sc.addObject(new Floor({ x: 0, y: 700, w: 1200, h: 100, id: 'ground' }));
  sc.addObject(device);
  const blk = new Block({ x: device.x - 80, y: 640, substance: 'Zn', w: 60, h: 60, id: 'b1' });
  sc.addObject(blk);
  const p = new Player({ x: device.x - 160, y: 610, substance: 'NaOH', mass: 30, id: 'p1' });
  sc.addObject(p);
  sc.status = 'running';
  for (let i = 0; i < 30; i++) sc.step(1 / 30);   // 落地
  return { sc, blk, p };
}
/** 一路往右推，返回玩家/物块的最大抬升量（相对地面） */
function pushRight(sc, n) {
  const blk = sc.byId.b1, p = sc.byId.p1;
  let riseB = 0, riseP = 0;
  for (let i = 0; i < n; i++) {
    sc.control.add('right');
    sc.step(1 / 30);
    riseB = Math.max(riseB, 700 - blk.bottom);
    riseP = Math.max(riseP, 700 - p.bottom);
  }
  return { riseB, riseP };
}

test('开关自带可上台阶高度：22px 高的压力开关高过全局 autoStepMax', () => {
  const sw = new Switch({ x: 0, y: 0, id: 'sw' });
  assert.equal(sw.h, 22, '开关默认高 22');
  assert.ok(sw.h > CFG.player.autoStepMax, '确实高于全局 autoStepMax（旧版上不去的原因）');
  assert.ok(sw.stepMax >= sw.h, `开关 stepMax=${sw.stepMax} 应 ≥ 自身高度`);
});

test('玩家推物块：两者都能越过 22px 压力开关的高度', () => {
  const sw = new Switch({ x: 400, y: 700 - 22, w: 40, h: 22, mode: 'pressure', id: 'sw1' });
  const { sc, blk } = pushScene(sw);
  const { riseB, riseP } = pushRight(sc, 200);
  assert.ok(blk.x > sw.x + 40, `物块应被推过开关：x=${blk.x.toFixed(1)}`);
  assert.ok(riseB >= 20, `物块应被推上开关高度：抬升 ${riseB.toFixed(1)}px（开关 22px）`);
  assert.ok(riseP >= 20, `玩家也应跟着上台阶：抬升 ${riseP.toFixed(1)}px`);
});

test('提取器（薄板）同样能被推上去：两者抬升都 ≥ 提取器高度', () => {
  const ex = new Extractor({ x: 400, y: 700 - 11, w: 50, h: 11, id: 'ex1' });
  const { sc, blk } = pushScene(ex);
  const { riseB, riseP } = pushRight(sc, 200);
  assert.ok(blk.x > ex.x + 50, `物块应被推过提取器：x=${blk.x.toFixed(1)}`);
  assert.ok(riseB >= 10, `物块抬升 ${riseB.toFixed(1)}px（提取器 11px）`);
  assert.ok(riseP >= 10, `玩家抬升 ${riseP.toFixed(1)}px`);
});

test('高障碍（远超 stepMax）依旧挡住：不该变成万能爬坡', () => {
  const sc = new Scene({ worldW: 1500, worldH: 800 });
  sc.addObject(new Floor({ x: 0, y: 700, w: 1200, h: 100, id: 'ground' }));
  sc.addObject(new Floor({ x: 400, y: 580, w: 60, h: 120, id: 'wall' }));
  const p = new Player({ x: 300, y: 610, substance: 'NaOH', mass: 30, id: 'p1' });
  sc.addObject(p);
  sc.status = 'running';
  for (let i = 0; i < 30; i++) sc.step(1 / 30);
  for (let i = 0; i < 200; i++) { sc.control.add('right'); sc.step(1 / 30); }
  assert.ok(p.right <= 404, `玩家不该翻过 120 高的墙：right=${p.right.toFixed(1)}`);
});

test('酒精灯/喷灯自带可上台阶高度：默认 40 高，远高于全局 autoStepMax', () => {
  const lamp = new Lamp({ x: 0, y: 0, id: 'lamp' });
  const blast = new BlastLamp({ x: 0, y: 0, id: 'blast' });
  assert.equal(lamp.h, 40, '酒精灯默认高 40');
  assert.equal(blast.h, 40, '喷灯默认高 40');
  assert.ok(lamp.h > CFG.player.autoStepMax, '确实高于全局 autoStepMax（旧版推不过去的原因）');
  for (const l of [lamp, blast]) assert.ok(l.stepMax >= l.h, `${l.hoverLabel} stepMax=${l.stepMax} 应 ≥ 自身高度`);
});

// 灯 40 高：物块被抬到灯顶后与地面的玩家已经脱开（高度差 > 玩家身高），所以"推物块越灯"
// 必须玩家也跟着上台阶——这正是灯要给 stepMax 的原因。
for (const [name, make] of [['酒精灯', () => new Lamp({ x: 400, y: 660, w: 40, h: 40, id: 'dev1' })],
                            ['喷灯', () => new BlastLamp({ x: 400, y: 660, w: 40, h: 40, id: 'dev1' })],
                            ['矮炉条喷灯', () => new BlastLamp({ x: 400, y: 686, w: 90, h: 14, id: 'dev1' })]]) {
  test(`玩家推物块：能跨过 40px 高的${name}`, () => {
    const dev = make();
    const { sc, blk } = pushScene(dev);
    const { riseB, riseP } = pushRight(sc, 240);
    assert.ok(blk.x > dev.x + dev.w, `物块应被推过${name}：x=${blk.x.toFixed(1)}（灯右缘 ${dev.x + dev.w}）`);
    assert.ok(riseB >= dev.h - 4, `物块应被推上${name}顶：抬升 ${riseB.toFixed(1)}px（灯高 ${dev.h}px）`);
    assert.ok(riseP >= dev.h - 4, `玩家也要跟着上台阶才能继续推：抬升 ${riseP.toFixed(1)}px`);
  });
}

// 推上灯顶的物块必须和"摆在灯上"一样受热（灯顶 = 加热面）：不信这条就会看到
// "推上去的物块不反应"（用户实测关注点）。
test('推上灯顶的物块确实被加热：Cu(OH)2 在灯顶分解为 CuO', () => {
  const sc = new Scene({ worldW: 1500, worldH: 800 });
  sc.addObject(new Floor({ x: 0, y: 700, w: 1200, h: 100, id: 'ground' }));
  const lamp = new Lamp({ x: 400, y: 660, w: 40, h: 40, autoOn: true, id: 'lamp1' });
  sc.addObject(lamp);
  const blk = new Block({ x: 300, y: 640, substance: 'Cu(OH)2', w: 60, h: 60, id: 'b1' });
  sc.addObject(blk);
  const p = new Player({ x: 230, y: 610, substance: 'NaOH', mass: 30, id: 'p1' });
  sc.addObject(p);
  sc.status = 'running';
  for (let i = 0; i < 30; i++) sc.step(1 / 30);
  // 推到物块踏上灯顶为止
  let onLamp = false;
  for (let i = 0; i < 400 && !onLamp; i++) {
    sc.control.add('right');
    sc.step(1 / 30);
    onLamp = Math.abs(blk.bottom - lamp.top) < 1.5 && blk.right > lamp.left && blk.x < lamp.right;
  }
  assert.ok(onLamp, '物块应被推上灯顶');
  sc.control.delete('right');
  assert.equal(sc.conditionsFor(blk).heat, true, '灯顶的物块应满足"加热"条件');
  for (let i = 0; i < 150; i++) sc.step(1 / 30); // 停在灯上 5s
  assert.ok(blk.grid.avail('Cu(OH)2') <= 1e-6, `灯顶物块应分解完，剩 ${blk.grid.avail('Cu(OH)2')}`);
  assert.ok(blk.grid.avail('CuO') > 1, `灯顶物块应生成 CuO，实得 ${blk.grid.avail('CuO')}`);
});

// 用户实测场景：钠块在空气里先被常温氧化成 Na2O，推上灯后必须继续变成 Na2O2
//（旧版缺 2Na2O + O2 --加热--> 2Na2O2 这条规则，钠块会永远停在 Na2O + Na2O2 的混合物上）
test('钠块推上灯：最终全部变成 Na2O2（不再卡在 Na2O）', () => {
  const sc = new Scene({ worldW: 1500, worldH: 800 });
  sc.addObject(new Floor({ x: 0, y: 700, w: 1200, h: 100, id: 'ground' }));
  const lamp = new Lamp({ x: 400, y: 660, w: 40, h: 40, autoOn: true, id: 'lamp1' });
  sc.addObject(lamp);
  const blk = new Block({ x: 300, y: 640, substance: 'Na', w: 60, h: 60, id: 'b1' });
  sc.addObject(blk);
  const p = new Player({ x: 230, y: 610, substance: 'NaOH', mass: 30, id: 'p1' });
  sc.addObject(p);
  sc.status = 'running';
  for (let i = 0; i < 30; i++) sc.step(1 / 30);
  let onLamp = false;
  for (let i = 0; i < 400 && !onLamp; i++) {
    sc.control.add('right');
    sc.step(1 / 30);
    onLamp = Math.abs(blk.bottom - lamp.top) < 1.5 && blk.right > lamp.left && blk.x < lamp.right;
  }
  assert.ok(onLamp, '钠块应被推上灯顶');
  sc.control.delete('right');
  for (let i = 0; i < 600; i++) sc.step(1 / 30); // 灯上加热 20s
  const left = { Na: blk.grid.avail('Na'), Na2O: blk.grid.avail('Na2O'), Na2O2: blk.grid.avail('Na2O2') };
  assert.ok(left.Na2O2 > 10, `应生成过氧化钠，实得 Na2O2=${left.Na2O2.toFixed(2)}g`);
  assert.ok(left.Na <= 1e-6, `钠应耗尽，剩 Na=${left.Na.toFixed(3)}g`);
  assert.ok(left.Na2O <= 1e-6, `中间的 Na2O 也应继续氧化完，剩 Na2O=${left.Na2O.toFixed(3)}g`);
});
