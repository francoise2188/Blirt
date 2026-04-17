/**
 * Canonical QR / share destination for the full interactive experience (music + videos).
 * Production: https://blirt.it/e/{event_id} — use NEXT_PUBLIC_APP_URL on deploy.
 */
export function getExperiencePageUrl(
  eventId: string,
  options?: { originOverride?: string; entryId?: string | null },
): string {
  const origin =
    options?.originOverride?.replace(/\/$/, '') ||
    (typeof window !== 'undefined'
      ? window.location.origin
      : (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '') || '');
  const base = origin ? `${origin}/e/${encodeURIComponent(eventId)}` : `/e/${encodeURIComponent(eventId)}`;
  const eid = (options?.entryId ?? '').trim();
  if (!eid) return base;
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}entry=${encodeURIComponent(eid)}`;
}
