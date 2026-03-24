/**
 * Full URL guests open to leave a Blirt (for QR codes and sharing).
 * Prefer a pretty path when guest_slug is set: https://yoursite.com/ashley-birthday
 */
export function getGuestPageUrl(
  eventId: string,
  options?: { originOverride?: string; guestSlug?: string | null },
): string {
  const origin =
    options?.originOverride?.replace(/\/$/, '') ||
    (typeof window !== 'undefined'
      ? window.location.origin
      : (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '') || '');
  const slug = (options?.guestSlug ?? '').trim();
  if (!origin) {
    return slug ? `/${encodeURIComponent(slug)}` : `/guest?event=${encodeURIComponent(eventId)}`;
  }
  if (slug) {
    return `${origin}/${encodeURIComponent(slug)}`;
  }
  return `${origin}/guest?event=${encodeURIComponent(eventId)}`;
}
