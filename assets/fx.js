/* v7 motion + chrome layer: intro and page transitions, split headings, nav states, home hero slideshow (pausable),
   hero parallax and light, index preview, footer wordmark fallback, clocks, copy-email, reading progress.
   Native scrolling only (no smooth-scroll library, no scroll-jacking) and the system cursor. Everything degrades to the static page. */
(() => {
  const D = document, H = D.documentElement, B = D.body;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(pointer: fine)').matches;
  const isHome = B.classList.contains('home');
  const ss = (k, v) => { try { return v === undefined ? sessionStorage.getItem(k) : (v === null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v)); } catch (e) { return null; } };

  /* ---------- split text into masked words; screen readers get the plain sentence from a visually hidden copy ---------- */
  D.querySelectorAll('[data-split]').forEach(el => {
    let i = 0;
    const said = (() => { const c = el.cloneNode(true); c.querySelectorAll('[aria-hidden="true"]').forEach(n => n.remove()); return c.textContent.replace(/\s+/g, ' ').trim(); })();
    const wrap = node => {
      [...node.childNodes].forEach(n => {
        if (n.nodeType === 3) {
          const parts = n.textContent.split(/(\s+)/), frag = D.createDocumentFragment();
          parts.forEach(t => {
            if (!t) return;
            if (/^\s+$/.test(t)) { frag.appendChild(D.createTextNode(' ')); return; }
            const w = D.createElement('span'), wi = D.createElement('span');
            w.className = 'w'; wi.className = 'wi'; wi.style.setProperty('--i', i++); wi.textContent = t; w.appendChild(wi); frag.appendChild(w);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1) {
          const w = D.createElement('span'); w.className = 'w'; n.replaceWith(w);
          n.classList.add('wi'); n.style.setProperty('--i', i++); w.appendChild(n);
        }
      });
    };
    wrap(el); el.querySelectorAll('.w').forEach(w => w.setAttribute('aria-hidden', 'true'));
    const sr = D.createElement('span'); sr.className = 'sr-only'; sr.textContent = said; el.appendChild(sr);
  });

  /* ---------- reveal split / fade elements when they enter ---------- */
  const heroEls = [...D.querySelectorAll('.hero [data-split], .hero [data-fade], .p-hero [data-split], .p-hero [data-fade], .about h1')];
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
  D.querySelectorAll('[data-split], [data-fade]').forEach(el => { if (!heroEls.includes(el)) reduce ? el.classList.add('in') : io.observe(el); });
  const playHero = () => heroEls.forEach(el => el.classList.add('in'));

  /* ---------- intro (first visit to home) and page transitions: short, and skippable ---------- */
  const pt = D.querySelector('.pt');
  const fromNav = H.classList.contains('pt-in');
  const heroImg = D.querySelector('.hero .slide.on img, .p-hero img');
  ss('pt', null);
  let lifted = false;
  const lift = () => {
    if (lifted) return; lifted = true;
    if (!pt) { playHero(); return; }
    requestAnimationFrame(() => {
      pt.classList.add('out'); H.classList.remove('pt-in', 'intro');
      setTimeout(playHero, 160);
      setTimeout(() => { pt.classList.remove('out'); pt.innerHTML = ''; }, 760);
    });
  };
  if (reduce || !pt) { lifted = true; playHero(); }
  else if (isHome && !ss('seen')) {
    ss('seen', '1');
    if (heroImg && heroImg.complete && heroImg.naturalWidth && !fromNav) { lifted = true; playHero(); }   // picture already cached: nothing to wait for
    else {
      H.classList.add('intro');
      pt.innerHTML = '<div class="pt-name"><span class="w"><span class="wi">Xinyu Wang</span></span></div><div class="pt-label label">Architecture &amp; urban design</div><div class="pt-count">0</div>';
      const cnt = pt.querySelector('.pt-count'), t0 = performance.now(), MIN = 600; let ready = false;
      const done = () => { ready = true; };
      if (!heroImg || heroImg.complete) done(); else { heroImg.addEventListener('load', done, { once: true }); heroImg.addEventListener('error', done, { once: true }); }
      setTimeout(done, 3000);
      const skip = () => { if (!lifted) { cnt.textContent = '100'; lift(); } };       // any key, click, wheel or touch skips it
      ['keydown', 'pointerdown', 'wheel', 'touchstart'].forEach(t => addEventListener(t, skip, { once: true, passive: true }));
      const tick = now => {
        if (lifted) return;
        const k = Math.min(1, (now - t0) / MIN), v = ready ? k : Math.min(k, .86);
        cnt.textContent = Math.round(v * 100);
        if (v >= 1) setTimeout(lift, 120); else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
  } else if (fromNav) {
    // arrival: lift once the document is parsed and the hero picture is decoded, not on window load
    const wait = heroImg && heroImg.decode ? heroImg.decode().catch(() => {}) : Promise.resolve();
    Promise.race([wait, new Promise(r => setTimeout(r, 700))]).then(() => setTimeout(lift, 30));
  } else { lifted = true; playHero(); }

  addEventListener('pageshow', e => { if (e.persisted && pt) { pt.classList.remove('cover', 'out'); H.classList.remove('pt-in', 'intro'); lifted = true; playHero(); } });
  if (pt && !reduce) D.addEventListener('click', e => {
    const a = e.target.closest('a'); if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (a.target === '_blank' || a.hasAttribute('download') || a.classList.contains('zoom')) return;
    const u = new URL(a.href, location.href);
    if (u.origin !== location.origin || !/\.html$|\/$/.test(u.pathname)) return;
    if (u.pathname === location.pathname) return;          // same page (hash links): let it scroll
    e.preventDefault(); ss('pt', '1');
    pt.innerHTML = ''; pt.classList.add('cover');
    setTimeout(() => { location.href = a.href; }, 300);
  });

  /* ---------- back to top (native scroll; no scroll-jacking) ---------- */
  D.querySelectorAll('[data-top]').forEach(b => b.addEventListener('click', () => scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })));

  /* ---------- nav: solid over content, hide on scroll down (but never while it holds focus); progress bar ---------- */
  const nav = D.querySelector('.nav'), hero = D.querySelector('.hero, .p-hero');
  const bar = B.classList.contains('project') ? B.appendChild(Object.assign(D.createElement('div'), { className: 'progress' })) : null;
  // layout values are measured once (and on resize), never inside the scroll frame
  let lastY = scrollY, ticking = false, heroH = 0, docH = 1, solid = null, hidden = null;
  const plx = [...D.querySelectorAll('[data-parallax]')];
  // contents bar: "stuck" once it has reached its sticky top; only then does it slide up with the hidden nav
  // (in its normal place it must not move over the content above it)
  const toc = D.querySelector('.toc'), tocMark = toc && toc.previousElementSibling && toc.previousElementSibling.classList.contains('toc-mark') ? toc.previousElementSibling : null;
  let tocAt = Infinity, stuck = null;
  const measure = () => {
    heroH = hero ? hero.offsetHeight - 70 : 0; docH = Math.max(1, D.documentElement.scrollHeight - innerHeight);
    if (tocMark) tocAt = tocMark.getBoundingClientRect().top + scrollY - (parseFloat(getComputedStyle(toc).top) || 0);
  };
  const setHidden = h => { if (h !== hidden) { hidden = h; nav.classList.toggle('hide', h); B.classList.toggle('nav-hidden', h); } };
  const onScroll = () => {
    const y = scrollY;
    const s = y > heroH; if (s !== solid) { solid = s; nav.classList.toggle('solid', s); }
    if (tocMark) { const st = y >= tocAt - 1; if (st !== stuck) { stuck = st; toc.classList.toggle('stuck', st); } }
    setHidden(y > lastY && y > Math.max(heroH, 200) && !nav.contains(D.activeElement));
    lastY = y;
    if (bar) bar.style.transform = 'scaleX(' + Math.min(1, y / docH).toFixed(4) + ')';
    if (!reduce && y < heroH + 120) plx.forEach(p => { p.style.transform = 'translate3d(0,' + (y * .28).toFixed(1) + 'px,0)'; });
    ticking = false;
  };
  nav.addEventListener('focusin', () => setHidden(false));
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  addEventListener('resize', () => { measure(); onScroll(); }, { passive: true });
  addEventListener('load', measure); setTimeout(measure, 2500);
  if (window.ResizeObserver) new ResizeObserver(measure).observe(B);
  measure(); onScroll();

  /* ---------- home hero slideshow: progress bars drive the timing; pause button, hover / keyboard focus pause ---------- */
  const hs = D.querySelector('[data-slides]');
  if (hs) {
    const sl = [...hs.querySelectorAll('.slide')], cp = [...hs.querySelectorAll('.cap')], hb = [...hs.querySelectorAll('.hb')];
    const pb = hs.querySelector('.hb-pause'), foot = hs.querySelector('.hero-foot');
    let k = 0, user = false, hover = false, kbd = false; const DUR = 6500;
    hs.style.setProperty('--dur', DUR + 'ms');
    const sync = () => hs.classList.toggle('paused', user || hover || kbd);
    // slides 2+ ship without srcset (they are stacked at opacity 0, so loading="lazy" cannot defer them):
    // a slide gets its real sources when it is shown, and the next one one slide ahead
    const promote = s => {
      if (!s) return;
      s.querySelectorAll('[data-srcset]').forEach(e => {
        if (e.dataset.sizes) e.sizes = e.dataset.sizes;
        e.srcset = e.dataset.srcset; if (e.dataset.src) e.src = e.dataset.src;
        delete e.dataset.srcset; delete e.dataset.sizes; delete e.dataset.src;
      });
    };
    const setOn = (n, on) => {
      const s = sl[n], im = s && s.querySelector('img');
      if (on) { promote(s); promote(sl[(n + 1) % sl.length]); }
      if (s) { s.classList.toggle('on', on); on ? s.removeAttribute('aria-hidden') : s.setAttribute('aria-hidden', 'true'); }
      if (im) im.alt = on ? (im.dataset.alt || '') : '';
      const c = cp[n]; if (c) { c.classList.toggle('on', on); if (on) { c.removeAttribute('tabindex'); c.removeAttribute('aria-hidden'); } else { c.tabIndex = -1; c.setAttribute('aria-hidden', 'true'); } }
      const b = hb[n]; if (b) { b.classList.toggle('on', on); on ? b.setAttribute('aria-current', 'true') : b.removeAttribute('aria-current'); }
    };
    const show = n => {
      const was = k, hadFocus = D.activeElement === cp[was];
      k = (n + sl.length) % sl.length;
      setOn(was, false); void hs.offsetWidth;            // restart the progress fill even for the same slide
      setOn(k, true);
      if (hadFocus && cp[k]) cp[k].focus();
    };
    // the second slide loads once the page (and the first hero picture) has finished loading
    const pre = () => setTimeout(() => promote(sl[1]), 300);
    D.readyState === 'complete' ? pre() : addEventListener('load', pre, { once: true });
    hb.forEach((b, i) => b.addEventListener('click', () => show(i)));
    hs.addEventListener('animationend', e => { if (e.animationName === 'hbfill' && hb[k] && hb[k].contains(e.target) && !hs.classList.contains('paused')) show(k + 1); });
    if (pb) {
      if (reduce || sl.length < 2) pb.hidden = true;
      pb.addEventListener('click', () => { user = !user; pb.setAttribute('aria-pressed', user); if (!user) { hover = false; kbd = false; } sync(); });
    }
    if (foot) { foot.addEventListener('mouseenter', () => { hover = true; sync(); }); foot.addEventListener('mouseleave', () => { hover = false; sync(); }); }
    hs.addEventListener('focusin', e => { kbd = !!(e.target.matches && e.target.matches(':focus-visible')); sync(); });
    hs.addEventListener('focusout', e => { if (!hs.contains(e.relatedTarget)) { kbd = false; sync(); } });
  }

  /* ---------- index list: cursor-following preview ---------- */
  const ix = D.querySelector('[data-preview]');
  if (ix && fine && !reduce) {
    const pv = B.appendChild(Object.assign(D.createElement('div'), { className: 'pv' })); const im = pv.appendChild(D.createElement('img')); im.alt = '';
    let x = 0, y = 0, cx = 0, cy = 0, on = false, run = false;
    // the follow loop only runs while the preview is shown or still settling
    const loop = () => {
      cx += (x - cx) * .16; cy += (y - cy) * .16;
      const rot = Math.max(-8, Math.min(8, (x - cx) * .05));
      pv.style.transform = 'translate3d(' + (cx + 28).toFixed(1) + 'px,' + cy.toFixed(1) + 'px,0) translateY(-50%) rotate(' + rot.toFixed(2) + 'deg) scale(' + (on ? 1 : .85) + ')';
      if (on || Math.abs(x - cx) + Math.abs(y - cy) > .5) requestAnimationFrame(loop); else run = false;
    };
    const kick = () => { if (!run) { run = true; requestAnimationFrame(loop); } };
    ix.querySelectorAll('a[data-img]').forEach(a => {
      const pre = new Image(); pre.src = a.dataset.img;
      a.addEventListener('mouseenter', e => { if (!on && !run) { cx = x = e.clientX; cy = y = e.clientY; } im.src = a.dataset.img; pv.classList.add('on'); on = true; kick(); });
      a.addEventListener('mouseleave', () => { pv.classList.remove('on'); on = false; });
    });
    ix.addEventListener('mousemove', e => { x = e.clientX; y = e.clientY; kick(); }, { passive: true });
  }

  /* ---------- footer wordmark: CSS container units size it; measure only where cqi is unsupported ---------- */
  const fw = D.querySelector('.ft-word');
  if (fw && !(window.CSS && CSS.supports && CSS.supports('width', '1cqi'))) {
    const fit = () => { fw.style.fontSize = '100px'; const s = fw.parentElement.clientWidth - parseFloat(getComputedStyle(fw.parentElement).paddingLeft) * 2; fw.style.fontSize = (100 * s / fw.scrollWidth * .995).toFixed(2) + 'px'; };
    fit(); addEventListener('resize', fit); D.fonts && D.fonts.ready.then(fit);
  }

  /* ---------- hero light: New York time of day sets the tint; the cursor moves a soft sun ---------- */
  const hl = D.querySelector('.hero');
  if (hl && D.querySelector('.hero-tint')) {
    const hf = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' });
    const phases = [[0, 'Night', 'rgba(20,32,74,.30)'], [5.5, 'Dawn', 'rgba(255,150,120,.12)'], [8, 'Morning', 'rgba(255,245,225,.05)'],
      [11, 'Midday', 'rgba(255,255,255,0)'], [15.5, 'Afternoon', 'rgba(255,190,110,.08)'], [17.5, 'Golden hour', 'rgba(255,140,50,.16)'],
      [19.5, 'Dusk', 'rgba(70,50,120,.22)'], [21, 'Night', 'rgba(20,32,74,.30)']];
    const ph = D.querySelector('[data-phase]');
    const setTint = () => {
      const [h, m] = hf.format(new Date()).split(':').map(Number), t = (h % 24) + m / 60;
      let cur = phases[0]; phases.forEach(p => { if (t >= p[0]) cur = p; });
      hl.style.setProperty('--tint', cur[2]); if (ph) ph.textContent = '· ' + cur[1];
    };
    setTint(); setInterval(setTint, 60000);
    const sun = hl.querySelector('.hero-sun'); let sx = 0, sy = 0, sq = false;
    if (sun && fine && !reduce) hl.addEventListener('mousemove', e => {
      sx = e.clientX; sy = e.clientY + scrollY - hl.offsetTop;
      if (!sq) { sq = true; requestAnimationFrame(() => { sun.style.transform = 'translate3d(' + sx + 'px,' + sy + 'px,0)'; sq = false; }); }
    }, { passive: true });
  }

  /* ---------- New York clock ---------- */
  const clocks = D.querySelectorAll('[data-clock]');
  if (clocks.length) {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const t = () => { const s = f.format(new Date()); clocks.forEach(c => { c.textContent = s; }); };
    t(); setInterval(t, 15000);
  }

  /* ---------- copy the email address (not everyone has a mail client) ---------- */
  D.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', () => {
    const box = b.parentElement, st = box.querySelector('[data-copy-status]'), v = b.dataset.copy;
    const say = (label, msg) => { b.textContent = label; if (st) st.textContent = msg; clearTimeout(b._t); b._t = setTimeout(() => { b.textContent = 'Copy email'; if (st) st.textContent = ''; }, 2400); };
    const fallback = () => { const m = box.querySelector('.ft-mail'), r = D.createRange(), s = getSelection(); r.selectNodeContents(m); s.removeAllRanges(); s.addRange(r); say('Selected, press Ctrl+C', 'Email address selected'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(v).then(() => say('Copied', 'Email address copied'), fallback); else fallback();
  }));
})();
