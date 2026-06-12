// Look up Roblox game metadata (name, description, icon) from a place id / url.
// Public endpoint — no auth required, used by the public site & admin to enrich data.

const PLACE_ID_RE = /(?:roblox\.com\/games\/|placeId=)(\d+)/i;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=120, s-maxage=300');

  try {
    const url = new URL(req.url, `http://${req.headers.host || 'x'}`);
    let placeId = url.searchParams.get('placeId');
    const input = url.searchParams.get('url');
    if (!placeId && input) {
      const m = input.match(PLACE_ID_RE);
      if (m) placeId = m[1];
      else if (/^\d+$/.test(input.trim())) placeId = input.trim();
    }
    if (!placeId || !/^\d+$/.test(placeId)) {
      return res.status(400).json({ error: 'missing or invalid placeId / url' });
    }

    // 1. place id -> universe id
    const uRes = await fetch(`https://apis.roblox.com/universes/v1/places/${placeId}/universe`, {
      headers: { 'accept': 'application/json' },
    });
    if (!uRes.ok) return res.status(502).json({ error: `roblox universe lookup failed (${uRes.status})` });
    const { universeId } = await uRes.json();
    if (!universeId) return res.status(404).json({ error: 'universe not found for that place' });

    // 2. game info + 3. icon (parallel)
    const [gRes, iRes] = await Promise.all([
      fetch(`https://games.roblox.com/v1/games?universeIds=${universeId}`, { headers: { accept: 'application/json' } }),
      fetch(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${universeId}&size=512x512&format=Png&isCircular=false`, { headers: { accept: 'application/json' } }),
    ]);

    let info = null;
    if (gRes.ok) {
      const data = await gRes.json();
      info = (data && Array.isArray(data.data) && data.data[0]) || null;
    }
    let iconUrl = '';
    if (iRes.ok) {
      const data = await iRes.json();
      const item = data && Array.isArray(data.data) && data.data[0];
      if (item && item.imageUrl && item.state === 'Completed') iconUrl = item.imageUrl;
    }

    if (!info) return res.status(404).json({ error: 'game info not found' });

    return res.status(200).json({
      placeId: Number(placeId),
      universeId,
      name: info.name || '',
      description: info.description || '',
      iconUrl,
      playing: info.playing || 0,
      visits: info.visits || 0,
      maxPlayers: info.maxPlayers || 0,
      creator: info.creator?.name || '',
    });
  } catch (err) {
    console.error('roblox lookup error', err);
    return res.status(500).json({ error: err.message || 'lookup failed' });
  }
}
