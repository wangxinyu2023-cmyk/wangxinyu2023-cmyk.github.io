// Explore the model: a reusable three.js viewer for [data-explorer] blocks (three.js r160 UMD, no modules, no fetch).
//   Section  - one clipping plane (X / Y / plan), stencil-buffer caps so cut solids read as dark poche, draggable handle
//   Sun      - NOAA solar position for the project's lat/lon and plan-north angle, US Eastern time with DST,
//              a DirectionalLight whose shadow camera is fitted to the model, sky tinted by altitude, sun-path gizmo
//   Paths    - deterministic agents walking circulation routes (position = f(time), so any moment can be shown), with trails
// Each project supplies an adapter (assets/explore/<slug>.js) that calls XP.register(slug, ctx => spec) and turns its model
// data into meshes. URL parameters force a state (for screenshots / links):
//   ?view=plan|axon|eye  &section=x:0.4|y:0.5|z:0.3|plan:1  &flip=1  &sun=2026-07-21T14:00|off  &paths=1  &t=12
//   &layout=market|daily  &shade=1  &tab=section|sun|paths  &trails=0  &speed=2  &yaw=..&pitch=..&zoom=..  &gizmo=0  &live=1
(() => {
  if (window.XP) return;
  const ADAPTERS = {};
  const XP = window.XP = { register: (name, fn) => { ADAPTERS[name] = fn; }, util: {} };
  const blocks = [...document.querySelectorAll('[data-explorer]')];
  if (!blocks.length) return;
  const Q = new URLSearchParams(location.search), forced = [...Q.keys()].some(k => /^(view|section|sun|live|paths|t|layout|shade|tab|yaw|pitch|zoom)$/.test(k));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasGL = (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } })();

  const load = url => new Promise((ok, no) => {     // same dedupe as the scroll animations: one copy of three.js / model per page
    const o = [...document.scripts].find(x => x.getAttribute('src') === url);
    if (o) { if (o.dataset.ok) ok(); else { o.addEventListener('load', ok); o.addEventListener('error', no); } return; }
    const s = document.createElement('script'); s.src = url; s.onload = () => { s.dataset.ok = 1; ok(); }; s.onerror = no; document.head.appendChild(s);
  });

  // ------------------------------------------------------------------ helpers shared with adapters
  const b64 = s => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; };
  XP.util.b64 = b64;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
  // fraction of boundary edges (welded by position): ~0 for closed solids that can be stencil-capped
  XP.util.openness = g => {
    const P = g.attributes.position.array, I = g.index ? g.index.array : null, n = I ? I.length : P.length / 3;
    const key = new Map(), vid = new Int32Array(P.length / 3);
    for (let i = 0; i < vid.length; i++) {
      const k = Math.round(P[3 * i] * 500) + ',' + Math.round(P[3 * i + 1] * 500) + ',' + Math.round(P[3 * i + 2] * 500);
      let v = key.get(k); if (v === undefined) { v = key.size; key.set(k, v); } vid[i] = v;
    }
    const E = new Map(); const V = key.size;
    for (let t = 0; t < n; t += 3) for (let e = 0; e < 3; e++) {
      const a = vid[I ? I[t + e] : t + e], b = vid[I ? I[t + (e + 1) % 3] : t + (e + 1) % 3]; if (a === b) continue;
      const k = a < b ? a * V + b : b * V + a; E.set(k, (E.get(k) || 0) + 1);
    }
    let open = 0; E.forEach(c => { if (c % 2) open++; });
    return E.size ? open / E.size : 1;
  };

  // ------------------------------------------------------------------ sun: NOAA solar calculator
  function solar(ms, lat, lon) {
    const jd = ms / 864e5 + 2440587.5, T = (jd - 2451545) / 36525;
    const L0 = (280.46646 + T * (36000.76983 + T * .0003032)) % 360, M = 357.52911 + T * (35999.05029 - .0001537 * T);
    const e = .016708634 - T * (.000042037 + .0000001267 * T);
    const C = Math.sin(rad(M)) * (1.914602 - T * (.004817 + .000014 * T)) + Math.sin(rad(2 * M)) * (.019993 - .000101 * T) + Math.sin(rad(3 * M)) * .000289;
    const om = 125.04 - 1934.136 * T, lam = L0 + C - .00569 - .00478 * Math.sin(rad(om));
    const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (.00059 - T * .001813))) / 60) / 60, eps = eps0 + .00256 * Math.cos(rad(om));
    const dec = Math.asin(Math.sin(rad(eps)) * Math.sin(rad(lam)));
    const y = Math.tan(rad(eps / 2)) ** 2;
    const eot = 4 * deg(y * Math.sin(2 * rad(L0)) - 2 * e * Math.sin(rad(M)) + 4 * e * y * Math.sin(rad(M)) * Math.cos(2 * rad(L0)) - .5 * y * y * Math.sin(4 * rad(L0)) - 1.25 * e * e * Math.sin(2 * rad(M)));
    const minUTC = ((ms / 6e4) % 1440 + 1440) % 1440;
    let ha = ((minUTC + eot + 4 * lon) % 1440 + 1440) % 1440 / 4 - 180;
    const la = rad(lat);
    const cz = clamp(Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(rad(ha)), -1, 1), zen = Math.acos(cz);
    let az = deg(Math.acos(clamp((Math.sin(la) * cz - Math.sin(dec)) / (Math.cos(la) * Math.sin(zen) || 1e-9), -1, 1)));
    az = ha > 0 ? (az + 180) % 360 : (540 - az) % 360;
    let alt = 90 - deg(zen);
    // atmospheric refraction (NOAA)
    const te = Math.tan(rad(alt));
    const r = alt > 85 ? 0 : alt > 5 ? 58.1 / te - .07 / te ** 3 + .000086 / te ** 5 : alt > -.575 ? 1735 + alt * (-518.2 + alt * (103.4 + alt * (-12.79 + alt * .711))) : -20.772 / te;
    alt += r / 3600;
    const hs = Math.cos(rad(90.833)) / (Math.cos(la) * Math.cos(dec)) - Math.tan(la) * Math.tan(dec);
    const noon = 720 - 4 * lon - eot;           // minutes UTC
    const H = Math.abs(hs) <= 1 ? deg(Math.acos(hs)) : null;
    return { alt, az, rise: H === null ? null : noon - 4 * H, set: H === null ? null : noon + 4 * H, noon };
  }
  // US Eastern time: EDT from the 2nd Sunday in March 02:00 to the 1st Sunday in November 02:00
  const nthSunday = (y, m, n) => { const d = new Date(Date.UTC(y, m, 1)).getUTCDay(); return 1 + (7 - d) % 7 + 7 * (n - 1); };
  const isDST = (y, m, d, min) => {
    if (m < 2 || m > 10) return false; if (m > 2 && m < 10) return true;
    if (m === 2) { const s = nthSunday(y, 2, 2); return d > s || (d === s && min >= 120); }
    const s = nthSunday(y, 10, 1); return d < s || (d === s && min < 120);
  };
  const daysInYear = y => new Date(Date.UTC(y, 1, 29)).getUTCMonth() === 1 ? 366 : 365;
  const nyClock = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZoneName: 'short' });
  function newYorkTime(ms) {
    const p = Object.fromEntries(nyClock.formatToParts(ms).map(p => [p.type, p.value]));
    const year = +p.year, doy = Math.round((Date.UTC(year, +p.month - 1, +p.day) - Date.UTC(year, 0, 1)) / 864e5) + 1;
    return { year, doy, min: +p.hour * 60 + +p.minute, zone: p.timeZoneName };
  }
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const hhmm = m => { m = ((Math.round(m) % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
  const compass = a => ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][Math.round(a / 22.5) % 16];

  // ------------------------------------------------------------------ boot each block lazily
  blocks.forEach(el => {
    const stage = el.querySelector('.xp-stage'), wait = el.querySelector('.xp-wait');
    if (!hasGL) { wait.textContent = 'This browser cannot show the 3D model (WebGL is unavailable).'; el.classList.add('xp-nogl'); return; }
    const up = el.dataset.up || '';
    let started = false;
    const go = () => {
      if (started) return; started = true;
      load(up + 'assets/vendor/three.min.js').then(() => load(up + el.dataset.model)).then(() => load(up + el.dataset.adapter))
        .then(() => { const name = el.dataset.adapter.split('?')[0].split('/').pop().replace(/\.js$/, ''); setup(el, ADAPTERS[name]); })
        .catch(e => { console.error(e); wait.textContent = 'The 3D model could not be loaded.'; });
    };
    if (forced) go();
    else new IntersectionObserver((es, o) => { if (es.some(e => e.isIntersecting)) { o.disconnect(); go(); } }, { rootMargin: '700px 0px' }).observe(el);
    // desktop: build the scene during idle time after load (after the scroll animation's own warm-up), not mid-scroll
    if (!forced && matchMedia('(pointer: fine)').matches && innerWidth > 900) {
      const idle = () => setTimeout(() => (window.requestIdleCallback || (f => setTimeout(f, 1)))(go, { timeout: 5000 }), 3500);
      document.readyState === 'complete' ? idle() : addEventListener('load', idle, { once: true });
    }
  });

  function setup(el, adapter) {
    const T = window.THREE, V3 = T.Vector3;
    const stage = el.querySelector('.xp-stage'), panel = el.querySelector('.xp-panel');
    const tools = (el.dataset.tools || 'section,sun,paths').split(',');
    const lat = +el.dataset.lat, lon = +el.dataset.lon, north = +el.dataset.north;

    // -------------------------------------------------- renderer + scene
    const renderer = new T.WebGLRenderer({ antialias: true, alpha: true, stencil: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.6));
    renderer.localClippingEnabled = true;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
    renderer.setClearColor(0x000000, 0);
    stage.prepend(renderer.domElement);
    renderer.domElement.setAttribute('aria-hidden', 'true');
    // If the GPU is busy (e.g. another app holds most of the video memory) the browser can drop the WebGL context:
    // the panel kept updating while the picture froze. Show it, then come back on Low quality when the context returns.
    const gpuNote = document.createElement('div'); gpuNote.className = 'xp-gpu-note'; gpuNote.hidden = true;
    gpuNote.textContent = 'The graphics card is busy, so the 3D view paused. It will resume on Low quality; close other 3D apps for High.';
    stage.appendChild(gpuNote);
    renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); gpuNote.hidden = false; }, false);
    renderer.domElement.addEventListener('webglcontextrestored', () => {
      gpuNote.hidden = true;
      try { setQuality(false); shadowDirty = true; shadeDirty = true; } catch (e) {}
      invalidate();
    }, false);
    const scene = new T.Scene();
    const hemi = new T.HemisphereLight(0xffffff, 0xd9d2c5, 1.35); scene.add(hemi);
    const sun = new T.DirectionalLight(0xfff6ea, 2.2);
    sun.shadow.mapSize.set(2048, 2048);
    scene.add(sun, sun.target);

    // section plane (always present; 'off' = pushed far away so programs never recompile)
    const plane = new T.Plane(new V3(-1, 0, 0), 1e6);
    const ctx = { T, M: null, el, plane, util: XP.util, invalidate: () => invalidate(), shadowsDirty: () => { shadowDirty = true; invalidate(); } };
    const spec = adapter(ctx);
    const U = spec.unit === 'm' ? 1 : 1 / .3048;          // scene units per metre
    const fmtLen = v => {
      if (spec.unit === 'm') return (v >= 0 ? '+' : '') + v.toFixed(1) + ' m';
      const s = v < 0 ? '-' : '', a = Math.abs(v), ft = Math.floor(a + 1e-6), inch = Math.round((a - ft) * 12);
      return s + (inch === 12 ? (ft + 1) + "'-0\"" : ft + "'-" + inch + '"');
    };
    scene.add(spec.root);
    // model coords (Rhino Z-up) -> world (Y-up)
    const W = (x, y, z) => new V3(x, y === undefined ? 0 : z, -y);
    const F = spec.focus; // [x0,y0,z0,x1,y1,z1] model coords
    const fbox = new T.Box3(new V3(F[0], F[2], -F[4]), new V3(F[3], F[5], -F[1]));
    const fctr = fbox.getCenter(new V3()), fsize = fbox.getSize(new V3()), fR = fsize.length() / 2;
    const groundY = spec.ground !== undefined ? spec.ground : F[2];

    // clipping on every material in the model; solids get stencil writers for capping
    const stencilBack = new T.MeshBasicMaterial({ side: T.BackSide, colorWrite: false, depthWrite: false, depthTest: false, stencilWrite: true, stencilFunc: T.AlwaysStencilFunc,
      stencilFail: T.IncrementWrapStencilOp, stencilZFail: T.IncrementWrapStencilOp, stencilZPass: T.IncrementWrapStencilOp, clippingPlanes: [plane] });
    const stencilFront = new T.MeshBasicMaterial({ side: T.FrontSide, colorWrite: false, depthWrite: false, depthTest: false, stencilWrite: true, stencilFunc: T.AlwaysStencilFunc,
      stencilFail: T.DecrementWrapStencilOp, stencilZFail: T.DecrementWrapStencilOp, stencilZPass: T.DecrementWrapStencilOp, clippingPlanes: [plane] });
    const stencilMeshes = [], seenMat = new Set(), solidCache = new Map();
    const meshes = [];
    spec.root.traverse(o => { if (o.isMesh || o.isLine) meshes.push(o); });
    meshes.forEach(o => {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach(m => { if (seenMat.has(m)) return; seenMat.add(m); if (!o.userData.noClip) { m.clippingPlanes = [plane]; m.clipShadows = true; /* behaves like a cut physical model; the sun % probe uses the uncut model */ } });
      if (!o.isMesh || o.userData.noClip || o.userData.solid === false) return;
      let solid = o.userData.solid;
      if (solid === undefined) {
        if (!solidCache.has(o.geometry)) solidCache.set(o.geometry, XP.util.openness(o.geometry) < .02);
        solid = solidCache.get(o.geometry);
      }
      if (!solid) return;
      [stencilBack, stencilFront].forEach(sm => {
        let s;
        if (o.isInstancedMesh) { s = new T.InstancedMesh(o.geometry, sm, o.count); s.instanceMatrix = o.instanceMatrix; s.frustumCulled = false; }
        else s = new T.Mesh(o.geometry, sm);
        s.renderOrder = 1; s.visible = false; s.userData.parent = o; o.add(s); stencilMeshes.push(s);
      });
    });
    // -------------------------------------------------- rendered look (sun on): PBR twins of every material, sky, haze, ACES
    const pick = (a, b) => a !== undefined ? a : b;
    const stdOf = new Map();
    const toStd = m => {
      if (stdOf.has(m)) return stdOf.get(m);
      if (!m.isMeshLambertMaterial) { stdOf.set(m, m); return m; }
      const p = m.userData.pbr || {};
      const s = new T.MeshStandardMaterial({ color: pick(p.color, m.color.getHex()), map: pick(p.map, m.map), alphaMap: pick(p.alphaMap, m.alphaMap), alphaTest: pick(p.alphaTest, m.alphaTest),
        transparent: pick(p.transparent, m.transparent), opacity: pick(p.opacity, m.opacity), depthWrite: pick(p.depthWrite, m.depthWrite), side: m.side, flatShading: m.flatShading,
        vertexColors: m.vertexColors, polygonOffset: m.polygonOffset, polygonOffsetFactor: m.polygonOffsetFactor, polygonOffsetUnits: m.polygonOffsetUnits,
        roughness: pick(p.roughness, .86), metalness: pick(p.metalness, 0), clippingPlanes: m.clippingPlanes, clipShadows: m.clipShadows, alphaToCoverage: !!p.alphaToCoverage });
      stdOf.set(m, s); return s;
    };
    const modelMeshes = meshes.filter(o => o.isMesh), modelLines = meshes.filter(o => o.isLine);
    modelMeshes.forEach(o => { o.userData.matB = o.material; o.userData.matR = toStd(o.material); if (o.userData.renderOnly) o.visible = false; });
    const isMobile = matchMedia('(pointer: coarse)').matches || innerWidth < 900;
    const look = { render: false, high: Q.get('quality') ? Q.get('quality') !== 'low' : !isMobile };
    const maxTex = renderer.capabilities.maxTextureSize || 4096;
    const skyU = { sunDir: { value: new V3(0, 1, 0) }, zen: { value: new T.Color() }, hor: { value: new T.Color() }, gnd: { value: new T.Color() }, sunCol: { value: new T.Color() },
      cR: { value: new V3() }, cU: { value: new V3() }, cF: { value: new V3() }, tanF: { value: .45 }, asp: { value: 1 }, sunVis: { value: 1 } };
    const sky = new T.Mesh(new T.PlaneGeometry(2, 2), new T.ShaderMaterial({ uniforms: skyU, depthTest: false, depthWrite: false,
      vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,1.,1.);}',
      fragmentShader: 'uniform vec3 sunDir,zen,hor,gnd,sunCol,cR,cU,cF;uniform float tanF,asp,sunVis;varying vec2 vUv;' +
        'void main(){vec2 p=vUv*2.-1.;vec3 d=normalize(cF+cR*p.x*tanF*asp+cU*p.y*tanF);float h=d.y;' +
        'vec3 c=h>0.?mix(hor,zen,pow(clamp(h,0.,1.),.45)):mix(hor,gnd,pow(clamp(-h*2.5,0.,1.),.5));' +
        'float mu=max(dot(d,sunDir),0.);c+=sunCol*sunVis*(pow(mu,5.)*.22+pow(mu,48.)*.55);' +
        'c+=sunCol*sunVis*smoothstep(.99945,.9998,mu)*6.*step(-.02,h);gl_FragColor=vec4(c,1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}' }));
    sky.frustumCulled = false; sky.renderOrder = -1e9; sky.visible = false; scene.add(sky);
    const fog = new T.Fog(0xdde4ea, fR * 4.2, fR * 16);
    const agentStd = new T.MeshStandardMaterial({ color: 0xffffff, roughness: .8, clippingPlanes: [plane] });
    function setLook(render) {
      look.render = render;
      modelMeshes.forEach(o => { o.material = render ? o.userData.matR : o.userData.matB; if (o.userData.renderOnly) o.visible = render; if (o.userData.drawOnly) o.visible = !render; });
      modelLines.forEach(l => { l.visible = !render; });
      renderer.toneMapping = render ? T.ACESFilmicToneMapping : T.NoToneMapping;
      scene.fog = render && look.high ? fog : null; sky.visible = render;
      P.figs.forEach(m => { m.material = render ? agentStd : agentMat; });
      stage.classList.toggle('xp-render', render);
      setQuality(look.high);
    }
    function setQuality(high) {
      look.high = high; const sz = Math.min(maxTex, high ? 4096 : 2048);
      if (sun.shadow.mapSize.x !== sz) { sun.shadow.mapSize.set(sz, sz); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, high ? 1.6 : 1));
      scene.fog = look.render && high ? fog : null;
      if (ui.qual) ui.qual.forEach(b => b.setAttribute('aria-checked', (b.dataset.q2 === 'high') === high));
      if (typeof Wd !== 'undefined' && Wd > 1) renderer.setSize(Wd, Hd, false);
      shadowDirty = true; invalidate();
    }
    // baked contact shadows under units / trees (canvas texture on the ground)
    let aoMesh = null, aoCtx = null;
    if (spec.ao) {
      const [x0, y0, x1, y1] = spec.ao.rect, res = spec.ao.res || 8, cw = Math.round((x1 - x0) * res), ch = Math.round((y1 - y0) * res);
      const cv = document.createElement('canvas'); cv.width = Math.min(2048, cw); cv.height = Math.min(2048, ch); aoCtx = cv.getContext('2d');
      const tex = new T.CanvasTexture(cv);
      const g = new T.PlaneGeometry(x1 - x0, y1 - y0); g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, spec.ao.z, -(y0 + y1) / 2);
      aoMesh = new T.Mesh(g, new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, clippingPlanes: [plane], polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
      aoMesh.renderOrder = 2; scene.add(aoMesh);
      aoMesh.userData.draw = () => {
        const c = aoCtx, sx = cv.width / (x1 - x0), sy = cv.height / (y1 - y0); c.clearRect(0, 0, cv.width, cv.height);
        spec.ao.blobs(S.layout).forEach(([x, y, w, h, a, al]) => {
          c.save(); c.translate((x - x0) * sx, (y1 - y) * sy); c.rotate(-a); c.scale(w / 2 * sx, h / 2 * sy);
          const gr = c.createRadialGradient(0, 0, 0, 0, 0, 1); gr.addColorStop(0, 'rgba(20,16,12,' + al + ')'); gr.addColorStop(.55, 'rgba(20,16,12,' + al * .7 + ')'); gr.addColorStop(1, 'rgba(20,16,12,0)');
          c.fillStyle = gr; c.fillRect(-1, -1, 2, 2); c.restore();
        });
        tex.needsUpdate = true;
      };
    }
    const capMat = new T.MeshBasicMaterial({ color: spec.poche || 0x2f2b27, side: T.DoubleSide, stencilWrite: true, stencilRef: 0, stencilFunc: T.NotEqualStencilFunc,
      stencilFail: T.ReplaceStencilOp, stencilZFail: T.ReplaceStencilOp, stencilZPass: T.ReplaceStencilOp });
    const cap = new T.Mesh(new T.PlaneGeometry(1, 1), capMat); cap.renderOrder = 1.1; cap.visible = false;
    cap.onAfterRender = r => r.clearStencil();
    scene.add(cap);
    const outline = new T.LineLoop(new T.BufferGeometry().setFromPoints([new V3(-.5, -.5, 0), new V3(.5, -.5, 0), new V3(.5, .5, 0), new V3(-.5, .5, 0)]),
      new T.LineBasicMaterial({ color: 0xc8662f, transparent: true, opacity: .9, depthTest: false }));
    outline.renderOrder = 8; outline.visible = false; scene.add(outline);
    const handle = new T.Group(); handle.visible = false; scene.add(handle);
    const hMat = new T.MeshBasicMaterial({ color: 0xc8662f, depthTest: false, transparent: true });
    const hBall = new T.Mesh(new T.SphereGeometry(1, 20, 14), hMat); hBall.renderOrder = 9; handle.add(hBall);
    const hCone1 = new T.Mesh(new T.ConeGeometry(.7, 1.6, 16), hMat), hCone2 = hCone1.clone();
    hCone1.position.y = 2.2; hCone2.position.y = -2.2; hCone2.rotation.z = Math.PI; hCone1.renderOrder = hCone2.renderOrder = 9; handle.add(hCone1, hCone2);

    // -------------------------------------------------- state
    const S = {
      section: { on: false, axis: 'x', pos: .5, flip: false },
      sun: { on: true, year: 2026, doy: 202, min: 14 * 60, path: true, shade: false, play: false, live: false, liveMs: null, frozenMs: null, zone: null },
      paths: { on: !!spec.paths, play: !reduce, speed: 1, trails: true, t: 0 },
      layout: spec.layouts ? spec.layouts.value : null,
      canopy: { show: true, dep: 1, target: 1 },
      tab: el.dataset.defaultTab || tools[0]
    };
    const dsun = el.dataset.date;
    const parseSun = s => { const m = /^(\d{4})-(\d\d)-(\d\d)(?:T(\d\d):(\d\d))?/.exec(s || ''); if (!m) return null; return { y: +m[1], doy: doyOf(+m[1], +m[2] - 1, +m[3]), min: m[4] ? +m[4] * 60 + +m[5] : null }; };
    const doyOf = (y, m, d) => Math.round((Date.UTC(y, m, d) - Date.UTC(y, 0, 1)) / 864e5) + 1;
    const dateOf = (y, doy) => { const d = new Date(Date.UTC(y, 0, doy)); return { m: d.getUTCMonth(), d: d.getUTCDate() }; };
    const ds = parseSun(dsun); if (ds) { S.sun.year = ds.y; S.sun.doy = ds.doy; if (ds.min !== null) S.sun.min = ds.min; }
    // URL overrides
    if (Q.get('sun') === 'off') S.sun.on = false; else { const u = parseSun(Q.get('sun')); if (u) { S.sun.year = u.y; S.sun.doy = u.doy; if (u.min !== null) S.sun.min = u.min; } }
    if (Q.get('section') === 'off') S.section.on = false;
    else if (Q.get('section')) { const [a, v] = Q.get('section').split(':'); S.section.on = true; if (a === 'plan') { S.section.axis = 'z'; S.section.level = +v || 0; } else { S.section.axis = a; S.section.pos = clamp(+v, 0, 1); } }
    else if (spec.defaults && spec.defaults.section) Object.assign(S.section, { on: true }, spec.defaults.section);
    if (Q.get('flip') === '1') S.section.flip = true;
    if (Q.get('paths') !== null) S.paths.on = Q.get('paths') !== '0';
    if (Q.get('t') !== null) { S.paths.t = +Q.get('t'); S.paths.play = false; }
    if (Q.get('speed')) S.paths.speed = +Q.get('speed');
    if (Q.get('trails') === '0') S.paths.trails = false;
    if (Q.get('layout') && spec.layouts) S.layout = Q.get('layout');
    if (Q.get('shade') === '1') S.sun.shade = true;
    if (Q.get('canopy') === '0') S.canopy.show = false;
    if (Q.get('fold') !== null && spec.deploy) S.canopy.dep = S.canopy.target = clamp(1 - +Q.get('fold'), 0, 1);
    if (Q.get('gizmo') === '0') S.sun.path = false;
    if (Q.get('tab')) S.tab = Q.get('tab');
    if (Q.get('live') === '1') { S.sun.live = true; S.sun.on = true; }
    if (forced && Q.get('t') === null) S.paths.play = false;

    // -------------------------------------------------- cameras + orbit controller
    const persp = new T.PerspectiveCamera(50, 1, .1, 1e5), ortho = new T.OrthographicCamera(-1, 1, 1, -1, -1e5, 1e5);
    const C = { target: fctr.clone(), yaw: -.8, pitch: .6, dist: fR * 2, mode: 'axon', fov: 50 };
    let cam = ortho, Wd = 1, Hd = 1;
    const VFOV = 35;   // virtual fov tying ortho half-height to distance
    const camDir = () => new V3(Math.sin(C.yaw) * Math.cos(C.pitch), Math.sin(C.pitch), Math.cos(C.yaw) * Math.cos(C.pitch));
    function applyCam() {
      const d = camDir(), asp = Wd / Hd;
      if (C.mode === 'eye') {
        cam = persp; persp.fov = C.fov; persp.aspect = asp; persp.near = .15 / (spec.unit === 'm' ? 3.28 : 1); persp.far = fR * 30;
        persp.position.copy(C.target).addScaledVector(d, C.dist); persp.up.set(0, 1, 0); persp.lookAt(C.target); persp.updateProjectionMatrix();
      } else {
        cam = ortho; const half = C.dist * Math.tan(rad(VFOV / 2));
        ortho.left = -half * asp; ortho.right = half * asp; ortho.top = half; ortho.bottom = -half; ortho.near = -fR * 20; ortho.far = fR * 20;
        ortho.position.copy(C.target).addScaledVector(d, fR * 4); ortho.up.set(0, 1, 0); ortho.lookAt(C.target); ortho.updateProjectionMatrix();
      }
      cam.updateMatrixWorld();
    }
    // fit the focus box for the current yaw/pitch (ortho)
    function fit(pad = 1.06) {
      C.target.copy(fctr); applyCam();
      const right = new V3().setFromMatrixColumn(cam.matrixWorld, 0), upv = new V3().setFromMatrixColumn(cam.matrixWorld, 1);
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      const pts = [];
      for (let i = 0; i < 8; i++) pts.push(new V3(i & 1 ? fbox.max.x : fbox.min.x, i & 2 ? fbox.max.y : fbox.min.y, i & 4 ? fbox.max.z : fbox.min.z));
      // in axon, keep the whole sun-path dome in frame when it is shown (it now wraps the building, so it is bigger)
      try {
        if (C.mode === 'axon' && S.sun.on && S.sun.path)
          for (let k = 0; k < 24; k++) { const a = k / 24 * 6.2832;
            pts.push(new V3(gizmo.position.x + Math.cos(a) * gR, gizmo.position.y, gizmo.position.z + Math.sin(a) * gR));
            pts.push(new V3(gizmo.position.x + Math.cos(a) * gR * .7, gizmo.position.y + gR * .71, gizmo.position.z + Math.sin(a) * gR * .7)); }
      } catch (e) { /* gizmo not built yet */ }
      for (const p of pts) {
        const c = p.clone().sub(fctr);
        const a = c.dot(right), b = c.dot(upv); x0 = Math.min(x0, a); x1 = Math.max(x1, a); y0 = Math.min(y0, b); y1 = Math.max(y1, b);
      }
      const asp = Wd / Hd, half = Math.max((y1 - y0) / 2, (x1 - x0) / 2 / asp) * pad;
      C.target.copy(fctr).addScaledVector(right, (x0 + x1) / 2).addScaledVector(upv, (y0 + y1) / 2);
      C.dist = half / Math.tan(rad(VFOV / 2));
    }
    function setView(v, keepAngles) {
      C.mode = v;
      if (v === 'plan') { C.yaw = 0; C.pitch = Math.PI / 2 - 1e-3; fit(1.04); }
      else if (v === 'axon') { if (!keepAngles) { const vw = Object.assign({ yaw: -.8, pitch: .6 }, spec.view, Wd / Hd < .85 && spec.view && spec.view.portrait || {}); C.yaw = vw.yaw; C.pitch = vw.pitch; } fit(spec.view && spec.view.pad || 1.04); }
      else {
        const e = spec.eye, from = W(...e.from), to = W(...e.to), d = from.clone().sub(to);
        C.target.copy(to); C.dist = d.length(); C.yaw = Math.atan2(d.x, d.z); C.pitch = Math.asin(d.y / C.dist); C.fov = e.fov || 58;
      }
      viewBtns.forEach(b => b.setAttribute('aria-pressed', b.dataset.v === v));
      applyCam(); invalidate();
    }
    const worldPerPx = () => cam.isOrthographicCamera ? (ortho.top - ortho.bottom) / Hd : 2 * C.dist * Math.tan(rad(C.fov / 2)) / Hd;
    function rotate(dx, dy) {
      if (C.mode === 'plan') { C.mode = 'axon'; C.pitch = 1.2; viewBtns.forEach(b => b.setAttribute('aria-pressed', false)); }
      if (C.mode === 'eye') {          // look around from where you stand
        const pos = C.target.clone().addScaledVector(camDir(), C.dist);
        C.yaw += dx * .005; C.pitch = clamp(C.pitch - dy * .004, -1.2, 1.2);
        C.target.copy(pos).addScaledVector(camDir(), -C.dist);
      } else { C.yaw -= dx * .006; C.pitch = clamp(C.pitch + dy * .005, .03, Math.PI / 2 - 1e-3); }
      applyCam(); invalidate();
    }
    function pan(dx, dy) {
      const k = worldPerPx(), right = new V3().setFromMatrixColumn(cam.matrixWorld, 0), upv = new V3().setFromMatrixColumn(cam.matrixWorld, 1);
      if (C.mode === 'eye') { const f = new V3(-Math.sin(C.yaw), 0, -Math.cos(C.yaw)); right.y = 0; right.normalize(); C.target.addScaledVector(right, -dx * k).addScaledVector(f, dy * k); }
      else C.target.addScaledVector(right, -dx * k).addScaledVector(upv, dy * k);
      applyCam(); invalidate();
    }
    const ray = new T.Raycaster(), ndc = new T.Vector2();
    function zoom(f, cx, cy) {
      if (C.mode === 'eye') { const fw = camDir().negate(); fw.y = 0; fw.normalize(); C.target.addScaledVector(fw, (f < 1 ? 1 : -1) * fR * .035); applyCam(); invalidate(); return; }
      const nd = clamp(C.dist * f, fR * .05, fR * 8), k = nd / C.dist;
      if (cx !== undefined) {   // zoom towards the cursor
        const r = stage.getBoundingClientRect(); ndc.set((cx - r.left) / r.width * 2 - 1, -(cy - r.top) / r.height * 2 + 1);
        ray.setFromCamera(ndc, cam);
        const p = new V3(); if (ray.ray.intersectPlane(new T.Plane(new V3(0, 1, 0), -C.target.y), p)) C.target.lerp(p, 1 - k);
      }
      C.dist = nd; applyCam(); invalidate();
    }

    // pointer input (mouse, pen, touch with pinch) + section handle drag
    const ptrs = new Map(); let gesture = null, dragHandle = null;
    const el2 = renderer.domElement; el2.style.touchAction = 'none';
    el2.addEventListener('contextmenu', e => e.preventDefault());
    el2.addEventListener('pointerdown', e => {
      el2.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      if (ptrs.size === 1 && S.section.on && handle.visible) {
        const r = stage.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
        ray.setFromCamera(ndc, cam);
        if (ray.intersectObject(handle, true).length) { dragHandle = { x: e.clientX, y: e.clientY, pos: S.section.pos }; stage.classList.add('xp-grab'); return; }
      }
      gesture = { btn: e.button, shift: e.shiftKey || e.ctrlKey || e.metaKey };
      stage.classList.add('xp-grab');
    });
    el2.addEventListener('pointermove', e => {
      if (!ptrs.has(e.pointerId)) {   // hover: show the handle cursor
        if (S.section.on && handle.visible && e.pointerType === 'mouse') {
          const r = stage.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
          ray.setFromCamera(ndc, cam); stage.classList.toggle('xp-ns', ray.intersectObject(handle, true).length > 0);
        }
        return;
      }
      const prev = ptrs.get(e.pointerId), dx = e.clientX - prev[0], dy = e.clientY - prev[1];
      if (dragHandle) {   // move along the plane normal's screen direction
        const n = axisVec(S.section.axis), a = handle.position.clone().project(cam), b = handle.position.clone().add(n).project(cam);
        const sx = (b.x - a.x) * Wd / 2, sy = -(b.y - a.y) * Hd / 2, L2 = sx * sx + sy * sy;
        if (L2 > 1e-6) {
          const tx = e.clientX - dragHandle.x, ty = e.clientY - dragHandle.y, dw = (tx * sx + ty * sy) / L2;
          const [lo, hi] = axisRange(S.section.axis); setSection({ pos: clamp(dragHandle.pos + dw / (hi - lo), 0, 1) });
        }
        ptrs.set(e.pointerId, [e.clientX, e.clientY]); return;
      }
      if (ptrs.size === 2) {
        const ids = [...ptrs.keys()], o = ids.find(i => i !== e.pointerId), q = ptrs.get(o);
        const d0 = Math.hypot(prev[0] - q[0], prev[1] - q[1]), d1 = Math.hypot(e.clientX - q[0], e.clientY - q[1]);
        if (d1 > 0 && d0 > 0) zoom(d0 / d1, (e.clientX + q[0]) / 2, (e.clientY + q[1]) / 2);
        pan(dx / 2, dy / 2);
      } else if (gesture && (gesture.btn === 2 || gesture.btn === 1 || gesture.shift)) pan(dx, dy);
      else rotate(dx, dy);
      ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    });
    const endPtr = e => { ptrs.delete(e.pointerId); if (!ptrs.size) { gesture = null; dragHandle = null; stage.classList.remove('xp-grab'); } };
    el2.addEventListener('pointerup', endPtr); el2.addEventListener('pointercancel', endPtr);
    el2.addEventListener('wheel', e => { e.preventDefault(); zoom(Math.exp(clamp(e.deltaY, -120, 120) * (e.deltaMode ? .05 : .0016)), e.clientX, e.clientY); }, { passive: false });
    el2.addEventListener('dblclick', () => setView(C.mode === 'eye' ? 'eye' : 'axon', C.mode === 'axon'));
    stage.addEventListener('keydown', e => {
      if (e.target !== stage) return;
      const k = e.key, s = e.shiftKey;
      if (k === 'ArrowLeft') s ? pan(-30, 0) : rotate(-25, 0); else if (k === 'ArrowRight') s ? pan(30, 0) : rotate(25, 0);
      else if (k === 'ArrowUp') s ? pan(0, -30) : rotate(0, -20); else if (k === 'ArrowDown') s ? pan(0, 30) : rotate(0, 20);
      else if (k === '+' || k === '=') zoom(.85); else if (k === '-' || k === '_') zoom(1 / .85);
      else if (k === 'r' || k === 'R') setView('axon'); else return;
      e.preventDefault();
    });

    // -------------------------------------------------- overlay UI on the stage
    const ov = document.createElement('div'); ov.className = 'xp-ov';
    ov.innerHTML = '<div class="xp-views" role="group" aria-label="View presets"><button type="button" data-v="plan">Plan</button><button type="button" data-v="axon">Axon</button>' +
      (spec.eye ? '<button type="button" data-v="eye">Eye level</button>' : '') + '<button type="button" data-v="reset" aria-label="Reset view">Reset</button></div>' +
      '<div class="xp-north" aria-hidden="true"><svg viewBox="-20 -20 40 40" width="40" height="40"><circle r="15" fill="none" stroke="currentColor" stroke-opacity=".35"/><path d="M0 -15 L4 2 L0 -1 L-4 2Z" fill="currentColor"/><text y="-17.5" text-anchor="middle" font-size="7">N</text></svg></div>' +
      '<div class="xp-hud" aria-live="polite"></div>';
    stage.appendChild(ov);
    const viewBtns = [...ov.querySelectorAll('.xp-views button')].filter(b => b.dataset.v !== 'reset');
    ov.querySelectorAll('.xp-views button').forEach(b => b.addEventListener('click', () => setView(b.dataset.v === 'reset' ? 'axon' : b.dataset.v)));
    const northEl = ov.querySelector('.xp-north'), northSvg = northEl.querySelector('svg'), hud = ov.querySelector('.xp-hud');
    const northW = (() => { const t = rad(north); return new V3(Math.cos(t), 0, -Math.sin(t)); })();

    // -------------------------------------------------- section
    const axisVec = a => a === 'x' ? new V3(1, 0, 0) : a === 'y' ? new V3(0, 0, -1) : new V3(0, 1, 0);   // direction of increasing model coordinate
    const axisRange = a => a === 'x' ? [F[0], F[3]] : a === 'y' ? [F[1], F[4]] : [F[2], F[5]];
    const levels = spec.levels || [{ name: 'Ground', z: groundY }];
    const cutH = spec.unit === 'm' ? 1.2 : 4;
    function setSection(p) {
      Object.assign(S.section, p);
      const s = S.section, [lo, hi] = axisRange(s.axis), v = lo + (hi - lo) * s.pos, n = axisVec(s.axis);
      // keep the side with smaller coordinate (flip keeps the other)
      if (!s.on) plane.set(new V3(-1, 0, 0), 1e6);
      else {
        const nn = n.clone().multiplyScalar(s.flip ? 1 : -1);
        const pt = s.axis === 'x' ? new V3(v, 0, 0) : s.axis === 'y' ? new V3(0, 0, -v) : new V3(0, v, 0);
        plane.setFromNormalAndCoplanarPoint(nn, pt);
      }
      stencilMeshes.forEach(m => { m.visible = s.on; });
      cap.visible = outline.visible = handle.visible = s.on;
      if (s.on) {
        const pad = 1.002, sx = fsize.x * pad, sy = fsize.y * pad, sz = fsize.z * pad;
        const q = new T.Quaternion();
        if (s.axis === 'x') { cap.scale.set(sz, sy, 1); q.setFromAxisAngle(new V3(0, 1, 0), Math.PI / 2); cap.position.set(v, fctr.y, fctr.z); }
        else if (s.axis === 'y') { cap.scale.set(sx, sy, 1); q.identity(); cap.position.set(fctr.x, fctr.y, -v); }
        else { cap.scale.set(sx, sz, 1); q.setFromAxisAngle(new V3(1, 0, 0), -Math.PI / 2); cap.position.set(fctr.x, v, fctr.z); }
        cap.quaternion.copy(q); outline.position.copy(cap.position); outline.quaternion.copy(q); outline.scale.copy(cap.scale);
        // handle at the top edge (vertical cuts) or the near corner (plan cut)
        const hs = fR * .022; handle.scale.setScalar(hs);
        if (s.axis === 'z') { handle.position.set(fbox.max.x, v, fbox.max.z); handle.quaternion.identity(); }
        else { handle.position.copy(cap.position); handle.position.y = fbox.max.y + hs * 2; handle.quaternion.setFromUnitVectors(new V3(0, 1, 0), n); }
      }
      if (ui.secPos) { ui.secPos.value = Math.round(s.pos * 1000); ui.secOut.textContent = fmtLen(s.axis === 'z' ? v - groundY : v); ui.secPos.setAttribute('aria-valuetext', ui.secOut.textContent); }
      if (ui.secAxis) ui.secAxis.forEach(b => b.setAttribute('aria-checked', b.dataset.v === s.axis));
      if (ui.secSw) ui.secSw.setAttribute('aria-checked', s.on);
      panel.classList.toggle('xp-sec-on', s.on);
      markTabs(); shadowDirty = true; invalidate();
    }
    const faceCam = a => a !== 'z' && axisVec(a).dot(camDir()) <= 0;   // keep the half whose cut face looks at the camera
    const planAt = i => { const L = levels[clamp(i, 0, levels.length - 1)], [lo, hi] = axisRange('z'); setSection({ on: true, axis: 'z', flip: false, pos: clamp((L.z + cutH - lo) / (hi - lo), 0, 1) }); };

    // -------------------------------------------------- sun, sky, gizmo
    const gizmo = new T.Group(); scene.add(gizmo);
    // sun-path dome sized to ENCLOSE the building body (focus box): every point of the hemisphere lies outside the box,
    // so the path never cuts through the walls; it is also drawn on top (no depth test) so neighbours can't hide it.
    const gR = Math.hypot(fsize.x / 2, fsize.z / 2, Math.max(0, F[5] - (spec.ground !== undefined ? spec.ground : F[2]))) * (spec.gizmoPad || 1.12);
    const gC = new V3(fctr.x, groundY, fctr.z);
    const dashMat = new T.LineDashedMaterial({ color: 0xb07a3a, dashSize: gR * .03, gapSize: gR * .02, transparent: true, opacity: .85 });
    const ring = new T.LineLoop(new T.BufferGeometry().setFromPoints([...Array(96)].map((_, i) => new V3(Math.cos(i / 96 * 6.2832) * gR, 0, Math.sin(i / 96 * 6.2832) * gR))),
      new T.LineBasicMaterial({ color: 0x8a6a3f, transparent: true, opacity: .35 }));
    gizmo.add(ring);
    const sprite = (txt, size, color) => {
      const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
      x.font = '600 34px Helvetica, Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = color; x.fillText(txt, 32, 34);
      const sp = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(c), depthTest: false, transparent: true })); sp.scale.setScalar(size); sp.renderOrder = 7; return sp;
    };
    ['N', 'E', 'S', 'W'].forEach((t, i) => {
      const a = rad(north - 90 * i), sp = sprite(t, gR * .09, i ? '#8a6a3f' : '#3a2a1a');
      sp.position.set(Math.cos(a) * gR * 1.08, 0, -Math.sin(a) * gR * 1.08); gizmo.add(sp);
      const tk = new T.Line(new T.BufferGeometry().setFromPoints([new V3(Math.cos(a) * gR * .96, 0, -Math.sin(a) * gR * .96), new V3(Math.cos(a) * gR, 0, -Math.sin(a) * gR)]), ring.material); gizmo.add(tk);
    });
    let arc = new T.Line(new T.BufferGeometry(), dashMat); gizmo.add(arc);
    const hourDots = new T.Points(new T.BufferGeometry(), new T.PointsMaterial({ color: 0x8a6a3f, size: 4, sizeAttenuation: false }));
    gizmo.add(hourDots);
    const sunBall = new T.Mesh(new T.SphereGeometry(gR * .035, 20, 14), new T.MeshBasicMaterial({ color: 0xf2b441 })); gizmo.add(sunBall);
    const sunRay = new T.Line(new T.BufferGeometry().setFromPoints([new V3(), new V3()]), new T.LineBasicMaterial({ color: 0xf2b441, transparent: true, opacity: .55 })); gizmo.add(sunRay);
    gizmo.position.copy(gC); gizmo.traverse(o => { o.userData.noClip = true; if (o.material && !o.isSprite) { o.material.depthTest = false; o.material.depthWrite = false; o.material.transparent = true; o.renderOrder = 6; } });

    const sunVec = (alt, az) => {   // world unit vector towards the sun
      const a = rad(alt), z = rad(az), t = rad(north), e = Math.sin(z) * Math.cos(a), n = Math.cos(z) * Math.cos(a);
      return new V3(e * Math.sin(t) + n * Math.cos(t), Math.sin(a), -(-e * Math.cos(t) + n * Math.sin(t)));
    };
    const utcOf = (y, doy, min) => { const { m, d } = dateOf(y, doy), off = isDST(y, m, d, min) ? -4 : -5; return Date.UTC(y, 0, doy) + (min - off * 60) * 6e4; };
    const tzOf = (y, doy, min) => { const { m, d } = dateOf(y, doy); return isDST(y, m, d, min) ? 'EDT' : 'EST'; };
    const localMin = (y, doy, utcMin) => { const { m, d } = dateOf(y, doy); const o = isDST(y, m, d, 720) ? -4 : -5; return utcMin + o * 60; };
    let sol = null, shadowDirty = true, lastArcKey = '';
    const KEYDIR = new V3(-.55, .78, .5).normalize();
    function fitShadow(dir) {
      const sc = sun.shadow.camera, R = fR * 3;
      sun.position.copy(fctr).addScaledVector(dir, R); sun.target.position.copy(fctr); sun.target.updateMatrixWorld(); sun.updateMatrixWorld();
      sc.position.copy(sun.position); sc.lookAt(fctr); sc.updateMatrixWorld();
      const inv = sc.matrixWorldInverse.copy(sc.matrixWorld).invert();
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9;
      const sb = spec.shadowBox ? new T.Box3(W(spec.shadowBox[0], spec.shadowBox[4], spec.shadowBox[2]), W(spec.shadowBox[3], spec.shadowBox[1], spec.shadowBox[5])) : fbox;
      for (let i = 0; i < 8; i++) {
        const c = new V3(i & 1 ? sb.max.x : sb.min.x, i & 2 ? sb.max.y : sb.min.y, i & 4 ? sb.max.z : sb.min.z).applyMatrix4(inv);
        x0 = Math.min(x0, c.x); x1 = Math.max(x1, c.x); y0 = Math.min(y0, c.y); y1 = Math.max(y1, c.y); z0 = Math.min(z0, c.z); z1 = Math.max(z1, c.z);
      }
      if (spec.casterBox) {   // tall neighbours outside the focus still have to land in the shadow map's depth range
        const cb = spec.casterBox;
        for (let i = 0; i < 8; i++) { const c = W(i & 1 ? cb[3] : cb[0], i & 2 ? cb[4] : cb[1], i & 4 ? cb[5] : cb[2]).applyMatrix4(inv); z1 = Math.max(z1, c.z); }
      }
      sc.left = x0; sc.right = x1; sc.bottom = y0; sc.top = y1; sc.near = -z1 - fR * .05; sc.far = -z0 + fR * .05; sc.updateProjectionMatrix();
      const texel = Math.max(x1 - x0, y1 - y0) / sun.shadow.mapSize.x;
      sun.shadow.bias = -.0002; sun.shadow.normalBias = texel * 1.4; sun.shadow.radius = 2;
    }
    const cWarm = new T.Color(0xffa95e), cDay = new T.Color(0xfff4e6), tmpC = new T.Color();
    function updateSun() {
      const s = S.sun;
      if (look.render !== s.on) setLook(s.on);
      if (!s.on) {
        sol = null; sun.castShadow = false; sun.color.set(0xffffff); sun.intensity = 1.5; hemi.intensity = 1.55; hemi.color.set(0xffffff); hemi.groundColor.set(0xd9d2c5);
        sun.position.copy(fctr).addScaledVector(KEYDIR, fR * 3); sun.target.position.copy(fctr);
        gizmo.visible = false; stage.style.removeProperty('--xp-sky'); stage.classList.remove('xp-night'); shadeOverlay && (shadeOverlay.visible = false);
        hudSun(); invalidate(); return;
      }
      const ms = s.live ? s.liveMs : (s.frozenMs ?? utcOf(s.year, s.doy, s.min)); sol = solar(ms, lat, lon);
      const alt = sol.alt, dir = sunVec(Math.max(alt, .5), sol.az);
      const day = sstep(-2, 4, alt), low = 1 - sstep(4, 28, alt);
      sun.castShadow = alt > -1;
      sun.color.copy(cDay).lerp(cWarm, low * .85);
      fitShadow(dir);
      const night = 1 - sstep(-8, 2, alt), dusk = 1 - sstep(-1, 14, alt);
      // physical-ish sky: zenith / horizon / ground haze colours by sun altitude
      const Z = skyU.zen.value.set(0x3d6fb4).lerp(tmpC.set(0x4f6c9c), dusk).lerp(tmpC.set(0x0c1322), night);
      const Hc = skyU.hor.value.set(0xcfdbe4).lerp(tmpC.set(0xf0ad7a), dusk * (1 - night)).lerp(tmpC.set(0x1d2738), night);
      const G = skyU.gnd.value.set(0xd6d0c3).lerp(tmpC.set(0x9a8a7a), dusk).lerp(tmpC.set(0x121821), night);
      skyU.sunCol.value.copy(sun.color).multiplyScalar(day); skyU.sunDir.value.copy(sunVec(alt, sol.az)); skyU.sunVis.value = sstep(-3, 1, alt);
      fog.color.copy(Hc).lerp(G, .35);
      if (look.render) {
        sun.intensity = 3.1 * day * (1 - .25 * low);
        hemi.intensity = .95 - .55 * night; hemi.color.copy(Z).lerp(Hc, .45).lerp(tmpC.set(0xffffff), .25 * (1 - night)); hemi.groundColor.set(0xa39684).lerp(tmpC.set(0x1a1f29), night);
        renderer.toneMappingExposure = .92 + .22 * dusk * (1 - night) + .9 * night;
      } else {
        sun.intensity = 2.15 * day * (1 - .3 * low);
        hemi.intensity = 1.22 - .55 * night - .1 * low * (1 - night);
        hemi.color.set(0xffffff).lerp(tmpC.set(0xffd9b8), low * .5 * (1 - night)).lerp(tmpC.set(0x7d8fb5), night);
        hemi.groundColor.set(0xd9d2c5).lerp(tmpC.set(0x2d3444), night);
      }
      // sky behind the canvas
      const sky = night > .6 ? '#232a37' : night > .2 ? '#5a6278' : low > .55 ? '#f3e1cd' : low > .2 ? '#f3ebdf' : '#eef0ee';
      stage.style.setProperty('--xp-sky', sky); stage.classList.toggle('xp-night', night > .45);
      // gizmo: today's sun path on a dome
      gizmo.visible = s.path;
      const key = s.year + '/' + s.doy;
      if (key !== lastArcKey) {
        lastArcKey = key; const pts = [], hrs = [], d0 = Date.UTC(s.year, 0, s.doy);
        for (let m = 0; m <= 1440; m += 10) {
          const lm = m, o = solar(utcOf(s.year, s.doy, lm), lat, lon);
          if (o.alt > -.5) { const v = sunVec(o.alt, o.az).multiplyScalar(gR); pts.push(v); if (lm % 60 === 0) hrs.push(v); }
        }
        arc.geometry.dispose(); arc.geometry = new T.BufferGeometry().setFromPoints(pts); arc.computeLineDistances();
        hourDots.geometry.dispose(); hourDots.geometry = new T.BufferGeometry().setFromPoints(hrs);
      }
      const sv = sunVec(alt, sol.az).multiplyScalar(gR); sunBall.position.copy(sv); sunBall.visible = alt > -.5;
      sunRay.geometry.attributes.position.setXYZ(1, sv.x, sv.y, sv.z); sunRay.geometry.attributes.position.needsUpdate = true; sunRay.visible = alt > -.5;
      shadowDirty = true; shadeDirty = true; hudSun(); invalidate();
    }
    function hudSun() {
      const s = S.sun, { m, d } = dateOf(s.year, s.doy), zone = s.live || s.frozenMs !== null ? s.zone : tzOf(s.year, s.doy, s.min);
      if (ui.sunDate) {
        ui.sunDate.max = daysInYear(s.year); ui.sunDate.value = s.doy; ui.dateOut.textContent = d + ' ' + MON[m] + ' ' + s.year; ui.sunDate.setAttribute('aria-valuetext', d + ' ' + MONL[m] + ' ' + s.year);
        ui.sunTime.value = s.min; ui.timeOut.textContent = hhmm(s.min) + ' ' + zone; ui.sunTime.setAttribute('aria-valuetext', ui.timeOut.textContent);
        ui.sunLive.setAttribute('aria-pressed', s.live);
        ui.sunStatus.textContent = s.live ? 'Live New York time · updates every minute' : s.play ? 'Playing a day · New York time' : 'Drag the time slider to move the shadows.';
        ui.sunSw.setAttribute('aria-checked', s.on); panel.classList.toggle('xp-sun-on', s.on);
        if (sol) {
          ui.rAlt.textContent = sol.alt.toFixed(1) + '°'; ui.rAz.textContent = Math.round(sol.az) + '° ' + compass(sol.az);
          ui.rRise.textContent = sol.rise === null ? '–' : hhmm(localMin(s.year, s.doy, sol.rise)); ui.rSet.textContent = sol.set === null ? '–' : hhmm(localMin(s.year, s.doy, sol.set));
        }
        if (ui.sunPlay) ui.sunPlay.setAttribute('aria-pressed', s.play), ui.sunPlay.textContent = s.play ? 'Pause day' : 'Play day';
      }
      let h = '';
      if (s.on && sol) h += '<span><b>' + (s.live ? 'Live &middot; ' : '') + d + ' ' + MON[m] + ' &middot; ' + hhmm(s.min) + ' ' + zone + '</b>' +
        (sol.alt > 0 ? 'Sun ' + sol.alt.toFixed(0) + '° high, ' + compass(sol.az) : sol.alt > -6 ? 'Twilight' : 'Night') + '</span>';
      if (s.on && spec.shade) h += '<span class="xp-shade-read"><b>' + (shadeVal === null ? '&hellip;' : Math.round(shadeVal * 100) + '%') + '</b>' + spec.shade.label + ' in direct sun' + (S.canopy.show ? '' : ' with no canopies') + (spec.shade.compare && shadeVal2 !== null ? ' &middot; ' + Math.round(shadeVal2 * 100) + '% ' + (S.canopy.show ? spec.shade.compare.label : (spec.shade.compare.labelOn || 'with them')) : '') + '</span>';
      hud.innerHTML = h;
      markTabs();
    }

    // -------------------------------------------------- shade map (GPU sampling of the shadow map on a coarse grid)
    let shadeVal = null, shadeVal2 = null, shadeDirty = true, shadeOverlay = null, shadeProbe = null, lastShade = 0;
    function buildShade() {
      const sh = spec.shade, [x0, y0, x1, y1] = sh.rect, cell = sh.cell || 2, ss = 4;
      const cols = Math.round((x1 - x0) / cell), rows = Math.round((y1 - y0) / cell), w = x1 - x0, h = y1 - y0;
      const geo = new T.PlaneGeometry(w, h); geo.rotateX(-Math.PI / 2); geo.translate((x0 + x1) / 2, sh.z, -(y0 + y1) / 2);
      const pA = new T.Mesh(geo, new T.MeshLambertMaterial({ color: 0xffffff })); pA.receiveShadow = true;
      const pB = new T.Mesh(geo, new T.MeshLambertMaterial({ color: 0xffffff })); pB.receiveShadow = false;
      const pScene = new T.Scene(); pScene.add(pA, pB);
      const pc = new T.OrthographicCamera(-w / 2, w / 2, h / 2, -h / 2, .1, 2000); pc.position.set((x0 + x1) / 2, sh.z + 500, -(y0 + y1) / 2); pc.up.set(0, 0, -1); pc.lookAt((x0 + x1) / 2, sh.z, -(y0 + y1) / 2);
      const rt = new T.WebGLRenderTarget(cols * ss, rows * ss);
      const bufA = new Uint8Array(cols * ss * rows * ss * 4), bufB = new Uint8Array(bufA.length);
      const data = new Uint8Array(cols * rows * 4), tex = new T.DataTexture(data, cols, rows); tex.magFilter = T.NearestFilter; tex.needsUpdate = true;
      const ov = new T.Mesh(geo.clone().translate(0, sh.lift || .15, 0), new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, clippingPlanes: [plane] }));
      ov.renderOrder = 3; scene.add(ov); shadeOverlay = ov;
      shadeProbe = { pA, pB, pScene, pc, rt, bufA, bufB, data, tex, cols, rows, ss };
    }
    function runShade() {
      const P = shadeProbe; if (!P) return;
      if (!sol || sol.alt <= 0 || !sun.castShadow) { shadeVal = 0; shadeVal2 = 0; P.data.fill(0); for (let i = 0; i < P.cols * P.rows; i++) { P.data[4 * i] = 63; P.data[4 * i + 1] = 95; P.data[4 * i + 2] = 127; P.data[4 * i + 3] = 110; } P.tex.needsUpdate = true; hudSun(); return; }
      const cut = S.section.on, saved = plane.clone(), cmp = spec.shade.compare;   // measure the whole plaza, not the cut model
      const refresh = () => { renderer.shadowMap.needsUpdate = true; renderer.setRenderTarget(P.rt); renderer.render(scene, cam); renderer.setRenderTarget(null); };
      const probe = fill => {
        const parent = sun.parent, si = sun.intensity, sc = sun.color.getHex();
        P.pScene.add(sun, sun.target); sun.intensity = 1; sun.color.set(0xffffff);
        renderer.setRenderTarget(P.rt);
        const run = (m, buf) => { P.pA.visible = m === P.pA; P.pB.visible = m === P.pB; renderer.setClearColor(0x000000, 1); renderer.clear(); renderer.render(P.pScene, P.pc); renderer.readRenderTargetPixels(P.rt, 0, 0, P.cols * P.ss, P.rows * P.ss, buf); };
        run(P.pA, P.bufA); run(P.pB, P.bufB);
        renderer.setRenderTarget(null); renderer.setClearColor(0x000000, 0);
        parent.add(sun, sun.target); sun.intensity = si; sun.color.setHex(sc);
        const SW = P.cols * P.ss; let tot = 0;
        for (let r = 0; r < P.rows; r++) for (let c = 0; c < P.cols; c++) {
          let a = 0, n = 0;
          for (let j = 0; j < P.ss; j++) for (let i = 0; i < P.ss; i++) { const k = ((r * P.ss + j) * SW + c * P.ss + i) * 4, b = P.bufB[k]; if (b > 2) { a += Math.min(1, P.bufA[k] / b); n++; } }
          const f = n ? a / n : 0; tot += f;
          if (fill) { const o = (r * P.cols + c) * 4; P.data[o] = 63 + (238 - 63) * f; P.data[o + 1] = 95 + (164 - 95) * f; P.data[o + 2] = 127 + (64 - 127) * f; P.data[o + 3] = 120 + 40 * f; }
        }
        if (fill) P.tex.needsUpdate = true;
        return tot / (P.cols * P.rows);
      };
      if (cut) { plane.set(new V3(-1, 0, 0), 1e6); refresh(); }
      shadeVal = probe(true);
      if (cmp) { const off = !S.canopy.show; cmp.hide(!off); refresh(); shadeVal2 = probe(false); cmp.hide(off); }   // the comparison is always the other state
      if (cut) plane.copy(saved);
      if (cut || cmp) shadowDirty = true;
      hudSun();
    }

    // -------------------------------------------------- paths: deterministic agents
    const P = { agents: [], inst: null, figs: [], trail: null, routeLines: null, scen: null };
    const K = 26, TDT = .22;            // trail samples, seconds between samples
    // architectural-model scale figures (1.7 m, slim, neutral): standing, two walking strides, seated on a 0.45 m seat
    const FIG = (() => {
      const limb = (out, a, b, r0, r1) => {   // tapered cylinder from point a to point b (metres, local: x side, y up, z forward)
        const A = new V3(...a).multiplyScalar(U), B = new V3(...b).multiplyScalar(U), d = B.clone().sub(A), g = new T.CylinderGeometry(r1 * U, r0 * U, d.length(), 8, 1);
        g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new V3(0, 1, 0), d.clone().normalize())); g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2); out.push(g.toNonIndexed());
        const j = new T.SphereGeometry(r1 * U, 8, 6); j.translate(B.x, B.y, B.z); out.push(j.toNonIndexed());
      };
      const blob = (out, c, r, sy, sz) => { const g = new T.SphereGeometry(r * U, 14, 10); g.scale(1, sy, sz); g.translate(c[0] * U, c[1] * U, c[2] * U); out.push(g.toNonIndexed()); };
      const merge = parts => { const g = new T.BufferGeometry(); ['position', 'normal'].forEach(k => { const n = parts.reduce((s, p) => s + p.attributes[k].array.length, 0), out = new Float32Array(n); let o = 0; parts.forEach(p => { out.set(p.attributes[k].array, o); o += p.attributes[k].array.length; }); g.setAttribute(k, new T.BufferAttribute(out, 3)); }); return g; };
      const body = (o, hip, lean) => {   // torso, shoulders, neck, head above a hip height
        blob(o, [0, hip + .02, lean * .2], .135, .75, .7); blob(o, [0, hip + .3, lean * .6], .16, 1.55, .62);
        limb(o, [0, hip + .5, lean], [0, hip + .58, lean * 1.1], .045, .045); blob(o, [0, hip + .68, lean * 1.15 + .01], .1, 1.15, 1.05);
      };
      const stand = [], wA = [], wB = [], sit = [];
      body(stand, .9, 0);
      [-1, 1].forEach(s => { limb(stand, [s * .085, .9, 0], [s * .095, .46, .01], .068, .052); limb(stand, [s * .095, .46, .01], [s * .1, .06, 0], .05, .038); blob(stand, [s * .1, .03, .05], .045, .6, 1.9);
        limb(stand, [s * .2, 1.33, 0], [s * .225, 1.06, -.01], .042, .034); limb(stand, [s * .225, 1.06, -.01], [s * .23, .82, .02], .033, .028); });
      [[wA, 1], [wB, -1]].forEach(([o, ph]) => { body(o, .89, .03);
        [-1, 1].forEach(s => { const f = s * ph; limb(o, [s * .085, .89, 0], [s * .09, .47, f * .14], .068, .052); limb(o, [s * .09, .47, f * .14], [s * .1, .06, f * (f > 0 ? .3 : .2) - (f < 0 ? .12 : 0)], .05, .038); blob(o, [s * .1, .03, f * .3 + .05 - (f < 0 ? .22 : 0)], .045, .6, 1.9);
          limb(o, [s * .2, 1.32, .02], [s * .22, 1.06, -f * .1], .042, .034); limb(o, [s * .22, 1.06, -f * .1], [s * .225, .84, -f * .17], .033, .028); }); });
      body(sit, .47, -.03);
      [-1, 1].forEach(s => { limb(sit, [s * .09, .48, -.02], [s * .1, .5, .42], .07, .055); limb(sit, [s * .1, .5, .42], [s * .1, .06, .46], .05, .038); blob(sit, [s * .1, .03, .5], .045, .6, 1.9);
        limb(sit, [s * .2, .9, -.03], [s * .21, .66, .04], .042, .034); limb(sit, [s * .21, .66, .04], [s * .16, .55, .3], .033, .028); });
      return [stand, wA, wB, sit].map(merge);
    })();    const agentMat = new T.MeshLambertMaterial({ color: 0xffffff, clippingPlanes: [plane] });
    function compileAgent(a) {
      const pts = a.pts.map(p => W(p[0], p[1], p[2] || 0)), ev = []; let t = a.delay || 0;
      const sp = (a.speed || 1.25) * U;
      const face = a.face !== undefined ? Math.atan2(Math.cos(a.face), -Math.sin(a.face)) : null, h = .93 + ((a.pts.length * 7 + (a.phase || 0) * 13) % 1 + .37 * ((a.kind || 0) + 1)) % 1 * .14;
      if (pts.length === 1) return { ev: [{ k: 'd', t0: 0, t1: 1e9, p: pts[0], sit: !!a.sit }], tot: 1e9, off: 0, kind: a.kind || 0, loop: false, face, h };
      for (let i = 0; i < pts.length; i++) {
        const dw = a.dwell && a.dwell[i] || 0;
        if (dw) { const lw = ev.filter(e => e.k === 'w').pop(); ev.push({ k: 'd', t0: t, t1: t + dw, p: pts[i], sit: !!(a.sit && a.sit[i]), hd: lw ? Math.atan2(lw.b.x - lw.a.x, lw.b.z - lw.a.z) : 0 }); t += dw; }
        if (i < pts.length - 1) { const L = pts[i].distanceTo(pts[i + 1]); if (L < 1e-4) continue; const dt = L / sp * (a.slow && a.slow[i] ? a.slow[i] : 1); ev.push({ k: 'w', t0: t, t1: t + dt, a: pts[i], b: pts[i + 1] }); t += dt; }
      }
      return { ev, start: a.delay || 0, tot: t + (a.gap || 0), off: a.phase || 0, kind: a.kind || 0, loop: a.loop !== false, face, h };
    }
    const tmpV = new V3(); let curEv = null;
    function agentAt(c, t, out) {   // returns false while the agent is off stage
      if (c.tot >= 1e9) { curEv = c.ev[0]; out.copy(c.ev[0].p); return c.ev[0].sit ? 2 : 1; }
      let tt = t + c.off; if (c.loop) tt = ((tt % c.tot) + c.tot) % c.tot; else if (tt > c.tot) tt = c.ev.length ? c.ev[c.ev.length - 1].t1 - 1e-3 : 0;
      if (tt < c.start) return 0;
      for (const e of c.ev) if (tt >= e.t0 && tt < e.t1) {
        curEv = e; if (e.k === 'd') { out.copy(e.p); return e.sit ? 2 : 1; }
        out.lerpVectors(e.a, e.b, (tt - e.t0) / (e.t1 - e.t0)); return 1;
      }
      return 0;
    }
    const COLS = spec.paths && spec.paths.colors || [0xc0704f, 0x55667a, 0x7f9a5c, 0xd0a54a];
    function buildPaths() {
      const scKey = spec.layouts && spec.paths.scenarios[S.layout] ? S.layout : Object.keys(spec.paths.scenarios)[0];
      if (P.scen === scKey) return; P.scen = scKey;
      const sc = spec.paths.scenarios[scKey];
      [P.trail, P.routeLines].forEach(o => { if (o) { scene.remove(o); o.geometry.dispose(); } }); if (P.inst) { scene.remove(P.inst); P.figs.forEach(m => m.dispose && m.dispose()); }
      P.agents = sc.agents.map(compileAgent);
      const n = P.agents.length;
      P.inst = new T.Group(); const col = new T.Color(), white = new T.Color(0xf1eee8);
      P.figs = FIG.map(g => { const m = new T.InstancedMesh(g, look.render ? agentStd : agentMat, n); m.frustumCulled = false; m.receiveShadow = true; m.instanceMatrix.setUsage(T.DynamicDrawUsage);
        P.agents.forEach((a, i) => m.setColorAt(i, col.set(COLS[a.kind]).lerp(white, .82))); P.inst.add(m); return m; });
      scene.add(P.inst);
      // trails: one ribbon per agent, alpha fading towards the tail
      const nv = n * K * 2, pos = new Float32Array(nv * 3), rgba = new Float32Array(nv * 4), idx = [];
      for (let a = 0; a < n; a++) { col.set(COLS[P.agents[a].kind]); for (let k = 0; k < K; k++) for (let s = 0; s < 2; s++) { const v = (a * K + k) * 2 + s; rgba[v * 4] = col.r; rgba[v * 4 + 1] = col.g; rgba[v * 4 + 2] = col.b; rgba[v * 4 + 3] = 0; }
        for (let k = 0; k < K - 1; k++) { const v = (a * K + k) * 2; idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2); } }
      const tg = new T.BufferGeometry(); tg.setAttribute('position', new T.BufferAttribute(pos, 3).setUsage(T.DynamicDrawUsage)); tg.setAttribute('color', new T.BufferAttribute(rgba, 4).setUsage(T.DynamicDrawUsage)); tg.setIndex(idx);
      P.trail = new T.Mesh(tg, new T.ShaderMaterial({ transparent: true, depthWrite: false, side: T.DoubleSide,
        vertexShader: '#include <clipping_planes_pars_vertex>\nattribute vec4 color;varying vec4 vc;void main(){vc=color;vec4 mvPosition=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mvPosition;\n#include <clipping_planes_vertex>\n}',
        fragmentShader: '#include <clipping_planes_pars_fragment>\nvarying vec4 vc;void main(){\n#include <clipping_planes_fragment>\ngl_FragColor=vc;}' }));
      P.trail.material.clipping = true; P.trail.material.clippingPlanes = [plane];
      P.trail.frustumCulled = false; P.trail.renderOrder = 4; scene.add(P.trail);
      // faint route lines
      const rp = [];
      (sc.routes || []).forEach(r => { for (let i = 0; i < r.length - 1; i++) rp.push(W(r[i][0], r[i][1], (r[i][2] || 0) + .03 * U), W(r[i + 1][0], r[i + 1][1], (r[i + 1][2] || 0) + .03 * U)); });
      P.routeLines = new T.LineSegments(new T.BufferGeometry().setFromPoints(rp), new T.LineDashedMaterial({ color: 0x8a6a3f, dashSize: .5 * U, gapSize: .35 * U, transparent: true, opacity: .55, clippingPlanes: [plane] }));
      P.routeLines.computeLineDistances(); P.routeLines.renderOrder = 3; scene.add(P.routeLines);
      if (ui.legend) ui.legend.innerHTML = (sc.legend || []).map(l => '<li><i style="background:#' + COLS[l[0]].toString(16).padStart(6, '0') + '"></i>' + l[1] + '</li>').join('');
      if (ui.pathNote) ui.pathNote.textContent = sc.note || '';
    }
    const HIDE4 = new T.Matrix4().makeScale(0, 0, 0), mtx = new T.Matrix4(), qY = new T.Quaternion(), sclV = new V3(), pA = new V3(), pB = new V3(), perp = new V3();
    function updatePaths() {
      const on = S.paths.on && !!spec.paths;
      if (spec.onPaths) spec.onPaths(on, S.layout);
      if (!on) { [P.inst, P.trail, P.routeLines].forEach(o => o && (o.visible = false)); return; }
      buildPaths();
      P.inst.visible = P.routeLines.visible = true; P.trail.visible = S.paths.trails;
      const t = S.paths.t, tp = P.trail.geometry.attributes.position.array, tc = P.trail.geometry.attributes.color.array, hw = .13 * U, lift = .05 * U;
      P.agents.forEach((a, i) => {
        const st = agentAt(a, t, pA);
        const fig = !st ? -1 : st === 2 ? 3 : 0, nearCam = st && C.mode === 'eye' && cam.position.distanceTo(pA) < 3.2 * U;   // don't let figures walk through the lens
        if (!st || nearCam) P.figs.forEach(m => m.setMatrixAt(i, HIDE4));
        else if (!nearCam) {
          // heading from a moment earlier
          const s2 = agentAt(a, t - .3, pB), moving = s2 && pB.distanceToSquared(pA) > 1e-6; let yaw = a.yaw || 0;
          agentAt(a, t, pA); const ev0 = curEv, hd = ev0 && ev0.hd !== undefined ? ev0.hd : (a.yaw || 0);
          if (moving) yaw = Math.atan2(pA.x - pB.x, pA.z - pB.z); else yaw = a.face !== null ? a.face : st === 2 ? hd + Math.PI : hd;
          if (moving || a.face === null || st !== 2) a.yaw = moving ? yaw : a.yaw;
          let k = fig; if (moving) k = Math.floor((t + a.off) * 1.9) % 2 ? 1 : 2;
          qY.setFromAxisAngle(new V3(0, 1, 0), yaw); sclV.setScalar(a.h);
          mtx.compose(pA, qY, sclV); P.figs.forEach((m, j) => m.setMatrixAt(i, j === k ? mtx : HIDE4));
        }
        if (!S.paths.trails) return;
        let prev = null;
        for (let k = 0; k < K; k++) {
          const s = agentAt(a, t - k * TDT, pB), v = (i * K + k) * 2;
          const alpha = s && st ? .5 * Math.pow(1 - k / K, 1.4) : 0;
          if (prev) { tmpV.set(pB.z - prev.z, 0, prev.x - pB.x); const l = tmpV.length(); if (l > 1e-5) perp.copy(tmpV).multiplyScalar(hw * (1 - k / K * .6) / l); }
          else { const s1 = agentAt(a, t - TDT, tmpV); perp.set(tmpV.z - pB.z, 0, pB.x - tmpV.x); const l = perp.length(); perp.multiplyScalar(l > 1e-5 ? hw / l : 0); }
          tp[v * 3] = pB.x + perp.x; tp[v * 3 + 1] = pB.y + lift; tp[v * 3 + 2] = pB.z + perp.z;
          tp[v * 3 + 3] = pB.x - perp.x; tp[v * 3 + 4] = pB.y + lift; tp[v * 3 + 5] = pB.z - perp.z;
          tc[v * 4 + 3] = tc[v * 4 + 7] = alpha;
          prev = prev || new V3(); prev.copy(pB);
        }
      });
      P.figs.forEach(m => { m.instanceMatrix.needsUpdate = true; });
      P.trail.geometry.attributes.position.needsUpdate = P.trail.geometry.attributes.color.needsUpdate = true;
      if (ui.pathClock) { const m = Math.floor(t / 60), s = Math.floor(t % 60); ui.pathClock.textContent = m + ':' + String(s).padStart(2, '0'); }
    }

    // -------------------------------------------------- panel
    const ui = {};
    const sw = (label, id) => '<div class="xp-row xp-swrow"><span class="xp-swl" id="' + id + '-l">' + label + '</span><button type="button" class="xp-switch" role="switch" aria-checked="false" aria-labelledby="' + id + '-l" data-sw="' + id + '"><i></i></button></div>';
    const uid = 'xp' + Math.random().toString(36).slice(2, 7);
    let html = '';
    if (spec.layouts) html += '<div class="xp-row xp-mode"><span class="label">Mode</span><div class="xp-seg" role="radiogroup" aria-label="Layout">' + spec.layouts.options.map(o => '<button type="button" role="radio" data-layout="' + o[0] + '">' + o[1] + '</button>').join('') + '</div></div>';
    const cmpSpec = spec.shade && spec.shade.compare, cnp = spec.canopy;
    if (cnp && (cmpSpec || spec.deploy)) html += '<div class="xp-row xp-mode xp-canopy"><span class="label">' + cnp.label + '</span>' +
      (cmpSpec ? '<div class="xp-seg" role="radiogroup" aria-label="' + cnp.label + '"><button type="button" role="radio" data-can="1">' + cnp.on + '</button><button type="button" role="radio" data-can="0">' + cnp.off + '</button></div>' : '') +
      (spec.deploy ? '<div class="xp-chips" style="margin-top:8px"><button type="button" class="xp-chip xp-play" data-act="fold" aria-pressed="false">' + spec.deploy.fold + '</button></div>' : '') + '</div>';
    const NAMES = { section: 'Section', sun: 'Sun', paths: 'Movement' };
    html += '<div class="xp-tabs" role="tablist" aria-label="Tools">' + tools.map(t => '<button type="button" role="tab" id="' + uid + '-t-' + t + '" aria-controls="' + uid + '-p-' + t + '" data-tab="' + t + '">' + NAMES[t] + '<i class="xp-dot"></i></button>').join('') +
      '<button type="button" class="xp-fold" aria-expanded="true" aria-label="Show or hide controls">&#9662;</button></div>';
    if (tools.includes('section')) html += '<div class="xp-pane" role="tabpanel" id="' + uid + '-p-section" aria-labelledby="' + uid + '-t-section">' + sw('Section cut', uid + 'sec') +
      '<div class="xp-row"><span class="label">Cut</span><div class="xp-seg" role="radiogroup" aria-label="Cut direction"><button type="button" role="radio" data-axis="x">Section X</button><button type="button" role="radio" data-axis="y">Section Y</button><button type="button" role="radio" data-axis="z">Plan</button></div></div>' +
      '<div class="xp-row"><label class="label" for="' + uid + '-sp">Position <output></output></label><input id="' + uid + '-sp" class="xp-range" type="range" min="0" max="1000" step="1"></div>' +
      '<div class="xp-row"><span class="label">Plan cut ' + fmtLen(cutH) + ' above</span><div class="xp-chips">' + levels.map((l, i) => '<button type="button" class="xp-chip" data-level="' + i + '">' + l.name + '</button>').join('') + '</div></div>' +
      '<div class="xp-row"><div class="xp-chips"><button type="button" class="xp-chip" data-act="flip">Flip side</button></div></div>' +
      '<p class="xp-note">Cut solids are filled dark. Drag the orange handle in the model to slide the cut.</p></div>';
    if (tools.includes('sun')) html += '<div class="xp-pane" role="tabpanel" id="' + uid + '-p-sun" aria-labelledby="' + uid + '-t-sun">' + sw('Real-time sun rendering', uid + 'sun') +
      '<div class="xp-row"><label class="label" for="' + uid + '-sd">Date <output></output></label><input id="' + uid + '-sd" class="xp-range" type="range" min="1" max="365" step="1"></div>' +
      '<div class="xp-row"><label class="label" for="' + uid + '-st">Time <output></output></label><input id="' + uid + '-st" class="xp-range" type="range" min="0" max="1439" step="1"></div>' +
      '<div class="xp-chips"><button type="button" class="xp-chip" data-q="06-21">21 Jun</button><button type="button" class="xp-chip" data-q="07-21T14:00">21 Jul 14:00</button><button type="button" class="xp-chip" data-q="09-05T16:00">5 Sep 16:00</button><button type="button" class="xp-chip" data-q="12-21">21 Dec</button><button type="button" class="xp-chip" data-q="now" aria-pressed="false">Live now</button><button type="button" class="xp-chip xp-play" data-act="day" aria-pressed="false">Play day</button></div>' +
      '<p class="xp-note" data-sun-status></p>' +
      '<dl class="xp-read"><div><dt>Altitude</dt><dd data-r="alt"></dd></div><div><dt>Azimuth</dt><dd data-r="az"></dd></div><div><dt>Sunrise</dt><dd data-r="rise"></dd></div><div><dt>Sunset</dt><dd data-r="set"></dd></div></dl>' +
      '<div class="xp-row"><span class="label">Render quality</span><div class="xp-seg" role="radiogroup" aria-label="Render quality"><button type="button" role="radio" data-q2="high">High</button><button type="button" role="radio" data-q2="low">Low (mobile)</button></div></div>' +
      '<div class="xp-row xp-checks"><label><input type="checkbox" data-ck="path"> Sun path</label>' + (spec.shade ? '<label><input type="checkbox" data-ck="shade"> Shade map</label>' : '') + '</div>' +
      '<p class="xp-note">' + Math.abs(lat).toFixed(3) + '°' + (lat >= 0 ? 'N' : 'S') + ', ' + Math.abs(lon).toFixed(3) + '°' + (lon < 0 ? 'W' : 'E') + ', US Eastern time. ' + (spec.sunNote || '') + '</p></div>';
    if (tools.includes('paths') && spec.paths) html += '<div class="xp-pane" role="tabpanel" id="' + uid + '-p-paths" aria-labelledby="' + uid + '-t-paths">' + sw('People moving', uid + 'pth') +
      '<div class="xp-row xp-playrow"><button type="button" class="xp-chip xp-play" data-act="play" aria-pressed="true">Pause</button><span class="label">Clock <b class="xp-clock">0:00</b></span></div>' +
      '<div class="xp-row"><label class="label" for="' + uid + '-ps">Speed <output></output></label><input id="' + uid + '-ps" class="xp-range" type="range" min="0" max="100" step="1"></div>' +
      '<div class="xp-row xp-checks"><label><input type="checkbox" data-ck="trails"> Trails</label></div><ul class="xp-legend"></ul><p class="xp-note xp-pnote"></p></div>';
    panel.innerHTML = html;
    const $ = s => panel.querySelector(s), $$ = s => [...panel.querySelectorAll(s)];
    // tabs (roving, arrow keys)
    const tabs = $$('[role=tab]');
    function showTab(t) { S.tab = tools.includes(t) ? t : tools[0]; tabs.forEach(b => { const on = b.dataset.tab === S.tab; b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; }); $$('.xp-pane').forEach(p => { p.hidden = p.id !== uid + '-p-' + S.tab; }); }
    tabs.forEach((b, i) => { b.addEventListener('click', () => { showTab(b.dataset.tab); panel.classList.remove('xp-folded'); fold.setAttribute('aria-expanded', true); });
      b.addEventListener('keydown', e => { const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (!d) return; const nb = tabs[(i + d + tabs.length) % tabs.length]; nb.focus(); showTab(nb.dataset.tab); e.preventDefault(); }); });
    const fold = $('.xp-fold'); fold.addEventListener('click', () => { const f = panel.classList.toggle('xp-folded'); fold.setAttribute('aria-expanded', !f); });
    function markTabs() { tabs.forEach(b => b.classList.toggle('on', b.dataset.tab === 'section' ? S.section.on : b.dataset.tab === 'sun' ? S.sun.on : S.paths.on)); }
    // layout
    const layBtns = $$('[data-layout]');
    function setLayout(v) {
      S.layout = v; spec.layouts.set(v); layBtns.forEach(b => b.setAttribute('aria-checked', b.dataset.layout === v));
      P.scen = null; shadowDirty = shadeDirty = true; if (aoMesh) aoMesh.userData.draw(); updatePaths(); invalidate();
    }
    layBtns.forEach(b => b.addEventListener('click', () => setLayout(b.dataset.layout)));
    // canopy: with / without (the same scene, canopies hidden) and an animated fold / unfold of every cart
    const canBtns = $$('[data-can]'), foldBtn = $('[data-act=fold]');
    function syncCanopy() {
      canBtns.forEach(b => b.setAttribute('aria-checked', (b.dataset.can === '1') === S.canopy.show));
      if (foldBtn) {
        const c = S.canopy, moving = c.dep !== c.target;
        foldBtn.textContent = moving ? (c.target > c.dep ? 'Unfolding ' : 'Folding ') + Math.round(c.dep * 100) + '% · stop' : (c.dep < .5 ? spec.deploy.unfold : spec.deploy.fold);
        foldBtn.setAttribute('aria-pressed', moving);
      }
    }
    function setCanopy(show) {
      S.canopy.show = show; if (cmpSpec) cmpSpec.hide(!show);
      if (aoMesh) aoMesh.userData.draw();
      shadowDirty = shadeDirty = true; syncCanopy(); hudSun(); invalidate();
    }
    canBtns.forEach(b => b.addEventListener('click', () => setCanopy(b.dataset.can === '1')));
    if (foldBtn) foldBtn.addEventListener('click', () => {
      const c = S.canopy;
      if (!c.show) setCanopy(true);
      c.target = c.dep !== c.target ? c.dep : (c.dep < .5 ? 1 : 0);      // a second press while moving stops it
      if (reduce && c.target !== c.dep) { c.dep = c.target; spec.deploy.set(c.dep); shadowDirty = shadeDirty = true; }
      syncCanopy(); invalidate();
    });
    // section controls
    if (tools.includes('section')) {
      ui.secSw = $('[data-sw="' + uid + 'sec"]'); ui.secAxis = $$('[data-axis]'); ui.secPos = $('#' + uid + '-sp'); ui.secOut = ui.secPos.previousElementSibling.querySelector('output');
      ui.secSw.addEventListener('click', () => setSection({ on: !S.section.on, flip: faceCam(S.section.axis) }));
      ui.secAxis.forEach(b => b.addEventListener('click', () => { const z = b.dataset.axis === 'z'; setSection({ on: true, axis: b.dataset.axis, flip: faceCam(b.dataset.axis), pos: z ? (levels[0].z + cutH - F[2]) / (F[5] - F[2]) : .5 }); }));
      ui.secPos.addEventListener('input', () => setSection({ on: true, pos: ui.secPos.value / 1000 }));
      $$('[data-level]').forEach(b => b.addEventListener('click', () => { planAt(+b.dataset.level); if (C.mode !== 'plan') setView('plan'); }));
      $('[data-act=flip]').addEventListener('click', () => setSection({ flip: !S.section.flip }));
    }
    // sun controls
    if (tools.includes('sun')) {
      ui.sunSw = $('[data-sw="' + uid + 'sun"]'); ui.sunDate = $('#' + uid + '-sd'); ui.sunTime = $('#' + uid + '-st');
      ui.dateOut = ui.sunDate.previousElementSibling.querySelector('output'); ui.timeOut = ui.sunTime.previousElementSibling.querySelector('output');
      ui.rAlt = $('[data-r=alt]'); ui.rAz = $('[data-r=az]'); ui.rRise = $('[data-r=rise]'); ui.rSet = $('[data-r=set]'); ui.sunPlay = $('[data-act=day]');
      ui.sunLive = $('[data-q=now]'); ui.sunStatus = $('[data-sun-status]');
      const manualSun = () => { S.sun.live = false; S.sun.play = false; S.sun.frozenMs = null; };
      ui.sunSw.addEventListener('click', () => { S.sun.on = !S.sun.on; if (!S.sun.on) manualSun(); updateSun(); });
      ui.sunDate.addEventListener('input', () => { manualSun(); S.sun.on = true; S.sun.doy = +ui.sunDate.value; updateSun(); });
      ui.sunTime.addEventListener('input', () => { manualSun(); S.sun.on = true; S.sun.min = +ui.sunTime.value; updateSun(); });
      $$('[data-q]').forEach(b => b.addEventListener('click', () => {
        S.sun.on = true; S.sun.play = false;
        if (b.dataset.q === 'now') { S.sun.live = !S.sun.live; S.sun.frozenMs = S.sun.live ? null : S.sun.liveMs; if (S.sun.live) syncLiveSun(true); }
        else { manualSun(); const m = /(\d\d)-(\d\d)(?:T(\d\d):(\d\d))?/.exec(b.dataset.q); S.sun.doy = doyOf(S.sun.year, +m[1] - 1, +m[2]); if (m[3]) S.sun.min = +m[3] * 60 + +m[4]; }
        updateSun();
      }));
      ui.sunPlay.addEventListener('click', () => { S.sun.live = false; S.sun.frozenMs = null; S.sun.play = !S.sun.play; S.sun.on = true; if (S.sun.play && (S.sun.min > 20.5 * 60 || S.sun.min < 300)) S.sun.min = 330; updateSun(); invalidate(); });
      ui.qual = $$('[data-q2]'); ui.qual.forEach(b => b.addEventListener('click', () => { setQuality(b.dataset.q2 === 'high'); updateSun(); }));
      const ckP = $('[data-ck=path]'); ckP.checked = S.sun.path; ckP.addEventListener('change', () => { S.sun.path = ckP.checked; updateSun(); });
      const ckS = $('[data-ck=shade]');
      if (ckS) { ckS.checked = S.sun.shade; ckS.addEventListener('change', () => { S.sun.shade = ckS.checked; if (S.sun.shade && !S.sun.on) S.sun.on = true; shadeDirty = true; updateSun(); }); }
    }
    // paths controls
    if (tools.includes('paths') && spec.paths) {
      ui.pathSw = $('[data-sw="' + uid + 'pth"]'); ui.pathPlay = $('[data-act=play]'); ui.pathSpeed = $('#' + uid + '-ps'); ui.speedOut = ui.pathSpeed.previousElementSibling.querySelector('output');
      ui.pathClock = $('.xp-clock'); ui.legend = $('.xp-legend'); ui.pathNote = $('.xp-pnote');
      const spd = v => Math.pow(2, v / 100 * 5 - 1.5);   // 0.35x .. 11x, log scale
      const syncP = () => { ui.pathSw.setAttribute('aria-checked', S.paths.on); ui.pathPlay.textContent = S.paths.play ? 'Pause' : 'Play'; ui.pathPlay.setAttribute('aria-pressed', S.paths.play);
        ui.pathSpeed.value = Math.round((Math.log2(S.paths.speed) + 1.5) / 5 * 100); ui.speedOut.textContent = (S.paths.speed < 1 ? S.paths.speed.toFixed(2) : S.paths.speed.toFixed(1)).replace(/\.0+$/, '') + '×';
        panel.classList.toggle('xp-paths-on', S.paths.on); markTabs(); };
      ui.syncP = syncP;
      ui.pathSw.addEventListener('click', () => { S.paths.on = !S.paths.on; if (S.paths.on && !reduce) S.paths.play = true; syncP(); updatePaths(); invalidate(); });
      ui.pathPlay.addEventListener('click', () => { S.paths.play = !S.paths.play; if (S.paths.play) S.paths.on = true; syncP(); updatePaths(); invalidate(); });
      ui.pathSpeed.addEventListener('input', () => { S.paths.speed = spd(+ui.pathSpeed.value); syncP(); });
      const ckT = $('[data-ck=trails]'); ckT.checked = S.paths.trails; ckT.addEventListener('change', () => { S.paths.trails = ckT.checked; updatePaths(); invalidate(); });
      syncP();
    }

    // -------------------------------------------------- render loop (only while visible and something changes)
    let raf = 0, visible = true, dirty = true, last = performance.now();
    function syncLiveSun(force = false) {
      const s = S.sun, ms = Date.now();
      if (!s.live || !s.on || (!force && (!visible || document.hidden))) return;
      if (!force && Math.floor(ms / 6e4) === Math.floor(s.liveMs / 6e4)) return;
      Object.assign(s, newYorkTime(ms), { liveMs: ms });
      updateSun();
    }
    function invalidate() { dirty = true; schedule(); }
    function onScreen() { const r = stage.getBoundingClientRect(); return r.bottom > -100 && r.top < innerHeight + 100 && r.width > 0; }
    function schedule() { if (!visible && onScreen()) visible = true; if (!raf && visible) raf = requestAnimationFrame(loop); }
    function size() { Wd = Math.max(1, stage.clientWidth); Hd = Math.max(1, stage.clientHeight); renderer.setSize(Wd, Hd, false); applyCam(); invalidate(); }
    function loop(now) {
      raf = 0; const dt = Math.min(.1, (now - last) / 1000); last = now;
      let anim = false;
      if (S.paths.on && S.paths.play && spec.paths) { S.paths.t += dt * S.paths.speed; anim = true; dirty = true; }
      if (S.sun.play && S.sun.on) { S.sun.min += dt * 50; if (S.sun.min > 21 * 60) S.sun.min = 330; updateSun(); anim = true; }
      if (spec.deploy && S.canopy.dep !== S.canopy.target) {
        const c = S.canopy, st = dt / (spec.deploy.seconds || 6);
        c.dep = c.target > c.dep ? Math.min(c.target, c.dep + st) : Math.max(c.target, c.dep - st);
        spec.deploy.set(c.dep); shadowDirty = shadeDirty = true; dirty = true; anim = true; syncCanopy();
        if (aoMesh && (Math.abs(c.dep - (c.aoAt ?? 1)) > .08 || c.dep === c.target)) { c.aoAt = c.dep; aoMesh.userData.draw(); }
      }
      if (dirty) {
        try { render(); }
        catch (err) {          // a failed frame must not freeze the view: fall back to Low quality once and retry
          console.error('[explorer] render failed', err);
          if (look.high) { setQuality(false); shadowDirty = true; try { render(); } catch (e2) { gpuNote.hidden = false; } }
          else gpuNote.hidden = false;
        }
      }
      if (anim) schedule();
    }
    function render() {
      dirty = false;
      if (S.paths.on) updatePaths();
      if (spec.update) spec.update(S);
      gizmo.visible = S.sun.on && S.sun.path && C.mode !== 'eye';
      if (shadowDirty) { renderer.shadowMap.needsUpdate = true; shadowDirty = false; }
      if (sky.visible) {   // sky quad follows the camera (ortho views borrow a virtual perspective)
        skyU.cR.value.setFromMatrixColumn(cam.matrixWorld, 0); skyU.cU.value.setFromMatrixColumn(cam.matrixWorld, 1); skyU.cF.value.setFromMatrixColumn(cam.matrixWorld, 2).negate();
        if (!cam.isPerspectiveCamera && C.mode !== 'plan') { const F2 = skyU.cF.value; F2.y *= .28; F2.normalize(); skyU.cU.value.crossVectors(skyU.cR.value, F2).normalize(); }
        skyU.tanF.value = cam.isPerspectiveCamera ? Math.tan(rad(cam.fov / 2)) : .42; skyU.asp.value = Wd / Hd;
      }
      if (shadeOverlay) shadeOverlay.visible = !!(S.sun.on && S.sun.shade);
      renderer.render(scene, cam);
      // live % of the floor in direct sun (GPU probe of the shadow map); throttled while the day plays
      if (spec.shade && S.sun.on && shadeDirty && (!S.sun.play || performance.now() - lastShade > 280)) {
        if (!shadeProbe) { buildShade(); shadeOverlay.visible = !!S.sun.shade; }
        shadeDirty = false; lastShade = performance.now(); runShade();
        if (shadowDirty) { renderer.shadowMap.needsUpdate = true; shadowDirty = false; renderer.render(scene, cam); } else if (S.sun.shade) renderer.render(scene, cam);
      }
      // compass: screen direction of plan north
      const a = fctr.clone().project(cam), b = fctr.clone().addScaledVector(northW, fR * .2).project(cam);
      const ang = Math.atan2((b.x - a.x) * Wd, (b.y - a.y) * Hd);
      northSvg.style.transform = 'rotate(' + deg(ang).toFixed(1) + 'deg)';
      northEl.style.opacity = C.pitch > .2 || C.mode === 'plan' ? 1 : .35;
    }
    // use the LATEST entry: after a hash jump / layout shift one batch can hold both 'left' and 'entered' for the stage,
    // and reading es[0] left the view frozen while the panel kept updating
    new IntersectionObserver(es => { visible = es[es.length - 1].isIntersecting; if (visible) { last = performance.now(); syncLiveSun(true); schedule(); } }, { rootMargin: '100px 0px' }).observe(stage);
    if (window.ResizeObserver) new ResizeObserver(size).observe(stage); else addEventListener('resize', size);
    // Minute-level clock updates avoid continuously rendering an idle scene.
    const liveTimer = setInterval(() => { if (!el.isConnected) clearInterval(liveTimer); else syncLiveSun(); }, 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && visible) syncLiveSun(true); });
    addEventListener('pageshow', () => syncLiveSun(true));

    // -------------------------------------------------- initial state
    Wd = Math.max(1, stage.clientWidth); Hd = Math.max(1, stage.clientHeight); renderer.setSize(Wd, Hd, false);
    if (spec.layouts) setLayout(S.layout); else if (aoMesh) aoMesh.userData.draw();
    if (spec.deploy && S.canopy.dep !== 1) spec.deploy.set(S.canopy.dep);
    if (cmpSpec && !S.canopy.show) cmpSpec.hide(true);
    syncCanopy();
    showTab(S.tab);
    setSection({});
    if (S.section.level !== undefined) planAt(S.section.level);
    if (S.sun.live) syncLiveSun(true); else updateSun();
    updatePaths();
    const v0 = Q.get('view') || (S.section.on && S.section.axis === 'z' && Q.get('section') ? 'plan' : 'axon');
    setView(v0 === 'eye' && !spec.eye ? 'axon' : v0);
    if (Q.get('yaw') || Q.get('pitch')) { if (Q.get('yaw')) C.yaw = +Q.get('yaw'); if (Q.get('pitch')) C.pitch = +Q.get('pitch'); if (C.mode !== 'eye') { C.mode = 'axon'; fit(1.04); } }
    if (Q.get('zoom')) C.dist /= +Q.get('zoom');
    if (Q.get('target')) { const tg = Q.get('target').split(',').map(Number); C.target.copy(W(tg[0], tg[1], tg[2] || 0)); }
    if (S.section.on && Q.get('flip') === null) setSection({ flip: faceCam(S.section.axis) });
    applyCam();
    el.classList.add('xp-ready');
    stage.querySelector('.xp-wait').remove();
    invalidate();
  }
})();
