import * as THREE from 'three';

/* ================= Utilidades ================= */
const $ = (id) => document.getElementById(id);
const ARENA_R = 9, TOP_R = 0.95, ROUND_TIME = 90;
const bowlY = (r) => 0.9 * (r / ARENA_R) ** 2 - 0.9;

const NOMES_CAUSA = {
  ultimo: { titulo: 'ÚLTIMO DE PÉ! 🔥', desc: 'Sobreviveu ao massacre da arena', pts: 1 },
  spin:  { titulo: 'SPIN FINISH!',  desc: 'A beyblade adversária parou de girar', pts: 1 },
  tempo: { titulo: 'TEMPO ESGOTADO!', desc: 'Venceu quem tinha mais rotação', pts: 1 },
  out:   { titulo: 'RING-OUT FINISH!', desc: 'Beyblade arremessada para fora da arena', pts: 2 },
  burst: { titulo: 'BURST FINISH!', desc: 'A beyblade adversária explodiu em pedaços', pts: 2 },
  empate:{ titulo: 'EMPATE!', desc: 'As duas caíram juntas — rodada será repetida', pts: 0 },
};

/* ================= Áudio ================= */
let actx = null;
function audio() {
  if (!actx) try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch { }
  return actx;
}
function sfx(freq, dur = 0.12, type = 'square', vol = 0.08, slide = 0) {
  const c = audio(); if (!c) return;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, c.currentTime);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), c.currentTime + dur);
  g.gain.setValueAtTime(vol, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
  o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + dur);
}
const sfxHit = (f) => { sfx(180 + Math.min(f, 12) * 30, 0.09, 'square', 0.10, -120); sfx(90, 0.07, 'sawtooth', 0.06); };
const sfxLaunch = () => sfx(200, 0.5, 'sawtooth', 0.09, 700);
const sfxSkill = () => { sfx(500, 0.15, 'triangle', 0.1, 350); sfx(750, 0.2, 'triangle', 0.07, 250); };
const sfxFim = (win) => { sfx(win ? 520 : 300, 0.3, 'triangle', 0.12, win ? 260 : -140); sfx(win ? 660 : 220, 0.45, 'triangle', 0.1, win ? 320 : -100); };

/* ================= Cena 3D ================= */
const canvas = $('cena');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1c2740);
scene.fog = new THREE.Fog(0x1c2740, 26, 70);
const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 200);

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

scene.add(new THREE.AmbientLight(0xbdd0f0, 0.7));
const hemi = new THREE.HemisphereLight(0xeaf2ff, 0x3a4a6a, 0.9); scene.add(hemi);
const dl = new THREE.DirectionalLight(0xffffff, 1.7);
dl.position.set(6, 16, 8); scene.add(dl);
const p1 = new THREE.PointLight(0xe0452b, 22, 30); p1.position.set(-8, 7, 0); scene.add(p1);
const p2 = new THREE.PointLight(0x3f6fd1, 22, 30); p2.position.set(8, 7, 0); scene.add(p2);

// Estádio estilo Beystadium: tigela branca com faixas impressas, emblema e bolsões
const POCKET_ANGS = [Math.PI / 2, Math.PI / 2 + 2 * Math.PI / 3, Math.PI / 2 - 2 * Math.PI / 3];
const pocketMeshes = [];
{
  // textura "impressa" da tigela (faixas concêntricas azuis sobre plástico claro)
  const tc = document.createElement('canvas'); tc.width = 16; tc.height = 1024;
  const tg = tc.getContext('2d');
  const H = tc.height;
  const faixa = (v0, v1, cor) => { tg.fillStyle = cor; tg.fillRect(0, v0 * H, tc.width, (v1 - v0) * H); };
  faixa(0.00, 1.00, '#eef2f8');   // base plástico claro
  faixa(0.00, 0.05, '#d7e2f2');   // miolo
  faixa(0.10, 0.155, '#cfe0f5');
  faixa(0.155, 0.163, '#9db8dd');
  faixa(0.295, 0.305, '#9db8dd');
  faixa(0.38, 0.455, '#bcd4f0');
  faixa(0.455, 0.463, '#8fa9cf');
  faixa(0.595, 0.605, '#9db8dd');
  faixa(0.68, 0.72, '#ffd98a');   // anel de alerta perto da borda
  faixa(0.78, 0.80, '#dfe7f2');
  faixa(0.80, 1.00, '#3f6fd1');   // parede azul
  faixa(0.965, 1.00, '#e8eef8');  // topo da parede
  const bowlTex = new THREE.CanvasTexture(tc);
  bowlTex.colorSpace = THREE.SRGBColorSpace;

  const pts = [];
  for (let r = 0; r <= ARENA_R; r += 0.75) pts.push(new THREE.Vector2(r, bowlY(r)));
  pts.push(new THREE.Vector2(9.3, 0.3), new THREE.Vector2(9.6, 0.7), new THREE.Vector2(10.1, 0.72));
  const geo = new THREE.LatheGeometry(pts, 96);
  const mat = new THREE.MeshStandardMaterial({ map: bowlTex, metalness: 0.05, roughness: 0.55, side: THREE.DoubleSide });
  scene.add(new THREE.Mesh(geo, mat));

  // emblema central
  const ec = document.createElement('canvas'); ec.width = ec.height = 256;
  const eg = ec.getContext('2d');
  eg.translate(128, 128);
  const circ = (r, cor) => { eg.fillStyle = cor; eg.beginPath(); eg.arc(0, 0, r, 0, Math.PI * 2); eg.fill(); };
  circ(124, '#3f6fd1'); circ(100, '#eef2f8'); circ(92, '#cfe0f5');
  eg.strokeStyle = '#8fa9cf'; eg.lineWidth = 5;
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2;
    eg.beginPath(); eg.moveTo(Math.cos(a) * 46, Math.sin(a) * 46);
    eg.lineTo(Math.cos(a) * 88, Math.sin(a) * 88); eg.stroke();
  }
  circ(42, '#e0452b'); circ(20, '#eef2f8');
  const embTex = new THREE.CanvasTexture(ec);
  embTex.colorSpace = THREE.SRGBColorSpace;
  const emblema = new THREE.Mesh(
    new THREE.CircleGeometry(1.6, 40),
    new THREE.MeshStandardMaterial({ map: embTex, roughness: 0.55 }));
  emblema.rotation.x = -Math.PI / 2; emblema.position.y = bowlY(0) + 0.015; scene.add(emblema);

  // 3 bolsões de ring-out na parede (vermelhos, como no estádio Burst)
  for (const ang of POCKET_ANGS) {
    const theta = Math.PI / 2 - ang;   // conversão ângulo-mundo → theta do cilindro
    const seg = new THREE.Mesh(
      new THREE.CylinderGeometry(9.28, 9.28, 0.6, 24, 1, true, theta - 0.3, 0.6),
      new THREE.MeshStandardMaterial({ color: 0xe0452b, side: THREE.DoubleSide, roughness: 0.5, emissive: 0xe0452b, emissiveIntensity: 0.25 }));
    seg.position.y = 0.4; scene.add(seg);
    pocketMeshes.push(seg);
  }

  // aro luminoso e base do estádio
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(9.62, 0.1, 10, 90),
    new THREE.MeshBasicMaterial({ color: 0x7fd4ff }));
  rim.rotation.x = Math.PI / 2; rim.position.y = 0.74; scene.add(rim);
  const pedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(10.6, 11.8, 1.2, 64),
    new THREE.MeshStandardMaterial({ color: 0x2c3a5e, roughness: 0.8 }));
  pedestal.position.y = -1.52; scene.add(pedestal);  // topo abaixo da tigela: não cobre a arena
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(45, 48),
    new THREE.MeshStandardMaterial({ color: 0x151d33, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -2.02; scene.add(floor);
}

/* ---- etiqueta com o nome do jogador, flutuando sobre a beyblade ---- */
const CORES_JOGADOR = ['#ff6a5c', '#6fb4ff', '#5fe0a0', '#ffc95c', '#c890ff'];

function makeLabel(nome, corCss) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.font = 'bold 62px "Segoe UI", system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 12; g.lineJoin = 'round';
  g.strokeStyle = 'rgba(0,0,0,.9)'; g.strokeText(nome, 256, 64);
  g.fillStyle = corCss; g.fillText(nome, 256, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;   // senão as cores saem lavadas
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, depthTest: false,
  }));
  spr.scale.set(3.2, 0.8, 1);
  spr.position.y = 1.75;
  spr.renderOrder = 999;
  return spr;
}

/* ---- construção das beyblades ---- */
function makeTopMesh(sel) {
  const layer = PARTS.LAYERS[sel.layer];
  const cor = layer.cor;
  const outer = new THREE.Group();
  const tilt = new THREE.Group();
  const inner = new THREE.Group();
  outer.add(tilt); tilt.add(inner);

  const metal = new THREE.MeshStandardMaterial({ color: 0xb8bfcc, metalness: 0.9, roughness: 0.35 });
  const corMat = new THREE.MeshStandardMaterial({ color: cor, metalness: 0.4, roughness: 0.45, emissive: cor, emissiveIntensity: 0.12 });
  const escMat = new THREE.MeshStandardMaterial({ color: 0x1a1f30, metalness: 0.5, roughness: 0.6 });

  // ponteira
  const drv = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.3, 0.3, 12), escMat);
  drv.position.y = 0.15; inner.add(drv);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.22, 10), escMat);
  tip.rotation.x = Math.PI; tip.position.y = -0.08; inner.add(tip);
  // disco
  const disk = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.55, 0.16, 24), metal);
  disk.position.y = 0.36; inner.add(disk);
  // camada
  const lay = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.78, 0.28, 24), corMat);
  lay.position.y = 0.56; inner.add(lay);
  for (let i = 0; i < 6; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.2, 0.16), corMat);
    const ang = (i / 6) * Math.PI * 2;
    blade.position.set(Math.cos(ang) * 0.78, 0.56, Math.sin(ang) * 0.78);
    blade.rotation.y = -ang + 0.55;
    inner.add(blade);
  }
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.22, 16), escMat);
  cap.position.y = 0.78; inner.add(cap);

  return { outer, tilt, inner, cor };
}

/* ---- estado visual da batalha ---- */
let tops = [];                    // {outer,tilt,inner,cor, alvo:{x,z}, spinRatio, morto, anim}
let serverState = null;
let shake = 0;
const efeitos = [];               // particulas / fragmentos

function limparBatalha() {
  for (const t of tops) if (t) scene.remove(t.outer);
  tops = [];
  serverState = null;
  for (const e of efeitos) scene.remove(e.obj);
  efeitos.length = 0;
}

function criarTops(jogadores) {
  limparBatalha();
  const n = jogadores.length;
  const raio = n <= 2 ? 4.2 : 6.4;
  jogadores.forEach((j, i) => {
    if (!j.sel) return;
    const t = makeTopMesh(j.sel);
    // mesma distribuição em círculo que o servidor usa
    const ang = 2 * Math.PI * i / n + (n === 2 ? 0 : Math.PI / 2);
    t.alvo = { x: raio * Math.cos(ang), z: raio * Math.sin(ang) };
    t.spinRatio = 1; t.morto = false; t.anim = null;
    t.spinDir = i % 2 === 0 ? 1 : -1;
    t.outer.position.set(t.alvo.x, bowlY(raio) + 0.1, t.alvo.z);
    t.label = makeLabel(j.nome, corJogador(i));
    t.outer.add(t.label);
    scene.add(t.outer);
    tops[i] = t;
  });
}

function corJogador(i) { return CORES_JOGADOR[i % CORES_JOGADOR.length]; }

function particulas(x, z, cor = 0xffb347, n = 14, vel = 5) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3), v = [];
  for (let i = 0; i < n; i++) {
    pos.set([x, bowlY(Math.hypot(x, z)) + 0.5, z], i * 3);
    const a = Math.random() * Math.PI * 2, u = Math.random() * Math.PI;
    v.push(new THREE.Vector3(Math.sin(u) * Math.cos(a), Math.cos(u) * 0.9 + 0.4, Math.sin(u) * Math.sin(a)).multiplyScalar(vel * (0.4 + Math.random() * 0.8)));
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ color: cor, size: 0.16, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
  const obj = new THREE.Points(g, m);
  scene.add(obj);
  efeitos.push({ tipo: 'part', obj, v, vida: 0.55, t: 0 });
}

function fragmentos(idx) {
  const t = tops[idx]; if (!t) return;
  const { x, z } = t.outer.position;
  for (let i = 0; i < 8; i++) {
    const frag = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.14, 0.2),
      new THREE.MeshStandardMaterial({ color: t.cor, metalness: 0.4, roughness: 0.5, transparent: true }));
    frag.position.set(x, 0.6, z);
    const a = Math.random() * Math.PI * 2;
    scene.add(frag);
    efeitos.push({
      tipo: 'frag', obj: frag, t: 0, vida: 1.3,
      v: new THREE.Vector3(Math.cos(a) * (2 + Math.random() * 4), 3 + Math.random() * 3, Math.sin(a) * (2 + Math.random() * 4)),
      rot: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8),
    });
  }
}

/* ---- loop de render ---- */
let lastT = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  const t = now / 1000;

  // câmera orbitando devagar + shake
  const az = 0.22 * Math.sin(t * 0.12);
  camera.position.set(Math.sin(az) * 14.5, 9.2, Math.cos(az) * 14.5);
  if (shake > 0.001) {
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.position.y += (Math.random() - 0.5) * shake;
    shake *= Math.pow(0.02, dt);
  }
  camera.lookAt(0, -0.4, 0);

  // beyblades
  for (const tp of tops) {
    if (!tp) continue;
    if (tp.anim) { tp.anim(dt); continue; }
    const p = tp.outer.position;
    const px = p.x, pz = p.z;
    p.x += (tp.alvo.x - p.x) * Math.min(1, dt * 22);
    p.z += (tp.alvo.z - p.z) * Math.min(1, dt * 22);
    const r = Math.hypot(p.x, p.z);
    p.y = bowlY(Math.min(r, ARENA_R)) + 0.02;
    if (!tp.morto) {
      tp.inner.rotation.y += tp.spinDir * (10 + 65 * tp.spinRatio) * dt;
      // precessão (cambaleio quando o giro acaba) + inclinação na direção do movimento
      const vx = (p.x - px) / Math.max(dt, 1e-4), vz = (p.z - pz) / Math.max(dt, 1e-4);
      const lean = 0.022, cap = 0.3;
      const leanX = Math.max(-cap, Math.min(cap, vz * lean));
      const leanZ = Math.max(-cap, Math.min(cap, -vx * lean));
      const amp = Math.pow(1 - tp.spinRatio, 1.6) * 0.38;
      const w = t * (5 + tp.spinRatio * 5);
      tp.tilt.rotation.x = Math.sin(w) * amp + leanX;
      tp.tilt.rotation.z = Math.cos(w) * amp + leanZ;
    }
  }

  // efeitos
  for (let i = efeitos.length - 1; i >= 0; i--) {
    const e = efeitos[i]; e.t += dt;
    if (e.tipo === 'part') {
      const pos = e.obj.geometry.attributes.position;
      for (let k = 0; k < e.v.length; k++) {
        pos.array[k * 3] += e.v[k].x * dt;
        pos.array[k * 3 + 1] += e.v[k].y * dt;
        pos.array[k * 3 + 2] += e.v[k].z * dt;
        e.v[k].y -= 12 * dt;
      }
      pos.needsUpdate = true;
      e.obj.material.opacity = 1 - e.t / e.vida;
    } else if (e.tipo === 'frag') {
      e.v.y -= 14 * dt;
      e.obj.position.addScaledVector(e.v, dt);
      e.obj.rotation.x += e.rot.x * dt; e.obj.rotation.z += e.rot.z * dt;
      e.obj.material.opacity = Math.max(0, 1 - e.t / e.vida);
    }
    if (e.t >= e.vida) { scene.remove(e.obj); efeitos.splice(i, 1); }
  }
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

/* ================= UI / Rede ================= */
let ws = null, papel = null, meuIdx = -1, faseLocal = 'menu';
let jogadores = [];
let minhaSel = { layer: 'dragao', disk: 'tita', driver: 'agulha' };
let skillInfo = null, skillCd = 0;
let launchLock = false, launchAnim = null;
let estiloSel = 'potente';
let modoAtual = 'duelo', alvoAtual = 3, capAtual = 2;

function aplicarModo(m) {
  if (m.modo) modoAtual = m.modo;
  if (m.alvo) alvoAtual = m.alvo;
  if (m.cap) capAtual = m.cap;
  // no CAOS a parede é sólida: os bolsões de ring-out somem da arena
  for (const p of pocketMeshes) p.visible = modoAtual !== 'caos';
}

const telas = ['tela-menu', 'tela-sala', 'tela-lancamento', 'tela-resultado'];
function mostrar(tela) {
  for (const id of telas) $(id).classList.toggle('oculto', id !== tela);
  $('hud').classList.toggle('oculto', tela !== null);
}

function anunciar(txt, dur = 2200) {
  const a = $('anuncio');
  a.innerHTML = txt; a.style.opacity = 1;
  clearTimeout(a._t);
  a._t = setTimeout(() => a.style.opacity = 0, dur);
}

function send(obj) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); }

function conectar(cb) {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onopen = cb;
  ws.onmessage = (ev) => onMsg(JSON.parse(ev.data));
  ws.onclose = () => $('conexao-erro').classList.remove('oculto');
}

/* ---- picker de peças ---- */
const CATS = [
  ['layer', 'LAYERS', 'row-layer'],
  ['disk', 'DISKS', 'row-disk'],
  ['driver', 'DRIVERS', 'row-driver'],
];
const STAT_LBL = { atk: 'Ataque', def: 'Defesa', sta: 'Estamina', wgt: 'Peso', spd: 'Velocidade', br: 'Anti-Burst' };

function montarPicker() {
  for (const [key, dict, rowId] of CATS) {
    const row = $(rowId); row.innerHTML = '';
    for (const [id, p] of Object.entries(PARTS[dict])) {
      const card = document.createElement('div');
      card.className = 'pick-card';
      card.dataset.id = id;
      const dot = p.cor ? `<span class="dot" style="background:#${p.cor.toString(16).padStart(6, '0')}"></span>` : '';
      card.innerHTML = `<div class="pnome">${dot}${p.nome}</div><div class="ptipo">${p.tipo}</div>
        <div class="pstats">ATQ ${p.atk} · DEF ${p.def} · EST ${p.sta}<br>PESO ${p.wgt} · VEL ${p.spd} · A.B. ${p.br}</div>`;
      card.onclick = () => { minhaSel[key] = id; atualizarPicker(); };
      row.appendChild(card);
    }
  }
  atualizarPicker();
}

function atualizarPicker() {
  for (const [key, , rowId] of CATS)
    for (const c of $(rowId).children)
      c.classList.toggle('sel', c.dataset.id === minhaSel[key]);

  const l = PARTS.LAYERS[minhaSel.layer], d = PARTS.DISKS[minhaSel.disk], dr = PARTS.DRIVERS[minhaSel.driver];
  const bars = $('stats-bars'); bars.innerHTML = '';
  for (const k of Object.keys(STAT_LBL)) {
    const v = l[k] + d[k] + dr[k];
    bars.innerHTML += `<div class="sbar"><span class="lbl">${STAT_LBL[k]}</span>
      <div class="trk"><div class="val" style="width:${Math.min(100, v / 20 * 100)}%"></div></div>
      <b style="width:24px;text-align:right">${v}</b></div>`;
  }
  $('skill-box').innerHTML = `⚡ <b>${l.skill.nome}</b><br>${l.skill.desc}<br><br>🌀 <b>Ponteira ${dr.nome}:</b> ${dr.desc}`;
}

/* ---- lançamento ---- */
function iniciarLancamento(rodada) {
  faseLocal = 'lancamento';
  launchLock = papel !== 'jogador';
  mostrar('tela-lancamento');
  $('lanc-titulo').textContent = `Rodada ${rodada}`;
  $('lanc-status').textContent = papel === 'jogador' ? '' : 'Aguardando os lançamentos…';
  if (launchAnim) cancelAnimationFrame(launchAnim);
  const t0 = performance.now();
  const anim = () => {
    if (faseLocal !== 'lancamento') return;
    if (!launchLock) {
      const p = (Math.sin((performance.now() - t0) / 1000 * 3.6 - Math.PI / 2) + 1) / 2;
      $('power-bar').style.width = (p * 100) + '%';
      $('power-num').textContent = Math.round(p * 100) + '%';
      $('power-bar').dataset.p = p;
    }
    launchAnim = requestAnimationFrame(anim);
  };
  anim();
}

function travarLancamento() {
  if (faseLocal !== 'lancamento' || launchLock || papel !== 'jogador') return;
  launchLock = true;
  const p = parseFloat($('power-bar').dataset.p || 0.7);
  send({ t: 'lancar', power: p, estilo: estiloSel });
  sfxLaunch();
  $('lanc-status').textContent = `Saque ${estiloSel} travado em ${Math.round(p * 100)}%! Aguardando oponente…`;
}

for (const card of document.querySelectorAll('.estilo-card')) {
  card.addEventListener('click', (e) => {
    e.stopPropagation();       // não pode travar a força sem querer
    if (launchLock) return;
    estiloSel = card.dataset.id;
    for (const c of document.querySelectorAll('.estilo-card'))
      c.classList.toggle('sel', c === card);
  });
}

/* ---- HUD ---- */
function montarHud() {
  const cont = $('hud-cards');
  const caos = modoAtual === 'caos';
  cont.className = caos ? 'caos' : 'duelo';
  cont.innerHTML = '';
  jogadores.forEach((j, i) => {
    const card = document.createElement('div');
    card.id = 'card' + i;
    card.className = 'hud-card' + (caos ? '' : (i === 0 ? ' esq' : ' dir'));
    card.style.borderLeftColor = corJogador(i);
    if (!caos) card.style[i === 0 ? 'borderLeftColor' : 'borderRightColor'] = corJogador(i);
    card.innerHTML = `<div class="hud-nome"></div>
      <div class="barra spin"><div class="fill"></div></div>
      <div class="barra burst"><div class="fill"></div></div>
      <div class="pips"></div>`;
    card.querySelector('.hud-nome').textContent = (i === meuIdx ? '⭐ ' : '') + j.nome;
    const pips = card.querySelector('.pips');
    for (let k = 0; k < alvoAtual; k++) pips.innerHTML += `<div class="pip"></div>`;
    cont.appendChild(card);
  });
  atualizarPips();
  const souJogador = papel === 'jogador' && meuIdx >= 0;
  $('hud-skill').style.display = souJogador ? '' : 'none';
  if (souJogador && jogadores[meuIdx]?.sel) {
    skillInfo = PARTS.LAYERS[jogadores[meuIdx].sel.layer].skill;
    $('skill-nome').textContent = skillInfo.nome;
  }
}

/* No CAOS quem criou a sala decide a hora de começar — assim ninguém que
   ainda está entrando fica de fora da partida. */
function atualizarBotaoComecar(humanos) {
  const btn = $('btn-comecar'), aviso = $('aviso-caos');
  const souAnfitriao = papel === 'jogador' && humanos.length > 0
    && jogadores[meuIdx] && !jogadores[meuIdx].bot
    && jogadores.findIndex(j => !j.bot) === meuIdx;
  const mostrarBtn = modoAtual === 'caos' && souAnfitriao;
  btn.classList.toggle('oculto', !mostrarBtn);
  aviso.classList.toggle('oculto', modoAtual !== 'caos' || papel !== 'jogador');

  const faltam = humanos.filter(j => !j.pronto);
  const bots = Math.max(0, capAtual - humanos.length);
  if (mostrarBtn) {
    btn.disabled = faltam.length > 0;
    btn.textContent = bots > 0
      ? `▶ Começar agora (com ${bots} bot${bots > 1 ? 's' : ''})`
      : '▶ Começar agora';
  }
  if (modoAtual === 'caos') {
    aviso.textContent = faltam.length
      ? `Aguardando ficarem prontos: ${faltam.map(j => j.nome).join(', ')}`
      : (souAnfitriao
        ? (bots > 0 ? `Chame mais gente com o código, ou comece já — sobram ${bots} vaga${bots > 1 ? 's' : ''} para bots.`
          : 'Arena lotada de gente! Pode começar.')
        : 'Prontos! Aguardando quem criou a sala começar…');
  }
}

function atualizarPips(placar) {
  if (!placar) placar = jogadores.map(() => 0);
  jogadores.forEach((j, i) => {
    const card = $('card' + i); if (!card) return;
    card.querySelectorAll('.pip').forEach((p, k) => p.classList.toggle('on', k < (placar[i] || 0)));
  });
}

function hudEstado(msg) {
  msg.tops.forEach((st, i) => {
    const card = $('card' + i);
    if (!card) return;
    card.querySelector('.spin .fill').style.width = (st.s * 100) + '%';
    card.querySelector('.burst .fill').style.width = (st.b * 100) + '%';
    card.classList.toggle('fora', !st.a);
    const tp = tops[i];
    if (tp) {
      tp.alvo.x = st.x; tp.alvo.z = st.z;
      tp.spinRatio = st.s;
      if (!st.a && !tp.morto && !tp.anim) {
        tp.morto = true; // spin/tempo finish: tomba no lugar
        if (tp.label) tp.label.material.opacity = 0.35;
        const dir = Math.random() > 0.5 ? 1 : -1;
        let prog = 0;
        tp.anim = (dt) => {
          prog = Math.min(1, prog + dt * 2);
          tp.tilt.rotation.z = dir * prog * 1.25;
          tp.outer.position.y = bowlY(Math.hypot(tp.outer.position.x, tp.outer.position.z)) + 0.02 - prog * 0.25;
          if (prog >= 1) tp.anim = null;
        };
      }
    }
    if (i === meuIdx) {
      skillCd = st.cd;
      const btn = $('btn-skill');
      if (st.cd > 0) { btn.classList.add('cd'); $('skill-cd').textContent = st.cd.toFixed(1); }
      else { btn.classList.remove('cd'); $('skill-cd').textContent = '⚡'; }
    }
  });
  const rest = Math.max(0, ROUND_TIME - msg.time);
  $('hud-tempo').textContent = `${Math.floor(rest / 60)}:${String(Math.floor(rest % 60)).padStart(2, '0')}`;
}

/* ---- mensagens do servidor ---- */
function onMsg(m) {
  switch (m.t) {
    case 'sala':
      papel = m.papel; meuIdx = m.idx;
      aplicarModo(m);
      $('sala-codigo').textContent = m.codigo;
      $('picker').classList.toggle('oculto', papel !== 'jogador');
      $('espectador-aviso').classList.toggle('oculto', papel === 'jogador');
      jogadores = m.jogadores;
      if (papel === 'espectador' && (m.fase === 'batalha' || m.fase === 'lancamento' || m.fase === 'fimRodada')) {
        faseLocal = 'batalha';
        criarTops(jogadores);
        montarHud();
        atualizarPips(m.placar);
        mostrar(null);
      } else {
        mostrar('tela-sala');
        faseLocal = 'sala';
      }
      break;
    case 'reidx': meuIdx = m.idx; break;
    case 'jogadores': {
      jogadores = m.lista;
      aplicarModo(m);
      const humanos = jogadores.filter(j => !j.bot);
      const lista = humanos.map(j => j.nome + (j.pronto ? ' ✔' : '')).join(' · ');
      if (modoAtual === 'caos') {
        $('sala-status').textContent =
          `🔥 CAOS · ${humanos.length}/${capAtual} humanos — ${lista || '—'}`;
      } else {
        $('sala-status').textContent = jogadores.length < 2
          ? 'Aguardando oponente… compartilhe o código!'
          : `Jogadores: ${lista}`;
      }
      atualizarBotaoComecar(humanos);
      break;
    }
    case 'faseEscolha':
      jogadores = m.jogadores;
      aplicarModo(m);
      limparBatalha();
      mostrar('tela-sala'); faseLocal = 'sala';
      $('btn-pronto').disabled = false;
      $('btn-pronto').textContent = '3, 2, 1… Estou pronto!';
      $('btn-comecar').disabled = false;
      $('sala-status').textContent = 'Revanche! Monte sua beyblade de novo.';
      break;
    case 'faseLancamento':
      jogadores = m.jogadores;
      aplicarModo(m);
      iniciarLancamento(m.rodada);
      break;
    case 'inicioBatalha':
      jogadores = m.jogadores;
      aplicarModo(m);
      faseLocal = 'batalha';
      criarTops(jogadores);
      montarHud();
      atualizarPips(m.placar);
      mostrar(null);
      anunciar(modoAtual === 'caos'
        ? '🔥 CAOS! 5 NA ARENA<br><span style="font-size:.5em">Ninguém sai — é briga até a morte!</span>'
        : 'LET IT RIP! 🌀', modoAtual === 'caos' ? 2400 : 1500);
      sfxLaunch();
      break;
    case 'estado':
      if (faseLocal === 'batalha' || faseLocal === 'fimRodada') hudEstado(m);
      break;
    case 'hit':
      particulas(m.x, m.z, 0xffb347, 10 + Math.min(18, m.f * 2), 3 + m.f * 0.6);
      shake = Math.min(0.5, 0.06 + m.f * 0.035);
      sfxHit(m.f);
      break;
    case 'skillUsada': {
      const quem = jogadores[m.idx]?.nome || '???';
      anunciar(`⚡ ${quem}: <span style="font-size:.7em">${m.skill.nome}</span>`, 1600);
      sfxSkill();
      const tp = tops[m.idx];
      if (tp) particulas(tp.outer.position.x, tp.outer.position.z, tp.cor, 20, 6);
      break;
    }
    case 'ringout': {
      const tp = tops[m.idx];
      if (tp) {
        let vy = 3;
        tp.morto = true;
        tp.anim = (dt) => {
          tp.outer.position.x += m.vx * dt;
          tp.outer.position.z += m.vz * dt;
          vy -= 15 * dt;
          tp.outer.position.y += vy * dt;
          tp.inner.rotation.y += 20 * dt;
          if (tp.outer.position.y < -6) tp.anim = () => { };
        };
      }
      break;
    }
    case 'burst': {
      const tp = tops[m.idx];
      if (tp) {
        tp.outer.visible = false; tp.morto = true; tp.anim = () => { };
        fragmentos(m.idx);
        particulas(m.x, m.z, 0xff5533, 26, 9);
        shake = 0.6;
      }
      sfx(120, 0.4, 'sawtooth', 0.15, -60);
      break;
    }
    case 'fimRodada': {
      faseLocal = 'fimRodada';
      const info = NOMES_CAUSA[m.causa] || NOMES_CAUSA.empate;
      const quem = m.vencedor !== null ? jogadores[m.vencedor]?.nome : null;
      anunciar(quem
        ? `${info.titulo}<br><span style="font-size:.55em">${quem} marcou ${m.pontos} ponto${m.pontos > 1 ? 's' : ''} — ${info.desc}</span>`
        : `${info.titulo}<br><span style="font-size:.55em">${info.desc}</span>`, 4200);
      atualizarPips(m.placar);
      sfxFim(m.vencedor === meuIdx);
      break;
    }
    case 'fimPartida': {
      faseLocal = 'fimPartida';
      const venci = m.vencedor === meuIdx;
      $('result-titulo').textContent = papel === 'jogador'
        ? (venci ? '🏆 VITÓRIA!' : '💀 Derrota…')
        : `🏆 ${m.nome} venceu!`;
      $('result-sub').textContent = papel === 'jogador'
        ? (venci ? 'Sua beyblade dominou a arena!' : `${m.nome} levou a melhor desta vez.`)
        : 'Fim de partida.';
      $('result-placar').textContent = `${m.placar[0]} × ${m.placar[1]}`;
      $('btn-revanche').classList.toggle('oculto', papel !== 'jogador');
      $('revanche-status').textContent = '';
      mostrar('tela-resultado');
      sfxFim(venci);
      break;
    }
    case 'revancheStatus':
      $('revanche-status').textContent = `Revanche: ${m.prontos}/2 confirmados`;
      break;
    case 'saiu':
      jogadores = m.jogadores;
      limparBatalha();
      mostrar('tela-sala'); faseLocal = 'sala';
      $('btn-pronto').disabled = false;
      $('btn-pronto').textContent = '3, 2, 1… Estou pronto!';
      $('btn-comecar').disabled = false;
      $('sala-status').textContent = `${m.nome} saiu da sala. Aguardando novo oponente…`;
      break;
    case 'erro':
      $('menu-erro').textContent = m.msg;
      break;
  }
}

/* ---- controles (só o lançamento — depois é torcida!) ---- */
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (e.key === ' ') {
    e.preventDefault();
    if (faseLocal === 'lancamento') travarLancamento();
  }
});
$('tela-lancamento').onclick = travarLancamento;

/* ---- menu ---- */
$('inp-nome').value = localStorage.getItem('bey-nome') || '';
function pegarNome() {
  const n = $('inp-nome').value.trim() || 'Blader';
  localStorage.setItem('bey-nome', n);
  return n;
}
$('btn-criar').onclick = () => { audio(); conectar(() => send({ t: 'criar', nome: pegarNome() })); };
$('btn-bot').onclick = () => { audio(); conectar(() => send({ t: 'criarBot', nome: pegarNome() })); };
$('btn-caos').onclick = () => { audio(); conectar(() => send({ t: 'criar', nome: pegarNome(), modo: 'caos' })); };
$('btn-entrar').onclick = () => {
  const cod = $('inp-codigo').value.trim().toUpperCase();
  if (cod.length !== 4) { $('menu-erro').textContent = 'Código deve ter 4 letras/números.'; return; }
  audio(); conectar(() => send({ t: 'entrar', codigo: cod, nome: pegarNome() }));
};
$('btn-pronto').onclick = () => {
  send({ t: 'pecas', sel: minhaSel });
  $('btn-pronto').disabled = true;
  $('btn-pronto').textContent = modoAtual === 'caos'
    ? 'Pronto! 🔥' : 'Pronto! Aguardando oponente…';
};
$('btn-comecar').onclick = () => {
  send({ t: 'comecar' });
  $('btn-comecar').disabled = true;
};
$('btn-revanche').onclick = () => { send({ t: 'revanche' }); $('btn-revanche').disabled = true; setTimeout(() => $('btn-revanche').disabled = false, 1500); };

montarPicker();
mostrar('tela-menu');
