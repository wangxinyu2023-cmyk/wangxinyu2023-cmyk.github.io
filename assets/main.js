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

  // home hero: slow cross-fade between project heroes
  const hero = document.querySelector('[data-slides]');
  if (hero && !reduce) {
    const sl = hero.querySelectorAll('.slide'), cp = hero.querySelectorAll('.cap'); let k = 0;
    if (sl.length > 1) setInterval(() => {
      sl[k].classList.remove('on'); cp[k].classList.remove('on');
      k = (k + 1) % sl.length; sl[k].classList.add('on'); cp[k].classList.add('on');
    }, 6000);
  }

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
  lb.innerHTML = '<img alt=""><button class="lb-prev" aria-label="Previous image">&larr;</button><button class="lb-next" aria-label="Next image">&rarr;</button>'
    + '<button class="lb-close" aria-label="Close">&times;</button><div class="lb-cap"><span class="lb-n"></span><span class="lb-t"></span></div>';
  document.body.appendChild(lb);
  const im = lb.querySelector('img'); let cur = -1, lastFocus = null;
  const show = i => {
    cur = (i + links.length) % links.length; const a = links[cur];
    im.src = a.href; im.alt = a.dataset.caption || '';
    lb.querySelector('.lb-n').textContent = String(cur + 1).padStart(2, '0') + ' / ' + String(links.length).padStart(2, '0');
    lb.querySelector('.lb-t').textContent = a.dataset.caption || '';
    history.replaceState(null, '', '#image-' + (cur + 1));
  };
  const open = i => { lastFocus = document.activeElement; show(i); lb.classList.add('open'); document.body.style.overflow = 'hidden'; lb.querySelector('.lb-close').focus(); };
  const close = () => { lb.classList.remove('open'); document.body.style.overflow = ''; history.replaceState(null, '', location.pathname); lastFocus && lastFocus.focus(); };
  links.forEach((a, i) => a.addEventListener('click', e => { e.preventDefault(); open(i); }));
  lb.querySelector('.lb-prev').addEventListener('click', e => { e.stopPropagation(); show(cur - 1); });
  lb.querySelector('.lb-next').addEventListener('click', e => { e.stopPropagation(); show(cur + 1); });
  lb.querySelector('.lb-close').addEventListener('click', close);
  lb.addEventListener('click', e => { if (e.target === lb) close(); });
  document.addEventListener('keydown', e => {
    if (!lb.classList.contains('open')) return;
    if (e.key === 'Escape') close(); else if (e.key === 'ArrowRight') show(cur + 1); else if (e.key === 'ArrowLeft') show(cur - 1);
  });
  let x0 = null;
  lb.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener('touchend', e => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 50) show(cur + (dx < 0 ? 1 : -1)); x0 = null; });
  const m = location.hash.match(/^#image-(\d+)$/);
  if (m && links[+m[1] - 1]) open(+m[1] - 1);
})();
