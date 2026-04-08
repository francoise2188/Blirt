import type { Metadata } from 'next';
import Link from 'next/link';
import { MarketingSiteShell } from '../../components/MarketingSiteShell';
import { formatBlogPostDate, getBlogPosts } from '../../lib/blogPosts';
import styles from '../marketing.module.css';

export const metadata: Metadata = {
  title: 'Blog',
  description:
    'Stories and updates from the Blirt team — celebrations, product notes, and the people who use them.',
};

export const revalidate = 60;

export default async function BlogPage() {
  const posts = await getBlogPosts();

  return (
    <MarketingSiteShell active="blog">
      <h1 className={styles.title}>Blog</h1>
      <p className={styles.lede}>
        Notes from our team on celebrations, product updates, and the real stories behind Blirt.
      </p>

      {posts.length === 0 ? (
        <p className={styles.lede}>
          Posts will appear here once they&apos;re loaded from the database. If you&apos;re the site owner,
          run <code className={styles.inlineCode}>supabase/blog_posts.sql</code> in the Supabase SQL Editor
          and confirm your environment variables are set.
        </p>
      ) : (
        posts.map((post) => (
          <article key={post.id} className={styles.card}>
            <p className={styles.postMeta}>{formatBlogPostDate(post.published_at)}</p>
            <h2 className={styles.postTitle}>{post.title}</h2>
            <p className={styles.postBody}>{post.excerpt}</p>
            {post.body?.trim() ? (
              <p className={`${styles.postBody} ${styles.postBodyContinued}`}>{post.body}</p>
            ) : null}
          </article>
        ))
      )}

      <p className={styles.lede} style={{ marginTop: 28, marginBottom: 0 }}>
        More posts are on the way. Follow{' '}
        <a
          href="https://www.instagram.com/blirt_it/"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'inherit', fontWeight: 700 }}
        >
          @blirt_it
        </a>{' '}
        on Instagram for day-to-day updates.
      </p>

      <div className={styles.ctaRow}>
        <Link href="/" className={styles.btnPrimary}>
          Back to home
        </Link>
        <Link href="/login" className={styles.btnGhost}>
          Create your event
        </Link>
      </div>
    </MarketingSiteShell>
  );
}
