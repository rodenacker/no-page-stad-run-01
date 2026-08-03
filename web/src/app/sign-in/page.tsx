import { SignInForm } from '@/components/auth/SignInForm';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  SESSION_TIMED_OUT_MESSAGE,
  SESSION_TIMED_OUT_TITLE,
} from '@/lib/session/config';
import {
  SESSION_ENDED_PARAM,
  SESSION_TIMED_OUT_REASON,
} from '@/lib/utils/constants';

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
 *
 * It also explains a session that ended on its own. Anything that sends someone back
 * here because their session is over — the idle warning running out, or the server-side
 * gate finding the auth service has already ended it — asks for that explanation with
 * `?reason=session-timed-out`, and it is shown here in the user's own words rather than
 * leaving them at a blank form wondering what happened (R16/R17).
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const timedOut =
    (await searchParams)[SESSION_ENDED_PARAM] === SESSION_TIMED_OUT_REASON;

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
        <CardContent className="grid gap-6">
          {timedOut && (
            /*
              `role="note"`, not the primitive's default `role="alert"`: this is part of
              the screen the user has just arrived at, not an announcement of something
              that changed while they were reading it. The moment the session ended was
              already announced — as a notification, by the shell they were signed into —
              and a live region here would say the same sentence to a screen-reader user a
              second time. `text-foreground` on the description is this project's
              convention for wording the user has to act on (AA contrast).
            */
            <Alert role="note">
              <AlertTitle className="line-clamp-none">
                {SESSION_TIMED_OUT_TITLE}
              </AlertTitle>
              <AlertDescription className="text-foreground">
                {SESSION_TIMED_OUT_MESSAGE}
              </AlertDescription>
            </Alert>
          )}
          <SignInForm />
        </CardContent>
      </Card>
    </main>
  );
}
