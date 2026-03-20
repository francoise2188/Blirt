'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabaseClient';

export default function AuthCallbackPage() {
  const router = useRouter();
  const [message, setMessage] = useState('Signing you in…');

  useEffect(() => {
    if (!supabase) {
      setMessage('Blirt is not connected to Supabase yet (check env vars).');
      return;
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
        router.replace('/host');
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace('/host');
    });

    const failTimer = window.setTimeout(() => {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (!session) {
          setMessage(
            'Still not signed in. Open the magic link from the same browser, or request a new email from the login page.'
          );
        }
      });
    }, 8000);

    return () => {
      sub.subscription.unsubscribe();
      window.clearTimeout(failTimer);
    };
  }, [router]);

  return (
    <main style={{ padding: 28, maxWidth: 480, margin: '0 auto', fontFamily: 'var(--font-ui, system-ui)' }}>
      <p style={{ fontSize: 16, lineHeight: 1.5 }}>{message}</p>
    </main>
  );
}
