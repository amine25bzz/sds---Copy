(function(){
'use strict';

const G = {
  side: 0, diff: 1, ready: false, vsAI: true,
  code: '', joined: '', hadHuman: false, humanT: 0, leftT: 0,
  rvGc: null
};

let roomApi = null, room = null, lastSent = 0, lastPack = '', lastForce = 0;

const $ = (s, r) => (r || document).querySelector(s);
const CODECH = 'abcdefghjkmnpqrstuvwxyz23456789';

function genCode() {
  let s = '';
  for (let i = 0; i < 5; i++) s += CODECH[Math.floor(Math.random() * CODECH.length)];
  return s;
}

function packPresence() {
  return { v: 1, h: G.side, ph: 'm', rdy: G.ready ? 1 : 0, gc: 0 };
}

function sendPresence(force) {
  if (!room) return;
  const now = performance.now();
  const p = packPresence();
  const pack = JSON.stringify(p);
  if (pack === lastPack && now - lastForce < 500) return;
  if (!force && pack !== lastPack && now - lastSent < 40) return;
  lastSent = now; lastPack = pack; lastForce = now;
  try { const r = room.presence(p); if (r && r.catch) r.catch(() => {}); } catch(e) {}
}

function getRival() {
  if (!room) return null;
  let best = null;
  try {
    for (const p of room.peers()) {
      if (p.isMe || p.kind !== 'viewer') continue;
      const pr = p.presence;
      if (!pr || pr.v !== 1) continue;
      if (!best) best = p;
    }
  } catch(e) {}
  return best;
}

async function enterRoom(code) {
  if (!roomApi) return false;
  try { if (room) await room.leave(); } catch(e) {}
  room = null;
  lastPack = ''; G.rvGc = null; G.hadHuman = false;
  try { room = await roomApi.join('r' + code); } catch(e) { room = null; return false; }
  G.joined = (code === G.code) ? '' : code;
  sendPresence(true);
  updateMenuUI();
  return true;
}

async function setupNet() {
  let c = '';
  try { c = localStorage.getItem('treasureRoad.code') || ''; } catch(e) {}
  if (!/^[a-z0-9]{5}$/.test(c)) {
    c = genCode();
    try { localStorage.setItem('treasureRoad.code', c); } catch(e) {}
  }
  G.code = c;
  $('#myCode').textContent = c.toUpperCase();
  try {
    if (window.claude && window.claude.use) roomApi = await window.claude.use('room');
  } catch(e) { roomApi = null; }
  if (roomApi) await enterRoom(c);
  updateMenuUI();
}

function updateMenuUI() {
  const rp = getRival(), human = !!rp;
  const takenSide = rp ? (rp.presence.h === 1 ? 1 : 0) : -1;
  document.querySelectorAll('#cards .card').forEach(c => {
    const s = +c.dataset.side;
    c.classList.toggle('sel', s === G.side);
    c.classList.toggle('taken', human && s === takenSide && s !== G.side);
  });
  $('#aiBox').style.display = human ? 'none' : '';
  const st = $('#netStatus');
  const btn = $('#startBtn');
  $('#homeBtn').hidden = !G.joined;
  
  if (!roomApi) {
    st.textContent = 'Playing with a friend is not available here.';
    btn.textContent = 'PLAY'; btn.disabled = false;
    return;
  }
  if (!room) {
    st.textContent = 'Could not connect to room.';
    btn.textContent = 'PLAY'; btn.disabled = false;
    return;
  }
  if (human) {
    const theirReady = rp.presence.rdy === 1;
    st.innerHTML = '<span class="ok">Friend connected</span> in room <b>' + (G.joined || G.code).toUpperCase() + '</b>' + (theirReady ? ' · and ready' : '.');
    btn.textContent = G.ready ? 'WAITING FOR FRIEND...' : 'READY';
    btn.disabled = false;
  } else {
    st.innerHTML = G.joined
      ? ('You are in room <b>' + G.joined.toUpperCase() + '</b>, no one else is here yet.')
      : 'Your room is open. Share the code with your friend.';
    btn.textContent = 'PLAY'; btn.disabled = false;
  }
}

function pickSide(s) {
  const rp = getRival();
  if (rp && rp.presence.h === s && s !== G.side) {
    alert('This hero is taken by your friend.');
    return;
  }
  G.side = s;
  sendPresence(true);
  updateMenuUI();
}

document.querySelectorAll('#cards .card').forEach(c => {
  c.addEventListener('click', () => { pickSide(+c.dataset.side); });
});
document.querySelectorAll('#diffs .chip').forEach(c => {
  c.addEventListener('click', () => {
    G.diff = +c.dataset.d;
    document.querySelectorAll('#diffs .chip').forEach(x => x.classList.toggle('on', x === c));
  });
});

$('#startBtn').addEventListener('click', () => {
  const rp = getRival();
  if (!rp || !room) {
    G.vsAI = true;
  } else {
    G.ready = !G.ready;
    sendPresence(true);
    updateMenuUI();
    if (G.ready && (rp.presence.rdy === 1)) {
       G.vsAI = false;
    } else {
       return; 
    }
  }
  localStorage.setItem('gameConfig', JSON.stringify({ side: G.side, diff: G.diff, vsAI: G.vsAI }));
  window.location.href = 'game.html';
});

$('#copyCode').addEventListener('click', () => {
  const code = G.code.toUpperCase();
  navigator.clipboard.writeText(code).then(() => alert('Code copied!')).catch(() => alert('Failed to copy'));
});

$('#joinBtn').addEventListener('click', async () => {
  const code = $('#joinIn').value.trim().toLowerCase();
  if (!/^[a-z0-9]{5}$/.test(code)) { alert('Code must be 5 characters'); return; }
  if (code === G.code) { alert('This is your own code.'); return; }
  if (!roomApi) { alert('Not available here'); return; }
  const ok = await enterRoom(code);
  if(ok) alert('Joined room!');
});

$('#homeBtn').addEventListener('click', async () => {
  await enterRoom(G.code);
  alert('Returned to your room');
});

setupNet();

setInterval(() => {
  if (room) {
    sendPresence(false);
    const rp = getRival();
    if (rp && G.ready && (rp.presence.rdy === 1)) {
      localStorage.setItem('gameConfig', JSON.stringify({ side: G.side, diff: G.diff, vsAI: false }));
      window.location.href = 'game.html';
    }
    updateMenuUI();
  }
}, 500);

})();