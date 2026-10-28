// Game.js - الملف كاملاً بعد الإصلاح

(function(){
'use strict';

const $ = (s, r) => (r || document).querySelector(s);
const cv = $('#cv'), ctx = cv.getContext('2d');
const frame = $('#frame');

// طبقة الخلفية (عنصر HTML حتى يتحرك الـ GIF) + طبقة الشخصيات (عناصر img متحركة)
const bgDiv = document.createElement('div');
bgDiv.style.cssText = 'position:absolute;inset:0;z-index:0;pointer-events:none;background:#2a1850 url(images/background2.gif) repeat-x 0 0;background-size:auto 100%';
frame.insertBefore(bgDiv, cv);
cv.style.position = 'relative';
const layer = document.createElement('div');
layer.style.cssText = 'position:absolute;inset:0;z-index:0;overflow:hidden;pointer-events:none';
frame.insertBefore(layer, $('#hud'));

const WORLD = 6400, H = 400, Y0 = 252, Y1 = 372, HORIZON = 238;
let VW = 800, SC = 1, CS = 1;
const START = 130;

// ===== أحجام الشخصيات (الارتفاع الظاهر فعلاً بوحدات العالم، ارتفاع الساحة = 400) =====
const HERO_VIS = 84;           // الارتفاع الظاهر للبطل
const HERO_SCALE = [1, 1];     // [REX, ZARA] تعديل إضافي لكل بطل
const ENEMY_VIS = { thug: 80, brute: 100, raptor: 62 };   // الارتفاع الظاهر لكل عدو
const PROP_VIS = { crate: 38, barrel: 42 };               // الصناديق والبراميل

const rr = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const configStr = localStorage.getItem('gameConfig');
let gameConfig = { side: 0, diff: 1, vsAI: true };
if (configStr) {
    try { gameConfig = JSON.parse(configStr); } catch(e) {}
}

// ==========================================
// IMAGE LOADING (GIF)
// ==========================================
const hiddenAssets = document.createElement('div');
// لا نستخدم display:none لأن المتصفح يوقف تحريك الـ GIF
hiddenAssets.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;overflow:hidden;opacity:.01;pointer-events:none;z-index:-1';
document.body.appendChild(hiddenAssets);

function loadImg(src) {
    const img = document.createElement('img');
    img.src = src;
    hiddenAssets.appendChild(img);
    return img;
}

const IMG = {
    bg: loadImg('images/background2.gif'),
    explosion: loadImg('images/booom.gif'),
    crate: loadImg('images/box1.gif'),
    barrel: loadImg('images/box3.gif'),
    item_health: loadImg('images/heart.png'),
    item_pistol: loadImg('images/gun.png'),
    item_smg: loadImg('images/gun2.png'),
    item_shotgun: loadImg('images/gun3.png'),
    item_knife: loadImg('images/knef.png'),
    item_ammo: loadImg('images/bullets.png'),
    item_bomb: loadImg('images/bom.png'),
    player1: {}, player2: {}, enemies: {}
};

// أسماء حركات البطل: player2h.gif / player2h_walk.gif ...
const PLAYER_SUFFIX = {
    idle: '', walk: '_walk', shoot: '_shoot', gun: '_gun', punch: '_punch',
    sword: '_sword', injured: '_injured', death: '_death', bomb: '_bomb',
    loot: '_loot', victory: '_victory'
};
function loadPlayerSprites(base, obj) {
    for (const k in PLAYER_SUFFIX) obj[k] = loadImg(`images/${base}${PLAYER_SUFFIX[k]}.gif`);
}
loadPlayerSprites('player2h', IMG.player1);   // REX
loadPlayerSprites('player4h', IMG.player2);   // ZARA

// الأعداء: رقم العدو يتكرر: enemy2 / enemy22 / enemy222 / enemy2222 / enemy22222
function loadEnemySprites(n) {
    const d = String(n);
    return {
        idle:    loadImg(`images/enemy${d}.gif`),
        walk:    loadImg(`images/enemy${d.repeat(2)}.gif`),
        punch:   loadImg(`images/enemy${d.repeat(3)}.gif`),
        injured: loadImg(`images/enemy${d.repeat(4)}.gif`),
        death:   loadImg(`images/enemy${d.repeat(5)}.gif`)
    };
}
IMG.enemies['thug']   = loadEnemySprites(1);
IMG.enemies['brute']  = loadEnemySprites(2);
IMG.enemies['raptor'] = loadEnemySprites(7);   // غيّر الرقم لأي عدو آخر (4، 8، 9، ...)

// ==========================================
// SOUND MANAGEMENT
// ==========================================
const SND = {
    shoot: new Audio('sounds/shoot.mp3'),
    hit: new Audio('sounds/enemy_hit.mp3'),
    swing: new Audio('sounds/knife.mp3'),
    boom: new Audio('sounds/booom.mp3'),
    jump: new Audio('sounds/run.mp3'),
    pick: new Audio('sounds/powerup_collect.mp3'),
    win: new Audio('sounds/win_music.mp3'),
    lose: new Audio('sounds/lose_music.mp3'),
    bgm: new Audio('sounds/background_music.mp3'),
    box_destroy: new Audio('sounds/box_destroy.mp3'),
    health_refill: new Audio('sounds/health_refill.mp3')
};
SND.bgm.loop = true;
let muted = false;

function playSnd(s) {
    if (muted) return;
    try { s.currentTime = 0; s.play().catch(()=>{}); } catch(e) {}
}

// ==========================================
// GAME CONSTANTS
// ==========================================
const WEAPONS = {
  knife: { name: 'Knife', type: 'melee', dm: 16, reach: 50, dur: .24, a0: .06, a1: .18, cd: .25, maxAmmo: Infinity },
  pistol: { name: 'Pistol', type: 'gun', dm: 18, reach: 340, cd: .32, maxAmmo: 24, speed: 900, spread: .02, shots: 1, color: '#ffe58a' },
  smg: { name: 'SMG', type: 'gun', dm: 7, reach: 300, cd: .09, maxAmmo: 60, speed: 850, spread: .07, shots: 1, color: '#ffd34d' },
  shotgun: { name: 'Shotgun', type: 'gun', dm: 10, reach: 220, cd: .7, maxAmmo: 12, speed: 780, spread: .18, shots: 5, color: '#ffb347' }
};
const BOMB = { dm: 50, radius: 120, fuse: 1.5, vx: 280, vz: 340 };
const MINE = { dm: 60, radius: 130, armTime: .5, trigger: 38 };
const DROP_KINDS = ['ammo', 'pistol', 'smg', 'shotgun', 'health', 'bomb'];
const CRATE_CONTENTS = ['ammo', 'pistol', 'smg', 'shotgun', 'health', 'bomb'];

const ET = {
  thug: { hp: 30, spd: 62, reach: 44, dmg: 8, wind: .45, sc: 1, kd: false },
  brute: { hp: 70, spd: 46, reach: 56, dmg: 15, wind: .7, sc: 1.3, kd: true },
  raptor: { hp: 18, spd: 118, reach: 38, dmg: 7, wind: .22, sc: 1, kd: false }
};

const WAVES = [
  { d: 360, u: ['thug', 'thug'] },
  { d: 900, u: ['thug', 'raptor', 'thug'] },
  { d: 1400, u: ['raptor', 'raptor', 'raptor'] },
  { d: 1850, u: ['thug', 'brute'] },
  { d: 2300, u: ['thug', 'thug', 'raptor'] },
  { d: 2700, u: ['brute', 'raptor', 'raptor'] }
];

const DIFF = [
  { spd: .82, dmg: .8, cd: 1.3, eng: 230 },
  { spd: 1, dmg: 1, cd: 1, eng: 280 },
  { spd: 1.25, dmg: 1.25, cd: .72, eng: 340 }
];

const G = {
  phase: 'menu', side: gameConfig.side, diff: gameConfig.diff, ready: true, vsAI: gameConfig.vsAI,
  time: 0, kills: 0, dmgDealt: 0, countT: 0, overT: 0, result: null,
  gc: 1, t: 0
};

let me = null, ai = null;
let enemies = [], items = [], parts = [], floaters = [], bullets = [], bombs = [], mines = [], crates = [], barrels = [], explosions = [];
let cam = 0, shake = 0, waveIdx = 0, aiWaveIdx = 0, lastCount = -1;
const inp = { l: false, r: false, u: false, d: false, atk: false, jmp: false, sw: false, bomb: false, mine: false };
let padX = 0, padY = 0;

// ==========================================
// FIGHTERS & COMBAT
// ==========================================
function mkFighter(side) {
  const w = { knife: Infinity, pistol: 0, smg: 0, shotgun: 0 };
  return {
    side: side, x: side === 0 ? START : WORLD - START, y: 312, z: 0, vz: 0, vx: 0,
    face: side === 0 ? 1 : -1, hp: 100, lives: 3, st: 'i', stT: 0, ph: 0, mv: false,
    atkT: -1, atkType: 0, combo: 0, comboT: 0, ak: 0, ah: false, inv: 0,
    dead: false, respT: 0, won: false, throwT: -1,
    mode: 'march', modeT: rr(2, 3.5), cd: 1.2, jumpT: rr(2, 5),
    weapon: 'knife', weapons: w,
    bombs: 1, mines: 0,
    gunCd: 0, switchT: 0, hitEnemies: null, hitAI: -1,
    hk: 0, tk: 0, lk: 0, lootT: 0,
    shootCd: 0, bombCd: 0, sdT: 0, sd: 1, hitMe: -1
  };
}

function prog(f) { return f.side === 0 ? f.x - START : (WORLD - START) - f.x; }
function inReach(ax, ay, az, af, reach, bx, by, bz, rad) {
  const dx = (bx - ax) * af;
  return dx > -12 && dx < reach + (rad || 14) && Math.abs(by - ay) <= 22 && Math.abs(bz - az) <= 46;
}
function getWeapon(f) { return WEAPONS[f.weapon] || WEAPONS.knife; }

function sparks(x, y, z, color) {
  for (let i = 0; i < 9; i++) {
    const a = rr(0, 6.28), s = rr(60, 180);
    parts.push({ x: x, y: y, z: z, vx: Math.cos(a) * s, vz: Math.sin(a) * s + 40, l: rr(.2, .38), c: color || (i % 2 ? '#ffe58a' : '#fff') });
  }
  shake = Math.min(6, shake + 2.2);
}
function floatText(x, y, text, color) { floaters.push({ x: x, y: y, t: 0, text: text, c: color }); }

function spawnWorldObjects() {
  crates = []; barrels = [];
  const lanes = [Y0 + 20, Y0 + 55, Y0 + 90, Y1 - 15];

  let d = 200; let safety = 0;
  while (d < WORLD - 400 && safety++ < 200) {
    const y = lanes[Math.floor(Math.random() * lanes.length)];
    crates.push({ x: d, y: y, hp: 40, max: 40, content: CRATE_CONTENTS[Math.floor(Math.random() * CRATE_CONTENTS.length)], broken: false, w: 26, h: 26 });
    d += Math.round(rr(280, 450));
  }
  d = 350; safety = 0;
  while (d < WORLD - 300 && safety++ < 200) {
    const y = lanes[Math.floor(Math.random() * lanes.length)];
    barrels.push({ x: d, y: y, hp: 100, exploded: false });
    d += Math.round(rr(380, 560));
  }
  d = 500; safety = 0;
  while (d < WORLD - 400 && safety++ < 200) {
    const k = DROP_KINDS[Math.floor(Math.random() * DROP_KINDS.length)];
    items.push({ x: d, y: lanes[Math.floor(Math.random() * lanes.length)], t: 0, kind: k });
    d += Math.round(rr(520, 720));
  }
}

function hurtMe(dmg, dir, kd, fromExplosion) {
  const m = me;
  if (!m || m.inv > 0 || m.dead || G.phase !== 'play') return false;
  m.hp -= dmg; m.inv = .35;
  m.hk = (m.hk || 0) + 1;
  playSnd(SND.hit); sparks(m.x, m.y, m.z + 34);
  m.atkT = -1; m.ah = false; m.throwT = -1;
  
  if (m.hp <= 0) {
    m.hp = 0; m.dead = true; m.lives--;
    m.st = 'd'; m.stT = 0; m.vx = dir * 240; m.vz = 220; m.respT = 2.3;
  } else if (kd || m.z > 0 || fromExplosion) {
    m.st = 'd'; m.stT = 0; m.vx = dir * 220; m.vz = 210;
  } else {
    m.st = 'h'; m.stT = 0; m.vx = dir * 90;
  }
  return true;
}

function hurtAI(dmg, dir, kd) {
  const a = ai;
  if (!a || a.dead || a.inv > 0) return;
  const mult = G.diff === 0 ? 1.25 : (G.diff === 2 ? .8 : 1);
  a.hp -= dmg * mult; a.inv = .3;
  a.hk = (a.hk || 0) + 1;
  playSnd(SND.hit); sparks(a.x, a.y, a.z + 34);
  a.atkT = -1; a.ah = false; a.throwT = -1;
  
  if (a.hp <= 0) {
    a.hp = 0; a.dead = true; a.lives--;
    a.st = 'd'; a.stT = 0; a.vx = dir * 240; a.vz = 220; a.respT = 2.3;
  } else if (kd || a.z > 0) {
    a.st = 'd'; a.stT = 0; a.vx = dir * 220; a.vz = 210;
  } else {
    a.st = 'h'; a.stT = 0; a.vx = dir * 90;
  }
}

function hurtEnemy(e, dmg, dir, kd, byAI) {
  e.hp -= dmg;
  e.hk = (e.hk || 0) + 1;
  playSnd(SND.hit); sparks(e.x, e.y, 34 * ET[e.k].sc);
  e.did = false;
  if (e.hp <= 0) {
    if (!byAI) G.kills++;
    const dropRoll = Math.random();
    if (dropRoll < (e.k === 'brute' ? .9 : .4)) {
      let kind = 'ammo';
      if (Math.random() < .3) kind = 'health';
      else if (Math.random() < .3) kind = 'bomb';
      else if (Math.random() < .3) kind = 'pistol';
      items.push({ x: e.x, y: e.y, t: 0, kind: kind });
    }
    e.st = 'down'; e.t = 0; e.vx = dir * 260;
  } else if (kd) {
    e.st = 'down'; e.t = 0; e.vx = dir * 250;
  } else {
    e.st = 'hurt'; e.t = 0; e.vx = dir * 80;
  }
}

function createExplosion(x, y, z, radius, dm, owner) {
  explosions.push({ x: x, y: y, z: z, t: 0, dur: .55, maxR: radius });
  playSnd(SND.boom); shake = Math.min(14, shake + 8);
  for (let i = 0; i < 24; i++) {
    const a = rr(0, 6.28), sp = rr(80, 280);
    parts.push({ x: x, y: y, z: z, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp + 60, l: rr(.4, .9), c: i % 3 === 0 ? '#ffe58a' : (i % 3 === 1 ? '#ffb347' : '#ff6f4e') });
  }
  if (me && !me.dead && me.st !== 'd') {
    const dx = me.x - x, dy = me.y - y, dist = Math.hypot(dx, dy);
    if (dist < radius) hurtMe(Math.round(dm * (1 - dist / radius)), (dx > 0 ? 1 : -1), true, true);
  }
  if (ai && !ai.dead && ai.st !== 'd') {
    const dx = ai.x - x, dy = ai.y - y, dist = Math.hypot(dx, dy);
    if (dist < radius) hurtAI(Math.round(dm * (1 - dist / radius)), (dx > 0 ? 1 : -1), true);
  }
  for (const e of enemies) {
    if (e.st === 'dead') continue;
    const dx = e.x - x, dy = e.y - y, dist = Math.hypot(dx, dy);
    if (dist < radius) hurtEnemy(e, Math.round(dm * (1 - dist / radius)), (dx > 0 ? 1 : -1), true, owner === 'ai');
  }
  for (const b of barrels) {
    if (b.exploded) continue;
    if (Math.hypot(b.x - x, b.y - y) < radius * .95) { b.hp = 0; setTimeout(() => explodeBarrel(b), 50 + Math.random() * 80); }
  }
  for (const c of crates) {
    if (c.broken) continue;
    if (Math.hypot(c.x - x, c.y - y) < radius * .9) breakCrate(c);
  }
}

function explodeBarrel(b) {
  if (b.exploded) return;
  b.exploded = true;
  createExplosion(b.x, b.y, 10, 130, 55, 'barrel');
}

function breakCrate(c) {
  if (c.broken) return;
  c.broken = true;
  playSnd(SND.box_destroy); shake = Math.min(6, shake + 2);
  for (let i = 0; i < 10; i++) parts.push({ x: c.x, y: c.y, z: 10, vx: rr(-90, 90), vz: rr(60, 180), l: rr(.3, .7), c: '#8a5a2a' });
  items.push({ x: c.x, y: c.y, t: 0, kind: c.content });
}

function startMelee(f) {
  f.combo = f.comboT > 0 ? (f.combo + 1) % 3 : 0;
  f.comboT = .6; f.st = 'a'; f.atkT = 0; f.ak++; f.ah = false;
  f.atkType = f.combo === 2 ? 1 : 0; f.hitEnemies = new Set(); f.hitAI = -1;
  playSnd(SND.swing);
}
function startMeleeAir(f) {
  f.atkT = 0; f.ak++; f.atkType = 2; f.ah = false;
  f.hitEnemies = new Set(); f.hitAI = -1;
  playSnd(SND.swing);
}
function fireGun(f, isMe) {
  const W = getWeapon(f);
  if (W.type !== 'gun') return;
  if (f.weapons[f.weapon] <= 0) { f.weapon = 'knife'; return; }
  if (f.gunCd > 0) return;
  f.weapons[f.weapon]--; f.gunCd = W.cd;
  f.ak++; f.atkT = 0; f.atkType = 0; f.st = 'a'; f.ah = false;
  playSnd(SND.shoot);
  const ownerTag = isMe ? 'me' : 'ai';
  for (let s = 0; s < W.shots; s++) {
    const spread = (Math.random() - .5) * W.spread;
    bullets.push({
      x: f.x + f.face * 14, y: f.y, z: f.z + 20,
      vx: f.face * W.speed, vy: Math.sin(spread) * W.speed * .3, vz: Math.sin(spread) * 40,
      dm: W.dm, owner: ownerTag, color: W.color, life: .8, t: 0
    });
  }
}
function throwBomb(f, isMe) {
  if (f.bombs <= 0) return;
  f.bombs--;
  f.tk = (f.tk || 0) + 1;
  f.throwT = 0.3;
  bombs.push({ x: f.x + f.face * 16, y: f.y, z: f.z + 40, vx: f.face * BOMB.vx, vz: BOMB.vz, t: 0, fuse: BOMB.fuse, owner: isMe ? 'me' : 'ai', dm: BOMB.dm, radius: BOMB.radius, settled: false });
}
function placeMine(f, isMe) {
  if (f.mines <= 0) return;
  f.mines--;
  mines.push({ x: f.x, y: f.y, t: 0, armed: false, armT: MINE.armTime, owner: isMe ? 'me' : 'ai', dm: MINE.dm, radius: MINE.radius, gone: false });
}
function switchWeapon(f) {
  if (f.switchT > 0) return;
  const order = ['knife', 'pistol', 'smg', 'shotgun'];
  const avail = order.filter(w => w === 'knife' || f.weapons[w] > 0);
  if (avail.length <= 1) return;
  f.weapon = avail[(avail.indexOf(f.weapon) + 1) % avail.length];
  f.switchT = .25;
}

function applyMeleeHits(f, isMe) {
  if (!f.ah) return;
  const A = f.atkType === 1 ? { dm: 20, reach: 58, kd: true } : f.atkType === 2 ? { dm: 16, reach: 52, kd: false } : { dm: 16, reach: 50, kd: false };
  if (isMe) {
    for (const e of enemies) {
      if (e.st === 'dead' || f.hitEnemies.has(e)) continue;
      if (inReach(f.x, f.y, f.z, f.face, A.reach, e.x, e.y, 0, e.k === 'brute' ? 20 : 14)) {
        f.hitEnemies.add(e); hurtEnemy(e, A.dm, f.face, A.kd || f.atkType === 2); G.dmgDealt += A.dm;
      }
    }
    if (G.vsAI && ai && !ai.dead && ai.st !== 'd' && ai.inv <= 0 && f.hitAI !== f.ak) {
      if (inReach(f.x, f.y, f.z, f.face, A.reach, ai.x, ai.y, ai.z, 14)) { f.hitAI = f.ak; hurtAI(A.dm, f.face, A.kd); G.dmgDealt += A.dm; }
    }
    for (const c of crates) {
      if (!c.broken && Math.abs(c.x - f.x) < A.reach && Math.abs(c.y - f.y) < 20 && (c.x - f.x) * f.face > -12) {
        c.hp -= A.dm; if (c.hp <= 0) breakCrate(c);
      }
    }
    for (const b of barrels) {
      if (!b.exploded && Math.abs(b.x - f.x) < A.reach && Math.abs(b.y - f.y) < 20 && (b.x - f.x) * f.face > -12) {
        b.hp -= A.dm; if (b.hp <= 0) explodeBarrel(b);
      }
    }
  }
}

// ==========================================
// UPDATE LOGIC
// ==========================================
function updateMe(dt) {
  const m = me;
  if (!m) return;
  m.inv = Math.max(0, m.inv - dt); m.comboT = Math.max(0, m.comboT - dt);
  m.stT += dt; m.gunCd = Math.max(0, m.gunCd - dt); m.switchT = Math.max(0, m.switchT - dt);
  if (m.throwT > 0) m.throwT -= dt;
  if (m.lootT > 0) m.lootT -= dt;
  
  m.x += m.vx * dt; m.vx -= m.vx * Math.min(1, dt * 7);
  if (m.z > 0 || m.vz > 0) {
    m.vz -= 1000 * dt; m.z += m.vz * dt;
    if (m.z <= 0) { m.z = 0; m.vz = 0; if (m.st === 'j') { m.st = 'i'; m.atkT = -1; m.ah = false; } }
  }
  const ix = clamp((inp.r ? 1 : 0) - (inp.l ? 1 : 0) + padX, -1, 1);
  const iy = clamp((inp.d ? 1 : 0) - (inp.u ? 1 : 0) + padY, -1, 1);
  const canAct = G.phase === 'play';
  m.mv = false;
  const W = getWeapon(m);

  if (m.st === 'i') {
    if (canAct && (ix || iy)) {
      m.x += ix * 175 * dt; m.y += iy * 105 * dt; m.mv = true; m.ph += dt * 12;
      if (ix) m.face = ix > 0 ? 1 : -1;
    }
    if (canAct && inp.sw) { switchWeapon(m); inp.sw = false; }
    if (canAct && inp.bomb) { throwBomb(m, true); inp.bomb = false; }
    if (canAct && inp.mine) { placeMine(m, true); inp.mine = false; }
    if (canAct && inp.jmp) { m.vz = 370; m.st = 'j'; m.atkT = -1; playSnd(SND.jump); }
    else if (canAct && inp.atk) {
      if (W.type === 'gun') fireGun(m, true);
      else startMelee(m);
    }
  } else if (m.st === 'a') {
    m.atkT += dt;
    if (W.type === 'melee') {
      m.ah = m.atkT >= .06 && m.atkT <= .22;
      if (m.ah) m.x += m.face * 55 * dt;
    }
    if (W.type === 'melee' && inp.atk && m.atkT > .12) startMelee(m);
    else if (m.atkT >= (W.type === 'melee' ? .36 : .18)) { m.st = 'i'; m.atkT = -1; m.ah = false; }
  } else if (m.st === 'j') {
    m.x += ix * 140 * dt; m.y += iy * 60 * dt;
    if (ix) m.face = ix > 0 ? 1 : -1;
    m.ph += dt * 9;
    if (canAct && inp.atk && m.atkT < 0 && W.type === 'melee') startMeleeAir(m);
    if (canAct && inp.sw) { switchWeapon(m); inp.sw = false; }
    if (canAct && inp.bomb) { throwBomb(m, true); inp.bomb = false; }
    if (canAct && inp.mine) { placeMine(m, true); inp.mine = false; }
    if (m.atkT >= 0) {
      m.atkT += dt; m.ah = m.atkT >= 0 && m.atkT <= .26;
      if (m.atkT > .32) { m.atkT = -1; m.ah = false; }
    }
  } else if (m.st === 'h') {
    if (m.stT > .32) m.st = 'i';
  } else if (m.st === 'd') {
    if (m.dead) {
      m.respT -= dt;
      if (m.respT <= 0 && m.lives > 0) {
        m.dead = false; m.hp = 100; m.st = 'i'; m.z = 0; m.vz = 0; m.inv = 2;
        floatText(m.x, m.y - 70, 'RESPAWN', '#fff');
      }
    } else if (m.z <= 0 && m.stT > .9) { m.st = 'i'; m.inv = 1; }
  }
  resolveObs(m);
  m.x = clamp(m.x, 30, WORLD - 30); m.y = clamp(m.y, Y0, Y1);
  inp.atk = false; inp.jmp = false;
}

function mkEnemy(k, x, y) {
  const T = ET[k];
  return { k: k, x: x, y: y, z: 0, vx: 0, face: -1, hp: T.hp, st: 'walk', t: 0, cd: rr(.4, 1.2), ph: rr(0, 6), mv: false, offY: rr(-10, 10), did: false, remove: false, hk: 0, ak: 0 };
}

function spawnWave(w, f) {
  const dir = f.side === 0 ? 1 : -1;
  w.u.forEach((k, i) => {
    const behind = (w.u.length > 2 && i === w.u.length - 1 && k !== 'brute');
    const off = VW * .5 + 90 + i * 60;
    const x = clamp(f.x + (behind ? -dir : dir) * off, 40, WORLD - 40);
    enemies.push(mkEnemy(k, x, rr(Y0 + 8, Y1 - 8)));
  });
}

function hurtFighter(f, dmg, dir, kd) {
  return f === me ? hurtMe(dmg, dir, kd) : hurtAI(dmg, dir, kd);
}

function nearestFighter(x) {
  let best = null, bd = 1e9;
  const list = [];
  if (me && !me.dead) list.push(me);
  if (G.vsAI && ai && !ai.dead) list.push(ai);
  for (const f of list) { const d = Math.abs(f.x - x); if (d < bd) { bd = d; best = f; } }
  return best;
}

// ---------- الصناديق والبراميل صلبة: لا يمر منها أحد (القفز فوقها مسموح) ----------
function obsPush(e, o) {
  const dx = e.x - o.x, dy = e.y - o.y;
  const px = 29 - Math.abs(dx), py = 16 - Math.abs(dy);
  if (px <= 0 || py <= 0) return null;
  if (px <= py) { e.x += (dx >= 0 ? 1 : -1) * px; return 'x'; }
  e.y += (dy >= 0 ? 1 : -1) * py; return 'y';
}
function resolveObs(e) {
  if (e.z > 34) return null;
  let blocked = null;
  for (const o of crates) {
    if (o.broken || Math.abs(o.x - e.x) > 45) continue;
    if (obsPush(e, o) === 'x') blocked = o;
  }
  for (const o of barrels) {
    if (o.exploded || Math.abs(o.x - e.x) > 45) continue;
    if (obsPush(e, o) === 'x') blocked = o;
  }
  return blocked;
}

function updateEnemies(dt) {
  for (const e of enemies) {
    const T = ET[e.k];
    e.t += dt; e.cd -= dt;
    e.x += e.vx * dt; e.vx -= e.vx * Math.min(1, dt * 6);
    e.mv = false;

    if (e.st === 'walk') {
      const tgt = nearestFighter(e.x);   // يهاجم أقرب بطل: أنا أو المنافس
      e.tgt = tgt;
      if (tgt) {
        const sgn = e.x >= tgt.x ? 1 : -1;
        const tx = tgt.x + sgn * T.reach * .75;
        const ty = clamp(tgt.y + e.offY, Y0, Y1);
        const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy);
        e.face = tgt.x > e.x ? 1 : -1;
        if (e.sdT > 0) {
          e.sdT -= dt; e.y += e.sd * 70 * dt; e.x += Math.sign(dx || 1) * T.spd * .5 * dt;
          e.mv = true; e.ph += dt * 11;
        } else if (d > 6) {
          e.x += dx / d * T.spd * dt; e.y += dy / d * T.spd * .7 * dt;
          e.mv = true; e.ph += dt * 11;
        }
        if (e.cd <= 0 && Math.abs(tgt.x - e.x) < T.reach + 8 && Math.abs(tgt.y - e.y) < 14 && !tgt.dead && tgt.st !== 'd' && G.phase === 'play') {
          e.st = 'wind'; e.t = 0;
          e.ak = (e.ak || 0) + 1;
        }
      }
    } else if (e.st === 'wind') {
      if (e.tgt) e.face = e.tgt.x > e.x ? 1 : -1;
      if (e.t >= T.wind) { e.st = 'atk'; e.t = 0; e.did = false; }
    } else if (e.st === 'atk') {
      const t2 = e.tgt;
      if (!e.did && e.t < .16 && t2 && inReach(e.x, e.y, 0, e.face, T.reach, t2.x, t2.y, t2.z, 14)) { e.did = true; hurtFighter(t2, T.dmg, e.face, T.kd); }
      if (e.t >= .34) { e.st = 'walk'; e.t = 0; e.cd = rr(1, 1.8); e.did = false; }
    } else if (e.st === 'hurt') {
      if (e.t >= .32) { e.st = 'walk'; e.t = 0; e.cd = .4; }
    } else if (e.st === 'down') {
      if (e.t >= .85) { if (e.hp <= 0) { e.st = 'dead'; e.t = 0; } else { e.st = 'walk'; e.t = 0; e.cd = .6; } }
    } else if (e.st === 'dead') {
      if (e.t >= .6) e.remove = true;
    }

    for (const o of enemies) {
      if (o === e || o.st === 'dead') continue;
      const dx = e.x - o.x, dy = e.y - o.y;
      if (Math.abs(dx) < 22 && Math.abs(dy) < 9) { e.x += Math.sign(dx || 1) * 40 * dt; e.y += Math.sign(dy || 1) * 30 * dt; }
    }
    const bl = resolveObs(e);
    if (bl && !(e.sdT > 0)) {
      e.sd = e.y >= bl.y ? 1 : -1;
      if (e.y >= Y1 - 6) e.sd = -1;
      if (e.y <= Y0 + 6) e.sd = 1;
      e.sdT = .5;
    }
    e.x = clamp(e.x, 20, WORLD - 20); e.y = clamp(e.y, Y0, Y1);
    const dMe = me ? Math.abs(e.x - me.x) : 1e9, dAi = (G.vsAI && ai) ? Math.abs(e.x - ai.x) : 1e9;
    if (Math.min(dMe, dAi) > 1100) e.remove = true;
  }
  enemies = enemies.filter(e => !e.remove);
}

// ---------- التقاط الأغراض (للاعب وللمنافس) ----------
function pickupItems(f, isMe) {
  if (!f || f.dead) return;
  for (const it of items) {
    if (it.gone) continue;
    if (Math.abs(f.x - it.x) < 26 && Math.abs(f.y - it.y) < 20) {
      it.gone = true;
      f.lootT = .5; f.lk = (f.lk || 0) + 1;
      if (isMe) playSnd(SND.pick);
      if (it.kind === 'health') {
        f.hp = Math.min(100, f.hp + 30); floatText(f.x, f.y - 70, '+30', '#9dff8a');
        if (isMe) playSnd(SND.health_refill);
      } else if (it.kind === 'bomb') {
        f.bombs++; floatText(f.x, f.y - 70, 'BOMB!', '#ffb347');
      } else if (it.kind === 'ammo') {
        ['pistol', 'smg', 'shotgun'].forEach(w => { if (f.weapons[w] > 0) f.weapons[w] += Math.round(WEAPONS[w].maxAmmo * .3); });
        f.bombs++; floatText(f.x, f.y - 70, 'AMMO!', '#ffc233');
      } else if (WEAPONS[it.kind]) {
        const w = it.kind, Wp = WEAPONS[w];
        if (f.weapons[w] > 0) f.weapons[w] += Math.round(Wp.maxAmmo * .5);
        else f.weapons[w] = Wp.maxAmmo;
        f.weapon = w; floatText(f.x, f.y - 70, Wp.name.toUpperCase() + '!', '#ffc233');
      }
    }
  }
}

// ==========================================
// RIVAL AI: يتصرف كبطل حقيقي
// ==========================================
function aiPickTarget(a) {
  let best = null, bd = 140;
  for (const e of enemies) {
    if (e.st === 'dead' || e.st === 'down') continue;
    const d = Math.abs(e.x - a.x) + Math.abs(e.y - a.y) * 1.5;
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

function aiFindItem(a) {
  const noGun = !['pistol', 'smg', 'shotgun'].some(w => a.weapons[w] > 0);
  let best = null, bd = 1e9;
  for (const it of items) {
    if (it.gone) continue;
    let ok = false, range = 360;
    if (it.kind === 'health') { ok = a.hp < 60; range = 600; }
    else if (it.kind === 'bomb') ok = a.bombs < 3;
    else if (it.kind === 'ammo') ok = !noGun;
    else if (WEAPONS[it.kind]) ok = noGun || a.weapons[it.kind] < WEAPONS[it.kind].maxAmmo * .5;
    if (!ok) continue;
    const d = Math.abs(it.x - a.x) + Math.abs(it.y - a.y);
    if (d < range && d < bd) { bd = d; best = it; }
  }
  return best;
}

function aiFindCrate(a) {
  let best = null, bd = 170;
  for (const c of crates) {
    if (c.broken) continue;
    const d = Math.abs(c.x - a.x) + Math.abs(c.y - a.y);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

function aiChooseWeapon(a, adx) {
  let w = 'knife';
  if (adx >= 70) {
    if (adx < 170 && a.weapons.shotgun > 0) w = 'shotgun';
    else if (a.weapons.smg > 0) w = 'smg';
    else if (a.weapons.pistol > 0) w = 'pistol';
    else if (a.weapons.shotgun > 0) w = 'shotgun';
  }
  a.weapon = w;
}

function aiMove(a, tx, ty, dt, spd, stopDx) {
  const dx = tx - a.x, dy = ty - a.y;
  if (Math.abs(dx) > stopDx) { a.x += Math.sign(dx) * spd * dt; a.mv = true; }
  if (a.sdT > 0) { a.sdT -= dt; a.y += a.sd * 100 * dt; a.mv = true; }
  else if (Math.abs(dy) > 10) { a.y += Math.sign(dy) * 90 * dt; a.mv = true; }
  if (a.mv) a.ph += dt * 12;
}

function startAIMelee(a) {
  a.weapon = 'knife';
  a.st = 'a'; a.atkT = 0; a.ak++; a.atkType = Math.random() < .34 ? 1 : 0; a.ah = false;
  a.hitEnemies = new Set();
  playSnd(SND.swing);
}

function aiMeleeHits(a) {
  const A = a.atkType === 1 ? { dm: 20, reach: 58, kd: true } : { dm: 16, reach: 50, kd: false };
  if (me && !me.dead && me.st !== 'd' && a.hitMe !== a.ak && inReach(a.x, a.y, a.z, a.face, A.reach, me.x, me.y, me.z, 14)) {
    a.hitMe = a.ak; hurtMe(a.atkType === 1 ? 18 : 14, a.face, a.atkType === 1);
  }
  if (!a.hitEnemies) a.hitEnemies = new Set();
  for (const e of enemies) {
    if (e.st === 'dead' || a.hitEnemies.has(e)) continue;
    if (inReach(a.x, a.y, a.z, a.face, A.reach, e.x, e.y, 0, e.k === 'brute' ? 20 : 14)) {
      a.hitEnemies.add(e); hurtEnemy(e, A.dm, a.face, A.kd, true);
    }
  }
  for (const c of crates) {
    if (!c.broken && Math.abs(c.x - a.x) < A.reach && Math.abs(c.y - a.y) < 20 && (c.x - a.x) * a.face > -12) {
      c.hp -= A.dm; if (c.hp <= 0) breakCrate(c);
    }
  }
}

function aiThink(a, dt, D) {
  const dirC = a.side === 0 ? 1 : -1;
  const myOk = me && !me.dead;
  const en = aiPickTarget(a);
  const tgt = en || (myOk ? me : null);
  const dmx = myOk ? Math.abs(me.x - a.x) : 9999;
  const spd = 150 * D.spd;

  // 1) جمع الأغراض / كسر الصناديق إن كنت بعيدًا
  if (!en && dmx > 220) {
    const it = aiFindItem(a);
    let goal = null;
    if (it) goal = { x: it.x, y: it.y, stop: 4 };
    else if (dmx > 300) { const c = aiFindCrate(a); if (c) goal = { x: c.x, y: c.y, stop: 38, crate: true }; }
    if (goal) {
      const dx = goal.x - a.x;
      a.face = dx >= 0 ? 1 : -1;
      aiMove(a, goal.x, goal.y, dt, spd, goal.stop);
      if (goal.crate && Math.abs(dx) < 52 && Math.abs(goal.y - a.y) < 16 && a.cd <= 0) startAIMelee(a);
      return;
    }
  }

  // 2) لا يوجد هدف: يتقدم في الطريق
  if (!tgt) {
    a.face = dirC;
    aiMove(a, a.x + dirC * 100, a.y, dt, spd * .7, 0);
    return;
  }

  // 3) يلاحقني أنا (في أي مكان) أو يقاتل أقرب عدو
  const dx = tgt.x - a.x, dy = tgt.y - a.y, adx = Math.abs(dx), ady = Math.abs(dy);
  a.face = dx >= 0 ? 1 : -1;
  aiChooseWeapon(a, adx);
  const W = getWeapon(a);
  const hasGun = W.type === 'gun' && a.weapons[a.weapon] > 0;

  // قنبلة
  if (a.bombs > 0 && a.bombCd <= 0 && adx > 130 && adx < 230 && ady < 45) {
    throwBomb(a, false);
    a.bombCd = rr(3, 6) * D.cd;
    return;
  }

  let stop = 48;
  if (hasGun) stop = a.weapon === 'shotgun' ? 130 : 180;
  aiMove(a, tgt.x, tgt.y, dt, spd, stop);

  // إطلاق نار
  if (hasGun && ady < 14 && adx < W.reach && adx > 60 && a.shootCd <= 0) {
    fireGun(a, false);
    a.shootCd = W.cd * D.cd + rr(0, .25);
    return;
  }

  // قتال قريب وقفز
  if (!hasGun) {
    a.jumpT -= dt;
    if (!en && a.jumpT <= 0 && adx > 90 && adx < 200) {
      a.jumpT = rr(2.5, 5); a.vz = 360; a.st = 'j';
    } else if (a.cd <= 0 && adx < 66 && ady < 16) {
      startAIMelee(a);
    }
  }
}

function updateAI(dt) {
  const a = ai;
  if (!a) return;
  const D = DIFF[G.diff];
  a.inv = Math.max(0, a.inv - dt); a.stT += dt; a.cd -= dt; a.mv = false;
  a.gunCd = Math.max(0, a.gunCd - dt);
  a.shootCd = Math.max(0, a.shootCd - dt);
  a.bombCd = Math.max(0, a.bombCd - dt);
  if (a.throwT > 0) a.throwT -= dt;
  if (a.lootT > 0) a.lootT -= dt;

  a.x += a.vx * dt; a.vx -= a.vx * Math.min(1, dt * 7);
  if (a.z > 0 || a.vz > 0) {
    a.vz -= 1000 * dt; a.z += a.vz * dt;
    if (a.z <= 0) { a.z = 0; a.vz = 0; if (a.st === 'j') { a.st = 'i'; a.atkT = -1; a.ah = false; } }
  }

  if (a.st === 'd') {
    if (a.dead) {
      a.respT -= dt;
      if (a.respT <= 0 && a.lives > 0) { a.dead = false; a.hp = 100; a.st = 'i'; a.z = 0; a.vz = 0; a.inv = 2; }
    } else if (a.z <= 0 && a.stT > .9) { a.st = 'i'; a.inv = 1; }
  } else if (a.st === 'h') {
    if (a.stT > .32) a.st = 'i';
  } else if (a.st === 'a') {
    a.atkT += dt;
    const W = getWeapon(a);
    const dur = W.type === 'gun' ? .18 : (a.atkType === 1 ? .36 : .24);
    a.ah = (W.type === 'melee') && a.atkT >= .06 && a.atkT <= .22;
    if (a.ah && !a.dead && G.phase === 'play') aiMeleeHits(a);
    if (a.atkT >= dur) { a.st = 'i'; a.atkT = -1; a.ah = false; a.cd = rr(.55, 1.0) * D.cd; }
  } else if (a.st === 'j') {
    a.x += a.face * 90 * dt; a.ph += dt * 9;
  } else if (a.st === 'i' && G.phase === 'play') {
    aiThink(a, dt, D);
  }

  const bl = resolveObs(a);
  if (bl && !(a.sdT > 0)) {
    a.sd = a.y >= bl.y ? 1 : -1;
    if (a.y >= Y1 - 6) a.sd = -1;
    if (a.y <= Y0 + 6) a.sd = 1;
    a.sdT = .6;
  }
  a.x = clamp(a.x, 30, WORLD - 30); a.y = clamp(a.y, Y0, Y1);
  if (a.lives <= 0 && a.dead && G.phase === 'play') endRound(true);
}

function updateBullets(dt) {
  for (const b of bullets) {
    b.t += dt;
    if (b.t > b.life) { b.gone = true; continue; }
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    if (b.z < 0) { b.z = 0; b.vz = 0; }
    if (b.owner === 'me') {
      for (const e of enemies) {
        if (e.st === 'dead') continue;
        if (Math.abs(e.x - b.x) < 14 && Math.abs(e.y - b.y) < 16 && Math.abs((e.z || 0) - b.z) < 30) {
          hurtEnemy(e, b.dm, Math.sign(b.vx), false); G.dmgDealt += b.dm; b.gone = true; break;
        }
      }
      if (!b.gone && G.vsAI && ai && !ai.dead && ai.st !== 'd' && ai.inv <= 0) {
        if (Math.abs(ai.x - b.x) < 16 && Math.abs(ai.y - b.y) < 18 && Math.abs(ai.z - b.z) < 34) {
          hurtAI(b.dm, Math.sign(b.vx), false); G.dmgDealt += b.dm; b.gone = true;
        }
      }
    } else if (b.owner === 'ai') {
      for (const e of enemies) {
        if (e.st === 'dead') continue;
        if (Math.abs(e.x - b.x) < 14 && Math.abs(e.y - b.y) < 16 && Math.abs((e.z || 0) - b.z) < 30) {
          hurtEnemy(e, b.dm, Math.sign(b.vx), false, true); b.gone = true; break;
        }
      }
      if (!b.gone && me && !me.dead && me.inv <= 0 && me.st !== 'd') {
        if (Math.abs(me.x - b.x) < 16 && Math.abs(me.y - b.y) < 18 && Math.abs(me.z - b.z) < 34) {
          hurtMe(b.dm, Math.sign(b.vx), false); b.gone = true;
        }
      }
    }
    if (!b.gone) {
      for (const c of crates) {
        if (!c.broken && Math.abs(c.x - b.x) < 18 && Math.abs(c.y - b.y) < 20 && b.z < 28) { c.hp -= b.dm; if (c.hp <= 0) breakCrate(c); b.gone = true; break; }
      }
    }
    if (!b.gone) {
      for (const bar of barrels) {
        if (!bar.exploded && Math.abs(bar.x - b.x) < 16 && Math.abs(bar.y - b.y) < 18 && b.z < 32) { bar.hp -= b.dm; if (bar.hp <= 0) explodeBarrel(bar); b.gone = true; break; }
      }
    }
  }
  bullets = bullets.filter(b => !b.gone);
}

function updateBombs(dt) {
  for (const b of bombs) {
    b.t += dt;
    if (!b.settled) {
      b.x += b.vx * dt; b.z += b.vz * dt; b.vz -= 800 * dt;
      if (b.z <= 0) { b.z = 0; if (Math.abs(b.vz) < 80) { b.settled = true; b.vz = 0; b.vx *= .3; } else { b.vz = -b.vz * .45; } }
      b.vx *= .98;
    }
    if (b.t >= b.fuse) { b.gone = true; createExplosion(b.x, b.y, b.z, b.radius, b.dm, b.owner); }
  }
  bombs = bombs.filter(b => !b.gone);

  for (const m of mines) {
    m.t += dt; m.armT -= dt;
    if (m.armT <= 0) m.armed = true;
    if (m.armed && !m.gone) {
      let trig = false;
      if (me && !me.dead && m.owner !== 'me' && Math.abs(me.x - m.x) < MINE.trigger && Math.abs(me.y - m.y) < 20) trig = true;
      if (ai && !ai.dead && m.owner !== 'ai' && Math.abs(ai.x - m.x) < MINE.trigger && Math.abs(ai.y - m.y) < 20) trig = true;
      if (m.owner === 'me' || m.owner === 'ai') {
        for (const e of enemies) { if (e.st !== 'dead' && Math.abs(e.x - m.x) < MINE.trigger && Math.abs(e.y - m.y) < 20) { trig = true; break; } }
      }
      if (trig) { m.gone = true; createExplosion(m.x, m.y, 0, m.radius, m.dm, m.owner); }
    }
  }
  mines = mines.filter(m => !m.gone);
}

// ==========================================
// RENDER LOGIC & ANIMATIONS
// ==========================================

// رسم صورة ثابتة داخل الكانفاس مع الحفاظ على نسبتها وعرضها كاملة
function drawImg(g, img, x, y, w, h, face) {
  if (!img || !img.complete || img.naturalWidth === 0) return;
  const k = Math.min(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * k, dh = img.naturalHeight * k;
  g.save();
  if (face === -1) {
    g.translate(x, y); g.scale(-1, 1);
    g.drawImage(img, -dw / 2, -dh, dw, dh);
  } else {
    g.drawImage(img, x - dw / 2, y - dh, dw, dh);
  }
  g.restore();
}

// ==========================================
// DOM SPRITES: كل شخصية عنصر <img> حتى يتحرك الـ GIF فعلاً
// ==========================================
const sprAll = new Set(), sprUsed = new Set();

function dropSprite(o) {
  if (o._el) { o._el.remove(); o._el = null; }
  if (o._pend) { o._pend.remove(); o._pend = null; }
  o._key = null;
}

// key: يتغير عند تغيّر الحركة (أو عند كل ضربة/إصابة جديدة) فيبدأ الـ GIF من أول إطار
function placeSprite(o, key, shared, x, y, face, zi, vis, sizeFn) {
  if (!shared) return;
  sprUsed.add(o); sprAll.add(o);
  if (o._key !== key) {
    o._key = key;
    if (o._pend) o._pend.remove();
    const im = document.createElement('img');
    im.src = shared.src;
    im.draggable = false;
    im.style.cssText = 'position:absolute;left:0;top:0;opacity:0;pointer-events:none;max-width:none;user-select:none';
    layer.appendChild(im);
    o._pend = im;
  }
  if (o._pend && o._pend.complete && o._pend.naturalWidth > 0) {
    if (o._el) o._el.remove();
    o._el = o._pend; o._pend = null;
  }
  const el = o._el;
  if (!el) return;
  const d = sizeFn(el), w = d[0], h = d[1];
  el.style.opacity = vis ? '1' : '0';
  el.style.width = (w * CS) + 'px';
  el.style.height = (h * CS) + 'px';
  const ox = (d[3] || 0) * (face === -1 ? -1 : 1);
  el.style.transform = 'translate(' + ((x - cam - w / 2 + ox) * CS) + 'px,' + ((y + (d[2] || 0) - h) * CS) + 'px) scaleX(' + (face === -1 ? -1 : 1) + ')';
  el.style.zIndex = zi;
}

// يقيس الجزء الظاهر فعلاً من صورة الوقوف (بدون الفراغ الشفاف) فيتساوى حجم الشخصيات
function heroMetrics(base) {
  if (!base || !base.complete || !base.naturalWidth) return null;
  if (base._m) return base._m;
  let top = 0, bottom = base.naturalHeight - 1;
  try {
    const c = document.createElement('canvas');
    c.width = base.naturalWidth; c.height = base.naturalHeight;
    const x = c.getContext('2d');
    x.drawImage(base, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let t = -1, b = -1;
    for (let yy = 0; yy < c.height; yy++) {
      for (let xx = 0; xx < c.width; xx++) {
        if (d[(yy * c.width + xx) * 4 + 3] > 30) { if (t < 0) t = yy; b = yy; break; }
      }
    }
    if (t >= 0) { top = t; bottom = b; }
  } catch (e) {}
  base._m = { ch: bottom - top + 1, pad: base.naturalHeight - 1 - bottom };
  return base._m;
}

// حجم موحد: يقيس الجزء المرئي فقط من صورة الوقوف ويطبق نفس المقياس على كل الحركات
function fitSize(el, base, vis) {
  const m = heroMetrics(base);
  const ch = m ? m.ch : ((base && base.naturalHeight) || el.naturalHeight);
  const k = vis / ch;
  return [el.naturalWidth * k, el.naturalHeight * k, m ? m.pad * k : 0];
}
function heroSize(el, base, side) {
  return fitSize(el, base, HERO_VIS * (HERO_SCALE[side] || 1));
}
// ===== قياس كل صورة (GIF) على حدة: الجزء المرئي فعلاً (أعلى/أسفل/مركز أفقي) =====
const _measureCache = new Map();
function measureImg(img) {
  if (!img || !img.complete || !img.naturalWidth) return null;
  const key = img.src;
  if (_measureCache.has(key)) return _measureCache.get(key);
  let m = null;
  try {
    const w = img.naturalWidth, h = img.naturalHeight;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, w, h).data;
    let t = -1, b = -1, l = w, r = -1;
    for (let yy = 0; yy < h; yy++) {
      for (let xx = 0; xx < w; xx++) {
        if (d[(yy * w + xx) * 4 + 3] > 30) {
          if (t < 0) t = yy;
          b = yy;
          if (xx < l) l = xx;
          if (xx > r) r = xx;
        }
      }
    }
    if (t >= 0) m = { ch: b - t + 1, cw: r - l + 1, pad: h - 1 - b, cx: (l + r) / 2, nw: w, nh: h };
    } catch (e) {}
  if (m) _measureCache.set(key, m);   // لا نخزن الفشل حتى نعيد المحاولة
  return m;
}

// البطل المنافس: كل حركة تُقاس بنفسها وتُضبط ليكون ارتفاع الشخصية الظاهر ثابتاً دائماً
// lying = حركة الموت (الشخصية مستلقية) فتستعمل مقياس صورة الوقوف حتى لا تتضخم
function rivalSize(el, base, side, lying) {
  const vis = HERO_VIS * (HERO_SCALE[side] || 1);
  const nw = el.naturalWidth, nh = el.naturalHeight;
  const mb = measureImg(base);
  let k, m = null;
  if (lying) {
    // الشخصية مستلقية أفقياً: طولها الأفقي = ارتفاع البطل الواقف
    m = measureImg(el);
    if (m) k = vis / m.cw;
    else k = mb ? vis / mb.ch : vis / ((base && base.naturalHeight) || nh);
  } else {
    m = measureImg(el);
    if (m) k = vis / m.ch;
    else k = vis / (mb ? mb.ch : nh);
  }
  const padY = m ? m.pad * k : (mb ? mb.pad * k : 0);
  const offX = m ? -(m.cx - nw / 2) * k : 0;
  return [nw * k, nh * k, padY, offX];
}

// ارتفاع ثابت للأغراض الساكنة مع الحفاظ على النسبة الأصلية
function propSize(el, h) {
  const k = h / (el.naturalHeight || h);
  return [el.naturalWidth * k, h];
}

// يعيد [مفتاح الحركة، صورة الـ GIF]
function playerSpr(f) {
  const p = f.side === 0 ? IMG.player1 : IMG.player2;
  const hk = f.hk || 0;
  if (f.st === 'd') return f.dead ? ['death' + hk, p.death] : ['inj' + hk, p.injured];
  if (f.st === 'h') return ['inj' + hk, p.injured];
  if (f.throwT > 0) return ['bomb' + (f.tk || 0), p.bomb];
  if (f.atkT >= 0 && (f.st === 'a' || f.st === 'j')) {
    const W = getWeapon(f);
    if (W.type === 'gun') return ['shoot' + f.ak, p.shoot];
    return ['melee' + f.ak, f.atkType === 0 ? p.punch : p.sword];
  }
  if (G.phase === 'over' && G.result && !f.dead && ((f === me) === G.result.win)) return ['victory', p.victory];
  if (f.lootT > 0 && !f.mv) return ['loot' + (f.lk || 0), p.loot];
  if (f.mv || f.st === 'j') return ['walk', p.walk];
  return ['idle', p.idle];
}

function enemySpr(e) {
  const p = IMG.enemies[e.k];
  if (e.st === 'dead' || (e.st === 'down' && e.hp <= 0)) return ['death', p.death];
  if (e.st === 'down' || e.st === 'hurt') return ['inj' + (e.hk || 0), p.injured];
  if (e.st === 'wind' || e.st === 'atk') return ['punch' + (e.ak || 0), p.punch];
  if (e.mv) return ['walk', p.walk];
  return ['idle', p.idle];
}

function shadow(g, x, y, rx, ry) {
  g.fillStyle = 'rgba(18,6,28,.4)';
  g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 6.3); g.fill();
}

function drawChar(g, f, t) {
  const blink = f.inv > 0 && f.st !== 'd' && Math.floor(t * 14) % 2;
  const deadBlink = f.dead && f.st === 'd' && Math.floor(t * 10) % 2;
  const vis = !(blink || deadBlink);
  if (vis) shadow(g, f.x - cam, f.y + 1, 22, 6);
  const s = playerSpr(f);
  const base = (f.side === 0 ? IMG.player1 : IMG.player2).idle;
  const p = f.side === 0 ? IMG.player1 : IMG.player2;
  if (f === ai) {
    // المنافس: حجم موحد لكل حركاته
    const lying = s[1] === p.death;
    placeSprite(f, s[0], s[1], f.x, f.y - f.z, f.face, Math.round(f.y), vis, el => rivalSize(el, base, f.side, lying));
  } else {
    placeSprite(f, s[0], s[1], f.x, f.y - f.z, f.face, Math.round(f.y), vis, el => heroSize(el, base, f.side));
  }
}

function render(t) {
  const g = ctx;
  g.setTransform(SC, 0, 0, SC, 0, 0);
  g.clearRect(0, 0, VW, H);
  const sx = shake > 0 ? (Math.random() - .5) * shake : 0;
  const sy = shake > 0 ? (Math.random() - .5) * shake : 0;
  layer.style.transform = 'translate(' + (sx * CS) + 'px,' + (sy * CS) + 'px)';
  bgDiv.style.backgroundPosition = (-cam * CS) + 'px 0';
  sprUsed.clear();

  g.save();
  g.translate(sx, sy);

  // Ground overlay
  g.fillStyle = 'rgba(20, 10, 25, 0.4)';
  g.fillRect(0, Y0 - 15, VW, H - Y0 + 15);
  g.fillStyle = 'rgba(0, 0, 0, 0.3)';
  g.fillRect(0, Y1 + 10, VW, H - Y1 - 10);

  // Items (صور ثابتة)
  for (const it of items) {
    const ix = it.x - cam;
    let img = IMG.item_ammo;
    if (it.kind === 'health') img = IMG.item_health;
    else if (it.kind === 'bomb') img = IMG.item_bomb;
    else if (it.kind === 'pistol') img = IMG.item_pistol;
    else if (it.kind === 'shotgun') img = IMG.item_shotgun;
    else if (it.kind === 'smg') img = IMG.item_smg;
    else if (it.kind === 'knife') img = IMG.item_knife;
    shadow(g, ix, it.y + 1, 13, 4);
    drawImg(g, img, ix, it.y - 5 + Math.sin(t * 5) * 3, 28, 28, 1);
  }

  // Crates (GIF)
  for (const c of crates) {
    if (c.broken || c.x < cam - 80 || c.x > cam + VW + 80) continue;
    shadow(g, c.x - cam, c.y + 2, c.w * .6, 5);
    placeSprite(c, 'c', IMG.crate, c.x, c.y, 1, Math.round(c.y), true, el => propSize(el, PROP_VIS.crate));
  }

  // Barrels (GIF)
  for (const b of barrels) {
    if (b.exploded || b.x < cam - 80 || b.x > cam + VW + 80) continue;
    shadow(g, b.x - cam, b.y + 2, 16, 5);
    placeSprite(b, 'b', IMG.barrel, b.x, b.y, 1, Math.round(b.y), true, el => propSize(el, PROP_VIS.barrel));
  }

  // Mines
  for (const m of mines) {
    shadow(g, m.x - cam, m.y + 1, 14, 4);
    drawImg(g, IMG.item_bomb, m.x - cam, m.y, 20, 20, 1);
  }

  // Enemies (GIF)
  for (const e of enemies) {
    if (e.st === 'dead' && e.t > 0.6) continue;
    shadow(g, e.x - cam, e.y + 1, e.k === 'brute' ? 24 : 20, 6);
    const s = enemySpr(e);
    const base = IMG.enemies[e.k].idle;
    const vis = ENEMY_VIS[e.k] || 80;
    placeSprite(e, s[0], s[1], e.x, e.y - e.z, e.face, Math.round(e.y), true, el => fitSize(el, base, vis));
  }

  // Fighters (GIF)
  if (G.vsAI && ai) drawChar(g, ai, t);
  if (me) drawChar(g, me, t);

  // Bullets
  for (const b of bullets) {
    g.fillStyle = b.color;
    g.fillRect(b.x - cam - 3, b.y - b.z - 1, 6, 2);
  }

  // Bombs
  for (const b of bombs) drawImg(g, IMG.item_bomb, b.x - cam, b.y - b.z - 5, 24, 24, 1);

  // Explosions (GIF)
  for (const e of explosions) {
    placeSprite(e, 'x', IMG.explosion, e.x, e.y - e.z + e.maxR * 0.5, 1, 2000, true, el => {
      const k = (e.maxR * 2) / (el.naturalWidth || 1);
      return [el.naturalWidth * k, el.naturalHeight * k];
    });
  }

  // Particles
  for (const p of parts) {
    g.globalAlpha = clamp(p.l * 3, 0, 1);
    g.fillStyle = p.c;
    g.fillRect(p.x - cam - 1.5, p.y - p.z - 1.5, 3, 3);
  }
  g.globalAlpha = 1;

  // Floaters
  g.textAlign = 'center'; g.font = '800 16px Tajawal,sans-serif';
  for (const f of floaters) {
    g.globalAlpha = 1 - f.t;
    g.fillStyle = '#000'; g.fillText(f.text, f.x - cam + 1, f.y - f.t * 30 + 1);
    g.fillStyle = f.c; g.fillText(f.text, f.x - cam, f.y - f.t * 30);
  }
  g.globalAlpha = 1;

  g.restore();

  // إزالة عناصر الصور التي لم تعد مستخدمة
  for (const o of sprAll) {
    if (!sprUsed.has(o)) { dropSprite(o); sprAll.delete(o); }
  }
}

// ==========================================
// FLOW & LOOP
// ==========================================
function toast(text, ms) {
  const t = $('#toast');
  t.textContent = text; t.classList.add('on');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('on'), ms || 2600);
}
function banner(text, pop) {
  const b = $('#banner');
  if (!text) { b.hidden = true; return; }
  b.hidden = false; b.textContent = text;
  b.classList.remove('pop');
  if (pop) { void b.offsetWidth; b.classList.add('pop'); }
}

function newRound() {
  me = mkFighter(G.side);
  ai = null;
  enemies = []; items = []; parts = []; floaters = []; bullets = []; bombs = []; mines = []; crates = []; barrels = []; explosions = [];
  waveIdx = 0; aiWaveIdx = 0; G.time = 0; G.kills = 0; G.dmgDealt = 0; G.result = null; lastCount = -1;
  if (G.vsAI) ai = mkFighter(1 - G.side);
  spawnWorldObjects();
  cam = clamp(me.x - VW * (G.side === 0 ? .38 : .62), 0, WORLD - VW);
}

function startCountdown() {
  newRound();
  G.phase = 'count'; G.countT = 3.3;
  $('#hud').hidden = false;
  const l = $('#hp0 .nm'), r = $('#hp1 .nm');
  l.textContent = 'REX'; r.textContent = 'ZARA';
  $('#hp0 .you').hidden = G.side !== 0;
  $('#hp1 .you').hidden = G.side !== 1;
}

function endRound(win) {
  if (G.phase !== 'play') return;
  G.phase = 'over'; G.overT = 0; G.result = { win: win };
  playSnd(win ? SND.win : SND.lose);
  banner(win ? 'VICTORY!' : 'DEFEAT', true);
}

function showResult() {
  const r = G.result, w = r.win;
  $('#rbox').classList.toggle('lose', !w);
  $('#rTitle').textContent = w ? 'YOU WIN!' : 'YOU LOSE!';
  $('#rSub').textContent = w ? 'You eliminated your opponent.' : 'You ran out of lives.';
  $('#sTime').textContent = Math.round(G.time);
  $('#sKills').textContent = G.kills;
  $('#sDmg').textContent = G.dmgDealt;
  banner('');
  $('#result').hidden = false;
}

function playAgain() {
  $('#result').hidden = true;
  startCountdown();
}

function initGame() {
    startCountdown();
    if(!muted) {
        SND.bgm.volume = 0.5;
        SND.bgm.play().catch(()=>{});
    }
}

function stepGame(dt) {
  if (G.phase === 'count') {
    G.countT -= dt;
    const n = Math.ceil(G.countT - .3);
    if (n !== lastCount) {
      lastCount = n;
      if (n > 0) { banner(String(n), true); }
      else { banner('GO!', true); G.phase = 'play'; setTimeout(() => { if (G.phase === 'play') banner(''); }, 800); }
    }
    updateMe(dt);
    if (G.vsAI && ai) updateAI(dt);
  } else if (G.phase === 'play') {
    G.time += dt;
    updateMe(dt);
    const W = getWeapon(me);
    if (W.type === 'melee') applyMeleeHits(me, true);
    if (G.vsAI && ai) updateAI(dt);
    updateEnemies(dt);
    updateBullets(dt);
    updateBombs(dt);

    while (waveIdx < WAVES.length && prog(me) >= WAVES[waveIdx].d) { spawnWave(WAVES[waveIdx], me); waveIdx++; }
    while (G.vsAI && ai && !ai.dead && aiWaveIdx < WAVES.length && prog(ai) >= WAVES[aiWaveIdx].d) { spawnWave(WAVES[aiWaveIdx], ai); aiWaveIdx++; }

    for (const it of items) it.t += dt;
    pickupItems(me, true);
    if (G.vsAI && ai) pickupItems(ai, false);
    items = items.filter(i => !i.gone);

    if (me.lives <= 0 && me.dead) endRound(false);
    else if (G.vsAI && ai && ai.lives <= 0 && ai.dead) endRound(true);

  } else if (G.phase === 'over') {
    G.overT += dt;
    if (G.overT > 1.5 && $('#result').hidden) showResult();
    if (me) me.inv = Math.max(0, me.inv - dt);
  }

  for (const p of parts) { p.l -= dt; p.x += p.vx * dt; p.y += (p.vy || 0) * dt; p.z += p.vz * dt; p.vz -= 520 * dt; }
  parts = parts.filter(p => p.l > 0);
  for (const e of explosions) e.t += dt;
  explosions = explosions.filter(e => e.t < e.dur);
  for (const f of floaters) f.t += dt;
  floaters = floaters.filter(f => f.t < 1);
  shake = Math.max(0, shake - dt * 20);

  if (me) {
    const tgt = me.x - VW * (me.side === 0 ? .38 : .62) + me.face * 20;
    cam += (tgt - cam) * Math.min(1, dt * 6);
    cam = clamp(cam, 0, WORLD - VW);
  }
}

function updateHUD() {
  for (const s of [0, 1]) {
    const f = s === G.side ? me : ai;
    if (!f) continue;
    const b = $('#hp' + s + ' .bar i');
    if (b) b.style.transform = 'scaleX(' + clamp(f.hp / 100, 0, 1) + ')';
    
    const p = $('#hp' + s + ' .pips');
    if (p && p.childElementCount !== 3) {
        let h = '';
        for(let i=0; i<3; i++) h += '<span class="pip' + (i < f.lives ? '' : ' off') + '"></span>';
        p.innerHTML = h;
    } else if (p) {
        Array.from(p.children).forEach((el, i) => el.classList.toggle('off', i >= f.lives));
    }
    
    const wEl = $('#w' + s);
    if (wEl) {
        const order = ['knife', 'pistol', 'smg', 'shotgun'];
        let html = '';
        for (const w of order) {
          const W = WEAPONS[w];
          const am = f.weapons[w];
          if (w !== 'knife' && am <= 0) continue;
          let icon = IMG.item_knife.src;
          if (w === 'pistol') icon = IMG.item_pistol.src;
          else if (w === 'shotgun') icon = IMG.item_shotgun.src;
          else if (w === 'smg') icon = IMG.item_smg.src;
          
          html += '<div class="wslot' + (f.weapon === w ? ' active' : '') + '"><img src="' + icon + '"><span class="am">' + (am === Infinity ? '∞' : am) + '</span></div>';
        }
        if (f.bombs > 0) html += '<div class="wslot"><img src="' + IMG.item_bomb.src + '"><span class="am">' + f.bombs + '</span></div>';
        if (wEl.innerHTML !== html) wEl.innerHTML = html;
    }
  }
}

// ==========================================
// INPUT HANDLING
// ==========================================
const KEYS = { ArrowLeft: 'l', a: 'l', A: 'l', ArrowRight: 'r', d: 'r', D: 'r', ArrowUp: 'u', w: 'u', W: 'u', ArrowDown: 'd', s: 'd', S: 'd' };
addEventListener('keydown', e => {
  if (e.target && e.target.tagName === 'INPUT') return;
  const k = KEYS[e.key];
  if (k) { inp[k] = true; e.preventDefault(); return; }
  if (e.repeat) return;
  if (e.key === 'j' || e.key === 'J' || e.key === 'z' || e.key === 'Z') { inp.atk = true; e.preventDefault(); }
  else if (e.key === 'k' || e.key === 'K' || e.key === 'x' || e.key === 'X' || e.key === ' ') { inp.jmp = true; e.preventDefault(); }
  else if (e.key === 'q' || e.key === 'Q') { inp.sw = true; e.preventDefault(); }
  else if (e.key === 'g' || e.key === 'G') { inp.bomb = true; e.preventDefault(); }
  else if (e.key === 'e' || e.key === 'E') { inp.mine = true; e.preventDefault(); }
});
addEventListener('keyup', e => { const k = KEYS[e.key]; if (k) inp[k] = false; });
addEventListener('blur', () => { inp.l = inp.r = inp.u = inp.d = false; });

const pad = $('#pad'), knob = $('#knob');
let padId = null;
function padSet(e) {
  const r = pad.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  let dx = (e.clientX - cx) / (r.width / 2), dy = (e.clientY - cy) / (r.height / 2);
  const m = Math.hypot(dx, dy);
  if (m > 1) { dx /= m; dy /= m; }
  padX = Math.abs(dx) > .28 ? Math.sign(dx) * Math.min(1, Math.abs(dx) * 1.15) : 0;
  padY = Math.abs(dy) > .28 ? Math.sign(dy) * Math.min(1, Math.abs(dy) * 1.15) : 0;
  knob.style.transform = 'translate(' + (dx * 55) + '%,' + (dy * 55) + '%)';
}
function padEnd(e) {
  if (e.pointerId === padId) { padId = null; padX = 0; padY = 0; knob.style.transform = ''; }
}
pad.addEventListener('pointerdown', e => { padId = e.pointerId; try { pad.setPointerCapture(e.pointerId); } catch(x) {} padSet(e); e.preventDefault(); });
pad.addEventListener('pointermove', e => { if (e.pointerId === padId) padSet(e); });
pad.addEventListener('pointerup', padEnd);
pad.addEventListener('pointercancel', padEnd);

function bindBtn(el, key) {
  el.addEventListener('pointerdown', e => { inp[key] = true; el.classList.add('down'); e.preventDefault(); });
  const up = () => el.classList.remove('down');
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('pointerleave', up);
}
bindBtn($('#bAtk'), 'atk'); bindBtn($('#bJump'), 'jmp'); bindBtn($('#bSwitch'), 'sw'); bindBtn($('#bGren'), 'bomb'); bindBtn($('#bMine'), 'mine');

function checkTouch() {
  const t = ('ontouchstart' in window) || navigator.maxTouchPoints > 0 || matchMedia('(pointer:coarse)').matches || innerWidth <= 820;
  document.body.classList.toggle('touch', !!t);
}
function resize() {
  checkTouch();
  const st = $('#stage'), r = st.getBoundingClientRect();
  const aw = Math.max(200, r.width), ah = Math.max(120, r.height);
  const ratio = Math.min(2.2, Math.max(1.35, aw / ah));
  VW = Math.round(H * ratio);
  const w = Math.min(aw, ah * ratio), h = w / ratio;
  frame.style.width = w + 'px'; frame.style.height = h + 'px'; frame.style.aspectRatio = 'auto';
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.max(2, Math.round(w * dpr)); cv.height = Math.max(2, Math.round(h * dpr));
  SC = cv.width / VW;
  CS = w / VW;
}
addEventListener('resize', resize);
resize();

$('#rAgain').addEventListener('click', playAgain);
$('#rMenu').addEventListener('click', () => { window.location.href = 'home.html'; });
$('#mute').addEventListener('click', () => {
  muted = !muted;
  $('#mute').textContent = muted ? 'SOUND: OFF' : 'SOUND: ON';
  SND.bgm.muted = muted;
});

let last = performance.now(), T0 = last;
function loop(now) {
  const dt = Math.min(.05, (now - last) / 1000);
  last = now; G.t = (now - T0) / 1000;
  try {
    stepGame(dt);
    render(G.t);
    if (G.phase !== 'menu') updateHUD();
  } catch (err) { console.error(err); }
  requestAnimationFrame(loop);
}

setTimeout(() => {
    initGame();
    requestAnimationFrame(loop);
}, 500);

})();