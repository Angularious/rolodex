import type { Metadata } from 'next';
import { Newsreader, Instrument_Sans, IBM_Plex_Mono, Space_Grotesk } from 'next/font/google';
import './globals.css';

// Type system mirrors tryclean.ai's: a serif for big editorial headlines
// (italic accent words), a mono for HUD/section labels, a clean sans for body,
// and a geometric display face for the wordmark (free stand-in for `lastik`).
const serif = Newsreader({
  subsets: ['latin'],
  weight: ['400', '500'],
  style: ['normal', 'italic'],
  variable: '--font-serif',
  display: 'swap',
});
const sans = Instrument_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});
const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});
const display = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '700'],
  variable: '--font-display',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'COMPANY ROLODEX — powered by Orthogonal',
  description: 'Enter a company domain and get an instant intelligence report. Powered by orthogonal.com.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${serif.variable} ${sans.variable} ${mono.variable} ${display.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
