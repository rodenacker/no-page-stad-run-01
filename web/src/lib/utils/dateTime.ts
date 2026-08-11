/**
 * How this app writes a MOMENT on screen, stated once.
 *
 * The shape is the one the transactions service already uses and every list in the app
 * already prints verbatim — `YYYY-MM-DD HH:MM`, a 24-hour clock, largest unit first.
 * That is deliberate rather than a default: a screen that suddenly wrote "30 April 2026
 * at 2:35 pm" would be the only place in the application spelling a moment out, and a
 * user comparing an app-written time (an export confirmation) against a service-written
 * one (a request's transaction date, a file's processed time) would be comparing two
 * different notations of the same thing.
 *
 * Two things here are deliberate:
 *
 * - **Only the app's OWN moments come through here.** A value the service sent is
 *   printed exactly as it arrived and never re-formatted (its format is an unverified
 *   assumption for this project — see `lib/transactions/narrowing.ts`), so normalising
 *   one through this helper would hide a real difference rather than surface it. This is
 *   for a time the app itself observed, such as when an export was produced.
 * - **The reader's own clock.** `Date` methods here are the local ones, so a moment is
 *   written in the timezone of the person reading it rather than in a server's.
 *
 * Seconds are left off: a moment shown to a person is accurate to the minute, and the
 * seconds belong only where two of something have to be told apart (the export file
 * name, `lib/transactions/exportCsv.ts`, which also cannot use a colon).
 */

/** Two digits, so every part of a written moment is the same width every time. */
const twoDigits = (value: number): string => String(value).padStart(2, '0');

/** A moment as the app writes one: `2026-04-30 14:35`, on the reader's own clock. */
export const onScreenDateTime = (at: Date): string => {
  const day = [
    String(at.getFullYear()),
    twoDigits(at.getMonth() + 1),
    twoDigits(at.getDate()),
  ].join('-');
  const timeOfDay = [twoDigits(at.getHours()), twoDigits(at.getMinutes())].join(
    ':',
  );

  return `${day} ${timeOfDay}`;
};
