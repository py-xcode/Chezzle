/* ============================================================================
   Chezzle 偏好设置（经典脚本，独立于引擎）
   ----------------------------------------------------------------------------
   - 首页「设置」面板写入；关卡页 / 首页小舞台 / 引擎都读同一份 localStorage。
   - 必须作为**普通脚本**在引擎之前加载（index.html、levels/*.html）。
   - 引擎侧读取见 src/core/prefs.js（window.ChezzlePrefs 缺失时退回默认值，方便 Node 测试）。
   ========================================================================== */
(function () {
  'use strict';

  var KEY = 'chezzle.prefs.v1';

  /** 可改键的动作（顺序即设置面板显示顺序） */
  var ACTIONS = [
    { id: 'left', label: '左移', def: 'KeyA' },
    { id: 'right', label: '右移', def: 'KeyD' },
    { id: 'jump', label: '跳跃', def: 'Space' },
    { id: 'place', label: '放置', def: 'ShiftLeft' },
    { id: 'collect', label: '拾取 / 收集', def: 'KeyQ' },
    { id: 'grab', label: '物品操作 1', def: 'KeyC' },
    { id: 'use', label: '物品操作 2', def: 'KeyX' },
    { id: 'restart', label: '重开', def: 'KeyR' },
    { id: 'overview', label: '鸟瞰', def: 'KeyV' },
  ];

  var RANGES = {
    viewScale: { min: 0.85, max: 1.3 },
    joyScale: { min: 0.8, max: 1.4 },
    btnScale: { min: 0.8, max: 1.4 },
    sfxVolume: { min: 0, max: 1 },
  };

  /** 夹到 [min, max]；非数字 → 该项默认值（不写死 1：音量默认是 0.7） */
  function clampNum(v, min, max, dflt) {
    var n = Number(v);
    if (!Number.isFinite(n)) return dflt;
    return Math.max(min, Math.min(max, n));
  }

  function defaultKeys() {
    var k = {};
    for (var i = 0; i < ACTIONS.length; i++) k[ACTIONS[i].id] = ACTIONS[i].def;
    return k;
  }

  function defaults() {
    return { viewScale: 1, joyScale: 1, btnScale: 1, sfxVolume: 0.7, sfxMuted: false, keys: defaultKeys() };
  }

  /** 把任意来源的对象规范成完整、合法的偏好（缺字段补默认、越界夹回） */
  function normalize(raw) {
    var d = defaults();
    var out = {
      viewScale: d.viewScale, joyScale: d.joyScale, btnScale: d.btnScale,
      sfxVolume: d.sfxVolume, sfxMuted: d.sfxMuted, keys: d.keys,
    };
    if (!raw || typeof raw !== 'object') return out;
    var name;
    for (name in RANGES) {
      if (Object.prototype.hasOwnProperty.call(raw, name)) {
        out[name] = clampNum(raw[name], RANGES[name].min, RANGES[name].max, d[name]);
      }
    }
    // 静音是开关：只认真正的 true（"false"/0/字符串一律视为未静音）
    if (Object.prototype.hasOwnProperty.call(raw, 'sfxMuted')) out.sfxMuted = raw.sfxMuted === true;
    if (raw.keys && typeof raw.keys === 'object') {
      for (var i = 0; i < ACTIONS.length; i++) {
        var a = ACTIONS[i];
        var code = raw.keys[a.id];
        if (typeof code === 'string' && code.length > 0 && code.length < 40) out.keys[a.id] = code;
      }
    }
    return out;
  }

  var cache = null;

  function readStorage() {
    try {
      var s = window.localStorage.getItem(KEY);
      if (!s) return null;
      return JSON.parse(s);
    } catch (e) { return null; }
  }

  /** 当前偏好（缓存对象；只读使用，不要直接改） */
  function get() {
    if (!cache) cache = normalize(readStorage());
    return cache;
  }

  function emit(prefs) {
    try {
      window.dispatchEvent(new CustomEvent('chezzle:prefs', { detail: prefs }));
    } catch (e) { /* 老内核 */ }
  }

  /** 合并保存（keys 支持部分字段；其余字段可只传变化的） */
  function save(patch) {
    var cur = get();
    var next = normalize({
      viewScale: patch && patch.viewScale !== undefined ? patch.viewScale : cur.viewScale,
      joyScale: patch && patch.joyScale !== undefined ? patch.joyScale : cur.joyScale,
      btnScale: patch && patch.btnScale !== undefined ? patch.btnScale : cur.btnScale,
      sfxVolume: patch && patch.sfxVolume !== undefined ? patch.sfxVolume : cur.sfxVolume,
      sfxMuted: patch && patch.sfxMuted !== undefined ? patch.sfxMuted : cur.sfxMuted,
      keys: patch && patch.keys ? Object.assign({}, cur.keys, patch.keys) : cur.keys,
    });
    cache = next;
    try { window.localStorage.setItem(KEY, JSON.stringify(next)); } catch (e) { /* 隐私模式 */ }
    emit(next);
    return next;
  }

  /** 恢复默认（删掉存储） */
  function reset() {
    cache = defaults();
    try { window.localStorage.removeItem(KEY); } catch (e) { /* 忽略 */ }
    emit(cache);
    return cache;
  }

  function listen(fn) {
    if (typeof fn !== 'function') return function () {};
    var h = function (e) { fn(e.detail); };
    window.addEventListener('chezzle:prefs', h);
    return function () { window.removeEventListener('chezzle:prefs', h); };
  }

  // 跨文档同步：SPA 里选关/关于/关卡是**常驻 iframe**，设置面板在首页文档里改完 localStorage
  // 只会触发别的文档的 storage 事件（本页不触发）。这里清掉 cache 再广播一次——
  // 否则 audio.js 之类的订阅方读到的还是本页的旧缓存（音量/静音改了不生效）。
  try {
    window.addEventListener('storage', function (e) {
      if (e && e.key != null && e.key !== KEY) return;
      cache = null;
      emit(get());
    });
  } catch (e) { /* 老内核 */ }

  var NAMED = {
    Space: '空格', ShiftLeft: 'Shift', ShiftRight: 'Shift', ControlLeft: 'Ctrl', ControlRight: 'Ctrl',
    AltLeft: 'Alt', AltRight: 'Alt', MetaLeft: 'Win/Cmd', MetaRight: 'Win/Cmd',
    ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
    Tab: 'Tab', Escape: 'Esc', Enter: '回车', Backspace: '退格', CapsLock: 'Caps',
    Comma: '，', Period: '。', Slash: '/', Semicolon: '；', Quote: '’', BracketLeft: '[', BracketRight: ']',
    Minus: '-', Equal: '=', Backquote: '`', Backslash: '\\',
  };

  /** 键位显示名（KeyA → A；Digit1 → 1；Space → 空格…） */
  function keyLabel(code) {
    if (!code) return '—';
    if (NAMED[code]) return NAMED[code];
    var m = /^Key([A-Z])$/.exec(code);
    if (m) return m[1];
    m = /^Digit([0-9])$/.exec(code);
    if (m) return m[1];
    m = /^Numpad([0-9])$/.exec(code);
    if (m) return '小键盘' + m[1];
    m = /^F([0-9]{1,2})$/.exec(code);
    if (m) return 'F' + m[1];
    return code.replace(/^(Key|Digit)/, '');
  }

  window.ChezzlePrefs = {
    KEY: KEY,
    ACTIONS: ACTIONS,
    RANGES: RANGES,
    get: get,
    save: save,
    reset: reset,
    listen: listen,
    keyLabel: keyLabel,
    normalize: normalize,
  };
})();
