// Explorer adapter: Osborn Plaza market canopy (window.OSBORN_MODEL, feet, Rhino Z-up, origin = plaza centre).
// Builds the site tile, trees, 15 deployable units (market = table pose, everyday = 10 seat-pose benches), goods and crowds,
// reed panels with a perforated shadow so their shade is filtered, and market-day / everyday circulation.
XP.register('osborn-plaza', ({ T, util }) => {
  const M = window.OSBORN_MODEL, b64 = util.b64;
  const root = new T.Group(); root.rotation.x = -Math.PI / 2;
  const geom = (e, ctr, ext) => {
    const q = new Int16Array(b64(e.p)), pos = new Float32Array(q.length), k = ext / 32000;
    for (let i = 0; i < q.length; i += 3) { pos[i] = q[i] * k + ctr[0]; pos[i + 1] = q[i + 1] * k + ctr[1]; pos[i + 2] = q[i + 2] * k + ctr[2]; }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3));
    g.setIndex(new T.BufferAttribute(e.x ? new Uint32Array(b64(e.i)) : new Uint16Array(b64(e.i)), 1)); g.computeVertexNormals(); return g;
  };
  const mat = (c, o = {}) => new T.MeshLambertMaterial(Object.assign({ color: c, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }, o));
  const UCOL = { bamboo: 0xc9a46a, timber: 0xd4b582, reed: 0xbfa476, steel: 0x8e8981, hard: 0x55514c, liner: 0x6f604f, soil: 0x7a6248, herb: 0x83a065 };
  const CCOL = { pave: 0xe7e2d8, pave2: 0xddd4c4, road: 0xd3cec5, walk: 0xe4dfd5, mark: 0xf8f6f1, soil: 0xbcae96, trunk: 0x8f7f6c, crown: 0xaebd94, green: 0x9fb284,
    steelbox: 0x76716a, metal: 0x66615b, stone: 0xcfc9be, wall: 0xdcd6ca, brick: 0xcfa892, dark: 0x77716a, glass: 0xbccbd1, mural: 0xe6dccd, plinth: 0xebe7df };
  const edgeMat = new T.LineBasicMaterial({ color: 0x2a2724, transparent: true, opacity: .16 });

  // ---------------- procedural textures for the rendered (sun) look
  let sd = 3; const r = () => (sd = sd * 16807 % 2147483647) / 2147483647;
  const canvasTex = (w, h, draw, srgb = true) => {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h);
    const t = new T.CanvasTexture(cv); t.wrapS = t.wrapT = T.RepeatWrapping; if (srgb) t.colorSpace = T.SRGBColorSpace; t.anisotropy = 8; return t;
  };
  const concrete = canvasTex(256, 256, (x, w, h) => {      // 10 ft of light concrete paving, joints every 2'-6"
    x.fillStyle = '#dedad3'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) { const v = 190 + r() * 55 | 0; x.fillStyle = 'rgba(' + v + ',' + (v - 3) + ',' + (v - 9) + ',.32)'; x.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
    x.strokeStyle = 'rgba(110,102,92,.5)'; x.lineWidth = 1.4;
    for (let k = 0; k <= 4; k++) { x.beginPath(); x.moveTo(k * 64, 0); x.lineTo(k * 64, h); x.moveTo(0, k * 64); x.lineTo(w, k * 64); x.stroke(); }
  });
  const brick = canvasTex(256, 256, (x, w, h) => {         // 8 ft of running-bond brick
    x.fillStyle = '#b5a493'; x.fillRect(0, 0, w, h); const bw = w / 12, bh = h / 36;
    for (let row = 0; row < 36; row++) for (let c = -1; c < 13; c++) {
      const k = r(), R = 150 + k * 40 | 0, G = 78 + k * 26 | 0, B = 58 + k * 18 | 0; x.fillStyle = 'rgb(' + R + ',' + G + ',' + B + ')';
      x.fillRect(c * bw + (row % 2) * bw / 2 + 1, row * bh + 1, bw - 2, bh - 1.4);
    }
  });
  const mural = canvasTex(1024, 144, (x, w, h) => {        // the plaza's west mural: dark ground, saturated shapes
    const g = x.createLinearGradient(0, 0, w, 0); g.addColorStop(0, '#2c2a36'); g.addColorStop(.5, '#3a2c36'); g.addColorStop(1, '#262f36'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    const pal = ['#c8553d', '#e2a03f', '#3f8a8c', '#7a5aa0', '#e8d8b0', '#2f7a55', '#d4708a'];
    for (let i = 0; i < 60; i++) { x.globalAlpha = .35 + r() * .35; x.fillStyle = pal[i % pal.length]; x.beginPath(); x.ellipse(r() * w, r() * h, 8 + r() * 46, 6 + r() * 30, r() * 3, 0, 6.3); x.fill(); }
    x.globalAlpha = .9; x.lineWidth = 6; for (let i = 0; i < 14; i++) { x.strokeStyle = pal[(i * 3) % pal.length]; x.beginPath(); x.arc(r() * w, h * (.3 + r() * .8), 20 + r() * 60, 3.4, 6); x.stroke(); }
  }); mural.wrapS = mural.wrapT = T.ClampToEdgeWrapping;
  const leaves = canvasTex(256, 256, (x, w, h) => {        // noise-cut crowns: leaf clusters with gaps (alpha)
    x.fillStyle = '#000'; x.fillRect(0, 0, w, h); x.fillStyle = '#fff';
    for (let i = 0; i < 2400; i++) { x.beginPath(); x.ellipse(r() * w, r() * h, 3 + r() * 6, 2 + r() * 4, r() * 3, 0, 6.3); x.fill(); }
  }, false);
  const planarUV = (g, a, b, su, sv, ou = 0, ov = 0) => {
    const P = g.attributes.position.array, uv = new Float32Array(P.length / 3 * 2);
    for (let i = 0, j = 0; i < P.length; i += 3, j += 2) { uv[j] = (P[i + a] - ou) / su; uv[j + 1] = (P[i + b] - ov) / sv; }
    g.setAttribute('uv', new T.BufferAttribute(uv, 2));
  };
  const PBR = {
    pave: { color: 0xe9e5dd, map: concrete, roughness: .93 }, pave2: { color: 0xdcc6a4, map: concrete, roughness: .9 }, road: { color: 0x77736e, map: concrete, roughness: .96 },
    walk: { color: 0xd3cec5, map: concrete, roughness: .93 }, mark: { color: 0xf3f1ea, roughness: .8 }, plinth: { color: 0x9f998e, roughness: 1 }, soil: { color: 0x5c4936, roughness: 1 },
    green: { color: 0x5e8a44, roughness: .9 }, steelbox: { color: 0x4f4c47, metalness: .45, roughness: .5 }, metal: { color: 0x33312e, metalness: .5, roughness: .45 },
    stone: { color: 0xbab3a7, roughness: .85 }, wall: { color: 0xd0c9bb, map: concrete, roughness: .92 }, brick: { color: 0xffffff, map: brick, roughness: .92 },
    dark: { color: 0x2f2d2b, roughness: .55 }, glass: { color: 0x8fa6ae, roughness: .08, metalness: .1, opacity: .38 }, mural: { color: 0xffffff, map: mural, roughness: .8 }
  };

  // ---------------- context
  const ctx = M.ctx;
  ctx.parts.forEach(pt => {
    const g = geom(pt, ctx.ctr, ctx.ext), flat = pt.c === 'green';
    if (pt.c in { pave: 1, pave2: 1, road: 1, walk: 1 }) planarUV(g, 0, 1, 10, 10);
    else if (pt.c === 'brick') planarUV(g, 1, 2, 8, 8);
    else if (pt.c === 'wall') planarUV(g, 0, 2, 10, 10);
    else if (pt.c === 'mural') planarUV(g, 1, 2, 100.4, 14.1, -50.4, 0);
    const top = pt.c === 'pave2' || pt.c === 'mark' || pt.c === 'soil';
    const o = top ? { flatShading: flat, polygonOffsetFactor: -1, polygonOffsetUnits: -4 } : { flatShading: flat };
    if (pt.c === 'glass') Object.assign(o, { transparent: true, opacity: .45, depthWrite: false });
    const mt = mat(CCOL[pt.c], o); mt.userData.pbr = PBR[pt.c];
    const m = new T.Mesh(g, mt);
    m.receiveShadow = true; m.castShadow = !(pt.c in { pave: 1, pave2: 1, road: 1, walk: 1, mark: 1, plinth: 1, glass: 1 });
    if (pt.c === 'plinth') m.userData.solid = true;
    if (pt.c in { pave: 1, pave2: 1, road: 1, walk: 1, mark: 1, green: 1, glass: 1, metal: 1 }) m.userData.solid = false;
    root.add(m);
    if (pt.c in { plinth: 1, wall: 1, brick: 1, stone: 1, mural: 1, steelbox: 1 }) root.add(new T.LineSegments(new T.EdgesGeometry(g, 30), edgeMat));
  });
  // ---------------- neighbouring buildings (LiDAR massing within ~600 ft) and the stepped 1 ft terrain as a quiet base
  if (M.env) M.env.parts.forEach(pt => {
    const g = geom(pt, M.env.ctr, M.env.ext), terr = pt.c === 'terrain';
    const mt = mat(terr ? 0xe6e2da : pt.c === 'frame' ? 0xe9e4dc : 0xeeece7, { flatShading: !terr });
    mt.userData.pbr = { color: terr ? 0xc9c3b7 : pt.c === 'frame' ? 0xd9d1c6 : 0xe4e1db, roughness: .92 };
    const m = new T.Mesh(g, mt); m.receiveShadow = true; m.castShadow = !terr; m.userData.solid = !terr ? undefined : false;
    root.add(m);
    if (!terr) root.add(new T.LineSegments(new T.EdgesGeometry(g, 30), new T.LineBasicMaterial({ color: 0x2a2724, transparent: true, opacity: .1 })));
  });

  // ---------------- trees: trunk + a canopy of alpha-cut leaf cards scattered through the surveyed crown volume
  const leafTex = canvasTex(128, 128, (x, w, h) => {      // a cluster of small pointed leaves (alpha) on transparent
    x.clearRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) {
      const cx = 14 + r() * 100, cy = 14 + r() * 100, a = r() * 6.3, L = 11 + r() * 9, W2 = L * .42, k = r();
      x.save(); x.translate(cx, cy); x.rotate(a); x.fillStyle = 'rgb(' + (52 + k * 40 | 0) + ',' + (88 + k * 46 | 0) + ',' + (40 + k * 22 | 0) + ')';
      x.beginPath(); x.moveTo(-L, 0); x.quadraticCurveTo(0, -W2, L, 0); x.quadraticCurveTo(0, W2, -L, 0); x.fill();
      x.strokeStyle = 'rgba(30,50,25,.5)'; x.lineWidth = 1; x.beginPath(); x.moveTo(-L, 0); x.lineTo(L, 0); x.stroke(); x.restore();
    }
  }); leafTex.wrapS = leafTex.wrapT = T.ClampToEdgeWrapping;
  const trunkMat = mat(CCOL.trunk, { flatShading: true }); trunkMat.userData.pbr = { color: 0x56463a, roughness: .95 };
  const leafMat = mat(0xffffff, { map: leafTex, alphaTest: .5, side: T.DoubleSide, polygonOffset: false });
  leafMat.userData.pbr = { color: 0xd8e6c4, map: leafTex, alphaTest: .5, roughness: .78, alphaToCoverage: true };
  const leafDepth = new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking, map: leafTex, alphaTest: .5, side: T.DoubleSide });
  const cards = [], q = new T.Quaternion(), e3 = new T.Euler(), v = new T.Vector3(), sc3 = new T.Vector3(), ctrv = new T.Vector3();
  (ctx.trees || []).forEach(t => {
    if (t.t) { const me = new T.Mesh(geom(t.t, [0, 0, 0], 60), trunkMat); me.position.set(t.b[0], t.b[1], t.b[2]); me.castShadow = me.receiveShadow = true; me.userData.solid = false; root.add(me); }
    if (!t.c) return;
    const g = geom(t.c, [0, 0, 0], 60), P = g.attributes.position.array, I = g.index.array; g.computeBoundingBox(); g.boundingBox.getCenter(ctrv);
    const areas = []; let A = 0;
    for (let i = 0; i < I.length; i += 3) {
      const a = I[i] * 3, b = I[i + 1] * 3, c = I[i + 2] * 3, ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], wx = P[c] - P[a], wy = P[c + 1] - P[a + 1], wz = P[c + 2] - P[a + 2];
      A += Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx) / 2; areas.push(A);
    }
    const n = Math.min(3200, Math.round(A * 1.25));
    for (let k = 0; k < n; k++) {
      const pick = r() * A; let lo = 0, hi = areas.length - 1; while (lo < hi) { const md = (lo + hi) >> 1; if (areas[md] < pick) lo = md + 1; else hi = md; }
      const i = lo * 3, a = I[i] * 3, b = I[i + 1] * 3, c = I[i + 2] * 3; let s1 = r(), s2 = r(); if (s1 + s2 > 1) { s1 = 1 - s1; s2 = 1 - s2; }
      v.set(P[a] + (P[b] - P[a]) * s1 + (P[c] - P[a]) * s2, P[a + 1] + (P[b + 1] - P[a + 1]) * s1 + (P[c + 1] - P[a + 1]) * s2, P[a + 2] + (P[b + 2] - P[a + 2]) * s1 + (P[c + 2] - P[a + 2]) * s2);
      v.lerp(ctrv, .45 * Math.pow(r(), 1.6));            // most leaves near the crown surface, some inside
      v.x += t.b[0]; v.y += t.b[1]; v.z += t.b[2];
      e3.set(r() * 6.3, r() * 6.3, r() * 6.3); q.setFromEuler(e3); sc3.setScalar(1.6 + r() * 1.1);
      cards.push([v.clone(), q.clone(), sc3.x, r()]);
    }
  });
  if (cards.length) {
    const leaves3 = new T.InstancedMesh(new T.PlaneGeometry(1, 1), leafMat, cards.length), m4 = new T.Matrix4(), cc = new T.Color();
    cards.forEach(([p, qq, s, k], i) => { m4.compose(p, qq, sc3.set(s, s, s)); leaves3.setMatrixAt(i, m4); leaves3.setColorAt(i, cc.setHSL(.24 + k * .06, .35 + k * .15, .42 + k * .14)); });
    leaves3.castShadow = leaves3.receiveShadow = true; leaves3.customDepthMaterial = leafDepth; leaves3.userData.solid = false; root.add(leaves3);
  }
  // ---------------- market goods
  const GCOL = [0x7f9c5c, 0xd98c3f, 0xc77d8e, 0xc99b5c, 0xa65a4b, 0x93abb6, 0xefe8d6];
  const crates = M.goods.crates, produce = M.goods.produce, col = new T.Color(), mm = new T.Matrix4();
  const crateM = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), mat(0xffffff), crates.length);
  const prodM = new T.InstancedMesh(new T.IcosahedronGeometry(1, 1), mat(0xffffff, { flatShading: true }), produce.length);
  crates.forEach((c, i) => { crateM.setColorAt(i, col.set(c[1] ? 0xe2e5e4 : 0x9e8466)); mm.makeScale(Math.max(.01, c[5] - c[2]), Math.max(.01, c[6] - c[3]), Math.max(.01, c[7] - c[4])).setPosition((c[2] + c[5]) / 2, (c[3] + c[6]) / 2, (c[4] + c[7]) / 2); crateM.setMatrixAt(i, mm); });
  produce.forEach((c, i) => { prodM.setColorAt(i, col.set(GCOL[c[1]])); const s = c[5] * .95; mm.makeScale(s, s, s * .8).setPosition(c[2], c[3], c[4]); prodM.setMatrixAt(i, mm); });
  [crateM, prodM].forEach(m => { m.castShadow = m.receiveShadow = true; m.userData.solid = m === crateM; root.add(m); });

  // ---------------- units
  const U = M.unit, LAY = M.layout, N = LAY.market.length;
  const reedTex = () => {
    const cv = document.createElement('canvas'); cv.width = 4; cv.height = 64; const x = cv.getContext('2d');
    for (let r = 0; r < 64; r += 4) { const k = (r * 37 % 11) / 11; x.fillStyle = 'rgb(' + (196 + k * 14 | 0) + ',' + (170 + k * 12 | 0) + ',' + (120 + k * 8 | 0) + ')'; x.fillRect(0, r, 4, 3); x.fillStyle = '#9c8058'; x.fillRect(0, r + 3, 4, 1); }
    const t = new T.CanvasTexture(cv); t.wrapS = t.wrapT = T.RepeatWrapping; t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; return t;
  };
  // shadow-only perforation: reed stems with ~30% open gaps and a few knots, so the canopy throws filtered shade
  const reedHoles = (() => {
    const cv = document.createElement('canvas'); cv.width = 32; cv.height = 64; const x = cv.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, 32, 64); x.fillStyle = '#000';
    for (let r = 0; r < 64; r += 8) { x.fillRect(0, r + 5, 32, 3); }               // stem gaps (3 of 8 rows open, ~35%)
    for (let i = 0; i < 18; i++) { const u = (i * 53) % 32, v = (i * 29) % 64; x.fillStyle = '#fff'; x.fillRect(u, v - v % 8 + 5, 5, 3); }   // stems bridging some gaps
    const t = new T.CanvasTexture(cv); t.wrapS = t.wrapT = T.RepeatWrapping; t.magFilter = T.NearestFilter; t.minFilter = T.NearestFilter; t.generateMipmaps = false; return t;
  })();
  const reedDepth = new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking, alphaMap: reedHoles, alphaTest: .5, side: T.DoubleSide });
  const UPBR = { bamboo: { color: 0xc39553, roughness: .48 }, timber: { color: 0xcf9f66, roughness: .55 }, steel: { color: 0xaaa69e, metalness: .55, roughness: .38 },
    hard: { color: 0x3b3936, metalness: .4, roughness: .5 }, liner: { color: 0x5b4f43, roughness: .9 }, soil: { color: 0x4d3c2d, roughness: 1 }, herb: { color: 0x5c8c40, roughness: .85 } };
  const mats = {};
  const umeshes = U.meshes.map(e => {
    const g = geom(e, U.ctr, U.ext);
    if (e.c === 'reed') {
      const P = g.attributes.position.array, uv = new Float32Array(P.length / 3 * 2);
      for (let i = 0, j = 0; i < P.length; i += 3, j += 2) { uv[j] = P[i] / 3; uv[j + 1] = P[i + 1] / 1.2; }
      g.setAttribute('uv', new T.BufferAttribute(uv, 2));
      if (!mats.reed) {
        mats.reed = mat(0xffffff, { map: reedTex() });
        const vis = new T.CanvasTexture(reedHoles.image); vis.wrapS = vis.wrapT = T.RepeatWrapping;     // woven reed: slits show close up, mip-averaged to solid far away
        mats.reed.userData.pbr = { map: mats.reed.map, alphaMap: vis, alphaTest: .5, roughness: .9, alphaToCoverage: true };
      }
    }
    if (!mats[e.c]) { mats[e.c] = mat(UCOL[e.c]); mats[e.c].userData.pbr = UPBR[e.c]; }
    const m = new T.InstancedMesh(g, mats[e.c], N);
    m.castShadow = m.receiveShadow = true; m.frustumCulled = false;
    if (e.c === 'reed') { m.customDepthMaterial = reedDepth; m.userData.solid = false; }
    if (e.c === 'herb' || e.c === 'soil') m.userData.solid = false;
    root.add(m);
    return { m, g: e.g };
  });
  const SW = { legs: [0, .22], ballast: [.17, .36], lift: [.33, .55], width: [.5, .67], fold: [.62, .86], skin: [.83, 1], tabA: [0, .75], tabB: [.25, 1] };
  const SN = U.stages, sm = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
  const sp = (s, v) => { const w = SW[s]; return sm((v - w[0]) / (w[1] - w[0])); };
  const tA = new T.Matrix4(), tB = new T.Matrix4(), tC = new T.Matrix4(), ax = new T.Vector3();
  const applyOps = (out, ops, fOf) => {
    for (const o of ops) {
      const f = fOf(SN[o.s]); if (f === 0) continue;
      if (o.t) tA.makeTranslation(o.t[0] * f, o.t[1] * f, o.t[2] * f);
      else if (o.r) { ax.set(o.r[0], o.r[1], o.r[2]); tA.makeTranslation(o.c[0], o.c[1], o.c[2]).multiply(tB.makeRotationAxis(ax, o.a * f)).multiply(tC.makeTranslation(-o.c[0], -o.c[1], -o.c[2])); }
      else { const m = o.m; tA.set(1 + (m[0] - 1) * f, m[1] * f, m[2] * f, m[3] * f, m[4] * f, 1 + (m[5] - 1) * f, m[6] * f, m[7] * f, m[8] * f, m[9] * f, 1 + (m[10] - 1) * f, m[11] * f, 0, 0, 0, 1); }
      out.premultiply(tA);
    }
    return out;
  };
  const tS = new T.Matrix4(), tT = new T.Matrix4();
  // pose of cluster ci for deployment d (0 folded on its casters .. 1 open) and table t (0 seat .. 1 table); same staging as the scroll animation
  const pose = (out, ci, d, t) => {
    const c = U.clusters[ci]; out.identity();
    if (c.k === 'skin') { const s = sp('skin', d); if (s < .01) return false; out.makeTranslation(0, c.py, 0).multiply(tS.makeScale(1, s, 1)).multiply(tT.makeTranslation(0, -c.py, 0)); return true; }
    if (c.k === 'roll') {
      const s = 1 - sp('skin', d); if (s < .01) return false;
      const cx = (c.lo[0] + c.hi[0]) / 2, cy = (c.lo[1] + c.hi[1]) / 2, cz = (c.lo[2] + c.hi[2]) / 2;
      out.makeTranslation(cx, cy, cz).multiply(tS.makeScale(s, 1, 1)).multiply(tT.makeTranslation(-cx, -cy, -cz)); return true;
    }
    if (c.k === 'ballast') { const s = sp('ballast', d); if (s <= 0) return false; const e = 1 - s; out.makeTranslation(0, 0, 7 * e * e); return true; }
    applyOps(out, c.tr, s => 1 - sp(s, d)); applyOps(out, c.tb, s => sp(s, t * d)); return true;
  };
  const HIDE = new T.Matrix4().makeScale(0, 0, 0), place = new T.Matrix4();
  const dailyOf = new Array(N).fill(null); LAY.daily.forEach(d => { dailyOf[d[0]] = d; });
  let DEP = 1, canHidden = false;        // deployment of every cart (0 folded .. 1 open); canopies hidden for the no-canopy comparison
  function setLayout(v) {
    for (let i = 0; i < N; i++) {
      let s = null;
      if (v === 'market') { const k = LAY.market[i]; s = [k[0], k[1], k[2], 1]; }
      else if (dailyOf[i]) { const d = dailyOf[i]; s = [d[1], d[2], d[3], 0]; }
      if (s) place.makeRotationZ(s[2]).setPosition(s[0], s[1], 0);
      umeshes.forEach(u => { const ok = s && pose(mm, u.g, DEP, s[3]); if (ok) mm.premultiply(place); u.m.setMatrixAt(i, ok ? mm : HIDE); });
    }
    umeshes.forEach(u => { u.m.instanceMatrix.needsUpdate = true; u.m.computeBoundingSphere && (u.m.boundingSphere = null); u.m.visible = !canHidden; });
    crateM.visible = prodM.visible = v === 'market' && !canHidden && DEP > .97;
    layoutNow = v;
  }
  function hideCanopies(on) { canHidden = on; umeshes.forEach(u => { u.m.visible = !on; }); crateM.visible = prodM.visible = !on && layoutNow === 'market' && DEP > .97; }
  let layoutNow = 'market', pathsOn = false;
  function showCrowds() {
    // static Rhino crowds are not used in the explorer: people are the scale figures of the Movement tool


  }

  // ---------------- circulation (plaza feet: x across, y north; Belmont Ave to the north, the gate in the south wall)
  // the main aisle, south gate -> Belmont Avenue, with the stall fronts strung along it
  const SPINE = [[0.5, -60], [0.5, -47], [-1.7, -42], [-1.7, -12], [2.8, -7], [2.8, 17], [1, 26], [1, 38.4], [1, 47], [1.5, 57]];
  const L = []; let acc = 0; SPINE.forEach((p, i) => { if (i) acc += Math.hypot(p[0] - SPINE[i - 1][0], p[1] - SPINE[i - 1][1]); L.push(acc); });
  const at = s => { for (let i = 1; i < SPINE.length; i++) if (s <= L[i] || i === SPINE.length - 1) { const f = (s - L[i - 1]) / (L[i] - L[i - 1] || 1), a = SPINE[i - 1], b = SPINE[i]; return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; } };
  const proj = (x, y) => { let best = [1e9, 0]; for (let i = 1; i < SPINE.length; i++) { const a = SPINE[i - 1], b = SPINE[i], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy, f = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2)), px = a[0] + dx * f, py = a[1] + dy * f, d = Math.hypot(px - x, py - y); if (d < best[0]) best = [d, L[i - 1] + f * Math.sqrt(l2)]; } return best[1]; };
  const along = (s0, s1) => { const out = []; const dir = s1 > s0 ? 1 : -1; for (let i = 0; i < SPINE.length; i++) if ((L[i] - s0) * dir > 0 && (s1 - L[i]) * dir > 0) out.push(SPINE[i]); if (dir < 0) out.sort((p, q) => proj(q[0], q[1]) - proj(p[0], p[1])); else out.sort((p, q) => proj(p[0], p[1]) - proj(q[0], q[1])); return out; };
  // stall i -> spur from the aisle to where a shopper stands
  const STALL = {
    0: [[-1.7, -36.5], [-4.3, -36.5]], 1: [[-1.7, -26.8], [-4.3, -26.8]], 2: [[-1.7, -17.1], [-4.3, -17.1]],
    6: [[-1.7, -36.5], [.8, -36.5]], 7: [[-1.7, -26.8], [.8, -26.8]], 8: [[-1.7, -17.1], [.8, -17.1]],
    3: [[2.8, -6.7], [.2, -6.7]], 4: [[2.8, 3], [.2, 3]], 5: [[2.8, 12.7], [.2, 12.7]],
    9: [[1, 38.4], [-19.5, 38.4], [-19.5, 37.1]], 10: [[1, 38.4], [-9.8, 38.4], [-9.8, 37.1]],
    11: [[1, 38.4], [-19.5, 38.4], [-19.5, 39.7]], 12: [[1, 38.4], [-9.8, 38.4], [-9.8, 39.7]],
    13: [[0.5, -47], [8, -44.5], [13.5, -40.5], [20.4, -40.5]], 14: [[0.5, -47], [8, -44.5], [14, -38], [17, -32], [20.4, -30.8]]
  };
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const jit = (p, r) => [p[0] + (rnd() - .5) * r, p[1] + (rnd() - .5) * r];
  const ENTRY = { gate: [[0.5, -60]], belmont: [[-24, 56], [-6, 56], [1.5, 57]], belmontE: [[30, 55.5], [8, 55.5], [1.5, 57]] };
  function shopper(i) {
    const fromGate = rnd() < .55, entry = fromGate ? ENTRY.gate : (rnd() < .5 ? ENTRY.belmont : ENTRY.belmontE);
    const pool = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].filter(() => rnd() < .3);
    while (pool.length < 2) pool.push(Math.floor(rnd() * 15));
    const stalls = [...new Set(pool)].slice(0, 4).sort((a, b) => (proj(...STALL[a][0]) - proj(...STALL[b][0])) * (fromGate ? 1 : -1));
    const pts = entry.map(p => [...p]), dwell = [];
    let s = fromGate ? 0 : L[L.length - 1];
    stalls.forEach(k => {
      const spur = STALL[k], s1 = proj(...spur[0]);
      along(s, s1).forEach(p => pts.push(jit(p, 1.2)));
      spur.forEach(p => pts.push(jit(p, .5)));
      dwell[pts.length - 1] = 5 + rnd() * 9;
      spur.slice(0, -1).reverse().forEach(p => pts.push(jit(p, .5)));
      s = s1;
    });
    const out = rnd() < .5;           // leave through the gate or onto Belmont
    along(s, out ? 0 : L[L.length - 1]).forEach(p => pts.push(jit(p, 1.2)));
    pts.push(out ? [0.5, -60] : (rnd() < .5 ? [-26, 56.5] : [30, 55]));
    return { pts, dwell, speed: 1.0 + rnd() * .3, kind: 0, phase: rnd() * 200, gap: 4 + rnd() * 10 };
  }
  const front = a => [Math.sin(a), -Math.cos(a)];
  const vendors = LAY.market.map(([x, y, a]) => { const f = front(a); return { pts: [[x - f[0] * 1.9, y - f[1] * 1.9]], kind: 3, face: Math.atan2(f[1], f[0]) }; });
  const market = { agents: [...vendors], routes: [SPINE, [[1, 38.4], [-21, 38.4]], [[0.5, -47], [8, -44.5], [14, -38], [17, -32], [20.4, -30.8]]],
    legend: [[0, 'Shoppers'], [3, 'Stallholders']], note: 'Wednesday market: shoppers come in through the south gate or from Belmont Avenue, walk the 3.5\u00a0m aisle and stop at two to four stalls.' };
  for (let i = 0; i < 46; i++) market.agents.push(shopper(i));
  // everyday: people cutting through between the gate and Belmont, others coming to sit for a while under the benches' shade
  const daily = { agents: [], routes: [SPINE, [[25, 52], [25, -25], [20, -44], [0.5, -47]]], legend: [[1, 'Passing through'], [2, 'Coming to sit'], [0, 'Strolling']],
    note: 'Everyday: the plaza as a short cut and a shaded place to sit. Seated figures stay; others pass through or come for a while.' };
  for (let i = 0; i < 16; i++) {
    const north = rnd() < .5, p = SPINE.map(q => jit(q, 1.5)); if (north) p.reverse();
    const side = rnd() < .5 ? [-26, 56.5] : [30, 55]; if (north) p.unshift(side); else p.push(side);
    daily.agents.push({ pts: p, speed: 1.2 + rnd() * .3, kind: 1, phase: rnd() * 120, gap: 6 + rnd() * 20 });
  }
  for (let i = 0; i < 6; i++) {   // east side walk: Belmont -> along the brick wall -> gate
    const p = [[30, 55], [25, 49], [25.3, 10], [24.8, -24], [19, -44], [8, -45.5], [0.5, -48], [0.5, -60]].map(q => jit(q, 1.2)); if (i % 2) p.reverse();
    daily.agents.push({ pts: p, speed: 1.1 + rnd() * .2, kind: 0, phase: rnd() * 120, gap: 10 + rnd() * 20 });
  }
  // free seats on the benches (ends of each everyday unit), reached from the aisle
  const seats = [[0, 'S', 1.6], [4, 'S', -2.6], [5, 'S', 2.6], [9, 'N', 2.6], [10, 'N', -2.6], [11, 'N', 2.6], [12, 'N', -2.6], [13, 'G', 2.6], [6, 'G', 2.6], [14, 'G', -2.6]];
  seats.forEach(([j, via, off], n) => {
    const d = dailyOf[j]; if (!d) return; const [x, y, a] = [d[1], d[2], d[3]], f = front(a), t = [Math.cos(a), Math.sin(a)];
    const seat = [x + t[0] * off + f[0] * .6, y + t[1] * off + f[1] * .6], stand = [x + t[0] * off + f[0] * 3.2, y + t[1] * off + f[1] * 3.2];
    const fromGate = via === 'S' || via === 'G' ? rnd() < .75 : rnd() < .25;
    const s1 = proj(...stand), pts = [];
    if (fromGate) { pts.push([0.5, -60]); along(0, s1).forEach(p => pts.push(jit(p, 1))); } else { pts.push([-26, 56.5]); along(L[L.length - 1], s1).forEach(p => pts.push(jit(p, 1))); }
    if (j === 13 || j === 14 || j === 6) pts.push([8, -44.5]);
    pts.push(stand, seat); const dwell = []; dwell[pts.length - 1] = 40 + rnd() * 60; const sit = []; sit[pts.length - 1] = true;
    pts.push(stand); const back = pts.slice(0, -3).reverse(); back.forEach(p => pts.push(p));
    daily.agents.push({ pts, dwell, sit, speed: 1.05, kind: 2, phase: n * 23 + rnd() * 30, gap: 8 + rnd() * 25 });
  });

  // people already sitting on the benches (positions from the Rhino everyday layout), facing out from their bench
  M.people.daily.filter(p => p[0] === 49).forEach(([k, x, y]) => {
    const d = LAY.daily.reduce((b, q) => Math.hypot(q[1] - x, q[2] - y) < Math.hypot(b[1] - x, b[2] - y) ? q : b), f = front(d[3]);
    daily.agents.push({ pts: [[x, y]], sit: true, kind: 2, face: Math.atan2(f[1], f[0]) });
  });
  setLayout('market');
  return {
    unit: 'ft', root,
    focus: [-35, -60, -2.2, 37, 94, 30],
    shadowBox: [-35, -60, -2.2, 37, 94, 30],
    ground: 0,
    levels: [{ name: 'Plaza', z: 0 }],
    view: { yaw: -.55, pitch: .82, pad: .98, portrait: { yaw: -.3, pitch: .95 } },
    eye: { from: [-1.2, -34, 5.3], to: [.8, 0, 4.4], fov: 64 },
    ao: { rect: [-31, -51, 32, 51], z: .07, res: 8, blobs: lay => {     // contact shadows: under the carts and round the tree trunks
      const out = [], f = .45 + .55 * DEP;            // folded carts have a smaller footprint; no blobs when the canopies are hidden
      if (!canHidden) {
        if (lay === 'daily') LAY.daily.forEach(d => out.push([d[1], d[2], 10.4 * f, 8.6 * f, d[3], .3]));
        else LAY.market.forEach(k => out.push([k[0], k[1], 10.6 * f, 9 * f, k[2], .26]));
      }
      (ctx.trees || []).forEach(t => { out.push([t.b[0], t.b[1], 3.2, 3.2, 0, .45], [t.b[0], t.b[1], 20, 20, 0, .1]); });
      return out; } },
    gizmoScale: .62,
    layouts: { options: [['market', 'Market day'], ['daily', 'Everyday']], value: 'market', set: setLayout },
    paths: { scenarios: { market, daily }, colors: [0xbf7352, 0x55667a, 0x7f9a5c, 0x9a7a4c] },
    casterBox: [-640, -640, -35, 640, 640, 212],
    shade: { rect: [-29.2, -49.1, 30.4, 49.8], z: 0.12, cell: 2, label: 'Plaza floor', compare: { label: 'without the canopies', labelOn: 'with the canopies', hide: hideCanopies } },
    canopy: { label: 'Canopies', on: 'With canopies', off: 'No canopies' },
    deploy: { seconds: 7, fold: 'Fold canopies', unfold: 'Unfold canopies', set: d => { DEP = d; setLayout(layoutNow); } },
    sunNote: 'Plan north from the site survey (11° east of the model’s +Y). Neighbouring buildings within 600\u00a0ft come from the LiDAR context model; reed panels let about a third of the sun through.'
  };
});
