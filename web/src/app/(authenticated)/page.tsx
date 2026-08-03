/**
 * The app's front door for a signed-in user — and the whole app's front door, since
 * it sits at `/` inside the gated route group. This REPLACES the starter template's
 * welcome page: a signed-out visitor typing the app's address is redirected to the
 * sign-in screen by the layout's gate instead of being greeted by a page that has
 * nothing to do with this project (CLAUDE.md §6, AC-3).
 *
 * Story 4 adds the role-aware entry points below the introduction; the signed-in
 * person's own name and role are shown once, by the shell's header.
 */
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Employee Expenses',
  description:
    'Import batches of employee expense payment requests and review the requests waiting for a decision.',
};

export default function SignedInHomePage() {
  return (
    <section className="grid gap-3">
      <h1 className="text-2xl font-semibold tracking-tight">
        Employee expenses
      </h1>
      <p className="text-muted-foreground max-w-prose">
        Import batches of employee expense payment requests, and review the
        requests waiting for a decision.
      </p>
    </section>
  );
}
