import { SignInForm } from '@/components/auth/SignInForm';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign in — Employee Expenses',
  description:
    'Sign in to review and approve employee expense payment requests.',
};

/**
 * The only screen reachable without a session. It stays a server component — the
 * interactive part is the `SignInForm` client component — so nothing but the form
 * itself is shipped to the browser.
 *
 * It supplies its own `<main>` landmark: the root layout provides none, so that the
 * signed-in shell's header can be a sibling of `main` rather than sit inside it.
 */
export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>
            <h1 className="text-xl">Sign in</h1>
          </CardTitle>
          <CardDescription>
            Sign in with your username and password to reach the expense
            screens.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SignInForm />
        </CardContent>
      </Card>
    </main>
  );
}
