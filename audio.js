/* ============================================================================
   Chezzle 音效引擎（经典脚本，独立于引擎包）
   ----------------------------------------------------------------------------
   为什么是"合成"而不是音频文件：
     · 纯 H5 静态站，不引入外部音频资源——没有下载、没有解码、没有 404；
     · 音色可以按游戏语言定制：水晶/玻璃/金属/液体的短音，全部用 Web Audio
       振荡器 + 噪声 + 卷积混响实时合成（每个音几十个节点，手机也扛得住）。

   两套页面共用同一份实现：
     · SPA 外壳（index.html / select.html / about.html）直接 <script src="audio.js">；
     · 关卡页（levels/*.html）在 prefs.js 之后、引擎包之前引入；引擎侧通过
       src/core/audio.js 的 sfx() 调 window.ChezzleAudio.play()。

   对外 API（window.ChezzleAudio）：
     play(name, opts)          播放一个音色；返回 true=排进音频图。
                               opts.gain 整体音量倍率（默认 1）、opts.pan 声像(-1..1)
     unlock()                  用户手势里解锁/恢复 AudioContext（监听器已自动调用）
     setVolume(v) / getVolume() 运行时音量（0..1；持久化由 ChezzlePrefs 负责）
     setMuted(b) / getMuted() / toggleMute()
     names()                   全部音色名
     stats()                   运行统计（{played, byName, unlocked, state}）
     renderOffline(name, sec)  OfflineAudioContext 离线渲染（自动化验证用）

   偏好：读 window.ChezzlePrefs 的 sfxVolume(0..1，默认 0.7) / sfxMuted(bool)，
   并监听 'chezzle:prefs' 实时生效（设置面板改音量立即听到变化）。

   UI 点击自动接线：document 捕获阶段监听 click，命中
   button / a[href] / [role=button] / input[type=range] / summary / .card / .chip /
   .enter / .back / .czset-x 时播放 ui.click（滑杆 → ui.tick）。
   元素可用 data-sfx="音色名" 覆盖（data-sfx="off" 跳过整个子树）。

   ★ 重要约定：音频上下文只允许在**用户手势**里创建/恢复（浏览器自动播放策略）。
     未解锁前 play() 直接返回 false，绝不排队——否则解锁瞬间会把积压的音效
     一次性"泄洪"出来。
   ========================================================================== */
(function (global) {
  'use strict';
  if (!global || global.ChezzleAudio) return;

  var DEFAULTS = { volume: 0.7, muted: false };
  var REVERB_SEC = 1.45;   // 混响尾长（秒）
  var NOISE_SEC = 1.2;     // 噪声源长度（秒）

  // 音名频率（A4=440 十二平均律）——所有音色都在这套音高体系里写，保证听感统一
  var NOTE = {
    G2: 98.00, A2: 110.00, C3: 130.81, D3: 146.83, E3: 164.81, G3: 196.00, A3: 220.00,
    C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00, B4: 493.88,
    C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880.00, B5: 987.77,
    C6: 1046.50, D6: 1174.66, E6: 1318.51, G6: 1567.98, A6: 1760.00, C7: 2093.00,
    D7: 2349.32,
  };

  // ---------------------------------------------------------------------------
  // 偏好
  // ---------------------------------------------------------------------------
  function clamp(v, a, b) {
    v = Number(v);
    if (!isFinite(v)) return a;
    return v < a ? a : (v > b ? b : v);
  }

  function readPrefs() {
    var p = null;
    try {
      p = (global.ChezzlePrefs && typeof global.ChezzlePrefs.get === 'function')
        ? global.ChezzlePrefs.get() : null;
    } catch (e) { p = null; }
    var vol = DEFAULTS.volume;
    var muted = DEFAULTS.muted;
    if (p && typeof p === 'object') {
      // 旧存档没有音效字段：按默认值（不是"随机兜底"——是设置项默认值）
      if (p.sfxVolume !== undefined && p.sfxVolume !== null && isFinite(Number(p.sfxVolume))) {
        vol = clamp(p.sfxVolume, 0, 1);
      }
      if (p.sfxMuted !== undefined) muted = !!p.sfxMuted;
    }
    return { volume: vol, muted: muted };
  }

  var prefsNow = readPrefs();
  var volume = prefsNow.volume;
  var muted = prefsNow.muted;

  // ---------------------------------------------------------------------------
  // 运行时状态
  // ---------------------------------------------------------------------------
  var ctx = null;        // AudioContext
  var chain = null;      // { comp, master, bus, conv, revGain, noise }
  var unlocked = false;  // 是否已在用户手势里创建/恢复过上下文
  var last = {};         // 音色名 → 上次播放 wall ms（同名限频）
  var recent = [];       // 最近启动的 sound 时间戳（全局爆发保护）
  var stats = { played: 0, byName: {} };

  function nowMs() {
    try {
      if (global.performance && typeof global.performance.now === 'function') return global.performance.now();
    } catch (e) { /* 忽略 */ }
    return Date.now();
  }

  function targetGain() {
    if (muted) return 0;
    return Math.pow(clamp(volume, 0, 1), 1.6);
  }

  function applyGain() {
    if (!chain) return;
    try {
      var g = targetGain();
      var t = ctx.currentTime;
      chain.master.gain.setTargetAtTime(g, t, 0.045);
    } catch (e) { /* 忽略 */ }
  }

  // ---------------------------------------------------------------------------
  // 音频图：bus → compressor → master → destination
  //          混响 send → convolver → revGain → compressor
  // ---------------------------------------------------------------------------
  function makeNoise(c) {
    var sr = c.sampleRate || 44100;
    var len = Math.floor(sr * NOISE_SEC);
    var buf = c.createBuffer(1, len, sr);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  /** 生成一段"乐器化"的混响脉冲：噪声指数衰减 + 轻微低通（水晶/大厅感），
   *  比纯白噪声尾巴更柔、不会糊住高频瞬态。 */
  function makeIR(c) {
    var sr = c.sampleRate || 44100;
    var len = Math.max(1, Math.floor(sr * REVERB_SEC));
    var buf = c.createBuffer(2, len, sr);
    var pre = Math.floor(sr * 0.012); // 预延迟
    for (var ch = 0; ch < 2; ch++) {
      var d = buf.getChannelData(ch);
      var lp = 0;
      for (var i = 0; i < len; i++) {
        var n = Math.random() * 2 - 1;
        lp += (n - lp) * (ch === 0 ? 0.38 : 0.32); // 左右轻微不同 → 立体感
        var t = i / len;
        var decay = Math.pow(1 - t, 2.6);
        d[i] = (i < pre ? 0 : lp * decay * 0.9);
      }
      // 两个离散早期反射，让短音也有"空间大小"
      var taps = [0.019, 0.033];
      for (var k = 0; k < taps.length; k++) {
        var at = Math.floor(sr * taps[k]) + (ch === 0 ? 0 : Math.floor(sr * 0.004));
        if (at < len) d[at] += (k ? -0.32 : 0.45) * (ch === 0 ? 1 : 0.85);
      }
    }
    // ★ 能量归一化（关键）：未归一化的噪声 IR 会让 ConvolverNode 把混响放大几十倍，
    //   随机峰甚至能盖过直达声（实测爆炸峰值随 IR 随机乱跳 0.15~0.85）。
    //   归一化后 ||IR|| ≈ 1：混响尾巴与送出量成正比，可预测、不会削波。
    var energy = 0;
    for (var ch2 = 0; ch2 < 2; ch2++) {
      var d2 = buf.getChannelData(ch2);
      for (var i2 = 0; i2 < len; i2++) energy += d2[i2] * d2[i2];
    }
    if (energy > 0) {
      var norm = 1 / Math.sqrt(energy);
      for (var ch3 = 0; ch3 < 2; ch3++) {
        var d3 = buf.getChannelData(ch3);
        for (var i3 = 0; i3 < len; i3++) d3[i3] *= norm;
      }
    }
    return buf;
  }

  /** 软削波（安全限幅）：|x| ≤ 0.65 完全线性，之上平滑压向 ±1。
   *  ★ 不用 DynamicsCompressorNode：实测它与 ConvolverNode 串在一起时，在
   *  瞬态（爆炸的延时爆裂声）处会产生与输入电平无关的近满幅尖峰（0.01 增益
   *  也能打出 0.95），是浏览器压缩器的已知不稳定行为。软削波是确定性的，
   *  正常音量下听感完全不受影响，只在极响叠音时兜底防削波。 */
  function makeSoftClip(c) {
    var shaper = c.createWaveShaper();
    var n = 2049;
    var curve = new Float32Array(n);
    var knee = 0.65;
    for (var i = 0; i < n; i++) {
      var x = (i / (n - 1)) * 2 - 1;
      var a = Math.abs(x);
      var y = a <= knee ? x : (x < 0 ? -1 : 1) * (knee + (1 - knee) * Math.tanh((a - knee) / (1 - knee)));
      curve[i] = y;
    }
    shaper.curve = curve;
    try { shaper.oversample = '2x'; } catch (e) { /* 老内核 */ }
    return shaper;
  }

  function makeChain(c) {
    var limiter = makeSoftClip(c);
    var bus = c.createGain();
    bus.gain.value = 1;
    var master = c.createGain();
    master.gain.value = targetGain();
    bus.connect(limiter);
    limiter.connect(master);
    master.connect(c.destination);
    var conv = c.createConvolver();
    try { conv.buffer = makeIR(c); } catch (e) { conv = null; }
    var revGain = null;
    if (conv) {
      revGain = c.createGain();
      revGain.gain.value = 0.55;
      conv.connect(revGain);
      revGain.connect(limiter);
    }
    return { limiter: limiter, bus: bus, master: master, conv: conv, revGain: revGain, noise: makeNoise(c) };
  }

  function ensureCtx() {
    if (ctx) {
      if (ctx.state === 'suspended') {
        try {
          var p = ctx.resume();
          if (p && p.catch) p.catch(function () {});
        } catch (e) { /* 忽略 */ }
      }
      return ctx;
    }
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC({ latencyHint: 'interactive' });
    } catch (e) {
      try { ctx = new AC(); } catch (e2) { ctx = null; return null; }
    }
    try {
      chain = makeChain(ctx);
    } catch (e) {
      ctx = null;
      chain = null;
      return null;
    }
    return ctx;
  }

  /** 用户手势里解锁（创建上下文 / 从 suspended 恢复） */
  function unlock() {
    var c = ensureCtx();
    if (!c) return false;
    if (c.state === 'suspended') {
      try {
        var p = c.resume();
        if (p && p.catch) p.catch(function () {});
      } catch (e) { /* 忽略 */ }
    }
    unlocked = true;
    return true;
  }

  // ---------------------------------------------------------------------------
  // 合成器原语（全部接在 makeRig 的 bus 上；at 为绝对 AudioContext 时间）
  // ---------------------------------------------------------------------------
  function place(c, node, out, pan) {
    try {
      if (pan && typeof c.createStereoPanner === 'function') {
        var p = c.createStereoPanner();
        p.pan.value = clamp(pan, -1, 1);
        node.connect(p);
        p.connect(out);
        return;
      }
    } catch (e) { /* 无声像节点 */ }
    node.connect(out);
  }

  function envGain(c, t0, attack, peak, dur, hold) {
    var g = c.createGain();
    // ★ 先把初始值置 0：AudioParam 默认值是 1，而浏览器在"源从非零时刻开始 +
    //   包络首个 setValueAtTime 也在同一时刻"时可能在首块渲染里读到默认值 1 →
    //   一小段未衰减的原始噪声漏出来（实测在 t=0.17s 启动时出现与音量无关的
    //   -1dB 尖峰）。初始值 0 语义上也正确：包络开始前就是静音。
    g.gain.value = 0;
    var a = Math.max(0.001, attack);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
    if (hold > 0) g.gain.setValueAtTime(Math.max(0.0002, peak), t0 + a + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + hold + Math.max(0.02, dur));
    return g;
  }

  function makeRig(c, ch, opts, boost) {
    var R = {};
    R.ctx = c;
    R.t = c.currentTime;
    var mul = (opts && isFinite(Number(opts.gain)) && Number(opts.gain) > 0) ? clamp(opts.gain, 0, 3) : 1;
    R.v = mul * (boost > 0 ? boost : 1);
    R.pan = (opts && isFinite(Number(opts.pan))) ? clamp(opts.pan, -1, 1) : 0;

    /** 每个音色一条总输出（先建一次，内部各原语都接它） */
    R.bus = function (gain) {
      var g = c.createGain();
      g.gain.value = gain == null ? 1 : gain;
      g.connect(ch.bus);
      return g;
    };

    R.send = function (node, amt) {
      if (!ch.conv || !amt) return;
      try {
        var s = c.createGain();
        s.gain.value = clamp(amt, 0, 1) * 0.6;
        node.connect(s);
        s.connect(ch.conv);
      } catch (e) { /* 忽略 */ }
    };

    /**
     * 振荡器音：o = { f0, f1, dur, type, gain, attack, hold, pan, detune, rev,
     *                  filter:{type,f0,f1,Q}, at }
     */
    R.tone = function (out, o) {
      o = o || {};
      var t0 = o.at != null ? o.at : c.currentTime;
      var dur = Math.max(0.01, o.dur != null ? o.dur : 0.15);
      var attack = o.attack != null ? o.attack : 0.004;
      var hold = o.hold != null ? Math.max(0, o.hold) : 0;
      var peak = Math.max(0.0002, (o.gain != null ? o.gain : 0.08) * R.v);
      var osc = c.createOscillator();
      osc.type = o.type || 'sine';
      var f0 = Math.max(1, o.f0 || 440);
      osc.frequency.setValueAtTime(f0, t0);
      if (o.f1 != null && o.f1 > 0 && Math.abs(o.f1 - f0) > 0.01) {
        if (o.curve === 'lin') osc.frequency.linearRampToValueAtTime(o.f1, t0 + dur);
        else osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t0 + dur);
      }
      if (o.detune) osc.detune.value = o.detune;
      var node = osc;
      if (o.filter) {
        try {
          var f = c.createBiquadFilter();
          f.type = o.filter.type || 'lowpass';
          f.frequency.setValueAtTime(Math.max(20, o.filter.f0 != null ? o.filter.f0 : 1200), t0);
          if (o.filter.f1 != null && o.filter.f1 > 0) {
            f.frequency.exponentialRampToValueAtTime(Math.max(20, o.filter.f1), t0 + dur);
          }
          if (o.filter.Q != null) f.Q.value = o.filter.Q;
          node.connect(f);
          node = f;
        } catch (e) { /* 忽略 */ }
      }
      var g = envGain(c, t0, attack, peak, dur, hold);
      node.connect(g);
      place(c, g, out, (o.pan || 0) + R.pan);
      R.send(g, o.rev || 0);
      var stopAt = t0 + Math.max(0.001, attack) + hold + dur + 0.05;
      osc.start(t0);
      osc.stop(stopAt);
    };

    /**
     * 噪声音：o = { dur, gain, type, f0, f1, Q, attack, pan, rev, rate, at }
     * type 缺省 bandpass（液体/气流），'highpass' 类打击瞬态，'lowpass' 类轰隆。
     */
    R.noise = function (out, o) {
      o = o || {};
      var t0 = o.at != null ? o.at : c.currentTime;
      var dur = Math.max(0.01, o.dur != null ? o.dur : 0.2);
      var attack = o.attack != null ? o.attack : 0.005;
      var peak = Math.max(0.0002, (o.gain != null ? o.gain : 0.04) * R.v);
      var src = c.createBufferSource();
      src.buffer = ch.noise;
      src.loop = true;
      if (o.rate) src.playbackRate.value = clamp(o.rate, 0.25, 4);
      var node = src;
      var ftype = o.type || 'bandpass';
      if (ftype !== 'none') {
        try {
          var f = c.createBiquadFilter();
          f.type = ftype;
          f.frequency.setValueAtTime(Math.max(20, o.f0 != null ? o.f0 : 1000), t0);
          if (o.f1 != null && o.f1 > 0 && o.f1 !== o.f0) {
            f.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t0 + dur);
          }
          if (o.Q != null) f.Q.value = o.Q;
          node.connect(f);
          node = f;
        } catch (e) { /* 忽略 */ }
      }
      var g = envGain(c, t0, attack, peak, dur, 0);
      node.connect(g);
      place(c, g, out, (o.pan || 0) + R.pan);
      R.send(g, o.rev || 0);
      src.start(t0, Math.random() * 0.8);
      src.stop(t0 + Math.max(0.001, attack) + dur + 0.06);
    };

    /** 水晶钟：基频 + 两个非整数泛音，短促衰减 → 玻璃/水晶感 */
    R.bell = function (out, o) {
      o = o || {};
      var freq = o.freq || 880;
      var at = o.at != null ? o.at : c.currentTime;
      var dur = o.dur != null ? o.dur : 0.35;
      var gain = o.gain != null ? o.gain : 0.05;
      var pan = o.pan || 0;
      var rev = o.rev != null ? o.rev : 0.22;
      R.tone(out, { f0: freq, dur: dur, type: 'sine', gain: gain, attack: 0.002, pan: pan, rev: rev, at: at });
      R.tone(out, { f0: freq * 2.01, dur: dur * 0.62, type: 'sine', gain: gain * 0.26, attack: 0.001, pan: pan, rev: rev * 0.7, at: at });
      R.tone(out, { f0: freq * 3.02, dur: dur * 0.38, type: 'sine', gain: gain * 0.1, attack: 0.001, pan: pan, rev: rev * 0.5, at: at });
    };

    /** 极短打击瞬态（机械/玻璃"嗒"）：高通噪声 8~25ms */
    R.tick = function (out, o) {
      o = o || {};
      R.noise(out, {
        dur: o.dur != null ? o.dur : 0.018,
        gain: o.gain != null ? o.gain : 0.022,
        type: 'highpass',
        f0: o.f0 != null ? o.f0 : 3200,
        Q: 0.9,
        attack: 0.001,
        pan: o.pan || 0,
        rev: o.rev || 0,
        at: o.at,
      });
    };

    return R;
  }

  // ---------------------------------------------------------------------------
  // 音色预设（gap = 同名音最短间隔，秒；防止高频事件叠成爆音）
  // ---------------------------------------------------------------------------
  var PRESETS = {};

  function preset(name, gap, build) {
    PRESETS[name] = { gap: gap, build: build };
  }

  // ===== UI：轻、短、玻璃感，不抢游戏音效 =====
  preset('ui.click', 0.035, function (c, R) {
    var o = R.bus(0.9);
    R.tone(o, { f0: NOTE.E6, f1: 1174.7, dur: 0.05, type: 'triangle', gain: 0.07, attack: 0.002, rev: 0.12 });
    R.tone(o, { f0: NOTE.E6 * 2, f1: NOTE.D7, dur: 0.03, type: 'sine', gain: 0.02, attack: 0.001 });
    R.tick(o, { gain: 0.02, f0: 4200 });
  });

  preset('ui.tick', 0.05, function (c, R) {
    var o = R.bus(0.8);
    R.tone(o, { f0: NOTE.A6, f1: 1661.2, dur: 0.02, type: 'sine', gain: 0.024, attack: 0.001 });
    R.tick(o, { gain: 0.008, f0: 5200 });
  });

  preset('ui.open', 0.12, function (c, R) {
    var o = R.bus();
    R.noise(o, { dur: 0.22, gain: 0.016, type: 'bandpass', f0: 520, f1: 2400, Q: 0.8, attack: 0.02, rev: 0.22 });
    R.bell(o, { freq: NOTE.A5, dur: 0.22, gain: 0.03, rev: 0.3 });
    R.bell(o, { freq: NOTE.E6, dur: 0.24, gain: 0.024, at: R.t + 0.07, rev: 0.34 });
  });

  preset('ui.close', 0.12, function (c, R) {
    var o = R.bus();
    R.noise(o, { dur: 0.18, gain: 0.014, type: 'bandpass', f0: 2200, f1: 420, Q: 0.9, attack: 0.01 });
    R.bell(o, { freq: NOTE.D6, dur: 0.18, gain: 0.026, rev: 0.24 });
    R.bell(o, { freq: NOTE.G5, dur: 0.22, gain: 0.024, at: R.t + 0.06, rev: 0.26 });
  });

  preset('ui.back', 0.12, function (c, R) {
    var o = R.bus();
    R.bell(o, { freq: NOTE.E5, dur: 0.2, gain: 0.032, rev: 0.28 });
    R.bell(o, { freq: NOTE.B4, dur: 0.24, gain: 0.028, at: R.t + 0.06, rev: 0.3 });
    R.tone(o, { f0: NOTE.G3, dur: 0.24, type: 'sine', gain: 0.026, rev: 0.18 });
  });

  preset('ui.toggle', 0.055, function (c, R) {
    var o = R.bus();
    R.tone(o, { f0: NOTE.G5, dur: 0.05, type: 'triangle', gain: 0.04, attack: 0.002 });
    R.tone(o, { f0: NOTE.E6, dur: 0.045, type: 'sine', gain: 0.018, at: R.t + 0.028 });
    R.tick(o, { gain: 0.012, f0: 3600 });
  });

  preset('ui.deny', 0.18, function (c, R) {
    var o = R.bus();
    R.tone(o, { f0: NOTE.G3, f1: 164.8, dur: 0.16, type: 'triangle', gain: 0.055, attack: 0.004 });
    R.tone(o, { f0: 185, dur: 0.14, type: 'sine', gain: 0.022, attack: 0.004 });
    R.noise(o, { dur: 0.1, gain: 0.012, type: 'lowpass', f0: 500, Q: 1 });
  });

  // ===== 页面/过场 =====
  preset('page.enter', 0.3, function (c, R) {
    var o = R.bus();
    R.noise(o, { dur: 0.38, gain: 0.014, type: 'bandpass', f0: 300, f1: 1600, Q: 0.7, attack: 0.04, rev: 0.4 });
    R.bell(o, { freq: NOTE.C5, dur: 0.5, gain: 0.026, rev: 0.42 });
    R.bell(o, { freq: NOTE.E5, dur: 0.46, gain: 0.022, at: R.t + 0.08, rev: 0.4 });
    R.bell(o, { freq: NOTE.G5, dur: 0.4, gain: 0.018, at: R.t + 0.16, rev: 0.38 });
    R.tone(o, { f0: NOTE.C3, dur: 0.4, type: 'sine', gain: 0.018, rev: 0.2 });
  });

  preset('page.leave', 0.3, function (c, R) {
    var o = R.bus();
    R.noise(o, { dur: 0.34, gain: 0.013, type: 'bandpass', f0: 1600, f1: 300, Q: 0.7, attack: 0.02, rev: 0.3 });
    R.bell(o, { freq: NOTE.G5, dur: 0.36, gain: 0.02, rev: 0.3 });
    R.bell(o, { freq: NOTE.C5, dur: 0.42, gain: 0.022, at: R.t + 0.07, rev: 0.32 });
    R.tone(o, { f0: NOTE.C3, dur: 0.3, type: 'sine', gain: 0.014 });
  });

  preset('level.enter', 0.45, function (c, R) {
    var o = R.bus();
    // 深色大厅里"门打开"：低频气流 → 三音上行水晶 → 暖底
    R.noise(o, { dur: 0.5, gain: 0.02, type: 'lowpass', f0: 150, f1: 1800, Q: 0.8, attack: 0.04, rev: 0.3 });
    R.tone(o, { f0: NOTE.G2, f1: NOTE.G3, dur: 0.55, type: 'sine', gain: 0.034, attack: 0.02, rev: 0.2 });
    R.bell(o, { freq: NOTE.C5, dur: 0.5, gain: 0.032, at: R.t + 0.12, rev: 0.42 });
    R.bell(o, { freq: NOTE.G5, dur: 0.5, gain: 0.027, at: R.t + 0.2, rev: 0.44 });
    R.bell(o, { freq: NOTE.C6, dur: 0.55, gain: 0.024, at: R.t + 0.28, rev: 0.46 });
  });

  preset('level.leave', 0.45, function (c, R) {
    var o = R.bus();
    R.noise(o, { dur: 0.42, gain: 0.018, type: 'bandpass', f0: 1800, f1: 260, Q: 0.8, attack: 0.02, rev: 0.3 });
    R.bell(o, { freq: NOTE.C6, dur: 0.4, gain: 0.02, rev: 0.36 });
    R.bell(o, { freq: NOTE.G5, dur: 0.44, gain: 0.022, at: R.t + 0.07, rev: 0.38 });
    R.tone(o, { f0: NOTE.C3, f1: NOTE.A2, dur: 0.5, type: 'sine', gain: 0.022, rev: 0.2 });
  });

  // ===== 玩家 =====
  preset('player.jump', 0.09, function (c, R) {
    var o = R.bus();
    R.tone(o, { f0: 300, f1: 640, dur: 0.12, type: 'triangle', gain: 0.05, attack: 0.004 });
    R.noise(o, { dur: 0.06, gain: 0.014, type: 'bandpass', f0: 800, f1: 400, Q: 1.2, attack: 0.002 });
    R.tone(o, { f0: NOTE.G5, dur: 0.05, type: 'sine', gain: 0.012, at: R.t + 0.02 });
  });

  preset('player.land', 0.09, function (c, R) {
    var o = R.bus();
    R.tone(o, { f0: 150, f1: 64, dur: 0.12, type: 'sine', gain: 0.075, attack: 0.003 });
    R.noise(o, { dur: 0.07, gain: 0.026, type: 'lowpass', f0: 500, f1: 200, Q: 0.8, attack: 0.002 });
    R.tick(o, { gain: 0.006, f0: 1800 });
  });

  preset('player.hurt', 0.25, function (c, R) {
    var o = R.bus();
    R.noise(o, { dur: 0.14, gain: 0.03, type: 'bandpass', f0: 900, Q: 1.4, attack: 0.003 });
    R.tone(o, { f0: NOTE.A3, f1: NOTE.A2, dur: 0.2, type: 'triangle', gain: 0.04, attack: 0.003, rev: 0.1 });
    R.tone(o, { f0: 92, dur: 0.24, type: 'sine', gain: 0.04, attack: 0.003 });
  });

  // ===== 物品/液体/气体 =====
  preset('item.pickup', 0.12, function (c, R) {
    var o = R.bus();
    R.bell(o, { freq: NOTE.B5, dur: 0.22, gain: 0.036, rev: 0.24 });
    R.bell(o, { freq: NOTE.A6, dur: 0.16, gain: 0.016, at: R.t + 0.035, rev: 0.2 });
    R.noise(o, { dur: 0.03, gain: 0.01, type: 'highpass', f0: 3000, attack: 0.002 });
  });

  preset('item.place', 0.1, function (c, R) {
    var o = R.bus();
    R.tone(o, { f0: 240, f1: 170, dur: 0.1, type: 'triangle', gain: 0.042, attack: 0.003 });
    R.noise(o, { dur: 0.06, gain: 0.022, type: 'lowpass', f0: 700, f1: 300, Q: 1 });
    R.bell(o, { freq: NOTE.G4, dur: 0.12, gain: 0.016, rev: 0.1 });
  });

  preset('item.suck', 0.16, function (c, R) {
    var o = R.bus();
    R.noise(o, { dur: 0.22, gain: 0.028, type: 'bandpass', f0: 350, f1: 1100, Q: 2.2, attack: 0.02 });
    R.tone(o, { f0: NOTE.A3, f1: NOTE.E4, dur: 0.2, type: 'sine', gain: 0.016, attack: 0.02 });
    R.tone(o, { f0: 500, dur: 0.04, type: 'sine', gain: 0.01, at: R.t + 0.1 });
    R.tone(o, { f0: 620, dur: 0.035, type: 'sine', gain: 0.008, at: R.t + 0.16 });
  });

  preset('item.pour', 0.28, function (c, R) {
    var o = R.bus();
    R.noise(o, { dur: 0.36, gain: 0.03, type: 'bandpass', f0: 900, f1: 700, Q: 3, attack: 0.03 });
    R.noise(o, { dur: 0.28, gain: 0.016, type: 'bandpass', f0: 1500, Q: 2.4, attack: 0.05, at: R.t + 0.06 });
    R.tone(o, { f0: 300, f1: 360, dur: 0.3, type: 'sine', gain: 0.01, attack: 0.02 });
  });

  preset('item.drip', 0.09, function (c, R) {
    var o = R.bus();
    R.tone(o, { f0: 1400, f1: 620, dur: 0.05, type: 'sine', gain: 0.036, attack: 0.002 });
    R.tone(o, { f0: 720, f1: 300, dur: 0.09, type: 'sine', gain: 0.03, attack: 0.004, at: R.t + 0.055 });
    R.tick(o, { gain: 0.006, f0: 2800, at: R.t + 0.05 });
  });

  preset('item.gas', 0.3, function (c, R) {
    var o = R.bus();
    R.noise(o, { dur: 0.3, gain: 0.02, type: 'highpass', f0: 1800, Q: 0.6, attack: 0.03 });
    R.noise(o, { dur: 0.32, gain: 0.012, type: 'bandpass', f0: 900, f1: 1400, Q: 1.1, attack: 0.03 });
  });

  // ===== 化学 =====
  preset('chem.react', 0.16, function (c, R) {
    var o = R.bus();
    R.noise(o, { dur: 0.3, gain: 0.02, type: 'bandpass', f0: 2500, Q: 1.2, attack: 0.02, rev: 0.2 });
    var notes = [NOTE.C5, NOTE.D5, NOTE.E5, NOTE.G5];
    var f = notes[(Math.random() * notes.length) | 0];
    R.bell(o, { freq: f, dur: 0.26, gain: 0.014, rev: 0.3 });
    R.noise(o, { dur: 0.05, gain: 0.01, type: 'bandpass', f0: 1500, Q: 1.5, at: R.t + 0.08 });
  });

  preset('chem.bubble', 0.11, function (c, R) {
    var o = R.bus();
    R.tone(o, { f0: 180, f1: 380, dur: 0.09, type: 'sine', gain: 0.03, attack: 0.004 });
    R.tick(o, { gain: 0.006, f0: 2600 });
    R.tone(o, { f0: 480, f1: 640, dur: 0.04, type: 'sine', gain: 0.008, at: R.t + 0.05 });
  });

  preset('chem.spark', 0.16, function (c, R) {
    var o = R.bus();
    R.noise(o, { dur: 0.05, gain: 0.014, type: 'highpass', f0: 4500, attack: 0.001 });
    R.noise(o, { dur: 0.045, gain: 0.01, type: 'bandpass', f0: 3000, Q: 1.4, at: R.t + 0.035 });
  });

  preset('chem.explode', 0.28, function (c, R) {
    var o = R.bus();
    R.noise(o, { dur: 0.7, gain: 0.2, type: 'lowpass', f0: 2000, f1: 120, Q: 0.9, attack: 0.005, rev: 0.35 });
    R.tone(o, { f0: 90, f1: 38, dur: 0.55, type: 'sine', gain: 0.11, attack: 0.004 });
    R.noise(o, { dur: 0.28, gain: 0.04, type: 'bandpass', f0: 600, Q: 0.8, attack: 0.002, rev: 0.2 });
    // 爆裂碎屑
    R.noise(o, { dur: 0.05, gain: 0.02, type: 'highpass', f0: 2600, at: R.t + 0.04 });
    R.noise(o, { dur: 0.05, gain: 0.016, type: 'highpass', f0: 3200, at: R.t + 0.1 });
    R.noise(o, { dur: 0.05, gain: 0.012, type: 'highpass', f0: 3800, at: R.t + 0.17 });
  });

  preset('chem.ignite', 0.2, function (c, R) {
    var o = R.bus();
    R.noise(o, { dur: 0.35, gain: 0.03, type: 'lowpass', f0: 200, f1: 1400, Q: 0.9, attack: 0.02, rev: 0.2 });
    R.tone(o, { f0: NOTE.G3, dur: 0.3, type: 'triangle', gain: 0.016, attack: 0.02 });
    R.noise(o, { dur: 0.25, gain: 0.012, type: 'bandpass', f0: 1200, Q: 1.5, attack: 0.04 });
  });

  preset('chem.extinguish', 0.2, function (c, R) {
    var o = R.bus();
    R.noise(o, { dur: 0.28, gain: 0.026, type: 'lowpass', f0: 900, f1: 180, Q: 0.8, attack: 0.01 });
    R.tone(o, { f0: NOTE.A3, f1: NOTE.A2, dur: 0.2, type: 'sine', gain: 0.018, attack: 0.01 });
  });

  // ===== 机关 =====
  preset('switch.open', 0.08, function (c, R) {
    var o = R.bus();
    R.tick(o, { gain: 0.016, f0: 1800 });
    R.tone(o, { f0: NOTE.C5, dur: 0.08, type: 'triangle', gain: 0.032, attack: 0.002 });
    R.bell(o, { freq: NOTE.G5, dur: 0.14, gain: 0.02, at: R.t + 0.03, rev: 0.18 });
  });

  preset('switch.close', 0.08, function (c, R) {
    var o = R.bus();
    R.tick(o, { gain: 0.012, f0: 1200 });
    R.tone(o, { f0: NOTE.G4, dur: 0.08, type: 'triangle', gain: 0.028, attack: 0.002 });
    R.bell(o, { freq: NOTE.C5, dur: 0.12, gain: 0.016, at: R.t + 0.03, rev: 0.14 });
  });

  preset('key.open', 0.15, function (c, R) {
    var o = R.bus();
    R.bell(o, { freq: NOTE.G6, dur: 0.35, gain: 0.026, rev: 0.3 });
    R.bell(o, { freq: NOTE.C7, dur: 0.3, gain: 0.018, at: R.t + 0.05, rev: 0.32 });
    R.tick(o, { gain: 0.008, f0: 5000 });
  });

  preset('door.open', 0.35, function (c, R) {
    var o = R.bus();
    R.noise(o, { dur: 0.5, gain: 0.02, type: 'bandpass', f0: 200, f1: 700, Q: 1.2, attack: 0.05, rev: 0.25 });
    R.tone(o, { f0: NOTE.D3, f1: NOTE.G3, dur: 0.5, type: 'triangle', gain: 0.022, attack: 0.03, rev: 0.2 });
    R.bell(o, { freq: NOTE.G4, dur: 0.4, gain: 0.018, at: R.t + 0.12, rev: 0.3 });
  });

  preset('door.close', 0.35, function (c, R) {
    var o = R.bus();
    R.noise(o, { dur: 0.45, gain: 0.018, type: 'bandpass', f0: 700, f1: 200, Q: 1.1, attack: 0.02 });
    R.tone(o, { f0: NOTE.C3, dur: 0.3, type: 'triangle', gain: 0.024, attack: 0.01 });
    R.noise(o, { dur: 0.12, gain: 0.026, type: 'lowpass', f0: 200, Q: 0.9, at: R.t + 0.26 });
  });

  preset('portal', 0.4, function (c, R) {
    var o = R.bus();
    R.noise(o, { dur: 0.5, gain: 0.016, type: 'bandpass', f0: 500, f1: 3500, Q: 0.7, attack: 0.05, rev: 0.4 });
    R.bell(o, { freq: NOTE.E5, dur: 0.5, gain: 0.024, rev: 0.42 });
    R.bell(o, { freq: NOTE.B5, dur: 0.45, gain: 0.018, at: R.t + 0.08, rev: 0.44 });
    R.bell(o, { freq: NOTE.E6, dur: 0.4, gain: 0.014, at: R.t + 0.16, rev: 0.46 });
    R.tone(o, { f0: NOTE.A2, f1: NOTE.A3, dur: 0.6, type: 'sine', gain: 0.018, attack: 0.05, rev: 0.25 });
  });

  preset('rope.break', 0.12, function (c, R) {
    var o = R.bus();
    R.noise(o, { dur: 0.05, gain: 0.03, type: 'highpass', f0: 2500, attack: 0.001 });
    R.tone(o, { f0: 180, f1: 90, dur: 0.15, type: 'triangle', gain: 0.038, attack: 0.002 });
    R.tone(o, { f0: 300, f1: 220, dur: 0.12, type: 'triangle', gain: 0.016, at: R.t + 0.02 });
  });

  preset('extractor.pump', 0.25, function (c, R) {
    var o = R.bus();
    R.tone(o, { f0: 80, f1: 140, dur: 0.18, type: 'sine', gain: 0.026, attack: 0.01 });
    R.noise(o, { dur: 0.15, gain: 0.014, type: 'lowpass', f0: 400, Q: 1 });
  });

  // ===== 状态 =====
  preset('win', 1.0, function (c, R) {
    var o = R.bus();
    R.bell(o, { freq: NOTE.C5, dur: 0.5, gain: 0.034, rev: 0.45 });
    R.bell(o, { freq: NOTE.E5, dur: 0.5, gain: 0.03, at: R.t + 0.09, rev: 0.46 });
    R.bell(o, { freq: NOTE.G5, dur: 0.55, gain: 0.027, at: R.t + 0.18, rev: 0.48 });
    R.bell(o, { freq: NOTE.C6, dur: 0.75, gain: 0.026, at: R.t + 0.27, rev: 0.5 });
    R.bell(o, { freq: NOTE.E6, dur: 0.6, gain: 0.018, at: R.t + 0.42, rev: 0.5 });
    // 暖底：C3 + G3 长音
    R.tone(o, { f0: NOTE.C3, dur: 0.9, type: 'sine', gain: 0.024, attack: 0.04, rev: 0.25 });
    R.tone(o, { f0: NOTE.G3, dur: 0.8, type: 'sine', gain: 0.014, attack: 0.06, rev: 0.25 });
    R.noise(o, { dur: 0.5, gain: 0.008, type: 'highpass', f0: 4000, attack: 0.08, rev: 0.5 });
  });

  preset('died', 0.8, function (c, R) {
    var o = R.bus();
    R.tone(o, { f0: 110, f1: 55, dur: 0.7, type: 'sine', gain: 0.05, attack: 0.01 });
    R.bell(o, { freq: NOTE.A4, dur: 0.35, gain: 0.032, rev: 0.3 });
    R.bell(o, { freq: NOTE.F4, dur: 0.38, gain: 0.03, at: R.t + 0.12, rev: 0.32 });
    R.bell(o, { freq: NOTE.D4, dur: 0.42, gain: 0.028, at: R.t + 0.24, rev: 0.34 });
    R.bell(o, { freq: NOTE.A3, dur: 0.8, gain: 0.026, at: R.t + 0.4, rev: 0.4 });
    R.noise(o, { dur: 0.5, gain: 0.016, type: 'lowpass', f0: 300, Q: 0.8, attack: 0.02, rev: 0.3 });
  });

  preset('restart', 0.2, function (c, R) {
    var o = R.bus();
    R.tone(o, { f0: 660, f1: 220, dur: 0.22, type: 'triangle', gain: 0.036, attack: 0.003 });
    R.noise(o, { dur: 0.18, gain: 0.016, type: 'bandpass', f0: 1200, f1: 300, Q: 1.2, attack: 0.005 });
    R.tick(o, { gain: 0.01, f0: 2200 });
  });

  preset('overview.on', 0.2, function (c, R) {
    var o = R.bus();
    R.noise(o, { dur: 0.35, gain: 0.016, type: 'bandpass', f0: 400, f1: 2600, Q: 0.7, attack: 0.04, rev: 0.3 });
    R.bell(o, { freq: NOTE.G5, dur: 0.4, gain: 0.024, rev: 0.36 });
    R.bell(o, { freq: NOTE.C6, dur: 0.35, gain: 0.018, at: R.t + 0.1, rev: 0.38 });
    R.tone(o, { f0: NOTE.A2, dur: 0.4, type: 'sine', gain: 0.016, attack: 0.05 });
  });

  preset('overview.off', 0.2, function (c, R) {
    var o = R.bus();
    R.noise(o, { dur: 0.32, gain: 0.015, type: 'bandpass', f0: 2600, f1: 400, Q: 0.7, attack: 0.02, rev: 0.25 });
    R.bell(o, { freq: NOTE.C6, dur: 0.32, gain: 0.018, rev: 0.3 });
    R.bell(o, { freq: NOTE.G5, dur: 0.36, gain: 0.02, at: R.t + 0.08, rev: 0.32 });
  });

  preset('tip', 0.1, function (c, R) {
    var o = R.bus();
    R.noise(o, { dur: 0.04, gain: 0.02, type: 'highpass', f0: 2600, attack: 0.002 });
    R.tone(o, { f0: NOTE.A6, dur: 0.05, type: 'sine', gain: 0.02, attack: 0.002 });
  });

  preset('banner', 0.6, function (c, R) {
    var o = R.bus();
    R.tone(o, { f0: NOTE.D3, dur: 1.8, type: 'sine', gain: 0.04, attack: 0.01, rev: 0.5 });
    R.tone(o, { f0: NOTE.A3, dur: 1.6, type: 'sine', gain: 0.02, attack: 0.01, rev: 0.45 });
    R.tone(o, { f0: NOTE.D4, dur: 1.4, type: 'sine', gain: 0.012, attack: 0.01, rev: 0.4 });
    R.noise(o, { dur: 1.2, gain: 0.01, type: 'lowpass', f0: 500, attack: 0.02, rev: 0.4 });
  });

  // ===== 存档点 =====
  preset('checkpoint.save', 0.35, function (c, R) {
    var o = R.bus();
    // 记下这一刻：温暖的两音上行（G5 → C6）+ 很轻的纸页/水晶泛音
    R.bell(o, { freq: NOTE.G5, dur: 0.3, gain: 0.028, rev: 0.35 });
    R.bell(o, { freq: NOTE.C6, dur: 0.45, gain: 0.026, at: R.t + 0.1, rev: 0.42 });
    R.tone(o, { f0: NOTE.C4, dur: 0.4, type: 'sine', gain: 0.016, attack: 0.02, rev: 0.2 });
    R.noise(o, { dur: 0.18, gain: 0.008, type: 'highpass', f0: 3200, attack: 0.02, rev: 0.25 });
  });

  preset('checkpoint.restore', 0.35, function (c, R) {
    var o = R.bus();
    // 回到过去：水晶三音上行 + 一道细细的气流
    R.noise(o, { dur: 0.4, gain: 0.012, type: 'bandpass', f0: 600, f1: 2600, Q: 0.8, attack: 0.03, rev: 0.35 });
    R.bell(o, { freq: NOTE.C5, dur: 0.4, gain: 0.024, rev: 0.4 });
    R.bell(o, { freq: NOTE.E5, dur: 0.42, gain: 0.021, at: R.t + 0.08, rev: 0.42 });
    R.bell(o, { freq: NOTE.G5, dur: 0.46, gain: 0.018, at: R.t + 0.16, rev: 0.45 });
    R.tone(o, { f0: NOTE.C3, f1: NOTE.G3, dur: 0.5, type: 'sine', gain: 0.014, attack: 0.04, rev: 0.2 });
  });

  // ---------------------------------------------------------------------------
  // 各音色的整体响度校准（乘在预设声部增益之上）
  // ---------------------------------------------------------------------------
  // 预设里的增益按"相对比例"写（各声部之间的平衡），这里统一校准到日常设备的
  // 可听响度（离线实测峰值，master 默认音量下再 ×0.55）：
  //   UI 点击 ~0.12（-18dBFS 级） · 物品/机关 ~0.12 · 化学 ~0.07
  //   通关 ~0.28 · 死亡 ~0.24 · 过场 ~0.22 · 爆炸 ~0.5（soft-clip 前）
  // 想整体调音量改 master 音量；想调单个音色改这张表。
  var BOOST = {
    'ui.click': 1.7, 'ui.tick': 2.1, 'ui.open': 2.7, 'ui.close': 2.8,
    'ui.back': 2.2, 'ui.toggle': 2.2, 'ui.deny': 1.9,
    'page.enter': 4.4, 'page.leave': 4.6, 'level.enter': 4.7, 'level.leave': 4.1,
    'player.jump': 2.5, 'player.land': 1.9, 'player.hurt': 2.1,
    'item.pickup': 2.7, 'item.place': 2.6, 'item.suck': 5.4, 'item.pour': 6.9,
    'item.drip': 3.1, 'item.gas': 3.1,
    'chem.react': 4.0, 'chem.bubble': 2.2, 'chem.spark': 2.8, 'chem.explode': 2.5,
    'chem.ignite': 5.6, 'chem.extinguish': 3.4,
    'switch.open': 2.5, 'switch.close': 2.8, 'key.open': 3.0, 'door.open': 3.6,
    'door.close': 3.6, 'portal': 3.3, 'rope.break': 2.5, 'extractor.pump': 2.7,
    'win': 4.7, 'died': 3.2, 'restart': 2.6, 'overview.on': 3.5, 'overview.off': 3.6,
    'tip': 2.0, 'banner': 2.5,
    'checkpoint.save': 3.0, 'checkpoint.restore': 2.8,
  };
  var BOOST_DEFAULT = 2.4;
  for (var bk in PRESETS) {
    if (Object.prototype.hasOwnProperty.call(PRESETS, bk)) {
      PRESETS[bk].boost = Object.prototype.hasOwnProperty.call(BOOST, bk) ? BOOST[bk] : BOOST_DEFAULT;
    }
  }

  // ---------------------------------------------------------------------------
  // 播放
  // ---------------------------------------------------------------------------
  var MAX_IN_WINDOW = 14;   // 120ms 内最多启动多少个音（防多音同时触发爆音/CPU 尖峰）

  function tooManyStarts(now) {
    var cut = now - 120;
    var n = 0;
    for (var i = recent.length - 1; i >= 0; i--) {
      if (recent[i] < cut) break;
      n++;
    }
    return n >= MAX_IN_WINDOW;
  }

  function pushStart(now) {
    recent.push(now);
    if (recent.length > 64) recent.splice(0, recent.length - 64);
  }

  function play(name, opts) {
    if (muted || volume <= 0.001) return false;
    var p = PRESETS[name];
    if (!p) return false;
    // 未解锁：不排队（避免解锁瞬间泄洪）。用户手势内的事件（点击等）会先解锁。
    if (!unlocked) return false;
    var c = ensureCtx();
    if (!c) return false;
    if (c.state !== 'running') {
      if (c.state === 'suspended') {
        try {
          var rp = c.resume();
          if (rp && rp.catch) rp.catch(function () {});
        } catch (e) { /* 忽略 */ }
      }
      return false;
    }
    var now = nowMs();
    var gapMs = Math.max(0, Number(p.gap) || 0) * 1000;
    if (last[name] && now - last[name] < gapMs) return false;
    if (tooManyStarts(now)) return false;
    last[name] = now;
    pushStart(now);
    try {
      var R = makeRig(c, chain, opts || {}, p.boost);
      p.build(c, R);
    } catch (e) {
      return false; // 合成异常：静默失败，不影响游戏/UI
    }
    stats.played++;
    stats.byName[name] = (stats.byName[name] || 0) + 1;
    return true;
  }

  // ---------------------------------------------------------------------------
  // 离线渲染（自动化验证：把某个音色渲染成 AudioBuffer，检查是否真有声音）
  // ---------------------------------------------------------------------------
  function renderOffline(name, seconds, opts) {
    var OAC = global.OfflineAudioContext || global.webkitOfflineAudioContext;
    var p = PRESETS[name];
    if (!OAC || !p) return Promise.resolve(null);
    var sr = (ctx && ctx.sampleRate) || 44100;
    var dur = clamp(seconds == null ? 0.9 : seconds, 0.1, 4);
    try {
      var oc = new OAC(2, Math.ceil(sr * dur), sr);
      var ch = makeChain(oc);
      ch.master.gain.value = 1; // 离线渲染不受静音/音量影响（验证用）
      var R = makeRig(oc, ch, opts || {}, p.boost);
      p.build(oc, R);
      return oc.startRendering();
    } catch (e) {
      return Promise.resolve(null);
    }
  }

  // ---------------------------------------------------------------------------
  // 偏好事件 / 存储事件 → 实时同步音量
  // ---------------------------------------------------------------------------
  function syncPrefs() {
    var p = readPrefs();
    volume = p.volume;
    muted = p.muted;
    applyGain();
  }

  try {
    global.addEventListener('chezzle:prefs', syncPrefs);
    global.addEventListener('storage', function (e) {
      if (!e || e.key == null || e.key === 'chezzle.prefs.v1') syncPrefs();
    });
  } catch (e) { /* 老内核 */ }

  // ---------------------------------------------------------------------------
  // 用户手势解锁（浏览器自动播放策略）
  // ---------------------------------------------------------------------------
  var GESTURES = ['pointerdown', 'mousedown', 'touchstart', 'keydown'];
  function onGesture() { unlock(); }
  try {
    for (var gi = 0; gi < GESTURES.length; gi++) {
      global.addEventListener(GESTURES[gi], onGesture, { capture: true, passive: true });
    }
  } catch (e) {
    try {
      global.addEventListener('mousedown', onGesture, true);
      global.addEventListener('keydown', onGesture, true);
    } catch (e2) { /* 忽略 */ }
  }

  // ---------------------------------------------------------------------------
  // UI 点击自动接线（捕获阶段：先于页面里 stopPropagation 的处理器）
  //  - 命中交互元素 → ui.click（滑杆 → ui.tick）
  //  - data-sfx="名" 覆盖；data-sfx="off"/data-sfx-off 跳过整个子树
  //  - 画布 HUD 的点击由引擎自己发声（canvas 不在匹配列表里）
  // ---------------------------------------------------------------------------
  var SEL = 'button, a[href], [role="button"], input[type="range"], summary, ' +
    '.card, .chip, .enter, .back, .czset-x';

  function sfxTargetOf(el) {
    var depth = 0;
    while (el && el.nodeType === 1 && depth++ < 16) {
      if (el.hasAttribute) {
        if (el.hasAttribute('data-sfx-off')) return null;
        if (el.hasAttribute('data-sfx')) {
          var v = el.getAttribute('data-sfx');
          if (!v || v === 'off' || v === 'none') return null;
          return { name: v };
        }
        if (el.matches && el.matches(SEL)) {
          return { name: el.tagName === 'INPUT' ? 'ui.tick' : 'ui.click' };
        }
      }
      el = el.parentNode;
    }
    return null;
  }

  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('click', function (e) {
      if (e && e.button != null && e.button !== 0) return;
      var hit = sfxTargetOf(e.target);
      if (!hit) return;
      play(hit.name);
    }, true);
  }

  // ---------------------------------------------------------------------------
  // 对外 API
  // ---------------------------------------------------------------------------
  var api = {
    version: '1.0.0',
    play: play,
    unlock: unlock,
    isUnlocked: function () { return unlocked; },
    setVolume: function (v) {
      volume = clamp(v, 0, 1);
      applyGain();
      return volume;
    },
    getVolume: function () { return volume; },
    setMuted: function (b) {
      muted = !!b;
      applyGain();
      return muted;
    },
    getMuted: function () { return muted; },
    toggleMute: function () { return api.setMuted(!muted); },
    names: function () {
      var out = [];
      for (var k in PRESETS) if (Object.prototype.hasOwnProperty.call(PRESETS, k)) out.push(k);
      return out;
    },
    stats: function () {
      var by = {};
      for (var k in stats.byName) if (Object.prototype.hasOwnProperty.call(stats.byName, k)) by[k] = stats.byName[k];
      return {
        played: stats.played,
        byName: by,
        unlocked: unlocked,
        state: ctx ? ctx.state : 'none',
        volume: volume,
        muted: muted,
      };
    },
    renderOffline: renderOffline,
  };

  global.ChezzleAudio = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
