/**
 * `blirts.content` for video/audio should be `eventId/file.ext` relative to bucket `blirts-media`.
 * Normalize in case older data included a bucket prefix or stray slashes.
 */
export function normalizeBlirtMediaStoragePath(content: string): string {
  let p = content.trim();
  if (p.toLowerCase().startsWith('blirts-media/')) {
    p = p.slice('blirts-media/'.length);
  }
  return p.replace(/^\/+/, '');
}

/** User-facing copy when Supabase returns missing-object errors for signed URLs. */
export function friendlyBlirtStorageError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('not found')) {
    return 'No file in Storage for this row — the upload likely failed earlier (only the inbox line was saved). You can delete this Blirt.';
  }
  return message;
}
