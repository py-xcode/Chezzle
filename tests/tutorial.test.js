// 新手引导模组测试：大横幅（showBanner/包络/排期）+ 全类型延迟出现（含玩家/烧杯子体）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Scene } from '../src/core/scene.js';
import { Plugins } from '../src/level/plugins.js';
import { bannerEnvelope } from '../src/render/hud.js';
import { Player } from '../src/objects/player.js';
import { Floor } from '../src/objects/floor.js';
import { Beaker } from '../src/objects/beaker.js';

const TICK = 1 / 30;

function makeScene(opts = {}) {
  const s = new Scene({ worldW: 600, worldH: 400, ...opts });
  s.status = 'running';
  return s;
}
function stepN(s, n) { for (let i = 0; i < n; i++) s.step(TICK); }

// 真实模组文件：模拟浏览器 <script> 加载（顶层只 register，无副作用）
const tutSrc = readFileSync('plugin/tutorial.js', 'utf8');
new Function('Chezzle', tutSrc)({ Plugin: Plugins });

// ---- ① 大横幅：引擎能力 ----

test('showBanner：写入横幅数据 + 事件；空文本忽略；时长钳制', () => {
  const s = makeScene();
  let evt = null;
  s.on('banner', (b) => { evt = b; });
  assert.equal(s.showBanner('   '), null, '空白文本不弹横幅');
  const b = s.showBanner('你好\n世界', 3);
  assert.equal(b.text, '你好\n世界');
  assert.equal(b.dur, 3);
  assert.equal(b.t, s.time);
  assert.equal(s.banner, b);
  assert.equal(evt, b, '触发 banner 事件');
  s.showBanner('太短', 0.1);
  assert.equal(s.banner.dur, 0.6, '时长下限 0.6s');
  s.step(TICK);
  const b2 = s.showBanner('顶掉', 2);
  assert.equal(s.banner, b2, '后显示的顶掉前一个');
});

test('bannerEnvelope：淡入→全亮→淡出，越界为 0', () => {
  assert.equal(bannerEnvelope(-0.1, 3), 0);
  assert.equal(bannerEnvelope(3.2, 3), 0, '超过总时长已消失');
  assert.equal(bannerEnvelope(1.5, 3), 1, '中段全亮（fade=0.5）');
  assert.ok(Math.abs(bannerEnvelope(0.25, 3) - 0.5) < 1e-9, '淡入半程 alpha=0.5');
  assert.ok(Math.abs(bannerEnvelope(2.75, 3) - 0.5) < 1e-9, '淡出半程 alpha=0.5');
  // 短横幅：fade 收窄为 dur/3，中段仍有全亮
  assert.equal(bannerEnvelope(0.3, 0.6), 1);
  assert.ok(bannerEnvelope(0.05, 0.6) < 0.3, '0.6s 横幅淡入仅 0.2s');
});

test('模组排期：tutorialBanners 按秒数触发 showBanner；cfg.banners 兜底；空文本跳过', () => {
  const s = makeScene();
  s.tutorialBanners = [
    { at: 1, dur: 2, text: '第一句' },
    { at: 2, dur: 2, text: '  ' }, // 空文本：忽略
    { at: 2.6, dur: 1, text: '第二句' },
    null,
  ];
  const cleanup = Plugins.call('tutorial', s, {});
  stepN(s, 25); // ~0.83s：还没到
  assert.equal(s.banner, null);
  stepN(s, 8); // ~1.1s
  assert.equal(s.banner.text, '第一句');
  assert.equal(s.banner.dur, 2);
  stepN(s, 50); // ~2.76s
  assert.equal(s.banner.text, '第二句', '空文本条目不占横幅');
  cleanup();
  // cfg 兜底（手写脚本走 inject cfg）
  const s2 = makeScene();
  Plugins.call('tutorial', s2, { banners: [{ at: 0, dur: 1, text: 'cfg 横幅' }] });
  stepN(s2, 2);
  assert.equal(s2.banner.text, 'cfg 横幅');
});

// ---- ②③ 延迟出现 ----

test('模组的增强元数据：全类型 + appearDelay 字段（含玩家）', () => {
  const meta = Plugins.parseMeta(tutSrc);
  assert.equal(meta.name, '新手引导');
  const enh = meta.enhance[0];
  assert.ok(enh.types.includes('player'), '玩家可延迟出现');
  assert.ok(enh.types.includes('beaker') && enh.types.includes('floor'), '全类型覆盖');
  assert.equal(enh.fields[0].key, 'appearDelay');
});

test('物品延迟出现：开局隐藏（无碰撞/不渲染），到点原样恢复', () => {
  const s = makeScene();
  s.addObject(new Floor({ x: 0, y: 300, w: 600, h: 100 }));
  const b = new Beaker({ x: 100, y: 200, w: 60, h: 70 });
  b.id = 'bk1'; // 显式 id（reveal 依赖）
  b.subBodies.forEach((sb, i) => { sb.id = `bk1_w${i}`; });
  b.appearDelay = 1;
  s.addObject(b);
  const cleanup = Plugins.call('tutorial', s, {});
  assert.ok(b.hidden && s.hidden.includes(b), '开局隐藏');
  assert.ok(!s.objects.includes(b) && !s.containers.includes(b), '移出活动/容器索引');
  for (const sb of b.subBodies) {
    assert.ok(sb.hidden && !s.statics.includes(sb), '杯壁随母体隐藏（不再挡人）');
  }
  stepN(s, 25); // 0.83s：还没到
  assert.ok(b.hidden);
  stepN(s, 10); // ~1.17s：到点
  assert.ok(!b.hidden && s.objects.includes(b) && s.containers.includes(b), '母体恢复');
  for (const sb of b.subBodies) {
    assert.ok(!sb.hidden && s.statics.includes(sb), '杯壁恢复');
  }
  cleanup();
});

test('玩家延迟出现：隐藏期不判生死/不就绪提示，出现后一切照常', () => {
  const s = makeScene();
  s.addObject(new Floor({ x: 0, y: 300, w: 600, h: 100 }));
  const p = new Player({ x: 80, y: 260, mass: 30 });
  p.appearDelay = 1;
  s.addObject(p);
  s.tips.push({ text: '走起来', when: { mode: 'and', items: [] } });
  const cleanup = Plugins.call('tutorial', s, {});
  assert.ok(p.hidden && !s.dynamics.includes(p), '玩家开局隐藏');
  assert.equal(s.player, p, 'player 引用保留（相机跟随出生点）');
  // 把出生点挪出界（如悬空在虚空上方）：隐藏期绝不能判死
  p.y = 9999;
  stepN(s, 20); // ~0.67s
  assert.equal(s.status, 'running', '隐藏期不参与生死判定');
  assert.equal(s.tipReady, null, '人没到，条件提示不就绪');
  stepN(s, 15); // ~1.17s：出现
  assert.ok(!p.hidden && s.dynamics.includes(p), '到点出现');
  stepN(s, 3);
  assert.equal(s.status, 'died', '出现后在界外 → 正常判死');
  // 另一局：正常落地出现 → 提示就绪
  const s2 = makeScene();
  s2.addObject(new Floor({ x: 0, y: 300, w: 600, h: 100 }));
  const p2 = new Player({ x: 80, y: 240, mass: 30 });
  p2.appearDelay = 0.5;
  s2.addObject(p2);
  s2.tips.push({ text: '走起来', when: { mode: 'and', items: [] } });
  const cleanup2 = Plugins.call('tutorial', s2, {});
  stepN(s2, 10); // ~0.33s：隐藏中
  assert.equal(s2.tipReady, null);
  stepN(s2, 10); // ~0.67s：已出现
  assert.ok(s2.tipReady, '出现后条件提示就绪');
  assert.equal(s2.status, 'running', '落地存活');
  cleanup();
  cleanup2();
});

test('已被开关初始隐藏的物体：模组不接管（出现时机归开关）', () => {
  const s = makeScene();
  const b = new Beaker({ x: 100, y: 200, w: 60, h: 70 });
  b.id = 'bk2';
  b.hidden = true; // 编辑器"初始隐藏"
  b.appearDelay = 0.2;
  s.addObject(b);
  const cleanup = Plugins.call('tutorial', s, {});
  stepN(s, 12);
  assert.ok(b.hidden && !s.objects.includes(b), '隐藏归开关管，模组不抢跑');
  cleanup();
  stepN(s, 30);
  assert.ok(b.hidden && !s.objects.includes(b), '到点也不出现（模组没插嘴，开关说了才算）');
});

test('清理函数取消未到点的排期（横幅/出现都不再触发）', () => {
  const s = makeScene();
  s.tutorialBanners = [{ at: 2, dur: 1, text: '来不及' }];
  const f = new Floor({ x: 0, y: 300, w: 600, h: 100 });
  f.id = 'fl9';
  f.appearDelay = 2;
  s.addObject(f);
  const cleanup = Plugins.call('tutorial', s, {});
  cleanup();
  stepN(s, 90); // 3s
  assert.equal(s.banner, null, '横幅排期已取消');
  assert.ok(f.hidden, '出现排期已取消');
});
