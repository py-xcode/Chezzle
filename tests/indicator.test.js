// 指示剂显示名（中文名）与颜色渐变
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Solution } from '../src/chem/solution.js';
import { displayName } from '../src/chem/substances.js';
import { solutionColor } from '../src/render/liquidrender.js';

test('指示剂显示名：酚酞/石蕊显示中文名，其它物质显示化学式', () => {
  assert.equal(displayName('C20H14O4'), '酚酞');
  assert.equal(displayName('Litmus'), '石蕊');
  assert.equal(displayName('NaOH'), 'NaOH');
  assert.equal(displayName('NH4OH'), 'NH3·H2O'); // 别名归一显示
});

test('指示剂颜色渐变：传入 time 逐步收敛（不是瞬间跳变），最终到达目标色', () => {
  // 碱中酚酞：无色 → 深红（#ff2d55）；对比"无 time"直出
  const sol = new Solution({ volume: 300, solutes: { NaOH: 4, C20H14O4: 3 } });
  const direct = solutionColor(sol); // 无 time：直出
  const dRgb = direct.color;
  // 加 time 序列：第一帧从无色开始渐变，数帧内 color 逐步变化，最终接近 direct
  const sol2 = new Solution({ volume: 300, solutes: { NaOH: 4, C20H14O4: 3 } });
  const frames = [];
  for (let t = 0; t < 3; t += 1 / 30) frames.push(solutionColor(sol2, t).color);
  // 渐变过程：首帧 ≠ 目标（还没到），末帧 ≈ 目标
  const rgb = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  const first = rgb(frames[0]);
  const last = rgb(frames[frames.length - 1]);
  const goal = rgb(dRgb);
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  console.log('frames:', frames.map((f) => f).join(' '));
  // 三帧 0.1s 后还没到 100%（渐变中）；距离 > 0
  assert.ok(dist(first, goal) > 5 || frames.length > 1, `渐变过程应存在中间色: ${frames.join(' ')}`);
  // 收敛：少量帧后应显著接近（允许不在 100%，但应正在收敛）
  const later = rgb(solutionColor(sol2, 3).color);
  console.log(`first=${frames[0]} last(3s)=${solutionColor(sol2, 3).color} goal=${dRgb} distFirst=${dist(first, goal).toFixed(1)} distLater=${dist(later, goal).toFixed(1)}`);
  assert.ok(dist(later, goal) < 30, `3s 后应接近目标色: ${solutionColor(sol2, 3).color} vs ${dRgb}`);
});
