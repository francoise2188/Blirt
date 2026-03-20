import type { SupabaseClient } from '@supabase/supabase-js';

type BlirtRow = {
  id: string;
  type: string;
  content: string;
  created_at: string | null;
  guest_name: string | null;
};

/**
 * Pack text files + downloaded video/audio into a ZIP for hosts.
 * (CSV can only hold links — this gives the actual media files.)
 */
export async function buildBlirtsZip(params: {
  supabase: SupabaseClient;
  items: BlirtRow[];
  eventId: string;
}): Promise<{ blob: Blob; skipped: string[] }> {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  const folder = zip.folder(`blirts-${params.eventId.slice(0, 8)}`);
  const skipped: string[] = [];

  for (const b of params.items) {
    const t = (b.type || '').toLowerCase();
    if (t === 'text') {
      const body = [
        `Guest name: ${b.guest_name?.trim() || '(not provided)'}`,
        `Created: ${b.created_at ?? ''}`,
        `Blirt id: ${b.id}`,
        '',
        '— Message —',
        '',
        b.content,
      ].join('\n');
      folder?.file(`text-${b.id.slice(0, 8)}.txt`, body);
      continue;
    }

    if ((t === 'video' || t === 'audio') && b.content.includes('/')) {
      const { data, error } = await params.supabase.storage
        .from('blirts-media')
        .createSignedUrl(b.content, 7200);
      if (error || !data?.signedUrl) {
        skipped.push(`${b.id}: ${error?.message ?? 'no signed URL'}`);
        folder?.file(
          `MISSING-${t}-${b.id.slice(0, 8)}.txt`,
          `Could not download this file.\nPath: ${b.content}\n${error?.message ?? ''}`,
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
        const ext = b.content.includes('.') ? (b.content.split('.').pop() ?? 'bin') : t === 'video' ? 'mp4' : 'webm';
        const safeExt = /^[a-z0-9]+$/i.test(ext) ? ext : t === 'video' ? 'mp4' : 'webm';
        folder?.file(`${t}-${b.id.slice(0, 8)}.${safeExt}`, blob);
      } catch (e) {
        skipped.push(`${b.id}: ${e instanceof Error ? e.message : 'fetch failed'}`);
      }
    }
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  return { blob, skipped };
}
