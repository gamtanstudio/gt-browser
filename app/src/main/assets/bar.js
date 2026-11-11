(function () {
  if (window.__gtBar) return;
  window.__gtBar = 1;
  try { if (window.top !== window) return; } catch (e) { return; }
  if (/(^|\.)youtube\.com$/.test(location.hostname)) return;

  // site top bar: hidden by default, pull down a little to show it (like GT 튜브)
  var bars = [], shown = true, ty = null, quietUntil = 0, idle = null, lastY = 0, url = '', fixes = [];

  function isBar(el) {
    if (!el || el === document.body || el === document.documentElement) return false;
    var cs = getComputedStyle(el);
    if (cs.position !== 'fixed' && cs.position !== 'sticky') return false;
    var r = el.getBoundingClientRect();
    return r.top <= 2 && r.height > 20 && r.height < 170 && r.width >= innerWidth * 0.9;
  }

  function find() {
    if (!document.body) return [];
    var found = [], xs = [innerWidth / 2, 30, innerWidth - 30];
    for (var i = 0; i < xs.length; i++) {
      var els = document.elementsFromPoint(xs[i], 8);
      for (var j = 0; j < els.length; j++) {
        var e = els[j], top = null;
        while (e && e !== document.body) {
          if (isBar(e)) top = e;
          e = e.parentElement;
        }
        if (top && found.indexOf(top) < 0) found.push(top);
      }
    }
    return found;
  }

  function restore() {
    for (var i = 0; i < fixes.length; i++) {
      var f = fixes[i];
      if (f[2]) f[0].style.setProperty(f[1], f[2], f[3]); else f[0].style.removeProperty(f[1]);
    }
    fixes = [];
  }

  function fix(el, prop, val) {
    fixes.push([el, prop, el.style.getPropertyValue(prop), el.style.getPropertyPriority(prop)]);
    el.style.setProperty(prop, val, 'important');
  }

  // content pushed down by the bar's height: pull it back up while the bar is hidden
  function scan(b, H) {
    var list = document.querySelectorAll('body, body > *, body > * > *, body > * > * > *');
    var moved = false;
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (el === b || b.contains(el) || el.contains(b)) continue;
      var cs = getComputedStyle(el);
      if (Math.abs(parseFloat(cs.paddingTop) - H) < 3) { fix(el, 'padding-top', '0px'); moved = true; }
      else if (Math.abs(parseFloat(cs.marginTop) - H) < 3) { fix(el, 'margin-top', '0px'); moved = true; }
      if ((cs.position === 'sticky' || cs.position === 'fixed') && Math.abs(parseFloat(cs.top) - H) < 3) fix(el, 'top', '0px');
    }
    return moved;
  }

  function set(hide) {
    if (hide) {
      var f = find();
      for (var k = 0; k < f.length; k++) if (bars.indexOf(f[k]) < 0) bars.push(f[k]);
    }
    if (!bars.length) return;
    var ae = document.activeElement;
    if (hide && ae && /INPUT|TEXTAREA|SELECT/.test(ae.tagName)) {
      for (var a = 0; a < bars.length; a++) if (bars[a].contains(ae)) return;
    }
    if (hide === !shown) return;
    shown = !hide;
    quietUntil = Date.now() + 400;
    if (hide) {
      restore();
      for (var i = 0; i < bars.length; i++) {
        var b = bars[i], H = b.getBoundingClientRect().height;
        b.style.setProperty('transition', 'transform .2s ease', 'important');
        fix(b, 'transform', 'translateY(-100%)');
        if (getComputedStyle(b).position === 'sticky') {
          fix(b, 'margin-bottom', (-H) + 'px');
        } else if (H > 20 && scan(b, H) && window.scrollY > 0) {
          window.scrollBy(0, -Math.min(H, window.scrollY));
        }
      }
    } else {
      var had = fixes.some(function (f) { return f[1] === 'padding-top' || f[1] === 'margin-top'; });
      var Hs = bars.length ? bars[0].getBoundingClientRect().height : 0;
      restore();
      if (had && window.scrollY > 0) window.scrollBy(0, Hs);
      clearTimeout(idle);
      idle = setTimeout(function () { set(true); }, 5000);
    }
  }

  window.addEventListener('touchstart', function (e) {
    var t = e.touches && e.touches[0];
    ty = t ? t.clientY : null;
  }, { passive: true, capture: true });
  window.addEventListener('touchmove', function (e) {
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

  setInterval(function () {
    try {
      if (location.href !== url) {
        url = location.href;
        bars = [];
        restore();
        shown = true;
        setTimeout(function () { set(true); }, 700);
      } else if (!shown) {
        var f = find();
        if (f.length) { shown = true; for (var i = 0; i < f.length; i++) if (bars.indexOf(f[i]) < 0) bars.push(f[i]); set(true); }
      }
    } catch (e) {}
  }, 500);
})();
