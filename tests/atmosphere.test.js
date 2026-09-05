// 大气 preset：整组独占语义（设置过的按值、没设置的=0；空=保持默认）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Atmosphere } from '../src/chem/atmosphere.js';

test('默认大气：N2 80% / O2 20%（地球空气）', () => {
  const atm = new Atmosphere();
  assert.ok(Math.abs(atm.fraction('N2') - 0.8) < 1e-6, `N2 = ${atm.fraction('N2')}`);
  assert.ok(Math.abs(atm.fraction('O2') - 0.2) < 1e-6, `O2 = ${atm.fraction('O2')}`);
});

test('preset(N2:5000, O2:0)：除 N2 外没有其它气体，O2 为 0', () => {
  const atm = new Atmosphere();
  atm.preset({ N2: 5000, O2: 0 });
  assert.equal(atm.mass('O2'), 0, 'O2 应为 0g');
  assert.equal(atm.mass('N2'), 5000, 'N2 = 5000g');
  assert.equal(atm.mass('CO2'), 0, 'CO2 = 0（没设置=没有）');
  assert.equal(atm.mass('N2') + atm.mass('O2'), atm.total(), '总质量 = 设置的气体之和');
});

test('preset(空表)：保持默认地球大气（不清零）', () => {
  const atm = new Atmosphere();
  atm.preset({});
  assert.ok(Math.abs(atm.fraction('N2') - 0.8) < 1e-6, '空 preset 保持默认 N2');
  assert.ok(Math.abs(atm.fraction('O2') - 0.2) < 1e-6, '空 preset 保持默认 O2');
});

test('preset(只设 O2:15)：只有氧气（无 N2），O2 占比 100%', () => {
  const atm = new Atmosphere();
  atm.preset({ O2: 15 });
  assert.equal(atm.mass('N2'), 0, '没设置的 N2 = 0');
  assert.equal(atm.mass('O2'), 15);
  assert.ok(Math.abs(atm.fraction('O2') - 1) < 1e-6, `O2 100%: ${atm.fraction('O2')}`);
});

test('preset 与 setGas 区别：setGas 只覆盖单个（其它气体保持现状）', () => {
  const atm = new Atmosphere();
  atm.setGas('O2', 0);
  assert.equal(atm.mass('O2'), 0, 'setGas(O2,0) 覆盖 O2');
  assert.ok(atm.mass('N2') > 0, 'setGas 不清其它气体（N2 仍在）');
});
