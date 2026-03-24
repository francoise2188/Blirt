'use client';

import { useSearchParams } from 'next/navigation';
import GuestRecordingPage from './GuestRecordingPage';

export default function GuestPage() {
  const searchParams = useSearchParams();
  const eventId = searchParams.get('event') ?? 'demo';
  return <GuestRecordingPage eventId={eventId} />;
}
