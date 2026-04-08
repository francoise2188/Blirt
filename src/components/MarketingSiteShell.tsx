import Link from 'next/link';
import type { ReactNode } from 'react';
import styles from '../app/marketing.module.css';

type NavKey = 'home' | 'about' | 'blog';

export function MarketingSiteShell({
  active,
  children,
}: {
  active: NavKey;
  children: ReactNode;
}) {
  return (
    <div className={styles.shell}>
      <header>
        <nav className={styles.nav} aria-label="Site">
          <Link href="/" className={styles.navWordmark}>
            Blirt
          </Link>
          <div className={styles.navLinks}>
            <Link
              href="/"
              className={`${styles.navLink} ${active === 'home' ? styles.navLinkActive : ''}`}
            >
              Home
            </Link>
            <Link
              href="/about"
              className={`${styles.navLink} ${active === 'about' ? styles.navLinkActive : ''}`}
            >
              About
            </Link>
            <Link
              href="/blog"
              className={`${styles.navLink} ${active === 'blog' ? styles.navLinkActive : ''}`}
            >
              Blog
            </Link>
            <Link href="/login" className={styles.navLink}>
              Host login
            </Link>
          </div>
        </nav>
      </header>
      <main className={styles.main}>{children}</main>
      <footer className={styles.footer}>
        <p className={styles.footerLinks}>
          <Link href="/">Home</Link>
          {' · '}
          <Link href="/about">About</Link>
          {' · '}
          <Link href="/blog">Blog</Link>
          {' · '}
          <Link href="/login">Host login</Link>
        </p>
        <p className={styles.footerDomain}>blirt-it.com</p>
      </footer>
    </div>
  );
}
