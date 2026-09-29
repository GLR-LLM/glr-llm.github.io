/* Geometric Latent Reasoning — project page interactions (no build step, no dependencies besides KaTeX). */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var SVGNS = 'http://www.w3.org/2000/svg';
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function svgEl(tag, attrs, parent) {
    var el = document.createElementNS(SVGNS, tag);
    for (var k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  }
  function fmt(n, d) {
    return Number(n).toLocaleString('en-US', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
  }

  /* ------------------------------------------------------------------ */
  /* Theme                                                               */
  /* ------------------------------------------------------------------ */
  var root = document.documentElement;
  // Light is the default; dark only when the visitor picks it (remembered per browser).
  function currentTheme() { return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; }
  $('#themeToggle').addEventListener('click', function () {
    var next = currentTheme() === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('glr-theme', next); } catch (e) {}
  });

  /* ------------------------------------------------------------------ */
  /* Nav: border on scroll + active section                              */
  /* ------------------------------------------------------------------ */
  var nav = $('#nav');
  function onScroll() { nav.classList.toggle('scrolled', window.scrollY > 8); }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  if ('IntersectionObserver' in window) {
    var links = $$('.nav-links a');
    var byId = {};
    links.forEach(function (a) { byId[a.getAttribute('href').slice(1)] = a; });
    var secObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting && byId[e.target.id]) {
          links.forEach(function (a) { a.classList.remove('active'); });
          byId[e.target.id].classList.add('active');
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    Object.keys(byId).forEach(function (id) { var s = document.getElementById(id); if (s) secObs.observe(s); });

    var revObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); revObs.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    $$('.reveal').forEach(function (el) { revObs.observe(el); });
  } else {
    $$('.reveal').forEach(function (el) { el.classList.add('in'); });
  }

  /* ------------------------------------------------------------------ */
  /* Math                                                                */
  /* ------------------------------------------------------------------ */
  var mathOpts = {
    delimiters: [
      { left: '$$', right: '$$', display: true },
      { left: '\\[', right: '\\]', display: true },
      { left: '\\(', right: '\\)', display: false },
      { left: '$', right: '$', display: false }
    ],
    throwOnError: false
  };
  function renderMath(el) {
    if (window.renderMathInElement) window.renderMathInElement(el, mathOpts);
  }
  renderMath(document.body);

  /* ------------------------------------------------------------------ */
  /* Hero: embedding-space trajectory (animated version of Figure 1)     */
  /* Plays (a) -> (b) -> (c) in a loop; click a step to hold it.         */
  /* ------------------------------------------------------------------ */
  (function geo() {
    var card = $('#geo');
    if (!card) return;
    var gN = $('#geoNbhd'), gI = $('#geoInk'), gR = $('#geoRed'), gT = $('#geoTok'), gL = $('#geoLbl');
    // Token embeddings (purple dots), in the layout of the paper's figure.
    var P = [[120, 112], [303, 250], [463, 131], [424, 383], [527, 307], [663, 138], [823, 287]];
    // (b) predicted displacements from each token, approximating the next transition.
    var B = [[252, 285], [420, 87], [370, 380], [583, 342], [620, 87], [852, 212]];
    // (c) chained latent updates at inference.
    var C = [[120, 110], [272, 216], [424, 85], [466, 332], [668, 178], [858, 254]];
    var caps = {
      a: 'Standard chain-of-thought forces reasoning through a sequence of exact vocabulary embeddings, committing to one discrete token at every step.',
      b: 'During training, GLR learns continuous displacement vectors (red) that approximate each discrete transition. The dashed neighborhoods mark where continuous states can still be meaningful inputs.',
      c: 'At inference, the learned updates chain together and leave the literal text path. The model skips redundant discrete transitions, then resumes ordinary token decoding.'
    };
    var modes = ['a', 'b', 'c'];
    var tabs = $$('.geo-steps button', card);
    var bars = tabs.map(function (t) { return $('.gs-bar i', t); });
    var playBtn = $('#geoPlay');
    var timers = [];

    P.forEach(function (p) { svgEl('circle', { cx: p[0], cy: p[1], r: 80, class: 'nbhd' }, gN); });
    P.forEach(function (p) { svgEl('circle', { cx: p[0], cy: p[1], r: 11, class: 'tok' }, gT); });

    // Drawing speed. Each arrow's stroke takes SEG ms; arrows start `gap` ms apart.
    // The progress bar below is derived from these, so it always stays in sync.
    var SEG = 700, LABEL = 350;
    var T = { a: { start: 200, gap: 460, n: 6 }, b: { start: 300, gap: 420, n: 6 }, c: { start: 200, gap: 480, n: 5 } };
    function lastEnd(m) { return T[m].start + (T[m].n - 1) * T[m].gap + SEG; }

    function shorten(a, b, d) {
      var dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
      return [b[0] - dx / L * d, b[1] - dy / L * d];
    }
    function segment(g, a, b, cls, marker, delay, opts) {
      opts = opts || {};
      var e = opts.trimEnd ? shorten(a, b, opts.trimEnd) : b;
      var s = opts.trimStart ? shorten(b, a, opts.trimStart) : a;
      var line = svgEl('line', { x1: s[0], y1: s[1], x2: e[0], y2: e[1], class: cls + ' draw' }, g);
      var len = Math.hypot(e[0] - s[0], e[1] - s[1]);
      if (reduceMotion || opts.instant) {
        if (marker) line.setAttribute('marker-end', marker);
        return line;
      }
      line.style.strokeDasharray = len;
      line.style.strokeDashoffset = len;
      line.style.transition = 'stroke-dashoffset ' + SEG + 'ms cubic-bezier(.4,.1,.3,1)';
      timers.push(setTimeout(function () { line.style.strokeDashoffset = 0; }, delay));
      if (marker) timers.push(setTimeout(function () { line.setAttribute('marker-end', marker); line.style.strokeDasharray = 'none'; }, delay + SEG - 80));
      return line;
    }
    function draw(m) {
      timers.forEach(clearTimeout); timers = [];
      [gI, gR, gL].forEach(function (g) { while (g.firstChild) g.removeChild(g.firstChild); });
      tabs.forEach(function (t) { t.setAttribute('aria-selected', t.dataset.mode === m ? 'true' : 'false'); });
      $('#geoCaption').textContent = caps[m];
      var i;
      if (m === 'a') {
        for (i = 0; i < P.length - 1; i++) segment(gI, P[i], P[i + 1], 'seg-ink', 'url(#ahInk)', T.a.start + i * T.a.gap, { trimEnd: 14, trimStart: 8 });
      } else if (m === 'b') {
        for (i = 0; i < P.length - 1; i++) segment(gI, P[i], P[i + 1], 'seg-ink', 'url(#ahInk)', 0, { trimEnd: 14, trimStart: 8, instant: true });
        for (i = 0; i < B.length; i++) segment(gR, P[i], B[i], 'seg-red', 'url(#ahRed)', T.b.start + i * T.b.gap, { trimStart: 8 });
      } else {
        for (i = 0; i < P.length - 1; i++) {
          var l = segment(gI, P[i], P[i + 1], 'seg-ink ghost', null, 0, { trimEnd: 12, trimStart: 8, instant: true });
          l.setAttribute('stroke-dasharray', '2 9');
        }
        for (i = 0; i < C.length - 1; i++) segment(gR, C[i], C[i + 1], 'seg-red', 'url(#ahRed)', T.c.start + i * T.c.gap, { trimStart: i === 0 ? 8 : 0 });
        var lbl = svgEl('text', { x: 900, y: 402, 'text-anchor': 'end', class: 'lbl lbl-red' }, gL);
        lbl.textContent = 'decoding resumes';
        if (!reduceMotion) {
          lbl.style.opacity = 0; lbl.style.transition = 'opacity ' + LABEL + 'ms';
          timers.push(setTimeout(function () { lbl.style.opacity = 1; }, lastEnd('c') - 150));
        }
      }
    }

    // Player: the progress bar fills exactly while a step's arrows draw; the next step starts as it completes.
    var DRAW = { a: lastEnd('a'), b: lastEnd('b'), c: lastEnd('c') - 150 + LABEL };
    var idx = 0, playing = !reduceMotion, visible = true, t0 = null, raf = null;
    var ICON_PAUSE = '<svg viewBox="0 0 12 12" fill="currentColor"><rect x="2" y="1.5" width="3" height="9" rx="1"/><rect x="7" y="1.5" width="3" height="9" rx="1"/></svg>';
    var ICON_PLAY = '<svg viewBox="0 0 12 12" fill="currentColor"><path d="M3 1.5v9l7.5-4.5z"/></svg>';

    function show(k) {
      idx = k;
      bars.forEach(function (b, j) { b.style.width = j < k ? '100%' : '0%'; });
      draw(modes[k]);
    }
    function paintBtn() {
      playBtn.innerHTML = playing ? ICON_PAUSE : ICON_PLAY;
      playBtn.setAttribute('aria-label', playing ? 'Pause animation' : 'Play animation');
      playBtn.title = playing ? 'Pause' : 'Play';
    }
    function tick(t) {
      if (t0 === null) t0 = t;
      var dur = DRAW[modes[idx]];
      bars[idx].style.width = (Math.min(1, (t - t0) / dur) * 100) + '%';
      if (t - t0 >= dur) { t0 = t; show((idx + 1) % modes.length); }
      raf = requestAnimationFrame(tick);
    }
    function start() { if (!raf && playing && visible) { t0 = null; raf = requestAnimationFrame(tick); } }
    function stop() { if (raf) cancelAnimationFrame(raf); raf = null; }

    playBtn.addEventListener('click', function () {
      if (playing) { playing = false; stop(); }
      else { playing = true; show(idx); start(); }
      paintBtn();
    });
    tabs.forEach(function (t, k) {
      t.addEventListener('click', function () {
        playing = false; stop(); paintBtn();
        show(k);
        bars[k].style.width = '100%';
      });
    });

    paintBtn();
    show(0);
    if (reduceMotion) bars[0].style.width = '100%';
    // Pause while scrolled out of view; resume where it left off.
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          visible = e.isIntersecting;
          if (!visible) stop();
          else if (playing && !raf) { show(idx); start(); } // replay the step so bar and arrows restart together
        });
      }, { threshold: 0.3 }).observe(card);
    } else start();
  })();

  /* ------------------------------------------------------------------ */
  /* Step race: median total steps over correct answers (Qwen3-1.7B)     */
  /* ------------------------------------------------------------------ */
  (function race() {
    var data = {
      gsm8k: [699, 161], math500: [1876, 334], svamp: [471, 101], amc23: [2751, 483], olympiad: [3129, 447]
    };
    var K = 10;
    var sel = $('#raceBench');
    var cot = $('#raceCot'), glr = $('#raceGlr'), lat = $('#raceLat');
    var cotN = $('#raceCotN'), glrN = $('#raceGlrN'), big = $('#raceBig');
    var raf = null;

    function set(step, c, g) {
      var cs = Math.min(step, c), gs = Math.min(step, g);
      cot.style.width = (cs / c * 100) + '%';
      lat.style.width = (Math.min(gs, K) / c * 100) + '%';
      glr.style.width = (gs / c * 100) + '%';
      cotN.textContent = fmt(cs) + (cs >= c ? ' steps ✓' : ' steps');
      glrN.textContent = fmt(gs) + (gs >= g ? ' steps ✓' : ' steps');
    }
    function run() {
      var d = data[sel.value], c = d[0], g = d[1];
      big.innerHTML = (c / g).toFixed(1) + '× fewer steps<span>(−' + Math.round((1 - g / c) * 100) + '%)</span>';
      if (raf) cancelAnimationFrame(raf);
      if (reduceMotion) { set(c, c, g); return; }
      var dur = 3200, t0 = null;
      function tick(t) {
        if (t0 === null) t0 = t;
        var step = Math.round((t - t0) / dur * c);
        set(step, c, g);
        if (step < c) raf = requestAnimationFrame(tick);
      }
      raf = requestAnimationFrame(tick);
    }
    sel.addEventListener('change', run);
    $('#raceReplay').addEventListener('click', run);
    var started = false;
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es, o) {
        es.forEach(function (e) { if (e.isIntersecting && !started) { started = true; run(); o.disconnect(); } });
      }, { threshold: 0.4 }).observe($('#race'));
    } else run();
  })();

  /* ------------------------------------------------------------------ */
  /* Tabs (results)                                                      */
  /* ------------------------------------------------------------------ */
  (function tabs() {
    var btns = $$('.tabbar button');
    function show(btn) {
      btns.forEach(function (b) {
        var on = b === btn;
        b.setAttribute('aria-selected', on ? 'true' : 'false');
        b.tabIndex = on ? 0 : -1;
        document.getElementById(b.getAttribute('aria-controls')).hidden = !on;
      });
      if (window.__glrRedraw) window.__glrRedraw();
    }
    btns.forEach(function (b, i) {
      b.addEventListener('click', function () { show(b); });
      b.addEventListener('keydown', function (e) {
        var j = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : null;
        if (j === null) return;
        j = (j + btns.length) % btns.length;
        btns[j].focus(); show(btns[j]);
      });
    });
    show(btns[0]);
  })();

  /* Simple segmented control helper */
  function segmented(container, onPick) {
    var bs = $$('button', container);
    bs.forEach(function (b) {
      b.addEventListener('click', function () {
        bs.forEach(function (x) { x.classList.toggle('on', x === b); });
        onPick(b);
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Accuracy–length frontier figures                                    */
  /* ------------------------------------------------------------------ */
  (function frontier() {
    var caps = {
      gsm8k: ['GSM8K', '<b>GLR shifts the accuracy–length frontier on GSM8K.</b> <b>Left:</b> pass@1 accuracy as a function of the generation budget. With ≤ 256 steps, CoT-SFT is near zero because its trace is truncated before an answer, while GLR already solves most problems. <b>Right:</b> total steps for correct answers (log scale), with latent steps counted. GLR-K uses K latent steps.'],
      math500: ['MATH500', '<b>Emergent length reduction on MATH500.</b> At a 512-step budget with Qwen3-1.7B, CoT-SFT solves almost nothing while GLR-10 solves over 40%. The median correct CoT-SFT generation is ~2,000 tokens, and GLR-10 and GLR-20 bring it down to ~350 total steps. Moderate K gives the best tradeoff, and very large K (80–100) reduces accuracy. Decoding cap: 4,096.'],
      svamp: ['SVAMP', '<b>GLR removes redundant reasoning on simple arithmetic.</b> SVAMP problems need only a few additions or subtractions, yet CoT-SFT spends a median of ~500–700 tokens on them. GLR keeps high accuracy under strict budgets (≤ 256) and solves the same problems in ~100 total steps.'],
      multiarith: ['MultiArith', '<b>Accuracy and generation length on MultiArith.</b> GLR reduces the number of steps needed for multi-step arithmetic word problems.'],
      amc23: ['AMC23', '<b>Accuracy and generation length on AMC23.</b> GLR reduces the median generation length on competition mathematics.'],
      olympiadbench: ['OlympiadBench', '<b>Accuracy and generation length on OlympiadBench.</b> GLR shifts the accuracy–length frontier on olympiad-level problems.']
    };
    var img = $('#benchImg'), cap = $('#benchCap');
    function pick(k) {
      img.src = 'static/images/' + k + '.svg';
      img.alt = 'Accuracy vs. generation budget and generation-length distributions on ' + caps[k][0];
      cap.innerHTML = caps[k][1];
    }
    // Preload the others after first paint so switching feels instant.
    window.addEventListener('load', function () {
      Object.keys(caps).forEach(function (k) { var i = new Image(); i.src = 'static/images/' + k + '.svg'; });
    });
    segmented($('#benchSeg'), function (b) { pick(b.dataset.bench); });
    pick('gsm8k');
  })();

  /* ------------------------------------------------------------------ */
  /* Tooltip                                                             */
  /* ------------------------------------------------------------------ */
  var tip = $('#tip');
  function showTip(html, evt) {
    tip.innerHTML = html;
    tip.classList.add('on');
    moveTip(evt);
  }
  function moveTip(evt) {
    var x = evt.clientX, y = evt.clientY;
    var w = tip.offsetWidth, h = tip.offsetHeight;
    var left = x + 14, top = y - h - 12;
    if (left + w > window.innerWidth - 8) left = x - w - 14;
    if (top < 8) top = y + 16;
    tip.style.left = left + 'px'; tip.style.top = top + 'px';
  }
  function hideTip() { tip.classList.remove('on'); }
  var key = function (cls) { return '<span class="k" style="background:var(--' + cls + ')"></span>'; };

  /* ------------------------------------------------------------------ */
  /* Grouped bar chart (SVG, one y-axis, rounded data-ends)             */
  /* ------------------------------------------------------------------ */
  function barPath(x, y, w, h, r) {
    r = Math.min(r, h, w / 2);
    if (h <= 0) return '';
    return 'M' + x + ',' + (y + h) + 'V' + (y + r) + 'Q' + x + ',' + y + ' ' + (x + r) + ',' + y +
      'H' + (x + w - r) + 'Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) + 'V' + (y + h) + 'Z';
  }
  function niceMax(v) {
    var p = Math.pow(10, Math.floor(Math.log10(v)));
    var steps = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
    for (var i = 0; i < steps.length; i++) if (steps[i] * p >= v) return steps[i] * p;
    return 10 * p;
  }
  // Charts are drawn at their container's real width so text stays legible on phones.
  var charts = [];
  function chartWidth(el) { var w = el.clientWidth; return w ? Math.max(300, Math.min(640, w)) : 520; }
  function register(fn) { charts.push(fn); fn(); }
  function redrawCharts() { charts.forEach(function (fn) { fn(); }); }
  var rzT;
  var lastW = window.innerWidth;
  window.addEventListener('resize', function () {
    if (window.innerWidth === lastW) return;
    lastW = window.innerWidth;
    clearTimeout(rzT); rzT = setTimeout(redrawCharts, 150);
  });
  window.__glrRedraw = redrawCharts;

  function groupedBars(el, cfg) {
    // cfg: { groups: [..], series: [{name, cls, values}], max, ticks, fmt, labelSeries: [indexes], unit }
    while (el.firstChild) el.removeChild(el.firstChild);
    var W = chartWidth(el), H = W < 440 ? 250 : 270, m = { l: 46, r: 8, t: 22, b: 30 };
    var iw = W - m.l - m.r, ih = H - m.t - m.b;
    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': cfg.aria || '' }, el);
    var max = cfg.max || niceMax(Math.max.apply(null, cfg.series.reduce(function (a, s) { return a.concat(s.values); }, [])) * 1.08);
    var nt = cfg.ticks || 4;
    var y = function (v) { return m.t + ih - v / max * ih; };
    var grid = svgEl('g', { class: 'grid' }, svg), axis = svgEl('g', { class: 'axis' }, svg);
    for (var t = 0; t <= nt; t++) {
      var v = max / nt * t;
      svgEl('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v) }, grid);
      var tx = svgEl('text', { x: m.l - 8, y: y(v) + 4, 'text-anchor': 'end' }, axis);
      tx.textContent = cfg.tickFmt ? cfg.tickFmt(v) : fmt(v);
    }
    var gw = iw / cfg.groups.length;
    var ns = cfg.series.length, bw = Math.min(24, (gw - 24) / ns - 2), gap = 2;
    var bandLayer = svgEl('g', {}, svg);
    var barLayer = svgEl('g', {}, svg);
    cfg.groups.forEach(function (g, gi) {
      var gx = m.l + gi * gw;
      var band = svgEl('rect', { x: gx + 4, y: m.t, width: gw - 8, height: ih, rx: 6, fill: 'transparent' }, bandLayer);
      var total = ns * bw + (ns - 1) * gap;
      var x0 = gx + (gw - total) / 2;
      cfg.series.forEach(function (s, si) {
        var v = s.values[gi];
        var bx = x0 + si * (bw + gap);
        svgEl('path', { d: barPath(bx, y(v), bw, y(0) - y(v), 4), class: 'bar-' + s.cls }, barLayer);
        if (!cfg.labelSeries || cfg.labelSeries.indexOf(si) >= 0) {
          var lab = svgEl('text', { x: bx + bw / 2, y: y(v) - 6, 'text-anchor': 'middle', class: 'val' + (s.cls === 'glr' ? ' strong' : '') }, barLayer);
          lab.textContent = cfg.fmt ? cfg.fmt(v) : fmt(v);
        }
      });
      var gl = svgEl('text', { x: gx + gw / 2, y: H - 8, 'text-anchor': 'middle' }, axis);
      gl.textContent = g;
      // Hover target spans the whole group (larger than the marks).
      var hit = svgEl('rect', { x: gx, y: m.t, width: gw, height: ih + m.b, class: 'hit' }, svg);
      function html() {
        var s = '<b>' + g + '</b><br>';
        cfg.series.forEach(function (se) { s += key(se.cls) + se.name + ': <b>' + (cfg.fmt ? cfg.fmt(se.values[gi]) : fmt(se.values[gi])) + '</b>' + (cfg.unit || '') + '<br>'; });
        if (cfg.extra) s += cfg.extra(gi);
        return s;
      }
      hit.addEventListener('mouseenter', function (e) { band.setAttribute('class', 'band-hover'); showTip(html(), e); });
      hit.addEventListener('mousemove', moveTip);
      hit.addEventListener('mouseleave', function () { band.setAttribute('class', ''); band.setAttribute('fill', 'transparent'); hideTip(); });
    });
    svgEl('line', { x1: m.l, x2: W - m.r, y1: y(0), y2: y(0), stroke: 'var(--line-2)', 'stroke-width': 1 }, svg);
  }

  /* ------------------------------------------------------------------ */
  /* Scaling results (rebuttal: 0.6B → 8B)                               */
  /* ------------------------------------------------------------------ */
  (function scaling() {
    var sizes = ['0.6B', '1.7B', '4B', '8B'];
    var D = {
      gsm8k: {
        acc: { 512: [[5.2, 17.2, 14.9, 15.5], [47.5, 70.4, 79.2, 81.6]], 1024: [[38.9, 65.7, 68.7, 70.1], [47.8, 71.4, 81.2, 88.1]] },
        len: [[934, 699, 728, 748], [168, 161, 252, 228]], def: 512
      },
      svamp: {
        acc: { 1024: [[61.7, 74.7, 75.0, 76.7], [66.0, 82.3, 86.0, 89.3]] },
        len: [[675, 471, 576, 568], [123, 101, 124, 147]], def: 1024
      },
      math500: {
        acc: { 1024: [[5.4, 9.6, 10.0, 7.6], [36.4, 53.6, 56.4, 66.4]], 2048: [[30.0, 44.2, 49.0, 47.2], [36.8, 54.4, 58.0, 67.8]] },
        len: [[1996, 1876, 1816, 1865], [328, 334, 374, 413]], def: 1024
      },
      amc23: {
        acc: { 2048: [[12.5, 20.0, 22.5, 22.5], [15.0, 35.0, 40.0, 70.0]] },
        len: [[4092, 2751, 2885, 3424], [459, 483, 472, 486]], def: 2048
      }
    };
    var bench = 'gsm8k';
    var budgetSel = $('#scaleBudget');
    function render() {
      var d = D[bench], b = budgetSel.value;
      $('#scaleAccSub').textContent = 'pass@1 (%) with a ' + fmt(+b) + '-step budget, greedy';
      groupedBars($('#scaleAcc'), {
        groups: sizes, max: 100, ticks: 4, fmt: function (v) { return v.toFixed(1); }, unit: '%',
        aria: 'Accuracy by model size, CoT-SFT versus GLR',
        series: [{ name: 'CoT-SFT', cls: 'cot', values: d.acc[b][0] }, { name: 'GLR', cls: 'glr', values: d.acc[b][1] }],
        labelSeries: [1],
        extra: function (i) { return '<span style="opacity:.8">Δ = +' + (d.acc[b][1][i] - d.acc[b][0][i]).toFixed(1) + ' pp</span>'; }
      });
      groupedBars($('#scaleLen'), {
        groups: sizes, ticks: 4, unit: ' steps',
        aria: 'Median steps for correct answers by model size',
        series: [{ name: 'CoT-SFT', cls: 'cot', values: d.len[0] }, { name: 'GLR', cls: 'glr', values: d.len[1] }],
        labelSeries: [0, 1],
        extra: function (i) { return '<span style="opacity:.8">' + Math.round((1 - d.len[1][i] / d.len[0][i]) * 100) + '% fewer steps</span>'; }
      });
    }
    function setBench(k) {
      bench = k;
      var budgets = Object.keys(D[k].acc);
      budgetSel.innerHTML = budgets.map(function (x) { return '<option value="' + x + '"' + (+x === D[k].def ? ' selected' : '') + '>' + fmt(+x) + ' steps</option>'; }).join('');
      budgetSel.disabled = budgets.length < 2;
      render();
    }
    budgetSel.addEventListener('change', render);
    segmented($('#scaleBench'), function (b) { setBench(b.dataset.k); });
    setBench('gsm8k');
    charts.push(render);
  })();

  /* ------------------------------------------------------------------ */
  /* Wall-clock + FLOPs (rebuttal, Qwen3-1.7B, matched HF stack)         */
  /* ------------------------------------------------------------------ */
  register(function speed() {
    groupedBars($('#latChart'), {
      groups: ['MATH500', 'SVAMP'], max: 50, ticks: 5, fmt: function (v) { return v.toFixed(1) + ' s'; },
      aria: 'Median latency per example',
      series: [{ name: 'CoT-SFT', cls: 'cot', values: [45.715, 10.277] }, { name: 'GLR-10', cls: 'glr', values: [8.640, 2.236] }],
      extra: function (i) { return '<span style="opacity:.8">Speedup ' + ['5.29× [4.81, 5.78]', '4.60× [4.20, 4.90]'][i] + '</span>'; }
    });
    groupedBars($('#flopChart'), {
      groups: ['MATH500', 'SVAMP'], max: 10, ticks: 5, fmt: function (v) { return v.toFixed(2); }, unit: ' TFLOPs',
      aria: 'Approximate TFLOPs per example',
      series: [{ name: 'CoT-SFT', cls: 'cot', values: [9.97, 2.99] }, { name: 'GLR-10', cls: 'glr', values: [2.58, 0.73] }],
      extra: function (i) { return '<span style="opacity:.8">' + ['−74.1% [71.2, 76.9]', '−75.6% [71.4, 79.0]'][i] + '</span>'; }
    });
  });

  /* ------------------------------------------------------------------ */
  /* Causal controls scatter                                             */
  /* ------------------------------------------------------------------ */
  register(function controls() {
    var el = $('#ctrlChart');
    while (el.firstChild) el.removeChild(el.firstChild);
    var pts = [
      { n: 'Learned transition (GLR)', x: 183.5, y: 72.3, imm: 8.0, d: '—', ours: true, lx: 14, ly: 24, a: 'start' },
      { n: 'Zero transition / repeated <think>', x: 948, y: 76.0, imm: 9.7, d: '+3.7 [−1.7, +9.0]', lx: -14, ly: -14, a: 'end' },
      { n: 'Noisy transition', x: 233, y: 58.7, imm: 13.7, d: '−13.7 [−19.3, −8.0]', lx: 14, ly: 4, a: 'start' },
      { n: 'Norm-matched random head', x: 315.5, y: 53.0, imm: 1.3, d: '−19.3 [−25.7, −13.0]', lx: 14, ly: 16, a: 'start' }
    ];
    var W = chartWidth(el), H = W < 440 ? 270 : 290, m = { l: 44, r: 16, t: 16, b: 40 };
    var iw = W - m.l - m.r, ih = H - m.t - m.b;
    var X = function (v) { return m.l + v / 1000 * iw; };
    var Y = function (v) { return m.t + ih - (v - 40) / 40 * ih; };
    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Accuracy versus median total steps for learned and control transitions' }, el);
    var grid = svgEl('g', { class: 'grid' }, svg), axis = svgEl('g', { class: 'axis' }, svg);
    [40, 50, 60, 70, 80].forEach(function (v) {
      svgEl('line', { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v) }, grid);
      svgEl('text', { x: m.l - 8, y: Y(v) + 4, 'text-anchor': 'end' }, axis).textContent = v + '%';
    });
    [0, 250, 500, 750, 1000].forEach(function (v) {
      svgEl('text', { x: X(v), y: H - 20, 'text-anchor': 'middle' }, axis).textContent = fmt(v);
    });
    svgEl('text', { x: m.l + iw / 2, y: H - 3, 'text-anchor': 'middle', class: 'axis-title' }, svg).textContent = 'Median total steps (latent + text)';
    pts.forEach(function (p) {
      var cx = X(p.x), cy = Y(p.y);
      svgEl('circle', { cx: cx, cy: cy, r: 7.5, style: 'fill: var(--' + (p.ours ? 'glr' : 'cot') + '); stroke: var(--surface); stroke-width: 2.5' }, svg);
      var t = svgEl('text', { x: cx + p.lx, y: cy + p.ly, 'text-anchor': p.a, class: 'val' + (p.ours ? ' strong' : '') }, svg);
      t.textContent = p.n;
      var hit = svgEl('circle', { cx: cx, cy: cy, r: 18, class: 'hit' }, svg);
      var esc = p.n.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      var html = '<b>' + esc + '</b><br>Accuracy: <b>' + p.y.toFixed(1) + '%</b><br>Median steps: <b>' + p.x + '</b><br>Immediate &lt;/think&gt;: ' + p.imm.toFixed(1) + '%<br>Δ acc vs learned: ' + p.d + ' pp';
      hit.addEventListener('mouseenter', function (e) { showTip(html, e); });
      hit.addEventListener('mousemove', moveTip);
      hit.addEventListener('mouseleave', hideTip);
    });
  });

  /* ------------------------------------------------------------------ */
  /* Qualitative example (verbatim model outputs from the appendix)      */
  /* ------------------------------------------------------------------ */
  (function example() {
    var EX = {
      20: {
        think: '54 - 20 = 34.',
        answer: [
          'The ratio of men to women on the bus is 5:9. To find the number of men and women, we first determine the total parts in the ratio: \\(5 + 9 = 14\\).',
          'Since the total number of passengers is 84, each part corresponds to: \\(\\frac{84}{14} = 6\\).',
          'Calculating the number of men and women:<br>- Men: \\(5 \\times 6 = 30\\)<br>- Women: \\(9 \\times 6 = 54\\)',
          'After 20 women alight, the remaining number of women is: \\(54 - 20 = 34\\).',
          'The final answer is <span class="boxed">34</span>'
        ]
      },
      50: {
        think: '',
        answer: [
          'he ratio of men to women on the bus is 5:9. The total number of passengers is 84. First, we calculate the number of men and women:',
          '1. The total parts in the ratio are \\(5 + 9 = 14\\).<br>2. Number of men: \\(\\frac{5}{14} \\times 84 = 30\\).<br>3. Number of women: \\(\\frac{9}{14} \\times 84 = 54\\).',
          'At the next stop, 20 women alight. The remaining women on the bus are: \\(54 - 20 = 34\\).',
          '<span class="boxed">34</span>'
        ]
      },
      80: {
        think: '',
        answer: [
          'The ratio of men to women on the bus is 5:9. The total number of passengers is 84. First, we calculate the total parts in the ratio: \\(5 + 9 = 14 \\text{ parts}\\)',
          'Each part corresponds to: \\(84 \\div 14 = 6\\)',
          'Thus, the number of men is \\(5 \\times 6 = 30\\) and the number of women is \\(9 \\times 6 = 54\\).',
          'At the next stop, 20 women alight. The remaining number of women is: \\(54 - 20 = 34\\)',
          '<span class="boxed">34</span>'
        ]
      }
    };
    var chips = $('#chips'), think = $('#thinkText'), ans = $('#answer');
    var timers = [];
    function play(k) {
      timers.forEach(clearTimeout); timers = [];
      chips.innerHTML = ''; think.innerHTML = ''; ans.innerHTML = '';
      var cs = [];
      for (var i = 0; i < k; i++) { var c = document.createElement('span'); c.className = 'chip'; chips.appendChild(c); cs.push(c); }
      var lab = document.createElement('span'); lab.className = 'chip-label'; lab.textContent = '{' + k + ' latent steps}';
      lab.style.opacity = 0; chips.appendChild(lab);
      var per = reduceMotion ? 0 : Math.min(45, 1500 / k);
      cs.forEach(function (c, i) { timers.push(setTimeout(function () { c.classList.add('on'); }, i * per)); });
      var done = k * per + 150;
      timers.push(setTimeout(function () {
        lab.style.opacity = 1;
        var ex = EX[k];
        if (ex.think) { think.textContent = ex.think; think.className = 'think-text fadein'; }
        else { think.innerHTML = '<span class="muted small">(no further explicit reasoning)</span>'; }
        ans.innerHTML = ex.answer.map(function (p, i) { return '<p class="fadein" style="animation-delay:' + (i * 0.12) + 's">' + p + '</p>'; }).join('') +
          '<p class="muted small" style="margin-top:10px">Output shown verbatim (line breaks and LaTeX rendered).</p>';
        renderMath(ans);
      }, done));
    }
    segmented($('#chat .seg'), function (b) { play(+b.dataset.k); });
    var started = false;
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es, o) {
        es.forEach(function (e) { if (e.isIntersecting && !started) { started = true; play(20); o.disconnect(); } });
      }, { threshold: 0.3 }).observe($('#chat'));
    } else play(20);
  })();

  /* ------------------------------------------------------------------ */
  /* BibTeX copy                                                         */
  /* ------------------------------------------------------------------ */
  $('#copyBib').addEventListener('click', function () {
    var txt = $('#bibtex').textContent, btn = this;
    function ok() { btn.textContent = 'Copied ✓'; setTimeout(function () { btn.textContent = 'Copy'; }, 1600); }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(txt).then(ok, fallback);
    } else fallback();
    function fallback() {
      var ta = document.createElement('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); ok(); } catch (e) {}
      document.body.removeChild(ta);
    }
  });

  /* ------------------------------------------------------------------ */
  /* Lightbox for figures                                                */
  /* ------------------------------------------------------------------ */
  var lb = $('#lightbox'), lbImg = $('img', lb);
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (t.classList && t.classList.contains('zoomable')) {
      lbImg.src = t.currentSrc || t.src; lbImg.alt = t.alt;
      lb.classList.add('on'); lb.setAttribute('aria-hidden', 'false');
    }
  });
  function closeLb() { lb.classList.remove('on'); lb.setAttribute('aria-hidden', 'true'); }
  lb.addEventListener('click', closeLb);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeLb(); });
})();
