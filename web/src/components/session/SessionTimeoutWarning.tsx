'use client';

/**
 * The warning an idle user gets shortly before their session ends — and the graceful
 * way back to the sign-in screen when it does (epic `sign-in-and-app-shell` R16/R17).
 *
 * It is mounted once, by the signed-in shell, and renders nothing at all while the user
 * is active. What it does:
 *
 * - **Warns before the end, not after it.** One warning lead-time before the idle period
 *   runs out (working defaults: 30 minutes idle, 60 seconds of warning — both
 *   configurable, see `lib/session/config.ts`), it opens an alert dialog with a live
 *   countdown and one action: stay signed in. That satisfies WCAG 2.2 SC 2.2.1 (Timing
 *   Adjustable) — the user is warned well before the limit and can extend it with a
 *   single action — and the dialog is a real `alertdialog`, announced on open and
 *   keyboard-operable, with focus placed on that action rather than left behind.
 * - **Keeps the user signed in for real.** Choosing to stay touches the session at the
 *   auth service; only a successful answer restarts the idle window. Nothing is
 *   "dismissed" locally while the session quietly expires anyway.
 * - **Explains an ended session in plain words.** Whether the idle period ran out, or
 *   the touch comes back 401 because the service had already ended the session, the user
 *   is returned to the sign-in screen with the SAME sentence
 *   (`SESSION_TIMED_OUT_MESSAGE`) — never the API client's raw "Unauthorized: …".
 *
 * **There is no absolute-session timer here, deliberately.** The auth service owns any
 * absolute cap (R17); this app asserts no session lifetime of its own and only reacts to
 * what the service says.
 *
 * How the timing is watched matters as much as what it does: the idle clock lives
 * outside React in `lib/session/idleSession.ts`, and this component *watches* it
 * (`useSyncExternalStore`) and *subscribes* to the moment it runs out. No effect here
 * copies that clock into React state — the same convention the header's theme switch
 * follows (`generated-docs/architecture.md`).
 */

import { TriangleAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/contexts/ToastContext';
import { serviceMessageOf, statusCodeOf } from '@/lib/api/errors';
import { signOut } from '@/lib/auth/signOutApi';
import {
  SESSION_TIMED_OUT_MESSAGE,
  SESSION_TIMED_OUT_TITLE,
} from '@/lib/session/config';
import {
  idleSessionStatus,
  idleSessionStatusOnServer,
  keepSessionAlive,
  subscribeToIdleExpiry,
  subscribeToIdleSession,
} from '@/lib/session/idleSession';
import { touchSession } from '@/lib/session/sessionApi';
import { SIGN_IN_TIMED_OUT_ROUTE } from '@/lib/utils/constants';

/** Heading for a failed attempt to stay signed in — names what did not happen. */
const STAY_SIGNED_IN_FAILED_TITLE = 'Could not confirm your session';

/**
 * Shown when that attempt failed with nothing readable from the service. It says what is
 * still true — the countdown is still running — and what to do (project.md NFR-base-5);
 * the warning stays on screen, so trying again is one press away.
 */
const STAY_SIGNED_IN_UNAVAILABLE_MESSAGE =
  'We could not reach the service to confirm your session. Please try again.';

/** The countdown, worded for a person: "in 1 second", not "in 1 seconds". */
const secondsWording = (seconds: number): string =>
  seconds === 1 ? '1 second' : `${seconds} seconds`;

/** A refusal from the auth service means this session is over, not that a call failed. */
const isSessionGone = (error: unknown): boolean => {
  const statusCode = statusCodeOf(error);
  return statusCode === 401 || statusCode === 403;
};

export function SessionTimeoutWarning() {
  const router = useRouter();
  const { showToast } = useToast();

  // The idle clock is browser state, watched rather than mirrored: this reads where the
  // idle window stands on every render and re-renders when it moves (once a second while
  // the countdown is on screen, and not at all while the user is active).
  const status = useSyncExternalStore(
    subscribeToIdleSession,
    idleSessionStatus,
    idleSessionStatusOnServer,
  );

  const [confirming, setConfirming] = useState(false);
  const [sessionOver, setSessionOver] = useState(false);
  const stayAction = useRef<HTMLButtonElement>(null);

  /**
   * The end of the session, however it was reached: the warning goes away, the user is
   * told plainly what happened, and they land back on the sign-in screen — which carries
   * the same sentence, so it is still there once they arrive.
   */
  const returnToSignIn = useCallback((): void => {
    setSessionOver(true);
    showToast({
      variant: 'warning',
      title: SESSION_TIMED_OUT_TITLE,
      message: SESSION_TIMED_OUT_MESSAGE,
    });
    // `replace`, not `push`: the screen they were on is not theirs to go back to.
    router.replace(SIGN_IN_TIMED_OUT_ROUTE);
    // Nothing the router already holds was rendered for a signed-out visitor.
    router.refresh();
  }, [router, showToast]);

  /**
   * The idle period ran out. The service is told, but the user is not kept waiting on
   * that call to be returned to the sign-in screen: their session has ended either way,
   * and leaving them looking at a stale screen while a revoke request hangs would be the
   * worse outcome. (The header's own Sign out control is the opposite case, and does wait
   * — brief BR4 — because there the user asked for it and needs to know it worked.)
   */
  const onIdleExpiry = useCallback((): void => {
    void signOut().catch(() => {
      // Best effort. The session is over from this app's point of view regardless, and
      // the service enforces its own end (R17).
    });
    returnToSignIn();
  }, [returnToSignIn]);

  // Subscribe only. The work above happens when the clock says so, never as part of
  // this effect — see the note about `useSyncExternalStore` at the top of the file.
  useEffect(() => subscribeToIdleExpiry(onIdleExpiry), [onIdleExpiry]);

  const staySignedIn = async (): Promise<void> => {
    setConfirming(true);
    try {
      await touchSession();
      // Confirmed alive: the idle window starts over, which is what closes the warning.
      keepSessionAlive();
    } catch (error) {
      if (isSessionGone(error)) {
        // The service had already ended this session — the same ending as running out of
        // idle time, and the user is given the same explanation for it.
        returnToSignIn();
        return;
      }
      // Anything else (the service unreachable, a 500) is not proof the session ended, so
      // nobody is signed out over it. The warning stays up and can be retried.
      showToast({
        variant: 'error',
        title: STAY_SIGNED_IN_FAILED_TITLE,
        message: serviceMessageOf(error) ?? STAY_SIGNED_IN_UNAVAILABLE_MESSAGE,
      });
    } finally {
      setConfirming(false);
    }
  };

  return (
    <AlertDialog open={!sessionOver && status.phase === 'warning'}>
      <AlertDialogContent
        // Focus goes to the one thing worth doing here. Radix would otherwise focus its
        // Cancel element, and this dialog has none by design (the alternative to staying
        // signed in is simply letting the countdown finish) — which would leave focus
        // outside the dialog altogether, unusable by keyboard.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          stayAction.current?.focus();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogMedia className="text-warning">
            <TriangleAlert aria-hidden="true" />
          </AlertDialogMedia>
          <AlertDialogTitle>Are you still there?</AlertDialogTitle>
          <AlertDialogDescription>
            You have not used the app for a while, so you will be signed out in{' '}
            {secondsWording(status.secondsRemaining)}. Choose Stay signed in to
            carry on where you left off.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction
            ref={stayAction}
            type="button"
            disabled={confirming}
            onClick={(event) => {
              // Keep the dialog's own state in this component's hands: it closes when the
              // session is confirmed alive, not the instant the button is pressed.
              event.preventDefault();
              void staySignedIn();
            }}
          >
            Stay signed in
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
