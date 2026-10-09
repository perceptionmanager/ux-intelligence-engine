/* ==========================================================================
   Alex Grinyayev — Portfolio
   Shared vanilla-JS behavior engine. No framework, no build step.
   Pages opt into behaviors by adding the matching data-* attribute/class
   to their markup; see README.md in this repo for the attribute reference.
   ========================================================================== */
 
window.Site = (function () {
  function rand(a, b) { return a + Math.random() * (b - a); }
 
  /* ---- mobile menu overlay ---- */
  function initMobileMenu() {
    var openers = document.querySelectorAll('[data-menu-open]');
    var closers = document.querySelectorAll('[data-menu-close]');
    var overlays = document.querySelectorAll('.overlay[data-menu]');
 
    function open() { overlays.forEach(function (o) { o.classList.add('is-open'); }); }
    function close() { overlays.forEach(function (o) { o.classList.remove('is-open'); }); }
 
    openers.forEach(function (btn) { btn.addEventListener('click', open); });
    closers.forEach(function (btn) { btn.addEventListener('click', close); });
    overlays.forEach(function (o) {
      o.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', close); });
    });
  }
 
  /* ---- scroll progress bar under the nav ---- */
  function initScrollProgress() {
    var bars = document.querySelectorAll('[data-scroll-progress]');
    if (!bars.length) return;
    function update() {
      var h = document.documentElement;
      var max = (h.scrollHeight || document.body.scrollHeight) - h.clientHeight;
      var pct = max > 0 ? Math.min(100, Math.max(0, (window.scrollY / max) * 100)) : 0;
      bars.forEach(function (bar) { bar.style.width = pct + '%'; });
    }
    window.addEventListener('scroll', update, { passive: true });
    update();
  }
 
  /* ---- decorative blob drift ----
     A "blob group" is a wrapper carrying data-tx-range / data-ty-range /
     data-scale-min / data-scale-max / data-blur-min / data-blur-max /
     data-op-min / data-op-max / data-dur-min / data-dur-max, containing one
     or more [data-blob-target] elements (a .grain-clear mask + a .blob glow)
     that share one randomized drift state, matching the original design's
     per-page tuning. Exposes the live state on the group element so
     page-specific scripts (e.g. color-interpolation effects) can read it. */
  function initBlobDrift() {
    document.querySelectorAll('[data-blob-group]').forEach(function (group) {
      var cfg = {
        tx: [-num(group, 'txRange', 150), num(group, 'txRange', 150)],
        ty: [-num(group, 'tyRange', 140), num(group, 'tyRange', 140)],
        scale: [num(group, 'scaleMin', 0.55), num(group, 'scaleMax', 1.7)],
        blur: [num(group, 'blurMin', 30), num(group, 'blurMax', 130)],
        op: [num(group, 'opMin', 0.14), num(group, 'opMax', 0.6)],
        dur: [num(group, 'durMin', 4), num(group, 'durMax', 8)]
      };
      var targets = group.querySelectorAll('[data-blob-target]');
      group.blobState = { tx: 0, ty: 0, scale: 1, blur: cfg.blur[1], op: cfg.op[0], dur: cfg.dur[0] };
 
      function tick() {
        var state = {
          tx: rand(cfg.tx[0], cfg.tx[1]),
          ty: rand(cfg.ty[0], cfg.ty[1]),
          scale: rand(cfg.scale[0], cfg.scale[1]),
          blur: rand(cfg.blur[0], cfg.blur[1]),
          op: rand(cfg.op[0], cfg.op[1]),
          dur: rand(cfg.dur[0], cfg.dur[1])
        };
        group.blobState = state;
        targets.forEach(function (el) {
          el.style.transition = 'transform ' + state.dur + 's ease-in-out, filter ' + state.dur + 's ease-in-out, opacity ' + state.dur + 's ease-in-out';
          el.style.transform = 'translate(' + state.tx + 'px,' + state.ty + 'px) scale(' + state.scale + ')';
          el.style.opacity = state.op;
          if (el.classList.contains('blob')) el.style.filter = 'blur(' + state.blur + 'px)';
        });
        group._blobTimer = setTimeout(tick, state.dur * 1000);
      }
      tick();
    });
 
    function num(el, key, fallback) {
      var v = el.dataset[key];
      return v === undefined ? fallback : Number(v);
    }
  }
 
  /* ---- magnetic buttons (desktop / mouse only) ---- */
  function initMagnetic() {
    if (window.matchMedia('(hover: none)').matches) return;
    document.querySelectorAll('[data-magnetic]').forEach(function (el) {
      el.addEventListener('mousemove', function (e) {
        var r = el.getBoundingClientRect();
        var x = (e.clientX - r.left - r.width / 2) * 0.3;
        var y = (e.clientY - r.top - r.height / 2) * 0.3;
        el.style.transform = 'translate(' + x + 'px,' + y + 'px)';
      });
      el.addEventListener('mouseleave', function () { el.style.transform = 'translate(0,0)'; });
    });
  }
 
  /* ---- color-interpolation helper, used by pages that fade a value's
     color based on scroll/blob depth (e.g. stat callouts) ---- */
  function mixColor(fromRGB, toRGB, t) {
    t = Math.min(1, Math.max(0, t));
    var r = Math.round(fromRGB[0] + (toRGB[0] - fromRGB[0]) * t);
    var g = Math.round(fromRGB[1] + (toRGB[1] - fromRGB[1]) * t);
    var b = Math.round(fromRGB[2] + (toRGB[2] - fromRGB[2]) * t);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }
 
  /* ---- mailto contact fallback ----
     A mailto: link silently does nothing on a machine with no default mail
     client configured (common wherever email lives entirely in a browser —
     exactly the laptops hiring teams tend to use). This copies the address
     to the clipboard on click, alongside the normal mailto: behavior, and
     shows a small confirmation right next to the control that was clicked
     (to its right when there is room, below it in the header and on narrow
     screens) so the person always leaves with the address ready to paste. */
  function initMailtoCopy() {
    var links = document.querySelectorAll('a[href^="mailto:"]');
    if (!links.length) return;

    var tip = document.createElement('div');
    tip.className = 'copy-tip';
    tip.setAttribute('role', 'status');
    tip.setAttribute('aria-live', 'polite');
    document.body.appendChild(tip);
    var CHECK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

    function place(anchor) {
      var GAP = 12, M = 8;
      var r = anchor.getBoundingClientRect();
      var w = tip.offsetWidth, h = tip.offsetHeight;
      var vw = document.documentElement.clientWidth, vh = window.innerHeight;
      var inNav = !!anchor.closest('.nav-links');
      var x, y;
      if (!inNav && r.right + GAP + w <= vw - M) {            // beside, to the right
        x = r.right + GAP; y = r.top + (r.height - h) / 2;
      } else if (!inNav && r.left - GAP - w >= M) {           // beside, to the left
        x = r.left - GAP - w; y = r.top + (r.height - h) / 2;
      } else {                                                // under (or over) the control
        x = inNav ? r.right - w : r.left + (r.width - w) / 2;
        y = (r.bottom + GAP + h <= vh - M) ? r.bottom + GAP : r.top - GAP - h;
      }
      tip.style.left = Math.round(Math.min(Math.max(M, x), vw - w - M)) + 'px';
      tip.style.top = Math.round(Math.max(M, y)) + 'px';
    }

    function hide() { tip.classList.remove('is-visible'); }

    function show(anchor, address) {
      tip.innerHTML = CHECK + '<span>Email copied</span>';
      tip.title = address;
      tip.classList.remove('is-visible');
      place(anchor);
      void tip.offsetWidth; // restart the transition on repeated clicks
      tip.classList.add('is-visible');
      clearTimeout(tip._hideTimer);
      tip._hideTimer = setTimeout(hide, 2400);
    }

    window.addEventListener('scroll', hide, { passive: true });
    window.addEventListener('resize', hide);

    links.forEach(function (link) {
      link.addEventListener('click', function () {
        var address = link.href.replace(/^mailto:/, '').split('?')[0];
        if (!address || !navigator.clipboard || !navigator.clipboard.writeText) return;
        navigator.clipboard.writeText(address).then(function () {
          show(link, address);
        }).catch(function () {
          // Clipboard blocked (e.g. insecure context) — mailto: still fires normally.
        });
      });
    });
  }

  /* ---- backdrop line pattern ----
     An engraved horizontal line pattern that exists only inside the lit areas of the decorative backdrop: the two
     drifting spotlights (.blob.coral / .blob.cyan) and the coloured .aura behind the page title. It is added to every
     page that has the backdrop; nothing to put in the HTML. Opt a page out with <body data-backdrop-lines="off">.
     - Spotlight position, size and brightness are read live from the animated .blob elements every frame, and the
       aura's rotation from its CSS animation, so the lines follow the light as it drifts, grows, fades and turns.
     - Visibility = proximity (strongest at a light's centre, fading to nothing at its edge) x intensity (the blob's
       live opacity). Chromatic split: a coral copy and a cyan copy of the lines, offset by brightness and speed.
     - The canvas is styled by .spotlight-lines in base.css. If that rule is not there yet (stale cached stylesheet),
       the effect simply does not start, so a half-updated deploy can never show an unstyled canvas.
     Decorative only: aria-hidden, paused when the tab is hidden or the hero is scrolled away, still frame for
     reduced motion. */
  function initBackdropLines() {
    var aura = document.querySelector('.aura');
    if (!aura || !aura.parentNode || document.body.getAttribute('data-backdrop-lines') === 'off') return;
    var canvas = document.createElement('canvas');
    canvas.className = 'spotlight-lines';
    canvas.setAttribute('aria-hidden', 'true');
    aura.parentNode.insertBefore(canvas, aura.nextSibling);
    if (!canvas.getContext || getComputedStyle(canvas).position !== 'absolute') { canvas.remove(); return; }

    var ctx = canvas.getContext('2d');
    var blobs = [
      { el: document.querySelector('.blob.coral'), x: null, y: null, vx: 0, vy: 0 },
      { el: document.querySelector('.blob.cyan'), x: null, y: null, vx: 0, vy: 0 }
    ].filter(function (b) { return b.el; });
    var CORAL = 'rgb(255,106,76)', CYAN = 'rgb(69,224,255)';
    var PITCH = 4;          // px between lines
    var THICK = 1.5;        // px line thickness
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var W = 0, H = 0, last = 0, raf = 0, timer = 0;
    var off = document.createElement('canvas'), octx = off.getContext('2d');
    var tmp = document.createElement('canvas'), tctx = tmp.getContext('2d');

    function resize() {
      var r = canvas.getBoundingClientRect();
      W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    }
    function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
    function grow(c, n) { if (c.width < n) c.width = c.height = n; }   // scratch canvases only ever grow, so no per-frame reallocation
    function auraAngle() {
      var a = aura.getAnimations ? aura.getAnimations()[0] : null;
      var t = a && a.currentTime != null ? Number(a.currentTime) : performance.now();
      return ((t % 34000) / 34000) * Math.PI * 2;
    }

    function frame(now) {
      var dt = last ? Math.max(1, now - last) / 1000 : 0.016; last = now;
      var origin = canvas.getBoundingClientRect();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = 'lighter';

      // the coloured aura behind the title: same pattern, lines take the aura's rotating coral/cyan colours
      if (aura.offsetWidth > 4) {
        var arect = aura.getBoundingClientRect();                // centre is unaffected by the aura's rotation
        var ar = aura.offsetWidth / 2 * 0.9;
        var acx = arect.left + arect.width / 2 - origin.left, acy = arect.top + arect.height / 2 - origin.top;
        if (!(acy + ar < 0 || acy - ar > H)) {
          var asize = Math.ceil(ar * 2), apx = Math.round(asize * dpr), AI = 0.85, aoy = 1.2 + 2.2 * AI;
          grow(off, apx); grow(tmp, apx);
          octx.setTransform(1, 0, 0, 1, 0, 0); octx.globalCompositeOperation = 'source-over'; octx.clearRect(0, 0, off.width, off.height);
          octx.setTransform(dpr, 0, 0, dpr, 0, 0);
          var atop = acy - ar, ay0 = Math.floor(atop / PITCH) * PITCH, ang = auraAngle() - Math.PI / 2;
          [[CORAL, -aoy, [1, 0.15, 1, 1]], [CYAN, aoy, [0.15, 1, 0.15, 0.15]]].forEach(function (L) {
            tctx.setTransform(1, 0, 0, 1, 0, 0); tctx.globalCompositeOperation = 'source-over'; tctx.clearRect(0, 0, tmp.width, tmp.height);
            tctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            tctx.fillStyle = L[0];
            for (var y = ay0; y < atop + asize; y += PITCH) tctx.fillRect(0, y - atop + L[1], asize, THICK);
            if (tctx.createConicGradient) {          // keep this colour only where the aura is that colour
              var cg = tctx.createConicGradient(ang, ar, ar), w = L[2];
              cg.addColorStop(0, 'rgba(0,0,0,' + w[0] + ')'); cg.addColorStop(1 / 3, 'rgba(0,0,0,' + w[1] + ')');
              cg.addColorStop(2 / 3, 'rgba(0,0,0,' + w[2] + ')'); cg.addColorStop(1, 'rgba(0,0,0,' + w[3] + ')');
              tctx.globalCompositeOperation = 'destination-in'; tctx.fillStyle = cg; tctx.fillRect(0, 0, asize, asize);
            }
            octx.setTransform(1, 0, 0, 1, 0, 0); octx.globalCompositeOperation = 'lighter'; octx.drawImage(tmp, 0, 0);
            octx.setTransform(dpr, 0, 0, dpr, 0, 0);
          });
          octx.globalCompositeOperation = 'destination-in';
          var ag = octx.createRadialGradient(ar, ar, 0, ar, ar, ar);
          ag.addColorStop(0, 'rgba(0,0,0,' + AI + ')'); ag.addColorStop(0.35, 'rgba(0,0,0,' + (AI * 0.7) + ')');
          ag.addColorStop(0.7, 'rgba(0,0,0,' + (AI * 0.2) + ')'); ag.addColorStop(1, 'rgba(0,0,0,0)');
          octx.fillStyle = ag; octx.fillRect(0, 0, asize, asize);
          ctx.drawImage(off, 0, 0, apx, apx, acx - ar, acy - ar, asize, asize);
        }
      }

      // the spotlights: proximity falloff x intensity, with a chromatic split that grows with brightness and speed
      blobs.forEach(function (b) {
        var r = b.el.getBoundingClientRect();
        if (r.width < 4) return;                                // spotlight hidden at this breakpoint
        var cx = r.left + r.width / 2 - origin.left, cy = r.top + r.height / 2 - origin.top;
        var vx = b.x === null ? 0 : (cx - b.x) / dt, vy = b.y === null ? 0 : (cy - b.y) / dt;
        b.vx += (vx - b.vx) * 0.08; b.vy += (vy - b.vy) * 0.08;   // smoothed velocity, px/s
        b.x = cx; b.y = cy;
        var op = parseFloat(getComputedStyle(b.el).opacity) || 0;
        var I = clamp((op - 0.08) / 0.5, 0.12, 1);             // intensity from the blob's live opacity
        var R = Math.min(r.width * 0.72, 430);                 // reach of the lines
        var size = Math.ceil(R * 2);
        if (cy + R < 0 || cy - R > H) return;
        var oy = 1.2 + 2.2 * I + Math.min(4, Math.abs(b.vy) * 0.05);
        var ox = clamp(b.vx * 0.05, -4, 4);
        var px = Math.round(size * dpr);
        grow(off, px);
        octx.setTransform(1, 0, 0, 1, 0, 0); octx.globalCompositeOperation = 'source-over'; octx.clearRect(0, 0, off.width, off.height);
        octx.setTransform(dpr, 0, 0, dpr, 0, 0);
        octx.globalCompositeOperation = 'lighter';
        var top = cy - R, y0 = Math.floor(top / PITCH) * PITCH;  // lines stay locked to the page, not to the spotlight
        function lines(color, dx, dy) {
          octx.fillStyle = color;
          for (var y = y0; y < top + size; y += PITCH) octx.fillRect(dx, y - top + dy, size, THICK);
        }
        lines(CORAL, ox, -oy);
        lines(CYAN, -ox, oy);
        octx.globalCompositeOperation = 'destination-in';
        var g = octx.createRadialGradient(R, R, 0, R, R, R);
        g.addColorStop(0, 'rgba(0,0,0,' + I + ')');
        g.addColorStop(0.35, 'rgba(0,0,0,' + (I * 0.7) + ')');
        g.addColorStop(0.7, 'rgba(0,0,0,' + (I * 0.2) + ')');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        octx.fillStyle = g; octx.fillRect(0, 0, size, size);
        ctx.drawImage(off, 0, 0, px, px, cx - R, cy - R, size, size);
      });
      ctx.globalCompositeOperation = 'source-over';
      if (!reduced) raf = requestAnimationFrame(frame);
    }

    function start() {
      cancelAnimationFrame(raf); clearInterval(timer);
      if (reduced) { frame(performance.now()); timer = setInterval(function () { frame(performance.now()); }, 1500); }
      else raf = requestAnimationFrame(frame);
    }
    // pause while the tab is hidden or the page is scrolled well past the hero (the lit areas live at the top)
    var running = true;
    function gate() {
      var v = !document.hidden && window.scrollY < 1400;
      if (v && !running) { running = true; last = 0; start(); }
      else if (!v && running) { running = false; cancelAnimationFrame(raf); clearInterval(timer); }
    }
    document.addEventListener('visibilitychange', gate);
    window.addEventListener('scroll', gate, { passive: true });
    window.addEventListener('resize', resize);
    resize(); start();
  }

  function init() {
    initMobileMenu();
    initScrollProgress();
    initBlobDrift();
    initMagnetic();
    initMailtoCopy();
    initBackdropLines();
  }
 
  return { init: init, rand: rand, mixColor: mixColor };
})();
 
document.addEventListener('DOMContentLoaded', function () { window.Site.init(); });
