import { Azeret_Mono, Public_Sans } from 'next/font/google';

import type { Metadata } from 'next';
import './globals.css';
import { ToastContainer } from '@/components/toast/ToastContainer';
import { ToastProvider } from '@/contexts/ToastContext';
import { THEME_INIT_SCRIPT } from '@/lib/theme/theme';

/**
 * THE APP'S TWO FACES — two, no more (project.md §Styling & Branding).
 *
 * Both are downloaded at build time and served from this app, so no screen waits on a
 * third party to render its text. Each exposes ONLY a CSS variable: the families
 * themselves are wired to `--font-sans` and `--font-mono` in `globals.css`, so a face
 * stays a token like every colour does and no component ever names one — which is what
 * keeps a face swap a change to this one file.
 *
 * Both are loaded as variable fonts across the whole 100-900 weight axis, because the
 * design's hierarchy is carried by scale and weight contrast rather than by borders or
 * fills (documentation/design-brief-batch-listing.md §3).
 *
 * Public Sans is the institutional-forms text face (US Web Design System, from Libre
 * Franklin) and sets every word in the app. It replaces Cabin, which was only ever a
 * stand-in for the design system's unloadable proprietary "Barclays Effra" and never a
 * brand decision (user-confirmed 2026-08-17). Do not attempt to source that face.
 */
const publicSans = Public_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-public-sans',
});

/**
 * Azeret Mono is the squarish institutional monospace that carries the fixed-field
 * notation this design is built on: figures, references, masked account numbers,
 * control totals and field labels. Which elements take it is decided by the screens
 * that show those things, always through the `--font-mono` token.
 */
const azeretMono = Azeret_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-azeret-mono',
});

/**
 * THE DIRECTION CONTRACT (R23/BR10) — the design's intent, written into the page the
 * app serves so that what shipped can be checked against what was agreed. It names the
 * confirmed direction's own seed key (`29469d17`) and closes with the verbatim FINISH
 * line, and it has to survive the production build: `grep -rl "29469d17" web/.next`
 * after `npm run build` is the check, and an empty result is a failure.
 *
 * It is an HTML COMMENT, which React cannot render as a node at all — a `{...}` JSX
 * comment is compiled away and a `'<!-- ... -->'` string child is escaped into visible
 * text. So it is emitted as raw markup, which is what `dangerouslySetInnerHTML`
 * writes into the streamed output.
 *
 * It is carried by an inert `hidden` wrapper rather than written straight into the
 * `<body>` element, and that placement is deliberate. Raw markup on `<body>` itself
 * lands one position earlier in the served bytes, but React forbids children beside
 * `dangerouslySetInnerHTML`, so the app's own content would have to move outside
 * `<body>` — and React then re-applies that markup on the next client re-render,
 * which `router.refresh()` triggers on sign-in, sign-out and session timeout, wiping
 * every rendered screen out of the document. Verified by experiment. This wrapper is
 * the highest position in `<body>` the app can hold without that hazard; Next.js's own
 * streaming-metadata element is the only thing ahead of it.
 */
const DIRECTION_CONTRACT = {
  __html: `<!--
  THESIS: the screen is the batch's own control document, worked down to zero, not a
  dashboard containing a table.
  OWN-WORLD: the clearing-house payment batch listing and its appended reject listing
  (seed key 29469d17). Machine notation; alignment is the only structure; hairline
  rules only where a rule carries meaning; no cards, pills or container chrome.
  STORY: control block, ruled field strip, listing, continuation line. The reader scans
  a two-character gutter for exceptions and drives AWAITING DECISION to zero.
  FIRST VIEWPORT: a full-bleed brand-accent control block carrying AWAITING DECISION at
  display scale, the largest element on screen, above the narrowing strip and the first
  rows.
  FORM: Public Sans for words, Azeret Mono for figures, references and labels; roughly
  8:1 scale contrast; light primary, dark an equal citizen.
  FINISH: unreviewed and undocumented is unfinished; this build ends with the finish
  review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
-->`,
};

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
        {/*
          THEME_INIT_SCRIPT is a module constant assembled only from three other module
          constants (THEME_STORAGE_KEY, PREFERS_DARK_QUERY, DARK_THEME_CLASS), each embedded
          via JSON.stringify. No user input, request data or environment value reaches it, so
          there is nothing to sanitize — and running JavaScript through an HTML sanitizer would
          only corrupt it. Verified against lib/theme/theme.ts.
        */}
        {/* // security-ignore: xss — static module constant, no user input; see lib/theme/theme.ts */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body
        className={`${publicSans.variable} ${azeretMono.variable} font-sans antialiased`}
      >
        {/* // security-ignore: xss — DIRECTION_CONTRACT is a static module constant declared above: an HTML comment hand-written in this file, with no user input, request data or environment value anywhere in it. */}
        <div hidden dangerouslySetInnerHTML={DIRECTION_CONTRACT} />
        <ToastProvider>
          {children}
          <ToastContainer />
        </ToastProvider>
      </body>
    </html>
  );
}
