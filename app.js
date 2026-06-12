// omonkey landing — spiderweb of active games
const $ = (s, r = document) => r.querySelector(s);

const state = {
  games: [],
  positions: [],
  cx: 0,
  cy: 0,
};

// --- starfield ---
(function starfield() {
  const c = $('#starfield');
  const ctx = c.getContext('2d');
  let stars = [];
  const seed = () => {
    const n = Math.max(40, Math.floor((window.innerWidth * window.innerHeight) / 18000));
    stars = Array.from({ length: n }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      r: Math.random() * 1.2 + 0.2,
      a: Math.random() * 0.6 + 0.15,
      v: Math.random() * 0.6 + 0.2,
    }));
  };
  const resize = () => {
    const dpr = window.devicePixelRatio || 1;
    c.width = window.innerWidth * dpr;
    c.height = window.innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed();
  };
  resize();
  window.addEventListener('resize', resize);
  let t = 0;
  (function tick() {
    t += 0.005;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (const s of stars) {
      const a = s.a * (0.6 + 0.4 * Math.sin(t * s.v + s.x));
      ctx.fillStyle = `rgba(245, 200, 130, ${a})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    requestAnimationFrame(tick);
  })();
})();

const ORB_RADIUS = 56;        // visual radius of the centre orb (px)
const NODE_RADIUS = 42;       // visual radius of a game thumb (px)

// --- web layout ---
function layout() {
  const stage = $('#stage');
  const rect = stage.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;
  state.cx = w / 2;
  state.cy = h / 2;

  $('#web-bg').setAttribute('viewBox', `0 0 ${w} ${h}`);
  $('#web-threads').setAttribute('viewBox', `0 0 ${w} ${h}`);
  $('#centerHalo').setAttribute('cx', state.cx);
  $('#centerHalo').setAttribute('cy', state.cy);

  // soft rings
  const rings = $('#rings');
  rings.innerHTML = '';
  for (let i = 1; i <= 3; i++) {
    const r = Math.min(w, h) * (0.18 + i * 0.10);
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('cx', state.cx);
    c.setAttribute('cy', state.cy);
    c.setAttribute('r', r);
    rings.appendChild(c);
  }

  const n = state.games.length;
  const positions = [];
  if (n > 0) {
    const baseR = Math.min(w, h) * 0.34;
    const useTwoRings = n > 8;
    for (let i = 0; i < n; i++) {
      let ring, idxInRing, ringCount;
      if (!useTwoRings) {
        ring = 0; idxInRing = i; ringCount = n;
      } else {
        const inner = Math.floor(n / 3);
        if (i < inner) { ring = 0; idxInRing = i; ringCount = inner; }
        else { ring = 1; idxInRing = i - inner; ringCount = n - inner; }
      }
      const baseRing = baseR * (ring === 0 ? 0.78 : 1.18);
      const offset = ring === 1 ? Math.PI / ringCount : -Math.PI / 2;
      // deterministic jitter per game so positions stay stable across renders
      const seed = (state.games[i]?.id || String(i)).split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
      const jitterA = ((seed % 1000) / 1000 - 0.5) * (Math.PI / Math.max(ringCount, 3)) * 0.6;
      const jitterR = (((seed >>> 10) % 1000) / 1000 - 0.5) * baseR * 0.22;
      const angle = (idxInRing / ringCount) * Math.PI * 2 + offset + jitterA;
      const r = baseRing + jitterR;
      const x = state.cx + Math.cos(angle) * r;
      const y = state.cy + Math.sin(angle) * r;
      positions.push({ x, y, angle, r });
    }
  }
  state.positions = positions;

  // draw threads — start just outside the orb, end just before the node
  const threads = $('#threads');
  threads.innerHTML = '';
  positions.forEach((p, i) => {
    const dx = p.x - state.cx, dy = p.y - state.cy;
    const dist = Math.hypot(dx, dy) || 1;
    const ux = dx / dist, uy = dy / dist;
    const nodeRadius = thumbSizeFor(state.games[i]?.playing) / 2 + 4;
    const x1 = state.cx + ux * ORB_RADIUS;
    const y1 = state.cy + uy * ORB_RADIUS;
    const x2 = p.x - ux * nodeRadius;
    const y2 = p.y - uy * nodeRadius;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x1);
    line.setAttribute('y1', y1);
    line.setAttribute('x2', x2);
    line.setAttribute('y2', y2);
    line.dataset.idx = i;
    threads.appendChild(line);
  });

  // place nodes
  const nodesLayer = $('#nodes');
  nodesLayer.innerHTML = '';
  state.games.forEach((g, i) => {
    const p = positions[i];
    const el = document.createElement('div');
    el.className = 'game-node';
    el.style.left = p.x + 'px';
    el.style.top = p.y + 'px';

    const playing = Number(g.playing) || 0;
    const size = thumbSizeFor(playing);

    const initials = (g.name || '?').trim().split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase();
    const thumb = document.createElement('div');
    thumb.className = 'game-thumb' + (g.image ? '' : ' placeholder');
    thumb.style.setProperty('--thumb-size', size + 'px');
    if (g.image) thumb.style.backgroundImage = `url("${escapeAttr(g.image)}")`;
    else thumb.textContent = initials || '?';

    const label = document.createElement('div');
    label.className = 'game-label';
    label.textContent = g.name || 'untitled';

    const stat = document.createElement('div');
    stat.className = 'game-stat' + (playing === 0 ? ' zero' : '');
    stat.textContent = `${fmtCount(playing)} playing`;

    el.appendChild(thumb);
    el.appendChild(label);
    el.appendChild(stat);
    el.addEventListener('mouseenter', () => highlightThread(i, true));
    el.addEventListener('mouseleave', () => highlightThread(i, false));
    el.addEventListener('click', (e) => {
      if (Pan.justDragged) { e.preventDefault(); return; }
      openModal(g);
    });
    nodesLayer.appendChild(el);
  });

  $('#empty').hidden = state.games.length > 0;
  $('#counter').textContent = `${state.games.length} active game${state.games.length === 1 ? '' : 's'}`;
}

function highlightThread(idx, on) {
  const threads = $('#threads').children;
  for (const line of threads) {
    if (+line.dataset.idx === idx) line.classList.toggle('dim', false);
    else line.classList.toggle('dim', on);
  }
}

// --- modal ---
function openModal(g) {
  $('#m-title').textContent = g.name || 'untitled';
  $('#m-desc').textContent = g.description || '';
  const media = $('#m-media');
  media.classList.remove('placeholder');
  media.innerHTML = '';
  if (g.video) {
    const v = document.createElement('video');
    v.src = g.video;
    v.controls = true;
    v.autoplay = false;
    v.playsInline = true;
    if (g.image) v.poster = g.image;
    media.appendChild(v);
  } else if (g.image) {
    const img = document.createElement('img');
    img.src = g.image;
    img.alt = g.name || '';
    media.appendChild(img);
  } else {
    media.classList.add('placeholder');
    media.textContent = 'no preview';
  }
  const play = $('#m-play');
  if (g.url) {
    play.href = g.url;
    play.style.display = '';
  } else {
    play.style.display = 'none';
  }
  $('#m-stats').textContent = '';
  $('#modal').hidden = false;
  document.body.style.overflow = 'hidden';
}
function closeModal() {
  $('#modal').hidden = true;
  const media = $('#m-media');
  const v = media.querySelector('video');
  if (v) { v.pause(); v.removeAttribute('src'); v.load(); }
  media.innerHTML = '';
  document.body.style.overflow = '';
}
document.addEventListener('click', (e) => {
  if (e.target.matches('[data-close]')) closeModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

// --- data ---
const ROBLOX_URL_RE = /(?:roblox\.com\/games\/|placeId=)(\d+)/i;

async function enrichOne(game) {
  if (!game.url) return;
  const m = String(game.url).match(ROBLOX_URL_RE);
  if (!m) return;
  try {
    const res = await fetch('/api/roblox?url=' + encodeURIComponent(game.url));
    if (!res.ok) return;
    const data = await res.json();
    game.playing = data.playing ?? 0;
    game.visits = data.visits ?? 0;
    if (!game.image && data.iconUrl) game.image = data.iconUrl;
  } catch {}
}

async function loadGames() {
  try {
    const res = await fetch('/api/games', { cache: 'no-store' });
    if (!res.ok) throw new Error(`http ${res.status}`);
    const data = await res.json();
    const all = Array.isArray(data.games) ? data.games : [];
    state.games = all
      .filter(g => g.active !== false)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  } catch (err) {
    console.error('[omk] load games failed', err);
    state.games = [];
  }
  layout();
  // enrich with live roblox stats in parallel, then re-render
  if (state.games.length) {
    await Promise.all(state.games.map(enrichOne));
    layout();
  }
}

function thumbSizeFor(playing) {
  const p = Math.max(0, Number(playing) || 0);
  // log scale: 0→72, 10→84, 100→96, 1k→108, 10k→120, 100k→132
  const size = 72 + Math.log10(p + 1) * 12;
  return Math.round(Math.max(60, Math.min(136, size)));
}

function fmtCount(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

function escapeAttr(s) {
  return String(s).replace(/"/g, '&quot;');
}

// --- drag to pan + zoom ---
const Pan = {
  x: 0, y: 0,
  scale: 1,
  dragging: false,
  startX: 0, startY: 0, origX: 0, origY: 0,
  moved: 0,
  justDragged: false,
  init() {
    const stage = $('#stage');
    const wrap = $('#panWrap');
    const apply = () => { wrap.style.transform = `translate(${this.x}px, ${this.y}px) scale(${this.scale})`; };
    const setScale = (s) => {
      this.scale = Math.max(0.4, Math.min(2.5, s));
      apply();
      $('#recenter').hidden = (this.x === 0 && this.y === 0 && Math.abs(this.scale - 1) < 0.001);
    };
    this._apply = apply;
    this._setScale = setScale;
    stage.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.modal') || e.target.closest('.topbar') || e.target.closest('.bottombar') || e.target.closest('#recenter') || e.target.closest('.zoom-controls') || e.target.closest('.game-node') || e.target.closest('.center-node')) return;
      this.dragging = true;
      this.moved = 0;
      this.startX = e.clientX; this.startY = e.clientY;
      this.origX = this.x; this.origY = this.y;
      stage.setPointerCapture(e.pointerId);
      stage.classList.add('dragging');
    });
    stage.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.startX;
      const dy = e.clientY - this.startY;
      this.moved = Math.max(this.moved, Math.hypot(dx, dy));
      this.x = this.origX + dx;
      this.y = this.origY + dy;
      apply();
    });
    const end = (e) => {
      if (!this.dragging) return;
      this.dragging = false;
      stage.classList.remove('dragging');
      if (e && stage.hasPointerCapture(e.pointerId)) {
        try { stage.releasePointerCapture(e.pointerId); } catch {}
      }
      if (this.moved > 5) {
        this.justDragged = true;
        setTimeout(() => { this.justDragged = false; }, 120);
        $('#recenter').hidden = false;
      }
    };
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', end);
    $('#recenter').addEventListener('click', () => {
      this.x = 0; this.y = 0; this.scale = 1; apply();
      $('#recenter').hidden = true;
    });
    $('#zoomIn').addEventListener('click', () => setScale(this.scale * 1.2));
    $('#zoomOut').addEventListener('click', () => setScale(this.scale / 1.2));
    $('#zoomReset').addEventListener('click', () => {
      this.x = 0; this.y = 0; this.scale = 1; apply();
      $('#recenter').hidden = true;
    });
    stage.addEventListener('wheel', (e) => {
      if (e.target.closest('.modal')) return;
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1 / 1.1 : 1.1;
      setScale(this.scale * factor);
    }, { passive: false });
  }
};

window.addEventListener('resize', layout);
Pan.init();
loadGames();
