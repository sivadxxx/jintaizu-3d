// 人体図3D：皮膚・筋肉・骨の 3 層を、スライダーの透け具合で重ねて表示する
import * as THREE from 'three';
import { OrbitControls } from './lib/OrbitControls.js';

const stage = document.getElementById('stage'), canvas = document.getElementById('gl');
const skinIn = document.getElementById('skin'), muscleIn = document.getElementById('muscle');
const statusEl = document.getElementById('status'), loadingEl = document.getElementById('loading');
const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };

// ---------------------------------------------------------------- 描画の準備
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'high-performance' });
renderer.setClearColor(0x000000, 0);
renderer.autoClear = false;
const PR = () => Math.min(window.devicePixelRatio || 1, 2);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(26, 1, 40, 30000);
scene.add(camera);
// 光：全体をやわらかく照らす光と、見ている向きに合わせて動く光
scene.add(new THREE.HemisphereLight(0xffffff, 0xcbbfb6, 1.55));
const key = new THREE.DirectionalLight(0xffffff, 1.9);
key.position.set(0.55, 0.75, 1.4);
camera.add(key); camera.add(key.target); key.target.position.set(0, 0, -1);
const fill = new THREE.DirectionalLight(0xffffff, 0.45);
fill.position.set(-1.2, 0.1, 0.6);
camera.add(fill); camera.add(fill.target); fill.target.position.set(0, 0, -1);

// 素材（番号は export3d.py と同じ）
const COLORS = { 0: 0xf7d6c0, 1: 0xece2c2, 2: 0xf4f0e4, 3: 0xe3e5d6, 4: 0xd97f6e, 5: 0xf2e9d6 };
const materials = {};
for (const k in COLORS) {
  const m = new THREE.MeshStandardMaterial({ color: COLORS[k], roughness: 0.82, metalness: 0, side: THREE.DoubleSide, vertexColors: true });
  // 元データは面の表裏が部品ごとにまちまちなので、表裏に関係なく、いつも見ている側を向いた面として光を当てる
  m.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>',
      '#include <normal_fragment_begin>\n\tnormal = faceforward( normal, - normalize( vViewPosition ), normal );\n\tnonPerturbedNormal = normal;');
  };
  materials[k] = m;
}
const groups = { skin: new THREE.Group(), muscle: new THREE.Group(), bone: new THREE.Group() };
for (const k in groups) { groups[k].visible = false; scene.add(groups[k]); }
const loaded = { skin: false, muscle: false, bone: false };

// 層を 1 枚ずつ別の画面に描いてから、透け具合を掛けて重ねる（半透明どうしの前後が乱れないように）
let target = new THREE.WebGLRenderTarget(4, 4, { samples: 4, depthBuffer: true });
const quadScene = new THREE.Scene(), quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const quadMat = new THREE.ShaderMaterial({
  uniforms: { t: { value: target.texture }, opacity: { value: 1 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `uniform sampler2D t; uniform float opacity; varying vec2 vUv;
    vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
    void main(){ vec4 c = texture2D(t, vUv); vec3 rgb = c.a > 0.0 ? c.rgb / c.a : vec3(0.0);
      gl_FragColor = vec4(toSRGB(rgb) * c.a * opacity, c.a * opacity); }`,
  blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
  blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  depthTest: false, depthWrite: false, transparent: true,
});
quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), quadMat));

function pass(show, opacity) {
  for (const k in groups) groups[k].visible = show.indexOf(k) >= 0 && loaded[k];
  renderer.setRenderTarget(target);
  renderer.clear();
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  quadMat.uniforms.opacity.value = opacity;
  renderer.render(quadScene, quadCam);
}
function draw() {
  const s = skinIn.value / 100, m = muscleIn.value / 100;
  renderer.setRenderTarget(null);
  renderer.clear();
  // 上の層に完全に隠れる層は描かない
  if (s < 1 && m < 1 && loaded.bone) pass(['bone'], 1);
  if (s < 1 && m > 0 && loaded.muscle) pass(['muscle', 'bone'], m);      // 筋肉の層には骨も一緒に描いて、前後関係を正しくする
  if (s > 0 && loaded.skin) pass(['skin'], s);
}

// ---------------------------------------------------------------- 視点の操作
const CENTER = new THREE.Vector3(0, 780, 95);     // 体の中心（mm）
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.12;
controls.rotateSpeed = 0.9;
controls.zoomSpeed = 1.1;
controls.zoomToCursor = true;
controls.screenSpacePanning = true;
controls.minDistance = 180;
controls.maxDistance = 9000;
const DIRS = { front: [0, 0, 1], back: [0, 0, -1], right: [-1, 0, 0], left: [1, 0, 0] };   // 右側 = 本人の右から見る
function fitDistance() {            // 全身が入る距離
  const h = 1840, w = 800, t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  return Math.max(h / 2 / t, w / 2 / (t * camera.aspect)) * 1.03;
}
let anim = null;
function goTo(dir, instant) {
  const d = new THREE.Vector3(...DIRS[dir]), to = CENTER.clone().addScaledVector(d, fitDistance());
  if (instant) { camera.position.copy(to); controls.target.copy(CENTER); controls.update(); dirty = true; return; }
  anim = { t0: performance.now(), p0: camera.position.clone(), p1: to, c0: controls.target.clone(), c1: CENTER.clone() };
}
document.querySelectorAll('[data-dir]').forEach(b => b.addEventListener('click', () => goTo(b.dataset.dir)));
document.getElementById('zreset').addEventListener('click', () => goTo('front'));
function dolly(f) {
  const v = camera.position.clone().sub(controls.target);
  v.setLength(THREE.MathUtils.clamp(v.length() * f, controls.minDistance, controls.maxDistance));
  camera.position.copy(controls.target).add(v); dirty = true;
}
document.getElementById('zin').addEventListener('click', () => dolly(1 / 1.35));
document.getElementById('zout').addEventListener('click', () => dolly(1.35));

// ---------------------------------------------------------------- 透過スライダー
let dirty = true;
function applyLayers() {
  document.getElementById('skinOut').textContent = skinIn.value + '%';
  document.getElementById('muscleOut').textContent = muscleIn.value + '%';
  store.set('hb3d-layers', skinIn.value + ',' + muscleIn.value);
  dirty = true;
}
skinIn.addEventListener('input', applyLayers); muscleIn.addEventListener('input', applyLayers);
document.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => {
  const p = b.dataset.preset.split(','); skinIn.value = p[0]; muscleIn.value = p[1]; applyLayers();
}));
const saved = store.get('hb3d-layers');
if (saved && /^\d+,\d+$/.test(saved)) { const p = saved.split(','); skinIn.value = p[0]; muscleIn.value = p[1]; }
applyLayers();

// ---------------------------------------------------------------- 大きさの調整と描画ループ
function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  if (!w || !h) return;
  renderer.setPixelRatio(PR());
  renderer.setSize(w, h, false);
  const s = renderer.getDrawingBufferSize(new THREE.Vector2());
  target.setSize(s.x, s.y);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  dirty = true;
}
new ResizeObserver(resize).observe(stage);
resize();
goTo('front', true);

function frame(now) {
  if (anim) {
    let u = Math.min(1, (now - anim.t0) / 420); u = u * u * (3 - 2 * u);
    // 体のまわりを回り込むように動かす（中心からの距離を保つ）
    const a = anim.p0.clone().sub(anim.c0), b = anim.p1.clone().sub(anim.c1);
    const dir = a.clone().normalize().lerp(b.clone().normalize(), u);
    if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0);          // 真反対へ回るとき
    dir.normalize().multiplyScalar(THREE.MathUtils.lerp(a.length(), b.length(), u));
    controls.target.lerpVectors(anim.c0, anim.c1, u);
    camera.position.copy(controls.target).add(dir);
    if (u >= 1) anim = null;
    dirty = true;
  }
  if (controls.update() || dirty) { draw(); dirty = false; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------------------------------------------------------------- モデルの読み込み
function parse(buf) {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x44334d42) throw new Error('形式が違います');       // 'BM3D'
  const n = dv.getUint32(8, true);
  const origin = [dv.getFloat32(12, true), dv.getFloat32(16, true), dv.getFloat32(20, true)], extent = dv.getFloat32(24, true);
  let o = 28;
  const al = () => { o = (o + 3) & ~3; };
  const out = [];
  for (let i = 0; i < n; i++) {
    const nv = dv.getUint32(o, true), nt = dv.getUint32(o + 4, true), mat = dv.getUint32(o + 8, true); o += 16;
    const pos = new Uint16Array(buf, o, nv * 3); o += nv * 6; al();
    const nrm = new Int8Array(buf, o, nv * 3); o += nv * 3; al();
    const ao = new Uint8Array(buf, o, nv); o += nv; al();
    const idx = new Uint16Array(buf, o, nt * 3); o += nt * 6; al();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3, true));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3, true));
    const col = new Uint8Array(nv * 3);
    for (let j = 0; j < nv; j++) { col[j * 3] = col[j * 3 + 1] = col[j * 3 + 2] = ao[j]; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3, true));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, materials[mat]);
    mesh.position.set(origin[0], origin[1], origin[2]);
    mesh.scale.setScalar(extent);
    mesh.matrixAutoUpdate = false; mesh.updateMatrix();
    out.push(mesh);
  }
  return out;
}
async function load(name) {
  const r = await fetch('models/' + name + '.bin');
  if (!r.ok) throw new Error(name + ' を読み込めません');
  for (const m of parse(await r.arrayBuffer())) groups[name].add(m);
  loaded[name] = true; dirty = true;
}
(async () => {
  try {
    statusEl.textContent = 'モデルを読み込み中… 1/3';
    await load('skin');
    loadingEl.hidden = true;
    statusEl.textContent = 'モデルを読み込み中… 2/3';
    await load('muscle');
    statusEl.textContent = 'モデルを読み込み中… 3/3';
    await load('bone');
    statusEl.textContent = '';
  } catch (e) {
    loadingEl.hidden = false; loadingEl.textContent = '読み込みに失敗しました。通信状態を確かめて、開き直してください。';
    statusEl.textContent = String(e.message || e);
  }
})();

// 一度開いたら電波がなくても使えるようにする（https か localhost のときだけ）
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then(() => navigator.serviceWorker.ready).then(() => {
      if (!statusEl.textContent) statusEl.textContent = 'オフラインでも使えます';
    }).catch(() => {});
  });
}
window.__viewer = { camera, controls, goTo, renderer, groups, loaded, redraw: () => { dirty = true; } };   // 動作確認用
