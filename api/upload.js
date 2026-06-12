import { handleUpload } from '@vercel/blob/client';
import { isAuthed } from './_lib/auth.js';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml', 'image/avif'];
const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska'];
const IMAGE_MAX = 25 * 1024 * 1024;       // 25 MB
const VIDEO_MAX = 500 * 1024 * 1024;      // 500 MB

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method not allowed' });
  }
  if (!isAuthed(req)) return res.status(401).json({ error: 'unauthorized' });
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(503).json({ error: 'uploads not configured: connect a Vercel Blob store and set BLOB_READ_WRITE_TOKEN' });
  }

  const body = await readJson(req);

  try {
    const json = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        let kind = 'image';
        try { kind = (JSON.parse(clientPayload || '{}').kind) || 'image'; } catch {}
        const isVideo = kind === 'video';
        return {
          allowedContentTypes: isVideo ? VIDEO_TYPES : IMAGE_TYPES,
          maximumSizeInBytes: isVideo ? VIDEO_MAX : IMAGE_MAX,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ kind }),
        };
      },
      onUploadCompleted: async () => {
        // no-op; blob is publicly readable and returned to client
      },
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return res.status(200).json(json);
  } catch (err) {
    console.error('upload handler error', err);
    return res.status(400).json({ error: err.message || 'upload failed' });
  }
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return await new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 2e6) { req.destroy(); resolve({}); } });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}
