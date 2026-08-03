'use client';

/**
 * Sign out — the control that really ends the session.
 *
 * Two things about it are deliberate (epic `sign-in-and-app-shell` R2, BR4,
 * bff-auth-pattern.md Rule 8):
 *
 * - It WAITS for the auth service. The user is sent back to the sign-in screen only
 *   after `POST /v1/auth/logout` confirms the session is over; a failed call shows
 *   an error and leaves them exactly where they were, still signed in. Redirecting
 *   regardless would look identical to a successful sign-out while the session
 *   stayed alive on the service.
 * - It is a CLIENT component, and the call is a browser call through the shared API
 *   client (CLAUDE.md §2) rather than a Server Action: the branch on the result
 *   happens in the browser, and the service's cookie-clearing response has to reach
 *   the browser to take effect.
 *
 * It renders a single plain button, so it works on its own as well as inside the
 * header's user menu — where `DropdownMenuItem asChild` hands it the menu-item
 * behaviour (role, keyboard handling) through the props spread below.
 */

import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { useToast } from '@/contexts/ToastContext';
import {
  SIGN_OUT_FAILED_TITLE,
  signOut,
  signOutFailureMessage,
} from '@/lib/auth/signOutApi';
import { cn } from '@/lib/utils';
import { SIGN_IN_ROUTE } from '@/lib/utils/constants';

import type { ComponentProps, MouseEvent } from 'react';

/**
 * Everything a button takes, minus its label — the wording is fixed, because it is
 * what the user (and the tests) look for.
 */
type SignOutButtonProps = Omit<ComponentProps<typeof Button>, 'children'>;

export function SignOutButton({
  className,
  onClick,
  ...props
}: SignOutButtonProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [signingOut, setSigningOut] = useState(false);

  const endSession = async (): Promise<void> => {
    setSigningOut(true);
    try {
      await signOut();
      // Only now is the session actually over. `replace` rather than `push`: the
      // screen the user just left is no longer theirs to go back to, so it does not
      // stay in their history (AC-4).
      router.replace(SIGN_IN_ROUTE);
      // Nothing the router already holds was rendered for a signed-out visitor.
      router.refresh();
    } catch (error) {
      setSigningOut(false);
      showToast({
        variant: 'error',
        title: SIGN_OUT_FAILED_TITLE,
        message: signOutFailureMessage(error),
      });
    }
  };

  const handleClick = (event: MouseEvent<HTMLButtonElement>): void => {
    // The menu's own click handling (closing it) still runs when this button is the
    // menu's item; composing rather than replacing is what keeps that true.
    onClick?.(event);
    void endSession();
  };

  return (
    <Button
      type="button"
      variant="ghost"
      disabled={signingOut}
      {...props}
      onClick={handleClick}
      className={cn('w-full justify-start', className)}
    >
      <LogOut aria-hidden="true" />
      Sign out
    </Button>
  );
}
