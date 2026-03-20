import Link from 'next/link';
import styles from './page.module.css';

export default function HomePage() {
  return (
    <main className={styles.main}>
      <div className={styles.card}>
        <div className={styles.wordmark}>Blirt</div>
        <h1 className={styles.title}>Skip the speech. Leave a Blirt.</h1>
        <p className={styles.subtitle}>
          Guests leave a Blirt from their phone. Hosts sign in to manage prompts, QR codes, and
          exports.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
          <Link href="/guest?event=demo" className={styles.startButton}>
            Try guest (demo)
          </Link>
          <Link
            href="/login"
            className={styles.startButton}
            style={{
              background: 'rgba(21,21,21,0.08)',
              color: 'inherit',
              boxShadow: 'none',
            }}
          >
            Host login
          </Link>
        </div>
      </div>
    </main>
  );
}

