// Human Race Motor: scroll-driven procedural growth (three.js r160 UMD + window.HRM_MODEL parameters).
// A cellular-automaton-like rule grows unit-tower bars around a central spine generation by generation; selection
// rules then remove the loose ends, four zones tint the shell and walkways reach out from the spine.
// Generated live from a fixed seed (the same city every visit); no source model is needed. Drag to orbit.
(() => {
  const sec = document.querySelector('[data-model3d][data-anim="ca"]');
  if (!sec) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const gl = (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } })();
  if (!gl) { sec.remove(); return; }
  sec.classList.add('ready');

  const css = document.createElement('style');
  css.textContent = '.m3d[data-anim="ca"] .m3-stage{background:#151414}' +
    '.m3d[data-anim="ca"] .m3-wait{color:#d9d2c8}' +
    '.hrm-read{position:absolute;left:14px;bottom:12px;margin:0;font-family:var(--sans);font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:#d9d2c8;pointer-events:none;font-variant-numeric:tabular-nums}' +
    '.hrm-read b{font-weight:500;color:#d4a2a3}' +
    '.hrm-key{position:absolute;right:14px;bottom:12px;margin:0;padding:0;list-style:none;display:grid;gap:4px;font-family:var(--sans);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#d9d2c8;pointer-events:none;opacity:0;transition:opacity .5s}' +
    '.hrm-key.on{opacity:1}.hrm-key li{display:flex;align-items:center;gap:7px}.hrm-key b{width:9px;height:9px;flex:none}' +
    '@media (max-width:900px){.hrm-key{grid-template-columns:repeat(2,auto);gap:3px 10px;font-size:9px;letter-spacing:.04em;right:10px;bottom:30px}.hrm-read{left:10px;bottom:8px}}';
  document.head.appendChild(css);

  const up = sec.dataset.up || '';
  const load = src => new Promise((ok, no) => {
    const u = up + src, o = [...document.scripts].find(x => x.getAttribute('src') === u);
    if (o) { if (o.dataset.ok) ok(); else { o.addEventListener('load', ok); o.addEventListener('error', no); } return; }
    const s = document.createElement('script'); s.src = u; s.onload = () => { s.dataset.ok = 1; ok(); }; s.onerror = no; document.head.appendChild(s); });
  let started = false;
  const fail = e => { if (e) console.error(e); sec.classList.add('failed'); const w = sec.querySelector('.m3-wait'); if (w) w.textContent = 'The 3D scene didn’t load. Reload the page to try again.'; };
  const go = () => { if (started) return; started = true; load('assets/vendor/three.min.js').then(() => load(sec.dataset.model)).then(init).catch(fail); };
  new IntersectionObserver((es, o) => { if (es.some(e => e.isIntersecting)) { o.disconnect(); go(); } }, { rootMargin: '600px 0px' }).observe(sec);
  if (matchMedia('(pointer: fine)').matches && innerWidth > 900) addEventListener('load', () => setTimeout(() => (window.requestIdleCallback || (f => setTimeout(f, 1)))(go, { timeout: 4000 }), 1200), { once: true });

  const STEPS = [
    ['Spine', 'One transport spine: the fixed line of the city.'],
    ['Generate', 'Bar by bar, a growth rule adds unit towers to the cells around it.'],
    ['Select', 'Loose ends that break the rules are taken away.'],
    ['Four zones', 'Government and science, living, transport, manufacturing.'],
    ['Walkways', 'Paths reach out from the spine between the blocks.']];
  const PH = [0, .08, .5, .64, .8, 1.01];
  const ZONES = [['Government + science', 0xa9b4c2], ['Living', 0xeee7dd], ['Transport', 0xc99a9c], ['Manufacturing', 0x8d8780]];

  function init() {
    const T = window.THREE, M = window.HRM_MODEL || {}, stage = sec.querySelector('.m3-stage');
    const bar = sec.querySelector('.ex-bar span'), stepsOl = sec.querySelector('.m3-steps');
    const steps = STEPS.map((s, i) => { const li = document.createElement('li'); li.innerHTML = '<i>' + String(i + 1).padStart(2, '0') + '</i><span>' + s[0] + '<span class="m3-d">' + s[1] + '</span></span>'; stepsOl && stepsOl.appendChild(li); return li; });
    const read = document.createElement('p'); read.className = 'hrm-read'; read.setAttribute('aria-hidden', 'true'); stage.appendChild(read);
    const keyEl = document.createElement('ul'); keyEl.className = 'hrm-key'; keyEl.setAttribute('aria-hidden', 'true');
    keyEl.innerHTML = ZONES.map(z => '<li><b style="background:#' + z[1].toString(16).padStart(6, '0') + '"></b>' + z[0] + '</li>').join(''); stage.appendChild(keyEl);

    // ---------------------------------------------------------------- growth (deterministic)
    let seed = M.seed || 1859;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const NX = 30, NY = 24, NZ = 30, cx = NX >> 1, cz = NZ >> 1, G = M.generations || 16;
    const occ = new Int32Array(NX * NY * NZ).fill(-1), id = (x, y, z) => (y * NZ + z) * NX + x;
    const inside = (x, y, z) => {        // a floating, lens-shaped envelope around the spine
      if (x < 0 || y < 0 || z < 0 || x >= NX || y >= NY || z >= NZ) return false;
      const r = Math.hypot(x - cx, z - cz), h = (y - NY * .48) / (NY * .5);
      return r <= 13.5 * Math.sqrt(Math.max(0, 1 - h * h)) + .5;
    };
    const bars = [];   // {x,y,z,ax,len,g,cells}
    // the spine occupies the centre column
    for (let y = 0; y < NY; y++) occ[id(cx, y, cz)] = -2;
    const AX = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const place = (x, y, z, ax, len, g) => {
      const d = AX[ax], cells = [];
      for (let i = 0; i < len; i++) { const X = x + d[0] * i, Y = y + d[1] * i, Z = z + d[2] * i; if (!inside(X, Y, Z) || occ[id(X, Y, Z)] !== -1) return false; cells.push(id(X, Y, Z)); }
      const b = { x, y, z, ax, len, g, n: bars.length }; cells.forEach(c => { occ[c] = b.n; }); b.cells = cells; bars.push(b); return true;
    };
    const nb6 = (X, Y, Z) => { let n = 0; [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].forEach(d => { const a = X + d[0], b = Y + d[1], c = Z + d[2]; if (a >= 0 && b >= 0 && c >= 0 && a < NX && b < NY && c < NZ && occ[id(a, b, c)] !== -1) n++; }); return n; };
    // generation 0: arms off the spine
    for (let y = 2; y < NY - 2; y += 2) { const dir = Math.floor(rnd() * 4), dx = [1, -1, 0, 0][dir], dz = [0, 0, 1, -1][dir]; place(cx + dx, y, cz + dz, dx ? 0 : 2, 1, 0); }
    const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    for (let g = 1; g <= G; g++) {
      const pool = bars.slice(), tries = Math.min(240, 40 + pool.length * .9);
      for (let t = 0; t < tries; t++) {
        const b = pool[Math.floor(rnd() * pool.length)], c = b.cells[Math.floor(rnd() * b.cells.length)];
        const X0 = c % NX, Z0 = Math.floor(c / NX) % NZ, Y0 = Math.floor(c / (NX * NZ));
        const d = DIRS[Math.floor(rnd() * 6)], X = X0 + d[0], Y = Y0 + d[1], Z = Z0 + d[2];
        if (!inside(X, Y, Z) || occ[id(X, Y, Z)] !== -1) continue;
        const n = nb6(X, Y, Z);
        if (n > 2) continue;                                                   // birth rule: born next to one or two cells only
        const r = Math.hypot(X - cx, Z - cz);
        if (rnd() > .8 * Math.exp(-r / 7.5)) continue;                           // denser near the spine
        const vert = rnd() < .42, ax = vert ? 1 : (rnd() < .5 ? 0 : 2), len = vert ? 2 + Math.floor(rnd() * 5) : 1 + Math.floor(rnd() * 4);
        place(X, Y, Z, ax, len, g) || place(X, Y, Z, ax, 1, g);
      }
    }
    // selection: bars that touch only one other piece and stick out in the last generations are removed
    bars.forEach(b => {
      const touch = new Set();
      b.cells.forEach(c => { const X = c % NX, Z = Math.floor(c / NX) % NZ, Y = Math.floor(c / (NX * NZ));
        DIRS.forEach(d => { const a = X + d[0], bb = Y + d[1], cc = Z + d[2]; if (a < 0 || bb < 0 || cc < 0 || a >= NX || bb >= NY || cc >= NZ) return; const o = occ[id(a, bb, cc)]; if (o !== -1 && o !== b.n) touch.add(o); }); });
      b.cut = b.g > 1 && touch.size <= 1 && rnd() < .9;
      const ang = Math.atan2(b.z - cz, b.x - cx);                           // zone by quadrant around the spine
      b.zone = ((Math.floor((ang + Math.PI) / (Math.PI / 2)) % 4) + 4) % 4;
      b.tone = .86 + rnd() * .2;
    });
    const kept = bars.filter(b => !b.cut).length;

    // ---------------------------------------------------------------- scene
    const renderer = new T.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(1.5, devicePixelRatio)); renderer.setClearColor(0x151414, 1);
    stage.prepend(renderer.domElement);
    const scene = new T.Scene(), cam = new T.OrthographicCamera(-1, 1, 1, -1, -20, 20);
    scene.add(new T.HemisphereLight(0xffffff, 0x2a2626, 1.25));
    const sun = new T.DirectionalLight(0xffffff, 1.7); sun.position.set(-.7, 1.4, .9); scene.add(sun);
    const fill = new T.DirectionalLight(0xffe6e6, .35); fill.position.set(.8, -.2, -.6); scene.add(fill);
    const U = .06, off = new T.Vector3(-cx * U, -NY * .5 * U, -cz * U);
    const box = new T.BoxGeometry(1, 1, 1);
    const inst = new T.InstancedMesh(box, new T.MeshLambertMaterial({ color: 0xffffff }), bars.length);
    inst.instanceMatrix.setUsage(T.DynamicDrawUsage);
    scene.add(inst);
    const spine = new T.Mesh(new T.BoxGeometry(U * 1.25, NY * U * 1.18, U * 1.25), new T.MeshLambertMaterial({ color: 0xc99a9c }));
    spine.position.set(0, 0, 0); scene.add(spine);
    // walkways: thin pink bars from the spine to points on the shell
    const walks = [];
    for (let k = 0; k < 12; k++) {
      const a = k * 2.399 + rnd() * .4, y = (rnd() - .5) * NY * U * .7, L = (9 + rnd() * 7) * U;
      const m = new T.Mesh(new T.BoxGeometry(1, U * .4, U * .7), new T.MeshLambertMaterial({ color: 0xd8a9aa }));
      m.userData = { a, y, L }; m.rotation.y = -a; scene.add(m); walks.push(m);
    }
    // stars
    const sp = []; for (let k = 0; k < 420; k++) { const u = rnd() * 2 - 1, th = rnd() * 6.283, r = 6 + rnd() * 4, s = Math.sqrt(1 - u * u); sp.push(Math.cos(th) * s * r, u * r, Math.sin(th) * s * r); }
    const stars = new T.Points(new T.BufferGeometry().setAttribute('position', new T.Float32BufferAttribute(sp, 3)), new T.PointsMaterial({ color: 0x8a8580, size: 1.4, sizeAttenuation: false, transparent: true, opacity: .7 }));
    scene.add(stars);

    const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const cl = (x, a, b) => Math.max(0, Math.min(1, (x - a) / (b - a)));
    const mtx = new T.Matrix4(), q = new T.Quaternion(), pos = new T.Vector3(), scl = new T.Vector3(), col = new T.Color();
    const GREY = new T.Color(0xdcd8d3), RED = new T.Color(0xc8321f), ZC = ZONES.map(z => new T.Color(z[1]));

    let yaw = -.78, pitch = .55, zoom = 1, drag = null, idle = 0;
    stage.addEventListener('pointerdown', e => { drag = [e.clientX, e.clientY, yaw, pitch]; stage.setPointerCapture(e.pointerId); stage.classList.add('grab'); });
    stage.addEventListener('pointermove', e => { if (!drag) return; yaw = drag[2] - (e.clientX - drag[0]) * .008; pitch = Math.min(1.2, Math.max(.1, drag[3] + (e.clientY - drag[1]) * .005)); idle = 0; frame(); });
    const end = () => { drag = null; stage.classList.remove('grab'); };
    stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end);
    stage.tabIndex = 0; stage.setAttribute('role', 'application'); stage.setAttribute('aria-roledescription', '3D model');
    stage.setAttribute('aria-label', ((sec.querySelector('.ex-hint') || {}).textContent || '3D model') + '. Arrow keys turn it.');
    stage.addEventListener('keydown', e => {
      const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]; if (!d) return;
      e.preventDefault(); yaw -= d[0] * .15; pitch = Math.min(1.2, Math.max(.1, pitch + d[1] * .08)); idle = 0; frame();
    });

    const fp = new URLSearchParams(location.search).get('explode');
    let W = 0, H = 0, top = 0, span = 1;
    const measure = () => { top = sec.getBoundingClientRect().top + scrollY; span = Math.max(1, sec.offsetHeight - innerHeight); };
    const size = () => { W = stage.clientWidth; H = stage.clientHeight; renderer.setSize(W, H, false); measure(); };

    function frame() {
      let p = Math.min(1, Math.max(0, (scrollY - top) / span));
      if (reduce) p = 1;
      if (fp !== null) p = +fp;
      const sp0 = .3 + .7 * ease(cl(p, 0, PH[1])), gen = cl(p, PH[1], PH[2]) * (G + 1), sel = cl(p, PH[2], PH[3]), zn = ease(cl(p, PH[3], PH[4])), wk = ease(cl(p, PH[4], .97));
      spine.scale.set(1, Math.max(.001, sp0), 1);
      let shown = 0;
      bars.forEach((b, i) => {
        let s = b.g === 0 ? cl(sp0, .5, 1) : Math.max(0, Math.min(1, gen - b.g + 1));
        s = ease(s);
        if (b.cut) s *= 1 - ease(cl(sel, .45, 1));
        if (s > .01) shown++;
        const d = AX[b.ax], L = b.len;
        pos.set((b.x + d[0] * (L - 1) / 2) * U, (b.y + d[1] * (L - 1) / 2) * U, (b.z + d[2] * (L - 1) / 2) * U).add(off);
        const g = U * .9 * Math.max(.0001, s);
        scl.set(d[0] ? U * L * .97 * Math.max(.0001, s) : g, d[1] ? U * L * .97 * Math.max(.0001, s) : g, d[2] ? U * L * .97 * Math.max(.0001, s) : g);
        mtx.compose(pos, q, scl); inst.setMatrixAt(i, mtx);
        col.copy(GREY).multiplyScalar(b.tone);
        if (b.cut) col.lerp(RED, Math.min(1, sel * 2.2));
        else if (zn > 0) col.lerp(ZC[b.zone], zn * .85);
        inst.setColorAt(i, col);
      });
      inst.instanceMatrix.needsUpdate = true; if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      walks.forEach(m => { const { a, y, L } = m.userData, l = Math.max(.0001, L * wk); m.scale.set(l, 1, 1); m.position.set(Math.cos(a) * l / 2, y, Math.sin(a) * l / 2); m.visible = wk > .01; });
      // frame
      const half = 1.06, asp = W / Math.max(1, H), hh = half / zoom, hw = hh * asp, minW = W < 600 ? 1.22 : 1.15;
      if (hw < minW) { const k = minW / hw; cam.left = -minW; cam.right = minW; cam.top = hh * k; cam.bottom = -hh * k; } else { cam.left = -hw; cam.right = hw; cam.top = hh; cam.bottom = -hh; }
      cam.updateProjectionMatrix();
      cam.position.set(Math.sin(yaw) * Math.cos(pitch) * 5, Math.sin(pitch) * 5, Math.cos(yaw) * Math.cos(pitch) * 5); cam.lookAt(0, 0, 0);
      renderer.render(scene, cam);
      let s = 0; while (s < 4 && p >= PH[s + 1]) s++;
      steps.forEach((li, i) => { li.classList.toggle('on', i === s); li.classList.toggle('done', i < s); });
      keyEl.classList.toggle('on', zn > .3);
      read.innerHTML = p < PH[2] ? 'Generation <b>' + Math.min(G, Math.floor(gen)) + '</b> / ' + G + ' &nbsp;&middot;&nbsp; ' + shown + ' bars'
        : 'Kept <b>' + kept + '</b> of ' + bars.length + ' bars';
      bar.style.transform = 'scaleX(' + p.toFixed(4) + ')';
    }
    size(); frame();
    try { renderer.compile(scene, cam); } catch (e) {}
    const near = () => scrollY + innerHeight > top - 80 && scrollY < top + span + innerHeight + 80;
    let sRaf = 0; addEventListener('scroll', () => { if (sRaf || !near()) return; sRaf = requestAnimationFrame(() => { sRaf = 0; frame(); }); }, { passive: true });
    addEventListener('resize', () => { size(); frame(); });
    if (window.ResizeObserver) new ResizeObserver(measure).observe(document.body);
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
