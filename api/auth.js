import { isAuthed, setSessionCookie, clearSessionCookie, checkPassword } from './_lib/auth.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') {
    return res.status(200).json({ ok: isAuthed(req) });
  }
  if (req.method === 'POST') {
    if (!process.env.ADMIN_PASSWORD) {
      return res.status(503).json({ error: 'admin not configured: set ADMIN_PASSWORD env var on the project' });
    }
    const body = await readJson(req);
    if (!checkPassword(body.password)) {
      // small delay to slow brute force
      await new Promise(r => setTimeout(r, 250));
      return res.status(401).json({ error: 'wrong password' });
    }
    setSessionCookie(res);
    return res.status(200).json({ ok: true });
  }
  if (req.method === 'DELETE') {
    clearSessionCookie(res);
    return res.status(200).json({ ok: true });
  }
  res.setHeader('Allow', 'GET, POST, DELETE');
  return res.status(405).json({ error: 'method not allowed' });
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
