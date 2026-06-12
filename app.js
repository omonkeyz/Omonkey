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
    // 1. measure each node so big thumbs claim bigger angular slots
    const PAD = 38; // pixel gap budget around each node
    const sizes = state.games.map(g => {
      if (g.type === 'person') return 78;
      if (g.type === 'group') return thumbSizeFor(g.memberCount);
      return thumbSizeFor(g.playing);
    });
    const arcs = sizes.map(s => s + PAD * 2);
    const totalArc = arcs.reduce((a, s) => a + s, 0);

    // 2. pick a radius that (a) gives nodes breathing room, (b) fits in viewport
    const visualR = Math.min(w, h) * 0.32;
    const fitR = totalArc / (2 * Math.PI);
    const maxR = Math.min(w, h) * 0.46;
    let useTwoRings = false;
    let ringR = Math.max(visualR, fitR);
    if (ringR > maxR) { useTwoRings = true; ringR = maxR; }

    if (!useTwoRings) {
      // single ring, angular slot proportional to node size
      let cursor = -Math.PI / 2 - Math.PI; // start at top (rotate so first slot's centre is at 12 o'clock)
      // shift so first node sits centred at top
      cursor = -Math.PI / 2 - (arcs[0] / totalArc) * Math.PI;
      for (let i = 0; i < n; i++) {
        const slot = (arcs[i] / totalArc) * Math.PI * 2;
        const baseAngle = cursor + slot / 2;
        const seed = (state.games[i]?.id || String(i)).split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
        const jitterA = ((seed % 1000) / 1000 - 0.5) * slot * 0.18;
        const jitterR = (((seed >>> 10) % 1000) / 1000 - 0.5) * 28;
        const angle = baseAngle + jitterA;
        const r = ringR + jitterR;
        const x = state.cx + Math.cos(angle) * r;
        const y = state.cy + Math.sin(angle) * r;
        positions.push({ x, y, angle, r });
        cursor += slot;
      }
    } else {
      // two rings: alternate biggest -> outer, next -> inner, etc.
      const byIdx = sizes.map((s, i) => ({ s, i })).sort((a, b) => b.s - a.s);
      const inner = [], outer = [];
      byIdx.forEach((it, k) => (k % 2 === 0 ? outer : inner).push(it.i));
      const ringFor = new Array(n);
      const idxInRing = new Array(n);
      const ringArcs = [0, 0];
      [inner, outer].forEach((ringList, ringNum) => {
        ringList.forEach((origIdx, k) => {
          ringFor[origIdx] = ringNum;
          idxInRing[origIdx] = k;
          ringArcs[ringNum] += arcs[origIdx];
        });
      });
      const innerR = Math.min(w, h) * 0.26;
      const outerR = Math.min(w, h) * 0.44;
      const ringRadii = [innerR, outerR];
      const cursors = [0, 0];
      // align first slot at top
      cursors[0] = -Math.PI / 2 - (arcs[inner[0]] / ringArcs[0]) * Math.PI;
      cursors[1] = -Math.PI / 2 - (arcs[outer[0]] / ringArcs[1]) * Math.PI + Math.PI / Math.max(outer.length, 1);
      for (let i = 0; i < n; i++) {
        const ringNum = ringFor[i];
        const ringList = ringNum === 0 ? inner : outer;
        const ringTotal = ringArcs[ringNum];
        const slot = (arcs[i] / ringTotal) * Math.PI * 2;
        const baseAngle = cursors[ringNum] + slot / 2;
        const seed = (state.games[i]?.id || String(i)).split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
        const jitterA = ((seed % 1000) / 1000 - 0.5) * slot * 0.15;
        const jitterR = (((seed >>> 10) % 1000) / 1000 - 0.5) * 24;
        const angle = baseAngle + jitterA;
        const r = ringRadii[ringNum] + jitterR;
        const x = state.cx + Math.cos(angle) * r;
        const y = state.cy + Math.sin(angle) * r;
        positions.push({ x, y, angle, r });
        cursors[ringNum] += slot;
      }
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
    const g = state.games[i];
    const nodeSize = g?.type === 'person'
      ? 78
      : g?.type === 'group'
        ? thumbSizeFor(g?.memberCount)
        : thumbSizeFor(g?.playing);
    const nodeRadius = nodeSize / 2 + 4;
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
    const isPerson = g.type === 'person';
    const isGroup = g.type === 'group';
    const el = document.createElement('div');
    el.className = 'game-node'
      + (isPerson ? ' person-node' : '')
      + (isGroup ? ' group-node' : '');
    el.style.left = p.x + 'px';
    el.style.top = p.y + 'px';

    const playing = Number(g.playing) || 0;
    const memberCount = Number(g.memberCount) || 0;
    const size = isPerson
      ? 78
      : isGroup
        ? thumbSizeFor(memberCount)
        : thumbSizeFor(playing);

    const initials = (g.name || '?').trim().split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase();
    const thumb = document.createElement('div');
    thumb.className = 'game-thumb'
      + (g.image ? '' : ' placeholder')
      + (isPerson ? ' person-thumb' : '')
      + (isGroup ? ' group-thumb' : '');
    thumb.style.setProperty('--thumb-size', size + 'px');
    if (g.image) thumb.style.backgroundImage = `url("${escapeAttr(g.image)}")`;
    else thumb.textContent = initials || '?';

    if (isGroup && g.verified) {
      thumb.appendChild(verifiedBadgeEl());
    }

    const label = document.createElement('div');
    label.className = 'game-label';
    label.textContent = g.name || 'untitled';

    el.appendChild(thumb);
    el.appendChild(label);
    if (isPerson) {
      if (g.role) {
        const role = document.createElement('div');
        role.className = 'game-role';
        role.textContent = g.role;
        el.appendChild(role);
      }
    } else if (isGroup) {
      const stat = document.createElement('div');
      stat.className = 'game-stat group-stat' + (memberCount === 0 ? ' zero' : '');
      stat.textContent = `${fmtCount(memberCount)} member${memberCount === 1 ? '' : 's'}`;
      el.appendChild(stat);
    } else {
      const stat = document.createElement('div');
      stat.className = 'game-stat' + (playing === 0 ? ' zero' : '');
      stat.textContent = `${fmtCount(playing)} playing`;
      el.appendChild(stat);
    }
    el.addEventListener('mouseenter', () => highlightThread(i, true));
    el.addEventListener('mouseleave', () => highlightThread(i, false));
    el.addEventListener('click', (e) => {
      if (Pan.justDragged) { e.preventDefault(); return; }
      openModal(g);
    });
    nodesLayer.appendChild(el);
  });

  $('#empty').hidden = state.games.length > 0;
  const games = state.games.filter(g => !g.type || g.type === 'game').length;
  const people = state.games.filter(g => g.type === 'person').length;
  const groups = state.games.filter(g => g.type === 'group').length;
  const parts = [];
  if (games) parts.push(`${games} active game${games === 1 ? '' : 's'}`);
  if (people) parts.push(`${people} ${people === 1 ? 'person' : 'people'}`);
  if (groups) parts.push(`${groups} group${groups === 1 ? '' : 's'}`);
  $('#counter').textContent = parts.join(' · ');
}

function highlightThread(idx, on) {
  const threads = $('#threads').children;
  for (const line of threads) {
    if (+line.dataset.idx === idx) line.classList.toggle('dim', false);
    else line.classList.toggle('dim', on);
  }
}

// --- modal ---
const YT_RE = /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{6,})/;

function openModal(g) {
  const title = $('#m-title');
  title.textContent = g.name || 'untitled';
  if (g.type === 'group' && g.verified) {
    const v = document.createElement('span');
    v.className = 'label-verified';
    v.style.marginLeft = '8px';
    v.style.width = '18px';
    v.style.height = '18px';
    v.title = 'verified';
    v.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="width:12px;height:12px;"><path d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91c-1.31.67-2.2 1.91-2.2 3.34s.89 2.67 2.2 3.34c-.46 1.39-.21 2.9.8 3.91s2.52 1.26 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.68-.88 3.34-2.19c1.39.45 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34zm-11.71 4.2L6.8 12.46l1.41-1.42 2.26 2.26 4.8-5.23 1.47 1.36-6.2 6.77z"/></svg>';
    title.appendChild(v);
  }
  const desc = $('#m-desc');
  desc.textContent = g.role && g.type === 'person'
    ? `${g.role}${g.description ? '\n\n' + g.description : ''}`
    : (g.description || '');
  const media = $('#m-media');
  media.classList.remove('placeholder');
  media.innerHTML = '';
  const ytId = g.video ? (String(g.video).match(YT_RE) || [])[1] : null;
  if (ytId) {
    const f = document.createElement('iframe');
    f.src = `https://www.youtube.com/embed/${ytId}?rel=0`;
    f.allow = 'accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
    f.allowFullscreen = true;
    f.setAttribute('frameborder', '0');
    media.appendChild(f);
  } else if (g.video) {
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
    play.textContent = g.type === 'person'
      ? 'visit'
      : g.type === 'group' ? 'join group' : 'play';
    play.style.display = '';
  } else {
    play.style.display = 'none';
  }
  let statText = '';
  if (g.type === 'game' && (g.playing != null || g.visits)) {
    const bits = [];
    if (g.playing != null) bits.push(`${fmtCount(g.playing)} playing`);
    if (g.visits) bits.push(`${fmtCount(g.visits)} visits`);
    statText = bits.join(' · ');
  } else if (g.type === 'group' && g.memberCount) {
    statText = `${fmtCount(g.memberCount)} member${g.memberCount === 1 ? '' : 's'}`;
  }
  $('#m-stats').textContent = statText;
  $('#modal').hidden = false;
  document.body.style.overflow = 'hidden';
}
function closeModal() {
  $('#modal').hidden = true;
  const media = $('#m-media');
  const v = media.querySelector('video');
  if (v) { v.pause(); v.removeAttribute('src'); v.load(); }
  const f = media.querySelector('iframe');
  if (f) { f.src = 'about:blank'; }
  media.innerHTML = '';
  document.body.style.overflow = '';
}

function openContact() {
  $('#contactModal').hidden = false;
  document.body.style.overflow = 'hidden';
}
function closeContact() {
  $('#contactModal').hidden = true;
  document.body.style.overflow = '';
}
document.addEventListener('click', (e) => {
  if (e.target.matches('[data-close]')) closeModal();
  if (e.target.matches('[data-close-contact]')) closeContact();
  if (e.target.closest('[data-open-contact]')) { e.preventDefault(); openContact(); }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeModal(); closeContact(); }
});

// --- data ---
const ROBLOX_URL_RE = /(?:roblox\.com\/games\/|placeId=)(\d+)/i;

const ROBLOX_GROUP_URL_RE = /(?:roblox\.com\/(?:groups|communities)\/)(\d+)/i;

async function enrichOne(game) {
  if (game.type === 'person') return;
  if (!game.url) return;
  if (game.type === 'group') {
    if (!ROBLOX_GROUP_URL_RE.test(game.url)) return;
    try {
      const res = await fetch('/api/roblox-group?url=' + encodeURIComponent(game.url));
      if (!res.ok) return;
      const data = await res.json();
      game.memberCount = data.memberCount ?? game.memberCount ?? 0;
      game.verified = !!data.hasVerifiedBadge;
      if (!game.image && data.iconUrl) game.image = data.iconUrl;
    } catch {}
    return;
  }
  if (!ROBLOX_URL_RE.test(game.url)) return;
  try {
    const res = await fetch('/api/roblox?url=' + encodeURIComponent(game.url));
    if (!res.ok) return;
    const data = await res.json();
    game.playing = data.playing ?? 0;
    game.visits = data.visits ?? 0;
    if (!game.image && data.iconUrl) game.image = data.iconUrl;
  } catch {}
}

function verifiedBadgeEl() {
  const wrap = document.createElement('div');
  wrap.className = 'verified-badge';
  wrap.title = 'verified';
  wrap.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91c-1.31.67-2.2 1.91-2.2 3.34s.89 2.67 2.2 3.34c-.46 1.39-.21 2.9.8 3.91s2.52 1.26 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.68-.88 3.34-2.19c1.39.45 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34zm-11.71 4.2L6.8 12.46l1.41-1.42 2.26 2.26 4.8-5.23 1.47 1.36-6.2 6.77z"/></svg>';
  return wrap;
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
