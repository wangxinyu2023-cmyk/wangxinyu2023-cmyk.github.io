// Threshold Apparatus: scroll-driven procedural scene (three.js r160 UMD + window.TA_MODEL parameters).
// A visitor walks toward a doorway; an ultrasonic sensor above the door reads the distance and the projected,
// triangulated skin on the wall wakes, peaks at the threshold and settles into a residual trace once they pass.
// Built from the project's own rules (five states, distance -> interaction value -> displacement and colour); no
// source model is needed. Drag to orbit. Removes itself without WebGL.
(() => {
  const sec = document.querySelector('[data-model3d][data-anim="wake"]');
  if (!sec) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const gl = (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } })();
  if (!gl) { sec.remove(); return; }
  sec.classList.add('ready');

  const css = document.createElement('style');
  css.textContent = '.m3d[data-anim="wake"] .m3-stage{background:#120f0d}' +
    '.m3d[data-anim="wake"] .m3-wait{color:#d9d2c8}' +
    '.ta-read{position:absolute;left:14px;bottom:12px;margin:0;font-family:var(--sans);font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:#d9d2c8;pointer-events:none;font-variant-numeric:tabular-nums;opacity:.9}' +
    '.ta-read b{font-weight:500;color:#f08a5d}';
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
    ['Dormant boundary', 'Beyond the sensing range the skin stays still and white.'],
    ['Initial activation', 'A body enters the range; a subtle undulation appears.'],
    ['Spatial negotiation', 'Mid-range: the surface reshapes with every step.'],
    ['Threshold intensification', 'At the door, deformation and interference peak.'],
    ['Residual closure', 'After the crossing, the trace fades and settles.']];
  const PH = [0, .17, .38, .58, .78, 1.01];          // scroll progress where each state begins

  function init() {
    const T = window.THREE, M = window.TA_MODEL || {}, stage = sec.querySelector('.m3-stage');
    const bar = sec.querySelector('.ex-bar span'), stepsOl = sec.querySelector('.m3-steps');
    const steps = STEPS.map((s, i) => { const li = document.createElement('li'); li.innerHTML = '<i>' + String(i + 1).padStart(2, '0') + '</i><span>' + s[0] + '<span class="m3-d">' + s[1] + '</span></span>'; stepsOl && stepsOl.appendChild(li); return li; });
    const read = document.createElement('p'); read.className = 'ta-read'; read.setAttribute('aria-hidden', 'true'); stage.appendChild(read);

    const renderer = new T.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(1.5, devicePixelRatio));
    renderer.setClearColor(0x120f0d, 1);
    stage.prepend(renderer.domElement);
    const scene = new T.Scene();
    scene.fog = new T.Fog(0x120f0d, 9, 17);
    const cam = new T.PerspectiveCamera(30, 1, .1, 60);
    scene.add(new T.HemisphereLight(0xfff2e8, 0x1a1410, .9));
    const key = new T.DirectionalLight(0xffffff, 1.4); key.position.set(2.5, 3.5, 5); scene.add(key);

    // ---------------------------------------------------------------- room: wall with a door, floor, sensor
    const WW = M.wallW || 4.6, WH = M.wallH || 2.6, DW = .96, DH = 2.08, R = M.range || 2.7;
    const wallShape = new T.Shape(); wallShape.moveTo(-WW / 2, 0); wallShape.lineTo(-DW / 2, 0); wallShape.lineTo(-DW / 2, DH); wallShape.lineTo(DW / 2, DH);
    wallShape.lineTo(DW / 2, 0); wallShape.lineTo(WW / 2, 0); wallShape.lineTo(WW / 2, WH); wallShape.lineTo(-WW / 2, WH); wallShape.closePath();
    const wallGeo = new T.ShapeGeometry(wallShape);
    const wall = new T.Mesh(wallGeo, new T.MeshLambertMaterial({ color: 0x2a231e, side: T.DoubleSide }));
    scene.add(wall);
    const lineMat = c => new T.LineBasicMaterial({ color: c, transparent: true, opacity: .55 });
    scene.add(new T.LineSegments(new T.EdgesGeometry(wallGeo), lineMat(0x6d6158)));
    // side wall (the corner of the room, as in the installation photos)
    const side = new T.Mesh(new T.PlaneGeometry(3.2, WH), new T.MeshLambertMaterial({ color: 0x231d19, side: T.DoubleSide }));
    side.rotation.y = Math.PI / 2; side.position.set(-WW / 2, WH / 2, 1.6); scene.add(side);
    // the room beyond the door: a dim back plane
    const beyond = new T.Mesh(new T.PlaneGeometry(DW * 1.6, DH), new T.MeshBasicMaterial({ color: 0x0b0908 }));
    beyond.position.set(0, DH / 2, -1.6); scene.add(beyond);
    // floor grid
    const fl = [];
    for (let x = -2.2; x <= 2.21; x += .4) fl.push(x, 0, 0, x, 0, 4.2);
    for (let z = 0; z <= 4.21; z += .4) fl.push(-2.3, 0, z, 2.3, 0, z);
    const flGeo = new T.BufferGeometry(); flGeo.setAttribute('position', new T.Float32BufferAttribute(fl, 3));
    scene.add(new T.LineSegments(flGeo, new T.LineBasicMaterial({ color: 0x4a3f37, transparent: true, opacity: .45 })));
    // sensor above the door and its range on the floor
    const sensor = new T.Mesh(new T.BoxGeometry(.2, .07, .06), new T.MeshLambertMaterial({ color: 0x3f6f8a }));
    sensor.position.set(0, DH + .12, .05); scene.add(sensor);
    const arcs = [];
    [R, R * .66, R * .33].forEach((r, k) => {
      const pts = []; for (let a = 0; a <= 64; a++) { const t = Math.PI * a / 64; pts.push(new T.Vector3(Math.cos(t) * r, .004, Math.sin(t) * r)); }
      const ln = new T.Line(new T.BufferGeometry().setFromPoints(pts), new T.LineDashedMaterial({ color: 0xe8552a, dashSize: .06, gapSize: .05, transparent: true, opacity: .5 }));
      ln.computeLineDistances(); scene.add(ln); arcs.push(ln);
    });

    // ---------------------------------------------------------------- the projected skin: a triangulated band on the wall
    const NX = 44, NY = 12, X0 = -WW / 2 + .08, X1 = WW / 2 - .08, Y0 = .5, Y1 = 1.72;
    const nodes = (NX + 1) * (NY + 1);
    let seed = M.seed || 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const bx = new Float32Array(nodes), by = new Float32Array(nodes), ph = new Float32Array(nodes);
    for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) {
      const k = j * (NX + 1) + i, edge = i === 0 || i === NX || j === 0 || j === NY;
      bx[k] = X0 + (X1 - X0) * i / NX + (edge ? 0 : (rnd() - .5) * .06);
      by[k] = Y0 + (Y1 - Y0) * j / NY + (edge ? 0 : (rnd() - .5) * .05);
      ph[k] = rnd() * 6.283;
    }
    const nodePos = new Float32Array(nodes * 3), disp = new Float32Array(nodes);
    const tri = [];
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const a = j * (NX + 1) + i, b = a + 1, c = a + NX + 1, d = c + 1;
      if ((i + j) % 2) tri.push(a, b, d, a, d, c); else tri.push(a, b, c, b, d, c);
    }
    const faceGeo = new T.BufferGeometry();
    const fPos = new Float32Array(tri.length * 3), fCol = new Float32Array(tri.length * 3);
    faceGeo.setAttribute('position', new T.BufferAttribute(fPos, 3));
    faceGeo.setAttribute('color', new T.BufferAttribute(fCol, 3));
    const faces = new T.Mesh(faceGeo, new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide, transparent: true, opacity: .9, flatShading: true,
      emissive: 0x3a1a0c, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }));
    scene.add(faces);
    const edges = new Set(), eIdx = [];
    for (let t = 0; t < tri.length; t += 3) for (let e = 0; e < 3; e++) {
      const p = tri[t + e], q = tri[t + (e + 1) % 3], kk = p < q ? p + ',' + q : q + ',' + p;
      if (!edges.has(kk)) { edges.add(kk); eIdx.push(p, q); }
    }
    const wireGeo = new T.BufferGeometry();
    wireGeo.setAttribute('position', new T.BufferAttribute(nodePos, 3));
    wireGeo.setIndex(eIdx);
    const wireMat = new T.LineBasicMaterial({ color: 0xfff6ee, transparent: true, opacity: .55 });
    scene.add(new T.LineSegments(wireGeo, wireMat));
    // interference lines that sweep the wall at the peak (the horizontal scan lines of State 3)
    const NL = 34, ilPos = new Float32Array(NL * 6), ilY = [];
    for (let k = 0; k < NL; k++) ilY.push(.15 + rnd() * (WH - .3));
    const ilGeo = new T.BufferGeometry(); ilGeo.setAttribute('position', new T.BufferAttribute(ilPos, 3));
    const ilMat = new T.LineBasicMaterial({ color: 0xe8552a, transparent: true, opacity: 0 });
    scene.add(new T.LineSegments(ilGeo, ilMat));

    // ---------------------------------------------------------------- the visitor
    const fig = new T.Group();
    const figMat = new T.MeshLambertMaterial({ color: 0x9b8f86, transparent: true, opacity: 1 });
    const body = new T.Mesh(new T.CapsuleGeometry(.17, .82, 6, 14), figMat); body.position.y = .62 + .17; fig.add(body);
    const head = new T.Mesh(new T.SphereGeometry(.12, 18, 14), figMat); head.position.y = 1.62; fig.add(head);
    const legs = new T.Mesh(new T.BoxGeometry(.24, .5, .14), figMat); legs.position.y = .25; fig.add(legs);
    scene.add(fig);

    // ---------------------------------------------------------------- colour ramp: white -> salmon -> orange (the sketch's palette)
    const C0 = new T.Color(0xf3eee8), C1 = new T.Color(0xf3a487), C2 = new T.Color(0xe8552a), tmp = new T.Color();
    const ramp = t => { t = Math.max(0, Math.min(1, t)); return t < .5 ? tmp.copy(C0).lerp(C1, t * 2) : tmp.copy(C1).lerp(C2, (t - .5) * 2); };
    const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

    // ridged pseudo-noise from a few sines: cheap, smooth in time, peaky like the Processing terrain
    const ridge = (x, y, t, k) => {
      const n = Math.sin(x * 2.3 + t * .9 + ph[k] * .15) * .5 + Math.sin(x * 5.1 - y * 3.7 + t * 1.3) * .3 + Math.sin(x * 9.7 + y * 6.1 - t * 1.7 + ph[k] * .3) * .2;
      return Math.pow(1 - Math.abs(n), 3);
    };

    // visitor path along the scroll: far -> range -> mid -> at the door (pause) -> through it
    const path = p => {
      if (p < PH[1]) return 4.1 - .5 * (p / PH[1]);
      if (p < PH[2]) return 3.6 - 1.3 * sm(PH[1], PH[2], p);
      if (p < PH[3]) return 2.3 - 1.3 * sm(PH[2], PH[3], p);
      if (p < PH[4]) return 1.0 - .62 * sm(PH[3], PH[3] + .1, p);
      return .38 - 2.2 * sm(PH[4], PH[4] + .14, p);
    };
    const level = (p, z) => {         // interaction value 0..1, smoothed like the sketch
      if (p >= PH[4]) { const k = sm(PH[4], 1, p); return .95 * (1 - k) * (1 - k) + .12 * k; }
      if (z > R) return 0;
      return Math.pow(1 - (z - .38) / (R - .38), 1.35);
    };

    let yaw = .62, pitch = .2, drag = null, idle = 0;
    stage.addEventListener('pointerdown', e => { drag = [e.clientX, e.clientY, yaw, pitch]; stage.setPointerCapture(e.pointerId); stage.classList.add('grab'); });
    stage.addEventListener('pointermove', e => { if (!drag) return; yaw = Math.max(-1.25, Math.min(1.25, drag[2] - (e.clientX - drag[0]) * .006)); pitch = Math.min(.75, Math.max(.02, drag[3] + (e.clientY - drag[1]) * .004)); idle = 0; frame(); });
    const end = () => { drag = null; stage.classList.remove('grab'); };
    stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end);
    stage.tabIndex = 0; stage.setAttribute('role', 'application'); stage.setAttribute('aria-roledescription', '3D scene');
    stage.setAttribute('aria-label', ((sec.querySelector('.ex-hint') || {}).textContent || '3D scene') + '. Arrow keys turn it.');
    stage.addEventListener('keydown', e => {
      const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]; if (!d) return;
      e.preventDefault(); yaw = Math.max(-1.25, Math.min(1.25, yaw - d[0] * .12)); pitch = Math.min(.75, Math.max(.02, pitch + d[1] * .06)); frame();
    });

    const fp = new URLSearchParams(location.search).get('explode');
    let W = 0, H = 0, top = 0, span = 1, clock = 0, lvl = 0;
    const measure = () => { top = sec.getBoundingClientRect().top + scrollY; span = Math.max(1, sec.offsetHeight - innerHeight); };
    const size = () => { W = stage.clientWidth; H = stage.clientHeight; renderer.setSize(W, H, false); cam.aspect = W / Math.max(1, H); cam.updateProjectionMatrix(); measure(); };

    function frame() {
      let p = Math.min(1, Math.max(0, (scrollY - top) / span));
      if (reduce) p = Math.min(p, .7);
      if (fp !== null) p = +fp;
      const z = path(p), target = level(p, z);
      lvl = reduce || fp !== null ? target : lvl + (target - lvl) * .35;      // smoothed, as in the sketch
      const t = clock;
      // visitor
      fig.position.set(.04, 0, z);
      figMat.opacity = z < -.5 ? Math.max(0, 1 + (z + .5) * 1.4) : 1;
      fig.visible = figMat.opacity > .01;
      // skin displacement: a calm woven texture everywhere, peaks that gather around the visitor's side of the wall
      const near = Math.max(0, Math.min(1, 1 - (z - .38) / (R + .6)));
      for (let k = 0; k < nodes; k++) {
        const x = bx[k], y = by[k];
        const focus = Math.exp(-(x * x) / (0.5 + 2.6 * (1 - near) + 1.2 * lvl));
        const amp = .03 + lvl * (.16 + .62 * focus);
        const r = ridge(x, y, t, k);
        const d = amp * r;
        disp[k] = Math.min(1, (lvl * .55 + focus * lvl * .6) * r * 1.4);
        nodePos[k * 3] = x; nodePos[k * 3 + 1] = y + d * .55; nodePos[k * 3 + 2] = .02 + d;
      }
      for (let n = 0; n < tri.length; n++) {
        const k = tri[n];
        fPos[n * 3] = nodePos[k * 3]; fPos[n * 3 + 1] = nodePos[k * 3 + 1]; fPos[n * 3 + 2] = nodePos[k * 3 + 2];
      }
      for (let n = 0; n < tri.length; n += 3) {
        const c = ramp((disp[tri[n]] + disp[tri[n + 1]] + disp[tri[n + 2]]) / 3 + lvl * .25);
        for (let m = 0; m < 3; m++) { fCol[(n + m) * 3] = c.r; fCol[(n + m) * 3 + 1] = c.g; fCol[(n + m) * 3 + 2] = c.b; }
      }
      faceGeo.attributes.position.needsUpdate = true; faceGeo.attributes.color.needsUpdate = true;
      wireGeo.attributes.position.needsUpdate = true;
      faces.material.opacity = .28 + .62 * Math.min(1, lvl * 1.6);
      wireMat.opacity = .62 - .25 * lvl;
      // interference: horizontal lines across the whole wall, only near the peak
      const inter = Math.max(0, (lvl - .62) / .38);
      for (let k = 0; k < NL; k++) {
        const y = ilY[k] + Math.sin(t * 2 + k) * .02, x0 = -WW / 2 + .02 + ((k * 37) % 11) / 11 * .4;
        ilPos.set([x0, y, .015, WW / 2 - .02 - ((k * 53) % 7) / 7 * .6, y, .015], k * 6);
      }
      ilGeo.attributes.position.needsUpdate = true;
      ilMat.opacity = .55 * inter;
      // sensor range glows while someone is inside it
      arcs.forEach((a, i) => { a.material.opacity = .18 + .5 * (z < R * (1 - i * .34) && p < PH[4] ? 1 : 0); });
      // camera
      const asp = W / Math.max(1, H), dist = 8.2 * Math.max(1, 1.08 / asp);
      cam.position.set(Math.sin(yaw) * Math.cos(pitch) * dist, 1.15 + Math.sin(pitch) * dist, 1.2 + Math.cos(yaw) * Math.cos(pitch) * dist);
      cam.lookAt(0, 1.0, 1.15);
      renderer.render(scene, cam);
      // steps + readout
      let s = 0; while (s < 4 && p >= PH[s + 1]) s++;
      steps.forEach((li, i) => { li.classList.toggle('on', i === s); li.classList.toggle('done', i < s); });
      read.innerHTML = p >= PH[4] ? 'Visitor <b>gone</b> &nbsp;/&nbsp; trace ' + Math.round(lvl * 100) + '%' :
        'Distance <b>' + Math.max(0, z - .2).toFixed(1) + ' m</b> &nbsp;/&nbsp; interaction ' + Math.round(lvl * 100) + '%';
      bar.style.transform = 'scaleX(' + p.toFixed(4) + ')';
    }
    scene.traverse(o => { [].concat(o.material || []).forEach(m => { if (m.side === T.DoubleSide) m.forceSinglePass = true; }); });
    size(); frame();
    try { renderer.compile(scene, cam); } catch (e) {}
    const nearSec = () => scrollY + innerHeight > top - 80 && scrollY < top + span + innerHeight + 80;
    let sRaf = 0; addEventListener('scroll', () => { if (sRaf || !nearSec()) return; sRaf = requestAnimationFrame(() => { sRaf = 0; frame(); }); }, { passive: true });
    addEventListener('resize', () => { size(); frame(); });
    if (window.ResizeObserver) new ResizeObserver(measure).observe(document.body);
    // the skin breathes in time while the section is on screen (about 30 fps); still for reduced motion
    if (!reduce && fp === null) {
      let vis = false, raf = 0, last = 0;
      const tick = ts => {
        raf = 0;
        if (!vis || document.hidden) return;
        if (ts - last > 32) { clock += Math.min(.06, (ts - last) / 1000) * (.35 + lvl * 1.4); last = ts; if (!drag && ++idle > 200) yaw += Math.sin(clock * .2) * .0006; frame(); }
        raf = requestAnimationFrame(tick);
      };
      new IntersectionObserver(es => { vis = es[es.length - 1].isIntersecting; if (vis && !raf) { last = performance.now(); raf = requestAnimationFrame(tick); } }).observe(sec);
      document.addEventListener('visibilitychange', () => { if (vis && !raf && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(tick); } });
    }
    sec.classList.add('loaded');
  }
})();
