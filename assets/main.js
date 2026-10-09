(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // reveal on scroll
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -6% 0px' });
  document.querySelectorAll('.reveal').forEach(el => reduce ? el.classList.add('in') : io.observe(el));

  // fade out the blur placeholder once the real image has loaded
  document.querySelectorAll('img[style*="background-image"]').forEach(im => {
    const done = () => im.classList.add('loaded');
    // an image without src yet (a home slide waiting for its turn) keeps its placeholder until the real picture arrives
    im.complete && im.getAttribute('src') ? done() : im.addEventListener('load', done, { once: true });
  });

  // home hero slideshow lives in fx.js (progress bars, pause button, hover / focus pause)

  // contents bar: highlight the section in view; the link strip scrolls on its own and fades at the edge that hides more
  const tocLinks = [...document.querySelectorAll('.toc a')];
  if (tocLinks.length) {
    const strip = document.querySelector('.toc-in'), wrap = document.querySelector('.toc-w');
    const edges = () => {
      if (!strip || !wrap) return;
      const max = strip.scrollWidth - strip.clientWidth;
      wrap.classList.toggle('fl', strip.scrollLeft > 2);
      wrap.classList.toggle('fr', strip.scrollLeft < max - 2);
    };
    const reveal = a => {
      if (!strip) return;
      const l = a.offsetLeft - strip.offsetLeft, r = l + a.offsetWidth, pad = 60;     // clear of the 56 px edge fades
      if (l < strip.scrollLeft + pad || r > strip.scrollLeft + strip.clientWidth - pad)
        strip.scrollTo({ left: Math.max(0, l - pad), behavior: reduce ? 'auto' : 'smooth' });
    };
    const map = new Map(tocLinks.map(a => [a.getAttribute('href').slice(1), a]));
    const so = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { tocLinks.forEach(a => a.classList.remove('on')); const a = map.get(e.target.id); if (a) { a.classList.add('on'); reveal(a); } } }), { rootMargin: '-40% 0px -55% 0px' });
    map.forEach((a, id) => { const el = document.getElementById(id); if (el) so.observe(el); });
    if (strip) {
      strip.addEventListener('scroll', edges, { passive: true }); addEventListener('resize', edges, { passive: true }); edges(); document.fonts && document.fonts.ready.then(edges);
      strip.addEventListener('focusin', e => { const a = e.target.closest('a'); if (a) reveal(a); });   // a keyboard-focused link never sits under the edge fade
    }
  }

  // 2D exploded model (no-WebGL fallback): scroll progress drives plate separation; geometry is cached, not read per frame
  document.querySelectorAll('[data-explode]').forEach(sec => {
    const plates = [...sec.querySelectorAll('img.plate')], guides = sec.querySelector('img.guides');
    const labels = [...sec.querySelectorAll('.ex-labels li')], bar = sec.querySelector('.ex-bar span'), stage = sec.querySelector('.ex-stage');
    const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const fp = new URLSearchParams(location.search).get('explode');
    let top = 0, span = 1, h = 1, raf = 0;
    const measure = () => { top = sec.getBoundingClientRect().top + scrollY; span = Math.max(1, sec.offsetHeight - innerHeight); h = stage.clientHeight; };
    const draw = () => {
      raf = 0;
      let p = Math.min(1, Math.max(0, (scrollY - top) / span));
      if (reduce) p = 1;
      if (fp !== null) p = +fp;
      const e = ease(Math.min(1, Math.max(0, (p - .08) / .8)));
      plates.forEach(im => { im.style.transform = 'translateY(' + ((1 - e) * parseFloat(im.dataset.off) / 100 * h).toFixed(1) + 'px)'; });
      guides.style.opacity = Math.max(0, (e - .55) / .45).toFixed(3);
      labels.forEach((li, i) => li.classList.toggle('on', e > .6 + i * .05));
      bar.style.transform = 'scaleX(' + p.toFixed(4) + ')';
    };
    measure(); draw();
    addEventListener('scroll', () => { if (!raf && scrollY + innerHeight > top - 200 && scrollY < top + span + innerHeight + 200) raf = requestAnimationFrame(draw); }, { passive: true });
    addEventListener('resize', () => { measure(); draw(); });
    if (window.ResizeObserver) new ResizeObserver(() => { measure(); draw(); }).observe(document.body);
  });

  // gallery lightbox: prev/next buttons (also on phones), keyboard (pan when zoomed), swipe, counter, shareable #image-N,
  // a real modal: the rest of the page is inert while it is open, and Back closes it
  const links = [...document.querySelectorAll('a.zoom')];
  if (!links.length) return;
  const lb = document.createElement('div');
  lb.className = 'lb'; lb.setAttribute('role', 'dialog'); lb.setAttribute('aria-modal', 'true'); lb.setAttribute('aria-label', 'Image viewer');
  lb.innerHTML = '<div class="lb-view"><img alt="" draggable="false"></div>'
    + '<button class="lb-close" type="button" aria-label="Close">&times;</button>'
    + '<div class="lb-zoom"><button class="lb-out" type="button" aria-label="Zoom out">&minus;</button><span class="lb-pct" aria-hidden="true">100%</span><button class="lb-in" type="button" aria-label="Zoom in">+</button><button class="lb-fit" type="button">Fit</button></div>'
    + '<div class="lb-cap"><button class="lb-prev" type="button" aria-label="Previous image"><span aria-hidden="true">&larr;</span></button>'
    + '<div class="lb-meta" aria-live="polite" aria-atomic="true"><span class="lb-n"></span><span class="lb-t"></span></div>'
    + '<span class="lb-hint">Scroll or double-click to zoom &middot; drag or arrow keys to pan &middot; Page Up / Page Down for the next image</span>'
    + '<button class="lb-next" type="button" aria-label="Next image"><span aria-hidden="true">&rarr;</span></button></div>';
  document.body.appendChild(lb);
  const view = lb.querySelector('.lb-view'), im = view.querySelector('img'), pct = lb.querySelector('.lb-pct');
  let cur = -1, lastFocus = null, isOpen = false, pushed = false, skipPop = false, inerted = [];
  // deep zoom state: scale s (1 = image pixel per CSS px), translation tx/ty of the image's top-left corner
  let s = 1, tx = 0, ty = 0, fitS = 1, iw = 1, ih = 1;
  const maxS = () => Math.max(1, fitS * 2.5);
  const zoomed = () => s > fitS * 1.01;
  const clampPan = () => {
    const vw = view.clientWidth, vh = view.clientHeight, w = iw * s, h = ih * s;
    tx = w <= vw ? (vw - w) / 2 : Math.min(0, Math.max(vw - w, tx));
    ty = h <= vh ? (vh - h) / 2 : Math.min(0, Math.max(vh - h, ty));
  };
  const apply = (anim) => {
    clampPan();
    im.style.transition = anim && !reduce ? 'transform .45s cubic-bezier(.19,1,.22,1)' : 'none';
    im.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + s + ')';
    pct.textContent = Math.round(s * 100) + '%';
    view.classList.toggle('zoomed', zoomed());
  };
  const fit = (anim) => { fitS = Math.min(view.clientWidth / iw, view.clientHeight / ih, 1); s = fitS; tx = ty = 0; apply(anim); };
  const zoomAt = (ns, cx, cy, anim) => {
    ns = Math.max(fitS, Math.min(maxS(), ns));
    const r = view.getBoundingClientRect(), px = cx - r.left, py = cy - r.top;
    tx = px - (px - tx) * ns / s; ty = py - (py - ty) * ns / s; s = ns; apply(anim);
  };
  const onLoad = () => { iw = im.naturalWidth || 1; ih = im.naturalHeight || 1; im.style.width = iw + 'px'; im.style.height = ih + 'px'; fit(false); };
  im.addEventListener('load', onLoad);
  addEventListener('resize', () => { if (isOpen) fit(false); });
  const url = h => location.pathname + location.search + (h || '');
  const show = i => {
    cur = (i + links.length) % links.length; const a = links[cur];
    im.src = a.href; im.alt = a.dataset.caption || '';
    if (im.complete && im.naturalWidth) onLoad();
    lb.querySelector('.lb-n').textContent = String(cur + 1).padStart(2, '0') + ' / ' + String(links.length).padStart(2, '0');
    lb.querySelector('.lb-t').textContent = a.dataset.caption || '';
    history.replaceState(history.state, '', url('#image-' + (cur + 1)));
  };
  const open = (i, push) => {
    if (isOpen) return show(i);
    lastFocus = document.activeElement; isOpen = true;
    if (push) { history.pushState({ lb: 1 }, '', url('#image-' + (i + 1))); pushed = true; }
    lb.classList.add('open'); show(i); document.body.style.overflow = 'hidden';
    inerted = [...document.body.children].filter(n => n !== lb && !n.inert && n.tagName !== 'SCRIPT');
    inerted.forEach(n => { n.inert = true; });
    lb.querySelector('.lb-close').focus();
  };
  const close = fromPop => {
    if (!isOpen) return;
    isOpen = false; lb.classList.remove('open'); document.body.style.overflow = '';
    inerted.forEach(n => { n.inert = false; }); inerted = [];
    if (!fromPop) {
      if (pushed) { pushed = false; skipPop = true; history.back(); }
      else history.replaceState(history.state, '', url(''));
    } else pushed = false;
    lastFocus && lastFocus.focus && lastFocus.focus({ preventScroll: true });
  };
  addEventListener('popstate', () => { if (skipPop) { skipPop = false; return; } if (isOpen) close(true); });
  links.forEach((a, i) => a.addEventListener('click', e => { e.preventDefault(); open(i, true); }));
  lb.querySelector('.lb-prev').addEventListener('click', e => { e.stopPropagation(); show(cur - 1); });
  lb.querySelector('.lb-next').addEventListener('click', e => { e.stopPropagation(); show(cur + 1); });
  lb.querySelector('.lb-close').addEventListener('click', () => close(false));
  const mid = () => { const r = view.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  lb.querySelector('.lb-in').addEventListener('click', () => zoomAt(s * 1.6, ...mid(), true));
  lb.querySelector('.lb-out').addEventListener('click', () => zoomAt(s / 1.6, ...mid(), true));
  lb.querySelector('.lb-fit').addEventListener('click', () => fit(true));
  view.addEventListener('wheel', e => { e.preventDefault(); zoomAt(s * Math.exp(-e.deltaY * .0018), e.clientX, e.clientY, false); }, { passive: false });
  view.addEventListener('dblclick', e => { zoomed() ? fit(true) : zoomAt(Math.min(1, maxS()) > fitS * 1.3 ? 1 : fitS * 2.5, e.clientX, e.clientY, true); });
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
    if (zoomed()) { tx = drag.tx + dx; ty = drag.ty + dy; apply(false); }
  });
  const up = e => {
    if (!pts.has(e.pointerId)) return; pts.delete(e.pointerId);
    if (pts.size < 2) pinch0 = null;
    if (drag && !zoomed()) {
      const dx = e.clientX - drag.x;
      if (Math.abs(dx) > 60) show(cur + (dx < 0 ? 1 : -1));
      else if (!moved && e.target === view) close(false);
    }
    drag = null;
  };
  view.addEventListener('pointerup', up); view.addEventListener('pointercancel', up);
  document.addEventListener('keydown', e => {
    if (!isOpen) return;
    const k = e.key;
    if (k === 'Escape') { close(false); return; }
    if (k === 'Tab') {     // keep focus inside the viewer (the page behind is inert as well)
      // every rendered button counts, including the position:fixed Previous / Next circles (offsetParent is null for those)
      const f = [...lb.querySelectorAll('button')].filter(b => b.getClientRects().length > 0);
      if (!f.length) return;
      const i = f.indexOf(document.activeElement);
      if (i === -1) { (e.shiftKey ? f[f.length - 1] : f[0]).focus(); e.preventDefault(); return; }
      if (e.shiftKey && i === 0) { f[f.length - 1].focus(); e.preventDefault(); }
      else if (!e.shiftKey && i === f.length - 1) { f[0].focus(); e.preventDefault(); }
      return;
    }
    if (k === 'PageDown') show(cur + 1); else if (k === 'PageUp') show(cur - 1);
    else if (k.startsWith('Arrow') && zoomed()) {    // zoomed in: arrows pan the drawing
      const d = 80; tx += k === 'ArrowLeft' ? d : k === 'ArrowRight' ? -d : 0; ty += k === 'ArrowUp' ? d : k === 'ArrowDown' ? -d : 0; apply(false);
    }
    else if (k === 'ArrowRight') show(cur + 1); else if (k === 'ArrowLeft') show(cur - 1);
    else if (k === '+' || k === '=') zoomAt(s * 1.6, ...mid(), true); else if (k === '-') zoomAt(s / 1.6, ...mid(), true); else if (k === '0') fit(true);
    else return;
    e.preventDefault();
  });
  const m = location.hash.match(/^#image-(\d+)$/);
  if (m && links[+m[1] - 1]) open(+m[1] - 1, false);
})();
