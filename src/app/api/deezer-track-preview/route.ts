import { NextRequest, NextResponse } from 'next/server';
import { getDeezerPreview } from '../../../lib/deezerPreview';

/** Server-side Deezer lookup (avoids browser CORS on api.deezer.com). */
export async function GET(req: NextRequest) {
  const track = req.nextUrl.searchParams.get('track')?.trim() ?? '';
  const artist = req.nextUrl.searchParams.get('artist')?.trim() ?? '';
  if (!track || !artist) {
    return NextResponse.json({ error: 'Missing track or artist' }, { status: 400 });
  }
  const preview = await getDeezerPreview(track, artist);
  return NextResponse.json({ preview });
}
