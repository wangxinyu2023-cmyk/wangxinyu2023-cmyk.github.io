// Explorer adapter: Between Levels (window.BL_MODEL, metres, Rhino Z-up, absolute coordinates).
// Terrain, streets at +0 / +6 / +12 m, two stepped wings, 48 rooms coloured by type, the stair-street, galleries and bridges;
// movement follows the public route from the lower street up the stair-street to the upper street.
XP.register('between-levels', ({ T, util }) => {
  const M = window.BL_MODEL, b64 = util.b64, C = M.center, Q = M.q;
  const root = new T.Group(); root.rotation.x = -Math.PI / 2;
  const TYPES = [0xb7654b, 0xd49a58, 0xc9b14f, 0x98aa5c, 0x67a07a, 0x478c8b, 0x6b9cc0, 0x5a6ca6, 0x8a72ab, 0xc47893, 0x9e5468, 0x9a958c];
  const COL = { earth: 0xe8e2d5, stone: 0xd9d2c4, road: 0xcdc7bb, walk: 0xeee9de, paving: 0xe6dfd0, white: 0xf6f3ec, structure: 0xebe6dc,
    bronze: 0x6e5d48, glass: 0xa9c3cf, foliage: 0x9caf86, landscape: 0xb9c3a0, timber: 0xc7a77b, wood: 0x8e7255, paper: 0xf1ebdf, metal: 0x8d8d88, brass: 0xb39553 };
  const EDGE = new Set(['earth', 'stone', 'road', 'walk', 'paving', 'white', 'structure', 'timber', 'room']);
  const edgeMat = new T.LineBasicMaterial({ color: 0x2a2724, transparent: true, opacity: .2 });
  const matCache = {};
  M.parts.forEach(pt => {
    const q = new Int16Array(b64(pt.p)), pos = new Float32Array(q.length);
    for (let i = 0; i < q.length; i += 3) { pos[i] = q[i] * Q + C[0]; pos[i + 1] = q[i + 1] * Q + C[1]; pos[i + 2] = q[i + 2] * Q + C[2]; }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3));
    g.setIndex(new T.BufferAttribute(pt.idx32 ? new Uint32Array(b64(pt.i)) : new Uint16Array(b64(pt.i)), 1)); g.computeVertexNormals();
    const glass = pt.c === 'glass', room = pt.room !== undefined;
    const color = room ? new T.Color(TYPES[M.rooms[pt.room].ty]).lerp(new T.Color(0xffffff), .18).getHex() : pt.g === 'canopy' && pt.c === 'bronze' ? 0xb49c7c : COL[pt.c];
    const key = color + (glass ? 'g' : '');
    const mat = matCache[key] || (matCache[key] = new T.MeshLambertMaterial({ color, side: T.DoubleSide, flatShading: true, transparent: glass, opacity: glass ? .3 : 1, depthWrite: !glass,
      polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }));
    const m = new T.Mesh(g, mat); m.renderOrder = glass ? 3 : 0;
    m.castShadow = !glass; m.receiveShadow = true;
    if (glass || pt.c === 'foliage' || pt.g === 'trees') m.userData.solid = false;
    root.add(m);
    if (EDGE.has(pt.c) && pt.g !== 'trees') root.add(new T.LineSegments(new T.EdgesGeometry(g, 25), edgeMat));
  });

  // ---------------- the public route (same line as the scroll animation): lower street -> stair-street -> upper street
  const R = [[-10, -4, 0], [18, -4, 0], [18, 1.5, 0]];
  for (let k = 0; k < 4; k++) { const y = 12 * k, z = 3 * k; R.push([18, y + 3, z], [18, y + 6, z + 1.5], [18, y + 7.5, z + 1.5], [18, y + 10.5, z + 3]); }
  R.push([18, 49, 12], [18, 52, 12], [8, 52, 12], [-10, 52, 12]);
  const B = [[52, 25.5, 6], [40, 25.5, 6], [30, 25.5, 6], [25.5, 25.5, 6], [18.6, 25.5, 6]];
  let seed = 5; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const j = (p, r) => [p[0] + (rnd() - .5) * r, p[1], p[2]];
  const agents = [];
  for (let i = 0; i < 12; i++) {           // up and down the whole route; some pause on the planted landings
    const off = (rnd() - .5) * 2.4, pts = R.map(p => [p[0] === 18 ? 18 + off : p[0], p[1] + (p[0] === 18 ? 0 : off * .5), p[2]]);
    const dwell = []; if (rnd() < .5) { const k = Math.floor(rnd() * 4); dwell[3 + k * 4 + 2] = 6 + rnd() * 8; }
    const up = i % 3 !== 2;
    agents.push({ pts: up ? pts : pts.reverse(), dwell: up ? dwell : [], kind: up ? 0 : 1, speed: up ? .9 + rnd() * .25 : 1.2, phase: i * 13 + rnd() * 9, gap: 4 + rnd() * 6 });
  }
  for (let i = 0; i < 6; i++) {            // from the middle lane onto the stair-street, then up or down
    const up = i % 2 === 0, mid = R.findIndex(p => p[1] === 27);
    const pts = B.map(p => j(p, 1.2)), rest = up ? R.slice(mid) : R.slice(0, mid).reverse();
    rest.forEach(p => pts.push([p[0] === 18 ? 18 + (rnd() - .5) * 1.5 : p[0], p[1], p[2]]));
    if (i % 3 === 2) pts.reverse();
    agents.push({ pts, kind: 2, speed: 1.1, phase: i * 19 + rnd() * 9, gap: 6 + rnd() * 8 });
  }
  // across the two bridges between the wings' galleries
  [[13.5, 9], [25.5, 12]].forEach(([y, z], b) => { for (let i = 0; i < 3; i++) {
    const pts = [[9.5, y - 3 + i, z], [11, y + (i - 1) * .6, z], [25, y + (i - 1) * .6, z], [26.5, y - 2 + i, z]]; if (i % 2) pts.reverse();
    const dw = []; dw[0] = 8 + rnd() * 10; dw[3] = 8 + rnd() * 10;
    agents.push({ pts, dwell: dw, kind: 3, speed: 1.1, phase: b * 7 + i * 11, gap: 3 }); } });
  // people sitting on the planted landings
  for (let k = 0; k < 4; k++) agents.push({ pts: [[16.2 + (k % 2) * 3.6, 12 * k + 6.8, 3 * k + 1.5]], sit: true, kind: 1 });

  return {
    unit: 'm', root,
    focus: [-12, -8, -1.2, 52, 56, 18.7],
    ground: 0,
    levels: [0, 3, 6, 9, 12].map(z => ({ name: '+' + z + ' m', z })),
    view: { yaw: .82, pitch: .62, pad: 1.0 },
    eye: { from: [18.4, -7, 1.6], to: [18, 20, 5], fov: 62 },
    gizmoScale: .7,
    paths: { scenarios: { route: { agents, routes: [R, B, [[9.5, 13.5, 9], [26.5, 13.5, 9]], [[9.5, 25.5, 12], [26.5, 25.5, 12]]],
      legend: [[0, 'Going up'], [1, 'Coming down'], [2, 'From the middle lane'], [3, 'Across the bridges']],
      note: 'The stair-street climbs four 3 m cycles between the wings, with a planted landing on each; the middle lane joins it at +6 m and two bridges cross it at +9 and +12 m.' } },
      colors: [0xc0704f, 0x55667a, 0xd0a54a, 0x7f9a5c] },
    sunNote: 'Speculative site: the sun is computed for New York City with the slope rising to the north (+Y).'
  };
});
