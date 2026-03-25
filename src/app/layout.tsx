import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { DM_Sans, Fraunces } from 'next/font/google';

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-ui',
  display: 'swap',
});

/** Display: wordmark, headings, hero names */
const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-blirt',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'Blirt', template: '%s · Blirt' },
  description:
    'The realest part of any celebration. Guests leave video, voice, or text Blirts from their phones — no app required.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${dmSans.variable} ${fraunces.variable}`}>
        {children}
      </body>
    </html>
  );
}

