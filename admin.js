// admin panel — manage games (cookie-session, vercel blob direct upload)
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

let _blobClient = null;
async function getBlobClient() {
  if (_blobClient) return _blobClient;
  _blobClient = await import('https://esm.sh/@vercel/blob@0.27.0/client');
  return _blobClient;
}

const Upload = {
  async file(file, kind, onProgress) {
    if (!file) throw new Error('no file');
    const maxBytes = kind === 'video' ? 500 * 1024 * 1024 : 25 * 1024 * 1024;
    if (file.size > maxBytes) {
      throw new Error(`file too large (max ${kind === 'video' ? '500mb' : '25mb'})`);
    }
    const { upload } = await getBlobClient();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80) || (kind + '.bin');
    const blob = await upload(safeName, file, {
      access: 'public',
      handleUploadUrl: '/api/upload',
      clientPayload: JSON.stringify({ kind }),
      multipart: file.size > 25 * 1024 * 1024, // chunked for >25MB
      onUploadProgress: ({ percentage }) => {
        if (onProgress) onProgress(Math.round(percentage));
      },
    });
    return blob.url;
  }
};

const Roblox = {
  PLACE_ID_RE: /(?:roblox\.com\/games\/|placeId=)(\d+)/i,
  parse(url) {
    if (!url) return null;
    const m = String(url).match(this.PLACE_ID_RE);
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
  }
};

const Form = {
  el: null,
  _lastLookup: '',
  init() {
    this.el = $('#gameForm');
    this.el.addEventListener('submit', (e) => { e.preventDefault(); this.save(); });
    $('#resetBtn').addEventListener('click', () => this.reset());

    this.bindFilePicker('Image', 'image');
    this.bindFilePicker('Video', 'video');

    const urlField = $('#url');
    const fillIfRoblox = async (force) => {
      const val = urlField.value.trim();
      if (!val || val === this._lastLookup) return;
      if (!Roblox.parse(val)) return;
      this._lastLookup = val;
      const hint = $('#urlHint');
      hint.textContent = 'fetching from roblox…';
      hint.className = 'hint';
      try {
        const info = await Roblox.lookup(val);
        // only fill empty fields (don't overwrite user edits) unless force=true
        if (force || !$('#name').value.trim()) $('#name').value = info.name || '';
        if (force || !$('#description').value.trim()) $('#description').value = info.description || '';
        if ((force || !$('#image').value.trim()) && info.iconUrl) {
          $('#image').value = info.iconUrl;
          $('#imagePreview').innerHTML = `<img src="${info.iconUrl}" style="max-width:120px;border-radius:8px;border:1px solid rgba(255,255,255,0.08)">`;
        }
        hint.textContent = `✓ ${info.name} · ${info.playing.toLocaleString()} playing · ${info.visits.toLocaleString()} visits`;
        hint.className = 'hint ok';
      } catch (err) {
        hint.textContent = err.message;
        hint.className = 'hint err';
      }
    };
    urlField.addEventListener('blur', () => fillIfRoblox(false));
    urlField.addEventListener('paste', () => setTimeout(() => fillIfRoblox(false), 50));
    this._fillIfRoblox = fillIfRoblox;
  },
  bindFilePicker(Label, kind) {
    const btn = $(`#pick${Label}`);
    const input = $(`#${kind}File`);
    const name = $(`#${kind}Name`);
    const prog = $(`#${kind}Prog`);
    const hidden = $(`#${kind}`);
    const preview = $(`#${kind}Preview`);
    btn.addEventListener('click', () => input.click());
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      name.textContent = file.name;
      prog.hidden = false; prog.value = 0;
      btn.disabled = true;
      try {
        const url = await Upload.file(file, kind, (pct) => { prog.value = pct; });
        hidden.value = url;
        preview.innerHTML = '';
        if (kind === 'image') {
          const img = document.createElement('img');
          img.src = url; img.style.maxWidth = '120px'; img.style.borderRadius = '8px'; img.style.border = '1px solid rgba(255,255,255,0.08)';
          preview.appendChild(img);
        } else {
          const v = document.createElement('video');
          v.src = url; v.controls = true; v.style.maxWidth = '240px'; v.style.borderRadius = '8px';
          preview.appendChild(v);
        }
        Toast.show(`${kind} uploaded`, 'ok');
      } catch (err) {
        Toast.show(err.message, 'err');
        name.textContent = '';
      } finally {
        prog.hidden = true; prog.value = 0; btn.disabled = false; input.value = '';
      }
    });
  },
  fill(g) {
    $('#gameId').value = g?.id || '';
    $('#name').value = g?.name || '';
    $('#url').value = g?.url || '';
    $('#description').value = g?.description || '';
    $('#image').value = g?.image || '';
    $('#video').value = g?.video || '';
    $('#order').value = g?.order ?? 0;
    $('#active').checked = g?.active !== false;
    $('#imageName').textContent = ''; $('#videoName').textContent = '';
    $('#imagePreview').innerHTML = g?.image ? `<img src="${g.image}" style="max-width:120px;border-radius:8px;border:1px solid rgba(255,255,255,0.08)">` : '';
    $('#videoPreview').innerHTML = g?.video ? `<video src="${g.video}" controls style="max-width:240px;border-radius:8px"></video>` : '';
    $('#formTitle').textContent = g?.id ? 'edit game' : 'add game';
    $('#saveBtn').textContent = g?.id ? 'save changes' : 'add game';
    if (g?.id) window.scrollTo({ top: 0, behavior: 'smooth' });
  },
  reset() { this.fill(null); },
  async save() {
    $('#saveBtn').disabled = true;
    try {
      // auto-pull roblox metadata if the URL is roblox and we haven't fetched it yet
      const urlVal = $('#url').value.trim();
      if (urlVal && Roblox.parse(urlVal) && this._lastLookup !== urlVal) {
        const needsFill = !$('#name').value.trim() || !$('#description').value.trim() || !$('#image').value.trim();
        if (needsFill) {
          Toast.show('fetching from roblox…', 'ok');
          try { await this._fillIfRoblox(false); } catch {}
        }
      }
      const payload = {
        id: $('#gameId').value || undefined,
        name: $('#name').value.trim(),
        url: $('#url').value.trim(),
        description: $('#description').value.trim(),
        image: $('#image').value.trim(),
        video: $('#video').value.trim(),
        order: parseInt($('#order').value, 10) || 0,
        active: $('#active').checked,
      };
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
    if (!this.cache.length) {
      root.innerHTML = '<div style="color:#5b5d6a;font-size:13px;padding:10px;">no games yet — add one above.</div>';
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
      meta.innerHTML = `
        <div class="name">${escapeHtml(g.name)}${g.active === false ? ' <span class="badge" style="background:rgba(255,255,255,0.06);color:#9295a3;">hidden</span>' : ''}</div>
        <div class="sub">${escapeHtml(g.url || '—')}</div>
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
