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
  const go = () => { if (started) return; started = true; load('assets/vendor/three.min.js').then(() => load(sec.dataset.model)).then(init).catch(() => sec.classList.add('failed')); };
  new IntersectionObserver((es, o) => { if (es.some(e => e.isIntersecting)) { o.disconnect(); go(); } }, { rootMargin: '600px 0px' }).observe(sec);

  function init() {
    const T = window.THREE, M = window.CLINTON_MODEL, stage = sec.querySelector('.m3-stage');
    const labels = [...sec.querySelectorAll('.ex-labels li')], bar = sec.querySelector('.ex-bar span');
    const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, devicePixelRatio));
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

    const GAP = .13, lv = M.levels;
    const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const fp = new URLSearchParams(location.search).get('explode');
    let W = 0, H = 0;
    const size = () => { W = stage.clientWidth; H = stage.clientHeight; renderer.setSize(W, H, false); };
    const v = new T.Vector3();
    function frame() {
      const r = sec.getBoundingClientRect(), span = r.height - innerHeight;
      let p = Math.min(1, Math.max(0, -r.top / Math.max(1, span)));
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
        li.style.top = ((1 - v.y) / 2 * 100).toFixed(2) + '%';
        li.classList.toggle('on', e > .55 + i * .05);
      });
      bar.style.width = (p * 100).toFixed(1) + '%';
    }
    size(); frame();
    addEventListener('scroll', () => requestAnimationFrame(frame), { passive: true });
    addEventListener('resize', () => { size(); frame(); });
    // slow turntable while the section is on screen and untouched
    if (!reduce && fp === null) {
      let vis = false;
      new IntersectionObserver(es => { vis = es[0].isIntersecting; }).observe(sec);
      const spin = () => { if (vis && !drag && ++idle > 90) { yaw += .0016; frame(); } requestAnimationFrame(spin); };
      spin();
    }
    sec.classList.add('loaded');
  }
})();
