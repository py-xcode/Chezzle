/* ============================================================================
 * Chezzle 关卡启动层（levels/boot.js）
 * ----------------------------------------------------------------------------
 * 部署在 Cloudflare Pages，国内访问时引擎包（dist/chezzle.js ~800KB）下载慢。
 * 关卡页原本是"纯 canvas + 三个 script"，引擎没到时整页一片黑，没有反馈。
 * 本文件在**所有关卡脚本之前**执行：
 *   ① 立刻铺一层启动画面（内联注入样式，不额外请求 CSS，脚本本身 ~6KB 可缓存）；
 *   ② 启动画面 = 与选关页"进入关卡"过场同款的平行四边形信息卡 + 右下角 LOADING；
 *   ③ 选关页跳转前把元素/关卡信息写进 sessionStorage，这里读出来显示 → 跨页视觉连续；
 *   ④ window.load（引擎 + 关卡脚本都跑完、游戏已经 L.start()）后，整层淡出 +
 *      扫光 + 画布缩放入场，玩家看到的第一帧就是"关卡正在展开"而不是黑屏。
 * 用法（关卡 HTML，紧跟在 <body> 后一行）：
 *   <script src="boot.js"></script>
 * 直接打开 URL（无交接数据）时显示通用占位，不报错。
 * ========================================================================== */
(function () {
  'use strict';
  if (window.__czlBootLoaded) return;
  window.__czlBootLoaded = true;
  // 浏览器前进/后退缓存（bfcache）恢复页面时，整页 JS 状态（包括内存里的存档点快照）
  // 会原样复活。关卡要求"退出重进永远从关卡开头开始"，所以从 bfcache 恢复时强制重载。
  // 只处理 persisted 恢复；正常首次加载/刷新不受影响。
  try {
    window.addEventListener('pageshow', function (e) {
      if (e && e.persisted) location.reload();
    });
  } catch (e) { /* 老内核 */ }
  // SPA 外壳内嵌模式（?spa=1）：外壳负责加载层/转场；这里不再铺第二层启动画面，
  // 也不隐藏画布（iframe 本来就要等 load 之后才被外壳揭开），避免"双层加载动画"。
  try {
    if (/[?&]spa=1/.test(location.search) || (window.parent !== window && window.parent.__CZ_SPA__)) return;
  } catch (e) { /* 跨域 iframe 读 parent 会抛错：按独立页处理 */ }

  var REDUCE = false;
  try { REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { /* 老内核 */ }
  var COARSE = false;
  try { COARSE = matchMedia('(pointer: coarse)').matches || !matchMedia('(hover: hover)').matches; } catch (e) { /* 忽略 */ }
  var LOW = !REDUCE && (COARSE || Math.min(innerWidth, innerHeight) < 620);
  var PAYLOAD_KEY = 'chezzle-enter-v1';
  var GOLD = '232,184,75';

  // ---------------------------------------------------------------------------
  // 1. 样式（注入到 head，避免额外请求阻塞首屏）
  // ---------------------------------------------------------------------------
  var css = [
    '/* ===== czl boot（关卡启动层） ===== */',
    '#czlBoot{position:fixed;inset:0;z-index:2000;background:#07051a;display:flex;align-items:center;justify-content:center;',
    '  overflow:hidden;transition:opacity .62s ease}',
    '#czlBoot .bg{position:absolute;inset:0;',
    '  background:radial-gradient(1000px 620px at 50% 42%,rgba(var(--c,' + GOLD + '),.18),transparent 62%),',
    '    radial-gradient(1500px 900px at 50% 112%,rgba(20,14,64,.9),#07051a 62%),#07051a}',
    '#czlBoot .dots{position:absolute;inset:0;opacity:.5;background-image:',
    '  radial-gradient(1.5px 1.5px at 18% 24%,rgba(255,255,255,.8),transparent 60%),',
    '  radial-gradient(1.2px 1.2px at 73% 17%,rgba(207,230,255,.7),transparent 60%),',
    '  radial-gradient(1.6px 1.6px at 86% 63%,rgba(255,255,255,.55),transparent 60%),',
    '  radial-gradient(1.2px 1.2px at 31% 79%,rgba(207,230,255,.6),transparent 60%),',
    '  radial-gradient(1px 1px at 55% 88%,rgba(255,255,255,.5),transparent 60%),',
    '  radial-gradient(1.3px 1.3px at 9% 56%,rgba(255,255,255,.45),transparent 60%),',
    '  radial-gradient(1px 1px at 64% 41%,rgba(207,230,255,.45),transparent 60%)}',
    '#czlBoot .sigil{position:absolute;left:50%;top:47%;width:min(760px,92vmin);height:min(760px,92vmin);',
    '  transform:translate(-50%,-50%) rotate(0deg);opacity:.16;pointer-events:none;',
    '  animation:czlSigilSpin 68s linear infinite}',
    '@keyframes czlSigilSpin{to{transform:translate(-50%,-50%) rotate(360deg)}}',
    '#czlBoot .sigil path,#czlBoot .sigil circle{stroke:rgba(var(--c,' + GOLD + '),.75);fill:none}',
    '#czlBoot .sweep{position:absolute;left:-34%;top:-25%;width:22%;height:150%;opacity:0;pointer-events:none;',
    '  background:linear-gradient(90deg,transparent,rgba(255,255,255,.06) 40%,rgba(255,255,255,.24) 50%,rgba(255,255,255,.06) 60%,transparent);',
    '  transform:skewX(-18deg)}',
    '#czlBoot .center{position:relative;display:flex;flex-direction:column;align-items:center;gap:20px;',
    '  transition:transform .55s cubic-bezier(.3,.8,.3,1),opacity .45s ease}',
    '#czlBoot .tag{display:flex;align-items:center;gap:12px;font:11px/1 ui-monospace,Consolas,monospace;',
    '  letter-spacing:5px;color:rgba(var(--c,' + GOLD + '),.8)}',
    '#czlBoot .tag:before,#czlBoot .tag:after{content:"";width:26px;height:1px;background:currentColor;opacity:.5}',
    /* 信息卡（与选关页进入关卡过场同款平行四边形；外圈=描边层，内圈=底色层） */
    '.czlCard{position:relative;--c:' + GOLD + ';width:min(540px,86vw);',
    '  padding:1.5px;background:linear-gradient(135deg,rgba(var(--c),.92),rgba(var(--c),.22) 46%,rgba(var(--c),.66));',
    '  clip-path:polygon(26px 0,100% 0,calc(100% - 26px) 100%,0 100%);',
    '  filter:drop-shadow(0 0 26px rgba(var(--c),.22)) drop-shadow(0 18px 40px rgba(0,0,0,.55))}',
    '.czlCard .in{display:flex;align-items:center;gap:20px;padding:22px 30px 20px;',
    '  background:linear-gradient(140deg,rgba(20,22,56,.97),rgba(8,8,24,.98) 62%);',
    '  clip-path:polygon(25px 0,100% 0,calc(100% - 25px) 100%,0 100%)}',
    '.czlCard .sym{flex:0 0 auto;min-width:1.05em;text-align:center;font:bold 62px/1 "Segoe UI","Microsoft YaHei",sans-serif;',
    '  color:#fff;text-shadow:0 0 30px rgba(var(--c),.8)}',
    '.czlCard .sym svg{width:.92em;height:.92em;vertical-align:-.06em}',
    '.czlCard .txt{flex:1 1 auto;min-width:0;display:flex;flex-direction:column}',
    '.czlCard .num{font:10px/1 ui-monospace,Consolas,monospace;letter-spacing:2.5px;color:rgba(var(--c),.9)}',
    '.czlCard .name{margin:7px 0 3px;font-size:23px;font-weight:bold;letter-spacing:6px;color:#fff;',
    '  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.czlCard .sub{font-size:12.5px;letter-spacing:2px;color:#a9b8d0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.czlCard .meta{margin-top:9px;font-size:10.5px;letter-spacing:1.5px;color:#7180a0}',
    /* 右下角 LOADING 小平行四边形：边框一段白色绕圈 + 白色 LOADING */
    '.czlLoad{position:relative;width:168px;height:50px;display:grid;place-items:center;pointer-events:none}',
    '.czlLoad svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}',
    '.czlLoad .frame{fill:rgba(10,12,32,.72);stroke:rgba(255,255,255,.18);stroke-width:1.2;vector-effect:non-scaling-stroke}',
    '.czlLoad .spark{fill:none;stroke:#fff;stroke-width:1.9;stroke-linecap:round;stroke-dasharray:13 87;',
    '  animation:czlSpark 1.5s linear infinite}',
    '@keyframes czlSpark{to{stroke-dashoffset:-100}}',
    '.czlLoad span{position:relative;font:bold 11px/1 ui-monospace,Consolas,monospace;letter-spacing:6px;',
    '  color:#fff;padding-left:6px;text-shadow:0 0 12px rgba(255,255,255,.5)}',
    '#czlBoot .load{position:absolute;right:24px;bottom:24px;',
    '  bottom:calc(24px + env(safe-area-inset-bottom,0px))}',
    /* 揭开：启动层淡出 → 画布缩放入场 */
    'body.czlBooted #czlBoot{opacity:0;pointer-events:none}',
    'body.czlBooted #czlBoot .center{transform:translateY(-12px) scale(1.03);opacity:0}',
    'body.czlBooted #czlBoot .sweep{animation:czlBootSweep 1.05s cubic-bezier(.3,.7,.2,1) both}',
    '@keyframes czlBootSweep{0%{opacity:0;transform:translateX(0) skewX(-18deg)}12%{opacity:1}100%{opacity:0;transform:translateX(640%) skewX(-18deg)}}',
    /* 画布入场只在本脚本确实接管时才隐藏（脚本没加载成功时游戏照常显示，绝不黑屏） */
    'html.czlBooting #game{opacity:0;transform:scale(1.018);transition:opacity .75s ease .16s,transform .9s cubic-bezier(.25,.8,.3,1) .16s}',
    'html.czlBooting.czlBooted #game{opacity:1;transform:none}',
    /* 低档设备：省掉法阵旋转/滤镜/扫光（手机上每帧重合成很贵） */
    'body.czlLow #czlBoot .sigil{animation:none}',
    'body.czlLow .czlCard{filter:none}',
    'body.czlLow #czlBoot .sweep{display:none}',
    '@media (prefers-reduced-motion: reduce){',
    '  #czlBoot{transition:none}',
    '  #czlBoot .sigil{animation:none}',
    '  #czlBoot .sweep{display:none}',
    '  #czlBoot .center{transition:none}',
    '  .czlLoad .spark{animation:none;stroke-dasharray:none;stroke:rgba(255,255,255,.55)}',
    '  html.czlBooting #game{opacity:1;transform:none;transition:none}',
    '}',
    '@media (max-width:420px){.czlCard .sym{font-size:46px}.czlCard .name{font-size:19px;letter-spacing:4px}',
    '  .czlLoad{width:140px;height:44px}}',
  ].join('\n');
  var style = document.createElement('style');
  style.id = 'czl-boot-style';
  style.textContent = css;
  (document.head || document.documentElement).appendChild(style);

  // ---------------------------------------------------------------------------
  // 2. 选关页交接数据（sessionStorage；直接打开 URL 时没有 → 通用占位）
  // ---------------------------------------------------------------------------
  function normSeg(s) {
    try { s = decodeURIComponent(String(s || '')); } catch (e) { /* 原样 */ }
    s = String(s).split('?')[0].split('#')[0].replace(/\.html?$/i, '').replace(/\/+$/, '').toLowerCase();
    var parts = s.split('/');
    return parts[parts.length - 1] || '';
  }
  var data = null;
  try { data = JSON.parse(sessionStorage.getItem(PAYLOAD_KEY) || 'null'); } catch (e) { data = null; }
  if (!data || !data.file || normSeg(data.file) !== normSeg(location.pathname)) data = null;

  var accent = (data && data.accent) || GOLD;
  var symHTML = (data && data.symHTML) || (data && data.sym) || '·'; // 引导关可以是内联 SVG（选关页写进来的）
  var levelName = (data && data.elName) || '关卡';
  var sub = data ? (data.isoName || '') + (data.isoId ? ' · ' + data.isoId : '') : '元素回廊 · 直接进入';
  var num = data ? (data.num || ('LEVEL ' + (data.isoId || ''))) : 'CHEZZLE';
  var meta = (data && data.meta) || '';

  // ---------------------------------------------------------------------------
  // 3. 标记/骨架
  // ---------------------------------------------------------------------------
  document.documentElement.classList.add('czlBooting'); // 画布入场动画的开关（本脚本专用）
  if (LOW) document.body.classList.add('czlLow');
  document.documentElement.style.setProperty('--c', accent);

  var boot = document.createElement('div');
  boot.id = 'czlBoot';
  boot.setAttribute('role', 'status');
  boot.setAttribute('aria-live', 'polite');
  boot.style.setProperty('--c', accent);
  boot.innerHTML =
    '<div class="bg"></div>' +
    '<div class="dots"></div>' +
    '<svg class="sigil" viewBox="0 0 600 600" aria-hidden="true">' +
    '  <g stroke-width="1.4">' +
    '    <path d="M300 40 L576 300 L300 560 L24 300 Z"/>' +
    '    <path d="M300 118 L498 300 L300 482 L102 300 Z"/>' +
    '    <circle cx="300" cy="300" r="228" stroke-dasharray="24 26"/>' +
    '  </g>' +
    '</svg>' +
    '<div class="sweep"></div>' +
    '<div class="center">' +
    '  <div class="tag">CHEZZLE · LEVEL</div>' +
    '  <div class="czlCard">' +
    '    <div class="in">' +
    '      <span class="sym">' + symHTML + '</span>' +
    '      <span class="txt">' +
    '        <span class="num"></span>' +
    '        <b class="name"></b>' +
    '        <span class="sub"></span>' +
    '        <span class="meta"></span>' +
    '      </span>' +
    '    </div>' +
    '  </div>' +
    '</div>' +
    '<div class="load">' +
    '  <div class="czlLoad">' +
    '    <svg viewBox="0 0 168 50" preserveAspectRatio="none" aria-hidden="true">' +
    '      <path class="frame" d="M14 1 H167 L154 49 H1 Z"/>' +
    '      <path class="spark" pathLength="100" d="M14 1 H167 L154 49 H1 Z"/>' +
    '    </svg>' +
    '    <span>LOADING</span>' +
    '  </div>' +
    '</div>';
  (document.body || document.documentElement).appendChild(boot);
  // 文案单独赋值（避免把外部 id 直接拼进 innerHTML）
  boot.querySelector('.num').textContent = num;
  boot.querySelector('.name').textContent = levelName;
  boot.querySelector('.sub').textContent = sub;
  boot.querySelector('.meta').textContent = meta;
  boot.querySelector('.meta').style.display = meta ? '' : 'none';
  var card = boot.querySelector('.czlCard');
  if (card) card.style.setProperty('--c', accent);

  // ---------------------------------------------------------------------------
  // 4. 揭开：window.load（引擎已下载执行、关卡脚本已 L.start()）后再放行动画
  // ---------------------------------------------------------------------------
  var booted = false;
  function reveal() {
    if (booted) return;
    booted = true;
    // 两份 class：body 管启动层淡出（#czlBoot），html 管画布入场（html.czlBooting #game）
    document.body.classList.add('czlBooted');
    document.documentElement.classList.add('czlBooted');
    setTimeout(function () {
      if (boot && boot.parentNode) boot.parentNode.removeChild(boot);
    }, 1200);
  }
  // 最短展示 620ms（按页面导航起算）：秒开时也是一次完整的"关卡展开"过场，
  // 慢网时引擎下载多久就展示多久（这段就是真正的加载动画）。
  var MIN_SHOW = REDUCE ? 0 : 900;
  function arm() {
    var wait = Math.max(0, MIN_SHOW - performance.now());
    if (wait > 0) setTimeout(reveal, Math.min(wait, 900));
    else reveal();
  }
  if (document.readyState === 'complete') arm();
  else window.addEventListener('load', arm, { once: true });
})();
