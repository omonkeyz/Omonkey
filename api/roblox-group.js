// Look up Roblox group metadata (name, description, member count, icon, verified).
// Public endpoint — no auth required.

const GROUP_ID_RE = /(?:roblox\.com\/(?:groups|communities)\/)(\d+)/i;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=120, s-maxage=300');

  try {
    const url = new URL(req.url, `http://${req.headers.host || 'x'}`);
    let groupId = url.searchParams.get('groupId');
    const input = url.searchParams.get('url');
    if (!groupId && input) {
      const m = input.match(GROUP_ID_RE);
      if (m) groupId = m[1];
      else if (/^\d+$/.test(input.trim())) groupId = input.trim();
    }
    if (!groupId || !/^\d+$/.test(groupId)) {
      return res.status(400).json({ error: 'missing or invalid groupId / url' });
    }

    const [gRes, iRes] = await Promise.all([
      fetch(`https://groups.roblox.com/v1/groups/${groupId}`, { headers: { accept: 'application/json' } }),
      fetch(`https://thumbnails.roblox.com/v1/groups/icons?groupIds=${groupId}&size=420x420&format=Png&isCircular=false`, { headers: { accept: 'application/json' } }),
    ]);

    if (!gRes.ok) {
      return res.status(502).json({ error: `roblox group lookup failed (${gRes.status})` });
    }
    const info = await gRes.json();
    if (!info || info.errors) {
      return res.status(404).json({ error: 'group not found' });
    }

    let iconUrl = '';
    if (iRes.ok) {
      const data = await iRes.json();
      const item = data && Array.isArray(data.data) && data.data[0];
      if (item && item.imageUrl && item.state === 'Completed') iconUrl = item.imageUrl;
    }

    return res.status(200).json({
      groupId: Number(groupId),
      name: info.name || '',
      description: info.description || '',
      memberCount: info.memberCount || 0,
      iconUrl,
      hasVerifiedBadge: !!info.hasVerifiedBadge,
      owner: info.owner?.username || '',
    });
  } catch (err) {
    console.error('roblox group lookup error', err);
    return res.status(500).json({ error: err.message || 'lookup failed' });
  }
}
