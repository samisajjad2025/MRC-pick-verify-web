/*******************************************************************
 *  PICK VERIFY — browser bridge (iPhone Safari / any phone browser)
 *  Gives app.js the same "Native" API as the Android app:
 *   - live camera (getUserMedia) with the same white guide box
 *   - OCR in the browser (Tesseract, self-hosted in lib/, works offline after first load)
 *   - barcode / QR (ZXing; BarcodeDetector where the browser has it)
 *  Matching rules are identical (engine.js), only the text reader differs.
 *******************************************************************/
(function () {
  'use strict';
  if (window.Native) return;                         // inside the Android app: native bridge already there

  var GUIDE = 0.06, MAX_SIDE = 1400, LIB = 'lib/';
  var video = null, guideEl = null, msgEl = null, stream = null, track = null;
  var running = false, paused = false, inflight = 0, maxInflight = 1;
  var sched = null, schedP = null, zx = null, det = null, AC = null;

  function abs(p) { return new URL(p, location.href).href; }
  function emit(fn, obj) { try { if (window[fn]) window[fn](JSON.stringify(obj)); } catch (e) { } }
  function status(t) { if (msgEl) { msgEl.textContent = t || ''; msgEl.style.display = t ? 'block' : 'none'; } }

  /* ---------------- camera view ---------------- */
  function ensureEls() {
    if (video) return;
    var box = document.getElementById('camSpace');
    box.style.overflow = 'hidden';
    var dev = document.getElementById('devCam'); if (dev) dev.style.display = 'none';
    video = document.createElement('video');
    video.setAttribute('playsinline', ''); video.setAttribute('muted', ''); video.setAttribute('autoplay', '');
    video.muted = true;
    video.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#000';
    guideEl = document.createElement('div');
    guideEl.style.cssText = 'position:absolute;left:' + GUIDE * 100 + '%;right:' + GUIDE * 100 + '%;top:' + GUIDE * 100 + '%;bottom:' + GUIDE * 100 + '%;' +
      'border:3px solid #fff;border-radius:14px;pointer-events:none;box-shadow:0 0 0 2000px rgba(0,0,0,.28)';
    msgEl = document.createElement('div');
    msgEl.style.cssText = 'position:absolute;left:8%;right:8%;bottom:9%;padding:6px 10px;border-radius:10px;background:rgba(15,23,42,.8);color:#fff;font-size:13px;text-align:center;display:none';
    box.appendChild(video); box.appendChild(guideEl); box.appendChild(msgEl);
  }

  /* ---------------- OCR (Tesseract, 1–2 parallel workers) ---------------- */
  function ocrReady() {
    if (schedP) return schedP;
    if (!window.Tesseract) return Promise.reject(new Error('OCR library load nahi hui'));
    var n = (navigator.hardwareConcurrency || 2) >= 4 ? 2 : 1;
    status('AI reader load ho raha hai (pehli baar ~15 MB)…');
    schedP = (async function () {
      var s = Tesseract.createScheduler();
      for (var i = 0; i < n; i++) {
        var w = await Tesseract.createWorker('eng', 1, {
          workerPath: abs(LIB + 'worker.min.js'), corePath: abs(LIB + 'core'), langPath: abs(LIB + 'lang'), workerBlobURL: false
        });
        await w.setParameters({ tessedit_pageseg_mode: '11', preserve_interword_spaces: '1' });
        s.addWorker(w);
      }
      maxInflight = n; sched = s; status('');
      return s;
    })();
    schedP.catch(function (e) { schedP = null; status('OCR load nahi hua: ' + ((e && e.message) || e)); });
    return schedP;
  }

  /* area of the video inside the white guide box (object-fit: cover) */
  function grab() {
    var vw = video.videoWidth, vh = video.videoHeight, bw = video.clientWidth, bh = video.clientHeight;
    if (!vw || !vh || !bw || !bh) return null;
    var scale = Math.max(bw / vw, bh / vh), visW = bw / scale, visH = bh / scale;
    var sx = (vw - visW) / 2 + visW * GUIDE, sy = (vh - visH) / 2 + visH * GUIDE;
    var sw = visW * (1 - 2 * GUIDE), sh = visH * (1 - 2 * GUIDE);
    var k = Math.min(1, MAX_SIDE / Math.max(sw, sh));
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(sw * k)); c.height = Math.max(1, Math.round(sh * k));
    c.getContext('2d', { willReadFrequently: true }).drawImage(video, sx, sy, sw, sh, 0, 0, c.width, c.height);
    return c;
  }
  function gray(c) {
    var x = c.getContext('2d', { willReadFrequently: true }), d = x.getImageData(0, 0, c.width, c.height), p = d.data, n = c.width * c.height;
    var hist = new Uint32Array(256), g = new Uint8Array(n), i, j;
    for (i = 0, j = 0; j < n; i += 4, j++) { var v = (p[i] * 77 + p[i + 1] * 150 + p[i + 2] * 29) >> 8; g[j] = v; hist[v]++; }
    var cut = n * 0.01, acc = 0, lo, hi;
    for (lo = 0; lo < 255; lo++) { acc += hist[lo]; if (acc >= cut) break; }
    acc = 0;
    for (hi = 255; hi > 0; hi--) { acc += hist[hi]; if (acc >= cut) break; }
    var rng = Math.max(1, hi - lo);
    for (i = 0, j = 0; j < n; i += 4, j++) { p[i] = p[i + 1] = p[i + 2] = (g[j] - lo) * 255 / rng; }
    x.putImageData(d, 0, 0);
  }
  async function codes(c) {
    var out = [];
    if ('BarcodeDetector' in window) {
      try {
        if (!det) det = new BarcodeDetector({ formats: await BarcodeDetector.getSupportedFormats() });
        (await det.detect(c)).forEach(function (b) { if (b.rawValue) out.push(b.rawValue); });
        return out;
      } catch (e) { det = null; }
    }
    if (window.ZXing) {
      try {
        if (!zx) { zx = new ZXing.MultiFormatReader(); var h = new Map(); h.set(ZXing.DecodeHintType.TRY_HARDER, true); zx.setHints(h); }
        var r = zx.decodeWithState(new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(new ZXing.HTMLCanvasElementLuminanceSource(c))));
        if (r && r.getText()) out.push(r.getText());
      } catch (e) { /* no barcode in this frame */ }
    }
    return out;
  }

  async function processFrame() {
    var c = grab();
    if (!c) return;
    inflight++;
    try {
      var cs = await codes(c);
      if (!sched) { if (cs.length) emit('onFrame', { t: '', c: cs }); return; }   // QR setup works before OCR finishes loading
      gray(c);
      var r = await sched.addJob('recognize', c);
      if (running && !paused) emit('onFrame', { t: (r && r.data && r.data.text) || '', c: cs });
    } catch (e) {
    } finally { inflight--; }
  }
  function tick() {
    if (!running) return;
    if (!paused && inflight < maxInflight && video.readyState >= 2) processFrame();
    setTimeout(tick, 90);
  }

  /* ---------------- sound ---------------- */
  function unlockAudio() {
    try { if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume(); } catch (e) { }
  }
  document.addEventListener('touchstart', unlockAudio, { passive: true });
  document.addEventListener('click', unlockAudio);
  function tone(f, dur, type, at) {
    if (!AC) return;
    try {
      var o = AC.createOscillator(), g = AC.createGain(), t = AC.currentTime + (at || 0);
      o.type = type; o.frequency.value = f; o.connect(g); g.connect(AC.destination);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.start(t); o.stop(t + dur + 0.02);
    } catch (e) { }
  }

  /* ---------------- the bridge ---------------- */
  window.Native = {
    web: true,
    startCamera: function () {
      ensureEls(); paused = false; video.style.visibility = 'visible';
      ocrReady().catch(function () { });
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        return emit('onCamera', { state: 'error', msg: 'Is browser me camera nahi chalega — Safari / Chrome me https link kholo' });
      }
      navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } })
        .then(function (s) { stream = s; track = s.getVideoTracks()[0]; video.srcObject = s; return video.play(); })
        .then(function () { running = true; emit('onCamera', { state: 'started' }); tick(); })
        .catch(function (e) {
          emit('onCamera', { state: 'error', msg: e && e.name === 'NotAllowedError' ? 'Camera permission do (iPhone: Settings > Safari > Camera > Allow)' : String((e && e.message) || e) });
        });
    },
    stopCamera: function () {
      running = false;
      if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
      stream = null; track = null;
      if (video) video.srcObject = null;
      status('');
    },
    showPreview: function (show) { paused = !show; if (video) video.style.visibility = show ? 'visible' : 'hidden'; },
    torch: function (on) {
      try {
        if (!track || !track.applyConstraints) return;
        track.applyConstraints({ advanced: [{ torch: !!on }] }).catch(function () { status(on ? 'Is phone ke browser me torch control nahi hai' : ''); setTimeout(function () { status(''); }, 2500); });
      } catch (e) { }
    },
    http: function (id, url, body) {
      fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: body, redirect: 'follow' })
        .then(function (r) { return r.text().then(function (t) { window.onHttp(id, r.status, t); }); })
        .catch(function (e) { window.onHttp(id, 0, String(e)); });
    },
    vibrate: function (json) { try { if (navigator.vibrate) navigator.vibrate(JSON.parse(json)); } catch (e) { } },
    beep: function (kind) {
      unlockAudio();
      if (kind === 'ok') { tone(880, .12, 'sine', 0); tone(1320, .2, 'sine', .13); }
      else if (kind === 'bad') { tone(220, .25, 'square', 0); tone(180, .25, 'square', .3); tone(150, .45, 'square', .6); }
      else { tone(520, .15, 'triangle', 0); tone(520, .15, 'triangle', .25); }
    },
    getPref: function (k) { try { return localStorage.getItem('pv_' + k) || ''; } catch (e) { return ''; } },
    setPref: function (k, v) { try { localStorage.setItem('pv_' + k, v); } catch (e) { } },
    appVersion: function () { return 'web 1.0'; }
  };

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () { }); });
  }
})();
