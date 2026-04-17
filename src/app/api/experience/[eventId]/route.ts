import { NextResponse } from 'next/server';
import { normalizeBlirtMediaStoragePath } from '../../../../lib/blirtsStoragePath';
import type { ExperienceEntry, ExperienceEventPayload } from '../../../../lib/keepsakeExperienceTypes';
import { getSupabaseAdmin } from '../../../../lib/supabaseServerAdmin';

/**
 * Public read of **kept** soundtrack Blirts for the `/e/{event_id}` experience page.
 * Requires `SUPABASE_SERVICE_ROLE_KEY` on the server (anon cannot read blirts per RLS).
 */
export async function GET(
  _request: Request,
  context: { params: { eventId: string } },
): Promise<NextResponse<ExperienceEventPayload | { error: string }>> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json(
      {
        error:
          'Missing SUPABASE_SERVICE_ROLE_KEY in .env.local (server only — not the anon/publishable key). Restart the dev server after adding it.',
      },
      { status: 503 },
    );
  }

  const eventId = (context.params?.eventId ?? '').trim();
  if (!eventId) {
    return NextResponse.json({ error: 'Missing event id' }, { status: 400 });
  }

  const { data: event, error: evErr } = await admin
    .from('events')
    .select('id, partner_1, partner_2, event_date')
    .eq('id', eventId)
    .maybeSingle();

  if (evErr || !event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  const { data: rows, error: blErr } = await admin
    .from('blirts')
    .select(
      'id, event_id, type, content, status, created_at, guest_name, soundtrack_message_type, spotify_track_id, spotify_track_name, spotify_artist_name, spotify_album_art_url',
    )
    .eq('event_id', eventId)
    .eq('type', 'soundtrack')
    .eq('status', 'kept')
    .order('created_at', { ascending: true });

  if (blErr) {
    return NextResponse.json({ error: blErr.message }, { status: 500 });
  }

  const entries: ExperienceEntry[] = [];

  for (const b of rows ?? []) {
    const stRaw = (b.soundtrack_message_type ?? 'text').toLowerCase();
    if (stRaw !== 'video' && stRaw !== 'audio' && stRaw !== 'text') continue;
    const st = stRaw as 'video' | 'audio' | 'text';

    const track = (b.spotify_track_name ?? '').trim() || 'Song';
    const artist = (b.spotify_artist_name ?? '').trim() || 'Artist';
    const spotifyId = (b.spotify_track_id ?? '').trim();
    const spotify_url = spotifyId
      ? `https://open.spotify.com/track/${spotifyId}`
      : `https://open.spotify.com/search/${encodeURIComponent(`${track} ${artist}`)}`;

    let video_url: string | null = null;
    let audio_url: string | null = null;
    let message_text = '';

    if (st === 'text') {
      message_text = (b.content ?? '').trim();
    } else {
      const path = normalizeBlirtMediaStoragePath(String(b.content ?? ''));
      if (path.includes('/')) {
        const { data: signed, error: signErr } = await admin.storage
          .from('blirts-media')
          .createSignedUrl(path, 3600);
        if (!signErr && signed?.signedUrl) {
          if (st === 'video') video_url = signed.signedUrl;
          else audio_url = signed.signedUrl;
        }
      }
    }

    entries.push({
      entry_id: b.id,
      song_title: track,
      artist_name: artist,
      album_cover_url: (b.spotify_album_art_url ?? '').trim() || null,
      spotify_url,
      message_text,
      soundtrack_message_type: st,
      video_url,
      audio_url,
      guest_label: (b.guest_name ?? '').trim() || null,
    });
  }

  const payload: ExperienceEventPayload = {
    event_id: event.id,
    partner_1: event.partner_1,
    partner_2: event.partner_2,
    event_date: event.event_date,
    entries,
  };

  return NextResponse.json(payload, {
    headers: { 'Cache-Control': 'private, max-age=30' },
  });
}
