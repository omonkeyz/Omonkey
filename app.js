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

// --- web layout ---
function layout() {
  const stage = $('.web-stage');
  const rect = stage.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;
  state.cx = w / 2;
  state.cy = h / 2;

  const svg = $('#web-svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
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
    // distribute on one or two rings depending on count
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
      const r = baseR * (ring === 0 ? 0.78 : 1.15);
      // offset alternating rings so they don't align
      const offset = ring === 1 ? Math.PI / ringCount : -Math.PI / 2;
      const angle = (idxInRing / ringCount) * Math.PI * 2 + offset;
      const x = state.cx + Math.cos(angle) * r;
      const y = state.cy + Math.sin(angle) * r;
      positions.push({ x, y, angle, r });
    }
  }
  state.positions = positions;

  // draw threads
  const threads = $('#threads');
  threads.innerHTML = '';
  positions.forEach((p, i) => {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', state.cx);
    line.setAttribute('y1', state.cy);
    line.setAttribute('x2', p.x);
    line.setAttribute('y2', p.y);
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

    const initials = (g.name || '?').trim().split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase();
    const thumb = document.createElement('div');
    thumb.className = 'game-thumb' + (g.image ? '' : ' placeholder');
    if (g.image) thumb.style.backgroundImage = `url("${escapeAttr(g.image)}")`;
    else thumb.textContent = initials || '?';

    const label = document.createElement('div');
    label.className = 'game-label';
    label.textContent = g.name || 'untitled';

    el.appendChild(thumb);
    el.appendChild(label);
    el.addEventListener('mouseenter', () => highlightThread(i, true));
    el.addEventListener('mouseleave', () => highlightThread(i, false));
    el.addEventListener('click', () => openModal(g));
    nodesLayer.appendChild(el);
  });

  $('#empty').hidden = state.games.length > 0;
  $('#counter').textContent = state.games.length
    ? `${state.games.length} active game${state.games.length === 1 ? '' : 's'}`
    : '';
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
    console.error('load games failed', err);
    state.games = [];
  }
  layout();
}

function escapeAttr(s) {
  return String(s).replace(/"/g, '&quot;');
}

window.addEventListener('resize', layout);
loadGames();
