import { isAuthed } from './_lib/auth.js';
import { listGames, upsertGame, deleteGame } from './_lib/store.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      const games = await listGames();
      return res.status(200).json({ games });
    }
    if (req.method === 'POST') {
      if (!isAuthed(req)) return res.status(401).json({ error: 'unauthorized' });
      const body = await readJson(req);
      const saved = await upsertGame(body);
      return res.status(200).json({ game: saved });
    }
    if (req.method === 'DELETE') {
      if (!isAuthed(req)) return res.status(401).json({ error: 'unauthorized' });
      const url = new URL(req.url, `http://${req.headers.host || 'x'}`);
      const id = url.searchParams.get('id') || (await readJson(req)).id;
      await deleteGame(id);
      return res.status(200).json({ ok: true });
    }
    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    console.error('games handler error', err);
    return res.status(400).json({ error: err.message || 'bad request' });
  }
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return await new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e6) { req.destroy(); resolve({}); } });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}
