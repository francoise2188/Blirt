import { NextRequest, NextResponse } from 'next/server';
import { createElement, type ReactElement } from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { KeepsakePdfDocument, type KeepsakePdfBlirt } from '../../../components/keepsake/KeepsakePdfDocument';
import { registerKeepsakePdfFonts } from '../../../lib/keepsakePdfFonts';
import { createSupabaseWithBearer } from '../../../lib/supabaseWithBearer';

export const runtime = 'nodejs';

function getBearer(request: NextRequest): string | null {
  const a = request.headers.get('authorization');
  if (!a?.toLowerCase().startsWith('bearer ')) return null;
  return a.slice(7).trim();
}

function getEventId(request: NextRequest): string | null {
  const q = request.nextUrl.searchParams.get('eventId')?.trim();
  if (q) return q;
  return null;
}

function slugifyFilename(partner1: string | null, partner2: string | null): string {
  const a = (partner1 ?? '').trim();
  const b = (partner2 ?? '').trim();
  const display = a && b ? `${a} ${b}` : a || b || 'collection';
  return display
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-')
    .slice(0, 48);
}

function isEventOwner(ev: { owner_id?: string | null; user_id?: string | null }, uid: string): boolean {
  const byUser = ev.user_id && ev.user_id === uid;
  const byOwner = ev.owner_id && ev.owner_id === uid;
  return Boolean(byUser || byOwner);
}

export async function GET(request: NextRequest) {
  return handleKeepsakePdf(request, getEventId(request));
}

export async function POST(request: NextRequest) {
  let eventId: string | null = null;
  try {
    const body = (await request.json()) as { eventId?: string };
    eventId = (body?.eventId ?? '').trim() || null;
  } catch {
    /* ignore */
  }
  return handleKeepsakePdf(request, eventId);
}

async function handleKeepsakePdf(request: NextRequest, eventId: string | null) {
  const token = getBearer(request);
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized — sign in and try again.' }, { status: 401 });
  }
  if (!eventId) {
    return NextResponse.json({ error: 'Missing eventId' }, { status: 400 });
  }

  let supabase;
  try {
    supabase = createSupabaseWithBearer(token);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Server configuration error' },
      { status: 500 },
    );
  }

  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  const user = userData?.user;
  if (userErr || !user) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  }

  const { data: event, error: evErr } = await supabase
    .from('events')
    .select('id, partner_1, partner_2, event_type, event_date, owner_id, user_id')
    .eq('id', eventId)
    .maybeSingle();

  if (evErr || !event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }
  if (!isEventOwner(event, user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: blirts, error: blErr } = await supabase
    .from('blirts')
    .select(
      'id, type, content, created_at, guest_name, prompt_snapshot, soundtrack_message_type, spotify_track_name, spotify_artist_name',
    )
    .eq('event_id', eventId)
    .order('created_at', { ascending: true });

  if (blErr) {
    return NextResponse.json({ error: blErr.message }, { status: 500 });
  }

  const items = (blirts ?? []) as KeepsakePdfBlirt[];

  try {
    registerKeepsakePdfFonts();
    const buffer = await renderToBuffer(
      createElement(KeepsakePdfDocument, {
        partner1: event.partner_1,
        partner2: event.partner_2,
        eventType: event.event_type,
        eventDate: event.event_date,
        blirts: items,
      }) as ReactElement,
    );

    const slug = slugifyFilename(event.partner_1, event.partner_2);
    const filename = `blirt-collection-${slug || 'event'}.pdf`;

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e) {
    console.error('[keepsake-pdf]', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Could not render PDF' },
      { status: 500 },
    );
  }
}
