import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'COMPANY INTEL — powered by Orthogonal',
  description: 'Enter a company domain and get an instant intelligence report. Powered by orthogonal.com.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Anton&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
