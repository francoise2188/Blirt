import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeBlirtMediaStoragePath } from './blirtsStoragePath';
import { formatTextBlirtLetter } from './textBlirtLetterFormat';

const SOUNDTRACK_PROMPT = 'This song reminds me of you because...';

type BlirtRow = {
  id: string;
  type: string;
  content: string;
  created_at: string | null;
  guest_name: string | null;
  prompt_snapshot?: string | null;
  soundtrack_message_type?: 'video' | 'audio' | 'text' | null;
};

/** Safe segment for filenames: "Frankie" → frankie, "Ann Marie" → ann-marie */
function slugForFilename(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-')
    .slice(0, 48);
}

/**
 * Human-readable .txt name: blirt-from-frankie.txt; anonymous → blirt-from-a-friend.txt.
 * Repeats in the same export get -2, -3, … before .txt
 */
function nextTextBlirtFilename(
  guestName: string | null,
  usedStemCounts: Map<string, number>,
): string {
  const slug = guestName?.trim()
    ? slugForFilename(guestName) || 'guest'
    : 'a-friend';
  const stem = `blirt-from-${slug}`;
  const n = (usedStemCounts.get(stem) ?? 0) + 1;
  usedStemCounts.set(stem, n);
  return n === 1 ? `${stem}.txt` : `${stem}-${n}.txt`;
}

/**
 * Pack text files + downloaded video/audio into a ZIP for hosts.
 * (CSV can only hold links — this gives the actual media files.)
 */
export async function buildBlirtsZip(params: {
  supabase: SupabaseClient;
  items: BlirtRow[];
  eventId: string;
  /** e.g. "Ashley" or "Avery & Jordan" — shown in text Blirt letters */
  eventDisplayName: string;
}): Promise<{ blob: Blob; skipped: string[] }> {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  const folder = zip.folder(`blirts-${params.eventId.slice(0, 8)}`);
  const skipped: string[] = [];
  const textFilenameStems = new Map<string, number>();

  for (const b of params.items) {
    const t = (b.type || '').toLowerCase();
    const soundtrackKind = (b.soundtrack_message_type ?? '').toLowerCase();
    if (t === 'soundtrack' && soundtrackKind === 'text') {
      const body = formatTextBlirtLetter({
        eventDisplayName: params.eventDisplayName,
        guestName: b.guest_name,
        prompt: SOUNDTRACK_PROMPT,
        message: b.content,
        createdAt: b.created_at,
      });
      folder?.file(`soundtrack-text-${b.id.slice(0, 8)}.txt`, body);
      continue;
    }
    if (t === 'text') {
      const body = formatTextBlirtLetter({
        eventDisplayName: params.eventDisplayName,
        guestName: b.guest_name,
        prompt: (b.prompt_snapshot ?? '').trim(),
        message: b.content,
        createdAt: b.created_at,
      });
      const fname = nextTextBlirtFilename(b.guest_name, textFilenameStems);
      folder?.file(fname, body);
      continue;
    }

    const mediaPath = normalizeBlirtMediaStoragePath(b.content);
    const isSoundtrackMedia =
      t === 'soundtrack' && (soundtrackKind === 'video' || soundtrackKind === 'audio');
    const isPlainMedia = t === 'video' || t === 'audio';
    if ((isPlainMedia || isSoundtrackMedia) && mediaPath.includes('/')) {
      const { data, error } = await params.supabase.storage
        .from('blirts-media')
        .createSignedUrl(mediaPath, 7200);
      if (error || !data?.signedUrl) {
        skipped.push(`${b.id}: ${error?.message ?? 'no signed URL'}`);
        folder?.file(
          `MISSING-${t}-${b.id.slice(0, 8)}.txt`,
          `Could not download this file.\nPath: ${mediaPath}\n${error?.message ?? ''}`,
        );
        continue;
      }
      try {
        const res = await fetch(data.signedUrl);
        if (!res.ok) {
          skipped.push(`${b.id}: HTTP ${res.status}`);
          continue;
        }
        const blob = await res.blob();
        const mediaTypeLabel =
          t === 'soundtrack' ? (soundtrackKind === 'video' ? 'soundtrack-video' : 'soundtrack-audio') : t;
        const ext = mediaPath.includes('.')
          ? (mediaPath.split('.').pop() ?? 'bin')
          : soundtrackKind === 'video' || t === 'video'
            ? 'mp4'
            : 'm4a';
        const safeExt = /^[a-z0-9]+$/i.test(ext) ? ext : soundtrackKind === 'video' || t === 'video' ? 'mp4' : 'm4a';
        const fileStem = `${mediaTypeLabel}-${b.id.slice(0, 8)}`;
        folder?.file(`${fileStem}.${safeExt}`, blob);
        const prompt = (b.prompt_snapshot ?? '').trim();
        const meta = [
          `Type: ${t}${t === 'soundtrack' ? ` (${soundtrackKind})` : ''}`,
          `Guest: ${b.guest_name?.trim() || '(not provided)'}`,
          `Created: ${b.created_at ?? ''}`,
          `Blirt id: ${b.id}`,
          prompt ? `Prompt: ${prompt}` : '',
          t === 'soundtrack'
            ? 'Note: This file is only the guest’s recorded message. The 30s song preview is not stored as a file.'
            : '',
          '',
          `Media file: ${fileStem}.${safeExt}`,
        ]
          .filter((line) => line !== '')
          .join('\n');
        folder?.file(`${t}-${b.id.slice(0, 8)}-info.txt`, meta);
      } catch (e) {
        skipped.push(`${b.id}: ${e instanceof Error ? e.message : 'fetch failed'}`);
      }
    }
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  return { blob, skipped };
}
