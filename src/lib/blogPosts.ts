import { createClient } from '@supabase/supabase-js';

export type BlogPostRow = {
  id: string;
  title: string;
  excerpt: string;
  body: string | null;
  published_at: string | null;
};

/** Display date like "March 2026" */
export function formatBlogPostDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/** Server-side fetch for /blog — uses anon key + RLS (published rows only). */
export async function getBlogPosts(): Promise<BlogPostRow[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return [];
  }

  const supabase = createClient(url, key);
  const { data, error } = await supabase
    .from('blog_posts')
    .select('id, title, excerpt, body, published_at')
    .eq('is_published', true)
    .order('published_at', { ascending: false });

  if (error) {
    console.error('[blogPosts]', error.message);
    return [];
  }

  return (data ?? []) as BlogPostRow[];
}
