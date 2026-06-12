import { kv } from '@vercel/kv';
import crypto from 'node:crypto';

const KEY = 'omk:games';

export async function listGames() {
  try {
    const data = await kv.get(KEY);
    if (Array.isArray(data)) return data;
    return [];
  } catch (err) {
    console.error('kv list failed', err);
    return [];
  }
}

async function writeGames(games) {
  await kv.set(KEY, games);
}

export async function upsertGame(input) {
  const games = await listGames();
  const now = Date.now();
  const clean = sanitize(input);
  if (!clean.name) throw new Error('name is required');

  if (clean.id) {
    const idx = games.findIndex(g => g.id === clean.id);
    if (idx === -1) {
      games.push({ ...clean, createdAt: now, updatedAt: now });
    } else {
      games[idx] = { ...games[idx], ...clean, updatedAt: now };
    }
  } else {
    clean.id = crypto.randomUUID();
    games.push({ ...clean, createdAt: now, updatedAt: now });
  }
  await writeGames(games);
  return clean;
}

export async function deleteGame(id) {
  if (!id) throw new Error('id required');
  const games = await listGames();
  const next = games.filter(g => g.id !== id);
  await writeGames(next);
}

function sanitize(input) {
  const out = {};
  if (input.id && typeof input.id === 'string') out.id = input.id.slice(0, 64);
  const t = input.type;
  out.type = t === 'person' ? 'person' : (t === 'group' ? 'group' : 'game');
  out.name = String(input.name || '').trim().slice(0, 80);
  out.url = String(input.url || '').trim().slice(0, 400);
  out.description = String(input.description || '').trim().slice(0, 600);
  out.image = String(input.image || '').trim().slice(0, 800);
  out.video = String(input.video || '').trim().slice(0, 800);
  out.role = String(input.role || '').trim().slice(0, 80);
  out.parentId = input.parentId && typeof input.parentId === 'string' ? input.parentId.slice(0, 64) : '';
  out.order = Number.isFinite(+input.order) ? Math.trunc(+input.order) : 0;
  out.active = input.active === false ? false : true;
  if (out.type === 'group') {
    out.memberCount = Number.isFinite(+input.memberCount) ? Math.max(0, Math.trunc(+input.memberCount)) : 0;
    out.verified = input.verified === true;
  }
  for (const k of ['image', 'video']) {
    if (out[k].startsWith('data:')) {
      throw new Error(`${k} must be a URL, not inline data`);
    }
  }
  return out;
}
