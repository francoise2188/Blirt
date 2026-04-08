'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabaseClient';
import styles from '../host.module.css';

type Tab = 'login' | 'signup';

export default function HostLoginPage() {
  const router = useRouter();

  const [tab, setTab] = useState<Tab>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'working' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) router.replace('/host');
    });
  }, [router]);

  /**
   * Where Supabase sends users after they click “Confirm” in the email.
   * Must match an entry in Supabase → Authentication → URL Configuration → Redirect URLs
   * (e.g. https://blirt-it.com/auth/callback and http://localhost:3001/auth/callback for dev).
   */
  function getEmailRedirectTo() {
    if (typeof window === 'undefined') return undefined;
    const envBase = (process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/$/, '');
    const origin = envBase || window.location.origin;
    return `${origin}/auth/callback`;
  }

  async function onLoginSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (!supabase) {
      setStatus('error');
      setMessage('Supabase is not configured (missing env vars).');
      return;
    }

    const trimmedEmail = email.trim();
    if (!trimmedEmail || password.length < 6) {
      setStatus('error');
      setMessage('Enter a valid email and a password (min 6 characters).');
      return;
    }

    setStatus('working');
    const { data, error: err } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    });

    if (err) {
      setStatus('error');
      setMessage(err.message);
      return;
    }

    if (data.session?.user) {
      router.replace('/host');
      return;
    }

    setStatus('error');
    setMessage('Signed in, but no session was found. Try again.');
  }

  async function onSignupSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (!supabase) {
      setStatus('error');
      setMessage('Supabase is not configured (missing env vars).');
      return;
    }

    const trimmedEmail = email.trim();
    if (!trimmedEmail || password.length < 6) {
      setStatus('error');
      setMessage('Enter a valid email and a password (min 6 characters).');
      return;
    }

    setStatus('working');
    const { error: err } = await supabase.auth.signUp({
      email: trimmedEmail,
      password,
      options: {
        emailRedirectTo: getEmailRedirectTo(),
      },
    });

    if (err) {
      setStatus('error');
      setMessage(err.message);
      return;
    }

    setStatus('sent');
    setMessage(
      'Check your email to confirm your account. After you confirm, you can log in with your email and password.'
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.topBar}>
        <div className={styles.brand}>Blirt</div>
        <div className={styles.links}>
          <Link href="/" className={styles.link}>
            Home
          </Link>
        </div>
      </div>

      <div className={styles.card} style={{ maxWidth: 520 }}>
        <h1 className={styles.h1}>Host login</h1>
        <p className={styles.muted} style={{ marginTop: 0, lineHeight: 1.5 }}>
          For hosts only. Email confirmation is ON in Supabase, so new accounts must confirm
          the email before login will work.
        </p>

        <div className={styles.tabs} style={{ marginBottom: 14 }}>
          <button
            type="button"
            className={`${styles.tab} ${tab === 'login' ? styles.tabActive : ''}`}
            onClick={() => {
              setTab('login');
              setStatus('idle');
              setMessage(null);
            }}
          >
            Log in
          </button>
          <button
            type="button"
            className={`${styles.tab} ${tab === 'signup' ? styles.tabActive : ''}`}
            onClick={() => {
              setTab('signup');
              setStatus('idle');
              setMessage(null);
            }}
          >
            Create account
          </button>
        </div>

        {message && <div className={status === 'sent' ? styles.success : styles.error}>{message}</div>}

        {tab === 'login' ? (
          <form onSubmit={onLoginSubmit}>
            <label className={styles.label} htmlFor="email">
              Email
            </label>
            <input
              id="email"
              className={styles.input}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              disabled={status === 'working'}
            />

            <label className={styles.label} htmlFor="password">
              Password
            </label>
            <input
              id="password"
              className={styles.input}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
              disabled={status === 'working'}
            />

            <button
              type="submit"
              className={styles.button}
              disabled={status === 'working' || !email.trim() || password.length < 6}
            >
              {status === 'working' ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        ) : (
          <form onSubmit={onSignupSubmit}>
            <label className={styles.label} htmlFor="email2">
              Email
            </label>
            <input
              id="email2"
              className={styles.input}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              disabled={status === 'working'}
            />

            <label className={styles.label} htmlFor="password2">
              Password
            </label>
            <input
              id="password2"
              className={styles.input}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 6 characters"
              disabled={status === 'working'}
            />

            <button
              type="submit"
              className={styles.button}
              disabled={status === 'working' || !email.trim() || password.length < 6}
            >
              {status === 'working' ? 'Creating...' : 'Create account'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
