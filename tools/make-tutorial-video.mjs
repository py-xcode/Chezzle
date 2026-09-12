// ============================================================================
// 教学视频录制器：无头 Chrome 通过 CDP 驱动 tools/tutorial-video.html 的虚拟时钟，
// 每帧 __adv(1/FPS) 后截一张图（确定性——剧本不依赖墙钟），最后 ffmpeg 合成 mp4。
// ----------------------------------------------------------------------------
// 用法：node tools/make-tutorial-video.mjs [--fps 12] [--scale 1] [--keep-frames]
// 依赖：系统 Chrome + PATH 里的 ffmpeg（或 FFMPEG 环境变量）。
// 产物：docs/video/tutorial-banners-appear.mp4（+ 同目录 preview.png 首帧）。
// ============================================================================
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const FPS = Math.max(1, Number(arg('--fps', 12)) || 12);
const SCALE = Math.max(0.5, Number(arg('--scale', 1)) || 1);
const KEEP = args.includes('--keep-frames');

function findChrome() {
  const cands = [
    process.env.CHROME,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/snap/bin/chromium',
  ].filter(Boolean);
  for (const c of cands) if (existsSync(c)) return c;
  throw new Error('找不到 Chrome（设 CHROME 环境变量指定路径）');
}
function findFfmpeg() {
  if (process.env.FFMPEG && existsSync(process.env.FFMPEG)) return process.env.FFMPEG;
  const w = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['ffmpeg'], { encoding: 'utf8' });
  const line = (w.stdout || '').split(/\r?\n/)[0];
  if (line && existsSync(line.trim())) return line.trim();
  return null;
}

// 小静态服务器：file:// 下 fetch/Cookie/iframe 跨目录受限，用 http 承载项目根
async function serve() {
  const server = createServer(async (req, res) => {
    try {
      const p = decodeURIComponent(req.url.split('?')[0]);
      const file = resolve(ROOT, '.' + (p === '/' ? '/index.html' : p));
      if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
      const buf = await readFile(file);
      const ext = file.split('.').pop();
      const mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', png: 'image/png', json: 'application/json' }[ext] || 'application/octet-stream';
      res.writeHead(200, { 'content-type': mime + '; charset=utf-8' }).end(buf);
    } catch (e) {
      res.writeHead(404).end('404 ' + e.message);
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, port: server.address().port };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const chrome = findChrome();
  const { server, port } = await serve();
  const url = `http://127.0.0.1:${port}/tools/tutorial-video.html`;
  const profile = mkdtempSync(join(tmpdir(), 'czvid-'));
  const wsPort = 9333;
  const proc = spawn(chrome, [
    '--headless=new', `--user-data-dir=${profile}`, `--remote-debugging-port=${wsPort}`,
    '--no-first-run', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
    '--allow-file-access-from-files', '--font-render-hinting=none',
    `--window-size=${Math.round(1280 * SCALE)},${Math.round(800 * SCALE)}`,
    '--force-device-scale-factor=1',
    url,
  ], { stdio: 'ignore' });

  // 等 CDP target
  let targets = null;
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    try {
      const r = await fetch(`http://127.0.0.1:${wsPort}/json/list`);
      const j = await r.json();
      const pg = j.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (pg) { targets = pg; break; }
    } catch { /* 还没起来 */ }
  }
  if (!targets) { proc.kill(); server.close(); throw new Error('连不上 Chrome DevTools（端口被占？换 wsPort）'); }

  const ws = new WebSocket(targets.webSocketDebuggerUrl);
  await new Promise((r, rej) => { ws.onopen = r; ws.onerror = rej; });
  let msgId = 0;
  const pending = new Map();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
  };
  const send = (method, params = {}) => new Promise((res) => {
    const id = ++msgId;
    pending.set(id, (d) => res(d.result ?? d.error ?? {}));
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('页面 JS 异常: ' + (r.exceptionDetails.text || JSON.stringify(r.exceptionDetails)));
    return r.result?.value;
  };

  await send('Runtime.enable');
  await send('Page.enable');
  // 等页面就绪（编辑器 iframe load + bootEditor 完成，__adv 可用且 ready 标志）
  for (let i = 0; i < 40; i++) {
    const ok = await evaluate(`!!(window.__adv && window.__edReady)`);
    if (ok) break;
    await sleep(500);
  }
  const ready = await evaluate(`!!(window.__adv && window.__edReady)`);
  if (!ready) { proc.kill(); server.close(); throw new Error('演示页未就绪（__edReady 一直 false）'); }
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: SCALE, mobile: false });

  const frames = mkdtempSync(join(tmpdir(), 'czframes-'));
  const DT = 1 / FPS;
  const MAX_FRAMES = FPS * 120; // 上限 120s
  console.log(`录制中：${url}  ·  ${FPS}fps · 1280x800@${SCALE}x`);
  let n = 0;
  let demoDone = false;
  const t0 = Date.now();
  while (!demoDone && n < MAX_FRAMES) {
    const st = await evaluate(`window.__adv(${DT})`); // 推进一帧虚拟时钟（step 游戏 + 触发剧本）
    await sleep(30); // 让 step()/渲染的 DOM 改动落地
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(frames, `f${String(n).padStart(5, '0')}.png`), Buffer.from(shot.data ?? '', 'base64'));
    n++;
    demoDone = !!st?.done;
    if (n % 24 === 0) process.stdout.write(`  帧 ${n}  T=${(st?.T ?? 0).toFixed(1)}s  ${((Date.now() - t0) / 1000).toFixed(0)}s 墙钟\n`);
  }
  console.log(`录毕：${n} 帧（${(n / FPS).toFixed(1)}s 视频）`);
  // 演示页自检轨迹（横幅/出现是否真的发生——防"静默失效"的视频出厂）
  const qaLog = await evaluate('JSON.stringify(window.__qaLog || [])');
  let marks = [];
  try { marks = JSON.parse(qaLog || '[]'); } catch { /* 空 */ }
  // 编辑器侧核对：插件已载、横幅剧本 2 条、玩家/烧杯延迟值 4/8
  const edQa = await evaluate(`(() => { try {
    const w = document.getElementById('ed').contentWindow;
    return w.eval('JSON.stringify({plug: pluginLib.has("tutorial.js"), banners: ((editorStates.get("tutorial")||{}).banners||[]).length, pDel: (state.placed.find(p=>p.type=="player")||{obj:{}}).obj.appearDelay, bDel: (state.placed.find(p=>p.type=="beaker")||{obj:{}}).obj.appearDelay, panel: !![...document.querySelectorAll(".edPanel")].find(x=>x.textContent.indexOf("横幅剧本")>=0)})');
  } catch (e) { return JSON.stringify({ err: String(e.message) }); } })()`);
  const edo = JSON.parse(edQa || '{}');
  const okEd = edo.plug === true && edo.banners === 2 && edo.pDel === 4 && edo.bDel === 8 && edo.panel === true;
  marks.push(`EDITOR ${edQa} => ${okEd ? 'OK' : 'FAIL'}`);
  try {
    writeFileSync(join(ROOT, 'docs', 'video', 'qa.txt'), marks.join('\n') + `\nframes=${n}\n`);
    console.log('QA 轨迹：');
    for (const m of marks) console.log('  ' + m);
    if (marks.some((m) => m.startsWith('FATAL')) || !okEd) throw new Error('自检未通过（FATAL/EDITOR FAIL），中止合成');
  } catch (e) { if (String(e.message).includes('未通过')) throw e; console.log('（QA 写入失败：' + e.message + '）'); }

  const outDir = join(ROOT, 'docs', 'video');
  mkdirSync(outDir, { recursive: true });
  // 结尾画面预览图（文档/README 用）
  if (n > 0) {
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(outDir, 'preview.png'), Buffer.from(shot.data ?? '', 'base64'));
  }

  ws.close();
  proc.kill();
  server.close();
  // Chrome 退出有延迟（Crashpad 锁文件），清理失败不致命：TEMP 目录系统自会回收
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* 下次开机自清 */ }

  const out = join(outDir, 'tutorial-banners-appear.mp4');
  const ffmpeg = findFfmpeg();
  if (!ffmpeg) {
    console.log('⚠ 未找到 ffmpeg：帧已存 ' + frames + (KEEP ? '' : '（临时）'));
    console.log('  手动合成：ffmpeg -framerate ' + FPS + ' -i "' + frames + '/f%05d.png" -pix_fmt yuv420p -c:v libx264 "' + out + '"');
    return;
  }
  const cmd = ['-y', '-framerate', String(FPS), '-i', join(frames, 'f%05d.png'),
    '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', out];
  console.log('合成：ffmpeg ' + cmd.join(' '));
  const ff = spawnSync(ffmpeg, cmd, { encoding: 'utf8' });
  if (ff.status !== 0) { console.error(ff.stderr.slice(-2000)); throw new Error('ffmpeg 合成失败'); }
  console.log('✅ 视频：' + out);
  if (!KEEP) rmSync(frames, { recursive: true, force: true });
  else console.log('帧保留：' + frames);
}
main().catch((e) => { console.error('✗ ' + e.message); process.exit(1); });
