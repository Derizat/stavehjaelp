// fx.js — visual effects for Stavehjælpen.
// Loaded after sfx.js, before app.js. Exposes a global FX object.
// All effects are fire-and-forget: spawned elements remove themselves.
// Respects prefers-reduced-motion (particles/confetti skipped).
(function () {
  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var liveCount = 0;
  var MAX_LIVE = 30; // cap concurrent effect elements (older iPads)

  var COLORS = ['#f5a623', '#22d3a0', '#7c3aed', '#f43f5e', '#0ea5e9', '#fde047'];

  function spawn(cls, styles, ttl) {
    if (liveCount >= MAX_LIVE) return null;
    var el = document.createElement('div');
    el.className = cls;
    for (var k in styles) {
      if (k.indexOf('--') === 0) el.style.setProperty(k, styles[k]);
      else el.style[k] = styles[k];
    }
    document.body.appendChild(el);
    liveCount++;
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
      liveCount--;
    }, ttl);
    return el;
  }

  function burst(el, count) {
    if (reduceMotion || !el) return;
    var r = el.getBoundingClientRect();
    if (!r.width && !r.height) return; // element not visible
    var cx = r.left + r.width / 2;
    var cy = r.top + r.height / 2;
    count = count || 12;
    for (var i = 0; i < count; i++) {
      var ang = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      var dist = 40 + Math.random() * 50;
      spawn('fx-particle', {
        left: cx + 'px',
        top: cy + 'px',
        background: COLORS[i % COLORS.length],
        '--dx': (Math.cos(ang) * dist) + 'px',
        '--dy': (Math.sin(ang) * dist) + 'px'
      }, 700);
    }
  }

  function damageNumber(el, n) {
    if (!el || !n) return;
    var r = el.getBoundingClientRect();
    if (!r.width && !r.height) return; // element not visible
    var d = spawn('fx-damage', {
      left: (r.left + r.width / 2) + 'px',
      top: r.top + 'px'
    }, 900);
    if (d) d.textContent = '-' + n;
  }

  function confetti(container) {
    if (reduceMotion) return;
    var r = (container || document.body).getBoundingClientRect();
    for (var i = 0; i < 24; i++) {
      spawn('fx-confetti', {
        left: (r.left + Math.random() * r.width) + 'px',
        top: (r.top - 10) + 'px',
        background: COLORS[i % COLORS.length],
        animationDelay: (Math.random() * 0.6) + 's',
        animationDuration: (1.6 + Math.random()) + 's'
      }, 2800);
    }
  }

  function slotPop(el) {
    if (!el) return;
    el.classList.remove('fx-pop');
    void el.offsetWidth; // restart animation
    el.classList.add('fx-pop');
  }

  // Combo flame badge — a single fixed element managed by fx.js.
  var lastCombo = 0;
  function ensureBadge() {
    var b = document.getElementById('fxComboBadge');
    if (!b) {
      b = document.createElement('div');
      b.id = 'fxComboBadge';
      b.className = 'fx-combo-badge hidden';
      document.body.appendChild(b);
    }
    return b;
  }
  var combo = {
    set: function (n) {
      var b = ensureBadge();
      if (n >= 2) {
        b.textContent = '🔥 ×' + n;
        b.classList.remove('hidden');
        b.classList.remove('fx-pop');
        void b.offsetWidth;
        b.classList.add('fx-pop');
        if (n > lastCombo && window.SFX) SFX.play('combo', n);
      } else {
        b.classList.add('hidden');
      }
      lastCombo = n;
    },
    reset: function () { combo.set(0); }
  };

  window.FX = {
    burst: burst,
    damageNumber: damageNumber,
    confetti: confetti,
    slotPop: slotPop,
    combo: combo
  };
})();
