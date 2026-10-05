(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // reveal on scroll
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -6% 0px' });
  document.querySelectorAll('.reveal').forEach(el => reduce ? el.classList.add('in') : io.observe(el));

  // fade out the blur placeholder once the real image has loaded
  document.querySelectorAll('img[style*="background-image"]').forEach(im => {
    const done = () => im.classList.add('loaded');
    im.complete ? done() : im.addEventListener('load', done, { once: true });
  });

  // home hero slideshow lives in fx.js (progress bars, pause on hover)

  // category filter on the home page
  document.querySelectorAll('.filters button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.filters button').forEach(x => x.classList.toggle('on', x === b));
    document.querySelectorAll('.card').forEach(w => { w.hidden = !(b.dataset.f === 'all' || w.dataset.cat === b.dataset.f); });
  }));

  // contents bar: highlight the section in view
  const tocLinks = [...document.querySelectorAll('.toc a')];
  if (tocLinks.length) {
    const map = new Map(tocLinks.map(a => [a.getAttribute('href').slice(1), a]));
    const so = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { tocLinks.forEach(a => a.classList.remove('on')); const a = map.get(e.target.id); if (a) { a.classList.add('on'); a.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } } }), { rootMargin: '-40% 0px -55% 0px' });
    map.forEach((a, id) => { const el = document.getElementById(id); if (el) so.observe(el); });
  }

  // exploded model: scroll progress drives plate separation
  document.querySelectorAll('[data-explode]').forEach(sec => {
    const plates = [...sec.querySelectorAll('img.plate')], guides = sec.querySelector('img.guides');
    const labels = [...sec.querySelectorAll('.ex-labels li')], bar = sec.querySelector('.ex-bar span'), stage = sec.querySelector('.ex-stage');
    const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const draw = () => {
      const r = sec.getBoundingClientRect(), span = r.height - innerHeight;
      let p = Math.min(1, Math.max(0, -r.top / Math.max(1, span)));
      if (reduce) p = 1;
      const fp = new URLSearchParams(location.search).get('explode'); if (fp !== null) p = +fp;
      const e = ease(Math.min(1, Math.max(0, (p - .08) / .8)));
      const h = stage.clientHeight;
      plates.forEach(im => { im.style.transform = 'translateY(' + ((1 - e) * parseFloat(im.dataset.off) / 100 * h).toFixed(1) + 'px)'; });
      guides.style.opacity = Math.max(0, (e - .55) / .45).toFixed(3);
      labels.forEach((li, i) => li.classList.toggle('on', e > .6 + i * .05));
      bar.style.width = (p * 100).toFixed(1) + '%';
    };
    draw(); addEventListener('scroll', () => requestAnimationFrame(draw), { passive: true }); addEventListener('resize', draw);
  });
  // gallery lightbox: prev/next, keyboard, swipe, counter, shareable #image-N
  const links = [...document.querySelectorAll('a.zoom')];
  if (!links.length) return;
  const lb = document.createElement('div');
  lb.className = 'lb'; lb.setAttribute('role', 'dialog'); lb.setAttribute('aria-modal', 'true'); lb.setAttribute('aria-label', 'Image viewer');
  lb.innerHTML = '<div class="lb-view"><img alt="" draggable="false"></div><button class="lb-prev" aria-label="Previous image">&larr;</button><button class="lb-next" aria-label="Next image">&rarr;</button>'
    + '<button class="lb-close" aria-label="Close">&times;</button>'
    + '<div class="lb-zoom"><button class="lb-out" aria-label="Zoom out">&minus;</button><span class="lb-pct">100%</span><button class="lb-in" aria-label="Zoom in">+</button><button class="lb-fit">Fit</button></div>'
    + '<div class="lb-cap"><span class="lb-n"></span><span class="lb-t"></span><span class="lb-hint">Scroll, pinch or double-click to zoom &middot; drag to pan</span></div>';
  document.body.appendChild(lb);
  const view = lb.querySelector('.lb-view'), im = view.querySelector('img'), pct = lb.querySelector('.lb-pct');
  let cur = -1, lastFocus = null;
  // deep zoom state: scale s (1 = image pixel per CSS px), translation tx/ty of the image's top-left corner
  let s = 1, tx = 0, ty = 0, fitS = 1, iw = 1, ih = 1;
  const maxS = () => Math.max(1, fitS * 2.5);
  const clampPan = () => {
    const vw = view.clientWidth, vh = view.clientHeight, w = iw * s, h = ih * s;
    tx = w <= vw ? (vw - w) / 2 : Math.min(0, Math.max(vw - w, tx));
    ty = h <= vh ? (vh - h) / 2 : Math.min(0, Math.max(vh - h, ty));
  };
  const apply = (anim) => {
    clampPan();
    im.style.transition = anim ? 'transform .45s cubic-bezier(.19,1,.22,1)' : 'none';
    im.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + s + ')';
    pct.textContent = Math.round(s * 100) + '%';
    view.classList.toggle('zoomed', s > fitS * 1.01);
  };
  const fit = (anim) => { fitS = Math.min(view.clientWidth / iw, view.clientHeight / ih, 1); s = fitS; tx = ty = 0; apply(anim); };
  const zoomAt = (ns, cx, cy, anim) => {
    ns = Math.max(fitS, Math.min(maxS(), ns));
    const r = view.getBoundingClientRect(), px = cx - r.left, py = cy - r.top;
    tx = px - (px - tx) * ns / s; ty = py - (py - ty) * ns / s; s = ns; apply(anim);
  };
  const onLoad = () => { iw = im.naturalWidth || 1; ih = im.naturalHeight || 1; im.style.width = iw + 'px'; im.style.height = ih + 'px'; fit(false); };
  im.addEventListener('load', onLoad);
  addEventListener('resize', () => { if (lb.classList.contains('open')) fit(false); });
  const show = i => {
    cur = (i + links.length) % links.length; const a = links[cur];
    im.src = a.href; im.alt = a.dataset.caption || '';
    if (im.complete && im.naturalWidth) onLoad();
    lb.querySelector('.lb-n').textContent = String(cur + 1).padStart(2, '0') + ' / ' + String(links.length).padStart(2, '0');
    lb.querySelector('.lb-t').textContent = a.dataset.caption || '';
    history.replaceState(null, '', '#image-' + (cur + 1));
  };
  const open = i => { lastFocus = document.activeElement; lb.classList.add('open'); show(i); document.body.style.overflow = 'hidden'; lb.querySelector('.lb-close').focus(); };
  const close = () => { lb.classList.remove('open'); document.body.style.overflow = ''; history.replaceState(null, '', location.pathname); lastFocus && lastFocus.focus(); };
  links.forEach((a, i) => a.addEventListener('click', e => { e.preventDefault(); open(i); }));
  lb.querySelector('.lb-prev').addEventListener('click', e => { e.stopPropagation(); show(cur - 1); });
  lb.querySelector('.lb-next').addEventListener('click', e => { e.stopPropagation(); show(cur + 1); });
  lb.querySelector('.lb-close').addEventListener('click', close);
  const mid = () => { const r = view.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  lb.querySelector('.lb-in').addEventListener('click', () => zoomAt(s * 1.6, ...mid(), true));
  lb.querySelector('.lb-out').addEventListener('click', () => zoomAt(s / 1.6, ...mid(), true));
  lb.querySelector('.lb-fit').addEventListener('click', () => fit(true));
  view.addEventListener('wheel', e => { e.preventDefault(); zoomAt(s * Math.exp(-e.deltaY * .0018), e.clientX, e.clientY, false); }, { passive: false });
  view.addEventListener('dblclick', e => { s > fitS * 1.01 ? fit(true) : zoomAt(Math.min(1, maxS()) > fitS * 1.3 ? 1 : fitS * 2.5, e.clientX, e.clientY, true); });
  // pointer drag to pan, two pointers to pinch, horizontal swipe at fit size to change image; click on empty area closes
  const pts = new Map(); let pinch0 = null, drag = null, moved = false;
  view.addEventListener('pointerdown', e => {
    view.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); moved = false;
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), s }; drag = null; }
    else drag = { x: e.clientX, y: e.clientY, tx, ty };
  });
  view.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch0 && pts.size === 2) { const [a, b] = [...pts.values()]; zoomAt(pinch0.s * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch0.d, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, false); moved = true; return; }
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
    if (s > fitS * 1.01) { tx = drag.tx + dx; ty = drag.ty + dy; apply(false); }
  });
  const up = e => {
    if (!pts.has(e.pointerId)) return; pts.delete(e.pointerId);
    if (pts.size < 2) pinch0 = null;
    if (drag && s <= fitS * 1.01) {
      const dx = e.clientX - drag.x;
      if (Math.abs(dx) > 60) show(cur + (dx < 0 ? 1 : -1));
      else if (!moved && e.target === view) close();
    }
    drag = null;
  };
  view.addEventListener('pointerup', up); view.addEventListener('pointercancel', up);
  document.addEventListener('keydown', e => {
    if (!lb.classList.contains('open')) return;
    if (e.key === 'Escape') close(); else if (e.key === 'ArrowRight') show(cur + 1); else if (e.key === 'ArrowLeft') show(cur - 1);
    else if (e.key === '+' || e.key === '=') zoomAt(s * 1.6, ...mid(), true); else if (e.key === '-') zoomAt(s / 1.6, ...mid(), true); else if (e.key === '0') fit(true);
  });
  const m = location.hash.match(/^#image-(\d+)$/);
  if (m && links[+m[1] - 1]) open(+m[1] - 1);
})();
