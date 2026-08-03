import type { Metadata } from 'next';
import './globals.css';
import { ToastContainer } from '@/components/toast/ToastContainer';
import { ToastProvider } from '@/contexts/ToastContext';

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
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <ToastProvider>
          {children}
          <ToastContainer />
        </ToastProvider>
      </body>
    </html>
  );
}
