import { Cabin } from 'next/font/google';

import type { Metadata } from 'next';
import './globals.css';
import { ToastContainer } from '@/components/toast/ToastContainer';
import { ToastProvider } from '@/contexts/ToastContext';
import { THEME_INIT_SCRIPT } from '@/lib/theme/theme';

/**
 * The app's face, headings and body alike — downloaded at build time and served from
 * this app, so no screen waits on a third party to render its text. The design
 * system's own brand face is proprietary and not loadable; Cabin is its documented
 * substitute (project.md §Styling & Branding). Only the CSS variable is exposed here:
 * the family itself is wired to `--font-sans` in `globals.css`, so the face stays a
 * token like every colour does.
 */
const cabin = Cabin({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-cabin',
});

export const metadata: Metadata = {
  title: 'Employee Expenses',
  description:
    'Import, review and approve employee expense payment requests for reimbursement.',
};

/**
 * The shell every screen shares: the document, and the one place notifications are
 * shown from.
 *
 * It deliberately renders NO `<main>` of its own. Each screen supplies its own —
 * the signed-in shell in `(authenticated)/layout.tsx`, the sign-in screen its own —
 * because the app header has to be a SIBLING of `main` to be a `banner` landmark.
 * A `<main>` here would make every header a descendant of it and silently cost the
 * app that landmark (project's WCAG 2.2 AA bar, requirements §6.6.5).
 *
 * It is also where the light/dark version of the theme is decided — see the script
 * below.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    /*
     * `suppressHydrationWarning`: the script below marks the resolved version on this
     * element before React ever runs, so the served markup and the live document
     * differ here by design. It suppresses no error and hides no problem — it tells
     * React that this one element's class is set outside its control.
     */
    <html lang="en" suppressHydrationWarning>
      <head>
        {/*
          The light/dark decision, made BEFORE the browser paints anything (story 5
          AC-5). It has to be embedded in the document and blocking: an external
          script is a second request that can still be in flight while the first
          paint happens, and a React effect runs a frame too late — either way the
          user sees a flash of the wrong version. The decision itself lives in
          `lib/theme/theme.ts`, shared with the header's switch, so the two cannot
          drift apart.
        */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className={`${cabin.variable} font-sans antialiased`}>
        <ToastProvider>
          {children}
          <ToastContainer />
        </ToastProvider>
      </body>
    </html>
  );
}
