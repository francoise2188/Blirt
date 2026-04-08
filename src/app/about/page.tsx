import type { Metadata } from 'next';
import Link from 'next/link';
import { MarketingSiteShell } from '../../components/MarketingSiteShell';
import styles from '../marketing.module.css';

export const metadata: Metadata = {
  title: 'About',
  description:
    'Blirt helps people capture real voices and memories at weddings, birthdays, and every celebration — no app required for guests.',
};

export default function AboutPage() {
  return (
    <MarketingSiteShell active="about">
      <h1 className={styles.title}>About Blirt</h1>
      <p className={styles.lede}>
        We believe the best part of any celebration isn&apos;t the decor or the playlist — it&apos;s what
        your people want to say to you.
      </p>
      <div className={styles.prose}>
        <p>
          Blirt is a simple way for guests to leave private video, voice, or text messages — and even
          dedicate a song — straight from their phones. No app download, no booth line, no awkward
          small talk with a camera operator.
        </p>
        <h2>For hosts</h2>
        <p>
          You create an event, share one link or QR code, and collect everything in a host dashboard:
          swipe through memories, open sweet envelopes, or export a keepsake PDF. You stay in
          control of what you keep.
        </p>
        <h2>For guests</h2>
        <p>
          Guests tap your link when the moment feels right — after a toast, from the table, or back
          at the hotel. It&apos;s their words, their timing, their truth.
        </p>
        <p>
          We&apos;re a small team based in Austin, Texas, building tools for real connection. Thanks
          for being early with us.
        </p>
      </div>
      <div className={styles.ctaRow}>
        <Link href="/guest" className={styles.btnPrimary}>
          Try a demo Blirt
        </Link>
        <Link href="/login" className={styles.btnGhost}>
          Create your event
        </Link>
      </div>
    </MarketingSiteShell>
  );
}
