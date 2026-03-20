import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { Inter, Dancing_Script } from 'next/font/google';

const uiFont = Inter({
  subsets: ['latin'],
  variable: '--font-ui',
  display: 'swap',
});

// Personality font for the Blirt wordmark + couple names.
const blirtWordmarkFont = Dancing_Script({
  weight: ['400', '600', '700'],
  subsets: ['latin'],
  variable: '--font-blirt',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Blirt',
  description: 'Skip the speech. Leave a Blirt.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${uiFont.variable} ${blirtWordmarkFont.variable}`}>
        {children}
      </body>
    </html>
  );
}

