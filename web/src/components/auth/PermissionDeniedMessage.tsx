/**
 * What a signed-in person sees when they open an address their roles exclude —
 * typed in, bookmarked, or followed from an old link (brief R11, R13).
 *
 * Three things make this a usable answer rather than a dead end:
 *  - It renders as a normal screen INSIDE the signed-in shell, so the header, the
 *    user's own name and the way out are all still there. No browser error page, no
 *    generic not-found, no blank screen.
 *  - It NAMES the permission that is missing, in the wording the requirements use
 *    (§6.5), so the user can ask for exactly the right thing — and says who to ask
 *    (§6.4 recovery: request the missing access from the account holder).
 *  - It offers a way onward to a screen the person may actually use. That is always
 *    the signed-in landing screen, where their own entry points are offered — never
 *    a link back to the address that was just refused, which would only refuse them
 *    again.
 *
 * The `alert` primitive's default variant is used deliberately: its destructive
 * variant paints the description at reduced opacity, which does not clear WCAG 2.2
 * AA contrast (the project's bar, requirements §6.6.5) for wording a user has to
 * act on. The title's one-line clamp is released too, so it wraps on a narrow
 * screen instead of being cut off.
 */
import { ShieldAlert } from 'lucide-react';
import Link from 'next/link';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { accessEntryFor, LANDING_PATH } from '@/lib/auth/access-map';

export function PermissionDeniedMessage({
  deniedPath,
}: {
  deniedPath: string;
}) {
  const permission = accessEntryFor(deniedPath)?.permission;

  return (
    <section className="grid max-w-prose gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Access needed</h1>

      <Alert>
        <ShieldAlert aria-hidden="true" />
        <AlertTitle className="line-clamp-none">
          You do not have the permission this screen needs
        </AlertTitle>
        <AlertDescription className="text-foreground gap-3">
          {permission ? (
            <p>
              This screen needs the{' '}
              <strong className="font-medium">{permission}</strong> permission,
              and your account does not have it.
            </p>
          ) : (
            <p>
              Your account does not have permission to open{' '}
              <strong className="font-medium">{deniedPath}</strong>.
            </p>
          )}
          <p>
            Request the missing access from the account holder. Once it is
            granted, this screen opens normally.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link href={LANDING_PATH}>Back to what you can do</Link>
          </Button>
        </AlertDescription>
      </Alert>
    </section>
  );
}
