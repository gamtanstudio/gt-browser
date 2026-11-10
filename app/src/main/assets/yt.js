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

  // ad blocking (same as the first version)
  var KEYS = ['adPlacements', 'adSlots', 'playerAds', 'adBreakHeartbeatParams', 'adBreakParams'];
  function prune(o) {
    try {
      if (o && typeof o === 'object') {
        for (var i = 0; i < KEYS.length; i++) if (KEYS[i] in o) delete o[KEYS[i]];
        if (o.playerResponse) prune(o.playerResponse);
      }
    } catch (e) {}
    return o;
  }

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

  var _fetch = window.fetch;
  if (_fetch) {
    window.fetch = function (input) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      var p = _fetch.apply(this, arguments);
      if (url.indexOf('/youtubei/v1/player') < 0 && url.indexOf('/youtubei/v1/next') < 0) return p;
      return p.then(function (r) {
        return r.clone().text().then(function (t) {
          try {
            var j = prune(_parse(t));
            return new Response(JSON.stringify(j), { status: r.status, statusText: r.statusText, headers: r.headers });
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

  function tick() {
    try {
      addCss();
      var pl = document.querySelector('.html5-video-player');
      var ad = !!(pl && (pl.classList.contains('ad-showing') || pl.classList.contains('ad-interrupting')));
      var v = document.querySelector('video');
      if (v) {
        if (ad) {
          v.__gtAd = 1;
          v.muted = true;
          if (isFinite(v.duration) && v.duration > 0 && v.currentTime < v.duration - 0.2) v.currentTime = v.duration;
          if (v.playbackRate < 16) v.playbackRate = 16;
        } else if (v.__gtAd) {
          v.__gtAd = 0;
          v.muted = false;
          v.playbackRate = 1;
        }
      }
      var b = document.querySelectorAll('.ytp-ad-skip-button,.ytp-ad-skip-button-modern,.ytp-skip-ad-button,.ytm-skip-ad-button,button[class*="skip-ad"],button[class*="ad-skip"]');
      for (var i = 0; i < b.length; i++) b[i].click();
      report(v, ad);
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

  // GT 뮤직: one song -> its mix, skip long compilations
  var MAX_SEC = 15 * 60;
  function music(v, ad) {
    if (location.pathname !== '/watch') return;
    var q = new URLSearchParams(location.search);
    var id = q.get('v'), list = q.get('list');
    if (!id) return;
    if (!list) {
      if (window.__gtMixFor !== id) {
        window.__gtMixFor = id;
        location.replace('/watch?v=' + encodeURIComponent(id) + '&list=RD' + encodeURIComponent(id));
      }
      return;
    }
    if (ad || !v || !isFinite(v.duration) || v.duration <= MAX_SEC) return;
    if (list === 'RD' + id) return;
    if (window.__gtSkipped === id) return;
    window.__gtSkipped = id;
    window.__gtCmd('next');
  }

  setInterval(tick, 300);
})();
