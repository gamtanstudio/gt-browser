(function () {
  if (window.__gtAd) return;
  window.__gtAd = 1;

  try {
    var P = Document.prototype;
    Object.defineProperty(P, 'hidden', { configurable: true, get: function () { return false; } });
    Object.defineProperty(P, 'webkitHidden', { configurable: true, get: function () { return false; } });
    Object.defineProperty(P, 'visibilityState', { configurable: true, get: function () { return 'visible'; } });
    Object.defineProperty(P, 'webkitVisibilityState', { configurable: true, get: function () { return 'visible'; } });
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
  try { Document.prototype.hasFocus = function () { return true; }; } catch (e) {}

  var pipCss = 'ytm-mobile-topbar-renderer,header,.mobile-topbar-header{display:none!important}' +
    'html,body{background:#000!important}';

  window.__gtCmd = function (c) {
    var v = document.querySelector('video');
    if (c === 'play') { if (v) v.play(); }
    else if (c === 'pause') { if (v) v.pause(); }
    else if (c === 'toggle') { if (v) { if (v.paused) v.play(); else v.pause(); } }
    else if (c === 'next') {
      var b = document.querySelector('.ytp-next-button,.player-controls-next-button button,button.player-control-next-button,button[aria-label*="다음"],button[aria-label*="Next"]');
      if (b) b.click();
      else if (v && isFinite(v.duration)) v.currentTime = v.duration;
    }
    else if (c === 'prev') {
      if (v && v.currentTime > 3) v.currentTime = 0;
      else history.back();
    }
    else if (c === 'pipOn') {
      if (!document.getElementById('gt-pip')) {
        var s = document.createElement('style');
        s.id = 'gt-pip';
        s.textContent = pipCss;
        (document.head || document.documentElement).appendChild(s);
      }
      window.scrollTo(0, 0);
      if (v && v.paused) v.play();
    }
    else if (c === 'pipOff') {
      var x = document.getElementById('gt-pip');
      if (x) x.remove();
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
    } catch (e) {}
  }

  setInterval(tick, 300);
})();
