'use client';

import { FormEvent, MouseEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabaseClient';
import { defaultGuestSlug, pickUniqueGuestSlug } from '../../lib/guestSlug';
import { PROMPT_THEMES } from '../../lib/promptThemes';
import styles from './host.module.css';

type EventRow = {
  id: string;
  partner_1: string | null;
  partner_2: string | null;
  event_type?: string | null;
  created_at?: string | null;
};

const EVENT_TYPES = [
  'Wedding',
  'Rehearsal Dinner',
  'Anniversary',
  'Birthday',
  'Bachelorette',
  'Bachelor',
  'Engagement',
  'Baby shower',
  'Graduation',
  'Retirement',
  'Other',
];

function displayEventNames(a: string | null, b: string | null) {
  const first = (a ?? '').trim();
  const second = (b ?? '').trim();
  if (first && second) return `${first} & ${second}`;
  if (first) return first;
  if (second) return second;
  return 'Untitled event';
}

const starterPrompts = PROMPT_THEMES.find((t) => t.id === 'romantic')?.prompts ?? [
  'Give them one piece of marriage advice.',
];

const GREETING_OPTIONS: Array<{ id: string; label: string; template: string }> = [
  { id: 'none', label: 'None - show names only', template: '' },
  { id: 'birthday', label: 'Happy birthday', template: 'Happy birthday, [name]!' },
  { id: 'congrats', label: 'Congratulations', template: 'Congratulations, [name]!' },
  { id: 'wedding', label: 'Congratulations on your wedding', template: 'Congratulations on your wedding, {a} & {b}!' },
  { id: 'custom', label: 'Write my own...', template: '' },
];

function todayISODate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function HostHomePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<EventRow[]>([]);

  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [greetingType, setGreetingType] = useState('none');
  const [customGreeting, setCustomGreeting] = useState('');
  const [eventDate, setEventDate] = useState(todayISODate);
  const [eventType, setEventType] = useState('Wedding');
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
      if (!session?.user) {
        router.replace('/login');
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) router.replace('/login');
    });

    return () => sub.subscription.unsubscribe();
  }, [router]);

  useEffect(() => {
    if (!supabase || !user) return;
    (async () => {
      const { data, error } = await supabase
        .from('events')
        .select('id, partner_1, partner_2, event_type, created_at')
        .or(`user_id.eq.${user.id},owner_id.eq.${user.id}`)
        .order('created_at', { ascending: false });

      if (!error && data) setEvents(data as EventRow[]);
    })();
  }, [user]);

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    router.replace('/login');
  }

  async function deleteEvent(ev: EventRow, e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!supabase) return;

    const title = displayEventNames(ev.partner_1, ev.partner_2);
    const ok = window.confirm(
      `Delete this event (${title})?\n\nThis permanently removes the event and all Blirts for it.`,
    );
    if (!ok) return;

    setDeletingId(ev.id);
    setFormError(null);
    try {
      const { data: blirtRows } = await supabase
        .from('blirts')
        .select('type, content')
        .eq('event_id', ev.id);

      for (const b of blirtRows ?? []) {
        const t = (b.type || '').toLowerCase();
        if ((t === 'video' || t === 'audio') && b.content.includes('/')) {
          await supabase.storage.from('blirts-media').remove([b.content]);
        }
      }

      await supabase.from('blirts').delete().eq('event_id', ev.id);
      const { error } = await supabase.from('events').delete().eq('id', ev.id);
      if (error) {
        setFormError(error.message);
        return;
      }
      setEvents((prev) => prev.filter((x) => x.id !== ev.id));
    } finally {
      setDeletingId(null);
    }
  }

  async function createEvent(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!supabase || !user) return;
    const a = p1.trim();
    const b = p2.trim();
    if (!a) {
      setFormError('Enter at least one name.');
      return;
    }
    if (!eventDate.trim()) {
      setFormError('Pick an event date.');
      return;
    }
    setCreating(true);
    const selected = GREETING_OPTIONS.find((o) => o.id === greetingType);
    const celebrationMessage =
      greetingType === 'custom'
        ? customGreeting.trim()
        : (selected?.template ?? '').trim();

    const suggestedSlug = await pickUniqueGuestSlug(
      supabase,
      defaultGuestSlug(a, b, eventType),
    );

    const insertMin = {
      partner_1: a,
      partner_2: b || '',
      event_date: eventDate.trim(),
      event_type: eventType,
      prompts: starterPrompts,
      prompt_randomize: true,
      user_id: user.id,
      owner_id: user.id,
    };

    const columnRetry = /celebration_message|guest_slug|schema cache|column/i;

    let { data, error } = await supabase
      .from('events')
      .insert({
        ...insertMin,
        ...(celebrationMessage ? { celebration_message: celebrationMessage } : {}),
        ...(suggestedSlug ? { guest_slug: suggestedSlug } : {}),
      })
      .select('id')
      .single();

    if (error && columnRetry.test(error.message)) {
      ({ data, error } = await supabase
        .from('events')
        .insert({
          ...insertMin,
          ...(suggestedSlug ? { guest_slug: suggestedSlug } : {}),
        })
        .select('id')
        .single());
    }

    if (error && columnRetry.test(error.message)) {
      ({ data, error } = await supabase
        .from('events')
        .insert({
          ...insertMin,
          ...(celebrationMessage ? { celebration_message: celebrationMessage } : {}),
        })
        .select('id')
        .single());
    }

    if (error && columnRetry.test(error.message)) {
      ({ data, error } = await supabase
        .from('events')
        .insert(insertMin)
        .select('id')
        .single());
    }

    setCreating(false);
    if (error) {
      setFormError(error.message);
      return;
    }
    setP1('');
    setP2('');
    setGreetingType('none');
    setCustomGreeting('');
    setEventDate(todayISODate());
    setEventType('Wedding');
    router.push(`/host/events/${data.id}`);
  }

  if (loading) {
    return (
      <div className={styles.wrap}>
        <p className={styles.muted}>Loading…</p>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className={styles.wrap}>
      <div className={styles.topBar}>
        <div className={styles.brand}>Blirt</div>
        <div className={styles.links}>
          <span className={styles.muted}>{user.email}</span>
          <Link href="/" className={styles.link}>
            Home
          </Link>
          <button type="button" className={`${styles.button} ${styles.buttonGhost}`} onClick={signOut}>
            Sign out
          </button>
        </div>
      </div>

      <h1 className={styles.h1}>Your events</h1>
      <p className={styles.muted} style={{ marginBottom: 20 }}>
        Each event has its own guest link, QR code, and inbox of Blirts.
      </p>

      <div className={styles.card}>
        <div className={styles.h2}>New event</div>
        {formError && <div className={styles.error}>{formError}</div>}
        <form onSubmit={createEvent}>
          <div className={styles.row2}>
            <div>
              <label className={styles.label}>Main name (required)</label>
              <input className={styles.input} value={p1} onChange={(e) => setP1(e.target.value)} />
            </div>
            <div>
              <label className={styles.label}>Second name (optional)</label>
              <input className={styles.input} value={p2} onChange={(e) => setP2(e.target.value)} />
            </div>
          </div>
          <label className={styles.label}>Event date</label>
          <input
            className={styles.input}
            type="date"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
            required
          />
          <label className={styles.label}>Event type</label>
          <select
            className={styles.input}
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
          >
            {EVENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <label className={styles.label}>Greeting (optional)</label>
          <select
            className={styles.input}
            value={greetingType}
            onChange={(e) => setGreetingType(e.target.value)}
          >
            {GREETING_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
          {greetingType === 'custom' && (
            <>
              <label className={styles.label}>Custom greeting line</label>
              <textarea
                className={styles.textarea}
                rows={3}
                value={customGreeting}
                onChange={(e) => setCustomGreeting(e.target.value)}
                placeholder="e.g. Congrats {a} & {b}!"
              />
            </>
          )}
          <button type="submit" className={styles.button} disabled={creating}>
            {creating ? 'Creating…' : 'Create event'}
          </button>
        </form>
      </div>

      {events.length === 0 ? (
        <p className={styles.muted}>No events yet—create one above.</p>
      ) : (
        events.map((ev) => (
          <div key={ev.id} className={styles.card} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Link
              href={`/host/events/${ev.id}`}
              style={{ display: 'block', textDecoration: 'none', color: 'inherit', flex: 1 }}
            >
              <strong>{displayEventNames(ev.partner_1, ev.partner_2)}</strong>
              {ev.event_type && (
                <div className={styles.muted} style={{ marginTop: 6 }}>
                  {ev.event_type}
                </div>
              )}
              <div className={styles.muted} style={{ marginTop: 6 }}>
                Manage Blirts, QR &amp; prompts →
              </div>
            </Link>
            <button
              type="button"
              className={`${styles.button} ${styles.buttonDanger}`}
              disabled={deletingId === ev.id}
              onClick={(e) => deleteEvent(ev, e)}
            >
              {deletingId === ev.id ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        ))
      )}
    </div>
  );
}
