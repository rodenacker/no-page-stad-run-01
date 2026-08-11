/**
 * Whether the reader is actually looking at this tab, for the one thing that must stop
 * happening when they are not: a screen that keeps itself current by asking the service
 * again every so often (`bulk-approval-and-live-refresh` BR6 — no polling while
 * backgrounded or hidden, resuming immediately on becoming visible again).
 *
 * Three things here are deliberate:
 *
 * - **It is the browser's own state, watched — never copied into React state.** The
 *   document already knows whether it is hidden before React runs, so it is read through
 *   `useSyncExternalStore`, exactly as the viewport width and the theme are. An effect
 *   that copied it into `useState` could disagree with the document, and the
 *   `react-hooks` lint rule rejects setting state inside an effect.
 * - **`hidden` is the only value that means hidden.** `document.visibilityState` is
 *   `visible`, `hidden` or (in some browsers) `prerender`; anything that is not `hidden`
 *   is a document the reader can see, so the check is written that way round rather than
 *   as an equality with `visible`, which would treat an unknown future value as absent.
 * - **The server answers "the reader is here".** A server render cannot know, and this
 *   value decides only whether a browser-side timer runs — nothing rendered depends on
 *   it — so the honest default is the one that lets the screen start keeping itself
 *   current the moment it hydrates.
 */

/** What the document reports when the reader has this tab in the background. */
const HIDDEN = 'hidden';

/** The event the document fires whenever that answer changes. */
export const VISIBILITY_CHANGE_EVENT = 'visibilitychange';

/**
 * Reports every change between the reader looking at this tab and looking elsewhere —
 * another tab, another window, a phone that has been locked — for as long as something
 * is watching.
 */
export const subscribeToPageVisibility = (
  onChange: () => void,
): (() => void) => {
  if (typeof document === 'undefined') {
    return () => {};
  }
  document.addEventListener(VISIBILITY_CHANGE_EVENT, onChange);
  return () => {
    document.removeEventListener(VISIBILITY_CHANGE_EVENT, onChange);
  };
};

/** Whether the reader can see this page right now. */
export const isPageVisible = (): boolean =>
  typeof document === 'undefined' || document.visibilityState !== HIDDEN;

/** What the server knows about it: nothing — see this module's header. */
export const isPageVisibleOnServer = (): boolean => true;
