// Osborn Plaza market canopy: scroll-driven deployment story (three.js r160 UMD + window.OSBORN_MODEL).
// 1 one folded cart deploys (outriggers, planted ballast, mast, width, wings, reed skin) and lifts to table height
// 2 camera pulls back, the farmers'-market layout drops in   3 the plaza switches to the daily seat layout
// 4 the sun sweeps a July day with real shadows. Drag to orbit. Without WebGL the section is removed.
(() => {
  const sec = document.querySelector('[data-model3d][data-anim="deploy"]');
  if (!sec) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const gl = (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } })();
  if (!gl) { sec.remove(); return; }
  sec.classList.add('ready');

  // the step list is styled once for every project in fx.css (.m3-steps); only the sun clock is specific to this story
  const css = document.createElement('style');
  css.textContent = '[data-anim="deploy"] .osb-clock{position:absolute;left:0;top:4px;pointer-events:none;opacity:0;transition:opacity .4s}[data-anim="deploy"] .osb-clock b{font-weight:400;color:var(--ink);margin-left:10px;font-size:13px;letter-spacing:.08em}[data-anim="deploy"] .osb-clock svg{display:block;margin-top:6px}';
  document.head.appendChild(css);

  const up = sec.dataset.up || '';
  const load = src => new Promise((ok, no) => {   // shared with the explorer: never load the same script twice
    const u = up + src, o = [...document.scripts].find(x => x.getAttribute('src') === u);
    if (o) { if (o.dataset.ok) ok(); else { o.addEventListener('load', ok); o.addEventListener('error', no); } return; }
    const s = document.createElement('script'); s.src = u; s.onload = () => { s.dataset.ok = 1; ok(); }; s.onerror = no; document.head.appendChild(s); });
  let started = false;
  // on failure the section collapses to its caption and says what to do, instead of leaving screens of empty scroll
  const fail = e => { if (e) console.error(e); sec.classList.add('failed'); const w = sec.querySelector('.m3-wait'); if (w) w.textContent = 'The 3D model didn\u2019t load. Reload the page to try again.'; };
  const go = () => { if (started) return; started = true; load('assets/vendor/three.min.js').then(() => load(sec.dataset.model)).then(init).catch(fail); };
  new IntersectionObserver((es, o) => { if (es.some(e => e.isIntersecting)) { o.disconnect(); go(); } }, { rootMargin: '600px 0px' }).observe(sec);
  // desktop: warm the scene up while the reader is still on the hero, so the main-thread build never lands mid-scroll
  if (matchMedia('(pointer: fine)').matches && innerWidth > 900) addEventListener('load', () => setTimeout(() => (window.requestIdleCallback || (f => setTimeout(f, 1)))(go, { timeout: 4000 }), 1200), { once: true });


  // story beats (scroll progress p in 0..1)
  const STEPS = [[0, 'Arrives folded on its casters'], [.05, 'Outriggers swing out, planted ballast drops in'], [.13, 'Mast telescopes, bamboo wings unfold, reed skin stretches'],
    [.275, 'Top lifts to market-table height'], [.36, 'Farmers’ market: 15 units fill the plaza'], [.6, 'Daily mode: 10 units become shaded benches'], [.79, 'Shade through a July day']];

  function init() {
    const T = window.THREE, M = window.OSBORN_MODEL, stage = sec.querySelector('.m3-stage');
    const labels = [...sec.querySelectorAll('.ex-labels li')], bar = sec.querySelector('.ex-bar span');
    const stepsEl = sec.querySelector('.m3-steps');
    if (stepsEl) stepsEl.innerHTML = STEPS.map((s, i) => '<li><i>' + String(i + 1).padStart(2, '0') + '</i><span>' + s[1] + '</span></li>').join('');
    const steps = stepsEl ? [...stepsEl.children] : [];
    const clock = document.createElement('div'); clock.className = 'osb-clock label'; stage.appendChild(clock);

    const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(1.5, devicePixelRatio));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    stage.prepend(renderer.domElement);
    const scene = new T.Scene();
    const cam = new T.OrthographicCamera(-1, 1, 1, -1, -2000, 2000);
    scene.add(new T.HemisphereLight(0xffffff, 0xd9d2c5, 1.35));
    const sun = new T.DirectionalLight(0xfff6ea, 2.1);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
    scene.add(sun, sun.target);
    const root = new T.Group(); root.rotation.x = -Math.PI / 2; scene.add(root);   // Rhino Z-up feet -> three Y-up

    const b64 = s => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; };
    const geom = (e, ctr, ext) => {
      const q = new Int16Array(b64(e.p)), pos = new Float32Array(q.length), k = ext / 32000;
      for (let i = 0; i < q.length; i += 3) { pos[i] = q[i] * k + ctr[0]; pos[i + 1] = q[i + 1] * k + ctr[1]; pos[i + 2] = q[i + 2] * k + ctr[2]; }
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(pos, 3));
      g.setIndex(new T.BufferAttribute(e.x ? new Uint32Array(b64(e.i)) : new Uint16Array(b64(e.i)), 1));
      g.computeVertexNormals(); return g;
    };
    const mats = {};
    const mat = (c, o = {}) => new T.MeshLambertMaterial(Object.assign({ color: c, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }, o));
    const UCOL = { bamboo: 0xc9a46a, timber: 0xd4b582, reed: 0xbfa476, steel: 0x8e8981, hard: 0x55514c, liner: 0x6f604f, soil: 0x7a6248, herb: 0x83a065 };
    const CCOL = { pave: 0xe7e2d8, pave2: 0xddd4c4, road: 0xd3cec5, walk: 0xe4dfd5, mark: 0xf8f6f1, soil: 0xbcae96, trunk: 0x8f7f6c, crown: 0xaebd94, green: 0x9fb284,
      steelbox: 0x76716a, metal: 0x66615b, stone: 0xcfc9be, wall: 0xdcd6ca, brick: 0xcfa892, dark: 0x77716a, glass: 0xbccbd1, mural: 0xe6dccd, plinth: 0xebe7df };
    const edgeMat = new T.LineBasicMaterial({ color: 0x2a2724, transparent: true, opacity: .3 });
    const ctxEdge = new T.LineBasicMaterial({ color: 0x2a2724, transparent: true, opacity: .16 });
    const groundEdge = new T.LineBasicMaterial({ color: 0x2a2724, transparent: true, opacity: 0 });

    // ---------------- context: ground stays, everything vertical grows out of the plaza during the pull-back
    const U = M.unit, ctx = M.ctx;
    const grow = new T.Group(); root.add(grow);
    const STATIC = { pave: 1, pave2: 1, road: 1, walk: 1, mark: 1, soil: 1, plinth: 1 };
    const groundMats = [];
    ctx.parts.forEach(pt => {
      const g = geom(pt, ctx.ctr, ctx.ext), flat = pt.c === 'crown' || pt.c === 'green' || pt.c === 'trunk';
      const top = pt.c === 'pave2' || pt.c === 'mark' || pt.c === 'soil';            // coplanar with the paving: win the depth test
      const o = top ? { flatShading: flat, polygonOffsetFactor: -1, polygonOffsetUnits: -4 } : { flatShading: flat };
      if (pt.c === 'crown') Object.assign(o, { transparent: true, opacity: .55, depthWrite: false });   // canopies stay readable under the trees; shadows stay solid
      const m = new T.Mesh(g, mat(CCOL[pt.c], o));
      if (STATIC[pt.c]) groundMats.push(m.material);
      m.receiveShadow = true; m.castShadow = !STATIC[pt.c];
      (STATIC[pt.c] ? root : grow).add(m);
      if (pt.c === 'plinth' || pt.c === 'wall' || pt.c === 'brick' || pt.c === 'pave' || pt.c === 'pave2' || pt.c === 'stone' || pt.c === 'mural' || pt.c === 'steelbox')
        (STATIC[pt.c] ? root : grow).add(new T.LineSegments(new T.EdgesGeometry(g, 30), STATIC[pt.c] ? groundEdge : ctxEdge));
    });
    // trees grow from their base, one after another
    const trunkMat = mat(CCOL.trunk, { flatShading: true }), crownMat = mat(CCOL.crown, { flatShading: true, transparent: true, opacity: .55, depthWrite: false });
    const trees = (ctx.trees || []).map((t, i) => {
      const grp = new T.Group(); grp.position.set(t.b[0], t.b[1], t.b[2]); root.add(grp);
      [[t.t, trunkMat], [t.c, crownMat]].forEach(([e, m]) => { if (!e) return; const me = new T.Mesh(geom(e, [0, 0, 0], 60), m); me.castShadow = me.receiveShadow = true; grp.add(me); });
      return grp;
    });
    const shadowGround = new T.Mesh(new T.PlaneGeometry(3000, 3000), new T.ShadowMaterial({ opacity: .16 }));
    shadowGround.position.z = -0.45; shadowGround.receiveShadow = true; root.add(shadowGround);

    // ---------------- people (two crowds) merged into one mesh each
    const peopleMat = mat(0xbdb7ac, { flatShading: true });
    const protos = M.people.protos.map(e => geom(e, [0, 0, 3], 8));
    const crowd = list => {
      const gs = list.map(([k, x, y, a]) => { const g = protos[k].clone(); g.applyMatrix4(new T.Matrix4().makeRotationZ(a).setPosition(x, y, 0)); return g; });
      const pos = [], idx = []; let n = 0;
      gs.forEach(g => { const P = g.attributes.position.array, I = g.index.array; for (let i = 0; i < P.length; i++) pos.push(P[i]); for (let i = 0; i < I.length; i++) idx.push(I[i] + n); n += P.length / 3; });
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      const m = new T.Mesh(g, peopleMat); m.castShadow = m.receiveShadow = true; m.visible = false; root.add(m); return m;
    };
    const crowdM = crowd(M.people.market), crowdD = crowd(M.people.daily);

    // ---------------- market goods: crates + produce, instanced, pop in per stall
    const GCOL = [0x7f9c5c, 0xd98c3f, 0xc77d8e, 0xc99b5c, 0xa65a4b, 0x93abb6, 0xefe8d6];
    const crates = M.goods.crates, produce = M.goods.produce;
    const crateM = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), mat(0xffffff), crates.length);
    const prodM = new T.InstancedMesh(new T.IcosahedronGeometry(1, 1), mat(0xffffff, { flatShading: true }), produce.length);
    const col = new T.Color();
    crates.forEach((c, i) => crateM.setColorAt(i, col.set(c[1] ? 0xe2e5e4 : 0x9e8466)));
    produce.forEach((c, i) => prodM.setColorAt(i, col.set(GCOL[c[1]])));
    [crateM, prodM].forEach(m => { m.castShadow = true; m.frustumCulled = false; m.instanceMatrix.setUsage(T.DynamicDrawUsage); root.add(m); });

    // ---------------- the unit: one InstancedMesh per (motion cluster, material); instance = agent (market slot)
    const LAY = M.layout, N = LAY.market.length, HERO = LAY.hero;
    const reedTex = () => {
      const cv = document.createElement('canvas'); cv.width = 4; cv.height = 64; const x = cv.getContext('2d');
      for (let r = 0; r < 64; r += 4) { const k = (r * 37 % 11) / 11; x.fillStyle = 'rgb(' + (196 + k * 14 | 0) + ',' + (170 + k * 12 | 0) + ',' + (120 + k * 8 | 0) + ')'; x.fillRect(0, r, 4, 3); x.fillStyle = '#9c8058'; x.fillRect(0, r + 3, 4, 1); }
      const t = new T.CanvasTexture(cv); t.wrapS = t.wrapT = T.RepeatWrapping; t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; return t;
    };
    const umeshes = U.meshes.map(e => {
      const g = geom(e, U.ctr, U.ext);
      if (e.c === 'reed') {                                   // planar UVs so the reed mat reads as stems, not board
        const P = g.attributes.position.array, uv = new Float32Array(P.length / 3 * 2);
        for (let i = 0, j = 0; i < P.length; i += 3, j += 2) { uv[j] = P[i] / 3; uv[j + 1] = P[i + 1] / 1.2; }
        g.setAttribute('uv', new T.BufferAttribute(uv, 2));
        if (!mats.reed) mats.reed = mat(0xffffff, { map: reedTex() });
      }
      if (!mats[e.c]) mats[e.c] = mat(UCOL[e.c]);
      const m = new T.InstancedMesh(g, mats[e.c], N);
      m.castShadow = m.receiveShadow = true; m.frustumCulled = false; m.instanceMatrix.setUsage(T.DynamicDrawUsage);
      root.add(m);
      let edge = null;
      if (e.c !== 'hard' && e.c !== 'herb' && e.c !== 'soil') { edge = new T.LineSegments(new T.EdgesGeometry(g, 28), edgeMat); edge.matrixAutoUpdate = false; root.add(edge); }
      return { m, g: e.g, edge };
    });

    // staged kinematics: each op is a translation / hinge rotation / affine, scaled by its stage's progress
    const SW = { legs: [0, .22], ballast: [.17, .36], lift: [.33, .55], width: [.5, .67], fold: [.62, .86], skin: [.83, 1], tabA: [0, .75], tabB: [.25, 1] };
    const SN = U.stages, sm = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
    const sp = (s, v) => { const w = SW[s]; return sm((v - w[0]) / (w[1] - w[0])); };
    const tmpA = new T.Matrix4(), tmpB = new T.Matrix4(), tmpC = new T.Matrix4(), ax = new T.Vector3();
    const applyOps = (out, ops, fOf) => {
      for (const o of ops) {
        const f = fOf(SN[o.s]);
        if (f === 0) continue;
        if (o.t) tmpA.makeTranslation(o.t[0] * f, o.t[1] * f, o.t[2] * f);
        else if (o.r) {
          ax.set(o.r[0], o.r[1], o.r[2]);
          tmpA.makeTranslation(o.c[0], o.c[1], o.c[2]).multiply(tmpB.makeRotationAxis(ax, o.a * f)).multiply(tmpC.makeTranslation(-o.c[0], -o.c[1], -o.c[2]));
        } else {
          const m = o.m; tmpA.set(1 + (m[0] - 1) * f, m[1] * f, m[2] * f, m[3] * f, m[4] * f, 1 + (m[5] - 1) * f, m[6] * f, m[7] * f, m[8] * f, m[9] * f, 1 + (m[10] - 1) * f, m[11] * f, 0, 0, 0, 1);
        }
        out.premultiply(tmpA);
      }
      return out;
    };
    const HIDE = new T.Matrix4().makeScale(0, 0, 0);
    // pose of cluster ci for deployment d (0 folded .. 1 open) and table t (0 seat .. 1 table); returns false if hidden
    const pose = (out, ci, d, t) => {
      const c = U.clusters[ci]; out.identity();
      if (c.k === 'skin') { const s = sp('skin', d); if (s < .01) return false; out.makeTranslation(0, c.py, 0).multiply(tmpB.makeScale(1, s, 1)).multiply(tmpC.makeTranslation(0, -c.py, 0)); return true; }
      if (c.k === 'roll') {
        const s = 1 - sp('skin', d); if (s < .01) return false;
        const cx = (c.lo[0] + c.hi[0]) / 2, cy = (c.lo[1] + c.hi[1]) / 2, cz = (c.lo[2] + c.hi[2]) / 2;
        out.makeTranslation(cx, cy, cz).multiply(tmpB.makeScale(s, 1, 1)).multiply(tmpC.makeTranslation(-cx, -cy, -cz)); return true;
      }
      if (c.k === 'ballast') { const s = sp('ballast', d); if (s <= 0) return false; const e = 1 - s; out.makeTranslation(0, 0, 7 * e * e); return true; }
      applyOps(out, c.tr, s => 1 - sp(s, d));
      applyOps(out, c.tb, s => sp(s, t));
      return true;
    };

    // agents: one per market slot; daily layout reuses 10 of them, the other 5 fold up and are lifted away
    const place = new T.Matrix4(), mm = new T.Matrix4(), pt3 = new T.Vector3();
    const dailyOf = new Array(N).fill(null); LAY.daily.forEach(d => { dailyOf[d[0]] = d; });
    const hx = LAY.market[HERO][0], hy = LAY.market[HERO][1];
    const order = [...Array(N).keys()].filter(i => i !== HERO).sort((a, b) => Math.hypot(LAY.market[a][0] - hx, LAY.market[a][1] - hy) - Math.hypot(LAY.market[b][0] - hx, LAY.market[b][1] - hy));
    const landAt = new Array(N); landAt[HERO] = .36; order.forEach((j, r) => { landAt[j] = .405 + .1 * r / Math.max(1, order.length - 1); });
    const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
    const easeIO = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const ramp = (p, a, len) => easeIO(clamp((p - a) / len));
    const agent = (i, p) => {
      const mk = LAY.market[i], dl = dailyOf[i];
      let x = mk[0], y = mk[1], z = 0, a = mk[2], d = 1, t = 1, vis = true;
      if (i === HERO) { d = ramp(p, .04, .23); t = ramp(p, .28, .07); }
      else { const s = clamp((p - landAt[i]) / .055); if (s <= 0) vis = false; const e = 1 - s; z = 40 * e * e * e; }
      if (p > .6) {
        if (dl) {
          t = Math.min(t, 1 - ramp(p, .62, .08));
          let da = dl[3] - mk[2]; while (da > Math.PI + 1e-3) da -= 2 * Math.PI; while (da < -Math.PI + 1e-3) da += 2 * Math.PI;
          const r = ramp(p, .635, .1); a = mk[2] + da * r; x = mk[0] + (dl[1] - mk[0]) * r; y = mk[1] + (dl[2] - mk[1]) * r;
          z = Math.max(z, Math.sin(Math.PI * r) * .6 * (Math.abs(da) > .1 ? 1 : 0));
        } else {
          d = 1 - ramp(p, .61, .085); t = Math.min(t, 1 - ramp(p, .61, .04));
          const l = clamp((p - .7) / .07); z = 90 * l * l; if (l >= 1) vis = false;
        }
      }
      return { x, y, z, a, d, t, vis };
    };

    // ---------------- sun path (computed for Brooklyn, July 19) + key light for the build-up
    const SUN = M.sun, sunDir = h => { const k = clamp((h - SUN.h0) / SUN.dh, 0, SUN.dirs.length - 1), i = Math.floor(k), f = k - i, A = SUN.dirs[i], B = SUN.dirs[Math.min(i + 1, SUN.dirs.length - 1)]; return new T.Vector3(A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f, A[2] + (B[2] - A[2]) * f).normalize(); };
    const KEY = new T.Vector3(-.5, -.62, .78).normalize();
    // small sun-altitude dial next to the clock (x = hour 6..21, y = altitude)
    const dialXY = h => { const s = sunDir(h); return [4 + (h - 6) / 15 * 132, 40 - Math.max(0, s.z) * 36]; };
    let dpath = ''; for (let h = 6; h <= 21; h += .25) { const [x, y] = dialXY(h); dpath += (dpath ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1); }
    clock.innerHTML = '<span>July 19 &middot; Brooklyn</span><b></b><svg width="140" height="46" viewBox="0 0 140 46" aria-hidden="true">' +
      '<line x1="2" y1="40" x2="138" y2="40" stroke="#d9d6cd"/><path d="' + dpath + '" fill="none" stroke="#8a6a3f" stroke-width="1" stroke-dasharray="2 2"/>' +
      '<circle r="4" fill="#e3ad4f"/></svg>';
    const clockT = clock.querySelector('b'), dot = clock.querySelector('circle');
    const hhF = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' });
    const hh = h => hhF.format(Date.UTC(2000, 0, 1, 0, Math.round(h * 4) * 15));   // quarter hours, e.g. 14:15

    // ---------------- camera: axonometric, drag to orbit (adds to the scripted view)
    let dyaw = 0, dpitch = 0, drag = null;
    stage.addEventListener('pointerdown', e => { drag = [e.clientX, e.clientY, dyaw, dpitch]; stage.setPointerCapture(e.pointerId); stage.classList.add('grab'); });
    stage.addEventListener('pointermove', e => { if (!drag) return; dyaw = drag[2] - (e.clientX - drag[0]) * .008; dpitch = clamp(drag[3] + (e.clientY - drag[1]) * .005, -.4, .5); frame(); });
    const end = () => { drag = null; stage.classList.remove('grab'); };
    stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end);
    // keyboard alternative to dragging: the stage takes focus once the model is here; arrow keys turn it
    stage.tabIndex = 0; stage.setAttribute('role', 'application'); stage.setAttribute('aria-roledescription', '3D model');
    stage.setAttribute('aria-label', ((sec.querySelector('.ex-hint') || {}).textContent || '3D model') + '. Arrow keys turn it.');
    stage.addEventListener('keydown', e => {
      const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]; if (!d) return;
      e.preventDefault(); dyaw -= d[0] * .15; dpitch = clamp(dpitch + d[1] * .08, -.4, .5); frame();
    });

    const fp = new URLSearchParams(location.search).get('explode');
    let W = 0, H = 0, top = 0, span = 1;
    // section geometry is measured on resize / layout change, never inside the scroll frame
    const measure = () => { top = sec.getBoundingClientRect().top + scrollY; span = Math.max(1, sec.offsetHeight - innerHeight); };
    let clockH = 60;    // the sun clock in the stage's top-left corner: the fitted plaza keeps clear of it
    const size = () => { W = stage.clientWidth; H = stage.clientHeight; renderer.setSize(W, H, false); clockH = clock.offsetHeight + 12 || 60; measure(); };
    labels.forEach(li => { li.style.top = '0'; });
    const tgt = new T.Vector3(), lerp = (a, b, k) => a + (b - a) * k;
    const heroW = new T.Vector3(hx, 3.4, -hy);              // three coords of the hero unit
    // fit the site tile (plinth bottom to tree tops) into the view; returns target (three coords) + half height
    const TL = ctx.tile, corners = [];
    [TL[0], TL[1]].forEach(x => [TL[2], TL[3]].forEach(y => [-2.2, 24].forEach(z => corners.push(new T.Vector3(x, z, -y)))));
    const fwd = new T.Vector3(), rgt = new T.Vector3(), upv = new T.Vector3(), Y = new T.Vector3(0, 1, 0), mid = new T.Vector3();
    const fitTile = (yaw, pitch, asp, narrow) => {
      fwd.set(-Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
      rgt.crossVectors(fwd, Y).normalize(); upv.crossVectors(rgt, fwd).normalize();
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      corners.forEach(c => { const a = c.dot(rgt), b = c.dot(upv); x0 = Math.min(x0, a); x1 = Math.max(x1, a); y0 = Math.min(y0, b); y1 = Math.max(y1, b); });
      const top = Math.min(.3, Math.max(narrow ? .05 : .07, clockH / Math.max(1, H)));   // headroom for the clock
      let half = Math.max((y1 - y0) / 2 / (1 - top), (x1 - x0) / 2 / asp) * 1.03;
      mid.copy(rgt).multiplyScalar((x0 + x1) / 2).addScaledVector(upv, (y0 + y1) / 2 + half * top);
      const c = mid.clone().addScaledVector(fwd, (4 - mid.y) / fwd.y);  // slide along the view line onto the plaza (ortho: same image)
      return { c, half };
    };
    const anchorsY = [];
    function frame() {
      let p = clamp((scrollY - top) / span);
      if (reduce) p = 1;
      if (fp !== null) p = clamp(+fp);
      const k = ramp(p, .355, .15);                            // hero close-up -> plaza

      // units
      for (let i = 0; i < N; i++) {
        const s = agent(i, p);
        place.makeRotationZ(s.a).setPosition(s.x, s.y, s.z);
        for (const um of umeshes) {
          const ok = s.vis && pose(mm, um.g, s.d, s.t);
          if (ok) mm.premultiply(place);
          um.m.setMatrixAt(i, ok ? mm : HIDE);
          if (i === HERO && um.edge) { um.edge.visible = ok && edgeMat.opacity > .01; if (ok) um.edge.matrix.copy(mm); }
        }
        if (i === HERO) anchorsY.length = 0, U.anchors.forEach(([ci, q]) => { pose(mm, ci, s.d, s.t); pt3.set(q[0], q[1], q[2]).applyMatrix4(mm).applyMatrix4(place); anchorsY.push(new T.Vector3(pt3.x, pt3.z, -pt3.y)); });
      }
      umeshes.forEach(u => { u.m.instanceMatrix.needsUpdate = true; });
      edgeMat.opacity = .3 * (1 - k) + .06 * k;

      // context, crowds, goods
      const g = ramp(p, .37, .13);
      grow.scale.set(1, 1, Math.max(.001, g)); grow.visible = g > 0;
      const gf = ramp(p, .355, .1);
      groundMats.forEach(m => { m.opacity = gf; m.transparent = gf < 1; m.depthWrite = gf > .5; }); groundEdge.opacity = .16 * gf;
      trees.forEach((t, i) => { const s = ramp(p, .375 + .018 * i, .1); t.visible = s > .001; t.scale.setScalar(Math.max(.001, s)); });
      shadowGround.visible = gf < 1; shadowGround.material.opacity = .16 * (1 - gf);
      const mOn = ramp(p, .5, .06) * (1 - ramp(p, .6, .03)), dOn = ramp(p, .735, .05);
      crowdM.visible = mOn > 0; crowdM.scale.set(1, 1, Math.max(.001, mOn));
      crowdD.visible = dOn > 0; crowdD.scale.set(1, 1, Math.max(.001, dOn));
      const gOff = 1 - ramp(p, .6, .03);
      const gs = st => ramp(p, Math.max(.5, landAt[st] + .02), .04) * gOff;
      crates.forEach((c, i) => {
        const s = gs(c[0]);
        if (s <= 0) { crateM.setMatrixAt(i, HIDE); return; }
        mm.makeScale(Math.max(.01, c[5] - c[2]) * s, Math.max(.01, c[6] - c[3]) * s, Math.max(.01, c[7] - c[4]) * s).setPosition((c[2] + c[5]) / 2, (c[3] + c[6]) / 2, (c[4] + c[7]) / 2);
        crateM.setMatrixAt(i, mm);
      });
      produce.forEach((c, i) => { const s = gs(c[0]) * c[5] * .95; if (s <= 0) { prodM.setMatrixAt(i, HIDE); return; } mm.makeScale(s, s, s * .8).setPosition(c[2], c[3], c[4]); prodM.setMatrixAt(i, mm); });
      crateM.instanceMatrix.needsUpdate = prodM.instanceMatrix.needsUpdate = true;

      // light: key light while building up, then the real sun from 8:00 to 18:30
      const sw = clamp((p - .8) / .2), hour = 8 + 10.5 * sw, sdir = sunDir(hour);
      const kb = ramp(p, .78, .03);
      const L = KEY.clone().lerp(sdir, kb).normalize();

      // camera: hero close-up blends into a view fitted to the whole site tile
      const narrow = W < 600, asp = W / Math.max(1, H);
      const yaw = lerp(-.95, asp < .9 ? -.32 : -1.22, k) + dyaw, pitch = clamp(lerp(.36, asp < .9 ? .98 : .92, k) + dpitch, .08, 1.3);   // portrait: plaza runs up the screen
      const fit = fitTile(yaw, pitch, asp, narrow);
      tgt.copy(heroW).lerp(fit.c, k);
      const half = lerp(Math.max(7.4, (narrow ? 6.2 : 9.5) / asp), fit.half, k);
      const off = (1 - k) * (narrow ? 0 : .1) * half * asp;          // leave room for the labels on the right
      cam.left = -half * asp + off; cam.right = half * asp + off; cam.top = half; cam.bottom = -half; cam.updateProjectionMatrix();
      cam.position.set(tgt.x + Math.sin(yaw) * Math.cos(pitch) * 500, tgt.y + Math.sin(pitch) * 500, tgt.z + Math.cos(yaw) * Math.cos(pitch) * 500);
      cam.lookAt(tgt);

      const sh = lerp(16, 92, k);
      sun.target.position.set(tgt.x, 0, tgt.z);
      sun.position.set(tgt.x + L.x * 300, L.z * 300, tgt.z - L.y * 300);
      const sc = sun.shadow.camera; sc.left = -sh; sc.right = sh; sc.top = sh; sc.bottom = -sh; sc.near = 1; sc.far = 700; sc.updateProjectionMatrix();
      sun.intensity = 2.1 * clamp(sdir.z * 6, .25, 1) * kb + 2.1 * (1 - kb);
      const pv = ramp(p, .79, .03);
      clock.style.opacity = pv; const hts = hh(hour); if (clockT.textContent !== hts) clockT.textContent = hts;
      const [dx, dy] = dialXY(hour); dot.setAttribute('cx', dx.toFixed(1)); dot.setAttribute('cy', dy.toFixed(1));

      renderer.render(scene, cam);

      // labels for the unit parts, pinned to their projected height and kept apart
      const hd = ramp(p, .04, .23), ht = ramp(p, .28, .07);
      const on = [sp('skin', hd) > .4, sp('fold', hd) > .3, sp('lift', hd) > .3, ht > .2, sp('ballast', hd) > .5, sp('legs', hd) > .3].map(b => b && p < .37);
      const ys = labels.map((li, i) => i < anchorsY.length ? { li, i, y: (1 - anchorsY[i].clone().project(cam).y) / 2 * H } : null).filter(Boolean).sort((a, b) => a.y - b.y);
      for (let i = 1; i < ys.length; i++) ys[i].y = Math.max(ys[i].y, ys[i - 1].y + 22);
      ys.forEach(o => { o.li.style.transform = 'translate3d(0,' + o.y.toFixed(1) + 'px,0) translateY(-50%)'; o.li.classList.toggle('on', !!on[o.i]); });

      let cur = 0; STEPS.forEach((s, i) => { if (p >= s[0]) cur = i; });
      steps.forEach((li, i) => { li.classList.toggle('on', i === cur); li.classList.toggle('done', i < cur); });
      bar.style.transform = 'scaleX(' + p.toFixed(4) + ')';
    }
    // see-through double-sided parts (tree crowns, the fading ground) draw in one pass: three.js would otherwise draw them
    // twice and flag the material for a program re-check on every frame
    scene.traverse(o => { [].concat(o.material || []).forEach(m => { if (m.side === T.DoubleSide) m.forceSinglePass = true; }); });
    size(); frame();
    // compile every shader now (idle time, before the reader scrolls) instead of on the first frame each part appears
    try { renderer.compile(scene, cam); } catch (e) {}
    let raf = 0;
    const near = () => scrollY + innerHeight > top - 80 && scrollY < top + span + innerHeight + 80;
    addEventListener('scroll', () => { if (raf || !near()) return; raf = requestAnimationFrame(() => { raf = 0; frame(); }); }, { passive: true });
    addEventListener('resize', () => { size(); frame(); });
    if (window.ResizeObserver) new ResizeObserver(measure).observe(document.body);
    sec.classList.add('loaded');
  }
})();
