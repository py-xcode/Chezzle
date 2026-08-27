// ============================================================================
// 操作录制/回放工具（开发用）：
//  ├─ 录制：关卡 URL 加 `?record=1` → 页面浮出录制面板。自动记录玩家全部
//  │   操作（键盘 keydown/keyup、触摸 down/move/up、鼠标按下/拖动/抬起/点击），
//  │   坐标一律记**画布坐标**（回放时屏幕尺寸不同也照常）；按 R 重开局自动
//  │   分"段"（每次挑战内独立回放）。停止后下载为 JSON 文件；
//  ├─ 回放：把录制的 .json 拖回（或文件选择）关卡页 → 页面自动重载 →
//  │   按录制时的操作序列回放；`Math.random` 用录制时的种子重装——
//  │   游戏内随机数序列与录制完全一致（操作 + 随机双重还原，可稳定复现）；
//  │   每段结束自动切下一段（重载推进），全部回放完给出提示。
// 用法（无需改关卡文件）：
//   levels/xxx.html?record=1          —— 录制
//   levels/xxx.html + 拖入录制的文件   —— 回放
// ============================================================================

import { CFG } from './config.js';

// ---------------------------------------------------------------------------
// 种子随机（mulberry32）：回放时用同一种子，游戏内 Math.random 序列一致
// ---------------------------------------------------------------------------

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 把 Math.random 换成同种子 PRNG（返回被替换的旧函数） */
export function installSeed(seed) {
  const old = Math.random;
  Math.random = mulberry32(seed);
  return old;
}

// ---------------------------------------------------------------------------
// 录制器
// ---------------------------------------------------------------------------
// 事件格式（k 为类型；x/y 为画布坐标；t 为 scene.time）：
//   {t, k:'kd'|'ku', code}                      键盘按下/抬起
//   {t, k:'td'|'tm'|'tu', x, y, id}             触摸 down/move/up（含 cancel→tu）
//   {t, k:'md'|'mm'|'mu'|'cl', x, y, btn}       鼠标按下/移动/抬起/点击

export class GameRecorder {
  /**
   * @param getScene () => Scene|null —— 录制时间源（单场景/多场景活跃场景）
   * @param surface  事件表面（单场景=canvas；多场景=容器 div）
   */
  constructor(getScene, surface) {
    this.getScene = getScene;
    this.surface = surface;
    this.runs = []; // 完成的段：[{t0,t1,events:[...]}]
    this.records = null; // 录制中的段事件
    this.seed = 0;
    this._listeners = null;
    this._ctx = {
      toCanvasX: 0, // 正在改的触点坐标缓存（一次 touch 事件多触点 → 逐点记录）
      toCanvasY: 0,
    };
  }

  get on() {
    return !!this.records;
  }

  _now() {
    const s = typeof this.getScene === 'function' ? this.getScene() : null;
    return s && Number.isFinite(s.time) ? s.time : 0;
  }

  // ---- 录制核心（事件处理器直接写入；DOM 监听器只是翻译坐标后的薄壳） ----

  /** 键盘（down=true 按下 / false 抬起）；R 重开局 → 结束当前段 */
  key(code, down) {
    if (!this.on) return;
    this.records.push({ t: this._now(), k: down ? 'kd' : 'ku', code });
    if (down && code === 'KeyR') this._endRun();
  }

  /** 触摸（kind: 'td'|'tm'|'tu'） */
  touch(kind, x, y, id) {
    if (!this.on) return;
    this.records.push({ t: this._now(), k: kind, x, y, id });
  }

  /** 鼠标（kind: 'md'|'mm'|'mu'|'cl'） */
  mouse(kind, x, y, btn = 0) {
    if (!this.on) return;
    const e = { t: this._now(), k: kind, x, y, btn };
    if (kind === 'md' || kind === 'cl') e.btn = btn;
    this.records.push(e);
  }

  // ---- 生命周期 ----

  /** 开始录制：种子随机 + 绑定 DOM 监听（node/无 DOM 环境仅设状态） */
  start() {
    if (this.on) return;
    this.seed = ((Date.now() & 0x7fffffff) ^ ((Math.random() * 0x7fffffff) | 0)) >>> 0;
    installSeed(this.seed);
    this.records = [];
    this._bind();
  }

  /** 停止录制（结束当前段 + 解绑）→ 返回段数据 */
  stop() {
    if (!this.on) return [];
    this._endRun();
    this._unbind();
    return this.runs;
  }

  _endRun() {
    if (!this.records || this.records.length === 0) return;
    const ev = this.records;
    this.runs.push({ t0: ev[0].t, t1: ev[ev.length - 1].t, events: ev });
    this.records = [];
  }

  /** 文件数据（JSON-ready） */
  data() {
    const lastRun = this.on ? [...this.records] : [];
    return {
      version: 1,
      url: typeof location !== 'undefined' ? location.href.split('?')[0] : '',
      seed: this.seed,
      tickRate: CFG.tickRate,
      runs: lastRun.length
        ? [...this.runs, { t0: lastRun[0].t, t1: lastRun[lastRun.length - 1].t, events: lastRun }]
        : this.runs,
    };
  }

  _bind() {
    if (this._listeners || typeof window === 'undefined' || !this.surface) return;
    const s = this.surface;
    const toCanvas = (e) => {
      const r = s.getBoundingClientRect ? s.getBoundingClientRect() : { left: 0, top: 0, width: s.width, height: s.height };
      const kx = s.width / Math.max(1, r.width);
      const ky = s.height / Math.max(1, r.height);
      return { x: (e.clientX - r.left) * kx, y: (e.clientY - r.top) * ky };
    };
    const kd = (e) => this.key(e.code, true);
    const ku = (e) => this.key(e.code, false);
    const ts = (e) => {
      for (const t of e.changedTouches) this.touch('td', ...this._tp(t, toCanvas, e), t.identifier);
    };
    const tm = (e) => {
      for (const t of e.changedTouches) this.touch('tm', ...this._tp(t, toCanvas, e), t.identifier);
    };
    const te = (e) => {
      for (const t of e.changedTouches) this.touch('tu', ...this._tp(t, toCanvas, e), t.identifier);
    };
    const md = (e) => this.mouse('md', ...Object.values(toCanvas(e)), e.button ?? 0);
    const mm = (e) => this.mouse('mm', ...Object.values(toCanvas(e)));
    const mu = (e) => this.mouse('mu', ...Object.values(toCanvas(e)), e.button ?? 0);
    const cl = (e) => this.mouse('cl', ...Object.values(toCanvas(e)));
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    s.addEventListener('touchstart', ts, { passive: true });
    window.addEventListener('touchmove', tm, { passive: true });
    s.addEventListener('touchend', te, { passive: true });
    s.addEventListener('touchcancel', te, { passive: true });
    s.addEventListener('mousedown', md);
    window.addEventListener('mousemove', mm);
    window.addEventListener('mouseup', mu);
    s.addEventListener('click', cl);
    this._listeners = { kd, ku, ts, tm, te, md, mm, mu, cl };
  }

  /** 触点 → 画布坐标 */
  _tp(t, toCanvas, e) {
    const p = toCanvas({ clientX: t.clientX, clientY: t.clientY });
    return [p.x, p.y];
  }

  _unbind() {
    const L = this._listeners;
    if (!L) return;
    window.removeEventListener('keydown', L.kd);
    window.removeEventListener('keyup', L.ku);
    this.surface.removeEventListener('touchstart', L.ts);
    window.removeEventListener('touchmove', L.tm);
    this.surface.removeEventListener('touchend', L.te);
    this.surface.removeEventListener('touchcancel', L.te);
    this.surface.removeEventListener('mousedown', L.md);
    window.removeEventListener('mousemove', L.mm);
    window.removeEventListener('mouseup', L.mu);
    this.surface.removeEventListener('click', L.cl);
    this._listeners = null;
  }
}

// ---------------------------------------------------------------------------
// 回放
// ---------------------------------------------------------------------------

/** 事件 → 真实 DOM 事件（走游戏原本的监听器，管线零差别） */
export function dispatchReplayEvent(surface, ev) {
  if (typeof window === 'undefined') return false;
  const toClient = (x, y) => {
    const r = surface.getBoundingClientRect ? surface.getBoundingClientRect() : { left: 0, top: 0 };
    return {
      clientX: r.left + (x / Math.max(1, surface.width)) * Math.max(1, r.width),
      clientY: r.top + (y / Math.max(1, surface.height)) * Math.max(1, r.height),
    };
  };
  if (ev.k === 'kd' || ev.k === 'ku') {
    window.dispatchEvent(new KeyboardEvent(ev.k === 'kd' ? 'keydown' : 'keyup', { code: ev.code, bubbles: true, cancelable: true }));
    return true;
  }
  if (ev.k === 'td' || ev.k === 'tm' || ev.k === 'tu') {
    const p = toClient(ev.x, ev.y);
    const t = new Touch({ identifier: ev.id, target: surface, clientX: p.clientX, clientY: p.clientY });
    const type = ev.k === 'td' ? 'touchstart' : ev.k === 'tm' ? 'touchmove' : 'touchend';
    surface.dispatchEvent(new TouchEvent(type, { touches: [t], changedTouches: [t], bubbles: true, cancelable: true }));
    return true;
  }
  if (ev.k.startsWith('m')) {
    const p = toClient(ev.x, ev.y);
    const type = { md: 'mousedown', mm: 'mousemove', mu: 'mouseup', cl: 'click' }[ev.k];
    const target = ev.k === 'mm' || ev.k === 'mu' ? window : surface;
    target.dispatchEvent(new MouseEvent(type, { clientX: p.clientX, clientY: p.clientY, button: ev.btn ?? 0, bubbles: true, cancelable: true }));
    return true;
  }
  return false;
}

/** 按 scene.time 推进回放：注册到活跃场景的 onTick；R 重开局 = 段结束（不放 reload）。
 *  @param events 按 t 升序的录制事件
 *  @param opts { sink(ev)=dispatchReplayEvent, onDone(), onEvent(ev) }
 *  @returns 停止函数 */
export function replayEvents(getScene, surface, events, opts = {}) {
  const sink = opts.sink ?? ((ev) => dispatchReplayEvent(surface, ev));
  let ptr = 0;
  const scene = typeof getScene === 'function' ? getScene() : getScene;
  if (!scene || typeof scene.onTick !== 'function') return () => {};
  let stop = () => {};
  const tick = () => {
    const t = scene.time;
    // 严格 t < 当前帧时间：录制时按键落在 tick 之后，其效果自下一 tick 生效——
    // 回放也要在下一 tick 应用（否则同一 tick 内按键提前生效，差一整帧运动量）
    while (ptr < events.length && events[ptr].t < t) {
      const ev = events[ptr++];
      opts.onEvent?.(ev);
      // 重开局（R）：不放行（会触发页面重载）——作为段结束信号
      if (ev.k === 'kd' && ev.code === 'KeyR') {
        stop();
        opts.onDone?.(true);
        return;
      }
      sink(ev);
    }
    if (ptr >= events.length) {
      stop();
      opts.onDone?.(false);
    }
  };
  stop = scene.onTick(tick);
  return stop;
}

// ---------------------------------------------------------------------------
// 页面面板（?record=1 → 录制；会话内有回放数据 → 回放模式）
// ---------------------------------------------------------------------------

const REPLAY_KEY = 'czl-replay-v1'; // sessionStorage：拖入的回放文件（JSON 文本）

/**
 * 挂载录制/回放面板。返回 { recorder, startReplayFromData(data), destroy }。
 * getScene：() => 活跃 Scene（时间源/回放注册 onTick）。
 * surface：事件表面（canvas 或容器）。
 */
export function attachRecorderPanel(getScene, surface) {
  const recorder = new GameRecorder(getScene, surface);
  const rec = recorder;

  // ---- DOM 面板 ----
  let el = null;
  let btn = null;
  let stat = null;
  let dot = null;
  let runInfo = null;
  function ensurePanel() {
    if (el || typeof document === 'undefined') return;
    el = document.createElement('div');
    el.id = 'czl-recorder';
    el.style.cssText = [
      'position:fixed;top:44px;left:8px;z-index:60;display:flex;align-items:center;gap:8px;',
      'padding:6px 10px;border-radius:9px;border:1px solid #2b3047;background:rgba(12,10,32,.92);',
      'color:#dfe8f2;font:12px "Segoe UI","Microsoft YaHei",sans-serif;',
      'backdrop-filter:blur(2px);user-select:none;',
    ].join('');
    dot = document.createElement('span');
    dot.id = 'czl-rec-dot';
    dot.textContent = '●';
    dot.style.color = '#ff3b30';
    dot.style.animation = 'czl-bl 1s steps(2) infinite';
    stat = document.createElement('span');
    stat.textContent = '⏺ 录制中…';
    btn = document.createElement('button');
    btn.type = 'button';
    btn.style.cssText = 'cursor:pointer;padding:3px 10px;border:1px solid #e8b84b;background:#241a02;color:#ffe9b0;font-weight:bold;border-radius:6px;';
    btn.textContent = '⏹ 停止并下载';
    btn.addEventListener('click', () => {
      if (rec.on) {
        const runs = rec.stop();
        stat.textContent = `已停止 · ${runs.length} 段 · ${runs.reduce((n, r) => n + r.events.length, 0)} 事件`;
        dot.style.color = '#6a7a96';
        dot.style.animation = '';
        btn.textContent = '⏺ 重新录制';
        addDownload();
        addLoadHint();
      } else {
        rec.start();
        stat.textContent = '⏺ 录制中…';
        dot.style.color = '#ff3b30';
        dot.style.animation = 'czl-bl 1s steps(2) infinite';
        btn.textContent = '⏹ 停止并下载';
        runInfo && runInfo.remove();
      }
    });
    el.append(dot, stat, btn);
    document.body.appendChild(el);
    const st = document.createElement('style');
    st.textContent = '@keyframes czl-bl{50%{opacity:.15}}';
    document.head.appendChild(st);
  }

  function addDownload() {
    const data = rec.data();
    if (!data.runs.length) return;
    const a = document.createElement('a');
    a.textContent = '⬇ 下载';
    a.style.cssText = 'color:#7fd8ff;cursor:pointer;text-decoration:underline;';
    a.addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
      const u = URL.createObjectURL(blob);
      const dl = document.createElement('a');
      const d = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      dl.href = u;
      dl.download = `chezzle-记录-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
      dl.click();
      setTimeout(() => URL.revokeObjectURL(u), 4000);
    });
    el.appendChild(a);
    return a;
  }

  function addLoadHint() {
    if (document.getElementById('czl-rec-load')) return;
    const h = document.createElement('span');
    h.id = 'czl-rec-load';
    h.textContent = '· 拖入 .json 回放';
    h.style.color = '#5f6d8f';
    el.appendChild(h);
  }

  // ---- 回放模式（sessionStorage 有回放数据 → 页面加载后自动回放） ----
  function enterReplay(data) {
    try { sessionStorage.setItem(REPLAY_KEY, JSON.stringify(data)); } catch (e) { /* 大文件存不下 */ }
    if (typeof location !== 'undefined') location.reload();
  }

  function startReplayIfAny() {
    if (typeof sessionStorage === 'undefined') return false;
    let data = null;
    try { data = JSON.parse(sessionStorage.getItem(REPLAY_KEY) || 'null'); } catch (e) { return false; }
    if (!data || !data.runs || !data.runs.length) return false;
    const runIdx = parseRunIdxFromUrl() || 0;
    if (runIdx >= data.runs.length) {
      sessionStorage.removeItem(REPLAY_KEY);
      cleanupHash();
      notify('回放完成：全部 ' + data.runs.length + ' 段已播放');
      return;
    }
    ensurePanel();
    installSeed(data.seed);
    const scene = typeof getScene === 'function' ? getScene() : null;
    if (!scene) return;
    const run = data.runs[runIdx];
    const events = run.events;
    stat.textContent = `▶ 回放中 第 ${runIdx + 1}/${data.runs.length} 段 · ${events.length} 事件`;
    dot.style.color = '#7fd8ff';
    btn.style.display = 'none';
    replayEvents(() => scene, surface, events, {
      onDone: () => {
        const next = runIdx + 1;
        try { sessionStorage.setItem(REPLAY_KEY, JSON.stringify(data)); } catch (e) {}
        location.hash = `czl-replay-run=${next}`;
        location.reload();
      },
    });
    return true;
  }

  function parseRunIdxFromUrl() {
    const m = /czl-replay-run=(\d+)/.exec(location.hash || '');
    return m ? parseInt(m[1], 10) : 0;
  }

  function cleanupHash() {
    if (typeof location !== 'undefined' && location.hash) location.hash = '';
  }

  function notify(text) {
    if (typeof document === 'undefined') return;
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;left:50%;top:16%;transform:translateX(-50%);z-index:70;padding:10px 22px;border:1px solid #e8b84b;background:#241a02;color:#ffe9b0;font:bold 14px "Segoe UI","Microsoft YaHei",sans-serif;border-radius:8px;box-shadow:0 0 22px rgba(232,184,75,.45);';
    d.textContent = text;
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 4000);
  }

  // ---- 拖入文件 / 文件选择 ----
  function bindDrop() {
    if (typeof document === 'undefined') return;
    document.addEventListener('dragover', (e) => e.preventDefault());
    document.addEventListener('drop', (e) => {
      e.preventDefault();
      const f = [...(e.dataTransfer?.files ?? [])].find((x) => /\.json$/i.test(x.name));
      if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        try {
          const data = JSON.parse(rd.result);
          if (!data.runs) throw new Error('不是录制文件');
          if (rec.on) rec.stop();
          enterReplay(data);
        } catch (err) { notify('回放文件无效：' + err.message); }
      };
      rd.readAsText(f);
    });
  }

  ensurePanel();
  bindDrop();
  if (!startReplayIfAny() && !rec.on) {
    // ?record=1 打开即自动开录（录到停止/下载为止）
    rec.start();
  }
  return {
    recorder: rec,
    /** 编程式开始回放（无文件交互；E2E/控制台用） */
    startReplayFromData: enterReplay,
    destroy: () => {
      if (typeof document !== 'undefined') document.getElementById('czl-recorder')?.remove();
    },
  };
}
