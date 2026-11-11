(function () {
  if (window.__gtAd) return;
  window.__gtAd = 1;

  // keep playing when the app is in the background
  try {
    var P = Document.prototype;
    Object.defineProperty(P, 'hidden', { configurable: true, get: function () { return false; } });
    Object.defineProperty(P, 'webkitHidden', { configurable: true, get: function () { return false; } });
    Object.defineProperty(P, 'visibilityState', { configurable: true, get: function () { return 'visible'; } });
    Object.defineProperty(P, 'webkitVisibilityState', { configurable: true, get: function () { return 'visible'; } });
    P.hasFocus = function () { return true; };
  } catch (e) {}
  ['visibilitychange', 'webkitvisibilitychange', 'freeze'].forEach(function (n) {
    window.addEventListener(n, function (e) { e.stopImmediatePropagation(); }, true);
    document.addEventListener(n, function (e) { e.stopImmediatePropagation(); }, true);
  });
  ['blur', 'pagehide'].forEach(function (n) {
    window.addEventListener(n, function (e) {
      if (e.target === window || e.target === document) e.stopImmediatePropagation();
    }, true);
  });

  // commands from the notification / earbuds
  window.__gtCmd = function (c) {
    var v = document.querySelector('video');
    if (c === 'play') { if (v) v.play(); }
    else if (c === 'pause') { if (v) v.pause(); }
    else if (c === 'next') {
      var b = document.querySelector('.ytp-next-button,.player-controls-next-button button,button.player-control-next-button,button[aria-label*="다음"],button[aria-label*="Next"]');
      if (b) b.click();
      else if (v && isFinite(v.duration)) v.currentTime = v.duration;
    }
    else if (c === 'prev') {
      if (v && v.currentTime > 3) v.currentTime = 0;
      else history.back();
    }
  };

  function report(v, ad) {
    try {
      if (!window.GTBridge) return;
      var st = { p: !!(v && !v.paused && !v.ended && v.readyState > 1) || ad, t: '', a: '' };
      try {
        var m = navigator.mediaSession && navigator.mediaSession.metadata;
        if (m) { st.t = m.title || ''; st.a = m.artist || ''; }
      } catch (e) {}
      if (!st.t) st.t = (document.title || '').replace(/ - YouTube$/, '');
      var s = JSON.stringify(st);
      if (s !== window.__gtLast) { window.__gtLast = s; window.GTBridge.state(s); }
    } catch (e) {}
  }

  // speed log: tap -> playback time per video, kept in localStorage 'gtlog'
  var LOG = (function () {
    var L = { pruned: 0, cost: 0, cur: null, t0: null, reqAt: null, resAt: null, ks: '', st: 0 };
    L.req = function () { L.reqAt = performance.now(); L.resAt = null; };
    L.res = function () { L.resAt = performance.now(); };
    function save(r) {
      try {
        var a = [];
        try { a = _parse0(localStorage.getItem('gtlog') || '[]'); } catch (e) {}
        a.push(r);
        if (a.length > 30) a = a.slice(-30);
        localStorage.setItem('gtlog', JSON.stringify(a));
      } catch (e) {}
    }
    var _parse0 = JSON.parse;
    L.click = function () { L.t0 = performance.now(); };
    L.start = function (id) {
      L.cur = { v: id, m: window.__gtMode || '', at: new Date().toTimeString().slice(0, 8),
        tap: L.t0 !== null, t0: L.t0 !== null ? L.t0 : performance.now(),
        p0: L.pruned, c0: L.cost, meta: null, ad: 0, adMs: 0, adAt: null, done: false,
        ks: L.ks, st: L.st, ax: null, lt: [] };
      L.t0 = null;
    };
    L.ad = function (on) {
      var c = L.cur;
      if (!c || c.done) return;
      if (on && c.adAt === null) { c.ad++; c.adAt = performance.now(); }
      else if (!on && c.adAt !== null) { c.adMs += performance.now() - c.adAt; c.adAt = null; }
    };
    L.meta = function () {
      var c = L.cur;
      if (c && !c.done && c.meta === null) c.meta = Math.round(performance.now() - c.t0);
    };
    L.play = function (isAd) {
      var c = L.cur;
      if (!c || c.done || isAd) return;
      c.done = true;
      var rel = function (x) { return x !== null && x >= c.t0 - 2000 ? Math.round(x - c.t0) : null; };
      save({ v: c.v, m: c.m, at: c.at, tap: c.tap, md: FULL ? 'full' : 'keep',
        req: rel(L.reqAt), res: rel(L.resAt),
        play: Math.round(performance.now() - c.t0), meta: c.meta,
        ad: c.ad, adMs: Math.round(c.adMs), cut: L.pruned - c.p0, cost: Math.round(L.cost - c.c0),
        ks: c.ks, st: c.st, ax: c.ax, lt: c.lt.length ? c.lt : undefined });
    };
    return L;
  })();
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest && e.target.closest('a[href*="/watch?v="]');
    if (a) LOG.click();
  }, true);
  document.addEventListener('loadedmetadata', function () { LOG.meta(); }, true);
  document.addEventListener('playing', function (e) {
    if (location.pathname === '/watch') {
      var id = new URLSearchParams(location.search).get('v');
      if (id && (!LOG.cur || LOG.cur.v !== id)) LOG.start(id);
    }
    var pl = document.querySelector('#movie_player') || document.querySelector('.html5-video-player');
    if (e.target && pl && !pl.contains(e.target)) return;
    LOG.play(!!(pl && (pl.classList.contains('ad-showing') || pl.classList.contains('ad-interrupting'))));
  }, true);

  // ad handling
  // default: remove mid/end-roll info, but KEEP the pre-roll keys (removing them makes
  // YouTube wait 5-10s); the pre-roll is then fast-forwarded by the skipper below.
  // 'gtfull' = old way: remove everything.
  var KEYS = ['adPlacements', 'adSlots', 'playerAds', 'adBreakHeartbeatParams', 'adBreakParams'];
  var KEEP = { adSlots: 1, adBreakParams: 1 };
  var FULL = false;
  try { FULL = localStorage.getItem('gtfull') === '1'; } catch (e) {}
  var NOPRUNE = !FULL;
  function prune(o) {
    try {
      if (o && typeof o === 'object') {
        if (o.playerResponse) prune(o.playerResponse);
        if (!('playabilityStatus' in o) && !('adPlacements' in o) && !('adSlots' in o)) return o;
        var ks = [], st = 0;
        for (var i = 0; i < KEYS.length; i++) if (KEYS[i] in o) ks.push(KEYS[i]);
        if (!ks.length) return o;
        try {
          (o.adPlacements || []).forEach(function (a) {
            var k = a && a.adPlacementRenderer && a.adPlacementRenderer.config &&
              a.adPlacementRenderer.config.adPlacementConfig && a.adPlacementRenderer.config.adPlacementConfig.kind;
            if (k === 'AD_PLACEMENT_KIND_START') st++;
          });
        } catch (x) {}
        LOG.ks = ks.join(',').replace(/ad|Params/g, ''); LOG.st = st;
        for (var j = 0; j < ks.length; j++) {
          if (!FULL && KEEP[ks[j]]) continue;
          if (!FULL && ks[j] === 'adPlacements' && st) {
            o.adPlacements = o.adPlacements.filter(function (a) {
              try { return a.adPlacementRenderer.config.adPlacementConfig.kind === 'AD_PLACEMENT_KIND_START'; } catch (x) { return false; }
            });
            LOG.pruned++;
            continue;
          }
          delete o[ks[j]]; LOG.pruned++;
        }
      }
    } catch (e) {}
    return o;
  }

  // log long timers scheduled while a video is waiting to start
  try {
    var _st = window.setTimeout;
    window.setTimeout = function (f, d) {
      try {
        var c = LOG.cur;
        if (d >= 2000 && c && !c.done && c.lt.length < 6) c.lt.push(Math.round(d));
      } catch (x) {}
      return _st.apply(this, arguments);
    };
  } catch (e) {}

  var _parse = JSON.parse;
  JSON.parse = function () { return prune(_parse.apply(this, arguments)); };

  try {
    var ipr;
    Object.defineProperty(window, 'ytInitialPlayerResponse', {
      configurable: true,
      get: function () { return ipr; },
      set: function (v) { ipr = prune(v); }
    });
  } catch (e) {}

  function isInfo(u) {
    return (u.indexOf('/youtubei/v1/player') >= 0 || u.indexOf('/youtubei/v1/get_watch') >= 0) && u.indexOf('/ad_break') < 0;
  }

  try {
    var XO = XMLHttpRequest.prototype.open, XS = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (m, u) {
      this.__gtP = typeof u === 'string' && isInfo(u);
      return XO.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function () {
      if (this.__gtP) {
        LOG.req();
        this.addEventListener('loadend', function () { LOG.res(); });
      }
      return XS.apply(this, arguments);
    };
  } catch (e) {}

  var _fetch = window.fetch;
  if (_fetch) {
    window.fetch = function (input) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      var isPlayer = isInfo(url);
      if (isPlayer) LOG.req();
      var p = _fetch.apply(this, arguments);
      if (isPlayer) p.then(function () { LOG.res(); }, function () {});
      if (url.indexOf('/youtubei/v1/player') < 0 && url.indexOf('/youtubei/v1/next') < 0) return p;
      return p.then(function (r) {
        var c0 = performance.now();
        return r.clone().text().then(function (t) {
          try {
            var j = prune(_parse(t));
            var out = new Response(JSON.stringify(j), { status: r.status, statusText: r.statusText, headers: r.headers });
            LOG.cost += performance.now() - c0;
            return out;
          } catch (e) { return r; }
        }, function () { return r; });
      });
    };
  }

  var css = [
    'ytm-promoted-sparkles-web-renderer', 'ytm-promoted-video-renderer', 'ytm-companion-ad-renderer',
    'ad-slot-renderer', 'ytm-ad-slot-renderer', 'ytd-ad-slot-renderer', 'ytd-in-feed-ad-layout-renderer',
    'ytm-rich-item-renderer:has(ad-slot-renderer)', 'ytd-rich-item-renderer:has(ytd-ad-slot-renderer)',
    'ytd-promoted-sparkles-web-renderer', '#player-ads', '.ytp-ad-overlay-container', '.ytp-ad-image-overlay',
    'ytm-statement-banner-renderer', 'ytd-banner-promo-renderer', 'ytm-mealbar-promo-renderer',
    'ytd-mealbar-promo-renderer', 'yt-mealbar-promo-renderer', 'ytm-paid-content-overlay-renderer'
  ].join(',') + '{display:none!important}';

  function addCss() {
    if (document.getElementById('gt-ad-css')) return;
    var root = document.head || document.documentElement;
    if (!root) return;
    var s = document.createElement('style');
    s.id = 'gt-ad-css';
    s.textContent = css;
    root.appendChild(s);
  }

  function player() {
    return document.querySelector('#movie_player') || document.querySelector('.html5-video-player');
  }
  function isAd(pl) {
    return !!(pl && (pl.classList.contains('ad-showing') || pl.classList.contains('ad-interrupting')));
  }
  function mainVideo(pl) {
    return (pl && pl.querySelector('video')) || document.querySelector('video.html5-main-video') || document.querySelector('video');
  }
  function skipButtons(pl) {
    var out = [].slice.call(document.querySelectorAll('.ytp-ad-skip-button,.ytp-ad-skip-button-modern,.ytp-skip-ad-button,.ytm-skip-ad-button,button[class*="skip-ad"],button[class*="ad-skip"],[class*="skip-button"]'));
    var root = pl || document;
    var bs = root.querySelectorAll('button,[role="button"]');
    for (var i = 0; i < bs.length; i++) {
      var t = ((bs[i].innerText || '') + ' ' + (bs[i].getAttribute('aria-label') || '')).trim();
      if (/건너뛰기|광고 건너뛰기|Skip/i.test(t) && out.indexOf(bs[i]) < 0) out.push(bs[i]);
    }
    return out;
  }
  function killAd(pl, v) {
    var c = LOG.cur, ax = null;
    if (c && !c.done && !c.ax) ax = c.ax = { n: 0 };
    if (v) {
      v.__gtAd = 1;
      v.muted = true;
      var d = v.duration;
      if (ax) { ax.d = isFinite(d) ? Math.round(d * 10) / 10 : String(d); ax.r0 = v.playbackRate; }
      if (isFinite(d) && d > 0 && v.currentTime < d - 0.2) v.currentTime = d - 0.1;
      else if (!isFinite(d) && v.seekable && v.seekable.length) v.currentTime = v.seekable.end(v.seekable.length - 1);
      if (v.playbackRate < 16) v.playbackRate = 16;
      if (ax) { ax.ct = Math.round(v.currentTime * 10) / 10; ax.r1 = v.playbackRate; }
    }
    var b = skipButtons(pl);
    if (c && c.ax && b.length && !c.ax.b) c.ax.b = (b[0].className || b[0].tagName).toString().slice(0, 40);
    if (c && c.ax) c.ax.n++;
    for (var i = 0; i < b.length; i++) { try { b[i].click(); } catch (x) {} }
  }
  // react to ad playback right away instead of waiting for the next tick
  ['loadedmetadata', 'durationchange', 'playing', 'timeupdate'].forEach(function (n) {
    document.addEventListener(n, function () {
      var pl = player();
      if (isAd(pl)) killAd(pl, mainVideo(pl));
    }, true);
  });

  function tick() {
    try {
      addCss();
      var pl = player();
      var ad = isAd(pl);
      var v = mainVideo(pl);
      if (ad) killAd(pl, v);
      else if (v && v.__gtAd) {
        v.__gtAd = 0;
        v.muted = false;
        v.playbackRate = 1;
      }
      report(v, ad);
      if (location.pathname === '/watch') {
        var vid = new URLSearchParams(location.search).get('v');
        if (vid && (!LOG.cur || LOG.cur.v !== vid)) LOG.start(vid);
      }
      LOG.ad(ad);
      if (LOG.cur && !LOG.cur.done && v && !ad && !v.paused && v.currentTime > 0.05) LOG.play(false);
      topbar.tick();
      if (window.__gtMode === 'music') music(v, ad);
    } catch (e) {}
  }

  // top bar: hidden by default, pull down a little to show it
  var topbar = (function () {
    var shown = true, fixes = [], lastY = 0, ty = null, quietUntil = 0, url = '', idle = null;

    function bar() {
      var h = document.querySelector('ytm-mobile-topbar-renderer') || document.querySelector('header.mobile-topbar-header');
      if (!h) return null;
      var e = h;
      while (e && e !== document.body) {
        var p = getComputedStyle(e).position;
        if (p === 'fixed' || p === 'sticky') return e;
        e = e.parentElement;
      }
      return h;
    }

    function hideOpenApp(b) {
      var els = b.querySelectorAll('a,button');
      for (var i = 0; i < els.length; i++) {
        var t = (els[i].innerText || '').replace(/\s+/g, ' ').trim();
        if (t === '앱 열기' || t === '앱에서 열기' || t === 'Open App' || t === 'Open app') {
          var x = els[i].closest('ytm-button-renderer') || els[i];
          x.style.setProperty('display', 'none', 'important');
        }
      }
    }

    function restore() {
      for (var i = 0; i < fixes.length; i++) {
        var f = fixes[i];
        if (f[2]) f[0].style.setProperty(f[1], f[2], f[3]); else f[0].style.removeProperty(f[1]);
      }
      fixes = [];
    }

    function scan(b, H) {
      var list = [document.body].concat([].slice.call(document.querySelectorAll(
        'body > *, body > * > *, body > * > * > *, #player-container-id, .player-container, ytm-watch, ytm-single-column-watch-next-results-renderer')));
      var pad = false;
      for (var i = 0; i < list.length; i++) {
        var el = list[i];
        if (!el || el === b || b.contains(el) || el.contains(b)) continue;
        var cs = getComputedStyle(el);
        if (Math.abs(parseFloat(cs.paddingTop) - H) < 2) {
          fixes.push([el, 'padding-top', el.style.getPropertyValue('padding-top'), el.style.getPropertyPriority('padding-top')]);
          pad = true;
        }
        if ((cs.position === 'sticky' || cs.position === 'fixed') && Math.abs(parseFloat(cs.top) - H) < 2) {
          fixes.push([el, 'top', el.style.getPropertyValue('top'), el.style.getPropertyPriority('top')]);
        }
      }
      for (var j = 0; j < fixes.length; j++) fixes[j][0].style.setProperty(fixes[j][1], '0px', 'important');
      return pad;
    }

    function set(hide) {
      var b = bar();
      if (!b) return;
      hideOpenApp(b);
      if (document.fullscreenElement) return;
      var ae = document.activeElement;
      if (hide && ae && b.contains(ae) && /INPUT|TEXTAREA/.test(ae.tagName)) return;
      if (hide === !shown) return;
      shown = !hide;
      quietUntil = Date.now() + 400;
      var H = b.getBoundingClientRect().height;
      b.style.setProperty('transition', 'transform .2s ease', 'important');
      if (hide) {
        b.style.setProperty('transform', 'translateY(-100%)', 'important');
        if (H > 20 && scan(b, H) && window.scrollY > 0) window.scrollBy(0, -Math.min(H, window.scrollY));
      } else {
        b.style.removeProperty('transform');
        var had = fixes.some(function (f) { return f[1] === 'padding-top'; });
        restore();
        if (had && window.scrollY > 0) window.scrollBy(0, H);
        clearTimeout(idle);
        idle = setTimeout(function () { set(true); }, 5000);
      }
    }

    var onPlayer = false, sx = 0, sy = 0, ey = 0, ex = 0;
    window.addEventListener('touchstart', function (e) {
      var t = e.touches && e.touches[0];
      ty = t ? t.clientY : null;
      onPlayer = false;
      if (!t) return;
      sx = ex = t.clientX; sy = ey = t.clientY;
      var tg = e.target;
      if (location.pathname === '/watch' && !document.fullscreenElement && tg && tg.closest &&
          tg.closest('#player-container-id, .player-container, #movie_player, .html5-video-player')) onPlayer = true;
    }, { passive: true, capture: true });
    window.addEventListener('touchend', function () {
      if (onPlayer && ey - sy > 120 && Math.abs(ex - sx) < 80) history.back();
      onPlayer = false;
    }, { passive: true, capture: true });
    window.addEventListener('touchmove', function (e) {
      if (e.touches && e.touches[0]) { ex = e.touches[0].clientX; ey = e.touches[0].clientY; }
      if (onPlayer) return;
      if (ty === null || !e.touches || !e.touches[0]) return;
      var dy = e.touches[0].clientY - ty;
      if (dy > 40) { set(false); ty = e.touches[0].clientY; }
      else if (dy < -25) { set(true); ty = e.touches[0].clientY; }
    }, { passive: true, capture: true });
    window.addEventListener('scroll', function () {
      var y = window.scrollY, d = y - lastY;
      lastY = y;
      if (Date.now() < quietUntil) return;
      if (d > 8) set(true);
      else if (d < -12) set(false);
    }, { passive: true, capture: true });

    return {
      tick: function () {
        var b = bar();
        if (!b) return;
        hideOpenApp(b);
        if (location.href !== url) {
          url = location.href;
          shown = true;
          fixes = [];
          setTimeout(function () { set(true); }, 600);
        } else if (!shown && !b.style.transform) {
          shown = true;
          set(true);
        }
      }
    };
  })();

  // GT 뮤직: YouTube autoplay keeps similar songs coming; skip long compilations it picks
  var MAX_SEC = 15 * 60;
  var chosen = '';
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest && e.target.closest('a[href*="/watch?v="]');
    if (!a) return;
    try { chosen = new URLSearchParams(a.getAttribute('href').split('?')[1]).get('v') || ''; } catch (x) {}
  }, true);
  function music(v, ad) {
    if (location.pathname !== '/watch') return;
    var id = new URLSearchParams(location.search).get('v');
    if (!id || id === chosen) return;
    if (ad || !v || !isFinite(v.duration) || v.duration <= MAX_SEC) return;
    if (window.__gtSkipped === id) return;
    window.__gtSkipped = id;
    window.__gtCmd('next');
  }

  setInterval(tick, 300);
})();
