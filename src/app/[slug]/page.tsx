'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import { isReservedGuestSlug } from '../../lib/guestSlug';
import GuestRecordingPage from '../guest/GuestRecordingPage';
import styles from '../guest/page.module.css';

export default function GuestBySlugPage() {
  const params = useParams();
  const slug = typeof params?.slug === 'string' ? params.slug : '';
  const [eventId, setEventId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug || isReservedGuestSlug(slug)) {
      setLoading(false);
      setEventId(null);
      setError('not-found');
      return;
    }
    if (!supabase) {
      setLoading(false);
      setEventId(null);
      setError('no-supabase');
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error: qErr } = await supabase
        .from('events')
        .select('id')
        .eq('guest_slug', slug)
        .maybeSingle();
      if (cancelled) return;
      if (qErr) {
        setError(qErr.message);
        setEventId(null);
        setLoading(false);
        return;
      }
      if (!data?.id) {
        setError('not-found');
        setEventId(null);
        setLoading(false);
        return;
      }
      setEventId(data.id);
      setError(null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.loadingBox}>Loading your event…</div>
      </div>
    );
  }

  if (error === 'not-found' || !eventId) {
    return (
      <div className={styles.page}>
        <div className={styles.errorBox} role="alert">
          {error === 'not-found' ? (
            <>
              <strong>We couldn&apos;t find that event.</strong>
              <p style={{ margin: '8px 0 0', fontWeight: 500 }}>
                Check the link, or ask your host for an updated guest URL.
              </p>
            </>
          ) : error === 'no-supabase' ? (
            <>
              <strong>App is not fully configured.</strong>
              <p style={{ margin: '8px 0 0', fontWeight: 500 }}>Supabase env vars are missing.</p>
            </>
          ) : (
            error
          )}
        </div>
      </div>
    );
  }

  return <GuestRecordingPage eventId={eventId} />;
}
