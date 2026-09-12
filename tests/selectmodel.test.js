// 选关「元素回廊」模型测试（无需浏览器）
// ----------------------------------------------------------------------------
// 模型来自 select.html 的 #region select-model（直接抽取源码复算，避免两份实现漂移），
// 配置来自 levels/levels.json。**断言尽量由配置推导**，这样你随时改关卡表都不会误报。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML = readFileSync(join(ROOT, 'select.html'), 'utf8');
const m = HTML.match(/\/\/ #region select-model[\s\S]*?\/\/ #endregion select-model/);
assert.ok(m, 'select.html 里应存在 #region select-model 段落');
const model = new Function(`${m[0]}
  return { bySym, buildEntries, periodStats, periodOf, allLevels, unlockedSet, unlockersOf,
           isotopeState, elementState, clampIndex, difficultyStars };`)();
const {
  bySym: FACTS, buildEntries, periodStats, periodOf, allLevels,
  unlockedSet, unlockersOf, isotopeState, elementState, clampIndex, difficultyStars,
} = model;

const CFG = JSON.parse(readFileSync(join(ROOT, 'levels', 'levels.json'), 'utf8'));
const ENTRIES = buildEntries(CFG, FACTS, false);
const LEVELS = allLevels(CFG);                       // 全部关卡（含引导）拍平
const ALL_IDS = new Set(LEVELS.map((l) => l.id));
const withFile = LEVELS.filter((l) => l.file);

test('buildEntries：新手引导在最前，其余为**全部 118 位元素**（按原子序数）', () => {
  assert.equal(ENTRIES[0].kind, 'tutorial');
  const rest = ENTRIES.slice(1);
  assert.equal(rest.length, 118, '走廊应包含全部 118 位元素（"每个元素都轮得到"）');
  for (let i = 1; i < rest.length; i++) {
    assert.equal(rest[i].n, rest[i - 1].n + 1, `元素序号应连续：${rest[i - 1].sym} → ${rest[i].sym}`);
  }
  assert.equal(rest[0].sym, 'H');
  assert.equal(rest[rest.length - 1].sym, 'Og');
  for (const e of rest) {
    const cfgIsotopes = (CFG.levels || {})[e.sym] || [];
    assert.equal(e.hasLevel, cfgIsotopes.some((i) => i.file), `${e.sym} 的 hasLevel 与配置不符`);
    if (!cfgIsotopes.length) assert.equal(e.isotopes.length, 0);
  }
});

test('buildEntries：onlyPlayable 只保留"有已编写关卡"的元素，引导始终保留', () => {
  const only = buildEntries(CFG, FACTS, true);
  assert.equal(only[0].kind, 'tutorial');
  assert.ok(only.every((e) => e.kind === 'tutorial' || e.hasLevel));
  const expect = Object.keys(CFG.levels || {}).filter((s) => (CFG.levels[s] || []).some((i) => i.file));
  assert.deepEqual(only.slice(1).map((e) => e.sym), expect);
});

test('同位素按质量数升序、id 唯一、显示名存在', () => {
  const seen = new Set();
  for (const e of ENTRIES) {
    for (let i = 1; i < e.isotopes.length; i++) {
      assert.ok((e.isotopes[i - 1].mass || 0) <= (e.isotopes[i].mass || 0), `${e.sym} 同位素未按质量升序`);
    }
    for (const it of e.isotopes) {
      assert.ok(it.id, `${e.sym} 有同位素缺 id`);
      assert.ok(!seen.has(it.id), `关卡 id 重复：${it.id}`);
      seen.add(it.id);
      assert.ok(it.name, `${it.id} 缺 name`);
    }
  }
});

test('periodStats / periodOf：周期划分正确（含镧系/锕系 f 区）', () => {
  const stats = periodStats(ENTRIES, new Set());
  assert.deepEqual(stats.map((s) => s.p), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(stats.map((s) => s.total), [2, 8, 8, 18, 18, 32, 32], '标准周期表每周期元素数');
  for (const s of stats) {
    const e = ENTRIES[s.first];
    assert.equal(e.period, s.p, `${s.p} 周期的起点索引指向了 ${e.sym}`);
  }
  assert.equal(periodOf(ENTRIES[0]), 0, '引导卡不属于任何周期');
  assert.equal(periodOf(ENTRIES.find((e) => e.sym === 'U')), 7, '铀属第 7 周期');
});

test('周期条 = 通关进度（done/levels），全部由配置推导', () => {
  const periodOfLevel = (id) => {
    const lv = LEVELS.find((l) => l.id === id);
    return lv ? periodOf(ENTRIES.find((e) => e.sym === lv.sym)) : 0;
  };
  const cleared = new Set(['tutorial']);
  for (const s of periodStats(ENTRIES, cleared)) {
    const ids = withFile.filter((l) => periodOfLevel(l.id) === s.p).map((l) => l.id);
    assert.equal(s.levels, ids.length, `第 ${s.p} 周期"已编写关卡数"不符`);
    assert.equal(s.done, ids.filter((id) => cleared.has(id)).length, `第 ${s.p} 周期"已通关数"不符`);
  }
  const allCleared = new Set(LEVELS.map((l) => l.id));
  for (const s of periodStats(ENTRIES, allCleared)) {
    assert.equal(s.done, s.levels, `全清后第 ${s.p} 周期的条应满`);
  }
  for (const s of periodStats(ENTRIES, new Set())) {
    assert.ok(s.levels === 0 || s.done === 0, '没有进度时周期条不该是满的');
  }
});

test('unlockedSet（前置关卡式）：requires 全通才解锁；链条自动传递', () => {
  for (const lv of LEVELS) {
    const req = lv.requires || [];
    assert.ok(unlockedSet(CFG, new Set(req)).has(lv.id), `${lv.id} 在前置全通后应解锁`);
    if (req.length) {
      assert.ok(!unlockedSet(CFG, new Set(req.slice(1))).has(lv.id), `${lv.id} 前置未齐时不该解锁`);
    }
  }
  assert.ok(unlockedSet(CFG, new Set()).has('tutorial'), '新手引导始终可玩');
  const chain = new Set();
  for (const lv of LEVELS) if ((lv.requires || []).every((r) => chain.has(r))) chain.add(lv.id);
  for (const lv of LEVELS) assert.ok(unlockedSet(CFG, chain).has(lv.id), `${lv.id} 在链条走通后应解锁`);
});

test('前置提示方向：本关提示必须取 it.requires，不能取反的 unlockersOf', () => {
  for (const lv of LEVELS) {
    const reverse = unlockersOf(CFG, lv.id);   // 以本关为前置的关
    for (const r of lv.requires || []) assert.ok(ALL_IDS.has(r), `${lv.id} 的前置 ${r} 不存在`);
    for (const r of reverse) assert.ok(ALL_IDS.has(r));
  }
  const H1 = LEVELS.find((l) => l.id === 'H-1');
  if (H1) {
    assert.deepEqual(H1.requires, ['tutorial'], 'H-1 的前置是新手引导');
    assert.ok(!(H1.requires || []).includes('He-1'), 'H-1 的前置不该是 He-1（方向写反的 bug）');
    assert.notDeepEqual(unlockersOf(CFG, 'H-1'), H1.requires, '正反两个列表不可混用');
  }
});

test('前置关系配置：无悬空 id、不能以自己为前置、新手引导无前置', () => {
  assert.deepEqual(CFG.tutorial.requires || [], [], '新手引导不需要前置');
  for (const lv of LEVELS) {
    for (const r of lv.requires || []) {
      assert.ok(ALL_IDS.has(r), `${lv.id} 的前置 ${r} 不存在`);
      assert.notEqual(r, lv.id, `${lv.id} 不能以自己为前置`);
    }
  }
});

test('isotopeState / elementState：四态与"金光"只看已编写的同位素', () => {
  const none = new Set();
  const real = { id: 'X-1', name: '测', mass: 1, file: 'levels/level1-1.html' };
  const empty = { id: 'X-2', name: '测', mass: 2 };
  assert.equal(isotopeState(empty, new Set(['X-2']), none), 'empty', '没 file → 暂无（与解锁无关）');
  assert.equal(isotopeState(real, new Set(), none), 'lock');
  assert.equal(isotopeState(real, new Set(['X-1']), none), 'open');
  assert.equal(isotopeState(real, new Set(['X-1']), new Set(['X-1'])), 'done');

  const mk = (id, file) => ({ id, name: id, mass: 1, file });
  const e = { sym: 'X', isotopes: [mk('X-1', 'a.html'), mk('X-2', 'b.html'), mk('X-3')] };
  assert.equal(elementState({ sym: 'X', isotopes: [mk('X-3')] }, new Set(), none), 'st0', '全没 file → 最暗');
  assert.equal(elementState(e, new Set(), none), 'st1');
  assert.equal(elementState(e, new Set(['X-1']), none), 'st2');
  assert.equal(elementState(e, new Set(['X-1']), new Set(['X-1'])), 'st3');
  assert.equal(elementState(e, new Set(['X-1', 'X-2']), new Set(['X-1', 'X-2'])), 'gold');
});

test('difficultyStars / clampIndex', () => {
  const e = { isotopes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] };
  assert.deepEqual(e.isotopes.map((i) => difficultyStars(e, i)), [1, 2, 3], '越重的同位素越难');
  assert.equal(clampIndex(-3, 6), 0);
  assert.equal(clampIndex(9, 6), 5);
  assert.equal(clampIndex(2, 6), 2);
});

test('配置完整性：关卡文件都存在；rare 都是真实元素且保持"稀有"', () => {
  for (const lv of withFile) {
    assert.ok(existsSync(join(ROOT, lv.file)), `${lv.id} 指向的关卡文件不存在：${lv.file}`);
  }
  for (const s of CFG.rare || []) assert.ok(FACTS[s], `rare 里的 ${s} 不是有效元素符号`);
  assert.ok((CFG.rare || []).length <= 10, 'rare 应保持"稀有"，别塞太多（用户明确反馈过）');
});
