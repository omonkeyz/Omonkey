// admin panel — manage games + people (cookie-session, URL-based media)
const $ = (s, r = document) => r.querySelector(s);

const Toast = {
  el: null,
  init() { this.el = $('#toast'); },
  show(msg, kind = 'ok') {
    this.el.textContent = msg;
    this.el.className = 'toast show ' + kind;
    clearTimeout(this._t);
    this._t = setTimeout(() => { this.el.className = 'toast'; }, 2200);
  }
};

const Auth = {
  async check() {
    const res = await fetch('/api/auth', { cache: 'no-store' });
    return res.ok && (await res.json()).ok === true;
  },
  async login(password) {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      let msg = 'wrong password';
      try { msg = (await res.json()).error || msg; } catch {}
      throw new Error(msg);
    }
  },
  async logout() {
    await fetch('/api/auth', { method: 'DELETE' });
  }
};

const Games = {
  async list() {
    const res = await fetch('/api/games', { cache: 'no-store' });
    if (!res.ok) throw new Error('failed to load');
    const d = await res.json();
    return Array.isArray(d.games) ? d.games : [];
  },
  async save(game) {
    const res = await fetch('/api/games', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(game),
    });
    if (!res.ok) {
      let msg = `save failed (${res.status})`;
      try { msg = (await res.json()).error || msg; } catch {}
      throw new Error(msg);
    }
    return res.json();
  },
  async remove(id) {
    const res = await fetch('/api/games?id=' + encodeURIComponent(id), { method: 'DELETE' });
    if (!res.ok) throw new Error('delete failed');
  }
};

const YT_RE = /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{6,})/;

const Roblox = {
  PLACE_ID_RE: /(?:roblox\.com\/games\/|placeId=)(\d+)/i,
  GROUP_ID_RE: /(?:roblox\.com\/(?:groups|communities)\/)(\d+)/i,
  parse(url) {
    if (!url) return null;
    const m = String(url).match(this.PLACE_ID_RE);
    return m ? m[1] : null;
  },
  parseGroup(url) {
    if (!url) return null;
    const m = String(url).match(this.GROUP_ID_RE);
    return m ? m[1] : null;
  },
  async lookup(url) {
    const res = await fetch('/api/roblox?url=' + encodeURIComponent(url));
    if (!res.ok) {
      let msg = `roblox lookup failed (${res.status})`;
      try { msg = (await res.json()).error || msg; } catch {}
      throw new Error(msg);
    }
    return res.json();
  },
  async lookupGroup(url) {
    const res = await fetch('/api/roblox-group?url=' + encodeURIComponent(url));
    if (!res.ok) {
      let msg = `group lookup failed (${res.status})`;
      try { msg = (await res.json()).error || msg; } catch {}
      throw new Error(msg);
    }
    return res.json();
  }
};

function renderImagePreview(url) {
  const box = $('#imagePreview');
  box.innerHTML = '';
  if (!url) return;
  const img = document.createElement('img');
  img.src = url;
  img.style.cssText = 'max-width:120px;border-radius:8px;border:1px solid rgba(255,255,255,0.08)';
  box.appendChild(img);
}

function renderVideoPreview(url) {
  const box = $('#videoPreview');
  box.innerHTML = '';
  if (!url) return;
  const ytId = (String(url).match(YT_RE) || [])[1];
  if (ytId) {
    const f = document.createElement('iframe');
    f.src = `https://www.youtube.com/embed/${ytId}`;
    f.width = 280; f.height = 158;
    f.style.cssText = 'border:0;border-radius:8px;';
    f.allow = 'accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
    f.allowFullscreen = true;
    box.appendChild(f);
  } else {
    const v = document.createElement('video');
    v.src = url; v.controls = true;
    v.style.cssText = 'max-width:280px;border-radius:8px';
    box.appendChild(v);
  }
}

const Form = {
  el: null,
  _lastLookup: '',
  init() {
    this.el = $('#gameForm');
    this.el.addEventListener('submit', (e) => { e.preventDefault(); this.save(); });
    $('#resetBtn').addEventListener('click', () => this.reset());

    // type select toggles role field + url hint + parent picker
    const typeSel = $('#type');
    const applyType = () => {
      const t = typeSel.value;
      $('#roleField').style.display = t === 'person' ? '' : 'none';
      $('#parentField').style.display = (t === 'person' || t === 'group') ? '' : 'none';
      const hints = {
        game: 'roblox game URL',
        person: 'roblox profile, twitter, website…',
        group: 'https://www.roblox.com/communities/…',
      };
      $('#urlLabelHint').textContent = hints[t] || hints.game;
    };
    typeSel.addEventListener('change', applyType);
    applyType();

    // live preview of pasted URLs
    $('#image').addEventListener('input', (e) => renderImagePreview(e.target.value.trim()));
    $('#video').addEventListener('input', (e) => renderVideoPreview(e.target.value.trim()));

    const urlField = $('#url');
    const fillIfRoblox = async (force) => {
      const t = $('#type').value;
      const val = urlField.value.trim();
      if (!val || val === this._lastLookup) return;
      const hint = $('#urlHint');
      if (t === 'game') {
        if (!Roblox.parse(val)) return;
        this._lastLookup = val;
        hint.textContent = 'fetching from roblox…';
        hint.className = 'hint';
        try {
          const info = await Roblox.lookup(val);
          if (force || !$('#name').value.trim()) $('#name').value = info.name || '';
          if (force || !$('#description').value.trim()) $('#description').value = info.description || '';
          if ((force || !$('#image').value.trim()) && info.iconUrl) {
            $('#image').value = info.iconUrl;
            renderImagePreview(info.iconUrl);
          }
          hint.textContent = `✓ ${info.name} · ${info.playing.toLocaleString()} playing · ${info.visits.toLocaleString()} visits`;
          hint.className = 'hint ok';
        } catch (err) {
          hint.textContent = err.message;
          hint.className = 'hint err';
        }
      } else if (t === 'group') {
        if (!Roblox.parseGroup(val)) return;
        this._lastLookup = val;
        hint.textContent = 'fetching group from roblox…';
        hint.className = 'hint';
        try {
          const info = await Roblox.lookupGroup(val);
          if (force || !$('#name').value.trim()) $('#name').value = info.name || '';
          if (force || !$('#description').value.trim()) $('#description').value = info.description || '';
          if ((force || !$('#image').value.trim()) && info.iconUrl) {
            $('#image').value = info.iconUrl;
            renderImagePreview(info.iconUrl);
          }
          this._lastGroupInfo = info; // stash so save() can persist member count + verified
          const v = info.hasVerifiedBadge ? ' ✓verified' : '';
          hint.textContent = `✓ ${info.name} · ${info.memberCount.toLocaleString()} members${v}`;
          hint.className = 'hint ok';
        } catch (err) {
          hint.textContent = err.message;
          hint.className = 'hint err';
        }
      }
    };
    urlField.addEventListener('blur', () => fillIfRoblox(false));
    urlField.addEventListener('paste', () => setTimeout(() => fillIfRoblox(false), 50));
    this._fillIfRoblox = fillIfRoblox;
  },
  populateParents(games, selfId) {
    const sel = $('#parentId');
    const current = sel.value;
    sel.innerHTML = '<option value="">— none (attach to omonkey centre) —</option>';
    const gameNodes = games
      .filter(x => (!x.type || x.type === 'game') && x.id && x.id !== selfId)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    for (const x of gameNodes) {
      const opt = document.createElement('option');
      opt.value = x.id;
      opt.textContent = x.name || '(untitled)';
      sel.appendChild(opt);
    }
    // restore prior selection if still valid
    if (current && [...sel.options].some(o => o.value === current)) sel.value = current;
  },
  fill(g) {
    $('#gameId').value = g?.id || '';
    const t = g?.type === 'person' ? 'person' : (g?.type === 'group' ? 'group' : 'game');
    $('#type').value = t;
    $('#name').value = g?.name || '';
    $('#url').value = g?.url || '';
    $('#role').value = g?.role || '';
    $('#description').value = g?.description || '';
    $('#image').value = g?.image || '';
    $('#video').value = g?.video || '';
    $('#order').value = g?.order ?? 0;
    $('#active').checked = g?.active !== false;
    renderImagePreview(g?.image || '');
    renderVideoPreview(g?.video || '');
    // refresh dropdown from latest list (excluding self)
    this.populateParents(GameList.cache || [], g?.id || '');
    $('#parentId').value = g?.parentId || '';
    $('#type').dispatchEvent(new Event('change'));
    const label = t === 'person' ? 'person' : (t === 'group' ? 'group' : 'game');
    $('#formTitle').textContent = g?.id ? `edit ${label}` : 'add node';
    $('#saveBtn').textContent = g?.id ? 'save changes' : 'add';
    this._lastLookup = '';
    this._lastGroupInfo = null;
    if (g?.id) window.scrollTo({ top: 0, behavior: 'smooth' });
  },
  reset() { this.fill(null); },
  async save() {
    $('#saveBtn').disabled = true;
    try {
      const rawType = $('#type').value;
      const type = rawType === 'person' ? 'person' : (rawType === 'group' ? 'group' : 'game');
      const urlVal = $('#url').value.trim();
      // auto-fetch metadata if not already done
      if (urlVal && this._lastLookup !== urlVal) {
        const needsFill = !$('#name').value.trim() || !$('#description').value.trim() || !$('#image').value.trim();
        const isLookupable =
          (type === 'game' && Roblox.parse(urlVal)) ||
          (type === 'group' && Roblox.parseGroup(urlVal));
        if (isLookupable && (needsFill || type === 'group')) {
          Toast.show('fetching from roblox…', 'ok');
          try { await this._fillIfRoblox(false); } catch {}
        }
      }
      const payload = {
        id: $('#gameId').value || undefined,
        type,
        name: $('#name').value.trim(),
        url: urlVal,
        role: $('#role').value.trim(),
        parentId: (type === 'person' || type === 'group') ? ($('#parentId').value || '') : '',
        description: $('#description').value.trim(),
        image: $('#image').value.trim(),
        video: $('#video').value.trim(),
        order: parseInt($('#order').value, 10) || 0,
        active: $('#active').checked,
      };
      if (type === 'group' && this._lastGroupInfo && this._lastLookup === urlVal) {
        payload.memberCount = this._lastGroupInfo.memberCount || 0;
        payload.verified = !!this._lastGroupInfo.hasVerifiedBadge;
      }
      if (!payload.name) { Toast.show('name is required', 'err'); return; }
      await Games.save(payload);
      Toast.show(payload.id ? 'updated' : 'added', 'ok');
      this.reset();
      await GameList.render();
    } catch (err) {
      Toast.show(err.message, 'err');
    } finally {
      $('#saveBtn').disabled = false;
    }
  }
};

const GameList = {
  cache: [],
  async render() {
    const root = $('#games');
    root.innerHTML = '<div style="color:#5b5d6a;font-size:13px;padding:10px;">loading…</div>';
    try {
      this.cache = await Games.list();
    } catch (err) {
      root.innerHTML = `<div style="color:#ffb0b0;font-size:13px;padding:10px;">${escapeHtml(err.message)}</div>`;
      return;
    }
    // refresh form's parent dropdown with latest games
    Form.populateParents(this.cache, $('#gameId').value || '');
    if (!this.cache.length) {
      root.innerHTML = '<div style="color:#5b5d6a;font-size:13px;padding:10px;">nothing yet — add a game or person above.</div>';
      return;
    }
    const sorted = [...this.cache].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    root.innerHTML = '';
    for (const g of sorted) {
      const row = document.createElement('div');
      row.className = 'game-row' + (g.active === false ? ' inactive' : '');
      const thumb = document.createElement('div');
      thumb.className = 'thumb';
      if (g.image) thumb.style.backgroundImage = `url("${escapeAttr(g.image)}")`;
      const meta = document.createElement('div');
      meta.className = 'meta';
      const typeBadge = g.type === 'person'
        ? ' <span class="badge" style="background:rgba(120,170,255,0.12);color:#9cc0ff;">person</span>'
        : g.type === 'group'
          ? ' <span class="badge" style="background:rgba(160,130,255,0.14);color:#c5b3ff;">group</span>'
          : ' <span class="badge">game</span>';
      const hiddenBadge = g.active === false
        ? ' <span class="badge" style="background:rgba(255,255,255,0.06);color:#9295a3;">hidden</span>'
        : '';
      const parentName = g.parentId
        ? (this.cache.find(x => x.id === g.parentId)?.name || '')
        : '';
      const linkedBadge = parentName
        ? ` <span class="badge" style="background:rgba(160,130,255,0.12);color:#c5b3ff;">→ ${escapeHtml(parentName)}</span>`
        : '';
      meta.innerHTML = `
        <div class="name">${escapeHtml(g.name)}${typeBadge}${hiddenBadge}${linkedBadge}</div>
        <div class="sub">${escapeHtml(g.role || g.url || '—')}</div>
      `;
      const actions = document.createElement('div');
      actions.className = 'actions';
      const edit = document.createElement('button');
      edit.textContent = 'edit';
      edit.addEventListener('click', () => Form.fill(g));
      const del = document.createElement('button');
      del.className = 'del';
      del.textContent = 'delete';
      del.addEventListener('click', async () => {
        if (!confirm(`delete "${g.name}"?`)) return;
        try { await Games.remove(g.id); Toast.show('deleted', 'ok'); await this.render(); }
        catch (err) { Toast.show(err.message, 'err'); }
      });
      actions.appendChild(edit); actions.appendChild(del);
      row.appendChild(thumb); row.appendChild(meta); row.appendChild(actions);
      root.appendChild(row);
    }
  }
};

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeAttr(s) { return String(s).replace(/"/g, '&quot;'); }

// boot
(async function () {
  Toast.init();
  const authed = await Auth.check();
  if (!authed) {
    $('#login').hidden = false;
    $('#loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await Auth.login($('#pw').value);
        location.reload();
      } catch (err) { Toast.show(err.message, 'err'); }
    });
    return;
  }
  $('#panel').hidden = false;
  Form.init();
  $('#logout').addEventListener('click', async () => { await Auth.logout(); location.reload(); });
  await GameList.render();
})();
