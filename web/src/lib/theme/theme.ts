/**
 * One place decides which version of the theme is showing — light or dark — so the
 * two things that need that answer can never disagree:
 *
 * 1. The blocking inline script the root layout puts in `<head>`, which runs BEFORE
 *    the browser paints anything (`THEME_INIT_SCRIPT`).
 * 2. The header's `ThemeToggle`, which flips it afterwards.
 *
 * The active version lives outside React — it is a class on the document itself, set
 * before React exists. So this module also exposes it as something React can *watch*
 * (`activeTheme` + `subscribeToTheme`), rather than something React keeps a private
 * copy of. A private copy would have to be filled in after mounting, which both
 * risks disagreeing with what is on screen and is the wrong shape for the job.
 *
 * The order of precedence is fixed (project.md §Styling & Branding, story 5 AC-2/AC-4):
 * a version the user chose for themselves wins; with no choice of their own, the
 * computer's own light/dark setting decides.
 *
 * Why the script and not a React effect: an effect runs only after hydration, which
 * is at least one painted frame too late — the user would see the wrong version flash
 * up first. The script is part of the served document, so it has already run by the
 * time anything is on screen (project.md `[IMPLEMENTATION TRAP]`).
 */

export type Theme = 'light' | 'dark';

/**
 * Where a chosen version is remembered. `localStorage` rather than a cookie: it is
 * this browser's own display preference, carries no personal data (project.md
 * §Compliance — POPIA), and the before-paint script has to be able to read it
 * synchronously.
 */
export const THEME_STORAGE_KEY = 'employee-expenses.theme';

/** The class on `<html>` that turns the dark token block on (`globals.css`). */
export const DARK_THEME_CLASS = 'dark';

/** The query that reports the computer's own light/dark setting. */
export const PREFERS_DARK_QUERY = '(prefers-color-scheme: dark)';

/**
 * Announced on `window` every time the active version is applied, so anything on
 * screen that names the current version can follow it. Namespaced so it cannot collide
 * with a browser or library event.
 */
export const THEME_CHANGE_EVENT = 'employee-expenses:themechange';

const isTheme = (value: unknown): value is Theme =>
  value === 'light' || value === 'dark';

/**
 * The version the user chose for themselves, or `null` if they never chose one.
 * Storage can be unavailable (private browsing, blocked storage) — that is not an
 * error worth showing anyone, it just means there is no remembered choice.
 */
export function storedTheme(): Theme | null {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(stored) ? stored : null;
  } catch {
    return null;
  }
}

/** The version the computer is set to. */
export function systemTheme(): Theme {
  return window.matchMedia(PREFERS_DARK_QUERY).matches ? 'dark' : 'light';
}

/** The version that should be on screen right now: own choice first, else the computer's. */
export function resolveTheme(): Theme {
  return storedTheme() ?? systemTheme();
}

/**
 * The version that IS on screen this instant, read back from the document itself —
 * the same mark the before-paint script sets and `applyTheme` changes. Reading the
 * truth rather than a remembered copy is why the header switch can never end up
 * naming the wrong version.
 */
export function activeTheme(): Theme {
  return document.documentElement.classList.contains(DARK_THEME_CLASS)
    ? 'dark'
    : 'light';
}

/** Puts a version on screen, app-wide and immediately. */
export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle(DARK_THEME_CLASS, theme === 'dark');
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

/**
 * Watches the active version and calls back whenever it changes, from either of the
 * two places it can change:
 *
 * - the header switch applying a version (the announcement above), and
 * - the computer's own light/dark setting changing while the app is open, which is
 *   re-resolved through the one order of precedence — so it takes effect for a user
 *   who never chose for themselves, and is ignored for a user who did (AC-2/AC-4).
 *
 * Returns the function that stops watching.
 */
export function subscribeToTheme(onChange: () => void): () => void {
  const systemSetting = window.matchMedia(PREFERS_DARK_QUERY);
  const followSystemSetting = (): void => {
    applyTheme(resolveTheme());
  };

  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  systemSetting.addEventListener('change', followSystemSetting);

  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, onChange);
    systemSetting.removeEventListener('change', followSystemSetting);
  };
}

/**
 * Remembers a version as this user's own choice, so it beats the computer's setting
 * on every later visit in this browser.
 */
export function rememberTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage unavailable: the switch still works for this visit, it just will not
    // be remembered. Nothing here is worth interrupting the user for.
  }
}

/**
 * The before-paint resolution, as source for the root layout's inline `<head>`
 * script. It is written out as a string because it must be embedded in the document
 * itself: an external `<script src>` is a second request the browser could still be
 * fetching while it paints, which is the flash this exists to prevent.
 *
 * It is deliberately the same decision as `resolveTheme()` above, spelled in
 * dependency-free ES5 so it needs nothing loaded to run, and it swallows its own
 * errors — a browser that refuses storage still gets a themed page rather than a
 * blank one.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=window.localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t!=='light'&&t!=='dark'){t=window.matchMedia(${JSON.stringify(
  PREFERS_DARK_QUERY,
)}).matches?'dark':'light';}document.documentElement.classList.toggle(${JSON.stringify(
  DARK_THEME_CLASS,
)},t==='dark');}catch(e){}})();`;
