// 玩家放置：冰面平摊（搭不了高）· 池边放置自动吸附进池子
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene } from '../src/core/scene.js';
import { Player } from '../src/objects/player.js';
import { Floor } from '../src/objects/floor.js';
import { Pool } from '../src/objects/pool.js';
import { Beaker } from '../src/objects/beaker.js';

const run = (scene, n) => { for (let i = 0; i < n; i++) scene.step(1 / 30); };

test('玩家站在冰上连放 4 次：不堆高（平摊）；石地同操作堆成柱', () => {
  const res = {};
  for (const ice of [true, false]) {
    const scene = new Scene({ worldW: 1500, worldH: 800 });
    scene.addObject(new Floor({ x: 0, y: 700, w: 1400, h: 100, ice }));
    scene.addObject(new Floor({ x: 0, y: 0, w: 12, h: 800 }));
    scene.addObject(new Floor({ x: 1388, y: 0, w: 12, h: 800 }));
    const p = new Player({ x: 400, y: 600, mass: 30, id: 'p1' });
    scene.addObject(p);
    scene.status = 'running';
    run(scene, 60); // 落地
    assert.ok(p.onGround, '落地');
    p.inventory.add(p.substance, 10); // 置货（放置 4×0.5g）
    const cnt0 = scene.particles.length;
    for (let i = 0; i < 4; i++) {
      p.tryPlace(scene);
      run(scene, 40);
      if (scene.particles.length <= cnt0) assert.fail('放置后应有颗粒生成');
    }
    run(scene, 120); // 稳定
    // 堆高原度 = 地面顶(700) 到"最高一颗颗粒顶部"（石地玩家会站上颗粒堆，p.bottom 会跟着升，不能用玩家）
    const all = scene.particles;
    const top = Math.min(...all.map((pt) => pt.y));
    res[ice ? 'ice' : 'stone'] = { topH: 700 - top, n: all.length };
  }
  assert.ok(res.ice.topH < 10, `冰面玩家脚下不堆高：${res.ice.topH.toFixed(0)}px`);
  assert.ok(res.stone.topH >= 15, `石地玩家脚下堆成柱：${res.stone.topH.toFixed(0)}px`);
});

test('玩家站池边放置：自动吸进池子（可溶物质进溶液，无地面颗粒残留）', () => {
  const scene = new Scene({ worldW: 1500, worldH: 800 });
  scene.addObject(new Floor({ x: 0, y: 700, w: 1400, h: 100 }));
  const pool = new Pool({ x: 300, y: 690, w: 200, h: 90, volume: 200, solutes: {} });
  scene.addObject(pool);
  // 玩家站在池右缘旁的地面上（池右缘 500，玩家中心 530 → 距离 30 < 70）
  const p = new Player({ x: 505, y: 560, mass: 30, id: 'p1', substance: 'NaCl' });
  scene.addObject(p);
  scene.status = 'running';
  run(scene, 60); // 落地（玩家在池子右边地面上；脚下无容器）
  assert.equal(scene.containerUnderFeet(p), null, '脚下无容器（站在池边）');
  assert.ok(scene.snapNearFeet(p), '池子吸附命中');
  p.inventory.add('NaCl', 10);
  for (let i = 0; i < 3; i++) { p.tryPlace(scene); run(scene, 20); }
  const sol = pool.solution.solutes.get('NaCl') ?? 0;
  assert.ok(sol > 1.0, `NaCl 进了池子溶液：${sol.toFixed(2)}g`);
  assert.equal(scene.particles.length, 0, '没有地面颗粒残留（都吸进池）');
  assert.ok(pool.depositAt, '池内吸附落点已记录');
});

test('玩家离池子远（不作弊）：不吸附，地面正常放置', () => {
  const scene = new Scene({ worldW: 1500, worldH: 800 });
  scene.addObject(new Floor({ x: 0, y: 700, w: 1400, h: 100 }));
  const pool = new Pool({ x: 300, y: 690, w: 200, h: 90, volume: 200, solutes: {} });
  scene.addObject(pool);
  const p = new Player({ x: 700, y: 560, mass: 30, id: 'p1', substance: 'NaCl' });
  scene.addObject(p);
  scene.status = 'running';
  run(scene, 60);
  assert.equal(scene.snapNearFeet(p), null, '远距离不吸附');
  p.inventory.add('NaCl', 10);
  p.tryPlace(scene);
  run(scene, 20);
  assert.ok(scene.particles.length >= 1, '地面正常生成颗粒');
  assert.equal(pool.solution.solutes.get('NaCl') ?? 0, 0, '远处的池子没被投进去');
});

// 叠层冰地板（石地板 + 冰层同顶，天然"给地板铺冰"）：_landOn 只记第一个接触体（石）——
// 冰标记必须由"脚下任一接触地板是冰"兜底（用户'冰面摩擦和地板一样/还能搭高'的根因）
test('叠层冰地板：玩家与沉淀都按冰面处理（摩擦/平摊/溜走）', () => {
  const scene = new Scene({ worldW: 3000, worldH: 800 });
  scene.addObject(new Floor({ x: 1653, y: 642, w: 700, h: 150, id: 'base' }));   // 石地板
  scene.addObject(new Floor({ x: 1833, y: 642, w: 340, h: 150, ice: true, id: 'ice' })); // 冰层
  const p = new Player({ x: 2000, y: 560, mass: 30, id: 'p1' });
  scene.addObject(p);
  scene.status = 'running';
  run(scene, 60);
  assert.ok(p.onGround && p._groundIce, '玩家在冰层上 = 冰面标记（叠层兜底）');
  // 连放 8 次：不搭高（颗粒一层层铺开 + 溜走），最多 2 层自然叠
  p.inventory.add(p.substance, 10);
  for (let i = 0; i < 8; i++) { p.tryPlace(scene); run(scene, 30); }
  run(scene, 120);
  const byX = {};
  for (const pt of scene.particles) { const k = Math.round(pt.x / 10) * 10; (byX[k] ??= []).push(pt); }
  let chains = 0;
  for (const k of Object.keys(byX)) {
    const arr = byX[k];
    if (arr.length >= 4) { const ys = arr.map((x) => x.y); if (Math.max(...ys) - Math.min(...ys) > 25) chains++; }
  }
  assert.equal(chains, 0, '不搭高（无 4+ 颗垂直成串）');
  assert.ok(scene.particles.length >= 8, '颗粒都在');
  // 对比石地段（1700：玩家右缘 1760 远离冰层 1833）：玩家冰标记 false
  const sc2 = new Scene({ worldW: 3000, worldH: 800 });
  sc2.addObject(new Floor({ x: 1653, y: 642, w: 700, h: 150, id: 'base' }));
  sc2.addObject(new Floor({ x: 1833, y: 642, w: 340, h: 150, ice: true, id: 'ice' }));
  const p2 = new Player({ x: 1700, y: 560, mass: 30, id: 'p1' });
  sc2.addObject(p2);
  sc2.status = 'running';
  run(sc2, 60);
  assert.ok(p2.onGround && !p2._groundIce, '纯石地段不是冰面');
});

// 快速连放（同帧多次放置，模拟连点）：冰面也搭不起来（颗粒 spawn 即预标记冰面）
test('冰面快速连放（同帧 6 次）：颗粒预标记 + 最终平摊不搭高', () => {
  const scene = new Scene({ worldW: 3000, worldH: 800 });
  scene.addObject(new Floor({ x: 1653, y: 642, w: 700, h: 150, id: 'base' }));
  scene.addObject(new Floor({ x: 1833, y: 642, w: 340, h: 150, ice: true, id: 'ice' }));
  const p = new Player({ x: 2000, y: 560, mass: 30, id: 'p1' });
  scene.addObject(p);
  scene.status = 'running';
  run(scene, 60);
  p.inventory.add(p.substance, 10);
  for (let i = 0; i < 6; i++) p.tryPlace(scene); // 同帧连放（无 step）
  assert.ok(scene.particles.every((pt) => pt._groundIce === true), 'spawn 即冰面预标记');
  run(scene, 200);
  const byX = {};
  for (const pt of scene.particles) { const k = Math.round(pt.x / 10) * 10; (byX[k] ??= []).push(pt); }
  let chains = 0;
  for (const k of Object.keys(byX)) {
    const arr = byX[k];
    if (arr.length >= 4) { const ys = arr.map((x) => x.y); if (Math.max(...ys) - Math.min(...ys) > 25) chains++; }
  }
  assert.equal(chains, 0, '快速连放也不搭高');
  assert.ok(scene.particles.length >= 6, '颗粒都在');
});

// ---- 吸附扩展：开关 / 酒精灯 / 酒精喷灯（与池子同一吸附规则） ----
import { Switch } from '../src/objects/switch.js';
import { Lamp } from '../src/objects/lamp.js';
import { BlastLamp } from '../src/objects/blastlamp.js';

function standNear(scene, x, target) {
  const p = new Player({ x, y: 560, mass: 30, id: 'p1', substance: 'NaCl' });
  scene.addObject(p);
  scene.status = 'running';
  run(scene, 60); // 落地
  assert.ok(p.onGround, '玩家落地');
  return p;
}

test('压力开关旁放置：吸附进开关（沉淀进开关，不是地面颗粒）', () => {
  const scene = new Scene({ worldW: 1500, worldH: 800 });
  scene.addObject(new Floor({ x: 0, y: 700, w: 1400, h: 100 }));
  const sw = new Switch({ x: 400, y: 678, w: 40, h: 22, mode: 'pressure', id: 'sw1' });
  scene.addObject(sw);
  const p = standNear(scene, 340, sw); // 玩家中心 350，开关左缘 400 → 贴身 50px
  assert.equal(scene.snapNearFeet(p), sw, '开关吸附命中');
  p.inventory.add('NaCl', 10);
  p.tryPlace(scene);
  run(scene, 20);
  assert.ok((sw.precipitates.get('NaCl') ?? 0) > 0.4, `沉淀进了开关：${sw.precipitates.get('NaCl')}`);
  assert.equal(scene.particles.length, 0, '无地面颗粒残留');
});

test('酒精灯旁放置：吸附上灯', () => {
  const scene = new Scene({ worldW: 1500, worldH: 800 });
  scene.addObject(new Floor({ x: 0, y: 700, w: 1400, h: 100 }));
  const lamp = new Lamp({ x: 400, y: 660, w: 40, h: 40, id: 'l1' }); // 未点燃
  scene.addObject(lamp);
  const p = standNear(scene, 340, lamp);
  assert.equal(scene.snapNearFeet(p), lamp, '灯吸附命中');
  p.inventory.add('Cu(OH)2', 10);
  p.tryPlace(scene);
  run(scene, 20);
  assert.ok((lamp.precipitates.get('Cu(OH)2') ?? 0) > 0.4, `沉淀上了灯：${lamp.precipitates.get('Cu(OH)2')}`);
  assert.equal(scene.particles.length, 0, '无地面颗粒残留');
});

test('酒精喷灯旁放置：吸附上喷灯', () => {
  const scene = new Scene({ worldW: 1500, worldH: 800 });
  scene.addObject(new Floor({ x: 0, y: 700, w: 1400, h: 100 }));
  const lamp = new BlastLamp({ x: 400, y: 660, w: 40, h: 40, id: 'l1' });
  scene.addObject(lamp);
  const p = standNear(scene, 340, lamp);
  assert.equal(scene.snapNearFeet(p), lamp, '喷灯吸附命中');
  p.inventory.add('CuO', 10);
  p.tryPlace(scene);
  run(scene, 20);
  assert.ok((lamp.precipitates.get('CuO') ?? 0) > 0.4, `沉淀上了喷灯：${lamp.precipitates.get('CuO')}`);
  assert.equal(scene.particles.length, 0, '无地面颗粒残留');
});

test('开关/灯在垂直不同层（上方高台）不误吸：地面正常放置', () => {
  const scene = new Scene({ worldW: 1500, worldH: 800 });
  scene.addObject(new Floor({ x: 0, y: 700, w: 1400, h: 100 }));
  // 开关悬在玩家头顶上方 200px 的高台上
  scene.addObject(new Floor({ x: 380, y: 440, w: 80, h: 10 }));
  const sw = new Switch({ x: 400, y: 418, w: 40, h: 22, mode: 'pressure', id: 'sw1' });
  scene.addObject(sw);
  const p = standNear(scene, 340, sw);
  assert.equal(scene.snapNearFeet(p), null, '垂直不同层不吸附');
  p.inventory.add('NaCl', 10);
  p.tryPlace(scene);
  run(scene, 20);
  assert.ok(scene.particles.length >= 1, '地面正常生成颗粒');
  assert.equal(sw.precipitates.get('NaCl') ?? 0, 0, '高台上的开关没被投进去');
});

test('烧杯等可携带容器不吸附（吸进去会乱，用户定案）', () => {
  const scene = new Scene({ worldW: 1500, worldH: 800 });
  scene.addObject(new Floor({ x: 0, y: 700, w: 1400, h: 100 }));
  const beaker = new Beaker({ x: 400, y: 630, w: 60, h: 70, id: 'bk1' });
  scene.addObject(beaker);
  const p = standNear(scene, 340, beaker);
  assert.equal(scene.snapNearFeet(p), null, '烧杯不吸附');
  p.inventory.add('NaCl', 10);
  p.tryPlace(scene);
  run(scene, 20);
  assert.ok(scene.particles.length >= 1, '地面正常生成颗粒');
  assert.equal(beaker.precipitates.get('NaCl') ?? 0, 0, '烧杯没被投入');
});
