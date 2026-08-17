/**
 * The text inside bytes the app has just downloaded.
 *
 * The counterpart of `lib/files/deliverFile.ts`: that one hands a `Blob` to the user,
 * this one reads one the service handed to us — the submitted file the import preview
 * parses (`import-preview` FR1).
 *
 * **IT IS A `FileReader`, DELIBERATELY, AND MUST STAY ONE.** `Blob.text()` is the
 * obvious call and it works perfectly in every browser — but jsdom implements neither
 * `Blob.text()` nor `Blob.arrayBuffer()`, so a `.text()` here would pass in the browser
 * and throw in every test that renders a screen reading a downloaded file. `FileReader`
 * exists in both. Do not "modernise" this.
 *
 * The bytes are decoded as UTF-8, which is `readAsText`'s own default and the encoding
 * this project's uploaded CSVs are written in.
 */

/** Said when the browser reported no reason for refusing to read the bytes. */
const COULD_NOT_READ = 'The downloaded file could not be read.';

/** The text of `blob`, or a rejection carrying whatever the browser said went wrong. */
export const readBlobText = (blob: Blob): Promise<string> =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      // `readAsText` always produces a string; the union is `readAsArrayBuffer`'s.
      resolve(typeof reader.result === 'string' ? reader.result : '');
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error(COULD_NOT_READ));
    };

    reader.readAsText(blob);
  });
