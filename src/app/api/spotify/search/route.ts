export const runtime = 'nodejs';

type SpotifyTrackResult = {
  id: string;
  name: string;
  artist_name: string;
  album_name: string;
  album_art_url: string | null;
  preview_url: string | null;
};

let cachedAccessToken: { value: string; expiresAtMs: number } | null = null;

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} environment variable`);
  return v;
}

async function getSpotifyAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedAccessToken && now < cachedAccessToken.expiresAtMs - 30_000) {
    return cachedAccessToken.value;
  }

  const clientId = env('SPOTIFY_CLIENT_ID');
  const clientSecret = env('SPOTIFY_CLIENT_SECRET');
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
    // avoid any caching surprises in serverless
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Spotify token error (${res.status}): ${text || res.statusText}`);
  }

  const json = (await res.json()) as { access_token: string; expires_in: number };
  const expiresInSec = Number(json.expires_in) || 0;
  cachedAccessToken = {
    value: json.access_token,
    expiresAtMs: now + Math.max(0, expiresInSec) * 1000,
  };
  return cachedAccessToken.value;
}

function pickAlbumArtUrl(images: Array<{ url: string; width: number | null }> | undefined): string | null {
  if (!images || images.length === 0) return null;
  const byWidth = [...images].sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
  const exact640 = byWidth.find((img) => img.width === 640);
  return (exact640 ?? byWidth[0])?.url ?? null;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const q = (url.searchParams.get('q') ?? '').trim();
    if (!q) {
      return Response.json({ error: 'Missing query parameter: q' }, { status: 400 });
    }

    const token = await getSpotifyAccessToken();
    console.log('[spotify/search] q =', q);
    const searchUrl = new URL('https://api.spotify.com/v1/search');
    searchUrl.searchParams.set('type', 'track');
    searchUrl.searchParams.set('limit', '5');
    searchUrl.searchParams.set('q', q);

    const res = await fetch(searchUrl.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return Response.json(
        { error: `Spotify search failed (${res.status})`, details: text || res.statusText },
        { status: 502 },
      );
    }

    const json = (await res.json()) as any;

    const items = Array.isArray(json.tracks?.items) ? json.tracks!.items! : [];
    const first = items[0];
    if (first) {
      console.log('[spotify/search] first raw item =', first);
      console.log(
        '[spotify/search] first.preview_url exists?',
        Object.prototype.hasOwnProperty.call(first, 'preview_url'),
        'value =',
        first.preview_url,
      );
    } else {
      console.log('[spotify/search] no results');
    }

    const results: SpotifyTrackResult[] = items.slice(0, 5).map((t) => ({
      id: t.id,
      name: t.name,
      artist_name: t.artists?.[0]?.name ?? '',
      album_name: t.album?.name ?? '',
      album_art_url: pickAlbumArtUrl(t.album?.images),
      preview_url: t.preview_url ?? null,
    }));

    console.log('[spotify/search] returning fields =', results[0] ?? null);
    return Response.json({ results });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return Response.json({ error: msg }, { status: 500 });
  }
}

