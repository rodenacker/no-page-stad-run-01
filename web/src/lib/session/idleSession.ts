/**
 * Watching how long the user has been idle — outside React, because that is what it
 * is: a clock and a few browser events, neither of which belongs in component state.
 *
 * A component *watches* this the same way the header's theme switch watches the
 * document (`useSyncExternalStore` — see `lib/theme/theme.ts` and the convention in
 * `generated-docs/architecture.md`): `subscribeToIdleSession` + `idleSessionStatus`
 * report where the idle window stands, and `subscribeToIdleExpiry` reports the one
 * moment it runs out. Nothing here is copied into React state by an effect.
 *
 * Two implementation choices carry the behaviour:
 *
 * - **It compares timestamps; it never counts down a tally.** Every decision is
 *   `Date.now() - lastActivityAt` against the configured thresholds, and each timer
 *   only exists to ask that question again. So a laptop that slept, a tab the browser
 *   throttled in the background, or a clock that jumped all read correctly — where a
 *   "subtract one second per tick" counter would drift and under-report.
 * - **Ordinary activity is a single timestamp write.** Moving the pointer does not
 *   reschedule anything; the pending check recomputes from the timestamp when it
 *   fires. That keeps an active user's cost to one assignment per event.
 *
 * Activity stops counting once the warning is showing: from that point the user is
 * being asked an explicit question, and the answer has to be an explicit one
 * ("Stay signed in" → `keepSessionAlive`). Otherwise the mouse movement that reaches
 * for the dialog, or the focus the dialog itself takes, would silently answer it.
 */
import { SESSION_IDLE_TIMEOUT_MS, SESSION_WARNING_LEAD_MS } from './config';

/**
 * Where the idle window stands: still `active`, in the `warning` run-up to the end, or
 * `expired` — the idle period has run out and the session is over.
 */
export type IdlePhase = 'active' | 'warning' | 'expired';

export interface IdleSessionStatus {
  readonly phase: IdlePhase;
  /** Whole seconds until the session ends — what the countdown in the warning shows. */
  readonly secondsRemaining: number;
}

/** How long the user may be idle before the warning is due. */
const WARNING_DUE_AFTER_MS = SESSION_IDLE_TIMEOUT_MS - SESSION_WARNING_LEAD_MS;

/** How often the countdown is refreshed while the warning is on screen. */
const COUNTDOWN_STEP_MS = 1000;

const secondsFrom = (ms: number): number => Math.ceil(ms / 1000);

/**
 * The two settled statuses are single frozen objects, so a status that has not
 * changed is the SAME value every time it is read — which is what `useSyncExternalStore`
 * requires of a snapshot, and what keeps an active session from re-rendering anything.
 */
const ACTIVE: IdleSessionStatus = {
  phase: 'active',
  secondsRemaining: secondsFrom(SESSION_IDLE_TIMEOUT_MS),
};
const EXPIRED: IdleSessionStatus = { phase: 'expired', secondsRemaining: 0 };

/**
 * What counts as the user being here. Listened for on `window` in the capture phase so
 * events that do not bubble (`scroll`) are still seen, and passively so none of this
 * can hold up scrolling or typing.
 */
const ACTIVITY_EVENTS = [
  'pointerdown',
  'pointermove',
  'keydown',
  'wheel',
  'touchstart',
  'scroll',
] as const;

const ACTIVITY_LISTENER_OPTIONS: AddEventListenerOptions = {
  capture: true,
  passive: true,
};

let status: IdleSessionStatus = ACTIVE;
let lastActivityAt = 0;
let nextCheck: ReturnType<typeof setTimeout> | null = null;
const statusListeners = new Set<() => void>();
const expiryListeners = new Set<() => void>();

const publish = (next: IdleSessionStatus): void => {
  if (
    next.phase === status.phase &&
    next.secondsRemaining === status.secondsRemaining
  ) {
    return;
  }
  status = next;
  statusListeners.forEach((notify) => notify());
};

const cancelNextCheck = (): void => {
  if (nextCheck !== null) {
    clearTimeout(nextCheck);
    nextCheck = null;
  }
};

const checkIn = (ms: number): void => {
  cancelNextCheck();
  nextCheck = setTimeout(check, Math.max(ms, 0));
};

/**
 * Ask the clock where things stand, publish it, and arrange the next question for the
 * moment it could next change — the warning threshold while the user is active, the
 * next second of the countdown while the warning is up, nothing at all once the idle
 * period has run out (the caller is on its way to the sign-in screen by then).
 */
function check(): void {
  nextCheck = null;
  const idleFor = Date.now() - lastActivityAt;
  const msUntilEnd = SESSION_IDLE_TIMEOUT_MS - idleFor;

  if (msUntilEnd <= 0) {
    const alreadyExpired = status.phase === 'expired';
    publish(EXPIRED);
    if (!alreadyExpired) {
      expiryListeners.forEach((notify) => notify());
    }
    return;
  }

  if (idleFor >= WARNING_DUE_AFTER_MS) {
    publish({ phase: 'warning', secondsRemaining: secondsFrom(msUntilEnd) });
    checkIn(Math.min(COUNTDOWN_STEP_MS, msUntilEnd));
    return;
  }

  publish(ACTIVE);
  checkIn(WARNING_DUE_AFTER_MS - idleFor);
}

/** The idle window starts over, counting from the given moment. */
const restart = (from: number): void => {
  lastActivityAt = from;
  // Asking straight away rather than assuming "active": an adopted start (below) can
  // already be past a threshold, and `check` is the one place that decides which.
  check();
};

/**
 * When this page arrived in the browser, on the same clock as `Date.now()`:
 * `performance.now()` is the time since the document started, so taking it off the
 * current time gives the moment it started.
 */
const documentArrivedAt = (): number => {
  const arrived = Date.now() - performance.now();
  return Number.isFinite(arrived) ? arrived : Date.now();
};

/** The performance entry a browser records for a document's first real user input. */
const FIRST_INPUT_ENTRY = 'first-input';

/**
 * Whether this document has never been interacted with — no click, key or tap since it
 * arrived.
 *
 * The browser's record of its own first user input is the answer, and it is the RIGHT
 * source: it exists only if a real input actually happened. (`navigator.userActivation`
 * looks like the natural API for this and is not usable — it reports "has been active"
 * on a document nobody has touched, including under test automation, so it can never
 * say "untouched".) A browser that does not record the entry cannot say either way, and
 * is answered "touched" — the cautious answer, which keeps the plain behaviour below.
 */
const documentUntouched = (): boolean => {
  if (
    typeof PerformanceObserver === 'undefined' ||
    !PerformanceObserver.supportedEntryTypes?.includes(FIRST_INPUT_ENTRY)
  ) {
    return false;
  }
  return performance.getEntriesByType(FIRST_INPUT_ENTRY).length === 0;
};

/**
 * Where the count starts when watching begins.
 *
 * Normally: now. But for a page the user has never touched, the honest start is when the
 * page ARRIVED, not when this code happened to run — nobody could have interacted in
 * between, and on a slow first load the gap between the two is seconds of idle time the
 * user never had (it also makes the behaviour independent of how long the app took to
 * start up, which is what a test driving a virtual clock relies on). A page reached by
 * clicking through the app — straight after signing in, say — has been touched, so it
 * counts from now and can never inherit an old page's arrival time.
 */
const idleWindowStart = (): number =>
  documentUntouched() ? Math.min(documentArrivedAt(), Date.now()) : Date.now();

/**
 * A sign of life from the user. Cheap by design: the pending check recomputes from
 * this timestamp on its own, so there is nothing to reschedule here.
 */
const onUserActivity = (): void => {
  if (status.phase !== 'active') return;
  lastActivityAt = Date.now();
};

const startWatching = (): void => {
  ACTIVITY_EVENTS.forEach((type) => {
    window.addEventListener(type, onUserActivity, ACTIVITY_LISTENER_OPTIONS);
  });
  restart(idleWindowStart());
};

const stopWatching = (): void => {
  ACTIVITY_EVENTS.forEach((type) => {
    window.removeEventListener(type, onUserActivity, ACTIVITY_LISTENER_OPTIONS);
  });
  cancelNextCheck();
  status = ACTIVE;
  lastActivityAt = 0;
};

/**
 * Watch where the idle window stands. Watching is what starts the clock — the first
 * subscriber begins it, the last one to leave stops it — so nothing runs on a screen
 * that does not need it. Returns the function that stops watching.
 */
export const subscribeToIdleSession = (onChange: () => void): (() => void) => {
  statusListeners.add(onChange);
  if (statusListeners.size === 1) {
    startWatching();
  }
  return () => {
    statusListeners.delete(onChange);
    if (statusListeners.size === 0) {
      stopWatching();
    }
  };
};

/** Where the idle window stands this instant. */
export const idleSessionStatus = (): IdleSessionStatus => status;

/**
 * On the server nobody has been idle yet: rendering says nothing about the session
 * ending, and the real answer is in place as soon as the page is interactive.
 */
export const idleSessionStatusOnServer = (): IdleSessionStatus => ACTIVE;

/**
 * Be told the one moment the idle period runs out. A separate subscription from the
 * status above because it is a separate kind of thing: the status is something to
 * render, this is something to *do* — so a component can subscribe to it and act,
 * without watching for the change itself. Returns the function that stops listening.
 */
export const subscribeToIdleExpiry = (onExpiry: () => void): (() => void) => {
  expiryListeners.add(onExpiry);
  return () => {
    expiryListeners.delete(onExpiry);
  };
};

/**
 * The user said they want to stay: the idle window starts over from now, whatever
 * phase it was in. This is the only way out of the warning, which is why it is
 * separate from the passive activity above.
 */
export const keepSessionAlive = (): void => {
  restart(Date.now());
};
