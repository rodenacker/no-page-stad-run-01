/**
 * How wide the reader's screen is, for the one case where a narrow viewport needs a
 * genuinely DIFFERENT presentation rather than a re-flowed one (brief R16: on a narrow
 * viewport each expense request is a card with an action overflow, not a wide table
 * inside a sideways-scrolling wrapper).
 *
 * Three things here are deliberate:
 *
 * - **It is the browser's own state, watched — never copied into React state.** The
 *   media query already has an answer before React runs, so it is read through
 *   `useSyncExternalStore` (the project convention for pre-existing browser state:
 *   the theme class, storage, a media query). An effect that copied it into `useState`
 *   could disagree with what is on screen, and the `react-hooks` lint rule rejects it.
 * - **The breakpoint is the same one Tailwind's `md:` uses** (768px), stated once here,
 *   so a JavaScript branch and a CSS one can never disagree about where "narrow" ends.
 * - **The server answers "not narrow".** A server render cannot know the width, and
 *   this app's request list is fetched in the BROWSER — so nothing width-dependent is
 *   ever server-rendered, and the honest default costs no flash of the wrong shape.
 */

/** Narrower than Tailwind's `md` breakpoint — i.e. phone width (NFR-base-3: ≥360px). */
export const NARROW_VIEWPORT_QUERY = '(max-width: 767px)';

/** The query itself, or `null` where there is no browser to ask. */
const narrowViewport = (): MediaQueryList | null =>
  typeof window === 'undefined' || typeof window.matchMedia !== 'function'
    ? null
    : window.matchMedia(NARROW_VIEWPORT_QUERY);

/**
 * Reports every change of width across the breakpoint — a rotated phone, a resized
 * window — for as long as something is watching.
 */
export const subscribeToViewportWidth = (
  onChange: () => void,
): (() => void) => {
  const query = narrowViewport();
  if (query === null) {
    return () => {};
  }
  query.addEventListener('change', onChange);
  return () => {
    query.removeEventListener('change', onChange);
  };
};

/** Whether the reader is on a narrow viewport right now. */
export const isNarrowViewport = (): boolean =>
  narrowViewport()?.matches ?? false;

/** What the server knows about the reader's width: nothing — see this module's header. */
export const isNarrowViewportOnServer = (): boolean => false;
