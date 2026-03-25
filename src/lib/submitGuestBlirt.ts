import type { SupabaseClient } from '@supabase/supabase-js';

function extFromFile(file: File, kind: 'video' | 'audio'): string {
  const fromName = file.name.split('.').pop()?.toLowerCase();
  if (fromName && fromName.length <= 6 && /^[a-z0-9]+$/.test(fromName)) {
    return fromName;
  }
  const t = (file.type || '').toLowerCase();
  if (kind === 'video') {
    if (t.includes('quicktime')) return 'mov';
    if (t.includes('webm')) return 'webm';
    if (t.includes('mp4')) return 'mp4';
    return 'mp4';
  }
  if (t.includes('wav')) return 'wav';
  if (t.includes('mpeg') || t.includes('mp3')) return 'mp3';
  if (t.includes('mp4')) return 'm4a';
  if (t.includes('webm')) return 'webm';
  if (t.includes('ogg')) return 'ogg';
  return 'm4a';
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function submitGuestMediaBlirt(
  supabase: SupabaseClient,
  params: {
    eventId: string;
    file: File;
    type: 'video' | 'audio';
    guestName?: string | null;
    /** Prompt text the guest saw when recording (optional; requires DB column — see supabase/blirts_prompt_snapshot.sql). */
    promptSnapshot?: string | null;
  },
): Promise<{ error: string | null }> {
  const id = newId();
  const ext = extFromFile(params.file, params.type);
  const path = `${params.eventId}/${id}.${ext}`;

  const contentType =
    params.file.type ||
    (params.type === 'video' ? 'video/mp4' : 'audio/mp4');

  const guestName = params.guestName?.trim() || null;
  const promptSnapshot = params.promptSnapshot?.trim() || null;

  // Upload first so we never leave a blirts row pointing at a missing path if upload fails (RLS, etc.).
  const { error: upErr } = await supabase.storage.from('blirts-media').upload(path, params.file, {
    cacheControl: '3600',
    upsert: true,
    contentType,
  });

  if (upErr) {
    return { error: upErr.message };
  }

  const { error: insErr } = await supabase.from('blirts').insert({
    id,
    event_id: params.eventId,
    guest_name: guestName,
    type: params.type,
    content: path,
    status: 'pending',
    prompt_snapshot: promptSnapshot,
  });

  if (insErr) {
    await supabase.storage.from('blirts-media').remove([path]);
    return { error: insErr.message };
  }

  return { error: null };
}

export async function submitGuestSoundtrackMediaBlirt(
  supabase: SupabaseClient,
  params: {
    eventId: string;
    file: File;
    soundtrackMessageType: 'video' | 'audio';
    guestName?: string | null;
    promptSnapshot?: string | null;
    spotify: {
      track_id: string;
      track_name: string;
      artist_name: string;
      album_name: string;
      album_art_url: string | null;
      preview_url: string | null;
    };
  },
): Promise<{ error: string | null }> {
  const id = newId();
  const ext = extFromFile(params.file, params.soundtrackMessageType);
  const path = `${params.eventId}/${id}.${ext}`;

  const contentType =
    params.file.type ||
    (params.soundtrackMessageType === 'video' ? 'video/mp4' : 'audio/mp4');

  const guestName = params.guestName?.trim() || null;
  const promptSnapshot = params.promptSnapshot?.trim() || null;

  const { error: upErr } = await supabase.storage.from('blirts-media').upload(path, params.file, {
    cacheControl: '3600',
    upsert: true,
    contentType,
  });

  if (upErr) {
    return { error: upErr.message };
  }

  const { error: insErr } = await supabase.from('blirts').insert({
    id,
    event_id: params.eventId,
    guest_name: guestName,
    type: 'soundtrack',
    content: path,
    status: 'pending',
    prompt_snapshot: promptSnapshot,
    soundtrack_message_type: params.soundtrackMessageType,
    spotify_track_id: params.spotify.track_id,
    spotify_track_name: params.spotify.track_name,
    spotify_artist_name: params.spotify.artist_name,
    spotify_album_name: params.spotify.album_name,
    spotify_album_art_url: params.spotify.album_art_url,
    spotify_preview_url: params.spotify.preview_url,
  });

  if (insErr) {
    await supabase.storage.from('blirts-media').remove([path]);
    return { error: insErr.message };
  }

  return { error: null };
}
