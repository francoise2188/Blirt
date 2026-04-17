import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Experience',
  description: 'Relive kept soundtrack messages, song previews, and guest recordings.',
};

export default function ExperienceLayout({ children }: { children: ReactNode }) {
  return children;
}
