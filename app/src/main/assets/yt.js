(function () {
  if (window.__gtAd) return;
  window.__gtAd = 1;

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
    } catch (e) {}
  }

  setInterval(tick, 300);
})();
