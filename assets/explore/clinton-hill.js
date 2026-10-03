// Explorer adapter: The Vertical Village, Clinton Hill (window.CLINTON_MODEL: 16-bit positions normalised by M.scale, feet,
// centred on the building). Library on the cellar and ground floors, three residential floors above, two stair + elevator
// cores (north and south) and the U-shaped reading stair wrapped round the glass library elevator.
XP.register('clinton-hill', ({ T, util }) => {
  const M = window.CLINTON_MODEL, b64 = util.b64, S = M.scale / 65000;
  const root = new T.Group(); root.rotation.x = -Math.PI / 2;
  const COL = { wall: 0xf1ede6, slab: 0xe2dacd, timber: 0xb4865a, frame: 0x45413c, glass: 0xa9c3cf, stair: 0xc9a57c, site: 0xe8e4dc };
  const edgeMat = new T.LineBasicMaterial({ color: 0x2a2724, transparent: true, opacity: .22 });
  M.parts.forEach(pt => {
    const q = new Int16Array(b64(pt.p)), pos = new Float32Array(q.length);
    for (let i = 0; i < q.length; i++) pos[i] = q[i] * S;
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3));
    g.setIndex(new T.BufferAttribute(pt.idx32 ? new Uint32Array(b64(pt.i)) : new Uint16Array(b64(pt.i)), 1)); g.computeVertexNormals();
    const glass = pt.cat === 'glass';
    const m = new T.Mesh(g, new T.MeshLambertMaterial({ color: COL[pt.cat], side: T.DoubleSide, transparent: glass, opacity: glass ? .3 : 1, depthWrite: !glass,
      polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }));
    m.renderOrder = glass ? 2 : 0; m.castShadow = !glass; m.receiveShadow = true;
    if (glass) m.userData.solid = false;
    if (pt.cat === 'site') m.userData.solid = true;
    root.add(m);
    if (!glass && pt.cat !== 'frame') root.add(new T.LineSegments(new T.EdgesGeometry(g, 25), edgeMat));
  });

  // ---------------- circulation (feet, model coords centred on the building; Washington Avenue lies east, +x)
  const FL = [-33.5, -22.7, -7.9, 2.9, 13.8];              // cellar, ground, L2, L3, L4 floor tops
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const STREET = [52, 6], DOOR = [[44, 6], [33, 5]];
  // switch-back stair inside a core: flights run along x between xa and xb, at ya (first) and yb (second)
  const flights = (c, z0, z1) => { const h = (z1 - z0) / 2, out = []; let z = z0;
    for (let k = 0; k < 2; k++) { out.push([c.xa, c.ya, z], [c.xb, c.ya, z + h], [c.xb + c.dx, c.ym, z + h], [c.xb, c.yb, z + h], [c.xa, c.yb, z + 2 * h], [c.xa - c.dx, c.ym, z + 2 * h]); break; }
    return out; };
  const NCORE = { xa: -6.5, xb: 7, ya: 43.6, yb: 48.6, ym: 46.1, dx: 1.6, door: [1, 37.5] };
  const SCORE = { xa: 7.5, xb: 21.5, ya: -41.6, yb: -46.4, ym: -44, dx: 1.6, door: [12, -35] };
  const LIFT_N = { car: [-5.2, 36.6], door: [-5.2, 31.5] }, LIFT_S = { car: [5.8, -37.2], door: [6.5, -32] };
  // residential corridor: the light-well street from the north core to the south core
  const corr = f => { const a = [1.5, 31], b = [9.5, -31]; return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; };
  const homeDoor = (f, side) => { const c = corr(f); return [[c[0], c[1]], [c[0] + side * 6.2, c[1] + side * .7]]; };
  const agents = [];
  const P3 = (p, z) => [p[0], p[1], z];
  // library visitors: in from Washington Avenue, down the U-shaped reading stair to the cellar, read, come back up
  for (let i = 0; i < 9; i++) {
    const pts = [P3(STREET, FL[1]), P3(DOOR[0], FL[1]), P3(DOOR[1], FL[1]), [25, -6, FL[1]], [21, -14.8, FL[1]],
      [10.6, -14.8, -25.4], [10.4, -26.3, -30.8], [20.5, -26.3, -33.5], [24, -20, -33.5]];
    const seat = [[-2 + rnd() * 22, 8 + rnd() * 22], [-6 + rnd() * 10, -40 + rnd() * 10], [26, -2 + rnd() * 20]][i % 3];
    pts.push([seat[0], seat[1], -33.5]); const dw = []; dw[pts.length - 1] = 25 + rnd() * 30; const sit = []; sit[pts.length - 1] = true;
    [[24, -20, -33.5], [20.5, -26.3, -33.5], [10.4, -26.3, -30.8], [10.6, -14.8, -25.4], [21, -14.8, FL[1]], [25, -6, FL[1]], P3(DOOR[1], FL[1]), P3(DOOR[0], FL[1]), P3(STREET, FL[1])].forEach(p => pts.push(p));
    agents.push({ pts, dwell: dw, sit, kind: 0, speed: 1.1, phase: i * 17 + rnd() * 10, gap: 6 + rnd() * 10 });
  }
  // the reading bleachers: cellar visitors climb a few steps and sit
  for (let i = 0; i < 5; i++) {
    const y = -48 + rnd() * 36, x = -16 - rnd() * 14, z = -33.5 + (-13 - x) / 24 * 10.8;
    const pts = [P3(STREET, FL[1]), P3(DOOR[0], FL[1]), P3(DOOR[1], FL[1]), [21, -16.5, FL[1]], [17.5, -20.4, FL[1]], [17.5, -20.4, FL[0]], [23, -20.4, FL[0]], [-8, y, FL[0]], [-13, y, FL[0]], [x, y, z]];
    const dw = []; dw[4] = 4; dw[5] = 3; dw[pts.length - 1] = 40 + rnd() * 30; const sit = []; sit[pts.length - 1] = true; const slow = []; slow[4] = 1.8;
    const back = pts.slice(0, -1).reverse(); back.forEach(p => pts.push(p));
    agents.push({ pts, dwell: dw, sit, slow, kind: 0, speed: 1.05, phase: 40 + i * 31, gap: 10 + rnd() * 10 });
  }
  // residents: the elevators up to their floor, along the luminous corridor to their door
  for (let i = 0; i < 9; i++) {
    const north = i % 2 === 0, L = north ? LIFT_N : LIFT_S, fl = 2 + i % 3, f = north ? .1 + rnd() * .45 : .45 + rnd() * .45;
    const pts = [P3(STREET, FL[1]), P3(DOOR[0], FL[1]), P3(DOOR[1], FL[1]), north ? [12, 26, FL[1]] : [16, -26, FL[1]], P3(L.door, FL[1]), P3(L.car, FL[1]), P3(L.car, FL[fl]), P3(L.door, FL[fl])];
    const dw = []; dw[5] = 4; dw[6] = 3; const slow = []; slow[5] = 1.6;
    const [c, d] = homeDoor(f, rnd() < .5 ? -1 : 1); pts.push(P3(north ? corr(.02) : corr(.98), FL[fl]), P3(c, FL[fl]), P3(d, FL[fl]));
    agents.push({ pts, dwell: dw, slow, kind: 1, speed: 1.15, phase: i * 21 + rnd() * 9, gap: 14 + rnd() * 12 });
  }
  // residents on the stairs: up the south core, down the north core
  for (let i = 0; i < 6; i++) {
    const up = i % 2 === 0, core = up ? SCORE : NCORE, top = 2 + Math.floor(rnd() * 3), f = rnd();
    let pts = [P3(STREET, FL[1]), P3(DOOR[0], FL[1]), P3(DOOR[1], FL[1]), up ? [18, -28, FL[1]] : [8, 28, FL[1]], P3(core.door, FL[1])];
    for (let k = 1; k < top; k++) flights(core, FL[k], FL[k + 1]).forEach(p => pts.push(p));
    pts.push(P3(core.door, FL[top]));
    const [c, d] = homeDoor(up ? .85 - f * .3 : .15 + f * .3, rnd() < .5 ? -1 : 1); pts.push(P3(c, FL[top]), P3(d, FL[top]));
    if (!up) pts = pts.reverse();
    agents.push({ pts, kind: 2, speed: up ? .8 : .95, phase: i * 29 + rnd() * 12, gap: 12 + rnd() * 10 });
  }
  const routes = [[P3(STREET, FL[1]), P3(DOOR[0], FL[1]), P3(DOOR[1], FL[1]), [25, -6, FL[1]], [21, -14.8, FL[1]], [10.6, -14.8, -25.4], [10.4, -26.3, -30.8], [20.5, -26.3, -33.5]],
    [P3(corr(0), FL[2]), P3(corr(1), FL[2])], [P3(corr(0), FL[3]), P3(corr(1), FL[3])], [P3(corr(0), FL[4]), P3(corr(1), FL[4])]];

  return {
    unit: 'ft', root,
    focus: [-52, -58, -34.5, 52, 57, 35],
    ground: FL[1],
    levels: [{ name: 'Cellar', z: FL[0] }, { name: 'Ground', z: FL[1] }, { name: 'Level 2', z: FL[2] }, { name: 'Level 3', z: FL[3] }, { name: 'Level 4', z: FL[4] }],
    view: { yaw: .72, pitch: .55, pad: 1.0 },
    eye: { from: [38, 14, FL[1] + 5.3], to: [4, -14, FL[1] + 2], fov: 64 },
    gizmoScale: .78,
    defaults: { section: { axis: 'y', pos: .52 } },
    paths: { scenarios: { day: { agents, routes, legend: [[0, 'Library visitors'], [1, 'Residents, elevator'], [2, 'Residents, stairs']],
      note: 'Library visitors take the reading stair round the glass elevator down to the cellar; residents ride the north and south cores to the luminous corridor on their floor.' } },
      colors: [0xc0704f, 0x55667a, 0x7f9a5c] },
    sunNote: 'Plan north is taken as the model’s +Y (Washington Avenue running north-south); the neighbouring row houses are not modelled.'
  };
});
