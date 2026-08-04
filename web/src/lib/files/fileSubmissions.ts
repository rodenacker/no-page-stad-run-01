/**
 * "A file was just submitted" — announced in one place, heard in another.
 *
 * The submit form and the file list are two independent client components on the
 * same screen, and neither owns the other: the screen renders the form only for a
 * session that may submit (brief BR4), while the list is rendered for everyone. So
 * the form cannot hand the list a callback, and the list cannot reach into the form.
 *
 * What connects them is the fact itself. The upload's answer carries no file
 * identifier at all (`DefaultResponse` — brief §Notes & Caveats), so a submitted
 * file only becomes discoverable by RE-READING the active file list; this module is
 * how the list is told that a re-read is now worth making. It is the same
 * browser-event arrangement `lib/theme/theme.ts` uses for the light/dark choice, and
 * the same reason: state that already exists outside React, watched rather than
 * copied.
 *
 * Both functions are safe to call where there is no browser (a server render), so a
 * caller needs no environment check of its own.
 */

/** The browser event that says a file has just been accepted for import. */
export const FILE_SUBMITTED_EVENT = 'expense-file-submitted';

/** Says a file has just been submitted. Carries no detail — the list re-reads. */
export const announceFileSubmitted = (): void => {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(new Event(FILE_SUBMITTED_EVENT));
};

/**
 * Watches for submissions. Returns the function that stops watching, so a caller
 * can hand it straight back from an effect.
 */
export const subscribeToFileSubmissions = (
  listener: () => void,
): (() => void) => {
  if (typeof window === 'undefined') {
    return () => {};
  }
  window.addEventListener(FILE_SUBMITTED_EVENT, listener);
  return () => window.removeEventListener(FILE_SUBMITTED_EVENT, listener);
};
