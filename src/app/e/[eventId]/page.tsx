'use client';

import { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import KeepsakeExperienceClient from '../../../components/KeepsakeExperienceClient';

function ExperienceInner() {
  const params = useParams();
  const search = useSearchParams();
  const eventId = typeof params?.eventId === 'string' ? params.eventId : '';
  const entry = search?.get('entry')?.trim() || null;

  if (!eventId) {
    return (
      <div style={{ padding: 24, fontFamily: 'system-ui', textAlign: 'center' }}>
        <p>Missing event link.</p>
      </div>
    );
  }

  return <KeepsakeExperienceClient eventId={eventId} highlightEntryId={entry} />;
}

/**
 * QR destination: full interactive experience (Deezer preview + Spotify link + kept messages).
 * Example: /e/{event_id}?entry={entry_id}
 */
export default function ExperiencePage() {
  return (
    <Suspense
      fallback={
        <div style={{ padding: 24, fontFamily: 'system-ui', textAlign: 'center', color: '#fafafa' }}>
          Loading…
        </div>
      }
    >
      <ExperienceInner />
    </Suspense>
  );
}
