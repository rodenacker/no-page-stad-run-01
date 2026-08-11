/**
 * Handing a file the app has already received to the user, under the name the service
 * knows it by.
 *
 * The bytes arrive in the browser (every backend call is a same-origin browser call
 * through `lib/api/client.ts`, so the session cookie travels by itself), which means
 * the app — not the service — is what puts the file in front of the user. There is
 * exactly one way to do that from a page: turn the bytes into an address the browser
 * can save from, and activate a link that says "save this, don't open it".
 *
 * Three things here are deliberate:
 *
 * - **The name is passed in, never derived.** A blob address carries no file name, so
 *   without the `download` attribute the user is handed a random one. The name is the
 *   SERVICE's own (a submitted file's `CurrentFileName`, a generated error file's
 *   `BulkErrorFile`) — an empty name is honestly passed through as empty, leaving the
 *   browser to name the file rather than the app inventing one.
 * - **A link, not a navigation.** Sending the tab to the address would show a raw
 *   response instead of saving a file, and would take the user off the page they were
 *   working on.
 * - **The address is released on the NEXT task.** The browser reads the blob as it
 *   starts the transfer; revoking in the same task can cancel the download in some
 *   browsers, and never revoking holds the whole file in memory until the page goes.
 */

export const deliverFile = (contents: Blob, fileName: string): void => {
  const address = URL.createObjectURL(contents);

  const link = document.createElement('a');
  link.href = address;
  link.download = fileName;
  link.hidden = true;

  // In the document for the one activation only: nothing else on the page has any
  // business finding this link, and it is gone before the next render.
  document.body.append(link);
  link.click();
  link.remove();

  setTimeout(() => {
    URL.revokeObjectURL(address);
  }, 0);
};
