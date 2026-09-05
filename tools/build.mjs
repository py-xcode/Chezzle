// ============================================================================
// 零依赖迷你打包器：把 src/ 的 ES Module 图打包成单个 UMD 文件 dist/chezzle.js，
// 挂全局 `Chezzle`（关卡 HTML 用 <script> 引入即可，file:// 双击也能玩）。
//
// 支持的语法（本库代码风格一致）：
//   import { A, B } from './x.js';
//   export * from './x.js';
//   export function/class/const/let/var NAME ...
// 不支持：default 导出、`export { a }`、多行 import。
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'dist', 'chezzle.js');

const modules = new Map(); // absPath → mod

function resolve(fromFile, spec) {
  return path.resolve(path.dirname(fromFile), spec);
}

function parse(abs) {
  if (modules.has(abs)) return modules.get(abs);
  const src = fs.readFileSync(abs, 'utf8');
  const mod = {
    abs,
    id: path.relative(ROOT, abs).split(path.sep).join('/'),
    imports: [], // [{ names, spec, targetAbs }]
    reexports: [], // [targetAbs]
    exports: [], // [name]
    src,
  };
  modules.set(abs, mod);

  let m;
  const importRe = /import\s*\{([^}]*)\}\s*from\s*'([^']+)'/g;
  while ((m = importRe.exec(src))) {
    const names = m[1].split(',').map((s) => s.trim()).filter(Boolean);
    const targetAbs = resolve(abs, m[2]);
    mod.imports.push({ names, spec: m[2], targetAbs });
    parse(targetAbs);
  }
  const reRe = /export\s*\*\s*from\s*'([^']+)'/g;
  while ((m = reRe.exec(src))) {
    const targetAbs = resolve(abs, m[1]);
    mod.reexports.push(targetAbs);
    parse(targetAbs);
  }
  const exportRe = /export\s+(function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g;
  while ((m = exportRe.exec(src))) mod.exports.push(m[2]);
  return mod;
}

function transform(mod) {
  let src = mod.src;
  src = src.replace(/import\s*\{([^}]*)\}\s*from\s*'([^']+)'/g, (all, names, spec) => {
    const target = modules.get(resolve(mod.abs, spec));
    const list = names.split(',').map((s) => s.trim()).filter(Boolean).join(', ');
    return `const { ${list} } = __require('${target.id}');`;
  });
  src = src.replace(/export\s*\*\s*from\s*'([^']+)'/g, (all, spec) => {
    const target = modules.get(resolve(mod.abs, spec));
    return `Object.assign(exports, __require('${target.id}'));`;
  });
  src = src.replace(/export\s+(function|class|const|let|var)\s+/g, '$1 ');
  if (mod.exports.length) {
    src += '\n' + mod.exports.map((n) => `exports.${n} = ${n};`).join('\n') + '\n';
  }
  return src;
}

const entry = path.join(SRC, 'index.js');
parse(entry);

const lines = [
  '(function (global) {',
  '  var __modules = {};',
  '  var __cache = {};',
  '  function __require(id) {',
  '    if (__cache[id]) return __cache[id].exports;',
  '    var module = { exports: {} };',
  '    __cache[id] = module;',
  '    __modules[id](module, module.exports, __require);',
  '    return module.exports;',
  '  }',
];
for (const mod of modules.values()) {
  lines.push(`  __modules[${JSON.stringify(mod.id)}] = function (module, exports, __require) {`);
  lines.push(transform(mod));
  lines.push('  };');
}
lines.push(`  global.Chezzle = __require(${JSON.stringify(modules.get(entry).id)});`);
lines.push("})(typeof window !== 'undefined' ? window : globalThis);");

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, lines.join('\n') + '\n');
console.log(`built ${modules.size} modules → dist/chezzle.js (${fs.statSync(OUT).size} bytes)`);

// ---- 缓存版本同步：所有引用 dist/chezzle.js 的 HTML 加 ?v=<时间戳> ----
// 引擎每次构建产物变、URL 不变 → 浏览器拿旧 dist（用户"啥也没修"最常见根因）。
// build 时自动改写引用：页面刷新即拿到新引擎。
const VER = 'v' + Date.now().toString(36);
const refFiles = [];
const walkRefs = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkRefs(p);
    else if (/\.html$/.test(e.name)) refFiles.push(p);
  }
};
for (const d of ['levels', 'tools', 'docs/examples', 'docs']) if (fs.existsSync(path.join(SRC, '..', d))) walkRefs(path.join(SRC, '..', d));
if (fs.existsSync(path.join(SRC, '..', 'index.html'))) refFiles.push(path.join(SRC, '..', 'index.html'));
let patched = 0;
for (const f of refFiles) {
  let t = fs.readFileSync(f, 'utf8');
  // ★ 清除所有已存在的 ?v= 级联段（旧 bug：正则只匹配一段，每次 build 追加一段 →
  //   ?vmto1haka?vmto13ecy?… 无限级联，且浏览器按整串 URL 缓存旧内容不可控）
  if (!/chezzle\.js\?[A-Za-z0-9?]+/.test(t)) continue;
  const nt = t.replace(/chezzle\.js(?:\?[A-Za-z0-9]+)*/g, `chezzle.js?${VER}`);
  if (nt !== t) { fs.writeFileSync(f, nt, 'utf8'); patched++; }
}
console.log(`dist 引用版本同步 → ${VER}（${patched} 个 HTML）`);
