// ============================================================================
// levels/tutorial.html → 编辑器可加载的关卡 JSON（多场景 chapters 格式）
// 用法：node tools/make-level-json.mjs
// 说明：
//  - 按"场景段"（M.scene(...) ... ;）切分，段内用括号平衡截取每个 `.type(...)` 完整
//    调用（支持跨行调用：sign/TXT 文案、多参数池子都完整提取）；
//  - 接线属性化：wireLamp → switch.igniteId/extinguishId；deleteId 已有；
//    **场景切换/跨场景传送门/出口轮询是脚本逻辑，不进 JSON**（编辑器里用 chapters
//    插件的「切到场景」字段/自定义反应自己接；rope 演示块手动补一条 rope 对象）——
//    JSON 是可修改的编辑器副本，改完用编辑器导出 HTML。
//  - sign 路标文字取桌面文案（TXT 第一参数）。
// ============================================================================
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(HERE, '../levels/tutorial.html'), 'utf8');

/** 简化 JS 字面量 → JSON：' 换 "，属性名补引号（支持嵌套） */
function toJsonObj(text) {
  let depth = 0, start = -1;
  for (let i = text.length - 1; i >= 0; i--) {
    const ch = text[i];
    if (ch === '}') depth++;
    else if (ch === '{') { depth--; if (depth === 0) { start = i; break; } }
  }
  if (start < 0) return {};
  try { return JSON.parse(text.slice(start).replace(/'/g, '"').replace(/(\w+)\s*:/g, '"$1":')); } catch (e) { return {}; }
}

const scenes = new Map(); // name -> { worldW, worldH, atm, objects }

// ---- 场景段：M.scene('x', { worldW..worldH })  …  ; ----
const segRe = /M\.scene\('([^']+)'\s*,\s*\{([^}]*worldH:\s*\d+[^}]*)\}\s*([\s\S]*?);/g;
let seg;
while ((seg = segRe.exec(html))) {
  const name = seg[1];
  const wh = seg[2].match(/worldW:\s*(\d+)/);
  const hh = seg[2].match(/worldH:\s*(\d+)/);
  const body = seg[3];
  const scene = { worldW: wh ? +wh[1] : 1800, worldH: hh ? +hh[1] : 800, atm: {}, objects: [] };
  scenes.set(name, scene);

  // ---- 段内：括号平衡截取 .type(...) ----
  const callRe = /\.(\w+)\(/g;
  let m;
  while ((m = callRe.exec(body))) {
    const type = m[1];
    let depth = 0;
    let i = m.index + type.length + 1; // 跳过 .type(
    for (; i < body.length; i++) {
      if (body[i] === '(') depth++;
      else if (body[i] === ')') { depth--; if (depth === 0) break; }
    }
    const args = body.slice(m.index + type.length + 2, i).trim(); // 参数文本
    callRe.lastIndex = i + 1;
    if (!args) continue;
    const nums = (args.match(/^-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?/) ? args.match(/-?\d+(?:\.\d+)?/g).map(Number) : []);
    const opts = toJsonObj(args);
    const a = (n, d = 0) => nums[n] ?? d;
    let obj = null;
    if (type === 'floor' || type === 'pool' || type === 'door') {
      obj = { type, opts: { x: a(0), y: a(1), w: a(2), h: a(3), ...opts } };
    } else if (type === 'sign') {
      const q = args.indexOf("'");
      let text = '';
      if (q >= 0) {
        let end = q + 1;
        while (end < args.length && args[end] !== "'") { if (args[end] === '\\') end++; end++; }
        text = args.slice(q + 1, end).replace(/\\n/g, '\n').replace(/\\'/g, "'");
      }
      obj = { type, opts: { x: a(0), y: a(1), text, ...opts } };
    } else {
      obj = { type, opts: { x: a(0), y: a(1), ...opts } };
    }
    scene.objects.push(obj);
  }
}

// ---- 大气 ----
for (const m of html.matchAll(/M\.byName\('(\w+)'\)\.atmosphere\.setGas\('(\w+)',\s*(\d+)\)/g)) {
  const sc = scenes.get(m[1]);
  if (!sc) continue;
  sc.atm ??= {};
  sc.atm[m[2]] = +m[3];
}

// ---- wireLamp → igniteId/extinguishId ----
for (const m of html.matchAll(/wireLamp\('(\w+)',\s*'(\w+)',\s*'(\w+)'\)/g)) {
  const sc = scenes.get(m[1]);
  const sw = sc?.objects.find((o) => o.opts?.id === m[2]);
  if (sw) { sw.opts.igniteId = m[3]; sw.opts.extinguishId = m[3]; }
}

// ---- 演出剧本 SHOWTIME + 检查点 CHECKPOINTS（JS 字面量 → JSON 数组；TXT(a,b) 取 a）----
function extractArray(name) {
  const m = html.match(new RegExp('const ' + name + '\\s*=\\s*(\\[[\\s\\S]*?\\]);'));
  if (!m) return [];
  try {
    // 直接按 JS 语义求值（数据来自我们自己的关卡文件；TXT 取桌面文案第一参）
    const val = new Function('TXT', 'return (' + m[1] + ');')((a, b) => a);
    return JSON.parse(JSON.stringify(val ?? []));
  } catch (e) {
    console.log('解析 ' + name + ' 失败: ' + e.message);
    return [];
  }
}
const plays = extractArray('SHOWTIME');
const ck = extractArray('CHECKPOINTS');

// ---- 输出 ----
const list = [...scenes.entries()].map(([id, sc]) => ({
  id,
  snap: { worldW: sc.worldW, worldH: sc.worldH, rx: [], atm: sc.atm, objects: sc.objects },
}));
const out = {
  version: 2,
  levelId: 'tutorial',
  plugins: [
    { file: 'showtime.js', reg: 'showtime', name: '演出编排', enabled: true },
    { file: 'checkpoint.js', reg: 'checkpoint', name: '新手检查点', enabled: true },
    { file: 'chapters.js', reg: 'chapters', name: '章节场景', enabled: true },
  ],
  rx: [],
  atmosphere: {},
  editorState: {
    chapters: {
      scenes: list,
      current: list[0]?.id ?? 'a',
      start: list[0]?.id ?? 'a',
    },
    showtime: { plays },
    checkpoint: {
      spawns: ck,
      texts: ['复活！化学家从不回头看爆炸', '没事，NaOH 还有很多（30 克而已）', '刚才那是教学的一部分（才怪）', '重来一次！这回先看路标'],
    },
  },
  objects: list[0]?.snap.objects ?? [],
};
const json = JSON.stringify(out, null, 2);
writeFileSync(resolve(HERE, '../levels/tutorial-edit.json'), json, 'utf8');
console.log('场景: ' + list.map((s) => `${s.id}(${s.snap.objects.length})`).join(' '));
console.log('输出 levels/tutorial-edit.json (' + Math.round(json.length / 1024) + 'KB)');
