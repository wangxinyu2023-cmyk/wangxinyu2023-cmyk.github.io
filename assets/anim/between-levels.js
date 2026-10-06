// Between Levels: scroll-driven growth sequence (three.js r160 UMD + window.BL_MODEL).
// Terrain + streets -> structural grid -> wings level by level -> 48 rooms by type -> galleries, stair-street, bridges -> public route.
// Drag to orbit. Removes itself without WebGL.
(() => {
  const sec = document.querySelector('[data-model3d][data-anim="grow"]');
  if (!sec) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const gl = (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } })();
  if (!gl) { sec.remove(); return; }
  sec.classList.add('ready');

  const css = document.createElement('style');
  css.textContent = `
.m3d[data-anim=grow] .m3-steps{list-style:none;margin:26px 0 0;padding:0;max-width:340px}
.m3d[data-anim=grow] .m3-steps li{font-family:var(--sans);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--mute);padding:8px 0 7px;border-top:1px solid var(--line);transition:color .35s}
.m3d[data-anim=grow] .m3-steps li i{font-style:normal;color:var(--line);margin-right:12px;transition:color .35s}
.m3d[data-anim=grow] .m3-steps li span{display:block;font-size:14px;letter-spacing:0;text-transform:none;color:#33322e;line-height:1.45;max-height:0;opacity:0;overflow:hidden;transition:max-height .45s,opacity .45s,margin .45s}
.m3d[data-anim=grow] .m3-steps li.done i,.m3d[data-anim=grow] .m3-steps li.on i{color:var(--accent)}
.m3d[data-anim=grow] .m3-steps li.on{color:var(--ink)}
.m3d[data-anim=grow] .m3-steps li.on span{max-height:64px;opacity:1;margin-top:5px}
.bl-legend{position:absolute;left:0;top:0;max-width:100%;margin:0;padding:0;list-style:none;display:grid;grid-template-columns:repeat(2,auto);gap:5px 18px;pointer-events:none;font-family:var(--sans);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink);opacity:0;transition:opacity .5s}
.bl-legend.on{opacity:1}
.bl-legend .hd{grid-column:1/-1;color:var(--mute);margin-bottom:4px}
.bl-legend li{display:flex;align-items:center;gap:7px;opacity:.28;transition:opacity .35s;white-space:nowrap}
.bl-legend li.on{opacity:1}
.bl-legend li b{width:10px;height:10px;flex:none;border:1px solid rgba(20,20,20,.35)}
.bl-legend .s{display:none}
.bl-legend li em{font-style:normal;color:var(--mute);margin-left:-2px}
.ex-copy .bl-legend{position:static;margin-top:30px;max-width:360px}
.m3d[data-anim=grow] .ex-labels li{background:rgba(245,244,239,.88);padding-left:6px}
.m3d[data-anim=grow] .ex-labels li i{color:var(--accent)}
@media (max-width:900px){
 .m3d[data-anim=grow] .m3-steps{margin-top:14px}
 .m3d[data-anim=grow] .m3-steps li{display:none;border-top:0;padding:0}
 .m3d[data-anim=grow] .m3-steps li.on{display:block}
 .m3d[data-anim=grow] .m3-steps li span{font-size:13px}
 .bl-legend{grid-template-columns:repeat(3,auto);gap:3px 10px;font-size:8.5px;letter-spacing:.06em}
 .bl-legend .hd{margin-bottom:1px}
 .bl-legend li b{width:8px;height:8px}
 .bl-legend .l{display:none}.bl-legend .s{display:inline}
}`;
  document.head.appendChild(css);

  const up = sec.dataset.up || '';
  const load = src => new Promise((ok, no) => {   // shared with the explorer: never load the same script twice
    const u = up + src, o = [...document.scripts].find(x => x.getAttribute('src') === u);
    if (o) { if (o.dataset.ok) ok(); else { o.addEventListener('load', ok); o.addEventListener('error', no); } return; }
    const s = document.createElement('script'); s.src = u; s.onload = () => { s.dataset.ok = 1; ok(); }; s.onerror = no; document.head.appendChild(s); });
  let started = false;
  const go = () => { if (started) return; started = true; load('assets/vendor/three.min.js').then(() => load(sec.dataset.model)).then(init).catch(e => { console.error(e); sec.classList.add('failed'); }); };
  new IntersectionObserver((es, o) => { if (es.some(e => e.isIntersecting)) { o.disconnect(); go(); } }, { rootMargin: '600px 0px' }).observe(sec);
  // desktop: warm the scene up while the reader is still on the hero, so the main-thread build never lands mid-scroll
  if (matchMedia('(pointer: fine)').matches && innerWidth > 900) addEventListener('load', () => setTimeout(() => (window.requestIdleCallback || (f => setTimeout(f, 1)))(go, { timeout: 4000 }), 1200), { once: true });


  const TYPES = [ // prototype, legend name, colour
    ['M01', 'Repair workshop', 0xb7654b, 'Repair'], ['M02', 'Neighbourhood counter', 0xd49a58, 'Counter'], ['M03', 'Making studio', 0xc9b14f, 'Making'],
    ['M04', 'Shared kitchen', 0x98aa5c, 'Kitchen'], ['M05', 'Teaching room', 0x67a07a, 'Teaching'], ['M06', 'Public library', 0x478c8b, 'Library'],
    ['M07', 'Quiet study', 0x6b9cc0, 'Quiet study'], ['M08', 'Meeting room', 0x5a6ca6, 'Meeting'], ['M09', 'Shared workspace', 0x8a72ab, 'Workspace'],
    ['M10', 'Community dining', 0xc47893, 'Dining'], ['M11', 'Reading lounge', 0x9e5468, 'Lounge'], ['M12', 'WC + service', 0x9a958c, 'WC']];
  const STEPS = [
    ['Terrain and streets', 'Three streets meet the slope at +0, +6 and +12 m.'],
    ['Structural grid', 'A 36 × 48 m frame: two 12 m wings on 6 m bays.'],
    ['Stepped wings', 'Both wings climb the hill one 3 m level at a time.'],
    ['48 public rooms', 'Twelve room types, each furnished for its actual width.'],
    ['Shared ground', 'Covered galleries, the planted stair-street and two bridges.'],
    ['A public route', 'From the lower street to the upper one, through the building.']];
  // timeline (scroll progress p)
  const PH = [0, .1, .24, .48, .68, .84, 1.01];

  function init() {
    const T = window.THREE, M = window.BL_MODEL, stage = sec.querySelector('.m3-stage');
    const labels = [...sec.querySelectorAll('.ex-labels li')], bar = sec.querySelector('.ex-bar span');
    const stepsOl = sec.querySelector('.m3-steps');
    const steps = STEPS.map((s, i) => { const li = document.createElement('li'); li.innerHTML = '<i>' + String(i + 1).padStart(2, '0') + '</i>' + s[0] + '<span>' + s[1] + '</span>'; stepsOl && stepsOl.appendChild(li); return li; });
    const legend = document.createElement('ol'); legend.className = 'bl-legend';
    legend.innerHTML = '<div class="hd">48 rooms · 12 types</div>' + TYPES.map(t => '<li><b style="background:#' + t[2].toString(16).padStart(6, '0') + '"></b><span class=l>' + t[1] + '</span><span class=s>' + t[3] + '</span> <em>0</em></li>').join('');
    const mq = matchMedia('(max-width:900px)'), copy = sec.querySelector('.ex-copy');
    const place = () => (mq.matches || !copy ? stage : copy).appendChild(legend); place();
    mq.addEventListener ? mq.addEventListener('change', place) : mq.addListener(place);
    const legLi = [...legend.querySelectorAll('li')], legCount = legLi.map(li => li.querySelector('em'));

    const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(1.5, devicePixelRatio));
    renderer.localClippingEnabled = true;
    stage.prepend(renderer.domElement);
    const scene = new T.Scene();
    const cam = new T.OrthographicCamera(-1, 1, 1, -1, -400, 400);
    scene.add(new T.HemisphereLight(0xffffff, 0xd9d2c5, 1.55));
    const sun = new T.DirectionalLight(0xffffff, 1.45); sun.position.set(-40, 90, 55); scene.add(sun);

    // Rhino metres (Z-up) -> three (Y-up)
    const V3 = (x, y, z) => new T.Vector3(x, z, -y);
    const COL = { earth: 0xe8e2d5, stone: 0xd9d2c4, road: 0xcdc7bb, walk: 0xeee9de, paving: 0xe6dfd0, white: 0xf6f3ec, structure: 0xebe6dc,
      bronze: 0x6e5d48, glass: 0xa9c3cf, foliage: 0x9caf86, landscape: 0xb9c3a0, timber: 0xc7a77b, wood: 0x8e7255, paper: 0xf1ebdf, metal: 0x8d8d88, brass: 0xb39553 };
    const EDGE = new Set(['earth', 'stone', 'road', 'walk', 'paving', 'white', 'structure', 'timber', 'foliage', 'landscape', 'room']);
    const b64 = s => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; };
    const C = M.center, Q = M.q;

    const groups = {}; const G = k => groups[k] || (groups[k] = (() => { const g = new T.Group(); scene.add(g); return g; })());
    const clip = {}; // named clipping planes
    const planeFor = g => g === 'col' ? (clip.col = clip.col || new T.Plane(new T.Vector3(0, -1, 0), -5))
      : (g === 'gallery' || g === 'stair') ? (clip[g] = clip[g] || new T.Plane(new T.Vector3(0, 0, 1), 0))
      : g === 'bridge' ? (clip.bridge = clip.bridge || new T.Plane(new T.Vector3(-1, 0, 0), 0)) : null;
    const rooms = M.rooms.map((r, i) => ({ ...r, i, g: null, vol: null }));

    M.parts.forEach(pt => {
      const q = new Int16Array(b64(pt.p)), pos = new Float32Array(q.length);
      for (let i = 0; i < q.length; i += 3) { pos[i] = q[i] * Q + C[0]; pos[i + 1] = q[i + 2] * Q + C[2]; pos[i + 2] = -(q[i + 1] * Q + C[1]); }
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.BufferAttribute(pos, 3));
      geo.setIndex(new T.BufferAttribute(pt.idx32 ? new Uint32Array(b64(pt.i)) : new Uint16Array(b64(pt.i)), 1));
      geo.computeVertexNormals();
      const pl = planeFor(pt.g), cp = pl ? [pl] : [];
      const glass = pt.c === 'glass', room = pt.room !== undefined;
      const color = room ? new T.Color(TYPES[rooms[pt.room].ty][2]).lerp(new T.Color(0xffffff), .18) : pt.g === 'canopy' && pt.c === 'bronze' ? 0xb49c7c : COL[pt.c];
      const mat = new T.MeshLambertMaterial({ color, side: T.DoubleSide, flatShading: true, transparent: glass, opacity: glass ? .3 : 1, depthWrite: !glass,
        polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, clippingPlanes: cp });
      const mesh = new T.Mesh(geo, mat); mesh.renderOrder = glass ? 3 : 0;
      let parent;
      if (room) { const r = rooms[pt.room]; parent = roomGroup(r); mesh.position.copy(r.piv).negate(); }
      else parent = G(pt.g);
      parent.add(mesh);
      if (EDGE.has(pt.c)) {
        const lines = new T.LineSegments(new T.EdgesGeometry(geo, 25), new T.LineBasicMaterial({ color: 0x2a2724, transparent: true, opacity: room ? .22 : .26, clippingPlanes: cp }));
        lines.position.copy(mesh.position); parent.add(lines);
      }
    });
    function roomGroup(r) {
      if (r.g) return r.g;
      const [x0, y0, x1, y1] = r.b, col = TYPES[r.ty][2];
      r.piv = V3((x0 + x1) / 2, (y0 + y1) / 2, r.z);
      const g = new T.Group(); g.position.copy(r.piv); scene.add(g); r.g = g;
      const w = x1 - x0 - .3, d = y1 - y0 - .3, h = 2.7;
      const box = new T.BoxGeometry(w, h, d); box.translate(0, h / 2 + .03, 0);
      r.vol = new T.Mesh(box, new T.MeshLambertMaterial({ color: col, transparent: true, opacity: .26, depthWrite: false, side: T.DoubleSide }));
      r.vol.renderOrder = 2; g.add(r.vol);
      g.add(new T.LineSegments(new T.EdgesGeometry(box), new T.LineBasicMaterial({ color: new T.Color(col).multiplyScalar(.7), transparent: true, opacity: .85 })));
      const tile = new T.Mesh(new T.BoxGeometry(w, .06, d), new T.MeshLambertMaterial({ color: col, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
      tile.position.y = .04; g.add(tile);
      return g;
    }
    // room pop order: by level, then uphill
    const popOrder = rooms.slice().sort((a, b) => a.lv - b.lv || a.b[1] - b.b[1] || a.b[0] - b.b[0]);

    // roof as a ghosted outline only, so rooms stay readable
    if (groups.roof) {
      const ghost = new T.Group();
      groups.roof.traverse(o => { if (o.isMesh && o.geometry.index && o.material.color.getHex() === COL.structure) ghost.add(new T.LineSegments(new T.EdgesGeometry(o.geometry, 25), new T.LineBasicMaterial({ color: 0x2a2724, transparent: true, opacity: .3 }))); });
      scene.remove(groups.roof); groups.roof = ghost; scene.add(ghost);
    }

    // overlays: street centre lines, structural grid, route
    const accent = 0x8a6a3f, routeCol = 0xd0773f;
    const tube = (pts, r, mat, seg) => { const c = new T.CatmullRomCurve3(pts.map(p => V3(...p)), false, 'centripetal'); const g = new T.TubeGeometry(c, seg, r, 8, false); const m = new T.Mesh(g, mat); m.userData = { curve: c, seg }; scene.add(m); return m; };
    const draw = (m, f) => { const n = Math.round(Math.max(0, Math.min(1, f)) * m.userData.seg); m.geometry.setDrawRange(0, n * 8 * 6); m.visible = n > 0; };
    const lineMat = new T.MeshBasicMaterial({ color: routeCol });
    const streetLines = [
      [[-12, -4, .12], [52, -4, .12]],
      [[52, 25, 6.12], [36, 25, 6.12]],
      [[-12, 52, 12.12], [52, 52, 12.12]]].map(s => tube(s, .3, lineMat, 60));
    const streetTop = [[52, -4, 0], [52, 25, 6], [52, 52, 12]]; // ex-labels list is top-down: upper, middle, lower

    // structural grid lines on the stepped ground
    const gx = M.grid.grid_x, gy = M.grid.grid_y, gz = y => 3 * Math.min(3, Math.floor(y / 12)) - .2, seg = [];
    gx.forEach(x => { for (let k = 0; k < 4; k++) { seg.push([x, 12 * k, 3 * k - .2], [x, 12 * k + 12, 3 * k - .2]); if (k) seg.push([x, 12 * k, 3 * k - 3.2], [x, 12 * k, 3 * k - .2]); } });
    gy.forEach(y => seg.push([-1.5, y, gz(y === 48 ? 47 : y)], [37.5, y, gz(y === 48 ? 47 : y)]));
    const gridGeo = new T.BufferGeometry().setFromPoints(seg.map(p => V3(p[0], p[1], p[2] + .06)));
    const grid = new T.LineSegments(gridGeo, new T.LineBasicMaterial({ color: accent, transparent: true, opacity: .75 })); scene.add(grid);
    const gridN = seg.length;

    // public route: lower street -> stair-street (four 3 m cycles) -> upper street; branch from the +6 middle lane
    const R = [[18, -4, 0], [18, 1.5, 0]];
    for (let k = 0; k < 4; k++) { const y = 12 * k, z = 3 * k; R.push([18, y + 3, z], [18, y + 6, z + 1.5], [18, y + 7.5, z + 1.5], [18, y + 10.5, z + 3]); }
    R.push([18, 49, 12], [18, 52, 12], [8, 52, 12]);
    const lift = p => [p[0], p[1], p[2] + .45];
    const haloMat = new T.MeshBasicMaterial({ color: 0xf0a060, transparent: true, opacity: .3, depthWrite: false, depthTest: false });
    const route = tube(R.map(lift), .42, new T.MeshBasicMaterial({ color: routeCol }), 400);
    const routeHalo = tube(R.map(lift), 1.15, haloMat, 400); routeHalo.renderOrder = 4;
    const B = [[52, 25.5, 6], [40, 25.5, 6], [30, 25.5, 6], [25.5, 25.5, 6], [18.6, 25.5, 6]];
    const branch = tube(B.map(lift), .36, new T.MeshBasicMaterial({ color: routeCol }), 120);
    const branchHalo = tube(B.map(lift), .95, haloMat, 120); branchHalo.renderOrder = 4;
    const head = new T.Mesh(new T.SphereGeometry(.75, 16, 12), new T.MeshBasicMaterial({ color: 0xfff1e0, depthTest: false })); head.renderOrder = 6; scene.add(head);
    const headHalo = new T.Mesh(new T.SphereGeometry(1.9, 20, 14), new T.MeshBasicMaterial({ color: 0xf0a060, transparent: true, opacity: .4, depthWrite: false, depthTest: false })); headHalo.renderOrder = 5; scene.add(headHalo);

    // camera: orthographic axonometric, drag to orbit
    let yawOff = 0, pitchOff = 0, drag = null;
    stage.addEventListener('pointerdown', e => { drag = [e.clientX, e.clientY, yawOff, pitchOff]; stage.setPointerCapture(e.pointerId); stage.classList.add('grab'); });
    stage.addEventListener('pointermove', e => { if (!drag) return; yawOff = drag[2] - (e.clientX - drag[0]) * .008; pitchOff = Math.min(.6, Math.max(-.45, drag[3] + (e.clientY - drag[1]) * .005)); frame(); });
    const end = () => { drag = null; stage.classList.remove('grab'); };
    stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end);

    const clamp = x => Math.min(1, Math.max(0, x));
    const seg01 = (p, a, b) => clamp((p - a) / (b - a));
    const eio = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const eout = t => 1 - Math.pow(1 - t, 3);
    const back = t => { const c = 1.9; return t <= 0 ? 0 : 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
    const fp = new URLSearchParams(location.search).get('explode');
    let W = 0, H = 0, P = 0;
    const size = () => { W = stage.clientWidth; H = stage.clientHeight; renderer.setSize(W, H, false); };
    const box = (xa, xb, ya, yb) => { const o = []; [xa, xb].forEach(x => [ya, yb].forEach(y => [-1, 18.7].forEach(z => o.push(V3(x, y, z))))); return o; };
    const FIT_A = box(-12, 52, -8, 56), FIT_B = box(-5, 44, -7, 55), FIT = FIT_A.map(c => c.clone());
    const tgt = V3(18, 24, 7), v = new T.Vector3();

    function frame(time) {
      const r = sec.getBoundingClientRect(), span = r.height - innerHeight;
      let p = clamp(-r.top / Math.max(1, span));
      if (reduce) p = 1;
      if (fp !== null) p = +fp;
      P = p;
      // 1 terrain + streets
      streetLines.forEach(m => draw(m, 1));
      // 2 grid lines, columns rising
      const gp = eio(seg01(p, PH[1], PH[1] + .08));
      gridGeo.setDrawRange(0, Math.floor(gp * gridN / 2) * 2); grid.visible = gp > 0;
      grid.material.opacity = .75 - .5 * seg01(p, PH[3], PH[4]);
      if (groups.col) { const c = eio(seg01(p, PH[1] + .03, PH[2] + .01)); clip.col.constant = -0.5 + c * 20; groups.col.visible = c > 0; }
      // 3 wings, level by level (each level lowered into place)
      for (let k = 0; k < 5; k++) ['W', 'E'].forEach((w, j) => {
        const g = groups['lvl:' + w + ':' + k]; if (!g) return;
        const t = seg01(p, PH[2] + k * .042 + j * .012, PH[2] + k * .042 + j * .012 + .06);
        g.visible = t > 0; g.position.y = (1 - eout(t)) * 9;
      });
      if (groups.roof) { const t = seg01(p, PH[3] - .03, PH[3]); groups.roof.visible = t > 0; groups.roof.position.y = (1 - eout(t)) * 6; }
      // 4 rooms pop in by type
      const n = popOrder.length, counts = new Array(12).fill(0), fade = .26 - .13 * seg01(p, PH[4], PH[5]);
      popOrder.forEach((rm, i) => {
        const a = PH[3] + .005 + i * ((PH[4] - PH[3] - .04) / n), t = seg01(p, a, a + .032);
        rm.g.visible = t > 0; const s = Math.max(.001, back(t)); rm.g.scale.set(s, Math.max(.001, eout(t)), s);
        rm.vol.material.opacity = fade;
        if (t > .5) counts[rm.ty]++;
      });
      legend.classList.toggle('on', p > PH[3] - .01);
      legLi.forEach((li, i) => { li.classList.toggle('on', counts[i] > 0); legCount[i].textContent = counts[i]; });
      // 5 galleries sweep uphill, stair-street climbs, bridges span
      const sweep = (g, a, b, from, to) => { if (!groups[g]) return; const t = eio(seg01(p, a, b)); clip[g].constant = from + (to - from) * t; groups[g].visible = t > 0; };
      sweep('gallery', PH[4], PH[4] + .07, -1, 49);
      sweep('stair', PH[4] + .02, PH[4] + .1, -1, 51);
      sweep('bridge', PH[4] + .09, PH[4] + .14, 11.8, 24.3);
      if (groups.canopy) { const t = seg01(p, PH[4] + .12, PH[5]); groups.canopy.visible = t > 0; groups.canopy.position.y = (1 - eout(t)) * 6; }
      if (groups.trees) { const t = seg01(p, PH[4] + .04, PH[4] + .12); groups.trees.visible = t > 0; groups.trees.scale.y = Math.max(.001, eout(t)); }
      // 6 the route walks up through the building
      const rt = eio(seg01(p, PH[5], PH[5] + .12)), bt = eio(seg01(p, PH[5] + .07, PH[5] + .15));
      draw(route, rt); draw(routeHalo, rt); draw(branch, bt); draw(branchHalo, bt);
      head.visible = headHalo.visible = rt > 0;
      if (rt > 0) {
        let u = rt;
        if (rt >= 1 && time && !reduce) u = (time / 9000) % 1; // after arrival, a light keeps walking the route
        head.position.copy(route.userData.curve.getPointAt(Math.min(.999, u)));
        headHalo.position.copy(head.position);
        headHalo.scale.setScalar(1 + .18 * Math.sin((time || 0) / 260));
      }
      // camera: slow scroll-linked turn + user drag, fitted to the site
      const ep = eio(p), yaw = .82 - .5 * ep + yawOff, pitch = Math.min(1.3, Math.max(.2, .58 + .2 * ep + pitchOff));
      const zf = eio(seg01(p, .2, 1)); FIT.forEach((c, i) => c.lerpVectors(FIT_A[i], FIT_B[i], zf));
      cam.position.set(tgt.x + Math.sin(yaw) * Math.cos(pitch) * 120, tgt.y + Math.sin(pitch) * 120, tgt.z + Math.cos(yaw) * Math.cos(pitch) * 120);
      cam.lookAt(tgt); cam.updateMatrixWorld();
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      FIT.forEach(c => { v.copy(c).applyMatrix4(cam.matrixWorldInverse); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); });
      // keep the model clear of the street labels on the right (desktop) and the legend below (mobile)
      const mob = W < 600, gut = labels.length && labels[0].offsetParent ? 170 : 0, Wa = Math.max(100, W - gut), asp = Wa / Math.max(1, H);
      const mx = mob ? .86 : 1.04, my = mob ? 1.12 : 1.06;
      let hw = (x1 - x0) / 2 * mx, hh = (y1 - y0) / 2 * my;
      if (hw / hh > asp) hh = hw / asp; else hw = hh * asp;
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2 + (mob ? (y1 - y0) * .06 : 0);
      cam.left = cx - hw; cam.right = cx + hw + hw * 2 * gut / Wa; cam.top = cy + hh; cam.bottom = cy - hh; cam.updateProjectionMatrix();
      renderer.render(scene, cam);
      // street labels pinned to each street's east end; step list; progress bar
      labels.forEach((li, i) => {
        const s = streetTop[2 - i]; v.copy(V3(s[0], s[1], s[2])).project(cam);
        li.style.top = ((1 - v.y) / 2 * 100).toFixed(2) + '%';
        li.classList.toggle('on', p < PH[3] + .04 || p > PH[5]);
      });
      const cur = PH.findIndex((a, i) => p >= a && p < PH[i + 1]);
      steps.forEach((li, i) => { li.classList.toggle('on', i === Math.min(5, cur)); li.classList.toggle('done', i < cur); });
      bar.style.width = (p * 100).toFixed(1) + '%';
    }
    size(); frame();
    let sRaf = 0; addEventListener('scroll', () => { if (sRaf) return; const rr = sec.getBoundingClientRect(); if (rr.bottom < -80 || rr.top > innerHeight + 80) return; sRaf = requestAnimationFrame(t => { sRaf = 0; frame(t); }); }, { passive: true });
    addEventListener('resize', () => { size(); frame(); });
    // once the route is complete, keep a light walking it while the section is on screen
    if (!reduce && fp === null) {
      let vis = false;
      new IntersectionObserver(es => { vis = es[0].isIntersecting; }).observe(sec);
      const loop = t => { if (vis && P > PH[5] + .12 && !drag) frame(t); requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    }
    sec.classList.add('loaded');
  }
})();
