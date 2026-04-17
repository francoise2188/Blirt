'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import GuestRecordingPage from './GuestRecordingPage';

function GuestPageInner() {
  const searchParams = useSearchParams();
  const eventId = searchParams.get('event') ?? 'demo';
  return <GuestRecordingPage eventId={eventId} />;
}

export default function GuestPage() {
  return (
    <Suspense
      fallback={
        <div style={{ padding: 24, fontFamily: 'system-ui', textAlign: 'center' }}>
          Loading…
        </div>
      }
    >
      <GuestPageInner />
    </Suspense>
  );
}
