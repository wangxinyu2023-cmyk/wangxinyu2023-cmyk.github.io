// Clinton Hill: scroll-driven 3D exploded model (three.js r160 UMD + window.CLINTON_MODEL).
// Floors lift apart as the sticky section is scrolled; drag to orbit. Falls back to the 2D plates without WebGL.
(() => {
  const sec = document.querySelector('[data-model3d][data-anim="explode"]');
  if (!sec) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fallback = document.querySelector('[data-explode]');
  const gl = (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } })();
  if (!gl) { sec.remove(); return; }
  if (fallback) fallback.remove();
  sec.classList.add('ready');

  const up = sec.dataset.up || '';
  const load = src => new Promise((ok, no) => {   // shared with the explorer: never load the same script twice
    const u = up + src, o = [...document.scripts].find(x => x.getAttribute('src') === u);
    if (o) { if (o.dataset.ok) ok(); else { o.addEventListener('load', ok); o.addEventListener('error', no); } return; }
    const s = document.createElement('script'); s.src = u; s.onload = () => { s.dataset.ok = 1; ok(); }; s.onerror = no; document.head.appendChild(s); });
  let started = false;
  // on failure the section collapses to its caption and says what to do, instead of leaving screens of empty scroll
  const fail = e => { if (e) console.error(e); sec.classList.add('failed'); const w = sec.querySelector('.m3-wait'); if (w) w.textContent = 'The 3D model didn’t load. Reload the page to try again.'; };
  const go = () => { if (started) return; started = true; load('assets/vendor/three.min.js').then(() => load(sec.dataset.model)).then(init).catch(fail); };
  new IntersectionObserver((es, o) => { if (es.some(e => e.isIntersecting)) { o.disconnect(); go(); } }, { rootMargin: '600px 0px' }).observe(sec);
  // desktop: warm the scene up while the reader is still on the hero, so the main-thread build never lands mid-scroll
  if (matchMedia('(pointer: fine)').matches && innerWidth > 900) addEventListener('load', () => setTimeout(() => (window.requestIdleCallback || (f => setTimeout(f, 1)))(go, { timeout: 4000 }), 1200), { once: true });


  function init() {
    const T = window.THREE, M = window.CLINTON_MODEL, stage = sec.querySelector('.m3-stage');
    const labels = [...sec.querySelectorAll('.ex-labels li')], bar = sec.querySelector('.ex-bar span');
    const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(1.5, devicePixelRatio));
    stage.prepend(renderer.domElement);
    const scene = new T.Scene();
    const cam = new T.OrthographicCamera(-1, 1, 1, -1, -10, 10);
    scene.add(new T.HemisphereLight(0xffffff, 0xd9d2c5, 1.6));
    const sun = new T.DirectionalLight(0xffffff, 1.5); sun.position.set(-0.6, 1.2, 0.8); scene.add(sun);

    const COL = { wall: 0xf1ede6, slab: 0xe2dacd, timber: 0xb4865a, frame: 0x45413c, glass: 0xa9c3cf, stair: 0xc9a57c, site: 0xe8e4dc };
    const edgeMat = new T.LineBasicMaterial({ color: 0x2a2724, transparent: true, opacity: .28 });
    const b64 = s => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; };
    const floors = M.bands.map(() => { const g = new T.Group(); scene.add(g); return g; });
    M.parts.forEach(pt => {
      const q = new Int16Array(b64(pt.p)), pos = new Float32Array(q.length);
      for (let i = 0; i < q.length; i += 3) { pos[i] = q[i] / 65000; pos[i + 1] = q[i + 2] / 65000; pos[i + 2] = -q[i + 1] / 65000; } // Rhino Z-up -> three Y-up
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.BufferAttribute(pos, 3));
      geo.setIndex(new T.BufferAttribute(pt.idx32 ? new Uint32Array(b64(pt.i)) : new Uint16Array(b64(pt.i)), 1));
      geo.computeVertexNormals();
      const glass = pt.cat === 'glass';
      const mat = new T.MeshLambertMaterial({ color: COL[pt.cat], side: T.DoubleSide, transparent: glass, opacity: glass ? .32 : 1, depthWrite: !glass,
        polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
      const mesh = new T.Mesh(geo, mat); mesh.renderOrder = glass ? 2 : 0;
      floors[pt.band].add(mesh);
      if (!glass && pt.cat !== 'frame') floors[pt.band].add(new T.LineSegments(new T.EdgesGeometry(geo, 25), edgeMat));
    });

    // camera: axonometric, orbit by drag (yaw only + gentle pitch)
    let yaw = -0.72, pitch = 0.58, zoom = 1, drag = null, idle = 0;
    stage.addEventListener('pointerdown', e => { drag = [e.clientX, e.clientY, yaw, pitch]; stage.setPointerCapture(e.pointerId); stage.classList.add('grab'); });
    stage.addEventListener('pointermove', e => { if (!drag) return; yaw = drag[2] - (e.clientX - drag[0]) * .008; pitch = Math.min(1.2, Math.max(.15, drag[3] + (e.clientY - drag[1]) * .005)); idle = 0; frame(); });
    const end = () => { drag = null; stage.classList.remove('grab'); };
    stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end);
    // keyboard alternative to dragging: the stage takes focus once the model is here; arrow keys turn it
    stage.tabIndex = 0; stage.setAttribute('role', 'application'); stage.setAttribute('aria-roledescription', '3D model');
    stage.setAttribute('aria-label', ((sec.querySelector('.ex-hint') || {}).textContent || '3D model') + '. Arrow keys turn it.');
    stage.addEventListener('keydown', e => {
      const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]; if (!d) return;
      e.preventDefault(); yaw -= d[0] * .15; pitch = Math.min(1.2, Math.max(.15, pitch + d[1] * .08)); idle = 0; frame();
    });

    const GAP = .13, lv = M.levels;
    const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const fp = new URLSearchParams(location.search).get('explode');
    let W = 0, H = 0, top = 0, span = 1;
    // section geometry is measured on resize / layout change, never inside the scroll frame
    const measure = () => { top = sec.getBoundingClientRect().top + scrollY; span = Math.max(1, sec.offsetHeight - innerHeight); };
    const size = () => { W = stage.clientWidth; H = stage.clientHeight; renderer.setSize(W, H, false); measure(); };
    const v = new T.Vector3();
    labels.forEach(li => { li.style.top = '0'; });
    function frame() {
      let p = Math.min(1, Math.max(0, (scrollY - top) / span));
      if (reduce) p = 1;
      if (fp !== null) p = +fp;
      const e = ease(Math.min(1, Math.max(0, (p - .06) / .78)));
      const n = floors.length;
      floors.forEach((g, i) => { g.position.y = (i - (n - 1) / 2) * GAP * e; });
      // frame the (growing) stack
      const half = .62 + (n - 1) / 2 * GAP * e * .9, asp = W / Math.max(1, H);
      const hh = half / zoom, hw = hh * asp;
      const minW = W < 600 ? .66 : .78;   // narrow screens: keep the whole footprint in frame
      if (hw < minW) { const k = minW / hw; cam.left = -minW; cam.right = minW; cam.top = hh * k; cam.bottom = -hh * k; } else { cam.left = -hw; cam.right = hw; cam.top = hh; cam.bottom = -hh; }
      cam.updateProjectionMatrix();
      cam.position.set(Math.sin(yaw) * Math.cos(pitch) * 3, Math.sin(pitch) * 3, Math.cos(yaw) * Math.cos(pitch) * 3);
      cam.lookAt(0, 0, 0);
      renderer.render(scene, cam);
      // labels pinned to each floor's height on the stage's right edge
      labels.forEach((li, i) => {
        const k = n - 1 - i; // list is top-down
        v.set(0, lv[k] + .03 + floors[k].position.y, 0).project(cam);
        li.style.transform = 'translate3d(0,' + ((1 - v.y) / 2 * H).toFixed(1) + 'px,0) translateY(-50%)';
        li.classList.toggle('on', e > .55 + i * .05);
      });
      bar.style.transform = 'scaleX(' + p.toFixed(4) + ')';
    }
    // the glazing (transparent, double-sided) draws in one pass: no second pass and no per-frame program re-check
    scene.traverse(o => { [].concat(o.material || []).forEach(m => { if (m.side === T.DoubleSide) m.forceSinglePass = true; }); });
    size(); frame();
    // compile every shader now (idle time, before the reader scrolls) instead of on the first frame each part appears
    try { renderer.compile(scene, cam); } catch (e) {}
    const near = () => scrollY + innerHeight > top - 80 && scrollY < top + span + innerHeight + 80;
    let sRaf = 0; addEventListener('scroll', () => { if (sRaf || !near()) return; sRaf = requestAnimationFrame(t => { sRaf = 0; frame(t); }); }, { passive: true });
    addEventListener('resize', () => { size(); frame(); });
    if (window.ResizeObserver) new ResizeObserver(measure).observe(document.body);
    // slow turntable while the section is on screen and untouched: at most 5 s per visit, no loop while off-screen or hidden
    if (!reduce && fp === null) {
      let vis = false, spinRaf = 0, budget = 0, lastT = 0;
      const spin = t => {
        spinRaf = 0;
        if (!vis || document.hidden) return;
        const dt = lastT ? Math.min(50, t - lastT) : 16; lastT = t;
        if (!drag && ++idle > 90) { yaw += .0016 * dt / 16.7; frame(); budget += dt; }
        if (budget < 5000) spinRaf = requestAnimationFrame(spin);
      };
      const start = () => { if (!spinRaf && vis && budget < 5000) { lastT = 0; spinRaf = requestAnimationFrame(spin); } };
      new IntersectionObserver(es => { vis = es[es.length - 1].isIntersecting; if (vis) { budget = 0; idle = 0; start(); } }).observe(sec);
      stage.addEventListener('pointerup', start);
      document.addEventListener('visibilitychange', start);
    }
    sec.classList.add('loaded');
  }
})();
