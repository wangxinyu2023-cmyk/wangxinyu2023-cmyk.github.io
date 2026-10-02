// Triangle pavilions (NYBG): scroll-driven "unfold" of the concept diagram (three.js r160 UMD + window.TRIANGLE_MODEL).
// Plan view on the black site field -> triangular grid -> triangles align, duplicate and rotate -> red circulation ->
// camera tilts to axonometric while terrain layers, columns, floors and roofs lift into the 3D model. Drag to orbit.
(() => {
  const sec = document.querySelector('[data-model3d][data-anim="unfold"]');
  if (!sec) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const gl = (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } })();
  if (!gl) { sec.remove(); return; }
  sec.classList.add('ready');

  // step list (mirrors the student's concept diagram) + its styling
  const STEPS = ['Fill the site as solid', 'Divide the site with axes', 'Align the triangles', 'Duplicate and rotate', 'Refine the circulation', 'Lift into the garden'];
  const AT = [0, .04, .16, .32, .46, .6];
  const css = document.createElement('style');
  css.textContent = '.m3-steps{list-style:none;margin:22px 0 0;padding:0;max-width:340px;font-family:var(--sans);font-size:11px;letter-spacing:.12em;text-transform:uppercase}' +
    '.m3-steps li{display:flex;gap:12px;padding:8px 0;border-top:1px solid var(--line);color:var(--mute);opacity:.55;transition:opacity .35s,color .35s}' +
    '.m3-steps li:last-child{border-bottom:1px solid var(--line)}.m3-steps li i{font-style:normal;color:inherit;min-width:18px}' +
    '.m3-steps li.on{opacity:1;color:var(--ink)}.m3-steps li.cur i{color:#c8321f}' +
    '.m3d[data-anim="unfold"] .m3-stage .ex-labels{left:0;right:0;width:auto}' +
    '.m3d[data-anim="unfold"] .m3-stage .ex-labels li{width:auto;transform:translate(26px,-50%);border:0;padding:3px 7px;background:rgba(245,244,239,.86);transition:opacity .5s}' +
    '.m3d[data-anim="unfold"] .m3-stage .ex-labels li::before{content:"";position:absolute;right:100%;top:50%;width:21px;height:1px;background:var(--ink)}' +
    '.m3d[data-anim="unfold"] .m3-stage .ex-labels li::after{content:"";position:absolute;left:-29px;top:calc(50% - 3px);width:6px;height:6px;border-radius:50%;background:#c8321f}' +
    '@media (max-width:900px){.m3-steps{margin-top:12px}.m3-steps li{display:none;border:0;padding:0}.m3-steps li.cur{display:flex}.m3-steps li:last-child{border:0}}';
  document.head.appendChild(css);
  const stepList = sec.querySelector('.m3-steps');
  const stepLis = STEPS.map((s, i) => { const li = document.createElement('li'); li.innerHTML = '<i>' + String(i + 1).padStart(2, '0') + '</i><span>' + s + '</span>'; if (stepList) stepList.appendChild(li); return li; });

  const up = sec.dataset.up || '';
  const load = src => new Promise((ok, no) => { const s = document.createElement('script'); s.src = up + src; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
  let started = false;
  const go = () => { if (started) return; started = true; load('assets/vendor/three.min.js').then(() => load(sec.dataset.model)).then(init).catch(() => sec.classList.add('failed')); };
  new IntersectionObserver((es, o) => { if (es.some(e => e.isIntersecting)) { o.disconnect(); go(); } }, { rootMargin: '600px 0px' }).observe(sec);

  function init() {
    const T = window.THREE, M = window.TRIANGLE_MODEL, stage = sec.querySelector('.m3-stage');
    const labels = [...sec.querySelectorAll('.ex-labels li')], bar = sec.querySelector('.ex-bar span');
    const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    stage.prepend(renderer.domElement);
    const scene = new T.Scene();
    const cam = new T.OrthographicCamera(-1, 1, 1, -1, -20, 20);

    // ---------- units: ft -> world (x east, y up, -z north), site centred on the origin ----------
    const S = 1 / 400, BASE = M.terrain.base;
    const [rx0, ry0, rx1, ry1] = M.site.rect, SCX = (rx0 + rx1) / 2, SCY = (ry0 + ry1) / 2;
    const wx = x => (x - SCX) * S, wz = y => -(y - SCY) * S, wy = z => (z - BASE) * S;
    const eps = z => .0007 + (z - BASE) * 1.2e-5;               // plan-phase stacking (higher elements drawn over lower)
    const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
    const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const seg = (p, a, b) => ease(clamp((p - a) / (b - a)));
    const lerp = (a, b, t) => a + (b - a) * t;

    // ---------- lights ----------
    scene.add(new T.HemisphereLight(0xffffff, 0xd9d2c5, 1.45));
    const sun = new T.DirectionalLight(0xfff7ec, 1.7); sun.position.set(-.55, 1.1, .35); scene.add(sun); scene.add(sun.target);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -.9, right: .9, top: .9, bottom: -.9, near: -3, far: 3 }); sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias = -.0004; sun.shadow.normalBias = .0015;

    // ---------- materials (white "wash" in the plan phase via emissive) ----------
    const lit = [];
    const mat = (color, o = {}) => { const m = new T.MeshLambertMaterial(Object.assign({ color, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }, o)); lit.push(m); return m; };
    const M_ = {
      floorTop: mat(0xc49c74), floorSide: mat(0xf2eee7), greenTop: mat(0xa5b38c), whiteTop: mat(0xe6e3dc), canopy: mat(0x2b2c31),
      walk: mat(0xddd6ca), walkSide: mat(0xf2eee7), rail: mat(0xf7f6f2, { transparent: true, opacity: .92 }), col: mat(0xf6f5f1),
      core: mat(0xefebe4), tower: mat(0x45464b), fan: mat(0xffffff, { vertexColors: true }), stair: mat(0xf4f2ed),
      terrain: mat(0xffffff, { vertexColors: true, side: T.FrontSide }), tree: mat(0xadb995, { flatShading: true }), trunk: mat(0xd8d2c6)
    };
    const glass = new T.MeshLambertMaterial({ color: 0xa9c3cf, transparent: true, opacity: 0, depthWrite: false, side: T.DoubleSide });
    const edgeMat = new T.LineBasicMaterial({ color: 0x2a2724, transparent: true, opacity: .32 });
    const terrEdge = new T.LineBasicMaterial({ color: 0x5b4a33, transparent: true, opacity: .2 });
    // perforated canopy: random round holes (alpha) -> dappled light like the renders
    const perf = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, 256, 256); g.fillStyle = '#000';
      let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < 46; i++) { const x = rnd() * 256, y = rnd() * 256, r = 3 + rnd() * rnd() * 12; for (const dx of [-256, 0, 256]) for (const dy of [-256, 0, 256]) { g.beginPath(); g.arc(x + dx, y + dy, r, 0, 7); g.fill(); } }
      const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(7, 7); t.anisotropy = 4; return t;
    })();
    const perfDepth = new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking, alphaMap: perf, alphaTest: .5 });
    let perfOn = false;
    const setPerf = on => { if (on === perfOn) return; perfOn = on; M_.canopy.alphaMap = on ? perf : null; M_.canopy.alphaTest = on ? .5 : 0; M_.canopy.needsUpdate = true; };

    const root = new T.Group(); scene.add(root);
    const anim = [];                                   // objects whose y collapses in plan and lifts in 3D
    const addEdges = (mesh, m = edgeMat, th = 25) => { const e = new T.LineSegments(new T.EdgesGeometry(mesh.geometry, th), m); mesh.add(e); return e; };
    const shape = (pts, cx, cy) => new T.Shape(pts.map(p => new T.Vector2((p[0] - cx) * S, (p[1] - cy) * S)));
    const extrude = (shp, h) => { const g = new T.ExtrudeGeometry(shp, { depth: h * S, bevelEnabled: false }); g.rotateX(-Math.PI / 2); return g; };
    const centroid = vs => [vs.reduce((a, v) => a + v[0], 0) / vs.length, vs.reduce((a, v) => a + v[1], 0) / vs.length];

    // ---------- terrain: stacked contour layers (one mesh per level) ----------
    const b64 = s => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; };
    const TQ = new Int16Array(b64(M.terrain.pos)), TC = new Uint8Array(b64(M.terrain.cat)), q = M.terrain.q;
    const PAL = [0xdccfb6, 0xa9a7b1, 0xd2cbbf, 0x9db6c9, 0xc4b08e, 0x88a2b7, 0xb7a281].map(c => new T.Color(c));
    const terr = M.terrain.ranges.map(([lv, s0, n]) => {
      const pos = new Float32Array(n * 9), col = new Float32Array(n * 9);
      for (let t = 0; t < n; t++) {
        const c = PAL[TC[s0 + t]];
        for (let v = 0; v < 3; v++) {
          const k = ((s0 + t) * 3 + v) * 3, o = t * 9 + v * 3;
          pos[o] = wx(TQ[k] * q); pos[o + 1] = wy(TQ[k + 2] * q); pos[o + 2] = wz(TQ[k + 1] * q);
          col[o] = c.r; col[o + 1] = c.g; col[o + 2] = c.b;
        }
      }
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('color', new T.BufferAttribute(col, 3)); g.computeVertexNormals();
      const m = new T.Mesh(g, M_.terrain); m.receiveShadow = true; root.add(m); addEdges(m, terrEdge, 30);
      m.userData.lv = lv; return m;
    });

    // ---------- black site field, grid, red axes ----------
    const W = (rx1 - rx0) * S, H = (ry1 - ry0) * S;
    const field = new T.Mesh(new T.PlaneGeometry(W, H).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 0x121212, transparent: true }));
    field.position.y = .0003; root.add(field);
    const clipLine = (px, py, dx, dy) => {          // Liang-Barsky against the site rect (ft)
      let t0 = -1e9, t1 = 1e9;
      const P = [-dx, dx, -dy, dy], Q = [px - rx0, rx1 - px, py - ry0, ry1 - py];
      for (let i = 0; i < 4; i++) { if (Math.abs(P[i]) < 1e-12) { if (Q[i] < 0) return null; } else { const r = Q[i] / P[i]; if (P[i] < 0) t0 = Math.max(t0, r); else t1 = Math.min(t1, r); } }
      return t0 < t1 ? [px + dx * t0, py + dy * t0, px + dx * t1, py + dy * t1] : null;
    };
    const g = M.grid.side, [gox, goy] = M.grid.origin, c30 = Math.cos(Math.PI / 6);
    const fams = [[0, 1, (i) => [gox + i * g * c30, goy]], [c30, .5, (i) => [gox, goy + i * g]], [-c30, .5, (i) => [gox, goy + i * g]]];
    const gridMat = new T.LineDashedMaterial({ color: 0x8c8a85, dashSize: .0055, gapSize: .0038, transparent: true });
    const grids = fams.map(([dx, dy, at]) => {
      const v = [];
      for (let i = -120; i <= 120; i++) { const [px, py] = at(i), L = clipLine(px, py, dx, dy); if (L) v.push(wx(L[0]), .00035, wz(L[1]), wx(L[2]), .00035, wz(L[3])); }
      const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(v, 3));
      const ls = new T.LineSegments(geo, gridMat); ls.computeLineDistances(); root.add(ls); ls.userData.n = v.length / 3; return ls;
    });
    const tri = Object.fromEntries(M.triangles.map(t => [t.id, t]));
    const axesV = [];
    ['lib_roof', 'mp_roof', 'c8', 'c3'].forEach(id => {
      const vs = tri[id].verts;
      for (let i = 0; i < 3; i++) { const a = vs[i], b = vs[(i + 1) % 3], L = clipLine(a[0], a[1], b[0] - a[0], b[1] - a[1]); if (L) axesV.push(wx(L[0]), .0004, wz(L[1]), wx(L[2]), .0004, wz(L[3])); }
    });
    const axesGeo = new T.BufferGeometry(); axesGeo.setAttribute('position', new T.Float32BufferAttribute(axesV, 3));
    const axes = new T.LineSegments(axesGeo, new T.LineBasicMaterial({ color: 0xd2321f, transparent: true, opacity: 0 })); root.add(axes);

    // ---------- triangles (floors, roofs, canopies) ----------
    const node = (x, y) => { const b = Math.round((x - gox) / (g * c30)), a = Math.round((y - goy - b * g * .5) / g); return [gox + b * g * c30, goy + a * g + b * g * .5]; };
    const TYPEMAT = { floor: [M_.floorTop, M_.floorSide], roof_green: [M_.greenTop, M_.floorSide], roof_white: [M_.whiteTop, M_.floorSide], canopy: [M_.canopy, M_.canopy] };
    const tris = {};
    M.triangles.forEach((t, i) => {
      const [cx, cy] = t.centre, geo = extrude(shape(t.verts, cx, cy), t.t);
      const mesh = new T.Mesh(geo, TYPEMAT[t.type]); mesh.castShadow = true; mesh.receiveShadow = t.type !== 'canopy';
      if (t.type === 'canopy') mesh.customDepthMaterial = perfDepth;
      mesh.position.set(wx(cx), 0, wz(cy)); root.add(mesh); addEdges(mesh);
      const o = { mesh, t, z0: t.z - t.t, kind: t.type === 'floor' ? 'floor' : 'roof', i };
      // aligned (snapped) start state for the concept steps
      const rS = Math.round(t.rot / 60) * 60, sS = Math.max(1, Math.round(t.side / g)) * g, R = sS / Math.sqrt(3);
      const v0 = [cx + R * Math.cos(rS * Math.PI / 180), cy + R * Math.sin(rS * Math.PI / 180)], n = node(v0[0], v0[1]);
      o.start = { c: [cx + n[0] - v0[0], cy + n[1] - v0[1]], abs: rS, side: sS };
      tris[t.id] = o; anim.push(o);
    });
    const prim = Object.values(tris).filter(o => o.t.role === 'primary');
    prim.sort((a, b) => a.start.c[1] - b.start.c[1]).forEach((o, k) => { o.order = k; });
    const dups = Object.values(tris).filter(o => o.t.role.startsWith('dup:'));
    dups.forEach((o, k) => { o.parent = tris[o.t.role.slice(4)]; o.order = k; });

    // glass enclosures + parapets
    const glassMeshes = [];
    M.triangles.forEach(t => {
      if (t.glass) {
        const [cx, cy] = t.centre, k = t.glass.inset, vs = t.verts.map(v => [cx + (v[0] - cx) * k, cy + (v[1] - cy) * k]);
        const p = [];
        for (let i = 0; i < 3; i++) { const a = vs[i], b = vs[(i + 1) % 3]; p.push(a[0], 0, a[1], b[0], 0, b[1], b[0], 1, b[1], a[0], 0, a[1], b[0], 1, b[1], a[0], 1, a[1]); }
        const h = (t.glass.z1 - t.glass.z0) * S, pos = new Float32Array(p.length);
        for (let i = 0; i < p.length; i += 3) { pos[i] = (p[i] - cx) * S; pos[i + 1] = p[i + 1] * h; pos[i + 2] = -(p[i + 2] - cy) * S; }
        const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.computeVertexNormals();
        const m = new T.Mesh(geo, glass); m.position.set(wx(cx), 0, wz(cy)); m.renderOrder = 3; root.add(m);
        const o = { mesh: m, z0: t.glass.z0, kind: 'glass', tall: true, top: t.glass.z1 }; anim.push(o); glassMeshes.push(o);
      }
      if (['lib_roof', 'mp_floor', 's_gf'].includes(t.id)) {
        const [cx, cy] = t.centre, sh = shape(t.verts, cx, cy), R = t.side / Math.sqrt(3), k = 1 - 2 * .6 / R;
        sh.holes.push(new T.Path(t.verts.map(v => new T.Vector2((v[0] - cx) * k * S, (v[1] - cy) * k * S)).reverse()));
        const m = new T.Mesh(extrude(sh, 3.5), M_.rail); m.position.set(wx(cx), 0, wz(cy)); m.castShadow = true; root.add(m); addEdges(m);
        anim.push({ mesh: m, z0: t.z, kind: 'rail', tall: true });
      }
    });

    // ---------- walkways / bridges (draw in along their length) ----------
    const walks = [];
    M.walkways.forEach(w => {
      for (let i = 0; i < w.pts.length - 1; i++) {
        const a = w.pts[i], b = w.pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
        const ext = i < w.pts.length - 2 ? w.w / 2 : 0;          // overlap the mitre
        const slab = new T.BoxGeometry((L + ext) * S, w.t * S, w.w * S); slab.translate((L + ext) * S / 2, w.t * S / 2, 0);
        const m = new T.Mesh(slab, [M_.walkSide, M_.walkSide, M_.walk, M_.walkSide, M_.walkSide, M_.walkSide]);
        m.position.set(wx(a[0]), 0, wz(a[1])); m.rotation.y = ang; m.castShadow = m.receiveShadow = true; root.add(m); addEdges(m);
        const rg = new T.BoxGeometry((L + ext) * S, w.rail * S, .35 * S); rg.translate((L + ext) * S / 2, w.rail * S / 2, 0);
        const rails = [-1, 1].map(sd => { const r = new T.Mesh(rg, M_.rail); r.position.z = sd * (w.w / 2 - .2) * S; r.castShadow = true; return r; });
        const rr = new T.Group(); rails.forEach(r => rr.add(r)); rr.position.copy(m.position); rr.rotation.y = ang; root.add(rr);
        const o = { mesh: m, z0: w.z - w.t, kind: 'floor', walk: walks.length }; anim.push(o);
        anim.push({ mesh: rr, z0: w.z, kind: 'rail', tall: true, walk: walks.length });
        walks.push(o);
      }
    });

    // ---------- merged-box helper (stairs) ----------
    const merge = geos => {
      let n = 0; geos.forEach(g => { n += g.attributes.position.count; });
      const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); let o = 0;
      geos.forEach(g => { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; });
      const out = new T.BufferGeometry(); out.setAttribute('position', new T.BufferAttribute(pos, 3)); out.setAttribute('normal', new T.BufferAttribute(nor, 3)); return out;
    };
    M.stairs.forEach(st => {
      const [ax, ay, az] = st.a, [bx, by, bz] = st.b, L = Math.hypot(bx - ax, by - ay), rise = Math.abs(bz - az), n = Math.max(3, Math.round(rise / .62));
      const lo = Math.min(az, bz), ang = Math.atan2(by - ay, bx - ax), boxes = [];
      for (let k = 0; k < n; k++) {
        let t0 = k / n, t1 = (k + 1) / n; if (az > bz) { const u = t0; t0 = 1 - t1; t1 = 1 - u; }
        const zt = rise * (k + 1) / n, zb = Math.max(0, zt - 1.6);
        const bg = new T.BoxGeometry(L / n * S, (zt - zb) * S, st.w * S).toNonIndexed();
        bg.translate((t0 + t1) / 2 * L * S, (zb + zt) / 2 * S, 0); boxes.push(bg);
      }
      const geo = merge(boxes); geo.rotateY(ang);
      const m = new T.Mesh(geo, M_.stair); m.position.set(wx(ax), 0, wz(ay)); m.castShadow = true; root.add(m); addEdges(m, edgeMat, 40);
      anim.push({ mesh: m, z0: lo, kind: 'floor', tall: true, circ: true });
    });

    // ---------- fan-shaped stepped terrace (wedges step down from the roof) ----------
    const F = M.fan, fanParts = [];
    (() => {
      const [cx, cy] = F.centre, n = F.n, pos = [], col = [], top = new T.Color(0x9fb08a), side = new T.Color(0xf0ece4);
      const P = (x, y, z, c) => { pos.push((x - cx) * S, (z - F.z_base) * S, -(y - cy) * S); col.push(c.r, c.g, c.b); };
      for (let i = 0; i < n; i++) {
        const a = (F.a0 + (F.a1 - F.a0) * i / n) * Math.PI / 180, b = (F.a0 + (F.a1 - F.a0) * (i + 1) / n) * Math.PI / 180;
        const z = F.z_top - (F.z_top - (F.z_base + 4)) * i / (n - 1), arc = [];
        for (let s = 0; s <= 3; s++) { const u = a + (b - a) * s / 3; arc.push([cx + F.r * Math.cos(u), cy + F.r * Math.sin(u)]); }
        for (let s = 0; s < 3; s++) { P(cx, cy, z, top); P(arc[s][0], arc[s][1], z, top); P(arc[s + 1][0], arc[s + 1][1], z, top); }
        const ring = [[cx, cy], ...arc];
        for (let s = 0; s < ring.length; s++) {
          const p = ring[s], r = ring[(s + 1) % ring.length];
          P(p[0], p[1], F.z_base, side); P(r[0], r[1], F.z_base, side); P(r[0], r[1], z, side);
          P(p[0], p[1], F.z_base, side); P(r[0], r[1], z, side); P(p[0], p[1], z, side);
        }
        fanParts.push(pos.length / 3);
      }
      const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new T.Float32BufferAttribute(col, 3)); geo.computeVertexNormals();
      const m = new T.Mesh(geo, M_.fan); m.position.set(wx(cx), 0, wz(cy)); m.castShadow = m.receiveShadow = true; root.add(m);
      const e = addEdges(m, edgeMat, 30);
      anim.push({ mesh: m, z0: F.z_base, kind: 'floor', tall: true, fan: e });
    })();

    // ---------- cores ----------
    M.cores.forEach(c => {
      const h = (c.z1 - c.z0) * S;
      const geo = c.kind === 'cyl' ? new T.CylinderGeometry(c.r * S, c.r * S, h, 28) : new T.BoxGeometry(c.w * S, h, c.d * S);
      geo.translate(0, h / 2, 0);
      const m = new T.Mesh(geo, c.kind === 'cyl' ? M_.core : M_.tower); m.position.set(wx(c.centre[0]), 0, wz(c.centre[1]));
      if (c.rot) m.rotation.y = c.rot * Math.PI / 180;
      m.castShadow = true; root.add(m); addEdges(m, edgeMat, 40);
      anim.push({ mesh: m, z0: c.z0, kind: 'floor', tall: true, circ: true });
    });

    // ---------- columns (instanced; grow out of the terrain up to whatever they carry) ----------
    const colGeo = new T.CylinderGeometry(1, 1, 1, 10); colGeo.translate(0, .5, 0);
    const cols = new T.InstancedMesh(colGeo, M_.col, M.columns.length); cols.castShadow = true; root.add(cols);

    // ---------- trees (instanced, appear last) ----------
    const crowns = new T.InstancedMesh(new T.IcosahedronGeometry(1, 1), M_.tree, M.trees.length); crowns.castShadow = true; root.add(crowns);
    const trunks = new T.InstancedMesh(colGeo, M_.trunk, M.trees.length); root.add(trunks);

    // ---------- red circulation route (dashed cross-ribbons + arrowheads) ----------
    const routes = Object.values(M.routes).map(pts => {
      const pos = [], up = new T.Vector3(0, 1, 0), DASH = 7, GAP = 4.5, Wd = 1.1;
      const P3 = p => new T.Vector3(wx(p[0]), wy(p[2] + 1.6), wz(p[1]));
      const quad = (a, b, s) => { const v = [a.clone().add(s), b.clone().add(s), b.clone().sub(s), a.clone().add(s), b.clone().sub(s), a.clone().sub(s)]; v.forEach(x => pos.push(x.x, x.y, x.z)); };
      let carry = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const A = P3(pts[i]), B = P3(pts[i + 1]), d = B.clone().sub(A), L = d.length() / S; if (L < 1e-6) continue; d.normalize();
        let s1 = new T.Vector3().crossVectors(d, up); if (s1.lengthSq() < 1e-6) s1.set(1, 0, 0); s1.normalize();
        const s2 = new T.Vector3().crossVectors(s1, d).normalize(); s1.multiplyScalar(Wd / 2 * S); s2.multiplyScalar(Wd / 2 * S);
        let t = carry;
        while (t < L) {
          const e = Math.min(L, t + DASH), a = A.clone().addScaledVector(d, t * S), b = A.clone().addScaledVector(d, e * S);
          quad(a, b, s1); quad(a, b, s2); t = e + GAP;
        }
        carry = t - L;
      }
      // arrowhead at the end
      const A = P3(pts[pts.length - 2]), B = P3(pts[pts.length - 1]), d = B.clone().sub(A).setY(0).normalize(), sd = new T.Vector3(-d.z, 0, d.x);
      const tip = B.clone().addScaledVector(d, 6 * S), l = B.clone().addScaledVector(sd, 3.2 * S), r = B.clone().addScaledVector(sd, -3.2 * S);
      [l, tip, r].forEach(x => pos.push(x.x, x.y + .0002, x.z));
      const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
      const m = new T.Mesh(geo, new T.MeshBasicMaterial({ color: 0xd2321f, side: T.DoubleSide, transparent: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      m.renderOrder = 4; root.add(m); m.userData.n = pos.length / 3; return m;
    });

    // ---------- interaction ----------
    let uYaw = 0, uPitch = 0, drag = null, idle = 0;
    stage.addEventListener('pointerdown', e => { drag = [e.clientX, e.clientY, uYaw, uPitch]; stage.setPointerCapture(e.pointerId); stage.classList.add('grab'); });
    stage.addEventListener('pointermove', e => { if (!drag) return; uYaw = drag[2] - (e.clientX - drag[0]) * .008; uPitch = drag[3] + (e.clientY - drag[1]) * .005; idle = 0; frame(); });
    const end = () => { drag = null; stage.classList.remove('grab'); };
    stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end);

    const fp = new URLSearchParams(location.search).get('explode');
    let Wpx = 0, Hpx = 0;
    const size = () => { Wpx = stage.clientWidth; Hpx = stage.clientHeight; renderer.setSize(Wpx, Hpx, false); };
    const mtx = new T.Matrix4(), qI = new T.Quaternion(), vP = new T.Vector3(), vS = new T.Vector3(), v = new T.Vector3();
    const white = new T.Color(1, 1, 1);
    const TOPZ = 26, HILL = -6;
    // building-cluster bounds (final framing)
    const CL = (() => {
      const xs = [], ys = [];
      M.triangles.forEach(t => t.verts.forEach(p => { xs.push(p[0]); ys.push(p[1]); }));
      M.stairs.forEach(s => { xs.push(s.a[0], s.b[0]); ys.push(s.a[1], s.b[1]); });
      xs.push(M.fan.centre[0] - M.fan.r); ys.push(M.fan.centre[1] + M.fan.r * .8);
      const pad = 12;
      return { x: [wx(Math.min(...xs) - pad), wx(Math.max(...xs) + pad)], z: [wz(Math.min(...ys) - pad), wz(Math.max(...ys) + pad)] };
    })();
    // label anchors, in the order of the .ex-labels items: canopies, library, multipurpose classroom, bridge pavilion
    const vtx = (id, k) => tris[id].t.verts[k];
    const anchors = [() => [tris.c1.t.centre, 16], () => [tris.lib_roof.t.centre, 20.5], () => [vtx('mp_roof', 0), 22], () => [vtx('s_roof', 1), 12.5], () => [M.walkways[0].pts[1], 0], () => [tris.c8.t.centre, 15]];

    function frame() {
      const r = sec.getBoundingClientRect(), span = r.height - innerHeight;
      let p = clamp(-r.top / Math.max(1, span));
      if (reduce) p = 1;
      if (fp !== null) p = clamp(+fp);

      // --- concept phases ---
      const gridIn = seg(p, .04, .17), gridOut = seg(p, .34, .46);
      grids.forEach((ls, i) => ls.geometry.setDrawRange(0, Math.floor(ls.userData.n * clamp(gridIn * 1.25 - i * .12) / 2) * 2));
      gridMat.opacity = .9 * (1 - gridOut);
      axes.material.opacity = seg(p, .15, .22) * (1 - seg(p, .36, .46)) * .95;
      const lift = seg(p, .6, .9);                                       // overall lift progress
      const fieldA = 1 - seg(p, .6, .68);
      field.material.opacity = fieldA; field.visible = fieldA > .002;
      const wash = 1 - seg(p, .62, .8);
      lit.forEach(m => m.emissive.copy(white).multiplyScalar(.92 * wash));
      edgeMat.opacity = lerp(.32, .75, wash);
      setPerf(p > .74);

      // terrain layers extrude one after another
      const lt = clamp((p - .64) / .18);
      const nL = terr.length - 1;
      terr.forEach((m, k) => { const s = m.userData.lv === null ? ease(lt) : ease(clamp(lt * 1.6 - k / nL * .6)); m.scale.y = Math.max(.001, s); m.visible = p > .58; });
      const ft = ease(lt), ride = wy(HILL) * ft;

      // per-element vertical factor
      const fOf = o => {
        if (o.kind === 'floor') return seg(p, .66 + (o.i || 0) * .004, .82 + (o.i || 0) * .004);
        if (o.kind === 'roof') return seg(p, .7 + (o.i || 0) * .005, .87 + (o.i || 0) * .003);
        if (o.kind === 'glass' || o.kind === 'rail') return seg(p, .8, .9);
        return lift;
      };
      const circ = seg(p, .46, .56);
      anim.forEach(o => {
        const f = fOf(o); o.f = f;
        const top = o.top !== undefined ? o.top : o.z0;
        o.mesh.position.y = wy(o.z0) * f + (ride + eps(top)) * (1 - f);      // ride on top of the rising terrain until lifted
        const fy = Math.max(.002, f); o.mesh.scale.y = fy;
        let vis = true, sc = 1;
        if (o.t) {
          const role = o.t.role;
          if (role === 'hidden') vis = f > .02;
          else {
            // step 3: primaries appear aligned to the grid; step 4: duplicate + rotate into place
            const st = role === 'primary' ? o.start : o.parent.start;
            const appear = role === 'primary' ? seg(p, .18 + o.order * .014, .24 + o.order * .014) : (p > .32 ? 1 : 0);
            const u = role === 'primary' ? seg(p, .32 + o.order * .01, .42 + o.order * .01) : seg(p, .33 + o.order * .012, .45 + o.order * .012);
            vis = appear > .001;
            const [cx, cy] = o.t.centre;
            o.mesh.position.x = wx(lerp(st.c[0], cx, u)); o.mesh.position.z = wz(lerp(st.c[1], cy, u));
            o.mesh.rotation.y = lerp(st.abs - o.t.rot - 120, 0, u) * Math.PI / 180;
            sc = lerp(st.side / o.t.side, 1, u) * appear;
            o.mesh.scale.set(sc, fy, sc);
          }
        } else if (o.kind === 'glass') { vis = f > .02; }
        else if (o.kind === 'rail') { vis = f > .02; if (o.walk !== undefined) o.mesh.scale.x = 1; }
        else if (o.walk !== undefined) { const wi = seg(p, .46 + o.walk * .025, .54 + o.walk * .025); o.mesh.scale.x = Math.max(.001, wi); vis = wi > .001; }
        else if (o.fan) { const n = fanParts.length, k = Math.ceil(circ * n); o.mesh.geometry.setDrawRange(0, k ? fanParts[k - 1] : 0); o.fan.visible = circ > .98; vis = k > 0; }
        else if (o.circ) { vis = circ > .3; }
        o.mesh.visible = vis;
      });
      glass.opacity = .42 * seg(p, .8, .9);

      // columns
      const gc = seg(p, .66, .84);
      M.columns.forEach(([x, y, z0, z1, rad, on], i) => {
        const sup = tris[on] || walks[on === 'w1' ? 0 : walks.length - 1];
        const fs = sup ? sup.f : lift;
        const base = wy(z0) * ft, top = wy(z1) * fs + (ride + eps(z1)) * (1 - fs);
        const len = Math.max(0, (top - base) * gc);
        vP.set(wx(x), base, wz(y)); vS.set(len > 1e-5 ? rad * 1.6 * S : 0, Math.max(1e-6, len), rad * 1.6 * S);
        cols.setMatrixAt(i, mtx.compose(vP, qI, vS));
      });
      cols.instanceMatrix.needsUpdate = true; cols.visible = gc > 0;

      // trees
      M.trees.forEach((t, i) => {
        const gT = seg(p, .84 + (i % 9) * .012, .92 + (i % 9) * .012), z = wy(t.z0) * ft;
        vP.set(wx(t.c[0]), z + t.h * .62 * S * gT, wz(t.c[1])); vS.set(t.r * S * gT + 1e-6, t.h * .36 * S * gT + 1e-6, t.r * S * gT + 1e-6);
        crowns.setMatrixAt(i, mtx.compose(vP, qI, vS));
        vP.set(wx(t.c[0]), z, wz(t.c[1])); vS.set(.8 * S * gT + 1e-6, t.h * .5 * S * gT + 1e-6, .8 * S * gT + 1e-6);
        trunks.setMatrixAt(i, mtx.compose(vP, qI, vS));
      });
      crowns.instanceMatrix.needsUpdate = trunks.instanceMatrix.needsUpdate = true; crowns.visible = trunks.visible = p > .84;

      // route
      const rIn = seg(p, .5, .6), rf = seg(p, .66, .84);
      routes.forEach((m, i) => { const k = clamp(rIn * 1.4 - i * .4); m.geometry.setDrawRange(0, Math.floor(m.userData.n * k / 3) * 3); m.scale.y = Math.max(.002, rf); m.position.y = (1 - rf) * (ride + .0016); m.visible = k > 0; });

      // --- camera: plan -> axonometric ---
      const c = seg(p, .6, .9);
      const narrow = Wpx / Math.max(1, Hpx) < .85;           // portrait stages: look along the long (north-south) axis
      const yaw = lerp(0, narrow ? -.42 : -.95, c) + uYaw, pitch = clamp(lerp(Math.PI / 2 - .0005, narrow ? .68 : .58, c) + uPitch, .14, Math.PI / 2 - .0005);
      const tgtY = wy(lerp(BASE, -8, c));
      const dir = new T.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
      cam.position.set(dir.x * 5, tgtY + dir.y * 5, dir.z * 5); cam.up.set(0, 1, 0); cam.lookAt(0, tgtY, 0); cam.updateMatrixWorld();
      // fit: the black site field in plan, the building cluster (with its height) in the final view
      const right = new T.Vector3().setFromMatrixColumn(cam.matrixWorld, 0), upv = new T.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
      const asp = Wpx / Math.max(1, Hpx);
      const fit = (xs, zs, ys) => {
        let a = 1e9, b = -1e9, d = 1e9, e = -1e9;
        for (const X of xs) for (const Z of zs) for (const Y of ys) { v.set(X, Y - tgtY, Z); const r = v.dot(right), u = v.dot(upv); a = Math.min(a, r); b = Math.max(b, r); d = Math.min(d, u); e = Math.max(e, u); }
        return [(a + b) / 2, (d + e) / 2, Math.max((e - d) / 2, (b - a) / 2 / asp)];
      };
      const F0 = fit([-W / 2, W / 2], [-H / 2, H / 2], [0]), F1 = fit(CL.x, CL.z, [wy(-16), wy(TOPZ)]);
      const mk = Wpx < 600 ? .98 : .93;
      const ox = lerp(F0[0], F1[0], c), oy = lerp(F0[1], F1[1], c), ch = lerp(F0[2] * 1.05, F1[2] * mk, c);
      cam.left = ox - ch * asp; cam.right = ox + ch * asp; cam.top = oy + ch; cam.bottom = oy - ch; cam.updateProjectionMatrix();
      renderer.render(scene, cam);

      // --- UI ---
      const cur = AT.reduce((a, t, i) => p >= t ? i : a, 0);
      stepLis.forEach((li, i) => { li.classList.toggle('on', i <= cur); li.classList.toggle('cur', i === cur); });
      const onL = p > .92;
      labels.forEach((li, i) => {
        const a = anchors[i % anchors.length](); v.set(wx(a[0][0]), wy(a[1]), wz(a[0][1])).project(cam);
        li.style.left = ((v.x + 1) / 2 * 100).toFixed(2) + '%'; li.style.top = ((1 - v.y) / 2 * 100).toFixed(2) + '%';
        li.classList.toggle('on', onL);
      });
      if (bar) bar.style.width = (p * 100).toFixed(1) + '%';
      sec.dataset.p = p.toFixed(3);
    }
    size(); frame();
    addEventListener('scroll', () => requestAnimationFrame(frame), { passive: true });
    addEventListener('resize', () => { size(); frame(); });
    if (!reduce && fp === null) {
      let vis = false;
      new IntersectionObserver(es => { vis = es[0].isIntersecting; }).observe(sec);
      const spin = () => { if (vis && !drag && ++idle > 120 && +sec.dataset.p > .97) { uYaw += .0012; frame(); } requestAnimationFrame(spin); };
      spin();
    }
    sec.classList.add('loaded');
  }
})();
