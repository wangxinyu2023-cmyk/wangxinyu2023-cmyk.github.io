/* v6 motion layer: intro + page transitions, smooth scroll, split text, nav states, hero slideshow,
   parallax, index preview, custom cursor, clocks, reading progress. Everything degrades to the static page. */
(() => {
  const D = document, H = D.documentElement, B = D.body;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(pointer: fine)').matches;
  const isHome = B.classList.contains('home');
  const ss = (k, v) => { try { return v === undefined ? sessionStorage.getItem(k) : (v === null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v)); } catch (e) { return null; } };

  /* ---------- split text into masked words ---------- */
  D.querySelectorAll('[data-split]').forEach(el => {
    let i = 0;
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
    el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
    wrap(el); el.querySelectorAll('.w').forEach(w => w.setAttribute('aria-hidden', 'true'));
  });

  /* ---------- reveal split / fade elements when they enter ---------- */
  const heroEls = [...D.querySelectorAll('.hero [data-split], .hero [data-fade], .p-hero [data-split], .p-hero [data-fade], .about h1')];
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
  D.querySelectorAll('[data-split], [data-fade]').forEach(el => { if (!heroEls.includes(el)) reduce ? el.classList.add('in') : io.observe(el); });
  const playHero = () => heroEls.forEach(el => el.classList.add('in'));

  /* ---------- intro (first visit to home) and page transitions ---------- */
  const pt = D.querySelector('.pt');
  const fromNav = H.classList.contains('pt-in');
  ss('pt', null);
  const lift = () => {
    if (!pt) { playHero(); return; }
    requestAnimationFrame(() => {
      pt.classList.add('out'); H.classList.remove('pt-in', 'intro');
      setTimeout(playHero, 260);
      setTimeout(() => { pt.classList.remove('out'); pt.innerHTML = ''; }, 1100);
    });
  };
  if (reduce || !pt) playHero();
  else if (isHome && !ss('seen')) {
    ss('seen', '1'); H.classList.add('intro');
    pt.innerHTML = '<div class="pt-name"><span class="w"><span class="wi">Xinyu Wang</span></span></div><div class="pt-label label">Architecture &amp; urban design</div><div class="pt-count">0</div>';
    const cnt = pt.querySelector('.pt-count'), first = D.querySelector('.hero img');
    const t0 = performance.now(), MIN = 1500; let ready = false;
    const done = () => { ready = true; };
    if (!first || first.complete) done(); else { first.addEventListener('load', done, { once: true }); first.addEventListener('error', done, { once: true }); }
    setTimeout(done, 4000);
    const tick = now => {
      const k = Math.min(1, (now - t0) / MIN), v = ready ? k : Math.min(k, .86);
      cnt.textContent = Math.round(v * 100);
      if (v >= 1) setTimeout(lift, 180); else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  } else if (fromNav) {
    const go = () => setTimeout(lift, 60);
    D.readyState === 'complete' ? go() : addEventListener('load', go, { once: true });
    setTimeout(lift, 1800);
  } else playHero();

  addEventListener('pageshow', e => { if (e.persisted && pt) { pt.classList.remove('cover', 'out'); H.classList.remove('pt-in', 'intro'); playHero(); } });
  if (pt && !reduce) D.addEventListener('click', e => {
    const a = e.target.closest('a'); if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (a.target === '_blank' || a.hasAttribute('download') || a.classList.contains('zoom')) return;
    const u = new URL(a.href, location.href);
    if (u.origin !== location.origin || !/\.html$|\/$/.test(u.pathname)) return;
    if (u.pathname === location.pathname) return;          // same page (hash links) — let it scroll
    e.preventDefault(); ss('pt', '1');
    pt.innerHTML = ''; pt.classList.add('cover');
    setTimeout(() => { location.href = a.href; }, 760);
  });

  /* ---------- back to top (native smooth scroll; no scroll-jacking) ---------- */
  D.querySelectorAll('[data-top]').forEach(b => b.addEventListener('click', () => scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })));

  /* ---------- nav: solid over content, hide on scroll down; progress bar ---------- */
  const nav = D.querySelector('.nav'), hero = D.querySelector('.hero, .p-hero');
  const bar = B.classList.contains('project') ? B.appendChild(Object.assign(D.createElement('div'), { className: 'progress' })) : null;
  // layout values are measured once (and on resize), never inside the scroll frame
  let lastY = scrollY, ticking = false, heroH = 0, docH = 1, solid = null, hidden = null;
  const plx = [...D.querySelectorAll('[data-parallax]')];
  const measure = () => { heroH = hero ? hero.offsetHeight - 70 : 0; docH = Math.max(1, D.documentElement.scrollHeight - innerHeight); };
  const onScroll = () => {
    const y = scrollY;
    const s = y > heroH; if (s !== solid) { solid = s; nav.classList.toggle('solid', s); }
    const h = y > lastY && y > Math.max(heroH, 200);
    if (h !== hidden) { hidden = h; nav.classList.toggle('hide', h); B.classList.toggle('nav-hidden', h); }
    lastY = y;
    if (bar) bar.style.transform = 'scaleX(' + Math.min(1, y / docH).toFixed(4) + ')';
    if (!reduce && y < heroH + 120) plx.forEach(p => { p.style.transform = 'translate3d(0,' + (y * .28).toFixed(1) + 'px,0)'; });
    ticking = false;
  };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  addEventListener('resize', () => { measure(); onScroll(); }, { passive: true });
  addEventListener('load', measure); setTimeout(measure, 2500);
  measure(); onScroll();

  /* ---------- home hero slideshow with progress bars ---------- */
  const hs = D.querySelector('[data-slides]');
  if (hs) {
    const sl = [...hs.querySelectorAll('.slide')], cp = [...hs.querySelectorAll('.cap')], hb = [...hs.querySelectorAll('.hb')];
    let k = 0, timer = null; const DUR = 6500;
    const show = n => {
      [sl, cp, hb].forEach(a => a[k] && a[k].classList.remove('on'));
      k = (n + sl.length) % sl.length;
      hb.forEach(b => { b.classList.remove('on'); void b.offsetWidth; });
      [sl, cp, hb].forEach(a => a[k] && a[k].classList.add('on'));
      schedule();
    };
    const schedule = () => { clearTimeout(timer); if (!reduce && sl.length > 1) timer = setTimeout(() => { if (!hs.classList.contains('paused')) show(k + 1); else schedule(); }, DUR); };
    hb.forEach((b, i) => b.addEventListener('click', () => show(i)));
    hs.style.setProperty('--dur', DUR + 'ms');
    if (sl.length > 1) schedule();
    D.addEventListener('visibilitychange', () => { if (!D.hidden) schedule(); });
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

  /* ---------- footer wordmark: fit exactly to the column width ---------- */
  const fw = D.querySelector('.ft-word');
  if (fw) {
    const fit = () => { fw.style.fontSize = '100px'; const s = fw.parentElement.clientWidth - parseFloat(getComputedStyle(fw.parentElement).paddingLeft) * 2; fw.style.fontSize = (100 * s / fw.scrollWidth * .995).toFixed(2) + 'px'; };
    fit(); addEventListener('resize', fit); D.fonts && D.fonts.ready.then(fit);
  }

  /* ---------- hero light: New York time of day sets the tint; the cursor moves a soft sun ---------- */
  const hl = D.querySelector('.hero');
  if (hl && D.querySelector('.hero-tint')) {
    const hf = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: 'numeric', hour12: false });
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

  /* ---------- New York clock ---------- */  const clocks = D.querySelectorAll('[data-clock]');
  if (clocks.length) {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false });
    const t = () => { const s = f.format(new Date()); clocks.forEach(c => { c.textContent = s; }); };
    t(); setInterval(t, 15000);
  }
})();
