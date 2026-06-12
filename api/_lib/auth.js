import crypto from 'node:crypto';

const COOKIE = 'omk_auth';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 14; // 14 days

function secret() {
  return process.env.SESSION_SECRET
    || process.env.AUTH_SECRET
    || process.env.ADMIN_PASSWORD
    || '';
}

export function signSession() {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS;
  const s = secret();
  const sig = crypto.createHmac('sha256', s).update(`auth.${exp}`).digest('hex');
  return `${exp}.${sig}`;
}

export function verifySession(value) {
  if (!value || typeof value !== 'string') return false;
  const [expStr, sig] = value.split('.');
  const exp = parseInt(expStr, 10);
  if (!exp || !sig) return false;
  if (Math.floor(Date.now() / 1000) > exp) return false;
  const s = secret();
  if (!s) return false;
  const expected = crypto.createHmac('sha256', s).update(`auth.${exp}`).digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex')); }
  catch { return false; }
}

export function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return '';
}

export function isAuthed(req) {
  return verifySession(readCookie(req, COOKIE));
}

export function setSessionCookie(res) {
  const value = signSession();
  const parts = [
    `${COOKIE}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${MAX_AGE_SECONDS}`,
    'Secure',
  ];
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Secure`);
}

export function checkPassword(input) {
  const expected = process.env.ADMIN_PASSWORD || '';
  if (!expected) return false;
  const a = Buffer.from(String(input || ''), 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) {
    // still do constant-time compare to avoid timing leak on length
    const pad = Buffer.alloc(Math.max(a.length, b.length));
    a.copy(pad); const padB = Buffer.alloc(pad.length); b.copy(padB);
    try { crypto.timingSafeEqual(pad, padB); } catch {}
    return false;
  }
  try { return crypto.timingSafeEqual(a, b); } catch { return false; }
}
