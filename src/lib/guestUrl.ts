/**
 * Full URL guests open to leave a Blirt (for QR codes and sharing).
 */
export function getGuestPageUrl(eventId: string, originOverride?: string): string {
  const origin =
    originOverride?.replace(/\/$/, '') ||
    (typeof window !== 'undefined'
      ? window.location.origin
      : (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '') || '');
  if (!origin) {
    return `/guest?event=${encodeURIComponent(eventId)}`;
  }
  return `${origin}/guest?event=${encodeURIComponent(eventId)}`;
}
