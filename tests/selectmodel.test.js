// 选关「元素回廊」模型测试（无需浏览器）
// ----------------------------------------------------------------------------
// select.html 的走廊/同位素/解锁逻辑集中在 #region select-model 的纯函数里。
// 本测试**直接抽取那段源码**复算，避免测试与实现各写一份而漂移；同时校验
// levels/levels.js 这份配置自身的完整性（悬空解锁目标、重复 id、文件是否存在）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML = readFileSync(join(ROOT, 'select.html'), 'utf8');

const m = HTML.match(/\/\/ #region select-model[\s\S]*?\/\/ #endregion select-model/);
assert.ok(m, 'select.html 里应存在 #region select-model 段落');
// ⚠ 直接从模型区取 bySym：元素事实表（含镧系/锕系两行）就在里面，避免测试再抄一份而漏掉 f 区
const model = new Function(`${m[0]}
  return { bySym, buildEntries, periodStats, periodOf, unlockedSet, unlockersOf, isotopeState, elementState, clampIndex, difficultyStars };`)();
const { bySym: FACTS, buildEntries, periodStats, periodOf, unlockedSet, unlockersOf, isotopeState, elementState, clampIndex, difficultyStars } = model;

/** 按浏览器的方式加载 levels.js（它写入 window.CHEZZLE_LEVELS） */
function loadCfg() {
  const src = readFileSync(join(ROOT, 'levels', 'levels.js'), 'utf8');
  const window = {};
  new Function('window', src)(window);
  return window.CHEZZLE_LEVELS;
}
const CFG = loadCfg();
const ENTRIES = buildEntries(CFG, FACTS);

test('buildEntries：新手引导在最前，其余为**全部 118 位元素**（按原子序数）', () => {
  assert.equal(ENTRIES[0].kind, 'tutorial');
  assert.equal(ENTRIES[0].sym, 'tutorial');
  const rest = ENTRIES.slice(1);
  assert.equal(rest.length, 118, '走廊应包含全部 118 位元素（"每个元素都轮得到"）');
  for (let i = 1; i < rest.length; i++) {
    assert.equal(rest[i].n, rest[i - 1].n + 1, `元素序号应连续：${rest[i - 1].sym} → ${rest[i].sym}`);
  }
  assert.deepEqual(rest.slice(0, 3).map((e) => e.sym), ['H', 'He', 'Li']);
  assert.equal(rest[rest.length - 1].sym, 'Og');
  // 只有配置过的元素 hasLevel=true，其余仍是可翻到的空位
  const withLevel = rest.filter((e) => e.hasLevel).map((e) => e.sym);
  assert.deepEqual(withLevel, ['H', 'He'], '目前只有 H-1 / He-1 写了关卡文件')
  assert.equal(rest.find((e) => e.sym === 'Li').isotopes.length, 0, '没配关卡的元素同位素为空');
});

test('buildEntries：onlyPlayable 筛选后只剩"有已编写关卡"的元素', () => {
  const only = buildEntries(CFG, FACTS, true);
  assert.deepEqual(only.slice(1).map((e) => e.sym), ['H', 'He']);
  assert.ok(only.every((e) => e.kind === 'tutorial' || e.hasLevel));
  assert.equal(only[0].kind, 'tutorial', '新手引导始终保留');
});

test('periodStats / periodOf：周期划分与"该周期内有关卡的元素数"', () => {
  const stats = periodStats(ENTRIES);
  assert.deepEqual(stats.map((s) => s.p), [1, 2, 3, 4, 5, 6, 7]);
  // 标准周期表每周期元素数（含镧系/锕系各 14 位）
  assert.deepEqual(stats.map((s) => s.total), [2, 8, 8, 18, 18, 32, 32]);
  assert.deepEqual(stats.map((s) => s.withLevel), [2, 0, 0, 0, 0, 0, 0],
    '当前配置：只有第 1 周期的 H / He 写了关卡文件');
  // 跳周期用的起点索引必须指向该周期第一位元素
  for (const s of stats) {
    const e = ENTRIES[s.first];
    assert.equal(e.period, s.p, `${s.p} 周期的起点索引指向了 ${e.sym}`);
  }
  assert.equal(periodOf(ENTRIES[0]), 0, '引导卡不属于任何周期');
  assert.equal(periodOf(ENTRIES.find((e) => e.sym === 'U')), 7, '铀属第 7 周期（f 区并入后仍正确）');
});

test('buildEntries：同位素按质量数升序，且都带 id', () => {
  for (const e of ENTRIES) {
    for (let i = 1; i < e.isotopes.length; i++) {
      assert.ok((e.isotopes[i - 1].mass || 0) <= (e.isotopes[i].mass || 0), `${e.sym} 同位素未按质量升序`);
    }
    for (const it of e.isotopes) assert.ok(it.id, `${e.sym} 有同位素缺 id`);
  }
  const H = ENTRIES.find((e) => e.sym === 'H');
  assert.deepEqual(H.isotopes.map((i) => i.name), ['氕', '氘', '氚']);
  // 没配关卡的位元素：同位素为空但仍可翻到
  assert.equal(ENTRIES.find((e) => e.sym === 'Li').isotopes.length, 0);
});

test('unlockedSet：初始只有新手引导；通关后按 unlocks 图逐层展开', () => {
  assert.deepEqual([...unlockedSet(CFG, new Set())], ['tutorial'], '未通关任何关时只有引导可玩');
  const u1 = unlockedSet(CFG, new Set(['tutorial']));
  assert.ok(u1.has('H-1') && !u1.has('H-2'), '通关引导 → 解锁 H-1（H-2 还需通关 H-1）');
  const u2 = unlockedSet(CFG, new Set(['tutorial', 'H-1']));
  assert.ok(u2.has('H-2') && u2.has('C-1'), '通关 H-1 → 解锁 H-2 与 C-1');
  const uAll = unlockedSet(CFG, new Set(['tutorial', 'H-1', 'H-2', 'H-3', 'C-1', 'O-1', 'Fe-1']));
  assert.ok(uAll.has('Cu-1'), '连锁解锁应一路展开');
  assert.ok(!unlockedSet(CFG, new Set(['tutorial'])).has('O-1'), '跳级关不该被解锁');
});

test('isotopeState：未编写 / 未解锁 / 可挑战 / 已通关 四态', () => {
  const H = ENTRIES.find((e) => e.sym === 'H');
  const none = new Set();
  const locked = { id: 'X-1', name: '测', mass: 1, file: 'levels/level1-1.html' };
  const empty = { id: 'X-2', name: '测', mass: 2 };
  assert.equal(isotopeState(empty, new Set(['X-2']), none), 'empty', '没 file → 未编写（与解锁无关）');
  assert.equal(isotopeState(locked, new Set(), none), 'lock', '有 file 但没解锁 → lock');
  assert.equal(isotopeState(locked, new Set(['X-1']), none), 'open');
  assert.equal(isotopeState(locked, new Set(['X-1']), new Set(['X-1'])), 'done');
  // 真实数据：H-1 有 file（需先通关引导），氘/氚 尚未编写
  assert.equal(isotopeState(H.isotopes[0], unlockedSet(CFG, none), none), 'lock');
  assert.equal(isotopeState(H.isotopes[0], unlockedSet(CFG, new Set(['tutorial'])), none), 'open');
  assert.equal(isotopeState(H.isotopes[1], unlockedSet(CFG, new Set(['tutorial', 'H-1'])), none), 'empty');
});

test('elementState：暗→未解锁→已解锁→已通关→金光（只看"已编写"的同位素）', () => {
  const mk = (id, file) => ({ id, name: id, mass: 1, file });
  const e = { sym: 'X', isotopes: [mk('X-1', 'a.html'), mk('X-2', 'b.html'), mk('X-3')] };
  const none = new Set();
  assert.equal(elementState({ sym: 'X', isotopes: [{ id: 'X-9', name: 'x', mass: 1 }] }, new Set(), none), 'st0', '一个 file 都没有 → 最暗');
  assert.equal(elementState(e, new Set(), none), 'st1', '全锁');
  assert.equal(elementState(e, new Set(['X-1']), none), 'st2', '解锁了但没通关');
  assert.equal(elementState(e, new Set(['X-1']), new Set(['X-1'])), 'st3', '部分通关');
  assert.equal(elementState(e, new Set(['X-1', 'X-2']), new Set(['X-1', 'X-2'])), 'gold', '已编写的同位素全通关 → 金光');
  // 未编写的 X-3 不参与"金光"判定
  assert.equal(elementState(e, new Set(['X-1', 'X-2']), new Set(['X-1', 'X-2', 'X-3'])), 'gold');
});

test('unlockersOf / difficultyStars / clampIndex', () => {
  assert.deepEqual(unlockersOf(CFG, 'H-1'), ['tutorial']);
  assert.deepEqual(unlockersOf(CFG, 'Cu-1'), ['Fe-1']);
  assert.deepEqual(unlockersOf(CFG, 'tutorial'), []);
  const H = ENTRIES.find((e) => e.sym === 'H');
  assert.deepEqual(H.isotopes.map((i) => difficultyStars(H, i)), [1, 2, 3], '越重的同位素越难');
  assert.equal(clampIndex(-3, 6), 0);
  assert.equal(clampIndex(9, 6), 5);
  assert.equal(clampIndex(2, 6), 2);
});

test('配置完整性：解锁无悬空目标、关卡 id 唯一、引用的关卡文件都存在', () => {
  const allIds = new Set();
  for (const e of ENTRIES) for (const it of e.isotopes) {
    assert.ok(!allIds.has(it.id), `关卡 id 重复：${it.id}`);
    allIds.add(it.id);
  }
  for (const [src, targets] of Object.entries(CFG.unlocks || {})) {
    assert.ok(allIds.has(src), `unlocks 里的来源关不存在：${src}`);
    for (const t of targets) assert.ok(allIds.has(t), `${src} 解锁了不存在的关卡：${t}`);
  }
  for (const e of ENTRIES) for (const it of e.isotopes) {
    if (!it.file) continue;
    assert.ok(existsSync(join(ROOT, it.file)), `${it.id} 指向的关卡文件不存在：${it.file}`);
  }
});
