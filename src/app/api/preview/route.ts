import { NextRequest } from 'next/server';

function isAllowedPreviewUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return false;
    const h = u.hostname;
    // Deezer uses several preview CDN hostnames (e.g. cdnt-preview, not only cdns-preview).
    if (h === 'cdn-preview.d.deezer.com') return true;
    if (h === 'cdns-preview.dzcdn.net' || h === 'cdnt-preview.dzcdn.net') return true;
    if (/^e-cdns-proxy-\d+\.dzcdn\.net$/i.test(h)) return true;
    if (/\.dzcdn\.net$/i.test(h) && /preview/i.test(h)) return true;
    return false;
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  if (!url) return new Response('Missing url', { status: 400 });
  if (!isAllowedPreviewUrl(url)) {
    return new Response('Invalid preview url', { status: 400 });
  }

  const response = await fetch(url);
  if (!response.ok) {
    return new Response('Upstream fetch failed', { status: 502 });
  }
  const buffer = await response.arrayBuffer();

  return new Response(buffer, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
