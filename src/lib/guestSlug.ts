/**
 * URL-safe guest links: /your-event-slug instead of long IDs.
 * Keep in sync with RESERVED_APP_ROUTES in app/[slug]/page.tsx
 */

import type { SupabaseClient } from '@supabase/supabase-js';

const RESERVED = new Set([
  '',
  'api',
  'guest',
  'host',
  'login',
  'auth',
  '_next',
  'favicon.ico',
  'robots.txt',
  'sitemap.xml',
]);

export function isReservedGuestSlug(slug: string): boolean {
  const s = slug.trim().toLowerCase();
  if (!s) return true;
  return RESERVED.has(s);
}

function slugifyPart(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

/** Default slug from names + event type, e.g. ashley-birthday */
export function defaultGuestSlug(
  partner1: string,
  partner2: string,
  eventType: string,
): string {
  const a = slugifyPart(partner1);
  const b = slugifyPart(partner2);
  const t = slugifyPart(eventType);
  let base: string;
  if (a && b) {
    base = `${a}-${b}`;
  } else if (a && t) {
    base = `${a}-${t}`;
  } else if (a) {
    base = `${a}-${t || 'event'}`;
  } else {
    base = 'event';
  }
  return base.slice(0, 72);
}

export function normalizeGuestSlugInput(raw: string): string {
  return slugifyPart(raw).slice(0, 72);
}

/**
 * Picks a guest_slug that is not already taken. Returns null if the DB has no guest_slug column yet.
 */
export async function pickUniqueGuestSlug(
  supabase: SupabaseClient,
  base: string,
): Promise<string | null> {
  let root = normalizeGuestSlugInput(base) || 'event';
  if (isReservedGuestSlug(root)) {
    root = `${root}-party`;
  }
  for (let i = 0; i < 80; i++) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    if (isReservedGuestSlug(candidate)) continue;
    const { data, error } = await supabase
      .from('events')
      .select('id')
      .eq('guest_slug', candidate)
      .maybeSingle();
    if (error) {
      if (/guest_slug|column|schema/i.test(error.message)) {
        return null;
      }
      return null;
    }
    if (!data) return candidate;
  }
  return `${root}-${Date.now().toString(36)}`;
}
